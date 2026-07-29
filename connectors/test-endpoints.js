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

  try {
    await page.goto("https://1xbet.com", { waitUntil: "networkidle2", timeout: 30000 });
    console.log("Title:", await page.title());

    const result = await page.evaluate(async () => {
      const endpoints = [
        "/LineFeed/Get1x2_VZip?count=3",
        "/LineFeed/Get1x2_VZip?lng=en&tf=2200000&mode=3&count=3",
        "/LineFeed/Get1x2_VZip?lng=fr",
        "/LineFeed/GetSportsShort?lng=en",
        "/LineFeed/GetLiveEvents_VZip?count=3",
      ];
      const results = [];
      for (const ep of endpoints) {
        try {
          const resp = await fetch("https://1xbet.com" + ep, {
            headers: { "Accept": "*/*", "X-Requested-With": "XMLHttpRequest" }
          });
          const text = await resp.text();
          results.push({
            ep,
            status: resp.status,
            type: resp.headers.get("content-type"),
            len: text.length,
            preview: text.slice(0, 120)
          });
        } catch (e) {
          results.push({ ep, error: String(e) });
        }
      }
      return results;
    });

    for (const r of result) {
      console.log("\n" + r.ep);
      console.log("  Status: " + r.status + ", Type: " + r.type + ", Length: " + r.len);
      console.log("  Preview: " + r.preview);
    }
  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", String(e)));
