const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth").default;
puppeteer.use(StealthPlugin());

async function test() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36");
  await page.setViewport({ width: 412, height: 915, isMobile: true });

  try {
    console.log("Navigating to 1xBet...");
    await page.goto("https://1xbet.com", { waitUntil: "networkidle2", timeout: 30000 });
    console.log("Title:", await page.title());

    // Extract cookies to use in HTTP client
    const cookies = await page.cookies();
    console.log("Cookies:", cookies.length);

    // Now test the JSON-RPC endpoints from browser context
    const result = await page.evaluate(async () => {
      const resp = await fetch("https://1xbet.com/LineFeed/Get1x2_VZip?count=3", {
        headers: { "Accept": "*/*", "X-Requested-With": "XMLHttpRequest" }
      });
      const text = await resp.text();
      return { status: resp.status, slice: text.slice(0, 300) };
    });

    console.log("Status:", result.status);
    console.log("Response starts with:", JSON.stringify(result.slice).slice(0, 200));
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await browser.close();
  }
}

test();
