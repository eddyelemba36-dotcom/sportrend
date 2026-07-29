
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function test() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125");
  page.setDefaultNavigationTimeout(15000);

  try {
    // First load the page to establish session
    await page.goto("https://www.sofascore.com/football", { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise(r => setTimeout(r, 4000));

    // Now fetch API from within the browser context (has cookies/cf clearance)
    const data = await page.evaluate(async () => {
      const resp = await fetch("https://www.sofascore.com/api/v1/sport/football/live-tournaments", {
        headers: { "Accept": "application/json" }
      });
      if (!resp.ok) return { error: "HTTP " + resp.status };
      const json = await resp.json();
      return json;
    });

    console.log("Live tournaments:");
    console.log(JSON.stringify(data, null, 2).slice(0, 1000));

  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", e.message));
