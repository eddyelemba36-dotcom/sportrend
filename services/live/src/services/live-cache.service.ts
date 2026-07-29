import { Injectable } from "@nestjs/common";

@Injectable()
export class LiveCacheService {
  private cache: Map<string, any> = new Map();

  set(key: string, value: any, ttlMs: number = 5000) {
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

  invalidate(key: string) {
    this.cache.delete(key);
  }
}
