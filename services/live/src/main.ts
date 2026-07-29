import { NestFactory } from "@nestjs/core";
import { LiveModule } from "./live.module";

async function bootstrap() {
  const app = await NestFactory.create(LiveModule);
  const port = process.env.LIVE_SERVICE_PORT || 3001;
  await app.listen(port);
  console.log(`[Live Service] Running on port ${port}`);
}
bootstrap();
