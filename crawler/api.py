"""GeoGuessr API client with rate limiting and retry logic."""
import asyncio
import json
import logging
import os
import random
from datetime import datetime, timezone
from pathlib import Path

import aiohttp

logger = logging.getLogger(__name__)

BASE_URL = "https://www.geoguessr.com"
RAW_DIR = Path("/home/nick/geoguessr-graph/raw_responses")

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0",
    "X-Client": "web",
    "Content-Type": "application/json",
}


def _parse_player(obj: dict) -> dict:
    comp = obj.get("competitive") or {}
    div = comp.get("division") or {}
    prog = obj.get("progress") or {}
    medals = prog.get("competitionMedals") or {}
    br = obj.get("br") or {}
    club = obj.get("club") or {}

    return {
        "id": obj.get("id") or obj.get("userId"),
        "nick": obj.get("nick"),
        "country_code": obj.get("countryCode"),
        "is_pro": obj.get("isProUser", False),
        "subscription_type": obj.get("type"),
        "is_verified": obj.get("isVerified", False),
        "is_banned": obj.get("isBanned", False),
        "is_bot": obj.get("isBotUser", False),
        "is_creator": obj.get("isCreator", False),
        "flair": obj.get("flair"),
        "club_tag": club.get("tag"),
        "club_id": club.get("clubId"),
        "club_level": club.get("level"),
        "level": prog.get("level"),
        "xp": prog.get("xp"),
        "br_level": br.get("level"),
        "elo": comp.get("elo"),
        "rating": comp.get("rating"),
        "last_rating_change": comp.get("lastRatingChange"),
        "division_type": div.get("type"),
        "on_leaderboard": comp.get("onLeaderboard", False),
        "gold_medals": medals.get("gold", 0),
        "silver_medals": medals.get("silver", 0),
        "bronze_medals": medals.get("bronze", 0),
        "platinum_medals": medals.get("platinum", 0),
        "created_at": obj.get("created"),
    }


class GeoGuessrClient:
    def __init__(self, cookie: str, delay_min: float = 0.8, delay_max: float = 1.5, max_retries: int = 5):
        self.cookie = cookie
        self.delay_min = delay_min
        self.delay_max = delay_max
        self.max_retries = max_retries
        self._session: aiohttp.ClientSession | None = None
        self.cookie_expired = False

    def _headers(self) -> dict:
        return {**DEFAULT_HEADERS, "Cookie": self.cookie}

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self._headers())
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def _get(self, url: str) -> dict | list | None:
        session = await self._get_session()
        backoff = 30.0
        for attempt in range(self.max_retries):
            try:
                async with session.get(url, headers=self._headers()) as resp:
                    if resp.status in (401, 403):
                        logger.warning("Cookie expired (HTTP %d)", resp.status)
                        self.cookie_expired = True
                        return None
                    if resp.status == 429:
                        wait = backoff * (2 ** attempt)
                        logger.warning("Rate limited, waiting %.1fs", wait)
                        await asyncio.sleep(wait)
                        continue
                    if resp.status != 200:
                        logger.error("HTTP %d for %s", resp.status, url)
                        await asyncio.sleep(5)
                        continue
                    return await resp.json(content_type=None)
            except aiohttp.ClientError as e:
                logger.error("Request error: %s", e)
                await asyncio.sleep(5)
        return None

    async def _jitter_sleep(self):
        await asyncio.sleep(random.uniform(self.delay_min, self.delay_max))

    async def get_friends(self, user_id: str) -> list[dict]:
        """Paginate through all friends of a user."""
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        all_friends = []
        page = 0
        while True:
            url = f"{BASE_URL}/api/v3/social/{user_id}/friends/?page={page}&count=50"
            data = await self._get(url)
            if self.cookie_expired:
                return []
            if data is None:
                break
            friends = data if isinstance(data, list) else data.get("friends", [])
            all_friends.extend(friends)
            if len(friends) < 50:
                break
            page += 1
            await self._jitter_sleep()

        # Save raw response
        raw_file = RAW_DIR / f"{user_id}.json"
        raw_file.write_text(json.dumps(all_friends, indent=2))

        return [_parse_player(f) for f in all_friends if not f.get("isBotUser")]

    async def get_user(self, user_id: str) -> dict | None:
        url = f"{BASE_URL}/api/v3/users/{user_id}"
        data = await self._get(url)
        if data is None or self.cookie_expired:
            return None
        return _parse_player(data)
