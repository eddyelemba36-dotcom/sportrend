const test = require("node:test");
const assert = require("node:assert/strict");
const puppeteer = require("puppeteer");

const { extractBetExplorerResults } = require("./results-scraper");

test("associe chaque résultat à son propre championnat", async (t) => {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <table class="table-main">
      <tr class="js-tournament"><td class="table-main__tournament">Angola: Girabola</td></tr>
      <tr data-dt="1"><td class="table-main__tt"><a>Team A - Team B</a></td><td class="table-main__result">2:1</td></tr>
      <tr class="js-tournament"><td class="table-main__tournament">France: Ligue 1</td></tr>
      <tr data-dt="2"><td class="table-main__tt"><a>Team C - Team D</a></td><td class="table-main__result">0:0</td></tr>
    </table>
  `);

  const results = await page.evaluate(extractBetExplorerResults);
  assert.equal(results.length, 2);
  assert.equal(results[0].competition, "Angola: Girabola");
  assert.equal(results[1].competition, "France: Ligue 1");
  assert.equal(results[1].homeScore, "0");
  assert.equal(results[1].awayScore, "0");
});
