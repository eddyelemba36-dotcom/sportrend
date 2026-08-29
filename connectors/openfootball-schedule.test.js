const test = require("node:test");
const assert = require("node:assert/strict");
const { currentEuropeanSeason, normalizeMatch } = require("./openfootball-schedule");

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
});

test("rejette les résultats et les rencontres passées", () => {
  const now = new Date("2026-08-29T10:00:00Z");
  assert.equal(normalizeMatch({ date: "2026-08-28", team1: "A", team2: "B" }, "League", now), null);
  assert.equal(normalizeMatch({ date: "2026-08-30", team1: "A", team2: "B", score: { ft: [1, 0] } }, "League", now), null);
});
