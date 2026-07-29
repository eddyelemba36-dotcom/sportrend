import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private requests: Map<string, number[]> = new Map();
  private limit = 60;
  private windowMs = 60000;

  use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.requests.set(ip, recent);

    if (recent.length > this.limit) {
      res.status(429).json({ success: false, error: "Too many requests", retryAfter: 60 });
      return;
    }
    next();
  }
}
