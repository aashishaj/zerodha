"""At-rest encryption for stored account secrets.

The Kite Connect ``api_secret`` is sensitive and lives in the shared SQLite
database. When ``ZERODHA_DB_KEY`` is set, secrets are encrypted with Fernet
(AES-128-CBC + HMAC) before they are written and decrypted on read. When the
variable is unset the values are stored as-is, so local development and any
existing plaintext rows keep working unchanged.

Encrypted values carry an ``enc:`` prefix so a mixed table of legacy plaintext
and freshly encrypted rows can be told apart without a migration.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import stat
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

LOGGER = logging.getLogger(__name__)


def harden_db_permissions(db_path: Path) -> None:
    """Restrict the database file and its directory to the owner only.

    The database holds account secrets, so on a shared or public host it should
    not be group- or world-readable. Best-effort: permission changes that the OS
    rejects (e.g. Windows, or a file owned by another user) are logged and
    ignored rather than blocking startup.
    """
    for target, mode in ((db_path.parent, 0o700), (db_path, 0o600)):
        try:
            if target.exists():
                os.chmod(target, stat.S_IMODE(mode))
        except OSError as exc:  # pragma: no cover - platform dependent
            LOGGER.debug("Could not tighten permissions on %s: %s", target, exc)

_ENC_PREFIX = "enc:"
# Fixed application salt: the passphrase in ZERODHA_DB_KEY is the secret, so a
# constant salt is enough to derive a stable Fernet key from it.
_KDF_SALT = b"zerodha-app.db.secretbox.v1"
_KDF_ITERATIONS = 200_000


def _fernet_from_env() -> Fernet | None:
    """Build a Fernet from ``ZERODHA_DB_KEY``, or None when it is unset."""
    passphrase = os.getenv("ZERODHA_DB_KEY", "").strip()
    if not passphrase:
        return None
    derived = hashlib.pbkdf2_hmac(
        "sha256", passphrase.encode("utf-8"), _KDF_SALT, _KDF_ITERATIONS
    )
    return Fernet(base64.urlsafe_b64encode(derived))


def encryption_enabled() -> bool:
    """Whether a database key is configured for at-rest encryption."""
    return _fernet_from_env() is not None


def encrypt_secret(value: str) -> str:
    """Encrypt ``value`` when a key is configured, else return it unchanged.

    Already-encrypted values (``enc:`` prefixed) are returned as-is so callers
    can re-store a value they read without double-encrypting it.
    """
    if not value or value.startswith(_ENC_PREFIX):
        return value
    fernet = _fernet_from_env()
    if fernet is None:
        return value
    token = fernet.encrypt(value.encode("utf-8")).decode("ascii")
    return f"{_ENC_PREFIX}{token}"


def decrypt_secret(value: str | None) -> str | None:
    """Decrypt an ``enc:`` value; pass plaintext and None through untouched.

    Raises RuntimeError if an encrypted value is found but no key is configured,
    or if the configured key cannot decrypt it — both mean the operator changed
    or lost ``ZERODHA_DB_KEY`` and the stored secret is unrecoverable as-is.
    """
    if value is None or not value.startswith(_ENC_PREFIX):
        return value
    fernet = _fernet_from_env()
    if fernet is None:
        raise RuntimeError(
            "Found an encrypted secret but ZERODHA_DB_KEY is not set; "
            "set it to the key the value was encrypted with."
        )
    token = value[len(_ENC_PREFIX):].encode("ascii")
    try:
        return fernet.decrypt(token).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError(
            "Could not decrypt a stored secret with the current ZERODHA_DB_KEY."
        ) from exc
