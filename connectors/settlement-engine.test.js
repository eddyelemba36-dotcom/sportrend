const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOfficialResult } = require("./official-result");
const { settleSelection } = require("./settlement-engine");

const confirmed = buildOfficialResult({
  id: "m1", status: "finished", resultStatus: "confirmed",
  resultConfirmedAt: "2026-08-29T12:00:00Z", homeScore: "2", awayScore: "1",
  resultSources: '["espn","provider-2"]', detailsStatus: "confirmed",
  detailsConfirmedAt: "2026-08-29T12:01:00Z",
  halfTimeHomeScore: "1", halfTimeAwayScore: "0",
  statistics: '{"home":{"cornerKicks":"6"},"away":{"corners":"2"}}',
  events: '[{"type":"goal","playerId":"p1","player":"Joueur A"},{"type":"yellow_card"},{"type":"red_card"}]'
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

test("règle les marchés mi-temps et corners avec des détails confirmés", () => {
  assert.equal(settleSelection(confirmed, { market: "half_time_1x2", selection: "1" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "half_time_total", selection: "O0.5" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "total_corners", selection: "O7.5" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "home_corners", selection: "U6.5" }).status, "won");
});

test("règle cartons et buteur uniquement avec des détails confirmés", () => {
  assert.equal(settleSelection(confirmed, { market: "yellow_cards", selection: "O0.5" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "red_cards", selection: "U1.5" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "anytime_scorer", playerId: "p1", selection: "Joueur A" }).status, "won");
  assert.equal(settleSelection(confirmed, { market: "anytime_scorer", playerId: "p2", selection: "Joueur B" }).status, "manual_review");
});

test("bloque les marchés détaillés non confirmés", () => {
  const provisionalDetails = { ...confirmed, detailsStatus: "provisional" };
  assert.equal(settleSelection(provisionalDetails, { market: "total_corners", selection: "O7.5" }).status, "pending");
});
