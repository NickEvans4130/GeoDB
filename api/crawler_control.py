import asyncio
import logging
import subprocess
from datetime import datetime, timezone

import aiosqlite

from .db import DB_PATH

logger = logging.getLogger(__name__)

LOG_PATH = "/home/nick/geoguessr-graph/crawler.log"


async def get_config(db: aiosqlite.Connection) -> dict:
    async with db.execute("SELECT key, value FROM crawl_config") as cur:
        rows = await cur.fetchall()
    return {r["key"]: r["value"] for r in rows}


async def set_config_value(db: aiosqlite.Connection, key: str, value: str):
    await db.execute(
        "INSERT OR REPLACE INTO crawl_config (key, value) VALUES (?, ?)", (key, value)
    )
    await db.commit()


async def get_meta(db: aiosqlite.Connection) -> dict:
    async with db.execute("SELECT key, value FROM crawl_meta") as cur:
        rows = await cur.fetchall()
    return {r["key"]: r["value"] for r in rows}


async def get_crawler_status(db: aiosqlite.Connection) -> dict:
    config = await get_config(db)
    meta = await get_meta(db)

    async with db.execute(
        "SELECT COUNT(*) as c FROM crawl_queue WHERE status='pending'"
    ) as cur:
        row = await cur.fetchone()
        queue_pending = row["c"]

    async with db.execute(
        "SELECT COUNT(*) as c FROM crawl_queue WHERE status='done'"
    ) as cur:
        row = await cur.fetchone()
        queue_done = row["c"]

    async with db.execute(
        "SELECT * FROM crawl_sessions ORDER BY id DESC LIMIT 1"
    ) as cur:
        last_session = await cur.fetchone()

    pid = _get_crawler_pid()

    return {
        "running": pid is not None,
        "paused": config.get("paused", "false") == "true",
        "pid": pid,
        "queue_pending": queue_pending,
        "queue_done": queue_done,
        "nodes_this_session": int(meta.get("nodes_this_session", 0)),
        "edges_this_session": int(meta.get("edges_this_session", 0)),
        "total_crawled": int(meta.get("total_crawled", 0)),
        "last_run": meta.get("last_run"),
        "last_session": dict(last_session) if last_session else None,
        "config": config,
    }


def _get_crawler_pid() -> int | None:
    try:
        result = subprocess.run(
            ["systemctl", "show", "geoguessr-crawler", "--property=MainPID"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            line = result.stdout.strip()
            pid = int(line.split("=")[1])
            return pid if pid > 0 else None
    except Exception:
        pass
    return None


def _systemctl(action: str, service: str) -> bool:
    try:
        result = subprocess.run(
            ["systemctl", action, service],
            capture_output=True,
        )
        return result.returncode == 0
    except Exception:
        return False


async def start_crawler() -> bool:
    return _systemctl("start", "geoguessr-crawler")


async def stop_crawler(db: aiosqlite.Connection) -> bool:
    await set_config_value(db, "paused", "false")
    return _systemctl("stop", "geoguessr-crawler")


async def pause_crawler(db: aiosqlite.Connection) -> bool:
    await set_config_value(db, "paused", "true")
    return True


async def read_log_tail(n: int = 200) -> list[str]:
    try:
        result = subprocess.run(
            ["tail", "-n", str(n), LOG_PATH],
            capture_output=True,
            text=True,
        )
        return result.stdout.splitlines()
    except Exception:
        return []
