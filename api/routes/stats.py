from fastapi import APIRouter, Query

from ..db import get_db

router = APIRouter(prefix="/api/stats", tags=["stats"])

DIVISION_BUCKETS = [
    (0, 450, 10, "Unranked"),
    (450, 675, 20, "Bronze"),
    (675, 850, 30, "Silver"),
    (850, 1100, 40, "Gold"),
    (1100, 1500, 50, "Champion"),
    (1500, 9999, 50, "Champion+"),
]


@router.get("/overview")
async def overview():
    db = await get_db()
    try:
        async with db.execute("SELECT COUNT(*) as c FROM players") as cur:
            total_players = (await cur.fetchone())["c"]
        async with db.execute("SELECT COUNT(*) as c FROM edges") as cur:
            total_edges = (await cur.fetchone())["c"]
        async with db.execute(
            "SELECT COUNT(DISTINCT country_code) as c FROM players WHERE country_code IS NOT NULL"
        ) as cur:
            total_countries = (await cur.fetchone())["c"]
        async with db.execute(
            "SELECT COUNT(*) as c FROM players WHERE is_pro = 1"
        ) as cur:
            total_pro = (await cur.fetchone())["c"]
        async with db.execute("SELECT AVG(rating) as a FROM players WHERE rating > 0") as cur:
            avg_rating = (await cur.fetchone())["a"]

        pct_pro = round(total_pro / total_players * 100, 1) if total_players else 0
        return {
            "total_players": total_players,
            "total_edges": total_edges,
            "total_countries": total_countries,
            "pct_pro": pct_pro,
            "avg_rating": round(avg_rating or 0, 1),
        }
    finally:
        await db.close()


@router.get("/rating/distribution")
async def rating_distribution():
    db = await get_db()
    try:
        buckets = []
        for lo, hi, div_type, label in DIVISION_BUCKETS:
            async with db.execute(
                "SELECT COUNT(*) as c FROM players WHERE rating >= ? AND rating < ?",
                (lo, hi),
            ) as cur:
                count = (await cur.fetchone())["c"]
            buckets.append(
                {"label": label, "min": lo, "max": hi, "division_type": div_type, "count": count}
            )
        return buckets
    finally:
        await db.close()


@router.get("/elo/distribution")
async def elo_distribution():
    db = await get_db()
    try:
        step = 100
        results = []
        for lo in range(0, 3000, step):
            async with db.execute(
                "SELECT COUNT(*) as c FROM players WHERE elo >= ? AND elo < ?",
                (lo, lo + step),
            ) as cur:
                count = (await cur.fetchone())["c"]
            if count > 0:
                results.append({"min": lo, "max": lo + step, "count": count})
        return results
    finally:
        await db.close()


@router.get("/countries")
async def countries():
    db = await get_db()
    try:
        async with db.execute(
            """SELECT country_code, COUNT(*) as player_count,
                      AVG(rating) as avg_rating, AVG(elo) as avg_elo
               FROM players
               WHERE country_code IS NOT NULL AND country_code != ''
               GROUP BY country_code
               ORDER BY player_count DESC
               LIMIT 50"""
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/divisions")
async def divisions():
    db = await get_db()
    try:
        async with db.execute(
            """SELECT division_type, COUNT(*) as count, AVG(rating) as avg_rating
               FROM players GROUP BY division_type ORDER BY division_type"""
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/clubs")
async def clubs():
    db = await get_db()
    try:
        async with db.execute(
            """SELECT club_tag, club_id, COUNT(*) as member_count,
                      AVG(rating) as avg_rating, AVG(elo) as avg_elo,
                      AVG(level) as avg_level
               FROM players
               WHERE club_tag IS NOT NULL AND club_tag != ''
               GROUP BY club_id
               ORDER BY member_count DESC
               LIMIT 50"""
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/elo/history/{player_id}")
async def elo_history(player_id: str):
    db = await get_db()
    try:
        async with db.execute(
            """SELECT elo, rating, last_rating_change, recorded_at
               FROM elo_history WHERE player_id = ?
               ORDER BY recorded_at DESC LIMIT 50""",
            (player_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/leaderboard")
async def leaderboard(
    page: int = 0,
    limit: int = 25,
    country: str | None = None,
):
    db = await get_db()
    try:
        conditions = ["rating > 0"]
        params: list = []
        if country:
            conditions.append("country_code = ?")
            params.append(country)
        where = "WHERE " + " AND ".join(conditions)
        params += [limit, page * limit]
        async with db.execute(
            f"""SELECT id, nick, country_code, rating, elo, division_type,
                       level, subscription_type, is_verified, on_leaderboard
                FROM players {where}
                ORDER BY rating DESC LIMIT ? OFFSET ?""",
            params,
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.get("/crawl/progress")
async def crawl_progress():
    db = await get_db()
    try:
        async with db.execute(
            """SELECT first_seen, COUNT(*) as count
               FROM players
               WHERE first_seen IS NOT NULL
               GROUP BY substr(first_seen, 1, 16)
               ORDER BY first_seen"""
        ) as cur:
            rows = await cur.fetchall()
        # cumulative
        total = 0
        result = []
        for r in rows:
            total += r["count"]
            result.append({"timestamp": r["first_seen"], "total": total})
        return result
    finally:
        await db.close()
