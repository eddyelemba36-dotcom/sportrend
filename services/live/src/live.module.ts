import { Module } from "@nestjs/common";
import { LiveSyncService } from "./services/live-sync.service";
import { LiveBroadcastService } from "./services/live-broadcast.service";
import { LiveCacheService } from "./services/live-cache.service";
import { LiveEventProcessor } from "./processors/live-event.processor";

@Module({
  providers: [LiveSyncService, LiveBroadcastService, LiveCacheService, LiveEventProcessor],
})
export class LiveModule {}
