import { MarketType } from "./market.types";
export enum MatchStatus {
  SCHEDULED = "scheduled",
  LIVE = "live",
  HALFTIME = "halftime",
  FINISHED = "finished",
  POSTPONED = "postponed",
  CANCELLED = "cancelled",
  INTERRUPTED = "interrupted",
}

export interface Team {
  id: string;
  name: string;
  shortName?: string;
  logo?: string;
  country?: string;
  sport: string;
}

export interface Player {
  id: string;
  name: string;
  number?: number;
  position?: string;
  teamId: string;
  nationality?: string;
}

export interface Competition {
  id: string;
  name: string;
  sport: string;
  country?: string;
  logo?: string;
  season?: string;
  category: "league" | "cup" | "tournament";
}

export interface Match {
  id: string;
  providerId: string;
  providerName: string;
  competitionId: string;
  competitionName: string;
  sport: string;
  homeTeam: Team;
  awayTeam: Team;
  status: MatchStatus;
  startTime: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  period?: string;
  markets?: Market[];
  createdAt: string;
  updatedAt: string;
}

export interface Market {
  id: string;
  matchId: string;
  type: MarketType;
  name: string;
  specifier?: string;
  outcomes: Outcome[];
  isLive: boolean;
  isSuspended: boolean;
  settled: boolean;
  updatedAt: string;
}

export interface Outcome {
  id: string;
  name: string;
  odds: number;
  oddsDecimal: number;
  probability?: number;
  isActive: boolean;
}

export interface Odds {
  marketId: string;
  outcomeId: string;
  matchId: string;
  provider: string;
  odds: number;
  oddsDecimal: number;
  probability?: number;
  timestamp: string;
}

export interface MatchStatistics {
  matchId: string;
  possession?: { home: number; away: number };
  shotsTotal?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
  corners?: { home: number; away: number };
  yellowCards?: { home: number; away: number };
  redCards?: { home: number; away: number };
  fouls?: { home: number; away: number };
  offsides?: { home: number; away: number };
  substitutions?: { home: number; away: number };
  injuries?: { home: number; away: number };
  attack?: { home: number; away: number };
  dangerousAttack?: { home: number; away: number };
}
