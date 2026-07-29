import { Injectable } from "@nestjs/common";

@Injectable()
export class OddsCacheService {
  private cache: Map<string, any> = new Map();

  set(key: string, value: any) {
    this.cache.set(key, { value, ts: Date.now() });
  }

  get(key: string): any | null {
    return this.cache.get(key)?.value || null;
  }

  getAndClear(key: string): any | null {
    const val = this.cache.get(key)?.value || null;
    this.cache.delete(key);
    return val;
  }

  bulkSet(entries: [string, any][]) {
    for (const [key, value] of entries) {
      this.cache.set(key, { value, ts: Date.now() });
    }
  }
}
