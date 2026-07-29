import { Injectable } from "@nestjs/common";

@Injectable()
export class EventCacheService {
  private cache: Map<string, any> = new Map();
  private readonly ttlMs = 60000;

  set(key: string, value: any) {
    this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
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
