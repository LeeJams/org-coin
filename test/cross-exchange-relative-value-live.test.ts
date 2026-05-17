import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHedgedRelativeValuePlan,
  submitHedgedRelativeValueOrder,
  type HedgedRelativeValueLeg,
  type RelativeValueExecutionVenue,
  type SubmittedRelativeValueOrder,
} from "../src/execution/cross-exchange-relative-value-live.js";

function filledOrder(leg: HedgedRelativeValueLeg): SubmittedRelativeValueOrder {
  return {
    orderId: `${leg.venue}-${leg.side}`,
    status: "filled",
    executedQuantity: leg.quantity,
    executedNotionalKrw: leg.notionalKrw,
  };
}

function venue(options?: {
  reject?: boolean;
  status?: SubmittedRelativeValueOrder["status"];
  executedNotionalKrw?: number;
  cancelled?: string[];
}): RelativeValueExecutionVenue {
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

const usdKrw = 1_473.05;

test("hedged relative-value plan maps sell-Bithumb buy-reference direction", () => {
  const plan = buildHedgedRelativeValuePlan({
    direction: "sell_bithumb_buy_reference",
    notionalKrw: 50_000,
    market: "KRW-BTC",
    referenceMarket: "BTCUSDT",
    referenceQuoteToKrw: usdKrw,
    bithumb: {
      bidPrice: 119_600_000,
      bidSize: 0.01,
      askPrice: 119_610_000,
      askSize: 0.01,
    },
    reference: {
      bidPrice: 80_800,
      bidSize: 0.01,
      askPrice: 80_850,
      askSize: 0.01,
    },
    minNetEdgeBps: 20,
    observedNetEdgeBps: 42,
    bithumbFeeBps: 4,
    referenceFeeBps: 10,
  });

  assert.equal(plan.legs[0].venue, "bithumb");
  assert.equal(plan.legs[0].side, "sell");
  assert.equal(plan.legs[0].limitPrice, 119_600_000);
  assert.equal(plan.legs[0].limitPriceCurrency, "KRW");
  assert.equal(plan.legs[0].feeBps, 4);
  assert.equal(plan.legs[1].venue, "binance");
  assert.equal(plan.legs[1].side, "buy");
  assert.equal(plan.legs[1].limitPrice, 80_850);
  assert.equal(plan.legs[1].limitPriceCurrency, "USDT");
  assert.equal(plan.legs[1].feeBps, 10);
  assert.equal(plan.legs[1].quoteToKrw, usdKrw);
  assert.equal(
    Number((plan.legs[1].quantity * plan.legs[1].limitPrice * usdKrw).toFixed(6)),
    50_000,
  );
  assert.equal(plan.requiredInventoryKrw.bithumbBase, 50_000);
  assert.equal(plan.requiredInventoryKrw.referenceQuote, 50_000);
});

test("hedged relative-value plan requires a KRW conversion for Binance native quotes", () => {
  assert.throws(
    () =>
      buildHedgedRelativeValuePlan({
        direction: "sell_bithumb_buy_reference",
        notionalKrw: 50_000,
        market: "KRW-BTC",
        referenceMarket: "BTCUSDT",
        bithumb: {
          bidPrice: 119_600_000,
          bidSize: 0.01,
          askPrice: 119_610_000,
          askSize: 0.01,
        },
        reference: {
          bidPrice: 80_800,
          bidSize: 0.01,
          askPrice: 80_850,
          askSize: 0.01,
        },
        minNetEdgeBps: 20,
        observedNetEdgeBps: 42,
      }),
    /referenceQuoteToKrw/,
  );
});

test("hedged relative-value plan rejects KRW-translated Binance reference prices", () => {
  assert.throws(
    () =>
      buildHedgedRelativeValuePlan({
        direction: "sell_bithumb_buy_reference",
        notionalKrw: 50_000,
        market: "KRW-BTC",
        referenceMarket: "BTCUSDT",
        referenceQuoteToKrw: usdKrw,
        bithumb: {
          bidPrice: 119_600_000,
          bidSize: 0.01,
          askPrice: 119_610_000,
          askSize: 0.01,
        },
        reference: {
          bidPrice: 119_000_000,
          bidSize: 0.01,
          askPrice: 119_100_000,
          askSize: 0.01,
        },
        minNetEdgeBps: 20,
        observedNetEdgeBps: 42,
      }),
    /native quote prices/,
  );
});

test("hedged relative-value plan blocks weak edge and insufficient depth", () => {
  assert.throws(
    () =>
      buildHedgedRelativeValuePlan({
        direction: "sell_bithumb_buy_reference",
        notionalKrw: 50_000,
        market: "KRW-BTC",
        referenceMarket: "BTCUSDT",
        referenceQuoteToKrw: usdKrw,
        bithumb: {
          bidPrice: 119_600_000,
          bidSize: 0.01,
          askPrice: 119_610_000,
          askSize: 0.01,
        },
        reference: {
          bidPrice: 80_800,
          bidSize: 0.01,
          askPrice: 80_850,
          askSize: 0.01,
        },
        minNetEdgeBps: 20,
        observedNetEdgeBps: 19,
      }),
    /below the configured live threshold/,
  );

  assert.throws(
    () =>
      buildHedgedRelativeValuePlan({
        direction: "sell_bithumb_buy_reference",
        notionalKrw: 50_000,
        market: "KRW-BTC",
        referenceMarket: "BTCUSDT",
        referenceQuoteToKrw: usdKrw,
        bithumb: {
          bidPrice: 119_600_000,
          bidSize: 0.0001,
          askPrice: 119_610_000,
          askSize: 0.01,
        },
        reference: {
          bidPrice: 80_800,
          bidSize: 0.01,
          askPrice: 80_850,
          askSize: 0.01,
        },
        minNetEdgeBps: 20,
        observedNetEdgeBps: 42,
      }),
    /Bithumb bid depth is insufficient/,
  );
});

test("hedged relative-value plan can use multi-level executable depth", () => {
  const plan = buildHedgedRelativeValuePlan({
    direction: "sell_bithumb_buy_reference",
    notionalKrw: 50_000,
    market: "KRW-BTC",
    referenceMarket: "BTCUSDT",
    referenceQuoteToKrw: usdKrw,
    bithumb: {
      bidPrice: 119_600_000,
      bidSize: 0.0001,
      askPrice: 119_610_000,
      askSize: 0.01,
      bids: [
        { price: 119_600_000, size: 0.0001 },
        { price: 119_590_000, size: 0.01 },
      ],
      asks: [{ price: 119_610_000, size: 0.01 }],
    },
    reference: {
      bidPrice: 80_800,
      bidSize: 0.01,
      askPrice: 80_850,
      askSize: 0.0001,
      bids: [{ price: 80_800, size: 0.01 }],
      asks: [
        { price: 80_850, size: 0.0001 },
        { price: 80_860, size: 0.01 },
      ],
    },
    minNetEdgeBps: 20,
    observedNetEdgeBps: 42,
    bithumbFeeBps: 4,
    referenceFeeBps: 10,
  });

  assert.equal(plan.legs[0].limitPrice, 119_590_000);
  assert.equal(plan.legs[1].limitPrice, 80_860);
  assert.ok(plan.legs[0].quantity > 0.0004);
  assert.ok(plan.legs[1].quantity > 0.0004);
});

test("hedged relative-value submission requires explicit live allowance", async () => {
  const plan = buildHedgedRelativeValuePlan({
    direction: "sell_bithumb_buy_reference",
    notionalKrw: 50_000,
    market: "KRW-BTC",
    referenceMarket: "BTCUSDT",
    referenceQuoteToKrw: usdKrw,
    bithumb: {
      bidPrice: 119_600_000,
      bidSize: 0.01,
      askPrice: 119_610_000,
      askSize: 0.01,
    },
    reference: {
      bidPrice: 80_800,
      bidSize: 0.01,
      askPrice: 80_850,
      askSize: 0.01,
    },
    minNetEdgeBps: 20,
    observedNetEdgeBps: 42,
  });

  await assert.rejects(
    () =>
      submitHedgedRelativeValueOrder(plan, {
        allowLiveExecution: false,
        venues: {
          bithumb: venue(),
          binance: venue(),
        },
      }),
    /allowLiveExecution=true/,
  );
});

test("hedged relative-value submission reconciles filled leg notionals and net PnL", async () => {
  const plan = buildHedgedRelativeValuePlan({
    direction: "sell_bithumb_buy_reference",
    notionalKrw: 50_000,
    market: "KRW-BTC",
    referenceMarket: "BTCUSDT",
    referenceQuoteToKrw: usdKrw,
    bithumb: {
      bidPrice: 119_600_000,
      bidSize: 0.01,
      askPrice: 119_610_000,
      askSize: 0.01,
    },
    reference: {
      bidPrice: 80_800,
      bidSize: 0.01,
      askPrice: 80_850,
      askSize: 0.01,
    },
    minNetEdgeBps: 20,
    observedNetEdgeBps: 42,
    bithumbFeeBps: 4,
    referenceFeeBps: 10,
  });

  const result = await submitHedgedRelativeValueOrder(plan, {
    allowLiveExecution: true,
    venues: {
      bithumb: venue({ executedNotionalKrw: 50_100 }),
      binance: venue({ executedNotionalKrw: 50_000 }),
    },
  });

  assert.equal(result.reconciliation.plannedNotionalKrw, 50_000);
  assert.equal(result.reconciliation.pairNotionalImbalanceKrw, 100);
  assert.equal(result.reconciliation.pairNotionalImbalanceBps, 20);
  assert.equal(result.reconciliation.realizedGrossPnlKrw, 100);
  assert.equal(result.reconciliation.realizedGrossEdgeBps, 20);
  assert.equal(Number(result.reconciliation.realizedFeeKrw.toFixed(6)), 70.04);
  assert.equal(Number(result.reconciliation.realizedNetPnlKrw.toFixed(6)), 29.96);
  assert.equal(Number(result.reconciliation.realizedNetEdgeBps.toFixed(6)), 5.992);
});

test("hedged relative-value submission rejects unreconciled filled notionals", async () => {
  const plan = buildHedgedRelativeValuePlan({
    direction: "sell_bithumb_buy_reference",
    notionalKrw: 50_000,
    market: "KRW-BTC",
    referenceMarket: "BTCUSDT",
    referenceQuoteToKrw: usdKrw,
    bithumb: {
      bidPrice: 119_600_000,
      bidSize: 0.01,
      askPrice: 119_610_000,
      askSize: 0.01,
    },
    reference: {
      bidPrice: 80_800,
      bidSize: 0.01,
      askPrice: 80_850,
      askSize: 0.01,
    },
    minNetEdgeBps: 20,
    observedNetEdgeBps: 42,
  });

  await assert.rejects(
    () =>
      submitHedgedRelativeValueOrder(plan, {
        allowLiveExecution: true,
        maxPairNotionalMismatchBps: 10,
        venues: {
          bithumb: venue({ executedNotionalKrw: 50_100 }),
          binance: venue({ executedNotionalKrw: 50_000 }),
        },
      }),
    /reconciliation failed: pair notional imbalance/,
  );
});

test("hedged relative-value submission cancels an accepted leg when the pair fails", async () => {
  const plan = buildHedgedRelativeValuePlan({
    direction: "sell_bithumb_buy_reference",
    notionalKrw: 50_000,
    market: "KRW-BTC",
    referenceMarket: "BTCUSDT",
    referenceQuoteToKrw: usdKrw,
    bithumb: {
      bidPrice: 119_600_000,
      bidSize: 0.01,
      askPrice: 119_610_000,
      askSize: 0.01,
    },
    reference: {
      bidPrice: 80_800,
      bidSize: 0.01,
      askPrice: 80_850,
      askSize: 0.01,
    },
    minNetEdgeBps: 20,
    observedNetEdgeBps: 42,
  });
  const cancelled: string[] = [];

  await assert.rejects(
    () =>
      submitHedgedRelativeValueOrder(plan, {
        allowLiveExecution: true,
        venues: {
          bithumb: venue({ status: "open", cancelled }),
          binance: venue(),
        },
      }),
    /did not fill both legs/,
  );

  assert.deepEqual(cancelled, ["bithumb-sell"]);
});
