import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function writeFixtures(directory: string) {
  const benchmarkPath = join(directory, "benchmark.json");
  const observationPath = join(directory, "observation.json");
  const paperObservationPath = join(directory, "paper-observation.json");
  const paperReportPath = join(directory, "paper-report.json");

  writeJson(benchmarkPath, {
    candidate: { market: "KRW-BTC", signalMode: "momentum", unitMinutes: 240, feeRoundTripBps: 20 },
    strategy: { tradeCount: 125, returnPct: 165, maxDrawdownPct: -18 },
    benchmark: { buyHoldReturnPct: 101, excessReturnVsBuyHoldPct: 64 },
  });
  writeJson(observationPath, {
    generatedAt: "2026-05-12T12:00:00.000Z",
    candidate: { market: "KRW-BTC", unitMinutes: 240, holdBars: 24 },
    signal: { active: true },
    orderbook: {
      bestAsk: 100_010_000,
      bestBid: 100_000_000,
      bestAskSize: 0.01,
      bestBidSize: 0.01,
      spreadBps: 1,
      buyDepth: { coversRequestedNotional: true },
      sellDepth: { coversRequestedNotional: true },
    },
    ticker: { tradePrice: 100_000_000, accTradePrice24h: 50_000_000_000 },
    decision: { executionViability: "watch_candidate", reasons: [] },
  });
  writeJson(paperObservationPath, {
    sourceObservationPath: observationPath,
    paper: {
      attemptedSignal: true,
      acceptedSignals: 1,
      reconciliationOk: true,
      openPositionCount: 1,
      reportPath: paperReportPath,
    },
  });
  writeJson(paperReportPath, {
    schemaVersion: "1.0.0",
    generatedAt: "2026-05-12T12:00:00.000Z",
    mode: "paper",
    processedEvents: 2,
    outcomes: [],
    latestSnapshots: {},
    scenarioMetadata: { strategyId: "btc_240m_momentum_public_v1" },
    suppressionSummary: {},
    portfolio: {
      cashAvailable: 9_500_000,
      dailyRealizedPnl: 0,
      positions: {
        "KRW-BTC": {
          market: "KRW-BTC",
          baseQuantity: 0.005,
          avgEntryPrice: 100_000_000,
          realizedPnl: 0,
        },
      },
    },
    ledger: {
      decisions: [
        {
          decisionId: "decision-a",
          signalId: "btc_240m_momentum_public_v1-KRW-BTC-2026-05-12T11:00:00.000Z",
          market: "KRW-BTC",
          mode: "paper",
          accepted: true,
          reasons: [],
          createdAt: "2026-05-12T12:00:00.000Z",
          orderId: "order-a",
        },
      ],
      orders: [],
      fills: [],
    },
    rejectLedger: { totalRejectedDecisions: 0, byMarket: {}, byReason: {}, entries: [] },
    reconciliation: {
      ok: true,
      mode: "paper",
      generatedAt: "2026-05-12T12:00:00.000Z",
      openOrders: [],
      openPositions: [],
      activeKillSwitch: false,
      reasons: [],
    },
    scenarioPath: observationPath,
  });

  return { benchmarkPath, observationPath, paperObservationPath, paperReportPath };
}

test("BTC 240m refresh wrapper updates observation, position audit, and readiness artifacts", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-refresh-"));
  try {
    const paths = writeFixtures(directory);
    const outputDir = join(directory, "reports");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/refresh-btc-240m-momentum-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--paper-report",
        paths.paperReportPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--input-observation",
        paths.observationPath,
        "--output-dir",
        outputDir,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      artifacts: {
        observationPath: string;
        positionAuditPath: string;
        readinessPath: string;
        latestObservationPath: string;
        latestPositionAuditPath: string;
        latestReadinessPath: string;
      };
      summary: { classification: string; paperReady: boolean; liveReady: boolean; liveBlockers: string[] };
    };
    assert.equal(existsSync(report.artifacts.observationPath), true);
    assert.equal(existsSync(report.artifacts.positionAuditPath), true);
    assert.equal(existsSync(report.artifacts.readinessPath), true);
    assert.equal(existsSync(report.artifacts.latestObservationPath), true);
    assert.equal(existsSync(report.artifacts.latestPositionAuditPath), true);
    assert.equal(existsSync(report.artifacts.latestReadinessPath), true);
    assert.equal(report.summary.classification, "paper_candidate");
    assert.equal(report.summary.paperReady, true);
    assert.equal(report.summary.liveReady, false);
	    assert.deepEqual(report.summary.liveBlockers, [
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

test("BTC 240m refresh wrapper exits nonzero when live is required too early", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-refresh-block-"));
  try {
    const paths = writeFixtures(directory);
    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/refresh-btc-240m-momentum-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--paper-report",
        paths.paperReportPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--input-observation",
        paths.observationPath,
        "--output-dir",
        join(directory, "reports"),
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /realizedExitAvailable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("BTC 240m refresh wrapper rejects a mismatched paper observation report path", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-refresh-report-mismatch-"));
  try {
    const paths = writeFixtures(directory);
    writeJson(paths.paperObservationPath, {
      sourceObservationPath: paths.observationPath,
      paper: {
        attemptedSignal: true,
        acceptedSignals: 1,
        reconciliationOk: true,
        openPositionCount: 1,
        reportPath: join(directory, "other-report.json"),
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/refresh-btc-240m-momentum-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--paper-report",
        paths.paperReportPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--input-observation",
        paths.observationPath,
        "--output-dir",
        join(directory, "reports"),
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /paper observation reportPath does not match --paper-report/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("BTC 240m refresh wrapper rejects a missing paper observation source path", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-refresh-missing-source-"));
  try {
    const paths = writeFixtures(directory);
    writeJson(paths.paperObservationPath, {
      paper: {
        attemptedSignal: true,
        acceptedSignals: 1,
        reconciliationOk: true,
        openPositionCount: 1,
        reportPath: paths.paperReportPath,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/refresh-btc-240m-momentum-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--paper-report",
        paths.paperReportPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--input-observation",
        paths.observationPath,
        "--output-dir",
        join(directory, "reports"),
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /paper observation must include sourceObservationPath/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("BTC 240m refresh wrapper rejects a paper report scenario mismatch", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-refresh-scenario-mismatch-"));
  try {
    const paths = writeFixtures(directory);
    writeJson(paths.paperReportPath, {
      schemaVersion: "1.0.0",
      generatedAt: "2026-05-12T12:00:00.000Z",
      mode: "paper",
      processedEvents: 0,
      outcomes: [],
      latestSnapshots: {},
      scenarioMetadata: { strategyId: "btc_240m_momentum_public_v1" },
      suppressionSummary: {},
      portfolio: {
        cashAvailable: 10_000_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
      ledger: { decisions: [], orders: [], fills: [] },
      rejectLedger: { totalRejectedDecisions: 0, byMarket: {}, byReason: {}, entries: [] },
      reconciliation: {
        ok: true,
        mode: "paper",
        generatedAt: "2026-05-12T12:00:00.000Z",
        openOrders: [],
        openPositions: [],
        activeKillSwitch: false,
        reasons: [],
      },
      scenarioPath: join(directory, "other-observation.json"),
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/refresh-btc-240m-momentum-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--paper-report",
        paths.paperReportPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--input-observation",
        paths.observationPath,
        "--output-dir",
        join(directory, "reports"),
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /paper observation sourceObservationPath does not match paper report scenarioPath/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("BTC 240m refresh wrapper can write isolated min75 artifacts", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-refresh-min75-"));
  try {
    const paths = writeFixtures(directory);
    const outputDir = join(directory, "reports");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/refresh-btc-240m-momentum-readiness.js",
        "--benchmark",
        paths.benchmarkPath,
        "--paper-report",
        paths.paperReportPath,
        "--paper-observation",
        paths.paperObservationPath,
        "--input-observation",
        paths.observationPath,
        "--paper-reports-dir",
        join(directory, "paper-min75"),
        "--artifact-prefix",
        "btc-240m-momentum-min75",
        "--min-return-bps",
        "75",
        "--output-dir",
        outputDir,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      artifacts: {
        observationPath: string;
        latestReadinessPath: string;
      };
      summary: { paperReady: boolean };
    };
    assert.match(report.artifacts.observationPath, /btc-240m-momentum-min75-forward-observation/);
    assert.match(report.artifacts.latestReadinessPath, /btc-240m-momentum-min75-readiness-latest-refresh/);
    assert.equal(report.summary.paperReady, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
