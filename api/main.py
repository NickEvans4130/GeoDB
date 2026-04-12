import asyncio
import json
import logging
import os
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .db import init_db
from .routes.admin import router as admin_router
from .routes.graph import router as graph_router
from .routes.stats import router as stats_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

LOG_PATH = "/home/nick/geoguessr-graph/crawler.log"

# connected WebSocket clients
_graph_clients: set[WebSocket] = set()
_log_clients: set[WebSocket] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("GeoDB API started")
    yield
    logger.info("GeoDB API shutting down")


app = FastAPI(title="GeoDB API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(graph_router)
app.include_router(stats_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# Internal endpoint for crawler to push node events
@app.post("/api/internal/new-node")
async def internal_new_node(payload: dict):
    await broadcast_new_node(payload.get("node", {}), payload.get("position"))
    return {"ok": True}


# Serve React SPA — must be mounted last so API routes take priority
DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.isdir(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve index.html for all non-API routes (React Router handles them)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))


# WebSocket: graph updates (new nodes from crawler)
@app.websocket("/api/ws/graph-updates")
async def ws_graph_updates(ws: WebSocket):
    await ws.accept()
    _graph_clients.add(ws)
    try:
        while True:
            await asyncio.sleep(30)
            await ws.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        _graph_clients.discard(ws)


# WebSocket: live log stream for admin panel
@app.websocket("/api/ws/logs")
async def ws_logs(ws: WebSocket):
    await ws.accept()
    _log_clients.add(ws)
    try:
        # Send last 100 lines on connect
        try:
            result = subprocess.run(
                ["tail", "-n", "100", LOG_PATH], capture_output=True, text=True
            )
            for line in result.stdout.splitlines():
                await ws.send_text(line)
        except Exception:
            pass

        # Follow the log file
        proc = None
        try:
            proc = subprocess.Popen(
                ["tail", "-f", "-n", "0", LOG_PATH],
                stdout=subprocess.PIPE,
                text=True,
            )
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, proc.stdout.readline)
                if line:
                    await ws.send_text(line.rstrip())
                else:
                    await asyncio.sleep(0.5)
        finally:
            if proc:
                proc.terminate()
    except WebSocketDisconnect:
        pass
    finally:
        _log_clients.discard(ws)


async def broadcast_new_node(node: dict, position: dict | None = None):
    """Called by crawler (via HTTP) to broadcast new node to all graph WS clients."""
    msg = {"type": "new_node", "node": node, "position": position or {}}
    dead = set()
    for ws in _graph_clients:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    _graph_clients.difference_update(dead)
