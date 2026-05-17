import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function writeReadinessFixtures(
  directory: string,
  exitAttempted = false,
  options: {
    signalActive?: boolean;
    reasons?: string[];
    executionViability?: string;
    realizedExitNetPnlKrw?: number;
  } = {},
): {
  benchmarkPath: string;
  observationPath: string;
  paperObservationPath: string;
  positionAuditPath: string;
} {
  const benchmarkPath = join(directory, "benchmark.json");
  const observationPath = join(directory, "observation.json");
  const paperObservationPath = join(directory, "paper-observation.json");
  const positionAuditPath = join(directory, "position-audit.json");

  writeJson(benchmarkPath, {
    candidate: {
      market: "KRW-BTC",
      signalMode: "momentum",
      unitMinutes: 240,
      feeRoundTripBps: 20,
    },
    strategy: {
      tradeCount: 125,
      returnPct: 165,
      annualizedReturnPct: 53,
      maxDrawdownPct: -18,
    },
    benchmark: {
      buyHoldReturnPct: 101,
      excessReturnVsBuyHoldPct: 64,
    },
  });
  writeJson(observationPath, {
    signal: { active: options.signalActive ?? true },
    orderbook: {
      spreadBps: 0.2,
      buyDepth: { coversRequestedNotional: true },
      sellDepth: { coversRequestedNotional: true },
    },
    decision: {
      executionViability: options.executionViability ?? "watch_candidate",
      reasons: options.reasons ?? [],
    },
  });
  writeJson(paperObservationPath, {
    paper: {
      attemptedSignal: true,
      acceptedSignals: 1,
      reconciliationOk: true,
      openPositionCount: 1,
    },
  });
  writeJson(positionAuditPath, {
    timing: {
      holdElapsed: exitAttempted,
      holdExitDueAt: "2026-05-16T11:00:00.000Z",
    },
    mark: {
      estimatedExitNetPnlKrw: -432,
      estimatedExitReturnPct: -0.08,
    },
    exit: exitAttempted
      ? {
          attempted: true,
          reusePolicy: "first_reduce_only_exit_for_entry_signal",
          exitObservationGeneratedAt: "2026-05-16T12:00:00.000Z",
          reconciliationOk: true,
          openPositionCount: 0,
          realizedExitNetPnlKrw: options.realizedExitNetPnlKrw ?? 1250,
        }
      : {
          attempted: false,
          reason: "hold_window_not_elapsed",
        },
  });

  return { benchmarkPath, observationPath, paperObservationPath, positionAuditPath };
}

function writeStressBenchmarkFixture(directory: string): string {
  const stressBenchmarkPath = join(directory, "stress-benchmark.json");
  writeJson(stressBenchmarkPath, {
    candidate: {
      market: "KRW-BTC",
      signalMode: "momentum",
      unitMinutes: 240,
      feeRoundTripBps: 50,
    },
    strategy: {
      tradeCount: 125,
      returnPct: 93,
      annualizedReturnPct: 33,
      maxDrawdownPct: -19,
    },
    benchmark: {
      buyHoldReturnPct: 102,
      excessReturnVsBuyHoldPct: -8,
    },
  });
  return stressBenchmarkPath;
}

test("time-series readiness marks current BTC 240m evidence as paper candidate only", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-ready-"));
  try {
    const paths = writeReadinessFixtures(directory);
    const outputPath = join(directory, "readiness.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--observation",
        paths.observationPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--position-audit",
        paths.positionAuditPath,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      strategyAssessment: { classification: string };
      paperReadiness: { ready: boolean; reasons: string[] };
      liveReadiness: { ready: boolean; reasons: string[] };
    };
    assert.equal(report.strategyAssessment.classification, "paper_candidate");
    assert.equal(report.paperReadiness.ready, true);
    assert.deepEqual(report.paperReadiness.reasons, []);
    assert.equal(report.liveReadiness.ready, false);
    assert.deepEqual(report.liveReadiness.reasons, [
      "realizedExitAvailable",
      "realizedExitReusePolicy",
      "noOpenPaperPositionAfterExit",
      "positiveRealizedPaperExitPnl",
      "liveExecutionPathReady",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series readiness exits nonzero when live evidence is still missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-block-"));
  try {
    const paths = writeReadinessFixtures(directory);
    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--observation",
        paths.observationPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--position-audit",
        paths.positionAuditPath,
        "--require-live-ready",
        "--live-execution-path-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /realizedExitAvailable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series readiness can classify a fully exited candidate as live candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-live-"));
  try {
    const paths = writeReadinessFixtures(directory, true);
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--observation",
        paths.observationPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--position-audit",
        paths.positionAuditPath,
        "--require-live-ready",
        "--live-execution-path-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      strategyAssessment: { classification: string };
      liveReadiness: { ready: boolean; reasons: string[] };
    };
    assert.equal(report.strategyAssessment.classification, "live_candidate");
    assert.equal(report.liveReadiness.ready, true);
    assert.deepEqual(report.liveReadiness.reasons, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series readiness blocks live candidate after a losing paper exit", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-live-loss-block-"));
  try {
    const paths = writeReadinessFixtures(directory, true, {
      realizedExitNetPnlKrw: -100,
    });
    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--observation",
        paths.observationPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--position-audit",
        paths.positionAuditPath,
        "--require-live-ready",
        "--live-execution-path-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /positiveRealizedPaperExitPnl/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series readiness blocks live candidate when fee stress underperforms buy-and-hold", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-fee-stress-block-"));
  try {
    const paths = writeReadinessFixtures(directory, true);
    const stressBenchmarkPath = writeStressBenchmarkFixture(directory);
    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--stress-benchmark",
        stressBenchmarkPath,
        "--observation",
        paths.observationPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--position-audit",
        paths.positionAuditPath,
        "--require-live-ready",
        "--live-execution-path-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /stressBeatsBtcBuyAndHold/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series readiness allows live candidate to wait when entry signal is inactive after exit", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-live-wait-"));
  try {
    const paths = writeReadinessFixtures(directory, true, {
      signalActive: false,
      executionViability: "blocked_by_signal_or_execution_cost",
      reasons: ["momentum_signal_inactive"],
    });
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--observation",
        paths.observationPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--position-audit",
        paths.positionAuditPath,
        "--require-live-ready",
        "--live-execution-path-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      strategyAssessment: { classification: string };
      liveReadiness: { ready: boolean; reasons: string[] };
    };
    assert.equal(report.strategyAssessment.classification, "live_candidate");
    assert.equal(report.liveReadiness.ready, true);
    assert.deepEqual(report.liveReadiness.reasons, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series readiness still blocks live candidate on execution-cost reasons after exit", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-live-cost-block-"));
  try {
    const paths = writeReadinessFixtures(directory, true, {
      signalActive: false,
      executionViability: "blocked_by_signal_or_execution_cost",
      reasons: ["spread_exceeds_expected_edge"],
    });
    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--observation",
        paths.observationPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--position-audit",
        paths.positionAuditPath,
        "--require-live-ready",
        "--live-execution-path-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /noExecutionCostReasons/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
