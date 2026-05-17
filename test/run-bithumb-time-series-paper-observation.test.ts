import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("time-series paper observation replays a viable candidate through paper risk and fill", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-paper-"));
  try {
    const observationPath = join(directory, "observation.json");
    writeFileSync(
      observationPath,
      `${JSON.stringify({
        generatedAt: "2026-05-12T12:00:00.000Z",
        candidate: {
          market: "KRW-BTC",
          signalMode: "momentum",
          unitMinutes: 240,
          lookbackBars: 24,
          holdBars: 24,
          minReturnBps: 25,
          minDropBps: 50,
          riskFilter: "rv24_below_p70",
          riskThreshold: 435.990666,
          notionalKrw: 500_000,
          expectedMedianEdgeBps: 15.690478,
        },
        signal: {
          active: true,
          latestCandleAt: "2026-05-12T11:00:00.000Z",
          previousCandleAt: "2026-05-08T11:00:00.000Z",
          latestClose: 100_000_000,
          previousClose: 99_000_000,
          lookbackReturnBps: 101.010101,
          riskValue: 164.073982,
          directionalSignalPass: true,
          riskPass: true,
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
      })}\n`,
      "utf8",
    );

    const outputPath = join(directory, "paper-observation.json");
    const reportsDir = join(directory, "paper-reports");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/run-bithumb-time-series-paper-observation.js",
        "--input-observation",
        observationPath,
        "--reports-dir",
        reportsDir,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      skippedReasons: string[];
      paper: {
        attemptedSignal: boolean;
        acceptedSignals: number;
        reconciliationOk: boolean;
        openPositionCount: number;
        reportPath: string;
        ledgerPath: string;
      };
    };

    assert.deepEqual(report.skippedReasons, []);
    assert.equal(report.paper.attemptedSignal, true);
    assert.equal(report.paper.acceptedSignals, 1);
    assert.equal(report.paper.reconciliationOk, true);
    assert.equal(report.paper.openPositionCount, 1);
    assert.equal(existsSync(report.paper.reportPath), true);
    assert.equal(existsSync(report.paper.ledgerPath), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series paper observation skips blocked observations without opening a position", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-paper-skip-"));
  try {
    const observationPath = join(directory, "observation.json");
    writeFileSync(
      observationPath,
      `${JSON.stringify({
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
          riskThreshold: 2071.713147,
          notionalKrw: 500_000,
          expectedMedianEdgeBps: 138.730159,
        },
        signal: {
          active: false,
          latestCandleAt: "2026-05-12T11:00:00.000Z",
          previousCandleAt: "2026-05-05T11:00:00.000Z",
          latestClose: 359,
          previousClose: 292,
          lookbackReturnBps: 2294.520548,
          riskValue: 2543.352601,
          directionalSignalPass: true,
          riskPass: false,
        },
        orderbook: {
          bestAsk: 359,
          bestBid: 358,
          bestAskSize: 22582.0219,
          bestBidSize: 70784.7574,
          spreadBps: 27.932961,
          buyDepth: {
            notionalKrw: 8_106_945.8621,
            coversRequestedNotional: true,
          },
          sellDepth: {
            notionalKrw: 25_340_943.1492,
            coversRequestedNotional: true,
          },
        },
        ticker: {
          tradePrice: 359,
          accTradePrice24h: 28_935_584_206.967567,
        },
        decision: {
          executionViability: "blocked_by_signal_or_execution_cost",
          reasons: ["risk_filter_failed"],
        },
      })}\n`,
      "utf8",
    );

    const outputPath = join(directory, "paper-observation.json");
    const reportsDir = join(directory, "paper-reports");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/run-bithumb-time-series-paper-observation.js",
        "--input-observation",
        observationPath,
        "--reports-dir",
        reportsDir,
        "--strategy-id",
        "krw_h_60m_momentum_top_candidate_v1",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      skippedReasons: string[];
      paper: {
        attemptedSignal: boolean;
        acceptedSignals: number;
        reconciliationOk: boolean;
        openPositionCount: number;
      };
    };

    assert.deepEqual(report.skippedReasons, [
      "risk_filter_failed",
      "observation_not_execution_viable",
    ]);
    assert.equal(report.paper.attemptedSignal, false);
    assert.equal(report.paper.acceptedSignals, 0);
    assert.equal(report.paper.reconciliationOk, true);
    assert.equal(report.paper.openPositionCount, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series paper observation does not require top sizes for inactive observations", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-paper-inactive-"));
  try {
    const observationPath = join(directory, "observation.json");
    writeFileSync(
      observationPath,
      `${JSON.stringify({
        generatedAt: "2026-05-13T08:56:15.832Z",
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
          notionalKrw: 500_000,
          expectedMedianEdgeBps: 39.37016,
        },
        signal: {
          active: false,
          latestCandleAt: "2026-05-13T08:00:00.000Z",
          previousCandleAt: "2026-05-12T08:00:00.000Z",
          latestClose: 55.74,
          previousClose: 54.17,
          lookbackReturnBps: 289.828318,
          riskValue: null,
          directionalSignalPass: false,
          riskPass: true,
        },
        orderbook: {
          bestAsk: 55.75,
          bestBid: 55.74,
          spreadBps: 1.793,
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
          tradePrice: 55.74,
          accTradePrice24h: 1_000_000_000,
        },
        decision: {
          executionViability: "blocked_by_signal_or_execution_cost",
          reasons: ["reversal_signal_inactive"],
        },
      })}\n`,
      "utf8",
    );

    const outputPath = join(directory, "paper-observation.json");
    const reportsDir = join(directory, "paper-reports");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/run-bithumb-time-series-paper-observation.js",
        "--input-observation",
        observationPath,
        "--reports-dir",
        reportsDir,
        "--strategy-id",
        "stable_60m_reversal_candidate_v1",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      skippedReasons: string[];
      paper: {
        attemptedSignal: boolean;
        acceptedSignals: number;
        reconciliationOk: boolean;
        openPositionCount: number;
      };
    };

    assert.deepEqual(report.skippedReasons, [
      "reversal_signal_inactive",
      "observation_not_execution_viable",
    ]);
    assert.equal(report.paper.attemptedSignal, false);
    assert.equal(report.paper.acceptedSignals, 0);
    assert.equal(report.paper.reconciliationOk, true);
    assert.equal(report.paper.openPositionCount, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series paper observation allows the candidate market in the paper universe", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-paper-alt-market-"));
  try {
    const observationPath = join(directory, "observation.json");
    writeFileSync(
      observationPath,
      `${JSON.stringify({
        generatedAt: "2026-05-13T09:22:47.996Z",
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
          notionalKrw: 500_000,
          expectedMedianEdgeBps: 39.37016,
        },
        signal: {
          active: true,
          latestCandleAt: "2026-05-13T09:00:00.000Z",
          previousCandleAt: "2026-05-12T09:00:00.000Z",
          latestClose: 55.63,
          previousClose: 56.31,
          lookbackReturnBps: -120.760078,
          riskValue: null,
          directionalSignalPass: true,
          riskPass: true,
        },
        orderbook: {
          bestAsk: 55.6,
          bestBid: 55.57,
          bestAskSize: 21070.327,
          bestBidSize: 9788.2945,
          spreadBps: 5.398,
          buyDepth: {
            notionalKrw: 500_000,
            coversRequestedNotional: true,
          },
          sellDepth: {
            notionalKrw: 500_000,
            coversRequestedNotional: true,
          },
        },
        ticker: {
          tradePrice: 55.63,
          accTradePrice24h: 50_000_000_000,
        },
        decision: {
          executionViability: "watch_candidate",
          reasons: [],
        },
      })}\n`,
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/run-bithumb-time-series-paper-observation.js",
        "--input-observation",
        observationPath,
        "--reports-dir",
        join(directory, "paper-reports"),
        "--strategy-id",
        "stable_60m_reversal_candidate_v1",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      paper: {
        attemptedSignal: boolean;
        acceptedSignals: number;
        openPositionCount: number;
      };
    };

    assert.equal(report.paper.attemptedSignal, true);
    assert.equal(report.paper.acceptedSignals, 1);
    assert.equal(report.paper.openPositionCount, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("time-series paper observation reports paper risk rejection reasons", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-time-series-paper-reject-reason-"));
  try {
    const observationPath = join(directory, "observation.json");
    writeFileSync(
      observationPath,
      `${JSON.stringify({
        generatedAt: "2026-05-13T09:22:47.996Z",
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
          notionalKrw: 500_000,
          expectedMedianEdgeBps: 39.37016,
        },
        signal: {
          active: true,
          latestCandleAt: "2026-05-13T09:00:00.000Z",
          previousCandleAt: "2026-05-12T09:00:00.000Z",
          latestClose: 55.63,
          previousClose: 56.31,
          lookbackReturnBps: -120.760078,
          riskValue: null,
          directionalSignalPass: true,
          riskPass: true,
        },
        orderbook: {
          bestAsk: 55.6,
          bestBid: 55.57,
          bestAskSize: 21070.327,
          bestBidSize: 9788.2945,
          spreadBps: 5.398,
          buyDepth: {
            notionalKrw: 500_000,
            coversRequestedNotional: true,
          },
          sellDepth: {
            notionalKrw: 500_000,
            coversRequestedNotional: true,
          },
        },
        ticker: {
          tradePrice: 55.63,
          accTradePrice24h: 4_159_349_446.001694,
        },
        decision: {
          executionViability: "watch_candidate",
          reasons: [],
        },
      })}\n`,
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/run-bithumb-time-series-paper-observation.js",
        "--input-observation",
        observationPath,
        "--reports-dir",
        join(directory, "paper-reports"),
        "--strategy-id",
        "stable_60m_reversal_candidate_v1",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      paper: {
        attemptedSignal: boolean;
        acceptedSignals: number;
        openPositionCount: number;
        rejectedSignalReasons: Array<{ code: string; detail: { min24hNotional: number } }>;
      };
    };

    assert.equal(report.paper.attemptedSignal, true);
    assert.equal(report.paper.acceptedSignals, 0);
    assert.equal(report.paper.openPositionCount, 0);
    assert.equal(report.paper.rejectedSignalReasons[0]?.code, "liquidity_guard_triggered");
    assert.equal(report.paper.rejectedSignalReasons[0]?.detail.min24hNotional, 30_000_000_000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
