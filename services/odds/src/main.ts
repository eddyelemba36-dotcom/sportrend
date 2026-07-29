import { NestFactory } from "@nestjs/core";
import { OddsModule } from "./odds.module";

async function bootstrap() {
  const app = await NestFactory.create(OddsModule);
  const port = process.env.ODDS_SERVICE_PORT || 3002;
  await app.listen(port);
  console.log(`[Odds Service] Running on port ${port}`);
}
bootstrap();
