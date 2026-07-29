import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { createClient } from "redis";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Redis client for API routes
  const redis = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
  redis.on("error", (e) => console.error("[Redis]", e.message));
  await redis.connect();
  console.log("[Redis] Connected to API");

  // Store redis on app for controllers
  (app as any).redis = redis;

  const port = process.env.GATEWAY_PORT || 3000;
  await app.listen(port);
  console.log("[Gateway] Running on port " + port);
}
bootstrap();
