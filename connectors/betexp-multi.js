/**
 * BetExplorer scraper v2 — ALL matches + results from all tables
 */
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const { createClient } = require("redis");
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

let redis = null;
function log(m) { console.log("["+new Date().toLocaleTimeString("fr-FR",{hour12:false})+"] [BE] "+m); }
async function getRedis() {
  if (!redis||!redis.isOpen) { redis=createClient({url:REDIS_URL}); redis.on("error",e=>log("Redis: "+e.message)); await redis.connect(); }
  return redis;
}

const BET_SPORTS = [
  { path: "/football/" },
  { path: "/basketball/" },
  { path: "/hockey/" },
  { path: "/tennis/" },
  { path: "/baseball/" },
  { path: "/volleyball/" },
  { path: "/handball/" },
];

async function scrapeAll() {
  const r = await getRedis();
  let browser;
  try {
    browser = await puppeteer.launch({headless:"new",args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]});
    
    for (const sport of BET_SPORTS) {
      try {
        const page = await browser.newPage();
        await page.setViewport({width:1920,height:1080});
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
        page.setDefaultNavigationTimeout(15000);
        await page.goto("https://www.betexplorer.com" + sport.path, {waitUntil:"networkidle2",timeout:15000});
        await new Promise(r=>setTimeout(r, 3000));

        const sportName = await page.evaluate(() => {
          const p = window.location.pathname.split("/")[1] || "unknown";
          return p.charAt(0).toUpperCase() + p.slice(1);
        });

        const data = await page.evaluate(() => {
          const upcoming = [];
          const results = [];
          const tables = document.querySelectorAll("table.table-main");
          for (const table of tables) {
            const tourneyEl = table.querySelector("tr.js-tournament .table-main__tournament");
            let competition = tourneyEl ? tourneyEl.textContent.trim() : "";
            competition = competition.replace(/\s*1\s*X\s*2$/,"").trim();
            
            const rows = table.querySelectorAll("tr[data-dt]");
            for (const row of rows) {
              const oddsBtns = row.querySelectorAll("td.table-main__odds button");
              const ttCell = row.querySelector("td.h-text-left");
              
              if (ttCell && oddsBtns.length >= 3) {
                // Upcoming match with odds
                const linkEl = ttCell.querySelector("a");
                const teamsText = linkEl ? linkEl.textContent.trim() : "";
                if (!teamsText.includes(" - ")) continue;
                const parts = teamsText.split(" - ");
                if (parts.length < 2) continue;
                upcoming.push({
                  home: parts[0].trim(), away: parts[1].trim(),
                  competition,
                  odds1: oddsBtns[0].textContent.trim(),
                  oddsX: oddsBtns[1].textContent.trim(),
                  odds2: oddsBtns[2].textContent.trim(),
                });
              }
            }
          }
          return { upcoming };
        });

        // Store upcoming matches
        if (data.upcoming.length > 0) {
          let count = 0;
          for (const m of data.upcoming) {
            const id = "match:be_" + sportName.slice(0,4) + "_" + m.home.replace(/[^a-z0-9]/gi,"_").slice(0,15) + "_" + m.away.replace(/[^a-z0-9]/gi,"_").slice(0,15);
            await r.hSet(id, "id", id.replace("match:",""));
            await r.hSet(id, "homeTeam", m.home);
            await r.hSet(id, "awayTeam", m.away);
            await r.hSet(id, "odds1", m.odds1);
            await r.hSet(id, "oddsX", m.oddsX);
            await r.hSet(id, "odds2", m.odds2);
            await r.hSet(id, "competition", m.competition || sportName);
            await r.hSet(id, "status", "upcoming");
            await r.hSet(id, "source", "betexplorer");
            await r.hSet(id, "updatedAt", new Date().toISOString());
            await r.sAdd("matches:betexplorer", id);
            await r.expire(id, 3600);
            count++;
          }
          log(sportName + ": " + count + " upcoming");
        } else {
          log(sportName + ": 0 upcoming");
        }
        await page.close();
      } catch(e) {
        log(sport.path + " error: " + e.message.slice(0,80));
      }
    }
  } catch(e) {
    log("Fatal: " + e.message.slice(0,100));
  } finally {
    if (browser) try { await browser.close(); } catch(e) {}
  }
}

module.exports = { scrapeAll };
if (require.main === module) {
  scrapeAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
