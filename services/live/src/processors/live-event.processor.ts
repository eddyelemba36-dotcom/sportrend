import { Injectable } from "@nestjs/common";

@Injectable()
export class LiveEventProcessor {
  async handleEvent(event: any) {
    console.log(`[LiveEventProcessor] Processing event for match ${event?.matchId}`);
    return { processed: true };
  }
}
