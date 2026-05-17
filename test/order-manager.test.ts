import test from "node:test";
import assert from "node:assert/strict";

import {
  createDryRunOrderManager,
  createLiveOrderManager,
  createPaperOrderManager,
  type MarketSnapshot,
  type PortfolioState,
} from "../src/index.js";

function buildSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    market: "KRW-BTC",
    asOf: "2026-04-02T12:00:00.000Z",
    lastTradePrice: 140_000_000,
    bestBidPrice: 139_990_000,
    bestAskPrice: 140_010_000,
    bestBidSize: 0.3,
    bestAskSize: 0.4,
    spreadBps: 1.4,
    depthRatio: 1.25,
    rolling24hNotional: 450_000_000_000,
    ...overrides,
  };
}

function buildBuySignal(signalId = "sig-buy-1") {
  return {
    schemaVersion: "1.0.0" as const,
    signalId,
    strategyId: "momentum-v1",
    market: "KRW-BTC",
    side: "buy" as const,
    sizing: {
      basis: "quote_notional" as const,
      value: 500_000,
    },
    confidence: 0.72,
    generatedAt: "2026-04-02T11:59:58.000Z",
    expiresAt: "2026-04-02T12:00:10.000Z",
    maxSlippageBps: 6,
    reasonCodes: ["momentum_positive", "depth_support"],
  };
}

test("dry_run manager fills a valid signal at the reference price", async () => {
  const manager = createDryRunOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
  });

  const decision = await manager.submitSignal(buildBuySignal(), {
    marketSnapshot: buildSnapshot(),
  });

  assert.equal(decision.accepted, true);
  if (!decision.accepted) {
    return;
  }

  assert.equal(decision.mode, "dry_run");
  assert.equal(decision.order.status, "filled");
  assert.equal(decision.fills.length, 1);
  assert.equal(decision.fills[0]?.price, 140_010_000);
  assert.ok(manager.getPortfolioState().positions["KRW-BTC"].baseQuantity > 0);
});

test("paper manager fills a buy then a sell and reconciles cleanly", async () => {
  const portfolio: PortfolioState = {
    cashAvailable: 5_000_000,
    dailyRealizedPnl: 0,
    positions: {},
  };

  const manager = createPaperOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio,
  });

  const buy = await manager.submitSignal(buildBuySignal(), {
    marketSnapshot: buildSnapshot(),
  });

  assert.equal(buy.accepted, true);
  if (!buy.accepted) {
    return;
  }

  const postBuy = manager.getPortfolioState();
  const boughtQuantity = postBuy.positions["KRW-BTC"].baseQuantity;
  assert.ok(boughtQuantity > 0);

  const sell = await manager.submitSignal(
    {
      schemaVersion: "1.0.0",
      signalId: "sig-sell-1",
      strategyId: "momentum-v1",
      market: "KRW-BTC",
      side: "sell",
      sizing: {
        basis: "position_fraction",
        value: 1,
      },
      confidence: 0.68,
      generatedAt: "2026-04-02T12:00:01.000Z",
      expiresAt: "2026-04-02T12:00:10.000Z",
      maxSlippageBps: 6,
      reasonCodes: ["momentum_reversal"],
      reduceOnly: true,
    },
    {
      marketSnapshot: buildSnapshot({
        asOf: "2026-04-02T12:00:01.000Z",
        bestBidPrice: 140_050_000,
        bestAskPrice: 140_060_000,
        lastTradePrice: 140_055_000,
      }),
    },
  );

  assert.equal(sell.accepted, true);

  const report = manager.reconcileSession("2026-04-02T12:00:02.000Z");
  assert.equal(report.ok, true);
  assert.equal(report.openPositions.length, 0);
});

test("paper manager realized PnL includes entry and exit fees", async () => {
  const manager = createPaperOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio: {
      cashAvailable: 5_000_000,
      dailyRealizedPnl: 0,
      positions: {},
    },
  });

  const buy = await manager.submitSignal(buildBuySignal("sig-fee-buy"), {
    marketSnapshot: buildSnapshot(),
  });

  assert.equal(buy.accepted, true);
  if (!buy.accepted) {
    return;
  }

  const sell = await manager.submitSignal(
    {
      schemaVersion: "1.0.0",
      signalId: "sig-fee-sell",
      strategyId: "momentum-v1",
      market: "KRW-BTC",
      side: "sell",
      sizing: {
        basis: "position_fraction",
        value: 1,
      },
      confidence: 0.68,
      generatedAt: "2026-04-02T12:00:01.000Z",
      expiresAt: "2026-04-02T12:00:10.000Z",
      maxSlippageBps: 6,
      reasonCodes: ["fee_inclusive_exit"],
      reduceOnly: true,
    },
    {
      marketSnapshot: buildSnapshot({
        asOf: "2026-04-02T12:00:01.000Z",
      }),
    },
  );

  assert.equal(sell.accepted, true);
  if (!sell.accepted) {
    return;
  }

  const buyFill = buy.fills[0];
  const sellFill = sell.fills[0];
  assert.ok(buyFill);
  assert.ok(sellFill);

  const expectedRealizedPnl =
    sellFill.quoteNotional -
    sellFill.feesPaid -
    buyFill.quoteNotional -
    buyFill.feesPaid;

  assert.ok(
    Math.abs(manager.getPortfolioState().dailyRealizedPnl - expectedRealizedPnl) < 1e-9,
  );
});

test("paper manager rejects buys whose worst-case cost exceeds available cash", async () => {
  const manager = createPaperOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio: {
      cashAvailable: 500_100,
      dailyRealizedPnl: 0,
      positions: {},
    },
  });

  const decision = await manager.submitSignal(buildBuySignal("sig-buy-cash-cap"), {
    marketSnapshot: buildSnapshot(),
  });

  assert.equal(decision.accepted, false);
  if (decision.accepted) {
    return;
  }

  assert.equal(decision.reasons[0]?.code, "insufficient_cash");
});

test("paper manager rejects buys whose worst-case notional exceeds the position cap", async () => {
  const manager = createPaperOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio: {
      cashAvailable: 5_000_000,
      dailyRealizedPnl: 0,
      positions: {},
    },
    policy: {
      maxPositionNotionalByMarket: {
        "KRW-BTC": 500_100,
      },
    },
  });

  const decision = await manager.submitSignal(buildBuySignal("sig-buy-position-cap"), {
    marketSnapshot: buildSnapshot(),
  });

  assert.equal(decision.accepted, false);
  if (decision.accepted) {
    return;
  }

  assert.equal(decision.reasons[0]?.code, "max_position_notional_exceeded");
});

test("paper manager keeps reduce-only exits partial even when entry liquidity guards fail", async () => {
  const portfolio: PortfolioState = {
    cashAvailable: 0,
    dailyRealizedPnl: 0,
    positions: {
      "KRW-BTC": {
        market: "KRW-BTC",
        baseQuantity: 8,
        avgEntryPrice: 100_000,
        realizedPnl: 0,
      },
    },
  };

  const manager = createPaperOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio,
  });

  const decision = await manager.submitSignal(
    {
      schemaVersion: "1.0.0",
      signalId: "sig-reduce-only-thin-bid",
      strategyId: "momentum-v1",
      market: "KRW-BTC",
      side: "sell",
      sizing: {
        basis: "position_fraction",
        value: 1,
      },
      confidence: 0.68,
      generatedAt: "2026-04-02T11:59:58.000Z",
      expiresAt: "2026-04-02T12:00:10.000Z",
      maxSlippageBps: 6,
      reasonCodes: ["reduce_only_exit"],
      reduceOnly: true,
    },
    {
      marketSnapshot: buildSnapshot({
        lastTradePrice: 100_000,
        bestBidPrice: 99_990,
        bestAskPrice: 100_010,
        bestBidSize: 0.4,
        bestAskSize: 0.4,
        spreadBps: 2,
        depthRatio: 0.4,
        rolling24hNotional: 10_000_000_000,
      }),
    },
  );

  assert.equal(decision.accepted, true);
  if (!decision.accepted) {
    return;
  }

  assert.equal(decision.order.reduceOnly, true);
  assert.equal(decision.order.status, "partially_filled");
  assert.equal(decision.order.requestedQuantity, 8);
  assert.equal(decision.order.executedQuantity, 1);
  assert.equal(decision.fills.length, 1);
  assert.equal(decision.fills[0]?.quantity, 1);
  assert.match(
    decision.warnings[0] ?? "",
    /paper liquidity exhausted/u,
  );
  assert.equal(
    manager.getPortfolioState().positions["KRW-BTC"]?.baseQuantity,
    7,
  );
});

test("paper manager allows reduce-only exits above the entry notional cap", async () => {
  const portfolio: PortfolioState = {
    cashAvailable: 0,
    dailyRealizedPnl: 0,
    positions: {
      "KRW-BTC": {
        market: "KRW-BTC",
        baseQuantity: 0.02,
        avgEntryPrice: 140_000_000,
        realizedPnl: 0,
      },
    },
  };

  const manager = createPaperOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio,
  });

  const decision = await manager.submitSignal(
    {
      schemaVersion: "1.0.0",
      signalId: "sig-reduce-only-over-cap",
      strategyId: "momentum-v1",
      market: "KRW-BTC",
      side: "sell",
      sizing: {
        basis: "position_fraction",
        value: 1,
      },
      confidence: 0.68,
      generatedAt: "2026-04-02T11:59:58.000Z",
      expiresAt: "2026-04-02T12:00:10.000Z",
      maxSlippageBps: 6,
      reasonCodes: ["reduce_only_exit"],
      reduceOnly: true,
    },
    {
      marketSnapshot: buildSnapshot(),
    },
  );

  assert.equal(decision.accepted, true);
  if (!decision.accepted) {
    return;
  }

  assert.equal(decision.order.reduceOnly, true);
  assert.equal(decision.order.status, "filled");
  assert.equal(decision.order.requestedQuoteNotional, 2_799_800);
  assert.equal(decision.order.executedQuantity, 0.02);
});

test("stale market data is rejected and trips the kill switch", async () => {
  const manager = createPaperOrderManager({
    clock: () => new Date("2026-04-02T12:00:04.000Z"),
  });

  const decision = await manager.submitSignal(buildBuySignal("sig-stale-1"), {
    marketSnapshot: buildSnapshot({
      asOf: "2026-04-02T11:59:57.000Z",
    }),
  });

  assert.equal(decision.accepted, false);
  if (decision.accepted) {
    return;
  }

  assert.equal(decision.reasons[0]?.code, "stale_market_data");

  const followUp = await manager.submitSignal(buildBuySignal("sig-stale-2"), {
    marketSnapshot: buildSnapshot(),
  });

  assert.equal(followUp.accepted, false);
  if (followUp.accepted) {
    return;
  }

  assert.equal(followUp.reasons[0]?.code, "kill_switch_active");
});

test("duplicate signal ids are rejected", async () => {
  const manager = createDryRunOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
  });

  const snapshot = buildSnapshot();
  const first = await manager.submitSignal(buildBuySignal("sig-dup"), {
    marketSnapshot: snapshot,
  });
  assert.equal(first.accepted, true);

  const second = await manager.submitSignal(buildBuySignal("sig-dup"), {
    marketSnapshot: snapshot,
  });

  assert.equal(second.accepted, false);
  if (second.accepted) {
    return;
  }

  assert.equal(second.reasons[0]?.code, "duplicate_signal");
});

test("submitSignal uses receivedAt for replay-time risk checks", async () => {
  const manager = createDryRunOrderManager({
    clock: () => new Date("2026-04-02T12:05:00.000Z"),
  });

  const decision = await manager.submitSignal(buildBuySignal("sig-replay-time"), {
    marketSnapshot: buildSnapshot(),
    receivedAt: "2026-04-02T12:00:01.000Z",
  });

  assert.equal(decision.accepted, true);
  if (!decision.accepted) {
    return;
  }

  assert.equal(decision.order.createdAt, "2026-04-02T12:00:01.000Z");
});

test("live manager applies fills discovered while cancelling an order", async () => {
  let getOrderCalls = 0;
  const manager = createLiveOrderManager({
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio: {
      cashAvailable: 5_000_000,
      dailyRealizedPnl: 0,
      positions: {},
    },
    client: {
      async getAccounts() {
        return [
          { currency: "KRW", balance: "5000000", locked: "0" },
          { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
        ];
      },
      async getOrderChance() {
        return { market_id: "KRW-BTC" };
      },
      async submitOrder() {
        return { ok: true };
      },
      async getOrder(orderId: string) {
        getOrderCalls += 1;
        if (getOrderCalls === 1) {
          return {
            client_order_id: orderId,
            state: "cancel",
            price: "140100000",
            volume: "0.00356832",
            executed_volume: "0",
            remaining_volume: "0.00356832",
            paid_fee: "0",
            created_at: "2026-04-02T12:00:00.000Z",
            updated_at: "2026-04-02T12:00:00.500Z",
          };
        }

        return {
          client_order_id: orderId,
          state: "cancel",
          price: "140100000",
          volume: "0.00356832",
          executed_volume: "0.001",
          remaining_volume: "0.00256832",
          paid_fee: "56.04",
          created_at: "2026-04-02T12:00:00.000Z",
          updated_at: "2026-04-02T12:00:01.000Z",
        };
      },
      async cancelOrder() {
        return {
          state: "accepted",
          updated_at: "2026-04-02T12:00:00.750Z",
        };
      },
    },
  });

  const submitted = await manager.submitSignal(buildBuySignal("sig-live-cancel-fill"), {
    marketSnapshot: buildSnapshot(),
  });

  assert.equal(submitted.accepted, true);
  if (!submitted.accepted) {
    return;
  }

  await manager.cancelOrder(
    submitted.order.orderId,
    "test_cancel",
    "2026-04-02T12:00:01.000Z",
  );

  const ledger = manager.getLedgerSnapshot();
  const portfolio = manager.getPortfolioState();

  assert.equal(ledger.fills.length, 1);
  assert.equal(ledger.fills[0]?.quantity, 0.001);
  assert.equal(ledger.fills[0]?.feesPaid, 56.04);
  assert.equal(portfolio.positions["KRW-BTC"]?.baseQuantity, 0.001);
  assert.ok(portfolio.cashAvailable < 5_000_000);
});
