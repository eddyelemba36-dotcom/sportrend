import { Market, MarketType, Outcome } from "@odds-aggregator/shared";

interface OnexBetRawMarket {
  G: number;       // Group/type
  T: string;       // Type name
  C: number;       // ??
  E: OnexBetRawOutcome[];  // Outcomes
}

interface OnexBetRawOutcome {
  C: number;       // Outcome ID
  P: number;       // Price/odds
  K: number;       // ??
  T: number;       // Team side (1=home, 2=away, 0=draw)
  N?: string;      // Name
  PE?: number;     // Previous odds?
}

function detectMarketType(group: number, typeName: string): MarketType {
  const name = typeName.toLowerCase();

  if (group === 1 || name.includes("1x2") || name.includes("match winner")) {
    return MarketType.ONE_X_TWO;
  }
  if (name.includes("double chance") || name.includes("12")) {
    return MarketType.DOUBLE_CHANCE;
  }
  if (name.includes("over/under") || name.includes("total") || name.startsWith("over")) {
    return MarketType.OVER_UNDER;
  }
  if (name.includes("handicap") || name.includes("asian")) {
    return MarketType.HANDICAP;
  }
  if (name.includes("both teams") || name.includes("btts")) {
    return MarketType.BTTS;
  }
  if (name.includes("correct score") || name.includes("exact")) {
    return MarketType.EXACT_SCORE;
  }
  if (name.includes("half time") && (name.includes("1x2") || name.includes("winner"))) {
    return MarketType.HALF_TIME;
  }
  if (name.includes("total corners") || name.includes("corners")) {
    return MarketType.TOTAL_CORNERS;
  }
  if (name.includes("cards") || name.includes("yellow")) {
    return MarketType.TOTAL_CARDS;
  }
  if (name.includes("player") && name.includes("score") || name.includes("scorer")) {
    return MarketType.PLAYER_TO_SCORE;
  }
  if (name.includes("odd/even") || name.includes("odd even")) {
    return MarketType.GOALS_ODD_EVEN;
  }
  if (name.includes("draw no bet") || name.includes("dnb")) {
    return MarketType.DRAW_NO_BET;
  }
  if (name.includes("halftime/fulltime") || name.includes("ht/ft")) {
    return MarketType.HALF_TIME_FULL_TIME;
  }

  return MarketType.ONE_X_TWO;
}

function parseOutcome(raw: OnexBetRawOutcome, matchId: string, marketIdx: number): Outcome {
  let name = "";
  if (raw.T === 1) name = "1";
  else if (raw.T === 2) name = "2";
  else if (raw.T === 3 || raw.T === 0) name = "X";
  else name = raw.N || String(raw.C);

  const odds = raw.P > 0 ? raw.P / 1000 : 1.0;

  return {
    id: `1xbet-${matchId}-m${marketIdx}-o${raw.C}`,
    name,
    odds: odds,
    oddsDecimal: odds,
    isActive: odds > 1,
  };
}

export function parseMarkets(rawData: OnexBetRawMarket[], matchId: string): Market[] {
  const markets: Market[] = [];
  const seen = new Set<string>();

  for (let mi = 0; mi < rawData.length && mi < 30; mi++) {
    const raw = rawData[mi];
    if (!raw.E || !Array.isArray(raw.E) || raw.E.length === 0) continue;

    const marketType = detectMarketType(raw.G, raw.T || "");
    const key = marketType;
    if (seen.has(key)) continue;
    seen.add(key);

    const outcomes = raw.E.map((o) => parseOutcome(o, matchId, mi));
    if (outcomes.length < 2) continue;

    let outcomeName = raw.T || "";
    const market: Market = {
      id: `1xbet-${matchId}-m${mi}`,
      matchId: `1xbet-${matchId}`,
      type: marketType,
      name: outcomeName,
      outcomes,
      isLive: false,
      isSuspended: false,
      settled: false,
      updatedAt: new Date().toISOString(),
    };

    markets.push(market);
  }

  return markets;
}

export function extractOddsValue(raw: any): number {
  if (raw.P) return raw.P / 1000;
  if (raw.C) return raw.C / 1000;
  return 1.0;
}
