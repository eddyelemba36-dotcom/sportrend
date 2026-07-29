import { Injectable } from "@nestjs/common";

@Injectable()
export class StatsCacheService {
  private cache: Map<string, any> = new Map();

  set(key: string, value: any, ttlMs: number = 30000) {
    this.cache.set(key, { value, expires: Date.now() + ttlMs });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
}
