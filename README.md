# GEODB

```
 ██████╗ ███████╗ ██████╗ ██████╗ ██████╗
██╔════╝ ██╔════╝██╔═══██╗██╔══██╗██╔══██╗
██║  ███╗█████╗  ██║   ██║██║  ██║██████╔╝
██║   ██║██╔══╝  ██║   ██║██║  ██║██╔══██╗
╚██████╔╝███████╗╚██████╔╝██████╔╝██████╔╝
 ╚═════╝ ╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝
GeoGuessr Social Graph — live intelligence network
```

---

## Architecture

```
                     graph.sirey.tech
                           │
                    ┌──────▼──────┐
                    │    nginx    │
                    │  :80 proxy  │
                    └──┬──────┬───┘
                       │      │
              /api/    │      │  /
                       │      │
              ┌────────▼─┐  ┌─▼────────────────┐
              │ FastAPI  │  │  React (Vite SPA) │
              │  :8421   │  │  frontend/dist/   │
              └────┬─────┘  └──────────────────┘
                   │
            ┌──────▼──────┐
            │   SQLite    │
            │ geoguessr.db│
            └──────▲──────┘
                   │
            ┌──────┴──────┐
            │   Crawler   │
            │  (systemd)  │
            │  BFS queue  │
            └─────────────┘
```

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- nginx
- systemd (Linux)

### 1. Clone and configure

```bash
git clone git@github.com:NickEvans4130/GeoDB.git /home/nick/geoguessr-graph
cd /home/nick/geoguessr-graph
```

### 2. Python environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Build frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Initialise database

```bash
source venv/bin/activate
python -c "import asyncio; from api.db import init_db; asyncio.run(init_db())"
```

### 5. Deploy systemd services

```bash
sudo cp systemd/geoguessr-api.service /etc/systemd/system/
sudo cp systemd/geoguessr-crawler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable geoguessr-api geoguessr-crawler
sudo systemctl start geoguessr-api
```

### 6. Configure nginx

```bash
sudo cp nginx/graph.sirey.tech.conf /etc/nginx/sites-available/graph.sirey.tech
sudo ln -s /etc/nginx/sites-available/graph.sirey.tech /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7. Start crawler

Set your GeoGuessr cookie via the admin panel at `/admin`, then:

```bash
sudo systemctl start geoguessr-crawler
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Get JWT token |
| GET | `/api/admin/status` | Crawler status |
| POST | `/api/admin/crawler/start` | Start crawler |
| POST | `/api/admin/crawler/pause` | Pause crawler |
| POST | `/api/admin/crawler/stop` | Stop crawler |
| PATCH | `/api/admin/config` | Update config |
| GET | `/api/graph/nodes` | Paginated node list |
| GET | `/api/graph/edges` | NDJSON edge stream |
| GET | `/api/graph/node/{id}` | Single player + friends |
| GET | `/api/graph/subgraph/{id}` | Ego network |
| GET | `/api/graph/search?q=` | Search by nick |
| GET | `/api/stats/overview` | Network summary |
| GET | `/api/stats/rating/distribution` | Rating histogram |
| GET | `/api/stats/countries` | Per-country breakdown |
| GET | `/api/stats/leaderboard` | Top 100 by rating |
| WS | `/api/ws/graph-updates` | Live node stream |
| WS | `/api/ws/logs` | Live crawler log |

---

## Screenshots

<!-- Add after first crawl -->

---

## License

MIT
