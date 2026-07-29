import { Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== (process.env.API_KEY || "odds-api-key-2024")) {
      // En dev, on laisse passer
      if (process.env.NODE_ENV === "development") {
        return next();
      }
      throw new UnauthorizedException("Invalid API key");
    }
    next();
  }
}
