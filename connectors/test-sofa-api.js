
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

  const apiCalls = [];
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("api.sofascore") || url.includes("sofascore.com/api")) {
      try {
        const text = await resp.text();
        apiCalls.push({
          url: url.slice(0, 150),
          status: resp.status(),
          len: text.length,
          type: resp.headers()["content-type"] || "",
          preview: text.slice(0, 200),
        });
      } catch(e) {}
    }
  });

  try {
    await page.goto("https://www.sofascore.com/football", { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log("Title:", await page.title());
    console.log("\nAPI calls intercepted:");
    for (const a of apiCalls) {
      console.log("\n" + a.url);
      console.log("  status: " + a.status + " len: " + a.len + " type: " + a.type);
      if (a.type.includes("json")) {
        console.log("  data: " + a.preview);
      }
    }
  } catch (e) {
    console.error("Error:", String(e));
  } finally {
    await browser.close();
  }
}

test().catch(e => console.error("Fatal:", e.message));
