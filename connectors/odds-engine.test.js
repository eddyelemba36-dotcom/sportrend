const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateAllMarkets,
  probsFromOdds,
  calcExpectedGoals,
  scoreProbabilities,
  price
} = require("./odds-engine");

test("normalise les probabilités 1X2", () => {
  const probs = probsFromOdds(2.1, 3.3, 3.5);
  assert.ok(Math.abs(probs.h + probs.x + probs.a - 1) < 1e-12);
});

test("conserve un total xG football raisonnable", () => {
  const xg = calcExpectedGoals({ h: 0.5, x: 0.25, a: 0.25 });
  assert.equal(xg.total, 2.5);
  assert.ok(xg.home > xg.away);
  assert.ok(Math.abs(xg.home + xg.away - 2.5) < 1e-12);
});

test("renormalise la distribution des scores", () => {
  const scores = scoreProbabilities(1.4, 1.1);
  const total = Object.values(scores).reduce((sum, probability) => sum + probability, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
});

test("la marge bookmaker réduit la cote juste", () => {
  assert.equal(price(0.5, 0), 2);
  assert.ok(price(0.5, 0.07) < 2);
});

test("utilise réellement la ligne Over/Under fournie", () => {
  const line15 = generateAllMarkets(2.1, 3.3, 3.5, null, {
    over: { line: 1.5 }, under: { line: 1.5 }
  }, "Domicile", "Extérieur").ou;
  const line35 = generateAllMarkets(2.1, 3.3, 3.5, null, {
    over: { line: 3.5 }, under: { line: 3.5 }
  }, "Domicile", "Extérieur").ou;

  assert.equal(line15.entries[0].value, "O1.5");
  assert.equal(line35.entries[0].value, "O3.5");
  assert.ok(line15.entries[0].odds < line35.entries[0].odds);
});

test("ajoute une marge au marché 1X2 généré", () => {
  const market = generateAllMarkets(2.1, 3.3, 3.5, null, null, "A", "B").ml;
  const impliedTotal = market.entries.reduce((sum, entry) => sum + 1 / entry.odds, 0);
  assert.ok(impliedTotal > 1);
});
