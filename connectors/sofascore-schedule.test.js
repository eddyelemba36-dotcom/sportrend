const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSofaEvent, calendarDates } = require("./sofascore-schedule");

test("normalise un événement SofaScore à venir", () => {
  const match = normalizeSofaEvent({
    id: 123, startTimestamp: 1788033600, status: { type: "notstarted" },
    homeTeam: { name: "Équipe A" }, awayTeam: { name: "Équipe B" },
    tournament: { uniqueTournament: { id: 17, name: "Premier League" }, category: { country: { name: "England" } } }
  });
  assert.equal(match.id, "sofa_123");
  assert.equal(match.status, "upcoming");
  assert.equal(match.sport, "Football");
  assert.equal(match.country, "England");
  assert.equal(match.leagueId, "sofa-17");
  assert.ok(match.date && match.time);
});

test("écarte les événements terminés ou incomplets", () => {
  assert.equal(normalizeSofaEvent({ id: 1, status: { type: "finished" }, homeTeam: { name: "A" }, awayTeam: { name: "B" } }), null);
  assert.equal(normalizeSofaEvent({ id: 2 }), null);
});

test("construit une fenêtre de calendrier déterministe", () => {
  assert.deepEqual(calendarDates(3, new Date("2026-08-29T12:00:00Z")), ["2026-08-29", "2026-08-30", "2026-08-31"]);
});
