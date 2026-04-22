import aiosqlite
import os

DB_PATH = os.environ.get("DB_PATH", "/home/nick/geoguessr-graph/geoguessr.db")


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA busy_timeout=5000")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def get_config(db: aiosqlite.Connection) -> dict:
    async with db.execute("SELECT key, value FROM crawl_config") as cur:
        rows = await cur.fetchall()
    return {r["key"]: r["value"] for r in rows}


async def set_meta(db: aiosqlite.Connection, key: str, value: str):
    await db.execute(
        "INSERT OR REPLACE INTO crawl_meta (key, value) VALUES (?, ?)", (key, value)
    )
    await db.commit()


async def upsert_player(db: aiosqlite.Connection, player: dict, depth: int):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()

    async with db.execute(
        "SELECT id, elo, rating FROM players WHERE id = ?", (player["id"],)
    ) as cur:
        existing = await cur.fetchone()

    if existing:
        # Check if elo/rating changed -> insert history
        if existing["elo"] != player.get("elo") or existing["rating"] != player.get("rating"):
            await db.execute(
                """INSERT INTO elo_history (player_id, elo, rating, last_rating_change, recorded_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    player["id"],
                    player.get("elo"),
                    player.get("rating"),
                    player.get("last_rating_change"),
                    now,
                ),
            )
        await db.execute(
            """UPDATE players SET nick=?, country_code=?, is_pro=?, subscription_type=?,
               is_verified=?, is_banned=?, is_bot=?, is_creator=?, flair=?,
               club_tag=?, club_id=?, club_level=?, level=?, xp=?, br_level=?,
               elo=?, rating=?, last_rating_change=?, division_type=?,
               on_leaderboard=?, gold_medals=?, silver_medals=?, bronze_medals=?,
               platinum_medals=?, last_seen=?
               WHERE id=?""",
            (
                player.get("nick"),
                player.get("country_code"),
                player.get("is_pro"),
                player.get("subscription_type"),
                player.get("is_verified"),
                player.get("is_banned"),
                player.get("is_bot"),
                player.get("is_creator"),
                player.get("flair"),
                player.get("club_tag"),
                player.get("club_id"),
                player.get("club_level"),
                player.get("level"),
                player.get("xp"),
                player.get("br_level"),
                player.get("elo"),
                player.get("rating"),
                player.get("last_rating_change"),
                player.get("division_type"),
                player.get("on_leaderboard"),
                player.get("gold_medals"),
                player.get("silver_medals"),
                player.get("bronze_medals"),
                player.get("platinum_medals"),
                now,
                player["id"],
            ),
        )
    else:
        await db.execute(
            """INSERT INTO players
               (id, nick, country_code, is_pro, subscription_type, is_verified, is_banned,
                is_bot, is_creator, flair, club_tag, club_id, club_level, level, xp,
                br_level, elo, rating, last_rating_change, division_type, on_leaderboard,
                gold_medals, silver_medals, bronze_medals, platinum_medals,
                created_at, first_seen, last_seen, crawl_depth)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                player["id"],
                player.get("nick"),
                player.get("country_code"),
                player.get("is_pro"),
                player.get("subscription_type"),
                player.get("is_verified"),
                player.get("is_banned"),
                player.get("is_bot"),
                player.get("is_creator"),
                player.get("flair"),
                player.get("club_tag"),
                player.get("club_id"),
                player.get("club_level"),
                player.get("level"),
                player.get("xp"),
                player.get("br_level"),
                player.get("elo"),
                player.get("rating"),
                player.get("last_rating_change"),
                player.get("division_type"),
                player.get("on_leaderboard"),
                player.get("gold_medals"),
                player.get("silver_medals"),
                player.get("bronze_medals"),
                player.get("platinum_medals"),
                player.get("created_at"),
                now,
                now,
                depth,
            ),
        )

    await db.commit()
    return existing is None  # True if newly inserted


async def insert_edge(db: aiosqlite.Connection, a: str, b: str) -> bool:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    # canonical order
    if a > b:
        a, b = b, a
    try:
        await db.execute(
            "INSERT OR IGNORE INTO edges (player_a, player_b, discovered_at) VALUES (?, ?, ?)",
            (a, b, now),
        )
        await db.commit()
        async with db.execute(
            "SELECT changes() as c"
        ) as cur:
            row = await cur.fetchone()
            return row["c"] > 0
    except Exception:
        return False


async def add_to_queue(db: aiosqlite.Connection, player_id: str, depth: int):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT OR IGNORE INTO crawl_queue (player_id, depth, status, added_at) VALUES (?, ?, 'pending', ?)",
        (player_id, depth, now),
    )
    await db.commit()


async def mark_done(db: aiosqlite.Connection, player_id: str):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE crawl_queue SET status='done', processed_at=? WHERE player_id=?",
        (now, player_id),
    )
    await db.commit()


async def mark_failed(db: aiosqlite.Connection, player_id: str):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE crawl_queue SET status='failed', processed_at=? WHERE player_id=?",
        (now, player_id),
    )
    await db.commit()


async def requeue_stale_players(db: aiosqlite.Connection, hours: float) -> int:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    threshold = f"-{hours} hours"
    await db.execute(
        """UPDATE crawl_queue SET status='pending', processed_at=NULL
           WHERE status IN ('done', 'failed')
           AND player_id IN (
             SELECT id FROM players WHERE last_seen < datetime('now', ?)
           )""",
        (threshold,),
    )
    await db.execute(
        """INSERT OR IGNORE INTO crawl_queue (player_id, depth, status, added_at)
           SELECT id, crawl_depth, 'pending', ?
           FROM players WHERE last_seen < datetime('now', ?)""",
        (now, threshold),
    )
    await db.commit()
    async with db.execute(
        "SELECT COUNT(*) as c FROM crawl_queue WHERE status='pending'"
    ) as cur:
        row = await cur.fetchone()
    return row["c"]


async def next_pending(db: aiosqlite.Connection) -> tuple[str, int] | None:
    async with db.execute(
        "SELECT player_id, depth FROM crawl_queue WHERE status='pending' ORDER BY depth ASC, added_at ASC LIMIT 1"
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    await db.execute(
        "UPDATE crawl_queue SET status='processing' WHERE player_id=?", (row["player_id"],)
    )
    await db.commit()
    return row["player_id"], row["depth"]
