import { Injectable } from "@nestjs/common";
import { MatchStatistics } from "@odds-aggregator/shared";

@Injectable()
export class StatsAggregatorService {
  private stats: Map<string, MatchStatistics> = new Map();

  update(matchId: string, partial: Partial<MatchStatistics>) {
    const current = this.stats.get(matchId) || { matchId };
    this.stats.set(matchId, { ...current, ...partial });
  }

  get(matchId: string): MatchStatistics | null {
    return this.stats.get(matchId) || null;
  }

  average(match: { home: number; away: number }): number {
    return (match.home + match.away) / 2;
  }

  percentage(match: { home: number; away: number }): { homePct: number; awayPct: number } {
    const total = match.home + match.away;
    if (total === 0) return { homePct: 50, awayPct: 50 };
    return {
      homePct: Math.round((match.home / total) * 100),
      awayPct: Math.round((match.away / total) * 100),
    };
  }
}
