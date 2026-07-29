#!/bin/bash
set -e
cd /var/www/odds-aggregator/connectors

# Kill existing
kill -9 $(ps aux | grep "node scraper" | grep -v grep | awk "{print $2}") 2>/dev/null || true
kill -9 $(lsof -ti :3000) 2>/dev/null || true
sleep 1

# Truncate logs
> /var/log/odds-scraper.log 2>/dev/null || true
> /var/log/odds-api.log 2>/dev/null || true

# Start background processes properly
setsid node scraper.js </dev/null >> /var/log/odds-scraper.log 2>&1 &
echo "Scraper started PID=$!"

setsid node api-server.js </dev/null >> /var/log/odds-api.log 2>&1 &
echo "API server started PID=$!"

sleep 4

# Test
echo "=== Health Check ==="
curl -s http://localhost:3000/api/v1/health && echo ""
curl -s -o /dev/null -w "Dashboard: HTTP %{http_code}" http://localhost:3000/ && echo ""
