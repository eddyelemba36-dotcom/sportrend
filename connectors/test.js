const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

(async () => {
  const b = await puppeteer.launch({headless:"new",args:["--no-sandbox","--disable-setuid-sandbox"]});
  const page = await b.newPage();
  await page.setViewport({width:1920,height:1080});
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
  page.setDefaultNavigationTimeout(15000);
  await page.goto("https://www.betexplorer.com/soccer/", {waitUntil:"networkidle2",timeout:15000});
  await new Promise(r=>setTimeout(r, 3000));
  
  const info = await page.evaluate(() => {
    const ls = [];
    document.querySelectorAll("a").forEach(a => {
      const t = a.textContent.trim().toLowerCase();
      if (t.includes("all") || t.includes("show"))
        ls.push({text: a.textContent.trim(), href: a.href});
    });
    return {tables: document.querySelectorAll("table.table-main").length, rows: document.querySelectorAll("tr[data-dt]").length, url: window.location.href};
  });
  console.log("Initial:", JSON.stringify(info));
  
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));
  }
  
  const info2 = await page.evaluate(() => ({
    rowsAfterScroll: document.querySelectorAll("tr[data-dt]").length
  }));
  console.log("After scroll:", JSON.stringify(info2));
  
  await b.close();
  process.exit(0);
})();
