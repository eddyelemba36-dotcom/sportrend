#!/usr/bin/env bash
set -e

CMD="cd /var/www/odds-aggregator/connectors && node scraper.js"
LOG="/var/log/odds-scraper.log"

case "$1" in
  start)
    pkill -f "node scraper.js" 2>/dev/null || true
    sleep 1
    nohup bash -c "$CMD" >> "$LOG" 2>&1 &
    echo "Scraper started (PID: $!)"
    ;;
  stop)
    pkill -f "node scraper.js" 2>/dev/null || true
    sleep 1
    pkill -f "node scraper.js" 2>/dev/null || true
    echo "Scraper stopped"
    ;;
  restart)
    $0 stop
    sleep 1
    $0 start
    ;;
  status)
    if pgrep -f "node scraper.js" > /dev/null 2>&1; then
      echo "Scraper is RUNNING (PID: $(pgrep -f node scraper.js))"
      tail -5 "$LOG" 2>/dev/null || echo "No logs yet"
    else
      echo "Scraper is STOPPED"
    fi
    ;;
  logs)
    tail -50 "$LOG"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
