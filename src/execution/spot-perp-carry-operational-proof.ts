export interface SpotPerpCarryOperationalMarket {
  market: string;
  symbol: string;
}

export interface SpotPerpCarryOperationalProofInput {
  markets: SpotPerpCarryOperationalMarket[];
  notionalKrw: number;
  referenceQuoteToKrw: number;
  maxBithumbFeeBps: number;
  maxBinanceFuturesTakerFeeBps: number;
  bithumbAccounts: unknown;
  bithumbOrderChances: Record<string, unknown>;
  binanceFuturesAccount: unknown;
  binanceFuturesCommissions: Record<string, unknown>;
}

export interface SpotPerpCarryOperationalProof {
  generatedAt: string;
  accountFeesConfirmed: boolean;
  inventoryReady: boolean;
  hedgeVenueReady: boolean;
  approvedMarkets: string[];
  requirements: {
    marketCount: number;
    notionalKrwPerMarket: number;
    totalSpotQuoteRequiredKrw: number;
    totalFuturesMarginRequiredKrw: number;
    totalFuturesMarginRequiredUsdt: number;
  };
  inventory: {
    bithumbQuoteFreeKrw: number;
    binanceUsdtAvailable: number;
    binanceUsdtAvailableKrw: number;
  };
  deficits: {
    bithumbQuoteDeficitKrw: number;
    binanceUsdtDeficit: number;
    binanceUsdtDeficitKrw: number;
  };
  details: {
    bithumbBidFeeBpsByMarket: Record<string, number | null>;
    binanceFuturesTakerFeeBpsBySymbol: Record<string, number | null>;
    referenceQuoteToKrw: number;
  };
  reasons: string[];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function nonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function feeMultiplier(feeBps: number | null, fallbackFeeBps: number): number {
  return 1 + (feeBps ?? fallbackFeeBps) / 10_000;
}

function findBithumbCurrency(accounts: unknown, currency: string): number {
  const target = currency.toUpperCase();
  const account = asRecordArray(accounts).find(
    (row) => typeof row.currency === "string" && row.currency.toUpperCase() === target,
  );
  return asNumber(account?.balance) ?? 0;
}

function findBinanceFuturesAvailable(account: unknown, asset: string): number {
  const target = asset.toUpperCase();
  if (typeof account !== "object" || account === null || Array.isArray(account)) return 0;
  const record = account as Record<string, unknown>;
  const assets = asRecordArray(record.assets);
  const row = assets.find(
    (assetRow) => typeof assetRow.asset === "string" && assetRow.asset.toUpperCase() === target,
  );
  return (
    asNumber(row?.availableBalance) ??
    asNumber(row?.maxWithdrawAmount) ??
    asNumber(row?.walletBalance) ??
    0
  );
}

function bithumbBidFeeBps(orderChance: unknown): number | null {
  if (typeof orderChance !== "object" || orderChance === null || Array.isArray(orderChance)) {
    return null;
  }
  const feeRate = asNumber((orderChance as Record<string, unknown>).bid_fee);
  return feeRate === null || feeRate < 0 ? null : feeRate * 10_000;
}

function binanceFuturesTakerFeeBps(commission: unknown): number | null {
  if (typeof commission !== "object" || commission === null || Array.isArray(commission)) {
    return null;
  }
  const record = commission as Record<string, unknown>;
  const feeRate =
    asNumber(record.takerCommissionRate) ??
    asNumber(record.takerCommission) ??
    asNumber(record.taker);
  if (feeRate === null || feeRate < 0) return null;
  return feeRate > 1 ? feeRate / 100 : feeRate * 10_000;
}

function deficit(actual: number, required: number): number {
  return round(Math.max(0, required - actual));
}

export function buildSpotPerpCarryOperationalProof(
  input: SpotPerpCarryOperationalProofInput,
  now: () => Date = () => new Date(),
): SpotPerpCarryOperationalProof {
  if (input.markets.length === 0) throw new Error("markets must not be empty");
  positive(input.notionalKrw, "notionalKrw");
  positive(input.referenceQuoteToKrw, "referenceQuoteToKrw");
  nonNegative(input.maxBithumbFeeBps, "maxBithumbFeeBps");
  nonNegative(input.maxBinanceFuturesTakerFeeBps, "maxBinanceFuturesTakerFeeBps");

  const bithumbBidFeeBpsByMarket: Record<string, number | null> = {};
  const binanceFuturesTakerFeeBpsBySymbol: Record<string, number | null> = {};
  const reasons: string[] = [];
  let maxObservedBithumbFeeBps: number | null = null;
  let maxObservedBinanceFuturesFeeBps: number | null = null;

  for (const market of input.markets) {
    const bithumbFee = bithumbBidFeeBps(input.bithumbOrderChances[market.market]);
    const binanceFee = binanceFuturesTakerFeeBps(
      input.binanceFuturesCommissions[market.symbol],
    );
    bithumbBidFeeBpsByMarket[market.market] = bithumbFee;
    binanceFuturesTakerFeeBpsBySymbol[market.symbol] = binanceFee;

    if (bithumbFee === null) reasons.push(`market:${market.market}:bithumbFeeUnavailable`);
    else {
      maxObservedBithumbFeeBps = Math.max(maxObservedBithumbFeeBps ?? 0, bithumbFee);
      if (bithumbFee > input.maxBithumbFeeBps + 1e-9) {
        reasons.push(`market:${market.market}:bithumbFeeTooHigh`);
      }
    }

    if (binanceFee === null) reasons.push(`symbol:${market.symbol}:binanceFuturesFeeUnavailable`);
    else {
      maxObservedBinanceFuturesFeeBps = Math.max(
        maxObservedBinanceFuturesFeeBps ?? 0,
        binanceFee,
      );
      if (binanceFee > input.maxBinanceFuturesTakerFeeBps + 1e-9) {
        reasons.push(`symbol:${market.symbol}:binanceFuturesFeeTooHigh`);
      }
    }
  }

  const marketCount = input.markets.length;
  const totalSpotQuoteRequiredKrw = round(
    input.notionalKrw *
      marketCount *
      feeMultiplier(maxObservedBithumbFeeBps, input.maxBithumbFeeBps),
  );
  const totalFuturesMarginRequiredKrw = round(
    input.notionalKrw *
      marketCount *
      feeMultiplier(
        maxObservedBinanceFuturesFeeBps,
        input.maxBinanceFuturesTakerFeeBps,
      ),
  );
  const totalFuturesMarginRequiredUsdt = round(
    totalFuturesMarginRequiredKrw / input.referenceQuoteToKrw,
  );
  const bithumbQuoteFreeKrw = findBithumbCurrency(input.bithumbAccounts, "KRW");
  const binanceUsdtAvailable = findBinanceFuturesAvailable(
    input.binanceFuturesAccount,
    "USDT",
  );
  const binanceUsdtAvailableKrw = round(binanceUsdtAvailable * input.referenceQuoteToKrw);
  const bithumbQuoteDeficitKrw = deficit(
    bithumbQuoteFreeKrw,
    totalSpotQuoteRequiredKrw,
  );
  const binanceUsdtDeficit = deficit(
    binanceUsdtAvailable,
    totalFuturesMarginRequiredUsdt,
  );
  const binanceUsdtDeficitKrw = round(binanceUsdtDeficit * input.referenceQuoteToKrw);

  if (bithumbQuoteDeficitKrw > 0) reasons.push("bithumbQuoteInventoryInsufficient");
  if (binanceUsdtDeficit > 0) reasons.push("binanceUsdtMarginInsufficient");

  const accountFeesConfirmed =
    Object.values(bithumbBidFeeBpsByMarket).every(
      (fee) => fee !== null && fee <= input.maxBithumbFeeBps + 1e-9,
    ) &&
    Object.values(binanceFuturesTakerFeeBpsBySymbol).every(
      (fee) => fee !== null && fee <= input.maxBinanceFuturesTakerFeeBps + 1e-9,
    );
  const inventoryReady = bithumbQuoteDeficitKrw === 0 && binanceUsdtDeficit === 0;
  const hedgeVenueReady =
    accountFeesConfirmed &&
    binanceUsdtDeficit === 0 &&
    Object.values(binanceFuturesTakerFeeBpsBySymbol).every((fee) => fee !== null);

  return {
    generatedAt: now().toISOString(),
    accountFeesConfirmed,
    inventoryReady,
    hedgeVenueReady,
    approvedMarkets: inventoryReady && hedgeVenueReady
      ? input.markets.map((market) => market.market)
      : [],
    requirements: {
      marketCount,
      notionalKrwPerMarket: input.notionalKrw,
      totalSpotQuoteRequiredKrw,
      totalFuturesMarginRequiredKrw,
      totalFuturesMarginRequiredUsdt,
    },
    inventory: {
      bithumbQuoteFreeKrw,
      binanceUsdtAvailable,
      binanceUsdtAvailableKrw,
    },
    deficits: {
      bithumbQuoteDeficitKrw,
      binanceUsdtDeficit,
      binanceUsdtDeficitKrw,
    },
    details: {
      bithumbBidFeeBpsByMarket,
      binanceFuturesTakerFeeBpsBySymbol,
      referenceQuoteToKrw: input.referenceQuoteToKrw,
    },
    reasons,
  };
}
