import aiosqlite
import os

DB_PATH = os.environ.get("DB_PATH", "/home/nick/geoguessr-graph/geoguessr.db")


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript("""
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    nick TEXT,
    country_code TEXT,
    is_pro BOOLEAN,
    subscription_type TEXT,
    is_verified BOOLEAN,
    is_banned BOOLEAN,
    is_bot BOOLEAN,
    is_creator BOOLEAN,
    flair INTEGER,
    club_tag TEXT,
    club_id TEXT,
    club_level INTEGER,
    level INTEGER,
    xp INTEGER,
    br_level INTEGER,
    elo INTEGER,
    rating INTEGER,
    last_rating_change INTEGER,
    division_type INTEGER,
    on_leaderboard BOOLEAN,
    gold_medals INTEGER,
    silver_medals INTEGER,
    bronze_medals INTEGER,
    platinum_medals INTEGER,
    created_at TEXT,
    first_seen TEXT,
    last_seen TEXT,
    crawl_depth INTEGER
);

CREATE TABLE IF NOT EXISTS elo_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT,
    elo INTEGER,
    rating INTEGER,
    last_rating_change INTEGER,
    recorded_at TEXT
);

CREATE TABLE IF NOT EXISTS edges (
    player_a TEXT,
    player_b TEXT,
    discovered_at TEXT,
    PRIMARY KEY (player_a, player_b)
);

CREATE TABLE IF NOT EXISTS crawl_queue (
    player_id TEXT PRIMARY KEY,
    depth INTEGER,
    status TEXT,
    added_at TEXT,
    processed_at TEXT
);

CREATE TABLE IF NOT EXISTS crawl_config (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS crawl_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    stopped_at TEXT,
    reason TEXT,
    nodes_crawled INTEGER,
    edges_found INTEGER
);

CREATE TABLE IF NOT EXISTS crawl_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_country ON players(country_code);
CREATE INDEX IF NOT EXISTS idx_players_division ON players(division_type);
CREATE INDEX IF NOT EXISTS idx_edges_a ON edges(player_a);
CREATE INDEX IF NOT EXISTS idx_edges_b ON edges(player_b);
CREATE INDEX IF NOT EXISTS idx_elo_history_player ON elo_history(player_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status);
        """)

        # Seed default config
        defaults = {
            "max_depth": "0",
            "delay_min": "0.8",
            "delay_max": "1.5",
            "max_retries": "5",
            "paused": "false",
            "cookie": "",
            "seed_user_id": "60b1162519261200015e3ca2",
        }
        for k, v in defaults.items():
            await db.execute(
                "INSERT OR IGNORE INTO crawl_config (key, value) VALUES (?, ?)", (k, v)
            )

        await db.commit()
