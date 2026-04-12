"""BFS crawl logic — processes one player at a time from the persistent queue."""
import asyncio
import logging
from datetime import datetime, timezone

import aiosqlite
import aiohttp

from .api import GeoGuessrClient
from .db import (
    add_to_queue,
    get_config,
    insert_edge,
    mark_done,
    mark_failed,
    next_pending,
    set_meta,
    upsert_player,
)

logger = logging.getLogger(__name__)

API_BASE = "http://127.0.0.1:8421"


async def _notify_api(node: dict):
    try:
        async with aiohttp.ClientSession() as s:
            await s.post(
                f"{API_BASE}/api/internal/new-node",
                json={"node": node},
                timeout=aiohttp.ClientTimeout(total=2),
            )
    except Exception:
        pass


async def crawl_one(
    db: aiosqlite.Connection,
    client: GeoGuessrClient,
    player_id: str,
    depth: int,
    max_depth: int,
) -> tuple[int, int]:
    """Crawl a single player. Returns (new_nodes, new_edges)."""
    new_nodes = 0
    new_edges = 0

    friends = await client.get_friends(player_id)
    if client.cookie_expired:
        return 0, 0

    for friend in friends:
        fid = friend.get("id")
        if not fid:
            continue

        is_new = await upsert_player(db, friend, depth + 1)
        if is_new:
            new_nodes += 1
            await _notify_api(friend)

        edge_new = await insert_edge(db, player_id, fid)
        if edge_new:
            new_edges += 1

        # Enqueue if within depth limit and not already queued
        if max_depth == 0 or depth + 1 < max_depth:
            await add_to_queue(db, fid, depth + 1)

    return new_nodes, new_edges
