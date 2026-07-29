const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function test() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36");
  await page.setViewport({ width: 412, height: 915, isMobile: true });

  const calls = [];
  page.on("response", async (resp) => {
    const url = resp.url();
    // Filter out images, fonts, css, analytics
    if (url.includes("1xbet.com") && !url.match(/\.(png|jpg|svg|woff2|css|ico)$/) && !url.includes("analytics") && !url.includes("fatman")) {
      try {
        const text = await resp.text();
        if (text.length > 100 && text.length < 500000 && !text.startsWith("<")) {
          calls.push({ url: url.slice(0, 150), len: text.length, preview: text.slice(0, 120) });
        }
      } catch(e) {}
    }
  });

  try {
    await page.goto("https://1xbet.com", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    await page.goto("https://1xbet.com/en/sport/football", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    console.log("Title:", await page.title());

    // Also try to find data in DOM
    const domData = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll("script")];
      const results = [];
      for (const s of scripts) {
        if (s.id && s.textContent) {
          results.push({ id: s.id, len: s.textContent.length, preview: s.textContent.slice(0, 100) });
        }
      }
      return results;
    });

    console.log("\nScripts with IDs:");
    for (const s of domData) {
      console.log("  " + s.id + " (" + s.len + "): " + s.preview);
    }

    console.log("\n=== JSON API responses > 500 bytes ===");
    const filtered = calls.filter(c => c.len > 500);
    for (const c of filtered.slice(0, 8)) {
      console.log("\n" + c.url);
      console.log("  len: " + c.len);
      console.log("  data: " + c.preview);
    }
  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", String(e)));
