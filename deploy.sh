#!/usr/bin/env bash
# Run this on the server after cloning or to deploy updates:
#   bash deploy.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "==> Pulling latest code..."
git pull

echo "==> Installing Python dependencies..."
python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt

echo "==> Building frontend..."
cd frontend
npm install --silent
npm run build
cd ..

echo "==> Restarting service..."
sudo systemctl daemon-reload
sudo systemctl enable zerodha
sudo systemctl restart zerodha

echo ""
echo "Done. Check status with: sudo systemctl status zerodha"
echo "Logs: sudo journalctl -u zerodha -f"
