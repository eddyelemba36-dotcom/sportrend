import { NestFactory } from "@nestjs/core";
import { SettlementModule } from "./settlement.module";

async function bootstrap() {
  const app = await NestFactory.create(SettlementModule);
  const port = process.env.SETTLEMENT_SERVICE_PORT || 3005;
  await app.listen(port);
  console.log(`[Settlement Service] Running on port ${port}`);
}
bootstrap();
