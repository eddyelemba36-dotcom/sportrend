const DEFAULT_STALE_AFTER_MS = 90_000;

function parseClock(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return { minute: Math.max(0, Math.floor(value)), second: 0 };
  const text = String(value).trim();
  const clock = text.match(/^(\d{1,3})(?::(\d{1,2}))?/);
  if (!clock) return null;
  return { minute: Number(clock[1]), second: Number(clock[2] || 0) };
}

function enrichLiveState(match, options = {}) {
  const enriched = { ...match };
  if (match.status !== "live") {
    enriched.marketStatus = match.status === "finished" ? "closed" : "open";
    enriched.dataFreshness = "not-live";
    enriched.suspensionReason = null;
    return enriched;
  }

  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const timestampValue = match.lastEventAt || match.updatedAt;
  const timestamp = timestampValue ? Date.parse(timestampValue) : NaN;
  const ageMs = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null;
  const clock = parseClock(match.matchClock || match.liveMinute || match.minute);

  enriched.matchClock = clock ? `${clock.minute}:${String(clock.second).padStart(2, "0")}` : "";
  enriched.liveMinute = clock ? clock.minute : null;
  enriched.period = match.period || "";
  enriched.sequence = match.sequence || "";
  enriched.lastEventAt = match.lastEventAt || "";
  enriched.dataAgeMs = ageMs;
  enriched.liveScoreAdjusted = false;

  if (ageMs === null) {
    enriched.dataFreshness = "unknown";
    enriched.marketStatus = "suspended";
    enriched.suspensionReason = "missing_timestamp";
  } else if (ageMs > staleAfterMs) {
    enriched.dataFreshness = "stale";
    enriched.marketStatus = "suspended";
    enriched.suspensionReason = "stale_data";
  } else if (!clock) {
    enriched.dataFreshness = "fresh";
    enriched.marketStatus = "suspended";
    enriched.suspensionReason = "missing_official_clock";
  } else {
    enriched.dataFreshness = "fresh";
    enriched.marketStatus = "open";
    enriched.suspensionReason = null;
  }
  return enriched;
}

module.exports = { DEFAULT_STALE_AFTER_MS, parseClock, enrichLiveState };
