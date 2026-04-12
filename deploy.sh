#!/bin/bash
# GeoDB one-shot deployment script
# Run with: bash deploy.sh
# Requires sudo password for systemd/nginx steps

set -e
REPO=/home/nick/geoguessr-graph

echo "==> Installing systemd services"
sudo cp "$REPO/systemd/geoguessr-api.service" /etc/systemd/system/
sudo cp "$REPO/systemd/geoguessr-crawler.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable geoguessr-api geoguessr-crawler

echo "==> Configuring nginx"
sudo cp "$REPO/nginx/graph.sirey.tech.conf" /etc/nginx/sites-available/graph.sirey.tech
sudo ln -sf /etc/nginx/sites-available/graph.sirey.tech /etc/nginx/sites-enabled/graph.sirey.tech
sudo nginx -t
sudo systemctl reload nginx

echo "==> Starting API service"
sudo systemctl start geoguessr-api
sleep 2
sudo systemctl status geoguessr-api --no-pager -l

echo "==> Installing post-receive hook"
cp "$REPO/.git/hooks/post-receive.sample" "$REPO/.git/hooks/post-receive" 2>/dev/null || true
cat > "$REPO/.git/hooks/post-receive" << 'HOOK'
#!/bin/bash
while read oldrev newrev ref; do
  if [ "$ref" = "refs/heads/main" ]; then
    echo "==> Deploying GeoDB to production..."
    cd /home/nick/geoguessr-graph
    git pull origin main
    source venv/bin/activate
    pip install -r requirements.txt -q
    cd frontend && npm install --silent && npm run build
    cd ..
    sudo systemctl restart geoguessr-api geoguessr-crawler
    echo "==> Deploy complete at $(date)" >> /home/nick/geoguessr-graph/deploys.log
    echo "==> GeoDB deployed successfully"
  fi
done
HOOK
chmod +x "$REPO/.git/hooks/post-receive"

echo "==> Starting crawler service"
sudo systemctl start geoguessr-crawler
sleep 2
sudo systemctl status geoguessr-crawler --no-pager -l

echo ""
echo "==> Verifying API"
curl -sf http://localhost:8421/api/health && echo ""
curl -sf http://localhost:8421/api/stats/overview && echo ""

echo ""
echo "==> GeoDB live at https://graph.sirey.tech"
echo "==> Admin panel at https://graph.sirey.tech/admin (default password: changeme)"
echo "==> Set ADMIN_PASSWORD env in /etc/systemd/system/geoguessr-api.service and restart"
