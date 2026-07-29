/**
 * Flashscore + 365Scores scrapers
 */
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const { createClient } = require("redis");

let redis = null;

function log(msg) {
  console.log("[" + new Date().toLocaleTimeString("fr-FR", {hour12: false}) + "] " + msg);
}

async function getRedis() {
  if (!redis || !redis.isOpen) {
    redis = createClient({ url: REDIS_URL });
    redis.on("error", (e) => log("Redis error: " + e.message));
    await redis.connect();
  }
  return redis;
}

async function storeMatch(r, m) {
  const key = "match:" + m.id;
  await r.hSet(key, "id", m.id);
  await r.hSet(key, "homeTeam", m.homeTeam || "");
  await r.hSet(key, "awayTeam", m.awayTeam || "");
  await r.hSet(key, "homeScore", String(m.homeScore || ""));
  await r.hSet(key, "awayScore", String(m.awayScore || ""));
  await r.hSet(key, "competition", m.competition || "");
  await r.hSet(key, "odds1", String(m.odds1 || ""));
  await r.hSet(key, "oddsX", String(m.oddsX || ""));
  await r.hSet(key, "odds2", String(m.odds2 || ""));
  await r.hSet(key, "status", m.status || "upcoming");
  await r.hSet(key, "source", m.source || "");
  await r.hSet(key, "updatedAt", new Date().toISOString());
  await r.sAdd("matches:" + m.source, key);
  await r.expire(key, 3600);
}

async function scrapeFlashscore() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
    page.setDefaultNavigationTimeout(30000);

    await page.goto("https://www.flashscore.com/football/", { waitUntil: "networkidle2", timeout: 30000 });
    
    // Wait for dynamic content to load
    try { await page.waitForFunction("document.body.innerText.length > 10000", {timeout: 15000}); } catch(e) {}
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
      const text = document.body.innerText;
      const lines = text.split("\n").map(l => l.trim()).filter(l => l);
      const matches = [];
      let currentLeague = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // League header: "EUROPE: Euro U19" or "ENGLAND: Premier League"
        if ((line.includes(":") && !line.includes(" - ") && line.length < 60 && !line.startsWith("http")) ||
            (line === line.toUpperCase() && line.length > 5 && line.length < 40 && !line.includes(" "))) {
          if (line !== "ALL" && line !== "LIVE" && line !== "ODDS" && line !== "FINISHED" && line !== "SCHEDULED") {
            currentLeague = line;
          }
        }

        // Score line: "Wales U19 0 0 Spain U19" (team score score team)
        const scoreLine = text.substring(text.indexOf(line), text.indexOf(line) + 200).match(/([A-Za-z0-9\s-]+)\s+(\d+)\s+(\d+)\s+([A-Za-z0-9\s-]+)/);
        if (scoreLine && scoreLine.length === 5) {
          const home = scoreLine[1].trim();
          const hScore = scoreLine[2];
          const aScore = scoreLine[3];
          const away = scoreLine[4].trim();
          if (home.length > 3 && away.length > 3 && home.length < 30 && away.length < 30 &&
              !home.includes(":") && !away.includes(":") && !home.startsWith("http")) {
            matches.push({
              homeTeam: home, homeScore: hScore,
              awayScore: aScore, awayTeam: away,
              competition: currentLeague
            });
          }
        }
      }
      
      // Deduplicate by home_away combo
      const seen = new Set();
      return matches.filter(m => {
        const key = m.homeTeam + "|" + m.awayTeam;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 30);
    });

    log("Flashscore: " + data.length + " matchs");

    const r = await getRedis();
    const oldKeys = await r.sMembers("matches:flashscore");
    for (const k of oldKeys) { if (k.startsWith("match:fs_")) await r.del(k); }
    await r.del("matches:flashscore");

    let count = 0;
    for (const m of data) {
      const id = "fs_" + m.homeTeam.replace(/[^a-z0-9]/gi, "_").slice(0, 25) + "_" + m.awayTeam.replace(/[^a-z0-9]/gi, "_").slice(0, 25);
      await storeMatch(r, {
        id, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        homeScore: m.homeScore, awayScore: m.awayScore,
        competition: m.competition || "Football",
        status: "live",
        source: "flashscore"
      });
      count++;
    }
    log("Flashscore: " + count + " matchs stockes");

  } catch (e) {
    log("Flashscore error: " + e.message.slice(0, 150));
  } finally {
    if (browser) try { await browser.close(); } catch(e) {}
  }
}

async function scrape365scores() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
    page.setDefaultNavigationTimeout(25000);

    await page.goto("https://www.365scores.com/fr/football", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 3000));

    // Try to accept cookies
    try {
      const buttons = await page.$$("button");
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && (text.includes("Accepter") || text.includes("Accept") || text.includes("Fermer"))) {
          await btn.click();
          console.log("365Scores: clicked cookie accept");
          break;
        }
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 4000));

    const data = await page.evaluate(() => {
      const text = document.body.innerText;
      const lines = text.split("\n").map(l => l.trim()).filter(l => l);
      const matches = [];

      // Find "vs" patterns and score patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Score: "Team1 2 - 1 Team2"
        const m = line.match(/([A-Za-z\s-]+)\s+(\d+)\s*[-:]\s*(\d+)\s+([A-Za-z\s-]+)/);
        if (m && m[1].trim().length > 2 && m[4].trim().length > 2) {
          matches.push({
            homeTeam: m[1].trim(), homeScore: m[2],
            awayScore: m[3], awayTeam: m[4].trim(),
            competition: lines[i-1] || ""
          });
        }
        // Upcoming: "Team1 vs Team2   HH:MM"
        const vs = line.match(/([A-Za-z\s-]+)\s+vs\s+([A-Za-z\s-]+)\s+(\d{2}:\d{2})/i);
        if (vs && vs[1].trim().length > 2 && vs[2].trim().length > 2) {
          matches.push({
            homeTeam: vs[1].trim(), awayTeam: vs[2].trim(),
            competition: lines[i-1] || ""
          });
        }
      }
      
      const seen = new Set();
      return matches.filter(m => {
        const key = (m.homeTeam || "") + "|" + (m.awayTeam || "");
        if (seen.has(key) || !m.homeTeam || !m.awayTeam) return false;
        seen.add(key);
        return true;
      }).slice(0, 20);
    });

    log("365Scores: " + data.length + " matchs");

    if (data.length > 0) {
      const r = await getRedis();
      const oldKeys = await r.sMembers("matches:365scores");
      for (const k of oldKeys) { if (k.startsWith("match:36_")) await r.del(k); }
      await r.del("matches:365scores");

      let count = 0;
      for (const m of data) {
        const id = "36_" + (m.homeTeam || "").replace(/[^a-z0-9]/gi, "_").slice(0, 25) + "_" + (m.awayTeam || "").replace(/[^a-z0-9]/gi, "_").slice(0, 25);
        await storeMatch(r, {
          id, homeTeam: m.homeTeam || "", awayTeam: m.awayTeam || "",
          homeScore: m.homeScore || "", awayScore: m.awayScore || "",
          competition: m.competition || "Football",
          status: (m.homeScore || m.awayScore) ? "live" : "upcoming",
          source: "365scores"
        });
        count++;
      }
      log("365Scores: " + count + " matchs stockes");
    }

  } catch (e) {
    log("365Scores error: " + e.message.slice(0, 150));
  } finally {
    if (browser) try { await browser.close(); } catch(e) {}
  }
}

module.exports = { scrapeFlashscore, scrape365scores };

if (require.main === module) {
  (async () => {
    await scrapeFlashscore();
    await scrape365scores();
    process.exit(0);
  })();
}
