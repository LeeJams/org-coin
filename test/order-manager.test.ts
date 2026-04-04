import test from "node:test";
import assert from "node:assert/strict";

import {
  createDryRunOrderManager,
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

test("dry_run manager accepts a valid signal without fills", async () => {
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
  assert.equal(decision.order.status, "accepted");
  assert.equal(decision.fills.length, 0);
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
