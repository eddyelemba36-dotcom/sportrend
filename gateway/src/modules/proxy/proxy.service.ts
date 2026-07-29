import { Injectable, HttpService } from "@nestjs/common";

@Injectable()
export class ProxyService {
  private services: Record<string, string> = {
    live: `http://localhost:${process.env.LIVE_SERVICE_PORT || 3001}`,
    odds: `http://localhost:${process.env.ODDS_SERVICE_PORT || 3002}`,
    "match-events": `http://localhost:${process.env.MATCH_EVENTS_SERVICE_PORT || 3003}`,
    statistics: `http://localhost:${process.env.STATISTICS_SERVICE_PORT || 3004}`,
    settlement: `http://localhost:${process.env.SETTLEMENT_SERVICE_PORT || 3005}`,
  };

  getServiceUrl(name: string): string | undefined {
    return this.services[name];
  }
}
