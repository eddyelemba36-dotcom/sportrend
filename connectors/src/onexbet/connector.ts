import { BaseConnector } from "../base-connector";
import { ConnectionStatus, ProviderConfig, Match, Market, LiveEvent, MatchStatistics, Team, Player } from "@odds-aggregator/shared";
import { OnexBetApiClient } from "./api.client";
import { ONEXBET_CONFIG } from "./config";
import { parseMatch, parseMatches } from "./parsers/match.parser";
import { parseMarkets } from "./parsers/odds.parser";
import { parseLiveEvent, parseLiveScore, parseLiveStatistics } from "./parsers/live.parser";

export class OnexBetConnector extends BaseConnector {
  public name = "1xbet";
  private apiClient: OnexBetApiClient;
  private pollInterval?: NodeJS.Timeout;
  private subscribedMatches: Set<string> = new Set();
  private livePollIntervalMs = 5000;

  public config: ProviderConfig = {
    name: "1xbet",
    baseUrl: ONEXBET_CONFIG.baseUrl,
    rateLimitPerSecond: ONEXBET_CONFIG.rateLimitPerSecond,
    maxRetries: ONEXBET_CONFIG.maxRetries,
    timeout: ONEXBET_CONFIG.timeout,
    enabled: true,
    priority: 1,
  };

  constructor() {
    super();
    this.apiClient = new OnexBetApiClient();
  }

  async connect(): Promise<void> {
    try {
      this.status = ConnectionStatus.CONNECTING;
      this.log("info", "Connecting to 1xBet...");
      const healthy = await this.apiClient.healthCheck();
      if (healthy) {
        this.status = ConnectionStatus.CONNECTED;
        this.log("info", "Connected to 1xBet");
        this.startHealthPing();
        this.emit("connected");
      } else {
        throw new Error("Health check failed");
      }
    } catch (error: any) {
      this.status = ConnectionStatus.ERROR;
      this.log("error", `Connection failed: ${error.message}`);
      this.autoReconnect();
    }
  }

  async disconnect(): Promise<void> {
    this.stopHealthPing();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    this.status = ConnectionStatus.DISCONNECTED;
    this.log("info", "Disconnected from 1xBet");
  }

  async healthCheck(): Promise<ConnectionStatus> {
    try {
      const ok = await this.apiClient.healthCheck();
      return ok ? ConnectionStatus.CONNECTED : ConnectionStatus.ERROR;
    } catch {
      return ConnectionStatus.ERROR;
    }
  }

  async fetchMatches(): Promise<Match[]> {
    try {
      const raw = await this.apiClient.fetchLine(100);
      const matches = parseMatches(raw);
      this.log("info", `Fetched ${matches.length} matches`);
      return matches;
    } catch (error: any) {
      this.log("error", `fetchMatches: ${error.message}`);
      return [];
    }
  }

  async fetchLiveEvents(matchId: string): Promise<LiveEvent[]> {
    try {
      const id = parseInt(matchId.replace("1xbet-", ""));
      const raw = await this.apiClient.fetchEvent(id);
      if (!raw || !raw.Value) return [];

      const events: LiveEvent[] = [];
      if (raw.Value.Events && Array.isArray(raw.Value.Events)) {
        for (const e of raw.Value.Events) {
          const parsed = parseLiveEvent(e, matchId);
          if (parsed) events.push(parsed);
        }
      }
      return events;
    } catch (error: any) {
      this.log("error", `fetchLiveEvents: ${error.message}`);
      return [];
    }
  }

  async fetchStatistics(matchId: string): Promise<MatchStatistics> {
    throw new Error("Not implemented yet");
  }

  async fetchMarkets(matchId: string): Promise<Market[]> {
    try {
      const id = parseInt(matchId.replace("1xbet-", ""));
      const raw = await this.apiClient.fetchMarkets(id);
      return parseMarkets(raw || [], matchId.replace("1xbet-", ""));
    } catch (error: any) {
      this.log("error", `fetchMarkets: ${error.message}`);
      return [];
    }
  }

  async fetchOdds(matchId: string): Promise<any[]> {
    const markets = await this.fetchMarkets(matchId);
    return markets.flatMap((m) =>
      m.outcomes.map((o) => ({
        marketId: m.id,
        outcomeId: o.id,
        matchId,
        provider: "1xbet",
        odds: o.oddsDecimal,
        oddsDecimal: o.oddsDecimal,
        timestamp: new Date().toISOString(),
      }))
    );
  }

  async fetchCompetitions(): Promise<any[]> {
    return this.apiClient.fetchCompetitions();
  }

  async fetchTeams(): Promise<Team[]> {
    return [];
  }

  async fetchPlayers(): Promise<Player[]> {
    return [];
  }

  async subscribe(matchId: string): Promise<void> {
    this.subscribedMatches.add(matchId);
    this.log("info", `Subscribed to ${matchId}`);
    if (!this.pollInterval) {
      this.startLivePolling();
    }
  }

  async unsubscribe(matchId: string): Promise<void> {
    this.subscribedMatches.delete(matchId);
    this.log("info", `Unsubscribed from ${matchId}`);
    if (this.subscribedMatches.size === 0 && this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  private startLivePolling(): void {
    this.pollInterval = setInterval(async () => {
      try {
        const liveData = await this.apiClient.fetchLive();
        if (liveData.length > 0) {
          const matches = parseMatches(liveData);
          for (const match of matches) {
            this.emit("match:update", match);
            if (this.subscribedMatches.has(match.id)) {
              const markets = await this.fetchMarkets(match.id);
              this.emit("odds:update", { matchId: match.id, markets });
            }
          }
          this.log("debug", `Live poll: ${matches.length} matches updated`);
        }
      } catch (error: any) {
        this.log("error", `Live poll error: ${error.message}`);
      }
    }, this.livePollIntervalMs);
  }
}
