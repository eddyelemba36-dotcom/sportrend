export enum WsEvent {
  MATCH_UPDATE = "match:update",
  MATCH_NEW = "match:new",
  MATCH_FINISHED = "match:finished",
  ODDS_UPDATE = "odds:update",
  MARKET_UPDATE = "market:update",
  LIVE_EVENT = "live:event",
  LIVE_SCORE = "live:score",
  STATISTICS_UPDATE = "statistics:update",
  PROVIDER_STATUS = "provider:status",
  SUBSCRIBE = "subscribe",
  UNSUBSCRIBE = "unsubscribe",
}

export interface WsMessage {
  event: WsEvent;
  data: any;
  timestamp: string;
  provider?: string;
}

export interface WsSubscription {
  matchIds: string[];
  marketTypes?: string[];
  sports?: string[];
}
