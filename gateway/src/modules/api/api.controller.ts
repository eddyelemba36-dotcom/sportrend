import { Controller, Get, Param, Query, Injectable } from "@nestjs/common";
import { createClient } from "redis";

@Injectable()
class RedisService {
  private client;

  async onModuleInit() {
    this.client = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
    this.client.on("error", (e) => console.error("[Redis]", e.message));
    await this.client.connect();
    console.log("[Redis] Connected");
  }

  async getMatch(id: string) {
    if (!this.client) await this.onModuleInit();
    const exists = await this.client.exists("match:" + id);
    if (!exists) return null;
    const data = await this.client.hGetAll("match:" + id);
    return data;
  }

  async getAllMatches() {
    if (!this.client) await this.onModuleInit();
    const keys = await this.client.keys("match:*");
    const matches = [];
    for (const key of keys) {
      const data = await this.client.hGetAll(key);
      matches.push(data);
    }
    return matches;
  }

  async getMatchesBySource(source: string) {
    if (!this.client) await this.onModuleInit();
    const keys = await this.client.sMembers("matches:" + source);
    const matches = [];
    for (const key of keys) {
      const data = await this.client.hGetAll(key);
      if (data && data.id) matches.push(data);
    }
    return matches;
  }

  async getCompetitions() {
    if (!this.client) await this.onModuleInit();
    const keys = await this.client.keys("match:*");
    const comps = new Set<string>();
    for (const key of keys) {
      const data = await this.client.hGetAll(key);
      if (data.competition) comps.add(data.competition);
    }
    return [...comps].map((c) => ({ name: c, id: c.replace(/[^a-z0-9]/gi, "_").toLowerCase() }));
  }

  async getLiveNow() {
    if (!this.client) await this.onModuleInit();
    const keys = await this.client.keys("match:*");
    const live = [];
    for (const key of keys) {
      const data = await this.client.hGetAll(key);
      if (data.homeScore || data.awayScore) {
        // Has a score = likely live
        live.push(data);
      }
    }
    return live;
  }
}

@Controller("api/v1")
export class ApiController {
  private redis: RedisService;

  constructor() {
    this.redis = new RedisService();
  }

  @Get("matches")
  async getMatches(@Query() query: any) {
    try {
      const source = query.source as string;
      const matches = source ? await this.redis.getMatchesBySource(source) : await this.redis.getAllMatches();
      return { success: true, data: matches, count: matches.length };
    } catch (e) {
      return { success: false, error: e.message, data: [] };
    }
  }

  @Get("matches/:id")
  async getMatch(@Param("id") id: string) {
    try {
      const match = await this.redis.getMatch(id);
      if (!match) return { success: false, error: "Match not found" };
      return { success: true, data: match };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Get("matches/:id/odds")
  async getMatchOdds(@Param("id") id: string) {
    try {
      const match = await this.redis.getMatch(id);
      if (!match) return { success: false, error: "Match not found" };
      return {
        success: true,
        data: {
          1: match.odds1 || null,
          X: match.oddsX || null,
          2: match.odds2 || null,
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Get("matches/:id/events")
  async getMatchEvents(@Param("id") id: string) {
    return { success: true, data: [], message: "Not implemented yet" };
  }

  @Get("matches/:id/statistics")
  async getMatchStatistics(@Param("id") id: string) {
    return { success: true, data: null, message: "Not implemented yet" };
  }

  @Get("competitions")
  async getCompetitions() {
    try {
      const comps = await this.redis.getCompetitions();
      return { success: true, data: comps };
    } catch (e) {
      return { success: false, error: e.message, data: [] };
    }
  }

  @Get("competitions/:id/matches")
  async getCompetitionMatches(@Param("id") id: string) {
    try {
      const all = await this.redis.getAllMatches();
      const filtered = all.filter((m) => {
        const comp = (m.competition || "").replace(/[^a-z0-9]/gi, "_").toLowerCase();
        return comp === id;
      });
      return { success: true, data: filtered, count: filtered.length };
    } catch (e) {
      return { success: false, error: e.message, data: [] };
    }
  }

  @Get("live/now")
  async getLiveNow() {
    try {
      const live = await this.redis.getLiveNow();
      return { success: true, data: live, count: live.length };
    } catch (e) {
      return { success: false, error: e.message, data: [] };
    }
  }

  @Get("results")
  async getResults(@Query() query: any) {
    return { success: true, data: [], message: "Not implemented yet" };
  }

  @Get("health")
  async health() {
    try {
      const matches = await this.redis.getAllMatches();
      return {
        success: true,
        data: {
          status: "ok",
          timestamp: new Date().toISOString(),
          matchesInRedis: matches.length,
          sources: [...new Set(matches.map((m) => m.source).filter(Boolean))],
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}
