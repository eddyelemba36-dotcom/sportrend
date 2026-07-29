import { ODDSAPI_CONFIG } from "./config";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  remaining?: number;
}

interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

interface Match {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
}

export class OddsApiClient {
  private apiKey: string;
  private lastRequestTime = 0;
  private requestCount = 0;
  private requestCountReset = Date.now();

  constructor(apiKey?: string) {
    this.apiKey = apiKey || ODDSAPI_CONFIG.apiKey;
  }

  private async request<T>(path: string): Promise<ApiResponse<T>> {
    if (!this.apiKey || this.apiKey === "your-api-key") {
      return { success: false, error: "No API key configured. Get one at https://the-odds-api.com" };
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < 1000) {
      await new Promise(r => setTimeout(r, 1000 - elapsed));
    }

    if (now - this.requestCountReset > 30 * 24 * 60 * 60 * 1000) {
      this.requestCount = 0;
      this.requestCountReset = now;
    }
    if (this.requestCount >= ODDSAPI_CONFIG.requestsPerMonth) {
      return { success: false, error: "Monthly API quota exceeded (500 requests)" };
    }

    const url = ODDSAPI_CONFIG.baseUrl + path + "?apiKey=" + this.apiKey;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(ODDSAPI_CONFIG.timeout),
      });

      this.lastRequestTime = Date.now();
      this.requestCount++;

      const remaining = parseInt(res.headers.get("x-requests-remaining") || "0");

      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: "HTTP " + res.status + ": " + text.slice(0, 200), remaining };
      }

      const data = await res.json();
      return { success: true, data, remaining, error: undefined };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  async getSports() {
    return this.request<Sport[]>("/sports");
  }

  async getUpcomingMatches(sport: string, regions = "eu", markets = "h2h") {
    return this.request<Match[]>("/sports/" + sport + "/odds?regions=" + regions + "&markets=" + markets);
  }

  async getScores(sport: string, daysFrom = "1") {
    return this.request<Match[]>("/sports/" + sport + "/scores?daysFrom=" + daysFrom);
  }

  async getAllUpcoming() {
    return this.request<Match[]>("/odds?regions=eu,uk&markets=h2h,spreads,totals");
  }

  getUsageInfo() {
    return {
      requestsUsed: this.requestCount,
      requestsLimit: ODDSAPI_CONFIG.requestsPerMonth,
      requestsRemaining: ODDSAPI_CONFIG.requestsPerMonth - this.requestCount,
      resetAt: new Date(this.requestCountReset + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
