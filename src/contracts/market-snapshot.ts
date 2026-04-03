export interface MarketSnapshot {
  market: string;
  asOf: string;
  lastTradePrice: number;
  bestBidPrice: number;
  bestAskPrice: number;
  bestBidSize: number;
  bestAskSize: number;
  spreadBps: number;
  depthRatio: number;
  rolling24hNotional: number;
}

export function snapshotAgeMs(snapshot: MarketSnapshot, now: Date): number {
  return now.getTime() - Date.parse(snapshot.asOf);
}

export function referencePriceForSide(
  snapshot: MarketSnapshot,
  side: "buy" | "sell",
): number {
  return side === "buy" ? snapshot.bestAskPrice : snapshot.bestBidPrice;
}
