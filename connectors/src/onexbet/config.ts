export const ONEXBET_CONFIG = {
  baseUrl: process.env.ONEXBET_BASE_URL || "https://1xbet.com",
  rateLimitPerSecond: parseInt(process.env.ONEXBET_RATE_LIMIT || "1"),
  timeout: parseInt(process.env.ONEXBET_TIMEOUT || "30000"),
  maxRetries: parseInt(process.env.ONEXBET_MAX_RETRIES || "3"),

  endpoints: {
    main: "/",
    login: "/en/login",
    line: "/LineFeed/Get1x2_VZip",
    multiLine: "/LineFeed/Get1x2_VZip?count=",
    live: "/LineFeed/GetLiveEvents_VZip",
    liveMulti: "/LineFeed/GetLiveEvents_VZip?count=",
    event: "/LineFeed/GetGame?lng=en&tf=2200000&id=",
    eventsByDate: "/LineFeed/Get1x2_VZip?lng=en&tf=2200000&country=1&events=100&partner=51&",
    competitions: "/LineFeed/GetSportsShort?lng=en",
    topMatches: "/LineFeed/Get1x2_VZip?lng=en&tf=2200000&mode=3&count=50",
    search: "/search/search?query=",
  },

  defaultHeaders: {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
  },

  mobileHeaders: {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
  },

  sportIds: {
    football: 1,
    basketball: 2,
    tennis: 3,
    mma: 4,
    boxing: 5,
    rugby: 6,
    handball: 7,
    volleyball: 8,
    iceHockey: 9,
    baseball: 10,
  },
};

export type OnexBetMarketCode = number;

export const MARKET_CODES: Record<string, OnexBetMarketCode> = {
  "1X2": 1,
  "DOUBLE_CHANCE": 365,
  "OVER_UNDER": 18,
  "HANDICAP": 287,
  "BTTS": 18,
  "EXACT_SCORE": 1,
  "HALF_TIME": 28,
  "TOTAL_CORNERS": 103,
  "TOTAL_CARDS": 109,
  "PLAYER_TO_SCORE": 445,
  "TOTAL_GOALS": 18,
  "DRAW_NO_BET": 291,
  "GOALS_ODD_EVEN": 281,
};
