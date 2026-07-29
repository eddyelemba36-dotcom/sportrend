# Odds Aggregator

Plateforme d'agrégation de données sportives en temps réel. Architecture microservices modulaire avec connecteurs interchangeables.

## Architecture

Gateway (port 3000) + 5 services microservices + connecteurs (1xBet)

## Stack
- Node.js 20 + TypeScript + NestJS
- PostgreSQL 16, Redis 7, RabbitMQ 4
- Docker Compose
- WebSocket (Socket.io)

## Installation

```bash
# 1. Demarrer l infra
cd /var/www/odds-aggregator
docker compose up -d

# 2. Installer les dep
cd shared && npm install && npm run build
cd ../connectors && npm install
cd ../gateway && npm install
cd ../services/live && npm install
cd ../services/odds && npm install
cd ../services/match-events && npm install
cd ../services/statistics && npm install
cd ../services/settlement && npm install
```

## Connecteur 1xBet

Le connecteur 1xBet utilise :
- Puppeteer stealth pour le handshake Cloudflare
- Sessions HTTP avec rotation User-Agent mobile
- Parsing des flux JSON-RPC (codage win1251)
- Auto-reconnection
- Polling live toutes les 5 secondes

## API REST

GET /api/v1/health
GET /api/v1/matches
GET /api/v1/matches/:id
GET /api/v1/matches/:id/odds
GET /api/v1/matches/:id/events
GET /api/v1/matches/:id/statistics
GET /api/v1/competitions
GET /api/v1/competitions/:id/matches
GET /api/v1/live/now
GET /api/v1/results

## WebSocket (port 3000/ws)

Evenements: match:update, odds:update, live:event, statistics:update
