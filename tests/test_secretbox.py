import os
import tempfile
import unittest
from pathlib import Path

from zerodha_app import secretbox


class SecretboxEnvTestCase(unittest.TestCase):
    """Base class that restores ZERODHA_DB_KEY around each test."""

    def setUp(self):
        self._saved = os.environ.get("ZERODHA_DB_KEY")
        os.environ.pop("ZERODHA_DB_KEY", None)

    def tearDown(self):
        if self._saved is None:
            os.environ.pop("ZERODHA_DB_KEY", None)
        else:
            os.environ["ZERODHA_DB_KEY"] = self._saved


class EncryptionDisabledTests(SecretboxEnvTestCase):
    def test_passthrough_when_key_unset(self):
        self.assertFalse(secretbox.encryption_enabled())
        self.assertEqual(secretbox.encrypt_secret("s3cr3t"), "s3cr3t")
        self.assertEqual(secretbox.decrypt_secret("s3cr3t"), "s3cr3t")

    def test_none_and_empty_passthrough(self):
        self.assertIsNone(secretbox.decrypt_secret(None))
        self.assertEqual(secretbox.encrypt_secret(""), "")

    def test_decrypt_encrypted_without_key_raises(self):
        os.environ["ZERODHA_DB_KEY"] = "phrase"
        token = secretbox.encrypt_secret("s3cr3t")
        os.environ.pop("ZERODHA_DB_KEY", None)
        with self.assertRaises(RuntimeError):
            secretbox.decrypt_secret(token)


class EncryptionEnabledTests(SecretboxEnvTestCase):
    def setUp(self):
        super().setUp()
        os.environ["ZERODHA_DB_KEY"] = "a-long-random-passphrase"

    def test_round_trip(self):
        self.assertTrue(secretbox.encryption_enabled())
        token = secretbox.encrypt_secret("s3cr3t")
        self.assertTrue(token.startswith("enc:"))
        self.assertNotIn("s3cr3t", token)
        self.assertEqual(secretbox.decrypt_secret(token), "s3cr3t")

    def test_encrypt_is_idempotent_on_encrypted_value(self):
        token = secretbox.encrypt_secret("s3cr3t")
        self.assertEqual(secretbox.encrypt_secret(token), token)

    def test_plaintext_passthrough_on_decrypt(self):
        # A legacy plaintext row (no enc: prefix) is returned unchanged.
        self.assertEqual(secretbox.decrypt_secret("legacy"), "legacy")

    def test_wrong_key_raises(self):
        token = secretbox.encrypt_secret("s3cr3t")
        os.environ["ZERODHA_DB_KEY"] = "a-different-passphrase"
        with self.assertRaises(RuntimeError):
            secretbox.decrypt_secret(token)


class HardenPermissionsTests(unittest.TestCase):
    def test_sets_owner_only_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "sub" / "app.db"
            db_path.parent.mkdir(parents=True)
            db_path.write_text("data")
            db_path.parent.chmod(0o755)
            db_path.chmod(0o644)
            secretbox.harden_db_permissions(db_path)
            self.assertEqual(db_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(db_path.parent.stat().st_mode & 0o777, 0o700)

    def test_missing_file_is_noop(self):
        with tempfile.TemporaryDirectory() as tmp:
            # Should not raise when the file does not exist yet.
            secretbox.harden_db_permissions(Path(tmp) / "nope.db")


if __name__ == "__main__":
    unittest.main()
