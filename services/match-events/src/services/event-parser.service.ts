import { Injectable } from "@nestjs/common";
import { LiveEvent, LiveEventType } from "@odds-aggregator/shared";

@Injectable()
export class EventParserService {
  parse(rawEvent: any): LiveEvent | null {
    if (!rawEvent || !rawEvent.type) return null;
    return {
      id: rawEvent.id || `evt-${Date.now()}`,
      matchId: rawEvent.matchId,
      type: rawEvent.type as LiveEventType,
      minute: rawEvent.minute || 0,
      playerName: rawEvent.playerName,
      teamId: rawEvent.teamId || "",
      homeScore: rawEvent.homeScore,
      awayScore: rawEvent.awayScore,
      description: rawEvent.description,
      timestamp: new Date().toISOString(),
    };
  }

  parseBatch(rawEvents: any[]): LiveEvent[] {
    return rawEvents.map((e) => this.parse(e)).filter((e): e is LiveEvent => e !== null);
  }
}
