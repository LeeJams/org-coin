import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function writeScan(path: string): void {
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    assumptions: {
      unitMinutes: 60,
      signalMode: "momentum",
      feeRoundTripBps: 20,
    },
    promotionCandidateCount: 1,
    promotionCandidates: [
      {
        market: "KRW-H",
        lookbackBars: 168,
        holdBars: 24,
        minReturnBps: 0,
        riskFilter: "range24_below_p70",
        riskThreshold: 2071.713147410359,
        train: {
          count: 57,
          totalPnlKrw: 275046.762092,
          medianPnlKrw: 1173.913043,
          returnPct: 0.965076,
        },
        test: {
          count: 38,
          totalPnlKrw: 516040.383098,
          medianPnlKrw: 6936.507937,
          returnPct: 2.716002,
        },
        walkForward: {
          positiveTotalFoldCount: 5,
          positiveMedianFoldCount: 4,
          minFoldPnlKrw: 30740.250336,
        },
      },
    ],
  });
}

function writeSingleMarketScanWithoutCandidateMarket(path: string): void {
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    assumptions: {
      market: "KRW-STABLE",
      unitMinutes: 60,
      signalMode: "reversal",
      feeRoundTripBps: 20,
    },
    promotionCandidateCount: 1,
    promotionCandidates: [
      {
        lookbackBars: 24,
        holdBars: 24,
        minReturnBps: 50,
        riskFilter: "none",
        riskThreshold: null,
        train: {
          count: 77,
          totalPnlKrw: 3279.965989,
          medianPnlKrw: 34.887781,
          returnPct: 0.851939,
        },
        test: {
          count: 35,
          totalPnlKrw: 2349.798696,
          medianPnlKrw: 19.68508,
          returnPct: 1.342742,
        },
        walkForward: {
          positiveTotalFoldCount: 5,
          positiveMedianFoldCount: 5,
          minFoldPnlKrw: 18.727564,
        },
      },
    ],
  });
}

function writeObservation(path: string, active = true): void {
  writeJson(path, {
    generatedAt: "2026-05-13T01:00:00.000Z",
    candidate: {
      market: "KRW-H",
      signalMode: "momentum",
      unitMinutes: 60,
      lookbackBars: 168,
      holdBars: 24,
      minReturnBps: 0,
      riskFilter: "range24_below_p70",
      riskThreshold: 2071.713147410359,
    },
    signal: {
      active,
      directionalSignalPass: true,
      riskPass: active,
    },
    orderbook: {
      spreadBps: 4,
      executableRoundTripCostBps: 30,
      executableCostVsExpectedEdgeBps: -108.730159,
      buyDepth: { coversRequestedNotional: true },
      sellDepth: { coversRequestedNotional: true },
    },
    executionPolicy: {
      maxSpreadBps: 8,
      min24hNotionalKrw: 30_000_000_000,
    },
    ticker: {
      accTradePrice24h: 45_000_000_000,
    },
    freshness: {
      tickerFresh: true,
      latestCandleRecent: true,
      snapshotSkewControlled: true,
    },
    decision: {
      executionViability: active ? "watch_candidate" : "blocked_by_signal_or_execution_cost",
      reasons: active ? [] : ["momentum_signal_inactive"],
    },
  });
}

function writeStableObservation(path: string): void {
  writeJson(path, {
    generatedAt: "2026-05-13T01:00:00.000Z",
    candidate: {
      market: "KRW-STABLE",
      signalMode: "reversal",
      unitMinutes: 60,
      lookbackBars: 24,
      holdBars: 24,
      minReturnBps: 50,
      minDropBps: 50,
      riskFilter: "none",
      riskThreshold: null,
    },
    signal: {
      active: false,
      directionalSignalPass: false,
      riskPass: true,
    },
    orderbook: {
      spreadBps: 19.934759,
      executableRoundTripCostBps: 21.546414,
      executableCostVsExpectedEdgeBps: -17.823746,
      buyDepth: { coversRequestedNotional: true },
      sellDepth: { coversRequestedNotional: true },
    },
    executionPolicy: {
      maxSpreadBps: 8,
      min24hNotionalKrw: 30_000_000_000,
    },
    ticker: {
      accTradePrice24h: 2_000_000_000,
    },
    freshness: {
      tickerFresh: true,
      latestCandleRecent: true,
      snapshotSkewControlled: true,
    },
    decision: {
      executionViability: "blocked_by_signal_or_execution_cost",
      reasons: ["reversal_signal_inactive"],
    },
  });
}

function writeExecutionGuardBlockedObservation(path: string): void {
  writeJson(path, {
    generatedAt: "2026-05-13T01:00:00.000Z",
    candidate: {
      market: "KRW-H",
      signalMode: "momentum",
      unitMinutes: 60,
      lookbackBars: 168,
      holdBars: 24,
      minReturnBps: 0,
      riskFilter: "range24_below_p70",
      riskThreshold: 2071.713147410359,
    },
    signal: {
      active: true,
      directionalSignalPass: true,
      riskPass: true,
    },
    orderbook: {
      spreadBps: 28.9,
      executableRoundTripCostBps: 30,
      executableCostVsExpectedEdgeBps: -108.730159,
      buyDepth: { coversRequestedNotional: true },
      sellDepth: { coversRequestedNotional: true },
    },
    executionPolicy: {
      maxSpreadBps: 8,
      min24hNotionalKrw: 30_000_000_000,
    },
    ticker: {
      accTradePrice24h: 13_000_000_000,
    },
    freshness: {
      tickerFresh: true,
      latestCandleRecent: true,
      snapshotSkewControlled: true,
    },
    decision: {
      executionViability: "watch_candidate",
      reasons: [],
    },
  });
}

function paperCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    market: "KRW-H",
    signalMode: "momentum",
    unitMinutes: 60,
    lookbackBars: 168,
    holdBars: 24,
    minReturnBps: 0,
    minDropBps: undefined,
    riskFilter: "range24_below_p70",
    riskThreshold: 2071.713147410359,
    ...overrides,
  };
}

function stablePaperCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    market: "KRW-STABLE",
    signalMode: "reversal",
    unitMinutes: 60,
    lookbackBars: 24,
    holdBars: 24,
    minReturnBps: 50,
    minDropBps: 50,
    riskFilter: "none",
    riskThreshold: null,
    ...overrides,
  };
}

function writePaperObservation(
  path: string,
  sourceObservationPath: string,
  attempted = true,
  overrides: {
    generatedAt?: string;
    candidate?: Record<string, unknown>;
    rejectedSignalReasons?: Array<Record<string, unknown>>;
  } = {},
): void {
  writeJson(path, {
    generatedAt: overrides.generatedAt ?? "2026-05-13T01:01:00.000Z",
    sourceObservationPath,
    candidate: overrides.candidate ?? paperCandidate(),
    skippedReasons: attempted ? [] : ["signal_inactive"],
    paper: {
      attemptedSignal: attempted,
      acceptedSignals: attempted ? 1 : 0,
      rejectedSignalReasons: overrides.rejectedSignalReasons ?? [],
      reconciliationOk: true,
      openPositionCount: attempted ? 1 : 0,
    },
  });
}

function writePositionAudit(path: string, exited = false, pnl = 1250): void {
  writeJson(path, {
    timing: {
      holdElapsed: exited,
      holdExitDueAt: "2026-05-14T01:00:00.000Z",
    },
    mark: {
      estimatedExitNetPnlKrw: pnl,
      estimatedExitReturnPct: pnl / 500000,
    },
    exit: exited
      ? {
          attempted: true,
          reusePolicy: "first_reduce_only_exit_for_entry_signal",
          exitObservationGeneratedAt: "2026-05-14T01:00:00.000Z",
          reconciliationOk: true,
          openPositionCount: 0,
          realizedExitNetPnlKrw: pnl,
        }
      : {
          attempted: false,
          reason: "hold_window_not_elapsed",
        },
  });
}

test("replacement time-series readiness reports current blocked observation as research only", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-readiness-current-"));
  try {
    const scanPath = join(directory, "scan.json");
    const observationPath = join(directory, "observation.json");
    const paperPath = join(directory, "paper.json");
    writeScan(scanPath);
    writeObservation(observationPath, false);
    writePaperObservation(paperPath, observationPath, false);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-replacement-time-series-readiness.js",
        "--scan",
        scanPath,
        "--observation",
        observationPath,
        "--paper-observation",
        paperPath,
        "--require-paper-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout) as {
      strategyAssessment: { classification: string };
      candidate: { market: string };
      paperReadiness: { ready: boolean; reasons: string[] };
      liveReadiness: { ready: boolean };
    };
    assert.equal(report.strategyAssessment.classification, "research_candidate");
    assert.equal(report.candidate.market, "KRW-H");
    assert.equal(report.paperReadiness.ready, false);
    assert.ok(report.paperReadiness.reasons.includes("signalActive"));
    assert.ok(report.paperReadiness.reasons.includes("paperSignalAttempted"));
    assert.equal(report.liveReadiness.ready, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replacement time-series readiness matches single-market scan assumptions when candidate omits market", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-readiness-single-market-"));
  try {
    const scanPath = join(directory, "scan.json");
    const observationPath = join(directory, "observation.json");
    const paperPath = join(directory, "paper.json");
    writeSingleMarketScanWithoutCandidateMarket(scanPath);
    writeStableObservation(observationPath);
    writePaperObservation(paperPath, observationPath, false, {
      candidate: stablePaperCandidate(),
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-replacement-time-series-readiness.js",
        "--scan",
        scanPath,
        "--observation",
        observationPath,
        "--paper-observation",
        paperPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout) as {
      strategyAssessment: { classification: string };
      candidate: { market: string };
      paperReadiness: {
        ready: boolean;
        checks: { candidateMatchesObservation: boolean; executableCostWithinExpectedEdge: boolean };
        reasons: string[];
      };
    };
    assert.equal(report.strategyAssessment.classification, "research_candidate");
    assert.equal(report.candidate.market, "KRW-STABLE");
    assert.equal(report.paperReadiness.ready, false);
    assert.equal(report.paperReadiness.checks.candidateMatchesObservation, true);
    assert.equal(report.paperReadiness.checks.executableCostWithinExpectedEdge, true);
    assert.ok(report.paperReadiness.reasons.includes("signalActive"));
    assert.ok(!report.paperReadiness.reasons.includes("candidateMatchesObservation"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replacement time-series readiness carries paper execution rejection reasons", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-readiness-reject-reason-"));
  try {
    const scanPath = join(directory, "scan.json");
    const observationPath = join(directory, "observation.json");
    const paperPath = join(directory, "paper.json");
    writeSingleMarketScanWithoutCandidateMarket(scanPath);
    writeStableObservation(observationPath);
    writePaperObservation(paperPath, observationPath, false, {
      candidate: stablePaperCandidate(),
      rejectedSignalReasons: [
        {
          code: "liquidity_guard_triggered",
          message: "market liquidity checks failed",
          detail: {
            rolling24hNotional: 4_159_349_446.001694,
            min24hNotional: 30_000_000_000,
          },
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-replacement-time-series-readiness.js",
        "--scan",
        scanPath,
        "--observation",
        observationPath,
        "--paper-observation",
        paperPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      paperExecution: {
        rejectedSignalReasons: Array<{ code: string; detail: { min24hNotional: number } }>;
      };
    };

    assert.equal(report.paperExecution.rejectedSignalReasons[0]?.code, "liquidity_guard_triggered");
    assert.equal(report.paperExecution.rejectedSignalReasons[0]?.detail.min24hNotional, 30_000_000_000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replacement time-series readiness blocks candidates that fail live execution guards", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-readiness-execution-guard-"));
  try {
    const scanPath = join(directory, "scan.json");
    const observationPath = join(directory, "observation.json");
    const paperPath = join(directory, "paper.json");
    writeScan(scanPath);
    writeExecutionGuardBlockedObservation(observationPath);
    writePaperObservation(paperPath, observationPath, false, {
      rejectedSignalReasons: [
        {
          code: "spread_guard_triggered",
          message: "spread guard blocked the order",
          detail: { spreadBps: 28.9, maxSpreadBps: 8 },
        },
        {
          code: "liquidity_guard_triggered",
          message: "market liquidity checks failed",
          detail: {
            rolling24hNotional: 13_000_000_000,
            min24hNotional: 30_000_000_000,
          },
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-replacement-time-series-readiness.js",
        "--scan",
        scanPath,
        "--observation",
        observationPath,
        "--paper-observation",
        paperPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      strategyAssessment: { classification: string };
      paperReadiness: {
        ready: boolean;
        checks: {
          executionViabilityWatchCandidate: boolean;
          spreadWithinLiveRiskPolicy: boolean;
          rolling24hNotionalWithinLiveRiskPolicy: boolean;
        };
        reasons: string[];
      };
    };

    assert.equal(report.strategyAssessment.classification, "research_candidate");
    assert.equal(report.paperReadiness.ready, false);
    assert.equal(report.paperReadiness.checks.executionViabilityWatchCandidate, true);
    assert.equal(report.paperReadiness.checks.spreadWithinLiveRiskPolicy, false);
    assert.equal(report.paperReadiness.checks.rolling24hNotionalWithinLiveRiskPolicy, false);
    assert.ok(report.paperReadiness.reasons.includes("spreadWithinLiveRiskPolicy"));
    assert.ok(report.paperReadiness.reasons.includes("rolling24hNotionalWithinLiveRiskPolicy"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replacement time-series readiness can classify an exited positive paper candidate as live-ready", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-readiness-live-"));
  try {
    const scanPath = join(directory, "scan.json");
    const observationPath = join(directory, "observation.json");
    const paperPath = join(directory, "paper.json");
    const positionPath = join(directory, "position.json");
    writeScan(scanPath);
    writeObservation(observationPath, true);
    writePaperObservation(paperPath, observationPath, true);
    writePositionAudit(positionPath, true, 2500);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-replacement-time-series-readiness.js",
        "--scan",
        scanPath,
        "--observation",
        observationPath,
        "--paper-observation",
        paperPath,
        "--position-audit",
        positionPath,
        "--live-execution-path-ready",
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      strategyAssessment: { classification: string };
      benchmarkSummary: {
        buyHoldReturnPct: null;
        excessReturnVsBuyHoldPct: null;
        testReturnPct: number;
      };
      paperReadiness: { ready: boolean };
      liveReadiness: { ready: boolean; reasons: string[] };
      openPosition: { estimatedExitNetPnlKrw: number };
    };
    assert.equal(report.strategyAssessment.classification, "live_candidate");
    assert.equal(report.benchmarkSummary.buyHoldReturnPct, null);
    assert.equal(report.benchmarkSummary.excessReturnVsBuyHoldPct, null);
    assert.equal(report.benchmarkSummary.testReturnPct, 2.716002);
    assert.equal(report.paperReadiness.ready, true);
    assert.equal(report.liveReadiness.ready, true);
    assert.deepEqual(report.liveReadiness.reasons, []);
    assert.equal(report.openPosition.estimatedExitNetPnlKrw, 2500);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replacement time-series readiness blocks stale or mismatched paper evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-readiness-stale-"));
  try {
    const scanPath = join(directory, "scan.json");
    const observationPath = join(directory, "observation.json");
    const staleObservationPath = join(directory, "stale-observation.json");
    const paperPath = join(directory, "paper.json");
    const positionPath = join(directory, "position.json");
    writeScan(scanPath);
    writeObservation(observationPath, true);
    writePaperObservation(paperPath, staleObservationPath, true, {
      generatedAt: "2026-05-13T00:59:59.000Z",
      candidate: paperCandidate({ market: "KRW-BTC" }),
    });
    writePositionAudit(positionPath, true, 2500);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-replacement-time-series-readiness.js",
        "--scan",
        scanPath,
        "--observation",
        observationPath,
        "--paper-observation",
        paperPath,
        "--position-audit",
        positionPath,
        "--live-execution-path-ready",
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout) as {
      strategyAssessment: { classification: string };
      paperReadiness: { ready: boolean; reasons: string[] };
      liveReadiness: { ready: boolean; reasons: string[] };
    };
    assert.equal(report.strategyAssessment.classification, "research_candidate");
    assert.equal(report.paperReadiness.ready, false);
    assert.equal(report.liveReadiness.ready, false);
    assert.ok(report.liveReadiness.reasons.includes("paperObservationAfterObservation"));
    assert.ok(report.liveReadiness.reasons.includes("paperObservationSourceMatches"));
    assert.ok(report.liveReadiness.reasons.includes("paperCandidateMatchesObservation"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
