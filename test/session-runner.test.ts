import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPaperSessionRunner,
  createPaperOrderManager,
  createScenarioReplayClock,
  loadExecutionRuntimeConfig,
  PaperSessionRunner,
  persistPaperSessionReport,
  validatePaperSessionScenario,
  type MarketSnapshot,
  type PaperSessionScenario,
  type PortfolioState,
} from "../src/index.js";

const lifecycleFixturePath = join(
  process.cwd(),
  "examples",
  "paper-session.lifecycle.fixture.json",
);

function buildSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    market: "KRW-BTC",
    asOf: "2026-04-02T12:00:00.000Z",
    lastTradePrice: 140_000_000,
    bestBidPrice: 139_990_000,
    bestAskPrice: 140_010_000,
    bestBidSize: 0.4,
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

function buildRuntimeConfig(mode: "paper" | "dry_run" = "paper") {
  return loadExecutionRuntimeConfig({
    envFilePath: null,
    env: {
      TRADING_MODE: mode,
      ENABLE_LIVE_EXECUTION: "false",
    },
  });
}

function loadLifecycleFixture(): PaperSessionScenario {
  return JSON.parse(
    readFileSync(lifecycleFixturePath, "utf8"),
  ) as PaperSessionScenario;
}

test("validatePaperSessionScenario rejects malformed snapshot events", () => {
  const validation = validatePaperSessionScenario({
    schemaVersion: "1.0.0",
    events: [
      {
        type: "snapshot",
        snapshot: {
          market: "KRW-BTC",
        },
      },
    ],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) {
    return;
  }

  assert.ok(
    validation.issues.some((issue) => issue.path === "events[0].snapshot.asOf"),
  );
});

test("validatePaperSessionScenario accepts generator metadata envelope", () => {
  const validation = validatePaperSessionScenario(loadLifecycleFixture());

  assert.equal(validation.ok, true);
  if (!validation.ok) {
    return;
  }

  assert.equal(validation.value.metadata?.sourceRunId, "run-deterministic-lifecycle");
  assert.equal(
    validation.value.metadata?.summary?.suppressedByReason.SUPPRESS_WEAK_CONFLUENCE,
    2,
  );
});

test("validatePaperSessionScenario accepts exit experiment metadata", () => {
  const validation = validatePaperSessionScenario({
    schemaVersion: "1.0.0",
    metadata: {
      generatedAt: "2026-04-02T12:00:00.000Z",
      sourceRunId: "run-exit-experiment",
      strategyId: "bithumb_v1_micro_momo",
      modeIntent: "dry_run",
      initialCashKrw: 1_000_000,
      aggressiveNotionalFraction: 0.95,
      entryProfile: "exploratory_smoke",
      exitProfile: "experimental_decay",
      syntheticExitPolicy: "mark_mid",
      summary: {
        snapshotCount: 1,
        signalCount: 0,
        entrySignalCount: 0,
        exitSignalCount: 0,
        entryEvaluationBucketCount: 1,
        entrySuppressedCandidateCount: 1,
        entryBlockedOpenPositionBucketCount: 0,
        entryBlockedAfterExitBucketCount: 0,
        entryBelowMinNotionalCount: 0,
        syntheticCloseCount: 0,
        marketsTraded: [],
        suppressedByReason: {
          SUPPRESS_WEAK_CONFLUENCE: 1,
        },
        suppressedEntrySamples: [
          {
            market: "KRW-BTC",
            asOf: "2026-04-02T12:00:00.000Z",
            eventTimestampMs: 1_775_107_200_000,
            suppressionReason: "SUPPRESS_WEAK_CONFLUENCE",
            requestedQuoteNotionalKrw: 500_000,
            bestAskPrice: 100_010_000,
            bestBidPrice: 100_000_000,
            lastTradePrice: 100_005_000,
            featureSnapshot: {
              ret_5m_bps: -2,
              ret_1m_bps: null,
            },
            failingGates: [
              {
                field: "ret_5m_bps",
                comparator: ">=",
                actual: -2,
                threshold: 0,
              },
            ],
          },
        ],
      },
    },
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
    ],
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) {
    return;
  }

  assert.equal(validation.value.metadata?.exitProfile, "experimental_decay");
  assert.equal(validation.value.metadata?.syntheticExitPolicy, "mark_mid");
  assert.equal(validation.value.metadata?.summary?.entryEvaluationBucketCount, 1);
  assert.equal(validation.value.metadata?.summary?.entrySuppressedCandidateCount, 1);
  assert.equal(
    validation.value.metadata?.summary?.suppressedEntrySamples?.[0]?.failingGates[0]
      ?.field,
    "ret_5m_bps",
  );
  assert.equal(validation.value.metadata?.summary?.syntheticCloseCount, 0);
});

test("validatePaperSessionScenario accepts a Python-generated diagnostic summary", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "org-coin-cross-contract-"));
  try {
    const scenarioPath = execFileSync(
      "python3",
      ["-"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ORG_COIN_TEST_BASE_DIR: tempDir,
        },
        encoding: "utf8",
        input: String.raw`
from pathlib import Path
import os

from org_coin_data.session_scenario import build_session_scenario
from org_coin_data.storage import append_jsonl, canonical_path

base_dir = Path(os.environ["ORG_COIN_TEST_BASE_DIR"])
run_id = "run-cross-contract"
market = "KRW-BTC"
ts = 1_775_140_000_000

def write(dataset, records):
    append_jsonl(
        canonical_path(base_dir, dataset, "2026-04-02T13:00:00Z", run_id, market=market),
        records,
    )

write("trade_tick", [
    {"market": market, "trade_timestamp_ms": ts - 300_000, "price": 100_000_000, "volume": 0.01, "side": "ASK"},
    {"market": market, "trade_timestamp_ms": ts - 60_000, "price": 100_050_000, "volume": 0.01, "side": "ASK"},
    {"market": market, "trade_timestamp_ms": ts, "price": 100_070_000, "volume": 0.01, "side": "BID"},
])
write("orderbook_snapshot", [
    {
        "market": market,
        "event_timestamp_ms": ts,
        "capture_id": "capture-cross-contract",
        "best_bid_price": 100_060_000,
        "best_ask_price": 100_070_000,
        "source": "bithumb_rest",
    }
])
write("orderbook_level", [
    {
        "market": market,
        "event_timestamp_ms": ts,
        "capture_id": "capture-cross-contract",
        "level_index": 0,
        "bid_size": 1.0,
        "ask_size": 1.0,
        "source": "bithumb_rest",
    }
])
write("passive_feature_snapshot", [
    {
        "market": market,
        "event_timestamp_ms": ts,
        "capture_id": "capture-cross-contract",
        "ret_5m_bps": 1.0,
        "buy_notional_share_60s": 0.40,
        "depth_ratio_l5": 1.0,
        "spread_bps": 2.0,
        "turnover_24h_krw": 40_000_000_000.0,
        "window_coverage_sec": 60.0,
    }
])

scenario_path, _ = build_session_scenario(
    base_dir,
    run_id,
    initial_cash_krw=1_000_000,
    exit_profile="balanced_v1_book_confirm2",
    synthetic_exit_policy="carry_open",
    mode_intent="paper",
)
print(scenario_path)
`,
      },
    ).trim();
    const scenario = JSON.parse(readFileSync(scenarioPath, "utf8")) as unknown;
    const validation = validatePaperSessionScenario(scenario);

    assert.equal(validation.ok, true);
    if (!validation.ok) {
      return;
    }
    assert.equal(validation.value.metadata?.summary?.entryEvaluationBucketCount, 1);
    assert.equal(validation.value.metadata?.summary?.entrySuppressedCandidateCount, 1);
    assert.equal(
      validation.value.metadata?.summary?.suppressedByReason.SUPPRESS_WEAK_CONFLUENCE,
      1,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("validatePaperSessionScenario rejects summary counts that drift from events", () => {
  const validation = validatePaperSessionScenario({
    schemaVersion: "1.0.0",
    metadata: {
      summary: {
        snapshotCount: 1,
        signalCount: 1,
        entrySignalCount: 0,
        exitSignalCount: 0,
        syntheticCloseCount: 0,
        marketsTraded: [],
        suppressedByReason: {},
      },
    },
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
    ],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) {
    return;
  }
  assert.ok(
    validation.issues.some((issue) => issue.path === "metadata.summary.signalCount"),
  );
});

test("validatePaperSessionScenario accepts carry-open metadata", () => {
  const validation = validatePaperSessionScenario({
    schemaVersion: "1.0.0",
    metadata: {
      generatedAt: "2026-04-02T12:00:00.000Z",
      sourceRunId: "run-carry-open",
      strategyId: "bithumb_v1_micro_momo",
      modeIntent: "paper",
      initialCashKrw: 1_000_000,
      initialEquityKrw: 1_002_500,
      aggressiveNotionalFraction: 0.95,
      entryProfile: "v1",
      exitProfile: "balanced_v1",
      syntheticExitPolicy: "carry_open",
      carryOpenPositions: true,
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: 1_775_134_400_000,
        entryPrice: 140_000_000,
        quantity: 0.003,
        quoteNotional: 420_000,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 140_100_000,
      },
      summary: {
        snapshotCount: 1,
        signalCount: 0,
        entrySignalCount: 0,
        exitSignalCount: 0,
        syntheticCloseCount: 0,
        marketsTraded: [],
        suppressedByReason: {},
      },
    },
    initialPortfolio: {
      cashAvailable: 580_000,
      dailyRealizedPnl: 0,
      positions: {
        "KRW-BTC": {
          market: "KRW-BTC",
          baseQuantity: 0.003,
          avgEntryPrice: 140_000_000,
          realizedPnl: 0,
        },
      },
    },
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
    ],
  });

  assert.equal(validation.ok, true);
});

for (const mode of ["dry_run", "paper"] as const) {
  test(`${mode} session runner executes the lifecycle fixture cleanly`, async () => {
    const validation = validatePaperSessionScenario(loadLifecycleFixture());
    assert.equal(validation.ok, true);
    if (!validation.ok) {
      return;
    }

    const runner = createPaperSessionRunner(buildRuntimeConfig(mode), {
      clock: validation.value.clockAt
        ? () => new Date(validation.value.clockAt!)
        : undefined,
      portfolio: validation.value.initialPortfolio,
    });

    const report = await runner.runScenario(validation.value);
    const signalOutcomes = report.outcomes.filter((outcome) => outcome.type === "signal");

    assert.equal(report.mode, mode);
    assert.equal(report.generatedAt, "2026-04-02T12:00:02.000Z");
    assert.equal(report.processedEvents, 4);
    assert.equal(signalOutcomes.length, 2);
    assert.ok(
      signalOutcomes.every(
        (outcome) => outcome.type === "signal" && outcome.decision.accepted,
      ),
    );
    assert.deepEqual(
      signalOutcomes.map((outcome) =>
        outcome.type === "signal" ? outcome.signal?.reasonCodes : [],
      ),
      [
        ["momentum_positive", "depth_support"],
        ["momentum_reversal"],
      ],
    );
    assert.deepEqual(report.suppressionSummary, {
      SUPPRESS_DATA_STALE: 1,
      SUPPRESS_WEAK_CONFLUENCE: 2,
    });
    assert.equal(report.scenarioMetadata?.summary?.entrySignalCount, 1);
    assert.equal(report.rejectLedger.totalRejectedDecisions, 0);
    assert.equal(report.reconciliation.ok, true);
    assert.equal(report.reconciliation.openPositions.length, 0);
  });
}

test("paper session runner rejects signals when no snapshot is loaded", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    events: [
      {
        type: "signal",
        signal: buildBuySignal("sig-no-snapshot"),
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig(), {
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
  });

  const report = await runner.runScenario(scenario);
  const outcome = report.outcomes[0];

  assert.equal(outcome?.type, "signal");
  if (!outcome || outcome.type !== "signal" || outcome.decision.accepted) {
    return;
  }

  assert.equal(outcome.decision.reasons[0]?.code, "missing_market_snapshot");
  assert.equal(report.rejectLedger.totalRejectedDecisions, 1);
  assert.equal(
    report.rejectLedger.byMarket["KRW-BTC"]?.reasons.missing_market_snapshot,
    1,
  );
  assert.equal(report.reconciliation.ok, true);
});

test("paper session runner fails reconciliation when the session ends with an open position", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    reconcileAt: "2026-04-02T12:00:01.000Z",
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
      {
        type: "signal",
        signal: buildBuySignal("sig-open-position"),
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig(), {
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
  });

  const report = await runner.runScenario(scenario);

  assert.equal(report.reconciliation.ok, false);
  assert.equal(report.reconciliation.reasons[0]?.code, "reconciliation_mismatch");
  assert.equal(report.reconciliation.openPositions.length, 1);
});

test("paper session runner allows carried open positions when the scenario opts in", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    reconcileAt: "2026-04-02T12:00:01.000Z",
    metadata: {
      modeIntent: "paper",
      initialCashKrw: 1_000_000,
      initialEquityKrw: 1_000_000,
      carryOpenPositions: true,
      syntheticExitPolicy: "carry_open",
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: 1_775_134_400_000,
        entryPrice: 140_000_000,
        quantity: 0.003,
        quoteNotional: 420_000,
        consecutiveNegativeRet1m: 0,
        consecutiveBookFailures: 0,
        peakBidPrice: 140_100_000,
      },
    },
    initialPortfolio: {
      cashAvailable: 580_000,
      dailyRealizedPnl: 0,
      positions: {
        "KRW-BTC": {
          market: "KRW-BTC",
          baseQuantity: 0.003,
          avgEntryPrice: 140_000_000,
          realizedPnl: 0,
        },
      },
    },
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig(), {
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio: scenario.initialPortfolio,
  });

  const report = await runner.runScenario(scenario);

  assert.equal(report.reconciliation.ok, true);
  assert.equal(report.reconciliation.openPositions.length, 1);
});

test("paper session runner auto-cancels partial reduce-only exits before reconciliation", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    reconcileAt: "2026-04-02T12:00:01.000Z",
    metadata: {
      modeIntent: "paper",
      initialCashKrw: 0,
      initialEquityKrw: 800_000,
      carryOpenPositions: true,
      syntheticExitPolicy: "carry_open",
      openPositionState: {
        market: "KRW-BTC",
        enteredAtMs: 1_775_134_400_000,
        entryPrice: 100_000,
        quantity: 8,
        quoteNotional: 800_000,
        consecutiveNegativeRet1m: 1,
        consecutiveBookFailures: 0,
        peakBidPrice: 100_100,
      },
    },
    initialPortfolio: {
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
    },
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot({
          lastTradePrice: 100_000,
          bestBidPrice: 99_990,
          bestAskPrice: 100_010,
          bestBidSize: 0.4,
          bestAskSize: 0.4,
          spreadBps: 2,
          rolling24hNotional: 450_000_000_000,
        }),
      },
      {
        type: "signal",
        signal: {
          ...buildBuySignal("sig-partial-reduce-only"),
          side: "sell",
          sizing: {
            basis: "position_fraction",
            value: 1,
          },
          reduceOnly: true,
        },
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig(), {
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio: scenario.initialPortfolio,
  });

  const report = await runner.runScenario(scenario);
  const cancelledOrder = report.ledger.orders[0];

  assert.equal(report.reconciliation.ok, true);
  assert.equal(report.reconciliation.openOrders.length, 0);
  assert.equal(report.reconciliation.openPositions.length, 1);
  assert.equal(cancelledOrder?.status, "cancelled");
  assert.equal(cancelledOrder?.executedQuantity, 1);
  assert.equal(
    report.portfolio.positions["KRW-BTC"]?.baseQuantity,
    7,
  );
});

test("paper session runner falls back to signal generatedAt when receivedAt is absent", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
      {
        type: "signal",
        signal: buildBuySignal("sig-generated-at"),
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig("dry_run"), {
    clock: () => new Date("2026-04-02T12:05:00.000Z"),
  });

  const report = await runner.runScenario(scenario);
  const signalOutcome = report.outcomes.find((outcome) => outcome.type === "signal");

  assert.equal(signalOutcome?.type, "signal");
  if (!signalOutcome || signalOutcome.type !== "signal" || !signalOutcome.decision.accepted) {
    return;
  }

  assert.equal(signalOutcome.decision.order.createdAt, "2026-04-02T11:59:58.000Z");
});

test("live session runner uses wall clock freshness instead of replay timestamps", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
      {
        type: "signal",
        signal: buildBuySignal("sig-live-wall-clock"),
      },
    ],
  };
  const runner = new PaperSessionRunner(
    "live",
    createPaperOrderManager({
      clock: () => new Date("2026-04-02T12:05:00.000Z"),
    }),
  );

  const report = await runner.runScenario(scenario);
  const signalOutcome = report.outcomes.find((outcome) => outcome.type === "signal");

  assert.equal(signalOutcome?.type, "signal");
  if (!signalOutcome || signalOutcome.type !== "signal" || signalOutcome.decision.accepted) {
    return;
  }

  assert.ok(
    signalOutcome.decision.reasons.some((reason) =>
      ["expired_signal", "stale_market_data"].includes(reason.code),
    ),
  );
});

test("scenario replay clock is disabled for live mode", () => {
  assert.equal(
    createScenarioReplayClock("live", "2026-04-02T12:00:00.000Z"),
    undefined,
  );

  assert.equal(
    createScenarioReplayClock("paper", undefined),
    undefined,
  );

  assert.equal(
    createScenarioReplayClock("paper", "2026-04-02T12:00:00.000Z")?.().toISOString(),
    "2026-04-02T12:00:00.000Z",
  );
});

test("persistPaperSessionReport writes the artifact bundle for audit", async () => {
  const artifactDir = mkdtempSync(join(tmpdir(), "org-coin-paper-session-"));

  try {
    const validation = validatePaperSessionScenario(loadLifecycleFixture());
    assert.equal(validation.ok, true);
    if (!validation.ok) {
      return;
    }

    const runner = createPaperSessionRunner(buildRuntimeConfig(), {
      clock: validation.value.clockAt
        ? () => new Date(validation.value.clockAt!)
        : undefined,
      portfolio: validation.value.initialPortfolio,
    });

    const report = await runner.runScenario(validation.value);
    const persisted = await persistPaperSessionReport({
      report,
      baseDir: artifactDir,
      sessionId: "session-fixture",
      scenarioPath: lifecycleFixturePath,
    });

    assert.equal(persisted.sessionId, "session-fixture");
    assert.equal(persisted.scenarioPath, lifecycleFixturePath);
    assert.ok(existsSync(persisted.artifacts?.reportPath ?? ""));
    assert.ok(existsSync(persisted.artifacts?.reportMarkdownPath ?? ""));
    assert.ok(existsSync(persisted.artifacts?.ledgerPath ?? ""));
    assert.ok(existsSync(persisted.artifacts?.rejectLedgerPath ?? ""));

    const storedReport = JSON.parse(
      readFileSync(persisted.artifacts!.reportPath, "utf8"),
    ) as {
      sessionId: string;
      suppressionSummary: Record<string, number>;
      scenarioMetadata?: {
        summary?: {
          suppressedByReason?: Record<string, number>;
        };
      };
    };
    const storedRejectLedger = JSON.parse(
      readFileSync(persisted.artifacts!.rejectLedgerPath, "utf8"),
    ) as { totalRejectedDecisions: number };
    const ledgerLines = readFileSync(
      persisted.artifacts!.ledgerPath,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    const markdown = readFileSync(
      persisted.artifacts!.reportMarkdownPath,
      "utf8",
    );

    assert.equal(storedReport.sessionId, "session-fixture");
    assert.deepEqual(storedReport.suppressionSummary, {
      SUPPRESS_DATA_STALE: 1,
      SUPPRESS_WEAK_CONFLUENCE: 2,
    });
    assert.deepEqual(
      storedReport.scenarioMetadata?.summary?.suppressedByReason,
      storedReport.suppressionSummary,
    );
    assert.equal(storedRejectLedger.totalRejectedDecisions, 0);
    assert.ok(ledgerLines.some((line) => line.type === "decision"));
    assert.ok(ledgerLines.some((line) => line.type === "order"));
    assert.ok(ledgerLines.some((line) => line.type === "fill"));
    assert.match(markdown, /session-fixture/);
    assert.match(markdown, /SUPPRESS_DATA_STALE/);
    assert.match(markdown, /SUPPRESS_WEAK_CONFLUENCE/);
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});
