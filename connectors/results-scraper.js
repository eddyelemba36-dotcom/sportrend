#!/usr/bin/env node
/**
 * Results scraper — BetExplorer multi-sports + ESPN finished
 */
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const { createClient } = require("redis");
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const https = require("https");
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
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${ep.slug}/scoreboard`);
      const events = data.events || [];
      for (const event of events) {
        const comp = event.competitions ? event.competitions[0] : null;
        if (!comp || !comp.competitors || comp.competitors.length < 2) continue;
        const state = (comp.status||{}).type||{};
        if (state.state !== "post" && state.completed !== true) continue;
        
        const home = comp.competitors.find(c => c.homeAway === "home");
        const away = comp.competitors.find(c => c.homeAway === "away");
        if (!home || !away) continue;

        const id = "match:result_espn_" + event.id;
        const homeName = (home.team ? home.team.displayName : "") || (home.athlete ? home.athlete.displayName : "");
        const awayName = (away.team ? away.team.displayName : "") || (away.athlete ? away.athlete.displayName : "");
        
        await r.hSet(id, "id", id.replace("match:", ""));
        await r.hSet(id, "homeTeam", homeName);
        await r.hSet(id, "awayTeam", awayName);
        await r.hSet(id, "homeScore", home.score || "0");
        await r.hSet(id, "awayScore", away.score || "0");
        await r.hSet(id, "competition", ep.sport + (comp.altGameNote ? " - " + comp.altGameNote : ""));
        await r.hSet(id, "status", "finished");
        await r.hSet(id, "source", "results");
        await r.hSet(id, "updatedAt", new Date().toISOString());
        await r.sAdd("matches:results", id);
        await r.expire(id, 7200);
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

        const results = await page.evaluate(() => {
          const r = [];
          const tables = document.querySelectorAll("table.table-main");
          for (const table of tables) {
            const tourneyEl = table.querySelector("tr.js-tournament .table-main__tournament");
            let competition = tourneyEl ? tourneyEl.textContent.trim() : "";
            const rows = table.querySelectorAll("tr[data-dt]");
            for (const row of rows) {
              const ttCell = row.querySelector("td.table-main__tt");
              const resCell = row.querySelector("td.table-main__result");
              if (!ttCell || !resCell) continue;
              const link = ttCell.querySelector("a");
              const teamsText = link ? link.textContent.trim() : "";
              if (!teamsText.includes(" - ")) continue;
              const parts = teamsText.split(" - ");
              if (parts.length < 2) continue;
              
              const resultText = resCell.textContent.trim();
              const scores = resultText.match(/(\d+)\s*:\s*(\d+)/);
              
              r.push({
                home: parts[0].replace(/\*\*/g,"").trim(),
                away: parts[1].replace(/\*\*/g,"").trim(),
                homeScore: scores ? scores[1] : "",
                awayScore: scores ? scores[2] : "",
                competition
              });
            }
          }
          return r;
        });

        if (results.length > 0) {
          for (const m of results) {
            const id = "match:result_be_" + sportCfg.name.slice(0,4) + "_" + m.home.replace(/[^a-z0-9]/gi,"_").slice(0,15) + "_" + m.away.replace(/[^a-z0-9]/gi,"_").slice(0,15);
            await r.hSet(id, "id", id.replace("match:",""));
            await r.hSet(id, "homeTeam", m.home);
            await r.hSet(id, "awayTeam", m.away);
            await r.hSet(id, "homeScore", m.homeScore);
            await r.hSet(id, "awayScore", m.awayScore);
            await r.hSet(id, "competition", m.competition.replace(/\s*1\s*X\s*2$/,"").trim() || sportCfg.name);
            await r.hSet(id, "status", "finished");
            await r.hSet(id, "source", "results");
            await r.hSet(id, "updatedAt", new Date().toISOString());
            await r.sAdd("matches:results", id);
            await r.expire(id, 7200);
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
  // Clean old results
  const r = await getRedis();
  const oldKeys = await r.sMembers("matches:results");
  for (const k of oldKeys) { await r.del(k); }
  await r.del("matches:results");

  const be = await scrapeBetExplorerResults();
  const espn = await scrapeESPNResults();

  const total = await r.scard("matches:results");
  log("Total results stored: " + total);
  return total;
}

module.exports = { scrapeAllResults };

if (require.main === module) {
  (async () => {
    const n = await scrapeAllResults();
    console.log(n + " results saved");
    process.exit(0);
  })();
}
