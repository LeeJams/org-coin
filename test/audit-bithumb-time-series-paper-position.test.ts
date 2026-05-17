import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeFixture(
  path: string,
  generatedAt: string,
  sellDepth?: {
    levels: number;
    notionalKrw: number;
    coversRequestedNotional: boolean;
    worstPrice: number;
    vwapPrice: number;
    slippageBps: number;
  },
): void {
  writeFileSync(
    path,
    `${JSON.stringify({
      generatedAt,
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
        latestCandleAt: "2026-05-16T11:00:00.000Z",
        previousCandleAt: "2026-05-12T11:00:00.000Z",
        latestClose: 102_000_000,
        previousClose: 100_000_000,
        lookbackReturnBps: 200,
        riskValue: 160,
        directionalSignalPass: true,
        riskPass: true,
      },
      orderbook: {
        bestAsk: 102_010_000,
        bestBid: 102_000_000,
        bestAskSize: 0.02,
        bestBidSize: 0.02,
        spreadBps: 0.980392,
        sellDepth,
      },
      ticker: {
        tradePrice: 102_000_000,
        accTradePrice24h: 50_000_000_000,
      },
    })}\n`,
    "utf8",
  );
}

function safeRegistryId(signalId: string): string {
  return signalId.replace(/[^a-zA-Z0-9._-]/gu, "_");
}

function writePaperReport(path: string, scenarioPath?: string): void {
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      ...(scenarioPath ? { scenarioPath } : {}),
      generatedAt: "2026-05-12T12:00:00.000Z",
      mode: "paper",
      processedEvents: 2,
      outcomes: [],
      latestSnapshots: {},
      scenarioMetadata: {
        strategyId: "btc_240m_momentum_public_v1",
        entryProfile: "KRW-BTC_240m_momentum",
      },
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
      rejectLedger: {
        totalRejectedDecisions: 0,
        byMarket: {},
        byReason: {},
        entries: [],
      },
      reconciliation: {
        ok: true,
        mode: "paper",
        generatedAt: "2026-05-12T12:00:00.000Z",
        openOrders: [],
        openPositions: [],
        activeKillSwitch: false,
        reasons: [],
      },
    })}\n`,
    "utf8",
  );
}

function writeNoPositionPaperReport(path: string, scenarioPath?: string): void {
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      ...(scenarioPath ? { scenarioPath } : {}),
      generatedAt: "2026-05-12T12:00:00.000Z",
      mode: "paper",
      processedEvents: 1,
      outcomes: [],
      latestSnapshots: {},
      scenarioMetadata: {
        strategyId: "stable_60m_reversal_candidate_v1",
        entryProfile: "KRW-STABLE_60m_reversal",
      },
      suppressionSummary: {},
      portfolio: {
        cashAvailable: 10_000_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
      ledger: {
        decisions: [],
        orders: [],
        fills: [],
      },
      rejectLedger: {
        totalRejectedDecisions: 0,
        byMarket: {},
        byReason: {},
        entries: [],
      },
      reconciliation: {
        ok: true,
        mode: "paper",
        generatedAt: "2026-05-12T12:00:00.000Z",
        openOrders: [],
        openPositions: [],
        activeKillSwitch: false,
        reasons: [],
      },
    })}\n`,
    "utf8",
  );
}

function writePaperObservation(path: string, reportPath: string, sourceObservationPath?: string): void {
  writeFileSync(
    path,
    `${JSON.stringify({
      generatedAt: "2026-05-12T12:00:00.000Z",
      sourceObservationPath,
      paper: {
        attemptedSignal: false,
        acceptedSignals: 0,
        reconciliationOk: true,
        openPositionCount: 0,
        reportPath,
      },
    })}\n`,
    "utf8",
  );
}

test("paper position audit marks open position before hold window exit", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-audit-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const observationPath = join(directory, "observation.json");
    writePaperReport(paperReportPath);
    writeFixture(observationPath, "2026-05-13T12:00:00.000Z");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-paper-position.js",
        "--input-paper-report",
        paperReportPath,
        "--input-observation",
        observationPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(output) as {
      timing: { holdElapsed: boolean; holdExitDueAt: string };
      mark: { estimatedExitNetPnlKrw: number };
      exit: { attempted: boolean; reason: string };
    };

    assert.equal(report.timing.holdElapsed, false);
    assert.equal(report.timing.holdExitDueAt, "2026-05-16T11:00:00.000Z");
    assert.equal(report.mark.estimatedExitNetPnlKrw, 9796);
    assert.deepEqual(report.exit, {
      attempted: false,
      reason: "hold_window_not_elapsed",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("paper position audit marks exits with sell depth VWAP when available", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-depth-mark-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const observationPath = join(directory, "observation.json");
    writePaperReport(paperReportPath);
    writeFixture(observationPath, "2026-05-13T12:00:00.000Z", {
      levels: 2,
      notionalKrw: 500_000,
      coversRequestedNotional: true,
      worstPrice: 100_500_000,
      vwapPrice: 101_000_000,
      slippageBps: 98.039216,
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-paper-position.js",
        "--input-paper-report",
        paperReportPath,
        "--input-observation",
        observationPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(output) as {
      mark: {
        markBidPrice: number;
        markExitPrice: number;
        markPricingBasis: string;
        estimatedExitNetPnlKrw: number;
      };
    };

    assert.equal(report.mark.markBidPrice, 102_000_000);
    assert.equal(report.mark.markExitPrice, 101_000_000);
    assert.equal(report.mark.markPricingBasis, "sell_depth_vwap");
    assert.equal(report.mark.estimatedExitNetPnlKrw, 4798);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("paper position audit accepts a paper observation and reports no open position", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-no-open-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const paperObservationPath = join(directory, "paper-observation.json");
    const observationPath = join(directory, "observation.json");
    const outputPath = join(directory, "audit.json");
    writeNoPositionPaperReport(paperReportPath, observationPath);
    writeFixture(observationPath, "2026-05-13T12:00:00.000Z");
    writePaperObservation(paperObservationPath, paperReportPath, observationPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-paper-position.js",
        "--input-paper-observation",
        paperObservationPath,
        "--input-observation",
        observationPath,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      sourcePaperReportPath: string;
      sourcePaperObservationPath: string;
      timing: { holdElapsed: null; holdExitDueAt: null };
      mark: { estimatedExitNetPnlKrw: null; estimatedExitReturnPct: null };
      exit: {
        attempted: boolean;
        reason: string;
        reconciliationOk: boolean;
        openPositionCount: number;
      };
    };

    assert.equal(report.sourcePaperReportPath, paperReportPath);
    assert.equal(report.sourcePaperObservationPath, paperObservationPath);
    assert.equal(report.timing.holdElapsed, null);
    assert.equal(report.timing.holdExitDueAt, null);
    assert.deepEqual(report.mark, {
      estimatedExitNetPnlKrw: null,
      estimatedExitReturnPct: null,
    });
    assert.deepEqual(report.exit, {
      attempted: false,
      reason: "no_open_position",
      reconciliationOk: true,
      openPositionCount: 0,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("paper position audit records resolved report path from paper observation with open position", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-observation-open-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const paperObservationPath = join(directory, "paper-observation.json");
    const entryObservationPath = join(directory, "entry-observation.json");
    const observationPath = join(directory, "observation.json");
    writePaperReport(paperReportPath, entryObservationPath);
    writeFixture(entryObservationPath, "2026-05-12T12:00:00.000Z");
    writeFixture(observationPath, "2026-05-13T12:00:00.000Z");
    writePaperObservation(paperObservationPath, paperReportPath, entryObservationPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-paper-position.js",
        "--input-paper-observation",
        paperObservationPath,
        "--input-observation",
        observationPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(output) as {
      sourcePaperReportPath: string;
      sourcePaperObservationPath: string;
      mark: { estimatedExitNetPnlKrw: number };
    };

    assert.equal(report.sourcePaperReportPath, paperReportPath);
    assert.equal(report.sourcePaperObservationPath, paperObservationPath);
    assert.equal(report.mark.estimatedExitNetPnlKrw, 9796);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("paper position audit rejects a paper observation that does not match the paper report scenario", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-mismatch-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const paperObservationPath = join(directory, "paper-observation.json");
    const observationPath = join(directory, "observation.json");
    const entryObservationPath = join(directory, "entry-observation.json");
    const otherObservationPath = join(directory, "other-observation.json");
    writeNoPositionPaperReport(paperReportPath, otherObservationPath);
    writeFixture(entryObservationPath, "2026-05-12T12:00:00.000Z");
    writeFixture(observationPath, "2026-05-13T12:00:00.000Z");
    writePaperObservation(paperObservationPath, paperReportPath, entryObservationPath);

    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            "dist/src/cli/audit-bithumb-time-series-paper-position.js",
            "--input-paper-observation",
            paperObservationPath,
            "--input-observation",
            observationPath,
          ],
          { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
        ),
      /paper observation sourceObservationPath does not match paper report scenarioPath/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("paper position audit can execute a reduce-only exit after hold window", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-exit-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const observationPath = join(directory, "observation.json");
    const outputPath = join(directory, "audit.json");
    const reportsDir = join(directory, "paper-exit-reports");
    writePaperReport(paperReportPath);
    writeFixture(observationPath, "2026-05-16T12:00:00.000Z");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-paper-position.js",
        "--input-paper-report",
        paperReportPath,
        "--input-observation",
        observationPath,
        "--execute-exit-when-due",
        "--reports-dir",
        reportsDir,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      timing: { holdElapsed: boolean };
      exit: {
        attempted: boolean;
        reusedExistingExit: boolean;
        registryPath: string;
        reconciliationOk: boolean;
        openPositionCount: number;
        realizedExitNetPnlKrw: number;
        reportPath: string;
        ledgerPath: string;
      };
    };

    assert.equal(report.timing.holdElapsed, true);
    assert.equal(report.exit.attempted, true);
    assert.equal(report.exit.reusedExistingExit, false);
    assert.equal(existsSync(report.exit.registryPath), true);
    assert.equal(report.exit.reconciliationOk, true);
    assert.equal(report.exit.openPositionCount, 0);
    assert.equal(report.exit.realizedExitNetPnlKrw, 9750.618164);
    assert.equal(existsSync(report.exit.reportPath), true);
    assert.equal(existsSync(report.exit.ledgerPath), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("paper position audit reuses an existing reduce-only exit for the same entry", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-exit-once-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const observationPath = join(directory, "observation.json");
    const reportsDir = join(directory, "paper-exit-reports");
    writePaperReport(paperReportPath);
    writeFixture(observationPath, "2026-05-16T12:00:00.000Z");

    const command = [
      "dist/src/cli/audit-bithumb-time-series-paper-position.js",
      "--input-paper-report",
      paperReportPath,
      "--input-observation",
      observationPath,
      "--execute-exit-when-due",
      "--reports-dir",
      reportsDir,
    ];
    const first = JSON.parse(
      execFileSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" }),
    ) as {
      exit: {
        reusedExistingExit: boolean;
        reportPath: string;
        registryPath: string;
        realizedExitNetPnlKrw: number;
      };
    };
    const second = JSON.parse(
      execFileSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" }),
    ) as {
      exit: {
        reusedExistingExit: boolean;
        reportPath: string;
        registryPath: string;
        realizedExitNetPnlKrw: number;
      };
    };

    assert.equal(first.exit.reusedExistingExit, false);
    assert.equal(second.exit.reusedExistingExit, true);
    assert.equal(second.exit.reportPath, first.exit.reportPath);
    assert.equal(second.exit.registryPath, first.exit.registryPath);
    assert.equal(second.exit.realizedExitNetPnlKrw, first.exit.realizedExitNetPnlKrw);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("paper position audit regenerates an incomplete exit registry without realized PnL", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-position-exit-stale-"));
  try {
    const paperReportPath = join(directory, "paper-report.json");
    const observationPath = join(directory, "observation.json");
    const reportsDir = join(directory, "paper-exit-reports");
    const entrySignalId = "btc_240m_momentum_public_v1-KRW-BTC-2026-05-12T11:00:00.000Z";
    const registryDir = join(reportsDir, "exit-registry");
    const registryPath = join(registryDir, `${safeRegistryId(entrySignalId)}.json`);
    writePaperReport(paperReportPath);
    writeFixture(observationPath, "2026-05-16T12:00:00.000Z");
    mkdirSync(registryDir, { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify({
        schemaVersion: "1.0.0",
        sourceEntrySignalId: entrySignalId,
        firstObservedAt: "2026-05-16T11:30:00.000Z",
        reconciliationOk: true,
        openPositionCount: 0,
        reportPath: join(reportsDir, "old-report.json"),
      })}\n`,
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-time-series-paper-position.js",
        "--input-paper-report",
        paperReportPath,
        "--input-observation",
        observationPath,
        "--execute-exit-when-due",
        "--reports-dir",
        reportsDir,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(output) as {
      exit: {
        reusedExistingExit: boolean;
        realizedExitNetPnlKrw: number;
        registryPath: string;
      };
    };

    assert.equal(report.exit.reusedExistingExit, false);
    assert.equal(report.exit.realizedExitNetPnlKrw, 9750.618164);
    assert.equal(report.exit.registryPath, registryPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
