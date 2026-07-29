import { LiveEvent, LiveEventType, LiveScore, LiveStatistic } from "@odds-aggregator/shared";

interface OnexBetRawLiveEvent {
  I: number;       // Event ID
  T: number;       // Type
  M: number;       // Minute
  S1?: number;     // Home score
  S2?: number;     // Away score
  P1?: string;     // Player 1
  P2?: string;     // Player 2
  Msg?: string;    // Description
}

function detectEventType(typeCode: number): LiveEventType {
  switch (typeCode) {
    case 1: return LiveEventType.GOAL;
    case 2: return LiveEventType.GOAL_OWN;
    case 3: return LiveEventType.CARD_YELLOW;
    case 4: return LiveEventType.CARD_RED;
    case 5: return LiveEventType.SUBSTITUTION;
    case 6: return LiveEventType.PENALTY_AWARDED;
    case 7: return LiveEventType.PENALTY_MISSED;
    case 8: return LiveEventType.VAR;
    case 10: return LiveEventType.HALFTIME;
    case 11: return LiveEventType.FULLTIME;
    case 12: return LiveEventType.CORNER;
    case 13: return LiveEventType.FOUL;
    case 14: return LiveEventType.OFFSIDE;
    case 15: return LiveEventType.INJURY;
    case 20: return LiveEventType.MATCH_INTERRUPTED;
    default: return LiveEventType.PERIOD_UPDATE;
  }
}

export function parseLiveEvent(raw: OnexBetRawLiveEvent, matchId: string): LiveEvent | null {
  if (!raw.I) return null;

  return {
    id: `1xbet-live-${raw.I}`,
    matchId,
    type: detectEventType(raw.T),
    minute: raw.M || 0,
    homeScore: raw.S1,
    awayScore: raw.S2,
    playerName: raw.P1 || raw.P2,
    description: raw.Msg,
    timestamp: new Date().toISOString(),
    teamId: "",
  };
}

export function parseLiveScore(raw: any, matchId: string): LiveScore {
  return {
    matchId,
    homeScore: parseInt(raw.S1 || "0"),
    awayScore: parseInt(raw.S2 || "0"),
    minute: parseInt(raw.STM || "0"),
    period: String(raw.ST || ""),
    timestamp: new Date().toISOString(),
  };
}

export function parseLiveStatistics(raw: any, matchId: string): LiveStatistic {
  return {
    matchId,
    possession: raw.statistics?.possession ? { home: raw.statistics.possession.home, away: raw.statistics.possession.away } : undefined,
    shotsOnTarget: raw.statistics?.shotsOnTarget ? { home: raw.statistics.shotsOnTarget.home, away: raw.statistics.shotsOnTarget.away } : undefined,
    corners: raw.statistics?.corners ? { home: raw.statistics.corners.home, away: raw.statistics.corners.away } : undefined,
    yellowCards: raw.statistics?.yellowCards ? { home: raw.statistics.yellowCards.home, away: raw.statistics.yellowCards.away } : undefined,
    redCards: raw.statistics?.redCards ? { home: raw.statistics.redCards.home, away: raw.statistics.redCards.away } : undefined,
    fouls: raw.statistics?.fouls ? { home: raw.statistics.fouls.home, away: raw.statistics.fouls.away } : undefined,
    offsides: raw.statistics?.offsides ? { home: raw.statistics.offsides.home, away: raw.statistics.offsides.away } : undefined,
    substitutions: raw.statistics?.substitutions ? { home: raw.statistics.substitutions.home, away: raw.statistics.substitutions.away } : undefined,
  };
}
