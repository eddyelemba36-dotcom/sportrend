import { Injectable } from "@nestjs/common";

@Injectable()
export class LiveBroadcastService {
  broadcast(event: string, data: any) {
    console.log(`[LiveBroadcast] ${event}`, typeof data === "object" ? "(data)" : data);
  }
}
