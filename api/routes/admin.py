import asyncio
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..auth import check_login_rate, create_access_token, require_admin, verify_password
from ..crawler_control import (
    get_config,
    get_crawler_status,
    pause_crawler,
    read_log_tail,
    set_config_value,
    start_crawler,
    stop_crawler,
)
from ..db import DB_PATH, get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])

LOG_PATH = "/home/nick/geoguessr-graph/crawler.log"


class LoginRequest(BaseModel):
    password: str


class ConfigPatch(BaseModel):
    max_depth: str | None = None
    delay_min: str | None = None
    delay_max: str | None = None
    max_retries: str | None = None
    cookie: str | None = None
    seed_user_id: str | None = None


@router.post("/login")
async def login(req: LoginRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    check_login_rate(ip)
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_access_token({"sub": "admin"})
    return {"token": token}


@router.get("/status")
async def status(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        return await get_crawler_status(db)
    finally:
        await db.close()


@router.post("/crawler/start")
async def crawler_start(_: dict = Depends(require_admin)):
    ok = await start_crawler()
    return {"ok": ok}


@router.post("/crawler/stop")
async def crawler_stop(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        ok = await stop_crawler(db)
        return {"ok": ok}
    finally:
        await db.close()


@router.post("/crawler/pause")
async def crawler_pause(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        ok = await pause_crawler(db)
        return {"ok": ok}
    finally:
        await db.close()


@router.get("/config")
async def get_config_route(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        return await get_config(db)
    finally:
        await db.close()


@router.patch("/config")
async def patch_config(patch: ConfigPatch, _: dict = Depends(require_admin)):
    db = await get_db()
    try:
        updates = patch.model_dump(exclude_none=True)
        for k, v in updates.items():
            await set_config_value(db, k, str(v))
        return {"ok": True, "updated": list(updates.keys())}
    finally:
        await db.close()


@router.get("/logs")
async def get_logs(_: dict = Depends(require_admin)):
    lines = await read_log_tail(200)
    return {"lines": lines}


@router.get("/sessions")
async def get_sessions(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        async with db.execute(
            "SELECT * FROM crawl_sessions ORDER BY id DESC LIMIT 50"
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/db/stats")
async def db_stats(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        stats = {}
        for table in ["players", "edges", "elo_history"]:
            async with db.execute(f"SELECT COUNT(*) as c FROM {table}") as cur:
                row = await cur.fetchone()
                stats[table] = row["c"]
        for status in ["pending", "done", "failed", "processing"]:
            async with db.execute(
                "SELECT COUNT(*) as c FROM crawl_queue WHERE status=?", (status,)
            ) as cur:
                row = await cur.fetchone()
                stats[f"queue_{status}"] = row["c"]
        db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
        stats["db_size_bytes"] = db_size
        return stats
    finally:
        await db.close()


@router.post("/db/vacuum")
async def db_vacuum(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        await db.execute("VACUUM")
        await db.commit()
        return {"ok": True, "timestamp": datetime.now(timezone.utc).isoformat()}
    finally:
        await db.close()


@router.post("/db/refresh-all-players")
async def refresh_all_players(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        # Reset every done/failed entry to pending
        await db.execute(
            "UPDATE crawl_queue SET status='pending', processed_at=NULL WHERE status IN ('done', 'failed')"
        )
        # Insert any players somehow missing from the queue
        await db.execute(
            """INSERT OR IGNORE INTO crawl_queue (player_id, depth, status, added_at)
               SELECT id, crawl_depth, 'pending', ? FROM players""",
            (now,),
        )
        await db.commit()
        async with db.execute("SELECT COUNT(*) as c FROM crawl_queue WHERE status='pending'") as cur:
            row = await cur.fetchone()
        return {"ok": True, "queued": row["c"]}
    finally:
        await db.close()


@router.post("/db/danger/clear-queue")
async def clear_queue(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        async with db.execute(
            "SELECT value FROM crawl_config WHERE key='seed_user_id'"
        ) as cur:
            row = await cur.fetchone()
            seed_id = row["value"] if row else "60b1162519261200015e3ca2"
        now = datetime.now(timezone.utc).isoformat()
        await db.execute("DELETE FROM crawl_queue")
        await db.execute(
            "INSERT INTO crawl_queue (player_id, depth, status, added_at) VALUES (?, 0, 'pending', ?)",
            (seed_id, now),
        )
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.post("/db/danger/wipe-elo-history")
async def wipe_elo_history(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        await db.execute("DELETE FROM elo_history")
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.post("/db/danger/full-reset")
async def full_reset(_: dict = Depends(require_admin)):
    db = await get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        for table in ["players", "edges", "elo_history", "crawl_queue", "crawl_meta", "crawl_sessions"]:
            await db.execute(f"DELETE FROM {table}")
        async with db.execute(
            "SELECT value FROM crawl_config WHERE key='seed_user_id'"
        ) as cur:
            row = await cur.fetchone()
            seed_id = row["value"] if row else "60b1162519261200015e3ca2"
        await db.execute(
            "INSERT INTO crawl_queue (player_id, depth, status, added_at) VALUES (?, 0, 'pending', ?)",
            (seed_id, now),
        )
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()
