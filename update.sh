#!/bin/bash
# Pull latest, rebuild frontend, restart API and crawler.
# Run on the homelab: bash update.sh [branch]

set -e
REPO=/home/nick/geoguessr-graph
BRANCH=${1:-main}

cd "$REPO"

echo "==> Pulling $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> Installing Python deps"
venv/bin/pip install -r requirements.txt -q

echo "==> Building frontend"
cd frontend
npm install --silent
npm run build
cd ..

echo "==> Restarting API"
pkill -f "uvicorn api.main:app" 2>/dev/null || true
sleep 1
nohup venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8421 > /tmp/geodb-api.log 2>&1 &
sleep 2
curl -sf http://localhost:8421/api/health && echo "" || echo "WARNING: API health check failed"

echo "==> Restarting crawler"
pkill -f "python -m crawler.crawler" 2>/dev/null || true
sleep 1
nohup venv/bin/python -m crawler.crawler >> "$REPO/crawler.log" 2>&1 &

echo "==> Done. API log: /tmp/geodb-api.log  Crawler log: $REPO/crawler.log"
