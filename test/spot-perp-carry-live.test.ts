import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpotPerpCarryEntryPlan,
  submitSpotPerpCarryEntry,
  type SpotPerpCarryExecutionVenue,
  type SpotPerpCarryLeg,
  type SubmittedSpotPerpCarryOrder,
} from "../src/index.js";

const usdtKrw = 1_473.05;

function filledOrder(leg: SpotPerpCarryLeg): SubmittedSpotPerpCarryOrder {
  return {
    orderId: `${leg.venue}-${leg.side}`,
    status: "filled",
    executedQuantity: leg.quantity,
    executedNotionalKrw: leg.notionalKrw,
  };
}

function venue(options?: {
  reject?: boolean;
  status?: SubmittedSpotPerpCarryOrder["status"];
  executedNotionalKrw?: number;
  cancelled?: string[];
}): SpotPerpCarryExecutionVenue {
  return {
    async submitLimitOrder(leg) {
      if (options?.reject) throw new Error(`${leg.venue} rejected`);
      return {
        ...filledOrder(leg),
        executedNotionalKrw: options?.executedNotionalKrw ?? leg.notionalKrw,
        status: options?.status ?? "filled",
      };
    },
    async cancelOrder(orderId) {
      options?.cancelled?.push(orderId);
    },
  };
}

test("spot-perp carry plan maps long Bithumb spot and short Binance USD-M perp", () => {
  const plan = buildSpotPerpCarryEntryPlan({
    direction: "long_bithumb_spot_short_binance_perp",
    notionalKrw: 500_000,
    market: "KRW-PIEVERSE",
    symbol: "PIEVERSEUSDT",
    quoteToKrw: usdtKrw,
    spot: {
      bidPrice: 548.8,
      bidSize: 10_000,
      askPrice: 550,
      askSize: 10_000,
    },
    perp: {
      bidPrice: 0.378,
      bidSize: 1_000_000,
      askPrice: 0.379,
      askSize: 1_000_000,
    },
    minNetCarryBps: 20,
    observedNetCarryBps: 90,
    bithumbFeeBps: 4,
    binanceFuturesFeeBps: 5,
  });

  assert.equal(plan.direction, "long_bithumb_spot_short_binance_perp");
  assert.equal(plan.legs[0].venue, "bithumb");
  assert.equal(plan.legs[0].side, "buy");
  assert.equal(plan.legs[0].limitPriceCurrency, "KRW");
  assert.equal(plan.legs[0].limitPrice, 550);
  assert.equal(plan.legs[1].venue, "binance_usdm");
  assert.equal(plan.legs[1].side, "sell");
  assert.equal(plan.legs[1].limitPriceCurrency, "USDT");
  assert.equal(plan.legs[1].limitPrice, 0.378);
  assert.equal(plan.legs[1].quoteToKrw, usdtKrw);
  assert.equal(plan.requiredInventoryKrw.bithumbQuote, 500_000);
  assert.equal(plan.requiredInventoryKrw.binanceMargin, 500_000);
});

test("spot-perp carry plan blocks weak carry, KRW-translated perp prices, and insufficient depth", () => {
  const input = {
    direction: "long_bithumb_spot_short_binance_perp" as const,
    notionalKrw: 500_000,
    market: "KRW-PIEVERSE",
    symbol: "PIEVERSEUSDT",
    quoteToKrw: usdtKrw,
    spot: {
      bidPrice: 548.8,
      bidSize: 10_000,
      askPrice: 550,
      askSize: 10_000,
    },
    perp: {
      bidPrice: 0.378,
      bidSize: 1_000_000,
      askPrice: 0.379,
      askSize: 1_000_000,
    },
    minNetCarryBps: 20,
    observedNetCarryBps: 90,
    bithumbFeeBps: 4,
    binanceFuturesFeeBps: 5,
  };

  assert.throws(
    () => buildSpotPerpCarryEntryPlan({ ...input, observedNetCarryBps: 19 }),
    /below the configured live threshold/,
  );
  assert.throws(
    () =>
      buildSpotPerpCarryEntryPlan({
        ...input,
        perp: { ...input.perp, bidPrice: 1_557_000, askPrice: 1_558_000 },
      }),
    /native USDT prices/,
  );
  assert.throws(
    () =>
      buildSpotPerpCarryEntryPlan({
        ...input,
        spot: { ...input.spot, askSize: 1 },
      }),
    /Bithumb ask depth is insufficient/,
  );
});

test("spot-perp carry plan uses multi-level executable depth", () => {
  const plan = buildSpotPerpCarryEntryPlan({
    direction: "long_bithumb_spot_short_binance_perp",
    notionalKrw: 500_000,
    market: "KRW-PIEVERSE",
    symbol: "PIEVERSEUSDT",
    quoteToKrw: usdtKrw,
    spot: {
      bidPrice: 548.8,
      bidSize: 10_000,
      askPrice: 550,
      askSize: 10,
      asks: [
        { price: 550, size: 10 },
        { price: 551, size: 10_000 },
      ],
    },
    perp: {
      bidPrice: 0.378,
      bidSize: 10,
      askPrice: 0.379,
      askSize: 1_000_000,
      bids: [
        { price: 0.378, size: 10 },
        { price: 0.377, size: 1_000_000 },
      ],
    },
    minNetCarryBps: 20,
    observedNetCarryBps: 90,
    bithumbFeeBps: 4,
    binanceFuturesFeeBps: 5,
  });

  assert.equal(plan.legs[0].limitPrice, 551);
  assert.equal(plan.legs[1].limitPrice, 0.377);
});

test("spot-perp carry submission requires explicit live allowance", async () => {
  const plan = buildSpotPerpCarryEntryPlan({
    direction: "long_bithumb_spot_short_binance_perp",
    notionalKrw: 500_000,
    market: "KRW-PIEVERSE",
    symbol: "PIEVERSEUSDT",
    quoteToKrw: usdtKrw,
    spot: { bidPrice: 548.8, bidSize: 10_000, askPrice: 550, askSize: 10_000 },
    perp: { bidPrice: 0.378, bidSize: 1_000_000, askPrice: 0.379, askSize: 1_000_000 },
    minNetCarryBps: 20,
    observedNetCarryBps: 90,
    bithumbFeeBps: 4,
    binanceFuturesFeeBps: 5,
  });

  await assert.rejects(
    () =>
      submitSpotPerpCarryEntry(plan, {
        allowLiveExecution: false,
        venues: {
          bithumb: venue(),
          binance_usdm: venue(),
        },
      }),
    /allowLiveExecution=true/,
  );
});

test("spot-perp carry submission reconciles filled legs and blocks imbalance", async () => {
  const plan = buildSpotPerpCarryEntryPlan({
    direction: "long_bithumb_spot_short_binance_perp",
    notionalKrw: 500_000,
    market: "KRW-PIEVERSE",
    symbol: "PIEVERSEUSDT",
    quoteToKrw: usdtKrw,
    spot: { bidPrice: 548.8, bidSize: 10_000, askPrice: 550, askSize: 10_000 },
    perp: { bidPrice: 0.378, bidSize: 1_000_000, askPrice: 0.379, askSize: 1_000_000 },
    minNetCarryBps: 20,
    observedNetCarryBps: 90,
    bithumbFeeBps: 4,
    binanceFuturesFeeBps: 5,
  });

  const result = await submitSpotPerpCarryEntry(plan, {
    allowLiveExecution: true,
    venues: {
      bithumb: venue({ executedNotionalKrw: 500_000 }),
      binance_usdm: venue({ executedNotionalKrw: 500_100 }),
    },
  });

  assert.equal(result.reconciliation.pairNotionalImbalanceKrw, 100);
  assert.equal(result.reconciliation.pairNotionalImbalanceBps, 2);
  assert.equal(Number(result.reconciliation.realizedFeeKrw.toFixed(6)), 450.05);
  assert.equal(Number(result.reconciliation.realizedNetPnlKrw.toFixed(6)), -350.05);

  await assert.rejects(
    () =>
      submitSpotPerpCarryEntry(plan, {
        allowLiveExecution: true,
        maxPairNotionalMismatchBps: 1,
        venues: {
          bithumb: venue({ executedNotionalKrw: 500_000 }),
          binance_usdm: venue({ executedNotionalKrw: 500_100 }),
        },
      }),
    /reconciliation failed: pair notional imbalance/,
  );
});

test("spot-perp carry submission cancels an accepted leg when the pair fails", async () => {
  const plan = buildSpotPerpCarryEntryPlan({
    direction: "long_bithumb_spot_short_binance_perp",
    notionalKrw: 500_000,
    market: "KRW-PIEVERSE",
    symbol: "PIEVERSEUSDT",
    quoteToKrw: usdtKrw,
    spot: { bidPrice: 548.8, bidSize: 10_000, askPrice: 550, askSize: 10_000 },
    perp: { bidPrice: 0.378, bidSize: 1_000_000, askPrice: 0.379, askSize: 1_000_000 },
    minNetCarryBps: 20,
    observedNetCarryBps: 90,
    bithumbFeeBps: 4,
    binanceFuturesFeeBps: 5,
  });
  const cancelled: string[] = [];

  await assert.rejects(
    () =>
      submitSpotPerpCarryEntry(plan, {
        allowLiveExecution: true,
        venues: {
          bithumb: venue({ status: "open", cancelled }),
          binance_usdm: venue(),
        },
      }),
    /did not fill both legs/,
  );

  assert.deepEqual(cancelled, ["bithumb-buy"]);
});
