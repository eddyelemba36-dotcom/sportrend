const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMatchMetadata, normalizeStartTime } = require("./match-normalizer");

test("normalise sport, pays et identifiant de championnat", () => {
  assert.deepEqual(normalizeMatchMetadata({ sport: "soccer", competition: "France: Ligue 1" }), {
    sport: "Football", country: "France",
    leagueId: "football-france-ligue-1", startTime: "", date: "", time: ""
  });
});

test("déduit les sports non-football depuis la compétition", () => {
  assert.equal(normalizeMatchMetadata({ competition: "KBO" }).sport, "Baseball");
  assert.equal(normalizeMatchMetadata({ competition: "UFC Fight Night" }).sport, "MMA");
});

test("convertit les timestamps secondes et conserve les valeurs inconnues vides", () => {
  assert.equal(normalizeStartTime(1700000000), "2023-11-14T22:13:20.000Z");
  assert.equal(normalizeStartTime("heure inconnue"), "");
});

test("convertit le format calendrier BetExplorer", () => {
  const metadata = normalizeMatchMetadata({ competition: "France: Ligue 1", startTime: "29,08,2026,20,45" });
  assert.equal(metadata.startTime, "2026-08-29T20:45:00.000Z");
  assert.equal(metadata.date, "2026-08-29");
  assert.equal(metadata.time, "20:45");
});
