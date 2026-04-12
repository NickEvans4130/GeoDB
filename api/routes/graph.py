from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import json

from ..db import get_db

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/nodes")
async def get_nodes(
    page: int = 0,
    limit: int = 5000,
    country: str | None = None,
    division: int | None = None,
    pro: bool | None = None,
    min_rating: int | None = None,
):
    db = await get_db()
    try:
        conditions = []
        params: list = []
        if country:
            conditions.append("country_code = ?")
            params.append(country)
        if division is not None:
            conditions.append("division_type = ?")
            params.append(division)
        if pro is not None:
            conditions.append("is_pro = ?")
            params.append(1 if pro else 0)
        if min_rating is not None:
            conditions.append("rating >= ?")
            params.append(min_rating)

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        params += [limit, page * limit]

        async with db.execute(
            f"""SELECT id, nick, country_code, is_pro, subscription_type,
                       is_verified, is_banned, is_creator, flair, club_tag,
                       level, xp, rating, elo, last_rating_change, division_type,
                       on_leaderboard, gold_medals, silver_medals, bronze_medals,
                       platinum_medals, crawl_depth
                FROM players {where}
                ORDER BY rating DESC
                LIMIT ? OFFSET ?""",
            params,
        ) as cur:
            rows = await cur.fetchall()

        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/edges")
async def get_edges():
    async def generate():
        db = await get_db()
        try:
            offset = 0
            chunk = 10000
            while True:
                async with db.execute(
                    "SELECT player_a, player_b FROM edges LIMIT ? OFFSET ?",
                    (chunk, offset),
                ) as cur:
                    rows = await cur.fetchall()
                if not rows:
                    break
                for r in rows:
                    yield json.dumps({"a": r["player_a"], "b": r["player_b"]}) + "\n"
                offset += chunk
        finally:
            await db.close()

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@router.get("/node/{player_id}")
async def get_node(player_id: str):
    db = await get_db()
    try:
        async with db.execute(
            "SELECT * FROM players WHERE id = ?", (player_id,)
        ) as cur:
            player = await cur.fetchone()
        if not player:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Player not found")

        async with db.execute(
            """SELECT p.* FROM players p
               JOIN edges e ON (e.player_b = p.id AND e.player_a = ?)
                            OR (e.player_a = p.id AND e.player_b = ?)
               ORDER BY p.rating DESC LIMIT 100""",
            (player_id, player_id),
        ) as cur:
            friends = await cur.fetchall()

        return {"player": dict(player), "friends": [dict(f) for f in friends]}
    finally:
        await db.close()


@router.get("/subgraph/{player_id}")
async def get_subgraph(player_id: str):
    db = await get_db()
    try:
        async with db.execute(
            """SELECT DISTINCT p.id, p.nick, p.country_code, p.rating, p.elo,
                      p.division_type, p.is_pro, p.is_creator, p.level
               FROM players p
               JOIN edges e ON (e.player_b = p.id AND e.player_a = ?)
                            OR (e.player_a = p.id AND e.player_b = ?)
               ORDER BY p.rating DESC LIMIT 200""",
            (player_id, player_id),
        ) as cur:
            friends = await cur.fetchall()

        friend_ids = [f["id"] for f in friends]
        all_ids = [player_id] + friend_ids

        placeholders = ",".join("?" * len(all_ids))
        async with db.execute(
            f"""SELECT player_a, player_b FROM edges
                WHERE player_a IN ({placeholders}) AND player_b IN ({placeholders})""",
            all_ids + all_ids,
        ) as cur:
            edges = await cur.fetchall()

        async with db.execute(
            "SELECT * FROM players WHERE id = ?", (player_id,)
        ) as cur:
            root = await cur.fetchone()

        nodes = ([dict(root)] if root else []) + [dict(f) for f in friends]
        return {
            "nodes": nodes,
            "edges": [{"a": e["player_a"], "b": e["player_b"]} for e in edges],
        }
    finally:
        await db.close()


@router.get("/export")
async def export_graph():
    db = await get_db()
    try:
        async with db.execute(
            """SELECT id, nick, country_code, rating, elo, division_type,
                      is_pro, is_creator, level FROM players ORDER BY rating DESC"""
        ) as cur:
            nodes = [dict(r) for r in await cur.fetchall()]

        async with db.execute("SELECT player_a, player_b FROM edges") as cur:
            edges = [{"a": r["player_a"], "b": r["player_b"]} for r in await cur.fetchall()]

        return {"nodes": nodes, "edges": edges}
    finally:
        await db.close()


@router.get("/search")
async def search_players(q: str = Query(..., min_length=1)):
    db = await get_db()
    try:
        async with db.execute(
            """SELECT id, nick, country_code, rating, division_type
               FROM players WHERE nick LIKE ?
               ORDER BY rating DESC LIMIT 20""",
            (f"%{q}%",),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()
