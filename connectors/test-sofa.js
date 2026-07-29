
const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function test() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125");
    page.setDefaultNavigationTimeout(15000);

    console.log("Loading SofaScore football...");
    await page.goto("https://www.sofascore.com/football", { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise(r => setTimeout(r, 4000));

    console.log("Title:", await page.title());

    // Find matches in DOM
    const result = await page.evaluate(() => {
      const texts = [];
      const allEls = document.querySelectorAll("a, div, span");
      for (const el of allEls) {
        const text = el.textContent.trim();
        if (text && /[A-Z][a-z]+\s+\d+\s*[-:]\s*\d+\s+[A-Z][a-z]+/.test(text)) {
          texts.push(text.slice(0, 150));
        }
      }
      return { matches: texts.slice(0, 15), total: document.body.innerText.length };
    });

    console.log("Total content length:", result.total);
    console.log("\nMatches found:", result.matches.length);
    for (const m of result.matches) {
      console.log("  -", m);
    }

    // Also output all text for analysis
    const allText = await page.evaluate(() => document.body.innerText);
    const lines = allText.split("\n").filter(l => l.trim()).slice(0, 80);
    console.log("\n=== All text lines ===");
    for (const l of lines) {
      console.log(l.slice(0, 150));
    }

  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", e.message));
