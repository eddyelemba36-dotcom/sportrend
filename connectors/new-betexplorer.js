async function scrapeBetExplorer() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
    page.setDefaultNavigationTimeout(25000);

    await page.goto("https://www.betexplorer.com/soccer/", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 5000));

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
            home: parts[0].trim(),
            away: parts[1].trim(),
            competition,
            odds1: oddsCells[0] ? oddsCells[0].textContent.trim() : "",
            oddsX: oddsCells[1] ? oddsCells[1].textContent.trim() : "",
            odds2: oddsCells[2] ? oddsCells[2].textContent.trim() : "",
          });
        }
      }
      return results;
    });

    log("BetExplorer: " + matches.length + " matchs");
    if (!matches.length) throw new Error("0 matchs recuperes");

    const r = await getRedis();
    const oldKeys = await r.sMembers("matches:betexplorer");
    for (const k of oldKeys) { await r.del(k); }
    await r.del("matches:betexplorer");

    let count = 0;
    for (const m of matches) {
      const id = "match:be_" + m.home.replace(/[^a-z0-9]/gi, "_").slice(0, 20) + "_" + m.away.replace(/[^a-z0-9]/gi, "_").slice(0, 20);
      const comp = m.competition.replace(/\s*1\s*X\s*2$/, "").trim().replace(/^Faroe Islands:\s*/, "");
      
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
      await r.expire(id, 3600);
      count++;
    }
    log("BetExplorer: " + count + " matchs stockes");
  } catch (e) {
    log("BetExplorer error: " + e.message.slice(0, 120));
  } finally {
    if (browser) try { await browser.close(); } catch (e) {}
  }
}
