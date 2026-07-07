from __future__ import annotations

import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AccountStore:
    """SQLite-backed store for Zerodha accounts and their user assignments.

    An account corresponds to one Zerodha login (identified by its broker
    ``zerodha_user_id``, e.g. ``MKQ150``). Buyers/sellers are granted access to
    specific accounts via the ``user_accounts`` table. Shares the same database
    file as :class:`zerodha_app.appauth.UserStore`.
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
                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    zerodha_user_id TEXT NOT NULL UNIQUE,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_accounts (
                    user_id INTEGER NOT NULL,
                    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    PRIMARY KEY (user_id, account_id)
                )
                """
            )
            # Migration: per-account Kite Connect app credentials.
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(accounts)")}
            if "api_key" not in columns:
                connection.execute("ALTER TABLE accounts ADD COLUMN api_key TEXT")
            if "api_secret" not in columns:
                connection.execute("ALTER TABLE accounts ADD COLUMN api_secret TEXT")

    @staticmethod
    def _row_to_account(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "label": row["label"],
            "zerodha_user_id": row["zerodha_user_id"],
            "active": bool(row["active"]),
            "created_at": row["created_at"],
            "api_key": row["api_key"],
            "api_secret": row["api_secret"],
        }

    # ── Accounts ─────────────────────────────────────────────────────────────
    def upsert_account(
        self,
        zerodha_user_id: str,
        label: str | None = None,
        api_key: str | None = None,
        api_secret: str | None = None,
    ) -> int:
        """Create the account for a Zerodha user id, or return the existing id.

        A label is only set on creation; existing labels are preserved so a
        re-connect never overwrites an admin-chosen name. Credentials, when
        provided, are stored on creation and refreshed on existing accounts so
        a connect via a new Kite app updates the stored key pair.
        """
        user_id = zerodha_user_id.strip()
        if not user_id:
            raise ValueError("zerodha_user_id must not be empty.")
        existing = self.get_account_by_user_id(user_id)
        if existing is not None:
            if api_key and api_secret:
                self.set_credentials(existing["id"], api_key, api_secret)
            return existing["id"]
        with self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO accounts (label, zerodha_user_id, active, created_at, api_key, api_secret) "
                "VALUES (?, ?, 1, ?, ?, ?)",
                (label or user_id, user_id, _utcnow_iso(), api_key, api_secret),
            )
            return int(cursor.lastrowid or 0)

    def set_credentials(self, account_id: int, api_key: str, api_secret: str) -> bool:
        """Store or replace the Kite Connect app credentials for an account."""
        clean_key = api_key.strip()
        clean_secret = api_secret.strip()
        if not clean_key or not clean_secret:
            raise ValueError("Both api_key and api_secret must be provided.")
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE accounts SET api_key = ?, api_secret = ? WHERE id = ?",
                (clean_key, clean_secret, account_id),
            )
        return cursor.rowcount > 0

    def get_account_by_api_key(self, api_key: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM accounts WHERE api_key = ?", (api_key.strip(),)
            ).fetchone()
        return self._row_to_account(row) if row is not None else None

    def get_account(self, account_id: int) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM accounts WHERE id = ?", (account_id,)
            ).fetchone()
        return self._row_to_account(row) if row is not None else None

    def get_account_by_user_id(self, zerodha_user_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM accounts WHERE zerodha_user_id = ?", (zerodha_user_id.strip(),)
            ).fetchone()
        return self._row_to_account(row) if row is not None else None

    def list_accounts(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM accounts ORDER BY id").fetchall()
        return [self._row_to_account(row) for row in rows]

    def list_accounts_for_user(self, user_id: int) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT a.* FROM accounts a "
                "JOIN user_accounts ua ON ua.account_id = a.id "
                "WHERE ua.user_id = ? ORDER BY a.id",
                (user_id,),
            ).fetchall()
        return [self._row_to_account(row) for row in rows]

    def set_label(self, account_id: int, label: str) -> bool:
        clean = label.strip()
        if not clean:
            raise ValueError("Label must not be empty.")
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE accounts SET label = ? WHERE id = ?", (clean, account_id)
            )
        return cursor.rowcount > 0

    def delete_account(self, account_id: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM accounts WHERE id = ?", (account_id,))

    # ── Assignments ──────────────────────────────────────────────────────────
    def assign(self, user_id: int, account_id: int) -> None:
        with self._connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO user_accounts (user_id, account_id) VALUES (?, ?)",
                (user_id, account_id),
            )

    def unassign(self, user_id: int, account_id: int) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM user_accounts WHERE user_id = ? AND account_id = ?",
                (user_id, account_id),
            )

    def remove_user(self, user_id: int) -> None:
        """Drop all of a user's account assignments (used when deleting a user)."""
        with self._connect() as connection:
            connection.execute("DELETE FROM user_accounts WHERE user_id = ?", (user_id,))

    def is_assigned(self, user_id: int, account_id: int) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM user_accounts WHERE user_id = ? AND account_id = ?",
                (user_id, account_id),
            ).fetchone()
        return row is not None

    def assigned_user_ids(self, account_id: int) -> list[int]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT user_id FROM user_accounts WHERE account_id = ? ORDER BY user_id",
                (account_id,),
            ).fetchall()
        return [int(row["user_id"]) for row in rows]
