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

export interface MarketSnapshotValidationIssue {
  path: string;
  message: string;
}

export type MarketSnapshotValidationResult =
  | { ok: true; value: MarketSnapshot }
  | { ok: false; issues: MarketSnapshotValidationIssue[] };

const MARKET_PATTERN = /^[A-Z]{3,10}-[A-Z0-9]{1,20}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function validateMarketSnapshot(
  input: unknown,
): MarketSnapshotValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "MarketSnapshot must be an object" }],
    };
  }

  const issues: MarketSnapshotValidationIssue[] = [];
  const market =
    typeof input.market === "string" ? input.market.trim() : undefined;
  const asOf = input.asOf;
  const lastTradePrice = asFiniteNumber(input.lastTradePrice);
  const bestBidPrice = asFiniteNumber(input.bestBidPrice);
  const bestAskPrice = asFiniteNumber(input.bestAskPrice);
  const bestBidSize = asFiniteNumber(input.bestBidSize);
  const bestAskSize = asFiniteNumber(input.bestAskSize);
  const spreadBps = asFiniteNumber(input.spreadBps);
  const depthRatio = asFiniteNumber(input.depthRatio);
  const rolling24hNotional = asFiniteNumber(input.rolling24hNotional);

  if (!market || !MARKET_PATTERN.test(market)) {
    issues.push({
      path: "market",
      message: "market must look like KRW-BTC",
    });
  }

  if (!isIsoTimestamp(asOf)) {
    issues.push({
      path: "asOf",
      message: "asOf must be an ISO timestamp",
    });
  }

  if (lastTradePrice === undefined || lastTradePrice <= 0) {
    issues.push({
      path: "lastTradePrice",
      message: "lastTradePrice must be a positive number",
    });
  }

  if (bestBidPrice === undefined || bestBidPrice <= 0) {
    issues.push({
      path: "bestBidPrice",
      message: "bestBidPrice must be a positive number",
    });
  }

  if (bestAskPrice === undefined || bestAskPrice <= 0) {
    issues.push({
      path: "bestAskPrice",
      message: "bestAskPrice must be a positive number",
    });
  }

  if (
    bestBidPrice !== undefined &&
    bestAskPrice !== undefined &&
    bestAskPrice < bestBidPrice
  ) {
    issues.push({
      path: "bestAskPrice",
      message: "bestAskPrice must be greater than or equal to bestBidPrice",
    });
  }

  if (bestBidSize === undefined || bestBidSize <= 0) {
    issues.push({
      path: "bestBidSize",
      message: "bestBidSize must be a positive number",
    });
  }

  if (bestAskSize === undefined || bestAskSize <= 0) {
    issues.push({
      path: "bestAskSize",
      message: "bestAskSize must be a positive number",
    });
  }

  if (spreadBps === undefined || spreadBps < 0) {
    issues.push({
      path: "spreadBps",
      message: "spreadBps must be a non-negative number",
    });
  }

  if (depthRatio === undefined || depthRatio <= 0) {
    issues.push({
      path: "depthRatio",
      message: "depthRatio must be a positive number",
    });
  }

  if (rolling24hNotional === undefined || rolling24hNotional < 0) {
    issues.push({
      path: "rolling24hNotional",
      message: "rolling24hNotional must be a non-negative number",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      market: market!,
      asOf: asOf as string,
      lastTradePrice: lastTradePrice!,
      bestBidPrice: bestBidPrice!,
      bestAskPrice: bestAskPrice!,
      bestBidSize: bestBidSize!,
      bestAskSize: bestAskSize!,
      spreadBps: spreadBps!,
      depthRatio: depthRatio!,
      rolling24hNotional: rolling24hNotional!,
    },
  };
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
