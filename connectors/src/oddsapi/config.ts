export const ODDSAPI_CONFIG = {
  baseUrl: "https://api.the-odds-api.com/v4",
  apiKey: process.env.ODDS_API_KEY || "",
  rateLimitPerSecond: 1,
  timeout: 10000,
  maxRetries: 3,
  requestsPerMonth: 500,

  sports: {
    soccer: "soccer",
    basketball: "basketball_nba",
    tennis: "tennis_atp",
    mma: "mma_mixed_martial_arts",
    baseball: "baseball_mlb",
    icehockey: "icehockey_nhl",
    boxing: "boxing_boxing",
    rugby: "rugby_union",
  },

  regions: ["eu", "us", "uk", "au"],
  markets: ["h2h", "spreads", "totals", "outrights"],
  oddsFormat: "decimal",
  dateFormat: "iso",
};
