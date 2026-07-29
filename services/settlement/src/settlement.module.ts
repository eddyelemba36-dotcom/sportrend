import { Module } from "@nestjs/common";
import { SettlementService } from "./services/settlement.service";
import { ResultVerifierService } from "./services/result-verifier.service";
import { PayoutCalculatorService } from "./services/payout-calculator.service";

@Module({
  providers: [SettlementService, ResultVerifierService, PayoutCalculatorService],
})
export class SettlementModule {}
