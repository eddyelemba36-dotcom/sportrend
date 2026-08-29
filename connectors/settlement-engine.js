function outcome(home, away) {
  return home > away ? "1" : home < away ? "2" : "X";
}

function pending(reason) {
  return { status: "pending", reason };
}

function settleSelection(result, { market, selection, line }) {
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
    const parsedLine = Number.parseFloat(line ?? normalizedSelection.replace(/^[OU]/, ""));
    if (!Number.isFinite(parsedLine)) return { status: "manual_review", reason: "invalid_total_line" };
    const goals = home + away;
    if (goals === parsedLine) return { status: "void", reason: "total_push" };
    const isOver = normalizedSelection.startsWith("O") || normalizedSelection === "OVER";
    const isUnder = normalizedSelection.startsWith("U") || normalizedSelection === "UNDER";
    if (!isOver && !isUnder) return { status: "manual_review", reason: "invalid_total_selection" };
    won = isOver ? goals > parsedLine : goals < parsedLine;
  } else {
    return { status: "manual_review", reason: "unsupported_market" };
  }

  return { status: won ? "won" : "lost", reason: "settled_from_confirmed_regulation_result" };
}

module.exports = { settleSelection, outcome };
