const p = require("puppeteer-extra").default;
const s = require("puppeteer-extra-plugin-stealth");
p.use(s());

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const { createClient } = require("redis");

(async () => {
  let browser;
  try {
    browser = await p.launch({headless:"new",args:["--no-sandbox","--disable-setuid-sandbox"]});
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
    page.setDefaultNavigationTimeout(25000);

    await page.goto("https://www.betexplorer.com/soccer/", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 5000));

    const matches = await page.evaluate(() => {
      const results = [];
      const tables = document.querySelectorAll("table.table-main");
      
      for (const table of tables) {
        // Get league name
        const tourneyEl = table.querySelector("tr.js-tournament .table-main__tournament");
        let competition = tourneyEl ? tourneyEl.textContent.replace(/[0-9]+$/, "").trim() : "";
        
        // Match rows: tr with data-dt attribute
        const rows = table.querySelectorAll("tr[data-dt]");
        
        for (const row of rows) {
          const cells = row.querySelectorAll("td");
          
          // Teams are in the first td as: "<time><a>HomeTeam - AwayTeam</a>"
          const firstCell = cells[0];
          const linkEl = firstCell ? firstCell.querySelector("a") : null;
          const teamsText = linkEl ? linkEl.textContent.trim() : "";
          
          // Split on " - " or " vs "
          const sep = teamsText.includes(" - ") ? " - " : (teamsText.includes(" vs ") ? " vs " : null);
          if (!sep) continue;
          const parts = teamsText.split(sep);
          if (parts.length < 2) continue;
          
          // Odds buttons are in cells with class "table-main__odds"
          const oddsCells = row.querySelectorAll("td.table-main__odds button");
          
          const home = parts[0].trim();
          const away = parts[1].trim();
          if (!home || !away) continue;
          
          results.push({
            home,
            away,
            competition,
            odds1: oddsCells[0] ? oddsCells[0].textContent.trim() : "",
            oddsX: oddsCells[1] ? oddsCells[1].textContent.trim() : "",
            odds2: oddsCells[2] ? oddsCells[2].textContent.trim() : "",
          });
        }
      }
      return results;
    });

    console.log("Matchs: " + matches.length);
    for (const m of matches.slice(0, 8)) {
      console.log(m.competition + " | " + m.home + " vs " + m.away + " | " + m.odds1 + " " + m.oddsX + " " + m.odds2);
    }

    // Store in Redis
    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    
    const oldKeys = await redis.sMembers("matches:betexplorer");
    for (const k of oldKeys) { await redis.del(k); }
    await redis.del("matches:betexplorer");

    let count = 0;
    for (const m of matches) {
      const id = "match:be_" + m.home.replace(/[^a-z0-9]/gi, "_").slice(0, 20) + "_" + m.away.replace(/[^a-z0-9]/gi, "_").slice(0, 20);
      const comp = m.competition.replace(/\s*1\s*X\s*2$/, "").trim();
      
      await redis.hSet(id, "id", id.replace("match:", ""));
      await redis.hSet(id, "homeTeam", m.home);
      await redis.hSet(id, "awayTeam", m.away);
      await redis.hSet(id, "odds1", m.odds1);
      await redis.hSet(id, "oddsX", m.oddsX);
      await redis.hSet(id, "odds2", m.odds2);
      await redis.hSet(id, "competition", comp);
      await redis.hSet(id, "status", "upcoming");
      await redis.hSet(id, "source", "betexplorer");
      await redis.hSet(id, "updatedAt", new Date().toISOString());
      await redis.sAdd("matches:betexplorer", id);
      await redis.expire(id, 3600);
      count++;
    }
    console.log("Stockes: " + count + " matchs");
    await redis.quit();

  } catch(e) {
    console.log("Error: " + e.message.slice(0, 200));
  } finally {
    if (browser) try { await browser.close(); } catch(e) {}
    process.exit(0);
  }
})();
