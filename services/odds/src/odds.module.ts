import { Module } from "@nestjs/common";
import { OddsCalculationService } from "./services/odds-calculation.service";
import { OddsComparisonService } from "./services/odds-comparison.service";
import { OddsCacheService } from "./services/odds-cache.service";
import { OddsUpdateProcessor } from "./processors/odds-update.processor";

@Module({
  providers: [OddsCalculationService, OddsComparisonService, OddsCacheService, OddsUpdateProcessor],
})
export class OddsModule {}
