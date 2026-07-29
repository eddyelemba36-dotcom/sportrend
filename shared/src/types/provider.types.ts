export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  rateLimitPerSecond: number;
  maxRetries: number;
  timeout: number;
  enabled: boolean;
  priority: number;
}

export enum ConnectionStatus {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  ERROR = "error",
  RATE_LIMITED = "rate_limited",
}

export interface ProviderConnector {
  name: string;
  config: ProviderConfig;
  status: ConnectionStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<ConnectionStatus>;
  fetchCompetitions(): Promise<any[]>;
  fetchTeams(): Promise<any[]>;
  fetchPlayers(): Promise<any[]>;
  fetchMatches(): Promise<any[]>;
  fetchLiveEvents(matchId: string): Promise<any[]>;
  fetchStatistics(matchId: string): Promise<any>;
  fetchMarkets(matchId: string): Promise<any[]>;
  fetchOdds(matchId: string): Promise<any[]>;
  subscribe(matchId: string): Promise<void>;
  unsubscribe(matchId: string): Promise<void>;
}

export interface ProviderHealth {
  provider: string;
  status: ConnectionStatus;
  latency: number;
  lastChecked: string;
  matchesCount?: number;
  error?: string;
}
