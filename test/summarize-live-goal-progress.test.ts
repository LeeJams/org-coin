import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function blockedLiveGoal(liveReadinessPath?: string, researchSourcePath?: string): Record<string, unknown> {
  return {
    generatedAt: "2026-05-14T01:57:27.133Z",
    objective: "find live profitable strategy",
    status: "blocked",
    liveReady: false,
    liveStartupAllowed: false,
    selectedLiveCandidate: null,
    selectedResearchFocus: {
      type: "spot_perp_carry_research_focus",
      market: "KRW-PIEVERSE",
      symbol: "PIEVERSEUSDT",
      sourcePath: researchSourcePath,
      candidateRole: "highest_expected_carry",
      usableForLivePromotion: false,
    },
    profitabilityEvidence: {
      status: "estimated_carry_only",
      realizedPnlKrw: null,
      realizedReturnPct: null,
      realizedEvidenceAvailable: false,
      estimatedCarry: {
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        estimatedNetPnlKrw: 914897.934171,
        medianNetCarryBps: 111.159666,
        observationCount: 171,
        completedFundingCount: 3,
      },
      fallbackEstimatedCarry: {
        market: "KRW-EDU",
        symbol: "EDUUSDT",
        medianNetCarryBps: 46.190933,
      },
      livePromotionEvidenceSatisfied: false,
    },
    strategyDecision: {
      currentMode: "live_blocked",
    },
    strategyLifecycleDecision: {
      selectedLiveCandidate: null,
      selectedResearchFocus: {
        type: "spot_perp_carry_research_focus",
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        usableForLivePromotion: false,
      },
      liveStartupAllowed: false,
      decisions: {
        highestExpectedCarry: {
          decision: "continue_research_only",
          market: "KRW-PIEVERSE",
          reason: "positive_expected_carry_but_live_gates_missing",
        },
        cleanestExecutionCarry: {
          decision: "fallback_research_only",
          market: "KRW-EDU",
        },
      },
    },
    spotPerpCarryResearchFocusDecision: {
      action: "continue_highest_expected_carry_observation",
      currentFocusMarket: "KRW-PIEVERSE",
      cleanestExecutionMarket: "KRW-EDU",
      pairedMarketComparisonSupportsResearchFocus: true,
      switchCriteria: ["switch if paired comparison no longer supports the focus"],
    },
    carryStrategyComparison: {
      focusedWatch: {
        label: "best_spot_perp_carry_watch",
        estimatedNetPnlKrw: 914897.934171,
        medianNetCarryBps: 111.159666,
      },
      delta: {
        estimatedNetPnlKrw: 100000,
        medianNetCarryBps: 120,
      },
    },
    carryMarketDecisionMatrix: [
      {
        sourcePath: researchSourcePath,
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        metrics: {
          count: 171,
          completedFundingCount: 3,
          executionEligibleMedianNetCarryBps: 111.159666,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-LOWEXEC",
        symbol: "LOWEXECUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["spreadControl"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 130.5,
          failed: false,
        },
        metrics: {
          count: 20,
          completedFundingCount: 1,
          executionEligibleCount: 4,
          executionEligibleMedianNetCarryBps: 150.5,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-DEEP",
        symbol: "DEEPUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 24.8,
          failed: false,
        },
        metrics: {
          count: 2,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 24.9,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-H",
        symbol: "HUSDT",
        status: "collect_more_evidence",
        decision: "reject_or_demote_fee_stress_failed",
        nextDecisionTrigger:
          "fresh_fee_stress_recovery_with_median_net_carry >= 20 bps and positive_rate >= 0.67",
        reasons: ["insufficientCompletedFundingEventsForKillDecision", "feeStressFailed"],
        requiredBeforeMetricCandidate: [
          "moreObservations",
          "moreCompletedFundingEvents",
          "strongerMedianNetCarry",
          "higherPositiveCarryRate",
        ],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: -34.5,
          executionEligiblePositiveRate: 0,
          failed: true,
        },
        metrics: {
          count: 2,
          completedFundingCount: 1,
          executionEligibleCount: 2,
          executionEligibleMedianNetCarryBps: -12.5,
          executionEligiblePositiveRate: 0,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-SAHARA",
        symbol: "SAHARAUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 9.5,
          executionEligiblePositiveRate: 1,
          failed: false,
        },
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleCount: 1,
          executionEligibleMedianNetCarryBps: 30.5,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-QUALITY",
        symbol: "QUALITYUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "compare_or_switch",
        reasons: [],
        requiredBeforeMetricCandidate: [],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 98.5,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            medianWindowNetCarryBps: 118.25,
            windows: [
              {
                fundingSettledAt: "2026-05-14T00:00:00.000Z",
                sampleCount: 8,
                medianNetCarryBps: 111,
                medianEstimatedNetPnlKrw: 5550,
              },
              {
                fundingSettledAt: "2026-05-14T04:00:00.000Z",
                sampleCount: 10,
                medianNetCarryBps: 125.5,
                medianEstimatedNetPnlKrw: 6275,
              },
            ],
          },
          failed: false,
        },
        metrics: {
          count: 30,
          completedFundingCount: 6,
          executionEligibleRate: 0.9,
          executionEligibleMedianNetCarryBps: 120.5,
          executionEligiblePositiveRate: 0.9,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-PARTI",
        symbol: "PARTIUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents", "spreadControl"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 53.19,
          failed: false,
        },
        metrics: {
          count: 12,
          completedFundingCount: 1,
          executionEligibleRate: 0.3,
          executionEligiblePositiveRate: 0.3,
          depthCoverageRate: 1,
          executionEligibleMedianNetCarryBps: 53.2,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-AKT",
        symbol: "AKTUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        metrics: {
          count: 12,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 55.5,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-PROMPT",
        symbol: "PROMPTUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 52.5,
          executionEligiblePositiveRate: 1,
          failed: false,
        },
        metrics: {
          count: 12,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 72.5,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-POLYX",
        symbol: "POLYXUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 31.2,
          executionEligiblePositiveRate: 1,
          failed: false,
        },
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 29.2,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-ETHFI",
        symbol: "ETHFIUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 24.9,
          executionEligiblePositiveRate: 1,
          failed: false,
        },
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 22.9,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-ARPA",
        symbol: "ARPAUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents,spreadControl",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents", "spreadControl"],
        metrics: {
          count: 2,
          completedFundingCount: 1,
          executionEligibleRate: 0,
        },
      },
      {
        sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
        market: "KRW-MON",
        symbol: "MONUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 50.25,
        },
      },
      {
        sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
        market: "KRW-NIL",
        symbol: "NILUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 70.25,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-NIL",
        symbol: "NILUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 46.05,
          executionEligiblePositiveRate: 1,
          failed: false,
        },
        metrics: {
          count: 15,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 40.25,
          executionEligiblePositiveRate: 0.9,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-ICP",
        symbol: "ICPUSDT",
        status: "collect_more_evidence",
        decision: "reject_or_demote_fee_stress_failed",
        nextDecisionTrigger:
          "fresh_fee_stress_recovery_with_median_net_carry >= 20 bps and positive_rate >= 0.67",
        reasons: ["insufficientCompletedFundingEventsForKillDecision", "feeStressFailed"],
        requiredBeforeMetricCandidate: [
          "moreCompletedFundingEvents",
          "strongerMedianNetCarry",
          "higherPositiveCarryRate",
          "spreadControl",
        ],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 8.9,
          executionEligiblePositiveRate: 0.444444,
          failed: true,
        },
        metrics: {
          count: 18,
          completedFundingCount: 1,
          executionEligibleCount: 9,
          executionEligibleMedianNetCarryBps: 29.95,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-AZTEC",
        symbol: "AZTECUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 36.96,
          executionEligiblePositiveRate: 0.965517,
          failed: false,
        },
        metrics: {
          count: 29,
          completedFundingCount: 1,
          executionEligibleRate: 0.965517,
          executionEligibleMedianNetCarryBps: 36.96,
          executionEligiblePositiveRate: 0.965517,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-CYS",
        symbol: "CYSUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 85.1,
          executionEligiblePositiveRate: 1,
          failed: false,
        },
        metrics: {
          count: 7,
          completedFundingCount: 1,
          executionEligibleRate: 0.142857,
          executionEligibleMedianNetCarryBps: 95.3,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-cys.json",
        market: "KRW-CYS",
        symbol: "CYSUSDT",
        status: "kill_candidate",
        decision: "reject_or_demote",
        nextDecisionTrigger: "spreadControl",
        reasons: ["executionEligibleRateBelowKillThresholdAfterTwoFundingWindows"],
        requiredBeforeMetricCandidate: ["spreadControl"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 98.98,
          executionEligiblePositiveRate: 1,
          failed: false,
        },
        metrics: {
          count: 101,
          completedFundingCount: 2,
          executionEligibleRate: 0.148515,
          executionEligibleMedianNetCarryBps: 120.22,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
    ],
    nextActionPlan: [
      {
        priority: 1,
        track: "spot_perp_carry_watchlist",
        action: "continue_best_positive_watch_candidate_observation_do_not_promote",
        verificationCommand:
          "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness && npm run dry-run:gate-live-goal-ready",
        requiredEvidenceBeforeLive: [
          "insufficientObservations",
          "insufficientObservationSpan",
          "insufficientCompletedFundingEvents",
        ],
        currentEvidence: {
          usableForLivePromotion: false,
          liveReadinessPath,
          readinessGap: {
            observations: { current: 171, required: 432, remaining: 261, passed: false },
          },
          readinessTimeline: {
            bottleneck: "observationSpanMinutes",
            estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
          },
        },
      },
    ],
    liveStartupPlan: {
      status: "blocked_until_all_gates_pass",
      gateCommand: "npm run dry-run:gate-live-goal-ready",
      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      orderSubmissionDefault: "disabled",
      requiredEnvForLiveValidation: [
        "ENABLE_LIVE_EXECUTION=true",
        "ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true",
      ],
      requiredEnvForOrderSubmission: [
        "ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION=true",
        "--submit-once",
      ],
      hardStops: ["Do not run the PM2 live command while liveReady is false."],
    },
    switchPlan: {
      bestChallengerLiveReadiness: {
        market: "KRW-QUALITY",
        symbol: "QUALITYUSDT",
        status: "blocked",
        liveReady: false,
        sourceReadinessPath: "var/reports/spot-perp-carry-quality-live-readiness-latest.json",
        generatedAt: "2026-05-14T06:40:00.000Z",
        fresh: true,
        readinessGap: {
          observations: { current: 101, required: 432, remaining: 331, passed: false },
          observationSpanMinutes: { current: 720, required: 4320, remaining: 3600, passed: false },
          completedFundingEvents: { current: 6, required: 6, remaining: 0, passed: true },
        },
        readinessTimeline: {
          bottleneck: "observationSpanMinutes",
          estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
        },
        checks: {
          sufficientObservations: false,
          sufficientObservationSpan: false,
          completedFundingEvents: true,
          accountFeesConfirmed: false,
          inventoryReady: false,
          hedgeVenueReady: false,
          perMarketMetricCandidates: false,
          perMarketFeeStressReady: true,
        },
        marketSpecificBlockers: [
          "market:KRW-QUALITY:notMetricCandidate",
          "market:KRW-QUALITY:requires:spreadControl",
        ],
        globalBlockers: [
          "insufficientObservations",
          "insufficientObservationSpan",
          "feeScheduleUnconfirmed",
        ],
        requiredBeforeMetricCandidate: ["spreadControl"],
        action: "keep_challenger_research_only_until_live_readiness_clears",
        interpretation:
          "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
      },
    },
    completionAudit: {
      achieved: false,
      failedCompletionCriteria: [
        "profitability_evidence_satisfied",
        "current_entry_sanity_clear",
      ],
      missingRequirements: [
        "spotPerpCarryWatchObservationSpan",
        "spotPerpCarryLiveReadiness",
      ],
      missingRequirementCount: 2,
      criteria: [
        {
          id: "profitability_evidence_satisfied",
          criterion: "Profitability evidence is satisfied.",
          passed: false,
        },
        {
          id: "current_entry_sanity_clear",
          criterion: "Current entry sanity is clear.",
          passed: false,
        },
        {
          id: "known_losing_paths_rejected",
          criterion: "Known losing paths are rejected.",
          passed: true,
        },
      ],
    },
  };
}

test("live goal progress summary keeps estimated carry separate from live readiness", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-summary-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "live-readiness.json");
    const researchSourcePath = join(directory, "spot-perp-carry-pieverse.json");
    writeJson(liveGoalPath, blockedLiveGoal(liveReadinessPath, researchSourcePath));
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T01:57:30.286Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processCount: 15,
      processHealth: {
        onlineCount: 2,
        waitingRestartCount: 13,
        expectedLoopingObserverCount: 12,
        expectedLoopingObserversWithoutAutorestart: [],
        unstableRestartProcessCount: 0,
        maxRestartDelayMs: 600000,
      },
      savedProcessControl: {
        liveGoalObserverPresent: true,
        restartDelayMs: 600000,
        tradingMode: "paper",
        liveExecutionFlag: "false",
        aligned: true,
      },
    });
    writeJson(liveReadinessPath, {
      generatedAt: "2026-05-14T01:57:29.000Z",
      status: "blocked",
      liveReady: false,
      blockers: ["operationalProof:credentialsMissing"],
      checks: {
        accountFeesConfirmed: false,
        inventoryReady: false,
        hedgeVenueReady: false,
        operationalProofPresent: true,
        operationalProofFresh: true,
        liveExecutionPathReady: true,
      },
      nextOperationalSteps: [
        {
          action: "refresh_operational_proof_with_credentials",
          missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
        },
      ],
      evidence: {
        feeStressReports: [
          {
            generatedAt: "2026-05-14T01:57:28.500Z",
            summary: {
              executionEligibleMedianNetCarryBps: 77.25,
              executionEligiblePositiveRate: 1,
            },
            fundingWindowSummary: {
              source: "all_execution_eligible_rows_grouped_by_market_symbol_fundingSettledAt",
              completedFundingWindowCount: 2,
              executableSampleCount: 4,
              positiveWindowRate: 1,
              medianWindowNetCarryBps: 76.25,
              medianWindowCarryPct: 0.7625,
              medianWindowEstimatedNetPnlKrw: 3812.5,
              estimatedNetPnlKrwAcrossFundingWindows: 7625,
              isDeduplicatedByFundingWindow: true,
              isNotRealizedReturn: true,
              windows: [
                {
                  market: "KRW-PIEVERSE",
                  symbol: "PIEVERSEUSDT",
                  fundingSettledAt: "2026-05-14T00:00:00.000Z",
                  sampleCount: 2,
                  medianNetCarryBps: 88,
                  medianEstimatedNetPnlKrw: 4400,
                },
                {
                  market: "KRW-PIEVERSE",
                  symbol: "PIEVERSEUSDT",
                  fundingSettledAt: "2026-05-14T04:00:00.000Z",
                  sampleCount: 2,
                  medianNetCarryBps: 64.5,
                  medianEstimatedNetPnlKrw: 3225,
                },
              ],
            },
          },
        ],
        operationalProof: {
          generatedAt: "2026-05-14T01:57:28.000Z",
          accountFeesConfirmed: false,
          inventoryReady: false,
          hedgeVenueReady: false,
          requirements: {
            totalSpotQuoteRequiredKrw: 500200,
            totalFuturesMarginRequiredUsdt: 337.209302,
          },
          deficits: {
            bithumbQuoteDeficitKrw: 500200,
            binanceUsdtDeficit: 337.209302,
          },
          details: {
            missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
            feeBudget: {
              carryReportPath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
              feeBudgetReportPaths: [
                "var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json",
              ],
              maxBithumbFeeBps: 25,
              maxBinanceFuturesTakerFeeBps: 5,
            },
          },
          reasons: ["credentialsMissing"],
        },
      },
    });
    writeJson(researchSourcePath, {
      generatedAt: "2026-05-14T01:58:00.000Z",
      status: "blocked",
      promotionEligible: false,
      observationCount: 172,
      observationSpanMinutes: 450,
      assumptions: {
        notionalKrw: 500000,
      },
      summary: {
        completedFundingCount: 3,
        executionEligibleMedianNetCarryBps: 111.2,
        executionEligibleTotalEstimatedNetPnlKrw: 920000,
        executionEligibleRate: 0.97,
        executionEligiblePositiveRate: 1,
      },
      fundingWindowSummary: {
        source: "all_execution_eligible_rows_grouped_by_market_symbol_fundingSettledAt",
        completedFundingWindowCount: 2,
        executableSampleCount: 4,
        medianWindowNetCarryBps: 97.5,
        medianWindowCarryPct: 0.975,
        medianWindowEstimatedNetPnlKrw: 4875,
        estimatedNetPnlKrwAcrossFundingWindows: 9750,
        isDeduplicatedByFundingWindow: true,
        isNotRealizedReturn: true,
        interpretation:
          "Groups all execution-eligible carry samples by market, symbol, and completed funding settlement window so repeated snapshots in one funding window are not counted as repeated realized trades.",
        windows: [
          {
            market: "KRW-PIEVERSE",
            symbol: "PIEVERSEUSDT",
            fundingSettledAt: "2026-05-14T00:00:00.000Z",
            sampleCount: 2,
            medianNetCarryBps: 110,
            bestNetCarryBps: 120,
            worstNetCarryBps: 100,
            medianEstimatedNetPnlKrw: 5500,
            bestEstimatedNetPnlKrw: 6000,
            worstEstimatedNetPnlKrw: 5000,
            firstCapturedAt: "2026-05-14T01:10:00.000Z",
            lastCapturedAt: "2026-05-14T01:20:00.000Z",
          },
          {
            market: "KRW-PIEVERSE",
            symbol: "PIEVERSEUSDT",
            fundingSettledAt: "2026-05-14T04:00:00.000Z",
            sampleCount: 2,
            medianNetCarryBps: 85,
            bestNetCarryBps: 90,
            worstNetCarryBps: 80,
            medianEstimatedNetPnlKrw: 4250,
            bestEstimatedNetPnlKrw: 4500,
            worstEstimatedNetPnlKrw: 4000,
            firstCapturedAt: "2026-05-14T05:10:00.000Z",
            lastCapturedAt: "2026-05-14T05:20:00.000Z",
          },
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      status: string;
      achieved: boolean;
      live: { liveReady: boolean; liveStartupAllowed: boolean; selectedLiveCandidate: unknown };
      profitability: {
        status: string;
        realizedEvidenceAvailable: boolean;
        estimatedCarry: { market: string; medianNetCarryBps: number };
      };
      profitabilityReturnView: {
        realizedReturnPct: number | null;
        realizedEvidenceAvailable: boolean;
        estimatedMedianCarryPct: number;
        feeStressEstimatedMedianCarryPct: number | null;
        estimatedNetPnlKrwIsObservationSum: boolean;
        estimatedNetPnlKrwIsNotRealizedAccountReturn: boolean;
        paperFundingWindowReturnView: {
          status: string;
          returnType: string;
          source: string;
          sourcePath: string;
          realizedReturnPct: number | null;
          realizedEvidenceAvailable: boolean;
          paperReturnIsUsableForLivePromotion: boolean;
          notionalKrw: number;
          completedFundingWindowCount: number;
          positiveWindowRate: number;
          positivePaperWindowCount: number;
          positivePaperWindowRate: number;
          medianWindowCarryPct: number;
          medianPaperReturnPct: number;
          previousPaperReturnPct: number;
          latestPaperNetPnlKrw: number;
          latestPaperReturnPct: number;
          latestVsPreviousPaperReturnPct: number;
          latestPaperReturnDeteriorating: boolean;
          estimatedNetPnlKrwAcrossFundingWindows: number;
          paperReturnPctAcrossFundingWindows: number;
          action: string;
          ledgerRows: Array<{
            market: string;
            symbol: string;
            fundingSettledAt: string;
            sampleCount: number;
            medianNetCarryBps: number;
            paperNetPnlKrw: number;
            paperReturnPct: number;
            firstCapturedAt: string;
            lastCapturedAt: string;
            pricingMethod: string;
          }>;
          isDeduplicatedByFundingWindow: boolean;
          isNotRealizedReturn: boolean;
          interpretation: string;
        };
        fundingWindowCarryView: {
          source: string;
          completedFundingWindowCount: number;
          executableSampleCount: number;
          medianWindowNetCarryBps: number;
          medianWindowCarryPct: number;
          medianWindowEstimatedNetPnlKrw: number;
          estimatedNetPnlKrwAcrossFundingWindows: number;
          isDeduplicatedByFundingWindow: boolean;
          isNotRealizedReturn: boolean;
          windows: Array<{
            fundingSettledAt: string;
            sampleCount: number;
            medianNetCarryBps: number;
            bestNetCarryBps: number;
            medianEstimatedNetPnlKrw: number;
          }>;
        };
        feeStressFundingWindowCarryView: {
          sourcePath: string;
          generatedAt: string;
          summary: {
            executionEligibleMedianNetCarryBps: number;
            executionEligiblePositiveRate: number;
          };
          completedFundingWindowCount: number;
          executableSampleCount: number;
          positiveWindowRate: number;
          medianWindowNetCarryBps: number;
          medianWindowCarryPct: number;
          medianWindowEstimatedNetPnlKrw: number;
          estimatedNetPnlKrwAcrossFundingWindows: number;
          isDeduplicatedByFundingWindow: boolean;
          isNotRealizedReturn: boolean;
        };
        feeStressFundingWindowTrendView: {
          sourcePath: string;
          windowCount: number;
          minLivePromotionMedianNetCarryBps: number;
          latestWindow: {
            fundingSettledAt: string;
            sampleCount: number;
            medianNetCarryBps: number;
            medianEstimatedNetPnlKrw: number;
          };
          previousWindow: {
            fundingSettledAt: string;
            sampleCount: number;
            medianNetCarryBps: number;
            medianEstimatedNetPnlKrw: number;
          };
          overallMedianNetCarryBps: number;
          latestVsPreviousMedianNetCarryBps: number;
          latestVsOverallMedianNetCarryBps: number;
          latestWindowMeetsLivePromotionCarryThreshold: boolean;
          latestWindowDeteriorating: boolean;
          consecutiveDeterioratingWindowCount: number;
          latestVsPeakMedianNetCarryBps: number;
          degradationSeverity: string;
          demotionGate: {
            estimatedNextFundingSettledAt: string;
            currentLatestMedianNetCarryBps: number;
            mustExceedLatestMedianNetCarryBpsToRecover: number;
            lowCarryDemotionThresholdBps: number;
          };
          action: string;
        };
      };
      strategyDecisionView: {
        currentMode: string;
        selectedLiveCandidate: unknown;
        liveStartupAllowed: boolean;
        decisions: {
          highestExpectedCarry: { decision: string; market: string };
        };
        researchFocusDecision: {
          action: string;
          currentFocusMarket: string;
          pairedMarketComparisonSupportsResearchFocus: boolean;
        };
        autonomousStrategyAction: {
          action: string;
          currentFocusMarket: string;
          fallbackMarket: string;
          canPromoteLive: boolean;
        };
        carryStrategyComparison: {
          focusedWatch: { label: string };
        };
        carryMarketDecisionMatrix: Array<{
          market: string;
          decision: string;
          metrics: { count?: number; executionEligibleRate?: number };
        }>;
        challengerCarryMarkets: Array<{
          sourcePath: string;
          market: string;
          decision: string;
          qualityStatus: string;
          qualityPasses: boolean;
          knownQualityFailureReasons: string[];
          executionEligibleRate: number | null;
          hasEnoughFundingWindows: boolean;
          metrics: { count?: number; executionEligibleMedianNetCarryBps?: number };
        }>;
        spreadCleanEmergingChallengers: Array<{
          market: string;
          comparisonCarryBps: number;
          comparisonCarrySource: string;
          completedFundingWindowCount: number;
          remainingFundingWindowCount: number;
          qualityStatus: string;
          qualityPasses: boolean;
          evidenceAction: string;
        }>;
        replacementCandidateQueue: Array<{
          market: string;
          comparisonCarryBps: number;
          qualityStatus: string;
          hasEnoughFundingWindows: boolean;
          priorityBlocker: string;
          action: string;
        }>;
        reducedActivityGuardrail: {
          rawCarryBlockedCandidates: Array<{
            market: string;
            comparisonCarryBps: number;
            executionEligibleRate: number | null;
            knownQualityFailureReasons: string[];
            blockedReasons: string[];
            sourceRowCount: number;
            action: string;
          }>;
          warnings: string[];
        };
        challengerSwitchDecision: {
          action: string;
          reason: string;
          currentFocusMarket: string;
          currentFocusMedianNetCarryBps: number;
          currentFocusComparisonCarryBps: number;
          bestChallengerMarket: string;
          bestChallengerMedianNetCarryBps: number;
          bestChallengerComparisonCarryBps: number;
          bestChallengerComparisonCarrySource: string;
          bestChallengerSelectionScope: string;
          comparisonScope: string;
          latestFeeStressWindowComparison: {
            currentFocusLatestWindow: {
              fundingSettledAt: string;
              sampleCount: number;
              medianNetCarryBps: number;
              medianEstimatedNetPnlKrw: number;
            };
            bestChallengerLatestWindow: {
              fundingSettledAt: string;
              sampleCount: number;
              medianNetCarryBps: number;
              medianEstimatedNetPnlKrw: number;
            };
            deltaToCurrentFocusBps: number;
            bestChallengerBeatsCurrentFocus: boolean;
            sampleQualityPasses: boolean;
            action: string;
          };
          deltaToCurrentFocusBps: number;
          deltaToCurrentFocusComparisonBps: number;
          challengerExecutionEligibleRate: number;
          challengerQualityPasses: boolean;
          challengerKnownQualityFailureReasons: string[];
          challengerBeatsCurrentFocus: boolean;
          bestOverallChallengerBeatsCurrentFocus: boolean;
          bestQualityClearedChallengerBeatsCurrentFocus: boolean;
          bestOverallChallenger: { market: string; knownQualityFailureReasons: string[] };
          bestQualityClearedChallenger: { market: string; medianNetCarryBps: number };
        };
        autonomousChallengerChecks: Array<{
          market: string;
          decision: string;
          evaluationStatus: string;
          evaluationReasons: string[];
          medianNetCarryBps: number;
          feeStressMedianNetCarryBps: number;
          comparisonCarryBps: number;
          comparisonCarrySource: string;
          deltaToCurrentFocusComparisonBps: number;
          qualityStatus: string;
          qualityPasses: boolean;
          knownQualityFailureReasons: string[];
          beatsCurrentFocus: boolean;
          hasEnoughFundingWindows: boolean;
        }>;
        challengerObservationCoverage: {
          opportunityObservationCovered: boolean;
          opportunityObserverConfiguredForMissingMarkets: boolean | null;
          missingOpportunityObservation: Array<{
            market: string;
            symbol: string;
            sourcePath: string;
            metrics: { executionEligibleMedianNetCarryBps: number };
            configuredInOpportunityObserver: boolean;
            requiredAction: string;
          }>;
          action: string | null;
        };
      };
      strategyResearchHandoff: {
        status: string;
        canAuthorizeLiveStartup: boolean;
        currentFocusMarket: string;
        bestChallengerMarket: string;
        bestChallengerComparisonCarryBps: number;
        deltaToCurrentFocusComparisonBps: number;
        requiredBeforeFocusSwitch: string[];
	        bestChallengerLiveReadiness: {
	          market: string;
	          liveReady: boolean;
	          blockers: string[];
	          requiredBeforeMetricCandidate: string[];
	          action: string;
	          interpretation: string;
        };
        requiredBeforeChallengerLiveStartup: string[];
        latestFeeStressWindowComparison: {
          sampleQualityPasses: boolean;
          bestChallengerLatestWindowSampleCount: number;
        };
        emergingCleanOpportunities: {
          candidateCount: number;
          candidates: Array<{
            market: string;
            comparisonCarryBps: number;
            completedFundingWindowCount: number;
            remainingFundingWindowCount: number;
            evidenceAction: string;
          }>;
          action: string | null;
          requiredBeforePromotion: string[];
        };
        verificationCommands: {
          refreshOpportunityFeeStressCommand: string;
        };
      };
      researchFocus: { market: string; usableForLivePromotion: boolean };
      researchSourceFreshness: {
        observationCount: number;
        liveGoalObservationCount: number;
        observationCountDelta: number;
        completedFundingCount: number;
        sourceNewerThanLiveGoal: boolean;
        liveGoalMayLagResearchSource: boolean;
      };
      priorityAction: {
        track: string;
        readinessTimeline: { bottleneck: string };
        requiredEvidenceBeforeLive: string[];
      };
      readinessProgress: {
        readinessGap: {
          observations: { current: number; required: number; remaining: number; passed: boolean };
        };
        readinessTimeline: { bottleneck: string; estimatedEarliestReviewAt: string };
        usableForLivePromotion: boolean;
        evidenceCollectionStillRequired: string[];
      };
      autonomousEvidenceHandoff: {
        autonomousBlockerEvidence: Array<{
          blocker: string;
          opportunityObservationCovered?: boolean | null;
          opportunityObserverConfiguredForMissingMarkets?: boolean | null;
          missingOpportunityObservation?: Array<{
            market: string;
            symbol: string;
            sourcePath: string;
            metrics: Record<string, unknown>;
            configuredInOpportunityObserver: boolean;
            requiredAction: string;
          }>;
          requiredAction?: string | null;
        }>;
      };
	      processAlignment: {
	        aligned: boolean;
	        violationCount: number;
	        processCount: number;
	        onlineCount: number;
	        waitingRestartCount: number;
	        expectedLoopingObserverCount: number;
	        unstableRestartProcessCount: number;
	        maxRestartDelayMs: number;
	        processHealth: {
	          onlineCount: number;
	          waitingRestartCount: number;
	          expectedLoopingObserverCount: number;
	          unstableRestartProcessCount: number;
	          maxRestartDelayMs: number;
        };
      };
      operationalReadiness: {
        liveReady: boolean;
        checks: { operationalProofPresent: boolean; accountFeesConfirmed: boolean };
        operationalProof: {
          missingSecrets: string[];
          deficits: { bithumbQuoteDeficitKrw: number; binanceUsdtDeficit: number };
          feeBudget: {
            carryReportPath: string;
            feeBudgetReportPaths: string[];
            maxBithumbFeeBps: number;
            maxBinanceFuturesTakerFeeBps: number;
          };
        };
      };
      operatorLiveReadinessHandoff: {
        status: string;
        canStartLiveWithoutOperatorInput: boolean;
        privateDataRequired: boolean;
        requiredBeforeLiveReview: string[];
        missingSecrets: string[];
        deficits: { bithumbQuoteDeficitKrw: number; binanceUsdtDeficit: number };
        feeBudget: { maxBithumbFeeBps: number };
        operatorBlockerEvidence: Array<{
          blocker: string;
          active: boolean;
          missingSecrets: string[];
          operatorAction: { action: string } | null;
        }>;
	        operatorActions: Array<{ action: string; missingSecrets: string[] }>;
	        verificationCommands: {
	          reviewCommand: string | null;
	          gateCommand: string;
	          pm2StartCommandAfterAllGatesPass: string | null;
	        };
	        blockedCommands: {
	          reviewCommand: string | null;
	          pm2StartCommand: string | null;
	          reason?: string;
	        } | null;
	        hardStops: string[];
	      };
      nextWorkClassification: {
        autonomousEvidenceCollection: string[];
        liveOperationalPrerequisites: string[];
        marketConditionBlockers: string[];
        processWork: string[];
        canContinueAutonomously: boolean;
        canStartLiveWithoutOperatorInput: boolean;
        recommendedAutonomousAction: string;
        recommendedLiveAction: string;
        strategyEvidencePriority: string;
        priorityMarket: string;
        priorityReason: string;
        priorityOpportunityObservationEvidence: {
          missingCount: number;
          firstMissingMarket: {
            market: string;
            symbol: string;
            sourcePath: string;
            executionEligibleMedianNetCarryBps: number;
            executionEligiblePositiveRate: number | null;
            completedFundingWindowCount: number | null;
            medianWindowNetCarryBps: number | null;
            medianWindowEstimatedNetPnlKrw: number | null;
          };
          displacedStrategyEvidencePriority: string | null;
          evidenceAction: string;
        };
      };
      checkpointPlan: {
        status: string;
        shouldStartLive: boolean;
        shouldRunHeavyRefreshNow: boolean;
        nextReviewAt: string | null;
        nextReviewAtKst: string | null;
        nextReviewDelayMinutes: number | null;
        nextReviewOverdue: boolean | null;
        nextReviewTrigger: string;
        recommendedAutonomousAction: string;
        reviewCommand: string;
        autonomousEvidenceSufficiency: Record<string, unknown> | null;
      };
      nextAutonomousWork: string[];
      nextOperatorWork: string[];
      nextMarketConditionWork: string[];
      nextRequiredOperatorWork: string[];
      completionAuditSummary: {
        achieved: boolean;
        failedCompletionCriteria: string[];
        missingRequirements: string[];
        missingRequirementCount: number;
        missingRequirementClassification: Record<string, string[]>;
        missingRequirementClassificationCounts: Record<string, number>;
        outstandingWorkCounts: Record<string, number>;
      };
      sourceCompletionAuditSummary: {
        achieved: boolean;
        failedCompletionCriteria: string[];
        missingRequirements: string[];
        missingRequirementCount: number | null;
        failedCriteriaIds: string[];
        failedCriteriaIdsMatch: boolean | null;
        missingRequirementCountMatches: boolean | null;
      };
      completionAuditScopeComparison: {
        sourceMissingRequirementCount: number;
        derivedMissingRequirementCount: number;
        countsMatch: boolean;
        addedBySummary: string[];
        missingFromSummary: string[];
        scopeInterpretation: string;
      };
	      goalCompletionAuditView: {
        achieved: boolean;
        successCriteria: Array<{
          id: string;
          passed: boolean;
          evidence: Record<string, unknown>;
        }>;
        promptToArtifactChecklist: Array<{
          id: string;
          status: string;
          artifactPaths: string[];
          command: string | null;
          evidence: Record<string, unknown>;
          gap: string | null;
        }>;
	      };
	      missingRequirements: string[];
	      missingRequirementCount: number;
	      missingRequirementClassification: Record<string, string[]>;
	      missingRequirementClassificationCounts: Record<string, number>;
	      outstandingWorkCounts: Record<string, number>;
	    };
    assert.equal(report.status, "blocked_continue_research_focus");
    assert.equal(report.achieved, false);
    assert.equal(report.live.liveReady, false);
    assert.deepEqual(report.sourceCompletionAuditSummary.failedCompletionCriteria, [
      "profitability_evidence_satisfied",
      "current_entry_sanity_clear",
    ]);
    assert.deepEqual(report.sourceCompletionAuditSummary.failedCriteriaIds, [
      "profitability_evidence_satisfied",
      "current_entry_sanity_clear",
    ]);
    assert.equal(report.sourceCompletionAuditSummary.failedCriteriaIdsMatch, true);
	    assert.equal(report.sourceCompletionAuditSummary.missingRequirementCountMatches, true);
	    assert.deepEqual(report.completionAuditScopeComparison, {
	      sourceMissingRequirementCount: 2,
	      derivedMissingRequirementCount: 9,
      countsMatch: false,
      addedBySummary: [
        "spotPerpCarryCurrentEntrySanity",
        "spotPerpCarryCurrentEntry:currentEntryReportMissing",
        "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
        "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
        "spotPerpCarryResearchFocus:latestWindowSampleQuality",
        "spotPerpCarryResearchFocus:opportunityObserverCoverage",
      ],
      missingFromSummary: [],
	      scopeInterpretation:
	        "The derived progress summary adds live-goal blocker requirements that are not present in the source completion audit.",
	    });
	    assert.equal(report.missingRequirementCount, report.completionAuditSummary.missingRequirementCount);
	    assert.deepEqual(report.missingRequirementClassification, report.completionAuditSummary.missingRequirementClassification);
	    assert.deepEqual(
	      report.missingRequirementClassificationCounts,
	      report.completionAuditSummary.missingRequirementClassificationCounts,
	    );
	    assert.deepEqual(report.outstandingWorkCounts, report.completionAuditSummary.outstandingWorkCounts);
	    assert.equal(report.live.liveStartupAllowed, false);
    assert.equal(report.live.selectedLiveCandidate, null);
    assert.equal(report.profitability.status, "estimated_carry_only");
    assert.equal(report.profitability.realizedEvidenceAvailable, false);
    assert.equal(report.profitability.estimatedCarry.market, "KRW-PIEVERSE");
    assert.equal(report.profitability.estimatedCarry.medianNetCarryBps, 111.159666);
    assert.equal(report.profitabilityReturnView.realizedReturnPct, null);
    assert.equal(report.profitabilityReturnView.realizedEvidenceAvailable, false);
    assert.equal(report.profitabilityReturnView.estimatedMedianCarryPct, 1.11159666);
    assert.equal(report.profitabilityReturnView.feeStressEstimatedMedianCarryPct, null);
    assert.equal(report.profitabilityReturnView.estimatedNetPnlKrwIsObservationSum, true);
    assert.equal(report.profitabilityReturnView.estimatedNetPnlKrwIsNotRealizedAccountReturn, true);
    assert.equal(
      report.profitabilityReturnView.fundingWindowCarryView.source,
      "all_execution_eligible_rows_grouped_by_market_symbol_fundingSettledAt",
    );
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.completedFundingWindowCount, 2);
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.executableSampleCount, 4);
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.medianWindowNetCarryBps, 97.5);
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.medianWindowCarryPct, 0.975);
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.medianWindowEstimatedNetPnlKrw, 4875);
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.estimatedNetPnlKrwAcrossFundingWindows, 9750);
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.isDeduplicatedByFundingWindow, true);
    assert.equal(report.profitabilityReturnView.fundingWindowCarryView.isNotRealizedReturn, true);
    assert.deepEqual(
      report.profitabilityReturnView.fundingWindowCarryView.windows.map((window) => ({
        fundingSettledAt: window.fundingSettledAt,
        sampleCount: window.sampleCount,
        medianNetCarryBps: window.medianNetCarryBps,
        bestNetCarryBps: window.bestNetCarryBps,
        medianEstimatedNetPnlKrw: window.medianEstimatedNetPnlKrw,
      })),
      [
        {
          fundingSettledAt: "2026-05-14T00:00:00.000Z",
          sampleCount: 2,
          medianNetCarryBps: 110,
          bestNetCarryBps: 120,
          medianEstimatedNetPnlKrw: 5500,
        },
        {
          fundingSettledAt: "2026-05-14T04:00:00.000Z",
          sampleCount: 2,
          medianNetCarryBps: 85,
          bestNetCarryBps: 90,
          medianEstimatedNetPnlKrw: 4250,
        },
      ],
    );
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.sourcePath, liveReadinessPath);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.generatedAt, "2026-05-14T01:57:28.500Z");
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowCarryView.summary.executionEligibleMedianNetCarryBps,
      77.25,
    );
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.completedFundingWindowCount, 2);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.executableSampleCount, 4);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.positiveWindowRate, 1);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.medianWindowNetCarryBps, 76.25);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.medianWindowCarryPct, 0.7625);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.medianWindowEstimatedNetPnlKrw, 3812.5);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.estimatedNetPnlKrwAcrossFundingWindows, 7625);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.isDeduplicatedByFundingWindow, true);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowCarryView.isNotRealizedReturn, true);
    assert.deepEqual(
      {
        status: report.profitabilityReturnView.paperFundingWindowReturnView.status,
        returnType: report.profitabilityReturnView.paperFundingWindowReturnView.returnType,
        source: report.profitabilityReturnView.paperFundingWindowReturnView.source,
        sourcePath: report.profitabilityReturnView.paperFundingWindowReturnView.sourcePath,
        realizedReturnPct: report.profitabilityReturnView.paperFundingWindowReturnView.realizedReturnPct,
        realizedEvidenceAvailable:
          report.profitabilityReturnView.paperFundingWindowReturnView.realizedEvidenceAvailable,
        paperReturnIsUsableForLivePromotion:
          report.profitabilityReturnView.paperFundingWindowReturnView.paperReturnIsUsableForLivePromotion,
        notionalKrw: report.profitabilityReturnView.paperFundingWindowReturnView.notionalKrw,
        completedFundingWindowCount:
          report.profitabilityReturnView.paperFundingWindowReturnView.completedFundingWindowCount,
        positiveWindowRate: report.profitabilityReturnView.paperFundingWindowReturnView.positiveWindowRate,
        positivePaperWindowCount:
          report.profitabilityReturnView.paperFundingWindowReturnView.positivePaperWindowCount,
        positivePaperWindowRate:
          report.profitabilityReturnView.paperFundingWindowReturnView.positivePaperWindowRate,
        medianWindowCarryPct: report.profitabilityReturnView.paperFundingWindowReturnView.medianWindowCarryPct,
        medianPaperReturnPct:
          report.profitabilityReturnView.paperFundingWindowReturnView.medianPaperReturnPct,
        previousPaperReturnPct:
          report.profitabilityReturnView.paperFundingWindowReturnView.previousPaperReturnPct,
        latestPaperNetPnlKrw:
          report.profitabilityReturnView.paperFundingWindowReturnView.latestPaperNetPnlKrw,
        latestPaperReturnPct:
          report.profitabilityReturnView.paperFundingWindowReturnView.latestPaperReturnPct,
        latestVsPreviousPaperReturnPct:
          report.profitabilityReturnView.paperFundingWindowReturnView.latestVsPreviousPaperReturnPct,
        latestPaperReturnDeteriorating:
          report.profitabilityReturnView.paperFundingWindowReturnView.latestPaperReturnDeteriorating,
        estimatedNetPnlKrwAcrossFundingWindows:
          report.profitabilityReturnView.paperFundingWindowReturnView
            .estimatedNetPnlKrwAcrossFundingWindows,
        paperReturnPctAcrossFundingWindows:
          report.profitabilityReturnView.paperFundingWindowReturnView.paperReturnPctAcrossFundingWindows,
        action: report.profitabilityReturnView.paperFundingWindowReturnView.action,
        isDeduplicatedByFundingWindow:
          report.profitabilityReturnView.paperFundingWindowReturnView.isDeduplicatedByFundingWindow,
        isNotRealizedReturn: report.profitabilityReturnView.paperFundingWindowReturnView.isNotRealizedReturn,
      },
      {
        status: "paper_funding_window_estimate_only",
        returnType: "paper_settled_funding_window",
        source: "fee_stress_funding_window",
        sourcePath: liveReadinessPath,
        realizedReturnPct: null,
        realizedEvidenceAvailable: false,
        paperReturnIsUsableForLivePromotion: false,
        notionalKrw: 500000,
        completedFundingWindowCount: 2,
        positiveWindowRate: 1,
        positivePaperWindowCount: 2,
        positivePaperWindowRate: 1,
        medianWindowCarryPct: 0.7625,
        medianPaperReturnPct: 0.7625,
        previousPaperReturnPct: 0.88,
        latestPaperNetPnlKrw: 3225,
        latestPaperReturnPct: 0.645,
        latestVsPreviousPaperReturnPct: -0.235,
        latestPaperReturnDeteriorating: true,
        estimatedNetPnlKrwAcrossFundingWindows: 7625,
        paperReturnPctAcrossFundingWindows: 1.525,
        action: "continue_observation_but_monitor_paper_return_degradation",
        isDeduplicatedByFundingWindow: true,
        isNotRealizedReturn: true,
      },
    );
    assert.deepEqual(
      report.profitabilityReturnView.paperFundingWindowReturnView.ledgerRows.map((row) => ({
        market: row.market,
        fundingSettledAt: row.fundingSettledAt,
        sampleCount: row.sampleCount,
        medianNetCarryBps: row.medianNetCarryBps,
        paperNetPnlKrw: row.paperNetPnlKrw,
        paperReturnPct: row.paperReturnPct,
        pricingMethod: row.pricingMethod,
      })),
      [
        {
          market: "KRW-PIEVERSE",
          fundingSettledAt: "2026-05-14T00:00:00.000Z",
          sampleCount: 2,
          medianNetCarryBps: 88,
          paperNetPnlKrw: 4400,
          paperReturnPct: 0.88,
          pricingMethod: "median_execution_eligible_snapshot",
        },
        {
          market: "KRW-PIEVERSE",
          fundingSettledAt: "2026-05-14T04:00:00.000Z",
          sampleCount: 2,
          medianNetCarryBps: 64.5,
          paperNetPnlKrw: 3225,
          paperReturnPct: 0.645,
          pricingMethod: "median_execution_eligible_snapshot",
        },
      ],
    );
    assert.match(
      report.profitabilityReturnView.paperFundingWindowReturnView.interpretation,
      /not realized account return/,
    );
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.sourcePath, liveReadinessPath);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.windowCount, 2);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.minLivePromotionMedianNetCarryBps, 20);
    assert.deepEqual(report.profitabilityReturnView.feeStressFundingWindowTrendView.previousWindow, {
      fundingSettledAt: "2026-05-14T00:00:00.000Z",
      sampleCount: 2,
      medianNetCarryBps: 88,
      medianEstimatedNetPnlKrw: 4400,
    });
    assert.deepEqual(report.profitabilityReturnView.feeStressFundingWindowTrendView.latestWindow, {
      fundingSettledAt: "2026-05-14T04:00:00.000Z",
      sampleCount: 2,
      medianNetCarryBps: 64.5,
      medianEstimatedNetPnlKrw: 3225,
    });
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.overallMedianNetCarryBps, 76.25);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.latestVsPreviousMedianNetCarryBps, -23.5);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.latestVsOverallMedianNetCarryBps, -11.75);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.latestWindowMeetsLivePromotionCarryThreshold, true);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.latestWindowDeteriorating, true);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.consecutiveDeterioratingWindowCount, 1);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.latestVsPeakMedianNetCarryBps, -23.5);
    assert.equal(report.profitabilityReturnView.feeStressFundingWindowTrendView.degradationSeverity, "single_window_degradation");
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate.estimatedNextFundingSettledAt,
      "2026-05-14T08:00:00.000Z",
    );
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate.currentLatestMedianNetCarryBps,
      64.5,
    );
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate.mustExceedLatestMedianNetCarryBpsToRecover,
      64.5,
    );
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate.lowCarryDemotionThresholdBps,
      20,
    );
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.action,
      "continue_observation_but_monitor_degradation",
    );
    assert.equal(report.strategyDecisionView.currentMode, "live_blocked");
    assert.equal(report.strategyDecisionView.selectedLiveCandidate, null);
    assert.equal(report.strategyDecisionView.liveStartupAllowed, false);
    assert.equal(
      report.strategyDecisionView.decisions.highestExpectedCarry.decision,
      "continue_research_only",
    );
    assert.equal(report.strategyDecisionView.decisions.highestExpectedCarry.market, "KRW-PIEVERSE");
    assert.equal(
      report.strategyDecisionView.researchFocusDecision.action,
      "continue_highest_expected_carry_observation",
    );
    assert.equal(report.strategyDecisionView.researchFocusDecision.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.strategyDecisionView.researchFocusDecision.pairedMarketComparisonSupportsResearchFocus, true);
    assert.equal(report.strategyDecisionView.autonomousStrategyAction.action, "continue_current_research_focus");
    assert.equal(report.strategyDecisionView.autonomousStrategyAction.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.strategyDecisionView.autonomousStrategyAction.fallbackMarket, "KRW-EDU");
    assert.equal(report.strategyDecisionView.autonomousStrategyAction.canPromoteLive, false);
    assert.equal(report.strategyDecisionView.carryStrategyComparison.focusedWatch.label, "best_spot_perp_carry_watch");
    assert.equal(report.strategyDecisionView.carryMarketDecisionMatrix[0].market, "KRW-PIEVERSE");
    assert.equal(
      report.strategyDecisionView.carryMarketDecisionMatrix[0].decision,
      "continue_until_metric_requirements_clear",
    );
    assert.equal(
      report.strategyDecisionView.carryMarketDecisionMatrix.find((market) => market.market === "KRW-H")?.decision,
      "reject_or_demote_fee_stress_failed",
    );
    assert.equal(
      report.strategyDecisionView.carryMarketDecisionMatrix.find((market) => market.market === "KRW-CYS")?.decision,
      "reject_or_demote",
    );
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[0].market, "KRW-LOWEXEC");
    assert.equal(
      report.strategyDecisionView.challengerCarryMarkets[0].metrics.executionEligibleMedianNetCarryBps,
      150.5,
    );
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[0].qualityStatus, "quality_blocked");
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[0].qualityPasses, false);
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[0].executionEligibleRate, 0.2);
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[0].hasEnoughFundingWindows, false);
    assert.deepEqual(report.strategyDecisionView.challengerCarryMarkets[0].knownQualityFailureReasons, [
      "executionEligibleRateBelowSwitchThreshold",
    ]);
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[1].market, "KRW-QUALITY");
    assert.equal(
      report.strategyDecisionView.challengerCarryMarkets[1].metrics.executionEligibleMedianNetCarryBps,
      120.5,
    );
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[1].qualityStatus, "quality_cleared");
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[1].qualityPasses, true);
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[1].executionEligibleRate, 0.9);
    assert.equal(report.strategyDecisionView.challengerCarryMarkets[1].hasEnoughFundingWindows, true);
    assert.deepEqual(report.strategyDecisionView.challengerCarryMarkets[1].knownQualityFailureReasons, []);
    const challengerCarryMarketsByMarket = new Map(
      report.strategyDecisionView.challengerCarryMarkets.map((market) => [market.market, market]),
    );
    const aktCarryMarket = challengerCarryMarketsByMarket.get("KRW-AKT");
    assert.ok(aktCarryMarket);
    assert.equal(
      aktCarryMarket.metrics.executionEligibleMedianNetCarryBps,
      55.5,
    );
    assert.equal(aktCarryMarket.qualityStatus, "quality_incomplete");
    assert.equal(aktCarryMarket.qualityPasses, false);
    assert.equal(aktCarryMarket.executionEligibleRate, 1);
    assert.equal(aktCarryMarket.hasEnoughFundingWindows, false);
    const partiCarryMarket = challengerCarryMarketsByMarket.get("KRW-PARTI");
    assert.ok(partiCarryMarket);
    assert.equal(partiCarryMarket.decision, "continue_until_metric_requirements_clear");
    assert.equal(partiCarryMarket.qualityStatus, "quality_blocked");
    const monCarryMarket = challengerCarryMarketsByMarket.get("KRW-MON");
    assert.ok(monCarryMarket);
    assert.equal(monCarryMarket.decision, "continue_until_metric_requirements_clear");
    assert.equal(
      report.strategyDecisionView.challengerCarryMarkets.some((market) => market.market === "KRW-CYS"),
      false,
    );
    assert.deepEqual(
      report.strategyDecisionView.spreadCleanEmergingChallengers.map((market) => ({
        market: market.market,
        comparisonCarryBps: market.comparisonCarryBps,
        comparisonCarrySource: market.comparisonCarrySource,
        completedFundingWindowCount: market.completedFundingWindowCount,
        remainingFundingWindowCount: market.remainingFundingWindowCount,
        qualityStatus: market.qualityStatus,
        qualityPasses: market.qualityPasses,
        evidenceAction: market.evidenceAction,
      })),
      [
        {
          market: "KRW-PROMPT",
          comparisonCarryBps: 72.5,
          comparisonCarrySource: "execution_eligible_sample_median",
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          qualityStatus: "quality_cleared",
          qualityPasses: true,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-AKT",
          comparisonCarryBps: 55.5,
          comparisonCarrySource: "execution_eligible_sample_median",
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          qualityStatus: "quality_incomplete",
          qualityPasses: false,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-NIL",
          comparisonCarryBps: 40.25,
          comparisonCarrySource: "execution_eligible_sample_median",
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          qualityStatus: "quality_cleared",
          qualityPasses: true,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-AZTEC",
          comparisonCarryBps: 36.96,
          comparisonCarrySource: "execution_eligible_sample_median",
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          qualityStatus: "quality_cleared",
          qualityPasses: true,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-SAHARA",
          comparisonCarryBps: 30.5,
          comparisonCarrySource: "execution_eligible_sample_median",
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          qualityStatus: "quality_cleared",
          qualityPasses: true,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-POLYX",
          comparisonCarryBps: 29.2,
          comparisonCarrySource: "execution_eligible_sample_median",
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          qualityStatus: "quality_cleared",
          qualityPasses: true,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
      ],
    );
    assert.deepEqual(
      report.strategyResearchHandoff.emergingCleanOpportunities.candidates.map((market) => ({
        market: market.market,
        comparisonCarryBps: market.comparisonCarryBps,
        completedFundingWindowCount: market.completedFundingWindowCount,
        remainingFundingWindowCount: market.remainingFundingWindowCount,
        evidenceAction: market.evidenceAction,
      })),
      [
        {
          market: "KRW-PROMPT",
          comparisonCarryBps: 72.5,
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-AKT",
          comparisonCarryBps: 55.5,
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-NIL",
          comparisonCarryBps: 40.25,
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
        {
          market: "KRW-AZTEC",
          comparisonCarryBps: 36.96,
          completedFundingWindowCount: 1,
          remainingFundingWindowCount: 5,
          evidenceAction: "continue_spread_clean_opportunity_observation",
        },
      ],
    );
    assert.equal(report.strategyResearchHandoff.emergingCleanOpportunities.candidateCount, 6);
    assert.equal(
      report.strategyResearchHandoff.emergingCleanOpportunities.action,
      "continue_spread_clean_opportunity_observation",
    );
    assert.deepEqual(report.strategyResearchHandoff.emergingCleanOpportunities.requiredBeforePromotion, [
      "six_completed_fee_stressed_funding_windows",
      "live_readiness_audit",
      "operational_proof",
      "fee_schedule_confirmation",
      "inventory_and_hedge_venue_readiness",
    ]);
    assert.deepEqual(
      report.strategyDecisionView.replacementCandidateQueue.slice(0, 2).map((market) => ({
        market: market.market,
        comparisonCarryBps: market.comparisonCarryBps,
        qualityStatus: market.qualityStatus,
        hasEnoughFundingWindows: market.hasEnoughFundingWindows,
        priorityBlocker: market.priorityBlocker,
        action: market.action,
      })),
      [
        {
          market: "KRW-LOWEXEC",
          comparisonCarryBps: 150.5,
          qualityStatus: "quality_blocked",
          hasEnoughFundingWindows: false,
          priorityBlocker: "quality_gate_blocked",
          action: "keep_observation_only_until_blocker_clears",
        },
        {
          market: "KRW-QUALITY",
          comparisonCarryBps: 118.25,
          qualityStatus: "quality_cleared",
          hasEnoughFundingWindows: true,
          priorityBlocker: "switch_review_candidate",
          action: "review_for_research_focus_switch_after_live_readiness_refresh",
        },
      ],
    );
    assert.deepEqual(
      report.strategyDecisionView.reducedActivityGuardrail.rawCarryBlockedCandidates
        .slice(0, 1)
        .map((market) => ({
          market: market.market,
          comparisonCarryBps: market.comparisonCarryBps,
          executionEligibleRate: market.executionEligibleRate,
          knownQualityFailureReasons: market.knownQualityFailureReasons,
          blockedReasons: market.blockedReasons,
          sourceRowCount: market.sourceRowCount,
          action: market.action,
        })),
      [
        {
          market: "KRW-LOWEXEC",
          comparisonCarryBps: 150.5,
          executionEligibleRate: 0.2,
          knownQualityFailureReasons: ["executionEligibleRateBelowSwitchThreshold"],
          blockedReasons: ["executionEligibleRateBelowSwitchThreshold", "requires:spreadControl"],
          sourceRowCount: 1,
          action: "do_not_promote_raw_carry_without_quality_gates",
        },
      ],
    );
    assert.ok(
      report.strategyDecisionView.reducedActivityGuardrail.warnings.includes(
        "raw_high_carry_candidates_blocked_by_low_execution_eligibility",
      ),
    );
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.action, "compare_or_switch_research_focus");
    assert.equal(report.strategyResearchHandoff.status, "research_focus_recompare_required");
    assert.equal(report.strategyResearchHandoff.canAuthorizeLiveStartup, false);
    assert.equal(report.strategyResearchHandoff.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.strategyResearchHandoff.bestChallengerMarket, "KRW-QUALITY");
    assert.equal(report.strategyResearchHandoff.bestChallengerComparisonCarryBps, 118.25);
    assert.equal(report.strategyResearchHandoff.deltaToCurrentFocusComparisonBps, 42);
    assert.deepEqual(report.strategyResearchHandoff.requiredBeforeFocusSwitch, [
      "latestWindowSampleQuality",
      "opportunityObserverCoverage",
    ]);
	    assert.equal(report.strategyResearchHandoff.bestChallengerLiveReadiness.market, "KRW-QUALITY");
	    assert.equal(report.strategyResearchHandoff.bestChallengerLiveReadiness.liveReady, false);
	    assert.deepEqual(report.strategyResearchHandoff.bestChallengerLiveReadiness.blockers, [
	      "insufficientObservations",
	      "insufficientObservationSpan",
	      "feeScheduleUnconfirmed",
	      "market:KRW-QUALITY:notMetricCandidate",
	      "market:KRW-QUALITY:requires:spreadControl",
	    ]);
	    assert.deepEqual(
	      report.strategyResearchHandoff.bestChallengerLiveReadiness.requiredBeforeMetricCandidate,
	      ["spreadControl"],
    );
    assert.equal(
      report.strategyResearchHandoff.bestChallengerLiveReadiness.action,
      "keep_challenger_research_only_until_live_readiness_clears",
    );
    assert.match(
      report.strategyResearchHandoff.bestChallengerLiveReadiness.interpretation,
      /cannot authorize live startup/,
    );
	    assert.deepEqual(report.strategyResearchHandoff.requiredBeforeChallengerLiveStartup, [
	      "spreadControl",
	      "insufficientObservations",
	      "insufficientObservationSpan",
	      "feeScheduleUnconfirmed",
	      "market:KRW-QUALITY:notMetricCandidate",
	      "market:KRW-QUALITY:requires:spreadControl",
	      "challengerLiveReadiness",
	    ]);
    assert.equal(
      report.strategyResearchHandoff.latestFeeStressWindowComparison.sampleQualityPasses,
      false,
    );
    assert.equal(
      report.strategyResearchHandoff.latestFeeStressWindowComparison.bestChallengerLatestWindowSampleCount,
      10,
    );
    assert.equal(
      report.strategyResearchHandoff.verificationCommands.refreshOpportunityFeeStressCommand,
      "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.reason,
      "best_challenger_beats_current_focus_after_basic_quality_gates",
    );
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.currentFocusMedianNetCarryBps, 111.159666);
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.currentFocusComparisonCarryBps, 76.25);
	    assert.equal(report.strategyDecisionView.challengerSwitchDecision.bestChallengerMarket, "KRW-QUALITY");
	    assert.equal(report.strategyDecisionView.challengerSwitchDecision.bestChallengerMedianNetCarryBps, 120.5);
	    assert.equal(report.strategyDecisionView.challengerSwitchDecision.bestChallengerComparisonCarryBps, 118.25);
	    assert.equal(
	      report.strategyDecisionView.challengerSwitchDecision.bestChallengerSelectionScope,
	      "best_quality_cleared_challenger",
	    );
	    assert.equal(
	      report.strategyDecisionView.challengerSwitchDecision.comparisonScope,
	      "quality_cleared_challengers_preferred_over_raw_carry_rank",
	    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.bestChallengerComparisonCarrySource,
      "fee_stress_funding_window_median",
    );
    assert.deepEqual(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.currentFocusLatestWindow,
      {
        fundingSettledAt: "2026-05-14T04:00:00.000Z",
        sampleCount: 2,
        medianNetCarryBps: 64.5,
        medianEstimatedNetPnlKrw: 3225,
      },
    );
    assert.deepEqual(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.bestChallengerLatestWindow,
      {
        fundingSettledAt: "2026-05-14T04:00:00.000Z",
        sampleCount: 10,
        medianNetCarryBps: 125.5,
        medianEstimatedNetPnlKrw: 6275,
      },
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.deltaToCurrentFocusBps,
      61,
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.bestChallengerBeatsCurrentFocus,
      true,
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.action,
      "collect_latest_window_samples_before_recompare",
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.sampleQualityPasses,
      false,
    );
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.deltaToCurrentFocusBps, 9.340333999999999);
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.deltaToCurrentFocusComparisonBps, 42);
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.challengerExecutionEligibleRate, 0.9);
	    assert.equal(report.strategyDecisionView.challengerSwitchDecision.challengerQualityPasses, true);
	    assert.deepEqual(report.strategyDecisionView.challengerSwitchDecision.challengerKnownQualityFailureReasons, []);
	    assert.equal(report.strategyDecisionView.challengerSwitchDecision.challengerBeatsCurrentFocus, true);
	    assert.equal(report.strategyDecisionView.challengerSwitchDecision.bestOverallChallengerBeatsCurrentFocus, true);
	    assert.equal(
	      report.strategyDecisionView.challengerSwitchDecision.bestQualityClearedChallengerBeatsCurrentFocus,
	      true,
	    );
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.bestOverallChallenger.market, "KRW-LOWEXEC");
    assert.deepEqual(report.strategyDecisionView.challengerSwitchDecision.bestOverallChallenger.knownQualityFailureReasons, [
      "executionEligibleRateBelowSwitchThreshold",
    ]);
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.bestQualityClearedChallenger.market, "KRW-QUALITY");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].market, "KRW-DEEP");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].evaluationStatus, "do_not_switch");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].medianNetCarryBps, 24.9);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].feeStressMedianNetCarryBps, 24.8);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].comparisonCarryBps, 24.9);
    assert.equal(
      report.strategyDecisionView.autonomousChallengerChecks[0].comparisonCarrySource,
      "execution_eligible_sample_median",
    );
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].deltaToCurrentFocusComparisonBps, -51.35);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].qualityStatus, "quality_incomplete");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].qualityPasses, false);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].beatsCurrentFocus, false);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[0].hasEnoughFundingWindows, false);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[0].knownQualityFailureReasons, []);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[0].evaluationReasons, [
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].market, "KRW-H");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].decision, "reject_or_demote_fee_stress_failed");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].evaluationStatus, "do_not_switch");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].medianNetCarryBps, -12.5);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].feeStressMedianNetCarryBps, -34.5);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].qualityStatus, "quality_blocked");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].qualityPasses, false);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].beatsCurrentFocus, false);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[1].hasEnoughFundingWindows, false);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[1].knownQualityFailureReasons, [
      "positiveRateBelowSwitchThreshold",
      "feeStressFailed",
    ]);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[1].evaluationReasons, [
      "medianNetCarryBelowSwitchThreshold",
      "feeStressCarryBelowSwitchThreshold",
      "positiveRateBelowSwitchThreshold",
      "feeStressFailed",
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
      "decisionRejectedOrDemoted",
    ]);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].market, "KRW-SAHARA");
    assert.equal(
      report.strategyDecisionView.autonomousChallengerChecks[2].decision,
      "continue_until_metric_requirements_clear",
    );
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].evaluationStatus, "do_not_switch");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].medianNetCarryBps, 30.5);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].feeStressMedianNetCarryBps, 9.5);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].qualityStatus, "quality_cleared");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].qualityPasses, true);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].beatsCurrentFocus, false);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[2].hasEnoughFundingWindows, false);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[2].knownQualityFailureReasons, []);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[2].evaluationReasons, [
      "feeStressCarryBelowSwitchThreshold",
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].market, "KRW-CYS");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].decision, "reject_or_demote");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].evaluationStatus, "do_not_switch");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].medianNetCarryBps, 120.22);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].feeStressMedianNetCarryBps, 98.98);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].comparisonCarryBps, 120.22);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].deltaToCurrentFocusComparisonBps, 43.97);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].qualityStatus, "quality_blocked");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].qualityPasses, false);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].beatsCurrentFocus, true);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[3].hasEnoughFundingWindows, false);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[3].knownQualityFailureReasons, [
      "executionEligibleRateBelowSwitchThreshold",
    ]);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[3].evaluationReasons, [
      "executionEligibleRateBelowSwitchThreshold",
      "insufficientFeeStressFundingWindowsForSwitch",
      "decisionRejectedOrDemoted",
    ]);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[4].market, "KRW-ICP");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[4].decision, "reject_or_demote_fee_stress_failed");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[4].evaluationStatus, "do_not_switch");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[4].medianNetCarryBps, 29.95);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[4].feeStressMedianNetCarryBps, 8.9);
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[4].qualityStatus, "quality_blocked");
    assert.equal(report.strategyDecisionView.autonomousChallengerChecks[4].qualityPasses, false);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[4].knownQualityFailureReasons, [
      "feeStressFailed",
    ]);
    assert.deepEqual(report.strategyDecisionView.autonomousChallengerChecks[4].evaluationReasons, [
      "feeStressCarryBelowSwitchThreshold",
      "feeStressFailed",
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
      "decisionRejectedOrDemoted",
    ]);
    const autonomousChallengerChecksByMarket = new Map(
      report.strategyDecisionView.autonomousChallengerChecks.map((check) => [check.market, check]),
    );
    const nilCheck = autonomousChallengerChecksByMarket.get("KRW-NIL");
    assert.ok(nilCheck);
    assert.equal(nilCheck.evaluationStatus, "do_not_switch");
    assert.equal(nilCheck.medianNetCarryBps, 40.25);
    assert.equal(nilCheck.feeStressMedianNetCarryBps, 46.05);
    assert.equal(nilCheck.comparisonCarryBps, 40.25);
    assert.equal(nilCheck.deltaToCurrentFocusComparisonBps, -36);
    assert.equal(nilCheck.qualityStatus, "quality_cleared");
    assert.deepEqual(nilCheck.evaluationReasons, [
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    const aztecCheck = autonomousChallengerChecksByMarket.get("KRW-AZTEC");
    assert.ok(aztecCheck);
    assert.equal(aztecCheck.evaluationStatus, "do_not_switch");
    assert.equal(aztecCheck.medianNetCarryBps, 36.96);
    assert.equal(aztecCheck.feeStressMedianNetCarryBps, 36.96);
    assert.equal(aztecCheck.qualityStatus, "quality_cleared");
    assert.deepEqual(aztecCheck.evaluationReasons, [
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    const partiCheck = autonomousChallengerChecksByMarket.get("KRW-PARTI");
    assert.ok(partiCheck);
    assert.equal(partiCheck.evaluationStatus, "do_not_switch");
    assert.equal(partiCheck.medianNetCarryBps, 53.2);
    assert.equal(partiCheck.feeStressMedianNetCarryBps, 53.19);
    assert.equal(partiCheck.qualityStatus, "quality_blocked");
    assert.deepEqual(partiCheck.evaluationReasons, [
      "positiveRateBelowSwitchThreshold",
      "executionEligibleRateBelowSwitchThreshold",
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    const aktCheck = autonomousChallengerChecksByMarket.get("KRW-AKT");
    assert.ok(aktCheck);
    assert.equal(aktCheck.evaluationStatus, "do_not_switch");
    assert.equal(aktCheck.medianNetCarryBps, 55.5);
    assert.equal(aktCheck.feeStressMedianNetCarryBps, null);
    assert.equal(aktCheck.qualityStatus, "quality_incomplete");
    assert.deepEqual(aktCheck.evaluationReasons, [
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    const arpaCheck = autonomousChallengerChecksByMarket.get("KRW-ARPA");
    assert.ok(arpaCheck);
    assert.equal(arpaCheck.evaluationStatus, "do_not_switch");
    assert.equal(arpaCheck.medianNetCarryBps, null);
    assert.equal(arpaCheck.feeStressMedianNetCarryBps, null);
    assert.equal(arpaCheck.qualityStatus, "quality_blocked");
    assert.deepEqual(arpaCheck.evaluationReasons, [
      "executionEligibleRateBelowSwitchThreshold",
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    assert.equal(report.strategyDecisionView.challengerObservationCoverage.opportunityObservationCovered, false);
    assert.equal(
      report.strategyDecisionView.challengerObservationCoverage.opportunityObserverConfiguredForMissingMarkets,
      false,
    );
    assert.equal(
      report.strategyDecisionView.challengerObservationCoverage.action,
      "add_missing_markets_to_opportunity_observer",
    );
    assert.deepEqual(report.strategyDecisionView.challengerObservationCoverage.missingOpportunityObservation, [
      {
        market: "KRW-MON",
        symbol: "MONUSDT",
        sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 50.25,
        },
        configuredInOpportunityObserver: false,
        requiredAction: "add_to_spot_perp_carry_opportunity_72h_observer",
      },
    ]);
    assert.equal(report.researchFocus.market, "KRW-PIEVERSE");
    assert.equal(report.researchFocus.usableForLivePromotion, false);
    assert.equal(report.researchSourceFreshness.observationCount, 172);
    assert.equal(report.researchSourceFreshness.liveGoalObservationCount, 171);
    assert.equal(report.researchSourceFreshness.observationCountDelta, 1);
    assert.equal(report.researchSourceFreshness.completedFundingCount, 3);
    assert.equal(report.researchSourceFreshness.sourceNewerThanLiveGoal, true);
    assert.equal(report.researchSourceFreshness.liveGoalMayLagResearchSource, true);
    assert.equal(report.priorityAction.track, "spot_perp_carry_watchlist");
    assert.equal(report.priorityAction.readinessTimeline.bottleneck, "observationSpanMinutes");
    assert.ok(report.priorityAction.requiredEvidenceBeforeLive.includes("insufficientObservations"));
    assert.equal(report.readinessProgress.readinessGap.observations.current, 171);
    assert.equal(report.readinessProgress.readinessGap.observations.required, 432);
    assert.equal(report.readinessProgress.readinessGap.observations.remaining, 261);
    assert.equal(report.readinessProgress.readinessGap.observations.passed, false);
    assert.equal(report.readinessProgress.readinessTimeline.bottleneck, "observationSpanMinutes");
    assert.equal(report.readinessProgress.readinessTimeline.estimatedEarliestReviewAt, "2026-05-16T18:29:28.748Z");
    assert.equal(report.readinessProgress.usableForLivePromotion, false);
    assert.deepEqual(report.readinessProgress.evidenceCollectionStillRequired, [
      "insufficientObservations",
      "insufficientObservationSpan",
      "insufficientCompletedFundingEvents",
    ]);
	    assert.equal(report.processAlignment.aligned, true);
	    assert.equal(report.processAlignment.violationCount, 0);
	    assert.equal(report.processAlignment.processCount, 15);
	    assert.equal(report.processAlignment.onlineCount, 2);
	    assert.equal(report.processAlignment.waitingRestartCount, 13);
	    assert.equal(report.processAlignment.expectedLoopingObserverCount, 12);
	    assert.equal(report.processAlignment.unstableRestartProcessCount, 0);
	    assert.equal(report.processAlignment.maxRestartDelayMs, 600000);
	    assert.equal(report.processAlignment.processHealth.onlineCount, 2);
	    assert.equal(report.processAlignment.processHealth.waitingRestartCount, 13);
	    assert.equal(report.processAlignment.processHealth.expectedLoopingObserverCount, 12);
	    assert.equal(report.processAlignment.processHealth.unstableRestartProcessCount, 0);
    assert.equal(report.processAlignment.processHealth.maxRestartDelayMs, 600000);
    assert.equal(report.operationalReadiness.liveReady, false);
    assert.equal(report.operationalReadiness.checks.operationalProofPresent, true);
    assert.equal(report.operationalReadiness.checks.accountFeesConfirmed, false);
    assert.deepEqual(report.operationalReadiness.operationalProof.missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(report.operationalReadiness.operationalProof.deficits.bithumbQuoteDeficitKrw, 500200);
    assert.equal(report.operationalReadiness.operationalProof.deficits.binanceUsdtDeficit, 337.209302);
    assert.equal(
      report.operationalReadiness.operationalProof.feeBudget.carryReportPath,
      "var/reports/spot-perp-carry-pieverse-72h-latest.json",
    );
    assert.deepEqual(report.operationalReadiness.operationalProof.feeBudget.feeBudgetReportPaths, [
      "var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json",
    ]);
    assert.equal(report.operationalReadiness.operationalProof.feeBudget.maxBithumbFeeBps, 25);
    assert.equal(report.operationalReadiness.operationalProof.feeBudget.maxBinanceFuturesTakerFeeBps, 5);
    assert.equal(report.operatorLiveReadinessHandoff.status, "operator_prerequisites_required");
    assert.equal(report.operatorLiveReadinessHandoff.canStartLiveWithoutOperatorInput, false);
    assert.equal(report.operatorLiveReadinessHandoff.privateDataRequired, true);
    assert.deepEqual(report.operatorLiveReadinessHandoff.requiredBeforeLiveReview, [
      "operationalProof:credentialsMissing",
    ]);
    assert.deepEqual(report.operatorLiveReadinessHandoff.missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(report.operatorLiveReadinessHandoff.deficits.bithumbQuoteDeficitKrw, 500200);
    assert.equal(report.operatorLiveReadinessHandoff.deficits.binanceUsdtDeficit, 337.209302);
    assert.equal(report.operatorLiveReadinessHandoff.feeBudget.maxBithumbFeeBps, 25);
    assert.deepEqual(
      report.operatorLiveReadinessHandoff.operatorBlockerEvidence.map((item) => item.blocker),
      ["operationalProof:credentialsMissing"],
    );
    assert.equal(report.operatorLiveReadinessHandoff.operatorBlockerEvidence[0].active, true);
    assert.deepEqual(report.operatorLiveReadinessHandoff.operatorBlockerEvidence[0].missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(
      report.operatorLiveReadinessHandoff.operatorBlockerEvidence[0].operatorAction?.action,
      "refresh_operational_proof_with_credentials",
    );
    assert.deepEqual(
      report.operatorLiveReadinessHandoff.operatorActions.map((step) => step.action),
      ["refresh_operational_proof_with_credentials"],
    );
    assert.deepEqual(report.operatorLiveReadinessHandoff.operatorActions[0].missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
	    assert.equal(
	      report.operatorLiveReadinessHandoff.verificationCommands.reviewCommand,
	      null,
	    );
    assert.equal(
      report.operatorLiveReadinessHandoff.verificationCommands.gateCommand,
      "npm run dry-run:gate-live-goal-ready",
    );
	    assert.equal(
	      report.operatorLiveReadinessHandoff.verificationCommands.pm2StartCommandAfterAllGatesPass,
	      null,
	    );
	    assert.deepEqual(report.operatorLiveReadinessHandoff.blockedCommands, {
	      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
	      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
	      reason:
	        "Current focus is deteriorating and a challenger beat it in the latest fee-stressed funding window, but latest-window samples are still too thin for a switch review.",
	    });
	    assert.deepEqual(report.operatorLiveReadinessHandoff.hardStops, [
	      "Do not run the PM2 live command while liveReady is false.",
		      "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.",
	    ]);
    assert.deepEqual(report.nextWorkClassification.autonomousEvidenceCollection, [
      "insufficientObservations",
      "insufficientObservationSpan",
      "insufficientCompletedFundingEvents",
      "latestWindowSampleQuality",
      "opportunityObserverCoverage",
    ]);
    assert.deepEqual(report.nextWorkClassification.liveOperationalPrerequisites, [
      "operationalProof:credentialsMissing",
    ]);
    assert.deepEqual(report.nextWorkClassification.marketConditionBlockers, [
      "currentEntryReportMissing",
      "selectedFocusMissingFromCurrentEntrySnapshot",
      "currentEntryTimestampMissing",
      "selectedFocusCurrentEntryCarryMissing",
    ]);
    assert.deepEqual(report.nextWorkClassification.processWork, []);
    assert.equal(report.nextWorkClassification.canContinueAutonomously, true);
    assert.equal(report.nextWorkClassification.canStartLiveWithoutOperatorInput, false);
    assert.equal(
      report.nextWorkClassification.recommendedAutonomousAction,
      "add_missing_challengers_to_opportunity_observer_and_refresh_live_goal_status",
    );
    assert.equal(
      report.nextWorkClassification.strategyEvidencePriority,
      "challenger_opportunity_observation_gap",
    );
    assert.equal(report.nextWorkClassification.priorityMarket, "KRW-MON");
    assert.match(report.nextWorkClassification.priorityReason, /discovery snapshots/);
    assert.deepEqual(
      report.nextWorkClassification.priorityOpportunityObservationEvidence.firstMissingMarket,
      {
        market: "KRW-MON",
        symbol: "MONUSDT",
        sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
        executionEligibleMedianNetCarryBps: 50.25,
        executionEligiblePositiveRate: null,
        completedFundingWindowCount: 1,
        medianWindowNetCarryBps: null,
        medianWindowEstimatedNetPnlKrw: null,
      },
    );
    assert.equal(
      report.nextWorkClassification.priorityOpportunityObservationEvidence.evidenceAction,
      "add_missing_challengers_to_spot_perp_carry_opportunity_observer",
    );
    assert.equal(
      report.nextWorkClassification.recommendedLiveAction,
      "keep_current_focus_live_startup_blocked_until_recompare_clears",
    );
	    assert.deepEqual(report.nextAutonomousWork, [
	      "insufficientObservations",
	      "insufficientObservationSpan",
	      "insufficientCompletedFundingEvents",
	      "latestWindowSampleQuality",
	      "opportunityObserverCoverage",
	    ]);
    const opportunityCoverageEvidence =
      report.autonomousEvidenceHandoff.autonomousBlockerEvidence.find(
        (item) => item.blocker === "opportunityObserverCoverage",
      );
    assert.ok(opportunityCoverageEvidence);
    assert.equal(opportunityCoverageEvidence.opportunityObservationCovered, false);
    assert.equal(opportunityCoverageEvidence.opportunityObserverConfiguredForMissingMarkets, false);
    assert.equal(
      opportunityCoverageEvidence.requiredAction,
      "add_missing_markets_to_opportunity_observer",
    );
    assert.deepEqual(opportunityCoverageEvidence.missingOpportunityObservation, [
      {
        market: "KRW-MON",
        symbol: "MONUSDT",
        sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 50.25,
        },
        configuredInOpportunityObserver: false,
        requiredAction: "add_to_spot_perp_carry_opportunity_72h_observer",
      },
    ]);
    assert.equal(report.checkpointPlan.status, "run_full_live_goal_refresh_for_completed_funding_window");
    assert.equal(report.checkpointPlan.shouldStartLive, false);
    assert.equal(report.checkpointPlan.shouldRunHeavyRefreshNow, true);
    assert.equal(report.checkpointPlan.nextReviewAt, "2026-05-14T08:30:00.000Z");
    assert.equal(report.checkpointPlan.nextReviewAtKst, "2026-05-14 17:30:00 KST");
    assert.equal(typeof report.checkpointPlan.nextReviewDelayMinutes, "number");
    assert.equal(report.checkpointPlan.nextReviewOverdue, true);
    assert.equal(report.checkpointPlan.nextReviewTrigger, "next_completed_fee_stressed_funding_window");
    assert.equal(report.checkpointPlan.recommendedAutonomousAction, "run_full_live_goal_refresh_now");
    const checkpointOutputPath = join(directory, "checkpoint-output.json");
    const checkpointOnlyResult = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
        "--output",
        checkpointOutputPath,
        "--checkpoint-only",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(checkpointOnlyResult.status, 0, checkpointOnlyResult.stderr);
	    const checkpointOnlyReport = JSON.parse(checkpointOnlyResult.stdout) as {
	      failedCompletionCriteria: string[];
      sourceCompletionAuditSummary: {
        failedCompletionCriteria: string[];
        failedCriteriaIdsMatch: boolean | null;
        missingRequirementCountMatches: boolean | null;
      };
      completionAuditScopeComparison: {
        sourceMissingRequirementCount: number;
        derivedMissingRequirementCount: number;
        countsMatch: boolean;
        addedBySummary: string[];
      };
	      missingRequirements: string[];
	      missingRequirementCount: number;
	      missingRequirementClassification: Record<string, string[]>;
	      missingRequirementClassificationCounts: Record<string, number>;
      outstandingWorkCounts: Record<string, number>;
      nextMarketConditionWork: string[];
      checkpointPlan: { status: string; nextReviewAtKst: string };
      goalCompletionAuditView?: unknown;
      strategyDecisionView?: unknown;
      strategyResearchHandoff?: { status: string; canAuthorizeLiveStartup: boolean };
    };
    assert.deepEqual(checkpointOnlyReport.failedCompletionCriteria, [
      "live_candidate_selected",
      "profitability_evidence_satisfied",
      "live_startup_gate_allowed",
      "operational_readiness_complete",
      "no_current_focus_recompare_caution",
	      "current_entry_sanity_clear",
	      "no_missing_requirements",
	    ]);
    assert.deepEqual(checkpointOnlyReport.sourceCompletionAuditSummary.failedCompletionCriteria, [
      "profitability_evidence_satisfied",
      "current_entry_sanity_clear",
    ]);
    assert.equal(checkpointOnlyReport.sourceCompletionAuditSummary.failedCriteriaIdsMatch, true);
    assert.equal(checkpointOnlyReport.sourceCompletionAuditSummary.missingRequirementCountMatches, true);
    assert.equal(checkpointOnlyReport.completionAuditScopeComparison.sourceMissingRequirementCount, 2);
    assert.equal(checkpointOnlyReport.completionAuditScopeComparison.derivedMissingRequirementCount, 9);
    assert.equal(checkpointOnlyReport.completionAuditScopeComparison.countsMatch, false);
    assert.deepEqual(checkpointOnlyReport.completionAuditScopeComparison.addedBySummary, [
      "spotPerpCarryCurrentEntrySanity",
      "spotPerpCarryCurrentEntry:currentEntryReportMissing",
      "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
      "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
      "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
      "spotPerpCarryResearchFocus:latestWindowSampleQuality",
      "spotPerpCarryResearchFocus:opportunityObserverCoverage",
    ]);
	    assert.deepEqual(checkpointOnlyReport.missingRequirements, [
	      "spotPerpCarryWatchObservationSpan",
	      "spotPerpCarryLiveReadiness",
	      "spotPerpCarryCurrentEntrySanity",
	      "spotPerpCarryCurrentEntry:currentEntryReportMissing",
	      "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
	      "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
	      "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
	      "spotPerpCarryResearchFocus:latestWindowSampleQuality",
	      "spotPerpCarryResearchFocus:opportunityObserverCoverage",
	    ]);
	    assert.equal(checkpointOnlyReport.missingRequirementCount, 9);
	    assert.deepEqual(checkpointOnlyReport.missingRequirementClassification, {
	      autonomousEvidence: [
	        "spotPerpCarryWatchObservationSpan",
	        "spotPerpCarryResearchFocus:latestWindowSampleQuality",
	        "spotPerpCarryResearchFocus:opportunityObserverCoverage",
	      ],
	      operatorPrerequisites: [],
	      marketConditions: [
	        "spotPerpCarryCurrentEntrySanity",
	        "spotPerpCarryCurrentEntry:currentEntryReportMissing",
	        "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
	        "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
	        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
	      ],
	      liveReadinessGates: ["spotPerpCarryLiveReadiness"],
	      other: [],
    });
    assert.deepEqual(checkpointOnlyReport.missingRequirementClassificationCounts, {
	      autonomousEvidence: 3,
	      operatorPrerequisites: 0,
	      marketConditions: 5,
	      liveReadinessGates: 1,
	      other: 0,
	    });
	    assert.deepEqual(checkpointOnlyReport.outstandingWorkCounts, {
	      autonomousEvidence: 5,
	      operatorWork: 1,
	      marketConditionWork: 4,
	    });
	    assert.deepEqual(checkpointOnlyReport.nextMarketConditionWork, [
	      "currentEntryReportMissing",
	      "selectedFocusMissingFromCurrentEntrySnapshot",
	      "currentEntryTimestampMissing",
	      "selectedFocusCurrentEntryCarryMissing",
	    ]);
    assert.equal(checkpointOnlyReport.checkpointPlan.status, "run_full_live_goal_refresh_for_completed_funding_window");
    assert.equal(checkpointOnlyReport.checkpointPlan.nextReviewAtKst, "2026-05-14 17:30:00 KST");
    assert.equal(checkpointOnlyReport.strategyResearchHandoff?.status, "research_focus_recompare_required");
    assert.equal(checkpointOnlyReport.strategyResearchHandoff?.canAuthorizeLiveStartup, false);
    assert.equal(checkpointOnlyReport.goalCompletionAuditView, undefined);
    assert.equal(checkpointOnlyReport.strategyDecisionView, undefined);
    assert.equal(JSON.parse(readFileSync(checkpointOutputPath, "utf8")).goalCompletionAuditView.achieved, false);
    assert.deepEqual(report.nextOperatorWork, ["operationalProof:credentialsMissing"]);
	    assert.deepEqual(report.nextMarketConditionWork, [
	      "currentEntryReportMissing",
	      "selectedFocusMissingFromCurrentEntrySnapshot",
	      "currentEntryTimestampMissing",
	      "selectedFocusCurrentEntryCarryMissing",
	    ]);
    assert.deepEqual(report.nextRequiredOperatorWork, ["operationalProof:credentialsMissing"]);
    assert.equal(report.goalCompletionAuditView.achieved, false);
    const completionCriteria = new Map(
      report.goalCompletionAuditView.successCriteria.map((criterion) => [criterion.id, criterion]),
    );
    assert.equal(completionCriteria.get("live_candidate_selected")?.passed, false);
    assert.equal(completionCriteria.get("profitability_evidence_satisfied")?.passed, false);
    assert.equal(completionCriteria.get("live_startup_gate_allowed")?.passed, false);
    assert.equal(completionCriteria.get("operational_readiness_complete")?.passed, false);
    assert.deepEqual(
      completionCriteria.get("operational_readiness_complete")?.evidence.operationalProof,
      {
        generatedAt: "2026-05-14T01:57:28.000Z",
        accountFeesConfirmed: false,
        inventoryReady: false,
        hedgeVenueReady: false,
        missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
        reasons: ["credentialsMissing"],
        requirements: {
          totalSpotQuoteRequiredKrw: 500200,
          totalFuturesMarginRequiredUsdt: 337.209302,
        },
        deficits: {
          bithumbQuoteDeficitKrw: 500200,
          binanceUsdtDeficit: 337.209302,
        },
        feeBudget: {
          carryReportPath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
          feeBudgetReportPaths: [
            "var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json",
          ],
          maxBithumbFeeBps: 25,
          maxBinanceFuturesTakerFeeBps: 5,
        },
      },
    );
    assert.equal(completionCriteria.get("process_alignment_clean")?.passed, true);
    assert.equal(completionCriteria.get("no_current_focus_recompare_caution")?.passed, false);
    assert.equal(completionCriteria.get("no_missing_requirements")?.passed, false);
	    assert.deepEqual(
	      completionCriteria.get("no_missing_requirements")?.evidence.outstandingAutonomousEvidence,
	      [
	        "insufficientObservations",
	        "insufficientObservationSpan",
	        "insufficientCompletedFundingEvents",
	        "latestWindowSampleQuality",
	        "opportunityObserverCoverage",
	      ],
	    );
    assert.deepEqual(
      completionCriteria.get("no_missing_requirements")?.evidence.outstandingOperatorWork,
      ["operationalProof:credentialsMissing"],
    );
	    assert.deepEqual(
	      completionCriteria.get("no_missing_requirements")?.evidence.outstandingMarketConditionWork,
	      [
	        "currentEntryReportMissing",
	        "selectedFocusMissingFromCurrentEntrySnapshot",
	        "currentEntryTimestampMissing",
	        "selectedFocusCurrentEntryCarryMissing",
	      ],
	    );
	    assert.deepEqual(
	      completionCriteria.get("no_missing_requirements")?.evidence.missingRequirementClassification,
	      {
	        autonomousEvidence: [
	          "spotPerpCarryWatchObservationSpan",
	          "spotPerpCarryResearchFocus:latestWindowSampleQuality",
	          "spotPerpCarryResearchFocus:opportunityObserverCoverage",
	        ],
	        operatorPrerequisites: [],
	        marketConditions: [
	          "spotPerpCarryCurrentEntrySanity",
	          "spotPerpCarryCurrentEntry:currentEntryReportMissing",
	          "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
	          "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
	          "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
	        ],
	        liveReadinessGates: ["spotPerpCarryLiveReadiness"],
	        other: [],
	      },
    );
    assert.deepEqual(report.completionAuditSummary, {
      achieved: false,
      failedCompletionCriteria: [
        "live_candidate_selected",
        "profitability_evidence_satisfied",
        "live_startup_gate_allowed",
        "operational_readiness_complete",
        "no_current_focus_recompare_caution",
        "current_entry_sanity_clear",
        "no_missing_requirements",
      ],
	      missingRequirements: [
	        "spotPerpCarryWatchObservationSpan",
	        "spotPerpCarryLiveReadiness",
	        "spotPerpCarryCurrentEntrySanity",
	        "spotPerpCarryCurrentEntry:currentEntryReportMissing",
	        "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
	        "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
	        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
	        "spotPerpCarryResearchFocus:latestWindowSampleQuality",
	        "spotPerpCarryResearchFocus:opportunityObserverCoverage",
	      ],
	      missingRequirementCount: 9,
	      missingRequirementClassification: {
	        autonomousEvidence: [
	          "spotPerpCarryWatchObservationSpan",
	          "spotPerpCarryResearchFocus:latestWindowSampleQuality",
	          "spotPerpCarryResearchFocus:opportunityObserverCoverage",
	        ],
	        operatorPrerequisites: [],
	        marketConditions: [
	          "spotPerpCarryCurrentEntrySanity",
	          "spotPerpCarryCurrentEntry:currentEntryReportMissing",
	          "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
	          "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
	          "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
	        ],
	        liveReadinessGates: ["spotPerpCarryLiveReadiness"],
	        other: [],
	      },
      missingRequirementClassificationCounts: {
	        autonomousEvidence: 3,
	        operatorPrerequisites: 0,
	        marketConditions: 5,
	        liveReadinessGates: 1,
	        other: 0,
	      },
		      outstandingWorkCounts: {
		        autonomousEvidence: 5,
		        operatorWork: 1,
		        marketConditionWork: 4,
		      },
	    });
    const promptChecklist = new Map(
      report.goalCompletionAuditView.promptToArtifactChecklist.map((item) => [item.id, item]),
    );
    assert.equal(promptChecklist.get("profitable_research_candidate_identified")?.status, "partial");
    assert.deepEqual(promptChecklist.get("profitable_research_candidate_identified")?.evidence, {
      selectedResearchMarket: "KRW-PIEVERSE",
      profitabilityStatus: "estimated_carry_only",
      realizedEvidenceAvailable: false,
      estimatedMedianNetCarryBps: 111.159666,
      feeStressMedianNetCarryBps: null,
    });
    assert.equal(promptChecklist.get("loss_paths_rejected_or_not_promoted")?.status, "passed");
    assert.deepEqual(promptChecklist.get("loss_paths_rejected_or_not_promoted")?.artifactPaths, [
      "var/reports/live-goal-progress-summary-latest.json",
    ]);
    assert.equal(promptChecklist.get("autonomous_challenger_search_active")?.status, "passed");
    assert.equal(promptChecklist.get("subagent_current_analysis_handoff_reflected")?.status, "passed");
    assert.equal(
      promptChecklist.get("subagent_current_analysis_handoff_reflected")?.evidence.canAuthorizeLiveStartup,
      false,
    );
    assert.deepEqual(
      promptChecklist.get("subagent_current_analysis_handoff_reflected")?.artifactPaths,
      ["var/reports/live-goal-progress-summary-latest.json"],
    );
    assert.equal(promptChecklist.get("completion_audit_scope_reconciled")?.status, "passed");
    assert.deepEqual(promptChecklist.get("completion_audit_scope_reconciled")?.artifactPaths, [
      "var/reports/live-goal-progress-summary-latest.json",
      "var/reports/live-goal-refresh-due-latest.json",
    ]);
    assert.deepEqual(promptChecklist.get("completion_audit_scope_reconciled")?.evidence, {
      sourceMissingRequirementCount: 2,
      derivedMissingRequirementCount: 9,
      countsMatch: false,
      addedBySummary: [
        "spotPerpCarryCurrentEntrySanity",
        "spotPerpCarryCurrentEntry:currentEntryReportMissing",
        "spotPerpCarryCurrentEntry:selectedFocusMissingFromCurrentEntrySnapshot",
        "spotPerpCarryCurrentEntry:currentEntryTimestampMissing",
        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryMissing",
        "spotPerpCarryResearchFocus:latestWindowSampleQuality",
        "spotPerpCarryResearchFocus:opportunityObserverCoverage",
      ],
      missingFromSummary: [],
      scopeInterpretation:
        "The derived progress summary adds live-goal blocker requirements that are not present in the source completion audit.",
    });
    assert.deepEqual(promptChecklist.get("process_control_clean")?.artifactPaths, [
      "var/reports/live-goal-process-alignment-latest.json",
    ]);
    assert.deepEqual(promptChecklist.get("process_control_clean")?.evidence.savedProcessControl, {
      liveGoalObserverPresent: true,
      restartDelayMs: 600000,
      tradingMode: "paper",
      liveExecutionFlag: "false",
      aligned: true,
    });
    assert.equal(promptChecklist.get("checkpoint_plan_recorded")?.status, "passed");
    assert.deepEqual(promptChecklist.get("checkpoint_plan_recorded")?.artifactPaths, [
      "var/reports/live-goal-progress-summary-latest.json",
      "var/reports/live-goal-refresh-due-latest.json",
    ]);
    assert.deepEqual(promptChecklist.get("checkpoint_plan_recorded")?.evidence, {
      status: "run_full_live_goal_refresh_for_completed_funding_window",
      shouldStartLive: false,
      shouldRunHeavyRefreshNow: true,
      nextReviewAt: "2026-05-14T08:30:00.000Z",
      nextReviewAtKst: "2026-05-14 17:30:00 KST",
      nextReviewDelayMinutes: report.checkpointPlan.nextReviewDelayMinutes,
      nextReviewOverdue: true,
      nextReviewTrigger: "next_completed_fee_stressed_funding_window",
      recommendedAutonomousAction: "run_full_live_goal_refresh_now",
	      outstandingAutonomousEvidence: [
	        "insufficientObservations",
	        "insufficientObservationSpan",
	        "insufficientCompletedFundingEvents",
	        "latestWindowSampleQuality",
	        "opportunityObserverCoverage",
	      ],
	      outstandingOperatorWork: ["operationalProof:credentialsMissing"],
	      outstandingMarketConditionWork: [
	        "currentEntryReportMissing",
	        "selectedFocusMissingFromCurrentEntrySnapshot",
	        "currentEntryTimestampMissing",
	        "selectedFocusCurrentEntryCarryMissing",
	      ],
        autonomousEvidenceSufficiency: {
          blocker: "insufficientObservationSpan",
          bottleneck: "observationSpanMinutes",
          earliestReviewAt: "2026-05-16T18:29:28.748Z",
          earliestReviewAtKst: "2026-05-17 03:29:28 KST",
          delayMinutes: report.checkpointPlan.autonomousEvidenceSufficiency?.delayMinutes,
          nextReviewCanCompleteAutonomousEvidence: false,
          interpretation:
            "The next completed funding-window refresh can update latest-window evidence, but the observation-span gate is not expected to be complete yet.",
        },
	      reason:
        "The next completed funding-window checkpoint has passed; run the full live-goal refresh before making another strategy decision.",
    });
    assert.equal(
      promptChecklist.get("autonomous_challenger_search_active")?.command,
      "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness && npm run dry-run:gate-live-goal-ready",
    );
    assert.equal(promptChecklist.get("web_challenger_evaluation_recorded")?.status, "passed");
    assert.deepEqual(promptChecklist.get("web_challenger_evaluation_recorded")?.artifactPaths, [
      "spot-perp-carry-opportunity.json",
      "spot-perp-carry-cys.json",
    ]);
    type WebChallengerMarketEvidence = {
      market: string;
      evaluationStatus: string;
      medianNetCarryBps: number | null;
      feeStressMedianNetCarryBps: number | null;
      evaluationReasons: string[];
    };
    const webChallengerEvidence = promptChecklist.get("web_challenger_evaluation_recorded")?.evidence as
      | {
          requiredMarkets: string[];
          evaluatedMarkets: WebChallengerMarketEvidence[];
        }
      | undefined;
    assert.deepEqual(webChallengerEvidence?.requiredMarkets, [
      "KRW-DEEP",
      "KRW-H",
      "KRW-SAHARA",
      "KRW-CYS",
      "KRW-ICP",
      "KRW-NIL",
      "KRW-AZTEC",
      "KRW-PARTI",
      "KRW-PROMPT",
      "KRW-POLYX",
      "KRW-ETHFI",
      "KRW-AKT",
      "KRW-ARPA",
    ]);
    const webEvaluatedMarkets = new Map(
      webChallengerEvidence?.evaluatedMarkets.map((entry) => [entry.market, entry]),
    );
    assert.deepEqual(webEvaluatedMarkets.get("KRW-H")?.evaluationReasons, [
      "medianNetCarryBelowSwitchThreshold",
      "feeStressCarryBelowSwitchThreshold",
      "positiveRateBelowSwitchThreshold",
      "feeStressFailed",
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
      "decisionRejectedOrDemoted",
    ]);
    assert.deepEqual(webEvaluatedMarkets.get("KRW-CYS")?.evaluationReasons, [
      "executionEligibleRateBelowSwitchThreshold",
      "insufficientFeeStressFundingWindowsForSwitch",
      "decisionRejectedOrDemoted",
    ]);
    assert.equal(webEvaluatedMarkets.get("KRW-PROMPT")?.evaluationStatus, "do_not_switch");
    assert.equal(webEvaluatedMarkets.get("KRW-PROMPT")?.medianNetCarryBps, 72.5);
    assert.equal(webEvaluatedMarkets.get("KRW-PROMPT")?.feeStressMedianNetCarryBps, 52.5);
    assert.deepEqual(webEvaluatedMarkets.get("KRW-PROMPT")?.evaluationReasons, [
      "insufficientFeeStressFundingWindowsForSwitch",
      "doesNotBeatCurrentFocus",
    ]);
    assert.equal(webEvaluatedMarkets.get("KRW-POLYX")?.evaluationStatus, "do_not_switch");
    assert.equal(webEvaluatedMarkets.get("KRW-POLYX")?.medianNetCarryBps, 29.2);
    assert.equal(webEvaluatedMarkets.get("KRW-POLYX")?.feeStressMedianNetCarryBps, 31.2);
    assert.equal(webEvaluatedMarkets.get("KRW-ETHFI")?.evaluationStatus, "do_not_switch");
    assert.equal(webEvaluatedMarkets.get("KRW-ETHFI")?.medianNetCarryBps, 22.9);
    assert.equal(webEvaluatedMarkets.get("KRW-ETHFI")?.feeStressMedianNetCarryBps, 24.9);
    assert.equal(promptChecklist.get("live_startup_method_documented")?.status, "blocked");
    assert.equal(promptChecklist.get("live_startup_method_documented")?.command, "npm run dry-run:gate-live-goal-ready");
    assert.equal(
      promptChecklist.get("live_startup_method_documented")?.gap,
      "current_focus_requires_fee_stressed_challenger_recompare",
    );
    assert.equal(promptChecklist.get("live_readiness_verified")?.status, "blocked");
    assert.equal(promptChecklist.get("live_readiness_verified")?.gap, "operational_or_evidence_gates_still_block_live");
    assert.deepEqual(promptChecklist.get("live_readiness_verified")?.evidence.operationalProof, {
      generatedAt: "2026-05-14T01:57:28.000Z",
      accountFeesConfirmed: false,
      inventoryReady: false,
      hedgeVenueReady: false,
      missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
      reasons: ["credentialsMissing"],
      requirements: {
        totalSpotQuoteRequiredKrw: 500200,
        totalFuturesMarginRequiredUsdt: 337.209302,
      },
      deficits: {
        bithumbQuoteDeficitKrw: 500200,
        binanceUsdtDeficit: 337.209302,
      },
      feeBudget: {
        carryReportPath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
        feeBudgetReportPaths: [
          "var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json",
        ],
        maxBithumbFeeBps: 25,
        maxBinanceFuturesTakerFeeBps: 5,
      },
    });
    assert.equal(promptChecklist.get("process_control_clean")?.status, "passed");
    assert.ok(report.missingRequirements.includes("spotPerpCarryLiveReadiness"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary merges duplicate raw carry blocked candidate rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-raw-carry-dedupe-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveGoal = blockedLiveGoal();
    liveGoal.carryMarketDecisionMatrix = [
      {
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        requiredBeforeMetricCandidate: [],
        metrics: {
          count: 100,
          executionEligibleRate: 0.98,
          executionEligibleMedianNetCarryBps: 40,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        market: "KRW-LOWEXEC",
        symbol: "LOWEXECUSDT",
        requiredBeforeMetricCandidate: ["spreadControl"],
        metrics: {
          count: 10,
          executionEligibleCount: 3,
          executionEligibleMedianNetCarryBps: 140,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        market: "KRW-LOWEXEC",
        symbol: "LOWEXECUSDT",
        requiredBeforeMetricCandidate: ["moreObservations"],
        metrics: {
          count: 10,
          executionEligibleCount: 1,
          executionEligibleMedianNetCarryBps: 150,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        market: "KRW-PROMPT",
        symbol: "PROMPTUSDT",
        requiredBeforeMetricCandidate: ["spreadControl"],
        metrics: {
          count: 10,
          executionEligibleCount: 2,
          executionEligibleMedianNetCarryBps: 120,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
    ];

    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T06:41:30.000Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
    });
    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      strategyDecisionView: {
        reducedActivityGuardrail: {
          rawCarryBlockedCandidates: Array<{
            market: string;
            comparisonCarryBps: number;
            executionEligibleRate: number | null;
            blockedReasons: string[];
            sourceRowCount: number;
          }>;
        };
      };
    };
    const rawCarryBlockedCandidates =
      report.strategyDecisionView.reducedActivityGuardrail.rawCarryBlockedCandidates;
    assert.equal(
      rawCarryBlockedCandidates.filter((candidate) => candidate.market === "KRW-LOWEXEC").length,
      1,
    );
    assert.deepEqual(rawCarryBlockedCandidates[0], {
      market: "KRW-LOWEXEC",
      symbol: "LOWEXECUSDT",
      comparisonCarryBps: 150,
      comparisonCarrySource: "execution_eligible_sample_median",
      executionEligibleRate: 0.1,
      qualityStatus: "quality_blocked",
      knownQualityFailureReasons: ["executionEligibleRateBelowSwitchThreshold"],
      requiredBeforeMetricCandidate: ["spreadControl", "moreObservations"],
      blockedReasons: [
        "executionEligibleRateBelowSwitchThreshold",
        "requires:spreadControl",
        "requires:moreObservations",
      ],
      sourceRowCount: 2,
      action: "do_not_promote_raw_carry_without_quality_gates",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary hydrates challenger readiness snapshots from disk", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-hydrated-readiness-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const qualityReadinessPath = join(directory, "spot-perp-carry-quality-live-readiness-latest.json");
    const liveGoal = blockedLiveGoal();
    liveGoal.carryLiveReadinessReports = [
      {
        path: qualityReadinessPath,
        marketKeys: ["KRW-QUALITY:QUALITYUSDT"],
        generatedAt: "2026-05-14T06:39:00.000Z",
        status: "blocked",
        liveReady: false,
        blockers: ["staleEmbeddedBlocker"],
        readinessGap: {
          observations: { current: 50, required: 432, remaining: 382, passed: false },
        },
      },
    ];

    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T06:41:30.000Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
    });
    writeJson(qualityReadinessPath, {
      generatedAt: "2026-05-14T06:42:00.000Z",
      market: "KRW-QUALITY",
      symbol: "QUALITYUSDT",
      status: "blocked",
      liveReady: false,
      fresh: true,
      blockers: ["freshFileBlocker"],
      readinessGap: {
        observations: { current: 222, required: 432, remaining: 210, passed: true },
        observationSpanMinutes: { current: 1800, required: 4320, remaining: 2520, passed: true },
        completedFundingEvents: { current: 6, required: 6, remaining: 0, passed: true },
      },
      checks: {
        sufficientObservations: true,
        sufficientObservationSpan: true,
        completedFundingEvents: true,
        accountFeesConfirmed: false,
      },
      requiredBeforeMetricCandidate: ["fileSpreadControl"],
      action: "keep_challenger_research_only_until_live_readiness_clears",
      interpretation: "Fresh file readiness snapshot should drive challenger switch safety.",
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      strategyResearchHandoff: {
        bestChallengerLiveReadiness: {
          sourceReadinessPath: string;
          generatedAt: string;
          readinessGap: { observations: { current: number } };
          checks: { sufficientObservations: boolean };
          blockers: string[];
          requiredBeforeMetricCandidate: string[];
        };
      };
    };
    const readiness = report.strategyResearchHandoff.bestChallengerLiveReadiness;
    assert.equal(readiness.sourceReadinessPath, qualityReadinessPath);
    assert.equal(readiness.generatedAt, "2026-05-14T06:42:00.000Z");
    assert.equal(readiness.readinessGap.observations.current, 222);
    assert.equal(readiness.checks.sufficientObservations, true);
    assert.deepEqual(readiness.blockers, ["freshFileBlocker"]);
    assert.deepEqual(readiness.requiredBeforeMetricCandidate, ["fileSpreadControl"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary ignores mismatched switch-plan challenger readiness", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-mismatched-readiness-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const aztecReadinessPath = join(directory, "spot-perp-carry-aztec-live-readiness-latest.json");
    const liveGoal = blockedLiveGoal();
    liveGoal.switchPlan = {
      bestChallengerLiveReadiness: {
        market: "KRW-NIL",
        symbol: "NILUSDT",
        status: "blocked",
        liveReady: false,
        sourceReadinessPath: "var/reports/spot-perp-carry-nil-live-readiness-latest.json",
        generatedAt: "2026-05-14T06:45:00.000Z",
        blockers: ["market:KRW-NIL:requires:spreadControl"],
        marketSpecificBlockers: ["market:KRW-NIL:binanceFuturesFeeUnavailable"],
        requiredBeforeMetricCandidate: ["nilOnlyBlocker"],
      },
    };
    liveGoal.carryMarketDecisionMatrix = [
      {
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        metrics: {
          count: 106,
          completedFundingCount: 4,
          executionEligibleRate: 0.94,
          executionEligibleMedianNetCarryBps: 38,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-AZTEC",
        symbol: "AZTECUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "compare_or_switch",
        reasons: [],
        requiredBeforeMetricCandidate: ["spreadControl"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 55,
          executionEligiblePositiveRate: 1,
          failed: false,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            medianWindowNetCarryBps: 55,
            windows: [
              { fundingSettledAt: "2026-05-13T08:00:00.000Z", sampleCount: 10, medianNetCarryBps: 50 },
              { fundingSettledAt: "2026-05-13T12:00:00.000Z", sampleCount: 10, medianNetCarryBps: 52 },
              { fundingSettledAt: "2026-05-13T16:00:00.000Z", sampleCount: 10, medianNetCarryBps: 54 },
              { fundingSettledAt: "2026-05-13T20:00:00.000Z", sampleCount: 10, medianNetCarryBps: 56 },
              { fundingSettledAt: "2026-05-14T00:00:00.000Z", sampleCount: 10, medianNetCarryBps: 58 },
              { fundingSettledAt: "2026-05-14T04:00:00.000Z", sampleCount: 10, medianNetCarryBps: 60 },
            ],
          },
        },
        metrics: {
          count: 120,
          completedFundingCount: 6,
          executionEligibleRate: 0.96,
          executionEligibleMedianNetCarryBps: 56,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
    ];
    liveGoal.carryLiveReadinessReports = [
      {
        path: aztecReadinessPath,
        marketKeys: ["KRW-AZTEC:AZTECUSDT"],
        generatedAt: "2026-05-14T06:37:00.000Z",
        status: "blocked",
        liveReady: false,
      },
    ];

    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T06:41:30.000Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
    });
    writeJson(aztecReadinessPath, {
      generatedAt: "2026-05-14T06:38:00.000Z",
      market: "KRW-AZTEC",
      symbol: "AZTECUSDT",
      status: "blocked",
      liveReady: false,
      fresh: true,
      blockers: ["market:KRW-AZTEC:requires:spreadControl"],
      marketSpecificBlockers: ["market:KRW-AZTEC:binanceFuturesFeeUnavailable"],
      requiredBeforeMetricCandidate: ["spreadControl"],
      action: "keep_challenger_research_only_until_live_readiness_clears",
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      strategyResearchHandoff: {
        bestChallengerMarket: string;
        bestChallengerSymbol: string;
        bestChallengerLiveReadiness: {
          market: string;
          symbol: string;
          sourceReadinessPath: string;
          blockers: string[];
          marketSpecificBlockers: string[];
          requiredBeforeMetricCandidate: string[];
        };
        requiredBeforeChallengerLiveStartup: string[];
      };
    };
    const handoff = report.strategyResearchHandoff;
    assert.equal(handoff.bestChallengerMarket, "KRW-AZTEC");
    assert.equal(handoff.bestChallengerSymbol, "AZTECUSDT");
    assert.equal(handoff.bestChallengerLiveReadiness.market, "KRW-AZTEC");
    assert.equal(handoff.bestChallengerLiveReadiness.symbol, "AZTECUSDT");
    assert.equal(handoff.bestChallengerLiveReadiness.sourceReadinessPath, aztecReadinessPath);
    assert.deepEqual(handoff.bestChallengerLiveReadiness.blockers, [
      "market:KRW-AZTEC:requires:spreadControl",
      "market:KRW-AZTEC:binanceFuturesFeeUnavailable",
    ]);
    assert.deepEqual(handoff.bestChallengerLiveReadiness.requiredBeforeMetricCandidate, [
      "spreadControl",
    ]);
    assert.ok(
      handoff.requiredBeforeChallengerLiveStartup.some((requirement) =>
        requirement.includes("KRW-AZTEC"),
      ),
    );
    assert.ok(
      handoff.requiredBeforeChallengerLiveStartup.every(
        (requirement) => !requirement.includes("KRW-NIL"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary does not recompare on stale aggregate challenger edge", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-stale-challenger-edge-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "spot-perp-carry-pieverse-live-readiness-latest.json");
    const liveGoal = blockedLiveGoal(liveReadinessPath);
    const windows = [
      "2026-05-13T08:00:00.000Z",
      "2026-05-13T12:00:00.000Z",
      "2026-05-13T16:00:00.000Z",
      "2026-05-13T20:00:00.000Z",
      "2026-05-14T00:00:00.000Z",
      "2026-05-14T04:00:00.000Z",
    ];
    liveGoal.carryMarketDecisionMatrix = [
      {
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "compare_or_switch",
        reasons: [],
        requiredBeforeMetricCandidate: [],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 40,
          executionEligiblePositiveRate: 1,
          failed: false,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            medianWindowNetCarryBps: 40,
            windows: windows.map((fundingSettledAt, index) => ({
              market: "KRW-PIEVERSE",
              symbol: "PIEVERSEUSDT",
              fundingSettledAt,
              sampleCount: 10,
              medianNetCarryBps: index === windows.length - 1 ? 30 : 40,
            })),
          },
        },
        metrics: {
          count: 120,
          completedFundingCount: 6,
          executionEligibleRate: 0.96,
          executionEligibleMedianNetCarryBps: 40,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-AZTEC",
        symbol: "AZTECUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "compare_or_switch",
        reasons: [],
        requiredBeforeMetricCandidate: [],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 55,
          executionEligiblePositiveRate: 1,
          failed: false,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            medianWindowNetCarryBps: 55,
            windows: windows.map((fundingSettledAt, index) => ({
              market: "KRW-AZTEC",
              symbol: "AZTECUSDT",
              fundingSettledAt,
              sampleCount: 10,
              medianNetCarryBps: index === windows.length - 1 ? 25 : 60,
            })),
          },
        },
        metrics: {
          count: 120,
          completedFundingCount: 6,
          executionEligibleRate: 0.96,
          executionEligibleMedianNetCarryBps: 55,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
    ];

    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T06:41:30.000Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
    });
    writeJson(liveReadinessPath, {
      generatedAt: "2026-05-14T06:42:00.000Z",
      status: "blocked",
      liveReady: false,
      blockers: ["insufficientObservationSpan"],
      evidence: {
        feeStressReports: [
          {
            generatedAt: "2026-05-14T06:41:00.000Z",
            summary: {
              executionEligibleMedianNetCarryBps: 40,
              executionEligiblePositiveRate: 1,
            },
            fundingWindowSummary: {
              completedFundingWindowCount: 6,
              medianWindowNetCarryBps: 40,
              windows: windows.map((fundingSettledAt, index) => ({
                market: "KRW-PIEVERSE",
                symbol: "PIEVERSEUSDT",
                fundingSettledAt,
                sampleCount: 10,
                medianNetCarryBps: index === windows.length - 1 ? 30 : 40,
              })),
            },
          },
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      live: { startupPlan: { currentFocusLiveStartupCaution?: unknown } | null };
      strategyResearchHandoff: { status: string; action: string; reason: string };
      strategyDecisionView: {
        challengerSwitchDecision: {
          action: string;
          reason: string;
          latestFeeStressWindowComparison: {
            deltaToCurrentFocusBps: number;
            bestChallengerBeatsCurrentFocus: boolean;
            action: string;
          };
        };
      };
    };
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison
        .deltaToCurrentFocusBps,
      -5,
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison
        .bestChallengerBeatsCurrentFocus,
      false,
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.action,
      "no_latest_window_recompare_signal",
    );
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.action, "keep_challenger_observation_only");
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.reason,
      "best_challenger_aggregate_edge_not_confirmed_in_latest_fee_stressed_window",
    );
    assert.equal(report.strategyResearchHandoff.status, "research_focus_hold");
    assert.equal(report.strategyResearchHandoff.action, "keep_challenger_observation_only");
    assert.equal(
      report.strategyResearchHandoff.reason,
      "best_challenger_aggregate_edge_not_confirmed_in_latest_fee_stressed_window",
    );
    assert.equal(report.live.startupPlan?.currentFocusLiveStartupCaution, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary prefers newer current-entry report from disk", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-current-entry-fresh-disk-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const currentEntryPath = join(
      directory,
      "spot-perp-carry-current-carry-discovery-25bps-current.json",
    );
    const staleCapturedAt = "2026-05-14T00:00:00.000Z";
	    const freshCapturedAt = new Date().toISOString();
	    const liveGoal = blockedLiveGoal();
	    liveGoal.completionAudit = {
	      ...(liveGoal.completionAudit as Record<string, unknown>),
	      missingRequirements: [
	        "spotPerpCarryWatchObservationSpan",
	        "spotPerpCarryLiveReadiness",
	        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryBelowLiveThreshold",
	      ],
	      missingRequirementCount: 3,
	    };
	    liveGoal.carryWatchlist = [
      {
        path: currentEntryPath,
        generatedAt: staleCapturedAt,
        summary: {
          medianNetCarryBps: 55,
          executionEligibleMedianNetCarryBps: 55,
          positiveRate: 1,
          executionEligibleRate: 1,
          rawPricingArtifactCount: 0,
        },
        topExecutableCarry: [
          {
            capturedAt: staleCapturedAt,
            market: "KRW-PIEVERSE",
            symbol: "PIEVERSEUSDT",
            netCarryBps: 55,
            estimatedNetPnlKrw: 2750,
            spotSpreadBps: 5,
            perpSpreadBps: 1,
            usdtKrwSpreadBps: 2,
            depthCovered: true,
          },
        ],
      },
    ];
    writeJson(currentEntryPath, {
      generatedAt: freshCapturedAt,
      status: "blocked",
      promotionEligible: false,
      summary: {
        medianNetCarryBps: 7,
        executionEligibleMedianNetCarryBps: 7,
        positiveRate: 1,
        executionEligibleRate: 1,
        rawPricingArtifactCount: 0,
      },
      topExecutableCarry: [
        {
          capturedAt: freshCapturedAt,
          market: "KRW-AZTEC",
          symbol: "AZTECUSDT",
          netCarryBps: 42,
          estimatedNetPnlKrw: 2100,
          spotSpreadBps: 4,
          perpSpreadBps: 1,
          usdtKrwSpreadBps: 2,
          depthCovered: true,
        },
        {
          capturedAt: freshCapturedAt,
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          netCarryBps: 7,
          estimatedNetPnlKrw: 350,
          spotSpreadBps: 5,
          perpSpreadBps: 1,
          usdtKrwSpreadBps: 2,
          depthCovered: true,
        },
      ],
    });
    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: freshCapturedAt,
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processHealth: {
        onlineCount: 1,
        waitingRestartCount: 0,
        expectedLoopingObserverCount: 0,
        expectedLoopingObserversWithoutAutorestart: [],
        unstableRestartProcessCount: 0,
        maxRestartDelayMs: 600000,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
	    const report = JSON.parse(result.stdout) as {
	      completionAuditSummary: {
	        missingRequirements: string[];
	        missingRequirementClassification: Record<string, string[]>;
	      };
	      strategyDecisionView: {
	        currentEntrySanityView: {
          preferredGeneratedAt: string;
          preferredEmbeddedGeneratedAt: string;
          preferredEmbeddedReportWasStale: boolean;
	        currentEntryBlockers: string[];
          selectedMarketCurrentEntrySnapshot: { netCarryBps: number };
          currentEntryAlternativeCandidates: Array<{
            market: string;
            symbol: string;
            netCarryBps: number;
            deltaToSelectedFocusBps: number;
            currentEntryGatePassed: boolean;
            executionQualityStatus: string;
            blockedReasons: string[];
            action: string;
          }>;
        };
      };
    };
    assert.equal(report.strategyDecisionView.currentEntrySanityView.preferredGeneratedAt, freshCapturedAt);
    assert.equal(
      report.strategyDecisionView.currentEntrySanityView.preferredEmbeddedGeneratedAt,
      staleCapturedAt,
    );
    assert.equal(report.strategyDecisionView.currentEntrySanityView.preferredEmbeddedReportWasStale, true);
    assert.equal(
      report.strategyDecisionView.currentEntrySanityView.selectedMarketCurrentEntrySnapshot.netCarryBps,
      7,
    );
    assert.deepEqual(
      report.strategyDecisionView.currentEntrySanityView.currentEntryAlternativeCandidates.map((candidate) => ({
        market: candidate.market,
        symbol: candidate.symbol,
        netCarryBps: candidate.netCarryBps,
        deltaToSelectedFocusBps: candidate.deltaToSelectedFocusBps,
        currentEntryGatePassed: candidate.currentEntryGatePassed,
        executionQualityStatus: candidate.executionQualityStatus,
        blockedReasons: candidate.blockedReasons,
        action: candidate.action,
      })),
      [
        {
          market: "KRW-AZTEC",
          symbol: "AZTECUSDT",
          netCarryBps: 42,
          deltaToSelectedFocusBps: 35,
          currentEntryGatePassed: true,
          executionQualityStatus: "quality_clear_or_top_executable",
          blockedReasons: [],
          action: "use_for_research_focus_recheck_only_not_live_startup",
        },
      ],
    );
	    assert.deepEqual(report.strategyDecisionView.currentEntrySanityView.currentEntryBlockers, [
	      "selectedFocusCurrentEntryCarryBelowLiveThreshold",
	    ]);
	    assert.ok(
	      report.completionAuditSummary.missingRequirementClassification.marketConditions.includes(
	        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryBelowLiveThreshold",
	      ),
	    );
	    assert.ok(
	      !report.completionAuditSummary.missingRequirementClassification.other.includes(
	        "spotPerpCarryCurrentEntry:selectedFocusCurrentEntryCarryBelowLiveThreshold",
	      ),
	    );
	    writeJson(currentEntryPath, {
	      generatedAt: freshCapturedAt,
	      status: "blocked",
	      promotionEligible: false,
	      summary: {
	        medianNetCarryBps: 25,
	        executionEligibleMedianNetCarryBps: 25,
	        positiveRate: 1,
	        executionEligibleRate: 1,
	        rawPricingArtifactCount: 0,
	      },
	      topExecutableCarry: [
	        {
	          capturedAt: freshCapturedAt,
	          market: "KRW-PIEVERSE",
	          symbol: "PIEVERSEUSDT",
	          netCarryBps: 25,
	          estimatedNetPnlKrw: 1250,
	          spotSpreadBps: 5,
	          perpSpreadBps: 1,
	          usdtKrwSpreadBps: 2,
	          depthCovered: true,
	        },
	      ],
	    });

	    const clearedResult = spawnSync(
	      process.execPath,
	      [
	        "dist/src/cli/summarize-live-goal-progress.js",
	        "--live-goal-status",
	        liveGoalPath,
	        "--process-alignment",
	        alignmentPath,
	      ],
	      { cwd: process.cwd(), encoding: "utf8" },
	    );
	    assert.equal(clearedResult.status, 0, clearedResult.stderr);
	    const clearedReport = JSON.parse(clearedResult.stdout) as {
	      completionAuditSummary: {
	        missingRequirements: string[];
	        missingRequirementClassification: Record<string, string[]>;
	      };
	      strategyDecisionView: {
	        currentEntrySanityView: {
	          currentEntryBlockers: string[];
	        };
	      };
	    };
	    assert.deepEqual(clearedReport.strategyDecisionView.currentEntrySanityView.currentEntryBlockers, []);
	    assert.ok(
	      !clearedReport.completionAuditSummary.missingRequirements.some((requirement) =>
	        requirement.startsWith("spotPerpCarryCurrentEntry"),
	      ),
	    );
	    assert.ok(
	      !clearedReport.completionAuditSummary.missingRequirementClassification.marketConditions.some((requirement) =>
	        requirement.startsWith("spotPerpCarryCurrentEntry"),
	      ),
	    );
	  } finally {
	    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary prefers focused current-entry evidence for selected focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-focused-current-entry-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const currentCarryPath = join(
      directory,
      "spot-perp-carry-current-carry-discovery-25bps-current.json",
    );
    const focusedPath = join(
      directory,
      "spot-perp-carry-focus-current-entry-25bps-latest.json",
    );
    const generatedAt = new Date().toISOString();
    const liveGoal = blockedLiveGoal();
    liveGoal.carryWatchlist = [
      {
        path: currentCarryPath,
        generatedAt,
        summary: {
          medianNetCarryBps: 60,
          executionEligibleMedianNetCarryBps: 60,
          positiveRate: 1,
          executionEligibleRate: 1,
          rawPricingArtifactCount: 0,
        },
        topExecutableCarry: [
          {
            capturedAt: generatedAt,
            market: "KRW-AZTEC",
            symbol: "AZTECUSDT",
            netCarryBps: 60,
            estimatedNetPnlKrw: 3000,
            spotSpreadBps: 5,
            perpSpreadBps: 1,
            usdtKrwSpreadBps: 2,
            depthCovered: true,
          },
        ],
      },
      {
        path: focusedPath,
        generatedAt,
        summary: {
          medianNetCarryBps: 24,
          executionEligibleMedianNetCarryBps: 24,
          positiveRate: 1,
          executionEligibleRate: 1,
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
      },
    ];
    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt,
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processHealth: {
        onlineCount: 1,
        waitingRestartCount: 0,
        expectedLoopingObserverCount: 0,
        expectedLoopingObserversWithoutAutorestart: [],
        unstableRestartProcessCount: 0,
        maxRestartDelayMs: 600000,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      strategyDecisionView: {
        currentEntrySanityView: {
          preferredSourcePath: string;
          preferredSourceKind: string;
          currentEntryBlockers: string[];
          selectedMarketCurrentEntrySnapshot: { market: string; netCarryBps: number };
        };
      };
    };
    assert.equal(report.strategyDecisionView.currentEntrySanityView.preferredSourcePath, focusedPath);
    assert.equal(
      report.strategyDecisionView.currentEntrySanityView.preferredSourceKind,
      "focused_current_entry_fee_stress",
    );
    assert.deepEqual(report.strategyDecisionView.currentEntrySanityView.currentEntryBlockers, []);
    assert.equal(
      report.strategyDecisionView.currentEntrySanityView.selectedMarketCurrentEntrySnapshot.market,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.strategyDecisionView.currentEntrySanityView.selectedMarketCurrentEntrySnapshot.netCarryBps,
      24,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary waits for opportunity sample when missing challenger is already configured", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-summary-configured-opportunity-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "live-readiness.json");
    const researchSourcePath = join(directory, "spot-perp-carry-pieverse.json");
    writeJson(liveGoalPath, blockedLiveGoal(liveReadinessPath, researchSourcePath));
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T01:57:30.286Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processes: [
        {
          name: "dry-run-spot-perp-carry-opportunity-72h-observer",
          argumentAudit: {
            requiredSubstrings: [
              "KRW-PIEVERSE:PIEVERSEUSDT",
              "KRW-MON:MONUSDT",
              "var/reports/spot-perp-carry-opportunity-72h-latest.json",
            ],
            missingSubstrings: [],
          },
        },
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(
      report.strategyDecisionView.challengerObservationCoverage.opportunityObservationCovered,
      false,
    );
    assert.equal(
      report.strategyDecisionView.challengerObservationCoverage.opportunityObserverConfiguredForMissingMarkets,
      true,
    );
    assert.equal(
      report.strategyDecisionView.challengerObservationCoverage.action,
      "wait_for_next_opportunity_observation_sample",
    );
    assert.deepEqual(report.strategyDecisionView.challengerObservationCoverage.missingOpportunityObservation, [
      {
        market: "KRW-MON",
        symbol: "MONUSDT",
        sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: 50.25,
        },
        configuredInOpportunityObserver: true,
        requiredAction: "wait_for_next_opportunity_observation_sample",
      },
    ]);
	    assert.deepEqual(report.strategyResearchHandoff.requiredBeforeFocusSwitch, [
	      "latestWindowFundingAlignment",
	      "latestWindowSampleQuality",
	      "opportunityObservationSample",
	    ]);
	    assert.deepEqual(
	      report.strategyResearchHandoff.requiredBeforeFocusSwitch.map(
	        (work: string) => `spotPerpCarryResearchFocus:${work}`,
	      ),
	      report.completionAuditSummary.missingRequirements.filter((requirement: string) =>
	        /^spotPerpCarryResearchFocus:/.test(requirement),
	      ),
	    );
	    assert.ok(
	      report.completionAuditSummary.missingRequirementClassification.autonomousEvidence.includes(
	        "spotPerpCarryResearchFocus:latestWindowFundingAlignment",
	      ),
	    );
    assert.equal(
      report.strategyResearchHandoff.observationCoverage.action,
      "wait_for_next_opportunity_observation_sample",
    );
    assert.equal(
      report.nextWorkClassification.recommendedAutonomousAction,
      "wait_for_next_opportunity_observation_sample_and_refresh_live_goal_status",
    );
    assert.equal(
      report.nextWorkClassification.priorityOpportunityObservationEvidence.evidenceAction,
      "wait_for_next_spot_perp_carry_opportunity_observer_sample",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary ignores non-positive current carry for opportunity coverage", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-summary-negative-opportunity-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "live-readiness.json");
    const researchSourcePath = join(directory, "spot-perp-carry-pieverse.json");
    const liveGoal = blockedLiveGoal(liveReadinessPath, researchSourcePath);
    const matrix = liveGoal.carryMarketDecisionMatrix as Array<Record<string, unknown>>;
    const currentFocus = matrix.find((row) => row.market === "KRW-PIEVERSE");
    assert.ok(currentFocus, "fixture must include KRW-PIEVERSE current focus");
    liveGoal.carryMarketDecisionMatrix = [
      currentFocus,
      {
      sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
      market: "KRW-XAI",
      symbol: "XAIUSDT",
      status: "collect_more_evidence",
      decision: "continue_until_metric_requirements_clear",
      nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
      reasons: [],
      requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
      metrics: {
        count: 1,
        completedFundingCount: 1,
        executionEligibleRate: 1,
        executionEligibleMedianNetCarryBps: -14.755844,
        executionEligiblePositiveRate: 0,
      },
      },
    ];
    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T01:57:30.286Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processes: [
        {
          name: "dry-run-spot-perp-carry-opportunity-72h-observer",
          argumentAudit: {
            requiredSubstrings: [
              "KRW-PIEVERSE:PIEVERSEUSDT",
              "KRW-MON:MONUSDT",
              "var/reports/spot-perp-carry-opportunity-72h-latest.json",
            ],
            missingSubstrings: [],
          },
        },
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const coverage = report.strategyDecisionView.challengerObservationCoverage;
    assert.equal(coverage.opportunityObservationCovered, true);
    assert.equal(coverage.opportunityObserverConfiguredForMissingMarkets, null);
    assert.deepEqual(coverage.missingOpportunityObservation, []);
    assert.deepEqual(coverage.ignoredNonPositiveOpportunityCandidates, [
      {
        market: "KRW-XAI",
        symbol: "XAIUSDT",
        sourcePath: "spot-perp-carry-current-carry-discovery-latest.json",
        metrics: {
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 1,
          executionEligibleMedianNetCarryBps: -14.755844,
          executionEligiblePositiveRate: 0,
        },
        reason: "non_positive_execution_eligible_carry",
      },
    ]);
    assert.ok(
      !report.strategyResearchHandoff.requiredBeforeFocusSwitch.includes(
        "opportunityObserverCoverage",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary uses fresh opportunity watch report coverage before waiting for another sample", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-summary-fresh-opportunity-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "live-readiness.json");
    const researchSourcePath = join(directory, "spot-perp-carry-pieverse.json");
    const opportunityPath = join(directory, "spot-perp-carry-opportunity-72h-latest.json");
    const liveGoal = blockedLiveGoal(liveReadinessPath, researchSourcePath);
    liveGoal.carryWatchlist = [
      {
        path: opportunityPath,
        generatedAt: "2026-05-14T01:57:27.133Z",
      },
    ];
    writeJson(liveGoalPath, liveGoal);
    writeJson(opportunityPath, {
      generatedAt: "2026-05-14T02:05:00.000Z",
      status: "blocked",
      perMarketSummary: [
        {
          market: "KRW-MON",
          symbol: "MONUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 0,
          executionEligibleMedianNetCarryBps: null,
          spreadControl: {
            spreadRejectedRate: 1,
            rejectionReasons: {
              spotSpreadTooWide: 1,
              perpSpreadTooWide: 0,
              usdtKrwSpreadTooWide: 0,
            },
          },
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
          },
        },
      ],
    });
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T01:57:30.286Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processes: [
        {
          name: "dry-run-spot-perp-carry-opportunity-72h-observer",
          argumentAudit: {
            requiredSubstrings: [
              "KRW-PIEVERSE:PIEVERSEUSDT",
              "KRW-MON:MONUSDT",
              "var/reports/spot-perp-carry-opportunity-72h-latest.json",
            ],
            missingSubstrings: [],
          },
        },
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(
      report.strategyDecisionView.challengerObservationCoverage.opportunityObservationCovered,
      true,
    );
    assert.equal(
      report.strategyDecisionView.challengerObservationCoverage.opportunityObserverConfiguredForMissingMarkets,
      null,
    );
    assert.deepEqual(
      report.strategyDecisionView.challengerObservationCoverage.missingOpportunityObservation,
      [],
    );
    assert.deepEqual(
      report.strategyDecisionView.challengerObservationCoverage.observedOpportunityObservation,
      [
        {
          sourcePath: opportunityPath,
          generatedAt: "2026-05-14T02:05:00.000Z",
          market: "KRW-MON",
          symbol: "MONUSDT",
          count: 1,
          completedFundingCount: 1,
          executionEligibleRate: 0,
          executionEligibleMedianNetCarryBps: null,
          spreadRejectedRate: 1,
          rejectionReasons: {
            spotSpreadTooWide: 1,
            perpSpreadTooWide: 0,
            usdtKrwSpreadTooWide: 0,
          },
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
          },
        },
      ],
    );
    assert.ok(
      !report.strategyResearchHandoff.requiredBeforeFocusSwitch.includes(
        "opportunityObservationSample",
      ),
    );
    assert.ok(!report.nextAutonomousWork.includes("opportunityObservationSample"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("checkpoint plan reason names the actual remaining autonomous evidence blocker", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-checkpoint-reason-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "live-readiness.json");
    const researchSourcePath = join(directory, "spot-perp-carry-pieverse.json");
    const spreadExperimentPath = join(directory, "spot-perp-carry-pieverse-spread-experiment.json");
    const liveGoal = blockedLiveGoal(liveReadinessPath, researchSourcePath);
    liveGoal.carryMarketDecisionMatrix = [
      {
        sourcePath: researchSourcePath,
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "observationSpanMinutes",
        reasons: [],
        requiredBeforeMetricCandidate: ["observationSpanMinutes"],
        metrics: {
          count: 570,
          completedFundingCount: 8,
          executionEligibleRate: 0.97,
          executionEligibleMedianNetCarryBps: 65.84,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
    ];
    const nextActionPlan = liveGoal.nextActionPlan as Array<{
      requiredEvidenceBeforeLive: string[];
      currentEvidence: {
        readinessGap: Record<string, unknown>;
        readinessTimeline: Record<string, unknown>;
      };
    }>;
    nextActionPlan[0].requiredEvidenceBeforeLive = ["insufficientObservationSpan"];
    nextActionPlan[0].currentEvidence.readinessGap = {
      observationSpanMinutes: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
    };
    nextActionPlan[0].currentEvidence.readinessTimeline = {
      bottleneck: "observationSpanMinutes",
      estimatedEarliestReviewAt: "2099-01-01T08:00:00.000Z",
    };

    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T01:57:30.286Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processHealth: {
        expectedLoopingObserverCount: 12,
        expectedLoopingObserversWithoutAutorestart: [],
        unstableRestartProcessCount: 0,
        maxRestartDelayMs: 600000,
      },
      savedProcessControl: {
        liveGoalObserverPresent: true,
        restartDelayMs: 600000,
        tradingMode: "paper",
        liveExecutionFlag: "false",
        aligned: true,
      },
    });
    writeJson(liveReadinessPath, {
      generatedAt: "2026-05-14T01:57:29.000Z",
      status: "blocked",
      liveReady: false,
      blockers: [
        "operationalProof:credentialsMissing",
        "operationalProof:symbol:PIEVERSEUSDT:binanceFuturesFeeUnavailable",
        "operationalProof:bithumbQuoteInventoryInsufficient",
        "operationalProof:binanceUsdtMarginInsufficient",
        "wideDisplayedSpread",
      ],
      checks: {
        accountFeesConfirmed: false,
        inventoryReady: false,
        hedgeVenueReady: false,
        operationalProofPresent: true,
        operationalProofFresh: true,
        liveExecutionPathReady: true,
      },
      nextOperationalSteps: [
        {
          action: "refresh_operational_proof_with_credentials",
          reason: "Live readiness requires fresh private account proof.",
          missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
        },
        {
          action: "confirm_account_fee_schedule",
          reason: "Fee assumptions must be proven with current account data.",
          missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
        },
        {
          action: "fund_or_verify_spot_inventory",
          reason: "Bithumb spot leg must have sufficient KRW inventory.",
        },
        {
          action: "fund_or_verify_futures_hedge_venue",
          reason: "Binance USD-M hedge leg must have sufficient USDT margin.",
        },
      ],
      evidence: {
        feeStressReports: [
          {
            generatedAt: "2026-05-14T01:57:28.500Z",
            summary: {
              executionEligibleMedianNetCarryBps: 44.72,
              executionEligiblePositiveRate: 1,
              spreadControl: {
                passed: false,
                required: true,
                spreadRejectedRate: 0.08,
                executionEligibleRate: 0.92,
                minExecutionEligibleRate: 0.95,
                maxSpreadRejectionRate: 0.05,
                thresholds: {
                  maxSpotSpreadBps: 30,
                  maxPerpSpreadBps: 10,
                  maxUsdtKrwSpreadBps: 20,
                },
              },
              spreadSensitivity: [
                {
                  maxSpotSpreadBps: 30,
                  maxPerpSpreadBps: 10,
                  maxUsdtKrwSpreadBps: 20,
                  executionEligibleRate: 0.92,
                  spreadRejectedRate: 0.08,
                  completedFundingWindowCount: 2,
                  positiveWindowRate: 1,
                  medianWindowNetCarryBps: 44.72,
                  estimatedNetPnlKrwAcrossFundingWindows: 4472,
                },
                {
                  maxSpotSpreadBps: 40,
                  maxPerpSpreadBps: 10,
                  maxUsdtKrwSpreadBps: 20,
                  executionEligibleRate: 0.98,
                  spreadRejectedRate: 0.02,
                  completedFundingWindowCount: 2,
                  positiveWindowRate: 1,
                  medianWindowNetCarryBps: 43.5,
                  estimatedNetPnlKrwAcrossFundingWindows: 4350,
                },
              ],
            },
            fundingWindowSummary: {
              completedFundingWindowCount: 2,
              executableSampleCount: 40,
              medianWindowNetCarryBps: 44.72,
              medianWindowEstimatedNetPnlKrw: 2236,
              isDeduplicatedByFundingWindow: true,
              isNotRealizedReturn: true,
              windows: [
                {
                  market: "KRW-PIEVERSE",
                  symbol: "PIEVERSEUSDT",
                  fundingSettledAt: "2099-01-01T00:00:00.000Z",
                  sampleCount: 20,
                  medianNetCarryBps: 44,
                  medianEstimatedNetPnlKrw: 2200,
                },
                {
                  market: "KRW-PIEVERSE",
                  symbol: "PIEVERSEUSDT",
                  fundingSettledAt: "2099-01-01T04:00:00.000Z",
                  sampleCount: 20,
                  medianNetCarryBps: 45.44,
                  medianEstimatedNetPnlKrw: 2272,
                },
              ],
            },
          },
        ],
        operationalProof: {
          generatedAt: "2026-05-14T01:57:28.000Z",
          accountFeesConfirmed: false,
          inventoryReady: false,
          hedgeVenueReady: false,
          requirements: {
            totalSpotQuoteRequiredKrw: 501250,
            totalFuturesMarginRequiredUsdt: 336.302521,
          },
          deficits: {
            bithumbQuoteDeficitKrw: 386029.731484,
            binanceUsdtDeficit: 336.302521,
          },
          details: {
            missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
            feeBudget: {
              maxBithumbFeeBps: 25,
              maxBinanceFuturesTakerFeeBps: 5,
            },
          },
          reasons: [
            "credentialsMissing",
            "symbol:PIEVERSEUSDT:binanceFuturesFeeUnavailable",
            "bithumbQuoteInventoryInsufficient",
            "binanceUsdtMarginInsufficient",
          ],
        },
      },
    });
    writeJson(researchSourcePath, {
      generatedAt: "2026-05-14T01:58:00.000Z",
      status: "blocked",
      promotionEligible: false,
      observationCount: 570,
      observationSpanMinutes: 1541.221233,
      assumptions: { notionalKrw: 500000 },
      summary: {
        completedFundingCount: 8,
        executionEligibleMedianNetCarryBps: 65.84,
        executionEligibleTotalEstimatedNetPnlKrw: 2027480.77,
        executionEligibleRate: 0.97,
        executionEligiblePositiveRate: 1,
      },
    });
    writeJson(spreadExperimentPath, {
      generatedAt: "2026-05-14T01:59:00.000Z",
      status: "blocked",
      promotionEligible: false,
      blockers: ["insufficientObservationSpan"],
      observationCount: 570,
      observationSpanMinutes: 1541.221233,
      assumptions: {
        markets: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
        maxSpotSpreadBps: 40,
      },
      summary: {
        spreadSensitivity: [
          {
            maxSpotSpreadBps: 30,
            maxPerpSpreadBps: 10,
            maxUsdtKrwSpreadBps: 20,
            executionEligibleRate: 0.92,
            spreadRejectedRate: 0.08,
            completedFundingWindowCount: 2,
            positiveWindowRate: 1,
            medianWindowNetCarryBps: 44.72,
            estimatedNetPnlKrwAcrossFundingWindows: 4472,
          },
          {
            maxSpotSpreadBps: 40,
            maxPerpSpreadBps: 10,
            maxUsdtKrwSpreadBps: 20,
            executionEligibleRate: 0.98,
            spreadRejectedRate: 0.02,
            completedFundingWindowCount: 2,
            positiveWindowRate: 1,
            medianWindowNetCarryBps: 43.5,
            estimatedNetPnlKrwAcrossFundingWindows: 4350,
          },
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
        "--spread-threshold-experiment",
        spreadExperimentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
	      nextAutonomousWork: string[];
	      nextOperatorWork: string[];
	      nextMarketConditionWork: string[];
		      autonomousEvidenceHandoff: {
		        status: string;
		        canStartLiveWithoutAutonomousEvidenceWork: boolean;
		        requiredBeforeLiveReview: string[];
		        readinessGap: {
		          observationSpanMinutes?: { current: number; required: number; remaining: number; passed: boolean };
		        };
		        readinessTimeline: { bottleneck: string; estimatedEarliestReviewAt: string };
          autonomousBlockerEvidence: Array<{
            blocker: string;
            active: boolean;
            readinessGap: { current: number; required: number; remaining: number; passed: boolean } | null;
            readinessTimeline: { bottleneck: string; estimatedEarliestReviewAt: string } | null;
            sampleQualityPasses?: boolean | null;
            minSampleCountForRecompare?: number | null;
            currentFocusLatestWindowSampleCount?: number | null;
            bestChallengerLatestWindowSampleCount?: number | null;
            currentFocusLatestWindowSampleShortfall?: number | null;
            bestChallengerLatestWindowSampleShortfall?: number | null;
            requiredBeforeFocusSwitch?: string[];
          }>;
		        nextReviewAt: string;
		        nextReviewAtKst: string;
		        reviewCommand: string;
		      };
	      nextWorkClassification: {
	        liveOperationalPrerequisites: string[];
	        marketConditionBlockers: string[];
	      };
      operatorLiveReadinessHandoff: {
        requiredBeforeLiveReview: string[];
        operatorBlockerEvidence: Array<{
          blocker: string;
          operatorAction: { action: string | null } | null;
        }>;
      };
	      marketConditionHandoff: {
	        status: string;
	        canStartLiveWithoutMarketConditionWork: boolean;
	        requiredBeforeLiveReview: string[];
	        selectedMarket: string;
		        currentEntryStatus: string;
        spreadBlockerEvidence: {
          blockerActive: boolean;
          breachCount: number;
          breaches: Array<Record<string, unknown>>;
          clearanceProgress: Array<{
            source: string;
            aggregatePassed: boolean;
            latestWindowPassed: boolean | null;
            spreadRejectedRateExcess: number | null;
            executionEligibleRateShortfall: number | null;
            maxSpreadBpsExcess: number | null;
          }>;
        };
		        spreadSensitivity: {
	          baselineMaxSpotSpreadBps: number;
	          baselineScenario: { executionEligibleRate: number; spreadRejectedRate: number };
	          nearestPassingScenario: { maxSpotSpreadBps: number; executionEligibleRate: number; spreadRejectedRate: number };
	          action: string;
	          caveat: string;
	        };
	        explicitSpreadThresholdExperiments: Array<{
	          sourcePath: string;
	          market: string;
	          baselineMaxSpotSpreadBps: number;
	          candidateMaxSpotSpreadBps: number;
	          deltaCandidateMinusBaseline: {
	            executionEligibleRate: number;
	            spreadRejectedRate: number;
	            medianWindowNetCarryBps: number;
	            estimatedNetPnlKrwAcrossFundingWindows: number;
	          };
	          expectancyImproved: boolean;
	          policyDecision: string;
	          liveGateImpact: string;
	        }>;
	        verificationCommands: {
	          reviewCommand: string;
	          gateCommand: string;
	        };
	      };
	      checkpointPlan: {
        status: string;
        shouldRunHeavyRefreshNow: boolean;
        nextReviewAt: string;
        nextCompletedFundingWindowAt: string;
        recompareSampleBufferRequired: boolean;
        recompareSampleBufferMinutes: number;
        autonomousEvidenceSufficiency: {
          blocker: string;
          bottleneck: string;
          earliestReviewAt: string;
          earliestReviewAtKst: string;
          delayMinutes: number;
          nextReviewCanCompleteAutonomousEvidence: boolean;
          interpretation: string;
        } | null;
        outstandingOperatorWork: string[];
        outstandingMarketConditionWork: string[];
        targetedMarketConditionMonitoring: {
          status: string;
          selectedMarket: string;
          blockers: string[];
          currentEntryBlockers: string[];
          spreadBlockers: string[];
          action: string;
          commands: string[];
          canAuthorizeLiveStartup: boolean;
          interpretation: string;
        };
        reason: string;
      };
      goalCompletionAuditView: {
        promptToArtifactChecklist: Array<{
          id: string;
          status: string;
          evidence: Record<string, unknown>;
        }>;
      };
      };
      assert.deepEqual(report.nextAutonomousWork, [
        "insufficientObservationSpan",
        "latestWindowFundingAlignment",
        "latestWindowSampleQuality",
      ]);
      assert.equal(report.autonomousEvidenceHandoff.status, "autonomous_evidence_required");
      assert.equal(report.autonomousEvidenceHandoff.canStartLiveWithoutAutonomousEvidenceWork, false);
      assert.deepEqual(report.autonomousEvidenceHandoff.requiredBeforeLiveReview, [
        "insufficientObservationSpan",
        "latestWindowFundingAlignment",
        "latestWindowSampleQuality",
      ]);
	    assert.equal(report.autonomousEvidenceHandoff.readinessGap.observationSpanMinutes?.current, 1541.221233);
	    assert.equal(report.autonomousEvidenceHandoff.readinessGap.observationSpanMinutes?.required, 4320);
	    assert.equal(report.autonomousEvidenceHandoff.readinessGap.observationSpanMinutes?.passed, false);
	    assert.equal(report.autonomousEvidenceHandoff.readinessTimeline.bottleneck, "observationSpanMinutes");
      assert.deepEqual(
        report.autonomousEvidenceHandoff.autonomousBlockerEvidence.map((item) => item.blocker),
        ["insufficientObservationSpan", "latestWindowFundingAlignment", "latestWindowSampleQuality"],
      );
      assert.equal(report.autonomousEvidenceHandoff.autonomousBlockerEvidence[0].active, true);
      assert.equal(
        report.autonomousEvidenceHandoff.autonomousBlockerEvidence[0].readinessGap?.remaining,
        2778.778767,
      );
      assert.equal(
        report.autonomousEvidenceHandoff.autonomousBlockerEvidence[0].readinessTimeline?.bottleneck,
        "observationSpanMinutes",
      );
      const latestWindowSampleEvidence =
        report.autonomousEvidenceHandoff.autonomousBlockerEvidence.find(
          (item) => item.blocker === "latestWindowSampleQuality",
        );
      assert.ok(latestWindowSampleEvidence);
      assert.equal(latestWindowSampleEvidence.sampleQualityPasses, false);
      assert.equal(latestWindowSampleEvidence.minSampleCountForRecompare, 5);
      assert.equal(latestWindowSampleEvidence.currentFocusLatestWindowSampleCount, 20);
      assert.equal(latestWindowSampleEvidence.bestChallengerLatestWindowSampleCount, null);
      assert.equal(latestWindowSampleEvidence.currentFocusLatestWindowSampleShortfall, 0);
      assert.equal(latestWindowSampleEvidence.bestChallengerLatestWindowSampleShortfall, null);
      assert.deepEqual(latestWindowSampleEvidence.requiredBeforeFocusSwitch, [
        "latestWindowFundingAlignment",
        "latestWindowSampleQuality",
      ]);
	    assert.equal(report.autonomousEvidenceHandoff.nextReviewAt, "2099-01-01T08:30:00.000Z");
	    assert.equal(report.autonomousEvidenceHandoff.nextReviewAtKst, "2099-01-01 17:30:00 KST");
	    assert.equal(
	      report.autonomousEvidenceHandoff.reviewCommand,
	      "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
	    );
      const expectedOperatorWork = [
        "operationalProof:credentialsMissing",
        "operationalProof:symbol:PIEVERSEUSDT:binanceFuturesFeeUnavailable",
        "operationalProof:bithumbQuoteInventoryInsufficient",
        "operationalProof:binanceUsdtMarginInsufficient",
      ];
	    assert.deepEqual(report.nextOperatorWork, expectedOperatorWork);
    assert.deepEqual(report.nextMarketConditionWork, [
      "wideDisplayedSpread",
      "currentEntryReportMissing",
      "selectedFocusMissingFromCurrentEntrySnapshot",
      "currentEntryTimestampMissing",
      "selectedFocusCurrentEntryCarryMissing",
    ]);
    assert.deepEqual(report.nextWorkClassification.liveOperationalPrerequisites, expectedOperatorWork);
    assert.deepEqual(report.operatorLiveReadinessHandoff.requiredBeforeLiveReview, expectedOperatorWork);
    assert.deepEqual(
      report.operatorLiveReadinessHandoff.operatorBlockerEvidence.map((item) => item.blocker),
      expectedOperatorWork,
    );
    assert.deepEqual(
      report.operatorLiveReadinessHandoff.operatorBlockerEvidence.map((item) => item.operatorAction?.action ?? null),
      [
        "refresh_operational_proof_with_credentials",
        "confirm_account_fee_schedule",
        "fund_or_verify_spot_inventory",
        "fund_or_verify_futures_hedge_venue",
      ],
    );
		    assert.deepEqual(report.nextWorkClassification.marketConditionBlockers, [
		      "wideDisplayedSpread",
		      "currentEntryReportMissing",
		      "selectedFocusMissingFromCurrentEntrySnapshot",
		      "currentEntryTimestampMissing",
		      "selectedFocusCurrentEntryCarryMissing",
		    ]);
		    assert.equal(report.marketConditionHandoff.status, "market_conditions_required");
		    assert.equal(report.marketConditionHandoff.canStartLiveWithoutMarketConditionWork, false);
			    assert.deepEqual(report.marketConditionHandoff.requiredBeforeLiveReview, [
			      "wideDisplayedSpread",
			      "currentEntryReportMissing",
			      "selectedFocusMissingFromCurrentEntrySnapshot",
			      "currentEntryTimestampMissing",
			      "selectedFocusCurrentEntryCarryMissing",
			    ]);
		    assert.equal(report.marketConditionHandoff.selectedMarket, "KRW-PIEVERSE");
		    assert.equal(report.marketConditionHandoff.currentEntryStatus, "current_entry_blocked_or_diagnostic_only");
      assert.equal(report.marketConditionHandoff.spreadBlockerEvidence.blockerActive, true);
      assert.equal(
        report.marketConditionHandoff.spreadBlockerEvidence.breachCount,
        report.marketConditionHandoff.spreadBlockerEvidence.breaches.length,
      );
      assert.ok(report.marketConditionHandoff.spreadBlockerEvidence.breaches.length > 0);
      assert.deepEqual(
        report.marketConditionHandoff.spreadBlockerEvidence.clearanceProgress.map((item) => item.source),
        ["liveReadinessSpreadControl"],
      );
      assert.equal(
        report.marketConditionHandoff.spreadBlockerEvidence.clearanceProgress[0].aggregatePassed,
        false,
      );
      assert.equal(
        report.marketConditionHandoff.spreadBlockerEvidence.clearanceProgress[0].latestWindowPassed,
        null,
      );
		    assert.equal(report.marketConditionHandoff.spreadSensitivity.baselineMaxSpotSpreadBps, 30);
	    assert.equal(report.marketConditionHandoff.spreadSensitivity.baselineScenario.executionEligibleRate, 0.92);
	    assert.equal(report.marketConditionHandoff.spreadSensitivity.nearestPassingScenario.maxSpotSpreadBps, 40);
	    assert.equal(report.marketConditionHandoff.spreadSensitivity.nearestPassingScenario.spreadRejectedRate, 0.02);
	    assert.equal(
	      report.marketConditionHandoff.spreadSensitivity.action,
	      "run_explicit_spread_threshold_experiment_before_any_policy_change",
	    );
	    assert.match(report.marketConditionHandoff.spreadSensitivity.caveat, /diagnostic only/);
	    assert.equal(report.marketConditionHandoff.explicitSpreadThresholdExperiments[0]?.sourcePath, spreadExperimentPath);
	    assert.equal(report.marketConditionHandoff.explicitSpreadThresholdExperiments[0]?.market, "KRW-PIEVERSE");
	    assert.equal(
	      report.marketConditionHandoff.explicitSpreadThresholdExperiments[0]?.candidateMaxSpotSpreadBps,
	      40,
	    );
	    assert.deepEqual(
	      report.marketConditionHandoff.explicitSpreadThresholdExperiments[0]?.deltaCandidateMinusBaseline,
	      {
	        executionEligibleRate: 0.06,
	        spreadRejectedRate: -0.06,
	        medianWindowNetCarryBps: -1.22,
	        estimatedNetPnlKrwAcrossFundingWindows: -122,
	      },
	    );
	    assert.equal(
	      report.marketConditionHandoff.explicitSpreadThresholdExperiments[0]?.policyDecision,
	      "do_not_relax_spread_gate_no_expectancy_improvement",
	    );
	    assert.equal(
	      report.marketConditionHandoff.explicitSpreadThresholdExperiments[0]?.liveGateImpact,
	      "none_diagnostic_only",
	    );
	    assert.equal(
	      report.marketConditionHandoff.verificationCommands.reviewCommand,
	      "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
	    );
	    assert.equal(
	      report.marketConditionHandoff.verificationCommands.gateCommand,
	      "npm run dry-run:gate-live-goal-ready",
	    );
	    assert.equal(report.checkpointPlan.status, "pause_heavy_refresh_until_next_completed_funding_window");
    assert.equal(report.checkpointPlan.shouldRunHeavyRefreshNow, false);
    assert.equal(report.checkpointPlan.nextReviewAt, "2099-01-01T08:30:00.000Z");
    assert.equal(report.checkpointPlan.nextCompletedFundingWindowAt, "2099-01-01T08:00:00.000Z");
    assert.equal(report.checkpointPlan.recompareSampleBufferRequired, true);
    assert.equal(report.checkpointPlan.recompareSampleBufferMinutes, 30);
    assert.deepEqual(report.checkpointPlan.autonomousEvidenceSufficiency, {
      blocker: "insufficientObservationSpan",
      bottleneck: "observationSpanMinutes",
      earliestReviewAt: "2099-01-01T08:00:00.000Z",
      earliestReviewAtKst: "2099-01-01 17:00:00 KST",
      delayMinutes: report.checkpointPlan.autonomousEvidenceSufficiency?.delayMinutes,
      nextReviewCanCompleteAutonomousEvidence: true,
      interpretation:
        "The next completed funding-window refresh is at or after the estimated autonomous evidence sufficiency time.",
    });
    assert.deepEqual(report.checkpointPlan.outstandingOperatorWork, expectedOperatorWork);
	    assert.deepEqual(report.checkpointPlan.outstandingMarketConditionWork, [
	      "wideDisplayedSpread",
	      "currentEntryReportMissing",
	      "selectedFocusMissingFromCurrentEntrySnapshot",
	      "currentEntryTimestampMissing",
	      "selectedFocusCurrentEntryCarryMissing",
	    ]);
    assert.equal(report.checkpointPlan.targetedMarketConditionMonitoring.status, "active");
    assert.equal(report.checkpointPlan.targetedMarketConditionMonitoring.selectedMarket, "KRW-PIEVERSE");
    assert.deepEqual(
      report.checkpointPlan.targetedMarketConditionMonitoring.blockers,
      report.checkpointPlan.outstandingMarketConditionWork,
    );
    assert.equal(
      report.checkpointPlan.targetedMarketConditionMonitoring.action,
      "continue_current_entry_and_spread_monitoring_without_full_live_goal_refresh",
    );
    assert.equal(report.checkpointPlan.targetedMarketConditionMonitoring.canAuthorizeLiveStartup, false);
    assert.ok(
      report.checkpointPlan.targetedMarketConditionMonitoring.commands.includes(
        "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
      ),
    );
    assert.ok(
      report.checkpointPlan.targetedMarketConditionMonitoring.commands.includes(
        "npm run --silent dry-run:refresh-spot-perp-carry-spread-threshold-experiments",
      ),
    );
    assert.ok(
      report.checkpointPlan.targetedMarketConditionMonitoring.commands.includes(
        "npm run --silent dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
      ),
    );
    assert.match(report.checkpointPlan.targetedMarketConditionMonitoring.interpretation, /cannot authorize live startup/);
    assert.match(report.checkpointPlan.reason, /insufficient observation span/);
    assert.doesNotMatch(report.checkpointPlan.reason, /challenger funding/);
    const promptChecklist = new Map(
      report.goalCompletionAuditView.promptToArtifactChecklist.map((check) => [check.id, check]),
    );
    assert.deepEqual(
      (promptChecklist.get("subagent_current_analysis_handoff_reflected") as any)?.evidence
        .explicitSpreadThresholdExperiments,
      [
        {
          sourcePath: spreadExperimentPath,
          market: "KRW-PIEVERSE",
          baselineMaxSpotSpreadBps: 30,
          candidateMaxSpotSpreadBps: 40,
          deltaCandidateMinusBaseline: {
            executionEligibleRate: 0.06,
            spreadRejectedRate: -0.06,
            medianWindowNetCarryBps: -1.22,
            estimatedNetPnlKrwAcrossFundingWindows: -122,
          },
          expectancyImproved: false,
          policyDecision: "do_not_relax_spread_gate_no_expectancy_improvement",
          liveGateImpact: "none_diagnostic_only",
        },
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress summary can fail until live readiness is achieved", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-summary-require-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    writeJson(liveGoalPath, blockedLiveGoal());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as { achieved: boolean; interpretation: string };
    assert.equal(report.achieved, false);
    assert.match(report.interpretation, /not achieved/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress separates selected current-entry spread from broad aggregate spread diagnostics", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-summary-selected-spread-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "live-readiness.json");
    const currentEntryPath = join(directory, "spot-perp-carry-focus-current-entry-25bps-latest.json");
    const freshGeneratedAt = new Date().toISOString();
    const liveGoal = blockedLiveGoal(liveReadinessPath);
    const nextActionPlan = liveGoal.nextActionPlan as Array<Record<string, unknown>>;
    nextActionPlan[0].requiredEvidenceBeforeLive = ["wideDisplayedSpread"];
    liveGoal.carryWatchlist = [
      {
        path: currentEntryPath,
        generatedAt: freshGeneratedAt,
        status: "blocked",
        promotionEligible: false,
        usableForLivePromotion: false,
        summary: {
          spreadControl: {
            passed: false,
            spreadRejectedRate: 0.5,
            maxSpreadRejectionRate: 0.05,
            executionEligibleRate: 0.5,
            minExecutionEligibleRate: 0.95,
            thresholds: {
              maxSpotSpreadBps: 30,
              maxPerpSpreadBps: 10,
              maxUsdtKrwSpreadBps: 20,
            },
            spreadStats: {
              spot: { maxBps: 36 },
            },
          },
        },
        perMarketSummary: [
          {
            market: "KRW-PIEVERSE",
            symbol: "PIEVERSEUSDT",
            positiveRate: 1,
            executionEligibleRate: 1,
            executionEligibleMedianNetCarryBps: 26,
            executionEligibleTotalEstimatedNetPnlKrw: 1300,
            spreadControl: {
              spreadRejectedRate: 0,
            },
          },
          {
            market: "KRW-AZTEC",
            symbol: "AZTECUSDT",
            positiveRate: 0,
            executionEligibleRate: 0,
            executionEligibleMedianNetCarryBps: 42,
            spreadControl: {
              spreadRejectedRate: 1,
            },
          },
        ],
      },
    ];

    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T06:40:00.000Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processHealth: {
        onlineCount: 1,
        waitingRestartCount: 0,
        expectedLoopingObserverCount: 0,
        expectedLoopingObserversWithoutAutorestart: [],
        unstableRestartProcessCount: 0,
      },
    });
    writeJson(liveReadinessPath, {
      generatedAt: "2026-05-14T06:39:00.000Z",
      status: "blocked",
      liveReady: false,
      blockers: ["wideDisplayedSpread"],
      evidence: {
        feeStressReports: [
          {
            summary: {
              spreadControl: {
                passed: false,
                spreadRejectedRate: 0.06,
                maxSpreadRejectionRate: 0.05,
                executionEligibleRate: 0.94,
                minExecutionEligibleRate: 0.95,
                thresholds: {
                  maxSpotSpreadBps: 30,
                  maxPerpSpreadBps: 10,
                  maxUsdtKrwSpreadBps: 20,
                },
              },
            },
          },
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      strategyDecisionView: {
        currentEntrySanityView: {
          currentEntryBlockers: string[];
          selectedMarketCurrentEntrySpreadControl: { passed: boolean };
        };
      };
      marketConditionHandoff: {
        selectedMarketCurrentEntrySpreadControl: { rawPassed: boolean; spreadRejectedRate: number };
        broadCurrentEntrySpreadControl: { rawPassed: boolean; spreadRejectedRate: number };
        spreadBlockerEvidence: {
          breaches: Array<{ source: string }>;
          clearanceProgress: Array<{ source: string; aggregatePassed: boolean }>;
        };
      };
    };
    assert.deepEqual(report.strategyDecisionView.currentEntrySanityView.currentEntryBlockers, []);
    assert.equal(
      report.strategyDecisionView.currentEntrySanityView.selectedMarketCurrentEntrySpreadControl.passed,
      true,
    );
    assert.equal(report.marketConditionHandoff.selectedMarketCurrentEntrySpreadControl.rawPassed, true);
    assert.equal(report.marketConditionHandoff.selectedMarketCurrentEntrySpreadControl.spreadRejectedRate, 0);
    assert.equal(report.marketConditionHandoff.broadCurrentEntrySpreadControl.rawPassed, false);
    assert.equal(report.marketConditionHandoff.broadCurrentEntrySpreadControl.spreadRejectedRate, 0.5);
    assert.ok(
      report.marketConditionHandoff.spreadBlockerEvidence.breaches.every(
        (breach) => breach.source === "liveReadinessSpreadControl",
      ),
    );
    assert.deepEqual(
      report.marketConditionHandoff.spreadBlockerEvidence.clearanceProgress.map((item) => item.source),
      ["selectedMarketCurrentEntrySpreadControl", "liveReadinessSpreadControl"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal progress prioritizes challenger evidence when latest fee-stressed window beats deteriorating focus", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-summary-challenger-priority-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const alignmentPath = join(directory, "alignment.json");
    const liveReadinessPath = join(directory, "live-readiness.json");
    const researchSourcePath = join(directory, "spot-perp-carry-pieverse.json");
    const aztecReadinessPath = join(directory, "spot-perp-carry-aztec-live-readiness-latest.json");
    const liveGoal = blockedLiveGoal(liveReadinessPath, researchSourcePath);
    const manualValidationCommand =
      "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready";
    const sourceCompletionAudit = liveGoal.completionAudit as {
      missingRequirements: string[];
      missingRequirementCount: number;
    };
    sourceCompletionAudit.missingRequirements = [
      ...sourceCompletionAudit.missingRequirements,
      "spotPerpCarryFocusRecompareClear",
      "spotPerpCarryFocusRecompareRequired",
    ];
    sourceCompletionAudit.missingRequirementCount = sourceCompletionAudit.missingRequirements.length;
    liveGoal.liveStartupPlan = {
      ...(liveGoal.liveStartupPlan ?? {}),
      manualValidationCommand,
    };
    liveGoal.switchPlan = {
      bestChallengerLiveReadiness: {
        market: "KRW-AZTEC",
        symbol: "AZTECUSDT",
        status: "blocked",
        liveReady: false,
        sourceReadinessPath: aztecReadinessPath,
        generatedAt: "2026-05-14T06:37:00.000Z",
        blockers: ["market:KRW-AZTEC:requires:spreadControl"],
        requiredBeforeMetricCandidate: ["spreadControl"],
        action: "keep_challenger_research_only_until_live_readiness_clears",
      },
    };
    liveGoal.carryMarketDecisionMatrix = [
      {
        sourcePath: researchSourcePath,
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreObservations,moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreObservations", "moreCompletedFundingEvents"],
        metrics: {
          count: 106,
          completedFundingCount: 4,
          executionEligibleRate: 0.94,
          executionEligibleMedianNetCarryBps: 99.062767,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
      {
        sourcePath: "spot-perp-carry-opportunity.json",
        market: "KRW-AZTEC",
        symbol: "AZTECUSDT",
        status: "collect_more_evidence",
        decision: "continue_until_metric_requirements_clear",
        nextDecisionTrigger: "moreCompletedFundingEvents",
        reasons: [],
        requiredBeforeMetricCandidate: ["moreCompletedFundingEvents", "spreadControl"],
        feeStressEvidence: {
          executionEligibleMedianNetCarryBps: 49.878647,
          executionEligiblePositiveRate: 1,
          failed: false,
          fundingWindowSummary: {
            completedFundingWindowCount: 2,
            medianWindowNetCarryBps: 75,
            windows: [
              {
                market: "KRW-AZTEC",
                symbol: "AZTECUSDT",
                fundingSettledAt: "2026-05-14T00:00:00.000Z",
                sampleCount: 18,
                medianNetCarryBps: 67.116647,
                medianEstimatedNetPnlKrw: 3355.83235,
              },
              {
                market: "KRW-AZTEC",
                symbol: "AZTECUSDT",
                fundingSettledAt: "2026-05-14T04:00:00.000Z",
                sampleCount: 32,
                medianNetCarryBps: 82.883353,
                medianEstimatedNetPnlKrw: 4144.16765,
              },
            ],
          },
        },
        metrics: {
          count: 50,
          completedFundingCount: 2,
          executionEligibleRate: 0.92,
          executionEligibleMedianNetCarryBps: 61.848827,
          executionEligiblePositiveRate: 1,
          depthCoverageRate: 1,
        },
      },
    ];
    liveGoal.carryWatchlist = [
      {
        path: "var/reports/spot-perp-carry-current-carry-discovery-25bps-current.json",
        generatedAt: "2026-05-14T06:41:00.000Z",
        status: "blocked",
        promotionEligible: false,
        usableForLivePromotion: false,
        blockers: ["weakMedianNetCarry", "lowPositiveCarryRate", "wideDisplayedSpread"],
        summary: {
          count: 20,
          completedFundingCount: 1,
          medianNetCarryBps: -1.25,
          executionEligibleMedianNetCarryBps: 0.48,
          positiveRate: 0.2,
          executionEligibleRate: 0.8,
          rawPricingArtifactCount: 0,
          spreadControl: {
            passed: false,
            spreadRejectedRate: 0.05,
          },
        },
        primaryMarketEvidence: {
          market: "KRW-AKT",
          symbol: "AKTUSDT",
          medianNetCarryBps: 50.904492,
          observationCount: 1,
          completedFundingCount: 1,
        },
        topExecutableCarry: [
          {
            capturedAt: "2026-05-14T06:41:00.000Z",
            market: "KRW-AKT",
            symbol: "AKTUSDT",
            netCarryBps: 50.904492,
            estimatedNetPnlKrw: 2545.224615,
            spotSpreadBps: 25.962787,
            perpSpreadBps: 3.802522,
            usdtKrwSpreadBps: 6.740816,
            depthCovered: true,
            fundingSettledAt: "2026-05-14T04:00:00.000Z",
            nextFundingTime: "2026-05-14T08:00:00.000Z",
          },
        ],
        perMarketSummary: [
          {
            market: "KRW-PIEVERSE",
            symbol: "PIEVERSEUSDT",
            positiveRate: 1,
            executionEligibleRate: 1,
            executionEligibleMedianNetCarryBps: 18.5,
            executionEligibleTotalEstimatedNetPnlKrw: 925,
            spreadControl: {
              spreadRejectedRate: 0,
            },
            fundingWindowSummary: {
              completedFundingWindowCount: 1,
              medianWindowNetCarryBps: 18.5,
              medianWindowEstimatedNetPnlKrw: 925,
            },
          },
        ],
      },
    ];
    liveGoal.carryLiveReadinessReports = [
      {
        path: aztecReadinessPath,
        marketKeys: ["KRW-AZTEC:AZTECUSDT"],
        generatedAt: "2026-05-14T06:37:00.000Z",
        liveReady: false,
        readinessGap: {
          observations: {
            current: 57,
            required: 432,
            remaining: 375,
            passed: false,
          },
          observationSpanMinutes: {
            current: 358.603033,
            required: 4320,
            remaining: 3961.396967,
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
          estimatedEarliestReviewAt: "2026-05-17T01:20:05.596Z",
        },
      },
    ];
    writeJson(liveGoalPath, liveGoal);
    writeJson(alignmentPath, {
      generatedAt: "2026-05-14T06:40:00.000Z",
      status: "aligned",
      aligned: true,
      violationCount: 0,
      processHealth: {
        onlineCount: 2,
        waitingRestartCount: 13,
        expectedLoopingObserverCount: 12,
        expectedLoopingObserversWithoutAutorestart: [],
        unstableRestartProcessCount: 0,
      },
    });
    writeJson(liveReadinessPath, {
      generatedAt: "2026-05-14T06:39:00.000Z",
      status: "blocked",
      liveReady: false,
      blockers: ["operationalProof:credentialsMissing"],
      checks: {
        accountFeesConfirmed: false,
        inventoryReady: false,
        hedgeVenueReady: false,
        operationalProofPresent: true,
        operationalProofFresh: true,
        liveExecutionPathReady: true,
      },
      evidence: {
        feeStressReports: [
          {
            generatedAt: "2026-05-14T06:38:00.000Z",
            summary: {
              executionEligibleMedianNetCarryBps: 77.043236,
              executionEligiblePositiveRate: 1,
            },
            fundingWindowSummary: {
              source: "all_execution_eligible_rows_grouped_by_market_symbol_fundingSettledAt",
              completedFundingWindowCount: 4,
              executableSampleCount: 106,
              positiveWindowRate: 1,
              medianWindowNetCarryBps: 73.451194,
              medianWindowCarryPct: 0.734512,
              medianWindowEstimatedNetPnlKrw: 3672.5597,
              estimatedNetPnlKrwAcrossFundingWindows: 14083.79,
              isDeduplicatedByFundingWindow: true,
              isNotRealizedReturn: true,
              windows: [
                {
                  market: "KRW-PIEVERSE",
                  symbol: "PIEVERSEUSDT",
                  fundingSettledAt: "2026-05-13T20:00:00.000Z",
                  sampleCount: 20,
                  medianNetCarryBps: 88,
                  medianEstimatedNetPnlKrw: 4400,
                },
                {
                  market: "KRW-PIEVERSE",
                  symbol: "PIEVERSEUSDT",
                  fundingSettledAt: "2026-05-14T00:00:00.000Z",
                  sampleCount: 40,
                  medianNetCarryBps: 71.180776,
                  medianEstimatedNetPnlKrw: 3559.0388,
                },
                {
                  market: "KRW-PIEVERSE",
                  symbol: "PIEVERSEUSDT",
                  fundingSettledAt: "2026-05-14T04:00:00.000Z",
                  sampleCount: 46,
                  medianNetCarryBps: 41.977606,
                  medianEstimatedNetPnlKrw: 2098.8803,
                },
              ],
            },
          },
        ],
      },
    });
    writeJson(aztecReadinessPath, {
      generatedAt: "2026-05-14T06:37:00.000Z",
      status: "blocked",
      liveReady: false,
      blockers: ["market:KRW-AZTEC:requires:spreadControl"],
      requiredBeforeMetricCandidate: ["spreadControl"],
      evidence: {
        feeStressReports: [
          {
            generatedAt: "2026-05-14T06:36:00.000Z",
            summary: {
              spreadControl: {
                passed: false,
                required: true,
                spreadRejectedRate: 0.14,
                executionEligibleRate: 0.86,
                minExecutionEligibleRate: 0.95,
                maxSpreadRejectionRate: 0.05,
                thresholds: {
                  maxSpotSpreadBps: 30,
                  maxPerpSpreadBps: 10,
                  maxUsdtKrwSpreadBps: 20,
                },
                rejectionReasons: {
                  spotSpreadTooWide: 7,
                  perpSpreadTooWide: 0,
                  usdtKrwSpreadTooWide: 0,
                },
                spreadStats: {
                  spot: {
                    medianBps: 24,
                    p90Bps: 35,
                    maxBps: 42,
                  },
                },
                fundingWindows: [
                  {
                    fundingSettledAt: "2026-05-14T04:00:00.000Z",
                    sampleCount: 32,
                    spreadRejectedRate: 0,
                    spreadStats: {
                      spot: {
                        medianBps: 24,
                        p90Bps: 24,
                        maxBps: 24,
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });
    writeJson(researchSourcePath, {
      generatedAt: "2026-05-14T06:39:30.000Z",
      status: "blocked",
      promotionEligible: false,
      observationCount: 106,
      assumptions: {
        notionalKrw: 500000,
      },
      summary: {
        completedFundingCount: 4,
        executionEligibleMedianNetCarryBps: 99.062767,
        executionEligiblePositiveRate: 1,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      achieved: boolean;
      live: {
        liveReady: boolean;
        liveStartupAllowed: boolean;
        selectedLiveCandidate: unknown;
        startupPlan: {
          status: string;
          gateCommand: string;
          reviewCommand: string | null;
          pm2StartCommand: string | null;
          orderSubmissionDefault: string;
          hardStops: string[];
          blockedReason?: string;
          blockedCommands?: {
            reviewCommand: string | null;
            pm2StartCommand: string | null;
            manualValidationCommand?: string | null;
          };
          currentFocusLiveStartupCaution?: {
            action?: string;
            challengerMarket?: string;
          };
        };
      };
      goalCompletionAuditView: {
        achieved: boolean;
        successCriteria: Array<{
          id: string;
          passed: boolean;
          evidence: {
            currentFocusLiveStartupCaution?: {
              action?: string;
              challengerMarket?: string;
            } | null;
          };
        }>;
        promptToArtifactChecklist: Array<{
          id: string;
          status: string;
          artifactPaths: string[];
          command: string | null;
          evidence: {
            reviewCommand?: string | null;
            pm2StartCommand?: string | null;
            blockedCommands?: {
              reviewCommand: string | null;
              pm2StartCommand: string | null;
              manualValidationCommand?: string | null;
            } | null;
            currentFocusLiveStartupCaution?: {
              action?: string;
              challengerMarket?: string;
            } | null;
          };
          gap: string | null;
        }>;
	      };
      completionAuditSummary: {
        missingRequirementClassification: Record<string, string[]>;
      };
	      operatorLiveReadinessHandoff: {
	        verificationCommands: {
	          reviewCommand: string | null;
	          gateCommand: string;
	          pm2StartCommandAfterAllGatesPass: string | null;
	        };
	        blockedCommands: {
	          reviewCommand: string | null;
	          pm2StartCommand: string | null;
            manualValidationCommand?: string | null;
            } | null;
	        hardStops: string[];
	      };
	      profitabilityReturnView: {
        feeStressFundingWindowTrendView: {
          consecutiveDeterioratingWindowCount: number;
          latestVsPeakMedianNetCarryBps: number;
          degradationSeverity: string;
          demotionGate: {
            estimatedNextFundingSettledAt: string;
            currentLatestMedianNetCarryBps: number;
            mustExceedLatestMedianNetCarryBpsToRecover: number;
            lowCarryDemotionThresholdBps: number;
          };
          action: string;
        };
      };
      nextWorkClassification: {
        recommendedAutonomousAction: string;
        recommendedLiveAction: string;
        canStartLiveWithoutOperatorInput: boolean;
        strategyEvidencePriority: string;
        focusEvidencePriority: string;
        currentFocusDegradationEvidence: {
          action: string;
          degradationSeverity: string;
          consecutiveDeterioratingWindowCount: number;
          reviewCommand: string;
          evidenceCommands: string[];
          replacementCandidateQueue: Array<{
            market: string;
            comparisonCarryBps: number;
            priorityBlocker: string;
            action: string;
          }>;
          demotionGate: {
            estimatedNextFundingSettledAt: string;
            mustExceedLatestMedianNetCarryBpsToRecover: number;
          };
        };
        priorityMarket: string;
        currentFocusLiveStartupCaution: {
          currentFocusMarket: string;
          latestVsPreviousMedianNetCarryBps: number;
          latestVsOverallMedianNetCarryBps: number;
          latestWindowDeteriorating: boolean;
          consecutiveDeterioratingWindowCount: number;
          latestVsPeakMedianNetCarryBps: number;
          degradationSeverity: string;
          trendAction: string;
          challengerMarket: string;
          latestFeeStressWindowDeltaToCurrentFocusBps: number;
          latestFeeStressWindowSampleQualityPasses: boolean;
          minLatestFeeStressWindowSampleCount: number;
          currentFocusLatestWindowSampleCount: number;
          challengerLatestWindowSampleCount: number;
          action: string;
          reason: string;
        };
        priorityFundingWindowEvidence: {
          market: string;
          symbol: string;
          completedFundingWindowCount: number;
          requiredFundingWindowCount: number;
          remainingFundingWindowCount: number;
          latestCompletedFundingSettledAt: string;
          estimatedFundingWindowIntervalMinutes: number;
          estimatedNextFundingSettledAt: string;
          estimatedEarliestFundingWindowReviewAt: string;
          estimatedEarliestLiveReadinessReviewAt: string;
          estimatedEarliestSwitchReviewAt: string;
          switchReviewGate: string;
          liveReadinessReviewBottleneck: string;
          liveReadinessReviewDominatesFundingWindowReview: boolean;
          liveReadinessGap: Record<string, unknown>;
          latestFeeStressWindowDeltaToCurrentFocusBps: number;
          latestFeeStressWindowBeatsCurrentFocus: boolean;
          latestFeeStressWindowSampleQualityPasses: boolean;
          minLatestFeeStressWindowSampleCount: number;
          currentFocusLatestWindowSampleCount: number;
          challengerLatestWindowSampleCount: number;
          evidenceAction: string;
          evidenceCommands: string[];
          estimateCaveat: string;
        };
        currentEntryEvidencePriority: string;
        currentEntryEvidenceAction: string;
        currentEntrySanityView: {
          status: string;
          selectedMarket: string;
          preferredSourcePath: string;
          currentEntryBlockers: string[];
          selectedMarketCurrentEntrySnapshot: {
            source: string;
            market: string;
            symbol: string;
            netCarryBps: number;
            estimatedNetPnlKrw: number;
          };
        };
      };
      nextAutonomousWork: string[];
      strategyDecisionView: {
		    currentEntrySanityView: {
		      status: string;
		      preferredSourceKind: string;
		      currentEntryBlockers: string[];
		      currentEntryEvidenceTimestamp: string;
		      maxCurrentEntryEvidenceAgeMinutes: number;
          currentEntryCarryGate: Record<string, unknown>;
		    };
        challengerSwitchDecision: {
          action: string;
          reason: string;
          bestChallengerMarket: string;
          challengerHasEnoughFundingWindows: boolean;
          latestFeeStressWindowComparison: {
            deltaToCurrentFocusBps: number;
            bestChallengerBeatsCurrentFocus: boolean;
            action: string;
          };
        };
        reducedActivityGuardrail: {
          status: string;
          currentFocus: {
            market: string;
            executionEligibleRate: number;
            executionEligibleRateMeetsLiveGate: boolean;
            spreadRejectionMeetsLiveGate: boolean;
          };
          bestChallenger: {
            market: string;
            executionEligibleRate: number;
            executionEligibleRateMeetsLiveGate: boolean;
          };
          warnings: string[];
	          interpretation: string;
	        };
	      };
      marketConditionHandoff: {
        currentEntryCarryGate: Record<string, unknown>;
      };
      strategyResearchHandoff: {
        researchFocusSpreadControl: {
          action: string;
          bestChallengerSpreadControl: {
            passed: boolean;
            spreadRejectedRate: number;
            executionEligibleRate: number;
            latestWindow: {
              fundingSettledAt: string;
              sampleCount: number;
            };
          };
          blockerEvidence: Array<{ metric: string }>;
        };
        bestChallengerLiveReadiness: {
          action: string;
          spreadControl: {
            spreadRejectedRate: number;
          };
        };
      };
	    };

    assert.equal(report.achieved, false);
    assert.equal(report.live.liveReady, false);
    assert.equal(report.live.liveStartupAllowed, false);
    assert.equal(report.live.selectedLiveCandidate, null);
    assert.equal(report.live.startupPlan.status, "blocked_current_focus_recompare_required");
    assert.equal(report.live.startupPlan.gateCommand, "npm run dry-run:gate-live-goal-ready");
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.consecutiveDeterioratingWindowCount,
      2,
    );
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.latestVsPeakMedianNetCarryBps,
      -46.022394,
    );
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.degradationSeverity,
      "multi_window_degradation",
    );
    assert.deepEqual(
      {
        estimatedNextFundingSettledAt:
          report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate.estimatedNextFundingSettledAt,
        currentLatestMedianNetCarryBps:
          report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate.currentLatestMedianNetCarryBps,
        mustExceedLatestMedianNetCarryBpsToRecover:
          report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate
            .mustExceedLatestMedianNetCarryBpsToRecover,
        lowCarryDemotionThresholdBps:
          report.profitabilityReturnView.feeStressFundingWindowTrendView.demotionGate.lowCarryDemotionThresholdBps,
      },
      {
        estimatedNextFundingSettledAt: "2026-05-14T08:00:00.000Z",
        currentLatestMedianNetCarryBps: 41.977606,
        mustExceedLatestMedianNetCarryBpsToRecover: 41.977606,
        lowCarryDemotionThresholdBps: 20,
      },
    );
    assert.equal(
      report.profitabilityReturnView.feeStressFundingWindowTrendView.action,
      "prepare_focus_demotion_if_next_window_does_not_recover",
    );
	    assert.equal(report.live.startupPlan.reviewCommand, null);
	    assert.equal(report.live.startupPlan.pm2StartCommand, null);
	    assert.equal(report.operatorLiveReadinessHandoff.verificationCommands.reviewCommand, null);
	    assert.equal(
	      report.operatorLiveReadinessHandoff.verificationCommands.pm2StartCommandAfterAllGatesPass,
	      null,
	    );
	    assert.deepEqual(report.operatorLiveReadinessHandoff.blockedCommands, {
	      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
	      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
        manualValidationCommand,
	      reason:
	        "Current focus is deteriorating in the latest fee-stressed funding window while the priority challenger beat it in that same window.",
	    });
	    assert.ok(
	      report.operatorLiveReadinessHandoff.hardStops.includes(
		        "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.",
	      ),
	    );
	    assert.equal(report.live.startupPlan.orderSubmissionDefault, "disabled");
    assert.equal(
      report.live.startupPlan.blockedReason,
      "Current focus is deteriorating in the latest fee-stressed funding window while the priority challenger beat it in that same window.",
    );
    assert.deepEqual(report.live.startupPlan.blockedCommands, {
      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      manualValidationCommand,
    });
    assert.equal(
      report.live.startupPlan.currentFocusLiveStartupCaution?.action,
      "do_not_prepare_current_focus_live_startup_until_recompare_clears",
    );
    assert.equal(report.live.startupPlan.currentFocusLiveStartupCaution?.challengerMarket, "KRW-AZTEC");
    assert.ok(
      report.live.startupPlan.hardStops.includes(
        "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.",
      ),
    );
    assert.equal(report.strategyDecisionView.reducedActivityGuardrail.status, "active");
    assert.equal(report.strategyDecisionView.reducedActivityGuardrail.currentFocus.market, "KRW-PIEVERSE");
    assert.equal(
      report.strategyDecisionView.reducedActivityGuardrail.currentFocus.executionEligibleRateMeetsLiveGate,
      false,
    );
    assert.equal(report.strategyDecisionView.reducedActivityGuardrail.bestChallenger.market, "KRW-AZTEC");
    assert.equal(
      report.strategyDecisionView.reducedActivityGuardrail.bestChallenger.executionEligibleRateMeetsLiveGate,
      false,
    );
    assert.ok(
      report.strategyDecisionView.reducedActivityGuardrail.warnings.includes(
        "best_challenger_below_live_execution_eligible_rate",
      ),
    );
    assert.match(
      report.strategyDecisionView.reducedActivityGuardrail.interpretation,
      /cannot authorize live startup/,
    );
    assert.equal(report.goalCompletionAuditView.achieved, false);
    const completionCriteria = new Map(
      report.goalCompletionAuditView.successCriteria.map((criterion) => [criterion.id, criterion]),
    );
    const promptChecklist = new Map(
      report.goalCompletionAuditView.promptToArtifactChecklist.map((check) => [check.id, check]),
    );
    const reducedActivityChecklist = promptChecklist.get("reduced_activity_guardrail_enforced") as any;
    assert.equal(completionCriteria.get("reduced_activity_guardrail_enforced")?.passed, true);
    assert.equal(reducedActivityChecklist?.status, "passed");
    assert.equal(
      reducedActivityChecklist?.evidence.bestChallenger.market,
      "KRW-AZTEC",
    );
    assert.ok(
      reducedActivityChecklist?.evidence.warnings.includes(
        "best_challenger_below_live_execution_eligible_rate",
      ),
    );
    assert.equal(promptChecklist.get("current_entry_sanity_checked")?.status, "blocked");
    assert.equal(
      promptChecklist.get("current_entry_sanity_checked")?.gap,
      "current_entry_snapshot_does_not_clear_live_sanity",
    );
    assert.equal(completionCriteria.get("current_entry_sanity_clear")?.passed, false);
    assert.equal(promptChecklist.get("live_startup_method_documented")?.status, "blocked");
    assert.equal(promptChecklist.get("subagent_current_analysis_handoff_reflected")?.status, "passed");
    assert.equal(
      (promptChecklist.get("subagent_current_analysis_handoff_reflected") as any)?.evidence.strategyStatus,
      "challenger_evidence_required",
    );
    assert.deepEqual(promptChecklist.get("live_startup_method_documented")?.artifactPaths, [
      "var/reports/live-goal-progress-summary-latest.json",
    ]);
    assert.equal(
      promptChecklist.get("live_startup_method_documented")?.command,
      "npm run dry-run:gate-live-goal-ready",
    );
    assert.equal(promptChecklist.get("live_startup_method_documented")?.evidence.reviewCommand, null);
    assert.equal(promptChecklist.get("live_startup_method_documented")?.evidence.pm2StartCommand, null);
    assert.deepEqual(promptChecklist.get("live_startup_method_documented")?.evidence.blockedCommands, {
      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      manualValidationCommand,
    });
    assert.equal(
      promptChecklist.get("live_startup_method_documented")?.evidence.currentFocusLiveStartupCaution?.action,
      "do_not_prepare_current_focus_live_startup_until_recompare_clears",
    );
    assert.equal(
      promptChecklist.get("live_startup_method_documented")?.gap,
      "current_focus_requires_fee_stressed_challenger_recompare",
    );
    assert.equal(completionCriteria.get("no_current_focus_recompare_caution")?.passed, false);
    assert.ok(
      report.completionAuditSummary.missingRequirementClassification.marketConditions.includes(
        "spotPerpCarryFocusRecompareClear",
      ),
    );
    assert.ok(
      report.completionAuditSummary.missingRequirementClassification.marketConditions.includes(
        "spotPerpCarryFocusRecompareRequired",
      ),
    );
    assert.ok(
      !report.completionAuditSummary.missingRequirementClassification.other.some((requirement) =>
        requirement.startsWith("spotPerpCarryFocusRecompare"),
      ),
    );
    assert.deepEqual(
      completionCriteria.get("no_current_focus_recompare_caution")?.evidence.currentFocusLiveStartupCaution,
      {
        currentFocusMarket: "KRW-PIEVERSE",
        currentFocusLatestWindow: {
          fundingSettledAt: "2026-05-14T04:00:00.000Z",
          sampleCount: 46,
          medianNetCarryBps: 41.977606,
          medianEstimatedNetPnlKrw: 2098.8803,
        },
        latestVsPreviousMedianNetCarryBps: -29.203169999999993,
        latestVsOverallMedianNetCarryBps: -31.473588,
        latestWindowDeteriorating: true,
        consecutiveDeterioratingWindowCount: 2,
        latestVsPeakMedianNetCarryBps: -46.022394,
        degradationSeverity: "multi_window_degradation",
        trendAction: "prepare_focus_demotion_if_next_window_does_not_recover",
        demotionGate: {
          reviewTrigger: "next_completed_fee_stressed_funding_window",
          latestFundingSettledAt: "2026-05-14T04:00:00.000Z",
          estimatedNextFundingSettledAt: "2026-05-14T08:00:00.000Z",
          currentLatestMedianNetCarryBps: 41.977606,
          previousMedianNetCarryBps: 71.180776,
          mustExceedLatestMedianNetCarryBpsToRecover: 41.977606,
          lowCarryDemotionThresholdBps: 20,
          demotionCondition:
            "prepare demotion if the next completed fee-stressed funding window does not exceed the current latest median carry, or if it falls below the live-promotion carry threshold",
          recoveryCondition:
            "clear the demotion preparation only if the next completed fee-stressed funding window exceeds the current latest median carry and stays above the live-promotion carry threshold",
        },
        challengerMarket: "KRW-AZTEC",
        challengerLatestWindow: {
          fundingSettledAt: "2026-05-14T04:00:00.000Z",
          sampleCount: 32,
          medianNetCarryBps: 82.883353,
          medianEstimatedNetPnlKrw: 4144.16765,
        },
        latestFeeStressWindowDeltaToCurrentFocusBps: 40.905747,
        latestFeeStressWindowSampleQualityPasses: true,
        minLatestFeeStressWindowSampleCount: 5,
        currentFocusLatestWindowSampleCount: 46,
        challengerLatestWindowSampleCount: 32,
        action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
        reason:
          "Current focus is deteriorating in the latest fee-stressed funding window while the priority challenger beat it in that same window.",
      },
    );
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.action, "collect_challenger_funding_evidence");
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.reason,
      "best_challenger_needs_more_completed_funding_events",
    );
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.bestChallengerMarket, "KRW-AZTEC");
    assert.equal(report.strategyDecisionView.currentEntrySanityView.status, "current_entry_blocked_or_diagnostic_only");
    assert.equal(report.strategyDecisionView.currentEntrySanityView.preferredSourceKind, "current_carry_fee_stress");
    assert.deepEqual(report.strategyDecisionView.currentEntrySanityView.currentEntryBlockers, [
      "staleCurrentEntrySnapshot",
      "selectedFocusCurrentEntryCarryBelowLiveThreshold",
    ]);
    assert.deepEqual(report.strategyDecisionView.currentEntrySanityView.currentEntryCarryGate, {
      minNetCarryBps: 20,
      selectedNetCarryBps: 18.5,
      deltaToThresholdBps: -1.5,
      passed: false,
    });
    assert.deepEqual(report.marketConditionHandoff.currentEntryCarryGate, {
      minNetCarryBps: 20,
      selectedNetCarryBps: 18.5,
      deltaToThresholdBps: -1.5,
      passed: false,
    });
    assert.equal(
      report.strategyDecisionView.currentEntrySanityView.currentEntryEvidenceTimestamp,
      "2026-05-14T06:41:00.000Z",
	    );
	    assert.equal(report.strategyDecisionView.currentEntrySanityView.maxCurrentEntryEvidenceAgeMinutes, 30);
    assert.equal(report.strategyDecisionView.challengerSwitchDecision.challengerHasEnoughFundingWindows, false);
    assert.equal(
      report.strategyResearchHandoff.researchFocusSpreadControl.action,
      "keep_research_focus_recompare_blocked_until_challenger_spread_control_clears",
    );
    assert.equal(
      report.strategyResearchHandoff.researchFocusSpreadControl.bestChallengerSpreadControl.passed,
      false,
    );
    assert.equal(
      report.strategyResearchHandoff.researchFocusSpreadControl.bestChallengerSpreadControl.spreadRejectedRate,
      0.14,
    );
    assert.equal(
      report.strategyResearchHandoff.researchFocusSpreadControl.bestChallengerSpreadControl.executionEligibleRate,
      0.86,
    );
    assert.equal(
      report.strategyResearchHandoff.researchFocusSpreadControl.bestChallengerSpreadControl.latestWindow.sampleCount,
      32,
    );
    assert.deepEqual(
      report.strategyResearchHandoff.researchFocusSpreadControl.blockerEvidence.map((item) => item.metric),
      ["spreadRejectedRate", "executionEligibleRate", "spotMaxSpreadBps"],
    );
    assert.equal(
      report.strategyResearchHandoff.bestChallengerLiveReadiness.spreadControl.spreadRejectedRate,
      0.14,
    );
    assert.equal(
      report.strategyResearchHandoff.bestChallengerLiveReadiness.action,
      "keep_challenger_research_only_until_live_readiness_clears",
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.deltaToCurrentFocusBps,
      40.905747,
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.bestChallengerBeatsCurrentFocus,
      true,
    );
    assert.equal(
      report.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.action,
      "collect_challenger_funding_evidence_for_latest_window_advantage",
    );
    assert.equal(
      report.nextWorkClassification.recommendedAutonomousAction,
      "prepare_current_focus_demotion_if_next_window_does_not_recover_and_continue_broad_opportunity_observation",
    );
    assert.equal(
      report.nextWorkClassification.recommendedLiveAction,
      "keep_current_focus_live_startup_blocked_until_recompare_clears",
    );
    assert.equal(report.nextWorkClassification.canStartLiveWithoutOperatorInput, false);
    assert.equal(report.nextWorkClassification.focusEvidencePriority, "current_focus_multi_window_degradation");
    assert.equal(report.nextWorkClassification.currentEntryEvidencePriority, "current_entry_snapshot_sanity_blocked");
    assert.equal(
      report.nextWorkClassification.currentEntryEvidenceAction,
      "keep_live_blocked_and_continue_current_entry_discovery",
    );
    assert.equal(report.nextWorkClassification.currentEntrySanityView.selectedMarket, "KRW-PIEVERSE");
    assert.equal(
      report.nextWorkClassification.currentEntrySanityView.selectedMarketCurrentEntrySnapshot.netCarryBps,
      18.5,
    );
    assert.equal(
      report.nextWorkClassification.currentFocusDegradationEvidence.action,
      "prepare_focus_demotion_if_next_window_does_not_recover",
    );
    assert.equal(
      report.nextWorkClassification.currentFocusDegradationEvidence.degradationSeverity,
      "multi_window_degradation",
    );
    assert.equal(report.nextWorkClassification.currentFocusDegradationEvidence.consecutiveDeterioratingWindowCount, 2);
    assert.equal(
      report.nextWorkClassification.currentFocusDegradationEvidence.reviewCommand,
      "npm run dry-run:refresh-live-goal-status",
    );
    assert.deepEqual(report.nextWorkClassification.currentFocusDegradationEvidence.evidenceCommands, [
      "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
      "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
      "npm run dry-run:refresh-live-goal-status",
    ]);
    assert.deepEqual(
      report.nextWorkClassification.currentFocusDegradationEvidence.replacementCandidateQueue
        .slice(0, 2)
        .map((candidate) => ({
          market: candidate.market,
          comparisonCarryBps: candidate.comparisonCarryBps,
          priorityBlocker: candidate.priorityBlocker,
          action: candidate.action,
        })),
      [
        {
          market: "KRW-AZTEC",
          comparisonCarryBps: 75,
          priorityBlocker: "spread_control_blocked",
          action: "do_not_switch_until_spread_control_clears",
        },
      ],
    );
    assert.equal(
      report.nextWorkClassification.currentFocusDegradationEvidence.demotionGate.estimatedNextFundingSettledAt,
      "2026-05-14T08:00:00.000Z",
    );
    assert.equal(
      report.nextWorkClassification.currentFocusDegradationEvidence.demotionGate
        .mustExceedLatestMedianNetCarryBpsToRecover,
      41.977606,
    );
    assert.equal(
      report.nextWorkClassification.strategyEvidencePriority,
      "challenger_latest_fee_stress_window_spread_gap",
    );
	    assert.ok(report.nextAutonomousWork.includes("collectChallengerFundingEvidence"));
	    assert.equal(report.nextWorkClassification.priorityMarket, "KRW-AZTEC");
	    const priorityFundingWindowEvidence = report.nextWorkClassification.priorityFundingWindowEvidence as any;
	    assert.deepEqual({
	      market: priorityFundingWindowEvidence.market,
	      symbol: priorityFundingWindowEvidence.symbol,
	      completedFundingWindowCount: priorityFundingWindowEvidence.completedFundingWindowCount,
	      requiredFundingWindowCount: priorityFundingWindowEvidence.requiredFundingWindowCount,
	      remainingFundingWindowCount: priorityFundingWindowEvidence.remainingFundingWindowCount,
	      latestCompletedFundingSettledAt: priorityFundingWindowEvidence.latestCompletedFundingSettledAt,
	      estimatedFundingWindowIntervalMinutes:
	        priorityFundingWindowEvidence.estimatedFundingWindowIntervalMinutes,
	      estimatedNextFundingSettledAt: priorityFundingWindowEvidence.estimatedNextFundingSettledAt,
	      estimatedEarliestFundingWindowReviewAt:
	        priorityFundingWindowEvidence.estimatedEarliestFundingWindowReviewAt,
	      estimatedEarliestLiveReadinessReviewAt:
	        priorityFundingWindowEvidence.estimatedEarliestLiveReadinessReviewAt,
	      estimatedEarliestSwitchReviewAt: priorityFundingWindowEvidence.estimatedEarliestSwitchReviewAt,
	      switchReviewGate: priorityFundingWindowEvidence.switchReviewGate,
	      liveReadinessReviewBottleneck: priorityFundingWindowEvidence.liveReadinessReviewBottleneck,
	      liveReadinessReviewDominatesFundingWindowReview:
	        priorityFundingWindowEvidence.liveReadinessReviewDominatesFundingWindowReview,
	      liveReadinessGap: priorityFundingWindowEvidence.liveReadinessGap,
	      latestFeeStressWindowDeltaToCurrentFocusBps:
	        priorityFundingWindowEvidence.latestFeeStressWindowDeltaToCurrentFocusBps,
	      latestFeeStressFundingWindowAligned:
	        priorityFundingWindowEvidence.latestFeeStressFundingWindowAligned,
	      currentFocusLatestFundingSettledAt:
	        priorityFundingWindowEvidence.currentFocusLatestFundingSettledAt,
	      challengerLatestFundingSettledAt:
	        priorityFundingWindowEvidence.challengerLatestFundingSettledAt,
	      latestFeeStressWindowBeatsCurrentFocus:
	        priorityFundingWindowEvidence.latestFeeStressWindowBeatsCurrentFocus,
	      latestFeeStressWindowSampleQualityPasses:
	        priorityFundingWindowEvidence.latestFeeStressWindowSampleQualityPasses,
	      minLatestFeeStressWindowSampleCount:
	        priorityFundingWindowEvidence.minLatestFeeStressWindowSampleCount,
	      currentFocusLatestWindowSampleCount:
	        priorityFundingWindowEvidence.currentFocusLatestWindowSampleCount,
	      challengerLatestWindowSampleCount:
	        priorityFundingWindowEvidence.challengerLatestWindowSampleCount,
	      evidenceAction: priorityFundingWindowEvidence.evidenceAction,
	      evidenceCommands: priorityFundingWindowEvidence.evidenceCommands,
	      estimateCaveat: priorityFundingWindowEvidence.estimateCaveat,
	    }, {
	      market: "KRW-AZTEC",
	      symbol: "AZTECUSDT",
      completedFundingWindowCount: 2,
      requiredFundingWindowCount: 6,
      remainingFundingWindowCount: 4,
      latestCompletedFundingSettledAt: "2026-05-14T04:00:00.000Z",
      estimatedFundingWindowIntervalMinutes: 240,
      estimatedNextFundingSettledAt: "2026-05-14T08:00:00.000Z",
      estimatedEarliestFundingWindowReviewAt: "2026-05-14T20:00:00.000Z",
      estimatedEarliestLiveReadinessReviewAt: "2026-05-17T01:20:05.596Z",
      estimatedEarliestSwitchReviewAt: "2026-05-17T01:20:05.596Z",
      switchReviewGate: "funding_windows_and_live_readiness",
      liveReadinessReviewBottleneck: "observationSpanMinutes",
      liveReadinessReviewDominatesFundingWindowReview: true,
      liveReadinessGap: {
        observations: {
          current: 57,
          required: 432,
          remaining: 375,
          passed: false,
        },
        observationSpanMinutes: {
          current: 358.603033,
          required: 4320,
          remaining: 3961.396967,
          passed: false,
        },
        completedFundingEvents: {
          current: 2,
          required: 6,
          remaining: 4,
          passed: false,
        },
      },
      latestFeeStressWindowDeltaToCurrentFocusBps: 40.905747,
      latestFeeStressFundingWindowAligned: true,
      currentFocusLatestFundingSettledAt: "2026-05-14T04:00:00.000Z",
      challengerLatestFundingSettledAt: "2026-05-14T04:00:00.000Z",
      latestFeeStressWindowBeatsCurrentFocus: true,
      latestFeeStressWindowSampleQualityPasses: true,
      minLatestFeeStressWindowSampleCount: 5,
      currentFocusLatestWindowSampleCount: 46,
      challengerLatestWindowSampleCount: 32,
	      evidenceAction: "collect_spread_quality_and_remaining_fee_stressed_funding_windows_before_switch_review",
	      evidenceCommands: [
	        "npm run dry-run:observe-spot-perp-carry-opportunity-72h",
        "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
        "npm run dry-run:refresh-spot-perp-carry-aztec-live-readiness",
        "npm run dry-run:refresh-live-goal-status",
      ],
	      estimateCaveat:
	        "Funding-window timing is only one gate; switch review also requires the challenger live-readiness timeline, operational proof, and fresh fee-stressed evidence.",
	    });
	    assert.equal(priorityFundingWindowEvidence.challengerSpreadControlPasses, false);
	    assert.equal(priorityFundingWindowEvidence.challengerSpreadRejectedRate, 0.14);
	    assert.equal(priorityFundingWindowEvidence.challengerExecutionEligibleRate, 0.86);
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.currentFocusMarket,
      "KRW-PIEVERSE",
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.latestVsPreviousMedianNetCarryBps,
      -29.203169999999993,
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.latestVsOverallMedianNetCarryBps,
      -31.473588,
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.latestWindowDeteriorating,
      true,
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.consecutiveDeterioratingWindowCount,
      2,
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.latestVsPeakMedianNetCarryBps,
      -46.022394,
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.degradationSeverity,
      "multi_window_degradation",
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.trendAction,
      "prepare_focus_demotion_if_next_window_does_not_recover",
    );
    assert.equal(report.nextWorkClassification.currentFocusLiveStartupCaution.challengerMarket, "KRW-AZTEC");
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.latestFeeStressWindowDeltaToCurrentFocusBps,
      40.905747,
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.action,
      "do_not_prepare_current_focus_live_startup_until_recompare_clears",
    );
    assert.equal(
      report.nextWorkClassification.currentFocusLiveStartupCaution.reason,
      "Current focus is deteriorating in the latest fee-stressed funding window while the priority challenger beat it in that same window.",
    );

    const unsyncedLiveGoal = JSON.parse(JSON.stringify(liveGoal)) as Record<string, unknown>;
    const unsyncedDecisionMatrix = unsyncedLiveGoal.carryMarketDecisionMatrix as Array<{
      market?: string;
      feeStressEvidence?: { fundingWindowSummary?: { windows?: Array<{ fundingSettledAt?: string }> } };
    }>;
    const unsyncedAztec = unsyncedDecisionMatrix.find((row) => row.market === "KRW-AZTEC");
    assert.ok(unsyncedAztec);
    const unsyncedAztecWindows = unsyncedAztec.feeStressEvidence?.fundingWindowSummary?.windows;
    assert.ok(unsyncedAztecWindows);
    unsyncedAztecWindows.splice(1, 1);
    writeJson(liveGoalPath, unsyncedLiveGoal);

    const unsyncedResult = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(unsyncedResult.status, 0, unsyncedResult.stderr);
    const unsyncedReport = JSON.parse(unsyncedResult.stdout) as {
      nextWorkClassification: {
        strategyEvidencePriority: string;
        priorityReason: string;
        priorityFundingWindowEvidence: {
          latestFeeStressFundingWindowAligned: boolean;
          latestFeeStressWindowDeltaToCurrentFocusBps: number | null;
          currentFocusLatestFundingSettledAt: string;
          challengerLatestFundingSettledAt: string;
          evidenceAction: string;
        };
        currentFocusLiveStartupCaution?: unknown;
      };
    };
    assert.equal(
      unsyncedReport.nextWorkClassification.strategyEvidencePriority,
      "challenger_latest_fee_stress_window_alignment_gap",
    );
    assert.match(unsyncedReport.nextWorkClassification.priorityReason, /same latest completed/);
    assert.equal(
      unsyncedReport.nextWorkClassification.priorityFundingWindowEvidence
        .latestFeeStressFundingWindowAligned,
      false,
    );
    assert.equal(
      unsyncedReport.nextWorkClassification.priorityFundingWindowEvidence
        .latestFeeStressWindowDeltaToCurrentFocusBps,
      null,
    );
    assert.equal(
      unsyncedReport.nextWorkClassification.priorityFundingWindowEvidence
        .currentFocusLatestFundingSettledAt,
      "2026-05-14T04:00:00.000Z",
    );
    assert.equal(
      unsyncedReport.nextWorkClassification.priorityFundingWindowEvidence
        .challengerLatestFundingSettledAt,
      "2026-05-14T00:00:00.000Z",
    );
    assert.equal(
      unsyncedReport.nextWorkClassification.priorityFundingWindowEvidence.evidenceAction,
      "collect_synchronized_fee_stressed_funding_window_before_switch_review",
    );
    assert.equal(unsyncedReport.nextWorkClassification.currentFocusLiveStartupCaution, undefined);

	    const spreadGapLiveGoal = JSON.parse(JSON.stringify(liveGoal)) as Record<string, unknown>;
	    const spreadGapReports = spreadGapLiveGoal.carryLiveReadinessReports as Array<Record<string, unknown>>;
	    spreadGapReports[0].evidence = {
      feeStressReports: [
        {
          summary: {
            spreadControl: {
              passed: false,
              required: true,
              spreadRejectedRate: 0.15,
              executionEligibleRate: 0.85,
              minExecutionEligibleRate: 0.95,
              maxSpreadRejectionRate: 0.05,
              thresholds: {
                maxSpotSpreadBps: 30,
                maxPerpSpreadBps: 10,
                maxUsdtKrwSpreadBps: 20,
              },
              rejectionReasons: {
                spotSpreadTooWide: 8,
                perpSpreadTooWide: 1,
                usdtKrwSpreadTooWide: 0,
              },
              fundingWindows: [
                {
                  fundingSettledAt: "2026-05-14T00:00:00.000Z",
                  sampleCount: 18,
                  spreadRejectedCount: 1,
                  spreadRejectedRate: 0.055556,
                  rejectionReasons: {
                    spotSpreadTooWide: 1,
                    perpSpreadTooWide: 0,
                    usdtKrwSpreadTooWide: 0,
                  },
                },
                {
                  fundingSettledAt: "2026-05-14T04:00:00.000Z",
                  sampleCount: 32,
                  spreadRejectedCount: 8,
                  spreadRejectedRate: 0.25,
                  rejectionReasons: {
                    spotSpreadTooWide: 7,
                    perpSpreadTooWide: 1,
                    usdtKrwSpreadTooWide: 0,
                  },
                  spreadStats: {
                    spot: {
                      medianBps: 18.5,
                      p90Bps: 42.25,
                      maxBps: 49.5,
                    },
                    perp: {
                      medianBps: 8.9,
                      p90Bps: 9.8,
                      maxBps: 13.5,
                    },
                  },
                },
              ],
            },
            spreadSensitivity: [
              {
                maxSpotSpreadBps: 30,
                maxPerpSpreadBps: 10,
                maxUsdtKrwSpreadBps: 20,
                executionEligibleRate: 0.85,
                spreadRejectedRate: 0.15,
                completedFundingWindowCount: 2,
                positiveWindowRate: 1,
                medianWindowNetCarryBps: 48,
                estimatedNetPnlKrwAcrossFundingWindows: 4800,
              },
              {
                maxSpotSpreadBps: 40,
                maxPerpSpreadBps: 10,
                maxUsdtKrwSpreadBps: 20,
                executionEligibleRate: 0.97,
                spreadRejectedRate: 0.03,
                completedFundingWindowCount: 2,
                positiveWindowRate: 1,
                medianWindowNetCarryBps: 46,
                estimatedNetPnlKrwAcrossFundingWindows: 4600,
              },
            ],
          },
	        },
	      ],
	    };
	    writeJson(aztecReadinessPath, spreadGapReports[0]);
	    writeJson(liveGoalPath, spreadGapLiveGoal);
    const spreadGapResult = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(spreadGapResult.status, 0, spreadGapResult.stderr);
    const spreadGapReport = JSON.parse(spreadGapResult.stdout) as {
      nextWorkClassification: {
        strategyEvidencePriority: string;
        recommendedAutonomousAction: string;
        priorityFundingWindowEvidence: {
          challengerSpreadControlRequired: boolean;
          challengerSpreadFailureTriage: {
            spreadFailureSeverity: string;
            primaryOverallReason: string;
            primaryLatestReason: string;
            latestFailureMultiple: number;
            overallFailureMultiple: number;
            failedWindowCount: number;
            action: string;
          };
          challengerSpreadSensitivityTriage: {
            baselineMaxSpotSpreadBps: number;
            minExecutionEligibleRate: number;
            maxSpreadRejectionRate: number;
            baselineScenario: {
              maxSpotSpreadBps: number;
              executionEligibleRate: number;
              spreadRejectedRate: number;
              medianWindowNetCarryBps: number;
            };
            nearestPassingScenario: {
              maxSpotSpreadBps: number;
              executionEligibleRate: number;
              spreadRejectedRate: number;
              medianWindowNetCarryBps: number;
            };
            passingScenarioCount: number;
            action: string;
            caveat: string;
          };
        };
      };
    };
    assert.equal(
      spreadGapReport.nextWorkClassification.strategyEvidencePriority,
      "challenger_latest_fee_stress_window_spread_gap",
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.recommendedAutonomousAction,
      "prepare_current_focus_demotion_if_next_window_does_not_recover_and_continue_broad_opportunity_observation",
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadControlRequired,
      true,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadFailureTriage
        .spreadFailureSeverity,
      "severe_latest_window",
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadFailureTriage
        .primaryOverallReason,
      "spotSpreadTooWide",
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadFailureTriage
        .primaryLatestReason,
      "spotSpreadTooWide",
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadFailureTriage
        .latestFailureMultiple,
      5,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadFailureTriage
        .overallFailureMultiple,
      3,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadFailureTriage
        .failedWindowCount,
      2,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadFailureTriage
        .action,
      "do_not_switch_until_spread_rejection_recovers_below_gate",
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadSensitivityTriage
        .baselineMaxSpotSpreadBps,
      30,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadSensitivityTriage
        .baselineScenario.executionEligibleRate,
      0.85,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadSensitivityTriage
        .nearestPassingScenario.maxSpotSpreadBps,
      40,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadSensitivityTriage
        .nearestPassingScenario.spreadRejectedRate,
      0.03,
    );
    assert.equal(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadSensitivityTriage
        .action,
      "run_explicit_spread_threshold_experiment_before_any_policy_change",
    );
    assert.match(
      spreadGapReport.nextWorkClassification.priorityFundingWindowEvidence.challengerSpreadSensitivityTriage
        .caveat,
      /diagnostic only/,
    );

    const aktCommandLiveGoal = JSON.parse(JSON.stringify(liveGoal)) as Record<string, unknown>;
    const aktDecisionMatrix = aktCommandLiveGoal.carryMarketDecisionMatrix as Array<{
      market?: string;
      symbol?: string;
      sourcePath?: string;
      feeStressEvidence?: { fundingWindowSummary?: { windows?: Array<{ market?: string; symbol?: string }> } };
    }>;
    const aktChallenger = aktDecisionMatrix.find((row) => row.market === "KRW-AZTEC");
    assert.ok(aktChallenger);
    aktChallenger.market = "KRW-AKT";
    aktChallenger.symbol = "AKTUSDT";
    aktChallenger.sourcePath = "spot-perp-carry-akt.json";
    for (const window of aktChallenger.feeStressEvidence?.fundingWindowSummary?.windows ?? []) {
      window.market = "KRW-AKT";
      window.symbol = "AKTUSDT";
    }
    const aktReadinessReports = aktCommandLiveGoal.carryLiveReadinessReports as Array<{
      path?: string;
      marketKeys?: string[];
    }>;
    aktReadinessReports[0].path = "var/reports/spot-perp-carry-akt-live-readiness-latest.json";
    aktReadinessReports[0].marketKeys = ["KRW-AKT:AKTUSDT"];
    writeJson(liveGoalPath, aktCommandLiveGoal);

    const aktCommandResult = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(aktCommandResult.status, 0, aktCommandResult.stderr);
    const aktCommandReport = JSON.parse(aktCommandResult.stdout) as {
      nextWorkClassification: {
        priorityMarket: string;
        priorityFundingWindowEvidence: { evidenceCommands: string[] };
      };
    };
    assert.equal(aktCommandReport.nextWorkClassification.priorityMarket, "KRW-AKT");
    assert.ok(
      aktCommandReport.nextWorkClassification.priorityFundingWindowEvidence.evidenceCommands.includes(
        "npm run dry-run:refresh-spot-perp-carry-akt-live-readiness",
      ),
    );
    assert.ok(
      !aktCommandReport.nextWorkClassification.priorityFundingWindowEvidence.evidenceCommands.includes(
        "npm run dry-run:refresh-spot-perp-carry-aztec-live-readiness",
      ),
    );

    writeJson(liveGoalPath, liveGoal);

	    const mutableDecisionMatrix = liveGoal.carryMarketDecisionMatrix as Array<{
	      requiredBeforeMetricCandidate?: string[];
	      feeStressEvidence?: { fundingWindowSummary?: { windows?: Array<{ sampleCount: number }> } };
	    }>;
	    if (mutableDecisionMatrix[1]) {
	      mutableDecisionMatrix[1].requiredBeforeMetricCandidate = ["moreCompletedFundingEvents"];
	    }
	    const aztecLatestWindow =
	      mutableDecisionMatrix[1]?.feeStressEvidence?.fundingWindowSummary?.windows?.[1];
	    assert.ok(aztecLatestWindow);
	    aztecLatestWindow.sampleCount = 1;
	    writeJson(aztecReadinessPath, {
	      generatedAt: "2026-05-14T06:37:00.000Z",
	      status: "blocked",
	      liveReady: false,
	      blockers: ["market:KRW-AZTEC:requires:moreCompletedFundingEvents"],
	      requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
	      evidence: {
	        feeStressReports: [
	          {
	            generatedAt: "2026-05-14T06:36:00.000Z",
	            summary: {
	              spreadControl: {
	                passed: true,
	                required: true,
	                spreadRejectedRate: 0,
	                executionEligibleRate: 1,
	                minExecutionEligibleRate: 0.95,
	                maxSpreadRejectionRate: 0.05,
	                thresholds: {
	                  maxSpotSpreadBps: 30,
	                  maxPerpSpreadBps: 10,
	                  maxUsdtKrwSpreadBps: 20,
	                },
	                rejectionReasons: {
	                  spotSpreadTooWide: 0,
	                  perpSpreadTooWide: 0,
	                  usdtKrwSpreadTooWide: 0,
	                },
	                spreadStats: {
	                  spot: {
	                    medianBps: 18,
	                    p90Bps: 20,
	                    maxBps: 20,
	                  },
	                },
	                fundingWindows: [
	                  {
	                    fundingSettledAt: "2026-05-14T04:00:00.000Z",
	                    sampleCount: 1,
	                    spreadRejectedRate: 0,
	                    spreadStats: {
	                      spot: {
	                        medianBps: 18,
	                        p90Bps: 20,
	                        maxBps: 20,
	                      },
	                    },
	                  },
	                ],
	              },
	            },
	          },
	        ],
	      },
	    });
	    writeJson(liveGoalPath, liveGoal);

    const lowSampleResult = spawnSync(
      process.execPath,
      [
        "dist/src/cli/summarize-live-goal-progress.js",
        "--live-goal-status",
        liveGoalPath,
        "--process-alignment",
        alignmentPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(lowSampleResult.status, 0, lowSampleResult.stderr);
    const lowSampleReport = JSON.parse(lowSampleResult.stdout) as {
      nextWorkClassification: {
        strategyEvidencePriority: string;
        priorityReason: string;
        priorityFundingWindowEvidence: {
          latestFeeStressWindowSampleQualityPasses: boolean;
          currentFocusLatestWindowSampleCount: number;
          challengerLatestWindowSampleCount: number;
          evidenceAction: string;
        };
        currentFocusLiveStartupCaution: {
          latestFeeStressWindowSampleQualityPasses: boolean;
          challengerLatestWindowSampleCount: number;
          reason: string;
        };
      };
      strategyDecisionView: {
        challengerSwitchDecision: {
          latestFeeStressWindowComparison: {
            action: string;
            sampleQualityPasses: boolean;
            currentFocusLatestWindowSampleCount: number;
            bestChallengerLatestWindowSampleCount: number;
          };
        };
      };
    };
    assert.equal(
      lowSampleReport.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.action,
      "collect_latest_window_samples_before_recompare",
    );
    assert.equal(
      lowSampleReport.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.sampleQualityPasses,
      false,
    );
    assert.equal(
      lowSampleReport.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.currentFocusLatestWindowSampleCount,
      46,
    );
    assert.equal(
      lowSampleReport.strategyDecisionView.challengerSwitchDecision.latestFeeStressWindowComparison.bestChallengerLatestWindowSampleCount,
      1,
    );
	    assert.equal(
	      lowSampleReport.nextWorkClassification.strategyEvidencePriority,
	      "challenger_latest_fee_stress_window_spread_gap",
	    );
    assert.match(lowSampleReport.nextWorkClassification.priorityReason, /spread control has not cleared/);
    assert.equal(
      lowSampleReport.nextWorkClassification.priorityFundingWindowEvidence.latestFeeStressWindowSampleQualityPasses,
      false,
    );
    assert.equal(
      lowSampleReport.nextWorkClassification.priorityFundingWindowEvidence.currentFocusLatestWindowSampleCount,
      46,
    );
    assert.equal(
      lowSampleReport.nextWorkClassification.priorityFundingWindowEvidence.challengerLatestWindowSampleCount,
      1,
    );
    assert.equal(
      lowSampleReport.nextWorkClassification.priorityFundingWindowEvidence.evidenceAction,
      "collect_more_latest_window_samples_before_switch_review",
    );
    assert.equal(
      lowSampleReport.nextWorkClassification.currentFocusLiveStartupCaution.latestFeeStressWindowSampleQualityPasses,
      false,
    );
    assert.equal(
      lowSampleReport.nextWorkClassification.currentFocusLiveStartupCaution.challengerLatestWindowSampleCount,
      1,
    );
    assert.match(
      lowSampleReport.nextWorkClassification.currentFocusLiveStartupCaution.reason,
      /samples are still too thin/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
