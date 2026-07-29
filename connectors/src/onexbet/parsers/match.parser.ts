import { Match, MatchStatus, Team } from "@odds-aggregator/shared";
import { SPORT_1XBET_CODES } from "@odds-aggregator/shared";

interface OnexBetRawMatch {
  I: number;       // ID
  O1: string;      // Home team name
  O2: string;      // Away team name
  O1E?: string;    // Home team English name
  O2E?: string;    // Away team English name
  S1?: string;     // Home score
  S2?: string;     // Away score
  ST?: string;     // Status
  SC?: string;     // Score string
  LS?: string;     // Live status
  L?: number;      // League ID
  LE: string;      // League name
  S: number;       // Sport ID
  MS?: number;     // Match status code
  STM?: number;    // Minutes played
  ETS?: number;    // Event timestamp start
  ET?: number;     // Event timestamp
  E?: any[];       // Markets/events
}

export function parseMatch(raw: OnexBetRawMatch): Match | null {
  if (!raw.I || !raw.O1 || !raw.O2) return null;

  const sport = SPORT_1XBET_CODES[String(raw.S)] || "football";
  const isLive = raw.LS === "1" || raw.ST === "1";

  const homeTeam: Team = {
    id: `1xbet-h-${raw.I}`,
    name: raw.O1E || raw.O1,
    sport,
  };

  const awayTeam: Team = {
    id: `1xbet-a-${raw.I}`,
    name: raw.O2E || raw.O2,
    sport,
  };

  let homeScore = 0;
  let awayScore = 0;
  if (raw.SC && raw.SC.includes(":")) {
    const parts = raw.SC.split(":");
    homeScore = parseInt(parts[0]);
    awayScore = parseInt(parts[1]);
  }

  let status = MatchStatus.SCHEDULED;
  if (isLive) status = MatchStatus.LIVE;
  if (raw.MS === 3 || raw.MS === 4) status = MatchStatus.FINISHED;
  if (raw.MS === 5) status = MatchStatus.POSTPONED;

  return {
    id: `1xbet-${raw.I}`,
    providerId: String(raw.I),
    providerName: "1xbet",
    competitionId: String(raw.L || 0),
    competitionName: raw.LE || "",
    sport,
    homeTeam,
    awayTeam,
    status,
    startTime: raw.ETS ? new Date(raw.ETS * 1000).toISOString() : new Date().toISOString(),
    homeScore: isLive ? homeScore : undefined,
    awayScore: isLive ? awayScore : undefined,
    minute: raw.STM || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function parseMatches(rawData: any[]): Match[] {
  const matches: Match[] = [];
  for (const raw of rawData) {
    const parsed = parseMatch(raw);
    if (parsed) matches.push(parsed);
  }
  return matches;
}
