"""Main crawler entry point — runs as a systemd service."""
import asyncio
import logging
import os
import signal
import sys
from datetime import datetime, timezone

import aiosqlite

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from crawler.api import GeoGuessrClient
from crawler.bfs import crawl_one
from crawler.db import (
    add_to_queue,
    get_config,
    get_db,
    mark_done,
    mark_failed,
    next_pending,
    requeue_stale_players,
    set_meta,
    upsert_player,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/home/nick/geoguessr-graph/crawler.log"),
    ],
)
logger = logging.getLogger(__name__)

STOP = False


def handle_signal(sig, frame):
    global STOP
    logger.info("Signal %s received — stopping gracefully", sig)
    STOP = True


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


async def run():
    global STOP
    logger.info("GeoDB Crawler starting")

    db = await get_db()
    config = await get_config(db)

    seed_id = config.get("seed_user_id", "60b1162519261200015e3ca2")
    cookie = config.get("cookie", "")

    # Ensure seed user is in the queue
    await add_to_queue(db, seed_id, 0)

    # Fetch seed user profile
    if cookie:
        client = GeoGuessrClient(
            cookie=cookie,
            delay_min=float(config.get("delay_min", 0.8)),
            delay_max=float(config.get("delay_max", 1.5)),
            max_retries=int(config.get("max_retries", 5)),
        )
        seed_player = await client.get_user(seed_id)
        if seed_player:
            await upsert_player(db, seed_player, 0)
        await client.close()

    # Start session
    session_start = datetime.now(timezone.utc).isoformat()
    async with db.execute(
        "INSERT INTO crawl_sessions (started_at, nodes_crawled, edges_found) VALUES (?, 0, 0)",
        (session_start,),
    ) as cur:
        session_id = cur.lastrowid
    await db.commit()

    total_crawled = int((await get_config(db)).get("total_crawled_ever", "0") or "0")
    session_nodes = 0
    session_edges = 0
    last_config_poll = 0.0
    last_meta_write = 0.0
    config_poll_interval = 30
    meta_write_interval = 60

    import time

    client = None

    try:
        while not STOP:
            now = time.time()

            # Reload config periodically
            if now - last_config_poll > config_poll_interval:
                config = await get_config(db)
                last_config_poll = now
                paused = config.get("paused", "false") == "true"
                if paused:
                    logger.info("Crawler paused — waiting for resume")
                    while config.get("paused", "false") == "true" and not STOP:
                        await asyncio.sleep(5)
                        config = await get_config(db)
                    if STOP:
                        break
                    logger.info("Crawler resumed")

                # Re-create client with updated config
                if client:
                    await client.close()
                client = GeoGuessrClient(
                    cookie=config.get("cookie", ""),
                    delay_min=float(config.get("delay_min", 0.8)),
                    delay_max=float(config.get("delay_max", 1.5)),
                    max_retries=int(config.get("max_retries", 5)),
                )

            if not client:
                client = GeoGuessrClient(
                    cookie=config.get("cookie", ""),
                    delay_min=float(config.get("delay_min", 0.8)),
                    delay_max=float(config.get("delay_max", 1.5)),
                    max_retries=int(config.get("max_retries", 5)),
                )

            # Get next player from queue
            entry = await next_pending(db)
            if entry is None:
                refresh_hours = float(config.get("refresh_interval_hours", "24"))
                requeued = await requeue_stale_players(db, refresh_hours)
                if requeued > 0:
                    logger.info("Queue empty — requeued %d stale players for refresh (threshold: %gh)", requeued, refresh_hours)
                else:
                    logger.info("Queue empty — sleeping 30s")
                    await asyncio.sleep(30)
                continue

            player_id, depth = entry
            max_depth = int(config.get("max_depth", "0"))

            try:
                new_nodes, new_edges = await crawl_one(
                    db, client, player_id, depth, max_depth
                )

                if client.cookie_expired:
                    logger.error("Cookie expired — setting paused=true in config")
                    from crawler.db import get_db as _get_db
                    _db = await _get_db()
                    await _db.execute(
                        "INSERT OR REPLACE INTO crawl_config (key, value) VALUES ('paused', 'true')"
                    )
                    await _db.commit()
                    await _db.close()
                    await mark_failed(db, player_id)
                    break

                await mark_done(db, player_id)
                session_nodes += new_nodes
                session_edges += new_edges
                total_crawled += 1

                if total_crawled % 100 == 0:
                    async with db.execute(
                        "SELECT COUNT(*) as c FROM crawl_queue WHERE status='pending'"
                    ) as cur:
                        row = await cur.fetchone()
                        queue_size = row["c"]
                    logger.info(
                        "Crawled: %d | Queue: %d | Depth: %d | Session nodes: %d edges: %d",
                        total_crawled, queue_size, depth, session_nodes, session_edges,
                    )

            except Exception as e:
                logger.exception("Error crawling %s: %s", player_id, e)
                await mark_failed(db, player_id)
                await asyncio.sleep(5)
                continue

            # Write meta periodically
            if now - last_meta_write > meta_write_interval:
                await set_meta(db, "nodes_this_session", str(session_nodes))
                await set_meta(db, "edges_this_session", str(session_edges))
                await set_meta(db, "total_crawled", str(total_crawled))
                await set_meta(db, "last_run", datetime.now(timezone.utc).isoformat())
                # Update session stats
                await db.execute(
                    "UPDATE crawl_sessions SET nodes_crawled=?, edges_found=? WHERE id=?",
                    (session_nodes, session_edges, session_id),
                )
                await db.commit()
                last_meta_write = now

            import random
            await asyncio.sleep(
                random.uniform(
                    float(config.get("delay_min", 0.8)),
                    float(config.get("delay_max", 1.5)),
                )
            )

    finally:
        stop_time = datetime.now(timezone.utc).isoformat()
        reason = "manual" if STOP else "error"
        await db.execute(
            "UPDATE crawl_sessions SET stopped_at=?, reason=?, nodes_crawled=?, edges_found=? WHERE id=?",
            (stop_time, reason, session_nodes, session_edges, session_id),
        )
        await set_meta(db, "total_crawled", str(total_crawled))
        await set_meta(db, "last_run", datetime.now(timezone.utc).isoformat())
        await db.commit()
        if client:
            await client.close()
        await db.close()
        logger.info(
            "Crawler stopped. Session: %d nodes, %d edges", session_nodes, session_edges
        )


if __name__ == "__main__":
    asyncio.run(run())
