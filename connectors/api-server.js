#!/usr/bin/env node
/**
 * Odds Aggregator — API Server v2.0
 * REST + WebSocket + API Key auth + PostgreSQL history
 */
const http = require("http");
const fs = require("fs");
const { createClient } = require("redis");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PG_URL = process.env.PG_URL || "postgresql://odds_user:odds_pass@localhost:5432/odds_aggregator";
const PORT = parseInt(process.env.PORT || "3000");
const API_PATH = "/api/v1";
const LANDING_PAGE = __dirname + "/index.html";

let redis = null;
let pg = null;
let dataBackup = {matches:[]};
try { if (require("fs").existsSync(__dirname + "/data-backup.json")) { dataBackup = JSON.parse(require("fs").readFileSync(__dirname + "/data-backup.json", "utf8")); console.log("[Backup] Loaded", dataBackup.matches.length, "matches from backup"); } } catch(e) {}
async function getRedis() {
  if (!redis || !redis.isOpen) {
    redis = createClient({ url: REDIS_URL });
    redis.on("error", (e) => console.error("[Redis] " + e.message));
    await redis.connect();
  }
  return redis;
}

async function getPG() {
  if (!pg) {
    pg = new Pool({ connectionString: PG_URL, max: 10 });
    await pg.query("SELECT 1");
  }
  return pg;
}

async function getAllMatches() {
  const r = await getRedis();
  const keys = await r.keys("match:*");
  const matchKeys = keys.filter(k => k.startsWith("match:"));
  const matches = [];
  for (const key of matchKeys) {
    const data = await r.hGetAll(key);
    if (data.id) { matches.push(computeLiveOdds(data)); }
  }
  // Fallback to backup if Redis has fewer than 10 matches
  if (matches.length < 10 && dataBackup && dataBackup.matches && dataBackup.matches.length > 0) {
    console.log("[Fallback] Redis has " + matches.length + " matches, serving " + dataBackup.matches.length + " from backup");
    return dataBackup.matches;
  }
  return matches;
}

async function getMatch(id) {
  const r = await getRedis();
  if (!(await r.exists("match:" + id))) return null;
  var d = await r.hGetAll("match:" + id);
  return d.id ? computeLiveOdds(d) : d;
}

function getSportFromMatch(m) {
  const c = (m.competition||"").toLowerCase();
  if (c.includes("nfl")) return "NFL";
  if (c.includes("mlb")) return "MLB";
  if (c.includes("nhl")) return "NHL";
  if (c.includes("nba")) return "NBA";
  if (c.includes("wnba")) return "WNBA";
  if (c.includes("ufc")||c.includes("mma")) return "UFC";
  if (c.includes("pga")||c.includes("golf")) return "PGA";
  if (c.includes("atp")) return "ATP";
  if (c.includes("wta")) return "WTA";
  return "Football";
}


// Live odds engine — adjusts odds based on match state (score + estimated minute)
function computeLiveOdds(match) {
  if (match.status !== "live") return match;
  
  var hScore = parseInt(match.homeScore) || 0;
  var aScore = parseInt(match.awayScore) || 0;
  
  var base1 = parseFloat(match.odds1) || 2.0;
  var baseX = parseFloat(match.oddsX) || 3.5;
  var base2 = parseFloat(match.odds2) || 2.0;
  
  var updated = match.updatedAt ? new Date(match.updatedAt).getTime() : Date.now();
  var elapsed = (Date.now() - updated) / 60000;
  var minute = Math.min(Math.max(Math.round(elapsed * 1.5 + 15), 1), 90);
  
  var scoreDiff = hScore - aScore;
  var totalGoals = hScore + aScore;
  
  var pHome = base1 > 0 ? 1 / base1 : 0.45;
  var pDraw = baseX > 0 ? 1 / baseX : 0.25;
  var pAway = base2 > 0 ? 1 / base2 : 0.30;
  var total = pHome + pDraw + pAway;
  if (total > 0) { pHome /= total; pDraw /= total; pAway /= total; }
  
  var shift = scoreDiff * 0.15;
  var timeFactor = minute / 90;
  var comebackFactor = 1 - timeFactor * 0.6;
  
  if (scoreDiff > 0) {
    pHome = Math.min(0.95, pHome + shift * comebackFactor);
    pAway = Math.max(0.01, pAway - shift * comebackFactor);
    pDraw = Math.max(0.01, pDraw * (1 - 0.1 * Math.abs(scoreDiff)));
  } else if (scoreDiff < 0) {
    pAway = Math.min(0.95, pAway - shift * comebackFactor);
    pHome = Math.max(0.01, pHome + shift * comebackFactor);
    pDraw = Math.max(0.01, pDraw * (1 - 0.1 * Math.abs(scoreDiff)));
  }
  
  if (scoreDiff === 0 && totalGoals > 0 && minute > 70) {
    pDraw = pDraw * (1 - (minute - 70) / 100);
  }
  
  var vig = 1.07;
  var sum = pHome + pDraw + pAway;
  if (sum > 0) {
    pHome = (pHome / sum) / vig;
    pDraw = (pDraw / sum) / vig;
    pAway = (pAway / sum) / vig;
  }
  
  var toOdds = function(p) { return p > 0 ? Math.round((1 / p) * 100) / 100 : null; };
  
  match.odds1 = toOdds(pHome);
  match.oddsX = toOdds(pDraw);
  match.odds2 = toOdds(pAway);
  match.liveMinute = minute;
  match.liveScoreAdjusted = true;
  
  return match;
}
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  });
  res.end(JSON.stringify(data));
}

function serveHTML(res, html, status) {
  res.writeHead(status || 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(html);
}

// API Key validation
async function validateKey(req) {
  const key = req.headers["x-api-key"];
  if (!key) return { valid: false, reason: "Missing X-API-Key header" };
  try {
    const p = await getPG();
    const result = await p.query(
      "UPDATE api_keys SET used_today = used_today + 1, last_used = CURRENT_DATE WHERE key = $1 AND active = true AND used_today < daily_limit AND (last_used < CURRENT_DATE OR used_today < daily_limit) RETURNING id, name, daily_limit, used_today",
      [key]
    );
    if (result.rows.length === 0) {
      const exists = await p.query("SELECT active, used_today, daily_limit, last_used FROM api_keys WHERE key = $1", [key]);
      if (exists.rows.length === 0) return { valid: false, reason: "Invalid API key" };
      if (!exists.rows[0].active) return { valid: false, reason: "API key disabled" };
      if (exists.rows[0].daily_limit && exists.rows[0].used_today >= exists.rows[0].daily_limit && exists.rows[0].last_used >= CURRENT_DATE) {
        return { valid: false, reason: "Daily limit reached (" + exists.rows[0].daily_limit + ")" };
      }
    }
    return { valid: true, client: result.rows[0] };
  } catch(e) {
    // Fallback: allow without PG
    return { valid: key === "demo_key_001", reason: "Auth unavailable: " + e.message };
  }
}

// Save match to history (async, non-blocking)
async function saveToHistory(matches) {
  try {
    const p = await getPG();
    const values = [];
    const params = [];
    let idx = 1;
    for (const m of matches.slice(0, 20)) {
      values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9})`);
      params.push(m.id, m.homeTeam||"", m.awayTeam||"", m.homeScore||"", m.awayScore||"", m.competition||"", m.odds1||"", m.oddsX||"", m.odds2||"", m.source||"");
      idx += 10;
    }
    if (values.length > 0) {
      await p.query(`INSERT INTO match_history (match_id, home_team, away_team, home_score, away_score, competition, odds1, oddsX, odds2, source) VALUES ${values.join(",")}`, params);
    }
  } catch(e) {
    console.error("[PG] History save error:", e.message.slice(0, 80));
  }
}

function generateDocs() {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Odds Aggregator - API v2</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0e17;color:#e0e6f0;padding:0}
.doc{max-width:900px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:24px;margin-bottom:8px;color:#00d4ff}
h2{font-size:18px;margin:32px 0 12px;color:#fff;border-bottom:1px solid #1e2a45;padding-bottom:8px}
h3{font-size:14px;margin:20px 0 8px;color:#8892a6}
p,li{font-size:13px;line-height:1.6;color:#8892a6}
code{background:#1c2844;padding:2px 6px;border-radius:4px;font-size:12px;color:#4fc3f7}
pre{background:#131a2b;border:1px solid #1e2a45;border-radius:8px;padding:12px;overflow-x:auto;font-size:12px;color:#e0e6f0;margin:8px 0}
.method{display:inline-block;padding:3px 8px;border-radius:4px;font-weight:600;font-size:11px;margin-right:6px}
.get{background:#1a3a5c;color:#4fc3f7}
table{border-collapse:collapse;margin:8px 0;font-size:12px}
th,td{text-align:left;padding:6px 10px;border:1px solid #1e2a45}
th{background:#1c2844;color:#8892a6;font-weight:600}
td{color:#e0e6f0}
.badge{display:inline-block;background:#00e676;color:#000;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
</style>
</head>
<body><div class="doc">
<h1>⚡ Odds Aggregator — API v2</h1>
<p>API REST + WebSocket temps réel. Multi-sports, multi-sources.
<span class="badge">B2B Ready</span></p>

<h2>🔑 Authentification</h2>
<p>Ajouter le header <code>X-API-Key: votre_cle</code> à chaque requête.</p>
<p>Clé de test: <code>demo_key_001</code></p>
<pre>
curl -H "X-API-Key: demo_key_001" \\
  https://VOTRE-SERVEUR/api/v1/matches
</pre>

<h2>📡 REST Endpoints</h2>

<p><span class="method get">GET</span><span class="url">/api/v1/health</span></p>
<p><span class="method get">GET</span><span class="url">/api/v1/info</span> — Stats provider, versions</p>
<p><span class="method get">GET</span><span class="url">/api/v1/matches</span> — Tous les matchs</p>
<p><span class="method get">GET</span><span class="url">/api/v1/matches?source=espn</span> — Filtrer par source</p>
<p><span class="method get">GET</span><span class="url">/api/v1/matches/{id}</span> — Détail d'un match</p>
<p><span class="method get">GET</span><span class="url">/api/v1/matches/{id}/odds</span> — Cotes 1X2</p>
<p><span class="method get">GET</span><span class="url">/api/v1/competitions</span> — Compétitions</p>
<p><span class="method get">GET</span><span class="url">/api/v1/competitions/{id}/matches</span> — Matchs d'une compétition</p>
<p><span class="method get">GET</span><span class="url">/api/v1/live/now</span> — En direct</p>
<p><span class="method get">GET</span><span class="url">/api/v1/history?source=espn&limit=50</span> — Historique PostgreSQL</p>

<h2>🔌 WebSocket</h2>
<p><span class="url">ws://VOTRE-SERVEUR/ws?key=demo_key_001</span></p>
<p>Connectez-vous avec la clef en paramètre query. Réception des données en temps réel au format JSON :</p>
<pre>{
  "type": "update",
  "source": "espn",
  "sport": "NFL",
  "timestamp": "2026-06-29T...",
  "matches": [...]
}</pre>
<p>Types d'événements : <code>update</code> (nouvelles données scrappées), <code>heartbeat</code> (toutes les 15s)</p>

<h2>📊 Sources de données</h2>
<table>
<tr><th>Source</th><th>Sports</th><th>Cotes</th><th>Fréquence</th></tr>
<tr><td>ESPN API</td><td>Foot, NFL, MLB, NHL, NBA, WNBA</td><td>DraftKings ✅</td><td>30s</td></tr>
<tr><td>BetExplorer</td><td>Foot, Basket, Hockey, Tennis, Baseball, Volley, Handball</td><td>1X2 ✅</td><td>30s</td></tr>
<tr><td>Flashscore</td><td>Football</td><td>— (scores)</td><td>60s</td></tr>
<tr><td>Unibet</td><td>Tennis</td><td>— (scores)</td><td>150s</td></tr>
</table>

<h2>📦 Exemple intégration WebSocket</h2>
<pre>
const ws = new WebSocket("wss://VOTRE-SERVEUR/ws?key=demo_key_001");
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "update") {
    console.log(data.matches.length + " matchs mis à jour");
    data.matches.forEach(m => {
      console.log(m.homeTeam, m.odds1, m.oddsX, m.odds2);
    });
  }
};
</pre>
</div></body></html>`;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    });
    return res.end();
  }
  if (req.method !== "GET") return json(res, 405, { success: false, error: "Method not allowed" });

  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const params = Object.fromEntries(url.searchParams);
  const p = path.replace(/^\/api\/v1/, "") || "/";

  // Public routes (no key needed)
  if (path === "/") {
    try { return serveHTML(res, fs.readFileSync(LANDING_PAGE, "utf8")); }
    catch(e) { return json(res, 500, { success: false, error: "Landing page not found" }); }
  }
  if (path === "/dashboard") {
    try { return serveHTML(res, fs.readFileSync(__dirname + "/dashboard.html", "utf8")); }
    catch(e) { return json(res, 500, { success: false, error: "Dashboard not found" }); }
  }
  if (path === "/radar" || path === "/live") {
    try { return serveHTML(res, fs.readFileSync(__dirname + "/radar.html", "utf8")); }
    catch(e) { return json(res, 500, { success: false, error: "Radar not found" }); }
  }

  // Favicon
  if (path === "/favicon.ico") {
    res.writeHead(200, { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400" });
    return res.end(Buffer.from([0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
  }

  if (path === "/docs" || path === "/api/v1/docs") return serveHTML(res, generateDocs());

  // Routes with optional key
  if (p === "/health") {
    const matches = await getAllMatches();
    const sources = [...new Set(matches.map(m => m.source).filter(Boolean))];
    return json(res, 200, { success: true, data: { status: "ok", timestamp: new Date().toISOString(), matchesInRedis: matches.length, sources, authRequired: true } });
  }

  // All other API routes require key
  if (!req.headers["x-api-key"] && !params.key) return json(res, 401, { success: false, error: "API key required. Use X-API-Key header or ?key= parameter. Demo: demo_key_001" });

  const auth = await validateKey(req);
  if (!auth.valid) return json(res, 401, { success: false, error: auth.reason });

  try {
    // /api/v1/info
    if (p === "/info") {
      const matches = await getAllMatches();
      const bySource = {}; const bySport = {}; const byStatus = {};
      matches.forEach(m => {
        bySource[m.source] = (bySource[m.source]||0) + 1;
        const sport = getSportFromMatch(m);
        bySport[sport] = (bySport[sport]||0) + 1;
        byStatus[m.status||"unknown"] = (byStatus[m.status||"unknown"]||0) + 1;
      });
      return json(res, 200, { success: true, data: {
        provider: "Odds Aggregator", version: "2.0.0",
        client: auth.client ? auth.client.name : "Demo",
        timestamp: new Date().toISOString(),
        totalMatches: matches.length,
        matchesBySource: bySource, matchesBySport: bySport, matchesByStatus: byStatus,
        endpoints: { all_matches: API_PATH+"/matches", by_source: API_PATH+"/matches?source={espn}",
          by_id: API_PATH+"/matches/{id}", odds: API_PATH+"/matches/{id}/odds",
          competitions: API_PATH+"/competitions", live: API_PATH+"/live/now",
          history: API_PATH+"/history", docs_html: "/docs", dashboard: "/", websocket: "/ws?key=..." },
        cache: { type: "Redis", ttl: "3600s" }, refreshRate: "30 seconds"
      }});
    }

    // /api/v1/competitions
    if (p === "/competitions") {
      const matches = await getAllMatches();
      const compSet = new Set();
      matches.forEach(m => { if (m.competition) compSet.add(m.competition); });
      return json(res, 200, { success: true, data: [...compSet].map(c => ({ name: c, id: c.replace(/[^a-z0-9]/gi, "_").toLowerCase() }) ) });
    }

    // /api/v1/competitions/:id/matches
    const compMatch = p.match(/^\/competitions\/([^\/]+)\/matches$/);
    if (compMatch) {
      const matches = await getAllMatches();
      const filtered = matches.filter(m => (m.competition||"").replace(/[^a-z0-9]/gi, "_").toLowerCase() === compMatch[1]);
      return json(res, 200, { success: true, data: filtered, count: filtered.length });
    }

    // /api/v1/live/now
    if (p === "/live/now") {
      const matches = await getAllMatches();
      return json(res, 200, { success: true, data: matches.filter(m => m.homeScore || m.awayScore) });
    }

    // /api/v1/matches/:id/odds
    const oddsMatch = p.match(/^\/matches\/([^\/]+)\/odds$/);
    if (oddsMatch) {
      const m = await getMatch(oddsMatch[1]);
      if (!m) return json(res, 404, { success: false, error: "Match not found" });
      return json(res, 200, { success: true, data: { 1: m.odds1 || null, X: m.oddsX || null, 2: m.odds2 || null } });
    }

    // /api/v1/matches/:id/markets
    const marketsMatch = p.match(/^\/matches\/([^\/]+)\/markets$/);
    if (marketsMatch) {
      const m = await getMatch(marketsMatch[1]);
      if (!m) return json(res, 404, { success: false, error: "Match not found" });
      // Use Poisson-based odds engine to generate ALL markets
      const oddsEngine = require("./odds-engine.js");
      const allMarkets = oddsEngine.generateAllMarkets(
        m.odds1, m.oddsX, m.odds2,
        { home: { line: m.spread_home_line, odds: m.spread_home_odds }, away: { line: m.spread_away_line, odds: m.spread_away_odds } },
        { over: { line: m.over_line, odds: m.over_odds }, under: { line: m.under_line, odds: m.under_odds } },
        m.homeTeam, m.awayTeam
      );
      return json(res, 200, { success: true, data: {
        moneyline: { home: m.odds1 || null, away: m.odds2 || null, draw: m.oddsX || null },
        spread: { home: { line: m.spread_home_line || null, odds: m.spread_home_odds || null }, away: { line: m.spread_away_line || null, odds: m.spread_away_odds || null } },
        total: { over: { line: m.over_line || null, odds: m.over_odds || null }, under: { line: m.under_line || null, odds: m.under_odds || null } },
        all: allMarkets
      }});
    }

    // /api/v1/matches/:id
    const singleMatch = p.match(/^\/matches\/([^\/]+)$/);
    if (singleMatch) {
      const m = await getMatch(singleMatch[1]);
      if (!m) return json(res, 404, { success: false, error: "Match not found" });
      return json(res, 200, { success: true, data: m });
    }

    // /api/v1/matches
    if (p === "/matches") {
      const all = await getAllMatches();
      return json(res, 200, { success: true, data: params.source ? all.filter(m => m.source === params.source) : all, count: params.source ? all.filter(m => m.source === params.source).length : all.length });
    }

    // /api/v1/history
    if (p === "/history") {
      const pdb = await getPG();
      const limit = Math.min(parseInt(params.limit) || 50, 500);
      const sourceFilter = params.source ? "WHERE source = $1" : "";
      const sourceParam = params.source ? [params.source, limit] : [limit];
      const resDB = await pdb.query(`SELECT match_id, home_team, away_team, home_score, away_score, competition, odds1, oddsX, odds2, status, source, fetched_at FROM match_history ${sourceFilter} ORDER BY fetched_at DESC LIMIT $${params.source ? 2 : 1}`, sourceParam);
      return json(res, 200, { success: true, data: resDB.rows, count: resDB.rows.length });
    }

    // /api/v1/results
    if (p === "/results") {
      const r = await getRedis();
      const keys = await r.sMembers("matches:results");
      const results = [];
      for (const k of keys) {
        const data = await r.hGetAll(k);
        if (data.id && data.homeScore) results.push(data);
      }
      const sorted = results.sort((a,b) => (b.updatedAt||"").localeCompare(a.updatedAt||""));
      return json(res, 200, { success: true, data: params.limit ? sorted.slice(0, parseInt(params.limit) || 50) : sorted.slice(0, 50), count: sorted.length });
    }

    // Serve favicon (duplicate removed)
    return json(res, 404, { success: false, error: "Route not found" });
  } catch (e) {
    console.error("[ERROR]", e.message);
    return json(res, 500, { success: false, error: e.message });
  }
});

// WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });
let wsClients = new Map(); // id -> { ws, key, client }

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const key = url.searchParams.get("key");
  
  if (!key) { ws.send(JSON.stringify({ type: "error", message: "API key required as ?key= parameter" })); ws.close(); return; }

  // Validate key
  const auth = await validateKey({ headers: { "x-api-key": key } });
  if (!auth.valid) { ws.send(JSON.stringify({ type: "error", message: auth.reason })); ws.close(); return; }

  const clientId = Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  wsClients.set(clientId, { ws, key, client: auth.client });
  console.log("[WS] Client connected:", auth.client.name, "(" + wsClients.size + " total)");

  ws.send(JSON.stringify({ type: "connected", clientId, message: "Bienvenue " + auth.client.name }));

  // Send initial data
  try {
    const matches = await getAllMatches();
    ws.send(JSON.stringify({ type: "initial", timestamp: new Date().toISOString(), matchCount: matches.length, matches }));
  } catch(e) {}

  ws.on("close", () => { wsClients.delete(clientId); console.log("[WS] Client disconnected (" + wsClients.size + " remain)"); });
  ws.on("error", () => wsClients.delete(clientId));
});

// Broadcast updates to all WS clients
async function broadcastUpdate(source, matches) {
  const msg = JSON.stringify({
    type: "update",
    source,
    timestamp: new Date().toISOString(),
    matches
  });
  let count = 0;
  for (const [id, client] of wsClients) {
    try {
      client.ws.send(msg);
      count++;
    } catch(e) { wsClients.delete(id); }
  }
  if (count > 0) console.log("[WS] Broadcast to " + count + " clients: " + matches.length + " matchs from " + source);
}

// Heartbeat every 15s
setInterval(() => {
  const hb = JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString(), clients: wsClients.size });
  for (const [id, client] of wsClients) {
    try { client.ws.send(hb); }
    catch(e) { wsClients.delete(id); }
  }
}, 15000);

// History saver — dump to PG every 5 minutes
setInterval(async () => {
  try {
    const matches = await getAllMatches();
    await saveToHistory(matches);
  } catch(e) {}
}, 300000);

// Auto-backup to file every 60s
setInterval(async () => {
  try {
    const matches = await getAllMatches();
    if (matches.length > 10) {
      require("fs").writeFileSync(__dirname + "/data-backup.json", JSON.stringify({ ts: Date.now(), matches }));
      console.log("[Backup] Saved " + matches.length + " matches to disk");
    } else {
      console.warn("[Backup] SKIP: only " + matches.length + " matches in Redis — would corrupt backup");
    }
  } catch(e) { console.error("[Backup] ERROR:", e.message); }
}, 60000);

// Watchdog: reload backup if Redis is empty
setInterval(async () => {
  try {
    const r = await getRedis();
    const count = (await r.keys("match:*")).length;
    if (count < 10 && dataBackup && dataBackup.matches && dataBackup.matches.length > 10) {
      console.warn("[WATCHDOG] Only " + count + " matches in Redis! Restoring " + dataBackup.matches.length + " from backup...");
      for (const m of dataBackup.matches) {
        const key = "match:" + m.id;
        await r.del(key);
        for (const [k, v] of Object.entries(m)) {
          if (v !== null && v !== undefined) await r.hSet(key, k, String(v));
        }
        // TTL: 24h for upcoming, 1h for finished, 6h for live
        const ttl = m.status === "finished" ? 3600 : (m.status === "live" ? 21600 : 86400);
        await r.expire(key, ttl);
      }
      console.log("[WATCHDOG] Restored " + dataBackup.matches.length + " matches to Redis");
    }
  } catch(e) { console.error("[WATCHDOG] ERROR:", e.message); }
}, 120000);
server.listen(PORT, () => {
  console.log("[API Server v2.0] HTTP + WS on port " + PORT);
  console.log("[API Server] Dashboard: http://localhost:" + PORT + "/");
  console.log("[API Server] API: http://localhost:" + PORT + "/api/v1/health");
  console.log("[API Server] WS: ws://localhost:" + PORT + "/ws?key=...");
  console.log("[API Server] Docs: http://localhost:" + PORT + "/docs");
});

// Expose for the scraper to broadcast updates
module.exports = { broadcastUpdate };
