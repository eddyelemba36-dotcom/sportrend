import { Player } from "./match.types";
export enum LiveEventType {
  GOAL = "goal",
  GOAL_OWN = "goal_own",
  GOAL_PENALTY = "goal_penalty",
  CARD_YELLOW = "card_yellow",
  CARD_RED = "card_red",
  CARD_YELLOW_RED = "card_yellow_red",
  SUBSTITUTION = "substitution",
  PENALTY_AWARDED = "penalty_awarded",
  PENALTY_MISSED = "penalty_missed",
  VAR = "var",
  VAR_OVERTURN = "var_overturn",
  CORNER = "corner",
  FOUL = "foul",
  OFFSIDE = "offside",
  HALFTIME = "halftime",
  FULLTIME = "fulltime",
  EXTRA_TIME = "extra_time",
  PENALTY_SHOOTOUT = "penalty_shootout",
  INJURY = "injury",
  MATCH_INTERRUPTED = "match_interrupted",
  MATCH_RESUMED = "match_resumed",
  PERIOD_UPDATE = "period_update",
  STATISTIC_UPDATE = "statistic_update",
}
export interface LiveEvent {
  id: string;
  matchId: string;
  type: LiveEventType;
  minute: number;
  addedTime?: number;
  period?: string;
  playerId?: string;
  playerName?: string;
  teamId: string;
  homeScore?: number;
  awayScore?: number;
  description?: string;
  timestamp: string;
}
export interface LiveScore {
  matchId: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  period: string;
  timestamp: string;
}
export interface LiveStatistic {
  matchId: string;
  possession?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
  shotsOffTarget?: { home: number; away: number };
  corners?: { home: number; away: number };
  freeKicks?: { home: number; away: number };
  goalKicks?: { home: number; away: number };
  throwIns?: { home: number; away: number };
  offsides?: { home: number; away: number };
  yellowCards?: { home: number; away: number };
  redCards?: { home: number; away: number };
  fouls?: { home: number; away: number };
  substitutions?: { home: number; away: number };
  saves?: { home: number; away: number };
  attacks?: { home: number; away: number };
  dangerousAttacks?: { home: number; away: number };
}
export interface LiveLineup {
  matchId: string;
  home: Player[];
  away: Player[];
  formation?: { home: string; away: string };
}