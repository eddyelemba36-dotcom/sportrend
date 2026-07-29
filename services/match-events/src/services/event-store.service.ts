import { Injectable } from "@nestjs/common";
import { LiveEvent } from "@odds-aggregator/shared";

@Injectable()
export class EventStoreService {
  private events: Map<string, LiveEvent[]> = new Map();

  store(event: LiveEvent) {
    const matchEvents = this.events.get(event.matchId) || [];
    matchEvents.push(event);
    this.events.set(event.matchId, matchEvents);
  }

  getMatchEvents(matchId: string): LiveEvent[] {
    return this.events.get(matchId) || [];
  }

  getMatchEventsByType(matchId: string, type: string): LiveEvent[] {
    return (this.events.get(matchId) || []).filter((e) => e.type === type);
  }

  cleanMatch(matchId: string) {
    this.events.delete(matchId);
  }
}
