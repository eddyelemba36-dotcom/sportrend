const p = require("puppeteer-extra").default;
const s = require("puppeteer-extra-plugin-stealth");
p.use(s());
(async () => {
  const b = await p.launch({headless:"new",args:["--no-sandbox","--disable-setuid-sandbox"]});
  const page = await b.newPage();
  await page.setViewport({width: 1920, height: 1080});
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
  page.setDefaultNavigationTimeout(30000);

  await page.goto("https://www.flashscore.com/football/", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  try { await page.waitForFunction("document.body.innerText.length > 10000", {timeout: 15000}); } catch(e){}
  
  const data = await page.evaluate(() => {
    const text = document.body.innerText;
    const lines = text.split("\n").map(l => l.trim()).filter(l => l);
    const links = [...document.querySelectorAll("a")].filter(a => a.href && a.href.includes("/match/")).map(a => a.href).slice(0, 5);
    return { textLen: text.length, lines: lines.slice(0, 40), links };
  });

  console.log("Content:", data.textLen, "b");
  console.log("Match links:", data.links.length);
  for (const l of data.links) console.log("  " + l);
  console.log("---");
  for (const l of data.lines) console.log("  " + l.slice(0, 140));

  await b.close();
  process.exit(0);
})();
