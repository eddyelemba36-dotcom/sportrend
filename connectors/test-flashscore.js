
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function scrapeFlashscore() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
  page.setDefaultNavigationTimeout(15000);

  try {
    await page.goto("https://www.flashscore.com/football/", { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
      const matches = [];
      const rows = document.querySelectorAll("[id*=g_1_], .event__match, [class*=participant], tr");
      for (const row of rows) {
        const text = row.textContent.trim();
        // Look for score patterns: TeamName score - score TeamName
        const match = text.match(/([A-Z][a-zA-Z\s-]+?)\s+(\d+)\s*[-:]\s*(\d+)\s+([A-Z][a-zA-Z\s-]+)/);
        if (match) {
          matches.push({
            homeTeam: match[1].trim(),
            homeScore: match[2],
            awayScore: match[3],
            awayTeam: match[4].trim(),
          });
        }
      }
      return matches;
    });

    console.log("Flashscore matches found:", data.length);
    for (const m of data) {
      console.log(m.homeTeam + " " + m.homeScore + "-" + m.awayScore + " " + m.awayTeam);
    }
  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

scrapeFlashscore().catch(e => console.error("Fatal:", e.message));
