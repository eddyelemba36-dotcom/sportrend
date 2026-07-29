import { Injectable } from "@nestjs/common";

@Injectable()
export class ResultVerifierService {
  verifyScore(market: string, selection: string, score: { home: number; away: number }): boolean {
    switch (market) {
      case "1X2":
        return this.verify1X2(selection, score);
      case "OVER_UNDER":
        return this.verifyOverUnder(selection, score);
      case "BTTS":
        return this.verifyBTTS(selection, score);
      case "HANDICAP":
        return this.verifyHandicap(selection, score);
      default:
        return false;
    }
  }

  private verify1X2(selection: string, score: { home: number; away: number }): boolean {
    if (selection === "1") return score.home > score.away;
    if (selection === "X") return score.home === score.away;
    if (selection === "2") return score.home < score.away;
    return false;
  }

  private verifyOverUnder(selection: string, score: { home: number; away: number }): boolean {
    const total = score.home + score.away;
    const threshold = parseFloat(selection.split(" ")[1] || "2.5");
    if (selection.startsWith("Over")) return total > threshold;
    return total < threshold;
  }

  private verifyBTTS(selection: string, score: { home: number; away: number }): boolean {
    const bothScored = score.home > 0 && score.away > 0;
    if (selection === "Yes") return bothScored;
    return !bothScored;
  }

  private verifyHandicap(selection: string, score: { home: number; away: number }): boolean {
    const [team, hcapStr] = selection.split(" ");
    const handicap = parseFloat(hcapStr || "0");
    if (team === "Home") return score.home + handicap > score.away;
    return score.away + handicap > score.home;
  }
}
