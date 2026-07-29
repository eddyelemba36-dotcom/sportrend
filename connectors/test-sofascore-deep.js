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

    await page.goto("https://www.sofascore.com/football", { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise(r => setTimeout(r, 5000));

    // Extract all match-related data from DOM
    const matches = await page.evaluate(() => {
      const results = [];

      // Find all likely match containers
      const candidates = document.querySelectorAll(
        [class*=match], [class*=event], [class*=game], [class*=item], [class*=row], a[href*=/match/], a[href*=/event/]
      );

      const seen = new Set();
      for (const el of candidates) {
        const text = el.textContent.trim();
        if (!text || text.length < 20 || seen.has(text)) continue;
        seen.add(text);

        // Simple heuristic: match score pattern like "2 - 1" or "2:1"
        const hasScore = /\\d+\\s*[-:]\\s*\\d+/.test(text);
        const hasTeams = /[A-Z][a-z]+.*[A-Z][a-z]+/.test(text);

        if (hasScore && hasTeams) {
          results.push({
            text: text.slice(0, 200),
            tag: el.tagName,
            class: (el.className || "").slice(0, 60),
            href: el.getAttribute("href") || "",
          });
        }
      }

      return results.slice(0, 20);
    });

    console.log("=== Matches found in DOM ===");
    for (const m of matches) {
      console.log(`\\n[${m.tag}] ${m.class}`);
      console.log(`  ${m.text}`);
      if (m.href) console.log(`  href: ${m.href}`);
    }

    // Try to get all text content to analyze structure
    const allText = await page.evaluate(() => document.body.innerText);
    const lines = allText.split("\\n").filter(l => l.trim()).slice(0, 60);
    console.log("\\n=== Page lines ===");
    for (const l of lines) {
      console.log(l.slice(0, 120));
    }

  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", e.message));
