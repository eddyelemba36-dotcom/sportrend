const test = require("node:test");
const assert = require("node:assert/strict");
const { currentEuropeanSeason, buildElo, eloOdds, normalizeMatch } = require("./openfootball-schedule");

test("calcule la saison européenne courante", () => {
  assert.equal(currentEuropeanSeason(new Date("2026-08-29T00:00:00Z")), "2026-27");
  assert.equal(currentEuropeanSeason(new Date("2027-03-01T00:00:00Z")), "2026-27");
});

test("normalise uniquement une rencontre future non jouée", () => {
  const now = new Date("2026-08-29T10:00:00Z");
  const result = normalizeMatch({
    round: "Matchday 2", date: "2026-08-30", time: "14:00",
    team1: "Chelsea FC", team2: "Arsenal FC",
  }, "Premier League 2026/27", now);
  assert.equal(result.fields.status, "upcoming");
  assert.equal(result.fields.startTime, "2026-08-30T14:00:00.000Z");
  assert.equal(result.fields.source, "openfootball");
  assert.match(result.fields.odds1, /^\d+\.\d{2}$/);
  assert.equal(result.fields.oddsOrigin, "model");
});

test("le modèle Elo favorise une équipe historiquement plus forte", () => {
  const ratings = buildElo([
    { date: "2026-01-01", team1: "Fort", team2: "Faible", score: { ft: [4, 0] } },
    { date: "2026-02-01", team1: "Fort", team2: "Faible", score: { ft: [3, 0] } },
    { date: "2026-03-01", team1: "Faible", team2: "Fort", score: { ft: [0, 2] } },
  ]);
  const odds = eloOdds("Fort", "Faible", ratings);
  assert.ok(Number(odds.odds1) < Number(odds.odds2));
  const implied = 1 / odds.odds1 + 1 / odds.oddsX + 1 / odds.odds2;
  assert.ok(implied > 1.06 && implied < 1.08);
});

test("rejette les résultats et les rencontres passées", () => {
  const now = new Date("2026-08-29T10:00:00Z");
  assert.equal(normalizeMatch({ date: "2026-08-28", team1: "A", team2: "B" }, "League", now), null);
  assert.equal(normalizeMatch({ date: "2026-08-30", team1: "A", team2: "B", score: { ft: [1, 0] } }, "League", now), null);
});
