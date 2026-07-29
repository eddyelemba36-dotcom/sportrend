#!/bin/bash
# Watchdog: restart scraper if dead or no matches for 2+ minutes
cd /var/www/odds-aggregator/connectors
if ! pgrep -f "node scraper" > /dev/null; then
  echo "[$(date)] Scraper dead, restarting" >> /var/log/watchdog.log
  nohup node scraper.js >> /var/log/odds-scraper.log 2>&1 &
  exit 0
fi
# Check if scraper isstuck (no matches for >3min)
count=$(redis-cli KEYS "match:*" 2>/dev/null | wc -l)
if [ "$count" -lt 3 ]; then
  age=$(curl -s http://localhost:3000/api/v1/health | grep -o "timestamp\":\"[^\"]*" | cut -d\" -f2)
  if [ -n "$age" ]; then
    now=$(date +%s)
    ts=$(date -d "$age" +%s 2>/dev/null)
    if [ -n "$ts" ] && [ $((now - ts)) -gt 120 ]; then
      echo "[$(date)] Stale data ($count matches, age $((now - ts))s), restarting scraper" >> /var/log/watchdog.log
      pkill -f "node scraper"
      sleep 2
      nohup node scraper.js >> /var/log/odds-scraper.log 2>&1 &
    fi
  fi
fi
