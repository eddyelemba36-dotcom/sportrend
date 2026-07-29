export enum ProviderStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ERROR = "error",
  RATE_LIMITED = "rate_limited",
  RECONNECTING = "reconnecting",
}

export const MATCH_STATUS_COLORS: Record<string, string> = {
  scheduled: "#2196F3",
  live: "#4CAF50",
  finished: "#9E9E9E",
  postponed: "#FF9800",
  cancelled: "#F44336",
  halfting: "#FFC107",
};
