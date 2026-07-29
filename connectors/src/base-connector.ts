import { EventEmitter } from "events";
import {
  ConnectionStatus,
  ProviderConfig,
  Match,
  Team,
  Player,
  Market,
  LiveEvent,
  MatchStatistics,
  ProviderHealth,
} from "@odds-aggregator/shared";

export abstract class BaseConnector extends EventEmitter {
  public abstract name: string;
  public abstract config: ProviderConfig;
  public status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  protected retryCount = 0;
  protected maxRetries = 5;
  protected reconnectDelay = 5000;
  protected pingInterval?: NodeJS.Timeout;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract fetchCompetitions(): Promise<any[]>;
  abstract fetchTeams(): Promise<Team[]>;
  abstract fetchPlayers(): Promise<Player[]>;
  abstract fetchMatches(): Promise<Match[]>;
  abstract fetchLiveEvents(matchId: string): Promise<LiveEvent[]>;
  abstract fetchStatistics(matchId: string): Promise<MatchStatistics>;
  abstract fetchMarkets(matchId: string): Promise<Market[]>;
  abstract fetchOdds(matchId: string): Promise<any[]>;
  abstract subscribe(matchId: string): Promise<void>;
  abstract unsubscribe(matchId: string): Promise<void>;
  abstract healthCheck(): Promise<ConnectionStatus>;

  protected log(level: "error" | "warn" | "info" | "debug", message: string, data?: any): void {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}] [${this.name}]`;
    if (data) {
      console.log(prefix, message, JSON.stringify(data));
    } else {
      console.log(prefix, message);
    }
  }

  protected async autoReconnect(): Promise<void> {
    while (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.log("warn", `Reconnection attempt ${this.retryCount}/${this.maxRetries}`);
      try {
        await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay * this.retryCount));
        await this.connect();
        this.retryCount = 0;
        this.log("info", "Reconnected successfully");
        return;
      } catch (error: any) {
        this.log("error", `Reconnection failed: ${error.message}`);
      }
    }
    this.status = ConnectionStatus.ERROR;
    this.emit("error", new Error(`Failed to reconnect after ${this.maxRetries} attempts`));
  }

  protected startHealthPing(intervalMs = 30000): void {
    this.pingInterval = setInterval(async () => {
      try {
        const status = await this.healthCheck();
        if (status === ConnectionStatus.CONNECTED && this.status !== ConnectionStatus.CONNECTED) {
          this.status = ConnectionStatus.CONNECTED;
          this.emit("connected");
        }
      } catch {
        this.log("warn", "Health check failed");
      }
    }, intervalMs);
  }

  protected stopHealthPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  public getHealth(): ProviderHealth {
    return {
      provider: this.name,
      status: this.status,
      latency: 0,
      lastChecked: new Date().toISOString(),
    };
  }
}
