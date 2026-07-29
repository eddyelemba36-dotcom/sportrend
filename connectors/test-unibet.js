
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function test() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
  page.setDefaultNavigationTimeout(20000);

  const apiCalls = [];
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("/rest/") || url.includes("/api/") || url.includes("bff") || url.includes("graphql")) {
      try {
        const text = await resp.text();
        if (text.length > 100 && text.length < 500000 && text.trim().startsWith("{")) {
          apiCalls.push({ url: url.slice(0, 120), len: text.length, preview: text.slice(0, 200) });
        }
      } catch(e) {}
    }
  });

  await page.goto("https://www.unibet.fr/sport/football", { waitUntil: "networkidle2", timeout: 20000 });
  await new Promise(r => setTimeout(r, 4000));

  const dom = await page.evaluate(() => {
    const matches = [];
    const eventEls = document.querySelectorAll("[class*=event], [class*=card], [class*=match], article, [data-testid*=event]");
    for (const el of eventEls) {
      const text = el.textContent.trim();
      if (text.length > 30 && text.length < 300) {
        const hasScore = /\d+-\d+/.test(text);
        const hasOdds = /\d+\.\d+/.test(text);
        if (hasScore || hasOdds) matches.push(text.slice(0, 200));
      }
    }
    return { matches: matches.slice(0, 15), total: document.body.innerText.length };
  });

  console.log("Title:", await page.title());
  console.log("\nDOM matches:", dom.matches.length);
  for (const m of dom.matches) console.log("  -", m);
  console.log("\nAPI calls:");
  for (const a of apiCalls.slice(0, 8)) {
    console.log(a.url);
    console.log("  len:", a.len, "|", a.preview.slice(0, 150));
  }

  await browser.close();
}

test().catch(e => console.error("Fatal:", e.message));
