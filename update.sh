#!/bin/bash
set -e

echo "=== BugIO Update ==="

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Rebuild and restart container
echo "Rebuilding and restarting container..."
docker compose up -d --build

# Cleanup old images
echo "Cleaning up old images..."
docker image prune -f

echo "=== Update complete ==="
docker compose ps
