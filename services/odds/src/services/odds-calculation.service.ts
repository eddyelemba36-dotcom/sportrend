import { Injectable } from "@nestjs/common";
import { calculateImpliedProbability, calculateOverround, normalizeOdds } from "@odds-aggregator/shared";

@Injectable()
export class OddsCalculationService {
  calculateFairValue(odds1: number, odds2: number, odds3?: number): { fair: number[]; overround: number } {
    const overround = calculateOverround(odds1, odds2, odds3);
    const probs = [
      calculateImpliedProbability(odds1),
      calculateImpliedProbability(odds2),
      odds3 ? calculateImpliedProbability(odds3) : 0,
    ];
    const fairProbs = probs.map((p) => p / (1 + overround / 100));
    return { fair: fairProbs, overround };
  }

  normalize(odds: number): number {
    return normalizeOdds(odds);
  }

  compareOdds(oddsList: { provider: string; odds: number }[]): { best: number; worst: number; average: number } {
    const values = oddsList.map((o) => o.odds);
    return {
      best: Math.max(...values),
      worst: Math.min(...values),
      average: values.reduce((a, b) => a + b, 0) / values.length,
    };
  }
}
