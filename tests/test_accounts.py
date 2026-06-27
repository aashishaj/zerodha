import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from zerodha_app.accounts import AccountStore
from zerodha_app.api_server import APIOptions, ZerodhaFrontendAPI
from zerodha_app.appauth import UserStore
from zerodha_app.auth import AuthManager
from zerodha_app.config import Settings


class AccountStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = AccountStore(Path(self._tmp.name) / "app.db")

    def tearDown(self):
        self._tmp.cleanup()

    def test_upsert_is_idempotent_and_preserves_label(self):
        first = self.store.upsert_account("MKQ150", label="Client A")
        second = self.store.upsert_account("MKQ150", label="Ignored")
        self.assertEqual(first, second)
        account = self.store.get_account_by_user_id("MKQ150")
        self.assertEqual(account["label"], "Client A")

    def test_list_accounts(self):
        self.store.upsert_account("MKQ150", label="A")
        self.store.upsert_account("RK1234", label="B")
        self.assertEqual([a["zerodha_user_id"] for a in self.store.list_accounts()], ["MKQ150", "RK1234"])

    def test_assignment_visibility(self):
        a1 = self.store.upsert_account("MKQ150", label="A")
        a2 = self.store.upsert_account("RK1234", label="B")
        self.store.assign(user_id=7, account_id=a1)
        visible = self.store.list_accounts_for_user(7)
        self.assertEqual([a["id"] for a in visible], [a1])
        self.assertTrue(self.store.is_assigned(7, a1))
        self.assertFalse(self.store.is_assigned(7, a2))

    def test_unassign_and_assigned_user_ids(self):
        a1 = self.store.upsert_account("MKQ150", label="A")
        self.store.assign(3, a1)
        self.store.assign(5, a1)
        self.assertEqual(self.store.assigned_user_ids(a1), [3, 5])
        self.store.unassign(3, a1)
        self.assertEqual(self.store.assigned_user_ids(a1), [5])

    def test_set_label_and_delete(self):
        a1 = self.store.upsert_account("MKQ150", label="A")
        self.assertTrue(self.store.set_label(a1, "Renamed"))
        self.assertEqual(self.store.get_account(a1)["label"], "Renamed")
        self.store.delete_account(a1)
        self.assertIsNone(self.store.get_account(a1))


class PerAccountTokenTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self._tmp.name) / "tokens.json"
        self.settings = Settings(
            api_key="k",
            api_secret="s",
            token_cache_path=self.cache,
            watchlist_path=Path(self._tmp.name) / "watchlist.json",
            app_db_path=Path(self._tmp.name) / "app.db",
        )
        self.auth = AuthManager(self.settings)

    def tearDown(self):
        self._tmp.cleanup()

    def test_write_and_read_per_account(self):
        self.auth._write_token_store("tokA", user_id="MKQ150")
        self.auth._write_token_store("tokB", user_id="RK1234")
        self.assertEqual(self.auth.get_cached_access_token("MKQ150"), "tokA")
        self.assertEqual(self.auth.get_cached_access_token("RK1234"), "tokB")
        self.assertEqual(self.auth.connected_account_user_ids(), {"MKQ150", "RK1234"})
        # Global lookup returns the most recently written token.
        self.assertEqual(self.auth.get_cached_access_token(), "tokB")

    def test_unknown_account_is_none(self):
        self.auth._write_token_store("tokA", user_id="MKQ150")
        self.assertIsNone(self.auth.get_cached_access_token("NOPE"))

    def test_legacy_flat_cache_is_readable(self):
        today = date.today().isoformat()
        self.cache.write_text(json.dumps({today: "legacy-token"}))
        self.assertEqual(self.auth.get_cached_access_token(), "legacy-token")
        self.assertIsNone(self.auth.get_cached_access_token("MKQ150"))
        self.assertEqual(self.auth.connected_account_user_ids(), set())


class AccountAssignmentsViewTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        settings = Settings(
            api_key="k",
            api_secret="s",
            token_cache_path=Path(self._tmp.name) / "tokens.json",
            watchlist_path=Path(self._tmp.name) / "watchlist.json",
            app_db_path=Path(self._tmp.name) / "app.db",
        )
        self.api = ZerodhaFrontendAPI(APIOptions(settings=settings))

    def tearDown(self):
        self._tmp.cleanup()

    def test_account_assignments_returns_public_users(self):
        buyer = self.api.user_store().create_user("buyer1", "pw", "buyer")
        self.api.user_store().create_user("seller1", "pw", "seller")
        account_id = self.api.account_store().upsert_account("MKQ150", label="A")
        self.api.assign_account(account_id, buyer)

        assigned = self.api.account_assignments(account_id)
        self.assertEqual([u["username"] for u in assigned], ["buyer1"])
        self.assertNotIn("password_hash", assigned[0])

    def test_assign_unknown_user_or_account_raises(self):
        account_id = self.api.account_store().upsert_account("MKQ150", label="A")
        with self.assertRaises(ValueError):
            self.api.assign_account(account_id, 999)
        with self.assertRaises(ValueError):
            self.api.assign_account(999, 1)

    def test_edit_user_role_password_active_delete(self):
        uid = self.api.user_store().create_user("b1", "pw", "buyer")
        self.api.update_user_role(uid, "seller")
        self.assertEqual(self.api.user_store().get_user_by_id(uid)["role"], "seller")

        self.api.reset_user_password(uid, "newpw")
        self.assertIsNotNone(self.api.user_store().authenticate("b1", "newpw"))

        self.api.set_user_active(uid, False)
        self.assertIsNone(self.api.user_store().authenticate("b1", "newpw"))

        self.api.delete_user(uid)
        self.assertIsNone(self.api.user_store().get_user_by_id(uid))

    def test_cannot_edit_super_admin(self):
        admin = self.api.user_store().create_user("root", "pw", "super_admin")
        with self.assertRaises(PermissionError):
            self.api.update_user_role(admin, "buyer")
        with self.assertRaises(PermissionError):
            self.api.delete_user(admin)

    def test_user_accounts_lists_assignments(self):
        uid = self.api.user_store().create_user("b1", "pw", "buyer")
        acc = self.api.account_store().upsert_account("MKQ150", label="A")
        self.api.assign_account(acc, uid)
        self.assertEqual([a["zerodha_user_id"] for a in self.api.user_accounts(uid)], ["MKQ150"])

    def test_delete_user_clears_assignments(self):
        uid = self.api.user_store().create_user("b1", "pw", "buyer")
        acc = self.api.account_store().upsert_account("MKQ150", label="A")
        self.api.assign_account(acc, uid)
        self.api.delete_user(uid)
        self.assertEqual(self.api.account_store().assigned_user_ids(acc), [])


class SessionAccountTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = UserStore(Path(self._tmp.name) / "app.db")

    def tearDown(self):
        self._tmp.cleanup()

    def test_active_account_round_trip(self):
        user_id = self.store.create_user("admin", "pw", "super_admin")
        token = self.store.create_session(user_id)
        self.assertIsNone(self.store.get_active_account_id(token))
        self.store.set_active_account(token, 42)
        self.assertEqual(self.store.get_active_account_id(token), 42)


if __name__ == "__main__":
    unittest.main()
