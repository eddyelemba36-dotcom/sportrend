function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildOfficialResult(match) {
  const finished = match.status === "finished";
  const confirmed = finished && match.resultStatus === "confirmed" && Boolean(match.resultConfirmedAt);
  const resultStatus = confirmed ? "confirmed"
    : (finished && match.resultStatus === "conflict" ? "conflict" : (finished ? "provisional" : "pending"));
  return {
    matchId: match.id,
    sport: match.sport || "",
    competition: match.competition || "",
    homeTeam: match.homeTeam || "",
    awayTeam: match.awayTeam || "",
    status: match.status || "unknown",
    resultStatus,
    detailsStatus: match.detailsStatus === "confirmed" && match.detailsConfirmedAt ? "confirmed" : (finished ? "provisional" : "pending"),
    regulation: {
      home: numberOrNull(match.regulationHomeScore ?? match.homeScore),
      away: numberOrNull(match.regulationAwayScore ?? match.awayScore)
    },
    halfTime: { home: numberOrNull(match.halfTimeHomeScore), away: numberOrNull(match.halfTimeAwayScore) },
    extraTime: { home: numberOrNull(match.extraTimeHomeScore), away: numberOrNull(match.extraTimeAwayScore) },
    penalties: { home: numberOrNull(match.penaltyHomeScore), away: numberOrNull(match.penaltyAwayScore) },
    final: { home: numberOrNull(match.finalHomeScore ?? match.homeScore), away: numberOrNull(match.finalAwayScore ?? match.awayScore) },
    events: jsonArray(match.events),
    statistics: match.statistics ? (() => { try { return JSON.parse(match.statistics); } catch { return {}; } })() : {},
    confirmedAt: confirmed ? match.resultConfirmedAt : null,
    detailsConfirmedAt: match.detailsStatus === "confirmed" ? (match.detailsConfirmedAt || null) : null,
    sources: jsonArray(match.resultSources),
    revision: numberOrNull(match.resultRevision) || 0
  };
}

module.exports = { buildOfficialResult, numberOrNull, jsonArray };
