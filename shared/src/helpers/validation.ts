export function isValidMatch(match: any): boolean {
  return !!(
    match &&
    match.id &&
    match.homeTeam &&
    match.awayTeam &&
    match.startTime &&
    match.sport
  );
}

export function isValidMarket(market: any): boolean {
  return !!(
    market &&
    market.type &&
    market.outcomes &&
    Array.isArray(market.outcomes) &&
    market.outcomes.length > 0
  );
}

export function isValidOdds(odds: number): boolean {
  return typeof odds === "number" && odds > 1 && odds < 1000;
}

export function sanitizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
