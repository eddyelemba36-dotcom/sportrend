import { Module } from "@nestjs/common";
import { StatsAggregatorService } from "./services/stats-aggregator.service";
import { StatsCacheService } from "./services/stats-cache.service";
import { StatsProcessorService } from "./services/stats-processor.service";

@Module({
  providers: [StatsAggregatorService, StatsCacheService, StatsProcessorService],
})
export class StatisticsModule {}
