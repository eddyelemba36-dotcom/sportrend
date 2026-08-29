function integerOrNull(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function teamSide(teamId, home, away) {
  if (teamId && String(teamId) === String(home?.team?.id || home?.id)) return "home";
  if (teamId && String(teamId) === String(away?.team?.id || away?.id)) return "away";
  return null;
}

function eventType(detail) {
  const text = `${detail.type?.text || ""} ${detail.type?.name || ""} ${detail.text || ""}`.toLowerCase();
  if (/red card|carton rouge/.test(text)) return "red_card";
  if (/yellow card|carton jaune/.test(text)) return "yellow_card";
  if (/own goal/.test(text)) return "own_goal";
  if (/penalty.*goal|penalty scored/.test(text)) return "penalty_goal";
  if (/goal/.test(text) || detail.scoringPlay) return "goal";
  if (/substitution/.test(text)) return "substitution";
  return "other";
}

function normalizeStatistics(competitor) {
  const result = {};
  for (const stat of competitor?.statistics || []) {
    const key = stat.name || stat.abbreviation || stat.label;
    if (key) result[key] = stat.displayValue ?? stat.value ?? "";
  }
  return result;
}

function firstPeriodScore(competitor) {
  const value = competitor?.linescores?.[0]?.value ?? competitor?.linescores?.[0]?.displayValue;
  return integerOrNull(value);
}

function regulationScore(competitor) {
  const periods = competitor?.linescores || [];
  if (periods.length < 2) return null;
  const first = Number(periods[0]?.value ?? periods[0]?.displayValue);
  const second = Number(periods[1]?.value ?? periods[1]?.displayValue);
  return Number.isFinite(first) && Number.isFinite(second) ? first + second : null;
}

function extractESPNResultDetails(comp, home, away) {
  const events = (comp?.details || []).map((detail, index) => {
    const athlete = detail.athletes?.[0]?.athlete || detail.athletes?.[0] || detail.participants?.[0]?.athlete;
    const teamId = detail.team?.id || detail.teamId;
    return {
      id: String(detail.id || `${comp.id || "event"}-${index}`),
      type: eventType(detail),
      minute: integerOrNull(detail.clock?.value ?? detail.clock?.displayValue),
      clock: detail.clock?.displayValue || "",
      period: integerOrNull(detail.period?.number ?? detail.period),
      team: teamSide(teamId, home, away),
      playerId: athlete?.id ? String(athlete.id) : "",
      player: athlete?.displayName || athlete?.fullName || "",
      text: detail.text || detail.type?.text || "",
      homeScore: integerOrNull(detail.homeScore),
      awayScore: integerOrNull(detail.awayScore)
    };
  });

  return {
    events,
    statistics: { home: normalizeStatistics(home), away: normalizeStatistics(away) },
    halfTimeHomeScore: firstPeriodScore(home),
    halfTimeAwayScore: firstPeriodScore(away),
    regulationHomeScore: regulationScore(home),
    regulationAwayScore: regulationScore(away),
    penaltyHomeScore: integerOrNull(home?.shootoutScore),
    penaltyAwayScore: integerOrNull(away?.shootoutScore)
  };
}

module.exports = { extractESPNResultDetails, eventType, normalizeStatistics, regulationScore };
