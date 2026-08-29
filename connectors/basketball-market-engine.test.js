const test = require("node:test");
const assert = require("node:assert/strict");
const { generateMarketsForSport } = require("./sports-market-engine");

test("route le football vers le modèle Poisson existant", () => {
  const result = generateMarketsForSport("Football", { o1: 2.1, oX: 3.3, o2: 3.5, homeTeam: "A", awayTeam: "B" });
  assert.equal(result.model, "football-poisson-v2");
  assert.equal(Object.keys(result.markets).length, 30);
});

test("expose les marchés basketball fournis sans inventer de cote", () => {
  const result = generateMarketsForSport("NBA", {
    o1: 1.8, o2: 2.05, homeTeam: "A", awayTeam: "B",
    spreadData: { home: { line: -4.5, odds: 1.91 }, away: { line: 4.5, odds: 1.91 } },
    totalData: { over: { line: 224.5, odds: 1.9 }, under: { line: 224.5, odds: 1.92 } }
  });
  assert.equal(result.model, "basketball-provider-v1");
  assert.equal(Object.keys(result.markets).length, 3);
  assert.equal(result.markets.total.entries[0].odds, 1.9);
});

test("omet les marchés basketball incomplets", () => {
  const result = generateMarketsForSport("Basketball", { o1: 1.8, homeTeam: "A", awayTeam: "B" });
  assert.equal(result.generated, false);
  assert.deepEqual(result.markets, {});
});
