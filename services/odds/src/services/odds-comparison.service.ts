import { Injectable } from "@nestjs/common";

@Injectable()
export class OddsComparisonService {
  private providers: Map<string, Map<string, { marketId: string; odds: number }>> = new Map();

  registerOdds(provider: string, matchId: string, marketId: string, odds: number) {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, new Map());
    }
    const key = `${matchId}:${marketId}`;
    this.providers.get(provider)!.set(key, { marketId, odds });
  }

  getBestOdds(matchId: string, marketId: string) {
    const key = `${matchId}:${marketId}`;
    let best = { provider: "", odds: 0 };
    for (const [provider, markets] of this.providers) {
      const entry = markets.get(key);
      if (entry && entry.odds > best.odds) {
        best = { provider, odds: entry.odds };
      }
    }
    return best;
  }
}
