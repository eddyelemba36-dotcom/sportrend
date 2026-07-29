/**
 * Unibet scraper v2 - intercepte l API services-api/sportsbookdata
 */
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const { createClient } = require("redis");

let redis = null;
const fs = require("fs");

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

async function scrapeUnibet() {
  let browser;
  let apiData = null;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
    page.setDefaultNavigationTimeout(25000);

    // Capture ALL API responses, keep the most useful ones
    const captures = [];
    page.on("response", async (resp) => {
      const url = resp.url();
      if (url.includes("sportsbookdata/current/") && url.includes("topmarket")) {
        try {
          const text = await resp.text();
          if (text.length > 5000 && text.trim().startsWith("{")) {
            captures.push(JSON.parse(text));
          }
        } catch(e) {}
      }
    });

    await page.goto("https://www.unibet.fr/sport/football", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 6000));
    await browser.close();

    if (captures.length === 0) {
      log("Unibet: no API data captured");
      return;
    }

    // Parse the captured data
    const data = captures[0];
    const r = await getRedis();

    // Clear old unibet matches
    const oldKeys = await r.sMembers("matches:unibet");
    for (const k of oldKeys) {
      if (k.startsWith("match:ub_")) await r.del(k);
    }
    await r.del("matches:unibet");

    let count = 0;
    const items = data.items || {};
    for (const [key, val] of Object.entries(items)) {
      if (!val || typeof val !== "object") continue;
      const desc = val.desc || "";
      const pdesc = val.pdesc || "";
      if (!desc || !desc.includes(" vs ")) continue;

      const parts = desc.split(" vs ");
      const homeTeam = (val.a || parts[0]).trim();
      const awayTeam = (val.b || parts[1]).trim();
      const sc = val.score || {};
      const homeScore = sc.a !== undefined ? String(sc.a) : "";
      const awayScore = sc.b !== undefined ? String(sc.b) : "";
      const isLive = (homeScore || awayScore) && sc.period;

      // Find odds in market groups
      let odds1 = "", oddsX = "", odds2 = "";
      // Look in markettype groups  
      const groups = data.marketTypeDisplayGroups || {};
      for (const [, gval] of Object.entries(groups)) {
        if (typeof gval !== "object") continue;
        for (const [, opts] of Object.entries(gval)) {
          if (typeof opts === "object" && opts.outcomes) {
            const names = Object.keys(opts.outcomes);
            if (names.length >= 3) {
              const o1 = opts.outcomes[names[0]] || {};
              const o2 = opts.outcomes[names[1]] || {};
              const o3 = opts.outcomes[names[2]] || {};
              odds1 = o1.odds !== undefined ? o1.odds.toString() : "";
              oddsX = o2.odds !== undefined ? o2.odds.toString() : "";
              odds2 = o3.odds !== undefined ? o3.odds.toString() : "";
              break;
            }
          }
        }
        if (odds1) break;
      }

      const id = "ub_" + homeTeam.replace(/[^a-z0-9]/gi, "_").slice(0, 25) + "_" + awayTeam.replace(/[^a-z0-9]/gi, "_").slice(0, 25);
      await storeMatch(r, {
        id, homeTeam, awayTeam,
        homeScore, awayScore,
        competition: pdesc,
        odds1, oddsX, odds2,
        status: isLive ? "live" : "upcoming",
        source: "unibet",
      });
      count++;
    }

    log("Unibet: " + count + " matchs stockes (avec cotes)");
  } catch (e) {
    log("Unibet error: " + (e.message || String(e)).slice(0, 150));
  } finally {
    if (browser) try { await browser.close(); } catch(e) {}
  }
}

module.exports = { scrapeUnibet };

if (require.main === module) {
  scrapeUnibet().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
