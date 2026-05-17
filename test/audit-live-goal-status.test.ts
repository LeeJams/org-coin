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

function writeMin75Readiness(
  path: string,
  overrides: {
    generatedAt?: string;
    classification?: string;
    liveReady?: boolean;
    liveChecks?: Record<string, boolean>;
    openPnlKrw?: number;
    openReturnPct?: number;
    stressExcessReturnVsBuyHoldPct?: number;
  } = {},
): void {
  const liveReady = overrides.liveReady ?? false;
  const openPnlKrw = overrides.openPnlKrw ?? -738.25;
  const openReturnPct = overrides.openReturnPct ?? -0.14765;
  writeJson(path, {
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
    strategyAssessment: {
      classification: overrides.classification ?? "paper_candidate",
    },
    candidate: {
      market: "KRW-BTC",
      signalMode: "momentum",
      unitMinutes: 240,
      minReturnBps: 75,
    },
    benchmarkSummary: {
      strategyReturnPct: 170.504416,
      excessReturnVsBuyHoldPct: 69.35671,
      feeRoundTripBps: 20,
    },
    ...(overrides.stressExcessReturnVsBuyHoldPct === undefined
      ? {}
      : {
          stressBenchmarkSummary: {
            tradeCount: 112,
            strategyReturnPct: 93.728474,
            buyHoldReturnPct: 102.023263,
            excessReturnVsBuyHoldPct: overrides.stressExcessReturnVsBuyHoldPct,
            maxDrawdownPct: -19.410288,
            feeRoundTripBps: 50,
          },
        }),
    liveReadiness: {
      ready: liveReady,
      reasons: liveReady
        ? []
        : [
            "realizedExitAvailable",
            "noOpenPaperPositionAfterExit",
            "positiveRealizedPaperExitPnl",
          ],
      checks: {
        realizedExitAvailable: liveReady,
        noOpenPaperPositionAfterExit: liveReady,
        positiveRealizedPaperExitPnl: liveReady,
        ...(overrides.liveChecks ?? {}),
      },
    },
    paperReadiness: {
      ready: !liveReady,
      reasons: [],
      checks: {},
    },
    openPosition: liveReady
      ? null
      : {
          holdElapsed: false,
          holdExitDueAt: "2026-05-16T11:00:00.000Z",
          estimatedExitNetPnlKrw: openPnlKrw,
          estimatedExitReturnPct: openReturnPct,
        },
  });
}

function writeLegacyAudit(path: string): void {
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    candidates: [
      {
        label: "trend",
        liveReady: false,
        tradedPnlKrw: -10358.88,
        closedTradePnlKrw: -8280.67,
      },
    ],
    recommendation: {
      liveReadyLabels: [],
      nextPaperCandidate: null,
      decisionSummary: {
        live: "blocked",
        paper: "blocked",
        primaryBlockers: ["no_live_ready_candidate", "negative_traded_pnl"],
      },
      blockerSummary: {
        negativeTradedPnlLabels: ["trend"],
        negativeClosedPnlLabels: ["trend"],
      },
    },
  });
}

function writeReplacementScan(
  path: string,
  promotionCandidateCount: number,
  generatedAt = new Date().toISOString(),
): void {
  const promotionCandidate = {
    market: "KRW-H",
    lookbackBars: 168,
    holdBars: 24,
    minReturnBps: 10,
    riskFilter: "range24_below_p70",
    train: {
      count: 57,
      totalPnlKrw: 275_046.762092,
      medianPnlKrw: 1_173.913043,
    },
    test: {
      count: 38,
      totalPnlKrw: 470_347.437187,
      medianPnlKrw: 2_906.25,
    },
    walkForward: {
      positiveTotalFoldCount: 5,
      positiveMedianFoldCount: 4,
      minFoldPnlKrw: 30_740.250336,
    },
  };
  writeJson(path, {
    generatedAt,
    assumptions: {
      feeRoundTripBps: 50,
    },
    candidateCount: 96,
    promotionCandidateCount,
    promotionCandidates: promotionCandidateCount > 0 ? [promotionCandidate] : [],
    topByTest: [
      {
        market: "KRW-OSMO",
        lookbackBars: 72,
        holdBars: 24,
        minReturnBps: 0,
        train: {
          count: 137,
          totalPnlKrw: 697_758.701353,
          medianPnlKrw: -5_324.858757,
        },
        test: {
          count: 60,
          totalPnlKrw: 740_987.211973,
          medianPnlKrw: 1_647.083218,
        },
        walkForward: {
          positiveTotalFoldCount: 2,
          positiveMedianFoldCount: 2,
          minFoldPnlKrw: -351_688.111717,
        },
      },
    ],
  });
}

function writeSingleMarketReplacementScan(path: string, generatedAt = new Date().toISOString()): void {
  writeJson(path, {
    generatedAt,
    assumptions: {
      market: "KRW-STABLE",
      feeRoundTripBps: 20,
    },
    candidateCount: 272,
    promotionCandidateCount: 1,
    promotionCandidates: [
      {
        lookbackBars: 24,
        holdBars: 24,
        minReturnBps: 50,
        riskFilter: "none",
        train: {
          count: 77,
          totalPnlKrw: 3279.965989,
          medianPnlKrw: 34.887781,
        },
        test: {
          count: 35,
          totalPnlKrw: 2349.798696,
          medianPnlKrw: 19.68508,
        },
        walkForward: {
          positiveTotalFoldCount: 5,
          positiveMedianFoldCount: 5,
          minFoldPnlKrw: 18.727564,
        },
      },
    ],
    topByTest: [
      {
        lookbackBars: 24,
        holdBars: 24,
        minReturnBps: 50,
        riskFilter: "none",
        train: {
          count: 77,
          totalPnlKrw: 3279.965989,
          medianPnlKrw: 34.887781,
        },
        test: {
          count: 35,
          totalPnlKrw: 2349.798696,
          medianPnlKrw: 19.68508,
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

function writeReplacementReadiness(
  path: string,
  overrides: {
    liveReady?: boolean;
    generatedAt?: string;
    classification?: string;
    market?: string;
    strategyReturnPct?: number;
    testMedianPnlKrw?: number;
    testTotalPnlKrw?: number;
    walkForwardMinFoldPnlKrw?: number;
    liveReasons?: string[];
    liveChecks?: Record<string, boolean>;
    paperChecks?: Record<string, boolean>;
    inputs?: {
      observationPath?: string;
      paperObservationPath?: string;
    };
  } = {},
): void {
  const liveReady = overrides.liveReady ?? true;
  const market = overrides.market ?? "KRW-H";
  writeJson(path, {
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
    inputs: overrides.inputs,
    strategyAssessment: {
      classification: overrides.classification ?? (liveReady ? "live_candidate" : "paper_candidate"),
    },
    candidate: {
      market,
      signalMode: "momentum",
      unitMinutes: 60,
      lookbackBars: 168,
      holdBars: 24,
      minReturnBps: 0,
      riskFilter: "range24_below_p70",
    },
    benchmarkSummary: {
      tradeCount: 95,
      strategyReturnPct: overrides.strategyReturnPct ?? 3.681078,
      excessReturnVsBuyHoldPct: 2.716002,
      feeRoundTripBps: 20,
      test: {
        totalPnlKrw: overrides.testTotalPnlKrw ?? 470_347.437187,
        medianPnlKrw: overrides.testMedianPnlKrw ?? 2_906.25,
      },
      walkForward: {
        positiveTotalFoldCount: 5,
        positiveMedianFoldCount: 4,
        minFoldPnlKrw: overrides.walkForwardMinFoldPnlKrw ?? 30_740.250336,
      },
    },
    paperReadiness: {
      ready: liveReady,
      reasons: liveReady ? [] : overrides.liveReasons ?? ["positiveRealizedPaperExitPnl"],
      checks: overrides.paperChecks ?? {},
    },
    liveReadiness: {
      ready: liveReady,
      reasons: liveReady ? [] : overrides.liveReasons ?? ["positiveRealizedPaperExitPnl"],
      checks: overrides.liveChecks ?? {},
    },
    openPosition: null,
  });
}

function writeDataCoverage(path: string, fresh: boolean): void {
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    status: fresh ? "fresh" : "blocked",
    fresh,
    blockers: fresh ? [] : ["KRW-ETH:orderbook_snapshot:staleLatestTimestamp"],
  });
}

function writeSpotPerpCarryReport(
  path: string,
  overrides: { promotionEligible?: boolean } = {},
): void {
  const promotionEligible = overrides.promotionEligible ?? false;
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    status: promotionEligible ? "promotion_candidate" : "blocked",
    promotionEligible,
    blockers: promotionEligible
      ? []
      : [
          "insufficientCompletedFundingEvents",
          "weakMedianNetCarry",
          "lowPositiveCarryRate",
        ],
    checklist: {
      sufficientObservations: promotionEligible,
      completedFundingEvents: promotionEligible,
      positiveMedianNetCarry: promotionEligible,
      positiveCarryRate: promotionEligible,
      depthCoverageReady: true,
    },
    measurementScope: {
      liveReady: "not_assessed_by_this_measurement_cli",
    },
    summary: {
      count: promotionEligible ? 24 : 6,
      supportedFundingCount: promotionEligible ? 24 : 6,
      completedFundingCount: promotionEligible ? 8 : 0,
      positiveCount: promotionEligible ? 18 : 0,
      positiveRate: promotionEligible ? 0.75 : 0,
      depthCoverageRate: 1,
      medianNetCarryBps: promotionEligible ? 14.25 : -37.25,
      totalEstimatedNetPnlKrw: promotionEligible ? 17_500 : -13_199.436772,
    },
    topCarry: [
      {
        market: "KRW-BTC",
        symbol: "BTCUSDT",
        fundingBps: 0.5116,
        fundingCompleted: promotionEligible,
        basisEntryEdgeBps: promotionEligible ? 33.8 : -12.283675,
        netCarryBps: promotionEligible ? 14.3116 : -31.772075,
        estimatedNetPnlKrw: promotionEligible ? 715.58 : -1588.603737,
        depthCovered: true,
      },
    ],
  });
}

function writeCrossExchangeReadiness(
  path: string,
  overrides: {
    liveReady?: boolean;
    blockers?: string[];
    checklist?: Record<string, boolean>;
  } = {},
): void {
  const liveReady = overrides.liveReady ?? false;
  const blockers =
    overrides.blockers ??
    (liveReady
      ? []
      : [
          "operationalProofClean",
          "accountFeesConfirmed",
          "inventoryReady",
          "hedgeVenueReady",
        ]);
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    liveReady,
    blockers,
    checklist: {
      reportPresent: true,
      bestEdgeDirectionKnown: true,
      globalReferenceVenue: true,
      sufficientObservations: true,
      observationSpanSufficient: true,
      positiveEdgeRate: true,
      positiveMedianNetEdge: true,
      positiveEstimatedNetPnl: true,
      depthCoverageReady: true,
      latestObservationFresh: true,
      fxFresh: true,
      snapshotSkewControlled: true,
      executionPathReady: true,
      operationalProofPresent: true,
      operationalProofFresh: true,
      operationalProofClean: liveReady,
      accountFeesConfirmed: liveReady,
      inventoryReady: liveReady,
      hedgeVenueReady: liveReady,
      ...(overrides.checklist ?? {}),
    },
    candidate: {
      notionalKrw: 50_000,
      referenceVenue: "binance",
      direction: "sell_bithumb_buy_reference",
      medianNetEdgeBps: 42.739405,
      positiveRate: 1,
      depthCoverageRate: 0.980198,
      totalEstimatedNetPnlKrw: 21_644.429254,
    },
    operationalProofSummary: {
      accountFeesConfirmed: liveReady,
      hedgeVenueReady: liveReady,
      requirements: {
        bithumbBaseInventoryKrw: 50_000,
        bithumbQuoteInventoryKrw: 0,
        referenceBaseInventoryKrw: 0,
        referenceQuoteInventoryKrw: 50_050,
      },
      inventory: {
        bithumbBaseInventoryKrw: liveReady ? 50_000 : 0,
        referenceQuoteInventoryKrw: liveReady ? 50_050 : 0,
      },
      deficits: {
        bithumbBaseDeficitKrw: liveReady ? 0 : 50_000,
        referenceQuoteDeficitKrw: liveReady ? 0 : 50_050,
      },
      reasons: liveReady ? [] : ["credentialsMissing"],
    },
    interpretation: liveReady
      ? "Operational proof is clean."
      : "Do not live-trade this candidate. Resolve every blocker with fresh evidence before promotion.",
  });
}

function writeExtendedThresholdReplacementScan(path: string): void {
  writeJson(path, {
    generatedAt: new Date().toISOString(),
    assumptions: {
      market: "KRW-BTC",
      feeRoundTripBps: 50,
    },
    candidateCount: 1036,
    promotionCandidateCount: 0,
    promotionCandidates: [],
    nearMiss: [
      {
        lookbackBars: 48,
        holdBars: 36,
        minReturnBps: 300,
        riskFilter: "rv24_below_p70",
        tradeCount: 63,
        returnPct: 145.196727,
        buyHoldReturnPct: 101.770165,
        excessReturnVsBuyHoldPct: 43.426562,
        maxDrawdownPct: -12.871122,
        passesPromotion: false,
        train: {
          count: 46,
          totalPnlKrw: 442_877.25929,
          medianPnlKrw: 5_506.69128,
        },
        test: {
          count: 17,
          totalPnlKrw: 49_815.676004,
          medianPnlKrw: 1_867.588335,
        },
        walkForward: {
          positiveTotalFoldCount: 5,
          positiveMedianFoldCount: 3,
          minFoldPnlKrw: 30_046.186531,
        },
      },
    ],
  });
}

test("live goal status reports the current min75 paper candidate as blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-blocked-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const outputPath = join(directory, "goal-status.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      status: string;
      liveReady: boolean;
      blockers: string[];
      completionAudit: {
        achieved: boolean;
        criteria: Array<{ id: string; criterion: string; passed: boolean }>;
        failedCompletionCriteria: string[];
        missingRequirements: string[];
      };
      min75: { liveReady: boolean; openPosition: unknown };
      nextActionPlan: Array<{
        track: string;
        action: string;
        earliestReviewAt: string | null;
        verificationCommand: string;
        currentEvidence: {
          evidenceType: string;
          estimatedOpenPnlKrw: number | null;
          usableForLivePromotion: boolean;
        };
      }>;
      profitabilitySnapshot: {
        leadingPaperMark: {
          strategy: string;
          estimatedExitNetPnlKrw: number;
          estimatedExitReturnPct: number;
          usableForLivePromotion: boolean;
          requiredBeforeLive: string[];
        };
        rejectedEvidence: {
          legacy: {
            tradedPnlKrw: number;
            closedTradePnlKrw: number;
            usableForLivePromotion: boolean;
          };
        };
      };
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.liveReady, false);
    assert.equal(report.completionAudit.achieved, false);
    assert.ok(report.completionAudit.failedCompletionCriteria.length > 0);
    assert.ok(report.completionAudit.criteria.every((criterion) => criterion.id.length > 0));
    assert.deepEqual(
      report.completionAudit.failedCompletionCriteria,
      report.completionAudit.criteria
        .filter((criterion) => criterion.passed !== true)
        .map((criterion) => criterion.id),
    );
    assert.ok(
      report.completionAudit.failedCompletionCriteria.includes(
        "profitability_evidence_satisfied",
      ),
    );
    assert.ok(
      report.completionAudit.failedCompletionCriteria.includes(
        "candidate_selected_from_current_evidence",
      ),
    );
    assert.ok(
      report.completionAudit.failedCompletionCriteria.includes(
        "live_startup_gate_allowed",
      ),
    );
    assert.equal(
      report.completionAudit.criteria.find((criterion) =>
        criterion.id === "candidate_selected_from_current_evidence"
      )?.passed,
      false,
    );
    assert.equal(
      report.completionAudit.criteria.find((criterion) =>
        criterion.id === "live_startup_gate_allowed"
      )?.passed,
      false,
    );
    assert.equal(report.nextActionPlan[0]?.track, "btc_240m_momentum_min75");
    assert.equal(report.nextActionPlan[0]?.action, "wait_for_realized_reduce_only_exit");
    assert.equal(report.nextActionPlan[0]?.earliestReviewAt, "2026-05-16T11:00:00.000Z");
    assert.equal(report.nextActionPlan[0]?.currentEvidence.evidenceType, "open_paper_mark");
    assert.equal(report.nextActionPlan[0]?.currentEvidence.estimatedOpenPnlKrw, -738.25);
    assert.equal(report.nextActionPlan[0]?.currentEvidence.usableForLivePromotion, false);
    assert.equal(
      report.nextActionPlan[0]?.verificationCommand,
      "npm run dry-run:gate-btc-240m-min75-live-ready",
    );
    assert.equal(
      report.completionAudit.criteria.find((criterion) =>
        criterion.criterion.includes("positive realized"),
      )?.passed,
      false,
    );
    assert.deepEqual(report.completionAudit.missingRequirements, report.blockers);
    assert.equal(report.min75.liveReady, false);
    assert.notEqual(report.min75.openPosition, null);
    assert.equal(report.profitabilitySnapshot.leadingPaperMark.strategy, "btc_240m_momentum_min75");
    assert.equal(report.profitabilitySnapshot.leadingPaperMark.estimatedExitNetPnlKrw, -738.25);
    assert.equal(report.profitabilitySnapshot.leadingPaperMark.estimatedExitReturnPct, -0.14765);
    assert.equal(report.profitabilitySnapshot.leadingPaperMark.usableForLivePromotion, false);
    assert.ok(
      report.profitabilitySnapshot.leadingPaperMark.requiredBeforeLive.includes(
        "positiveRealizedPaperExitPnl",
      ),
    );
    assert.equal(report.profitabilitySnapshot.rejectedEvidence.legacy.tradedPnlKrw, -10358.88);
    assert.equal(report.profitabilitySnapshot.rejectedEvidence.legacy.closedTradePnlKrw, -8280.67);
    assert.equal(report.profitabilitySnapshot.rejectedEvidence.legacy.usableForLivePromotion, false);
    assert.deepEqual(report.blockers, [
      "min75LiveReady",
      "realizedExitAvailable",
      "noOpenPaperPositionAfterExit",
      "positiveRealizedPaperExitPnl",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status promotes cross-exchange evidence to the leading blocked candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-cross-blocked-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const crossExchangePath = join(directory, "cross-exchange-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeCrossExchangeReadiness(crossExchangePath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--cross-exchange-readiness",
        crossExchangePath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      liveReady: boolean;
      selectedCandidate: { type: string };
      blockers: string[];
      checklist: Record<string, boolean>;
      crossExchange: {
        strategyEvidenceReady: boolean;
        liveReady: boolean;
        operationalProofSummary: {
          requirements: { referenceQuoteInventoryKrw: number };
          deficits: { referenceQuoteDeficitKrw: number };
        };
        candidate: { referenceVenue: string; notionalKrw: number };
      };
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.liveReady, false);
    assert.equal(report.selectedCandidate.type, "cross_exchange_relative_value");
    assert.equal(report.checklist.crossExchangeStrategyEvidenceReady, true);
    assert.equal(report.checklist.crossExchangeLiveReady, false);
    assert.equal(report.crossExchange.strategyEvidenceReady, true);
    assert.equal(report.crossExchange.liveReady, false);
    assert.equal(
      report.crossExchange.operationalProofSummary.requirements.referenceQuoteInventoryKrw,
      50_050,
    );
    assert.equal(
      report.crossExchange.operationalProofSummary.deficits.referenceQuoteDeficitKrw,
      50_050,
    );
    assert.equal(report.crossExchange.candidate.referenceVenue, "binance");
    assert.equal(report.crossExchange.candidate.notionalKrw, 50_000);
    assert.deepEqual(report.blockers, [
      "crossExchangeLiveReady",
      "crossExchange:operationalProofClean",
      "crossExchange:accountFeesConfirmed",
      "crossExchange:inventoryReady",
      "crossExchange:hedgeVenueReady",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status keeps cross-exchange selected while blocking short evidence spans", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-cross-short-span-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const crossExchangePath = join(directory, "cross-exchange-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeCrossExchangeReadiness(crossExchangePath, {
      blockers: [
        "observationSpanSufficient",
        "operationalProofClean",
        "accountFeesConfirmed",
        "inventoryReady",
        "hedgeVenueReady",
      ],
      checklist: {
        observationSpanSufficient: false,
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--cross-exchange-readiness",
        crossExchangePath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string };
      checklist: Record<string, boolean>;
      blockers: string[];
      crossExchange: {
        candidateEvidenceReady: boolean;
        strategyEvidenceReady: boolean;
      };
    };
    assert.equal(report.selectedCandidate.type, "cross_exchange_relative_value");
    assert.equal(report.checklist.crossExchangeCandidateEvidenceReady, true);
    assert.equal(report.checklist.crossExchangeStrategyEvidenceReady, false);
    assert.equal(report.crossExchange.candidateEvidenceReady, true);
    assert.equal(report.crossExchange.strategyEvidenceReady, false);
    assert.ok(report.blockers.includes("crossExchangeStrategyEvidenceReady"));
    assert.ok(report.blockers.includes("crossExchange:observationSpanSufficient"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status accepts cross-exchange live readiness without waiting on stale legacy research data", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-cross-ready-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const crossExchangePath = join(directory, "cross-exchange-readiness.json");
    const dataCoveragePath = join(directory, "data-coverage.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeCrossExchangeReadiness(crossExchangePath, { liveReady: true });
    writeDataCoverage(dataCoveragePath, false);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--cross-exchange-readiness",
        crossExchangePath,
        "--data-coverage",
        dataCoveragePath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      liveReady: boolean;
      selectedCandidate: { type: string };
      blockers: string[];
      dataCoverage: { fresh: boolean };
    };
    assert.equal(report.status, "live_ready");
    assert.equal(report.liveReady, true);
    assert.equal(report.selectedCandidate.type, "cross_exchange_relative_value");
    assert.deepEqual(report.blockers, []);
    assert.equal(report.dataCoverage.fresh, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status does not let blocked cross-exchange evidence override live-ready min75", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-cross-blocked-min75-ready-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const crossExchangePath = join(directory, "cross-exchange-readiness.json");
    writeMin75Readiness(min75Path, {
      classification: "live_candidate",
      liveReady: true,
    });
    writeLegacyAudit(legacyPath);
    writeCrossExchangeReadiness(crossExchangePath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--cross-exchange-readiness",
        crossExchangePath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      liveReady: boolean;
      selectedCandidate: { type: string };
      blockers: string[];
      crossExchange: { candidateEvidenceReady: boolean; liveReady: boolean };
    };
    assert.equal(report.status, "live_ready");
    assert.equal(report.liveReady, true);
    assert.equal(report.selectedCandidate.type, "btc_240m_momentum_min75");
    assert.deepEqual(report.blockers, []);
    assert.equal(report.crossExchange.candidateEvidenceReady, true);
    assert.equal(report.crossExchange.liveReady, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status keeps profitable cross-exchange evidence selected when execution path is blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-cross-execution-blocked-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const crossExchangePath = join(directory, "cross-exchange-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeCrossExchangeReadiness(crossExchangePath, {
      blockers: [
        "executionPathReady",
        "operationalProofClean",
        "accountFeesConfirmed",
        "inventoryReady",
        "hedgeVenueReady",
      ],
      checklist: {
        executionPathReady: false,
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--cross-exchange-readiness",
        crossExchangePath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string };
      checklist: Record<string, boolean>;
      blockers: string[];
      crossExchange: {
        strategyEvidenceReady: boolean;
        checklist: Record<string, boolean>;
      };
    };
    assert.equal(report.selectedCandidate.type, "cross_exchange_relative_value");
    assert.equal(report.checklist.crossExchangeStrategyEvidenceReady, true);
    assert.equal(report.crossExchange.strategyEvidenceReady, true);
    assert.equal(report.crossExchange.checklist.executionPathReady, false);
    assert.ok(report.blockers.includes("crossExchange:executionPathReady"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status exits nonzero when live readiness is required but blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-require-blocked-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    assert.match(result.stdout, /"status": "blocked"/);
    assert.match(result.stdout, /"min75LiveReady"/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status accepts a fully realized min75 live candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-ready-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    writeMin75Readiness(min75Path, {
      classification: "live_candidate",
      liveReady: true,
    });
    writeLegacyAudit(legacyPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      liveReady: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
    };
    assert.equal(report.status, "live_ready");
    assert.equal(report.liveReady, true);
    assert.deepEqual(report.blockers, []);
    assert.ok(Object.values(report.checklist).every(Boolean));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status can attach rejected replacement research scans", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-research-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementPath = join(directory, "replacement-scan.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeReplacementScan(replacementPath, 0);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        replacementPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      replacementResearch: {
        scanCount: number;
        noPromotionCandidates: boolean;
        latestScanHasNoPromotionCandidate: boolean;
        supersededPromotionCandidateCount: number;
        nextCandidate: unknown;
        scans: Array<{
          feeRoundTripBps: number;
          sourceReady: boolean | null;
          sourceFailureCount: number | null;
          sourceFailures: Array<{
            market: string;
            passiveSnapshotCount: number;
            orderbookSnapshotCount: number;
            reason: string;
          }>;
          promotionCandidateCount: number;
          topPromotionCandidate: unknown;
          topByTest: {
            market: string;
            train: { medianPnlKrw: number };
            walkForward: { minFoldPnlKrw: number };
          };
        }>;
      };
    };
    assert.equal(report.replacementResearch.scanCount, 1);
    assert.equal(report.replacementResearch.noPromotionCandidates, true);
    assert.equal(report.replacementResearch.latestScanHasNoPromotionCandidate, true);
    assert.equal(report.replacementResearch.supersededPromotionCandidateCount, 0);
    assert.equal(report.replacementResearch.nextCandidate, null);
    assert.equal(report.replacementResearch.scans[0]?.feeRoundTripBps, 50);
    assert.equal(report.replacementResearch.scans[0]?.sourceReady, null);
    assert.equal(report.replacementResearch.scans[0]?.sourceFailureCount, null);
    assert.deepEqual(report.replacementResearch.scans[0]?.sourceFailures, []);
    assert.equal(report.replacementResearch.scans[0]?.promotionCandidateCount, 0);
    assert.equal(report.replacementResearch.scans[0]?.topPromotionCandidate, null);
    assert.equal(report.replacementResearch.scans[0]?.topByTest.market, "KRW-OSMO");
    assert.equal(report.replacementResearch.scans[0]?.topByTest.train.medianPnlKrw, -5_324.858757);
    assert.equal(report.replacementResearch.scans[0]?.topByTest.walkForward.minFoldPnlKrw, -351_688.111717);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status preserves replacement scan source coverage failures", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-source-coverage-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementPath = join(directory, "replacement-scan.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(replacementPath, {
      generatedAt: new Date().toISOString(),
      assumptions: { feeRoundTripBps: 50 },
      sourceReady: false,
      sourceFailureCount: 1,
      sourceFailures: [
        {
          market: "KRW-SOL",
          passiveSnapshotCount: 0,
          orderbookSnapshotCount: 0,
          reason: "passive snapshot count is below 100",
        },
      ],
      candidateCount: 320,
      promotionCandidateCount: 0,
      promotionCandidates: [],
      topByTest: [],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        replacementPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      replacementResearch: {
        scans: Array<{
          sourceReady: boolean | null;
          sourceFailureCount: number | null;
          sourceFailures: Array<{
            market: string;
            passiveSnapshotCount: number;
            orderbookSnapshotCount: number;
            reason: string;
          }>;
          promotionCandidateCount: number;
        }>;
      };
    };
    assert.equal(report.replacementResearch.scans[0]?.promotionCandidateCount, 0);
    assert.equal(report.replacementResearch.scans[0]?.sourceReady, false);
    assert.equal(report.replacementResearch.scans[0]?.sourceFailureCount, 1);
    assert.deepEqual(report.replacementResearch.scans[0]?.sourceFailures, [
      {
        market: "KRW-SOL",
        passiveSnapshotCount: 0,
        orderbookSnapshotCount: 0,
        reason: "passive snapshot count is below 100",
      },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status surfaces the next replacement research candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-next-research-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementPath = join(directory, "replacement-scan.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeReplacementScan(replacementPath, 1);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        replacementPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string };
      recommendedAction: string;
      blockers: string[];
      strategyDecision: {
        currentMode: string;
        leadingResearch: {
          market: string;
          action: string;
          evidenceType: string;
          missingBeforeLive: string[];
        };
        closestPaperPath: {
          strategy: string;
          action: string;
          evidenceType: string;
        };
        rejectedPaths: {
          legacy: { action: string; tradedPnlKrw: number };
        };
      };
      replacementResearch: {
        noPromotionCandidates: boolean;
        nextCandidate: {
          feeRoundTripBps: number;
          candidate: {
            market: string;
            lookbackBars: number;
            holdBars: number;
            minReturnBps: number;
            test: { medianPnlKrw: number };
            walkForward: { minFoldPnlKrw: number };
          };
        };
      };
    };
    assert.equal(report.selectedCandidate.type, "replacement_time_series_research");
    assert.match(report.recommendedAction, /observe replacement research KRW-H/);
    assert.ok(report.blockers.includes("replacementLiveReady"));
    assert.ok(report.blockers.includes("replacement:replacementReadinessReportMissing"));
    assert.equal(report.strategyDecision.currentMode, "live_blocked");
    assert.equal(report.strategyDecision.leadingResearch.market, "KRW-H");
    assert.equal(report.strategyDecision.leadingResearch.action, "continue_paper_only_observation");
    assert.equal(report.strategyDecision.leadingResearch.evidenceType, "historical_research_only");
    assert.ok(
      report.strategyDecision.leadingResearch.missingBeforeLive.includes(
        "replacementReadinessReportMissing",
      ),
    );
    assert.equal(report.strategyDecision.closestPaperPath.strategy, "btc_240m_momentum_min75");
    assert.equal(report.strategyDecision.closestPaperPath.action, "await_realized_reduce_only_exit");
    assert.equal(report.strategyDecision.closestPaperPath.evidenceType, "open_paper_mark");
    assert.equal(report.strategyDecision.rejectedPaths.legacy.action, "reject");
    assert.equal(report.strategyDecision.rejectedPaths.legacy.tradedPnlKrw, -10358.88);
    assert.equal(report.replacementResearch.noPromotionCandidates, false);
    assert.equal(report.replacementResearch.nextCandidate.feeRoundTripBps, 50);
    assert.equal(report.replacementResearch.nextCandidate.candidate.market, "KRW-H");
    assert.equal(report.replacementResearch.nextCandidate.candidate.lookbackBars, 168);
    assert.equal(report.replacementResearch.nextCandidate.candidate.holdBars, 24);
    assert.equal(report.replacementResearch.nextCandidate.candidate.minReturnBps, 10);
    assert.equal(report.replacementResearch.nextCandidate.candidate.test.medianPnlKrw, 2_906.25);
    assert.equal(
      report.replacementResearch.nextCandidate.candidate.walkForward.minFoldPnlKrw,
      30_740.250336,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status uses single-market scan assumptions as replacement candidate market", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-single-market-replacement-"));
  try {
    const min75Path = join(directory, "min75.json");
    const legacyPath = join(directory, "legacy.json");
    const replacementPath = join(directory, "single-market-replacement-scan.json");
    const outputPath = join(directory, "status.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSingleMarketReplacementScan(replacementPath);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        replacementPath,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout) as {
      recommendedAction: string;
      replacementResearch: {
        nextCandidate: {
          candidate: { market: string; test: { medianPnlKrw: number } };
        };
      };
    };
    assert.match(report.recommendedAction, /observe replacement research KRW-STABLE/);
    assert.equal(report.replacementResearch.nextCandidate.candidate.market, "KRW-STABLE");
    assert.equal(report.replacementResearch.nextCandidate.candidate.test.medianPnlKrw, 19.68508);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status surfaces extended BTC threshold near misses", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-extended-btc-"));
  try {
    const min75Path = join(directory, "min75.json");
    const legacyPath = join(directory, "legacy.json");
    const replacementPath = join(directory, "extended-btc-threshold-scan.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeExtendedThresholdReplacementScan(replacementPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        replacementPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      replacementResearch: {
        noPromotionCandidates: boolean;
        scans: Array<{
          promotionCandidateCount: number;
          topNearMiss: {
            market: string;
            lookbackBars: number;
            holdBars: number;
            minReturnBps: number;
            tradeCount: number;
            returnPct: number;
            buyHoldReturnPct: number;
            excessReturnVsBuyHoldPct: number;
            passesPromotion: boolean;
            walkForward: {
              positiveMedianFoldCount: number;
            };
          };
        }>;
      };
    };

    assert.equal(report.replacementResearch.noPromotionCandidates, true);
    const topNearMiss = report.replacementResearch.scans[0]?.topNearMiss;
    assert.equal(topNearMiss.market, "KRW-BTC");
    assert.equal(topNearMiss.lookbackBars, 48);
    assert.equal(topNearMiss.holdBars, 36);
    assert.equal(topNearMiss.minReturnBps, 300);
    assert.equal(topNearMiss.tradeCount, 63);
    assert.equal(topNearMiss.returnPct, 145.196727);
    assert.equal(topNearMiss.buyHoldReturnPct, 101.770165);
    assert.equal(topNearMiss.excessReturnVsBuyHoldPct, 43.426562);
    assert.equal(topNearMiss.passesPromotion, false);
    assert.equal(topNearMiss.walkForward.positiveMedianFoldCount, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status does not keep an older replacement promotion after a newer scan has none", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-newer-no-promotion-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const olderReplacementPath = join(directory, "live-compatible-older-replacement-scan.json");
    const newerReplacementPath = join(directory, "newer-replacement-scan.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeReplacementScan(olderReplacementPath, 1, "2026-05-13T00:00:00.000Z");
    writeReplacementScan(newerReplacementPath, 0, "2026-05-13T01:00:00.000Z");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        olderReplacementPath,
        "--replacement-scan",
        newerReplacementPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string };
      recommendedAction: string;
      replacementResearch: {
        noPromotionCandidates: boolean;
        latestScanHasNoPromotionCandidate: boolean;
        supersededPromotionCandidateCount: number;
        latestScan: {
          path: string;
          generatedAt: string;
          promotionCandidateCount: number;
          topPromotionCandidate: null;
        };
        nextCandidate: null;
        strongestPromotionCandidate: {
          sourcePath: string;
          feeRoundTripBps: number;
          candidate: { market: string; walkForward: { minFoldPnlKrw: number } };
        };
        strongestLiveCompatiblePromotionCandidate: {
          sourcePath: string;
          feeRoundTripBps: number;
          candidate: { market: string; walkForward: { minFoldPnlKrw: number } };
        };
      };
    };
    assert.equal(report.selectedCandidate.type, "btc_240m_momentum_min75");
    assert.match(report.recommendedAction, /continue min75 paper observation/);
    assert.equal(report.replacementResearch.latestScan.path, newerReplacementPath);
    assert.equal(report.replacementResearch.latestScan.generatedAt, "2026-05-13T01:00:00.000Z");
    assert.equal(report.replacementResearch.latestScan.promotionCandidateCount, 0);
    assert.equal(report.replacementResearch.latestScan.topPromotionCandidate, null);
    assert.equal(report.replacementResearch.noPromotionCandidates, false);
    assert.equal(report.replacementResearch.latestScanHasNoPromotionCandidate, true);
    assert.equal(report.replacementResearch.supersededPromotionCandidateCount, 1);
    assert.equal(report.replacementResearch.nextCandidate, null);
    assert.equal(report.replacementResearch.strongestPromotionCandidate.sourcePath, olderReplacementPath);
    assert.equal(report.replacementResearch.strongestPromotionCandidate.feeRoundTripBps, 50);
    assert.equal(report.replacementResearch.strongestPromotionCandidate.candidate.market, "KRW-H");
    assert.equal(
      report.replacementResearch.strongestPromotionCandidate.candidate.walkForward.minFoldPnlKrw,
      30_740.250336,
    );
    assert.equal(
      report.replacementResearch.strongestLiveCompatiblePromotionCandidate.sourcePath,
      olderReplacementPath,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status attaches spot-perp carry research without making it live-ready", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-carry-research-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath, { promotionEligible: true });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveReady: boolean;
      recommendedAction: string;
      carryResearch: {
        promotionEligible: boolean;
        summary: { completedFundingCount: number; medianNetCarryBps: number };
        measurementScope: { liveReady: string };
        topCarry: Array<{ market: string; netCarryBps: number }>;
        interpretation: string;
      };
    };
    assert.equal(report.liveReady, false);
    assert.match(report.recommendedAction, /continue min75 paper observation|observe replacement candidate/);
    assert.equal(report.carryResearch.promotionEligible, true);
    assert.equal(report.carryResearch.summary.completedFundingCount, 8);
    assert.equal(report.carryResearch.summary.medianNetCarryBps, 14.25);
    assert.equal(report.carryResearch.measurementScope.liveReady, "not_assessed_by_this_measurement_cli");
    assert.equal(report.carryResearch.topCarry[0]?.market, "KRW-BTC");
    assert.equal(report.carryResearch.topCarry[0]?.netCarryBps, 14.3116);
    assert.match(report.carryResearch.interpretation, /Research promotion candidate only/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status demotes negative rolling carry observation while funding windows are incomplete", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-carry-collecting-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveReady: boolean;
      nextActionPlan: Array<{
        priority: number;
        track: string;
        action: string;
        verificationCommand: string;
        currentEvidence: {
          completedFundingCount?: number;
          medianNetCarryBps?: number;
          usableForLivePromotion?: boolean;
        };
      }>;
    };
    assert.equal(report.liveReady, false);
    const carryAction = report.nextActionPlan.find(
      (action) => action.track === "spot_perp_carry_72h_observation",
    );
    assert.equal(carryAction?.priority, 2);
    assert.equal(
      carryAction?.action,
      "demote_negative_baseline_collect_only_do_not_promote",
    );
    assert.equal(carryAction?.currentEvidence.completedFundingCount, 0);
    assert.equal(carryAction?.currentEvidence.medianNetCarryBps, -37.25);
    assert.equal(carryAction?.currentEvidence.usableForLivePromotion, false);
    assert.match(
      carryAction?.verificationCommand ?? "",
      /dry-run:observe-spot-perp-carry-72h/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status surfaces positive spot-perp carry watch candidates without promoting them", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-carry-watch-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const watchPath = join(directory, "spot-perp-carry-edu.json");
    const tinyWatchPath = join(directory, "spot-perp-carry-tiny-pieverse.json");
    const broadDiscoveryPath = join(directory, "spot-perp-carry-broad-discovery.json");
    const currentEntryPath = join(
      directory,
      "spot-perp-carry-current-carry-discovery-25bps-current.json",
    );
    const feeStressPath = join(directory, "spot-perp-carry-opportunity-fee-stress-25bps.json");
    const carryLiveReadinessPath = join(directory, "spot-perp-carry-live-readiness.json");
    const carryLiveReadinessEduPath = join(
      directory,
      "spot-perp-carry-edu-live-readiness.json",
    );
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(watchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: [
        "insufficientObservations",
        "insufficientObservationSpan",
        "insufficientCompletedFundingEvents",
        "feeScheduleUnconfirmed",
        "inventoryNotReady",
        "hedgeVenueNotReady",
      ],
      checklist: {
        sufficientObservations: false,
        completedFundingEvents: false,
        positiveMedianNetCarry: true,
        positiveCarryRate: true,
        depthCoverageReady: true,
      },
      measurementScope: {
        liveReady: "not_assessed_by_this_measurement_cli",
      },
      summary: {
        count: 6,
        supportedFundingCount: 6,
        completedFundingCount: 1,
        positiveCount: 6,
        positiveRate: 1,
        depthCoverageRate: 1,
        medianNetCarryBps: 41.9,
        totalEstimatedNetPnlKrw: 12_600,
        executionEligibleCount: 6,
        executionEligibleRate: 1,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        executionEligiblePositiveCount: 6,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 41.5,
        executionEligibleTotalEstimatedNetPnlKrw: 12_540,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          count: 6,
          completedFundingCount: 2,
          executionEligibleCount: 6,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 41.5,
          executionEligibleTotalEstimatedNetPnlKrw: 12_540,
          depthCoverageRate: 1,
          watchDecision: {
            status: "collect_more_evidence",
            reasons: [],
            requiredBeforeMetricCandidate: [],
            killPolicy: {
              minCompletedFundingEventsBeforeKill: 2,
              minMedianNetCarryBps: 20,
            },
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          fundingBps: 43.2,
          fundingCompleted: true,
          basisEntryEdgeBps: 0.8,
          netCarryBps: 41.5,
          estimatedNetPnlKrw: 2_090,
          depthCovered: true,
        },
      ],
      topCarry: [
        {
          market: "KRW-META",
          symbol: "METAUSDT",
          fundingBps: 3.6,
          fundingCompleted: true,
          basisEntryEdgeBps: 625_033_666,
          netCarryBps: 625_033_649,
          estimatedNetPnlKrw: 31_251_682_494,
          depthCovered: true,
          spotSpreadBps: 61.5,
          perpSpreadBps: 0.8,
          usdtKrwSpreadBps: 6.7,
        },
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          fundingBps: 43.2,
          fundingCompleted: true,
          basisEntryEdgeBps: 0.8,
          netCarryBps: 41.5,
          estimatedNetPnlKrw: 2_090,
          depthCovered: true,
        },
      ],
    });
    writeJson(tinyWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: [
        "insufficientObservations",
        "insufficientObservationSpan",
        "insufficientCompletedFundingEvents",
      ],
	      summary: {
	        count: 8,
	        supportedFundingCount: 8,
	        completedFundingCount: 2,
	        positiveCount: 7,
	        positiveRate: 0.875,
	        depthCoverageRate: 1,
	        medianNetCarryBps: 120,
	        totalEstimatedNetPnlKrw: 6_000,
	        executionEligibleCount: 7,
	        executionEligibleRate: 0.875,
	        executionRejectedCount: 1,
	        executionRejectedRate: 0.125,
	        executionRejectionReasons: {
	          unsupportedFundingDirection: 0,
	          fundingNotCompleted: 0,
	          depthInsufficient: 0,
	          spotSpreadTooWide: 1,
	          perpSpreadTooWide: 0,
	          usdtKrwSpreadTooWide: 0,
	          rawNetCarryOutsideSanityBand: 0,
	        },
	        executionEligiblePositiveCount: 7,
	        executionEligiblePositiveRate: 1,
	        executionEligibleMedianNetCarryBps: 120,
	        executionEligibleTotalEstimatedNetPnlKrw: 6_000,
	        rawPricingArtifactCount: 0,
	        rawPricingArtifactEstimatedNetPnlKrw: 0,
	      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
	          count: 8,
	          completedFundingCount: 2,
	          executionEligibleMedianNetCarryBps: 120,
          executionEligibleTotalEstimatedNetPnlKrw: 6_000,
          depthCoverageRate: 1,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 120,
          estimatedNetPnlKrw: 6_000,
          depthCovered: true,
        },
      ],
    });
    writeJson(broadDiscoveryPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: [
        "insufficientObservations",
        "insufficientObservationSpan",
        "insufficientCompletedFundingEvents",
      ],
      summary: {
        count: 20,
        supportedFundingCount: 20,
        completedFundingCount: 2,
        positiveCount: 20,
        positiveRate: 1,
        depthCoverageRate: 1,
        medianNetCarryBps: 250,
        totalEstimatedNetPnlKrw: 12_500,
        executionEligibleCount: 20,
        executionEligibleRate: 1,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        executionEligiblePositiveCount: 20,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 250,
        executionEligibleTotalEstimatedNetPnlKrw: 12_500,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-NEWM",
          symbol: "NEWMUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleCount: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 250,
          executionEligibleTotalEstimatedNetPnlKrw: 12_500,
          depthCoverageRate: 1,
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
            requiredBeforeMetricCandidate: [],
            killPolicy: {
              minCompletedFundingEventsBeforeKill: 2,
              minMedianNetCarryBps: 20,
            },
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-NEWM",
          symbol: "NEWMUSDT",
          netCarryBps: 250,
          estimatedNetPnlKrw: 12_500,
          depthCovered: true,
        },
      ],
    });
    writeJson(currentEntryPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      usableForLivePromotion: false,
      blockers: ["currentEntryDiagnosticOnly"],
      summary: {
        count: 10,
        supportedFundingCount: 10,
        completedFundingCount: 0,
        positiveCount: 2,
        positiveRate: 0.2,
        depthCoverageRate: 1,
        medianNetCarryBps: -1.5,
        totalEstimatedNetPnlKrw: -750,
        executionEligibleCount: 4,
        executionEligibleRate: 0.4,
        executionRejectedCount: 6,
        executionRejectedRate: 0.6,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 6,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        executionEligiblePositiveCount: 2,
        executionEligiblePositiveRate: 0.5,
        executionEligibleMedianNetCarryBps: 18.5,
        executionEligibleTotalEstimatedNetPnlKrw: 0,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 10,
          completedFundingCount: 0,
          positiveRate: 0,
          executionEligibleRate: 0,
          executionEligibleMedianNetCarryBps: 18.5,
          executionEligibleTotalEstimatedNetPnlKrw: 0,
          depthCoverageRate: 1,
          spreadControl: {
            spreadRejectedRate: 1,
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 18.5,
          estimatedNetPnlKrw: 0,
          depthCovered: true,
        },
      ],
    });
    writeJson(feeStressPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      assumptions: {
        notionalKrw: 500000,
        bithumbFeeBps: 25,
        binanceTakerFeeBps: 5,
        exitCostBufferBps: 20,
      },
      summary: {
        executionEligibleMedianNetCarryBps: 46.7,
        executionEligiblePositiveRate: 0.98,
        executionEligibleTotalEstimatedNetPnlKrw: 120_000,
        rawPricingArtifactCount: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          completedFundingCount: 5,
          executionEligibleRate: 0.94,
          executionEligiblePositiveRate: 0.99,
          executionEligibleMedianNetCarryBps: 55,
          executionEligibleTotalEstimatedNetPnlKrw: 100_000,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          fundingWindowSummary: {
            completedFundingWindowCount: 5,
            medianWindowNetCarryBps: 60,
            estimatedNetPnlKrwAcrossFundingWindows: 15_000,
            windows: [
              {
                fundingSettledAt: "2026-05-13T16:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 90,
                medianEstimatedNetPnlKrw: 4500,
              },
              {
                fundingSettledAt: "2026-05-13T20:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 80,
                medianEstimatedNetPnlKrw: 4000,
              },
              {
                fundingSettledAt: "2026-05-14T00:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 60,
                medianEstimatedNetPnlKrw: 3000,
              },
              {
                fundingSettledAt: "2026-05-14T04:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 40,
                medianEstimatedNetPnlKrw: 2000,
              },
              {
                fundingSettledAt: "2026-05-14T08:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 28,
                medianEstimatedNetPnlKrw: 1400,
              },
            ],
          },
        },
        {
          market: "KRW-AZTEC",
          symbol: "AZTECUSDT",
          completedFundingCount: 3,
          executionEligibleRate: 0.86,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 46.7,
          executionEligibleTotalEstimatedNetPnlKrw: 70_000,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          fundingWindowSummary: {
            completedFundingWindowCount: 3,
            medianWindowNetCarryBps: 50,
            estimatedNetPnlKrwAcrossFundingWindows: 7_500,
            windows: [
              {
                fundingSettledAt: "2026-05-14T00:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 36,
                medianEstimatedNetPnlKrw: 1800,
              },
              {
                fundingSettledAt: "2026-05-14T04:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 58,
                medianEstimatedNetPnlKrw: 2900,
              },
              {
                fundingSettledAt: "2026-05-14T08:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 50,
                medianEstimatedNetPnlKrw: 2500,
              },
            ],
          },
        },
      ],
    });
    writeJson(carryLiveReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: [
        "insufficientCompletedFundingEvents",
        "operationalProof:credentialsMissing",
      ],
      checks: {
        completedFundingEvents: false,
        operationalProofPresent: true,
      },
      readinessGap: {
        observations: {
          current: 23,
          required: 432,
          remaining: 409,
          passed: false,
        },
        observationSpanMinutes: {
          current: 120,
          required: 4320,
          remaining: 4200,
          passed: false,
        },
        completedFundingEvents: {
          current: 2,
          required: 6,
          remaining: 4,
          passed: false,
        },
      },
      readinessTimeline: {
        bottleneck: "observationSpanMinutes",
        estimatedEarliestReviewAt: "2026-05-16T18:29:36.258Z",
      },
      evidence: {
        summary: {
          executionEligibleMedianNetCarryBps: 41.5,
        },
        operationalProof: {
          generatedAt: new Date().toISOString(),
          accountFeesConfirmed: false,
          inventoryReady: false,
          hedgeVenueReady: false,
          requirements: {
            totalSpotQuoteRequiredKrw: 500200,
            totalFuturesMarginRequiredUsdt: 336.755301,
          },
          inventory: {
            bithumbQuoteFreeKrw: 0,
            binanceUsdtAvailable: 0,
          },
          deficits: {
            bithumbQuoteDeficitKrw: 500200,
            binanceUsdtDeficit: 336.755301,
          },
          details: {
            missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
          },
          reasons: ["credentialsMissing"],
        },
      },
      interpretation: "Do not live-trade spot-perp carry.",
    });
    writeJson(carryLiveReadinessEduPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-EDU:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      evidence: {
        summary: {
          executionEligibleMedianNetCarryBps: 39.5,
        },
      },
      interpretation: "EDU single-market carry remains observation-only.",
    });

    const cliArgs = [
      "dist/src/cli/audit-live-goal-status.js",
      "--min75-readiness",
      min75Path,
      "--legacy-audit",
      legacyPath,
      "--spot-perp-carry-report",
      carryPath,
      "--spot-perp-carry-watch-report",
      watchPath,
      "--spot-perp-carry-watch-report",
      tinyWatchPath,
      "--spot-perp-carry-watch-report",
      broadDiscoveryPath,
      "--spot-perp-carry-watch-report",
      currentEntryPath,
      "--spot-perp-carry-fee-stress-report",
      feeStressPath,
      "--spot-perp-carry-live-readiness",
      carryLiveReadinessPath,
      "--spot-perp-carry-live-readiness",
      carryLiveReadinessEduPath,
    ];
    const output = execFileSync(
      process.execPath,
      cliArgs,
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveReady: boolean;
      selectedCandidate: {
        type: string;
      };
      selectedCandidateScope: string;
      selectedCandidateUsableForLivePromotion: boolean;
      selectedCandidateInterpretation: string;
      selectedLiveCandidate: null | { type: string };
      selectedResearchFocus: null | {
        type: string;
        market: string | null;
        symbol: string | null;
        usableForLivePromotion: boolean;
      };
      selectedMetricCandidate: null | {
        market: string | null;
        usableForLivePromotion: boolean;
      };
      selectedMetricCandidates: Array<{
        market: string | null;
        usableForLivePromotion: boolean;
      }>;
      liveStartupAllowed: boolean;
      recommendedAction: string;
      profitabilityEvidence: {
        status: string;
        realizedPnlKrw: number | null;
        realizedReturnPct: number | null;
        realizedEvidenceAvailable: boolean;
        estimatedCarry: {
          market: string | null;
          symbol: string | null;
          estimatedNetPnlKrw: number | null;
          medianNetCarryBps: number | null;
          feeStressEstimatedNetPnlKrw: number | null;
          feeStressMedianNetCarryBps: number | null;
        };
        fallbackEstimatedCarry: {
          market: string | null;
          symbol: string | null;
          estimatedNetPnlKrw: number | null;
          medianNetCarryBps: number | null;
          feeStressEstimatedNetPnlKrw: number | null;
          feeStressMedianNetCarryBps: number | null;
        } | null;
        livePromotionEvidenceSatisfied: boolean;
        interpretation: string;
      } | null;
      livePromotionRoadmap: {
        status: string;
        researchFocus: {
          market: string | null;
          symbol: string | null;
          role: string;
          expectedCarry: {
            estimatedNetPnlKrw: number | null;
            medianNetCarryBps: number | null;
            positiveRate: number | null;
            completedFundingCount: number | null;
            observationCount: number | null;
            observationSpanMinutes: number | null;
            spreadControlPassed: boolean;
          };
          feeStress: {
            medianNetCarryBps: number | null;
            positiveRate: number | null;
            estimatedNetPnlKrw: number | null;
            passed: boolean;
            path: string | null;
          } | null;
          usableForLivePromotion: boolean;
        };
        fallbackResearchCandidate: {
          market: string | null;
          symbol: string | null;
          role: string;
          expectedCarry: {
            estimatedNetPnlKrw: number | null;
            medianNetCarryBps: number | null;
            positiveRate: number | null;
            completedFundingCount: number | null;
            observationCount: number | null;
            observationSpanMinutes: number | null;
            spreadControlPassed: boolean;
          };
          feeStress: {
            medianNetCarryBps: number | null;
            positiveRate: number | null;
            estimatedNetPnlKrw: number | null;
            passed: boolean;
            path: string | null;
          } | null;
          usableForLivePromotion: boolean;
        } | null;
        alternativeResearchCandidates: Array<{
          market: string | null;
          symbol: string | null;
          evidenceQuality: string;
          metrics: {
            executionEligibleMedianNetCarryBps: number | null;
            completedFundingCount: number | null;
          };
          usableForLivePromotion: boolean;
          requiredBeforeLive: string[];
        }>;
        readiness: {
          sourceReadinessPath: string | null;
          liveReady: boolean;
          gap: {
            observations: { remaining: number };
            observationSpanMinutes: { remaining: number };
            completedFundingEvents: { remaining: number };
          } | null;
          timeline: {
            bottleneck?: string;
            estimatedEarliestReviewAt?: string;
          } | null;
        };
        operational: {
          accountFeesConfirmed: boolean;
          inventoryReady: boolean;
          hedgeVenueReady: boolean;
          missingSecrets: string[];
        } | null;
        nextReview: {
          gateCommand: string;
          earliestReviewAt: string | null;
          bottleneck: string | null;
          requiredBeforeLive: string[];
        };
      } | null;
      liveStartupPlan: {
        status: string;
        researchFocusMarket: string | null;
        researchFocusSymbol: string | null;
        cleanestExecutionMarket: string | null;
        gateCommand: string;
        reviewCommand?: string | null;
        manualValidationCommand?: string | null;
        pm2StartCommand?: string | null;
        blockedReason?: string | null;
        blockedCommands?: {
          reviewCommand?: string | null;
          manualValidationCommand?: string | null;
          pm2StartCommand?: string | null;
        } | null;
        fallbackStartupPlan?: {
          market: string;
          reviewCommand: string;
          manualValidationCommand?: string | null;
          pm2StartCommand: string;
          condition: string;
        } | null;
        recompareChallengerPlan?: {
          market: string;
          symbol: string | null;
          latestWindow: { sampleCount?: number; medianNetCarryBps?: number };
          latestWindowSampleQualityPasses: boolean;
          action: string;
          refreshEvidenceCommand: string;
          postSwitchReviewCommand: string;
          postSwitchPm2StartCommand: string;
          liveStartupCaveat: string;
        } | null;
        orderSubmissionDefault: string;
        requiredEnvForLiveValidation?: string[];
        requiredEnvForOrderSubmission?: string[];
        requiredSecrets?: string[];
        hardStops: string[];
      };
      strategyLifecycleDecision: {
        selectedLiveCandidate: null | { type: string };
        selectedResearchFocus: null | {
          type: string;
          market: string | null;
          usableForLivePromotion: boolean;
        };
        liveStartupAllowed: boolean;
        decisions: {
          spotPerpCarryBaseline?: { decision: string; estimatedNetPnlKrw: number } | null;
          highestExpectedCarry?: {
            decision: string;
            market: string;
            reason: string;
            usableForLivePromotion: boolean;
          } | null;
          cleanestExecutionCarry?: {
            decision: string;
            market: string;
            reason: string;
            usableForLivePromotion: boolean;
          } | null;
        };
      };
      switchPlan: {
        currentFocusMarket: string;
        fallbackCandidateMarket: string;
        alternativeCandidateMarkets: Array<string | null>;
        currentAction: string;
        focusRecompare?: { status?: string } | null;
        recommendedResearchFocus?: {
          market: string | null;
          symbol: string | null;
          reason: string;
          caveat: string;
        } | null;
        doNotContinueIf: string[];
        requiredBeforeSwitchToLive: string[];
      };
      lossPersistenceGuard: {
        activeLosingPathsRejected: boolean;
        negativePnlPaths: Array<{ path: string; action: string; pnlKrw: number }>;
        estimatesAllowedForResearchOnly: boolean;
        openMarksAllowedForLivePromotion: boolean;
      };
      inputs: {
        spotPerpCarryWatchReportPaths: string[];
        spotPerpCarryLiveReadinessPath: string;
        spotPerpCarryLiveReadinessPaths: string[];
      };
	      blockers: string[];
	      checklist: {
	        spotPerpCarryCurrentEntrySanity: boolean;
	        spotPerpCarryFocusRecompareClear: boolean;
	        spotPerpCarryLiveReadiness: boolean;
	      };
	      completionAudit: {
        missingRequirements: string[];
        missingRequirementCount: number;
	        promptToArtifactChecklist: Array<{
	          requirement: string;
	          passed: boolean;
	          evidence?: {
	            action?: string;
	          };
	        }>;
	        criteria: Array<{
	          criterion: string;
	          passed: boolean;
	        }>;
	      };
      carryLiveReadiness: {
        liveReady: boolean;
        reasons: string[];
        readinessGap: {
          observations: { remaining: number };
          observationSpanMinutes: { remaining: number };
          completedFundingEvents: { remaining: number };
        };
      };
      carryOperationalReadiness: {
        sourceReadinessPath: string;
        liveReady: boolean;
        accountFeesConfirmed: boolean;
        inventoryReady: boolean;
        hedgeVenueReady: boolean;
        operationalProofPresent: boolean;
        missingSecrets: string[];
        deficits: {
          bithumbQuoteDeficitKrw: number;
          binanceUsdtDeficit: number;
        };
        nextActions: string[];
        interpretation: string;
      };
      carryLiveReadinessReports: Array<{
        path: string;
        liveReady: boolean;
        reasons: string[];
        readinessGap: {
          observations: { remaining: number };
          completedFundingEvents: { remaining: number };
        } | null;
      }>;
	      carryStrategyComparison: {
	        baseline: { estimatedNetPnlKrw: number; medianNetCarryBps: number };
	        focusedWatch: { estimatedNetPnlKrw: number; medianNetCarryBps: number };
	        delta: { estimatedNetPnlKrw: number; medianNetCarryBps: number };
	      };
      spotPerpCarryCandidateRoles: {
        highestExpectedCarryCandidate: { market: string; spreadControlPassed: boolean };
        cleanestExecutionCandidate: { market: string; spreadControlPassed: boolean };
        selectedResearchFocusRole: string;
      };
      spotPerpCarryResearchFocusDecision: {
        action: string;
        currentFocusMarket: string;
        cleanestExecutionMarket: string;
        highestExpectedSpreadPassed: boolean;
        switchCriteria: string[];
      };
      spotPerpCarryCurrentEntrySanity: {
        status: string;
        preferredSourcePath: string;
        preferredSourceKind: string;
        currentEntryBlockers: string[];
        aggregateCurrentEntryDiagnostics: {
          reportPromotionEligible: boolean;
          reportUsableForLivePromotion: boolean;
          medianNetCarryBps: number;
          executionEligibleMedianNetCarryBps: number;
          positiveRate: number;
          executionEligibleRate: number;
          rawPricingArtifactCount: number;
          spreadControl: Record<string, unknown> | null;
        };
        selectedMarketCurrentEntrySnapshot: {
          source: string;
          market: string;
          netCarryBps: number;
          estimatedNetPnlKrw: number;
        } | null;
        action: string;
      };
      spotPerpCarryFocusRecompare: {
        status: string;
        needsRecompareBeforeLive: boolean;
        currentFocusLatestWindowDeteriorating: boolean;
        currentFocusDegradationSeverity: string;
        currentFocusTrend: {
          degradationSeverity: string;
          consecutiveDeterioratingWindowCount: number;
          latestWindow: { medianNetCarryBps: number };
          demotionGate: {
            mustExceedLatestMedianNetCarryBpsToRecover: number;
          };
        };
        bestChallenger: {
          market: string;
          completedFundingCount: number;
          latestWindow: { medianNetCarryBps: number };
          deltaToCurrentLatestBps: number;
        };
        action: string;
      };
      carryArtifactWarnings: Array<{
        market: string;
        reason: string;
        rawNetCarryBps: number;
      }>;
      carryWatchlist: Array<{
        usableForLivePromotion: boolean;
        executableEvidence: {
          medianNetCarryBps: number;
          estimatedNetPnlKrw: number;
          positiveRate: number;
          completedFundingCount: number;
          observationCount: number;
        };
        spreadControl?: {
          spreadRejectionSignalCount: number;
          spreadRejectionSignalRate: number | null;
          spotSpreadTooWideCount: number;
          rawPricingArtifactCount: number | null;
          diagnosticsMissing?: boolean;
          passed: boolean;
        } | null;
        perMarketSummary: Array<{
          market: string;
          executionEligibleMedianNetCarryBps: number;
          watchDecision?: { status?: string };
        }>;
        topExecutableCarry: Array<{ market: string; netCarryBps: number }>;
      }>;
      carryMarketDecisionMatrix: Array<{
        market: string;
        status: string;
        decision: string;
        nextDecisionTrigger: string;
        metrics: {
          executionEligibleMedianNetCarryBps: number;
        };
      }>;
	      nextActionPlan: Array<{
	        track: string;
	        currentEvidence: {
	          topExecutableCarry?: { market?: string; netCarryBps?: number } | null;
          candidateRoles?: {
            highestExpectedCarryCandidate?: { market?: string } | null;
            cleanestExecutionCandidate?: { market?: string } | null;
          } | null;
          researchFocusDecision?: {
            action?: string;
            cleanestExecutionMarket?: string | null;
          } | null;
          usableForLivePromotion?: boolean;
        };
	      }>;
	    };
	    assert.equal(report.liveReady, false);
	    assert.equal(report.selectedCandidate.type, "spot_perp_carry_watch_candidate");
    assert.equal(report.selectedCandidateScope, "research_or_blocked_path");
    assert.equal(report.selectedCandidateUsableForLivePromotion, false);
    assert.match(
      report.selectedCandidateInterpretation,
      /selectedLiveCandidate and liveStartupAllowed are the live-trading authority/,
    );
    assert.equal(report.selectedLiveCandidate, null);
    assert.equal(report.selectedResearchFocus?.type, "spot_perp_carry_research_focus");
    assert.equal(report.selectedResearchFocus?.market, "KRW-PIEVERSE");
    assert.equal(report.selectedResearchFocus?.symbol, "PIEVERSEUSDT");
    assert.equal(report.selectedResearchFocus?.usableForLivePromotion, false);
    assert.equal(report.liveStartupAllowed, false);
    assert.equal(
      report.selectedMetricCandidates.every((candidate) => candidate.usableForLivePromotion === false),
      true,
    );
    assert.equal(report.profitabilityEvidence?.status, "estimated_carry_only");
    assert.equal(report.profitabilityEvidence?.realizedPnlKrw, null);
    assert.equal(report.profitabilityEvidence?.realizedReturnPct, null);
    assert.equal(report.profitabilityEvidence?.realizedEvidenceAvailable, false);
    assert.equal(report.profitabilityEvidence?.estimatedCarry.market, "KRW-PIEVERSE");
    assert.equal(report.profitabilityEvidence?.estimatedCarry.symbol, "PIEVERSEUSDT");
    assert.equal(report.profitabilityEvidence?.estimatedCarry.estimatedNetPnlKrw, 6000);
    assert.equal(report.profitabilityEvidence?.estimatedCarry.medianNetCarryBps, 120);
    assert.equal(report.profitabilityEvidence?.fallbackEstimatedCarry?.market, "KRW-EDU");
    assert.equal(report.profitabilityEvidence?.fallbackEstimatedCarry?.estimatedNetPnlKrw, 12540);
    assert.equal(report.profitabilityEvidence?.livePromotionEvidenceSatisfied, false);
    assert.match(report.profitabilityEvidence?.interpretation ?? "", /not realized live/);
    assert.match(report.recommendedAction, /must be re-compared/);
    assert.match(report.recommendedAction, /KRW-AZTEC/);
    assert.equal(report.livePromotionRoadmap?.status, "not_live_ready");
    assert.equal(report.livePromotionRoadmap?.researchFocus.market, "KRW-PIEVERSE");
    assert.equal(report.livePromotionRoadmap?.researchFocus.role, "highest_expected_carry");
    assert.equal(report.livePromotionRoadmap?.researchFocus.expectedCarry.medianNetCarryBps, 120);
    assert.equal(report.livePromotionRoadmap?.researchFocus.expectedCarry.estimatedNetPnlKrw, 6000);
    assert.equal(report.livePromotionRoadmap?.researchFocus.expectedCarry.spreadControlPassed, false);
    assert.equal(report.livePromotionRoadmap?.researchFocus.feeStress?.medianNetCarryBps, 55);
    assert.equal(report.livePromotionRoadmap?.researchFocus.feeStress?.positiveRate, 0.99);
    assert.equal(report.livePromotionRoadmap?.researchFocus.feeStress?.passed, true);
    assert.equal(report.livePromotionRoadmap?.fallbackResearchCandidate?.market, "KRW-EDU");
    assert.equal(
      report.livePromotionRoadmap?.fallbackResearchCandidate?.expectedCarry.medianNetCarryBps,
      41.5,
    );
    assert.equal(
      report.livePromotionRoadmap?.fallbackResearchCandidate?.expectedCarry.spreadControlPassed,
      true,
    );
    assert.equal(report.livePromotionRoadmap?.alternativeResearchCandidates[0]?.market, "KRW-NEWM");
    assert.equal(
      report.livePromotionRoadmap?.alternativeResearchCandidates[0]?.evidenceQuality,
      "single_snapshot_or_early",
    );
    assert.equal(
      report.livePromotionRoadmap?.alternativeResearchCandidates[0]?.usableForLivePromotion,
      false,
    );
    assert.ok(
      report.livePromotionRoadmap?.alternativeResearchCandidates[0]?.requiredBeforeLive.includes(
        "focused_72h_report_or_equivalent_per_market_evidence",
      ),
    );
    assert.equal(report.livePromotionRoadmap?.readiness.sourceReadinessPath, carryLiveReadinessPath);
    assert.equal(report.livePromotionRoadmap?.readiness.gap?.observations.remaining, 409);
    assert.equal(
      report.livePromotionRoadmap?.readiness.timeline?.bottleneck,
      "observationSpanMinutes",
    );
    assert.equal(
      report.livePromotionRoadmap?.nextReview.earliestReviewAt,
      "2026-05-16T18:29:36.258Z",
    );
    assert.equal(report.livePromotionRoadmap?.nextReview.gateCommand, "npm run dry-run:gate-live-goal-ready");
    assert.equal(report.livePromotionRoadmap?.operational?.accountFeesConfirmed, false);
    assert.equal(report.livePromotionRoadmap?.operational?.inventoryReady, false);
    assert.equal(report.livePromotionRoadmap?.operational?.hedgeVenueReady, false);
    assert.deepEqual(report.livePromotionRoadmap?.operational?.missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(report.liveStartupPlan.status, "blocked_current_focus_recompare_required");
    assert.equal(report.liveStartupPlan.researchFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.liveStartupPlan.researchFocusSymbol, "PIEVERSEUSDT");
    assert.equal(report.liveStartupPlan.cleanestExecutionMarket, "KRW-EDU");
    assert.equal(report.liveStartupPlan.gateCommand, "npm run dry-run:gate-live-goal-ready");
    assert.match(report.liveStartupPlan.blockedReason ?? "", /recompare/);
    assert.equal(report.liveStartupPlan.reviewCommand, null);
    assert.equal(report.liveStartupPlan.manualValidationCommand, null);
    assert.equal(report.liveStartupPlan.pm2StartCommand, null);
    assert.equal(
      report.liveStartupPlan.blockedCommands?.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
    );
    assert.match(
      report.liveStartupPlan.blockedCommands?.manualValidationCommand ?? "",
      /--readiness-report var\/reports\/spot-perp-carry-pieverse-live-readiness-latest\.json/,
    );
    assert.equal(
      report.liveStartupPlan.blockedCommands?.pm2StartCommand,
      "npm run pm2:start:live-spot-perp-carry-pieverse",
    );
    assert.equal(report.liveStartupPlan.recompareChallengerPlan?.market, "KRW-AZTEC");
    assert.equal(report.liveStartupPlan.recompareChallengerPlan?.symbol, "AZTECUSDT");
    assert.equal(
      report.liveStartupPlan.recompareChallengerPlan?.action,
      "review_challenger_as_research_focus_before_current_focus_live_preparation",
    );
    assert.equal(
      report.liveStartupPlan.recompareChallengerPlan?.postSwitchReviewCommand,
      "npm run dry-run:review-spot-perp-carry-aztec-live-ready",
    );
    assert.equal(
      report.liveStartupPlan.recompareChallengerPlan?.postSwitchPm2StartCommand,
      "npm run pm2:start:live-spot-perp-carry-aztec",
    );
    assert.match(
      report.liveStartupPlan.recompareChallengerPlan?.liveStartupCaveat ?? "",
      /research-focus guidance only/,
    );
    assert.equal(report.liveStartupPlan.fallbackStartupPlan?.market, "KRW-EDU");
    assert.equal(
      report.liveStartupPlan.fallbackStartupPlan?.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-edu-live-ready",
    );
    assert.match(
      report.liveStartupPlan.fallbackStartupPlan?.manualValidationCommand ?? "",
      /--readiness-report var\/reports\/spot-perp-carry-edu-live-readiness-latest\.json/,
    );
    assert.equal(
      report.liveStartupPlan.fallbackStartupPlan?.pm2StartCommand,
      "npm run pm2:start:live-spot-perp-carry-edu",
    );
    assert.equal(report.liveStartupPlan.orderSubmissionDefault, "disabled");
    assert.ok(
      report.liveStartupPlan.requiredEnvForLiveValidation?.includes(
        "ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true",
      ),
    );
    assert.ok(
      report.liveStartupPlan.requiredEnvForOrderSubmission?.includes(
        "ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION=true",
      ),
    );
    assert.ok(report.liveStartupPlan.requiredEnvForOrderSubmission?.includes("--submit-once"));
    assert.ok(report.liveStartupPlan.requiredSecrets?.includes("BINANCE_SECRET_KEY"));
    assert.ok(
      report.liveStartupPlan.hardStops.some((stop) =>
        stop.includes("blocked live review"),
      ),
    );
    assert.equal(report.strategyLifecycleDecision.selectedLiveCandidate, null);
    assert.equal(
      report.strategyLifecycleDecision.selectedResearchFocus?.type,
      "spot_perp_carry_research_focus",
    );
    assert.equal(
      report.strategyLifecycleDecision.selectedResearchFocus?.market,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.strategyLifecycleDecision.selectedResearchFocus?.usableForLivePromotion,
      false,
    );
    assert.equal(report.strategyLifecycleDecision.liveStartupAllowed, false);
    assert.equal(
      report.strategyLifecycleDecision.decisions.spotPerpCarryBaseline?.decision,
      "demote_negative_baseline_collect_only",
    );
    assert.equal(
      report.strategyLifecycleDecision.decisions.highestExpectedCarry?.decision,
      "recompare_or_prepare_demotion",
    );
    assert.equal(
      report.strategyLifecycleDecision.decisions.highestExpectedCarry?.market,
      "KRW-PIEVERSE",
    );
    assert.match(
      report.strategyLifecycleDecision.decisions.highestExpectedCarry?.reason ?? "",
      /requires_recompare/,
    );
    assert.equal(
      report.strategyLifecycleDecision.decisions.cleanestExecutionCarry?.decision,
      "fallback_research_only",
    );
    assert.equal(
      report.strategyLifecycleDecision.decisions.cleanestExecutionCarry?.market,
      "KRW-EDU",
    );
    assert.equal(report.switchPlan.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.switchPlan.fallbackCandidateMarket, "KRW-EDU");
    assert.deepEqual(report.switchPlan.alternativeCandidateMarkets, ["KRW-NEWM"]);
    assert.equal(
      report.switchPlan.currentAction,
      "block_current_focus_live_startup_recompare_challenger",
    );
    assert.equal(report.switchPlan.focusRecompare?.status, "current_focus_recompare_required");
    assert.equal(report.switchPlan.recommendedResearchFocus?.market, "KRW-AZTEC");
    assert.match(
      report.switchPlan.recommendedResearchFocus?.caveat ?? "",
      /cannot authorize live startup/,
    );
    assert.ok(
      report.switchPlan.doNotContinueIf.some((rule) =>
        rule.includes("current focus recompare remains required"),
      ),
    );
    assert.ok(
      report.switchPlan.requiredBeforeSwitchToLive.some((rule) =>
        rule.includes("current focus recompare clears"),
      ),
    );
    assert.equal(report.lossPersistenceGuard.activeLosingPathsRejected, true);
    assert.equal(report.lossPersistenceGuard.estimatesAllowedForResearchOnly, true);
    assert.equal(report.lossPersistenceGuard.openMarksAllowedForLivePromotion, false);
    assert.ok(
      report.lossPersistenceGuard.negativePnlPaths.some(
        (path) =>
          path.path === "spot_perp_carry_baseline" &&
          path.action === "demote_negative_baseline_collect_only",
      ),
    );
    assert.deepEqual(report.inputs.spotPerpCarryWatchReportPaths, [
      watchPath,
      tinyWatchPath,
      broadDiscoveryPath,
      currentEntryPath,
    ]);
    assert.equal(report.inputs.spotPerpCarryLiveReadinessPath, carryLiveReadinessPath);
    assert.deepEqual(report.inputs.spotPerpCarryLiveReadinessPaths, [
      carryLiveReadinessPath,
      carryLiveReadinessEduPath,
    ]);
    assert.equal(report.checklist.spotPerpCarryLiveReadiness, false);
    assert.equal(report.checklist.spotPerpCarryCurrentEntrySanity, false);
    assert.equal(report.checklist.spotPerpCarryFocusRecompareClear, false);
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.status,
      "current_entry_blocked_or_diagnostic_only",
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.preferredSourcePath,
      currentEntryPath,
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.preferredSourceKind,
      "current_carry_fee_stress",
    );
    assert.deepEqual(report.spotPerpCarryCurrentEntrySanity.currentEntryBlockers, [
      "selectedFocusCurrentEntryCarryBelowLiveThreshold",
    ]);
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.aggregateCurrentEntryDiagnostics.reportPromotionEligible,
      false,
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.aggregateCurrentEntryDiagnostics.reportUsableForLivePromotion,
      false,
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.aggregateCurrentEntryDiagnostics.medianNetCarryBps,
      -1.5,
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.aggregateCurrentEntryDiagnostics.positiveRate,
      0.2,
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.aggregateCurrentEntryDiagnostics.spreadControl?.passed,
      false,
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.source,
      "top_executable_carry",
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.market,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.netCarryBps,
      18.5,
    );
    assert.equal(
      report.spotPerpCarryCurrentEntrySanity.action,
      "keep_live_blocked_and_continue_current_entry_discovery",
    );
    assert.equal(
      report.spotPerpCarryFocusRecompare.status,
      "current_focus_recompare_required",
    );
    assert.equal(report.spotPerpCarryFocusRecompare.needsRecompareBeforeLive, true);
    assert.equal(report.spotPerpCarryFocusRecompare.currentFocusLatestWindowDeteriorating, true);
    assert.equal(report.spotPerpCarryFocusRecompare.currentFocusDegradationSeverity, "multi_window_degradation");
    assert.equal(
      report.spotPerpCarryFocusRecompare.currentFocusTrend.degradationSeverity,
      "multi_window_degradation",
    );
    assert.equal(
      report.spotPerpCarryFocusRecompare.currentFocusTrend.consecutiveDeterioratingWindowCount,
      4,
    );
    assert.equal(
      report.spotPerpCarryFocusRecompare.currentFocusTrend.latestWindow.medianNetCarryBps,
      28,
    );
    assert.equal(
      report.spotPerpCarryFocusRecompare.currentFocusTrend.demotionGate
        .mustExceedLatestMedianNetCarryBpsToRecover,
      28,
    );
    assert.equal(report.spotPerpCarryFocusRecompare.bestChallenger.market, "KRW-AZTEC");
    assert.equal(report.spotPerpCarryFocusRecompare.bestChallenger.completedFundingCount, 3);
    assert.equal(
      report.spotPerpCarryFocusRecompare.bestChallenger.latestWindow.medianNetCarryBps,
      50,
    );
    assert.equal(
      report.spotPerpCarryFocusRecompare.bestChallenger.deltaToCurrentLatestBps,
      22,
    );
    assert.equal(
      report.spotPerpCarryFocusRecompare.action,
      "block_current_focus_live_startup_and_recompare_challengers",
    );
    assert.equal(report.carryLiveReadiness.liveReady, false);
    assert.equal(report.carryLiveReadiness.readinessGap.observations.remaining, 409);
    assert.equal(
      report.carryLiveReadiness.readinessGap.observationSpanMinutes.remaining,
      4200,
    );
    assert.equal(report.carryLiveReadiness.readinessGap.completedFundingEvents.remaining, 4);
    assert.equal(report.carryOperationalReadiness.sourceReadinessPath, carryLiveReadinessPath);
    assert.equal(report.carryOperationalReadiness.liveReady, false);
    assert.equal(report.carryOperationalReadiness.accountFeesConfirmed, false);
    assert.equal(report.carryOperationalReadiness.inventoryReady, false);
    assert.equal(report.carryOperationalReadiness.hedgeVenueReady, false);
    assert.equal(report.carryOperationalReadiness.operationalProofPresent, true);
    assert.deepEqual(report.carryOperationalReadiness.missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(
      report.carryOperationalReadiness.deficits.bithumbQuoteDeficitKrw,
      500200,
    );
    assert.equal(report.carryOperationalReadiness.deficits.binanceUsdtDeficit, 336.755301);
    assert.deepEqual(report.carryOperationalReadiness.nextActions, [
      "confirm_account_fee_schedule",
      "fund_or_verify_spot_inventory",
      "fund_or_verify_futures_hedge_venue",
      "refresh_operational_proof_with_credentials",
    ]);
    assert.match(
      report.carryOperationalReadiness.interpretation,
      /separate from carry profitability/,
    );
    assert.equal(report.carryLiveReadinessReports.length, 2);
    assert.equal(report.carryLiveReadinessReports[0]?.readinessGap?.observations.remaining, 409);
    assert.equal(
      report.carryLiveReadinessReports[0]?.readinessGap?.completedFundingEvents.remaining,
      4,
    );
    assert.equal(report.carryLiveReadinessReports[1]?.path, carryLiveReadinessEduPath);
    assert.ok(
      report.blockers.includes(
        "spotPerpCarryLiveReadiness:operationalProof:credentialsMissing",
      ),
    );
    assert.equal(
      report.blockers.includes("spotPerpCarryLiveReadiness:market:KRW-EDU:notMetricCandidate"),
      false,
    );
    assert.ok(
      report.blockers.includes(
        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryBelowLiveThreshold",
      ),
    );
    assert.ok(report.blockers.includes("spotPerpCarryFocusRecompareRequired"));
    assert.equal(
      report.completionAudit.missingRequirementCount,
      report.completionAudit.missingRequirements.length,
    );
	    assert.equal(report.carryStrategyComparison.baseline.estimatedNetPnlKrw, -13_199.436772);
	    assert.equal(report.carryStrategyComparison.focusedWatch.estimatedNetPnlKrw, 6_000);
	    assert.equal(report.carryStrategyComparison.delta.estimatedNetPnlKrw, 19_199.436772);
	    assert.equal(report.carryStrategyComparison.delta.medianNetCarryBps, 157.25);
	    assert.equal(report.spotPerpCarryCandidateRoles.highestExpectedCarryCandidate.market, "KRW-PIEVERSE");
	    assert.equal(
	      report.spotPerpCarryCandidateRoles.highestExpectedCarryCandidate.spreadControlPassed,
	      false,
	    );
	    assert.equal(report.spotPerpCarryCandidateRoles.cleanestExecutionCandidate.market, "KRW-EDU");
	    assert.equal(
	      report.spotPerpCarryCandidateRoles.cleanestExecutionCandidate.spreadControlPassed,
	      true,
	    );
    assert.equal(report.spotPerpCarryCandidateRoles.selectedResearchFocusRole, "highest_expected_carry");
    assert.equal(
      report.spotPerpCarryResearchFocusDecision.action,
      "keep_highest_expected_under_watch_compare_cleanest_execution",
    );
    assert.equal(report.spotPerpCarryResearchFocusDecision.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.spotPerpCarryResearchFocusDecision.cleanestExecutionMarket, "KRW-EDU");
    assert.equal(report.spotPerpCarryResearchFocusDecision.highestExpectedSpreadPassed, false);
	    assert.ok(
	      report.spotPerpCarryResearchFocusDecision.switchCriteria.some((criterion) =>
	        criterion.includes("lower rejection alone is not profitability"),
	      ),
	    );
	    assert.equal(
	      report.completionAudit.promptToArtifactChecklist.find((item) =>
	        item.requirement.includes("best current profitability research focus"),
	      )?.passed,
	      true,
	    );
	    assert.equal(
	      report.completionAudit.promptToArtifactChecklist.find((item) =>
	        item.requirement.includes("readiness, fee, inventory"),
	      )?.passed,
	      false,
	    );
	    assert.equal(
	      report.completionAudit.promptToArtifactChecklist.find((item) =>
	        item.requirement.includes("switch or demotion rule"),
	      )?.passed,
	      true,
	    );
    assert.equal(
      report.completionAudit.promptToArtifactChecklist.find((item) =>
        item.requirement.includes("latest current-entry snapshot"),
      )?.passed,
      false,
    );
    assert.equal(
      report.completionAudit.criteria.find((item) =>
        item.criterion.includes("current-entry sanity check"),
      )?.passed,
      false,
    );
    assert.equal(
      report.completionAudit.promptToArtifactChecklist.find((item) =>
        item.requirement.includes("quality-cleared challenger"),
      )?.passed,
      false,
    );
    assert.equal(
      report.completionAudit.criteria.find((item) =>
        item.criterion.includes("requires recompare"),
      )?.passed,
      false,
    );
    assert.equal(
      report.completionAudit.promptToArtifactChecklist.find((item) =>
        item.requirement.includes("keep defending strategies"),
      )?.passed,
      true,
    );
    assert.equal(
      report.completionAudit.promptToArtifactChecklist.find((item) =>
        item.requirement.includes("startup method remains explicit"),
      )?.passed,
      true,
    );
	    assert.equal(report.carryArtifactWarnings[0]?.market, "KRW-META");
    assert.equal(
      report.carryArtifactWarnings[0]?.reason,
      "rawTopCarryExcludedByExecutionPolicy",
    );
	    assert.equal(report.carryWatchlist[0]?.usableForLivePromotion, false);
	    assert.equal(report.carryWatchlist[0]?.executableEvidence.medianNetCarryBps, 120);
	    assert.equal(report.carryWatchlist[0]?.executableEvidence.estimatedNetPnlKrw, 6_000);
	    assert.equal(report.carryWatchlist[0]?.executableEvidence.positiveRate, 1);
	    assert.equal(report.carryWatchlist[0]?.spreadControl?.spreadRejectionSignalCount, 1);
	    assert.equal(report.carryWatchlist[0]?.spreadControl?.diagnosticsMissing, false);
	    assert.equal(report.carryWatchlist[0]?.spreadControl?.passed, false);
	    assert.equal(report.carryWatchlist[0]?.perMarketSummary[0]?.market, "KRW-PIEVERSE");
	    assert.equal(report.carryWatchlist[1]?.perMarketSummary[0]?.market, "KRW-EDU");
	    assert.equal(report.carryWatchlist[1]?.spreadControl?.spreadRejectionSignalCount, 0);
	    assert.equal(report.carryWatchlist[1]?.spreadControl?.passed, true);
    assert.equal(
	      report.carryWatchlist[1]?.perMarketSummary[0]?.executionEligibleMedianNetCarryBps,
	      41.5,
	    );
	    assert.equal(
	      report.carryWatchlist[1]?.perMarketSummary[0]?.watchDecision?.status,
	      "collect_more_evidence",
	    );
    assert.equal(report.carryWatchlist[2]?.perMarketSummary[0]?.market, "KRW-NEWM");
    assert.equal(report.carryWatchlist[2]?.executableEvidence.observationCount, 1);
    assert.equal(report.carryWatchlist[2]?.executableEvidence.completedFundingCount, 1);
	    assert.equal(report.carryWatchlist[0]?.topExecutableCarry[0]?.market, "KRW-PIEVERSE");
	    assert.equal(report.carryMarketDecisionMatrix[0]?.market, "KRW-PIEVERSE");
	    assert.equal(report.carryMarketDecisionMatrix[0]?.status, "collect_more_evidence");
	    assert.equal(report.carryMarketDecisionMatrix[0]?.decision, "continue_until_metric_requirements_clear");
	    assert.equal(
	      report.carryMarketDecisionMatrix[0]?.nextDecisionTrigger,
	      "moreCompletedFundingEvents",
	    );
	    assert.equal(
	      report.carryMarketDecisionMatrix[0]?.metrics.executionEligibleMedianNetCarryBps,
	      120,
	    );
    const watchAction = report.nextActionPlan.find(
      (item) => item.track === "spot_perp_carry_watchlist",
    );
	    assert.equal(watchAction?.currentEvidence.usableForLivePromotion, false);
	    assert.equal(watchAction?.currentEvidence.topExecutableCarry?.market, "KRW-PIEVERSE");
	    assert.equal(
	      watchAction?.currentEvidence.candidateRoles?.highestExpectedCarryCandidate?.market,
	      "KRW-PIEVERSE",
	    );
    assert.equal(
      watchAction?.currentEvidence.candidateRoles?.cleanestExecutionCandidate?.market,
      "KRW-EDU",
    );
    assert.equal(
      watchAction?.currentEvidence.researchFocusDecision?.action,
      "keep_highest_expected_under_watch_compare_cleanest_execution",
    );
    assert.equal(
      watchAction?.currentEvidence.researchFocusDecision?.cleanestExecutionMarket,
      "KRW-EDU",
    );

    const quietOutput = execFileSync(
      process.execPath,
      [...cliArgs, "--quiet"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const quietReport = JSON.parse(quietOutput) as {
      liveReady: boolean;
      liveStartupPlan: { status: string; orderSubmissionDefault: string };
      strategyLifecycleDecision: {
        selectedLiveCandidate: null | { type: string };
        liveStartupAllowed: boolean;
        decisions: {
          spotPerpCarryBaseline?: { decision: string } | null;
          highestExpectedCarry?: { decision: string; market: string } | null;
          cleanestExecutionCarry?: { decision: string; market: string } | null;
        };
      };
      switchPlan: { currentFocusMarket: string; fallbackCandidateMarket: string };
      lossPersistenceGuard: {
        activeLosingPathsRejected: boolean;
        negativePnlPaths: Array<{ path: string; action: string }>;
      };
    };
    assert.equal(quietReport.liveReady, false);
    assert.equal(quietReport.liveStartupPlan.status, "blocked_current_focus_recompare_required");
    assert.equal(quietReport.liveStartupPlan.orderSubmissionDefault, "disabled");
    assert.equal(quietReport.strategyLifecycleDecision.selectedLiveCandidate, null);
    assert.equal(quietReport.strategyLifecycleDecision.liveStartupAllowed, false);
    assert.equal(
      quietReport.strategyLifecycleDecision.decisions.spotPerpCarryBaseline?.decision,
      "demote_negative_baseline_collect_only",
    );
    assert.equal(
      quietReport.strategyLifecycleDecision.decisions.highestExpectedCarry?.market,
      "KRW-PIEVERSE",
    );
    assert.equal(
      quietReport.strategyLifecycleDecision.decisions.cleanestExecutionCarry?.market,
      "KRW-EDU",
    );
    assert.equal(quietReport.switchPlan.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(quietReport.switchPlan.fallbackCandidateMarket, "KRW-EDU");
    assert.equal(quietReport.lossPersistenceGuard.activeLosingPathsRejected, true);
    assert.ok(
      quietReport.lossPersistenceGuard.negativePnlPaths.some(
        (path) =>
          path.path === "spot_perp_carry_baseline" &&
          path.action === "demote_negative_baseline_collect_only",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status blocks current focus startup when quality challenger wins the aligned fee-stressed window", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-quality-recompare-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const watchPath = join(directory, "spot-perp-carry-pieverse-72h-latest.json");
    const feeStressPath = join(directory, "spot-perp-carry-opportunity-fee-stress.json");
    const readinessPath = join(directory, "spot-perp-carry-pieverse-live-readiness.json");
    const aztecReadinessPath = join(directory, "spot-perp-carry-aztec-live-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(watchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservationSpan", "wideDisplayedSpread"],
      summary: {
        count: 120,
        completedFundingCount: 6,
        positiveRate: 1,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 62,
        executionEligibleTotalEstimatedNetPnlKrw: 310_000,
        executionRejectedCount: 6,
        executionRejectedRate: 0.05,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 6,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 120,
          completedFundingCount: 6,
          executionEligibleCount: 114,
          executionEligibleRate: 0.95,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 62,
          executionEligibleTotalEstimatedNetPnlKrw: 310_000,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["spreadControl"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 62,
          estimatedNetPnlKrw: 3_100,
          depthCovered: true,
        },
      ],
    });
    writeJson(feeStressPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      assumptions: {
        notionalKrw: 500000,
        bithumbFeeBps: 25,
        binanceTakerFeeBps: 5,
        exitCostBufferBps: 20,
      },
      summary: {
        executionEligibleMedianNetCarryBps: 63,
        executionEligiblePositiveRate: 1,
        rawPricingArtifactCount: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          completedFundingCount: 6,
          executionEligibleRate: 0.95,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 58,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            windows: [
              { fundingSettledAt: "2026-05-14T04:00:00.000Z", sampleCount: 12, medianNetCarryBps: 48 },
              { fundingSettledAt: "2026-05-14T08:00:00.000Z", sampleCount: 12, medianNetCarryBps: 51 },
              { fundingSettledAt: "2026-05-14T12:00:00.000Z", sampleCount: 12, medianNetCarryBps: 52 },
              { fundingSettledAt: "2026-05-14T16:00:00.000Z", sampleCount: 12, medianNetCarryBps: 54 },
              { fundingSettledAt: "2026-05-14T20:00:00.000Z", sampleCount: 12, medianNetCarryBps: 55 },
              { fundingSettledAt: "2026-05-15T00:00:00.000Z", sampleCount: 12, medianNetCarryBps: 58 },
            ],
          },
        },
        {
          market: "KRW-AZTEC",
          symbol: "AZTECUSDT",
          completedFundingCount: 6,
          executionEligibleRate: 0.86,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 68,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            windows: [
              { fundingSettledAt: "2026-05-14T04:00:00.000Z", sampleCount: 12, medianNetCarryBps: 57 },
              { fundingSettledAt: "2026-05-14T08:00:00.000Z", sampleCount: 12, medianNetCarryBps: 60 },
              { fundingSettledAt: "2026-05-14T12:00:00.000Z", sampleCount: 12, medianNetCarryBps: 61 },
              { fundingSettledAt: "2026-05-14T16:00:00.000Z", sampleCount: 12, medianNetCarryBps: 64 },
              { fundingSettledAt: "2026-05-14T20:00:00.000Z", sampleCount: 12, medianNetCarryBps: 66 },
              { fundingSettledAt: "2026-05-15T00:00:00.000Z", sampleCount: 4, medianNetCarryBps: 74 },
            ],
          },
        },
      ],
    });
    writeJson(readinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-PIEVERSE:requires:spreadControl"],
      checks: { perMarketMetricCandidates: false },
      readinessGap: {
        observationSpanMinutes: { current: 1800, required: 4320, remaining: 2520, passed: false },
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
      },
    });
    writeJson(aztecReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: [
        "insufficientObservations",
        "feeScheduleUnconfirmed",
        "market:KRW-AZTEC:notMetricCandidate",
        "market:KRW-AZTEC:requires:moreObservations",
        "market:KRW-AZTEC:requires:spreadControl",
      ],
      checks: {
        sufficientObservations: false,
        sufficientObservationSpan: true,
        completedFundingEvents: true,
        accountFeesConfirmed: false,
        inventoryReady: false,
        hedgeVenueReady: false,
        liveExecutionPathReady: true,
        perMarketMetricCandidates: false,
        perMarketFeeStressReady: true,
      },
      readinessGap: {
        observations: { current: 168, required: 432, remaining: 264, passed: false },
        observationSpanMinutes: { current: 4320, required: 4320, remaining: 0, passed: true },
        completedFundingEvents: { current: 6, required: 6, remaining: 0, passed: true },
      },
      readinessTimeline: {
        bottleneck: "observations",
        estimatedEarliestReviewAt: "2026-05-16T00:00:00.000Z",
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-AZTEC", symbol: "AZTECUSDT" }],
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        watchPath,
        "--spot-perp-carry-fee-stress-report",
        feeStressPath,
        "--spot-perp-carry-live-readiness",
        readinessPath,
        "--spot-perp-carry-live-readiness",
        aztecReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveStartupPlan: {
        status: string;
        reviewCommand: string | null;
        manualValidationCommand: string | null;
        pm2StartCommand: string | null;
        blockedCommands?: { reviewCommand?: string | null; pm2StartCommand?: string | null } | null;
        recompareChallengerPlan?: {
          market: string;
          action: string;
          latestWindowSampleQualityPasses: boolean;
          postSwitchReviewCommand: string;
          postSwitchPm2StartCommand: string;
        } | null;
      };
      spotPerpCarryFocusRecompare: {
        status: string;
        currentFocusDeteriorating: boolean;
        currentFocusLatestWindowDeteriorating: boolean;
        currentFocusDegradationSeverity: string;
        latestWindowsAligned: boolean;
        latestWindowSampleQualityPasses: boolean;
        qualityClearedChallengerBeatsCurrentLatest: boolean;
        needsRecompareBeforeLive: boolean;
        bestChallenger: { market: string; latestWindow: { medianNetCarryBps: number } };
        action: string;
      };
      switchPlan: {
        recommendedResearchFocus?: { market: string | null; caveat: string } | null;
        bestChallengerLiveReadiness: {
          market: string;
          symbol: string;
          liveReady: boolean;
          sourceReadinessPath: string;
          requiredBeforeMetricCandidate: string[];
          checks: {
            sufficientObservations: boolean;
            perMarketMetricCandidates: boolean;
          };
        };
        requiredBeforeSwitchToLive: string[];
      };
      nextActionPlan: Array<{
        currentEvidence?: {
          focusRecompareChallengerLiveReadiness?: {
            market: string;
            liveReady: boolean;
            action: string;
          };
        };
      }>;
      checklist: { spotPerpCarryFocusRecompareClear: boolean };
      blockers: string[];
    };
    assert.equal(report.spotPerpCarryFocusRecompare.status, "current_focus_recompare_required");
    assert.equal(report.spotPerpCarryFocusRecompare.currentFocusDeteriorating, false);
    assert.equal(report.spotPerpCarryFocusRecompare.currentFocusLatestWindowDeteriorating, false);
    assert.equal(report.spotPerpCarryFocusRecompare.currentFocusDegradationSeverity, "none");
    assert.equal(report.spotPerpCarryFocusRecompare.latestWindowsAligned, true);
    assert.equal(report.spotPerpCarryFocusRecompare.latestWindowSampleQualityPasses, false);
    assert.equal(
      report.spotPerpCarryFocusRecompare.qualityClearedChallengerBeatsCurrentLatest,
      true,
    );
    assert.equal(report.spotPerpCarryFocusRecompare.needsRecompareBeforeLive, true);
    assert.equal(report.spotPerpCarryFocusRecompare.bestChallenger.market, "KRW-AZTEC");
    assert.equal(report.spotPerpCarryFocusRecompare.bestChallenger.latestWindow.medianNetCarryBps, 74);
    assert.equal(
      report.spotPerpCarryFocusRecompare.action,
      "collect_latest_window_samples_and_keep_current_focus_live_startup_blocked",
    );
    assert.equal(report.liveStartupPlan.recompareChallengerPlan?.market, "KRW-AZTEC");
    assert.equal(
      report.liveStartupPlan.recompareChallengerPlan?.action,
      "collect_more_latest_window_samples_before_switch_review",
    );
    assert.equal(
      report.liveStartupPlan.recompareChallengerPlan?.latestWindowSampleQualityPasses,
      false,
    );
    assert.equal(report.switchPlan.recommendedResearchFocus, null);
    assert.equal(report.switchPlan.bestChallengerLiveReadiness.market, "KRW-AZTEC");
    assert.equal(report.switchPlan.bestChallengerLiveReadiness.symbol, "AZTECUSDT");
    assert.equal(report.switchPlan.bestChallengerLiveReadiness.liveReady, false);
    assert.equal(report.switchPlan.bestChallengerLiveReadiness.sourceReadinessPath, aztecReadinessPath);
    assert.deepEqual(report.switchPlan.bestChallengerLiveReadiness.requiredBeforeMetricCandidate, [
      "moreObservations",
      "spreadControl",
    ]);
    assert.equal(
      report.switchPlan.bestChallengerLiveReadiness.checks.sufficientObservations,
      false,
    );
    assert.equal(
      report.switchPlan.bestChallengerLiveReadiness.checks.perMarketMetricCandidates,
      false,
    );
    assert.ok(
      report.switchPlan.requiredBeforeSwitchToLive.includes(
        "best challenger live readiness clears before any live startup if focus switches",
      ),
    );
    assert.equal(
      report.nextActionPlan[0].currentEvidence?.focusRecompareChallengerLiveReadiness?.market,
      "KRW-AZTEC",
    );
    assert.equal(
      report.nextActionPlan[0].currentEvidence?.focusRecompareChallengerLiveReadiness?.action,
      "keep_challenger_research_only_until_live_readiness_clears",
    );
    assert.equal(report.checklist.spotPerpCarryFocusRecompareClear, false);
    assert.ok(report.blockers.includes("spotPerpCarryFocusRecompareRequired"));
    assert.equal(report.liveStartupPlan.status, "blocked_current_focus_recompare_required");
    assert.equal(report.liveStartupPlan.reviewCommand, null);
    assert.equal(report.liveStartupPlan.manualValidationCommand, null);
    assert.equal(report.liveStartupPlan.pm2StartCommand, null);
    assert.equal(
      report.liveStartupPlan.blockedCommands?.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
    );
    assert.equal(
      report.liveStartupPlan.blockedCommands?.pm2StartCommand,
      "npm run pm2:start:live-spot-perp-carry-pieverse",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status uses the current-entry report that contains the selected focus snapshot", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-current-entry-selected-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const watchPath = join(directory, "spot-perp-carry-pieverse-72h-latest.json");
    const currentCarryPath = join(
      directory,
      "spot-perp-carry-current-carry-discovery-25bps-current.json",
    );
    const topFundingPath = join(
      directory,
      "spot-perp-carry-top-funding-discovery-25bps-current.json",
    );
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(watchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservationSpan"],
      summary: {
        count: 120,
        completedFundingCount: 6,
        positiveRate: 1,
        depthCoverageRate: 1,
        medianNetCarryBps: 70,
        totalEstimatedNetPnlKrw: 350_000,
        executionEligibleCount: 120,
        executionEligibleRate: 1,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 70,
        executionEligibleTotalEstimatedNetPnlKrw: 350_000,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 120,
          completedFundingCount: 6,
          executionEligibleMedianNetCarryBps: 70,
          executionEligibleTotalEstimatedNetPnlKrw: 350_000,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 70,
          estimatedNetPnlKrw: 3500,
          depthCovered: true,
        },
      ],
    });
    writeJson(currentCarryPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      usableForLivePromotion: false,
      blockers: ["weakMedianNetCarry"],
      summary: {
        count: 2,
        completedFundingCount: 1,
        positiveRate: 0,
        executionEligibleRate: 1,
        medianNetCarryBps: -5,
        executionEligibleMedianNetCarryBps: -5,
        rawPricingArtifactCount: 0,
      },
      topExecutableCarry: [
        {
          market: "KRW-AKT",
          symbol: "AKTUSDT",
          netCarryBps: 52,
          estimatedNetPnlKrw: 2600,
          spotSpreadBps: 9,
          perpSpreadBps: 3,
          usdtKrwSpreadBps: 6.7,
          depthCovered: true,
        },
      ],
    });
    writeJson(topFundingPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      usableForLivePromotion: false,
      blockers: ["singleSnapshotDiagnosticOnly"],
      summary: {
        count: 2,
        completedFundingCount: 1,
        positiveRate: 0.5,
        executionEligibleRate: 1,
        medianNetCarryBps: 41,
        executionEligibleMedianNetCarryBps: 41,
        rawPricingArtifactCount: 0,
        spreadControl: {
          thresholds: {
            maxSpotSpreadBps: 30,
            maxPerpSpreadBps: 10,
            maxUsdtKrwSpreadBps: 20,
          },
        },
      },
      topExecutableCarry: [
        {
          capturedAt: "2026-05-14T12:28:34.760Z",
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 43.5,
          estimatedNetPnlKrw: 2175,
          spotSpreadBps: 19.9,
          perpSpreadBps: 4.8,
          usdtKrwSpreadBps: 6.7,
          depthCovered: true,
          fundingSettledAt: "2026-05-14T12:00:00.001Z",
          nextFundingTime: "2026-05-14T16:00:00.000Z",
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-watch-report",
        watchPath,
        "--spot-perp-carry-watch-report",
        currentCarryPath,
        "--spot-perp-carry-watch-report",
        topFundingPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      spotPerpCarryCurrentEntrySanity: {
        status: string;
        preferredSourcePath: string;
        preferredSourceKind: string;
        currentEntryBlockers: string[];
        selectedMarketCurrentEntrySnapshot: {
          source: string;
          market: string;
          netCarryBps: number;
          spotSpreadBps: number;
        } | null;
      };
      checklist: {
        spotPerpCarryCurrentEntrySanity: boolean;
      };
    };
    assert.equal(report.spotPerpCarryCurrentEntrySanity.status, "current_entry_clear");
    assert.equal(report.spotPerpCarryCurrentEntrySanity.preferredSourcePath, topFundingPath);
    assert.equal(report.spotPerpCarryCurrentEntrySanity.preferredSourceKind, "top_funding_fee_stress");
    assert.deepEqual(report.spotPerpCarryCurrentEntrySanity.currentEntryBlockers, []);
    assert.equal(report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.source, "top_executable_carry");
    assert.equal(report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.market, "KRW-PIEVERSE");
    assert.equal(report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.netCarryBps, 43.5);
    assert.equal(report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.spotSpreadBps, 19.9);
    assert.equal(report.checklist.spotPerpCarryCurrentEntrySanity, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status uses focused current-entry report for selected focus snapshot", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-focused-current-entry-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const watchPath = join(directory, "spot-perp-carry-pieverse-72h-latest.json");
    const currentCarryPath = join(
      directory,
      "spot-perp-carry-current-carry-discovery-25bps-current.json",
    );
    const focusedPath = join(
      directory,
      "spot-perp-carry-focus-current-entry-25bps-latest.json",
    );
    const generatedAt = new Date().toISOString();
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(watchPath, {
      generatedAt,
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservationSpan"],
      summary: {
        count: 120,
        completedFundingCount: 6,
        positiveRate: 1,
        depthCoverageRate: 1,
        medianNetCarryBps: 70,
        totalEstimatedNetPnlKrw: 350_000,
        executionEligibleCount: 120,
        executionEligibleRate: 1,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 70,
        executionEligibleTotalEstimatedNetPnlKrw: 350_000,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 120,
          completedFundingCount: 6,
          executionEligibleMedianNetCarryBps: 70,
          executionEligibleTotalEstimatedNetPnlKrw: 350_000,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 70,
          estimatedNetPnlKrw: 3500,
          depthCovered: true,
        },
      ],
    });
    writeJson(currentCarryPath, {
      generatedAt,
      status: "blocked",
      promotionEligible: false,
      usableForLivePromotion: false,
      summary: {
        count: 1,
        completedFundingCount: 1,
        positiveRate: 1,
        executionEligibleRate: 1,
        medianNetCarryBps: 80,
        executionEligibleMedianNetCarryBps: 80,
        rawPricingArtifactCount: 0,
      },
      topExecutableCarry: [
        {
          market: "KRW-AKT",
          symbol: "AKTUSDT",
          netCarryBps: 80,
          estimatedNetPnlKrw: 4000,
          spotSpreadBps: 5,
          perpSpreadBps: 1,
          usdtKrwSpreadBps: 2,
          depthCovered: true,
        },
      ],
    });
    writeJson(focusedPath, {
      generatedAt,
      status: "blocked",
      promotionEligible: false,
      usableForLivePromotion: false,
      summary: {
        count: 1,
        completedFundingCount: 1,
        positiveRate: 1,
        executionEligibleRate: 1,
        medianNetCarryBps: 24,
        executionEligibleMedianNetCarryBps: 24,
        rawPricingArtifactCount: 0,
      },
      topExecutableCarry: [
        {
          capturedAt: generatedAt,
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 24,
          estimatedNetPnlKrw: 1200,
          spotSpreadBps: 5,
          perpSpreadBps: 1,
          usdtKrwSpreadBps: 2,
          depthCovered: true,
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-watch-report",
        watchPath,
        "--spot-perp-carry-watch-report",
        currentCarryPath,
        "--spot-perp-carry-watch-report",
        focusedPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      spotPerpCarryCurrentEntrySanity: {
        preferredSourcePath: string;
        preferredSourceKind: string;
        currentEntryBlockers: string[];
        selectedMarketCurrentEntrySnapshot: { market: string; netCarryBps: number } | null;
      };
    };
    assert.equal(report.spotPerpCarryCurrentEntrySanity.preferredSourcePath, focusedPath);
    assert.equal(report.spotPerpCarryCurrentEntrySanity.preferredSourceKind, "focused_current_entry_fee_stress");
    assert.deepEqual(report.spotPerpCarryCurrentEntrySanity.currentEntryBlockers, []);
    assert.equal(report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.market, "KRW-PIEVERSE");
    assert.equal(report.spotPerpCarryCurrentEntrySanity.selectedMarketCurrentEntrySnapshot?.netCarryBps, 24);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status treats rare filtered spread rejections as controlled", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-filtered-spread-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const watchPath = join(directory, "spot-perp-carry-pieverse.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(watchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: [
        "insufficientObservations",
        "insufficientObservationSpan",
        "insufficientCompletedFundingEvents",
        "feeScheduleUnconfirmed",
        "inventoryNotReady",
        "hedgeVenueNotReady",
      ],
      summary: {
        count: 20,
        supportedFundingCount: 20,
        completedFundingCount: 2,
        positiveCount: 19,
        positiveRate: 0.95,
        depthCoverageRate: 1,
        medianNetCarryBps: 92,
        totalEstimatedNetPnlKrw: 92_000,
        executionEligibleCount: 19,
        executionEligibleRate: 0.95,
        executionRejectedCount: 1,
        executionRejectedRate: 0.05,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 1,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        executionEligiblePositiveCount: 19,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 92,
        executionEligibleTotalEstimatedNetPnlKrw: 87_400,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 20,
          completedFundingCount: 2,
          executionEligibleCount: 19,
          executionEligibleRate: 0.95,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 92,
          executionEligibleTotalEstimatedNetPnlKrw: 87_400,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          watchDecision: {
            status: "collect_more_evidence",
            reasons: [],
            requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 92,
          estimatedNetPnlKrw: 4_600,
          depthCovered: true,
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-watch-report",
        watchPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      checklist: { spotPerpCarrySpreadControl?: boolean };
      blockers: string[];
      spotPerpCarryResearchFocusDecision: {
        action: string;
        highestExpectedSpreadPassed: boolean;
      };
      carryWatchlist: Array<{
        spreadControl?: {
          policy?: string;
          minExecutionEligibleRate?: number;
          maxSpreadRejectionSignalRate?: number;
          spreadRejectionSignalRate?: number;
          passed?: boolean;
        } | null;
      }>;
    };
    assert.equal(report.checklist.spotPerpCarrySpreadControl, true);
    assert.ok(!report.blockers.includes("spotPerpCarrySpreadControl"));
    assert.equal(report.spotPerpCarryResearchFocusDecision.action, "continue_highest_expected_carry_observation");
    assert.equal(report.spotPerpCarryResearchFocusDecision.highestExpectedSpreadPassed, true);
    assert.equal(report.carryWatchlist[0]?.spreadControl?.policy, "filter_wide_spread_entries");
    assert.equal(report.carryWatchlist[0]?.spreadControl?.minExecutionEligibleRate, 0.95);
    assert.equal(report.carryWatchlist[0]?.spreadControl?.maxSpreadRejectionSignalRate, 0.05);
    assert.equal(report.carryWatchlist[0]?.spreadControl?.spreadRejectionSignalRate, 0.05);
    assert.equal(report.carryWatchlist[0]?.spreadControl?.passed, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status separates same-sample paired carry comparison from appended single-market history", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-carry-paired-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const pairedPath = join(directory, "spot-perp-carry-pieverse-edu.json");
    const singlePath = join(directory, "spot-perp-carry-pieverse-single.json");
    const broadPath = join(directory, "spot-perp-carry-top-funding.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(pairedPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 180,
      summary: {
        count: 24,
        completedFundingCount: 2,
        positiveRate: 1,
        executionEligibleRate: 1,
        executionEligibleMedianNetCarryBps: 65,
        executionEligibleTotalEstimatedNetPnlKrw: 16_200,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 12,
          completedFundingCount: 2,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 90,
          executionEligibleTotalEstimatedNetPnlKrw: 10_800,
          depthCoverageRate: 1,
        },
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          count: 12,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 45,
          executionEligibleTotalEstimatedNetPnlKrw: 5_400,
          depthCoverageRate: 1,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 90,
          estimatedNetPnlKrw: 10_800,
          depthCovered: true,
        },
      ],
    });
    writeJson(singlePath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 420,
      summary: {
        count: 80,
        completedFundingCount: 2,
        positiveRate: 1,
        executionEligibleRate: 1,
        executionEligibleMedianNetCarryBps: 300,
        executionEligibleTotalEstimatedNetPnlKrw: 120_000,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 80,
          completedFundingCount: 2,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 300,
          executionEligibleTotalEstimatedNetPnlKrw: 120_000,
          depthCoverageRate: 1,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 300,
          estimatedNetPnlKrw: 120_000,
          depthCovered: true,
        },
      ],
    });
    writeJson(broadPath, {
      generatedAt: new Date(Date.now() + 60_000).toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 1,
      summary: {
        count: 3,
        completedFundingCount: 1,
        positiveRate: 1,
        executionEligibleRate: 0.333333,
        executionEligibleMedianNetCarryBps: 90,
        executionEligibleTotalEstimatedNetPnlKrw: 4_500,
        rawPricingArtifactCount: 1,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
        executionRejectedCount: 2,
        executionRejectedRate: 0.666667,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 1,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 1,
        },
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleCount: 1,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 90,
          executionEligibleTotalEstimatedNetPnlKrw: 4_500,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
        },
        {
          market: "KRW-META",
          symbol: "METAUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleCount: 0,
          executionEligibleRate: 0,
          executionEligiblePositiveRate: 0,
          executionEligibleMedianNetCarryBps: 999_999,
          executionEligibleTotalEstimatedNetPnlKrw: 0,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 1,
        },
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleCount: 1,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 45,
          executionEligibleTotalEstimatedNetPnlKrw: 2_250,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 90,
          estimatedNetPnlKrw: 4_500,
          depthCovered: true,
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        pairedPath,
        "--spot-perp-carry-watch-report",
        singlePath,
        "--spot-perp-carry-watch-report",
        broadPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      spotPerpCarryPairedMarketComparison: {
        path: string;
        observationCount: number;
        marketCount: number;
        repeatedMarketCount: number;
        focusMarketCount: number;
        markets: Array<{
          market: string;
          count: number;
          executionEligibleMedianNetCarryBps: number;
        }>;
        strongestByMedianNetCarry: {
          market: string;
          executionEligibleMedianNetCarryBps: number;
        };
        interpretation: string;
      };
      carryWatchlist: Array<{
        topExecutableCarry: Array<{ market: string }>;
        executableEvidence: { medianNetCarryBps: number };
      }>;
      completionAudit: {
        promptToArtifactChecklist: Array<{
          requirement: string;
          passed: boolean;
          artifact: string;
          evidence?: {
            pairedMarketComparisonSupportsResearchFocus?: boolean | null;
            pairedMarketComparison?: {
              path: string;
              strongestByMedianNetCarry: {
                market: string;
                executionEligibleMedianNetCarryBps: number;
              };
            } | null;
          };
        }>;
      };
      nextActionPlan: Array<{
        track: string;
        currentEvidence: {
          pairedMarketComparison?: {
            path: string;
            strongestByMedianNetCarry: {
              market: string;
              executionEligibleMedianNetCarryBps: number;
            };
          } | null;
        };
      }>;
    };
    assert.equal(report.carryWatchlist[0]?.topExecutableCarry[0]?.market, "KRW-PIEVERSE");
    assert.equal(report.carryWatchlist[0]?.executableEvidence.medianNetCarryBps, 300);
    assert.equal(report.spotPerpCarryPairedMarketComparison.path, pairedPath);
    assert.equal(report.spotPerpCarryPairedMarketComparison.observationCount, 24);
    assert.equal(report.spotPerpCarryPairedMarketComparison.marketCount, 2);
    assert.equal(report.spotPerpCarryPairedMarketComparison.repeatedMarketCount, 2);
    assert.equal(report.spotPerpCarryPairedMarketComparison.focusMarketCount, 12);
    assert.equal(report.spotPerpCarryPairedMarketComparison.markets[0]?.count, 12);
    assert.equal(
      report.spotPerpCarryPairedMarketComparison.strongestByMedianNetCarry.market,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.spotPerpCarryPairedMarketComparison.strongestByMedianNetCarry
        .executionEligibleMedianNetCarryBps,
      90,
    );
    assert.match(
      report.spotPerpCarryPairedMarketComparison.interpretation,
      /Same-sample market comparison/,
    );
    const profitabilityAudit = report.completionAudit.promptToArtifactChecklist.find((item) =>
      item.requirement.includes("best current profitability research focus"),
    );
    assert.equal(profitabilityAudit?.passed, true);
    assert.match(profitabilityAudit?.artifact ?? "", /spotPerpCarryPairedMarketComparison/);
    assert.equal(
      profitabilityAudit?.evidence?.pairedMarketComparisonSupportsResearchFocus,
      true,
    );
    assert.equal(
      profitabilityAudit?.evidence?.pairedMarketComparison?.strongestByMedianNetCarry.market,
      "KRW-PIEVERSE",
    );
    const watchAction = report.nextActionPlan.find(
      (action) => action.track === "spot_perp_carry_watchlist",
    );
    assert.equal(watchAction?.currentEvidence.pairedMarketComparison?.path, pairedPath);
    assert.equal(
      watchAction?.currentEvidence.pairedMarketComparison?.strongestByMedianNetCarry
        .executionEligibleMedianNetCarryBps,
      90,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status blocks carry focus confidence when paired evidence disagrees", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-carry-paired-disagree-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const pairedPath = join(directory, "spot-perp-carry-paired.json");
    const singlePath = join(directory, "spot-perp-carry-pieverse-single.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(singlePath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 300,
      summary: {
        count: 80,
        completedFundingCount: 2,
        positiveRate: 1,
        executionEligibleRate: 1,
        executionEligibleMedianNetCarryBps: 300,
        executionEligibleTotalEstimatedNetPnlKrw: 120_000,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 80,
          completedFundingCount: 2,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 300,
          executionEligibleTotalEstimatedNetPnlKrw: 120_000,
          depthCoverageRate: 1,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 300,
          estimatedNetPnlKrw: 120_000,
          depthCovered: true,
        },
      ],
    });
    writeJson(pairedPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 120,
      summary: {
        count: 20,
        completedFundingCount: 2,
        positiveRate: 1,
        executionEligibleRate: 1,
        executionEligibleMedianNetCarryBps: 120,
        executionEligibleTotalEstimatedNetPnlKrw: 18_000,
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 10,
          completedFundingCount: 2,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 80,
          executionEligibleTotalEstimatedNetPnlKrw: 8_000,
          depthCoverageRate: 1,
        },
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          count: 10,
          completedFundingCount: 2,
          executionEligibleRate: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 120,
          executionEligibleTotalEstimatedNetPnlKrw: 12_000,
          depthCoverageRate: 1,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          netCarryBps: 120,
          estimatedNetPnlKrw: 12_000,
          depthCovered: true,
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        singlePath,
        "--spot-perp-carry-watch-report",
        pairedPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      spotPerpCarryCandidateRoles: {
        highestExpectedCarryCandidate: { market: string };
      };
      spotPerpCarryResearchFocusDecision: {
        action: string;
        pairedMarketComparisonSupportsResearchFocus: boolean;
      };
      spotPerpCarryPairedMarketComparison: {
        strongestByMedianNetCarry: { market: string };
      };
      checklist: {
        spotPerpCarryPairedFocusSupported?: boolean;
      };
      blockers: string[];
      completionAudit: {
        promptToArtifactChecklist: Array<{
          requirement: string;
          passed: boolean;
          evidence?: {
            pairedMarketComparisonSupportsResearchFocus?: boolean | null;
          };
        }>;
      };
    };
    assert.equal(
      report.spotPerpCarryCandidateRoles.highestExpectedCarryCandidate.market,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.spotPerpCarryPairedMarketComparison.strongestByMedianNetCarry.market,
      "KRW-EDU",
    );
    assert.equal(
      report.spotPerpCarryResearchFocusDecision.action,
      "compare_paired_disagreement_before_continuing_focus",
    );
    assert.equal(
      report.spotPerpCarryResearchFocusDecision.pairedMarketComparisonSupportsResearchFocus,
      false,
    );
    assert.equal(report.checklist.spotPerpCarryPairedFocusSupported, false);
    assert.ok(report.blockers.includes("spotPerpCarryPairedFocusSupported"));
    const profitabilityAudit = report.completionAudit.promptToArtifactChecklist.find((item) =>
      item.requirement.includes("best current profitability research focus"),
    );
    assert.equal(profitabilityAudit?.passed, false);
    assert.equal(
      profitabilityAudit?.evidence?.pairedMarketComparisonSupportsResearchFocus,
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status demotes carry markets that fail current fee stress without overriding dedicated stress evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-carry-fee-stress-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const watchPath = join(directory, "spot-perp-carry-watch.json");
    const broadStressPath = join(directory, "spot-perp-carry-top-funding-25bps.json");
    const eduStressPath = join(directory, "spot-perp-carry-edu-fee-stress.json");
    const cotiStressPath = join(directory, "spot-perp-carry-coti-fee-stress.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(watchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientCompletedFundingEvents"],
      summary: {
        count: 20,
        supportedFundingCount: 20,
        completedFundingCount: 1,
        positiveCount: 18,
        positiveRate: 0.9,
        executionEligibleCount: 20,
        executionEligibleRate: 1,
        executionEligiblePositiveCount: 18,
        executionEligiblePositiveRate: 0.9,
        executionEligibleMedianNetCarryBps: 35,
        executionEligibleTotalEstimatedNetPnlKrw: 35_000,
        rawPricingArtifactCount: 0,
        depthCoverageRate: 1,
      },
      perMarketSummary: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          count: 12,
          completedFundingCount: 1,
          executionEligibleCount: 12,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 45,
          executionEligibleTotalEstimatedNetPnlKrw: 22_500,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
            killPolicy: { minCompletedFundingEventsBeforeKill: 2 },
          },
        },
        {
          market: "KRW-COTI",
          symbol: "COTIUSDT",
          count: 12,
          completedFundingCount: 1,
          executionEligibleCount: 12,
          executionEligiblePositiveRate: 0.95,
          executionEligibleMedianNetCarryBps: 22,
          executionEligibleTotalEstimatedNetPnlKrw: 11_000,
          depthCoverageRate: 1,
          rawPricingArtifactCount: 0,
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
            killPolicy: { minCompletedFundingEventsBeforeKill: 2 },
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          netCarryBps: 45,
          estimatedNetPnlKrw: 2_250,
          depthCovered: true,
        },
      ],
    });
    writeJson(broadStressPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      assumptions: {
        bithumbFeeBps: 25,
        binanceTakerFeeBps: 5,
        exitCostBufferBps: 20,
      },
      summary: {
        count: 2,
        rawPricingArtifactCount: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleMedianNetCarryBps: 42,
          executionEligiblePositiveRate: 0,
          rawPricingArtifactCount: 0,
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
          },
        },
        {
          market: "KRW-COTI",
          symbol: "COTIUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleMedianNetCarryBps: 32.5,
          executionEligiblePositiveRate: 0.95,
          rawPricingArtifactCount: 0,
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          netCarryBps: 42,
          estimatedNetPnlKrw: 2_100,
          depthCovered: true,
        },
      ],
    });
    writeJson(eduStressPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      assumptions: {
        bithumbFeeBps: 25,
        binanceTakerFeeBps: 5,
        exitCostBufferBps: 20,
      },
      summary: {
        count: 12,
        executionEligibleMedianNetCarryBps: 24.5,
        executionEligiblePositiveRate: 0.95,
        rawPricingArtifactCount: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          count: 12,
          completedFundingCount: 1,
          executionEligibleMedianNetCarryBps: 24.5,
          executionEligiblePositiveRate: 0.95,
          rawPricingArtifactCount: 0,
        },
      ],
    });
    writeJson(cotiStressPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      assumptions: {
        bithumbFeeBps: 25,
        binanceTakerFeeBps: 5,
        exitCostBufferBps: 20,
      },
      summary: {
        count: 12,
        executionEligibleMedianNetCarryBps: 2.5,
        executionEligiblePositiveRate: 0,
        rawPricingArtifactCount: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-COTI",
          symbol: "COTIUSDT",
          count: 12,
          completedFundingCount: 1,
          executionEligibleMedianNetCarryBps: 2.5,
          executionEligiblePositiveRate: 0,
          rawPricingArtifactCount: 0,
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        watchPath,
        "--spot-perp-carry-watch-report",
        broadStressPath,
        "--spot-perp-carry-fee-stress-report",
        eduStressPath,
        "--spot-perp-carry-fee-stress-report",
        cotiStressPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      carryMarketDecisionMatrix: Array<{
        market: string;
        sourcePath: string;
        decision: string;
        reasons: string[];
        feeStressEvidence?: {
          source: string;
          path: string;
          executionEligibleMedianNetCarryBps: number;
          executionEligiblePositiveRate: number;
          failed: boolean;
        };
      }>;
      feeStressDemotedMarkets: Array<{
        market: string;
        decision: string;
        feeStressEvidence?: {
          source: string;
          failed: boolean;
          executionEligibleMedianNetCarryBps: number;
        };
        interpretation: string;
      }>;
      feeStressMetricCandidates: Array<{
        market: string;
        symbol: string;
        usableForLivePromotion: boolean;
        metrics: {
          executionEligibleMedianNetCarryBps: number;
          executionEligiblePositiveRate: number;
        };
        interpretation: string;
      }>;
      livePromotionRoadmap: {
        alternativeResearchCandidates: Array<{ market: string }>;
      } | null;
      completionAudit: {
        promptToArtifactChecklist: Array<{
          requirement: string;
          passed: boolean;
          evidence?: {
            failedMarketCount?: number;
            demotedMarketCount?: number;
            demotedMarkets?: Array<{
              market: string;
              medianNetCarryBps: number | null;
              positiveRate: number | null;
            }>;
          };
        }>;
      };
    };
    const eduDecision = report.carryMarketDecisionMatrix.find(
      (row) => row.market === "KRW-EDU" && row.sourcePath === watchPath,
    );
    const cotiDecision = report.carryMarketDecisionMatrix.find(
      (row) => row.market === "KRW-COTI" && row.sourcePath === watchPath,
    );
    assert.equal(eduDecision?.decision, "continue_until_kill_window");
    assert.equal(eduDecision?.feeStressEvidence?.source, "fee_stress_report");
    assert.equal(eduDecision?.feeStressEvidence?.failed, false);
    assert.equal(eduDecision?.feeStressEvidence?.executionEligibleMedianNetCarryBps, 24.5);
    assert.deepEqual(
      report.feeStressMetricCandidates.map((row) => row.market),
      ["KRW-EDU"],
    );
    assert.equal(report.feeStressMetricCandidates[0]?.symbol, "EDUUSDT");
    assert.equal(report.feeStressMetricCandidates[0]?.usableForLivePromotion, false);
    assert.equal(
      report.feeStressMetricCandidates[0]?.metrics.executionEligibleMedianNetCarryBps,
      24.5,
    );
    assert.equal(
      report.feeStressMetricCandidates[0]?.metrics.executionEligiblePositiveRate,
      0.95,
    );
    assert.match(
      report.feeStressMetricCandidates[0]?.interpretation ?? "",
      /does not bypass full observation-span/,
    );
    assert.equal(cotiDecision?.decision, "reject_or_demote_fee_stress_failed");
    assert.equal(cotiDecision?.feeStressEvidence?.source, "fee_stress_report");
    assert.equal(cotiDecision?.feeStressEvidence?.failed, true);
    assert.ok(cotiDecision?.reasons.includes("feeStressFailed"));
    assert.ok(
      !report.livePromotionRoadmap?.alternativeResearchCandidates.some(
        (candidate) => candidate.market === "KRW-COTI",
      ),
      "demoted COTI must not reappear as an alternative research candidate",
    );
    assert.deepEqual(
      report.feeStressDemotedMarkets.map((row) => row.market),
      ["KRW-COTI"],
    );
    assert.equal(
      report.feeStressDemotedMarkets[0]?.decision,
      "reject_or_demote_fee_stress_failed",
    );
    assert.equal(report.feeStressDemotedMarkets[0]?.feeStressEvidence?.source, "fee_stress_report");
    assert.equal(report.feeStressDemotedMarkets[0]?.feeStressEvidence?.failed, true);
    assert.match(report.feeStressDemotedMarkets[0]?.interpretation ?? "", /keep out of live focus/);
    const feeStressAudit = report.completionAudit.promptToArtifactChecklist.find((item) =>
      item.requirement.includes("nominally positive carry markets"),
    );
    assert.equal(feeStressAudit?.passed, true);
    assert.equal(feeStressAudit?.evidence?.failedMarketCount, 1);
    assert.equal(feeStressAudit?.evidence?.demotedMarketCount, 1);
    assert.equal(feeStressAudit?.evidence?.demotedMarkets?.[0]?.market, "KRW-COTI");
    assert.equal(feeStressAudit?.evidence?.demotedMarkets?.[0]?.medianNetCarryBps, 2.5);
    assert.equal(feeStressAudit?.evidence?.demotedMarkets?.[0]?.positiveRate, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status aligns carry live readiness with the strongest carry watch market", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-carry-readiness-match-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const combinedWatchPath = join(
      directory,
      "spot-perp-carry-pieverse-edu-72h-latest.json",
    );
    const pieverseWatchPath = join(directory, "spot-perp-carry-pieverse-72h-latest.json");
    const combinedReadinessPath = join(
      directory,
      "spot-perp-carry-pieverse-edu-live-readiness.json",
    );
    const pieverseReadinessPath = join(
      directory,
      "spot-perp-carry-pieverse-live-readiness.json",
    );
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(combinedWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      summary: {
        count: 44,
        completedFundingCount: 2,
        positiveRate: 0.931818,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 55.770624,
        executionEligibleTotalEstimatedNetPnlKrw: 153_323.466281,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          completedFundingCount: 2,
          executionEligibleMedianNetCarryBps: 103.181341,
        },
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          completedFundingCount: 1,
          executionEligibleMedianNetCarryBps: 46.998367,
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 103.181341,
          estimatedNetPnlKrw: 104_216.812364,
          depthCovered: true,
        },
      ],
    });
    writeJson(pieverseWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      summary: {
        count: 23,
        completedFundingCount: 2,
        positiveRate: 0.913043,
        executionRejectedCount: 2,
        executionRejectedRate: 0.086957,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 2,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 104.109981,
        executionEligibleTotalEstimatedNetPnlKrw: 109_723.505435,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          completedFundingCount: 2,
          executionEligibleMedianNetCarryBps: 104.109981,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
            killPolicy: {
              minMedianNetCarryBps: 20,
            },
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 104.109981,
          estimatedNetPnlKrw: 109_723.505435,
          depthCovered: true,
        },
      ],
    });
    writeJson(combinedReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-EDU:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      readinessGap: {
        observations: { current: 44, required: 432, remaining: 388, passed: false },
      },
      evidence: {
        perMarketSummary: [
          { market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" },
          { market: "KRW-EDU", symbol: "EDUUSDT" },
        ],
      },
    });
    writeJson(pieverseReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-PIEVERSE:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      readinessGap: {
        observations: { current: 23, required: 432, remaining: 409, passed: false },
      },
      readinessTimeline: {
        bottleneck: "observationSpanMinutes",
        estimatedEarliestReviewAt: "2026-05-16T18:00:00.000Z",
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        combinedWatchPath,
        "--spot-perp-carry-watch-report",
        pieverseWatchPath,
        "--spot-perp-carry-live-readiness",
        combinedReadinessPath,
        "--spot-perp-carry-live-readiness",
        pieverseReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string };
      checklist: {
        spotPerpCarrySpreadControl?: boolean;
      };
      blockers: string[];
      carryWatchlist: Array<{
        perMarketSummary: Array<{ market: string }>;
      }>;
      carryLiveReadiness: {
        path: string;
        readinessGap: {
          observations: { remaining: number };
        };
        readinessTimeline?: {
          bottleneck?: string;
          estimatedEarliestReviewAt?: string;
        } | null;
      };
      carryLiveReadinessReports: Array<{ path: string }>;
      nextActionPlan: Array<{
        track: string;
        currentEvidence: {
          liveReadinessPath?: string;
          readinessGap?: { observations?: { remaining?: number } };
          readinessTimeline?: {
            bottleneck?: string;
            estimatedEarliestReviewAt?: string;
          } | null;
          decision?: { nextDecisionTrigger?: string };
          spreadControl?: {
            spreadRejectionSignalCount?: number;
            spreadRejectionSignalRate?: number | null;
            spotSpreadTooWideCount?: number;
            rawPricingArtifactCount?: number | null;
            passed?: boolean;
          } | null;
        };
        promotionCriteria?: { minObservations?: number };
        killCriteria?: { minMedianNetCarryBps?: number };
        verificationCommand?: string;
      }>;
    };
    assert.equal(report.selectedCandidate.type, "spot_perp_carry_watch_candidate");
    assert.equal(report.checklist.spotPerpCarrySpreadControl, false);
    assert.ok(report.blockers.includes("spotPerpCarrySpreadControl"));
    assert.equal(report.carryWatchlist[0]?.perMarketSummary[0]?.market, "KRW-PIEVERSE");
    assert.equal(report.carryLiveReadiness.path, pieverseReadinessPath);
    assert.equal(report.carryLiveReadiness.readinessGap.observations.remaining, 409);
    assert.equal(report.carryLiveReadiness.readinessTimeline?.bottleneck, "observationSpanMinutes");
    assert.equal(report.carryLiveReadinessReports[0]?.path, combinedReadinessPath);
    const watchAction = report.nextActionPlan.find(
      (action) => action.track === "spot_perp_carry_watchlist",
    );
    assert.equal(watchAction?.currentEvidence.liveReadinessPath, pieverseReadinessPath);
    assert.equal(watchAction?.currentEvidence.readinessGap?.observations?.remaining, 409);
    assert.equal(watchAction?.currentEvidence.readinessTimeline?.bottleneck, "observationSpanMinutes");
    assert.equal(
      watchAction?.currentEvidence.readinessTimeline?.estimatedEarliestReviewAt,
      "2026-05-16T18:00:00.000Z",
    );
    assert.equal(watchAction?.currentEvidence.spreadControl?.spreadRejectionSignalCount, 2);
    assert.equal(watchAction?.currentEvidence.spreadControl?.spreadRejectionSignalRate, 0.086957);
    assert.equal(watchAction?.currentEvidence.spreadControl?.spotSpreadTooWideCount, 2);
    assert.equal(watchAction?.currentEvidence.spreadControl?.rawPricingArtifactCount, 0);
    assert.equal(watchAction?.currentEvidence.spreadControl?.passed, false);
    assert.equal(watchAction?.currentEvidence.decision?.nextDecisionTrigger, "moreCompletedFundingEvents");
    assert.equal(watchAction?.promotionCriteria?.minObservations, 432);
    assert.equal(watchAction?.killCriteria?.minMedianNetCarryBps, 20);
    assert.equal(
      watchAction?.verificationCommand,
      "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness && npm run dry-run:gate-live-goal-ready",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status exposes the EDU gated live startup command when EDU is the carry focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-edu-startup-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const eduWatchPath = join(directory, "spot-perp-carry-edu-72h-latest.json");
    const eduReadinessPath = join(directory, "spot-perp-carry-edu-live-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(eduWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 240,
      summary: {
        count: 36,
        completedFundingCount: 2,
        positiveRate: 1,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 48.25,
        executionEligibleTotalEstimatedNetPnlKrw: 86_850,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          completedFundingCount: 2,
          executionEligibleMedianNetCarryBps: 48.25,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-EDU",
          symbol: "EDUUSDT",
          netCarryBps: 48.25,
          estimatedNetPnlKrw: 2_412.5,
          depthCovered: true,
        },
      ],
    });
    writeJson(eduReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-EDU:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      readinessGap: {
        observations: { current: 36, required: 432, remaining: 396, passed: false },
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-EDU", symbol: "EDUUSDT" }],
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        eduWatchPath,
        "--spot-perp-carry-live-readiness",
        eduReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveStartupPlan: {
        researchFocusMarket: string | null;
        reviewCommand: string;
        manualValidationCommand?: string | null;
        pm2StartCommand?: string | null;
      };
    };
    assert.equal(report.liveStartupPlan.researchFocusMarket, "KRW-EDU");
    assert.equal(
      report.liveStartupPlan.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-edu-live-ready",
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--readiness-report var\/reports\/spot-perp-carry-edu-live-readiness-latest\.json/,
    );
    assert.equal(
      report.liveStartupPlan.pm2StartCommand,
      "npm run pm2:start:live-spot-perp-carry-edu",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status exposes the CYS gated live startup command when CYS is the carry focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-cys-startup-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const cysWatchPath = join(directory, "spot-perp-carry-cys-72h-latest.json");
    const cysReadinessPath = join(directory, "spot-perp-carry-cys-live-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(cysWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 300,
      summary: {
        count: 40,
        completedFundingCount: 2,
        positiveRate: 1,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 82.5,
        executionEligibleTotalEstimatedNetPnlKrw: 165_000,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-CYS",
          symbol: "CYSUSDT",
          completedFundingCount: 2,
          executionEligibleMedianNetCarryBps: 82.5,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-CYS",
          symbol: "CYSUSDT",
          netCarryBps: 82.5,
          estimatedNetPnlKrw: 4_125,
          depthCovered: true,
        },
      ],
    });
    writeJson(cysReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-CYS:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      readinessGap: {
        observations: { current: 40, required: 432, remaining: 392, passed: false },
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-CYS", symbol: "CYSUSDT" }],
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        cysWatchPath,
        "--spot-perp-carry-live-readiness",
        cysReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveStartupPlan: {
        researchFocusMarket: string | null;
        reviewCommand: string;
        manualValidationCommand?: string | null;
        pm2StartCommand?: string | null;
      };
      nextActionPlan: Array<{ track: string; verificationCommand?: string }>;
    };
    assert.equal(report.liveStartupPlan.researchFocusMarket, "KRW-CYS");
    assert.equal(
      report.liveStartupPlan.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-cys-live-ready",
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--readiness-report var\/reports\/spot-perp-carry-cys-live-readiness-latest\.json/,
    );
    assert.equal(
      report.liveStartupPlan.pm2StartCommand,
      "npm run pm2:start:live-spot-perp-carry-cys",
    );
    const watchAction = report.nextActionPlan.find(
      (action) => action.track === "spot_perp_carry_watchlist",
    );
    assert.equal(
      watchAction?.verificationCommand,
      "npm run dry-run:refresh-spot-perp-carry-cys-live-readiness && npm run dry-run:gate-live-goal-ready",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status exposes the AZTEC gated live startup command when AZTEC is the carry focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-aztec-startup-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const aztecWatchPath = join(directory, "spot-perp-carry-aztec-72h-latest.json");
    const aztecReadinessPath = join(directory, "spot-perp-carry-aztec-live-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(aztecWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 360,
      summary: {
        count: 60,
        completedFundingCount: 2,
        positiveRate: 1,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 88.25,
        executionEligibleTotalEstimatedNetPnlKrw: 176_500,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-AZTEC",
          symbol: "AZTECUSDT",
          completedFundingCount: 2,
          executionEligibleMedianNetCarryBps: 88.25,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-AZTEC",
          symbol: "AZTECUSDT",
          netCarryBps: 88.25,
          estimatedNetPnlKrw: 4_412,
          depthCovered: true,
        },
      ],
    });
    writeJson(aztecReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-AZTEC:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      readinessGap: {
        observations: { current: 60, required: 432, remaining: 372, passed: false },
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-AZTEC", symbol: "AZTECUSDT" }],
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        aztecWatchPath,
        "--spot-perp-carry-live-readiness",
        aztecReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveStartupPlan: {
        researchFocusMarket: string | null;
        reviewCommand: string;
        manualValidationCommand?: string | null;
        pm2StartCommand?: string | null;
      };
      nextActionPlan: Array<{ track: string; verificationCommand?: string }>;
    };
    assert.equal(report.liveStartupPlan.researchFocusMarket, "KRW-AZTEC");
    assert.equal(
      report.liveStartupPlan.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-aztec-live-ready",
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--readiness-report var\/reports\/spot-perp-carry-aztec-live-readiness-latest\.json/,
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--live-goal-status var\/reports\/live-goal-status-20260513-current\.json/,
    );
    assert.equal(
      report.liveStartupPlan.pm2StartCommand,
      "npm run pm2:start:live-spot-perp-carry-aztec",
    );
    const watchAction = report.nextActionPlan.find(
      (action) => action.track === "spot_perp_carry_watchlist",
    );
    assert.equal(
      watchAction?.verificationCommand,
      "npm run dry-run:refresh-spot-perp-carry-aztec-live-readiness && npm run dry-run:gate-live-goal-ready",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status exposes the NIL gated live startup command when NIL is the carry focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-nil-startup-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const nilWatchPath = join(directory, "spot-perp-carry-nil-72h-latest.json");
    const nilReadinessPath = join(directory, "spot-perp-carry-nil-live-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(nilWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 360,
      summary: {
        count: 80,
        completedFundingCount: 3,
        positiveRate: 0.86,
        executionEligiblePositiveRate: 0.94,
        executionEligibleMedianNetCarryBps: 65.05,
        executionEligibleTotalEstimatedNetPnlKrw: 260_200,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-NIL",
          symbol: "NILUSDT",
          completedFundingCount: 3,
          executionEligibleMedianNetCarryBps: 65.05,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-NIL",
          symbol: "NILUSDT",
          netCarryBps: 65.05,
          estimatedNetPnlKrw: 3_252,
          depthCovered: true,
        },
      ],
    });
    writeJson(nilReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-NIL:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      readinessGap: {
        observations: { current: 80, required: 432, remaining: 352, passed: false },
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-NIL", symbol: "NILUSDT" }],
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        nilWatchPath,
        "--spot-perp-carry-live-readiness",
        nilReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveStartupPlan: {
        researchFocusMarket: string | null;
        reviewCommand: string;
        manualValidationCommand?: string | null;
        pm2StartCommand?: string | null;
      };
      nextActionPlan: Array<{ track: string; verificationCommand?: string }>;
    };
    assert.equal(report.liveStartupPlan.researchFocusMarket, "KRW-NIL");
    assert.equal(
      report.liveStartupPlan.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-nil-live-ready",
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--readiness-report var\/reports\/spot-perp-carry-nil-live-readiness-latest\.json/,
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--live-goal-status var\/reports\/live-goal-status-20260513-current\.json/,
    );
    assert.equal(report.liveStartupPlan.pm2StartCommand, "npm run pm2:start:live-spot-perp-carry-nil");
    const watchAction = report.nextActionPlan.find(
      (action) => action.track === "spot_perp_carry_watchlist",
    );
    assert.equal(
      watchAction?.verificationCommand,
      "npm run dry-run:refresh-spot-perp-carry-nil-live-readiness && npm run dry-run:gate-live-goal-ready",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status exposes the AKT gated live startup command when AKT is the carry focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-akt-startup-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const carryPath = join(directory, "spot-perp-carry.json");
    const aktWatchPath = join(directory, "spot-perp-carry-akt-72h-latest.json");
    const aktReadinessPath = join(directory, "spot-perp-carry-akt-live-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeSpotPerpCarryReport(carryPath);
    writeJson(aktWatchPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservations", "insufficientCompletedFundingEvents"],
      observationSpanMinutes: 360,
      summary: {
        count: 80,
        completedFundingCount: 3,
        positiveRate: 0.86,
        executionEligiblePositiveRate: 0.86,
        executionEligibleMedianNetCarryBps: 54.61,
        executionEligibleTotalEstimatedNetPnlKrw: 218_400,
        executionRejectedCount: 0,
        executionRejectedRate: 0,
        executionRejectionReasons: {
          unsupportedFundingDirection: 0,
          fundingNotCompleted: 0,
          depthInsufficient: 0,
          spotSpreadTooWide: 0,
          perpSpreadTooWide: 0,
          usdtKrwSpreadTooWide: 0,
          rawNetCarryOutsideSanityBand: 0,
        },
        rawPricingArtifactCount: 0,
        rawPricingArtifactEstimatedNetPnlKrw: 0,
      },
      perMarketSummary: [
        {
          market: "KRW-AKT",
          symbol: "AKTUSDT",
          completedFundingCount: 3,
          executionEligibleMedianNetCarryBps: 54.61,
          watchDecision: {
            status: "collect_more_evidence",
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
          },
        },
      ],
      topExecutableCarry: [
        {
          market: "KRW-AKT",
          symbol: "AKTUSDT",
          netCarryBps: 54.61,
          estimatedNetPnlKrw: 2_731,
          depthCovered: true,
        },
      ],
    });
    writeJson(aktReadinessPath, {
      generatedAt: new Date().toISOString(),
      status: "blocked",
      liveReady: false,
      reasons: ["market:KRW-AKT:notMetricCandidate"],
      checks: {
        perMarketMetricCandidates: false,
      },
      readinessGap: {
        observations: { current: 80, required: 432, remaining: 352, passed: false },
      },
      evidence: {
        perMarketSummary: [{ market: "KRW-AKT", symbol: "AKTUSDT" }],
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--spot-perp-carry-report",
        carryPath,
        "--spot-perp-carry-watch-report",
        aktWatchPath,
        "--spot-perp-carry-live-readiness",
        aktReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      liveStartupPlan: {
        researchFocusMarket: string | null;
        reviewCommand: string;
        manualValidationCommand?: string | null;
        pm2StartCommand?: string | null;
      };
      nextActionPlan: Array<{ track: string; verificationCommand?: string }>;
    };
    assert.equal(report.liveStartupPlan.researchFocusMarket, "KRW-AKT");
    assert.equal(
      report.liveStartupPlan.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-akt-live-ready",
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--readiness-report var\/reports\/spot-perp-carry-akt-live-readiness-latest\.json/,
    );
    assert.match(
      report.liveStartupPlan.manualValidationCommand ?? "",
      /--live-goal-status var\/reports\/live-goal-status-20260513-current\.json/,
    );
    assert.equal(report.liveStartupPlan.pm2StartCommand, "npm run pm2:start:live-spot-perp-carry-akt");
    const watchAction = report.nextActionPlan.find(
      (action) => action.track === "spot_perp_carry_watchlist",
    );
    assert.equal(
      watchAction?.verificationCommand,
      "npm run dry-run:refresh-spot-perp-carry-akt-live-readiness && npm run dry-run:gate-live-goal-ready",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status can select a fresh live-ready replacement readiness report", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-replacement-ready-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementReadinessPath = join(directory, "replacement-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(replacementReadinessPath, { liveReady: true });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        replacementReadinessPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      liveReady: boolean;
      selectedCandidate: { type: string };
      checklist: Record<string, boolean>;
      replacementResearch: {
        liveCandidate: { candidate: { market: string }; liveReady: boolean };
        readinessReports: Array<{ candidate: { market: string }; liveReady: boolean }>;
      };
    };
    assert.equal(report.status, "live_ready");
    assert.equal(report.liveReady, true);
    assert.equal(report.selectedCandidate.type, "replacement_time_series");
    assert.ok(Object.values(report.checklist).every(Boolean));
    assert.equal(report.replacementResearch.liveCandidate.candidate.market, "KRW-H");
    assert.equal(report.replacementResearch.liveCandidate.liveReady, true);
    assert.equal(report.replacementResearch.readinessReports[0]?.candidate.market, "KRW-H");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status does not let replacement research block a fully realized min75 live candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-replacement-research-blocked-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementReadinessPath = join(directory, "replacement-readiness.json");
    const replacementLivePathPath = join(directory, "replacement-live-path.json");
    writeMin75Readiness(min75Path, {
      classification: "live_candidate",
      liveReady: true,
    });
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(replacementReadinessPath, { liveReady: false });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        replacementReadinessPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      liveReady: boolean;
      selectedCandidate: { type: string };
      blockers: string[];
      replacementResearch: {
        liveCandidate: null;
        readinessReports: Array<{ liveReady: boolean }>;
      };
    };
    assert.equal(report.status, "live_ready");
    assert.equal(report.liveReady, true);
    assert.equal(report.selectedCandidate.type, "btc_240m_momentum_min75");
    assert.deepEqual(report.blockers, []);
    assert.equal(report.replacementResearch.liveCandidate, null);
    assert.equal(report.replacementResearch.readinessReports[0]?.liveReady, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status surfaces a positive min75 open paper mark before blocked replacement research", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-min75-paper-positive-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementReadinessPath = join(directory, "replacement-readiness.json");
    writeMin75Readiness(min75Path, {
      openPnlKrw: 2087.169665,
      openReturnPct: 0.417247,
    });
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(replacementReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-H",
      strategyReturnPct: 3.4865489999999997,
      testMedianPnlKrw: 6250,
      testTotalPnlKrw: 491_948.522131,
      walkForwardMinFoldPnlKrw: 8113.658939,
      liveReasons: ["signalActive", "riskPass"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        replacementReadinessPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      status: string;
      liveReady: boolean;
      selectedCandidate: { type: string; rationale: string };
      recommendedAction: string;
      blockers: string[];
      profitabilitySnapshot: {
        leadingPaperMark: {
          estimatedExitNetPnlKrw: number;
          estimatedExitReturnPct: number;
          usableForLivePromotion: boolean;
        };
      };
      replacementResearch: {
        researchFocus: { candidate: { market: string } };
      };
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.liveReady, false);
    assert.equal(report.selectedCandidate.type, "btc_240m_momentum_min75_paper_candidate");
    assert.match(report.selectedCandidate.rationale, /realized positive reduce-only exit/);
    assert.match(report.recommendedAction, /BTC min75 reduce-only paper exit/);
    assert.ok(report.blockers.includes("min75LiveReady"));
    assert.equal(report.profitabilitySnapshot.leadingPaperMark.estimatedExitNetPnlKrw, 2087.169665);
    assert.equal(report.profitabilitySnapshot.leadingPaperMark.estimatedExitReturnPct, 0.417247);
    assert.equal(report.profitabilitySnapshot.leadingPaperMark.usableForLivePromotion, false);
    assert.equal(report.replacementResearch.researchFocus.candidate.market, "KRW-H");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status does not prefer a positive min75 open mark when fee stress fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-min75-stress-fails-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementReadinessPath = join(directory, "replacement-readiness.json");
    const replacementLivePathPath = join(directory, "replacement-live-path.json");
    const replacementManagedReturnPath = join(directory, "replacement-managed-return.json");
    writeMin75Readiness(min75Path, {
      openPnlKrw: 2456.734166,
      openReturnPct: 0.491127,
      stressExcessReturnVsBuyHoldPct: -8.29479,
      liveChecks: { stressBeatsBtcBuyAndHold: false },
    });
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(replacementReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-PIEVERSE",
      strategyReturnPct: 2.258377,
      testMedianPnlKrw: 5747.656982,
      testTotalPnlKrw: 98_293.17,
      walkForwardMinFoldPnlKrw: 46_971.68758,
      liveReasons: ["signalActive", "paperSignalAccepted", "positiveRealizedPaperExitPnl"],
    });
    writeJson(replacementLivePathPath, {
      generatedAt: new Date().toISOString(),
      market: "KRW-PIEVERSE",
      strategyId: "pieverse_60m_reversal_lb168_candidate_v1",
      liveProcessName: "live-pieverse-60m-reversal-lb168-manager",
      refreshCommandName: "dry-run:refresh-pieverse-60m-reversal-lb168-readiness",
      gateCommandName: "dry-run:gate-pieverse-60m-reversal-lb168-live-ready",
      checks: {
        replacementReadinessCommandAvailable: true,
        liveRuntimeAllowsRequestedMarket: false,
        livePm2TargetAvailable: false,
      },
      ready: false,
      reasons: ["liveRuntimeAllowsRequestedMarket", "livePm2TargetAvailable"],
      interpretation: "Replacement live execution path is not ready.",
    });
    writeJson(replacementManagedReturnPath, {
      source: {
        reportsRoot: "/tmp/paper-sessions-pieverse-60m-reversal-lb168-managed",
        cyclesPath: "/tmp/cycles.ndjson",
      },
      sessionCount: 1,
      tradedSessionCount: 0,
      allSessions: {
        avgReturnPct: 0,
        totalPnlKrw: 0,
        openPositionSessions: 0,
      },
      tradedSessionsOnly: {
        totalPnlKrw: 0,
        avgReturnPct: null,
        closedTradeCount: 0,
      },
      closedTradesOnly: {
        sessionCount: 0,
        totalPnlKrw: 0,
        closedTradeCount: 0,
      },
      cycleSummary: {
        evidenceAvailable: true,
        completed: 1,
        failed: 0,
        completionRate: 1,
      },
      strategyAssessment: {
        classification: "discard_candidate",
        rationale: "no closed trades",
      },
      latestSession: {
        generatedAt: new Date().toISOString(),
        sessionId: "paper-pieverse-1",
        returnPct: 0,
        realizedPnlKrw: 0,
        markedPnlKrw: 0,
        openPositionCount: 0,
        reconciliationOk: true,
      },
      quality: {
        rejectedDecisionSessions: 1,
        signalRejectedDecisionSessions: 1,
        signalRejectedDecisionCount: 2,
        signalRejectedReasonCounts: {
          spread_guard_triggered: 1,
          liquidity_guard_triggered: 1,
        },
      },
      lossCauseExperiments: {
        entryExecutionGuardRejections: {
          experimentType: "signal_execution_guard_denominator",
          signalSessionCount: 1,
          signalDecisionCount: 2,
          signalRejectedSessionCount: 1,
          signalRejectedDecisionCount: 2,
          signalRejectedSessionRate: 1,
          signalRejectedDecisionRate: 1,
          reasonCounts: {
            spread_guard_triggered: 1,
            liquidity_guard_triggered: 1,
          },
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        replacementReadinessPath,
        "--replacement-live-path-readiness",
        replacementLivePathPath,
        "--replacement-managed-return-summary",
        replacementManagedReturnPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      selectedCandidate: { type: string };
      recommendedAction: string;
      strategyDecision: {
        leadingResearch: {
          action: string;
          evidenceType: string;
          liveExecutionPath: {
            ready: boolean;
            reasons: string[];
            liveProcessName: string;
          };
          managedPaperReturn: {
            sessionCount: number;
            tradedSessionCount: number;
            totalPnlKrw: number;
            classification: string;
            quality: {
              signalRejectedDecisionSessions: number;
              signalRejectedDecisionCount: number;
              signalRejectedReasonCounts: Record<string, number>;
            };
            executionGuardRejections: {
              signalRejectedSessionRate: number;
              signalRejectedDecisionRate: number;
              reasonCounts: Record<string, number>;
            };
          };
        };
        closestPaperPath: {
          action: string;
          estimatedOpenPnlKrw: number;
          stressBeatsBtcBuyAndHold: boolean;
          stressExcessReturnVsBuyHoldPct: number;
        };
      };
      blockers: string[];
      replacementResearch: {
        livePathReports: Array<{
          market: string;
          ready: boolean;
          reasons: string[];
        }>;
        managedReturnReports: Array<{
          sessionCount: number;
          totalPnlKrw: number;
          quality: {
            signalRejectedDecisionSessions: number;
            signalRejectedDecisionCount: number;
          };
          executionGuardRejections: {
            signalRejectedDecisionCount: number;
            reasonCounts: Record<string, number>;
          };
        }>;
      };
      nextActionPlan: Array<{
        priority: number;
        track: string;
        action: string;
        verificationCommand: string;
        currentEvidence: {
          evidenceType?: string;
          liveReady?: boolean;
          replacementScansHaveNoPromotionCandidates?: boolean;
          demotedReplacementMarket?: string | null;
          demotedReplacementReason?: string | null;
          stressBeatsBtcBuyAndHold?: boolean;
          stressExcessReturnVsBuyHoldPct?: number;
          managedPaperQuality?: {
            signalRejectedDecisionSessions: number;
          };
          managedPaperExecutionGuardRejections?: {
            signalRejectedDecisionRate: number;
          };
        };
      }>;
      profitabilitySnapshot: {
        replacementManagedPaper: {
          quality: {
            signalRejectedDecisionCount: number;
            signalRejectedReasonCounts: Record<string, number>;
          };
          executionGuardRejections: {
            signalRejectedSessionRate: number;
            reasonCounts: Record<string, number>;
          };
        };
      };
    };
    assert.equal(report.selectedCandidate.type, "replacement_time_series_managed_inactive");
    assert.match(report.recommendedAction, /managed-paper evidence with no accepted trades/);
    assert.equal(report.strategyDecision.leadingResearch.action, "demote_from_live_focus");
    assert.equal(report.strategyDecision.leadingResearch.evidenceType, "managed_paper_no_trade");
    assert.equal(report.strategyDecision.leadingResearch.liveExecutionPath.ready, false);
    assert.deepEqual(report.strategyDecision.leadingResearch.liveExecutionPath.reasons, [
      "liveRuntimeAllowsRequestedMarket",
      "livePm2TargetAvailable",
    ]);
    assert.equal(
      report.strategyDecision.leadingResearch.liveExecutionPath.liveProcessName,
      "live-pieverse-60m-reversal-lb168-manager",
    );
    assert.equal(report.strategyDecision.leadingResearch.managedPaperReturn.sessionCount, 1);
    assert.equal(report.strategyDecision.leadingResearch.managedPaperReturn.tradedSessionCount, 0);
    assert.equal(report.strategyDecision.leadingResearch.managedPaperReturn.totalPnlKrw, 0);
    assert.equal(report.strategyDecision.leadingResearch.managedPaperReturn.classification, "discard_candidate");
    assert.equal(
      report.strategyDecision.leadingResearch.managedPaperReturn.quality.signalRejectedDecisionSessions,
      1,
    );
    assert.equal(
      report.strategyDecision.leadingResearch.managedPaperReturn.executionGuardRejections
        .signalRejectedDecisionRate,
      1,
    );
    assert.equal(
      report.strategyDecision.leadingResearch.managedPaperReturn.quality
        .signalRejectedReasonCounts.spread_guard_triggered,
      1,
    );
    assert.ok(report.blockers.includes("replacementLivePath:liveRuntimeAllowsRequestedMarket"));
    assert.ok(report.blockers.includes("replacementLivePath:livePm2TargetAvailable"));
    assert.equal(report.replacementResearch.livePathReports[0]?.market, "KRW-PIEVERSE");
    assert.equal(report.replacementResearch.livePathReports[0]?.ready, false);
    assert.equal(report.replacementResearch.managedReturnReports[0]?.sessionCount, 1);
    assert.equal(report.replacementResearch.managedReturnReports[0]?.totalPnlKrw, 0);
    assert.equal(
      report.replacementResearch.managedReturnReports[0]?.executionGuardRejections
        .signalRejectedDecisionCount,
      2,
    );
    assert.equal(
      report.profitabilitySnapshot.replacementManagedPaper.executionGuardRejections
        .signalRejectedSessionRate,
      1,
    );
    assert.equal(
      report.strategyDecision.closestPaperPath.action,
      "paper_only_do_not_promote_until_stress_edge_improves",
    );
    assert.equal(report.strategyDecision.closestPaperPath.estimatedOpenPnlKrw, 2456.734166);
    assert.equal(report.strategyDecision.closestPaperPath.stressBeatsBtcBuyAndHold, false);
    assert.equal(report.strategyDecision.closestPaperPath.stressExcessReturnVsBuyHoldPct, -8.29479);
    assert.equal(report.nextActionPlan[0]?.track, "executable_candidate_search");
    assert.equal(
      report.nextActionPlan[0]?.action,
      "search_new_executable_edge_do_not_defend_failed_paths",
    );
    assert.equal(report.nextActionPlan[0]?.currentEvidence.liveReady, false);
    assert.equal(
      report.nextActionPlan[0]?.currentEvidence.demotedReplacementMarket,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.nextActionPlan[0]?.currentEvidence.demotedReplacementReason,
      "managed_paper_execution_guard_or_no_trade",
    );
    const replacementPlan = report.nextActionPlan.find(
      (item) => item.track === "replacement_time_series",
    );
    assert.equal(replacementPlan?.priority, 5);
    assert.equal(
      replacementPlan?.action,
      "demote_from_live_focus_search_for_better_executable_candidate",
    );
    assert.equal(replacementPlan?.currentEvidence.evidenceType, "managed_paper_no_trade");
    assert.equal(
      replacementPlan?.currentEvidence.managedPaperQuality
        ?.signalRejectedDecisionSessions,
      1,
    );
    assert.equal(
      replacementPlan?.currentEvidence.managedPaperExecutionGuardRejections
        ?.signalRejectedDecisionRate,
      1,
    );
    assert.equal(
      replacementPlan?.verificationCommand,
      "npm run dry-run:gate-live-goal-ready",
    );
    assert.equal(report.nextActionPlan[1]?.track, "btc_240m_momentum_min75");
    assert.equal(
      report.nextActionPlan[1]?.action,
      "paper_only_do_not_promote_until_stress_edge_improves",
    );
    assert.equal(report.nextActionPlan[1]?.currentEvidence.stressBeatsBtcBuyAndHold, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status surfaces an active managed-paper candidate before inactive replacement research", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-active-managed-paper-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementReadinessPath = join(directory, "replacement-readiness.json");
    const replacementManagedReturnPath = join(directory, "replacement-managed-return.json");
    const btcManagedReturnPath = join(
      directory,
      "btc-240m-momentum-lb168-hold72-range-p70-managed-return.json",
    );
    writeMin75Readiness(min75Path, {
      openPnlKrw: -4548.294715,
      openReturnPct: -0.909251,
      stressExcessReturnVsBuyHoldPct: -8.29479,
      liveChecks: { stressBeatsBtcBuyAndHold: false },
    });
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(replacementReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-H",
      strategyReturnPct: 3.486549,
      testMedianPnlKrw: 6250,
      testTotalPnlKrw: 491_948.522131,
      walkForwardMinFoldPnlKrw: 8113.658939,
      liveReasons: ["paperSignalAccepted", "positiveRealizedPaperExitPnl"],
    });
    writeJson(replacementManagedReturnPath, {
      source: {
        reportsRoot: "/tmp/paper-sessions-krw-h-60m-momentum-managed",
        cyclesPath: "/tmp/krw-h-cycles.ndjson",
      },
      sessionCount: 38,
      tradedSessionCount: 0,
      allSessions: { totalPnlKrw: 0, avgReturnPct: 0, openPositionSessions: 0 },
      tradedSessionsOnly: { totalPnlKrw: 0, avgReturnPct: null, closedTradeCount: 0 },
      closedTradesOnly: { sessionCount: 0, totalPnlKrw: 0, closedTradeCount: 0 },
      cycleSummary: { evidenceAvailable: true, completed: 38, failed: 2, completionRate: 0.95 },
      strategyAssessment: {
        classification: "discard_candidate",
        rationale: "managed paper did not trade",
      },
      liveReadiness: {
        checks: { minimumClosedTrades: false },
        reasons: ["closed trade count 0 is below 30"],
      },
      latestSession: {
        generatedAt: new Date().toISOString(),
        sessionId: "paper-h-38",
        returnPct: 0,
        realizedPnlKrw: 0,
        markedPnlKrw: 0,
        openPositionCount: 0,
        reconciliationOk: true,
      },
    });
    writeJson(btcManagedReturnPath, {
      source: {
        reportsRoot:
          "/tmp/paper-sessions-btc-240m-momentum-lb168-hold72-range-p70-managed",
        cyclesPath: "/tmp/btc-cycles.ndjson",
      },
      sessionCount: 2,
      exposureSessionCount: 2,
      tradedSessionCount: 2,
      filledSessionCount: 1,
      orderedSessionCount: 1,
      openMarkSessionCount: 1,
      openPositionSessionCount: 2,
      allSessions: {
        totalPnlKrw: 678.5006203299854,
        avgReturnPct: 0.033939064935670074,
        openPositionSessions: 2,
      },
      tradedSessionsOnly: {
        totalPnlKrw: 678.5006203299854,
        avgReturnPct: 0.033939064935670074,
        closedTradeCount: 0,
      },
      closedTradesOnly: {
        sessionCount: 0,
        totalPnlKrw: 0,
        closedTradeCount: 0,
      },
      cycleSummary: {
        evidenceAvailable: true,
        completed: 2,
        failed: 1,
        completionRate: 0.6666666666666666,
        consecutiveCompletedSinceLatestFailure: 1,
      },
      strategyAssessment: {
        classification: "paper_candidate",
        rationale: "paper only until closed trades beat BTC buy-and-hold",
      },
      liveReadiness: {
        checks: {
          minimumClosedTrades: false,
          positiveClosedTradePnl: false,
          noOpenMarkProfitDependency: false,
          positiveMedianExcessReturn: false,
          noOpenPosition: false,
          cycleCompletionRateOk: false,
          cycleRecoverySinceLatestFailureOk: false,
        },
        reasons: [
          "closed trade count 0 is below 30",
          "positive traded PnL depends on carry-open marked PnL 968.287526 KRW",
          "latest session has 1 open positions",
        ],
      },
      latestSession: {
        generatedAt: new Date().toISOString(),
        sessionId: "paper-btc-2",
        returnPct: 0.09685682048104857,
        realizedPnlKrw: 0,
        markedPnlKrw: 968.2875264270697,
        openPositionCount: 1,
        reconciliationOk: true,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        replacementReadinessPath,
        "--replacement-managed-return-summary",
        replacementManagedReturnPath,
        "--replacement-managed-return-summary",
        btcManagedReturnPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      selectedCandidate: { type: string; rationale: string };
      recommendedAction: string;
      blockers: string[];
      strategyDecision: {
        leadingManagedPaperPath: {
          market: string;
          classification: string;
          tradedPnlKrw: number;
          filledSessionCount: number;
          openMarkSessionCount: number;
          closedTradeCount: number;
          latestMarkedPnlKrw: number;
          openPositionCount: number;
        };
        leadingResearch: {
          market: string;
          action: string;
        };
      };
      nextActionPlan: Array<{
        priority: number;
        track: string;
        market?: string;
        verificationCommand: string;
      }>;
      profitabilitySnapshot: {
        leadingManagedPaper: {
          market: string;
          classification: string;
          tradedPnlKrw: number;
          filledSessionCount: number;
          openMarkSessionCount: number;
          closedTradeCount: number;
          latestMarkedPnlKrw: number;
          openPositionCount: number;
          usableForLivePromotion: boolean;
        };
      };
      replacementResearch: {
        leadingActiveManagedPaperReturn: { market: string; classification: string };
      };
    };
    assert.equal(report.selectedCandidate.type, "managed_paper_candidate");
    assert.match(report.selectedCandidate.rationale, /closed trades/);
    assert.match(report.recommendedAction, /continue managed-paper measurement for KRW-BTC/);
    assert.ok(report.blockers.includes("managedPaperMinimumClosedTrades"));
    assert.ok(report.blockers.includes("managedPaperPositiveClosedTradePnl"));
    assert.ok(report.blockers.includes("managedPaperNoOpenMarkProfitDependency"));
    assert.ok(report.blockers.includes("managedPaperPositiveMedianExcessReturn"));
    assert.ok(report.blockers.includes("managedPaperNoOpenPosition"));
    assert.ok(report.blockers.includes("managedPaperCycleHealthy"));
    assert.ok(report.blockers.some((blocker) => blocker.startsWith("managedPaper:closed trade count 0")));
    assert.equal(report.strategyDecision.leadingManagedPaperPath.market, "KRW-BTC");
    assert.equal(report.strategyDecision.leadingManagedPaperPath.classification, "paper_candidate");
    assert.equal(report.strategyDecision.leadingManagedPaperPath.tradedPnlKrw, 678.5006203299854);
    assert.equal(report.strategyDecision.leadingManagedPaperPath.filledSessionCount, 1);
    assert.equal(report.strategyDecision.leadingManagedPaperPath.openMarkSessionCount, 1);
    assert.equal(report.strategyDecision.leadingManagedPaperPath.closedTradeCount, 0);
    assert.equal(report.strategyDecision.leadingManagedPaperPath.latestMarkedPnlKrw, 968.2875264270697);
    assert.equal(report.strategyDecision.leadingManagedPaperPath.openPositionCount, 1);
    assert.equal(report.strategyDecision.leadingResearch.market, "KRW-H");
    assert.equal(report.strategyDecision.leadingResearch.action, "demote_from_live_focus");
    assert.equal(report.nextActionPlan[0]?.track, "managed_paper");
    assert.equal(report.nextActionPlan[0]?.priority, 1);
    assert.equal(report.nextActionPlan[0]?.market, "KRW-BTC");
    assert.equal(
      report.nextActionPlan[0]?.verificationCommand,
      "npm run dry-run:returns:btc-240m-momentum-lb168-hold72-range-p70-managed-paper && npm run dry-run:gate-live-goal-ready",
    );
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.market, "KRW-BTC");
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.classification, "paper_candidate");
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.tradedPnlKrw, 678.5006203299854);
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.filledSessionCount, 1);
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.openMarkSessionCount, 1);
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.closedTradeCount, 0);
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.latestMarkedPnlKrw, 968.2875264270697);
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.openPositionCount, 1);
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.usableForLivePromotion, false);
    assert.equal(report.replacementResearch.leadingActiveManagedPaperReturn.market, "KRW-BTC");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status selects the strongest fresh replacement research evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-replacement-rank-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const stableReadinessPath = join(directory, "stable-readiness.json");
    const pieverseReadinessPath = join(directory, "pieverse-readiness.json");
    const pieverseObservationPath = join(directory, "pieverse-observation.json");
    const pieversePaperObservationPath = join(directory, "pieverse-paper-observation.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(stableReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-STABLE",
      strategyReturnPct: 2.194681,
      testMedianPnlKrw: 19.68508,
      testTotalPnlKrw: 2349.798696,
      walkForwardMinFoldPnlKrw: 18.727564,
      liveReasons: ["signalActive", "executableCostWithinExpectedEdge"],
    });
    writeReplacementReadiness(pieverseReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-PIEVERSE",
      strategyReturnPct: 2.558377,
      testMedianPnlKrw: 64.97657,
      testTotalPnlKrw: 1215.431718,
      walkForwardMinFoldPnlKrw: 612.216876,
      liveReasons: ["signalActive", "riskPass"],
      liveChecks: {
        signalActive: false,
        directionalSignalPass: true,
        riskPass: false,
        executionViabilityWatchCandidate: false,
        paperSignalAttempted: false,
        paperEntryCreatedOpenPosition: false,
        positiveRealizedPaperExitPnl: false,
      },
      inputs: {
        observationPath: pieverseObservationPath,
        paperObservationPath: pieversePaperObservationPath,
      },
    });
    writeJson(pieverseObservationPath, {
      generatedAt: new Date().toISOString(),
      signal: {
        active: false,
        latestCandleAt: "2026-05-13T04:00:00.000Z",
        lookbackReturnBps: 1912.751678,
        riskValue: 2543.352601,
        riskThreshold: 2071.713147,
        riskExcessBps: 471.639454,
        directionalSignalPass: true,
        riskPass: false,
      },
      orderbook: {
        executableCostVsExpectedEdgeBps: -110.561145,
        buyDepth: { coversRequestedNotional: true },
        sellDepth: { coversRequestedNotional: true },
      },
      decision: {
        executionViability: "blocked_by_signal_or_execution_cost",
        reasons: ["risk_filter_failed"],
      },
    });
    writeJson(pieversePaperObservationPath, {
      generatedAt: new Date().toISOString(),
      skippedReasons: ["risk_filter_failed", "observation_not_execution_viable"],
      paper: {
        attemptedSignal: false,
        acceptedSignals: 0,
        reconciliationOk: true,
        openPositionCount: 0,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        stableReadinessPath,
        "--replacement-readiness",
        pieverseReadinessPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      selectedCandidate: { type: string };
      recommendedAction: string;
      blockers: string[];
      strategyDecision: {
        leadingResearch: {
          liveGateChecks: {
            directionalSignalPass: boolean;
            riskPass: boolean;
            paperSignalAttempted: boolean;
          };
          latestForwardObservation: {
            riskExcessBps: number;
            reasons: string[];
          };
          latestPaperObservation: {
            skippedReasons: string[];
            openPositionCount: number;
          };
        };
      };
      nextActionPlan: Array<{
        track: string;
        market?: string;
        action: string;
        currentEvidence: {
          signalActive?: boolean;
          directionalSignalPass?: boolean;
          riskPass?: boolean;
          forwardReasons?: string[];
          paperSkippedReasons?: string[];
          openPositionCount?: number;
        };
      }>;
      replacementResearch: {
        researchFocus: { candidate: { market: string } };
        readinessReports: Array<{ candidate: { market: string }; liveReady: boolean }>;
      };
    };
    assert.equal(report.selectedCandidate.type, "replacement_time_series_research");
    assert.match(report.recommendedAction, /KRW-PIEVERSE/);
    assert.ok(report.blockers.includes("replacement:riskPass"));
    assert.equal(report.strategyDecision.leadingResearch.liveGateChecks.directionalSignalPass, true);
    assert.equal(report.strategyDecision.leadingResearch.liveGateChecks.riskPass, false);
    assert.equal(report.strategyDecision.leadingResearch.liveGateChecks.paperSignalAttempted, false);
    assert.equal(report.strategyDecision.leadingResearch.latestForwardObservation.riskExcessBps, 471.639454);
    assert.deepEqual(report.strategyDecision.leadingResearch.latestForwardObservation.reasons, [
      "risk_filter_failed",
    ]);
    assert.deepEqual(report.strategyDecision.leadingResearch.latestPaperObservation.skippedReasons, [
      "risk_filter_failed",
      "observation_not_execution_viable",
    ]);
    assert.equal(report.strategyDecision.leadingResearch.latestPaperObservation.openPositionCount, 0);
    const replacementAction = report.nextActionPlan.find(
      (action) => action.track === "replacement_time_series",
    );
    assert.equal(replacementAction?.market, "KRW-PIEVERSE");
    assert.equal(
      replacementAction?.action,
      "continue_observation_until_forward_paper_entry_and_realized_exit",
    );
    assert.equal(replacementAction?.currentEvidence.directionalSignalPass, true);
    assert.equal(replacementAction?.currentEvidence.riskPass, false);
    assert.deepEqual(replacementAction?.currentEvidence.forwardReasons, ["risk_filter_failed"]);
    assert.deepEqual(replacementAction?.currentEvidence.paperSkippedReasons, [
      "risk_filter_failed",
      "observation_not_execution_viable",
    ]);
    assert.equal(replacementAction?.currentEvidence.openPositionCount, 0);
    assert.equal(report.replacementResearch.researchFocus.candidate.market, "KRW-PIEVERSE");
    assert.equal(report.replacementResearch.readinessReports[0]?.candidate.market, "KRW-STABLE");
    assert.equal(report.replacementResearch.readinessReports[1]?.candidate.market, "KRW-PIEVERSE");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status labels a fresh discarded replacement readiness without calling it research focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-replacement-discarded-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementReadinessPath = join(directory, "replacement-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(replacementReadinessPath, {
      liveReady: false,
      classification: "discard_candidate",
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        replacementReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string; rationale: string };
      recommendedAction: string;
      blockers: string[];
      replacementResearch: {
        readinessReports: Array<{ classification: string; liveReady: boolean }>;
      };
    };
    assert.equal(report.selectedCandidate.type, "replacement_time_series_discarded");
    assert.match(report.selectedCandidate.rationale, /discards the observed replacement candidate/);
    assert.match(report.recommendedAction, /replacement research KRW-H is discarded/);
    assert.ok(report.blockers.includes("replacementIsNotDiscard"));
    assert.equal(report.replacementResearch.readinessReports[0]?.classification, "discard_candidate");
    assert.equal(report.replacementResearch.readinessReports[0]?.liveReady, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status reports the latest fresh discarded replacement readiness", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-latest-discarded-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementScanPath = join(directory, "replacement-scan.json");
    const stableReadinessPath = join(directory, "stable-readiness.json");
    const pieverseReadinessPath = join(directory, "pieverse-readiness.json");
    const stableGeneratedAt = new Date(Date.now() - 120_000).toISOString();
    const pieverseGeneratedAt = new Date(Date.now() - 60_000).toISOString();
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeReplacementScan(replacementScanPath, 1, new Date().toISOString());
    writeReplacementReadiness(stableReadinessPath, {
      liveReady: false,
      classification: "discard_candidate",
      market: "KRW-STABLE",
      generatedAt: stableGeneratedAt,
    });
    writeReplacementReadiness(pieverseReadinessPath, {
      liveReady: false,
      classification: "discard_candidate",
      market: "KRW-PIEVERSE",
      generatedAt: pieverseGeneratedAt,
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        replacementScanPath,
        "--replacement-readiness",
        stableReadinessPath,
        "--replacement-readiness",
        pieverseReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string };
      recommendedAction: string;
      replacementResearch: {
        researchFocus: { candidate: { market: string }; generatedAt: string };
      };
    };
    assert.equal(report.selectedCandidate.type, "replacement_time_series_discarded");
    assert.match(report.recommendedAction, /KRW-PIEVERSE is discarded/);
    assert.doesNotMatch(report.recommendedAction, /latest replacement scan has no promotion candidate/);
    assert.equal(report.replacementResearch.researchFocus.candidate.market, "KRW-PIEVERSE");
    assert.equal(report.replacementResearch.researchFocus.generatedAt, pieverseGeneratedAt);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status keeps the strongest live-compatible promotion market as research focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-strongest-live-compatible-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const liveCompatibleScanPath = join(directory, "live-compatible-pieverse-reversal-scan.json");
    const pieverseReadinessPath = join(directory, "pieverse-readiness.json");
    const stableReadinessPath = join(directory, "stable-readiness.json");
    const pieverseGeneratedAt = new Date(Date.now() - 120_000).toISOString();
    const stableGeneratedAt = new Date(Date.now() - 60_000).toISOString();
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(liveCompatibleScanPath, {
      generatedAt: new Date().toISOString(),
      assumptions: { feeRoundTripBps: 35 },
      candidateCount: 2,
      promotionCandidateCount: 1,
      promotionCandidates: [
        {
          market: "KRW-PIEVERSE",
          lookbackBars: 168,
          holdBars: 24,
          minReturnBps: 50,
          riskFilter: "rv24_below_median",
          train: { count: 42, totalPnlKrw: 341_087.966045, medianPnlKrw: 737.562189 },
          test: { count: 31, totalPnlKrw: 98_293.171823, medianPnlKrw: 5_747.656982 },
          walkForward: {
            positiveTotalFoldCount: 5,
            positiveMedianFoldCount: 4,
            minFoldPnlKrw: 46_971.68758,
          },
        },
      ],
      topByTest: [],
    });
    writeReplacementReadiness(pieverseReadinessPath, {
      liveReady: false,
      classification: "discard_candidate",
      market: "KRW-PIEVERSE",
      generatedAt: pieverseGeneratedAt,
    });
    writeReplacementReadiness(stableReadinessPath, {
      liveReady: false,
      classification: "discard_candidate",
      market: "KRW-STABLE",
      generatedAt: stableGeneratedAt,
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        liveCompatibleScanPath,
        "--replacement-readiness",
        pieverseReadinessPath,
        "--replacement-readiness",
        stableReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      recommendedAction: string;
      replacementResearch: {
        researchFocus: { candidate: { market: string } };
        strongestLiveCompatiblePromotionCandidate: {
          candidate: { market: string; walkForward: { minFoldPnlKrw: number } };
        };
      };
    };
    assert.match(report.recommendedAction, /KRW-PIEVERSE is discarded/);
    assert.equal(report.replacementResearch.researchFocus.candidate.market, "KRW-PIEVERSE");
    assert.equal(
      report.replacementResearch.strongestLiveCompatiblePromotionCandidate.candidate.market,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.replacementResearch.strongestLiveCompatiblePromotionCandidate.candidate.walkForward.minFoldPnlKrw,
      46_971.68758,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status prefers fresh non-discard replacement research over discarded live-compatible evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-active-research-over-discard-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const liveCompatibleScanPath = join(directory, "live-compatible-pieverse-reversal-scan.json");
    const pieverseReadinessPath = join(directory, "pieverse-readiness.json");
    const hReadinessPath = join(directory, "h-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(liveCompatibleScanPath, {
      generatedAt: new Date().toISOString(),
      assumptions: { feeRoundTripBps: 35 },
      candidateCount: 2,
      promotionCandidateCount: 1,
      promotionCandidates: [
        {
          market: "KRW-PIEVERSE",
          lookbackBars: 168,
          holdBars: 24,
          minReturnBps: 50,
          riskFilter: "rv24_below_median",
          train: { count: 42, totalPnlKrw: 341_087.966045, medianPnlKrw: 737.562189 },
          test: { count: 31, totalPnlKrw: 98_293.171823, medianPnlKrw: 5_747.656982 },
          walkForward: {
            positiveTotalFoldCount: 5,
            positiveMedianFoldCount: 4,
            minFoldPnlKrw: 46_971.68758,
          },
        },
      ],
      topByTest: [],
    });
    writeReplacementReadiness(pieverseReadinessPath, {
      liveReady: false,
      classification: "discard_candidate",
      market: "KRW-PIEVERSE",
      liveReasons: ["signalActive"],
    });
    writeReplacementReadiness(hReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-H",
      strategyReturnPct: 3.486549,
      testMedianPnlKrw: 6250,
      testTotalPnlKrw: 491_948.522131,
      walkForwardMinFoldPnlKrw: 8113.658939,
      liveReasons: ["signalActive", "riskPass"],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        liveCompatibleScanPath,
        "--replacement-readiness",
        pieverseReadinessPath,
        "--replacement-readiness",
        hReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      selectedCandidate: { type: string };
      recommendedAction: string;
      blockers: string[];
      strategyDecision: {
        leadingResearch: {
          market: string;
          action: string;
          historicalReturnPct: number;
          testMedianPnlKrw: number;
          missingBeforeLive: string[];
        };
      };
      replacementResearch: {
        researchFocus: { candidate: { market: string }; classification: string };
      };
      nextActionPlan: Array<{
        track: string;
        market?: string;
        verificationCommand: string;
      }>;
    };
    assert.equal(report.selectedCandidate.type, "replacement_time_series_research");
    assert.match(report.recommendedAction, /KRW-H/);
    assert.ok(report.blockers.includes("replacement:riskPass"));
    assert.equal(report.strategyDecision.leadingResearch.market, "KRW-H");
    assert.equal(report.strategyDecision.leadingResearch.action, "continue_paper_only_observation");
    assert.equal(report.strategyDecision.leadingResearch.historicalReturnPct, 3.486549);
    assert.equal(report.strategyDecision.leadingResearch.testMedianPnlKrw, 6250);
    assert.deepEqual(report.strategyDecision.leadingResearch.missingBeforeLive, [
      "signalActive",
      "riskPass",
    ]);
    assert.equal(
      report.nextActionPlan.find((action) => action.track === "replacement_time_series" && action.market === "KRW-H")
        ?.verificationCommand,
      "npm run dry-run:refresh-h-60m-momentum-readiness && npm run dry-run:gate-h-60m-momentum-live-path-ready && npm run dry-run:gate-h-60m-momentum-live-ready && npm run dry-run:gate-live-goal-ready",
    );
    assert.equal(report.replacementResearch.researchFocus.candidate.market, "KRW-H");
    assert.equal(report.replacementResearch.researchFocus.classification, "research_candidate");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status prefers active live-compatible promotion research over higher raw research PnL", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-live-compatible-over-raw-pnl-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const liveCompatibleScanPath = join(directory, "live-compatible-pieverse-reversal-scan.json");
    const pieverseReadinessPath = join(directory, "pieverse-readiness.json");
    const hReadinessPath = join(directory, "h-readiness.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(liveCompatibleScanPath, {
      generatedAt: new Date().toISOString(),
      assumptions: { feeRoundTripBps: 35 },
      candidateCount: 2,
      promotionCandidateCount: 1,
      promotionCandidates: [
        {
          market: "KRW-PIEVERSE",
          lookbackBars: 168,
          holdBars: 24,
          minReturnBps: 50,
          riskFilter: "rv24_below_median",
          train: { count: 42, totalPnlKrw: 341_087.966045, medianPnlKrw: 737.562189 },
          test: { count: 31, totalPnlKrw: 98_293.171823, medianPnlKrw: 5_747.656982 },
          walkForward: {
            positiveTotalFoldCount: 5,
            positiveMedianFoldCount: 4,
            minFoldPnlKrw: 46_971.68758,
          },
        },
      ],
      topByTest: [],
    });
    writeReplacementReadiness(pieverseReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-PIEVERSE",
      strategyReturnPct: 2.258377,
      testMedianPnlKrw: 5_747.656982,
      testTotalPnlKrw: 98_293.171823,
      walkForwardMinFoldPnlKrw: 46_971.68758,
      liveReasons: ["signalActive", "directionalSignalPass", "riskPass"],
    });
    writeReplacementReadiness(hReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-H",
      strategyReturnPct: 3.486549,
      testMedianPnlKrw: 6250,
      testTotalPnlKrw: 491_948.522131,
      walkForwardMinFoldPnlKrw: 8113.658939,
      liveReasons: ["signalActive", "riskPass"],
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        liveCompatibleScanPath,
        "--replacement-readiness",
        pieverseReadinessPath,
        "--replacement-readiness",
        hReadinessPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      recommendedAction: string;
      strategyDecision: {
        leadingResearch: {
          market: string;
          testMedianPnlKrw: number;
          walkForwardMinFoldPnlKrw: number;
        };
      };
      replacementResearch: {
        researchFocus: { candidate: { market: string } };
        strongestLiveCompatiblePromotionCandidate: {
          candidate: { market: string };
        };
      };
      nextActionPlan: Array<{
        track: string;
        market?: string;
        verificationCommand: string;
      }>;
    };
    assert.match(report.recommendedAction, /KRW-PIEVERSE/);
    assert.equal(report.strategyDecision.leadingResearch.market, "KRW-PIEVERSE");
    assert.equal(report.strategyDecision.leadingResearch.testMedianPnlKrw, 5_747.656982);
    assert.equal(report.strategyDecision.leadingResearch.walkForwardMinFoldPnlKrw, 46_971.68758);
    assert.equal(report.replacementResearch.researchFocus.candidate.market, "KRW-PIEVERSE");
    assert.equal(
      report.replacementResearch.strongestLiveCompatiblePromotionCandidate.candidate.market,
      "KRW-PIEVERSE",
    );
    const replacementAction = report.nextActionPlan.find(
      (action) => action.track === "replacement_time_series",
    );
    assert.equal(replacementAction?.market, "KRW-PIEVERSE");
    assert.equal(
      replacementAction?.verificationCommand,
      "npm run dry-run:review-pieverse-60m-reversal-lb168-live-ready",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status falls back from live-compatible research when managed paper is discarded", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-managed-discard-fallback-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const liveCompatibleScanPath = join(directory, "live-compatible-pieverse-reversal-scan.json");
    const pieverseReadinessPath = join(directory, "pieverse-readiness.json");
    const hReadinessPath = join(directory, "h-readiness.json");
    const pieverseManagedPath = join(directory, "pieverse-managed-return.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(liveCompatibleScanPath, {
      generatedAt: new Date().toISOString(),
      assumptions: { feeRoundTripBps: 35 },
      candidateCount: 2,
      promotionCandidateCount: 1,
      promotionCandidates: [
        {
          market: "KRW-PIEVERSE",
          lookbackBars: 168,
          holdBars: 24,
          minReturnBps: 50,
          riskFilter: "rv24_below_median",
          train: { count: 42, totalPnlKrw: 341_087.966045, medianPnlKrw: 737.562189 },
          test: { count: 31, totalPnlKrw: 98_293.171823, medianPnlKrw: 5_747.656982 },
          walkForward: {
            positiveTotalFoldCount: 5,
            positiveMedianFoldCount: 4,
            minFoldPnlKrw: 46_971.68758,
          },
        },
      ],
      topByTest: [],
    });
    writeReplacementReadiness(pieverseReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-PIEVERSE",
      strategyReturnPct: 2.258377,
      testMedianPnlKrw: 5_747.656982,
      testTotalPnlKrw: 98_293.171823,
      walkForwardMinFoldPnlKrw: 46_971.68758,
      liveReasons: ["signalActive", "directionalSignalPass", "riskPass"],
    });
    writeReplacementReadiness(hReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-H",
      strategyReturnPct: 3.486549,
      testMedianPnlKrw: 6250,
      testTotalPnlKrw: 491_948.522131,
      walkForwardMinFoldPnlKrw: 8113.658939,
      liveReasons: ["signalActive", "riskPass"],
    });
    writeJson(pieverseManagedPath, {
      source: {
        reportsRoot: "/tmp/paper-sessions-pieverse-60m-reversal-lb168-managed",
        cyclesPath: "/tmp/pieverse-cycles.ndjson",
      },
      sessionCount: 8,
      tradedSessionCount: 0,
      allSessions: { totalPnlKrw: 0, avgReturnPct: 0, openPositionSessions: 0 },
      tradedSessionsOnly: { totalPnlKrw: 0, avgReturnPct: null, closedTradeCount: 0 },
      closedTradesOnly: { sessionCount: 0, totalPnlKrw: 0, closedTradeCount: 0 },
      cycleSummary: { evidenceAvailable: true, completed: 8, failed: 0, completionRate: 1 },
      strategyAssessment: {
        classification: "discard_candidate",
        rationale: "no managed paper trades",
      },
      latestSession: {
        generatedAt: new Date().toISOString(),
        sessionId: "paper-pieverse-8",
        returnPct: 0,
        realizedPnlKrw: 0,
        markedPnlKrw: 0,
        openPositionCount: 0,
        reconciliationOk: true,
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-scan",
        liveCompatibleScanPath,
        "--replacement-readiness",
        pieverseReadinessPath,
        "--replacement-readiness",
        hReadinessPath,
        "--replacement-managed-return-summary",
        pieverseManagedPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      recommendedAction: string;
      strategyDecision: {
        leadingResearch: {
          market: string;
          managedPaperReturn: null | { market: string };
        };
      };
      replacementResearch: {
        researchFocus: { candidate: { market: string } };
      };
    };
    assert.match(report.recommendedAction, /KRW-H/);
    assert.equal(report.strategyDecision.leadingResearch.market, "KRW-H");
    assert.equal(report.strategyDecision.leadingResearch.managedPaperReturn, null);
    assert.equal(report.replacementResearch.researchFocus.candidate.market, "KRW-H");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status can block promotion on stale research data coverage", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-data-coverage-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const dataCoveragePath = join(directory, "data-coverage.json");
    writeMin75Readiness(min75Path, {
      classification: "live_candidate",
      liveReady: true,
    });
    writeLegacyAudit(legacyPath);
    writeDataCoverage(dataCoveragePath, false);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--data-coverage",
        dataCoveragePath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      status: string;
      liveReady: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
      dataCoverage: { fresh: boolean; blockers: string[] };
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.liveReady, false);
    assert.equal(report.checklist.researchDataFresh, false);
    assert.ok(report.blockers.includes("researchDataFresh"));
    assert.equal(report.dataCoverage.fresh, false);
    assert.deepEqual(report.dataCoverage.blockers, [
      "KRW-ETH:orderbook_snapshot:staleLatestTimestamp",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status surfaces derivatives regime diagnostics without promoting them", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-derivatives-regime-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const derivativesPath = join(directory, "derivatives-gated.json");
    writeMin75Readiness(min75Path);
    writeLegacyAudit(legacyPath);
    writeJson(derivativesPath, {
      generatedAt: new Date().toISOString(),
      assumptions: {
        unitMinutes: 240,
        limit: 500,
        notionalKrw: 500000,
        feeRoundTripBps: 50,
        minPromotionSpanDays: 90,
      },
      promotionCandidateCount: 0,
      diagnosticImprovementCount: 1,
      pairs: [
        {
          market: "KRW-BTC",
          symbol: "BTCUSDT",
          source: {
            candleCount: 500,
            candleFrom: "2026-02-19T07:00:00.000Z",
            candleTo: "2026-05-13T15:00:00.000Z",
            spanDays: 83.333333,
            fundingCount: 200,
            openInterestCount: 180,
            longShortCount: 180,
            takerLongShortCount: 180,
          },
          promotionCandidateCount: 0,
          diagnosticImprovementCount: 1,
          topDiagnosticCandidates: [
            {
              lookbackBars: 24,
              holdBars: 72,
              minReturnBps: 25,
              baselineTrain: {
                count: 5,
                totalPnlKrw: 46941.90322,
                medianPnlKrw: -532.9794,
                returnPct: 1.877676,
              },
              baselineTest: {
                count: 2,
                totalPnlKrw: 6994.590127,
                medianPnlKrw: 2784.538392,
                returnPct: 0.699459,
              },
              train: {
                count: 1,
                totalPnlKrw: 29116.445816,
                medianPnlKrw: 29116.445816,
                returnPct: 5.823289,
              },
              test: {
                count: 1,
                totalPnlKrw: 9323.986795,
                medianPnlKrw: 9323.986795,
                returnPct: 1.864797,
              },
              walkForward: {
                foldCount: 5,
                positiveTotalFoldCount: 2,
                positiveMedianFoldCount: 2,
                totalPnlKrw: 32450.99557,
                minFoldPnlKrw: 0,
              },
              gatedTradeCount: 2,
              baselineTradeCount: 7,
              promotionEligible: false,
              diagnosticImprovement: true,
              score: 95569.264618,
            },
          ],
        },
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--derivatives-gated-report",
        derivativesPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      strategyDecision: {
        derivativesRegimeResearch: {
          action: string;
          evidenceType: string;
          promotionCandidateCount: number;
          diagnosticImprovementCount: number;
          bestDiagnosticCandidate: {
            market: string;
            symbol: string;
            promotionEligible: boolean;
            diagnosticImprovement: boolean;
            test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
            baselineTest: { totalPnlKrw: number };
            walkForward: { positiveTotalFoldCount: number };
          };
          usableForLivePromotion: boolean;
        };
      };
      nextActionPlan: Array<{
        track: string;
        action: string;
        currentEvidence: {
          bestDiagnosticCandidate?: {
            promotionEligible: boolean;
            diagnosticImprovement: boolean;
          };
          usableForLivePromotion?: boolean;
        };
      }>;
      profitabilitySnapshot: {
        derivativesRegimeResearch: {
          promotionCandidateCount: number;
          diagnosticImprovementCount: number;
          usableForLivePromotion: boolean;
        };
      };
      derivativesRegimeResearch: {
        hasPromotionCandidate: boolean;
        reports: Array<{
          pairs: Array<{
            source: { spanDays: number };
            topDiagnosticCandidate: { gatedTradeCount: number };
          }>;
        }>;
      };
    };
    assert.equal(report.strategyDecision.derivativesRegimeResearch.action, "continue_data_collection_not_live");
    assert.equal(report.strategyDecision.derivativesRegimeResearch.evidenceType, "diagnostic_improvement_only");
    assert.equal(report.strategyDecision.derivativesRegimeResearch.promotionCandidateCount, 0);
    assert.equal(report.strategyDecision.derivativesRegimeResearch.diagnosticImprovementCount, 1);
    assert.equal(report.strategyDecision.derivativesRegimeResearch.usableForLivePromotion, false);
    assert.equal(report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.market, "KRW-BTC");
    assert.equal(report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.symbol, "BTCUSDT");
    assert.equal(report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.promotionEligible, false);
    assert.equal(report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.diagnosticImprovement, true);
    assert.equal(report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.test.count, 1);
    assert.equal(
      report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.test.totalPnlKrw,
      9323.986795,
    );
    assert.equal(
      report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.baselineTest.totalPnlKrw,
      6994.590127,
    );
    assert.equal(
      report.strategyDecision.derivativesRegimeResearch.bestDiagnosticCandidate.walkForward
        .positiveTotalFoldCount,
      2,
    );
    const derivativesAction = report.nextActionPlan.find(
      (action) => action.track === "derivatives_regime_filter",
    );
    assert.equal(
      derivativesAction?.action,
      "continue_historical_alignment_until_promotion_gates_pass",
    );
    assert.equal(derivativesAction?.currentEvidence.usableForLivePromotion, false);
    assert.equal(
      derivativesAction?.currentEvidence.bestDiagnosticCandidate?.promotionEligible,
      false,
    );
    assert.equal(report.profitabilitySnapshot.derivativesRegimeResearch.usableForLivePromotion, false);
    assert.equal(report.profitabilitySnapshot.derivativesRegimeResearch.diagnosticImprovementCount, 1);
    assert.equal(report.derivativesRegimeResearch.hasPromotionCandidate, false);
    assert.equal(report.derivativesRegimeResearch.reports[0]?.pairs[0]?.source.spanDays, 83.333333);
    assert.equal(
      report.derivativesRegimeResearch.reports[0]?.pairs[0]?.topDiagnosticCandidate.gatedTradeCount,
      2,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal status does not select a managed-paper path with negative traded PnL", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-negative-managed-"));
  try {
    const min75Path = join(directory, "min75-readiness.json");
    const legacyPath = join(directory, "legacy-audit.json");
    const replacementReadinessPath = join(directory, "replacement-readiness.json");
    const hManagedReturnPath = join(directory, "h-managed-return.json");
    const btcManagedReturnPath = join(directory, "btc-managed-return.json");
    writeMin75Readiness(min75Path, {
      stressExcessReturnVsBuyHoldPct: -8.29479,
      liveChecks: { stressBeatsBtcBuyAndHold: false },
    });
    writeLegacyAudit(legacyPath);
    writeReplacementReadiness(replacementReadinessPath, {
      liveReady: false,
      classification: "research_candidate",
      market: "KRW-H",
      liveReasons: ["paperSignalAccepted", "positiveRealizedPaperExitPnl"],
    });
    writeJson(hManagedReturnPath, {
      source: { reportsRoot: "/tmp/paper-sessions-krw-h-60m-momentum-managed" },
      sessionCount: 17,
      tradedSessionCount: 0,
      allSessions: { totalPnlKrw: 0, avgReturnPct: 0, openPositionSessions: 0 },
      tradedSessionsOnly: { totalPnlKrw: 0, avgReturnPct: null, closedTradeCount: 0 },
      closedTradesOnly: { sessionCount: 0, totalPnlKrw: 0, closedTradeCount: 0 },
      strategyAssessment: { classification: "discard_candidate" },
      liveReadiness: { reasons: ["noAcceptedTrades"], checks: {} },
    });
    writeJson(btcManagedReturnPath, {
      source: {
        reportsRoot: "/tmp/paper-sessions-btc-240m-momentum-lb168-hold72-range-p70-managed",
      },
      sessionCount: 20,
      tradedSessionCount: 20,
      filledSessionCount: 1,
      openMarkSessionCount: 19,
      allSessions: { totalPnlKrw: -2023.402128, avgReturnPct: -0.02, openPositionSessions: 19 },
      tradedSessionsOnly: {
        totalPnlKrw: -2023.402128,
        avgReturnPct: -0.02,
        closedTradeCount: 0,
      },
      closedTradesOnly: { sessionCount: 0, totalPnlKrw: 0, closedTradeCount: 0 },
      strategyAssessment: { classification: "paper_candidate" },
      latestSession: { returnPct: -0.03, markedPnlKrw: -300.21, openPositionCount: 1 },
      liveReadiness: {
        reasons: ["positiveTradedPnl", "positiveClosedTradePnl", "noOpenPosition"],
        checks: {
          minimumClosedTrades: false,
          positiveClosedTradePnl: false,
          noOpenPosition: false,
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-status.js",
        "--min75-readiness",
        min75Path,
        "--legacy-audit",
        legacyPath,
        "--replacement-readiness",
        replacementReadinessPath,
        "--replacement-managed-return-summary",
        hManagedReturnPath,
        "--replacement-managed-return-summary",
        btcManagedReturnPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      selectedCandidate: { type: string };
      strategyDecision: {
        leadingManagedPaperPath: { action: string; tradedPnlKrw: number };
      };
      nextActionPlan: Array<{ track: string; action: string }>;
      profitabilitySnapshot: {
        leadingManagedPaper: { tradedPnlKrw: number; usableForLivePromotion: boolean };
      };
    };
    assert.notEqual(report.selectedCandidate.type, "managed_paper_candidate");
    assert.equal(report.selectedCandidate.type, "replacement_time_series_managed_inactive");
    assert.equal(
      report.strategyDecision.leadingManagedPaperPath.action,
      "stop_reentry_keep_exit_reconciliation_only",
    );
    assert.equal(report.strategyDecision.leadingManagedPaperPath.tradedPnlKrw, -2023.402128);
    assert.equal(
      report.nextActionPlan.find((action) => action.track === "managed_paper")?.action,
      "stop_reentry_keep_exit_reconciliation_only",
    );
    assert.equal(report.profitabilitySnapshot.leadingManagedPaper.usableForLivePromotion, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
