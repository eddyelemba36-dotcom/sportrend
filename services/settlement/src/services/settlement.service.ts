import { Injectable } from "@nestjs/common";

@Injectable()
export class SettlementService {
  private pendingSettlements: Map<string, any> = new Map();

  async settle(matchId: string, score: { home: number; away: number }) {
    const settlement = {
      matchId,
      score,
      status: "settled",
      settledAt: new Date().toISOString(),
    };
    this.pendingSettlements.set(matchId, settlement);
    return settlement;
  }

  async getSettlement(matchId: string) {
    return this.pendingSettlements.get(matchId) || null;
  }
}
