#!/usr/bin/env node
/**
 * Odds Aggregator — Scraper v6
 * - BetExplorer multi-sports (football, basketball, hockey, tennis, baseball, volleyball, handball)
 * - ESPN multi-scores
 * - Flashscore live
 * - Unibet live
 * - WebSocket broadcast
 */
const { scrapeUnibet } = require("./unibet-scraper");
const { scrapeESPN } = require("./espn-api");
const { scrapeFlashscore } = require("./espn-scrapers");
const { scrapeAllResults } = require("./results-scraper");
const { scrapeAll: scrapeBEMulti } = require("./betexp-multi");
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let redis = null;
let running = true;

function log(msg) {
  console.log("[" + new Date().toLocaleTimeString("fr-FR", {hour12: false}) + "] " + msg);
}

async function getRedis() {
  if (!redis || !redis.isOpen) {
    const { createClient } = require("redis");
    redis = createClient({ url: REDIS_URL });
    redis.on("error", (e) => log("Redis error: " + e.message));
    await redis.connect();
  }
  return redis;
}

// Broadcast to WS clients if api-server module available
async function broadcast(source, matches) {
  try {
    const { broadcastUpdate } = require("./api-server");
    if (broadcastUpdate) await broadcastUpdate(source, matches);
  } catch(e) {}
}

// ======= BETEXPLORER — MULTI-SPORTS =======
const BET_SPORTS = [
  { name: "BetExp Football", path: "/football/" },
  { name: "BetExp Basketball", path: "/basketball/" },
  { name: "BetExp Hockey", path: "/hockey/" },
  { name: "BetExp Tennis", path: "/tennis/" },
  { name: "BetExp Baseball", path: "/baseball/" },
  { name: "BetExp Volleyball", path: "/volleyball/" },
  { name: "BetExp Handball", path: "/handball/" },
];

async function scrapeBetExplorer() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    for (const sportCfg of BET_SPORTS) {
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
        page.setDefaultNavigationTimeout(20000);
        await page.goto("https://www.betexplorer.com" + sportCfg.path, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise(r => setTimeout(r, 3000));

        const matches = await page.evaluate(() => {
          const results = [];
          const tables = document.querySelectorAll("table.table-main");
          for (const table of tables) {
            const tourneyEl = table.querySelector("tr.js-tournament .table-main__tournament");
            let competition = tourneyEl ? tourneyEl.textContent.trim() : "";
            const rows = table.querySelectorAll("tr[data-dt]");
            for (const row of rows) {
              const firstCell = row.querySelector("td.h-text-left");
              if (!firstCell) continue;
              const linkEl = firstCell.querySelector("a");
              const teamsText = linkEl ? linkEl.textContent.trim() : "";
              if (!teamsText.includes(" - ")) continue;
              const parts = teamsText.split(" - ");
              if (parts.length < 2) continue;
              const oddsCells = row.querySelectorAll("td.table-main__odds button");
              results.push({
                home: parts[0].trim(), away: parts[1].trim(),
                competition,
                odds1: oddsCells[0] ? oddsCells[0].textContent.trim() : "",
                oddsX: oddsCells[1] ? oddsCells[1].textContent.trim() : "",
                odds2: oddsCells[2] ? oddsCells[2].textContent.trim() : "",
              });
            }
          }
          return results;
        });

        if (matches.length > 0) {
          const r = await getRedis();
          const prefix = "be_" + sportCfg.path.replace(/[\/]/g, "").slice(0,6);
          const oldKeys = await r.sMembers("matches:betexplorer");
          // Don't delete old keys here — we add incrementally
          
          let count = 0;
          for (const m of matches) {
            const id = "match:" + prefix + "_" + m.home.replace(/[^a-z0-9]/gi, "_").slice(0, 18) + "_" + m.away.replace(/[^a-z0-9]/gi, "_").slice(0, 18);
            const comp = m.competition.replace(/\s*1\s*X\s*2$/, "").trim();
            await r.hSet(id, "id", id.replace("match:", ""));
            await r.hSet(id, "homeTeam", m.home);
            await r.hSet(id, "awayTeam", m.away);
            await r.hSet(id, "odds1", m.odds1);
            await r.hSet(id, "oddsX", m.oddsX);
            await r.hSet(id, "odds2", m.odds2);
            await r.hSet(id, "competition", comp);
            await r.hSet(id, "status", "upcoming");
            await r.hSet(id, "source", "betexplorer");
            await r.hSet(id, "updatedAt", new Date().toISOString());
            await r.sAdd("matches:betexplorer", id);
            await r.expire(id, 86400);
            count++;
          }
          log(sportCfg.name + ": " + count + " matchs");
        }
        await page.close();
      } catch(e) {
        log(sportCfg.name + " error: " + e.message.slice(0, 80));
      }
    }

    // Get total and broadcast
    const r = await getRedis();
    const total = await r.scard("matches:betexplorer");
    log("BetExplorer total: " + total + " matchs");
    
  } catch (e) {
    log("BetExplorer error: " + e.message.slice(0, 100));
  } finally {
    if (browser) try { await browser.close(); } catch (e) {}
  }
}

// ======= SOFASCORE =======
async function scrapeSofaScore() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
    page.setDefaultNavigationTimeout(25000);
    await page.goto("https://www.sofascore.com/football", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 3000));
    const matchLinks = await page.evaluate(() => {
      return [...document.querySelectorAll("a")]
        .filter((a) => a.href && a.href.includes("/match/"))
        .map((a) => a.href).slice(0, 5);
    });
    log("SofaScore: " + matchLinks.length + " liens");
  } catch (e) {
    log("SofaScore error: " + e.message.slice(0, 100));
  } finally {
    if (browser) try { await browser.close(); } catch (e) {}
  }
}

// ======= MAIN  =======
async function main() {
  log("=== Scraper v6 — BetExplorer multi-sports + ESPN multi + WebSocket ===");
  let cycle = 0;
  while (running) {
    cycle++;
    log("=== Cycle " + cycle + " ===");
    
    await scrapeBEMulti();
    
    const espnCount = await scrapeESPN();
    if (cycle % 2 === 0) await scrapeFlashscore();
    if (cycle % 3 === 0) await scrapeSofaScore();
    if (cycle % 5 === 0) { await scrapeUnibet(); }
    if (cycle % 10 === 0) await scrapeAllResults();

    // Backup all matches to JSON
    try {
      const r2 = await getRedis();
      const bk = await r2.keys("match:*");
      const ml = [];
      for (const k of bk) {
        const m = await r2.hGetAll(k);
        if (m && m.homeTeam) { m.id = k.replace("match:", ""); ml.push(m); }
      }
      await require("fs").promises.writeFile(__dirname + "/data-backup.json", JSON.stringify({ts:Date.now(), matches: ml}), "utf8");
      log("[Backup] Saved " + ml.length + " matches");
    } catch(e) { log("[Backup] Error: " + (e.message || e)); }
    log("=== Cycle " + cycle + " termine. Prochain dans 30s (" + (await redis.keys("match:*")).length + " matchs) ===");
    await new Promise((r) => setTimeout(r, 30000));
  }
}

process.on("SIGINT", async () => { running = false; if (redis) await redis.quit(); process.exit(0); });
process.on("SIGTERM", async () => { running = false; if (redis) await redis.quit(); process.exit(0); });
main().catch((e) => { log("FATAL: " + e.message); process.exit(1); });
