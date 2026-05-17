import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function writeScan(path: string): void {
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    assumptions: {
      market: "KRW-H",
      unitMinutes: 60,
      signalMode: "momentum",
      feeRoundTripBps: 35,
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
          totalPnlKrw: 235799.915901,
          medianPnlKrw: 423.913043,
          returnPct: 0.827368,
        },
        test: {
          count: 37,
          totalPnlKrw: 491948.522131,
          medianPnlKrw: 6250,
          returnPct: 2.659181,
        },
        walkForward: {
          foldCount: 5,
          positiveTotalFoldCount: 5,
          positiveMedianFoldCount: 4,
          minFoldPnlKrw: 8113.658939,
        },
      },
    ],
  });
}

function writeObservation(path: string): void {
  writeJson(path, {
    generatedAt: "2026-05-13T01:00:00.000Z",
    candidate: {
      market: "KRW-H",
      signalMode: "momentum",
      unitMinutes: 60,
      lookbackBars: 168,
      holdBars: 24,
      minReturnBps: 0,
      minDropBps: 50,
      riskFilter: "range24_below_p70",
      riskThreshold: 2071.713147410359,
      notionalKrw: 500000,
      expectedMedianEdgeBps: 138.73015874,
    },
    signal: {
      active: false,
      latestCandleAt: "2026-05-13T01:00:00.000Z",
      previousCandleAt: "2026-05-06T01:00:00.000Z",
      latestClose: 353,
      previousClose: 298,
      lookbackReturnBps: 1845.637584,
      returnThresholdBps: 0,
      dropThresholdBps: 50,
      riskValue: 2543.352601,
      directionalSignalPass: true,
      riskPass: false,
    },
    orderbook: {
      bestAsk: 354,
      bestBid: 353,
      bestAskSize: 10000,
      bestBidSize: 10000,
      spreadBps: 28.328612,
      executableRoundTripCostBps: 31.5,
      executableCostVsExpectedEdgeBps: -107.230159,
      buyDepth: {
        levels: 3,
        notionalKrw: 1000000,
        coversRequestedNotional: true,
      },
      sellDepth: {
        levels: 3,
        notionalKrw: 1000000,
        coversRequestedNotional: true,
      },
    },
    ticker: {
      tradePrice: 353,
      accTradePrice24h: 2000000000,
    },
    freshness: {
      tickerFresh: true,
      latestCandleRecent: true,
      snapshotSkewControlled: true,
    },
    decision: {
      executionViability: "blocked_by_signal_or_execution_cost",
      reasons: ["momentum_signal_inactive"],
    },
  });
}

test("replacement readiness refresh writes paper evidence after the observation", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-refresh-"));
  try {
    const scanPath = join(directory, "scan.json");
    const inputObservationPath = join(directory, "input-observation.json");
    const observationPath = join(directory, "observation.json");
    const paperObservationPath = join(directory, "paper-observation.json");
    const positionAuditPath = join(directory, "position-audit.json");
    const readinessPath = join(directory, "readiness.json");
    const paperReportsDir = join(directory, "paper-reports");
    writeScan(scanPath);
    writeObservation(inputObservationPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/refresh-bithumb-replacement-time-series-readiness.js",
        "--scan",
        scanPath,
        "--input-observation",
        inputObservationPath,
        "--observation-output",
        observationPath,
        "--paper-observation-output",
        paperObservationPath,
        "--position-audit-output",
        positionAuditPath,
        "--readiness-output",
        readinessPath,
        "--paper-reports-dir",
        paperReportsDir,
        "--strategy-id",
        "krw_h_60m_momentum_top_candidate_v1",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const summary = JSON.parse(output) as {
      artifacts: {
        observationPath: string;
        paperObservationPath: string;
        positionAuditPath: string;
        readinessPath: string;
      };
      summary: { classification: string; paperReady: boolean; paperBlockers: string[] };
    };
    const readiness = JSON.parse(readFileSync(readinessPath, "utf8")) as {
      strategyAssessment: { classification: string };
      paperReadiness: {
        ready: boolean;
        checks: { paperObservationAfterObservation: boolean; prematureExitBlocked: boolean };
        reasons: string[];
      };
      inputs: { positionAuditPath: string };
    };
    const positionAudit = JSON.parse(readFileSync(positionAuditPath, "utf8")) as {
      exit: { attempted: boolean; reason: string };
    };

    assert.equal(summary.artifacts.observationPath, observationPath);
    assert.equal(summary.artifacts.paperObservationPath, paperObservationPath);
    assert.equal(summary.artifacts.positionAuditPath, positionAuditPath);
    assert.equal(summary.artifacts.readinessPath, readinessPath);
    assert.equal(readiness.inputs.positionAuditPath, positionAuditPath);
    assert.equal(positionAudit.exit.attempted, false);
    assert.equal(positionAudit.exit.reason, "no_open_position");
    assert.equal(summary.summary.classification, "research_candidate");
    assert.equal(readiness.strategyAssessment.classification, "research_candidate");
    assert.equal(readiness.paperReadiness.ready, false);
    assert.equal(readiness.paperReadiness.checks.paperObservationAfterObservation, true);
    assert.equal(readiness.paperReadiness.checks.prematureExitBlocked, true);
    assert.equal(readiness.paperReadiness.reasons.includes("paperObservationAfterObservation"), false);
    assert.deepEqual(summary.summary.paperBlockers, readiness.paperReadiness.reasons);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
