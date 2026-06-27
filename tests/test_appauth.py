import tempfile
import unittest
from pathlib import Path

from zerodha_app.appauth import (
    UserStore,
    hash_password,
    public_user,
    verify_password,
)


class PasswordHashTests(unittest.TestCase):
    def test_hash_and_verify_roundtrip(self):
        stored = hash_password("s3cret!")
        self.assertTrue(stored.startswith("pbkdf2_sha256$"))
        self.assertTrue(verify_password("s3cret!", stored))

    def test_verify_rejects_wrong_password(self):
        stored = hash_password("s3cret!")
        self.assertFalse(verify_password("wrong", stored))

    def test_hash_is_salted_per_call(self):
        self.assertNotEqual(hash_password("same"), hash_password("same"))

    def test_empty_password_rejected(self):
        with self.assertRaises(ValueError):
            hash_password("")

    def test_verify_rejects_malformed_hash(self):
        self.assertFalse(verify_password("x", "not-a-valid-hash"))


class UserStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = UserStore(Path(self._tmp.name) / "app.db")

    def tearDown(self):
        self._tmp.cleanup()

    def test_create_and_fetch_user(self):
        user_id = self.store.create_user("admin", "pw", "super_admin")
        user = self.store.get_user_by_username("admin")
        self.assertIsNotNone(user)
        self.assertEqual(user["id"], user_id)
        self.assertEqual(user["role"], "super_admin")
        self.assertTrue(user["active"])

    def test_duplicate_username_rejected(self):
        self.store.create_user("admin", "pw", "super_admin")
        with self.assertRaises(ValueError):
            self.store.create_user("admin", "pw2", "buyer")

    def test_invalid_role_rejected(self):
        with self.assertRaises(ValueError):
            self.store.create_user("u", "pw", "wizard")

    def test_count_and_list_users(self):
        self.assertEqual(self.store.count_users(), 0)
        self.store.create_user("a", "pw", "buyer")
        self.store.create_user("b", "pw", "seller")
        self.assertEqual(self.store.count_users(), 2)
        self.assertEqual([u["username"] for u in self.store.list_users()], ["a", "b"])

    def test_set_password_updates_credentials(self):
        self.store.create_user("admin", "old", "super_admin")
        self.assertTrue(self.store.set_password("admin", "new"))
        self.assertIsNone(self.store.authenticate("admin", "old"))
        self.assertIsNotNone(self.store.authenticate("admin", "new"))

    def test_set_password_unknown_user(self):
        self.assertFalse(self.store.set_password("ghost", "pw"))

    def test_authenticate_success_and_failure(self):
        self.store.create_user("admin", "pw", "super_admin")
        self.assertIsNotNone(self.store.authenticate("admin", "pw"))
        self.assertIsNone(self.store.authenticate("admin", "bad"))
        self.assertIsNone(self.store.authenticate("nobody", "pw"))

    def test_public_user_hides_password_hash(self):
        self.store.create_user("admin", "pw", "super_admin")
        user = self.store.get_user_by_username("admin")
        self.assertNotIn("password_hash", public_user(user))
        self.assertEqual(set(public_user(user)), {"id", "username", "role"})

    def test_session_lifecycle(self):
        user_id = self.store.create_user("admin", "pw", "super_admin")
        token = self.store.create_session(user_id)
        resolved = self.store.get_session_user(token)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["id"], user_id)

        self.store.delete_session(token)
        self.assertIsNone(self.store.get_session_user(token))

    def test_expired_session_returns_none(self):
        user_id = self.store.create_user("admin", "pw", "super_admin")
        token = self.store.create_session(user_id, ttl_seconds=-1)
        self.assertIsNone(self.store.get_session_user(token))

    def test_unknown_and_empty_token(self):
        self.assertIsNone(self.store.get_session_user(None))
        self.assertIsNone(self.store.get_session_user(""))
        self.assertIsNone(self.store.get_session_user("does-not-exist"))


if __name__ == "__main__":
    unittest.main()
