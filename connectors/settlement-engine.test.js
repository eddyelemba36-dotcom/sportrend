const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOfficialResult } = require("./official-result");
const { settleSelection } = require("./settlement-engine");

const confirmed = buildOfficialResult({
  id: "m1", status: "finished", resultStatus: "confirmed",
  resultConfirmedAt: "2026-08-29T12:00:00Z", homeScore: "2", awayScore: "1",
  resultSources: '["espn","provider-2"]'
});

test("un résultat terminé non confirmé reste provisoire", () => {
  const result = buildOfficialResult({ id: "m1", status: "finished", homeScore: "2", awayScore: "1" });
  assert.equal(result.resultStatus, "provisional");
  assert.equal(settleSelection(result, { market: "1x2", selection: "1" }).status, "pending");
});

test("règle 1X2, double chance, BTS et score exact", () => {
  assert.equal(settleSelection(confirmed, { market: "1x2", selection: "1" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "dc", selection: "N2" }).status, "lost");
  assert.equal(settleSelection(confirmed, { market: "bts", selection: "GG" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "exact", selection: "2-1" }).status, "won");
});

test("règle les totaux et rembourse une ligne entière exacte", () => {
  assert.equal(settleSelection(confirmed, { market: "ou", selection: "O2.5" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "ou", selection: "U3.5" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "ou", selection: "O3", line: 3 }).status, "void");
});

test("rembourse le Draw No Bet en cas de nul", () => {
  const draw = { ...confirmed, regulation: { home: 1, away: 1 } };
  assert.equal(settleSelection(draw, { market: "dnb", selection: "1" }).status, "void");
});

test("envoie les marchés inconnus en vérification manuelle", () => {
  assert.equal(settleSelection(confirmed, { market: "corners", selection: "O8.5" }).status, "manual_review");
});
