const test = require("node:test");
const assert = require("node:assert/strict");
const { parseClock, enrichLiveState } = require("./live-market-state");

test("lit une horloge officielle sans l'estimer", () => {
  assert.deepEqual(parseClock("67:24"), { minute: 67, second: 24 });
});

test("ouvre les marchés lorsque horloge et données sont fraîches", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");
  const match = enrichLiveState({ status: "live", matchClock: "42:10", period: "1H", updatedAt: "2026-08-29T11:59:30Z" }, { now });
  assert.equal(match.marketStatus, "open");
  assert.equal(match.liveMinute, 42);
  assert.equal(match.suspensionReason, null);
});

test("suspend un live périmé", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");
  const match = enrichLiveState({ status: "live", matchClock: "42:10", updatedAt: "2026-08-29T11:55:00Z" }, { now });
  assert.equal(match.marketStatus, "suspended");
  assert.equal(match.suspensionReason, "stale_data");
});

test("suspend un live sans horloge officielle", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");
  const match = enrichLiveState({ status: "live", updatedAt: "2026-08-29T11:59:45Z" }, { now });
  assert.equal(match.marketStatus, "suspended");
  assert.equal(match.suspensionReason, "missing_official_clock");
});
