import { Injectable } from "@nestjs/common";

@Injectable()
export class StatsProcessorService {
  async processStats(matchId: string, stats: any) {
    console.log(`[StatsProcessor] Processing stats for match ${matchId}`);
    return { processed: true, matchId };
  }
}
