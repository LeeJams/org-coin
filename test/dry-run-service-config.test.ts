import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadDryRunServiceConfig } from "../src/runtime/dry-run-service-config.js";

function liveGoalCompletionCriteria(
  overrides: Record<string, boolean> = {},
): Array<{ id: string; passed: boolean }> {
  return [
    "candidate_selected_from_current_evidence",
    "profitability_evidence_satisfied",
    "known_losing_paths_rejected",
    "current_entry_sanity_clear",
    "no_current_focus_recompare_caution",
    "live_startup_gate_allowed",
  ].map((id) => ({ id, passed: overrides[id] ?? true }));
}

function buildLiveReadinessSummary(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date().toISOString(),
    strategyAssessment: {
      classification: "live_candidate",
    },
    liveReadiness: {
      paperOnlyRecommended: false,
      checks: {
        minimumClosedTrades: true,
        positiveTradedPnl: true,
        positiveAverageTradedPnl: true,
        positiveClosedTradePnl: true,
        noOpenMarkProfitDependency: true,
        noReconciliationFailures: true,
        noRejectedDecisionSessions: true,
        noSyntheticCloseSessions: true,
        noOpenPosition: true,
        cycleCompletionRateOk: true,
        cycleRecoverySinceLatestFailureOk: true,
        noMaterialLosingExitReasons: true,
        btcBuyHoldBenchmarkAvailable: true,
        beatsBtcBuyAndHold: true,
        positiveAverageExcessReturn: true,
        positiveRiskAdjustedExcessReturn: true,
        drawdownNoWorseThanBtcBuyAndHold: true,
        liveExecutionPathReady: true,
      },
    },
    btcBuyHoldBenchmark: {
      totalExcessPnlKrw: 10_000,
      excessReturnInformationRatio: 0.5,
    },
    ...overrides,
  };
}

function buildTimeSeriesReadinessSummary(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date().toISOString(),
    strategyAssessment: {
      classification: "live_candidate",
    },
    candidate: {
      market: "KRW-BTC",
      signalMode: "momentum",
      unitMinutes: 240,
      lookbackBars: 24,
      holdBars: 24,
      minReturnBps: 25,
      riskFilter: "rv24_below_p70",
    },
    benchmarkSummary: {
      tradeCount: 125,
      strategyReturnPct: 165,
      buyHoldReturnPct: 101,
      excessReturnVsBuyHoldPct: 64,
      maxDrawdownPct: -18,
      feeRoundTripBps: 20,
    },
    liveReadiness: {
      paperOnlyRecommended: false,
      checks: {
        benchmarkAvailable: true,
        marketIsBtc: true,
        unitIs240m: true,
        costAtLeast20Bps: true,
        minimumHistoricalTrades: true,
        positiveStrategyReturn: true,
        beatsBtcBuyAndHold: true,
        drawdownWithinLimit: true,
        spreadMeasured: true,
        buyDepthCoversNotional: true,
        sellDepthCoversNotional: true,
        noExecutionCostReasons: true,
        paperSignalAttempted: true,
        paperSignalAccepted: true,
        paperEntryReconciliationOk: true,
        paperEntryCreatedOpenPosition: true,
        holdExitTimeKnown: true,
        realizedExitAvailable: true,
        noOpenPaperPositionAfterExit: true,
        positiveRealizedPaperExitPnl: true,
        liveExecutionPathReady: true,
      },
    },
    ...overrides,
  };
}

function buildLiveGoalStatus(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date().toISOString(),
    liveReady: true,
    liveStartupAllowed: true,
    selectedLiveCandidate: {
      type: "btc_240m_momentum",
      market: "KRW-BTC",
    },
    completionAudit: {
      achieved: true,
      failedCompletionCriteria: [],
      missingRequirements: [],
      missingRequirementCount: 0,
      criteria: liveGoalCompletionCriteria(),
    },
    blockers: [],
    ...overrides,
  };
}

function buildPieverseReplacementReadinessSummary(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date().toISOString(),
    strategyAssessment: {
      classification: "live_candidate",
    },
    candidate: {
      market: "KRW-PIEVERSE",
      signalMode: "reversal",
      unitMinutes: 60,
      lookbackBars: 168,
      holdBars: 24,
      minReturnBps: 50,
      riskFilter: "rv24_below_median",
    },
    benchmarkSummary: {
      tradeCount: 73,
      strategyReturnPct: 2.258377,
      buyHoldReturnPct: null,
      excessReturnVsBuyHoldPct: null,
      maxDrawdownPct: null,
      feeRoundTripBps: 35,
    },
    liveReadiness: {
      paperOnlyRecommended: false,
      checks: {
        scanGeneratedAtValid: true,
        observationGeneratedAtValid: true,
        scanHasPromotionCandidate: true,
        feeAtLeast20Bps: true,
        candidateMatchesObservation: true,
        minimumHistoricalTrades: true,
        positiveTrainMedianPnl: true,
        positiveTestMedianPnl: true,
        positiveTrainAndTestTotalPnl: true,
        walkForwardTotalPasses: true,
        walkForwardMedianPasses: true,
        walkForwardMinFoldNonNegative: true,
        paperObservationGeneratedAtValid: true,
        paperObservationAfterObservation: true,
        paperObservationSourceMatches: true,
        paperCandidateMatchesObservation: true,
        signalActive: true,
        directionalSignalPass: true,
        riskPass: true,
        executionViabilityWatchCandidate: true,
        spreadMeasured: true,
        executableCostMeasured: true,
        executableCostWithinExpectedEdge: true,
        tickerFresh: true,
        latestCandleRecent: true,
        snapshotSkewControlled: true,
        buyDepthCoversNotional: true,
        sellDepthCoversNotional: true,
        noObservationReasons: true,
        paperSignalAttempted: true,
        paperSignalAccepted: true,
        paperEntryReconciliationOk: true,
        paperEntryCreatedOpenPosition: true,
        holdExitTimeKnown: true,
        realizedExitAvailable: true,
        realizedExitReusePolicy: true,
        noOpenPaperPositionAfterExit: true,
        positiveRealizedPaperExitPnl: true,
        liveExecutionPathReady: true,
      },
    },
    ...overrides,
  };
}

function buildStableReplacementReadinessSummary(overrides: Record<string, unknown> = {}) {
  return buildPieverseReplacementReadinessSummary({
    candidate: {
      market: "KRW-STABLE",
      signalMode: "reversal",
      unitMinutes: 60,
      lookbackBars: 24,
      holdBars: 24,
      minReturnBps: 50,
      riskFilter: "none",
    },
    benchmarkSummary: {
      tradeCount: 112,
      strategyReturnPct: 2.194681,
      buyHoldReturnPct: null,
      excessReturnVsBuyHoldPct: null,
      maxDrawdownPct: null,
      feeRoundTripBps: 35,
    },
    ...overrides,
  });
}

const LIVE_FEE_ENV = {
  LIVE_TRADING_FEE_SCHEDULE_CONFIRMED: "true",
  LIVE_TRADING_FEE_ROUND_TRIP_BPS: "20",
};

test("loadDryRunServiceConfig reads .env values and resolves paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-dry-run-service-"));

  try {
    mkdirSync(join(directory, ".venv", "bin"), { recursive: true });
    writeFileSync(join(directory, ".venv", "bin", "python"), "", "utf8");
    writeFileSync(
      join(directory, ".env"),
      [
        "DRY_RUN_EXECUTION_MODE=paper",
        "DRY_RUN_ENTRY_PROFILE=exploratory_smoke",
        "DRY_RUN_EXIT_PROFILE=experimental_decay",
        "DRY_RUN_SYNTHETIC_EXIT_POLICY=carry_open",
        "DRY_RUN_INITIAL_CASH_KRW=2500000",
        "DRY_RUN_LOOP_INTERVAL_SECONDS=45",
        "DRY_RUN_LOG_DIR=tmp/dry-run",
        "DRY_RUN_CYCLE_LOG_FILE=service.ndjson",
        "DRY_RUN_BASE_DIR=tmp/data",
        "DRY_RUN_MARKETS=KRW-BTC,KRW-XRP",
        "DRY_RUN_FRESHNESS_SLA_MS=9000",
        "DRY_RUN_CANDLE_COUNT=120",
        "DRY_RUN_TRADE_COUNT=150",
        "DRY_RUN_WS_SECONDS=9",
        "DRY_RUN_TRADE_WARMUP_SECONDS=12",
        "DRY_RUN_BOOTSTRAP_ITERATIONS=2",
        "DRY_RUN_BOOTSTRAP_INTERVAL_SECONDS=3",
        "DRY_RUN_WS_CHANNELS=ticker,trade",
      ].join("\n"),
      "utf8",
    );

    const config = loadDryRunServiceConfig({ cwd: directory });

    assert.equal(config.executionMode, "paper");
    assert.equal(config.entryProfile, "exploratory_smoke");
    assert.equal(config.exitProfile, "experimental_decay");
    assert.equal(config.syntheticExitPolicy, "carry_open");
    assert.equal(config.initialCashKrw, 2_500_000);
    assert.equal(config.loopIntervalSeconds, 45);
    assert.equal(config.baseDir, join(directory, "tmp/data"));
    assert.equal(config.logDir, join(directory, "tmp/dry-run"));
    assert.equal(config.cycleLogPath, join(directory, "tmp/dry-run/service.ndjson"));
    assert.equal(config.pythonBin, join(directory, ".venv", "bin", "python"));
    assert.equal(config.bootstrap.markets, "KRW-BTC,KRW-XRP");
    assert.equal(config.bootstrap.freshnessSlaMs, 9_000);
    assert.equal(config.bootstrap.candleCount, 120);
    assert.equal(config.bootstrap.tradeCount, 150);
    assert.equal(config.bootstrap.wsSeconds, 9);
    assert.equal(config.bootstrap.tradeWarmupSeconds, 12);
    assert.equal(config.bootstrap.iterations, 2);
    assert.equal(config.bootstrap.intervalSeconds, 3);
    assert.equal(config.bootstrap.wsChannels, "ticker,trade");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode without execution path readiness", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-execution-path-"));
  const summaryPath = join(directory, "readiness-summary.json");
  const summary = buildLiveReadinessSummary();
  writeFileSync(
    summaryPath,
    JSON.stringify({
      ...summary,
      liveReadiness: {
        ...summary.liveReadiness,
        checks: {
          ...summary.liveReadiness.checks,
          liveExecutionPathReady: false,
        },
      },
    }),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "readiness-summary.json",
          },
        }),
      /liveExecutionPathReady/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig rejects unsupported profiles", () => {
  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_EXECUTION_MODE: "invalid",
        },
      }),
    /DRY_RUN_EXECUTION_MODE/,
  );

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_ENTRY_PROFILE: "paper",
        },
      }),
    /DRY_RUN_ENTRY_PROFILE/,
  );

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_ENTRY_PROFILE: "btc_trend_turnover_cap_path_replay_v1",
        },
      }),
    /DRY_RUN_ENTRY_PROFILE/,
  );

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_ENTRY_PROFILE: "btc_trend_turnover_cap_replay_v1",
        },
      }),
    /DRY_RUN_ENTRY_PROFILE/,
  );

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_ENTRY_PROFILE: "high_buy_flow_replay_v1",
        },
      }),
    /DRY_RUN_ENTRY_PROFILE/,
  );

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_ENTRY_PROFILE: "btc_trend_strong_depth_replay_v1",
        },
      }),
    /DRY_RUN_ENTRY_PROFILE/,
  );

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_EXIT_PROFILE: "paper",
        },
      }),
    /DRY_RUN_EXIT_PROFILE/,
  );

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_SYNTHETIC_EXIT_POLICY: "paper",
        },
      }),
    /DRY_RUN_SYNTHETIC_EXIT_POLICY/,
  );
});

test("loadDryRunServiceConfig allows live mode only for BTC", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-readiness-"));
  const summaryPath = join(directory, "readiness-summary.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(buildLiveReadinessSummary()),
    "utf8",
  );
  writeFileSync(liveGoalPath, JSON.stringify(buildLiveGoalStatus()), "utf8");

  const config = loadDryRunServiceConfig({
    cwd: directory,
    envFilePath: null,
    env: {
      DRY_RUN_EXECUTION_MODE: "live",
      DRY_RUN_MARKETS: "KRW-BTC",
      DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
      LIVE_READINESS_APPROVED: "true",
      ...LIVE_FEE_ENV,
      LIVE_READINESS_SUMMARY_PATH: "readiness-summary.json",
      LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
    },
  });

  assert.equal(config.executionMode, "live");
  assert.equal(config.liveReadinessApproved, true);
  assert.equal(config.liveReadinessSummaryPath, summaryPath);
  assert.equal(config.liveGoalStatusPath, liveGoalPath);
  assert.equal(config.bootstrap.markets, "KRW-BTC");

  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_EXECUTION_MODE: "live",
          DRY_RUN_MARKETS: "KRW-BTC,KRW-ETH",
        },
      }),
    /DRY_RUN_MARKETS=KRW-BTC/,
  );

  rmSync(directory, { recursive: true, force: true });
});

test("loadDryRunServiceConfig blocks live mode without live-goal status", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-required-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      buildTimeSeriesReadinessSummary({
        candidate: {
          market: "KRW-BTC",
          signalMode: "momentum",
          unitMinutes: 240,
          lookbackBars: 24,
          holdBars: 24,
          minReturnBps: 75,
          riskFilter: "rv24_below_p70",
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_min75_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
          },
        }),
      /LIVE_GOAL_STATUS_PATH/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig accepts live-ready BTC time-series evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-time-series-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(buildTimeSeriesReadinessSummary()),
    "utf8",
  );
  writeFileSync(liveGoalPath, JSON.stringify(buildLiveGoalStatus()), "utf8");

  try {
    const config = loadDryRunServiceConfig({
      cwd: directory,
      envFilePath: null,
      env: {
        DRY_RUN_EXECUTION_MODE: "live",
        DRY_RUN_MARKETS: "KRW-BTC",
        DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
        LIVE_READINESS_APPROVED: "true",
        ...LIVE_FEE_ENV,
        LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
        LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
      },
    });

    assert.equal(config.executionMode, "live");
    assert.equal(config.liveReadinessSummaryPath, summaryPath);
    assert.equal(config.liveGoalStatusPath, liveGoalPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks public BTC profile on min75 live-goal candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-profile-mismatch-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(summaryPath, JSON.stringify(buildTimeSeriesReadinessSummary()), "utf8");
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        selectedLiveCandidate: {
          type: "btc_240m_momentum_min75",
          market: "KRW-BTC",
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /selectedLiveCandidate\.type=btc_240m_momentum/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks min75 live profile on paper-only live-goal candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-paper-candidate-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      buildTimeSeriesReadinessSummary({
        candidate: {
          market: "KRW-BTC",
          signalMode: "momentum",
          unitMinutes: 240,
          lookbackBars: 24,
          holdBars: 24,
          minReturnBps: 75,
          riskFilter: "rv24_below_p70",
        },
      }),
    ),
    "utf8",
  );
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        selectedLiveCandidate: {
          type: "btc_240m_momentum_min75_paper_candidate",
          market: "KRW-BTC",
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_min75_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /selectedLiveCandidate\.type=btc_240m_momentum_min75/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig accepts live-ready BTC min75 time-series evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-time-series-min75-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      buildTimeSeriesReadinessSummary({
        candidate: {
          market: "KRW-BTC",
          signalMode: "momentum",
          unitMinutes: 240,
          lookbackBars: 24,
          holdBars: 24,
          minReturnBps: 75,
          riskFilter: "rv24_below_p70",
        },
      }),
    ),
    "utf8",
  );
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        selectedLiveCandidate: {
          type: "btc_240m_momentum_min75",
          market: "KRW-BTC",
        },
      }),
    ),
    "utf8",
  );

  try {
    const config = loadDryRunServiceConfig({
      cwd: directory,
      envFilePath: null,
      env: {
        DRY_RUN_EXECUTION_MODE: "live",
        DRY_RUN_MARKETS: "KRW-BTC",
        DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_min75_candidate_v1",
        LIVE_READINESS_APPROVED: "true",
        ...LIVE_FEE_ENV,
        LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
        LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
      },
    });

    assert.equal(config.executionMode, "live");
    assert.equal(config.entryProfile, "btc_240m_momentum_min75_candidate_v1");
    assert.equal(config.liveGoalStatusPath, liveGoalPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode when supplied live-goal status is blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-blocked-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      buildTimeSeriesReadinessSummary({
        candidate: {
          market: "KRW-BTC",
          signalMode: "momentum",
          unitMinutes: 240,
          lookbackBars: 24,
          holdBars: 24,
          minReturnBps: 75,
          riskFilter: "rv24_below_p70",
        },
      }),
    ),
    "utf8",
  );
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        liveReady: false,
        liveStartupAllowed: false,
        selectedLiveCandidate: null,
        blockers: ["spotPerpCarryFocusRecompareRequired"],
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_min75_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /spotPerpCarryFocusRecompareRequired/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode without live-goal completion audit", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-audit-required-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(summaryPath, JSON.stringify(buildTimeSeriesReadinessSummary()), "utf8");
  writeFileSync(
    liveGoalPath,
    JSON.stringify(buildLiveGoalStatus({ completionAudit: undefined })),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /completion audit/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode when live-goal audit has stale missing requirement count", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-audit-missing-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(summaryPath, JSON.stringify(buildTimeSeriesReadinessSummary()), "utf8");
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        completionAudit: {
          achieved: true,
          failedCompletionCriteria: [],
          missingRequirements: [],
          missingRequirementCount: 1,
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /missingRequirementCount must match missingRequirements/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode without live-goal missing requirement count", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-audit-count-required-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(summaryPath, JSON.stringify(buildTimeSeriesReadinessSummary()), "utf8");
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        completionAudit: {
          achieved: true,
          failedCompletionCriteria: [],
          missingRequirements: [],
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /missingRequirementCount must be a non-negative integer/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode without live-goal completion audit criteria", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-audit-criteria-required-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(summaryPath, JSON.stringify(buildTimeSeriesReadinessSummary()), "utf8");
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        completionAudit: {
          achieved: true,
          failedCompletionCriteria: [],
          missingRequirements: [],
          missingRequirementCount: 0,
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /completion audit criteria is required/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode when failed criteria ids are omitted", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-audit-failed-criteria-mismatch-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(summaryPath, JSON.stringify(buildTimeSeriesReadinessSummary()), "utf8");
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        completionAudit: {
          achieved: true,
          failedCompletionCriteria: [],
          missingRequirements: [],
          missingRequirementCount: 0,
          criteria: liveGoalCompletionCriteria({
            profitability_evidence_satisfied: false,
          }),
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /failedCompletionCriteria must match failed criteria ids/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode when duplicate failed criteria omit a failed id", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-audit-duplicate-failed-criteria-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  writeFileSync(summaryPath, JSON.stringify(buildTimeSeriesReadinessSummary()), "utf8");
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        completionAudit: {
          achieved: false,
          failedCompletionCriteria: [
            "profitability_evidence_satisfied",
            "profitability_evidence_satisfied",
          ],
          missingRequirements: [],
          missingRequirementCount: 0,
          criteria: liveGoalCompletionCriteria({
            profitability_evidence_satisfied: false,
            no_current_focus_recompare_caution: false,
          }),
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /failedCompletionCriteria must match failed criteria ids/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode when live-goal status predates readiness evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-stale-approval-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  const liveGoalPath = join(directory, "live-goal-status.json");
  const nowMs = Date.now();
  writeFileSync(
    summaryPath,
    JSON.stringify(
      buildTimeSeriesReadinessSummary({
        generatedAt: new Date(nowMs).toISOString(),
      }),
    ),
    "utf8",
  );
  writeFileSync(
    liveGoalPath,
    JSON.stringify(
      buildLiveGoalStatus({
        generatedAt: new Date(nowMs - 60_000).toISOString(),
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_GOAL_STATUS_PATH: "live-goal-status.json",
          },
        }),
      /generated after LIVE_READINESS_SUMMARY_PATH/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig accepts BTC lb168 hold72 profile for paper measurement", () => {
  const config = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_EXECUTION_MODE: "paper",
      DRY_RUN_MARKETS: "KRW-BTC",
      DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1",
      DRY_RUN_EXIT_PROFILE: "balanced_v1",
      DRY_RUN_SYNTHETIC_EXIT_POLICY: "carry_open",
    },
  });

  assert.equal(config.executionMode, "paper");
  assert.equal(
    config.entryProfile,
    "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1",
  );
});

test("loadDryRunServiceConfig accepts BTC lb168 hold49 profile for paper measurement", () => {
  const config = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_EXECUTION_MODE: "paper",
      DRY_RUN_MARKETS: "KRW-BTC",
      DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_lb168_hold49_range_p70_candidate_v1",
      DRY_RUN_EXIT_PROFILE: "balanced_v1",
      DRY_RUN_SYNTHETIC_EXIT_POLICY: "carry_open",
    },
  });

  assert.equal(config.executionMode, "paper");
  assert.equal(
    config.entryProfile,
    "btc_240m_momentum_lb168_hold49_range_p70_candidate_v1",
  );
});

test("loadDryRunServiceConfig blocks BTC time-series readiness on the wrong live profile", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-time-series-profile-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(buildTimeSeriesReadinessSummary()),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
          },
        }),
      /requires a BTC 240m entry profile/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks min75 profile on min25 BTC time-series evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-time-series-min75-mismatch-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(buildTimeSeriesReadinessSummary()),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_min75_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
          },
        }),
      /minReturnBps=75/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks paper-only BTC time-series evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-time-series-block-"));
  const summaryPath = join(directory, "time-series-readiness.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      buildTimeSeriesReadinessSummary({
        strategyAssessment: {
          classification: "paper_candidate",
        },
        liveReadiness: {
          paperOnlyRecommended: true,
          checks: {
            ...buildTimeSeriesReadinessSummary().liveReadiness.checks,
            realizedExitAvailable: false,
            noOpenPaperPositionAfterExit: false,
          },
        },
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
          },
        }),
      /live_candidate/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig recognizes replacement readiness but still requires matching live market", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-pieverse-readiness-"));
  const summaryPath = join(directory, "pieverse-readiness.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(buildPieverseReplacementReadinessSummary()),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "pieverse_60m_reversal_lb168_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "pieverse-readiness.json",
          },
        }),
      /DRY_RUN_MARKETS to match readiness candidate\.market \(KRW-PIEVERSE\)/,
    );

    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-PIEVERSE",
            DRY_RUN_ENTRY_PROFILE: "pieverse_60m_reversal_lb168_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "pieverse-readiness.json",
          },
        }),
      /DRY_RUN_MARKETS=KRW-BTC/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig allows KRW-STABLE replacement profile for paper measurement only", () => {
  const config = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_EXECUTION_MODE: "paper",
      DRY_RUN_MARKETS: "KRW-STABLE",
      DRY_RUN_ENTRY_PROFILE: "stable_60m_reversal_candidate_v1",
    },
  });

  assert.equal(config.executionMode, "paper");
  assert.equal(config.entryProfile, "stable_60m_reversal_candidate_v1");
  assert.equal(config.bootstrap.markets, "KRW-STABLE");
});

test("loadDryRunServiceConfig recognizes KRW-STABLE readiness but keeps non-BTC live blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-stable-readiness-"));
  const summaryPath = join(directory, "stable-readiness.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(buildStableReplacementReadinessSummary()),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-STABLE",
            DRY_RUN_ENTRY_PROFILE: "stable_60m_reversal_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "stable-readiness.json",
          },
        }),
      /DRY_RUN_MARKETS=KRW-BTC/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks incomplete replacement readiness evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-pieverse-incomplete-"));
  const summaryPath = join(directory, "pieverse-readiness.json");
  const summary = buildPieverseReplacementReadinessSummary();
  writeFileSync(
    summaryPath,
    JSON.stringify({
      ...summary,
      liveReadiness: {
        ...summary.liveReadiness,
        checks: {
          ...summary.liveReadiness.checks,
          positiveRealizedPaperExitPnl: false,
        },
      },
    }),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "pieverse_60m_reversal_lb168_candidate_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "pieverse-readiness.json",
          },
        }),
      /positiveRealizedPaperExitPnl/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode until readiness is approved", () => {
  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_EXECUTION_MODE: "live",
          DRY_RUN_MARKETS: "KRW-BTC",
        },
      }),
    /LIVE_READINESS_APPROVED=true/,
  );
});

test("loadDryRunServiceConfig blocks live mode until the account fee schedule is confirmed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-fee-confirmation-"));
  writeFileSync(
    join(directory, "time-series-readiness.json"),
    JSON.stringify(buildTimeSeriesReadinessSummary()),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            LIVE_TRADING_FEE_ROUND_TRIP_BPS: "20",
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
          },
        }),
      /LIVE_TRADING_FEE_SCHEDULE_CONFIRMED=true/,
    );

    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            LIVE_TRADING_FEE_SCHEDULE_CONFIRMED: "true",
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
          },
        }),
      /LIVE_TRADING_FEE_ROUND_TRIP_BPS/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks stale live readiness evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-stale-readiness-"));
  writeFileSync(
    join(directory, "time-series-readiness.json"),
    JSON.stringify(
      buildTimeSeriesReadinessSummary({
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
            LIVE_READINESS_MAX_AGE_MS: "60000",
          },
        }),
      /fresh LIVE_READINESS_SUMMARY_PATH evidence/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks BTC time-series live mode when account fees exceed benchmark evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-fee-coverage-"));
  writeFileSync(
    join(directory, "time-series-readiness.json"),
    JSON.stringify(buildTimeSeriesReadinessSummary()),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            DRY_RUN_ENTRY_PROFILE: "btc_240m_momentum_public_v1",
            LIVE_READINESS_APPROVED: "true",
            LIVE_TRADING_FEE_SCHEDULE_CONFIRMED: "true",
            LIVE_TRADING_FEE_ROUND_TRIP_BPS: "50",
            LIVE_READINESS_SUMMARY_PATH: "time-series-readiness.json",
          },
        }),
      /covered by BTC time-series benchmark feeRoundTripBps/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode without benchmark readiness evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-readiness-bad-"));
  const summaryPath = join(directory, "readiness-summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      strategyAssessment: {
        classification: "discard_candidate",
      },
      liveReadiness: {
        paperOnlyRecommended: true,
      },
      btcBuyHoldBenchmark: {
        totalExcessPnlKrw: -10_000,
        excessReturnInformationRatio: -0.5,
      },
    }),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
          },
        }),
      /LIVE_READINESS_SUMMARY_PATH/,
    );

    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "readiness-summary.json",
          },
        }),
      /live_candidate/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig rejects aggregate audit output as live readiness evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-readiness-audit-"));
  const summaryPath = join(directory, "audit-summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      recommendation: {
        liveReadyLabels: ["trend"],
        promotionGates: {
          liveReady: {
            passed: true,
          },
        },
      },
      candidates: [
        {
          label: "trend",
          liveReady: true,
        },
      ],
    }),
    "utf8",
  );

  try {
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "audit-summary.json",
          },
        }),
      /strategyAssessment\.classification='live_candidate'/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode when BTC excess evidence is weak", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-readiness-edge-"));
  const summaryPath = join(directory, "readiness-summary.json");
  const baseSummary = {
    ...buildLiveReadinessSummary(),
  };

  try {
    writeFileSync(
      summaryPath,
      JSON.stringify({
        ...baseSummary,
        btcBuyHoldBenchmark: {
          totalExcessPnlKrw: -1,
          excessReturnInformationRatio: 0.5,
        },
      }),
      "utf8",
    );
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "readiness-summary.json",
          },
        }),
      /positive BTC buy-and-hold excess PnL/,
    );

    writeFileSync(
      summaryPath,
      JSON.stringify({
        ...baseSummary,
        btcBuyHoldBenchmark: {
          totalExcessPnlKrw: 10_000,
          excessReturnInformationRatio: 0,
        },
      }),
      "utf8",
    );
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "readiness-summary.json",
          },
        }),
      /positive risk-adjusted BTC excess return/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig blocks live mode unless every readiness check passes", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-readiness-checks-"));
  const summaryPath = join(directory, "readiness-summary.json");

  try {
    writeFileSync(
      summaryPath,
      JSON.stringify(
        buildLiveReadinessSummary({
          liveReadiness: {
            paperOnlyRecommended: false,
          },
        }),
      ),
      "utf8",
    );
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "readiness-summary.json",
          },
        }),
      /all live readiness checks/,
    );

    writeFileSync(
      summaryPath,
      JSON.stringify(
        buildLiveReadinessSummary({
          liveReadiness: {
            paperOnlyRecommended: false,
            checks: {
              minimumClosedTrades: true,
              positiveTradedPnl: true,
              positiveAverageTradedPnl: true,
              positiveClosedTradePnl: true,
              noOpenMarkProfitDependency: true,
              noReconciliationFailures: true,
              noRejectedDecisionSessions: true,
              noSyntheticCloseSessions: true,
              noOpenPosition: true,
              cycleCompletionRateOk: true,
              cycleRecoverySinceLatestFailureOk: false,
              noMaterialLosingExitReasons: true,
              btcBuyHoldBenchmarkAvailable: true,
              beatsBtcBuyAndHold: true,
              positiveAverageExcessReturn: true,
              positiveRiskAdjustedExcessReturn: true,
              drawdownNoWorseThanBtcBuyAndHold: true,
            },
          },
        }),
      ),
      "utf8",
    );
    assert.throws(
      () =>
        loadDryRunServiceConfig({
          cwd: directory,
          envFilePath: null,
          env: {
            DRY_RUN_EXECUTION_MODE: "live",
            DRY_RUN_MARKETS: "KRW-BTC",
            LIVE_READINESS_APPROVED: "true",
            ...LIVE_FEE_ENV,
            LIVE_READINESS_SUMMARY_PATH: "readiness-summary.json",
          },
        }),
      /cycleRecoverySinceLatestFailureOk/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig defaults to paper carry-open live-candidate settings", () => {
  const config = loadDryRunServiceConfig({
    envFilePath: null,
    env: {},
  });

  assert.equal(config.executionMode, "paper");
  assert.equal(config.exitProfile, "balanced_v1");
  assert.equal(config.syntheticExitPolicy, "carry_open");
});

test("loadDryRunServiceConfig accepts the book-confirmed balanced profiles", () => {
  const config = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_EXIT_PROFILE: "balanced_v1_book_confirm2",
    },
  });
  const confirm3Config = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_EXIT_PROFILE: "balanced_v1_book_confirm3",
    },
  });
  const trendHoldConfig = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_EXIT_PROFILE: "balanced_v1_book_confirm3_trend_hold",
    },
  });
  const guardedTrendHoldConfig = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_EXIT_PROFILE: "balanced_v1_book_confirm3_trend_hold_guarded",
    },
  });

  assert.equal(config.exitProfile, "balanced_v1_book_confirm2");
  assert.equal(confirm3Config.exitProfile, "balanced_v1_book_confirm3");
  assert.equal(
    trendHoldConfig.exitProfile,
    "balanced_v1_book_confirm3_trend_hold",
  );
  assert.equal(
    guardedTrendHoldConfig.exitProfile,
    "balanced_v1_book_confirm3_trend_hold_guarded",
  );
});

test("loadDryRunServiceConfig accepts the explicit BTC trend experiment profile", () => {
  const config = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_ENTRY_PROFILE: "btc_trend_v1",
    },
  });

  assert.equal(config.entryProfile, "btc_trend_v1");

  const lowBufferConfig = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_ENTRY_PROFILE: "btc_trend_low_buffer_v1",
    },
  });

  assert.equal(lowBufferConfig.entryProfile, "btc_trend_low_buffer_v1");

  const flowConfirmConfig = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_ENTRY_PROFILE: "btc_trend_flow_confirm_v1",
    },
  });

  assert.equal(flowConfirmConfig.entryProfile, "btc_trend_flow_confirm_v1");

  const ret1ConfirmConfig = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_ENTRY_PROFILE: "btc_trend_ret1_confirm_v1",
    },
  });

  assert.equal(ret1ConfirmConfig.entryProfile, "btc_trend_ret1_confirm_v1");

  const ret1TurnoverCapConfig = loadDryRunServiceConfig({
    envFilePath: null,
    env: {
      DRY_RUN_ENTRY_PROFILE: "btc_trend_ret1_turnover_cap_v1",
    },
  });

  assert.equal(
    ret1TurnoverCapConfig.entryProfile,
    "btc_trend_ret1_turnover_cap_v1",
  );
});
