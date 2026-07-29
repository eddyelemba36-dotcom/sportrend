const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

(async () => {
  const b = await puppeteer.launch({headless:"new",args:["--no-sandbox","--disable-setuid-sandbox"]});
  const page = await b.newPage();
  await page.setViewport({width:1920,height:1080});
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125");
  page.setDefaultNavigationTimeout(15000);
  await page.goto("https://www.betexplorer.com/football/", {waitUntil:"networkidle2",timeout:15000});
  await new Promise(r=>setTimeout(r, 3000));
  
  const info = await page.evaluate(() => {
    const r = [];
    const tables = document.querySelectorAll("table.table-main");
    let matchCount = 0;
    let rowCount = 0;
    tables.forEach((t, i) => {
      // Skip tournament header rows for match count
      const rows = t.querySelectorAll("tr[data-dt]");
      const rowHtml = rows.length > 0 ? rows[0].innerHTML.slice(0, 200) : "NO ROWS";
      r.push({table: i, rows: rows.length, sampleRowHtml: rowHtml});
      matchCount += rows.length;
    });
    return {tablesCount: tables.length, totalRows: matchCount, details: r};
  });
  console.log(JSON.stringify(info, null, 2));
  
  // Also check what's in td.h-text-left and td.table-main__tt
  const cellInfo = await page.evaluate(() => {
    const hTextLeft = document.querySelectorAll("td.h-text-left").length;
    const tableMainTt = document.querySelectorAll("td.table-main__tt").length;
    const results = document.querySelectorAll("td.table-main__result").length;
    return {hTextLeft, tableMainTt, results};
  });
  console.log("Cell info:", JSON.stringify(cellInfo));
  
  await b.close();
  process.exit(0);
})();
