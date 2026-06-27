from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)

VALID_ROLES: tuple[str, ...] = ("super_admin", "seller", "buyer")
_PBKDF2_ITERATIONS = 600_000
_SESSION_TTL_SECONDS = 12 * 60 * 60


def hash_password(password: str, *, iterations: int = _PBKDF2_ITERATIONS) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 and a random per-user salt."""
    if not password:
        raise ValueError("Password must not be empty.")
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Return True if ``password`` matches the stored PBKDF2 hash (constant time)."""
    try:
        algorithm, iterations_text, salt_hex, hash_hex = stored.split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    try:
        iterations = int(iterations_text)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except ValueError:
        return False
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(derived, expected)


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    """Strip secret fields, returning only what is safe to send to the client."""
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserStore:
    """SQLite-backed store for app users and login sessions.

    A fresh connection is opened per operation so the store is safe to share
    across the API server's worker threads.
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _init_schema(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
                """
            )
            # Migration: per-session selected account (added in Phase 2).
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(sessions)")}
            if "active_account_id" not in columns:
                connection.execute("ALTER TABLE sessions ADD COLUMN active_account_id INTEGER")

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "username": row["username"],
            "password_hash": row["password_hash"],
            "role": row["role"],
            "active": bool(row["active"]),
            "created_at": row["created_at"],
        }

    # ── Users ────────────────────────────────────────────────────────────────
    def create_user(self, username: str, password: str, role: str) -> int:
        """Create a user and return its id. Raises ValueError on duplicate name."""
        normalized = username.strip()
        if not normalized:
            raise ValueError("Username must not be empty.")
        if role not in VALID_ROLES:
            raise ValueError(f"Role must be one of {VALID_ROLES}, got {role!r}.")
        password_hash = hash_password(password)
        with self._connect() as connection:
            try:
                cursor = connection.execute(
                    "INSERT INTO users (username, password_hash, role, active, created_at) "
                    "VALUES (?, ?, ?, 1, ?)",
                    (normalized, password_hash, role, _utcnow().isoformat()),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError(f"Username {normalized!r} already exists.") from exc
            return int(cursor.lastrowid or 0)

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE username = ?", (username.strip(),)
            ).fetchone()
        return self._row_to_user(row) if row is not None else None

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
        return self._row_to_user(row) if row is not None else None

    def list_users(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM users ORDER BY id"
            ).fetchall()
        return [self._row_to_user(row) for row in rows]

    def count_users(self) -> int:
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS n FROM users").fetchone()
        return int(row["n"])

    def set_password(self, username: str, password: str) -> bool:
        """Update a user's password. Returns True if a row was updated."""
        password_hash = hash_password(password)
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE users SET password_hash = ? WHERE username = ?",
                (password_hash, username.strip()),
            )
        return cursor.rowcount > 0

    def set_password_by_id(self, user_id: int, password: str) -> bool:
        password_hash = hash_password(password)
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id)
            )
        return cursor.rowcount > 0

    def set_role(self, user_id: int, role: str) -> bool:
        if role not in VALID_ROLES:
            raise ValueError(f"Role must be one of {VALID_ROLES}, got {role!r}.")
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE users SET role = ? WHERE id = ?", (role, user_id)
            )
        return cursor.rowcount > 0

    def set_active(self, user_id: int, active: bool) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE users SET active = ? WHERE id = ?", (1 if active else 0, user_id)
            )
        return cursor.rowcount > 0

    def delete_user(self, user_id: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM users WHERE id = ?", (user_id,))

    def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        """Return the user dict on valid credentials for an active user, else None."""
        user = self.get_user_by_username(username)
        if user is None or not user["active"]:
            return None
        if not verify_password(password, user["password_hash"]):
            return None
        return user

    # ── Sessions ─────────────────────────────────────────────────────────────
    def create_session(self, user_id: int, ttl_seconds: int = _SESSION_TTL_SECONDS) -> str:
        token = secrets.token_urlsafe(32)
        now = _utcnow()
        expires = now + timedelta(seconds=ttl_seconds)
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (token, user_id, now.isoformat(), expires.isoformat()),
            )
        return token

    def get_session_user(self, token: str | None) -> dict[str, Any] | None:
        """Return the active user for a non-expired session token, else None."""
        if not token:
            return None
        with self._connect() as connection:
            row = connection.execute(
                "SELECT u.*, s.expires_at AS session_expires_at "
                "FROM sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.token = ?",
                (token,),
            ).fetchone()
        if row is None:
            return None
        if datetime.fromisoformat(row["session_expires_at"]) <= _utcnow():
            self.delete_session(token)
            return None
        user = self._row_to_user(row)
        return user if user["active"] else None

    def delete_session(self, token: str | None) -> None:
        if not token:
            return
        with self._connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def set_active_account(self, token: str, account_id: int | None) -> None:
        """Record which account a session has selected for trading/viewing."""
        with self._connect() as connection:
            connection.execute(
                "UPDATE sessions SET active_account_id = ? WHERE token = ?",
                (account_id, token),
            )

    def get_active_account_id(self, token: str | None) -> int | None:
        if not token:
            return None
        with self._connect() as connection:
            row = connection.execute(
                "SELECT active_account_id FROM sessions WHERE token = ?", (token,)
            ).fetchone()
        if row is None or row["active_account_id"] is None:
            return None
        return int(row["active_account_id"])
