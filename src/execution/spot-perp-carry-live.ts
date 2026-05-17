export type SpotPerpCarryVenue = "bithumb" | "binance_usdm";

export interface SpotPerpCarryBookLevel {
  price: number;
  size: number;
}

export interface SpotPerpCarryBook {
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  bids?: SpotPerpCarryBookLevel[];
  asks?: SpotPerpCarryBookLevel[];
}

export interface BuildSpotPerpCarryEntryPlanInput {
  direction: "long_bithumb_spot_short_binance_perp";
  notionalKrw: number;
  market: string;
  symbol: string;
  quoteToKrw: number;
  spot: SpotPerpCarryBook;
  perp: SpotPerpCarryBook;
  minNetCarryBps: number;
  observedNetCarryBps: number;
  bithumbFeeBps: number;
  binanceFuturesFeeBps: number;
}

export interface SpotPerpCarryLeg {
  venue: SpotPerpCarryVenue;
  market: string;
  side: "buy" | "sell";
  limitPrice: number;
  limitPriceCurrency: "KRW" | "USDT";
  quantity: number;
  notionalKrw: number;
  quoteToKrw: number;
  feeBps: number;
}

export interface SpotPerpCarryEntryPlan {
  direction: "long_bithumb_spot_short_binance_perp";
  notionalKrw: number;
  observedNetCarryBps: number;
  legs: [SpotPerpCarryLeg, SpotPerpCarryLeg];
  requiredInventoryKrw: {
    bithumbQuote: number;
    binanceMargin: number;
  };
}

export interface SubmittedSpotPerpCarryOrder {
  orderId: string;
  status: "accepted" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
  executedQuantity: number;
  executedNotionalKrw: number;
}

export interface SpotPerpCarryExecutionVenue {
  submitLimitOrder(leg: SpotPerpCarryLeg): Promise<SubmittedSpotPerpCarryOrder>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
}

export interface SubmitSpotPerpCarryEntryOptions {
  allowLiveExecution: boolean;
  venues: Record<SpotPerpCarryVenue, SpotPerpCarryExecutionVenue>;
  maxLegNotionalMismatchBps?: number;
  maxPairNotionalMismatchBps?: number;
}

export interface SpotPerpCarryEntryReconciliation {
  plannedNotionalKrw: number;
  legNotionalMismatchBps: [number, number];
  pairNotionalImbalanceKrw: number;
  pairNotionalImbalanceBps: number;
  realizedFeeKrw: number;
  realizedEntryGrossPnlKrw: number;
  realizedEntryGrossEdgeBps: number;
  realizedEntryNetPnlKrw: number;
  realizedEntryNetEdgeBps: number;
  realizedNetPnlKrw: number;
  realizedNetEdgeBps: number;
}

export interface SpotPerpCarryEntryExecutionResult {
  plan: SpotPerpCarryEntryPlan;
  orders: [SubmittedSpotPerpCarryOrder, SubmittedSpotPerpCarryOrder];
  reconciliation: SpotPerpCarryEntryReconciliation;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function levelsForSide(book: SpotPerpCarryBook, side: "buy" | "sell"): SpotPerpCarryBookLevel[] {
  const levels = side === "buy" ? book.asks : book.bids;
  if (Array.isArray(levels) && levels.length > 0) return levels;
  return side === "buy"
    ? [{ price: book.askPrice, size: book.askSize }]
    : [{ price: book.bidPrice, size: book.bidSize }];
}

function executableForNotionalKrw(
  book: SpotPerpCarryBook,
  side: "buy" | "sell",
  notionalKrw: number,
  quoteToKrw: number,
): { limitPrice: number; quantity: number; vwapPrice: number } | null {
  let remainingKrw = notionalKrw;
  let quantity = 0;
  let nativeQuoteNotional = 0;
  let limitPrice = 0;

  for (const level of levelsForSide(book, side)) {
    assertPositiveFinite(level.price, `${side} level price`);
    assertPositiveFinite(level.size, `${side} level size`);
    const levelKrw = level.price * level.size * quoteToKrw;
    if (levelKrw >= remainingKrw) {
      const takeQuantity = remainingKrw / (level.price * quoteToKrw);
      quantity += takeQuantity;
      nativeQuoteNotional += takeQuantity * level.price;
      limitPrice = level.price;
      remainingKrw = 0;
      break;
    }
    quantity += level.size;
    nativeQuoteNotional += level.price * level.size;
    remainingKrw -= levelKrw;
    limitPrice = level.price;
  }

  if (remainingKrw > 1e-6 || quantity <= 0) return null;
  return { limitPrice, quantity, vwapPrice: nativeQuoteNotional / quantity };
}

function feeBps(value: number, label: string): number {
  assertNonNegativeFinite(value, label);
  return value;
}

export function buildSpotPerpCarryEntryPlan(
  input: BuildSpotPerpCarryEntryPlanInput,
): SpotPerpCarryEntryPlan {
  if (input.direction !== "long_bithumb_spot_short_binance_perp") {
    throw new Error("spot-perp carry entry only supports long Bithumb spot and short Binance USD-M perp");
  }
  assertPositiveFinite(input.notionalKrw, "notionalKrw");
  assertPositiveFinite(input.quoteToKrw, "quoteToKrw");
  assertNonNegativeFinite(input.minNetCarryBps, "minNetCarryBps");
  assertPositiveFinite(input.spot.bidPrice, "spot.bidPrice");
  assertPositiveFinite(input.spot.askPrice, "spot.askPrice");
  assertPositiveFinite(input.perp.bidPrice, "perp.bidPrice");
  assertPositiveFinite(input.perp.askPrice, "perp.askPrice");

  if (!input.market.startsWith("KRW-")) {
    throw new Error("spot-perp carry Bithumb market must be KRW quoted");
  }
  if (!input.symbol.endsWith("USDT")) {
    throw new Error("spot-perp carry Binance futures symbol must be USDT quoted");
  }
  if (input.perp.bidPrice >= 1_000_000 || input.perp.askPrice >= 1_000_000) {
    throw new Error("Binance futures prices must be native USDT prices, not KRW-translated prices");
  }
  if (input.observedNetCarryBps < input.minNetCarryBps) {
    throw new Error("observed net carry is below the configured live threshold");
  }

  const spotBuy = executableForNotionalKrw(input.spot, "buy", input.notionalKrw, 1);
  const perpSell = executableForNotionalKrw(input.perp, "sell", input.notionalKrw, input.quoteToKrw);
  if (spotBuy === null) throw new Error("Bithumb ask depth is insufficient for the spot buy leg");
  if (perpSell === null) throw new Error("Binance futures bid depth is insufficient for the perp sell leg");

  return {
    direction: input.direction,
    notionalKrw: input.notionalKrw,
    observedNetCarryBps: input.observedNetCarryBps,
    legs: [
      {
        venue: "bithumb",
        market: input.market,
        side: "buy",
        limitPrice: spotBuy.limitPrice,
        limitPriceCurrency: "KRW",
        quantity: spotBuy.quantity,
        notionalKrw: input.notionalKrw,
        quoteToKrw: 1,
        feeBps: feeBps(input.bithumbFeeBps, "bithumbFeeBps"),
      },
      {
        venue: "binance_usdm",
        market: input.symbol,
        side: "sell",
        limitPrice: perpSell.limitPrice,
        limitPriceCurrency: "USDT",
        quantity: perpSell.quantity,
        notionalKrw: input.notionalKrw,
        quoteToKrw: input.quoteToKrw,
        feeBps: feeBps(input.binanceFuturesFeeBps, "binanceFuturesFeeBps"),
      },
    ],
    requiredInventoryKrw: {
      bithumbQuote: input.notionalKrw,
      binanceMargin: input.notionalKrw,
    },
  };
}

function terminal(order: SubmittedSpotPerpCarryOrder): boolean {
  return order.status === "filled" || order.status === "cancelled" || order.status === "rejected";
}

function assertFilledOrderReconciles(
  leg: SpotPerpCarryLeg,
  order: SubmittedSpotPerpCarryOrder,
  maxLegNotionalMismatchBps: number,
): number {
  assertPositiveFinite(order.executedQuantity, `${leg.venue} executedQuantity`);
  assertPositiveFinite(order.executedNotionalKrw, `${leg.venue} executedNotionalKrw`);
  const mismatchBps = Math.abs(order.executedNotionalKrw - leg.notionalKrw) / leg.notionalKrw * 10_000;
  if (!Number.isFinite(mismatchBps) || mismatchBps > maxLegNotionalMismatchBps) {
    throw new Error(
      `spot-perp carry reconciliation failed: ${leg.venue} executed notional mismatch ${mismatchBps.toFixed(6)} bps exceeds ${maxLegNotionalMismatchBps} bps`,
    );
  }
  return mismatchBps;
}

function reconcileFilledOrders(
  plan: SpotPerpCarryEntryPlan,
  orders: [SubmittedSpotPerpCarryOrder, SubmittedSpotPerpCarryOrder],
  options: SubmitSpotPerpCarryEntryOptions,
): SpotPerpCarryEntryReconciliation {
  const maxLegNotionalMismatchBps = options.maxLegNotionalMismatchBps ?? 100;
  const maxPairNotionalMismatchBps = options.maxPairNotionalMismatchBps ?? 100;
  assertNonNegativeFinite(maxLegNotionalMismatchBps, "maxLegNotionalMismatchBps");
  assertNonNegativeFinite(maxPairNotionalMismatchBps, "maxPairNotionalMismatchBps");

  const legNotionalMismatchBps = plan.legs.map((leg, index) =>
    assertFilledOrderReconciles(leg, orders[index]!, maxLegNotionalMismatchBps),
  ) as [number, number];
  const pairNotionalImbalanceKrw = Math.abs(
    orders[0].executedNotionalKrw - orders[1].executedNotionalKrw,
  );
  const pairNotionalImbalanceBps = pairNotionalImbalanceKrw / plan.notionalKrw * 10_000;
  if (!Number.isFinite(pairNotionalImbalanceBps) || pairNotionalImbalanceBps > maxPairNotionalMismatchBps) {
    throw new Error(
      `spot-perp carry reconciliation failed: pair notional imbalance ${pairNotionalImbalanceBps.toFixed(6)} bps exceeds ${maxPairNotionalMismatchBps} bps`,
    );
  }

  const realizedEntryGrossPnlKrw = plan.legs.reduce((sum, leg, index) => {
    const signedNotional =
      leg.side === "sell"
        ? orders[index]!.executedNotionalKrw
        : -orders[index]!.executedNotionalKrw;
    return sum + signedNotional;
  }, 0);
  const realizedFeeKrw = plan.legs.reduce(
    (sum, leg, index) => sum + orders[index]!.executedNotionalKrw * leg.feeBps / 10_000,
    0,
  );
  const realizedEntryNetPnlKrw = realizedEntryGrossPnlKrw - realizedFeeKrw;

  return {
    plannedNotionalKrw: plan.notionalKrw,
    legNotionalMismatchBps,
    pairNotionalImbalanceKrw,
    pairNotionalImbalanceBps,
    realizedFeeKrw,
    realizedEntryGrossPnlKrw,
    realizedEntryGrossEdgeBps: realizedEntryGrossPnlKrw / plan.notionalKrw * 10_000,
    realizedEntryNetPnlKrw,
    realizedEntryNetEdgeBps: realizedEntryNetPnlKrw / plan.notionalKrw * 10_000,
    realizedNetPnlKrw: realizedEntryNetPnlKrw,
    realizedNetEdgeBps: realizedEntryNetPnlKrw / plan.notionalKrw * 10_000,
  };
}

async function cancelIfNeeded(
  venue: SpotPerpCarryExecutionVenue,
  order: SubmittedSpotPerpCarryOrder | null,
  reason: string,
): Promise<void> {
  if (order !== null && !terminal(order)) await venue.cancelOrder(order.orderId, reason);
}

export async function submitSpotPerpCarryEntry(
  plan: SpotPerpCarryEntryPlan,
  options: SubmitSpotPerpCarryEntryOptions,
): Promise<SpotPerpCarryEntryExecutionResult> {
  if (!options.allowLiveExecution) {
    throw new Error("spot-perp carry live execution requires explicit allowLiveExecution=true");
  }

  const [spotLeg, perpLeg] = plan.legs;
  const spotVenue = options.venues[spotLeg.venue];
  const perpVenue = options.venues[perpLeg.venue];
  let spotOrder: SubmittedSpotPerpCarryOrder | null = null;
  let perpOrder: SubmittedSpotPerpCarryOrder | null = null;

  try {
    const [spotResult, perpResult] = await Promise.allSettled([
      spotVenue.submitLimitOrder(spotLeg),
      perpVenue.submitLimitOrder(perpLeg),
    ]);

    if (spotResult.status === "fulfilled") spotOrder = spotResult.value;
    if (perpResult.status === "fulfilled") perpOrder = perpResult.value;

    if (spotResult.status === "rejected" || perpResult.status === "rejected") {
      await Promise.all([
        cancelIfNeeded(spotVenue, spotOrder, "paired leg failed"),
        cancelIfNeeded(perpVenue, perpOrder, "paired leg failed"),
      ]);
      spotOrder = null;
      perpOrder = null;
      throw new Error("spot-perp carry submission failed before both legs were accepted");
    }

    if (spotOrder === null || perpOrder === null) {
      throw new Error("spot-perp carry submission did not return both order records");
    }
    if (spotOrder.status !== "filled" || perpOrder.status !== "filled") {
      await Promise.all([
        cancelIfNeeded(spotVenue, spotOrder, "paired leg did not fill"),
        cancelIfNeeded(perpVenue, perpOrder, "paired leg did not fill"),
      ]);
      spotOrder = null;
      perpOrder = null;
      throw new Error("spot-perp carry order did not fill both legs");
    }

    const orders: [SubmittedSpotPerpCarryOrder, SubmittedSpotPerpCarryOrder] = [spotOrder, perpOrder];
    return {
      plan,
      orders,
      reconciliation: reconcileFilledOrders(plan, orders, options),
    };
  } catch (error) {
    if (spotOrder !== null || perpOrder !== null) {
      await Promise.all([
        cancelIfNeeded(spotVenue, spotOrder, "spot-perp carry entry failed"),
        cancelIfNeeded(perpVenue, perpOrder, "spot-perp carry entry failed"),
      ]);
    }
    throw error;
  }
}
