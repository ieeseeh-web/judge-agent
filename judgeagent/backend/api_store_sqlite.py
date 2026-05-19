"""SQLite-backed ApiStore — drop-in replacement for file-based ApiStore.

Usage (via environment variable):
    USE_SQLITE_STORE=1 python -m uvicorn judgeagent.backend.api:app ...

The DB file is created at <artifacts_root>/judge_agent.db by default.
Existing file-based registry.json data can be imported with:
    python -m judgeagent.backend.api_store_sqlite migrate
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

DEFAULT_API_ROOT = Path("artifacts/frontend-api")
DB_FILENAME = "judge_agent.db"

TABLES = {
    "reference_runs":    "reference_runs",
    "analyses":          "analyses",
    "sessions":          "judge_sessions",
    "prompt_regressions":"prompt_regressions",
}

DDL = """
CREATE TABLE IF NOT EXISTS reference_runs (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS judge_sessions (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_regressions (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);
"""

_local = threading.local()


def _table_for(kind: str) -> str:
    return TABLES.get(kind, kind)


class SqliteApiStore:
    """SQLite-backed store with the same public interface as ApiStore."""

    def __init__(self, root: Union[Path, str] = DEFAULT_API_ROOT):
        self.root = Path(root)
        self.db_path = self.root / DB_FILENAME
        # Paths kept for trace/report files (still stored on disk)
        self.reference_root = self.root / "reference-runs"
        self.analysis_root  = self.root / "analyses"
        self.session_root   = self.root / "judge-sessions"
        self.prompt_regression_root = self.root / "prompt-regressions"
        self._lock = threading.Lock()

    def ensure(self) -> None:
        for path in [
            self.reference_root / "traces",
            self.reference_root / "reports",
            self.analysis_root  / "reports",
            self.session_root,
            self.prompt_regression_root / "reports",
            self.prompt_regression_root / "results",
        ]:
            path.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(DDL)

    @contextmanager
    def _conn(self):
        # One connection per thread (sqlite3 is not thread-safe across threads)
        conn = getattr(_local, "conn", None)
        if conn is None or conn.execute("SELECT 1").fetchone() is None:
            conn = sqlite3.connect(str(self.db_path), check_same_thread=False, timeout=10)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            _local.conn = conn
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    # ── Public interface (mirrors ApiStore) ──────────────────────────

    def upsert(self, kind: str, item: Dict[str, Any]) -> Dict[str, Any]:
        item = dict(item)
        now = time.time()
        item.setdefault("createdAt", now)
        item["updatedAt"] = now
        table = _table_for(kind)
        with self._lock, self._conn() as conn:
            conn.execute(
                f"INSERT INTO {table}(id, data, created_at, updated_at) "
                "VALUES(?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                (item["id"], json.dumps(item, ensure_ascii=False), item["createdAt"], item["updatedAt"]),
            )
        return item

    def get(self, kind: str, item_id: str) -> Dict[str, Any]:
        table = _table_for(kind)
        with self._conn() as conn:
            row = conn.execute(f"SELECT data FROM {table} WHERE id=?", (item_id,)).fetchone()
        if row is None:
            raise KeyError(item_id)
        return json.loads(row["data"])

    def list(self, kind: str) -> List[Dict[str, Any]]:
        table = _table_for(kind)
        with self._conn() as conn:
            rows = conn.execute(f"SELECT data FROM {table} ORDER BY created_at DESC").fetchall()
        return [json.loads(r["data"]) for r in rows]

    # ── Path helpers (unchanged from ApiStore) ───────────────────────

    def reference_trace_path(self, run_id: str) -> Path:
        from judgeagent.judge_agent.core.session import safe_session_id
        return self.reference_root / "traces" / f"{safe_session_id(run_id)}.jsonl"

    def reference_report_path(self, run_id: str) -> Path:
        from judgeagent.judge_agent.core.session import safe_session_id
        return self.reference_root / "reports" / f"{safe_session_id(run_id)}.md"

    def analysis_json_path(self, analysis_id: str) -> Path:
        from judgeagent.judge_agent.core.session import safe_session_id
        return self.analysis_root / f"{safe_session_id(analysis_id)}.json"

    def analysis_report_path(self, analysis_id: str) -> Path:
        from judgeagent.judge_agent.core.session import safe_session_id
        return self.analysis_root / "reports" / f"{safe_session_id(analysis_id)}.md"

    def session_dir(self) -> Path:
        self.ensure()
        return self.session_root

    def prompt_regression_json_path(self, regression_id: str) -> Path:
        from judgeagent.judge_agent.core.session import safe_session_id
        return self.prompt_regression_root / "results" / f"{safe_session_id(regression_id)}.json"

    def prompt_regression_report_path(self, regression_id: str) -> Path:
        from judgeagent.judge_agent.core.session import safe_session_id
        return self.prompt_regression_root / "reports" / f"{safe_session_id(regression_id)}.md"


def get_store(root: Union[Path, str] = DEFAULT_API_ROOT):
    """환경변수 USE_SQLITE_STORE=1 이면 SqliteApiStore, 아니면 기존 ApiStore 반환."""
    import os
    if os.environ.get("USE_SQLITE_STORE", "").lower() in {"1", "true", "yes"}:
        store = SqliteApiStore(root)
        store.ensure()
        return store
    from .api_store import ApiStore
    return ApiStore(root)


def migrate_from_json(root: Union[Path, str] = DEFAULT_API_ROOT) -> None:
    """기존 파일 기반 registry.json 데이터를 SQLite DB로 임포트합니다."""
    from .api_store import ApiStore
    root = Path(root)
    src = ApiStore(root)
    dst = SqliteApiStore(root)
    dst.ensure()

    kinds = ["reference_runs", "analyses", "sessions", "prompt_regressions"]
    total = 0
    for kind in kinds:
        try:
            items = src.list(kind)
        except Exception:
            items = []
        for item in items:
            dst.upsert(kind, item)
            total += 1
        if items:
            print(f"  {kind}: {len(items)}개 임포트 완료")
    print(f"마이그레이션 완료: 총 {total}개 레코드 → {dst.db_path}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "migrate":
        migrate_from_json()
    else:
        print("Usage: python -m judgeagent.backend.api_store_sqlite migrate")
