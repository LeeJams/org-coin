import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  writeJson(join(sessionDir, "report.json"), {
    generatedAt: `2026-04-02T12:00:${options.sessionId.slice(-2)}.000Z`,
    sessionId: options.sessionId,
    mode: "paper",
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
        signalCount: options.exitReasonCodes ? 1 : 0,
        entryEvaluationBucketCount: 1,
        entrySuppressedCandidateCount: 0,
        entryBlockedOpenPositionBucketCount: 0,
        entryBlockedAfterExitBucketCount: 0,
        entryBelowMinNotionalCount: 0,
        suppressedByReason: {},
      },
    },
    portfolio: {
      cashAvailable: options.endingEquityKrw,
      dailyRealizedPnl: options.endingEquityKrw - options.initialEquityKrw,
      positions: {},
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
    outcomes: options.exitReasonCodes
      ? [
          {
            type: "signal",
            signal: {
              side: "sell",
              reasonCodes: options.exitReasonCodes,
            },
          },
        ]
      : [],
    rejectLedger: {
      totalRejectedDecisions: 0,
    },
    reconciliation: {
      ok: true,
    },
  });
}

test("live candidate audit combines summary gates and paired deltas", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-audit-"));
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
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 950,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--baseline-reports-root",
        baselineRoot,
        "--candidate",
        `candidate=${candidateRoot}`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const audit = JSON.parse(output) as {
      candidates: Array<{
        label: string;
        cycleEvidenceAvailable: boolean;
        closedTradeCount: number;
        totalPnlKrw: number;
        liveReady: boolean;
        readinessReasons: string[];
        exitRisk: {
          worstExitReason: string | null;
          topLosingExitReasons: Array<{
            reasonCode: string;
            totalPnlKrw: number | null;
          }>;
        };
        exitAttribution: {
          missingExitReasonSessionCount: number;
          missingExitReasonPnlKrw: number | null;
        };
        feeHurdle: {
          netPnlKrw: number | null;
          grossPnlBeforeFeesKrw: number | null;
          wouldStillLoseWithoutFees: boolean | null;
        } | null;
        entryInactivity: {
          zeroSignalSessions: number;
          entryEvaluationBucketCount: number;
        };
        suppressedOpportunity: {
          sampleCount: number;
          missedPositiveBtcWindows: {
            plus5m: {
              count: number;
            };
          };
          opportunityAssessment: {
            classification: string;
            supportsLooseningEntry: boolean;
          };
        };
        btcTrendExposure: {
          positiveBenchmarkSessionCount: number;
          positiveWindowNoFillSessionCount: number;
          positiveWindowCaptureRatio: number | null;
          negativeBenchmarkSessionCount: number;
          negativeWindowNoFillSessionCount: number;
          negativeWindowAvoidedLossRatio: number | null;
          negativeWindowSuppressionCounts: Record<string, number>;
        };
        evidenceGaps: {
          failedChecks: string[];
          minimumClosedTrades: {
            required: number;
            observed: number;
            additionalNeeded: number;
          };
          pnl: {
            needsPositiveTradedPnl: boolean;
            needsPositiveClosedTradePnl: boolean;
          };
          cycleRecovery: {
            evidenceAvailable: boolean;
          };
        };
        paired: {
          pairedSessionCount: number;
          deltaTotalPnlKrw: number;
          focusDeltaPnlKrw: number;
        };
      }>;
      recommendation: {
        liveReadyLabels: string[];
        paperOnlyLabels: string[];
        discardLabels: string[];
        profitablePaperLabels: string[];
        observationOnlyLabels: string[];
        blockerSummary: {
          insufficientClosedTradeLabels: string[];
          additionalClosedTradesNeededByLabel: Record<string, number>;
          additionalRecoveryCyclesNeededByLabel: Record<string, number>;
          negativeTradedPnlLabels: string[];
          negativeClosedPnlLabels: string[];
          btcUnderperformanceLabels: string[];
          openRiskLabels: string[];
          cycleFailureLabels: string[];
          materialLosingExitReasonLabels: string[];
          missingExitReasonLabels: string[];
          wouldStillLoseWithoutFeesLabels: string[];
          failureKindsByLabel: Record<string, Record<string, number>>;
          latestFailureByLabel: Record<
            string,
            {
              message: string;
              failureKind?: string;
            }
          >;
        };
        entryGateSummary: {
          supportsLooseningEntryLabels: string[];
          protectiveInactivityLabels: string[];
          inconclusiveLabels: string[];
          noSuppressedSampleLabels: string[];
        };
        decisionSummary: {
          live: string;
          paper: string;
          observationHealth: {
            state: string;
            cycleEvidenceUnavailableLabels: string[];
            recoveryIncompleteLabels: string[];
            recoveredWithHistoricalFailureLabels: string[];
            noCycleFailureLabels: string[];
          };
          evidenceTargets: {
            closedTradeIncompleteLabels: string[];
            additionalClosedTradesNeededByLabel: Record<string, number>;
            maxAdditionalClosedTradesNeeded: number;
            recoveryIncompleteLabels: string[];
            additionalRecoveryCyclesNeededByLabel: Record<string, number>;
            maxAdditionalRecoveryCyclesNeeded: number;
          };
          entryGateChange: string;
          nextOperationalStep: string;
          primaryBlockers: string[];
        };
        promotionGates: {
          liveReady: {
            passed: boolean;
            failureExitCode: number;
          };
          observationReady: {
            passed: boolean;
            failureExitCode: number;
          };
          paperCandidate: {
            passed: boolean;
            failureExitCode: number;
          };
        };
        nextPaperCandidate: string | null;
        nextPaperCandidateBasis: string;
      };
    };

    assert.equal(audit.candidates.length, 1);
    assert.equal(audit.candidates[0]?.label, "candidate");
    assert.equal(audit.candidates[0]?.cycleEvidenceAvailable, false);
    assert.equal(audit.candidates[0]?.closedTradeCount, 1);
    assert.equal(audit.candidates[0]?.totalPnlKrw, -50);
    assert.equal(audit.candidates[0]?.exitRisk.worstExitReason, "EXIT_TIME_STOP_15M");
    assert.equal(
      audit.candidates[0]?.exitAttribution.missingExitReasonSessionCount,
      0,
    );
    assert.equal(audit.candidates[0]?.exitAttribution.missingExitReasonPnlKrw, 0);
    assert.equal(
      audit.candidates[0]?.exitRisk.topLosingExitReasons[0]?.totalPnlKrw,
      -50,
    );
    assert.equal(audit.candidates[0]?.feeHurdle?.netPnlKrw, -50);
    assert.equal(
      audit.candidates[0]?.feeHurdle?.grossPnlBeforeFeesKrw,
      -50,
    );
    assert.equal(
      audit.candidates[0]?.feeHurdle?.wouldStillLoseWithoutFees,
      true,
    );
    assert.equal(audit.candidates[0]?.entryInactivity.zeroSignalSessions, 0);
    assert.equal(
      audit.candidates[0]?.entryInactivity.entryEvaluationBucketCount,
      1,
    );
    assert.equal(audit.candidates[0]?.suppressedOpportunity.sampleCount, 0);
    assert.equal(
      audit.candidates[0]?.suppressedOpportunity.missedPositiveBtcWindows.plus5m
        .count,
      0,
    );
    assert.equal(
      audit.candidates[0]?.suppressedOpportunity.opportunityAssessment
        .classification,
      "no_suppressed_samples",
    );
    assert.equal(
      audit.candidates[0]?.suppressedOpportunity.opportunityAssessment
        .supportsLooseningEntry,
      false,
    );
    assert.equal(audit.candidates[0]?.btcTrendExposure.positiveBenchmarkSessionCount, 0);
    assert.equal(audit.candidates[0]?.btcTrendExposure.positiveWindowNoFillSessionCount, 0);
    assert.equal(audit.candidates[0]?.btcTrendExposure.positiveWindowCaptureRatio, null);
    assert.equal(audit.candidates[0]?.btcTrendExposure.negativeBenchmarkSessionCount, 0);
    assert.equal(audit.candidates[0]?.btcTrendExposure.negativeWindowNoFillSessionCount, 0);
    assert.equal(audit.candidates[0]?.btcTrendExposure.negativeWindowAvoidedLossRatio, null);
    assert.deepEqual(
      audit.candidates[0]?.btcTrendExposure.negativeWindowSuppressionCounts,
      {},
    );
    assert.equal(audit.candidates[0]?.evidenceGaps.minimumClosedTrades.required, 30);
    assert.equal(audit.candidates[0]?.evidenceGaps.minimumClosedTrades.observed, 1);
    assert.equal(
      audit.candidates[0]?.evidenceGaps.minimumClosedTrades.additionalNeeded,
      29,
    );
    assert.equal(
      audit.candidates[0]?.evidenceGaps.pnl.needsPositiveTradedPnl,
      true,
    );
    assert.equal(
      audit.candidates[0]?.evidenceGaps.pnl.needsPositiveClosedTradePnl,
      true,
    );
    assert.equal(
      audit.candidates[0]?.evidenceGaps.cycleRecovery.evidenceAvailable,
      false,
    );
    assert.ok(
      audit.candidates[0]?.evidenceGaps.failedChecks.includes(
        "minimumClosedTrades",
      ),
    );
    assert.equal(audit.candidates[0]?.liveReady, false);
    assert.ok(
      audit.candidates[0]?.readinessReasons.includes(
        "cycle evidence unavailable for this report root",
      ),
    );
    assert.equal(audit.candidates[0]?.paired.pairedSessionCount, 1);
    assert.equal(audit.candidates[0]?.paired.deltaTotalPnlKrw, 50);
    assert.equal(audit.candidates[0]?.paired.focusDeltaPnlKrw, 50);
    assert.deepEqual(audit.recommendation.liveReadyLabels, []);
    assert.deepEqual(audit.recommendation.paperOnlyLabels, ["candidate"]);
    assert.deepEqual(audit.recommendation.discardLabels, []);
    assert.deepEqual(audit.recommendation.profitablePaperLabels, []);
    assert.deepEqual(audit.recommendation.observationOnlyLabels, ["candidate"]);
    assert.deepEqual(
      audit.recommendation.blockerSummary.insufficientClosedTradeLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.additionalClosedTradesNeededByLabel,
      { candidate: 29 },
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.additionalRecoveryCyclesNeededByLabel,
      {},
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.negativeTradedPnlLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.negativeClosedPnlLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.btcUnderperformanceLabels,
      ["candidate"],
    );
    assert.deepEqual(audit.recommendation.blockerSummary.openRiskLabels, []);
    assert.deepEqual(audit.recommendation.blockerSummary.cycleFailureLabels, []);
    assert.deepEqual(
      audit.recommendation.blockerSummary.materialLosingExitReasonLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.missingExitReasonLabels,
      [],
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.wouldStillLoseWithoutFeesLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.failureKindsByLabel,
      {},
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.latestFailureByLabel,
      {},
    );
    assert.deepEqual(
      audit.recommendation.entryGateSummary.supportsLooseningEntryLabels,
      [],
    );
    assert.deepEqual(
      audit.recommendation.entryGateSummary.protectiveInactivityLabels,
      [],
    );
    assert.deepEqual(audit.recommendation.entryGateSummary.inconclusiveLabels, []);
    assert.deepEqual(
      audit.recommendation.entryGateSummary.noSuppressedSampleLabels,
      ["candidate"],
    );
    assert.equal(audit.recommendation.decisionSummary.live, "blocked");
    assert.equal(audit.recommendation.decisionSummary.paper, "blocked");
    assert.equal(
      audit.recommendation.decisionSummary.observationHealth.state,
      "unavailable",
    );
    assert.deepEqual(
      audit.recommendation.decisionSummary.observationHealth
        .cycleEvidenceUnavailableLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.decisionSummary.observationHealth.noCycleFailureLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.decisionSummary.evidenceTargets
        .closedTradeIncompleteLabels,
      ["candidate"],
    );
    assert.deepEqual(
      audit.recommendation.decisionSummary.evidenceTargets
        .additionalClosedTradesNeededByLabel,
      { candidate: 29 },
    );
    assert.equal(
      audit.recommendation.decisionSummary.evidenceTargets
        .maxAdditionalClosedTradesNeeded,
      29,
    );
    assert.deepEqual(
      audit.recommendation.decisionSummary.evidenceTargets
        .recoveryIncompleteLabels,
      [],
    );
    assert.equal(
      audit.recommendation.decisionSummary.entryGateChange,
      "blocked_no_positive_suppressed_expectancy",
    );
    assert.ok(
      audit.recommendation.decisionSummary.primaryBlockers.includes(
        "no_live_ready_candidate",
      ),
    );
    assert.ok(
      audit.recommendation.decisionSummary.primaryBlockers.includes(
        "no_profitable_paper_candidate",
      ),
    );
    assert.ok(
      audit.recommendation.decisionSummary.primaryBlockers.includes(
        "cycle_evidence_unavailable",
      ),
    );
    assert.equal(audit.recommendation.promotionGates.liveReady.passed, false);
    assert.equal(
      audit.recommendation.promotionGates.liveReady.failureExitCode,
      2,
    );
    assert.equal(
      audit.recommendation.promotionGates.observationReady.passed,
      false,
    );
    assert.equal(
      audit.recommendation.promotionGates.observationReady.failureExitCode,
      4,
    );
    assert.equal(
      audit.recommendation.promotionGates.paperCandidate.passed,
      false,
    );
    assert.equal(
      audit.recommendation.promotionGates.paperCandidate.failureExitCode,
      3,
    );
    assert.equal(audit.recommendation.nextPaperCandidate, null);
    assert.match(audit.recommendation.nextPaperCandidateBasis, /no non-live candidate/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit can fail when no live-ready candidate exists", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-audit-gate-"));
  try {
    const candidateRoot = join(directory, "candidate");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 950,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /no live-ready candidate/u);
    const audit = JSON.parse(result.stdout) as {
      recommendation: {
        liveReadyLabels: string[];
        decisionSummary: {
          live: string;
          paper: string;
          observationHealth: {
            state: string;
            cycleEvidenceUnavailableLabels: string[];
          };
          evidenceTargets: {
            maxAdditionalClosedTradesNeeded: number;
          };
          entryGateChange: string;
        };
      };
    };
    assert.deepEqual(audit.recommendation.liveReadyLabels, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit can apply explicit exit attribution supplement", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-audit-attribution-"));
  try {
    const candidateRoot = join(directory, "candidate");
    const supplementPath = join(directory, "attribution-summary.json");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 900,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: [],
    });
    writeJson(supplementPath, {
      generatedAt: "2026-04-02T13:00:00.000Z",
      source: {
        reportsRoot: "supplement-replay",
      },
      recoveredSellSessions: [
        {
          sourceRunId: "run-a",
          sellFillCount: 1,
          exitReasonCodes: ["EXIT_TIME_STOP_15M"],
          pnlKrw: -100,
        },
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--exit-attribution-supplement",
        `candidate=${supplementPath}`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0);
    const audit = JSON.parse(result.stdout) as {
      candidates: Array<{
        totalPnlKrw: number;
        exitRisk: {
          worstExitReason: string | null;
          topLosingExitReasons: Array<{
            reasonCode: string;
            sessionCount: number;
            totalPnlKrw: number | null;
          }>;
        };
        exitAttribution: {
          attributedExitReasonSessionCount: number;
          missingExitReasonSessionCount: number;
          missingExitReasonPnlKrw: number | null;
        };
        exitAttributionSupplement: {
          matchedMissingSessionCount: number;
          matchedSellFillCount: number;
          matchedPnlKrw: number | null;
          remainingMissingSessionCount: number;
          reasonSummary: Record<
            string,
            {
              sessionCount: number;
              totalPnlKrw: number | null;
            }
          >;
        };
        evidenceGaps: {
          failedChecks: string[];
        };
      }>;
      recommendation: {
        blockerSummary: {
          missingExitReasonLabels: string[];
          materialLosingExitReasonLabels: string[];
        };
        decisionSummary: {
          primaryBlockers: string[];
          nextOperationalStep: string;
        };
      };
    };

    assert.equal(audit.candidates[0]?.totalPnlKrw, -100);
    assert.equal(
      audit.candidates[0]?.exitAttribution.attributedExitReasonSessionCount,
      1,
    );
    assert.equal(
      audit.candidates[0]?.exitAttribution.missingExitReasonSessionCount,
      0,
    );
    assert.equal(
      audit.candidates[0]?.exitAttribution.missingExitReasonPnlKrw,
      0,
    );
    assert.equal(
      audit.candidates[0]?.exitAttributionSupplement.matchedMissingSessionCount,
      1,
    );
    assert.equal(
      audit.candidates[0]?.exitAttributionSupplement.matchedSellFillCount,
      1,
    );
    assert.equal(
      audit.candidates[0]?.exitAttributionSupplement.matchedPnlKrw,
      -100,
    );
    assert.equal(
      audit.candidates[0]?.exitAttributionSupplement.remainingMissingSessionCount,
      0,
    );
    assert.deepEqual(
      audit.candidates[0]?.exitAttributionSupplement.reasonSummary
        .EXIT_TIME_STOP_15M,
      {
        sessionCount: 1,
        totalPnlKrw: -100,
        avgPnlKrw: -100,
        losingSessions: 1,
        profitableSessions: 0,
      },
    );
    assert.equal(audit.candidates[0]?.exitRisk.worstExitReason, null);
    assert.equal(
      audit.candidates[0]?.evidenceGaps.failedChecks.includes(
        "noMissingExitReasonAttribution",
      ),
      false,
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.missingExitReasonLabels,
      [],
    );
    assert.deepEqual(
      audit.recommendation.blockerSummary.materialLosingExitReasonLabels,
      [],
    );
    assert.equal(
      audit.recommendation.decisionSummary.primaryBlockers.includes(
        "exit_reason_attribution_gap",
      ),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit can fail when observation evidence is unavailable", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-observation-audit-gate-"));
  try {
    const candidateRoot = join(directory, "candidate");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 950,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--require-observation-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 4);
    assert.match(result.stderr, /observation evidence is not ready/u);
    const audit = JSON.parse(result.stdout) as {
      recommendation: {
        decisionSummary: {
          observationHealth: {
            state: string;
            cycleEvidenceUnavailableLabels: string[];
          };
        };
        promotionGates: {
          observationReady: {
            passed: boolean;
            blockingLabels: string[];
          };
        };
      };
    };
    assert.equal(
      audit.recommendation.decisionSummary.observationHealth.state,
      "unavailable",
    );
    assert.deepEqual(
      audit.recommendation.decisionSummary.observationHealth
        .cycleEvidenceUnavailableLabels,
      ["candidate"],
    );
    assert.equal(
      audit.recommendation.promotionGates.observationReady.passed,
      false,
    );
    assert.deepEqual(
      audit.recommendation.promotionGates.observationReady.blockingLabels,
      ["candidate"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit can fail when no profitable paper candidate exists", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-paper-audit-gate-"));
  try {
    const candidateRoot = join(directory, "candidate");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 950,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--require-paper-candidate",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 3);
    assert.match(result.stderr, /no profitable paper candidate/u);
    const audit = JSON.parse(result.stdout) as {
      recommendation: {
        nextPaperCandidate: string | null;
        discardLabels: string[];
        observationOnlyLabels: string[];
      };
    };
    assert.equal(audit.recommendation.nextPaperCandidate, null);
    assert.deepEqual(audit.recommendation.discardLabels, []);
    assert.deepEqual(audit.recommendation.observationOnlyLabels, ["candidate"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit does not promote undersampled positive PnL to paper candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-paper-audit-sample-"));
  try {
    const candidateRoot = join(directory, "candidate");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 1_100,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TAKE_PROFIT"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--require-paper-candidate",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 3);
    assert.match(result.stderr, /no profitable paper candidate/u);
    const audit = JSON.parse(result.stdout) as {
      recommendation: {
        nextPaperCandidate: string | null;
        profitablePaperLabels: string[];
        observationOnlyLabels: string[];
        decisionSummary: {
          paper: string;
          evidenceTargets: {
            additionalClosedTradesNeededByLabel: Record<string, number>;
          };
        };
        nextPaperCandidateBasis: string;
      };
    };
    assert.equal(audit.recommendation.nextPaperCandidate, null);
    assert.deepEqual(audit.recommendation.profitablePaperLabels, []);
    assert.deepEqual(audit.recommendation.observationOnlyLabels, ["candidate"]);
    assert.equal(audit.recommendation.decisionSummary.paper, "blocked");
    assert.deepEqual(
      audit.recommendation.decisionSummary.evidenceTargets
        .additionalClosedTradesNeededByLabel,
      { candidate: 29 },
    );
    assert.match(audit.recommendation.nextPaperCandidateBasis, /30 closed trades/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit can write the audit JSON to an artifact path", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-audit-output-"));
  try {
    const candidateRoot = join(directory, "candidate");
    const outputPath = join(directory, "artifacts", "audit.json");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 1_100,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0);
    assert.equal(readFileSync(outputPath, "utf8"), result.stdout);
    const audit = JSON.parse(result.stdout) as {
      recommendation: {
        liveReadyLabels: string[];
      };
    };
    assert.deepEqual(audit.recommendation.liveReadyLabels, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit can attach entry-filter replay supplements", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-audit-entry-replay-"));
  try {
    const candidateRoot = join(directory, "candidate");
    const supplementPath = join(directory, "entry-replay-audit.json");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 900,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
      exitReasonCodes: ["EXIT_TIME_STOP_15M"],
    });
    writeJson(supplementPath, {
      generatedAt: "2026-05-11T13:10:48.173Z",
      candidates: [
        {
          label: "replay",
          sessionCount: 718,
          tradedSessionCount: 63,
          closedTradeCount: 23,
          totalPnlKrw: -8250.440276,
          closedTradePnlKrw: -2835.265704,
        },
      ],
      recommendation: {
        liveReadyLabels: [],
        profitablePaperLabels: [],
        nextPaperCandidate: null,
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--entry-filter-replay-supplement",
        `candidate=${supplementPath}`,
        "--summary-only",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const audit = JSON.parse(output) as {
      candidates: Array<{
        entryFilterReplaySupplement: {
          invalidatesReplayCandidate: boolean;
          replayCandidates: Array<{ totalPnlKrw: number | null }>;
        };
      }>;
    };

    assert.equal(
      audit.candidates[0]?.entryFilterReplaySupplement.invalidatesReplayCandidate,
      true,
    );
    assert.equal(
      audit.candidates[0]?.entryFilterReplaySupplement.replayCandidates[0]
        ?.totalPnlKrw,
      -8250.440276,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live candidate audit summary keeps full artifact output", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-audit-summary-"));
  try {
    const candidateRoot = join(directory, "candidate");
    const outputPath = join(directory, "artifacts", "audit.json");
    mkdirSync(candidateRoot, { recursive: true });
    writeReport(candidateRoot, "run-a", {
      sessionId: "candidate-a",
      initialEquityKrw: 1_000,
      endingEquityKrw: 1_100,
      btcInitialPriceKrw: 100,
      btcEndingPriceKrw: 100,
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-candidates.js",
        "--candidate",
        `candidate=${candidateRoot}`,
        "--summary-only",
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0);
    const summary = JSON.parse(result.stdout) as {
      candidates: Array<{
        label: string;
        auditDisposition: string;
        exitRisk: {
          worstExitReason: string | null;
        };
        exitAttribution: {
          missingExitReasonSessionCount: number;
        };
        feeHurdle: {
          wouldStillLoseWithoutFees: boolean | null;
        } | null;
        entryOpportunity: {
          classification: string;
          supportsLooseningEntry: boolean;
        };
      }>;
      recommendation: {
        liveReadyLabels: string[];
        decisionSummary: {
          live: string;
          paper: string;
          observationHealth: {
            state: string;
            cycleEvidenceUnavailableLabels: string[];
          };
          evidenceTargets: {
            maxAdditionalClosedTradesNeeded: number;
          };
          entryGateChange: string;
        };
      };
    };
    const fullAudit = JSON.parse(readFileSync(outputPath, "utf8")) as {
      candidates: Array<{
        suppressedOpportunity: {
          sampleCount: number;
        };
      }>;
      recommendation: {
        liveReadyLabels: string[];
      };
    };

    assert.notEqual(readFileSync(outputPath, "utf8"), result.stdout);
    assert.equal(summary.candidates[0]?.label, "candidate");
    assert.equal(summary.candidates[0]?.auditDisposition, "observation_only");
    assert.equal(summary.candidates[0]?.exitRisk.worstExitReason, null);
    assert.equal(
      summary.candidates[0]?.exitAttribution.missingExitReasonSessionCount,
      0,
    );
    assert.equal(
      summary.candidates[0]?.feeHurdle?.wouldStillLoseWithoutFees,
      false,
    );
    assert.equal(
      summary.candidates[0]?.entryOpportunity.classification,
      "no_suppressed_samples",
    );
    assert.equal(
      summary.candidates[0]?.entryOpportunity.supportsLooseningEntry,
      false,
    );
    assert.deepEqual(summary.recommendation.liveReadyLabels, []);
    assert.equal(summary.recommendation.decisionSummary.live, "blocked");
    assert.equal(summary.recommendation.decisionSummary.paper, "blocked");
    assert.equal(
      summary.recommendation.decisionSummary.observationHealth.state,
      "unavailable",
    );
    assert.deepEqual(
      summary.recommendation.decisionSummary.observationHealth
        .cycleEvidenceUnavailableLabels,
      ["candidate"],
    );
    assert.equal(
      summary.recommendation.decisionSummary.evidenceTargets
        .maxAdditionalClosedTradesNeeded,
      30,
    );
    assert.equal(
      summary.recommendation.decisionSummary.entryGateChange,
      "blocked_no_positive_suppressed_expectancy",
    );
    assert.equal(fullAudit.candidates[0]?.suppressedOpportunity.sampleCount, 0);
    assert.deepEqual(fullAudit.recommendation.liveReadyLabels, []);
    assert.equal(Object.hasOwn(summary.candidates[0] ?? {}, "suppressedOpportunity"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
