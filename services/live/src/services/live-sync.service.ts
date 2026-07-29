import { Injectable, OnModuleInit } from "@nestjs/common";

@Injectable()
export class LiveSyncService implements OnModuleInit {
  async onModuleInit() {
    console.log("[LiveSync] Initialized");
  }

  async syncMatch(matchId: string) {
    return { matchId, synced: true };
  }

  async getLiveMatches() {
    return [];
  }
}
