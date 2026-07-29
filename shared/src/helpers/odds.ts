export function calculateImpliedProbability(decimalOdds: number): number {
  if (decimalOdds <= 1) return 100;
  return (1 / decimalOdds) * 100;
}

export function calculateDecimalOdds(probabilityPercent: number): number {
  if (probabilityPercent <= 0) return 0;
  return 1 / (probabilityPercent / 100);
}

export function calculateOverround(odds1: number, odds2: number, odds3?: number): number {
  let sum = 1 / odds1 + 1 / odds2;
  if (odds3) sum += 1 / odds3;
  return (sum - 1) * 100;
}

export function normalizeOdds(odds: number): number {
  if (odds <= 0) return 0;
  return Math.round(odds * 100) / 100;
}

export function oddsToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2) return Math.round((decimalOdds - 1) * 100);
  return Math.round(-100 / (decimalOdds - 1));
}

export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) return 1 + americanOdds / 100;
  return 1 + 100 / Math.abs(americanOdds);
}
