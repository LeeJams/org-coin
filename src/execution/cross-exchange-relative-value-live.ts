export type RelativeValueDirection =
  | "sell_bithumb_buy_reference"
  | "buy_bithumb_sell_reference";

export type RelativeValueVenue = "bithumb" | "binance";

export interface RelativeValueBook {
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  bids?: BookLevel[];
  asks?: BookLevel[];
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface BuildHedgedRelativeValuePlanInput {
  direction: RelativeValueDirection;
  notionalKrw: number;
  market: string;
  referenceMarket: string;
  referenceQuoteToKrw?: number;
  bithumb: RelativeValueBook;
  reference: RelativeValueBook;
  minNetEdgeBps: number;
  observedNetEdgeBps: number;
  bithumbFeeBps?: number;
  referenceFeeBps?: number;
}

export interface HedgedRelativeValueLeg {
  venue: RelativeValueVenue;
  market: string;
  side: "buy" | "sell";
  limitPrice: number;
  limitPriceCurrency: string;
  quantity: number;
  notionalKrw: number;
  quoteToKrw: number;
  feeBps: number;
}

export interface HedgedRelativeValuePlan {
  direction: RelativeValueDirection;
  notionalKrw: number;
  observedNetEdgeBps: number;
  legs: [HedgedRelativeValueLeg, HedgedRelativeValueLeg];
  requiredInventoryKrw: {
    bithumbBase: number;
    bithumbQuote: number;
    referenceBase: number;
    referenceQuote: number;
  };
}

export interface SubmittedRelativeValueOrder {
  orderId: string;
  status: "accepted" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
  executedQuantity: number;
  executedNotionalKrw: number;
}

export interface RelativeValueExecutionVenue {
  submitLimitOrder(leg: HedgedRelativeValueLeg): Promise<SubmittedRelativeValueOrder>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
}

export interface SubmitHedgedRelativeValueOrderOptions {
  allowLiveExecution: boolean;
  venues: Record<RelativeValueVenue, RelativeValueExecutionVenue>;
  maxLegNotionalMismatchBps?: number;
  maxPairNotionalMismatchBps?: number;
}

export interface HedgedRelativeValueReconciliation {
  plannedNotionalKrw: number;
  legNotionalMismatchBps: [number, number];
  pairNotionalImbalanceKrw: number;
  pairNotionalImbalanceBps: number;
  realizedFeeKrw: number;
  realizedGrossPnlKrw: number;
  realizedGrossEdgeBps: number;
  realizedNetPnlKrw: number;
  realizedNetEdgeBps: number;
}

export interface HedgedRelativeValueExecutionResult {
  plan: HedgedRelativeValuePlan;
  orders: [SubmittedRelativeValueOrder, SubmittedRelativeValueOrder];
  reconciliation: HedgedRelativeValueReconciliation;
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

function topNotionalKrw(price: number, size: number, quoteToKrw: number): number {
  return price * size * quoteToKrw;
}

function levelsForSide(book: RelativeValueBook, side: "buy" | "sell"): BookLevel[] {
  const levels = side === "buy" ? book.asks : book.bids;
  if (Array.isArray(levels) && levels.length > 0) return levels;
  return side === "buy"
    ? [{ price: book.askPrice, size: book.askSize }]
    : [{ price: book.bidPrice, size: book.bidSize }];
}

function executableForNotionalKrw(
  book: RelativeValueBook,
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
    const levelKrw = topNotionalKrw(level.price, level.size, quoteToKrw);
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
  return {
    limitPrice,
    quantity,
    vwapPrice: nativeQuoteNotional / quantity,
  };
}

function quoteToKrwForReference(input: BuildHedgedRelativeValuePlanInput): number {
  if (input.referenceMarket.startsWith("KRW-")) return 1;
  assertPositiveFinite(
    input.referenceQuoteToKrw ?? Number.NaN,
    "referenceQuoteToKrw",
  );
  return input.referenceQuoteToKrw!;
}

function quoteCurrencyForMarket(market: string): string {
  if (market.startsWith("KRW-")) return "KRW";
  for (const suffix of ["USDT", "USDC", "FDUSD"]) {
    if (market.endsWith(suffix)) return suffix;
  }
  return "UNKNOWN";
}

function assertReferencePricesAreNative(
  input: BuildHedgedRelativeValuePlanInput,
): void {
  if (input.referenceMarket.startsWith("KRW-")) return;

  const maxPrice = Math.max(input.reference.bidPrice, input.reference.askPrice);
  if (maxPrice >= 1_000_000) {
    throw new Error("reference prices must be native quote prices, not KRW-translated prices");
  }
}

function feeBps(value: number | undefined, label: string): number {
  const effective = value ?? 0;
  assertNonNegativeFinite(effective, label);
  return effective;
}

export function buildHedgedRelativeValuePlan(
  input: BuildHedgedRelativeValuePlanInput,
): HedgedRelativeValuePlan {
  assertPositiveFinite(input.notionalKrw, "notionalKrw");
  assertPositiveFinite(input.bithumb.bidPrice, "bithumb.bidPrice");
  assertPositiveFinite(input.bithumb.askPrice, "bithumb.askPrice");
  assertPositiveFinite(input.bithumb.bidSize, "bithumb.bidSize");
  assertPositiveFinite(input.bithumb.askSize, "bithumb.askSize");
  assertPositiveFinite(input.reference.bidPrice, "reference.bidPrice");
  assertPositiveFinite(input.reference.askPrice, "reference.askPrice");
  assertPositiveFinite(input.reference.bidSize, "reference.bidSize");
  assertPositiveFinite(input.reference.askSize, "reference.askSize");
  assertNonNegativeFinite(input.minNetEdgeBps, "minNetEdgeBps");

  if (input.observedNetEdgeBps < input.minNetEdgeBps) {
    throw new Error("observed net edge is below the configured live threshold");
  }

  const referenceQuoteToKrw = quoteToKrwForReference(input);
  const bithumbFeeBps = feeBps(input.bithumbFeeBps, "bithumbFeeBps");
  const referenceFeeBps = feeBps(input.referenceFeeBps, "referenceFeeBps");
  assertReferencePricesAreNative(input);

  if (input.direction === "sell_bithumb_buy_reference") {
    const bithumbSell = executableForNotionalKrw(input.bithumb, "sell", input.notionalKrw, 1);
    const referenceBuy = executableForNotionalKrw(
      input.reference,
      "buy",
      input.notionalKrw,
      referenceQuoteToKrw,
    );
    if (bithumbSell === null) {
      throw new Error("Bithumb bid depth is insufficient for the sell leg");
    }
    if (referenceBuy === null) {
      throw new Error("reference ask depth is insufficient for the buy leg");
    }
    return {
      direction: input.direction,
      notionalKrw: input.notionalKrw,
      observedNetEdgeBps: input.observedNetEdgeBps,
      legs: [
        {
          venue: "bithumb",
          market: input.market,
          side: "sell",
          limitPrice: bithumbSell.limitPrice,
          limitPriceCurrency: "KRW",
          quantity: bithumbSell.quantity,
          notionalKrw: input.notionalKrw,
          quoteToKrw: 1,
          feeBps: bithumbFeeBps,
        },
        {
          venue: "binance",
          market: input.referenceMarket,
          side: "buy",
          limitPrice: referenceBuy.limitPrice,
          limitPriceCurrency: quoteCurrencyForMarket(input.referenceMarket),
          quantity: referenceBuy.quantity,
          notionalKrw: input.notionalKrw,
          quoteToKrw: referenceQuoteToKrw,
          feeBps: referenceFeeBps,
        },
      ],
      requiredInventoryKrw: {
        bithumbBase: input.notionalKrw,
        bithumbQuote: 0,
        referenceBase: 0,
        referenceQuote: input.notionalKrw,
      },
    };
  }

  const bithumbBuy = executableForNotionalKrw(input.bithumb, "buy", input.notionalKrw, 1);
  const referenceSell = executableForNotionalKrw(
    input.reference,
    "sell",
    input.notionalKrw,
    referenceQuoteToKrw,
  );
  if (bithumbBuy === null) {
    throw new Error("Bithumb ask depth is insufficient for the buy leg");
  }
  if (referenceSell === null) {
    throw new Error("reference bid depth is insufficient for the sell leg");
  }
  return {
    direction: input.direction,
    notionalKrw: input.notionalKrw,
    observedNetEdgeBps: input.observedNetEdgeBps,
    legs: [
      {
        venue: "bithumb",
        market: input.market,
        side: "buy",
        limitPrice: bithumbBuy.limitPrice,
        limitPriceCurrency: "KRW",
        quantity: bithumbBuy.quantity,
        notionalKrw: input.notionalKrw,
        quoteToKrw: 1,
        feeBps: bithumbFeeBps,
      },
      {
        venue: "binance",
        market: input.referenceMarket,
        side: "sell",
        limitPrice: referenceSell.limitPrice,
        limitPriceCurrency: quoteCurrencyForMarket(input.referenceMarket),
        quantity: referenceSell.quantity,
        notionalKrw: input.notionalKrw,
        quoteToKrw: referenceQuoteToKrw,
        feeBps: referenceFeeBps,
      },
    ],
    requiredInventoryKrw: {
      bithumbBase: 0,
      bithumbQuote: input.notionalKrw,
      referenceBase: input.notionalKrw,
      referenceQuote: 0,
    },
  };
}

function terminal(order: SubmittedRelativeValueOrder): boolean {
  return order.status === "filled" || order.status === "cancelled" || order.status === "rejected";
}

function assertFilledOrderReconciles(
  plan: HedgedRelativeValuePlan,
  leg: HedgedRelativeValueLeg,
  order: SubmittedRelativeValueOrder,
  maxLegNotionalMismatchBps: number,
): number {
  assertPositiveFinite(order.executedQuantity, `${leg.venue} executedQuantity`);
  assertPositiveFinite(order.executedNotionalKrw, `${leg.venue} executedNotionalKrw`);
  const mismatchBps =
    Math.abs(order.executedNotionalKrw - leg.notionalKrw) / leg.notionalKrw * 10_000;
  if (!Number.isFinite(mismatchBps) || mismatchBps > maxLegNotionalMismatchBps) {
    throw new Error(
      `hedged relative-value reconciliation failed: ${leg.venue} executed notional mismatch ${mismatchBps.toFixed(6)} bps exceeds ${maxLegNotionalMismatchBps} bps`,
    );
  }

  const maxQuantity = plan.notionalKrw / Math.max(1, leg.limitPrice * leg.quoteToKrw);
  if (order.executedQuantity > maxQuantity * 1.05) {
    throw new Error(`hedged relative-value reconciliation failed: ${leg.venue} executed quantity is implausible`);
  }
  return mismatchBps;
}

function reconcileFilledOrders(
  plan: HedgedRelativeValuePlan,
  orders: [SubmittedRelativeValueOrder, SubmittedRelativeValueOrder],
  options: SubmitHedgedRelativeValueOrderOptions,
): HedgedRelativeValueReconciliation {
  const maxLegNotionalMismatchBps = options.maxLegNotionalMismatchBps ?? 100;
  const maxPairNotionalMismatchBps = options.maxPairNotionalMismatchBps ?? 100;
  assertNonNegativeFinite(maxLegNotionalMismatchBps, "maxLegNotionalMismatchBps");
  assertNonNegativeFinite(maxPairNotionalMismatchBps, "maxPairNotionalMismatchBps");

  const legNotionalMismatchBps = plan.legs.map((leg, index) =>
    assertFilledOrderReconciles(
      plan,
      leg,
      orders[index]!,
      maxLegNotionalMismatchBps,
    ),
  ) as [number, number];
  const pairNotionalImbalanceKrw = Math.abs(
    orders[0].executedNotionalKrw - orders[1].executedNotionalKrw,
  );
  const pairNotionalImbalanceBps = pairNotionalImbalanceKrw / plan.notionalKrw * 10_000;
  if (
    !Number.isFinite(pairNotionalImbalanceBps) ||
    pairNotionalImbalanceBps > maxPairNotionalMismatchBps
  ) {
    throw new Error(
      `hedged relative-value reconciliation failed: pair notional imbalance ${pairNotionalImbalanceBps.toFixed(6)} bps exceeds ${maxPairNotionalMismatchBps} bps`,
    );
  }

  const realizedGrossPnlKrw = plan.legs.reduce((sum, leg, index) => {
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
  const realizedNetPnlKrw = realizedGrossPnlKrw - realizedFeeKrw;

  return {
    plannedNotionalKrw: plan.notionalKrw,
    legNotionalMismatchBps,
    pairNotionalImbalanceKrw,
    pairNotionalImbalanceBps,
    realizedFeeKrw,
    realizedGrossPnlKrw,
    realizedGrossEdgeBps: realizedGrossPnlKrw / plan.notionalKrw * 10_000,
    realizedNetPnlKrw,
    realizedNetEdgeBps: realizedNetPnlKrw / plan.notionalKrw * 10_000,
  };
}

async function cancelIfNeeded(
  venue: RelativeValueExecutionVenue,
  order: SubmittedRelativeValueOrder | null,
  reason: string,
): Promise<void> {
  if (order !== null && !terminal(order)) {
    await venue.cancelOrder(order.orderId, reason);
  }
}

export async function submitHedgedRelativeValueOrder(
  plan: HedgedRelativeValuePlan,
  options: SubmitHedgedRelativeValueOrderOptions,
): Promise<HedgedRelativeValueExecutionResult> {
  if (!options.allowLiveExecution) {
    throw new Error("cross-exchange live execution requires explicit allowLiveExecution=true");
  }

  const [firstLeg, secondLeg] = plan.legs;
  const firstVenue = options.venues[firstLeg.venue];
  const secondVenue = options.venues[secondLeg.venue];
  let firstOrder: SubmittedRelativeValueOrder | null = null;
  let secondOrder: SubmittedRelativeValueOrder | null = null;

  try {
    const [firstResult, secondResult] = await Promise.allSettled([
      firstVenue.submitLimitOrder(firstLeg),
      secondVenue.submitLimitOrder(secondLeg),
    ]);

    if (firstResult.status === "fulfilled") firstOrder = firstResult.value;
    if (secondResult.status === "fulfilled") secondOrder = secondResult.value;

    if (firstResult.status === "rejected" || secondResult.status === "rejected") {
      await Promise.all([
        cancelIfNeeded(firstVenue, firstOrder, "paired leg failed"),
        cancelIfNeeded(secondVenue, secondOrder, "paired leg failed"),
      ]);
      firstOrder = null;
      secondOrder = null;
      throw new Error("hedged relative-value submission failed before both legs were accepted");
    }

    if (firstOrder === null || secondOrder === null) {
      throw new Error("hedged relative-value submission did not return both order records");
    }

    const acceptedFirstOrder = firstOrder;
    const acceptedSecondOrder = secondOrder;

    if (acceptedFirstOrder.status !== "filled" || acceptedSecondOrder.status !== "filled") {
      await Promise.all([
        cancelIfNeeded(firstVenue, acceptedFirstOrder, "paired leg did not fill"),
        cancelIfNeeded(secondVenue, acceptedSecondOrder, "paired leg did not fill"),
      ]);
      firstOrder = null;
      secondOrder = null;
      throw new Error("hedged relative-value order did not fill both legs");
    }

    const orders: [SubmittedRelativeValueOrder, SubmittedRelativeValueOrder] = [
      acceptedFirstOrder,
      acceptedSecondOrder,
    ];
    return {
      plan,
      orders,
      reconciliation: reconcileFilledOrders(plan, orders, options),
    };
  } catch (error) {
    if (firstOrder !== null || secondOrder !== null) {
      await Promise.all([
        cancelIfNeeded(firstVenue, firstOrder, "hedged order failed"),
        cancelIfNeeded(secondVenue, secondOrder, "hedged order failed"),
      ]);
    }
    throw error;
  }
}
