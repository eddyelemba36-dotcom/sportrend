import { Injectable } from "@nestjs/common";

@Injectable()
export class OddsUpdateProcessor {
  async handleOddsUpdate(data: any) {
    console.log(`[OddsUpdate] Processing odds for match ${data?.matchId}`);
    return { processed: true };
  }
}
