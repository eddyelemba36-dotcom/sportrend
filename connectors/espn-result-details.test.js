const test = require("node:test");
const assert = require("node:assert/strict");
const { extractESPNResultDetails } = require("./espn-result-details");

test("normalise événements, statistiques et scores par période ESPN", () => {
  const home = { team: { id: "h" }, linescores: [{ value: 1 }, { value: 1 }], shootoutScore: "4", statistics: [{ name: "corners", displayValue: "6" }] };
  const away = { team: { id: "a" }, linescores: [{ value: 0 }, { value: 1 }], shootoutScore: "3", statistics: [{ name: "corners", displayValue: "2" }] };
  const details = extractESPNResultDetails({ id: "m", details: [{
    id: "g1", scoringPlay: true, team: { id: "h" }, clock: { value: 31, displayValue: "31'" },
    period: { number: 1 }, athletes: [{ athlete: { id: "p1", displayName: "Joueur A" } }],
    homeScore: 1, awayScore: 0, text: "Goal"
  }, {
    id: "c1", team: { id: "a" }, clock: { value: 70, displayValue: "70'" }, type: { text: "Red Card" }
  }] }, home, away);

  assert.equal(details.events[0].type, "goal");
  assert.equal(details.events[0].team, "home");
  assert.equal(details.events[0].player, "Joueur A");
  assert.equal(details.events[1].type, "red_card");
  assert.equal(details.statistics.home.corners, "6");
  assert.equal(details.halfTimeHomeScore, 1);
  assert.equal(details.regulationHomeScore, 2);
  assert.equal(details.penaltyAwayScore, 3);
});
