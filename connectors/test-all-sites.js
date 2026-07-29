
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function testSites() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  const sites = [
    { name: "BetExplorer", url: "https://www.betexplorer.com/soccer/", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125" },
    { name: "Unibet", url: "https://www.unibet.fr/sport/football", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125" },
    { name: "SofaScore", url: "https://www.sofascore.com/football", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125" },
    { name: "Flashscore", url: "https://www.flashscore.com/football/", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125" },
    { name: "Soccerway", url: "https://www.soccerway.com/live/", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125" },
  ];

  for (const site of sites) {
    try {
      const page = await browser.newPage();
      await page.setUserAgent(site.ua);
      page.setDefaultNavigationTimeout(15000);

      await page.goto(site.url, { waitUntil: "networkidle2", timeout: 15000 });
      await new Promise(r => setTimeout(r, 3000));

      // Get ALL text and also try to find match structures
      const info = await page.evaluate(() => {
        const text = document.body.innerText;
        const links = [...document.querySelectorAll("a")].filter(a => a.href && (a.href.includes("/match/") || a.href.includes("/event/") || a.href.includes("/game/"))).map(a => a.href).slice(0, 5);
        const tables = document.querySelectorAll("table").length;
        const rows = document.querySelectorAll("tr").length;
        const scorePattern = text.match(/[A-Z][a-z]+[\s-]+[A-Z][a-z]+[\s-]+\d+:\d+/g);
        const scorePattern2 = text.match(/\d+-\d+/g);
        return {
          title: document.title,
          contentLen: text.length,
          tables, rows,
          scoreMatches: scorePattern ? scorePattern.slice(0, 5) : [],
          scoreCount: scorePattern2 ? scorePattern2.length : 0,
          matchLinks: links,
          textLines: text.split("\n").filter(l => l.trim()).slice(0, 30),
        };
      });

      console.log("\n=== " + site.name + " ===");
      console.log("  Title:", info.title.slice(0, 80));
      console.log("  Content:", info.contentLen + "b, tables:" + info.tables + ", rows:" + info.rows + ", scores:" + info.scoreCount);
      if (info.scoreMatches.length > 0) console.log("  Score matches:", info.scoreMatches);
      if (info.matchLinks.length > 0) console.log("  Match links:", info.matchLinks.slice(0, 3));
      console.log("  Text lines:", info.textLines.slice(0, 10).join(" | ").slice(0, 200));

      await page.close();
    } catch (e) {
      console.log("\n=== " + site.name + " ===");
      console.log("  ERROR:", String(e).slice(0, 100));
    }
  }

  await browser.close();
}

testSites().catch(e => console.error("Fatal:", e.message));
