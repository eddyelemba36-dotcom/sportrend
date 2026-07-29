import { Injectable } from "@nestjs/common";

@Injectable()
export class PayoutCalculatorService {
  calculateWin(stake: number, odds: number): number {
    return Math.round(stake * odds * 100) / 100;
  }

  calculateParlay(stake: number, selections: { odds: number; won: boolean }[]): number {
    if (selections.some((s) => !s.won)) return 0;
    const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
    return Math.round(stake * totalOdds * 100) / 100;
  }

  calculateCashout(stake: number, currentOdds: number, originalOdds: number): number {
    if (currentOdds >= originalOdds) return 0;
    const ratio = 1 - currentOdds / originalOdds;
    return Math.round(stake * ratio * 100) / 100;
  }
}
