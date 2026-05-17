import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeReport(
  root: string,
  runId: string,
  options: {
    sessionId: string;
    initialEquityKrw: number;
    endingEquityKrw: number;
    btcInitialPriceKrw: number;
    btcEndingPriceKrw: number;
    exitReasonCodes?: string[];
    openPosition?: boolean;
  },
): void {
  const sessionDir = join(root, `session-${options.sessionId}`);
  mkdirSync(sessionDir, { recursive: true });
  const scenarioPath = join(sessionDir, "scenario.json");
  writeJson(scenarioPath, {
    schemaVersion: "1.0.0",
    events: [
      {
        type: "snapshot",
        snapshot: {
          market: "KRW-BTC",
          bestAskPrice: options.btcInitialPriceKrw,
          bestBidPrice: options.btcInitialPriceKrw,
          lastTradePrice: options.btcInitialPriceKrw,
        },
      },
      ...(options.exitReasonCodes
        ? [
            {
              type: "signal",
              signal: {
                side: "sell",
                reasonCodes: options.exitReasonCodes,
              },
            },
          ]
        : []),
      {
        type: "snapshot",
        snapshot: {
          market: "KRW-BTC",
          bestAskPrice: options.btcEndingPriceKrw,
          bestBidPrice: options.btcEndingPriceKrw,
          lastTradePrice: options.btcEndingPriceKrw,
        },
      },
    ],
  });

  const positionQuantity = options.openPosition
    ? options.endingEquityKrw / options.btcEndingPriceKrw
    : 0;
  writeJson(join(sessionDir, "report.json"), {
    generatedAt: `2026-04-02T12:00:${options.sessionId.slice(-2)}.000Z`,
    sessionId: options.sessionId,
    scenarioPath,
    latestSnapshots: {
      "KRW-BTC": {
        market: "KRW-BTC",
        bestAskPrice: options.btcEndingPriceKrw,
        bestBidPrice: options.btcEndingPriceKrw,
        lastTradePrice: options.btcEndingPriceKrw,
      },
    },
    scenarioMetadata: {
      sourceRunId: runId,
      initialCashKrw: options.initialEquityKrw,
      initialEquityKrw: options.initialEquityKrw,
      modeIntent: "paper",
      syntheticExitPolicy: "carry_open",
      summary: {
        syntheticCloseCount: 0,
      },
    },
    portfolio: {
      cashAvailable: options.openPosition ? 0 : options.endingEquityKrw,
      dailyRealizedPnl: options.endingEquityKrw - options.initialEquityKrw,
      positions: options.openPosition
        ? {
            "KRW-BTC": {
              market: "KRW-BTC",
              baseQuantity: positionQuantity,
              avgEntryPrice: options.btcInitialPriceKrw,
              realizedPnl: 0,
            },
          }
        : {},
    },
    ledger: {
      decisions: [],
      fills: options.exitReasonCodes
        ? [
            {
              market: "KRW-BTC",
              side: "sell",
              quantity: 0.001,
              quoteNotional: options.endingEquityKrw,
              feesPaid: 0,
            },
          ]
        : [],
      orders: [],
    },
    rejectLedger: {
      totalRejectedDecisions: 0,
    },
    reconciliation: {
      ok: true,
    },
  });
}

test("paired dry-run comparison isolates time-stop deltas and open-risk migration", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-paired-compare-"));
  try {
    const baselineRoot = join(directory, "baseline");
    const candidateRoot = join(directory, "candidate");
    mkdirSync(baselineRoot, { recursive: true });
    mkdirSync(candidateRoot, { recursive: true });

    writeReport(baselineRoot, "run-a", {
      sessionId: "baseline-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 900,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 120,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 980,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 120,
      openPosition: true,
    });
    writeReport(baselineRoot, "run-b", {
      sessionId: "baseline-b",
      initialEquityKrw: 1_000,
      endingEquityKrw: 950,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 90,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });
    writeReport(candidateRoot, "run-b", {
      sessionId: "candidate-b",
      initialEquityKrw: 1_000,
      endingEquityKrw: 1_010,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 90,
      exitReasonCodes: ["EXIT_TAKE_PROFIT"],
    });
    writeReport(baselineRoot, "run-c", {
      sessionId: "baseline-c",
      initialEquityKrw: 1_000,
      endingEquityKrw: 990,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/compare-paired-dry-runs.js",
        "--baseline-reports-root",
        baselineRoot,
        "--candidate-reports-root",
        candidateRoot,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const summary = JSON.parse(output) as {
      pairing: {
        pairedSessionCount: number;
        missingCandidateRunIds: string[];
      };
      focusCohort: {
        pairedSessionCount: number;
        delta: {
          totalPnlKrw: number;
          totalExcessPnlKrw: number;
          improvedPnlSessions: number;
        };
        openRiskMigration: {
          candidateOpenPositionSessions: number;
          candidateDeferredSessionIds: string[];
        };
        supportsExitChange: boolean;
      };
      liveEvidence: {
        supportsLivePromotion: boolean;
        reasons: string[];
      };
    };

    assert.equal(summary.pairing.pairedSessionCount, 2);
    assert.deepEqual(summary.pairing.missingCandidateRunIds, ["run-c"]);
    assert.equal(summary.focusCohort.pairedSessionCount, 2);
    assert.ok(Math.abs(summary.focusCohort.delta.totalPnlKrw - 140) < 1e-9);
    assert.ok(
      Math.abs(summary.focusCohort.delta.totalExcessPnlKrw - 140) < 1e-9,
    );
    assert.equal(summary.focusCohort.delta.improvedPnlSessions, 2);
    assert.equal(summary.focusCohort.openRiskMigration.candidateOpenPositionSessions, 1);
    assert.deepEqual(
      summary.focusCohort.openRiskMigration.candidateDeferredSessionIds,
      ["candidate-a"],
    );
    assert.equal(summary.focusCohort.supportsExitChange, false);
    assert.equal(summary.liveEvidence.supportsLivePromotion, false);
    assert.ok(
      summary.liveEvidence.reasons.some((reason) =>
        reason.includes("open-position sessions"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
