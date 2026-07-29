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

  const allUrls = [];
  page.on("request", req => {
    const url = req.url();
    if (url.includes("1xbet.com") && !url.match(/\.(png|jpg|svg|woff2|css|ico|js)$/) && !url.includes("analytics")) {
      allUrls.push(url.slice(0, 180));
    }
  });

  try {
    await page.goto("https://1xbet.com/en/live", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    console.log("Title:", await page.title());

    // Check page content
    const content = await page.evaluate(() => {
      const main = document.querySelector("main") || document.querySelector("[class*=events]") || document.querySelector("[class*=content]");
      return main ? main.innerHTML.slice(0, 500) : document.body.innerHTML.slice(0, 500);
    });
    console.log("\nPage content preview:", content.slice(0, 400));

    console.log("\nAll non-static URLs:");
    for (const u of [...new Set(allUrls)]) {
      console.log(u);
    }
  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", String(e)));
