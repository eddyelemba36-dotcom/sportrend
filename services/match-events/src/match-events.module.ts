import { Module } from "@nestjs/common";
import { EventParserService } from "./services/event-parser.service";
import { EventStoreService } from "./services/event-store.service";
import { EventCacheService } from "./services/event-cache.service";

@Module({
  providers: [EventParserService, EventStoreService, EventCacheService],
})
export class MatchEventsModule {}
