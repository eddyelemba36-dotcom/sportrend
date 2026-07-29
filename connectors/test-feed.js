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

  const apiCalls = [];
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("bff-api") || url.includes("feed") || url.includes("prematch")) {
      try {
        const text = await resp.text();
        apiCalls.push({ url: url.slice(0, 150), status: resp.status(), len: text.length, data: text.slice(0, 400) });
      } catch(e) {}
    }
  });

  try {
    await page.goto("https://1xbet.com", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log("Navigating to football...");
    await page.goto("https://1xbet.com/en/sport/football", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    console.log("Title:", await page.title());

    const store = await page.evaluate(() => {
      return { rcpKeys: typeof window.__RCP !== "undefined" ? Object.keys(window.__RCP).slice(0, 20) : [] };
    });
    console.log("RCP keys:", store.rcpKeys);

    console.log("\nFeed API calls:");
    for (const a of apiCalls.slice(0, 5)) {
      console.log("\n" + a.url);
      console.log("  status: " + a.status + ", len: " + a.len);
      console.log("  " + a.data.slice(0, 300));
    }
  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", String(e)));
