import { NestFactory } from "@nestjs/core";
import { MatchEventsModule } from "./match-events.module";

async function bootstrap() {
  const app = await NestFactory.create(MatchEventsModule);
  const port = process.env.MATCH_EVENTS_SERVICE_PORT || 3003;
  await app.listen(port);
  console.log(`[MatchEvents Service] Running on port ${port}`);
}
bootstrap();
