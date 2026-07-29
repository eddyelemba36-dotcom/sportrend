import { SessionManager } from "./session.manager";
import { ONEXBET_CONFIG } from "./config";
import * as iconv from "iconv-lite";

export class OnexBetApiClient {
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  async fetchLine(count: number = 50): Promise<any[]> {
    try {
      const client = await this.sessionManager.getClient();
      const url = ONEXBET_CONFIG.endpoints.multiLine + count;
      const response = await client.get(url, { responseType: "arraybuffer" });
      const decoded = iconv.decode(Buffer.from(response.data), "win1251");
      return JSON.parse(decoded).Value || [];
    } catch (error: any) {
      console.error("[1xBet] fetchLine error:", error.message);
      return [];
    }
  }

  async fetchLive(): Promise<any[]> {
    try {
      const client = await this.sessionManager.getClient();
      const response = await client.get(ONEXBET_CONFIG.endpoints.liveMulti + 50, { responseType: "arraybuffer" });
      const decoded = iconv.decode(Buffer.from(response.data), "win1251");
      return JSON.parse(decoded).Value || [];
    } catch (error: any) {
      console.error("[1xBet] fetchLive error:", error.message);
      return [];
    }
  }

  async fetchEvent(eventId: number): Promise<any> {
    try {
      const client = await this.sessionManager.getClient();
      const response = await client.get(ONEXBET_CONFIG.endpoints.event + eventId, { responseType: "arraybuffer" });
      const decoded = iconv.decode(Buffer.from(response.data), "win1251");
      return JSON.parse(decoded);
    } catch (error: any) {
      console.error("[1xBet] fetchEvent error:", error.message);
      return null;
    }
  }

  async fetchCompetitions(): Promise<any[]> {
    try {
      const client = await this.sessionManager.getClient();
      const response = await client.get(ONEXBET_CONFIG.endpoints.competitions, { responseType: "arraybuffer" });
      const decoded = iconv.decode(Buffer.from(response.data), "win1251");
      return JSON.parse(decoded).Value || [];
    } catch (error: any) {
      console.error("[1xBet] fetchCompetitions error:", error.message);
      return [];
    }
  }

  async fetchMarkets(eventId: number): Promise<any[]> {
    try {
      const client = await this.sessionManager.getClient();
      const response = await client.get(ONEXBET_CONFIG.endpoints.event + eventId, { responseType: "arraybuffer" });
      const decoded = iconv.decode(Buffer.from(response.data), "win1251");
      const data = JSON.parse(decoded);
      return data.Value?.E || [];
    } catch (error: any) {
      console.error("[1xBet] fetchMarkets error:", error.message);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.sessionManager.getClient();
      const response = await client.get(ONEXBET_CONFIG.endpoints.main, { responseType: "text" });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
