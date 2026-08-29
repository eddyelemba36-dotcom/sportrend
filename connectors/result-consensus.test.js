const test = require("node:test");
const assert = require("node:assert/strict");
const { fixtureIdentity, resolveResultConsensus } = require("./result-consensus");

const base = { sport: "Football", homeTeam: "Paris SG", awayTeam: "Lyon", startTime: "2026-08-29T20:00:00Z" };
const candidate = (provider, homeScore, awayScore) => ({ ...base, provider, matchKey: `match:${provider}`, homeScore, awayScore });

test("produit une identité stable de rencontre", () => {
  assert.equal(fixtureIdentity(base), "football-paris-sg-lyon-2026-08-29");
});

test("confirme deux fournisseurs distincts avec le même score", () => {
  const result = resolveResultConsensus([candidate("espn", 2, 1), candidate("betexplorer", 2, 1)]);
  assert.equal(result.status, "confirmed");
  assert.deepEqual(result.providers, ["betexplorer", "espn"]);
});

test("ne compte pas deux fois le même fournisseur", () => {
  const result = resolveResultConsensus([candidate("espn", 2, 1), candidate("espn", 2, 1)]);
  assert.equal(result.status, "pending");
});

test("signale les scores contradictoires", () => {
  const result = resolveResultConsensus([candidate("espn", 2, 1), candidate("betexplorer", 1, 1)]);
  assert.equal(result.status, "conflict");
});
