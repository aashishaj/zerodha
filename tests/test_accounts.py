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

    def test_set_credentials_roundtrip(self):
        a1 = self.store.upsert_account("MKQ150", label="A")
        account = self.store.get_account(a1)
        self.assertIsNone(account["api_key"])
        self.assertTrue(self.store.set_credentials(a1, "key1", "secret1"))
        account = self.store.get_account(a1)
        self.assertEqual(account["api_key"], "key1")
        self.assertEqual(account["api_secret"], "secret1")

    def test_set_credentials_validates_input(self):
        a1 = self.store.upsert_account("MKQ150", label="A")
        with self.assertRaises(ValueError):
            self.store.set_credentials(a1, "", "secret")
        with self.assertRaises(ValueError):
            self.store.set_credentials(a1, "key", "  ")
        self.assertFalse(self.store.set_credentials(999, "key", "secret"))

    def test_upsert_with_credentials_creates_and_refreshes(self):
        a1 = self.store.upsert_account("MKQ150", label="A", api_key="k1", api_secret="s1")
        self.assertEqual(self.store.get_account(a1)["api_key"], "k1")
        # Re-connecting with a new key pair refreshes the stored credentials.
        again = self.store.upsert_account("MKQ150", api_key="k2", api_secret="s2")
        self.assertEqual(again, a1)
        account = self.store.get_account(a1)
        self.assertEqual(account["api_key"], "k2")
        self.assertEqual(account["api_secret"], "s2")
        # Upsert without credentials leaves the stored pair untouched.
        self.store.upsert_account("MKQ150")
        self.assertEqual(self.store.get_account(a1)["api_key"], "k2")

    def test_get_account_by_api_key(self):
        a1 = self.store.upsert_account("MKQ150", label="A", api_key="k1", api_secret="s1")
        found = self.store.get_account_by_api_key("k1")
        self.assertIsNotNone(found)
        self.assertEqual(found["id"], a1)
        self.assertIsNone(self.store.get_account_by_api_key("nope"))


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

    def test_remove_account_deletes_and_clears_assignments(self):
        uid = self.api.user_store().create_user("b1", "pw", "buyer")
        acc = self.api.account_store().upsert_account("MKQ150", label="A")
        self.api.assign_account(acc, uid)
        self.api.remove_account(acc)
        self.assertIsNone(self.api.account_store().get_account(acc))
        self.assertEqual(self.api.user_accounts(uid), [])

    def test_remove_unknown_account_raises(self):
        with self.assertRaises(ValueError):
            self.api.remove_account(999)

    def test_trader_role_is_allowed(self):
        uid = self.api.user_store().create_user("t1", "pw", "trader")
        self.assertEqual(self.api.user_store().get_user_by_id(uid)["role"], "trader")
        self.api.update_user_role(uid, "trader")
        self.assertEqual(self.api.user_store().get_user_by_id(uid)["role"], "trader")

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


class CredentialFlowTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        settings = Settings(
            api_key="global-key",
            api_secret="global-secret",
            token_cache_path=Path(self._tmp.name) / "tokens.json",
            watchlist_path=Path(self._tmp.name) / "watchlist.json",
            app_db_path=Path(self._tmp.name) / "app.db",
        )
        self.api = ZerodhaFrontendAPI(APIOptions(settings=settings))

    def tearDown(self):
        self._tmp.cleanup()

    def test_start_account_connect_parks_credentials_in_login_url(self):
        url = self.api.start_account_connect("Dad", "acct-key", "acct-secret")
        self.assertIn("api_key=acct-key", url)
        self.assertIn("redirect_params=connect_nonce%3D", url)
        self.assertEqual(len(self.api._pending_connects), 1)
        pending = next(iter(self.api._pending_connects.values()))
        self.assertEqual(pending["api_key"], "acct-key")
        self.assertEqual(pending["label"], "Dad")

    def test_start_account_connect_requires_both_keys(self):
        with self.assertRaises(ValueError):
            self.api.start_account_connect("X", "", "secret")
        with self.assertRaises(ValueError):
            self.api.start_account_connect("X", "key", "")

    def test_callback_with_expired_nonce_raises(self):
        with self.assertRaises(ValueError):
            self.api.handle_oauth_callback("rt", connect_nonce="unknown")

    def test_account_login_url_uses_stored_key_or_falls_back(self):
        with_creds = self.api.account_store().upsert_account(
            "MKQ150", label="A", api_key="own-key", api_secret="own-secret"
        )
        legacy = self.api.account_store().upsert_account("RK1234", label="B")
        self.assertIn("api_key=own-key", self.api.account_login_url(with_creds))
        self.assertIn(f"account_id%3D{with_creds}", self.api.account_login_url(with_creds))
        self.assertIn("api_key=global-key", self.api.account_login_url(legacy))
        with self.assertRaises(ValueError):
            self.api.account_login_url(999)

    def test_update_account_credentials(self):
        acc = self.api.account_store().upsert_account("MKQ150", label="A")
        self.api.update_account_credentials(acc, "new-key", "new-secret")
        account = self.api.account_store().get_account(acc)
        self.assertEqual(account["api_key"], "new-key")
        with self.assertRaises(ValueError):
            self.api.update_account_credentials(999, "k", "s")

    def test_accounts_for_user_exposes_key_to_admin_only(self):
        self.api.account_store().upsert_account("MKQ150", label="A", api_key="k1", api_secret="s1")
        buyer_id = self.api.user_store().create_user("b1", "pw", "buyer")
        self.api.account_store().assign(buyer_id, 1)

        admin_view = self.api.accounts_for_user({"id": 0, "role": "super_admin"})
        self.assertTrue(admin_view[0]["has_credentials"])
        self.assertEqual(admin_view[0]["api_key"], "k1")
        self.assertNotIn("api_secret", admin_view[0])

        buyer_view = self.api.accounts_for_user({"id": buyer_id, "role": "buyer"})
        self.assertTrue(buyer_view[0]["has_credentials"])
        self.assertNotIn("api_key", buyer_view[0])
        self.assertNotIn("api_secret", buyer_view[0])


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
