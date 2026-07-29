import { NestFactory } from "@nestjs/core";
import { StatisticsModule } from "./statistics.module";

async function bootstrap() {
  const app = await NestFactory.create(StatisticsModule);
  const port = process.env.STATISTICS_SERVICE_PORT || 3004;
  await app.listen(port);
  console.log(`[Statistics Service] Running on port ${port}`);
}
bootstrap();
