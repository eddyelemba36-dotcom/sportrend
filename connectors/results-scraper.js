#!/usr/bin/env node
/**
 * Results scraper — BetExplorer multi-sports + ESPN finished
 */
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const { createClient } = require("redis");
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const https = require("https");
const { normalizeMatchMetadata } = require("./match-normalizer");
const { registerResultCandidate } = require("./result-consensus");
const { extractESPNResultDetails } = require("./espn-result-details");
puppeteer.use(StealthPlugin());

let redis = null;

function log(m) { console.log("["+new Date().toLocaleTimeString("fr-FR",{hour12:false})+"] [RESULTS] "+m); }

async function getRedis() {
  if (!redis || !redis.isOpen) {
    redis = createClient({ url: REDIS_URL });
    redis.on("error",e=>log("Redis: "+e.message));
    await redis.connect();
  }
  return redis;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        try { resolve(JSON.parse(data)); } catch(e) { reject(new Error("Parse: "+e.message)); }
      });
    }).on("error", reject).on("timeout", function() { this.destroy(); reject(new Error("Timeout")); });
  });
}

// ESPN results — for finished matches
async function scrapeESPNResults() {
  const endpoints = [
    { slug: "soccer/all", sport: "Football" },
    { slug: "football/nfl", sport: "NFL" },
    { slug: "baseball/mlb", sport: "MLB" },
    { slug: "hockey/nhl", sport: "NHL" },
    { slug: "basketball/nba", sport: "NBA" },
    { slug: "basketball/wnba", sport: "WNBA" },
  ];

  const r = await getRedis();
  let total = 0;

  for (const ep of endpoints) {
    try {
      // Use ?dates= parameter to get past dates
      const dates = Array.from({ length: 4 }, (_, offset) => {
        const d = new Date(Date.now() - offset * 86400000);
        return d.toISOString().slice(0, 10).replace(/-/g, "");
      });
      const events = [];
      for (const date of dates) {
        const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${ep.slug}/scoreboard?dates=${date}&limit=1000`);
        events.push(...(data.events || []));
      }
      const seenEvents = new Set();
      for (const event of events) {
        if (!event || seenEvents.has(event.id)) continue;
        seenEvents.add(event.id);
        const comp = event.competitions ? event.competitions[0] : null;
        if (!comp || !comp.competitors || comp.competitors.length < 2) continue;
        const state = (comp.status||{}).type||{};
        if (state.state !== "post" && state.completed !== true) continue;
        
        const home = comp.competitors.find(c => c.homeAway === "home");
        const away = comp.competitors.find(c => c.homeAway === "away");
        if (!home || !away) continue;

        const id = "match:result_espn_" + event.id;
        const metadata = normalizeMatchMetadata({
          sport: ep.sport,
          competition: ep.sport + (comp.altGameNote ? " - " + comp.altGameNote : ""),
          startTime: event.date || comp.date || ""
        });
        const details = extractESPNResultDetails(comp, home, away);
        const homeName = (home.team ? home.team.displayName : "") || (home.athlete ? home.athlete.displayName : "");
        const awayName = (away.team ? away.team.displayName : "") || (away.athlete ? away.athlete.displayName : "");
        
        await r.hSet(id, "id", id.replace("match:", ""));
        await r.hSet(id, "homeTeam", homeName);
        await r.hSet(id, "awayTeam", awayName);
        await r.hSet(id, "homeScore", home.score || "0");
        await r.hSet(id, "awayScore", away.score || "0");
        await r.hSet(id, "competition", ep.sport + (comp.altGameNote ? " - " + comp.altGameNote : ""));
        await r.hSet(id, "sport", ep.sport);
        await r.hSet(id, "country", metadata.country);
        await r.hSet(id, "leagueId", metadata.leagueId);
        await r.hSet(id, "startTime", metadata.startTime);
        await r.hSet(id, "date", metadata.date);
        await r.hSet(id, "time", metadata.time);
        await r.hSet(id, "status", "finished");
        await r.hSet(id, "source", "results");
        await r.hSet(id, "resultProvider", "espn");
        await r.hSet(id, "detailsStatus", "provisional");
        await r.hSet(id, "events", JSON.stringify(details.events));
        await r.hSet(id, "statistics", JSON.stringify(details.statistics));
        await r.hSet(id, "halfTimeHomeScore", String(details.halfTimeHomeScore ?? ""));
        await r.hSet(id, "halfTimeAwayScore", String(details.halfTimeAwayScore ?? ""));
        await r.hSet(id, "regulationHomeScore", String(details.regulationHomeScore ?? home.score ?? ""));
        await r.hSet(id, "regulationAwayScore", String(details.regulationAwayScore ?? away.score ?? ""));
        await r.hSet(id, "penaltyHomeScore", String(details.penaltyHomeScore ?? ""));
        await r.hSet(id, "penaltyAwayScore", String(details.penaltyAwayScore ?? ""));
        await r.hSet(id, "updatedAt", new Date().toISOString());
        await r.sAdd("matches:results", id);
        await r.expire(id, RESULT_TTL_SECONDS);
        await registerResultCandidate(r, {
          provider: "espn", matchKey: id, sport: metadata.sport,
          homeTeam: homeName, awayTeam: awayName, startTime: metadata.startTime,
          homeScore: details.regulationHomeScore ?? Number.parseInt(home.score, 10),
          awayScore: details.regulationAwayScore ?? Number.parseInt(away.score, 10)
        });
        await reconcileOriginalFixture(r, {
          provider: "espn", resultStatus: "provisional", home: homeName, away: awayName,
          startTime: metadata.startTime,
          homeScore: details.regulationHomeScore ?? Number.parseInt(home.score, 10),
          awayScore: details.regulationAwayScore ?? Number.parseInt(away.score, 10)
        });
        total++;
      }
    } catch(e) {}
  }
  log("ESPN results: " + total);
  return total;
}

// BetExplorer results — ALL sports
const RESULT_SPORTS = [
  { name: "Football", path: "/soccer/results/" },
  { name: "Basketball", path: "/basketball/results/" },
  { name: "Hockey", path: "/hockey/results/" },
  { name: "Tennis", path: "/tennis/results/" },
  { name: "Baseball", path: "/baseball/results/" },
  { name: "Volleyball", path: "/volleyball/results/" },
  { name: "Handball", path: "/handball/results/" },
];

function extractBetExplorerResults() {
  const results = [];
  const tables = document.querySelectorAll("table.table-main");
  for (const table of tables) {
    let competition = "";
    const rows = table.querySelectorAll("tr");
    for (const row of rows) {
      const tournament = row.querySelector(".table-main__tournament");
      if (tournament) {
        competition = tournament.textContent.trim();
        continue;
      }
      if (!row.hasAttribute("data-dt")) continue;
      const ttCell = row.querySelector("td.table-main__tt");
      const resCell = row.querySelector("td.table-main__result");
      if (!ttCell || !resCell) continue;
      const link = ttCell.querySelector("a");
      const teamsText = link ? link.textContent.trim() : "";
      if (!teamsText.includes(" - ")) continue;
      const parts = teamsText.split(" - ");
      if (parts.length < 2) continue;

      const scores = resCell.textContent.trim().match(/(\d+)\s*:\s*(\d+)/);
      if (!scores) continue;
      results.push({
        home: parts[0].replace(/\*\*/g, "").trim(),
        away: parts[1].replace(/\*\*/g, "").trim(),
        homeScore: scores ? scores[1] : "",
        awayScore: scores ? scores[2] : "",
        competition,
        startTime: row.getAttribute("data-dt") || ""
      });
    }
  }
  return results;
}

const RESULT_TTL_SECONDS = 30 * 24 * 60 * 60;

function compactName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\b(fc|afc|cf|sc|fk|ac)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

async function reconcileOriginalFixture(r, result) {
  const targetHome = compactName(result.home);
  const targetAway = compactName(result.away);
  const targetDate = String(result.startTime || "").slice(0, 10);
  if (!targetHome || !targetAway || !targetDate) return 0;
  let reconciled = 0;
  const keys = await r.sMembers("matches:betexplorer");
  for (const key of keys) {
    if (!(await r.exists(key))) { await r.sRem("matches:betexplorer", key); continue; }
    const fixture = await r.hGetAll(key);
    if (String(fixture.startTime || "").slice(0, 10) !== targetDate) continue;
    if (compactName(fixture.homeTeam) !== targetHome || compactName(fixture.awayTeam) !== targetAway) continue;
    await r.hSet(key, {
      status: "finished",
      homeScore: String(result.homeScore),
      awayScore: String(result.awayScore),
      regulationHomeScore: String(result.homeScore),
      regulationAwayScore: String(result.awayScore),
      resultProvider: result.provider || "betexplorer",
      resultStatus: result.resultStatus || "provisional",
      updatedAt: new Date().toISOString()
    });
    await r.sAdd("matches:results", key);
    await r.expire(key, RESULT_TTL_SECONDS);
    reconciled++;
  }
  return reconciled;
}

async function scrapeBetExplorerResults() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const r = await getRedis();
    let total = 0;

    for (const sportCfg of RESULT_SPORTS) {
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
        page.setDefaultNavigationTimeout(15000);
        await page.goto("https://www.betexplorer.com" + sportCfg.path, { waitUntil: "networkidle2", timeout: 15000 });
        await new Promise(r => setTimeout(r, 3000));

        const results = await page.evaluate(extractBetExplorerResults);

        if (results.length > 0) {
          for (const m of results) {
            const metadata = normalizeMatchMetadata({ sport: sportCfg.name, competition: m.competition, startTime: m.startTime });
            const id = "match:result_be_" + sportCfg.name.slice(0,4) + "_" + m.home.replace(/[^a-z0-9]/gi,"_").slice(0,15) + "_" + m.away.replace(/[^a-z0-9]/gi,"_").slice(0,15);
            await r.hSet(id, "id", id.replace("match:",""));
            await r.hSet(id, "homeTeam", m.home);
            await r.hSet(id, "awayTeam", m.away);
            await r.hSet(id, "homeScore", m.homeScore);
            await r.hSet(id, "awayScore", m.awayScore);
            await r.hSet(id, "competition", m.competition.replace(/\s*1\s*X\s*2$/,"").trim() || sportCfg.name);
            await r.hSet(id, "sport", sportCfg.name);
            await r.hSet(id, "country", metadata.country);
            await r.hSet(id, "leagueId", metadata.leagueId);
            await r.hSet(id, "startTime", metadata.startTime);
            await r.hSet(id, "date", metadata.date);
            await r.hSet(id, "time", metadata.time);
            await r.hSet(id, "status", "finished");
            await r.hSet(id, "source", "results");
            await r.hSet(id, "resultProvider", "betexplorer");
            await r.hSet(id, "updatedAt", new Date().toISOString());
            await r.sAdd("matches:results", id);
            await r.expire(id, RESULT_TTL_SECONDS);
            await registerResultCandidate(r, {
              provider: "betexplorer", matchKey: id, sport: metadata.sport,
              homeTeam: m.home, awayTeam: m.away, startTime: metadata.startTime,
              homeScore: Number.parseInt(m.homeScore, 10), awayScore: Number.parseInt(m.awayScore, 10)
            });
            await reconcileOriginalFixture(r, {
              provider: "betexplorer", resultStatus: "provisional", home: m.home, away: m.away,
              startTime: metadata.startTime,
              homeScore: Number.parseInt(m.homeScore, 10), awayScore: Number.parseInt(m.awayScore, 10)
            });
            total++;
          }
          log(sportCfg.name + " results: " + results.length);
        }
        await page.close();
      } catch(e) {
        // Timeout — skip
      }
    }

    log("BetExplorer total results: " + total);
    return total;

  } catch(e) {
    log("Error: " + e.message.slice(0, 100));
    return 0;
  } finally {
    if (browser) try { await browser.close(); } catch(e) {}
  }
}

async function scrapeAllResults() {
  const r = await getRedis();
  const be = await scrapeBetExplorerResults();
  const espn = await scrapeESPNResults();

  // Ne jamais effacer les derniers résultats valides avant une collecte.
  // Les hashes expirent seuls ; on retire seulement les références expirées.
  const resultKeys = await r.sMembers("matches:results");
  for (const key of resultKeys) {
    if (!(await r.exists(key))) await r.sRem("matches:results", key);
  }

  const total = await r.sCard("matches:results");
  log("Total results stored: " + total + " (new: " + (be + espn) + ")");
  return total;
}

module.exports = { scrapeAllResults, extractBetExplorerResults };

if (require.main === module) {
  (async () => {
    const n = await scrapeAllResults();
    console.log(n + " results saved");
    process.exit(0);
  })();
}
