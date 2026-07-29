import axios, { AxiosInstance } from "axios";
import { ONEXBET_CONFIG } from "./config";

export interface OnexBetSession {
  token: string;
  cookies: string[];
  userAgent: string;
  createdAt: number;
}

export class SessionManager {
  private sessions: Map<string, OnexBetSession> = new Map();
  private defaultSession: OnexBetSession | null = null;
  private lastRequestTime = 0;

  async createSession(): Promise<OnexBetSession> {
    const userAgent = this.getRandomUserAgent();
    const session: OnexBetSession = {
      token: "",
      cookies: [],
      userAgent,
      createdAt: Date.now(),
    };
    return session;
  }

  async getClient(sessionKey?: string): Promise<AxiosInstance> {
    const session = sessionKey
      ? this.sessions.get(sessionKey) || (await this.createSession())
      : this.defaultSession || (await this.createSession());

    if (!this.defaultSession) {
      this.defaultSession = session;
      this.sessions.set("default", session);
    }

    const client = axios.create({
      baseURL: ONEXBET_CONFIG.baseUrl,
      timeout: ONEXBET_CONFIG.timeout,
      headers: {
        ...ONEXBET_CONFIG.defaultHeaders,
        ...ONEXBET_CONFIG.mobileHeaders,
        "User-Agent": session.userAgent,
      },
      withCredentials: true,
      responseType: "arraybuffer",
    });

    client.interceptors.request.use(async (config) => {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      const minInterval = 1000 / ONEXBET_CONFIG.rateLimitPerSecond;
      if (elapsed < minInterval) {
        await new Promise((r) => setTimeout(r, minInterval - elapsed));
      }
      this.lastRequestTime = Date.now();
      return config;
    });

    return client;
  }

  private getRandomUserAgent(): string {
    const uas = [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 13; Samsung Galaxy S23) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone14,3; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Xiaomi 14 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.72 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 13; OnePlus 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.83 Mobile Safari/537.36",
    ];
    return uas[Math.floor(Math.random() * uas.length)];
  }

  destroySession(sessionKey?: string): void {
    if (sessionKey) {
      this.sessions.delete(sessionKey);
    } else {
      this.defaultSession = null;
      this.sessions.clear();
    }
  }
}
