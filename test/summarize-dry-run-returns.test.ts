import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("dry-run return summary can write the JSON to an artifact path", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-output-"));
  try {
    const reportsRoot = join(directory, "paper-sessions-offline-experiment");
    const outputPath = join(directory, "reports", "returns.json");
    mkdirSync(reportsRoot, { recursive: true });

    const stdout = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), JSON.parse(stdout));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary infers PM2 cycle log from known report roots", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-cycles-"));
  try {
    const reportsRoot = join(directory, "paper-sessions-btc-trend-hold-guarded");
    mkdirSync(reportsRoot, { recursive: true });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      source: {
        cyclesPath: string;
      };
    };

    assert.equal(
      summary.source.cyclesPath,
      join(
        process.cwd(),
        "var/log/dry-run-btc-trend-hold-guarded-service/cycles.ndjson",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary infers the PIEVERSE managed paper cycle log", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-pieverse-cycles-"));
  try {
    const reportsRoot = join(
      directory,
      "paper-sessions-pieverse-60m-reversal-lb168-managed",
    );
    mkdirSync(reportsRoot, { recursive: true });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      source: {
        cyclesPath: string;
      };
    };

    assert.equal(
      summary.source.cyclesPath,
      join(
        process.cwd(),
        "var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper/cycles.ndjson",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary does not attach unrelated cycle logs to unknown roots", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-no-cycles-"));
  try {
    const reportsRoot = join(directory, "paper-sessions-offline-experiment");
    mkdirSync(reportsRoot, { recursive: true });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      source: {
        cyclesPath: string | null;
      };
      cycleSummary: {
        evidenceAvailable: boolean;
        completionRate: number | null;
      };
      liveReadiness: {
        checks: {
          cycleCompletionRateOk: boolean;
          cycleRecoverySinceLatestFailureOk: boolean;
        };
        reasons: string[];
      };
    };

    assert.equal(summary.source.cyclesPath, null);
    assert.equal(summary.cycleSummary.evidenceAvailable, false);
    assert.equal(summary.cycleSummary.completionRate, null);
    assert.equal(summary.liveReadiness.checks.cycleCompletionRateOk, false);
    assert.equal(
      summary.liveReadiness.checks.cycleRecoverySinceLatestFailureOk,
      false,
    );
    assert.ok(
      summary.liveReadiness.reasons.includes(
        "cycle evidence unavailable for this report root",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary reports cycle failure diagnostics", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-cycle-diag-"));
  try {
    const reportsRoot = join(directory, "reports");
    const cyclesPath = join(directory, "cycles.ndjson");
    mkdirSync(reportsRoot, { recursive: true });
    writeFileSync(
      cyclesPath,
      [
        JSON.stringify({ event: "managed_dry_run_cycle_completed", cycle: 1 }),
        JSON.stringify({
          event: "managed_dry_run_cycle_completed",
          cycle: 1,
          startedAt: "2026-04-02T12:00:00.000Z",
          completedAt: "2026-04-02T12:03:00.000Z",
        }),
        JSON.stringify({
          event: "managed_dry_run_cycle_failed",
          cycle: 2,
          startedAt: "2026-04-02T12:01:00.000Z",
          failedAt: "2026-04-02T12:02:00.000Z",
          message: "invalid_paper_session_scenario",
          failureKind: "invalid_paper_session_scenario",
          command: {
            label: "scenario",
            status: 1,
            stdoutTail: ["[scenario] Traceback"],
            stderrTail: ["invalid_paper_session_scenario"],
            failureKind: "invalid_paper_session_scenario",
          },
        }),
        JSON.stringify({
          event: "managed_dry_run_cycle_completed",
          cycle: 3,
          startedAt: "2026-04-02T12:08:00.000Z",
          completedAt: "2026-04-02T12:11:00.000Z",
        }),
        JSON.stringify({
          event: "managed_dry_run_cycle_completed",
          cycle: 4,
          startedAt: "2026-04-02T12:16:00.000Z",
          completedAt: "2026-04-02T12:19:00.000Z",
        }),
      ].join("\n"),
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
        "--cycles-path",
        cyclesPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      cycleSummary: {
        completed: number;
        failed: number;
        completionRate: number;
        observedCycleIntervalSeconds: number | null;
        observedCycleIntervalSampleCount: number;
        observedCompletedCycleDurationSeconds: number | null;
        observedCompletedCycleDurationSampleCount: number;
        failureMessages: Record<string, number>;
        failureKinds: Record<string, number>;
        latestFailure: {
          cycle?: number;
          failedAt?: string;
          message: string;
          failureKind?: string;
          command?: {
            label?: string;
            status?: number;
            stderrTail?: string[];
          };
        } | null;
        consecutiveCompletedSinceLatestFailure: number;
      };
      liveReadiness: {
        checks: {
          cycleRecoverySinceLatestFailureOk: boolean;
        };
        reasons: string[];
      };
    };

    assert.equal(summary.cycleSummary.completed, 4);
    assert.equal(summary.cycleSummary.failed, 1);
    assert.equal(summary.cycleSummary.completionRate, 0.8);
    assert.equal(summary.cycleSummary.observedCycleIntervalSeconds, 480);
    assert.equal(summary.cycleSummary.observedCycleIntervalSampleCount, 2);
    assert.equal(summary.cycleSummary.observedCompletedCycleDurationSeconds, 180);
    assert.equal(
      summary.cycleSummary.observedCompletedCycleDurationSampleCount,
      3,
    );
    assert.equal(
      summary.cycleSummary.failureMessages.invalid_paper_session_scenario,
      1,
    );
    assert.equal(
      summary.cycleSummary.failureKinds.invalid_paper_session_scenario,
      1,
    );
    assert.equal(summary.cycleSummary.latestFailure?.cycle, 2);
    assert.equal(
      summary.cycleSummary.latestFailure?.failedAt,
      "2026-04-02T12:02:00.000Z",
    );
    assert.equal(
      summary.cycleSummary.latestFailure?.failureKind,
      "invalid_paper_session_scenario",
    );
    assert.equal(summary.cycleSummary.latestFailure?.command?.label, "scenario");
    assert.equal(summary.cycleSummary.latestFailure?.command?.status, 1);
    assert.equal(summary.cycleSummary.consecutiveCompletedSinceLatestFailure, 2);
    assert.equal(
      summary.liveReadiness.checks.cycleRecoverySinceLatestFailureOk,
      false,
    );
    assert.ok(
      summary.liveReadiness.reasons.some((reason) =>
        reason.includes("only 2 completed cycles since latest failure"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary infers legacy cycle failure kinds", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-legacy-cycle-kind-"));
  try {
    const reportsRoot = join(directory, "reports");
    const cyclesPath = join(directory, "cycles.ndjson");
    mkdirSync(reportsRoot, { recursive: true });
    writeFileSync(
      cyclesPath,
      [
        JSON.stringify({ event: "managed_dry_run_cycle_completed", cycle: 1 }),
        JSON.stringify({
          event: "managed_dry_run_cycle_failed",
          cycle: 2,
          failedAt: "2026-04-02T12:02:00.000Z",
          message: "scenario exited with status 1",
          command: {
            label: "scenario",
            status: 1,
            stderrTail: ["invalid_paper_session_scenario"],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
        "--cycles-path",
        cyclesPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      cycleSummary: {
        failureKinds: Record<string, number>;
        latestFailure: {
          failureKind?: string;
        } | null;
      };
    };

    assert.equal(
      summary.cycleSummary.failureKinds.invalid_paper_session_scenario,
      1,
    );
    assert.equal(
      summary.cycleSummary.latestFailure?.failureKind,
      "invalid_paper_session_scenario",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary keeps unclassified legacy command failures visible", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-unclassified-cycle-kind-"));
  try {
    const reportsRoot = join(directory, "reports");
    const cyclesPath = join(directory, "cycles.ndjson");
    mkdirSync(reportsRoot, { recursive: true });
    writeFileSync(
      cyclesPath,
      JSON.stringify({
        event: "managed_dry_run_cycle_failed",
        cycle: 1,
        failedAt: "2026-04-02T12:02:00.000Z",
        message: "scenario exited with status 1",
      }),
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
        "--cycles-path",
        cyclesPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      cycleSummary: {
        failureKinds: Record<string, number>;
        latestFailure: {
          failureKind?: string;
        } | null;
      };
    };

    assert.equal(summary.cycleSummary.failureKinds.unclassified_command_failure, 1);
    assert.equal(
      summary.cycleSummary.latestFailure?.failureKind,
      "unclassified_command_failure",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary reports avoided loss with positive sign", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-avoided-loss-"));
  try {
    const reportsRoot = join(directory, "reports");
    const sessionDir = join(reportsRoot, "session-negative-btc");
    mkdirSync(sessionDir, { recursive: true });
    const scenarioPath = join(sessionDir, "scenario.json");
    writeJson(scenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            bestAskPrice: 100,
            bestBidPrice: 99,
            lastTradePrice: 100,
          },
        },
      ],
    });
    writeJson(join(sessionDir, "report.json"), {
      generatedAt: "2026-04-02T12:00:00.000Z",
      sessionId: "session-negative-btc",
      scenarioPath,
      mode: "paper",
      latestSnapshots: {
        "KRW-BTC": {
          bestAskPrice: 91,
          bestBidPrice: 90,
          lastTradePrice: 90.5,
        },
      },
      portfolio: {
        cashAvailable: 100_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
      ledger: {
        decisions: [],
        fills: [],
        orders: [],
      },
      outcomes: [],
      rejectLedger: {
        totalRejectedDecisions: 0,
      },
      reconciliation: {
        ok: true,
      },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        sourceRunId: "legacy-run",
        modeIntent: "paper",
        syntheticExitPolicy: "carry_open",
        summary: {
          syntheticCloseCount: 0,
          signalCount: 0,
          entryEvaluationBucketCount: 0,
          entrySuppressedCandidateCount: 0,
          entryBlockedOpenPositionBucketCount: 0,
          entryBlockedAfterExitBucketCount: 0,
          entryBelowMinNotionalCount: 0,
          suppressedByReason: {},
        },
      },
    });

    const output = execFileSync(
      process.execPath,
      ["dist/src/cli/summarize-dry-run-returns.js", "--reports-root", reportsRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      btcTrendExposure: {
        negativeBenchmarkPnlKrw: number;
        strategyPnlInNegativeBenchmarkWindowsKrw: number;
        negativeWindowAvoidedLossKrw: number;
      };
    };

    assert.equal(summary.btcTrendExposure.negativeBenchmarkPnlKrw, -10_000);
    assert.equal(
      summary.btcTrendExposure.strategyPnlInNegativeBenchmarkWindowsKrw,
      0,
    );
    assert.equal(summary.btcTrendExposure.negativeWindowAvoidedLossKrw, 10_000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary separates profitable closed PnL from insufficient sample size", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-sample-gate-"));
  try {
    const reportsRoot = join(directory, "reports");
    const sessionDir = join(reportsRoot, "session-profitable");
    const cyclesPath = join(directory, "cycles.ndjson");
    mkdirSync(sessionDir, { recursive: true });
    const scenarioPath = join(sessionDir, "scenario.json");

    writeJson(scenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            bestAskPrice: 100_000_000,
            bestBidPrice: 100_000_000,
            lastTradePrice: 100_000_000,
          },
        },
        {
          type: "signal",
          signal: {
            side: "sell",
            reasonCodes: ["EXIT_TAKE_PROFIT"],
          },
        },
      ],
    });
    writeJson(join(sessionDir, "report.json"), {
      generatedAt: "2026-04-02T12:00:00.000Z",
      sessionId: "session-profitable",
      scenarioPath,
      mode: "paper",
      latestSnapshots: {
        "KRW-BTC": {
          bestAskPrice: 100_000_000,
          bestBidPrice: 100_000_000,
          lastTradePrice: 100_000_000,
        },
      },
      portfolio: {
        cashAvailable: 100_500,
        dailyRealizedPnl: 500,
        positions: {},
      },
      ledger: {
        decisions: [],
        fills: [
          {
            market: "KRW-BTC",
            side: "buy",
            quantity: 0.001,
            quoteNotional: 100_000,
            feesPaid: 0,
          },
          {
            market: "KRW-BTC",
            side: "sell",
            quantity: 0.001,
            quoteNotional: 100_500,
            feesPaid: 0,
          },
        ],
        orders: [
          {
            market: "KRW-BTC",
            side: "sell",
            status: "filled",
            requestedQuantity: 0.001,
            executedQuantity: 0.001,
            requestedQuoteNotional: 100_500,
            executedQuoteNotional: 100_500,
            feesPaid: 0,
          },
        ],
      },
      outcomes: [],
      rejectLedger: {
        totalRejectedDecisions: 0,
      },
      reconciliation: {
        ok: true,
      },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        sourceRunId: "legacy-run",
        modeIntent: "paper",
        syntheticExitPolicy: "carry_open",
        summary: {
          marketsTraded: ["KRW-BTC"],
          syntheticCloseCount: 0,
          signalCount: 1,
          entryEvaluationBucketCount: 1,
          entrySuppressedCandidateCount: 0,
          entryBlockedOpenPositionBucketCount: 0,
          entryBlockedAfterExitBucketCount: 0,
          entryBelowMinNotionalCount: 0,
          suppressedByReason: {},
        },
      },
    });
    writeFileSync(
      cyclesPath,
      `${JSON.stringify({ event: "managed_dry_run_cycle_completed" })}\n`,
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
        "--cycles-path",
        cyclesPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      liveReadiness: {
        checks: {
          minimumClosedTrades: boolean;
          positiveClosedTradePnl: boolean;
        };
        reasons: string[];
      };
      closedTradesOnly: {
        totalPnlKrw: number;
        closedTradeCount: number;
      };
    };

    assert.equal(summary.closedTradesOnly.totalPnlKrw, 500);
    assert.equal(summary.closedTradesOnly.closedTradeCount, 1);
    assert.equal(summary.liveReadiness.checks.minimumClosedTrades, false);
    assert.equal(summary.liveReadiness.checks.positiveClosedTradePnl, true);
    assert.ok(
      summary.liveReadiness.reasons.some((reason) =>
        reason.includes("closed trade count 1 is below 30"),
      ),
    );
    assert.equal(
      summary.liveReadiness.reasons.some((reason) =>
        reason.includes("closed-trade total PnL 500.000000 KRW is not positive"),
      ),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary blocks live readiness when strategy underperforms BTC hold", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-"));
  try {
    const reportsRoot = join(directory, "reports");
    const cyclesPath = join(directory, "cycles.ndjson");
    mkdirSync(reportsRoot, { recursive: true });

    const cycleLines: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      const sessionDir = join(reportsRoot, `session-${String(index).padStart(2, "0")}`);
      mkdirSync(sessionDir, { recursive: true });
      const scenarioPath = join(sessionDir, "scenario.json");
      const reportPath = join(sessionDir, "report.json");
      const generatedAt = `2026-04-02T12:${String(index).padStart(2, "0")}:00.000Z`;

      writeJson(scenarioPath, {
        schemaVersion: "1.0.0",
        events: [
          {
            type: "snapshot",
            snapshot: {
              market: "KRW-BTC",
              bestAskPrice: 100_000_000,
              bestBidPrice: 99_990_000,
              lastTradePrice: 100_000_000,
            },
          },
          {
            type: "signal",
            signal: {
              side: "sell",
              reasonCodes: ["EXIT_TAKE_PROFIT"],
            },
          },
        ],
      });
      writeJson(reportPath, {
        generatedAt,
        sessionId: `session-${index}`,
        scenarioPath,
        mode: "paper",
        latestSnapshots: {
          "KRW-BTC": {
            bestAskPrice: 121_000_000,
            bestBidPrice: 120_000_000,
            lastTradePrice: 120_500_000,
          },
        },
        portfolio: {
          cashAvailable: 101_000,
          dailyRealizedPnl: 1_000,
          positions: {},
        },
        ledger: {
          decisions: [],
          fills: [
            {
              market: "KRW-BTC",
              side: "buy",
              quantity: 0.001,
              quoteNotional: 100_000,
              feesPaid: 0,
            },
            {
              market: "KRW-BTC",
              side: "sell",
              quantity: 0.001,
              quoteNotional: 101_000,
              feesPaid: 0,
            },
          ],
          orders: [
            {
              market: "KRW-BTC",
              side: "sell",
              status: "filled",
              requestedQuantity: 0.001,
              executedQuantity: 0.001,
              requestedQuoteNotional: 101_000,
              executedQuoteNotional: 101_000,
              feesPaid: 0,
            },
          ],
        },
        outcomes: [
          {
            type: "signal",
            decision: {
              order: {
                side: "sell",
                signalId: `session-${index}-sell`,
              },
            },
          },
        ],
        rejectLedger: {
          totalRejectedDecisions: 0,
        },
        reconciliation: {
          ok: true,
        },
        scenarioMetadata: {
          initialCashKrw: 100_000,
          initialEquityKrw: 100_000,
          modeIntent: "paper",
          syntheticExitPolicy: "carry_open",
          summary: {
            marketsTraded: ["KRW-BTC"],
            syntheticCloseCount: 0,
            signalCount: 2,
            entryEvaluationBucketCount: 1,
            entrySuppressedCandidateCount: 0,
            entryBlockedOpenPositionBucketCount: 0,
            entryBlockedAfterExitBucketCount: 0,
            entryBelowMinNotionalCount: 0,
            suppressedByReason: {},
          },
        },
      });
      cycleLines.push(
        JSON.stringify({
          event: "managed_dry_run_cycle_completed",
          sessionId: `session-${index}`,
        }),
      );
    }
    writeFileSync(cyclesPath, `${cycleLines.join("\n")}\n`, "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
        "--cycles-path",
        cyclesPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      btcBuyHoldBenchmark: {
        totalExcessPnlKrw: number;
        missingBenchmarkSessionCount: number;
      };
      btcTrendExposure: {
        experimentType: string;
        positiveBenchmarkSessionCount: number;
        positiveWindowCaptureRatio: number | null;
        positiveWindowExitReasonCounts: Record<string, number>;
        positiveWindowNoFillSessionCount: number;
      };
      exitQuality: {
        exitReasonBenchmarkComparison: Record<
          string,
          {
            totalExcessPnlKrw: number;
            positiveBenchmarkSessionCount: number;
          }
        >;
      };
      strategyAssessment: {
        classification: string;
      };
      liveReadiness: {
        paperOnlyRecommended: boolean;
        checks: {
          minimumClosedTrades: boolean;
          positiveTradedPnl: boolean;
          beatsBtcBuyAndHold: boolean;
          positiveMedianExcessReturn: boolean;
        };
        reasons: string[];
      };
    };

    assert.equal(summary.liveReadiness.checks.minimumClosedTrades, true);
    assert.equal(summary.liveReadiness.checks.positiveTradedPnl, true);
    assert.equal(summary.btcBuyHoldBenchmark.missingBenchmarkSessionCount, 0);
    assert.equal(summary.liveReadiness.checks.beatsBtcBuyAndHold, false);
    assert.equal(summary.liveReadiness.checks.positiveMedianExcessReturn, false);
    assert.equal(summary.liveReadiness.paperOnlyRecommended, true);
    assert.equal(summary.strategyAssessment.classification, "discard_candidate");
    assert.ok(summary.btcBuyHoldBenchmark.totalExcessPnlKrw < 0);
    assert.equal(
      summary.btcTrendExposure.experimentType,
      "diagnostic_opportunity_measurement_not_strategy_pnl",
    );
    assert.equal(summary.btcTrendExposure.positiveBenchmarkSessionCount, 30);
    assert.equal(summary.btcTrendExposure.positiveWindowNoFillSessionCount, 0);
    assert.equal(summary.btcTrendExposure.positiveWindowExitReasonCounts.EXIT_TAKE_PROFIT, 30);
    assert.ok((summary.btcTrendExposure.positiveWindowCaptureRatio ?? 0) < 1);
    assert.ok(
      summary.exitQuality.exitReasonBenchmarkComparison.EXIT_TAKE_PROFIT
        .totalExcessPnlKrw < 0,
    );
    assert.equal(
      summary.exitQuality.exitReasonBenchmarkComparison.EXIT_TAKE_PROFIT
        .positiveBenchmarkSessionCount,
      30,
    );
    assert.ok(
      summary.liveReadiness.reasons.some((reason) =>
        reason.includes("strategy excess PnL versus BTC buy-and-hold"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary does not let untraded benchmark gaps permanently block promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-untraded-benchmark-"));
  try {
    const reportsRoot = join(directory, "reports");
    mkdirSync(reportsRoot, { recursive: true });

    const flatSessionDir = join(reportsRoot, "session-flat");
    mkdirSync(flatSessionDir, { recursive: true });
    const flatScenarioPath = join(flatSessionDir, "scenario.json");
    writeJson(flatScenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-PIEVERSE",
            bestAskPrice: 1_200,
            bestBidPrice: 1_199,
            lastTradePrice: 1_200,
          },
        },
      ],
    });
    writeJson(join(flatSessionDir, "report.json"), {
      generatedAt: "2026-04-02T12:00:00.000Z",
      sessionId: "flat",
      scenarioPath: flatScenarioPath,
      mode: "paper",
      latestSnapshots: {
        "KRW-PIEVERSE": {
          bestAskPrice: 1_200,
          bestBidPrice: 1_199,
          lastTradePrice: 1_200,
        },
      },
      portfolio: {
        cashAvailable: 100_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
      ledger: { decisions: [], fills: [], orders: [] },
      outcomes: [],
      rejectLedger: { totalRejectedDecisions: 0 },
      reconciliation: { ok: true },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        modeIntent: "paper",
        summary: {
          marketsTraded: [],
          syntheticCloseCount: 0,
          signalCount: 0,
          suppressedByReason: { signal_inactive: 1 },
        },
      },
    });

    const tradedSessionDir = join(reportsRoot, "session-traded");
    mkdirSync(tradedSessionDir, { recursive: true });
    const tradedScenarioPath = join(tradedSessionDir, "scenario.json");
    writeJson(tradedScenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            bestAskPrice: 100_000_000,
            bestBidPrice: 99_990_000,
            lastTradePrice: 100_000_000,
          },
        },
        {
          type: "signal",
          signal: {
            side: "sell",
            reasonCodes: ["TIME_SERIES_HOLD_EXIT"],
          },
        },
      ],
    });
    writeJson(join(tradedSessionDir, "report.json"), {
      generatedAt: "2026-04-02T12:05:00.000Z",
      sessionId: "traded",
      scenarioPath: tradedScenarioPath,
      mode: "paper",
      latestSnapshots: {
        "KRW-BTC": {
          bestAskPrice: 99_500_000,
          bestBidPrice: 99_400_000,
          lastTradePrice: 99_450_000,
        },
      },
      portfolio: {
        cashAvailable: 100_500,
        dailyRealizedPnl: 500,
        positions: {},
      },
      ledger: {
        decisions: [],
        fills: [
          {
            market: "KRW-PIEVERSE",
            side: "buy",
            quantity: 80,
            quoteNotional: 100_000,
            feesPaid: 0,
          },
          {
            market: "KRW-PIEVERSE",
            side: "sell",
            quantity: 80,
            quoteNotional: 100_500,
            feesPaid: 0,
          },
        ],
        orders: [
          {
            market: "KRW-PIEVERSE",
            side: "sell",
            status: "filled",
            requestedQuantity: 80,
            executedQuantity: 80,
            requestedQuoteNotional: 100_500,
            executedQuoteNotional: 100_500,
            feesPaid: 0,
          },
        ],
      },
      outcomes: [
        {
          type: "signal",
          decision: {
            order: {
              side: "sell",
              signalId: "traded-sell",
            },
          },
        },
      ],
      rejectLedger: { totalRejectedDecisions: 0 },
      reconciliation: { ok: true },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        modeIntent: "paper",
        summary: {
          marketsTraded: ["KRW-PIEVERSE"],
          syntheticCloseCount: 0,
          signalCount: 2,
          suppressedByReason: {},
        },
      },
    });

    const output = execFileSync(
      process.execPath,
      ["dist/src/cli/summarize-dry-run-returns.js", "--reports-root", reportsRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      promotionBtcBuyHoldBenchmark: { missingBenchmarkSessionCount: number };
      strategyAssessment: { classification: string };
      liveReadiness: {
        checks: { btcBuyHoldBenchmarkAvailable: boolean };
        reasons: string[];
      };
    };

    assert.equal(
      summary.promotionBtcBuyHoldBenchmark.missingBenchmarkSessionCount,
      0,
    );
    assert.equal(summary.liveReadiness.checks.btcBuyHoldBenchmarkAvailable, true);
    assert.equal(summary.strategyAssessment.classification, "paper_candidate");
    assert.equal(
      summary.liveReadiness.reasons.some((reason) =>
        reason.includes("BTC buy-and-hold benchmark unavailable"),
      ),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary keeps exit reasons embedded in report outcomes", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-outcome-reason-"));
  try {
    const reportsRoot = join(directory, "reports");
    const sessionDir = join(reportsRoot, "session-outcome-reason");
    const reportPath = join(sessionDir, "report.json");
    mkdirSync(sessionDir, { recursive: true });

    writeJson(reportPath, {
      generatedAt: "2026-04-02T12:00:00.000Z",
      sessionId: "session-outcome-reason",
      scenarioPath: join(sessionDir, "missing-scenario.json"),
      mode: "paper",
      latestSnapshots: {
        "KRW-BTC": {
          bestAskPrice: 100_000_000,
          bestBidPrice: 99_900_000,
          lastTradePrice: 99_950_000,
        },
      },
      portfolio: {
        cashAvailable: 99_000,
        dailyRealizedPnl: -1_000,
        positions: {},
      },
      ledger: {
        decisions: [],
        fills: [
          {
            market: "KRW-BTC",
            side: "sell",
            quantity: 0.001,
            quoteNotional: 99_000,
            feesPaid: 0,
          },
        ],
        orders: [
          {
            market: "KRW-BTC",
            side: "sell",
            status: "filled",
            requestedQuantity: 0.001,
            executedQuantity: 0.001,
            requestedQuoteNotional: 99_000,
            executedQuoteNotional: 99_000,
            feesPaid: 0,
          },
        ],
      },
      outcomes: [
        {
          type: "signal",
          signal: {
            side: "sell",
            reasonCodes: ["EXIT_TIME_STOP_15M"],
          },
          decision: {
            order: {
              side: "sell",
              signalId: "session-outcome-reason-sell",
            },
          },
        },
      ],
      rejectLedger: {
        totalRejectedDecisions: 0,
      },
      reconciliation: {
        ok: true,
      },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        sourceRunId: "legacy-run",
        modeIntent: "paper",
        syntheticExitPolicy: "carry_open",
        summary: {
          marketsTraded: ["KRW-BTC"],
          syntheticCloseCount: 0,
          signalCount: 1,
          entryEvaluationBucketCount: 1,
          entrySuppressedCandidateCount: 0,
          entryBlockedOpenPositionBucketCount: 0,
          entryBlockedAfterExitBucketCount: 1,
          entryBelowMinNotionalCount: 0,
          suppressedByReason: {},
        },
      },
    });

    const output = execFileSync(
      process.execPath,
      ["dist/src/cli/summarize-dry-run-returns.js", "--reports-root", reportsRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      exitQuality: {
        exitReasonCounts: Record<string, number>;
        exitReasonProfitability: Record<string, { totalPnlKrw: number }>;
        exitAttribution: {
          missingExitReasonSessionCount: number;
          missingExitReasonPnlKrw: number;
        };
      };
      lossCauseExperiments: {
        timeStopExit: {
          affected: { sessionCount: number; totalPnlKrw: number };
        };
      };
    };

    assert.equal(summary.exitQuality.exitReasonCounts.EXIT_TIME_STOP_15M, 1);
    assert.equal(
      summary.exitQuality.exitReasonProfitability.EXIT_TIME_STOP_15M.totalPnlKrw,
      -1_000,
    );
    assert.equal(summary.lossCauseExperiments.timeStopExit.affected.sessionCount, 1);
    assert.equal(summary.lossCauseExperiments.timeStopExit.affected.totalPnlKrw, -1_000);
    assert.equal(summary.exitQuality.exitAttribution.missingExitReasonSessionCount, 0);
    assert.equal(summary.exitQuality.exitAttribution.missingExitReasonPnlKrw, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary exposes unattributed sell fills", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-missing-exit-reason-"));
  try {
    const reportsRoot = join(directory, "reports");
    const sessionDir = join(reportsRoot, "session-missing-exit-reason");
    const reportPath = join(sessionDir, "report.json");
    mkdirSync(sessionDir, { recursive: true });

    writeJson(reportPath, {
      generatedAt: "2026-04-02T12:00:00.000Z",
      sessionId: "session-missing-exit-reason",
      mode: "paper",
      latestSnapshots: {
        "KRW-BTC": {
          bestAskPrice: 100_000_000,
          bestBidPrice: 99_900_000,
          lastTradePrice: 99_950_000,
        },
      },
      portfolio: {
        cashAvailable: 99_000,
        dailyRealizedPnl: -1_000,
        positions: {},
      },
      ledger: {
        decisions: [],
        fills: [
          {
            market: "KRW-BTC",
            side: "sell",
            quantity: 0.001,
            quoteNotional: 99_000,
            feesPaid: 0,
          },
        ],
        orders: [
          {
            market: "KRW-BTC",
            side: "sell",
            status: "filled",
            requestedQuantity: 0.001,
            executedQuantity: 0.001,
            requestedQuoteNotional: 99_000,
            executedQuoteNotional: 99_000,
            feesPaid: 0,
          },
        ],
      },
      outcomes: [
        {
          type: "signal",
          signalId: "legacy-sell",
          decision: {
            order: {
              side: "sell",
              signalId: "legacy-sell",
            },
          },
        },
      ],
      rejectLedger: {
        totalRejectedDecisions: 0,
      },
      reconciliation: {
        ok: true,
      },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        sourceRunId: "legacy-run",
        modeIntent: "paper",
        syntheticExitPolicy: "carry_open",
        summary: {
          marketsTraded: ["KRW-BTC"],
          syntheticCloseCount: 0,
          signalCount: 1,
          entryEvaluationBucketCount: 1,
          entrySuppressedCandidateCount: 0,
          entryBlockedOpenPositionBucketCount: 0,
          entryBlockedAfterExitBucketCount: 1,
          entryBelowMinNotionalCount: 0,
          suppressedByReason: {},
        },
      },
    });

    const output = execFileSync(
      process.execPath,
      ["dist/src/cli/summarize-dry-run-returns.js", "--reports-root", reportsRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      exitQuality: {
        exitReasonCounts: Record<string, number>;
        exitAttribution: {
          sellFillSessionCount: number;
          attributedExitReasonSessionCount: number;
          missingExitReasonSessionCount: number;
          missingExitReasonSellFillCount: number;
          missingExitReasonPnlKrw: number;
          missingExitReasonSessions: Array<{
            sessionId: string;
            sourceRunId: string | null;
            reportPath: string;
            scenarioPath: string | null;
            sellFillCount: number;
            sellFillQuoteNotionalKrw: number;
            markedPnlKrw: number;
            exitSignalIds: string[];
          }>;
        };
      };
      liveReadiness: {
        checks: {
          noMissingExitReasonAttribution: boolean;
        };
        reasons: string[];
      };
    };

    assert.equal(summary.exitQuality.exitReasonCounts.UNKNOWN_EXIT_REASON, 1);
    assert.equal(summary.exitQuality.exitAttribution.sellFillSessionCount, 1);
    assert.equal(
      summary.exitQuality.exitAttribution.attributedExitReasonSessionCount,
      0,
    );
    assert.equal(
      summary.exitQuality.exitAttribution.missingExitReasonSessionCount,
      1,
    );
    assert.equal(
      summary.exitQuality.exitAttribution.missingExitReasonSellFillCount,
      1,
    );
    assert.equal(summary.exitQuality.exitAttribution.missingExitReasonPnlKrw, -1_000);
    assert.deepEqual(
      summary.exitQuality.exitAttribution.missingExitReasonSessions,
      [
        {
          generatedAt: "2026-04-02T12:00:00.000Z",
          sessionId: "session-missing-exit-reason",
          sourceRunId: "legacy-run",
          reportPath,
          scenarioPath: null,
          sellFillCount: 1,
          sellFillQuoteNotionalKrw: 99_000,
          markedPnlKrw: -1_000,
          exitSignalIds: ["legacy-sell"],
        },
      ],
    );
    assert.equal(
      summary.liveReadiness.checks.noMissingExitReasonAttribution,
      false,
    );
    assert.ok(
      summary.liveReadiness.reasons.some((reason) =>
        reason.includes("sell-fill sessions are missing exit reason attribution"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary decomposes BTC benchmark windows by suppression", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-positive-suppression-"));
  try {
    const reportsRoot = join(directory, "reports");
    mkdirSync(reportsRoot, { recursive: true });

    const suppressionRows = [
      {
        sessionId: "positive-weak",
        generatedAt: "2026-04-02T12:00:00.000Z",
        entryEvaluationBucketCount: 2,
        entrySuppressedCandidateCount: 2,
        entryBlockedOpenPositionBucketCount: 0,
        entryBlockedAfterExitBucketCount: 0,
        suppressedByReason: { SUPPRESS_WEAK_CONFLUENCE: 2 },
        entrySuppressedByGateFailure: { ret_5m_bps: 2 },
        entrySuppressedGateFailureCombinations: { ret_5m_bps: 2 },
        entrySuppressedGateFailureStats: {
          ret_5m_bps: {
            count: 2,
            avgActual: 9,
            avgThreshold: 16,
            avgDeficit: 7,
            maxDeficit: 8,
            nearMissCount: 1,
            nearMissRate: 0.5,
          },
        },
      },
      {
        sessionId: "positive-stale",
        generatedAt: "2026-04-02T12:01:00.000Z",
        entryEvaluationBucketCount: 3,
        entrySuppressedCandidateCount: 3,
        entryBlockedOpenPositionBucketCount: 0,
        entryBlockedAfterExitBucketCount: 0,
        suppressedByReason: {
          SUPPRESS_WEAK_CONFLUENCE: 2,
          SUPPRESS_DATA_STALE: 1,
        },
        entrySuppressedByGateFailure: {
          ret_5m_bps: 2,
          window_coverage_sec: 1,
        },
        entrySuppressedGateFailureCombinations: {
          ret_5m_bps: 1,
          "ret_5m_bps+window_coverage_sec": 1,
        },
        entrySuppressedGateFailureStats: {
          ret_5m_bps: {
            count: 2,
            avgActual: 10,
            avgThreshold: 16,
            avgDeficit: 6,
            maxDeficit: 7,
            nearMissCount: 0,
            nearMissRate: 0,
          },
          window_coverage_sec: {
            count: 1,
            avgActual: 50,
            avgThreshold: 55,
            avgDeficit: 5,
            maxDeficit: 5,
            nearMissCount: 1,
            nearMissRate: 1,
          },
        },
      },
      {
        sessionId: "positive-blocked",
        generatedAt: "2026-04-02T12:02:00.000Z",
        entryEvaluationBucketCount: 1,
        entrySuppressedCandidateCount: 0,
        entryBlockedOpenPositionBucketCount: 1,
        entryBlockedAfterExitBucketCount: 2,
        suppressedByReason: {},
        entrySuppressedByGateFailure: {},
        entrySuppressedGateFailureCombinations: {},
        entrySuppressedGateFailureStats: {},
      },
      {
        sessionId: "negative-stale",
        generatedAt: "2026-04-02T12:03:00.000Z",
        endingBestBidPrice: 99_000_000,
        entryEvaluationBucketCount: 4,
        entrySuppressedCandidateCount: 4,
        entryBlockedOpenPositionBucketCount: 0,
        entryBlockedAfterExitBucketCount: 1,
        suppressedByReason: {
          SUPPRESS_DATA_STALE: 3,
          SUPPRESS_WEAK_CONFLUENCE: 1,
        },
        entrySuppressedByGateFailure: {
          window_coverage_sec: 3,
          depth_ratio_l5: 1,
        },
        entrySuppressedGateFailureCombinations: {
          window_coverage_sec: 3,
          "depth_ratio_l5+window_coverage_sec": 1,
        },
        entrySuppressedGateFailureStats: {
          window_coverage_sec: {
            count: 3,
            avgActual: 45,
            avgThreshold: 55,
            avgDeficit: 10,
            maxDeficit: 12,
            nearMissCount: 1,
            nearMissRate: 1 / 3,
          },
          depth_ratio_l5: {
            count: 1,
            avgActual: 0.8,
            avgThreshold: 1.1,
            avgDeficit: 0.3,
            maxDeficit: 0.3,
            nearMissCount: 0,
            nearMissRate: 0,
          },
        },
      },
    ];

    for (const row of suppressionRows) {
      const sessionDir = join(reportsRoot, row.sessionId);
      mkdirSync(sessionDir, { recursive: true });
      const scenarioPath = join(sessionDir, "scenario.json");
      writeJson(scenarioPath, {
        schemaVersion: "1.0.0",
        events: [
          {
            type: "snapshot",
            snapshot: {
              market: "KRW-BTC",
              bestAskPrice: 100_000_000,
              bestBidPrice: 99_990_000,
              lastTradePrice: 100_000_000,
            },
          },
        ],
      });
      writeJson(join(sessionDir, "report.json"), {
        generatedAt: row.generatedAt,
        sessionId: row.sessionId,
        scenarioPath,
        mode: "paper",
        latestSnapshots: {
          "KRW-BTC": {
            bestAskPrice: (row.endingBestBidPrice ?? 101_000_000) + 10_000,
            bestBidPrice: row.endingBestBidPrice ?? 101_000_000,
            lastTradePrice: (row.endingBestBidPrice ?? 101_000_000) + 5_000,
          },
        },
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {},
        },
        ledger: {
          decisions: [],
          fills: [],
          orders: [],
        },
        outcomes: [],
        rejectLedger: {
          totalRejectedDecisions: 0,
        },
        reconciliation: {
          ok: true,
        },
        scenarioMetadata: {
          initialCashKrw: 100_000,
          initialEquityKrw: 100_000,
          modeIntent: "paper",
          syntheticExitPolicy: "carry_open",
          summary: {
            marketsTraded: [],
            syntheticCloseCount: 0,
            signalCount: 0,
            entryEvaluationBucketCount: row.entryEvaluationBucketCount,
            entrySuppressedCandidateCount: row.entrySuppressedCandidateCount,
            entryBlockedOpenPositionBucketCount:
              row.entryBlockedOpenPositionBucketCount,
            entryBlockedAfterExitBucketCount: row.entryBlockedAfterExitBucketCount,
            entryBelowMinNotionalCount: 0,
            suppressedByReason: row.suppressedByReason,
            entrySuppressedByGateFailure: row.entrySuppressedByGateFailure,
            entrySuppressedGateFailureCombinations:
              row.entrySuppressedGateFailureCombinations,
            entrySuppressedGateFailureStats: row.entrySuppressedGateFailureStats,
          },
        },
      });
    }

    const output = execFileSync(
      process.execPath,
      ["dist/src/cli/summarize-dry-run-returns.js", "--reports-root", reportsRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      btcTrendExposure: {
        positiveBenchmarkSessionCount: number;
        positiveWindowNoSignalSessionCount: number;
        positiveWindowNoFillSessionCount: number;
        positiveWindowEntryEvaluationBucketCount: number;
        positiveWindowEntrySuppressedCandidateCount: number;
        positiveWindowEntryBlockedOpenPositionBucketCount: number;
        positiveWindowEntryBlockedAfterExitBucketCount: number;
        positiveWindowSuppressionCounts: Record<string, number>;
        positiveWindowNoSignalSuppressionCounts: Record<string, number>;
        positiveWindowNoFillSuppressionCounts: Record<string, number>;
        positiveWindowSuppressedByGateFailure: Record<string, number>;
        positiveWindowNoSignalSuppressedByGateFailure: Record<string, number>;
        positiveWindowNoFillSuppressedByGateFailure: Record<string, number>;
        positiveWindowGateFailureCombinations: Record<string, number>;
        positiveWindowGateFailureStats: Record<
          string,
          {
            count: number;
            avgActual: number;
            avgThreshold: number;
            avgDeficit: number;
            maxDeficit: number;
            nearMissCount?: number;
            nearMissRate?: number;
          }
        >;
        negativeBenchmarkSessionCount: number;
        negativeWindowAvoidedLossKrw: number;
        negativeWindowAvoidedLossRatio: number | null;
        negativeWindowNoSignalSessionCount: number;
        negativeWindowNoFillSessionCount: number;
        negativeWindowEntryEvaluationBucketCount: number;
        negativeWindowEntrySuppressedCandidateCount: number;
        negativeWindowEntryBlockedAfterExitBucketCount: number;
        negativeWindowSuppressionCounts: Record<string, number>;
        negativeWindowNoSignalSuppressionCounts: Record<string, number>;
        negativeWindowNoFillSuppressionCounts: Record<string, number>;
        negativeWindowSuppressedByGateFailure: Record<string, number>;
        negativeWindowNoSignalSuppressedByGateFailure: Record<string, number>;
        negativeWindowNoFillSuppressedByGateFailure: Record<string, number>;
        negativeWindowGateFailureCombinations: Record<string, number>;
        negativeWindowGateFailureStats: Record<
          string,
          {
            count: number;
            avgActual: number;
            avgThreshold: number;
            avgDeficit: number;
            maxDeficit: number;
            nearMissCount?: number;
            nearMissRate?: number;
          }
        >;
      };
    };

    assert.equal(summary.btcTrendExposure.positiveBenchmarkSessionCount, 3);
    assert.equal(summary.btcTrendExposure.positiveWindowNoSignalSessionCount, 3);
    assert.equal(summary.btcTrendExposure.positiveWindowNoFillSessionCount, 3);
    assert.equal(
      summary.btcTrendExposure.positiveWindowEntryEvaluationBucketCount,
      6,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowEntrySuppressedCandidateCount,
      5,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowEntryBlockedOpenPositionBucketCount,
      1,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowEntryBlockedAfterExitBucketCount,
      2,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowSuppressionCounts
        .SUPPRESS_WEAK_CONFLUENCE,
      4,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowSuppressionCounts
        .SUPPRESS_DATA_STALE,
      1,
    );
    assert.deepEqual(
      summary.btcTrendExposure.positiveWindowNoSignalSuppressionCounts,
      summary.btcTrendExposure.positiveWindowSuppressionCounts,
    );
    assert.deepEqual(
      summary.btcTrendExposure.positiveWindowNoFillSuppressionCounts,
      summary.btcTrendExposure.positiveWindowSuppressionCounts,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowSuppressedByGateFailure.ret_5m_bps,
      4,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowSuppressedByGateFailure
        .window_coverage_sec,
      1,
    );
    assert.deepEqual(
      summary.btcTrendExposure.positiveWindowNoSignalSuppressedByGateFailure,
      summary.btcTrendExposure.positiveWindowSuppressedByGateFailure,
    );
    assert.deepEqual(
      summary.btcTrendExposure.positiveWindowNoFillSuppressedByGateFailure,
      summary.btcTrendExposure.positiveWindowSuppressedByGateFailure,
    );
    assert.deepEqual(
      summary.btcTrendExposure.positiveWindowGateFailureCombinations,
      {
        ret_5m_bps: 3,
        "ret_5m_bps+window_coverage_sec": 1,
      },
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowGateFailureStats.ret_5m_bps.count,
      4,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowGateFailureStats.ret_5m_bps
        .avgActual,
      9.5,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowGateFailureStats.ret_5m_bps
        .avgDeficit,
      6.5,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowGateFailureStats.window_coverage_sec
        .maxDeficit,
      5,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowGateFailureStats.ret_5m_bps
        .nearMissCount,
      1,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowGateFailureStats.ret_5m_bps
        .nearMissRate,
      0.25,
    );
    assert.equal(
      summary.btcTrendExposure.positiveWindowGateFailureStats.window_coverage_sec
        .nearMissRate,
      1,
    );
    assert.equal(summary.btcTrendExposure.negativeBenchmarkSessionCount, 1);
    assert.equal(summary.btcTrendExposure.negativeWindowNoSignalSessionCount, 1);
    assert.equal(summary.btcTrendExposure.negativeWindowNoFillSessionCount, 1);
    assert.equal(
      summary.btcTrendExposure.negativeWindowEntryEvaluationBucketCount,
      4,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowEntrySuppressedCandidateCount,
      4,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowEntryBlockedAfterExitBucketCount,
      1,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowSuppressionCounts.SUPPRESS_DATA_STALE,
      3,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowSuppressionCounts
        .SUPPRESS_WEAK_CONFLUENCE,
      1,
    );
    assert.deepEqual(
      summary.btcTrendExposure.negativeWindowNoSignalSuppressionCounts,
      summary.btcTrendExposure.negativeWindowSuppressionCounts,
    );
    assert.deepEqual(
      summary.btcTrendExposure.negativeWindowNoFillSuppressionCounts,
      summary.btcTrendExposure.negativeWindowSuppressionCounts,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowSuppressedByGateFailure
        .window_coverage_sec,
      3,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowSuppressedByGateFailure.depth_ratio_l5,
      1,
    );
    assert.deepEqual(
      summary.btcTrendExposure.negativeWindowNoSignalSuppressedByGateFailure,
      summary.btcTrendExposure.negativeWindowSuppressedByGateFailure,
    );
    assert.deepEqual(
      summary.btcTrendExposure.negativeWindowNoFillSuppressedByGateFailure,
      summary.btcTrendExposure.negativeWindowSuppressedByGateFailure,
    );
    assert.deepEqual(
      summary.btcTrendExposure.negativeWindowGateFailureCombinations,
      {
        window_coverage_sec: 3,
        "depth_ratio_l5+window_coverage_sec": 1,
      },
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowGateFailureStats.window_coverage_sec
        .count,
      3,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowGateFailureStats.window_coverage_sec
        .avgDeficit,
      10,
    );
    assert.equal(
      summary.btcTrendExposure.negativeWindowGateFailureStats.depth_ratio_l5
        .maxDeficit,
      0.3,
    );
    assert.ok(summary.btcTrendExposure.negativeWindowAvoidedLossKrw > 0);
    assert.ok(
      (summary.btcTrendExposure.negativeWindowAvoidedLossRatio ?? 0) > 0,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary flags PnL that depends on carried open marks", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-open-mark-"));
  try {
    const reportsRoot = join(directory, "reports");
    mkdirSync(reportsRoot, { recursive: true });

    for (let index = 0; index < 30; index += 1) {
      const sessionDir = join(reportsRoot, `closed-${String(index).padStart(2, "0")}`);
      mkdirSync(sessionDir, { recursive: true });
      writeJson(join(sessionDir, "report.json"), {
        generatedAt: `2026-04-02T12:${String(index).padStart(2, "0")}:00.000Z`,
        sessionId: `closed-${index}`,
        mode: "paper",
        latestSnapshots: {
          "KRW-BTC": {
            bestAskPrice: 100_000_000,
            bestBidPrice: 99_990_000,
            lastTradePrice: 99_995_000,
          },
        },
        portfolio: {
          cashAvailable: 99_990,
          dailyRealizedPnl: -10,
          positions: {},
        },
        ledger: {
          decisions: [],
          fills: [
            {
              market: "KRW-BTC",
              side: "sell",
              quantity: 0.001,
              quoteNotional: 99_990,
              feesPaid: 0,
            },
          ],
          orders: [
            {
              market: "KRW-BTC",
              side: "sell",
              status: "filled",
              requestedQuantity: 0.001,
              executedQuantity: 0.001,
              requestedQuoteNotional: 99_990,
              executedQuoteNotional: 99_990,
              feesPaid: 0,
            },
          ],
        },
        outcomes: [
          {
            type: "signal",
            signal: {
              side: "sell",
              reasonCodes: ["EXIT_TIME_STOP_15M"],
            },
            decision: {
              order: {
                side: "sell",
                signalId: `closed-${index}-sell`,
              },
            },
          },
        ],
        rejectLedger: {
          totalRejectedDecisions: 0,
        },
        reconciliation: {
          ok: true,
        },
        scenarioMetadata: {
          initialCashKrw: 100_000,
          initialEquityKrw: 100_000,
          modeIntent: "paper",
          syntheticExitPolicy: "carry_open",
          summary: {
            marketsTraded: ["KRW-BTC"],
            syntheticCloseCount: 0,
            signalCount: 1,
            entryEvaluationBucketCount: 1,
            entrySuppressedCandidateCount: 0,
            entryBlockedOpenPositionBucketCount: 0,
            entryBlockedAfterExitBucketCount: 1,
            entryBelowMinNotionalCount: 0,
            suppressedByReason: {},
          },
        },
      });
    }

    const carryDir = join(reportsRoot, "carry-open");
    mkdirSync(carryDir, { recursive: true });
    writeJson(join(carryDir, "report.json"), {
      generatedAt: "2026-04-02T13:00:00.000Z",
      sessionId: "carry-open",
      mode: "paper",
      latestSnapshots: {
        "KRW-BTC": {
          bestAskPrice: 101_010_000,
          bestBidPrice: 101_000_000,
          lastTradePrice: 101_005_000,
        },
      },
      portfolio: {
        cashAvailable: 0,
        dailyRealizedPnl: 0,
        positions: {
          "KRW-BTC": {
            market: "KRW-BTC",
            baseQuantity: 0.001,
            avgEntryPrice: 100_000_000,
            realizedPnl: 0,
          },
        },
      },
      ledger: {
        decisions: [],
        fills: [],
        orders: [],
      },
      outcomes: [],
      rejectLedger: {
        totalRejectedDecisions: 0,
      },
      reconciliation: {
        ok: true,
      },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        modeIntent: "paper",
        syntheticExitPolicy: "carry_open",
        summary: {
          marketsTraded: ["KRW-BTC"],
          syntheticCloseCount: 0,
          signalCount: 0,
          entryEvaluationBucketCount: 0,
          entrySuppressedCandidateCount: 0,
          entryBlockedOpenPositionBucketCount: 1,
          entryBlockedAfterExitBucketCount: 0,
          entryBelowMinNotionalCount: 0,
          suppressedByReason: {},
        },
      },
    });

    const latestDir = join(reportsRoot, "latest-flat");
    mkdirSync(latestDir, { recursive: true });
    writeJson(join(latestDir, "report.json"), {
      generatedAt: "2026-04-02T13:01:00.000Z",
      sessionId: "latest-flat",
      mode: "paper",
      latestSnapshots: {
        "KRW-BTC": {
          bestAskPrice: 101_010_000,
          bestBidPrice: 101_000_000,
          lastTradePrice: 101_005_000,
        },
      },
      portfolio: {
        cashAvailable: 100_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
      ledger: {
        decisions: [],
        fills: [],
        orders: [],
      },
      outcomes: [],
      rejectLedger: {
        totalRejectedDecisions: 0,
      },
      reconciliation: {
        ok: true,
      },
      scenarioMetadata: {
        initialCashKrw: 100_000,
        initialEquityKrw: 100_000,
        modeIntent: "paper",
        syntheticExitPolicy: "carry_open",
        summary: {
          marketsTraded: [],
          syntheticCloseCount: 0,
          signalCount: 0,
          entryEvaluationBucketCount: 1,
          entrySuppressedCandidateCount: 1,
          entryBlockedOpenPositionBucketCount: 0,
          entryBlockedAfterExitBucketCount: 0,
          entryBelowMinNotionalCount: 0,
          suppressedByReason: {
            SUPPRESS_WEAK_CONFLUENCE: 1,
          },
        },
      },
    });

    const output = execFileSync(
      process.execPath,
      ["dist/src/cli/summarize-dry-run-returns.js", "--reports-root", reportsRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      sessionCount: number;
      exposureSessionCount: number;
      tradedSessionCount: number;
      filledSessionCount: number;
      orderedSessionCount: number;
      openMarkSessionCount: number;
      openPositionSessionCount: number;
      sessionCountInterpretation: string;
      byMarket: Record<
        string,
        {
          tradedSessionCount: number;
          filledSessionCount: number;
          openMarkSessionCount: number;
          openPositionSessionCount: number;
        }
      >;
      liveReadiness: {
        checks: {
          positiveTradedPnl: boolean;
          positiveClosedTradePnl: boolean;
          noOpenMarkProfitDependency: boolean;
        };
        reasons: string[];
      };
      lossCauseExperiments: {
        openMarkDependency: {
          closedTradeTotalPnlKrw: number;
          carryOpenMarkTotalPnlKrw: number;
          carryOpenMarkPeakPnlKrw: number | null;
          carryOpenMarkLatestPnlKrw: number | null;
          carryOpenMarkDrawdownFromPeakKrw: number | null;
          carryOpenMarkMaxDrawdownKrw: number | null;
          carryOpenMarkReturnStdDevPct: number | null;
          tradedPnlWithoutCarryOpenMarksKrw: number;
          pnlDependsOnOpenMarks: boolean;
        };
      };
    };

    assert.equal(summary.sessionCount, 32);
    assert.equal(summary.exposureSessionCount, 31);
    assert.equal(summary.tradedSessionCount, 31);
    assert.equal(summary.filledSessionCount, 30);
    assert.equal(summary.orderedSessionCount, 30);
    assert.equal(summary.openMarkSessionCount, 1);
    assert.equal(summary.openPositionSessionCount, 1);
    assert.match(summary.sessionCountInterpretation, /filledSessionCount counts sessions with actual fills/);
    assert.equal(summary.byMarket["KRW-BTC"]?.tradedSessionCount, 31);
    assert.equal(summary.byMarket["KRW-BTC"]?.filledSessionCount, 30);
    assert.equal(summary.byMarket["KRW-BTC"]?.openMarkSessionCount, 1);
    assert.equal(summary.byMarket["KRW-BTC"]?.openPositionSessionCount, 1);
    assert.equal(summary.liveReadiness.checks.positiveTradedPnl, true);
    assert.equal(summary.liveReadiness.checks.positiveClosedTradePnl, false);
    assert.equal(summary.liveReadiness.checks.noOpenMarkProfitDependency, false);
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.closedTradeTotalPnlKrw,
      -300,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.carryOpenMarkTotalPnlKrw,
      1_000,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.carryOpenMarkPeakPnlKrw,
      1_000,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.carryOpenMarkLatestPnlKrw,
      1_000,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.carryOpenMarkDrawdownFromPeakKrw,
      0,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.carryOpenMarkMaxDrawdownKrw,
      0,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.carryOpenMarkReturnStdDevPct,
      null,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.tradedPnlWithoutCarryOpenMarksKrw,
      -300,
    );
    assert.equal(
      summary.lossCauseExperiments.openMarkDependency.pnlDependsOnOpenMarks,
      true,
    );
    assert.ok(
      summary.liveReadiness.reasons.some((reason) =>
        reason.includes("depends on carry-open marked PnL"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary decomposes time-stop exits against BTC hold", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-timestop-"));
  try {
    const reportsRoot = join(directory, "reports");
    const cyclesPath = join(directory, "cycles.ndjson");
    mkdirSync(reportsRoot, { recursive: true });

    const cycleLines: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const sessionDir = join(reportsRoot, `session-${index}`);
      mkdirSync(sessionDir, { recursive: true });
      const scenarioPath = join(sessionDir, "scenario.json");
      const reportPath = join(sessionDir, "report.json");

      writeJson(scenarioPath, {
        schemaVersion: "1.0.0",
        events: [
          {
            type: "snapshot",
            snapshot: {
              market: "KRW-BTC",
              bestAskPrice: 100_000_000,
              bestBidPrice: 99_990_000,
              lastTradePrice: 100_000_000,
            },
          },
          {
            type: "signal",
            signal: {
              side: "sell",
              reasonCodes: ["EXIT_TIME_STOP_15M"],
            },
          },
        ],
      });
      writeJson(reportPath, {
        generatedAt: `2026-04-02T13:0${index}:00.000Z`,
        sessionId: `time-stop-${index}`,
        scenarioPath,
        mode: "paper",
        latestSnapshots: {
          "KRW-BTC": {
            bestAskPrice: 101_050_000,
            bestBidPrice: 101_000_000,
            lastTradePrice: 101_025_000,
          },
        },
        portfolio: {
          cashAvailable: 99_900,
          dailyRealizedPnl: -100,
          positions: {},
        },
        ledger: {
          decisions: [],
          fills: [
            {
              market: "KRW-BTC",
              side: "sell",
              quantity: 0.001,
              quoteNotional: 99_900,
              feesPaid: 0,
            },
          ],
          orders: [
            {
              market: "KRW-BTC",
              side: "sell",
              status: "filled",
              requestedQuantity: 0.001,
              executedQuantity: 0.001,
              requestedQuoteNotional: 99_900,
              executedQuoteNotional: 99_900,
              feesPaid: 0,
            },
          ],
        },
        outcomes: [
          {
            type: "signal",
            decision: {
              order: {
                side: "sell",
                signalId: `time-stop-${index}-sell`,
              },
            },
          },
        ],
        rejectLedger: {
          totalRejectedDecisions: 0,
        },
        reconciliation: {
          ok: true,
        },
        scenarioMetadata: {
          initialCashKrw: 100_000,
          initialEquityKrw: 100_000,
          modeIntent: "paper",
          syntheticExitPolicy: "carry_open",
          summary: {
            marketsTraded: ["KRW-BTC"],
            syntheticCloseCount: 0,
            signalCount: 1,
            entryEvaluationBucketCount: 1,
            entrySuppressedCandidateCount: 0,
            entryBlockedOpenPositionBucketCount: 0,
            entryBlockedAfterExitBucketCount: 1,
            entryBelowMinNotionalCount: 0,
            suppressedByReason: {},
          },
        },
      });
      cycleLines.push(
        JSON.stringify({
          event: "managed_dry_run_cycle_completed",
          sessionId: `time-stop-${index}`,
        }),
      );
    }
    writeFileSync(cyclesPath, `${cycleLines.join("\n")}\n`, "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/summarize-dry-run-returns.js",
        "--reports-root",
        reportsRoot,
        "--cycles-path",
        cyclesPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      exitQuality: {
        exitReasonBenchmarkComparison: Record<
          string,
          {
            totalStrategyPnlKrw: number;
            totalBenchmarkPnlKrw: number;
            totalExcessPnlKrw: number;
            positiveBenchmarkSessionCount: number;
          }
        >;
      };
      lossCauseExperiments: {
        timeStopExit: {
          affected: {
            sessionCount: number;
            totalPnlKrw: number;
          };
          benchmarkComparison: {
            totalExcessPnlKrw: number;
            positiveWindowCaptureRatio: number | null;
          };
          positiveBenchmarkWindows: {
            sessionCount: number;
            totalStrategyPnlKrw: number;
            totalBenchmarkPnlKrw: number;
          };
        };
      };
    };

    const timeStopBenchmark =
      summary.exitQuality.exitReasonBenchmarkComparison.EXIT_TIME_STOP_15M;
    assert.equal(timeStopBenchmark.positiveBenchmarkSessionCount, 2);
    assert.equal(timeStopBenchmark.totalStrategyPnlKrw, -200);
    assert.equal(timeStopBenchmark.totalBenchmarkPnlKrw, 2_000);
    assert.equal(timeStopBenchmark.totalExcessPnlKrw, -2_200);
    assert.equal(summary.lossCauseExperiments.timeStopExit.affected.sessionCount, 2);
    assert.equal(summary.lossCauseExperiments.timeStopExit.affected.totalPnlKrw, -200);
    assert.equal(
      summary.lossCauseExperiments.timeStopExit.benchmarkComparison
        .totalExcessPnlKrw,
      -2_200,
    );
    assert.ok(
      (summary.lossCauseExperiments.timeStopExit.benchmarkComparison
        .positiveWindowCaptureRatio ?? 0) < 0,
    );
    assert.equal(
      summary.lossCauseExperiments.timeStopExit.positiveBenchmarkWindows
        .sessionCount,
      2,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run return summary reports signal execution guard rejection denominator", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-summary-signal-rejects-"));
  try {
    const reportsRoot = join(directory, "reports");
    mkdirSync(reportsRoot, { recursive: true });

    const writeSession = (
      sessionId: string,
      value: {
        outcomes: unknown[];
        rejectLedger?: unknown;
        signalCount: number;
        suppressedByReason?: Record<string, number>;
      },
    ): void => {
      const sessionDir = join(reportsRoot, sessionId);
      mkdirSync(sessionDir, { recursive: true });
      writeJson(join(sessionDir, "report.json"), {
        generatedAt: "2026-05-13T00:00:00.000Z",
        sessionId,
        mode: "paper",
        latestSnapshots: {},
        portfolio: {
          cashAvailable: 100_000,
          dailyRealizedPnl: 0,
          positions: {},
        },
        ledger: {
          decisions: [],
          fills: [],
          orders: [],
        },
        outcomes: value.outcomes,
        rejectLedger: value.rejectLedger,
        reconciliation: { ok: true },
        scenarioMetadata: {
          initialCashKrw: 100_000,
          initialEquityKrw: 100_000,
          modeIntent: "paper",
          syntheticExitPolicy: "carry_open",
          summary: {
            marketsTraded: ["KRW-H"],
            syntheticCloseCount: 0,
            signalCount: value.signalCount,
            suppressedByReason: value.suppressedByReason ?? {},
          },
        },
      });
    };

    writeSession("session-1-rejected-signal", {
      signalCount: 1,
      outcomes: [
        {
          type: "signal",
          signalId: "signal-rejected",
          decision: {
            accepted: false,
            reasons: [
              { code: "spread_guard_triggered" },
              { code: "liquidity_guard_triggered" },
            ],
          },
          signal: {
            side: "buy",
          },
        },
      ],
      rejectLedger: {
        totalRejectedDecisions: 1,
        entries: [
          {
            reasonCodes: ["spread_guard_triggered", "liquidity_guard_triggered"],
          },
        ],
      },
    });
    writeSession("session-2-no-signal", {
      signalCount: 0,
      outcomes: [],
      suppressedByReason: {
        signal_inactive: 1,
      },
    });
    writeSession("session-3-accepted-signal", {
      signalCount: 1,
      outcomes: [
        {
          type: "signal",
          signalId: "signal-accepted",
          decision: {
            accepted: true,
          },
          signal: {
            side: "buy",
          },
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      ["dist/src/cli/summarize-dry-run-returns.js", "--reports-root", reportsRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      quality: {
        rejectedDecisionSessions: number;
        signalRejectedDecisionSessions: number;
        signalRejectedDecisionCount: number;
        signalRejectedReasonCounts: Record<string, number>;
      };
      lossCauseExperiments: {
        entryInactivity: {
          zeroSignalSessions: number;
        };
        entryExecutionGuardRejections: {
          signalSessionCount: number;
          signalDecisionCount: number;
          signalRejectedSessionCount: number;
          signalRejectedDecisionCount: number;
          signalRejectedSessionRate: number | null;
          signalRejectedDecisionRate: number | null;
          reasonCounts: Record<string, number>;
        };
      };
    };

    assert.equal(summary.quality.rejectedDecisionSessions, 1);
    assert.equal(summary.quality.signalRejectedDecisionSessions, 1);
    assert.equal(summary.quality.signalRejectedDecisionCount, 1);
    assert.equal(summary.quality.signalRejectedReasonCounts.spread_guard_triggered, 1);
    assert.equal(summary.quality.signalRejectedReasonCounts.liquidity_guard_triggered, 1);
    assert.equal(summary.lossCauseExperiments.entryInactivity.zeroSignalSessions, 1);
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections.signalSessionCount,
      2,
    );
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections.signalDecisionCount,
      2,
    );
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections
        .signalRejectedSessionCount,
      1,
    );
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections
        .signalRejectedDecisionCount,
      1,
    );
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections.signalRejectedSessionRate,
      0.5,
    );
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections.signalRejectedDecisionRate,
      0.5,
    );
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections.reasonCounts
        .spread_guard_triggered,
      1,
    );
    assert.equal(
      summary.lossCauseExperiments.entryExecutionGuardRejections.reasonCounts
        .liquidity_guard_triggered,
      1,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
