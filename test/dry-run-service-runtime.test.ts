import test from "node:test";
import assert from "node:assert/strict";

import {
  assertLiveKillSwitchClear,
  buildBtc240mManagedScenario,
  buildDryRunCycleFailure,
  buildCarryForwardPortfolio,
  buildKrwH60mMomentumManagedScenario,
  buildPieverse60mReversalManagedScenario,
  DryRunCommandFailureError,
  deriveCarryForwardOpenPositionState,
  estimatePortfolioEquity,
  findExecutableOrderbookLevel,
  isRetryableDryRunCommandFailure,
  syncLiveManagedStateWithClient,
  tripManagedKillSwitch,
} from "../src/cli/run-dry-run-service.js";
import { InvalidPaperSessionScenarioError } from "../src/execution/run-paper-session.js";
import type { MarketSnapshot } from "../src/contracts/market-snapshot.js";

function btc240mObservation(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-05-12T12:00:00.000Z",
    candidate: {
      market: "KRW-BTC",
      signalMode: "momentum",
      unitMinutes: 240,
      lookbackBars: 24,
      holdBars: 24,
      minReturnBps: 25,
      riskFilter: "rv24_below_p70",
      riskThreshold: 435.990666,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 15.690478,
    },
    signal: {
      active: true,
      latestCandleAt: "2026-05-12T11:00:00.000Z",
      previousCandleAt: "2026-05-08T11:00:00.000Z",
      lookbackReturnBps: 101.010101,
      riskValue: 164.073982,
    },
    orderbook: {
      bestAsk: 100_000_000,
      bestBid: 99_990_000,
      bestAskSize: 0.01,
      bestBidSize: 0.01,
      spreadBps: 1.0001,
      buyDepth: {
        notionalKrw: 1_000_000,
        coversRequestedNotional: true,
      },
      sellDepth: {
        notionalKrw: 1_000_000,
        coversRequestedNotional: true,
      },
    },
    ticker: {
      tradePrice: 100_000_000,
      accTradePrice24h: 50_000_000_000,
    },
    decision: {
      executionViability: "watch_candidate",
      reasons: [],
    },
    ...overrides,
  } as Parameters<typeof buildBtc240mManagedScenario>[0];
}

function pieverse60mObservation(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-05-12T12:00:00.000Z",
    candidate: {
      market: "KRW-PIEVERSE",
      signalMode: "reversal",
      unitMinutes: 60,
      lookbackBars: 168,
      holdBars: 24,
      minReturnBps: 50,
      minDropBps: 50,
      riskFilter: "rv24_below_median",
      riskThreshold: 751.7214747340527,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 129.95314,
    },
    signal: {
      active: true,
      latestCandleAt: "2026-05-12T11:00:00.000Z",
      previousCandleAt: "2026-05-05T11:00:00.000Z",
      lookbackReturnBps: -250.123456,
      riskValue: 512.345678,
    },
    orderbook: {
      bestAsk: 1_205,
      bestBid: 1_204,
      bestAskSize: 800,
      bestBidSize: 800,
      spreadBps: 8.305648,
      buyDepth: {
        notionalKrw: 1_000_000,
        coversRequestedNotional: true,
      },
      sellDepth: {
        notionalKrw: 1_000_000,
        coversRequestedNotional: true,
      },
    },
    ticker: {
      tradePrice: 1_205,
      accTradePrice24h: 6_000_000_000,
    },
    decision: {
      executionViability: "watch_candidate",
      reasons: [],
    },
    ...overrides,
  } as Parameters<typeof buildPieverse60mReversalManagedScenario>[0];
}

function krwH60mObservation(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-05-12T12:00:00.000Z",
    candidate: {
      market: "KRW-H",
      signalMode: "momentum",
      unitMinutes: 60,
      lookbackBars: 168,
      holdBars: 24,
      minReturnBps: 0,
      minDropBps: 50,
      riskFilter: "range24_below_p70",
      riskThreshold: 2065.7276995305174,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 138.73015874,
    },
    signal: {
      active: true,
      latestCandleAt: "2026-05-12T11:00:00.000Z",
      previousCandleAt: "2026-05-05T11:00:00.000Z",
      lookbackReturnBps: 320.123456,
      riskValue: 1_950.123456,
    },
    orderbook: {
      bestAsk: 25,
      bestBid: 24.9,
      bestAskSize: 50_000,
      bestBidSize: 50_000,
      spreadBps: 40.08016,
      buyDepth: {
        notionalKrw: 1_250_000,
        coversRequestedNotional: true,
      },
      sellDepth: {
        notionalKrw: 1_245_000,
        coversRequestedNotional: true,
      },
    },
    ticker: {
      tradePrice: 25,
      accTradePrice24h: 4_000_000_000,
    },
    decision: {
      executionViability: "watch_candidate",
      reasons: [],
    },
    ...overrides,
  } as Parameters<typeof buildKrwH60mMomentumManagedScenario>[0];
}

function btcBenchmarkSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    market: "KRW-BTC",
    asOf: "2026-05-12T12:00:00.000Z",
    lastTradePrice: 100_000_000,
    bestBidPrice: 99_990_000,
    bestAskPrice: 100_000_000,
    bestBidSize: 0.05,
    bestAskSize: 0.05,
    spreadBps: 1.0001,
    depthRatio: 5,
    rolling24hNotional: 50_000_000_000,
    ...overrides,
  };
}

test("findExecutableOrderbookLevel keeps price and size from the same live book level", () => {
  const units = [
    {
      bid_price: "119417000",
      bid_size: "0",
      ask_price: "119446000",
      ask_size: "0.0304",
    },
    {
      bid_price: "119410000",
      bid_size: "0.0123",
      ask_price: "119450000",
      ask_size: "0",
    },
  ];

  assert.deepEqual(
    findExecutableOrderbookLevel(units, "bid_price", "bid_size"),
    { price: 119_410_000, size: 0.0123 },
  );
  assert.deepEqual(
    findExecutableOrderbookLevel(units, "ask_price", "ask_size"),
    { price: 119_446_000, size: 0.0304 },
  );
});

function managedState(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0.0",
    configSignature: "btc-240m",
    executionMode: "paper",
    runStartedAt: "2026-05-12T11:55:00.000Z",
    runInitialEquityKrw: 1_000_000,
    currentEquityKrw: 1_000_000,
    portfolio: {
      cashAvailable: 1_000_000,
      dailyRealizedPnl: 0,
      positions: {},
    },
    openPositionState: null,
    ...overrides,
  } as Parameters<typeof buildBtc240mManagedScenario>[1];
}

test("buildBtc240mManagedScenario creates a buy signal for viable flat state", () => {
  const result = buildBtc240mManagedScenario(btc240mObservation(), managedState());

  assert.equal(result.signalAction, "buy");
  assert.deepEqual(result.skippedReasons, []);
  assert.equal(result.scenario.metadata?.summary?.entrySignalCount, 1);
  assert.equal(result.scenario.events.length, 2);
  const signalEvent = result.scenario.events[1];
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.side, "buy");
    assert.equal(signalEvent.signal.strategyId, "btc_240m_momentum_public_v1");
    assert.deepEqual(signalEvent.signal.sizing, {
      basis: "quote_notional",
      value: 500_000,
    });
  }
});

test("buildBtc240mManagedScenario can emit the min75 strategy id", () => {
  const result = buildBtc240mManagedScenario(
    btc240mObservation({
      candidate: {
        market: "KRW-BTC",
        signalMode: "momentum",
        unitMinutes: 240,
        lookbackBars: 24,
        holdBars: 24,
        minReturnBps: 75,
        riskFilter: "rv24_below_p70",
        riskThreshold: 435.9906664851208,
        notionalKrw: 500_000,
        expectedMedianEdgeBps: 15.690478,
      },
    }),
    managedState(),
    "btc_240m_momentum_min75_candidate_v1",
  );

  const signalEvent = result.scenario.events[1];
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.strategyId, "btc_240m_momentum_min75_candidate_v1");
    assert.match(signalEvent.signal.signalId, /^btc_240m_momentum_min75_candidate_v1-/);
  }
  assert.equal(result.scenario.metadata?.strategyId, "btc_240m_momentum_min75_candidate_v1");
  assert.equal(result.scenario.metadata?.entryProfile, "btc_240m_momentum_min75_candidate_v1");
});

test("buildBtc240mManagedScenario holds an open BTC 240m position before hold expiry", () => {
  const result = buildBtc240mManagedScenario(
    btc240mObservation(),
    managedState({
      portfolio: {
        cashAvailable: 500_000,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-BTC": {
            market: "KRW-BTC",
            baseQuantity: 0.005,
            avgEntryPrice: 100_000_000,
          },
        },
      },
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
        entryPrice: 100_000_000,
        quantity: 0.005,
        quoteNotional: 500_000,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 100_000_000,
      },
    }),
  );

  assert.equal(result.signalAction, "hold");
  assert.deepEqual(result.skippedReasons, ["open_position_hold_window_active"]);
  assert.equal(result.scenario.events.length, 1);
  assert.equal(result.scenario.metadata?.carryOpenPositions, true);
});

test("buildBtc240mManagedScenario creates reduce-only sell after hold expiry", () => {
  const result = buildBtc240mManagedScenario(
    btc240mObservation({ generatedAt: "2026-05-16T12:00:00.000Z" }),
    managedState({
      portfolio: {
        cashAvailable: 500_000,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-BTC": {
            market: "KRW-BTC",
            baseQuantity: 0.005,
            avgEntryPrice: 100_000_000,
          },
        },
      },
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
        entryPrice: 100_000_000,
        quantity: 0.005,
        quoteNotional: 500_000,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 100_000_000,
      },
    }),
  );

  assert.equal(result.signalAction, "sell");
  assert.equal(result.scenario.metadata?.carryOpenPositions, false);
  const signalEvent = result.scenario.events[1];
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.side, "sell");
    assert.equal(signalEvent.signal.reduceOnly, true);
    assert.deepEqual(signalEvent.signal.sizing, {
      basis: "position_fraction",
      value: 1,
    });
  }
});

test("buildBtc240mManagedScenario honors candidate holdBars for extended holds", () => {
  const observation = btc240mObservation({
    generatedAt: "2026-05-16T12:00:00.000Z",
    candidate: {
      market: "KRW-BTC",
      signalMode: "momentum",
      unitMinutes: 240,
      lookbackBars: 168,
      holdBars: 72,
      minReturnBps: 0,
      riskFilter: "range24_below_p70",
      riskThreshold: 783.7406329668073,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 58.09469328,
    },
  });
  const state = managedState({
    portfolio: {
      cashAvailable: 500_000,
      dailyRealizedPnl: 0,
      positions: {
        "KRW-BTC": {
          market: "KRW-BTC",
          baseQuantity: 0.005,
          avgEntryPrice: 100_000_000,
        },
      },
    },
    openPositionState: {
      market: "KRW-BTC",
      enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
      entryPrice: 100_000_000,
      quantity: 0.005,
      quoteNotional: 500_000,
      consecutiveNegativeRet1m: 0,
      consecutiveBookFailures: 0,
      peakBidPrice: 100_000_000,
    },
  });

  const beforeExtendedHold = buildBtc240mManagedScenario(
    observation,
    state,
    "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1",
  );
  const afterExtendedHold = buildBtc240mManagedScenario(
    btc240mObservation({
      ...observation,
      generatedAt: "2026-05-25T12:00:00.000Z",
    }),
    state,
    "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1",
  );

  assert.equal(beforeExtendedHold.signalAction, "hold");
  assert.deepEqual(beforeExtendedHold.skippedReasons, ["open_position_hold_window_active"]);
  assert.equal(afterExtendedHold.signalAction, "sell");
});

test("buildBtc240mManagedScenario uses executable depth when top bid size is zero", () => {
  const result = buildBtc240mManagedScenario(
    btc240mObservation({
      orderbook: {
        bestAsk: 100_010_000,
        bestBid: 100_000_000,
        bestAskSize: 0.01,
        bestBidSize: 0,
        spreadBps: 1,
        buyDepth: {
          notionalKrw: 1_000_000,
          coversRequestedNotional: true,
          vwapPrice: 100_010_000,
          worstPrice: 100_010_000,
        },
        sellDepth: {
          notionalKrw: 1_000_000,
          coversRequestedNotional: true,
          vwapPrice: 99_990_000,
          worstPrice: 99_980_000,
        },
      },
    }),
    managedState({
      portfolio: {
        cashAvailable: 500_000,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-BTC": {
            market: "KRW-BTC",
            baseQuantity: 0.005,
            avgEntryPrice: 100_000_000,
          },
        },
      },
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
        entryPrice: 100_000_000,
        quantity: 0.005,
        quoteNotional: 500_000,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 100_000_000,
      },
    }),
  );

  const snapshotEvent = result.scenario.events[0];
  assert.equal(snapshotEvent?.type, "snapshot");
  if (snapshotEvent?.type === "snapshot") {
    assert.equal(snapshotEvent.snapshot.bestBidPrice, 99_990_000);
    assert.ok(snapshotEvent.snapshot.bestBidSize > 0);
  }
});

test("buildPieverse60mReversalManagedScenario creates a buy signal for viable flat state", () => {
  const result = buildPieverse60mReversalManagedScenario(
    pieverse60mObservation(),
    managedState(),
  );

  assert.equal(result.signalAction, "buy");
  assert.deepEqual(result.skippedReasons, []);
  assert.equal(result.scenario.metadata?.strategyId, "pieverse_60m_reversal_lb168_candidate_v1");
  assert.equal(result.scenario.metadata?.summary?.entrySignalCount, 1);
  assert.equal(result.scenario.events.length, 2);
  const signalEvent = result.scenario.events[1];
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.side, "buy");
    assert.equal(signalEvent.signal.market, "KRW-PIEVERSE");
    assert.equal(signalEvent.signal.strategyId, "pieverse_60m_reversal_lb168_candidate_v1");
    assert.deepEqual(signalEvent.signal.sizing, {
      basis: "quote_notional",
      value: 500_000,
    });
    assert.ok(signalEvent.signal.reasonCodes.includes("SIGNAL_REVERSAL"));
    assert.ok(signalEvent.signal.reasonCodes.includes("UNIT_60M"));
    assert.ok(signalEvent.signal.reasonCodes.includes("LOOKBACK_168"));
  }
});

test("buildPieverse60mReversalManagedScenario can attach a BTC benchmark snapshot", () => {
  const result = buildPieverse60mReversalManagedScenario(
    pieverse60mObservation(),
    managedState(),
    { benchmarkSnapshots: [btcBenchmarkSnapshot()] },
  );

  assert.equal(result.scenario.metadata?.summary?.snapshotCount, 2);
  assert.equal(result.scenario.events.length, 3);
  const btcSnapshotEvent = result.scenario.events.find(
    (event) => event.type === "snapshot" && event.snapshot.market === "KRW-BTC",
  );
  assert.ok(btcSnapshotEvent, "BTC benchmark snapshot event is missing");
  const signalEvent = result.scenario.events.find((event) => event.type === "signal");
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.market, "KRW-PIEVERSE");
    assert.equal(signalEvent.signal.side, "buy");
  }
});

test("buildPieverse60mReversalManagedScenario skips invalid BTC benchmark snapshots", () => {
  const result = buildPieverse60mReversalManagedScenario(
    pieverse60mObservation(),
    managedState(),
    { benchmarkSnapshots: [btcBenchmarkSnapshot({ bestBidSize: 0 })] },
  );

  assert.equal(result.scenario.metadata?.summary?.snapshotCount, 1);
  assert.equal(result.scenario.events.length, 2);
  const btcSnapshotEvent = result.scenario.events.find(
    (event) => event.type === "snapshot" && event.snapshot.market === "KRW-BTC",
  );
  assert.equal(btcSnapshotEvent, undefined);
  const signalEvent = result.scenario.events.find((event) => event.type === "signal");
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.market, "KRW-PIEVERSE");
    assert.equal(signalEvent.signal.side, "buy");
  }
});

test("buildPieverse60mReversalManagedScenario holds an open position before hold expiry", () => {
  const result = buildPieverse60mReversalManagedScenario(
    pieverse60mObservation(),
    managedState({
      portfolio: {
        cashAvailable: 500_000,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-PIEVERSE": {
            market: "KRW-PIEVERSE",
            baseQuantity: 415,
            avgEntryPrice: 1_205,
          },
        },
      },
      openPositionState: {
        market: "KRW-PIEVERSE",
        enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
        entryPrice: 1_205,
        quantity: 415,
        quoteNotional: 500_075,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 1_205,
      },
    }),
  );

  assert.equal(result.signalAction, "hold");
  assert.deepEqual(result.skippedReasons, ["open_position_hold_window_active"]);
  assert.equal(result.scenario.events.length, 1);
  assert.equal(result.scenario.metadata?.carryOpenPositions, true);
});

test("buildPieverse60mReversalManagedScenario creates reduce-only sell after hold expiry", () => {
  const result = buildPieverse60mReversalManagedScenario(
    pieverse60mObservation({ generatedAt: "2026-05-13T12:00:00.000Z" }),
    managedState({
      portfolio: {
        cashAvailable: 500_000,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-PIEVERSE": {
            market: "KRW-PIEVERSE",
            baseQuantity: 415,
            avgEntryPrice: 1_205,
          },
        },
      },
      openPositionState: {
        market: "KRW-PIEVERSE",
        enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
        entryPrice: 1_205,
        quantity: 415,
        quoteNotional: 500_075,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 1_205,
      },
    }),
  );

  assert.equal(result.signalAction, "sell");
  assert.equal(result.scenario.metadata?.carryOpenPositions, false);
  const signalEvent = result.scenario.events[1];
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.side, "sell");
    assert.equal(signalEvent.signal.reduceOnly, true);
    assert.equal(signalEvent.signal.market, "KRW-PIEVERSE");
    assert.deepEqual(signalEvent.signal.sizing, {
      basis: "position_fraction",
      value: 1,
    });
  }
});

test("buildKrwH60mMomentumManagedScenario creates a buy signal for viable flat state", () => {
  const result = buildKrwH60mMomentumManagedScenario(
    krwH60mObservation(),
    managedState(),
  );

  assert.equal(result.signalAction, "buy");
  assert.deepEqual(result.skippedReasons, []);
  assert.equal(result.scenario.metadata?.strategyId, "krw_h_60m_momentum_top_candidate_v1");
  assert.equal(result.scenario.metadata?.summary?.entrySignalCount, 1);
  assert.equal(result.scenario.events.length, 2);
  const signalEvent = result.scenario.events[1];
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.side, "buy");
    assert.equal(signalEvent.signal.market, "KRW-H");
    assert.equal(signalEvent.signal.strategyId, "krw_h_60m_momentum_top_candidate_v1");
    assert.deepEqual(signalEvent.signal.sizing, {
      basis: "quote_notional",
      value: 500_000,
    });
    assert.ok(signalEvent.signal.reasonCodes.includes("SIGNAL_MOMENTUM"));
    assert.ok(signalEvent.signal.reasonCodes.includes("UNIT_60M"));
    assert.ok(signalEvent.signal.reasonCodes.includes("LOOKBACK_168"));
  }
});

test("buildKrwH60mMomentumManagedScenario can attach a BTC benchmark snapshot", () => {
  const result = buildKrwH60mMomentumManagedScenario(
    krwH60mObservation(),
    managedState(),
    { benchmarkSnapshots: [btcBenchmarkSnapshot()] },
  );

  assert.equal(result.scenario.metadata?.summary?.snapshotCount, 2);
  assert.equal(result.scenario.events.length, 3);
  const btcSnapshotEvent = result.scenario.events.find(
    (event) => event.type === "snapshot" && event.snapshot.market === "KRW-BTC",
  );
  assert.ok(btcSnapshotEvent, "BTC benchmark snapshot event is missing");
  const signalEvent = result.scenario.events.find((event) => event.type === "signal");
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.market, "KRW-H");
    assert.equal(signalEvent.signal.side, "buy");
  }
});

test("buildKrwH60mMomentumManagedScenario skips invalid BTC benchmark snapshots", () => {
  const result = buildKrwH60mMomentumManagedScenario(
    krwH60mObservation(),
    managedState(),
    { benchmarkSnapshots: [btcBenchmarkSnapshot({ bestBidSize: 0 })] },
  );

  assert.equal(result.scenario.metadata?.summary?.snapshotCount, 1);
  assert.equal(result.scenario.events.length, 2);
  const btcSnapshotEvent = result.scenario.events.find(
    (event) => event.type === "snapshot" && event.snapshot.market === "KRW-BTC",
  );
  assert.equal(btcSnapshotEvent, undefined);
  const signalEvent = result.scenario.events.find((event) => event.type === "signal");
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.market, "KRW-H");
    assert.equal(signalEvent.signal.side, "buy");
  }
});

test("buildKrwH60mMomentumManagedScenario holds an open position before hold expiry", () => {
  const result = buildKrwH60mMomentumManagedScenario(
    krwH60mObservation(),
    managedState({
      portfolio: {
        cashAvailable: 500_000,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-H": {
            market: "KRW-H",
            baseQuantity: 20_000,
            avgEntryPrice: 25,
          },
        },
      },
      openPositionState: {
        market: "KRW-H",
        enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
        entryPrice: 25,
        quantity: 20_000,
        quoteNotional: 500_000,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 25,
      },
    }),
  );

  assert.equal(result.signalAction, "hold");
  assert.deepEqual(result.skippedReasons, ["open_position_hold_window_active"]);
  assert.equal(result.scenario.events.length, 1);
  assert.equal(result.scenario.metadata?.carryOpenPositions, true);
});

test("buildKrwH60mMomentumManagedScenario creates reduce-only sell after hold expiry", () => {
  const result = buildKrwH60mMomentumManagedScenario(
    krwH60mObservation({ generatedAt: "2026-05-13T12:00:00.000Z" }),
    managedState({
      portfolio: {
        cashAvailable: 500_000,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-H": {
            market: "KRW-H",
            baseQuantity: 20_000,
            avgEntryPrice: 25,
          },
        },
      },
      openPositionState: {
        market: "KRW-H",
        enteredAtMs: Date.parse("2026-05-12T11:00:00.000Z"),
        entryPrice: 25,
        quantity: 20_000,
        quoteNotional: 500_000,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 25,
      },
    }),
  );

  assert.equal(result.signalAction, "sell");
  assert.equal(result.scenario.metadata?.carryOpenPositions, false);
  const signalEvent = result.scenario.events[1];
  assert.equal(signalEvent?.type, "signal");
  if (signalEvent?.type === "signal") {
    assert.equal(signalEvent.signal.side, "sell");
    assert.equal(signalEvent.signal.reduceOnly, true);
    assert.equal(signalEvent.signal.market, "KRW-H");
    assert.deepEqual(signalEvent.signal.sizing, {
      basis: "position_fraction",
      value: 1,
    });
  }
});

test("deriveCarryForwardOpenPositionState uses executed portfolio values over scenario metadata", () => {
  const state = deriveCarryForwardOpenPositionState({
    latestSnapshots: {
      "KRW-BTC": {
        bestBidPrice: 102_000_000,
        lastTradePrice: 102_100_000,
      },
    },
    portfolio: {
      cashAvailable: 100_000,
      dailyRealizedPnl: 0,
      positions: {
        "KRW-BTC": {
          market: "KRW-BTC",
          baseQuantity: 0.004,
          avgEntryPrice: 101_500_000,
        },
      },
    },
    reconciliation: { ok: true },
    scenarioMetadata: {
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: 1_775_000_000_000,
        entryPrice: 101_000_000,
        quantity: 0.01,
        quoteNotional: 1_010_000,
        consecutiveNegativeRet1m: 2,
        consecutiveBookFailures: 1,
        peakBidPrice: 101_200_000,
      },
    },
    generatedAt: "2026-04-09T12:00:00.000Z",
    mode: "paper",
    processedEvents: 0,
    rejectLedger: { totalRejectedDecisions: 0 },
    ledger: { orders: [], fills: [], decisions: [] },
    suppressionSummary: {},
  });

  assert.ok(state);
  assert.equal(state?.market, "KRW-BTC");
  assert.equal(state?.quantity, 0.004);
  assert.equal(state?.entryPrice, 101_500_000);
  assert.equal(state?.quoteNotional, 406_000);
  assert.equal(state?.consecutiveNegativeRet1m, 2);
  assert.equal(state?.consecutiveBookFailures, 1);
  assert.equal(state?.peakBidPrice, 102_000_000);
});

test("deriveCarryForwardOpenPositionState repairs invalid carried metadata fields", () => {
  const state = deriveCarryForwardOpenPositionState({
    latestSnapshots: {
      "KRW-BTC": {
        bestBidPrice: 100_800_000,
        lastTradePrice: 100_900_000,
      },
    },
    portfolio: {
      cashAvailable: 100_000,
      dailyRealizedPnl: 0,
      positions: {
        "KRW-BTC": {
          market: "KRW-BTC",
          baseQuantity: 0.003,
          avgEntryPrice: 100_500_000,
        },
      },
    },
    reconciliation: { ok: true },
    scenarioMetadata: {
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: 0,
        entryPrice: 100_500_000,
        quantity: 0.003,
        quoteNotional: 0,
        consecutiveNegativeRet1m: 1,
        consecutiveBookFailures: 2,
        peakBidPrice: 0,
      },
    },
    generatedAt: "2026-04-09T12:00:00.000Z",
    mode: "paper",
    processedEvents: 0,
    rejectLedger: { totalRejectedDecisions: 0 },
    ledger: { orders: [], fills: [], decisions: [] },
    suppressionSummary: {},
  });

  assert.ok(state);
  assert.equal(state?.enteredAtMs, Date.parse("2026-04-09T12:00:00.000Z"));
  assert.equal(state?.quoteNotional, 301_500);
  assert.equal(state?.consecutiveNegativeRet1m, 1);
  assert.equal(state?.consecutiveBookFailures, 2);
  assert.equal(state?.peakBidPrice, 100_800_000);
});

test("estimatePortfolioEquity fails when a carried market has no snapshot", () => {
  assert.throws(
    () =>
      estimatePortfolioEquity({
        latestSnapshots: {},
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {
            "KRW-ETH": {
              market: "KRW-ETH",
              baseQuantity: 0.5,
              avgEntryPrice: 3_000_000,
            },
          },
        },
        reconciliation: { ok: true },
        generatedAt: "2026-04-09T12:00:00.000Z",
        mode: "paper",
        processedEvents: 0,
        rejectLedger: { totalRejectedDecisions: 0 },
        ledger: { orders: [], fills: [], decisions: [] },
        suppressionSummary: {},
      }),
    /missing latest snapshot/,
  );
});

test("syncLiveManagedStateWithClient retries locked balances before succeeding", async () => {
  let getAccountsCalls = 0;
  const state = await syncLiveManagedStateWithClient(
    {
      schemaVersion: "1.0.0",
      configSignature: "prior",
      executionMode: "live",
      runStartedAt: "2026-04-09T12:00:00.000Z",
      runInitialEquityKrw: 100_000,
      currentEquityKrw: 100_000,
      portfolio: {
        cashAvailable: 100_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
      openPositionState: null,
    },
    "next",
    {
      async getAccounts() {
        getAccountsCalls += 1;
        if (getAccountsCalls === 1) {
          return [
            { currency: "KRW", balance: "119000", locked: "500" },
            { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
          ];
        }

        return [
          { currency: "KRW", balance: "119500", locked: "0" },
          { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
        ];
      },
    },
    {
      maxAccountReads: 2,
      lockedBalanceRetryDelayMs: 0,
    },
  );

  assert.equal(getAccountsCalls, 2);
  assert.equal(state.portfolio.cashAvailable, 119_500);
  assert.deepEqual(state.portfolio.positions, {});
});

test("syncLiveManagedStateWithClient blocks live startup when account fee evidence is missing", async () => {
  await assert.rejects(
    syncLiveManagedStateWithClient(
      {
        schemaVersion: "1.0.0",
        configSignature: "prior",
        executionMode: "live",
        runStartedAt: "2026-04-09T12:00:00.000Z",
        runInitialEquityKrw: 100_000,
        currentEquityKrw: 100_000,
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {},
        },
        openPositionState: null,
      },
      "next",
      {
        async getAccounts() {
          return [
            { currency: "KRW", balance: "119500", locked: "0" },
            { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
          ];
        },
      },
      {
        expectedFeeRoundTripBps: 20,
        maxAccountReads: 1,
        lockedBalanceRetryDelayMs: 0,
      },
    ),
    /account fee schedule is unavailable/u,
  );
});

test("syncLiveManagedStateWithClient blocks live startup when account fees exceed configuration", async () => {
  await assert.rejects(
    syncLiveManagedStateWithClient(
      {
        schemaVersion: "1.0.0",
        configSignature: "prior",
        executionMode: "live",
        runStartedAt: "2026-04-09T12:00:00.000Z",
        runInitialEquityKrw: 100_000,
        currentEquityKrw: 100_000,
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {},
        },
        openPositionState: null,
      },
      "next",
      {
        async getAccounts() {
          return [
            { currency: "KRW", balance: "119500", locked: "0" },
            { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
          ];
        },
        async getOrderChance() {
          return { market: "KRW-BTC", bid_fee: "0.0025", ask_fee: "0.0025" };
        },
      },
      {
        expectedFeeRoundTripBps: 20,
        maxAccountReads: 1,
        lockedBalanceRetryDelayMs: 0,
      },
    ),
    /account fee round-trip bps 50 exceeds configured 20/u,
  );
});

test("syncLiveManagedStateWithClient checks fees on the requested live market", async () => {
  let checkedMarket = "";
  await assert.rejects(
    syncLiveManagedStateWithClient(
      {
        schemaVersion: "1.0.0",
        configSignature: "prior",
        executionMode: "live",
        runStartedAt: "2026-04-09T12:00:00.000Z",
        runInitialEquityKrw: 100_000,
        currentEquityKrw: 100_000,
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {},
        },
        openPositionState: null,
      },
      "next",
      {
        async getAccounts() {
          return [
            { currency: "KRW", balance: "119500", locked: "0" },
            { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
          ];
        },
        async getOrderChance(market: string) {
          checkedMarket = market;
          return { market, bid_fee: "0.0025", ask_fee: "0.0025" };
        },
      },
      {
        expectedFeeRoundTripBps: 20,
        feeCheckMarket: "KRW-PIEVERSE",
        maxAccountReads: 1,
        lockedBalanceRetryDelayMs: 0,
      },
    ),
    /KRW-PIEVERSE account fee round-trip bps 50 exceeds configured 20/u,
  );

  assert.equal(checkedMarket, "KRW-PIEVERSE");
});

test("syncLiveManagedStateWithClient syncs the requested market base balance", async () => {
  const state = await syncLiveManagedStateWithClient(
    {
      schemaVersion: "1.0.0",
      configSignature: "prior",
      executionMode: "live",
      runStartedAt: "2026-04-09T12:00:00.000Z",
      runInitialEquityKrw: 0,
      currentEquityKrw: 0,
      portfolio: {
        cashAvailable: 0,
        dailyRealizedPnl: 321,
        positions: {
          "KRW-PIEVERSE": {
            market: "KRW-PIEVERSE",
            baseQuantity: 0.5,
            avgEntryPrice: 1_100,
            realizedPnl: 123,
          },
        },
      },
      openPositionState: {
        market: "KRW-PIEVERSE",
        enteredAtMs: 1_775_000_000_000,
        entryPrice: 1_100,
        quantity: 0.5,
        quoteNotional: 550,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 1_150,
      },
    },
    "next",
    {
      async getAccounts() {
        return [
          { currency: "KRW", balance: "119500", locked: "0" },
          { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
          { currency: "PIEVERSE", balance: "2.5", locked: "0", avg_buy_price: "1200" },
        ];
      },
    },
    {
      managedMarket: "KRW-PIEVERSE",
      maxAccountReads: 1,
      lockedBalanceRetryDelayMs: 0,
    },
  );

  assert.equal(state.portfolio.positions["KRW-PIEVERSE"]?.baseQuantity, 2.5);
  assert.equal(state.portfolio.positions["KRW-PIEVERSE"]?.avgEntryPrice, 1_200);
  assert.equal(state.portfolio.positions["KRW-PIEVERSE"]?.realizedPnl, 123);
  assert.equal(state.openPositionState?.market, "KRW-PIEVERSE");
  assert.equal(state.openPositionState?.quantity, 2.5);
  assert.equal(state.openPositionState?.entryPrice, 1_200);
  assert.equal(state.openPositionState?.quoteNotional, 3_000);
  assert.equal(state.currentEquityKrw, 122_500);
});

test("syncLiveManagedStateWithClient blocks non-requested alt balances", async () => {
  await assert.rejects(
    syncLiveManagedStateWithClient(
      {
        schemaVersion: "1.0.0",
        configSignature: "prior",
        executionMode: "live",
        runStartedAt: "2026-04-09T12:00:00.000Z",
        runInitialEquityKrw: 100_000,
        currentEquityKrw: 100_000,
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {},
        },
        openPositionState: null,
      },
      "next",
      {
        async getAccounts() {
          return [
            { currency: "KRW", balance: "119500", locked: "0" },
            { currency: "PIEVERSE", balance: "1", locked: "0", avg_buy_price: "1200" },
            { currency: "ETH", balance: "0.01", locked: "0", avg_buy_price: "3000000" },
          ];
        },
      },
      {
        managedMarket: "KRW-PIEVERSE",
        maxAccountReads: 1,
        lockedBalanceRetryDelayMs: 0,
      },
    ),
    /non-PIEVERSE asset balance detected for ETH/u,
  );
});

test("syncLiveManagedStateWithClient still fails when locked balances persist", async () => {
  let getAccountsCalls = 0;
  await assert.rejects(
    syncLiveManagedStateWithClient(
      {
        schemaVersion: "1.0.0",
        configSignature: "prior",
        executionMode: "live",
        runStartedAt: "2026-04-09T12:00:00.000Z",
        runInitialEquityKrw: 100_000,
        currentEquityKrw: 100_000,
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {},
        },
        openPositionState: null,
      },
      "next",
      {
        async getAccounts() {
          getAccountsCalls += 1;
          return [
            { currency: "KRW", balance: "119000", locked: "500" },
            { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
          ];
        },
      },
      {
        maxAccountReads: 2,
        lockedBalanceRetryDelayMs: 0,
      },
    ),
    /locked balances detected/u,
  );

  assert.equal(getAccountsCalls, 2);
});

test("assertLiveKillSwitchClear blocks live startup when persisted switch is active", () => {
  assert.throws(
    () =>
      assertLiveKillSwitchClear(
        {
          killSwitch: {
            active: true,
            trigger: "reconciliation_mismatch",
            reason: "prior live reconciliation failed",
            occurredAt: "2026-04-09T12:05:00.000Z",
          },
        },
        "live",
      ),
    /kill switch active/u,
  );

  assert.doesNotThrow(() =>
    assertLiveKillSwitchClear(
      {
        killSwitch: {
          active: true,
          trigger: "reconciliation_mismatch",
          reason: "paper evidence should not block paper runs",
          occurredAt: "2026-04-09T12:05:00.000Z",
        },
      },
      "paper",
    ),
  );
});

test("tripManagedKillSwitch persists live incident details in managed state", () => {
  const next = tripManagedKillSwitch(
    {
      schemaVersion: "1.0.0",
      configSignature: "sig",
      executionMode: "live",
      runStartedAt: "2026-04-09T12:00:00.000Z",
      runInitialEquityKrw: 100_000,
      currentEquityKrw: 100_000,
      portfolio: {
        cashAvailable: 100_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
      openPositionState: null,
    },
    "reconciliation_mismatch",
    "paper session reconciliation failed",
    { runId: "run-1", sessionId: "session-1" },
    "2026-04-09T12:05:00.000Z",
  );

  assert.equal(next.killSwitch?.active, true);
  assert.equal(next.killSwitch?.trigger, "reconciliation_mismatch");
  assert.equal(next.killSwitch?.detail?.runId, "run-1");
});

test("buildCarryForwardPortfolio drops zero-quantity position artifacts", () => {
  const portfolio = buildCarryForwardPortfolio({
    cashAvailable: 119_585.427446,
    dailyRealizedPnl: 3_440.20336,
    positions: {
      "KRW-BTC": {
        market: "KRW-BTC",
        baseQuantity: 0,
        avgEntryPrice: 116_518_000,
        realizedPnl: -17.52948,
      },
    },
  });

  assert.deepEqual(portfolio.positions, {});
});

test("isRetryableDryRunCommandFailure classifies transient bootstrap failures only", () => {
  assert.equal(
    isRetryableDryRunCommandFailure("bootstrap", {
      code: 1,
      stdoutLines: [],
      stderrLines: ["websocket failed with HTTP 500"],
    }),
    true,
  );
  assert.equal(
    isRetryableDryRunCommandFailure("scenario", {
      code: 1,
      stdoutLines: [],
      stderrLines: ["websocket failed with HTTP 500"],
    }),
    false,
  );
  assert.equal(
    isRetryableDryRunCommandFailure("bootstrap", {
      code: 1,
      stdoutLines: [],
      stderrLines: ["invalid market configuration"],
    }),
    false,
  );
});

test("buildDryRunCycleFailure includes scenario validation issues", () => {
  const failure = buildDryRunCycleFailure(
    3,
    "2026-04-09T12:00:00.000Z",
    new InvalidPaperSessionScenarioError([
      {
        path: ["scenarioMetadata", "summary", "suppressedEntrySamples", 0],
        message: "invalid suppressed entry sample",
      },
    ]),
  );

  assert.equal(failure.event, "managed_dry_run_cycle_failed");
  assert.equal(failure.cycle, 3);
  assert.equal(failure.message, "invalid_paper_session_scenario");
  assert.deepEqual(failure.issues, [
    {
      path: ["scenarioMetadata", "summary", "suppressedEntrySamples", 0],
      message: "invalid suppressed entry sample",
    },
  ]);
});

test("buildDryRunCycleFailure preserves command failure diagnostics", () => {
  const failure = buildDryRunCycleFailure(
    11,
    "2026-05-08T12:31:03.753Z",
    new DryRunCommandFailureError("scenario", {
      code: 1,
      stdoutLines: [
        "[bootstrap] /tmp/manifest-abc.json",
        "[scenario] Traceback (most recent call last):",
      ],
      stderrLines: [
        "ValueError: no enriched market points found for run abc",
      ],
    }),
  );

  assert.equal(failure.event, "managed_dry_run_cycle_failed");
  assert.equal(failure.message, "scenario exited with status 1");
  assert.equal(failure.failureKind, "no_enriched_market_points");
  assert.deepEqual(failure.command, {
    label: "scenario",
    status: 1,
    stdoutTail: [
      "[bootstrap] /tmp/manifest-abc.json",
      "[scenario] Traceback (most recent call last):",
    ],
    stderrTail: [
      "ValueError: no enriched market points found for run abc",
    ],
    failureKind: "no_enriched_market_points",
  });
});
