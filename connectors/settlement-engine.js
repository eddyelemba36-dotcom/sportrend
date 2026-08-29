function outcome(home, away) {
  return home > away ? "1" : home < away ? "2" : "X";
}

function pending(reason) {
  return { status: "pending", reason };
}

function settleOverUnder(total, selection, line) {
  const normalizedSelection = String(selection || "").toUpperCase();
  const parsedLine = Number.parseFloat(line ?? normalizedSelection.replace(/^[OU]/, ""));
  if (!Number.isFinite(parsedLine)) return { status: "manual_review", reason: "invalid_total_line" };
  if (total === parsedLine) return { status: "void", reason: "total_push" };
  const isOver = normalizedSelection.startsWith("O") || normalizedSelection === "OVER";
  const isUnder = normalizedSelection.startsWith("U") || normalizedSelection === "UNDER";
  if (!isOver && !isUnder) return { status: "manual_review", reason: "invalid_total_selection" };
  return { status: (isOver ? total > parsedLine : total < parsedLine) ? "won" : "lost", reason: "settled_from_confirmed_details" };
}

function statisticValue(statistics, side, aliases) {
  const stats = statistics?.[side] || {};
  const key = Object.keys(stats).find(name => aliases.includes(name.toLowerCase().replace(/[^a-z]/g, "")));
  if (!key) return null;
  const value = Number.parseFloat(String(stats[key]).replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function settleSelection(result, { market, selection, line, playerId, player }) {
  if (!result || result.resultStatus !== "confirmed") return pending("result_not_confirmed");
  const home = result.regulation.home;
  const away = result.regulation.away;
  if (!Number.isFinite(home) || !Number.isFinite(away)) return pending("regulation_score_missing");

  const normalizedMarket = String(market || "").toLowerCase();
  const normalizedSelection = String(selection || "").toUpperCase();
  const resultOutcome = outcome(home, away);
  let won;

  if (["1x2", "ml", "moneyline"].includes(normalizedMarket)) {
    won = normalizedSelection === resultOutcome;
  } else if (["double_chance", "dc"].includes(normalizedMarket)) {
    const accepted = normalizedSelection.replace("N", "X").split("");
    won = accepted.includes(resultOutcome);
  } else if (["bts", "both_teams_to_score"].includes(normalizedMarket)) {
    const bothScored = home > 0 && away > 0;
    won = ["GG", "YES", "OUI"].includes(normalizedSelection) ? bothScored : !bothScored;
  } else if (["exact", "exact_score"].includes(normalizedMarket)) {
    won = normalizedSelection === `${home}-${away}`;
  } else if (["dnb", "draw_no_bet"].includes(normalizedMarket)) {
    if (resultOutcome === "X") return { status: "void", reason: "draw_refund" };
    won = normalizedSelection === resultOutcome;
  } else if (["ou", "total", "over_under"].includes(normalizedMarket)) {
    return settleOverUnder(home + away, normalizedSelection, line);
  } else if (["half_time_1x2", "ht_1x2"].includes(normalizedMarket)) {
    if (result.detailsStatus !== "confirmed") return pending("details_not_confirmed");
    if (!Number.isFinite(result.halfTime.home) || !Number.isFinite(result.halfTime.away)) return pending("half_time_score_missing");
    won = normalizedSelection === outcome(result.halfTime.home, result.halfTime.away);
  } else if (["half_time_total", "ht_total"].includes(normalizedMarket)) {
    if (result.detailsStatus !== "confirmed") return pending("details_not_confirmed");
    if (!Number.isFinite(result.halfTime.home) || !Number.isFinite(result.halfTime.away)) return pending("half_time_score_missing");
    return settleOverUnder(result.halfTime.home + result.halfTime.away, normalizedSelection, line);
  } else if (["total_corners", "home_corners", "away_corners"].includes(normalizedMarket)) {
    if (result.detailsStatus !== "confirmed") return pending("details_not_confirmed");
    const aliases = ["corners", "cornerkicks", "woncorners"];
    const homeCorners = statisticValue(result.statistics, "home", aliases);
    const awayCorners = statisticValue(result.statistics, "away", aliases);
    if (homeCorners === null || awayCorners === null) return pending("corner_statistics_missing");
    const total = normalizedMarket === "home_corners" ? homeCorners : normalizedMarket === "away_corners" ? awayCorners : homeCorners + awayCorners;
    return settleOverUnder(total, normalizedSelection, line);
  } else if (["yellow_cards", "red_cards"].includes(normalizedMarket)) {
    if (result.detailsStatus !== "confirmed") return pending("details_not_confirmed");
    const eventType = normalizedMarket === "yellow_cards" ? "yellow_card" : "red_card";
    return settleOverUnder(result.events.filter(event => event.type === eventType).length, normalizedSelection, line);
  } else if (["anytime_scorer", "goalscorer"].includes(normalizedMarket)) {
    if (result.detailsStatus !== "confirmed") return pending("details_not_confirmed");
    const scorer = result.events.some(event => ["goal", "penalty_goal"].includes(event.type) &&
      (playerId ? String(event.playerId) === String(playerId) : event.player.toLowerCase() === String(player || selection || "").toLowerCase()));
    if (scorer) return { status: "won", reason: "confirmed_goal_event" };
    return { status: "manual_review", reason: "player_participation_not_available" };
  } else {
    return { status: "manual_review", reason: "unsupported_market" };
  }

  return { status: won ? "won" : "lost", reason: "settled_from_confirmed_regulation_result" };
}

module.exports = { settleSelection, outcome };
