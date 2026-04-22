import hmac
import logging
import os
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

_raw_secret = os.environ.get("JWT_SECRET", "")
if not _raw_secret:
    # Generate a random secret per process. Tokens issued before a restart will
    # be invalidated, which is acceptable — admins just log in again.
    _raw_secret = secrets.token_hex(32)
    logger.warning("JWT_SECRET not set — generated ephemeral secret. Set JWT_SECRET in the service env to persist sessions across restarts.")

SECRET_KEY = _raw_secret
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "changeme")
if ADMIN_PASSWORD == "changeme":
    logger.warning("ADMIN_PASSWORD is set to the default 'changeme' — change it via the service environment.")

bearer_scheme = HTTPBearer()

# In-memory rate limiter: max 10 attempts per IP per 5 minutes
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 300   # seconds
_RATE_LIMIT = 10


def check_login_rate(ip: str):
    now = time.monotonic()
    attempts = _login_attempts[ip]
    # Drop attempts outside the window
    _login_attempts[ip] = [t for t in attempts if now - t < _RATE_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts — try again later",
        )
    _login_attempts[ip].append(now)


def verify_password(candidate: str) -> bool:
    return hmac.compare_digest(candidate.encode(), ADMIN_PASSWORD.encode())


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    return verify_token(credentials.credentials)


def verify_ws_token(token: str | None) -> dict:
    """Used by WebSocket endpoints that pass token as a query param."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return verify_token(token)
