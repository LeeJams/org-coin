import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function spreadBlockerEvidence(): Record<string, unknown> {
  return {
    blockerActive: true,
    breachCount: 1,
    breaches: [
      {
        source: "currentEntrySpreadControl",
        metric: "spreadRejectedRate",
        observed: 0.08,
        threshold: 0.05,
        direction: "above_max",
      },
    ],
    interpretation:
      "wideDisplayedSpread remains only when current spread evidence records concrete threshold breaches; sensitivity experiments are diagnostic and do not relax live gates.",
  };
}

test("live goal refresh due check exits 2 while checkpoint says wait", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-wait-"));
  try {
    const summaryPath = join(directory, "summary.json");
    const outputPath = join(directory, "reports", "due.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      source: {
        liveGoalStatusPath: "var/reports/live-goal-status-current.json",
        liveGoalGeneratedAt: "2026-05-14T14:00:00.000Z",
        processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
        processAlignmentGeneratedAt: "2026-05-14T14:20:00.000Z",
	      },
		      achieved: false,
	      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [
          "live_candidate_selected",
          "profitability_evidence_satisfied",
          "operational_readiness_complete",
          "no_missing_requirements",
        ],
        missingRequirements: [
          "summaryObservationSpan",
          "spotPerpCarryResearchFocus:latestWindowSampleQuality",
          "summaryCredential",
          "summarySpread",
          "summaryReadinessGate",
        ],
        missingRequirementCount: 5,
        missingRequirementClassification: {
          autonomousEvidence: [
            "summaryObservationSpan",
            "spotPerpCarryResearchFocus:latestWindowSampleQuality",
          ],
          operatorPrerequisites: ["summaryCredential"],
          marketConditions: ["summarySpread"],
          liveReadinessGates: ["summaryReadinessGate"],
          other: [],
        },
	        missingRequirementClassificationCounts: {
	          autonomousEvidence: 2,
	          operatorPrerequisites: 1,
	          marketConditions: 1,
	          liveReadinessGates: 1,
	          other: 0,
	        },
	        outstandingWorkCounts: {
	          autonomousEvidence: 2,
	          operatorWork: 1,
	          marketConditionWork: 1,
	        },
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [
          "profitability_evidence_satisfied",
          "current_entry_sanity_clear",
        ],
        missingRequirements: [
          "summaryObservationSpan",
          "summaryReadinessGate",
        ],
        missingRequirementCount: 2,
        failedCriteriaIds: [
          "profitability_evidence_satisfied",
          "current_entry_sanity_clear",
        ],
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
          { id: "current_entry_sanity_clear", passed: false },
          { id: "live_startup_gate_allowed", passed: true },
        ],
        failedCriteriaIdsMatch: true,
        missingRequirementCountMatches: true,
      },
      completionAuditScopeComparison: {
        sourceMissingRequirementCount: 2,
        derivedMissingRequirementCount: 5,
        countsMatch: false,
        addedBySummary: [
          "spotPerpCarryResearchFocus:latestWindowSampleQuality",
          "summaryCredential",
          "summarySpread",
        ],
        missingFromSummary: [],
        scopeInterpretation:
          "The derived progress summary adds live-goal blocker requirements that are not present in the source completion audit.",
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
          { id: "profitability_evidence_satisfied", passed: false },
          { id: "process_alignment_clean", passed: true },
          { id: "reduced_activity_guardrail_enforced", passed: true },
          { id: "operational_readiness_complete", passed: false },
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: [
                "summaryObservationSpan",
                "spotPerpCarryResearchFocus:latestWindowSampleQuality",
                "summaryCredential",
                "summarySpread",
                "summaryReadinessGate",
              ],
              missingRequirementClassification: {
                autonomousEvidence: ["insufficientObservationSpan"],
                operatorPrerequisites: ["operationalProof:credentialsMissing"],
                marketConditions: ["wideDisplayedSpread"],
                liveReadinessGates: ["spotPerpCarryLiveReadiness"],
                other: [],
              },
            },
          },
        ],
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "challenger_evidence_required",
              canAuthorizeLiveStartup: false,
              spreadSensitivity: {
                caveat:
                  "Spread sensitivity is diagnostic only; it does not relax live gates or prove profitability.",
              },
            },
          },
          {
            id: "reduced_activity_guardrail_enforced",
            status: "passed",
            evidence: {
              status: "active",
              warnings: [
                "current_focus_below_live_execution_eligible_rate",
                "current_focus_spread_rejection_above_live_limit",
                "best_challenger_below_live_execution_eligible_rate",
              ],
            },
          },
          {
            id: "completion_audit_scope_reconciled",
            status: "passed",
            evidence: {
              sourceMissingRequirementCount: 2,
              derivedMissingRequirementCount: 5,
              countsMatch: false,
              addedBySummary: [
                "spotPerpCarryResearchFocus:latestWindowSampleQuality",
                "summaryCredential",
                "summarySpread",
              ],
              missingFromSummary: [],
              scopeInterpretation:
                "The derived progress summary adds live-goal blocker requirements that are not present in the source completion audit.",
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewDelayMinutes: 97.82,
        nextReviewOverdue: false,
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
	        outstandingAutonomousEvidence: ["insufficientObservationSpan", "latestWindowSampleQuality"],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
        reason:
          "Current blockers are evidence-span or challenger-funding gaps; repeated heavy refreshes before the next completed funding window do not add a decision-quality sample.",
      },
      strategyDecisionView: {
        reducedActivityGuardrail: {
          status: "active",
          rule:
            "Do not treat fewer executable entries or spread-filtered activity as proof of improved profitability.",
          interpretation:
            "This guardrail can block or downgrade a research-focus switch; it cannot authorize live startup.",
          livePromotionMinimumExecutionEligibleRate: 0.95,
          livePromotionMaximumSpreadRejectionRate: 0.05,
          currentFocus: {
            market: "KRW-PIEVERSE",
            executionEligibleRate: 0.94,
            spreadRejectedRate: 0.06,
            executionEligibleRateMeetsLiveGate: false,
            spreadRejectionMeetsLiveGate: false,
          },
          bestChallenger: {
            market: "KRW-AZTEC",
            executionEligibleRate: 0.82,
            executionEligibleRateMeetsLiveGate: false,
          },
          rawBestChallenger: {
            market: "KRW-AZTEC",
            knownQualityFailureReasons: [],
          },
          warnings: [
            "current_focus_below_live_execution_eligible_rate",
            "current_focus_spread_rejection_above_live_limit",
            "best_challenger_below_live_execution_eligible_rate",
          ],
        },
      },
	      autonomousEvidenceHandoff: {
	        status: "autonomous_evidence_required",
	        canStartLiveWithoutAutonomousEvidenceWork: false,
	        requiredBeforeLiveReview: ["insufficientObservationSpan", "latestWindowSampleQuality"],
        readinessGap: {
          observationSpanMinutes: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
        },
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"],
        deficits: {
          bithumbQuoteDeficitKrw: 500200,
          binanceUsdtDeficit: 337.209302,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
        hardStops: [
          "Do not run the PM2 live command while liveReady is false.",
          "Do not add --submit-once unless the review command and live-goal gate pass.",
        ],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        selectedMarket: "KRW-PIEVERSE",
        currentEntryStatus: "current_entry_clear",
        spreadControl: {
          passed: false,
          rawPassed: true,
          blockerActive: true,
          spreadRejectedRate: 0,
          executionEligibleRate: 1,
          maxSpreadRejectionRate: 0.05,
          latestWindow: {
            fundingSettledAt: "2026-05-14T16:00:00.000Z",
            spreadRejectedRate: 0,
          },
        },
	        liveReadinessSpreadControl: {
	          passed: false,
	          rawPassed: false,
	          blockerActive: true,
	          spreadRejectedRate: 0.12,
	          executionEligibleRate: 0.88,
	          maxSpreadRejectionRate: 0.05,
	        },
	        spreadBlockerEvidence: spreadBlockerEvidence(),
	        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
	      strategyResearchHandoff: {
	        status: "challenger_evidence_required",
	        canAuthorizeLiveStartup: false,
	        currentFocusMarket: "KRW-PIEVERSE",
        bestChallengerMarket: "KRW-AZTEC",
        requiredBeforeFocusSwitch: ["latestWindowSampleQuality"],
        latestFeeStressWindowComparison: {
          sampleQualityPasses: false,
          bestChallengerLatestWindowSampleCount: 1,
          minSampleCountForRecompare: 5,
        },
        emergingCleanOpportunities: {
          candidateCount: 1,
          candidates: [
            {
              market: "KRW-ILV",
              symbol: "ILVUSDT",
              comparisonCarryBps: 36.8,
              comparisonCarrySource: "fee_stress_funding_window_median",
              completedFundingWindowCount: 1,
              remainingFundingWindowCount: 5,
              executionEligibleRate: 1,
              qualityStatus: "quality_cleared",
              qualityPasses: true,
              evidenceAction: "continue_spread_clean_opportunity_observation",
            },
          ],
          action: "continue_spread_clean_opportunity_observation",
          requiredBeforePromotion: [
            "six_completed_fee_stressed_funding_windows",
            "live_readiness_audit",
            "operational_proof",
            "fee_schedule_confirmation",
            "inventory_and_hedge_venue_readiness",
          ],
	          livePromotionCaveat:
	            "Spread-clean emerging candidates are research targets only; they cannot authorize live startup until funding-window, live-readiness, operational-proof, and goal gates pass.",
	        },
	      },
		      live: {
		        reportStatus: "blocked",
		        liveReady: false,
		        liveStartupAllowed: false,
		        selectedLiveCandidate: null,
		        startupPlan: {
	          currentFocusLiveStartupCaution: {
	            currentFocusMarket: "KRW-PIEVERSE",
	            currentFocusLatestWindow: {
	              fundingSettledAt: "2026-05-14T12:00:00.001Z",
	              sampleCount: 42,
	              medianNetCarryBps: 18.5,
	            },
	            challengerMarket: "KRW-AZTEC",
		            challengerLatestWindow: {
		              fundingSettledAt: "2026-05-14T12:00:00.001Z",
		              sampleCount: 8,
		              medianNetCarryBps: 52.25,
		            },
		            latestFeeStressWindowDeltaToCurrentFocusBps: 33.75,
		            action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
		            reason: "latest current focus carry deteriorated below the live-promotion threshold",
		          },
	        },
	      },
	    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--output",
        outputPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      exitCode: number;
      summaryPath: string;
      summaryAgeMinutes: number;
      maxSummaryAgeMinutes: number | null;
      sourceEvidenceFreshness: {
        liveGoalStatusPath: string | null;
        liveGoalGeneratedAt: string | null;
        liveGoalAgeMinutes: number | null;
        processAlignmentPath: string | null;
        processAlignmentGeneratedAt: string | null;
        processAlignmentAgeMinutes: number | null;
        researchSourcePath: string | null;
        researchSourceGeneratedAt: string | null;
        researchSourceAgeMinutes: number | null;
        currentEntrySourcePath: string | null;
        currentEntryEvidenceTimestamp: string | null;
        currentEntryEvidenceAgeMinutes: number | null;
	      };
	      live: {
	        reportStatus: string | null;
	        liveReady: boolean | null;
	        liveStartupAllowed: boolean | null;
	        selectedLiveCandidatePresent: boolean;
	      };
	      sourceEvidenceStaleness: {
        maxSourceAgeMinutes: number | null;
        liveGoalStatusStale: boolean;
        processAlignmentStale: boolean;
        researchSourceStale: boolean;
        currentEntryEvidenceStale: boolean;
        staleSources: string[];
        canUseForLiveStartupReview: boolean;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
        interpretation: string;
      };
      checkpointStatus: string;
      checkpointShouldStartLive: boolean;
      checkpointShouldRunHeavyRefreshNow: boolean;
      nextReviewDueByTime: boolean;
      sourceEvidenceRefreshDue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
      shouldRunHeavyRefreshNow: boolean;
      nextReviewAtKst: string;
      nextReviewDelayMinutes: number;
      checkpointNextReviewDelayMinutes: number;
      computedNextReviewDelayMinutes: number;
      nextReviewOverdue: boolean;
      checkpointNextReviewOverdue: boolean;
      computedNextReviewOverdue: boolean;
      nextReviewTrigger: string;
      recommendedAutonomousAction: string;
      failedCompletionCriteria: string[];
      sourceCompletionAuditSummary: {
        failedCompletionCriteria: string[];
        failedCriteriaIdsMatch: boolean;
        missingRequirementCountMatches: boolean;
      };
      completionAuditScopeComparison: {
        sourceMissingRequirementCount: number;
        derivedMissingRequirementCount: number;
        countsMatch: boolean;
        addedBySummary: string[];
        missingFromSummary: string[];
        scopeInterpretation: string;
      };
      missingRequirements: string[];
      missingRequirementCount: number;
      missingRequirementClassification: Record<string, string[]>;
      missingRequirementClassificationCounts: Record<string, number>;
      outstandingWorkCounts: Record<string, number>;
      outstandingAutonomousEvidence: string[];
      outstandingOperatorWork: string[];
      outstandingMarketConditionWork: string[];
	      reducedActivityGuardrail: {
	        status: string;
	        currentFocus: {
          market: string;
          executionEligibleRateMeetsLiveGate: boolean;
          spreadRejectionMeetsLiveGate: boolean;
        };
        bestChallenger: {
          market: string;
          executionEligibleRateMeetsLiveGate: boolean;
	        };
	        warnings: string[];
	      };
	      currentFocusLiveStartupCaution: {
	        currentFocusMarket: string;
	        currentFocusLatestWindow: { medianNetCarryBps: number };
		        challengerMarket: string;
		        challengerLatestWindow: { medianNetCarryBps: number };
		        latestFeeStressWindowDeltaToCurrentFocusBps: number;
		        action: string;
		      };
	      autonomousEvidenceHandoff: {
        status: string;
        canStartLiveWithoutAutonomousEvidenceWork: boolean;
        requiredBeforeLiveReview: string[];
        readinessGap: { observationSpanMinutes: { current: number; required: number; passed: boolean } };
        nextReviewAt: string;
        nextReviewAtKst: string;
        reviewCommand: string;
      };
      operatorLiveReadinessHandoff: {
        status: string;
        canStartLiveWithoutOperatorInput: boolean;
        requiredBeforeLiveReview: string[];
        missingSecrets: string[];
        deficits: { bithumbQuoteDeficitKrw: number; binanceUsdtDeficit: number };
        verificationCommands: {
          reviewCommand: string;
          gateCommand: string;
          pm2StartCommandAfterAllGatesPass: string;
        };
      };
      marketConditionHandoff: {
        status: string;
        canStartLiveWithoutMarketConditionWork: boolean;
        requiredBeforeLiveReview: string[];
        selectedMarket: string;
        currentEntryStatus: string;
        spreadControl: { passed: boolean; spreadRejectedRate: number };
        verificationCommands: {
          reviewCommand: string;
          gateCommand: string;
        };
      };
      strategyResearchHandoff: {
        status: string;
        canAuthorizeLiveStartup: boolean;
        currentFocusMarket: string;
        bestChallengerMarket: string;
        requiredBeforeFocusSwitch: string[];
        emergingCleanOpportunities: {
          candidateCount: number;
          candidates: Array<{ market: string; remainingFundingWindowCount: number }>;
          requiredBeforePromotion: string[];
        };
      };
      reason: string;
    };
    assert.equal(report.summaryPath, summaryPath);
    assert.equal(typeof report.summaryAgeMinutes, "number");
    assert.equal(report.maxSummaryAgeMinutes, null);
    assert.deepEqual(report.sourceEvidenceFreshness, {
      liveGoalStatusPath: "var/reports/live-goal-status-current.json",
      liveGoalGeneratedAt: "2026-05-14T14:00:00.000Z",
      liveGoalAgeMinutes: 22.5,
      processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
      processAlignmentGeneratedAt: "2026-05-14T14:20:00.000Z",
      processAlignmentAgeMinutes: 2.5,
      researchSourcePath: null,
      researchSourceGeneratedAt: null,
      researchSourceAgeMinutes: null,
      currentEntrySourcePath: null,
      currentEntryEvidenceTimestamp: null,
      currentEntryEvidenceAgeMinutes: null,
      liveReadinessGeneratedAt: null,
      liveReadinessAgeMinutes: null,
      operationalProofGeneratedAt: null,
      operationalProofAgeMinutes: null,
    });
    assert.deepEqual(report.sourceEvidenceStaleness, {
      maxSourceAgeMinutes: null,
      liveGoalStatusStale: false,
      processAlignmentStale: false,
      researchSourceStale: false,
      currentEntryEvidenceStale: false,
      liveReadinessStale: false,
      operationalProofStale: false,
      staleSources: [],
      canUseForLiveStartupReview: true,
      requiredBeforeLiveStartupReview: [],
      refreshCommand: null,
      interpretation: "Source evidence is within the configured freshness window.",
	    });
	    assert.deepEqual(report.live, {
	      reportStatus: "blocked",
	      liveReady: false,
	      liveStartupAllowed: false,
	      selectedLiveCandidatePresent: false,
	    });
	    assert.equal(report.decision, "skip_full_refresh_until_next_review");
    assert.equal(report.exitCode, 2);
    assert.equal(report.checkpointStatus, "pause_heavy_refresh_until_next_completed_funding_window");
    assert.equal(report.checkpointShouldStartLive, false);
    assert.equal(report.checkpointShouldRunHeavyRefreshNow, false);
    assert.equal(report.nextReviewDueByTime, false);
    assert.equal(report.sourceEvidenceRefreshDue, false);
    assert.equal(report.refreshTrigger, "not_due");
    assert.equal(report.refreshDue, false);
    assert.equal(report.shouldRunHeavyRefreshNow, false);
    assert.equal(report.nextReviewAtKst, "2026-05-15 01:00:00 KST");
    assert.equal(report.nextReviewDelayMinutes, 97.50003333333333);
    assert.equal(report.checkpointNextReviewDelayMinutes, 97.82);
    assert.equal(report.computedNextReviewDelayMinutes, 97.50003333333333);
    assert.equal(report.nextReviewOverdue, false);
    assert.equal(report.checkpointNextReviewOverdue, false);
    assert.equal(report.computedNextReviewOverdue, false);
    assert.equal(report.nextReviewTrigger, "next_completed_fee_stressed_funding_window");
    assert.equal(report.recommendedAutonomousAction, "wait_then_run_full_live_goal_refresh");
    assert.deepEqual(report.failedCompletionCriteria, [
      "live_candidate_selected",
      "profitability_evidence_satisfied",
      "operational_readiness_complete",
      "no_missing_requirements",
    ]);
    assert.deepEqual(report.sourceCompletionAuditSummary.failedCompletionCriteria, [
      "profitability_evidence_satisfied",
      "current_entry_sanity_clear",
    ]);
    assert.equal(report.sourceCompletionAuditSummary.failedCriteriaIdsMatch, true);
    assert.equal(report.sourceCompletionAuditSummary.missingRequirementCountMatches, true);
    assert.deepEqual(report.completionAuditScopeComparison, {
      sourceMissingRequirementCount: 2,
      derivedMissingRequirementCount: 5,
      countsMatch: false,
      addedBySummary: [
        "spotPerpCarryResearchFocus:latestWindowSampleQuality",
        "summaryCredential",
        "summarySpread",
      ],
      missingFromSummary: [],
      scopeInterpretation:
        "The derived progress summary adds live-goal blocker requirements that are not present in the source completion audit.",
    });
    assert.deepEqual(report.missingRequirements, [
      "summaryObservationSpan",
      "spotPerpCarryResearchFocus:latestWindowSampleQuality",
      "summaryCredential",
      "summarySpread",
      "summaryReadinessGate",
    ]);
    assert.equal(report.missingRequirementCount, 5);
    assert.deepEqual(report.missingRequirementClassification, {
      autonomousEvidence: [
        "summaryObservationSpan",
        "spotPerpCarryResearchFocus:latestWindowSampleQuality",
      ],
      operatorPrerequisites: ["summaryCredential"],
      marketConditions: ["summarySpread"],
      liveReadinessGates: ["summaryReadinessGate"],
      other: [],
    });
    assert.deepEqual(report.missingRequirementClassificationCounts, {
      autonomousEvidence: 2,
      operatorPrerequisites: 1,
      marketConditions: 1,
      liveReadinessGates: 1,
      other: 0,
    });
	    assert.deepEqual(report.outstandingWorkCounts, {
	      autonomousEvidence: 2,
	      operatorWork: 1,
	      marketConditionWork: 1,
	    });
	    assert.deepEqual(report.outstandingAutonomousEvidence, [
	      "insufficientObservationSpan",
	      "latestWindowSampleQuality",
	    ]);
    assert.deepEqual(report.outstandingOperatorWork, ["operationalProof:credentialsMissing"]);
    assert.deepEqual(report.outstandingMarketConditionWork, ["wideDisplayedSpread"]);
    assert.equal(report.reducedActivityGuardrail.status, "active");
    assert.equal(report.reducedActivityGuardrail.currentFocus.market, "KRW-PIEVERSE");
    assert.equal(report.reducedActivityGuardrail.currentFocus.executionEligibleRateMeetsLiveGate, false);
    assert.equal(report.reducedActivityGuardrail.currentFocus.spreadRejectionMeetsLiveGate, false);
    assert.equal(report.reducedActivityGuardrail.bestChallenger.market, "KRW-AZTEC");
    assert.equal(report.reducedActivityGuardrail.bestChallenger.executionEligibleRateMeetsLiveGate, false);
	    assert.ok(
	      report.reducedActivityGuardrail.warnings.includes(
	        "best_challenger_below_live_execution_eligible_rate",
	      ),
	    );
	    assert.equal(report.currentFocusLiveStartupCaution.currentFocusMarket, "KRW-PIEVERSE");
	    assert.equal(report.currentFocusLiveStartupCaution.currentFocusLatestWindow.medianNetCarryBps, 18.5);
	    assert.equal(report.currentFocusLiveStartupCaution.challengerMarket, "KRW-AZTEC");
	    assert.equal(report.currentFocusLiveStartupCaution.challengerLatestWindow.medianNetCarryBps, 52.25);
	    assert.equal(report.currentFocusLiveStartupCaution.latestFeeStressWindowDeltaToCurrentFocusBps, 33.75);
	    assert.equal(
	      report.currentFocusLiveStartupCaution.action,
	      "do_not_prepare_current_focus_live_startup_until_recompare_clears",
	    );
	    assert.equal(report.strategyResearchHandoff.status, "challenger_evidence_required");
    assert.equal(report.strategyResearchHandoff.canAuthorizeLiveStartup, false);
    assert.equal(report.strategyResearchHandoff.currentFocusMarket, "KRW-PIEVERSE");
    assert.equal(report.strategyResearchHandoff.bestChallengerMarket, "KRW-AZTEC");
    assert.deepEqual(report.strategyResearchHandoff.requiredBeforeFocusSwitch, [
      "latestWindowSampleQuality",
    ]);
    assert.equal(report.strategyResearchHandoff.emergingCleanOpportunities.candidateCount, 1);
    assert.equal(report.strategyResearchHandoff.emergingCleanOpportunities.candidates[0]?.market, "KRW-ILV");
    assert.equal(
      report.strategyResearchHandoff.emergingCleanOpportunities.candidates[0]?.remainingFundingWindowCount,
      5,
    );
    assert.ok(
      report.strategyResearchHandoff.emergingCleanOpportunities.requiredBeforePromotion.includes(
        "operational_proof",
      ),
    );
    assert.equal(report.autonomousEvidenceHandoff.status, "autonomous_evidence_required");
    assert.equal(report.autonomousEvidenceHandoff.canStartLiveWithoutAutonomousEvidenceWork, false);
	    assert.deepEqual(report.autonomousEvidenceHandoff.requiredBeforeLiveReview, [
	      "insufficientObservationSpan",
	      "latestWindowSampleQuality",
	    ]);
    assert.equal(report.autonomousEvidenceHandoff.readinessGap.observationSpanMinutes.current, 1541.221233);
    assert.equal(report.autonomousEvidenceHandoff.readinessGap.observationSpanMinutes.required, 4320);
    assert.equal(report.autonomousEvidenceHandoff.readinessGap.observationSpanMinutes.passed, false);
    assert.equal(report.autonomousEvidenceHandoff.nextReviewAtKst, "2026-05-15 01:00:00 KST");
    assert.equal(
      report.autonomousEvidenceHandoff.reviewCommand,
      "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
    );
    assert.equal(report.operatorLiveReadinessHandoff.status, "operator_prerequisites_required");
    assert.equal(report.operatorLiveReadinessHandoff.canStartLiveWithoutOperatorInput, false);
    assert.deepEqual(report.operatorLiveReadinessHandoff.requiredBeforeLiveReview, [
      "operationalProof:credentialsMissing",
    ]);
    assert.deepEqual(report.operatorLiveReadinessHandoff.missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(report.operatorLiveReadinessHandoff.deficits.bithumbQuoteDeficitKrw, 500200);
    assert.equal(report.operatorLiveReadinessHandoff.deficits.binanceUsdtDeficit, 337.209302);
    assert.equal(
      report.operatorLiveReadinessHandoff.verificationCommands.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
    );
    assert.equal(
      report.operatorLiveReadinessHandoff.verificationCommands.gateCommand,
      "npm run dry-run:gate-live-goal-ready",
    );
    assert.equal(
      report.operatorLiveReadinessHandoff.verificationCommands.pm2StartCommandAfterAllGatesPass,
      "npm run pm2:start:live-spot-perp-carry-pieverse",
    );
    assert.equal(report.marketConditionHandoff.status, "market_conditions_required");
    assert.equal(report.marketConditionHandoff.canStartLiveWithoutMarketConditionWork, false);
    assert.deepEqual(report.marketConditionHandoff.requiredBeforeLiveReview, ["wideDisplayedSpread"]);
    assert.equal(report.marketConditionHandoff.selectedMarket, "KRW-PIEVERSE");
    assert.equal(report.marketConditionHandoff.currentEntryStatus, "current_entry_clear");
    assert.equal(report.marketConditionHandoff.spreadControl.passed, false);
    assert.equal(report.marketConditionHandoff.spreadControl.spreadRejectedRate, 0);
    assert.equal(
      report.marketConditionHandoff.verificationCommands.reviewCommand,
      "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
    );
    assert.equal(
      report.marketConditionHandoff.verificationCommands.gateCommand,
      "npm run dry-run:gate-live-goal-ready",
    );
    assert.ok(report.reason.includes("decision-quality sample"));
    const writtenReport = JSON.parse(readFileSync(outputPath, "utf8")) as {
      decision: string;
      exitCode: number;
      refreshDue: boolean;
      autonomousEvidenceHandoff: { status: string };
      operatorLiveReadinessHandoff: { status: string };
      marketConditionHandoff: { status: string };
      strategyResearchHandoff: { status: string; canAuthorizeLiveStartup: boolean };
    };
    assert.equal(writtenReport.decision, "skip_full_refresh_until_next_review");
    assert.equal(writtenReport.exitCode, 2);
    assert.equal(writtenReport.refreshDue, false);
    assert.equal(writtenReport.autonomousEvidenceHandoff.status, "autonomous_evidence_required");
    assert.equal(writtenReport.operatorLiveReadinessHandoff.status, "operator_prerequisites_required");
    assert.equal(writtenReport.marketConditionHandoff.status, "market_conditions_required");
    assert.equal(writtenReport.strategyResearchHandoff.status, "challenger_evidence_required");
    assert.equal(writtenReport.strategyResearchHandoff.canAuthorizeLiveStartup, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due report exposes current-entry criterion evidence when current-entry strategy handoff is absent", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-evidence-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "current_entry_sanity_clear",
            passed: false,
            evidence: {
              status: "current_entry_blocked_or_diagnostic_only",
              selectedMarket: "KRW-PIEVERSE",
              currentEntryCarryGate: {
                minNetCarryBps: 20,
                selectedNetCarryBps: 6.733299,
                deltaToThresholdBps: -13.266701,
                passed: false,
              },
              currentEntryBlockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
            },
          },
        ],
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "current_entry_blocked_or_diagnostic_only",
              canAuthorizeLiveStartup: false,
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
      },
      strategyResearchHandoff: {
        status: "current_entry_blocked_or_diagnostic_only",
        canAuthorizeLiveStartup: false,
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        selectedMarket: "KRW-PIEVERSE",
        currentEntryStatus: "current_entry_blocked_or_diagnostic_only",
        currentEntryCarryGate: {
          minNetCarryBps: 20,
          selectedNetCarryBps: 6.733299,
          deltaToThresholdBps: -13.266701,
          passed: false,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      currentEntrySanity: {
        status: string;
        selectedMarket: string;
        currentEntryCarryGate: {
          minNetCarryBps: number;
          selectedNetCarryBps: number;
          passed: boolean;
        };
        currentEntryBlockers: string[];
      };
    };
    assert.equal(report.currentEntrySanity.status, "current_entry_blocked_or_diagnostic_only");
    assert.equal(report.currentEntrySanity.selectedMarket, "KRW-PIEVERSE");
    assert.equal(report.currentEntrySanity.currentEntryCarryGate.minNetCarryBps, 20);
    assert.equal(report.currentEntrySanity.currentEntryCarryGate.selectedNetCarryBps, 6.733299);
    assert.equal(report.currentEntrySanity.currentEntryCarryGate.passed, false);
    assert.deepEqual(report.currentEntrySanity.currentEntryBlockers, [
      "selectedFocusCurrentEntryCarryBelowLiveThreshold",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when strategy decision view omits reduced activity guardrail", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-reduced-activity-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "profitability_evidence_satisfied", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyDecisionView: {},
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyDecisionView\.reducedActivityGuardrail is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when reduced activity guardrail warnings are stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-reduced-activity-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "profitability_evidence_satisfied", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyDecisionView: {
        reducedActivityGuardrail: {
          status: "active",
          rule:
            "Do not treat fewer executable entries or spread-filtered activity as proof of improved profitability.",
          interpretation:
            "This guardrail can block or downgrade a research-focus switch; it cannot authorize live startup.",
          livePromotionMinimumExecutionEligibleRate: 0.95,
          livePromotionMaximumSpreadRejectionRate: 0.05,
          currentFocus: {
            market: "KRW-PIEVERSE",
            executionEligibleRate: 0.94,
            spreadRejectedRate: 0.04,
            executionEligibleRateMeetsLiveGate: false,
            spreadRejectionMeetsLiveGate: true,
          },
          bestChallenger: {
            market: "KRW-AZTEC",
            executionEligibleRate: 0.82,
            executionEligibleRateMeetsLiveGate: false,
          },
          rawBestChallenger: {
            market: "KRW-PROMPT",
            knownQualityFailureReasons: ["executionEligibleRateBelowSwitchThreshold"],
          },
          warnings: ["current_focus_below_live_execution_eligible_rate"],
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /warnings must include best challenger execution eligibility warning/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when reduced activity guardrail is absent from completion audit", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-reduced-activity-audit-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "profitability_evidence_satisfied", passed: false },
        ],
        promptToArtifactChecklist: [],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyDecisionView: {
        reducedActivityGuardrail: {
          status: "active",
          rule:
            "Do not treat fewer executable entries or spread-filtered activity as proof of improved profitability.",
          interpretation:
            "This guardrail can block or downgrade a research-focus switch; it cannot authorize live startup.",
          livePromotionMinimumExecutionEligibleRate: 0.95,
          livePromotionMaximumSpreadRejectionRate: 0.05,
          currentFocus: {
            market: "KRW-PIEVERSE",
            executionEligibleRate: 0.96,
            spreadRejectedRate: 0.04,
            executionEligibleRateMeetsLiveGate: true,
            spreadRejectionMeetsLiveGate: true,
          },
          bestChallenger: {
            market: "KRW-AZTEC",
            executionEligibleRate: 0.96,
            executionEligibleRateMeetsLiveGate: true,
          },
          warnings: [],
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /successCriteria must include reduced_activity_guardrail_enforced/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when strategy research handoff claims live authority", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-authority-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_hold",
        canAuthorizeLiveStartup: true,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff cannot authorize live startup/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when focus-switch sample work is hidden from autonomous work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-focus-work-hidden-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
        requiredBeforeFocusSwitch: ["latestWindowSampleQuality"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /outstandingAutonomousEvidence must include autonomous research-focus recompare work/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when focus-switch sample work is hidden from missing requirements", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-focus-missing-hidden-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["summaryObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementClassification: {
          autonomousEvidence: ["summaryObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        outstandingAutonomousEvidence: ["latestWindowSampleQuality"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: ["summaryObservationSpan"],
              missingRequirementClassification: {
                autonomousEvidence: ["summaryObservationSpan"],
                operatorPrerequisites: [],
                marketConditions: [],
                liveReadinessGates: [],
                other: [],
              },
            },
          },
        ],
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "challenger_evidence_required",
              canAuthorizeLiveStartup: false,
            },
          },
        ],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["latestWindowSampleQuality"],
        autonomousBlockerEvidence: [{ blocker: "latestWindowSampleQuality", active: true }],
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
        requiredBeforeFocusSwitch: ["latestWindowSampleQuality"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirements must include strategy research-focus recompare work/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when focus-switch sample work is classified outside autonomous evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-focus-classification-hidden-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["spotPerpCarryResearchFocus:latestWindowSampleQuality"],
        missingRequirementCount: 1,
        missingRequirementClassification: {
          autonomousEvidence: [],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: ["spotPerpCarryResearchFocus:latestWindowSampleQuality"],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 0,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 1,
        },
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        outstandingAutonomousEvidence: ["latestWindowSampleQuality"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: ["spotPerpCarryResearchFocus:latestWindowSampleQuality"],
              missingRequirementClassification: {
                autonomousEvidence: [],
                operatorPrerequisites: [],
                marketConditions: [],
                liveReadinessGates: [],
                other: ["spotPerpCarryResearchFocus:latestWindowSampleQuality"],
              },
            },
          },
        ],
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "challenger_evidence_required",
              canAuthorizeLiveStartup: false,
            },
          },
        ],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["latestWindowSampleQuality"],
        autonomousBlockerEvidence: [{ blocker: "latestWindowSampleQuality", active: true }],
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
        requiredBeforeFocusSwitch: ["latestWindowSampleQuality"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /missingRequirementClassification\.autonomousEvidence must include autonomous research-focus recompare work/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when completion checklist omits analysis handoff", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-analysis-checklist-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_hold",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /subagent_current_analysis_handoff_reflected/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when completion checklist omits blocked manual validation evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-checklist-blocked-manual-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "research_focus_recompare_required",
              canAuthorizeLiveStartup: false,
            },
          },
          {
            id: "live_startup_method_documented",
            status: "blocked",
            evidence: {
              blockedCommands: {
                reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
                pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
              },
            },
          },
        ],
      },
      live: {
        startupPlan: {
          blockedCommands: {
            reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
            pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
            manualValidationCommand:
              "npm run dry-run:run-spot-perp-carry-live -- --readiness-report stale-readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
          },
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live_startup_method_documented\.blockedCommands.*manual validation/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when current focus caution omits challenger window evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-focus-caution-missing-challenger-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      live: {
        startupPlan: {
          currentFocusLiveStartupCaution: {
            currentFocusMarket: "KRW-PIEVERSE",
            currentFocusLatestWindow: {
              fundingSettledAt: "2026-05-14T12:00:00.001Z",
              sampleCount: 42,
              medianNetCarryBps: 18.5,
            },
            challengerMarket: "KRW-AZTEC",
            action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
          },
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["spreadControl"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /live\.startupPlan\.currentFocusLiveStartupCaution\.challengerLatestWindow is required/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare current focus caution omits challenger identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-focus-caution-missing-challenger-id-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      live: {
        startupPlan: {
          currentFocusLiveStartupCaution: {
            currentFocusMarket: "KRW-PIEVERSE",
            currentFocusLatestWindow: {
              fundingSettledAt: "2026-05-14T12:00:00.001Z",
              sampleCount: 42,
              medianNetCarryBps: 18.5,
            },
            challengerLatestWindow: {
              fundingSettledAt: "2026-05-14T12:00:00.001Z",
              sampleCount: 32,
              medianNetCarryBps: 52.25,
            },
            latestFeeStressWindowDeltaToCurrentFocusBps: 33.75,
            action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
          },
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["spreadControl"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /live\.startupPlan\.currentFocusLiveStartupCaution\.challengerMarket must be a non-empty string/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when current focus caution sample quality contradicts counts", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-focus-caution-sample-counts-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      live: {
        startupPlan: {
          currentFocusLiveStartupCaution: {
            currentFocusMarket: "KRW-PIEVERSE",
            currentFocusLatestWindow: {
              fundingSettledAt: "2026-05-14T12:00:00.001Z",
              sampleCount: 42,
              medianNetCarryBps: 18.5,
            },
            challengerMarket: "KRW-AZTEC",
	            challengerLatestWindow: {
	              fundingSettledAt: "2026-05-14T12:00:00.001Z",
	              sampleCount: 4,
	              medianNetCarryBps: 52.25,
	            },
	            latestFeeStressWindowDeltaToCurrentFocusBps: 33.75,
	            latestFeeStressWindowSampleQualityPasses: true,
	            minLatestFeeStressWindowSampleCount: 5,
	            currentFocusLatestWindowSampleCount: 42,
            challengerLatestWindowSampleCount: 4,
            action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
          },
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["spreadControl"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /currentFocusLiveStartupCaution sample counts must meet minLatestFeeStressWindowSampleCount/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
	  }
	});

test("live goal refresh due check fails when current focus caution delta disagrees with window medians", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-focus-caution-delta-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      live: {
        startupPlan: {
          currentFocusLiveStartupCaution: {
            currentFocusMarket: "KRW-PIEVERSE",
            currentFocusLatestWindow: {
              fundingSettledAt: "2026-05-14T12:00:00.001Z",
              sampleCount: 42,
              medianNetCarryBps: 20,
            },
            challengerMarket: "KRW-AZTEC",
            challengerLatestWindow: {
              fundingSettledAt: "2026-05-14T12:00:00.001Z",
              sampleCount: 8,
              medianNetCarryBps: 70,
            },
            latestFeeStressWindowDeltaToCurrentFocusBps: 10,
            action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
          },
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["spreadControl"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /latestFeeStressWindowDeltaToCurrentFocusBps disagrees with challenger and current latest-window medians/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when live readiness booleans are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-booleans-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      live: {
        liveReady: "false",
        liveStartupAllowed: false,
      },
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_startup_gate_allowed"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live\.liveReady must be boolean when present/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
	
	test("live goal refresh due check fails when completion checklist blocked commands disagree with strategy handoff", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-checklist-command-disagree-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "research_focus_recompare_required",
              canAuthorizeLiveStartup: false,
            },
          },
          {
            id: "live_startup_method_documented",
            status: "blocked",
            evidence: {
              blockedCommands: {
                reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
                pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
                manualValidationCommand:
                  "npm run dry-run:run-spot-perp-carry-live -- --readiness-report stale-readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
              },
            },
          },
        ],
      },
      live: {
        startupPlan: {
          blockedCommands: {
            reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
            pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
            manualValidationCommand:
              "npm run dry-run:run-spot-perp-carry-live -- --readiness-report stale-readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
          },
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live_startup_method_documented\.blockedCommands disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when startup plan blocked commands disagree with completion checklist", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-startup-command-disagree-"));
  try {
    const summaryPath = join(directory, "summary.json");
    const blockedCommands = {
      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      manualValidationCommand:
        "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
    };
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "research_focus_recompare_required",
              canAuthorizeLiveStartup: false,
            },
          },
          {
            id: "live_startup_method_documented",
            status: "blocked",
            evidence: {
              blockedCommands,
            },
          },
        ],
      },
      live: {
        startupPlan: {
          blockedCommands: {
            ...blockedCommands,
            manualValidationCommand:
              "npm run dry-run:run-spot-perp-carry-live -- --readiness-report stale-readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
          },
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live_startup_method_documented\.blockedCommands disagrees with live\.startupPlan\.blockedCommands/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when startup hard stops disagree with completion checklist", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-startup-hard-stop-disagree-"));
  try {
    const summaryPath = join(directory, "summary.json");
    const blockedCommands = {
      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      manualValidationCommand:
        "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
    };
    const hardStops = [
      "Do not run the PM2 live command while liveReady is false.",
      "Do not add --submit-once unless the review command and live-goal gate pass.",
      "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.",
    ];
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "research_focus_recompare_required",
              canAuthorizeLiveStartup: false,
            },
          },
          {
            id: "live_startup_method_documented",
            status: "blocked",
            evidence: {
              blockedCommands,
              hardStops,
            },
          },
        ],
      },
      live: {
        startupPlan: {
          blockedCommands,
          hardStops: hardStops.slice(0, 2),
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live_startup_method_documented\.hardStops disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare startup plan omits blocked commands", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-startup-blocked-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    const blockedCommands = {
      reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
      pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      manualValidationCommand:
        "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
    };
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              strategyStatus: "research_focus_recompare_required",
              canAuthorizeLiveStartup: false,
            },
          },
          {
            id: "live_startup_method_documented",
            status: "blocked",
            evidence: {
              blockedCommands,
            },
          },
        ],
      },
      live: {
        startupPlan: {
          status: "blocked_current_focus_recompare_required",
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live\.startupPlan\.blockedCommands is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare handoff is absent from completion failures", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-failure-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires recompare/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare handoff omits challenger readiness", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-readiness-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /bestChallengerLiveReadiness is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked challenger readiness omits blocker detail", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-readiness-empty-blockers-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          blockers: [],
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        requiredBeforeChallengerLiveStartup: ["challengerLiveReadiness"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /bestChallengerLiveReadiness\.blockers must explain/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when challenger startup requirements omit readiness blockers", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-readiness-blocker-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          blockers: ["insufficientObservationSpan"],
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        requiredBeforeChallengerLiveStartup: ["challengerLiveReadiness"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /requiredBeforeChallengerLiveStartup must include challenger readiness blockers/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare-blocked operator handoff exposes live commands", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-operator-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete", "no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
        hardStops: [
          "Do not run the PM2 live command while liveReady is false.",
          "Do not add --submit-once unless the review command and live-goal gate pass.",
          "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.",
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /reviewCommand must be null/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff gate command is live-capable", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-operator-live-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete", "no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          pm2StartCommandAfterAllGatesPass: null,
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorLiveReadinessHandoff\.verificationCommands\.gateCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff gate command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-operator-chained-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete", "no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready && node dist/src/cli/summarize-live-goal-progress.js",
          pm2StartCommandAfterAllGatesPass: null,
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorLiveReadinessHandoff\.verificationCommands\.gateCommand must be a single npm dry-run gate command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare-blocked operator handoff omits blocked manual validation command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-operator-manual-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete", "no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: null,
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
        hardStops: [
          "Do not run the PM2 live command while liveReady is false.",
          "Do not add --submit-once unless the review command and live-goal gate pass.",
          "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.",
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorLiveReadinessHandoff\.blockedCommands.*manual validation/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare-blocked operator hard stop omits manual validation", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-operator-hard-stop-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete", "no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: null,
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
        hardStops: [
          "Do not run the PM2 live command while liveReady is false.",
          "Do not add --submit-once unless the review command and live-goal gate pass.",
          "Do not use the blocked live review or PM2 start command until the fee-stressed challenger recompare clears.",
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /hardStops.*manual validation/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare-blocked market handoff omits blocked manual validation command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-market-manual-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff\.blockedCommands.*manual validation/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when market handoff gate command enables live mode", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-live-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "DRY_RUN_EXECUTION_MODE=live npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff\.verificationCommands\.gateCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when market handoff gate command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-chained-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready && node dist/src/cli/summarize-live-goal-progress.js",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff\.verificationCommands\.gateCommand must be a single npm dry-run gate command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked manual validation command omits live-ready gate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-manual-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /manualValidationCommand must require live readiness/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked manual validation command omits live-goal status gate", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-manual-goal-status-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /manualValidationCommand must include live-goal status gating/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked manual validation command has only a misleading live-goal status flag", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-manual-goal-status-prefix-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status-path live-goal.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /manualValidationCommand must include live-goal status gating/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked manual validation command includes submit-once", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-manual-submit-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready --submit-once",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /manualValidationCommand must not include --submit-once/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked manual validation command chains another command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-manual-chain-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready && node dist/src/cli/summarize-live-goal-progress.js",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /manualValidationCommand must be a single blocked live-runner validation command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked manual validation command hides process control", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-manual-process-control-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status $(pm2 restart live-spot-perp-carry) --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /manualValidationCommand must not control processes/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked review command is not a live-ready review", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-blocked-review-shape-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:summarize-live-goal-progress",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /blockedCommands\.reviewCommand must preserve/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked PM2 command is not a live start", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-blocked-pm2-shape-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run dry-run:summarize-live-goal-progress",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /blockedCommands\.pm2StartCommand must be a PM2 live start command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked PM2 command chains another command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-blocked-pm2-chain-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse && npm run dry-run:summarize-live-goal-progress",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report readiness.json --carry-report carry.json --market KRW-PIEVERSE --output execution.json --live-goal-status live-goal.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /blockedCommands\.pm2StartCommand must be a single PM2 live start command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when blocked manual validation omits the live runner", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-blocked-manual-shape-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:summarize-live-goal-progress -- --live-goal-status live-goal.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /blockedCommands\.manualValidationCommand must preserve/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare strategy handoff exposes live review", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-strategy-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.reviewCommand must be null/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when strategy handoff gate command submits orders", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-submit-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready --submit-once",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.gateCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when strategy handoff gate command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-chained-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready && node dist/src/cli/summarize-live-goal-progress.js",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.gateCommand must be a single npm dry-run gate command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when strategy handoff refresh command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-chained-refresh-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          refreshGoalStatusCommand:
            "npm run dry-run:refresh-live-goal-status && node dist/src/cli/summarize-live-goal-progress.js",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.refreshGoalStatusCommand must be a single npm dry-run command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when strategy handoff observe command runs the wrong dry-run script", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-wrong-observe-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          observeOpportunityCommand: "npm run dry-run:summarize-live-goal-progress",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.observeOpportunityCommand must run dry-run:observe-spot-perp-carry-opportunity-72h/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when strategy handoff fee-stress refresh command is live-capable", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-live-fee-stress-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          refreshOpportunityFeeStressCommand:
            "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.refreshOpportunityFeeStressCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when non-recompare strategy handoff refresh command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-non-recompare-chained-refresh-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
        verificationCommands: {
          refreshGoalStatusCommand:
            "npm run dry-run:refresh-live-goal-status && node dist/src/cli/summarize-live-goal-progress.js",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.refreshGoalStatusCommand must be a single npm dry-run command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when non-recompare strategy handoff observe command runs the wrong dry-run script", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-non-recompare-wrong-observe-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
        verificationCommands: {
          observeOpportunityCommand: "npm run dry-run:summarize-live-goal-progress",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.observeOpportunityCommand must run dry-run:observe-spot-perp-carry-opportunity-72h/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when non-recompare strategy handoff review command is live-capable", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-non-recompare-live-review-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
        verificationCommands: {
          reviewCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready --submit-once",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.reviewCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when non-recompare strategy handoff gate command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-strategy-non-recompare-chained-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
        verificationCommands: {
          gateCommand:
            "npm run dry-run:gate-live-goal-ready && node dist/src/cli/summarize-live-goal-progress.js",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.verificationCommands\.gateCommand must be a single npm dry-run gate command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when recompare strategy handoff omits blocked manual validation command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-strategy-manual-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_recompare_required",
        canAuthorizeLiveStartup: false,
        bestChallengerLiveReadiness: {
          market: "KRW-AZTEC",
          liveReady: false,
          interpretation:
            "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff\.blockedCommands.*manual validation/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when emerging clean opportunities lack live-promotion caveats", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-emerging-caveat-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_hold",
        canAuthorizeLiveStartup: false,
        emergingCleanOpportunities: {
          candidateCount: 1,
          candidates: [
            {
              market: "KRW-ILV",
              completedFundingWindowCount: 1,
              remainingFundingWindowCount: 5,
              evidenceAction: "continue_spread_clean_opportunity_observation",
            },
          ],
          requiredBeforePromotion: [
            "six_completed_fee_stressed_funding_windows",
            "live_readiness_audit",
          ],
          livePromotionCaveat: "Looks clean enough for review.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /requiredBeforePromotion is missing live promotion gates/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when emerging clean candidates look promotion-complete", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-emerging-complete-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "research_focus_hold",
        canAuthorizeLiveStartup: false,
        emergingCleanOpportunities: {
          candidateCount: 1,
          candidates: [
            {
              market: "KRW-ILV",
              completedFundingWindowCount: 6,
              remainingFundingWindowCount: 0,
              evidenceAction: "review_as_quality_cleared_challenger",
            },
          ],
          requiredBeforePromotion: [
            "six_completed_fee_stressed_funding_windows",
            "live_readiness_audit",
            "operational_proof",
            "fee_schedule_confirmation",
            "inventory_and_hedge_venue_readiness",
          ],
          livePromotionCaveat:
            "Spread-clean emerging candidates are research targets only; they cannot authorize live startup until funding-window, live-readiness, operational-proof, and goal gates pass.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidates must remain observation-only/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when a skipped refresh lacks strategy research handoff", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-strategy-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /strategyResearchHandoff is missing while full live-goal refresh is skipped/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when completion audit summary contradicts achieved state", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-inconsistent-achieved-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: true,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /achieved disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when completion audit achieved flag is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-achieved-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: "false",
        failedCompletionCriteria: ["operational_readiness_complete"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completionAuditSummary\.achieved must be boolean/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when achieved summary still lists failed criteria", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-achieved-failed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: true,
      completionAuditSummary: {
        achieved: true,
        failedCompletionCriteria: ["live_startup_gate_allowed"],
      },
      checkpointPlan: {
        status: "live_review_allowed",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /failed completion criteria remain/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when achieved summary still has outstanding work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-achieved-outstanding-work-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: true,
      completionAuditSummary: {
        achieved: true,
        failedCompletionCriteria: [],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary achieved is true but checkpointPlan outstanding work remains/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when compact failed criteria are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-compact-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: "operational_readiness_complete",
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completionAuditSummary\.failedCompletionCriteria must be a string array/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when compact failed criteria ids are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-duplicate-compact-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [
          "operational_readiness_complete",
          "operational_readiness_complete",
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completionAuditSummary\.failedCompletionCriteria ids must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint says live should start before completion", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-start-flag-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: true,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.shouldStartLive is true/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint live-start flag is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-start-flag-malformed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: "true",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.shouldStartLive must be boolean/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when compact and detailed failed criteria disagree", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-criteria-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
          { id: "operational_readiness_complete", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /failedCompletionCriteria disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when compact failed criteria are stale but detailed criteria pass", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: true },
          { id: "operational_readiness_complete", passed: true },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /failedCompletionCriteria disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when detailed success criteria entries are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-detailed-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      goalCompletionAuditView: {
        successCriteria: [
          { passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /goalCompletionAuditView\.successCriteria entries must include id and passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when detailed success criteria ids are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-duplicate-detailed-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
          { id: "live_candidate_selected", passed: true },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /goalCompletionAuditView\.successCriteria ids must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when detailed success criteria are empty", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-empty-detailed-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      goalCompletionAuditView: {
        successCriteria: [],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /goalCompletionAuditView\.successCriteria must not be empty/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when live-startup success criterion contradicts gate evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-startup-criterion-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "live_startup_gate_allowed",
            passed: true,
            evidence: {
              liveReady: true,
              liveStartupAllowed: false,
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live_startup_gate_allowed\.passed disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when live summary disagrees with live-startup evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-summary-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      live: {
        liveReady: false,
        liveStartupAllowed: true,
      },
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "live_startup_gate_allowed",
            passed: true,
            evidence: {
              liveReady: true,
              liveStartupAllowed: true,
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live\.liveReady disagrees with live_startup_gate_allowed evidence/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
	
	test("live goal refresh due check fails when profitability success criterion contradicts promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-profitability-criterion-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "profitability_evidence_satisfied",
            passed: true,
            evidence: {
              status: "estimated_carry_only",
              realizedEvidenceAvailable: false,
              livePromotionEvidenceSatisfied: false,
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /profitability_evidence_satisfied\.passed disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operational readiness criterion contradicts checks", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-operational-criterion-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "operational_readiness_complete",
            passed: true,
            evidence: {
              liveReady: false,
              checks: {
                accountFeesConfirmed: true,
                inventoryReady: true,
                hedgeVenueReady: true,
                operationalProofPresent: true,
                operationalProofFresh: true,
                liveExecutionPathReady: true,
              },
              blockers: ["feeScheduleUnconfirmed"],
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operational_readiness_complete\.passed disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when process-control checklist passes while alignment violations remain", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-process-checklist-status-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["process_alignment_clean"],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "process_alignment_clean",
            passed: false,
            evidence: {
              aligned: false,
              violationCount: 1,
            },
          },
        ],
        promptToArtifactChecklist: [
          {
            id: "process_control_clean",
            status: "passed",
            evidence: {
              aligned: false,
              violationCount: 1,
            },
          },
        ],
      },
      processAlignment: {
        status: "blocked_process_alignment",
        aligned: false,
        violationCount: 1,
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /process_control_clean checklist status must be blocked/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when process alignment summary contradicts criterion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-process-summary-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "process_alignment_clean",
            passed: true,
            evidence: {
              aligned: true,
              violationCount: 0,
            },
          },
        ],
      },
      processAlignment: {
        status: "blocked_process_alignment",
        aligned: false,
        violationCount: 1,
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /processAlignment\.aligned disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when flattened process alignment counts disagree with process health", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-process-health-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "process_alignment_clean",
            passed: true,
            evidence: {
              aligned: true,
              violationCount: 0,
            },
          },
        ],
      },
      processAlignment: {
        status: "process_alignment_clean",
        aligned: true,
        violationCount: 0,
        onlineCount: 2,
        processHealth: {
          onlineCount: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /processAlignment\.onlineCount disagrees with processAlignment\.processHealth\.onlineCount/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source completion audit is internally inconsistent", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        failedCriteriaIds: [
          "profitability_evidence_satisfied",
          "current_entry_sanity_clear",
        ],
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
          { id: "current_entry_sanity_clear", passed: false },
          { id: "live_startup_gate_allowed", passed: true },
        ],
        failedCriteriaIdsMatch: false,
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary failed criteria disagree/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source failed ids omit failed criteria", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-criteria-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        failedCriteriaIds: ["profitability_evidence_satisfied"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
          { id: "current_entry_sanity_clear", passed: false },
          { id: "live_startup_gate_allowed", passed: true },
        ],
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary failed criteria disagree/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source failed criteria are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-duplicate-failed-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [
          "profitability_evidence_satisfied",
          "profitability_evidence_satisfied",
        ],
        failedCriteriaIds: ["profitability_evidence_satisfied"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
        ],
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary\.failedCompletionCriteria entries must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source failed criteria ids are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-duplicate-failed-ids-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        failedCriteriaIds: [
          "profitability_evidence_satisfied",
          "profitability_evidence_satisfied",
        ],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
        ],
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary\.failedCriteriaIds entries must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source missing requirements are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-duplicate-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        failedCriteriaIds: ["profitability_evidence_satisfied"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
        ],
        missingRequirements: [
          "spotPerpCarryWatchObservationSpan",
          "spotPerpCarryWatchObservationSpan",
        ],
        missingRequirementCount: 2,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary\.missingRequirements entries must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source criteria ids are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-duplicate-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        failedCriteriaIds: ["profitability_evidence_satisfied"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
          { id: "profitability_evidence_satisfied", passed: true },
        ],
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary\.criteria ids must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source criteria are empty", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-empty-criteria-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
        failedCriteriaIds: [],
        failedCriteriaIdsMatch: true,
        criteria: [],
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary\.criteria must not be empty/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source audit is not achieved without failures", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-false-clear-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: [],
        failedCriteriaIds: [],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "profitability_evidence_satisfied", passed: true },
          { id: "live_startup_gate_allowed", passed: true },
        ],
        missingRequirements: [],
        missingRequirementCount: 0,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary is not achieved but lists no failed or missing requirements/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source completion audit lacks match proof", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-no-proof-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        failedCriteriaIds: ["profitability_evidence_satisfied"],
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
          { id: "live_startup_gate_allowed", passed: true },
        ],
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 1,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary failed criteria disagree/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when copied source completion audit has stale missing count proof", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-audit-stale-count-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["live_candidate_selected"],
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        failedCriteriaIds: ["profitability_evidence_satisfied"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "profitability_evidence_satisfied", passed: false },
          { id: "live_startup_gate_allowed", passed: true },
        ],
        missingRequirements: ["spotPerpCarryWatchObservationSpan"],
        missingRequirementCount: 2,
        missingRequirementCountMatches: true,
      },
      goalCompletionAuditView: {
        successCriteria: [
          { id: "live_candidate_selected", passed: false },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceCompletionAuditSummary missingRequirementCount disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when source and derived audit scopes differ without comparison", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-scope-comparison-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["derivedRequirement"],
        missingRequirementCount: 1,
        missingRequirementClassification: {
          autonomousEvidence: ["derivedRequirement"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["source_criterion"],
        failedCriteriaIds: ["source_criterion"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "source_criterion", passed: false },
        ],
        missingRequirements: ["sourceRequirement"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["derivedRequirement"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completionAuditScopeComparison is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when audit scope comparison disagrees with missing requirements", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-scope-comparison-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["derivedRequirement"],
        missingRequirementCount: 1,
        missingRequirementClassification: {
          autonomousEvidence: ["derivedRequirement"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["source_criterion"],
        failedCriteriaIds: ["source_criterion"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "source_criterion", passed: false },
        ],
        missingRequirements: ["sourceRequirement"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      completionAuditScopeComparison: {
        sourceMissingRequirementCount: 1,
        derivedMissingRequirementCount: 1,
        countsMatch: true,
        addedBySummary: [],
        missingFromSummary: [],
        scopeInterpretation:
          "The source completion audit and derived progress summary cover the same missing requirements.",
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["derivedRequirement"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completionAuditScopeComparison\.addedBySummary disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when audit scope checklist is missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-scope-checklist-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["derivedRequirement"],
        missingRequirementCount: 1,
        missingRequirementClassification: {
          autonomousEvidence: ["derivedRequirement"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      sourceCompletionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["source_criterion"],
        failedCriteriaIds: ["source_criterion"],
        failedCriteriaIdsMatch: true,
        criteria: [
          { id: "source_criterion", passed: false },
        ],
        missingRequirements: ["sourceRequirement"],
        missingRequirementCount: 1,
        missingRequirementCountMatches: true,
      },
      completionAuditScopeComparison: {
        sourceMissingRequirementCount: 1,
        derivedMissingRequirementCount: 1,
        countsMatch: true,
        addedBySummary: ["derivedRequirement"],
        missingFromSummary: ["sourceRequirement"],
        scopeInterpretation:
          "The derived progress summary adds live-goal blocker requirements that are not present in the source completion audit.",
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["derivedRequirement"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /promptToArtifactChecklist must include completion_audit_scope_reconciled/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement classification counts are stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-classification-count-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 2,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassificationCounts disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement classification counts are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-classification-count-malformed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: "1",
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassificationCounts must be a non-negative integer record/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement classification counts lack classification", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-classification-count-orphan-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        missingRequirementClassificationCounts: {
          autonomousEvidence: 0,
          operatorPrerequisites: 1,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassificationCounts requires missingRequirementClassification/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement classification buckets are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-classification-malformed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: "insufficientObservationSpan",
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassification must be a record of string arrays/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level missing requirement classification is stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-top-classification-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      missingRequirementClassification: {
        autonomousEvidence: [],
        operatorPrerequisites: ["insufficientObservationSpan"],
        marketConditions: [],
        liveReadinessGates: [],
        other: [],
      },
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.missingRequirementClassification disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when compact and detailed missing requirements disagree", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-list-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["summaryObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementClassification: {
          autonomousEvidence: ["summaryObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: ["detailedObservationSpan"],
              missingRequirementClassification: {
                autonomousEvidence: ["summaryObservationSpan"],
                operatorPrerequisites: [],
                marketConditions: [],
                liveReadinessGates: [],
                other: [],
              },
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirements disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when compact missing requirements are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-duplicate-compact-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["insufficientObservationSpan", "insufficientObservationSpan"],
        missingRequirementCount: 2,
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completionAuditSummary\.missingRequirements entries must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when detailed missing requirements are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-duplicate-detailed-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: ["insufficientObservationSpan", "insufficientObservationSpan"],
              missingRequirementClassification: {
                autonomousEvidence: ["insufficientObservationSpan"],
              },
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /goalCompletionAuditView\.no_missing_requirements\.missingRequirements entries must be unique/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement count is stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-count-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["insufficientObservationSpan"],
        missingRequirementCount: 2,
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: ["insufficientObservationSpan"],
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementCount disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level missing requirement count is stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-top-missing-count-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      missingRequirementCount: 2,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["insufficientObservationSpan"],
        missingRequirementCount: 1,
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.missingRequirementCount disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement classification duplicates blockers", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-duplicate-classified-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: ["insufficientObservationSpan"],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassification entries must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirements omit their count", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-count-required-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["insufficientObservationSpan"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: ["insufficientObservationSpan"],
              missingRequirementClassification: {
                autonomousEvidence: ["insufficientObservationSpan"],
                operatorPrerequisites: [],
                marketConditions: [],
                liveReadinessGates: [],
                other: [],
              },
            },
          },
        ],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        readinessGap: {
          observationSpanMinutes: { current: 100, required: 4320, remaining: 4220, passed: false },
        },
        verificationCommands: {
          refreshCommand: "npm run dry-run:gate-live-goal-ready",
        },
        reviewSchedule: {
          nextReviewAt: "2026-05-14T16:00:00.002Z",
          nextReviewAtKst: "2026-05-15 01:00:00 KST",
          nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        },
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementCount is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement classification omits listed blockers", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-classification-coverage-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirements: ["insufficientObservationSpan", "wideDisplayedSpread"],
        missingRequirementCount: 2,
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: ["feeScheduleUnconfirmed"],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 1,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "no_missing_requirements",
            passed: false,
            evidence: {
              missingRequirements: ["insufficientObservationSpan", "wideDisplayedSpread"],
              missingRequirementClassification: {
                autonomousEvidence: ["insufficientObservationSpan"],
                operatorPrerequisites: [],
                marketConditions: ["feeScheduleUnconfirmed"],
                liveReadinessGates: [],
                other: [],
              },
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassification does not cover/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirements are unclassified", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-classification-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassification is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when missing requirement classification is empty", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-empty-classification-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: [],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 0,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementClassification is empty/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when outstanding work counts are stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-work-count-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
        outstandingWorkCounts: {
          autonomousEvidence: 2,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /outstandingWorkCounts disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level missing requirement classification counts are stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-top-classification-count-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      missingRequirementClassificationCounts: {
        autonomousEvidence: 2,
        operatorPrerequisites: 0,
        marketConditions: 0,
        liveReadinessGates: 0,
        other: 0,
      },
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.missingRequirementClassificationCounts disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level outstanding work counts are stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-top-work-count-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      outstandingWorkCounts: {
        autonomousEvidence: 2,
        operatorWork: 0,
        marketConditionWork: 0,
      },
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
        missingRequirementClassification: {
          autonomousEvidence: ["insufficientObservationSpan"],
          operatorPrerequisites: [],
          marketConditions: [],
          liveReadinessGates: [],
          other: [],
        },
        missingRequirementClassificationCounts: {
          autonomousEvidence: 1,
          operatorPrerequisites: 0,
          marketConditions: 0,
          liveReadinessGates: 0,
          other: 0,
        },
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        successCriteria: [{ id: "no_missing_requirements", passed: false }],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.outstandingWorkCounts disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when outstanding work counts are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-work-count-malformed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: -1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /outstandingWorkCounts must be a non-negative integer record/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint outstanding work lists are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-checkpoint-work-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: "operationalProof:credentialsMissing",
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.outstandingOperatorWork must be a string array/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint outstanding work lists are duplicated", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-duplicate-checkpoint-work-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [
          "insufficientObservationSpan",
          "insufficientObservationSpan",
        ],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.outstandingAutonomousEvidence entries must be unique/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level operator work disagrees with checkpoint", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-next-operator-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      nextOperatorWork: ["operationalProof:credentialsMissing", "operationalProof:bithumbQuoteInventoryInsufficient"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.nextOperatorWork disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level autonomous work disagrees with checkpoint", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-next-autonomous-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      nextAutonomousWork: ["insufficientObservationSpan", "latestWindowSampleQuality"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.nextAutonomousWork disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level market work disagrees with checkpoint", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-next-market-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_missing_requirements"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      nextMarketConditionWork: ["wideDisplayedSpread", "spreadControl"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.nextMarketConditionWork disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when next work classification misclassifies operator work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-next-work-classification-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [
          "operationalProof:credentialsMissing",
          "operationalProof:bithumbQuoteInventoryInsufficient",
        ],
        outstandingMarketConditionWork: [],
      },
      nextWorkClassification: {
        liveOperationalPrerequisites: ["operationalProof:credentialsMissing"],
        otherLiveGateBlockers: ["operationalProof:bithumbQuoteInventoryInsufficient"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.nextWorkClassification\.liveOperationalPrerequisites disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff is missing for outstanding operator work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-handoff-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorLiveReadinessHandoff is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff disagrees with checkpoint operator work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        requiredBeforeLiveReview: ["feeScheduleUnconfirmed"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorLiveReadinessHandoff\.requiredBeforeLiveReview disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff says live can start while operator work remains", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-start-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: true,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /canStartLiveWithoutOperatorInput is true while operator work remains/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff lacks verification commands", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-commands-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /verificationCommands is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff review command is live-capable", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-operator-live-review-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        verificationCommands: {
          reviewCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorLiveReadinessHandoff\.verificationCommands\.reviewCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff status is stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-status-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_clear_recheck_gate",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /status must be operator_prerequisites_required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when credentials work lacks missing secrets", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-secrets-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: [],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingSecrets is empty/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when inventory work lacks deficit evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-deficit-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:bithumbQuoteInventoryInsufficient"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:bithumbQuoteInventoryInsufficient"],
        deficits: {},
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /deficits\.bithumbQuoteDeficitKrw is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when fee schedule work lacks fee budget evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-fee-budget-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["feeScheduleUnconfirmed"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["feeScheduleUnconfirmed"],
        feeBudget: {},
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /feeBudget\.maxBithumbFeeBps is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when top-level operator work lacks an operator action", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-operator-action-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["inventoryNotReady"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["inventoryNotReady"],
        operatorActions: [],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorActions is missing fund_or_verify_spot_inventory/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when live-readiness checklist operator actions disagree with handoff", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-operator-checklist-action-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "live_readiness_verified",
            status: "blocked",
            evidence: {
              operatorActions: [{ action: "confirm_account_fee_schedule" }],
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["inventoryNotReady"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["inventoryNotReady"],
        operatorActions: [{ action: "fund_or_verify_spot_inventory" }],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live_readiness_verified\.operatorActions disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when live-readiness checklist passes while readiness blockers remain", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-readiness-checklist-status-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "live_readiness_verified",
            status: "passed",
            evidence: {
              liveReady: false,
              blockers: ["feeScheduleUnconfirmed"],
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live_readiness_verified checklist status must be blocked/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator blocker evidence lacks an operator action", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-operator-blocker-action-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:bithumbQuoteInventoryInsufficient"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:bithumbQuoteInventoryInsufficient"],
        deficits: {
          bithumbQuoteDeficitKrw: 500200,
        },
        operatorActions: [
          {
            action: "fund_or_verify_spot_inventory",
            reason: "Bithumb spot leg must have sufficient KRW inventory.",
          },
        ],
        operatorBlockerEvidence: [
          {
            blocker: "operationalProof:bithumbQuoteInventoryInsufficient",
            active: true,
            operatorAction: null,
          },
        ],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
        hardStops: [
          "Do not run the PM2 live command while liveReady is false.",
          "Do not add --submit-once unless the review command and live-goal gate pass.",
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorBlockerEvidence entries must include a concrete operatorAction/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff lacks the PM2 live start command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-pm2-command-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pm2StartCommandAfterAllGatesPass is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff PM2 command after gates is not live start", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-pm2-command-shape-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: "npm run dry-run:summarize-live-goal-progress",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pm2StartCommandAfterAllGatesPass must be a PM2 live start command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator handoff lacks hard stops", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-handoff-hard-stops-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 1,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: ["operationalProof:credentialsMissing"],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: ["operationalProof:credentialsMissing"],
        missingSecrets: ["BINANCE_API_KEY"],
        hardStops: ["Do not submit orders unless credentials are present."],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /PM2 live command liveReady hard stop/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when market handoff is missing for outstanding market condition work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-handoff-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when market handoff review command is process control", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-process-review-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        verificationCommands: {
          reviewCommand: "pm2 restart dry-run-spot-perp-carry-current-carry-fee-stress-observer",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff\.verificationCommands\.reviewCommand must not control processes/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when operator blocker evidence omits an outstanding operator item", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-operator-blocker-evidence-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 2,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [
          "operationalProof:credentialsMissing",
          "operationalProof:bithumbQuoteInventoryInsufficient",
        ],
        outstandingMarketConditionWork: [],
      },
      operatorLiveReadinessHandoff: {
        status: "operator_prerequisites_required",
        canStartLiveWithoutOperatorInput: false,
        requiredBeforeLiveReview: [
          "operationalProof:credentialsMissing",
          "operationalProof:bithumbQuoteInventoryInsufficient",
        ],
        missingSecrets: ["BINANCE_API_KEY"],
        deficits: {
          bithumbQuoteDeficitKrw: 500200,
        },
        operatorBlockerEvidence: [
          {
            blocker: "operationalProof:credentialsMissing",
            active: true,
            operatorAction: {
              action: "refresh_operational_proof_with_credentials",
              reason: "Live readiness requires fresh private account proof.",
            },
          },
        ],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          pm2StartCommandAfterAllGatesPass: "npm run pm2:start:live-spot-perp-carry-pieverse",
        },
        hardStops: [
          "Do not run the PM2 live command while liveReady is false.",
          "Do not add --submit-once unless the review command and live-goal gate pass.",
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /operatorBlockerEvidence must cover every checkpointPlan outstanding operator work item/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when current-entry blockers are hidden from market work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-hidden-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_blocked_or_diagnostic_only",
          currentEntryBlockers: ["staleCurrentEntrySnapshot"],
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        spreadControl: {
          passed: false,
          blockerActive: true,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /outstandingMarketConditionWork must include current-entry blockers/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when below-threshold current entry lacks carry gate evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-carry-gate-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_blocked_or_diagnostic_only",
          currentEntryBlockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        currentEntryStatus: "current_entry_blocked_or_diagnostic_only",
        currentEntryCarryGate: {
          minNetCarryBps: 20,
          selectedNetCarryBps: 18.4,
          deltaToThresholdBps: -1.6,
          passed: false,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /currentEntryCarryGate is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when below-threshold current entry carry gate contradicts blocker", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-carry-gate-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_blocked_or_diagnostic_only",
          currentEntryBlockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          currentEntryCarryGate: {
            minNetCarryBps: 20,
            selectedNetCarryBps: 21,
            deltaToThresholdBps: 1,
            passed: false,
          },
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        currentEntryStatus: "current_entry_blocked_or_diagnostic_only",
        currentEntryCarryGate: {
          minNetCarryBps: 20,
          selectedNetCarryBps: 21,
          deltaToThresholdBps: 1,
          passed: false,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must show selected carry below the live threshold/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when market current-entry carry gate disagrees with strategy handoff", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-market-gate-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_blocked_or_diagnostic_only",
          currentEntryBlockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          currentEntryCarryGate: {
            minNetCarryBps: 20,
            selectedNetCarryBps: 18.4,
            deltaToThresholdBps: -1.6,
            passed: false,
          },
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        currentEntryStatus: "current_entry_blocked_or_diagnostic_only",
        currentEntryCarryGate: {
          minNetCarryBps: 20,
          selectedNetCarryBps: 19.9,
          deltaToThresholdBps: -0.1,
          passed: false,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff\.currentEntryCarryGate disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when current-entry checklist carry gate disagrees with strategy handoff", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-checklist-gate-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "current_entry_sanity_checked",
            status: "blocked",
            evidence: {
              currentEntryCarryGate: {
                minNetCarryBps: 20,
                selectedNetCarryBps: 19.9,
                deltaToThresholdBps: -0.1,
                passed: false,
              },
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_blocked_or_diagnostic_only",
          currentEntryBlockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          currentEntryCarryGate: {
            minNetCarryBps: 20,
            selectedNetCarryBps: 18.4,
            deltaToThresholdBps: -1.6,
            passed: false,
          },
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        currentEntryStatus: "current_entry_blocked_or_diagnostic_only",
        currentEntryCarryGate: {
          minNetCarryBps: 20,
          selectedNetCarryBps: 18.4,
          deltaToThresholdBps: -1.6,
          passed: false,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /current_entry_sanity_checked\.currentEntryCarryGate disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when current-entry checklist passes while blockers remain", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-checklist-status-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "current_entry_sanity_checked",
            status: "passed",
            evidence: {
              currentEntryBlockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
              currentEntryCarryGate: {
                minNetCarryBps: 20,
                selectedNetCarryBps: 18.4,
                deltaToThresholdBps: -1.6,
                passed: false,
              },
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_blocked_or_diagnostic_only",
          currentEntryBlockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          currentEntryCarryGate: {
            minNetCarryBps: 20,
            selectedNetCarryBps: 18.4,
            deltaToThresholdBps: -1.6,
            passed: false,
          },
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        currentEntryStatus: "current_entry_blocked_or_diagnostic_only",
        currentEntryCarryGate: {
          minNetCarryBps: 20,
          selectedNetCarryBps: 18.4,
          deltaToThresholdBps: -1.6,
          passed: false,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /current_entry_sanity_checked checklist status must be blocked/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when cleared current entry lacks passing carry gate evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-clear-gate-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["wideDisplayedSpread"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_clear",
          currentEntryBlockers: [],
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        currentEntryStatus: "current_entry_clear",
        spreadControl: {
          passed: false,
          blockerActive: true,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /currentEntryCarryGate is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when market handoff clears blocked current entry", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-current-entry-stale-clear-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["staleCurrentEntrySnapshot"],
      },
      strategyResearchHandoff: {
        currentEntrySanity: {
          status: "current_entry_blocked_or_diagnostic_only",
          currentEntryBlockers: ["staleCurrentEntrySnapshot"],
        },
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["staleCurrentEntrySnapshot"],
        currentEntryStatus: "current_entry_clear",
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /currentEntryStatus cannot be current_entry_clear/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when market handoff lacks spread evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        spreadControl: null,
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff\.spreadControl is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when research-focus spread handoff claims a breach without challenger spread evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-research-spread-missing-evidence-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["no_current_focus_recompare_caution"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["spreadControl"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["spreadControl"],
        researchFocusSpreadControl: {
          scope: "best_challenger_recompare",
          currentFocusMarket: "KRW-PIEVERSE",
          bestChallengerMarket: "KRW-AZTEC",
          requiredBeforeFocusSwitch: ["spreadControl"],
          bestChallengerSpreadControl: null,
          blockerEvidence: [],
          clearanceProgress: null,
          action:
            "keep_research_focus_recompare_blocked_until_challenger_spread_control_clears",
        },
        verificationCommands: {
          reviewCommand: null,
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
        blockedCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
          manualValidationCommand:
            "npm run dry-run:run-spot-perp-carry-live -- --readiness-report var/reports/spot-perp-carry-pieverse-live-readiness-latest.json --carry-report var/reports/spot-perp-carry-pieverse-72h-latest.json --market KRW-PIEVERSE --output var/reports/spot-perp-carry-pieverse-live-execution-latest.json --live-goal-status var/reports/live-goal-status-20260513-current.json --require-live-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /researchFocusSpreadControl\.action must collect challenger spread-control evidence/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when wide-spread handoff claims spread control passed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-stale-pass-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        spreadControl: {
          passed: true,
          blockerActive: false,
          spreadRejectedRate: 0.05,
          maxSpreadRejectionRate: 0.05,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketConditionHandoff\.spreadControl\.passed is true/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when wide-spread handoff lacks blocker breach evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-evidence-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        spreadControl: {
          passed: false,
          rawPassed: false,
          blockerActive: true,
          spreadRejectedRate: 0.08,
          maxSpreadRejectionRate: 0.05,
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /spreadBlockerEvidence is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when spread clearance progress is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-clearance-malformed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        spreadControl: {
          passed: false,
          rawPassed: false,
          blockerActive: true,
          spreadRejectedRate: 0.08,
          maxSpreadRejectionRate: 0.05,
        },
        spreadBlockerEvidence: {
          ...spreadBlockerEvidence(),
          clearanceProgress: [
            {
              source: "liveReadinessSpreadControl",
              aggregatePassed: "false",
              latestWindowPassed: true,
              spreadRejectedRateExcess: 0.03,
              executionEligibleRateShortfall: 0,
              maxSpreadBpsExcess: null,
            },
          ],
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /clearanceProgress entries must include source and aggregatePassed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when raw-passed wide-spread handoff lacks latest threshold breach", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-raw-pass-unexplained-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
	        spreadControl: {
	          passed: false,
	          rawPassed: true,
	          blockerActive: true,
	          spreadRejectedRate: 0.05,
          executionEligibleRate: 1,
	          maxSpreadRejectionRate: 0.05,
	          latestWindow: {
	            spreadRejectedRate: 0.05,
	          },
	        },
        liveReadinessSpreadControl: {
          passed: false,
          spreadRejectedRate: 0.05,
          maxSpreadRejectionRate: 0.05,
          executionEligibleRate: 0.9,
          minExecutionEligibleRate: 0.95,
        },
        spreadBlockerEvidence: spreadBlockerEvidence(),
	        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /spread evidence must show a threshold breach/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when spread sensitivity looks like live permission", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-sensitivity-live-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
	        spreadControl: {
	          passed: false,
	          rawPassed: false,
	          blockerActive: true,
	          spreadRejectedRate: 0.08,
	          maxSpreadRejectionRate: 0.05,
	        },
        spreadBlockerEvidence: spreadBlockerEvidence(),
	        spreadSensitivity: {
          nearestPassingScenario: {
            maxSpotSpreadBps: 40,
            executionEligibleRate: 0.98,
            spreadRejectedRate: 0.02,
          },
          canRelaxLiveGate: true,
          caveat: "Use the relaxed threshold to approve live startup.",
        },
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /spreadSensitivity\.caveat/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when spread sensitivity asks for an omitted explicit experiment", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-experiment-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
	        spreadControl: {
	          passed: false,
	          rawPassed: false,
	          blockerActive: true,
	          spreadRejectedRate: 0.08,
	          maxSpreadRejectionRate: 0.05,
	        },
        spreadBlockerEvidence: spreadBlockerEvidence(),
	        spreadSensitivity: {
          nearestPassingScenario: {
            maxSpotSpreadBps: 40,
            executionEligibleRate: 0.98,
            spreadRejectedRate: 0.02,
          },
          action: "run_explicit_spread_threshold_experiment_before_any_policy_change",
          caveat:
            "Spread sensitivity is diagnostic only; it does not relax live gates or prove profitability.",
        },
        explicitSpreadThresholdExperiments: [],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /explicitSpreadThresholdExperiments is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when explicit spread experiment looks like live permission", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-experiment-live-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
	        spreadControl: {
	          passed: false,
	          rawPassed: false,
	          blockerActive: true,
	          spreadRejectedRate: 0.08,
	          maxSpreadRejectionRate: 0.05,
	        },
        spreadBlockerEvidence: spreadBlockerEvidence(),
	        explicitSpreadThresholdExperiments: [
          {
            sourcePath: "var/reports/spot-perp-carry-pieverse-spread-threshold-experiment-latest.json",
            market: "KRW-PIEVERSE",
            policyDecision: "authorize_live_startup",
            liveGateImpact: "live_allowed",
            canStartLive: true,
            caveat: "Use this explicit experiment to approve live startup.",
          },
        ],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /explicitSpreadThresholdExperiments\.caveat/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when explicit spread experiment omits measured deltas", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-market-spread-experiment-delta-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
      },
      marketConditionHandoff: {
        status: "market_conditions_required",
        canStartLiveWithoutMarketConditionWork: false,
        requiredBeforeLiveReview: ["wideDisplayedSpread"],
        selectedMarket: "KRW-PIEVERSE",
	        spreadControl: {
	          passed: false,
	          rawPassed: false,
	          blockerActive: true,
	          spreadRejectedRate: 0.08,
	          maxSpreadRejectionRate: 0.05,
	        },
        spreadBlockerEvidence: spreadBlockerEvidence(),
	        spreadSensitivity: {
          action: "run_explicit_spread_threshold_experiment_before_any_policy_change",
          caveat:
            "Spread sensitivity is diagnostic only; it does not relax live gates or prove profitability.",
        },
        explicitSpreadThresholdExperiments: [
          {
            sourcePath: "var/reports/spot-perp-carry-pieverse-spread-threshold-experiment-latest.json",
            market: "KRW-PIEVERSE",
            baselineMaxSpotSpreadBps: 30,
            candidateMaxSpotSpreadBps: 40,
            baselineScenario: {
              maxSpotSpreadBps: 30,
              executionEligibleRate: 0.94,
              spreadRejectedRate: 0.06,
              medianWindowNetCarryBps: 46.2,
              estimatedNetPnlKrwAcrossFundingWindows: 22273,
            },
            candidateScenario: {
              maxSpotSpreadBps: 40,
              executionEligibleRate: 0.99,
              spreadRejectedRate: 0.01,
              medianWindowNetCarryBps: 46.4,
              estimatedNetPnlKrwAcrossFundingWindows: 22240,
            },
            expectancyImproved: false,
            policyDecision: "do_not_relax_spread_gate_no_expectancy_improvement",
            liveGateImpact: "none_diagnostic_only",
            caveat:
              "Explicit spread-threshold experiments are diagnostic only; they do not relax live gates or prove profitability without fill-quality validation and all readiness gates.",
          },
        ],
        verificationCommands: {
          reviewCommand: "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
          gateCommand: "npm run dry-run:gate-live-goal-ready",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /deltaCandidateMinusBaseline/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when autonomous handoff is missing for outstanding autonomous evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-handoff-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousEvidenceHandoff is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when autonomous handoff review command is live-capable", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-live-review-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        reviewCommand: "npm run --silent dry-run:refresh-live-goal-status",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        reviewCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousEvidenceHandoff\.reviewCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when autonomous handoff review command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-chained-review-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        reviewCommand: "npm run --silent dry-run:refresh-live-goal-status",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && node dist/src/cli/summarize-live-goal-progress.js",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousEvidenceHandoff\.reviewCommand must only chain npm dry-run commands with &&/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when autonomous handoff disagrees with checkpoint autonomous evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-handoff-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["collectChallengerFundingEvidence"],
        reviewCommand: "npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousEvidenceHandoff\.requiredBeforeLiveReview disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when autonomous blocker evidence omits outstanding evidence work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-blocker-evidence-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 2,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        outstandingAutonomousEvidence: ["insufficientObservationSpan", "latestWindowSampleQuality"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan", "latestWindowSampleQuality"],
        readinessGap: {
          observationSpanMinutes: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
        },
        readinessTimeline: {
          bottleneck: "observationSpanMinutes",
          estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
        },
        autonomousBlockerEvidence: [
          {
            blocker: "insufficientObservationSpan",
            active: true,
            readinessGap: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
            readinessTimeline: {
              bottleneck: "observationSpanMinutes",
              estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
            },
          },
        ],
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousBlockerEvidence must cover every checkpointPlan outstanding autonomous evidence item/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when autonomous handoff review command disagrees with checkpoint", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-command-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        readinessGap: {
          observationSpanMinutes: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
        },
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand: "npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousEvidenceHandoff\.reviewCommand disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when autonomous handoff review schedule disagrees with checkpoint", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-schedule-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        readinessGap: {
          observationSpanMinutes: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
        },
        nextReviewAt: "2026-05-14T15:00:00.002Z",
        nextReviewAtKst: "2026-05-15 00:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousEvidenceHandoff\.nextReviewAt disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint omits later observation-span sufficiency time", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-sufficiency-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        readinessGap: {
          observationSpanMinutes: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
        },
        readinessTimeline: {
          bottleneck: "observationSpanMinutes",
          estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
        },
        autonomousBlockerEvidence: [
          {
            blocker: "insufficientObservationSpan",
            active: true,
            readinessGap: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
            readinessTimeline: {
              bottleneck: "observationSpanMinutes",
              estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
            },
          },
        ],
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.autonomousEvidenceSufficiency/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint checklist sufficiency evidence disagrees", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-autonomous-sufficiency-checklist-"));
  try {
    const summaryPath = join(directory, "summary.json");
    const autonomousEvidenceSufficiency = {
      blocker: "insufficientObservationSpan",
      bottleneck: "observationSpanMinutes",
      earliestReviewAt: "2026-05-16T18:29:28.748Z",
      earliestReviewAtKst: "2026-05-17 03:29:28 KST",
      delayMinutes: 3126.966,
      nextReviewCanCompleteAutonomousEvidence: false,
      interpretation:
        "The next completed funding-window refresh can update latest-window evidence, but the observation-span gate is not expected to be complete yet.",
    };
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      goalCompletionAuditView: {
        promptToArtifactChecklist: [
          {
            id: "checkpoint_plan_recorded",
            status: "passed",
            evidence: {
              autonomousEvidenceSufficiency: {
                ...autonomousEvidenceSufficiency,
                nextReviewCanCompleteAutonomousEvidence: true,
              },
            },
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
        autonomousEvidenceSufficiency,
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        readinessGap: {
          observationSpanMinutes: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
        },
        readinessTimeline: {
          bottleneck: "observationSpanMinutes",
          estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
        },
        autonomousBlockerEvidence: [
          {
            blocker: "insufficientObservationSpan",
            active: true,
            readinessGap: { current: 1541.221233, required: 4320, remaining: 2778.778767, passed: false },
            readinessTimeline: {
              bottleneck: "observationSpanMinutes",
              estimatedEarliestReviewAt: "2026-05-16T18:29:28.748Z",
            },
          },
        ],
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpoint_plan_recorded\.autonomousEvidenceSufficiency disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when observation-span autonomous gap is missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-observation-gap-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        reviewCommand: "npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /autonomousEvidenceHandoff\.readinessGap\.observationSpanMinutes is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when observation-span autonomous gap is already passing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-observation-gap-passing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        outstandingWorkCounts: {
          autonomousEvidence: 1,
          operatorWork: 0,
          marketConditionWork: 0,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: ["insufficientObservationSpan"],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      autonomousEvidenceHandoff: {
        status: "autonomous_evidence_required",
        canStartLiveWithoutAutonomousEvidenceWork: false,
        requiredBeforeLiveReview: ["insufficientObservationSpan"],
        readinessGap: {
          observationSpanMinutes: { current: 4320, required: 4320, remaining: 0, passed: true },
        },
        reviewCommand: "npm run --silent dry-run:summarize-live-goal-progress",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /autonomousEvidenceHandoff\.readinessGap\.observationSpanMinutes must show a remaining unmet span/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check exits 0 when checkpoint is due", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-due-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "run_full_live_goal_refresh_for_completed_funding_window",
        shouldRunHeavyRefreshNow: true,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewDelayMinutes: -2.166,
        nextReviewOverdue: true,
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "run_full_live_goal_refresh_now",
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
        reason:
          "The next completed funding-window checkpoint is due; run the full live-goal refresh before deciding.",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      exitCode: number;
      checkpointStatus: string;
      checkpointShouldRunHeavyRefreshNow: boolean;
      nextReviewDueByTime: boolean;
      computedNextReviewDelayMinutes: number;
      refreshTrigger: string;
      refreshDue: boolean;
      shouldRunHeavyRefreshNow: boolean;
    };
    assert.equal(report.decision, "run_full_live_goal_refresh");
    assert.equal(report.exitCode, 0);
    assert.equal(report.checkpointStatus, "run_full_live_goal_refresh_for_completed_funding_window");
    assert.equal(report.checkpointShouldRunHeavyRefreshNow, true);
    assert.equal(report.nextReviewDueByTime, true);
    assert.equal(report.refreshTrigger, "checkpoint_flag");
    assert.equal(report.refreshDue, true);
    assert.equal(report.shouldRunHeavyRefreshNow, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint plan is missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
    });

    const result = spawnSync(
      process.execPath,
      ["dist/src/cli/check-live-goal-refresh-due.js", "--summary", summaryPath],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint summary has no generated timestamp", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-generated-at-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary generatedAt is missing or invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when source evidence timestamp is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-source-timestamp-malformed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      source: {
        liveGoalGeneratedAt: "not-a-date",
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary\.source\.liveGoalGeneratedAt must be a valid timestamp/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint decision is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        shouldRunHeavyRefreshNow: null,
      },
    });

    const result = spawnSync(
      process.execPath,
      ["dist/src/cli/check-live-goal-refresh-due.js", "--summary", summaryPath],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /shouldRunHeavyRefreshNow must be boolean/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint metadata strings are malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-metadata-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.status must be a non-empty string/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint review command is live-capable", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-live-review-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        reviewCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary checkpointPlan\.reviewCommand must not be live-capable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint review command chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-chained-review-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        reviewCommand:
          "npm run --silent dry-run:refresh-live-goal-status && node dist/src/cli/summarize-live-goal-progress.js",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary checkpointPlan\.reviewCommand must only chain npm dry-run commands with &&/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint numeric metadata is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-delay-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
        nextReviewDelayMinutes: "27.5",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.nextReviewDelayMinutes must be a finite number/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint overdue metadata is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-overdue-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
        nextReviewOverdue: "false",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.nextReviewOverdue must be boolean/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint recompare buffer flag is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-malformed-recompare-buffer-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
        recompareSampleBufferRequired: "true",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.recompareSampleBufferRequired must be boolean/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint recompare buffer omits funding window", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-buffer-window-missing-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
        recompareSampleBufferRequired: true,
        recompareSampleBufferMinutes: 30,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /recompareSampleBufferRequired requires nextCompletedFundingWindowAt/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint recompare buffer disagrees with review time", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-recompare-buffer-time-mismatch-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:20:00.000Z",
        nextCompletedFundingWindowAt: "2026-05-14T16:00:00.000Z",
        recompareSampleBufferRequired: true,
        recompareSampleBufferMinutes: 30,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /checkpointPlan\.nextReviewAt disagrees with nextCompletedFundingWindowAt and recompareSampleBufferMinutes/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring omits current-entry command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-market-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: ["npm run --silent dry-run:summarize-live-goal-progress"],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must include current-entry fee-stress discovery/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring omits summary refresh", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-summary-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:refresh-spot-perp-carry-focus-current-entry-fee-stress",
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must include live-goal progress summary refresh/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring includes non-dry-run shell command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-shell-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:refresh-spot-perp-carry-focus-current-entry-fee-stress",
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
            "node dist/src/cli/summarize-live-goal-progress.js",
            "npm run --silent dry-run:summarize-live-goal-progress",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must only include npm dry-run commands/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring chains a non-dry-run command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-chained-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:refresh-spot-perp-carry-focus-current-entry-fee-stress",
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress && node dist/src/cli/summarize-live-goal-progress.js",
            "npm run --silent dry-run:summarize-live-goal-progress",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must only include npm dry-run commands/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring omits live-readiness refresh for spread work", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-spread-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["wideDisplayedSpread"],
          action: "continue_spread_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:refresh-spot-perp-carry-spread-threshold-experiments",
            "npm run --silent dry-run:summarize-live-goal-progress",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must include selected-market live-readiness refresh/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring includes live-capable command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-live-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
            "npm run --silent dry-run:summarize-live-goal-progress",
            "npm run pm2:start:live-spot-perp-carry-pieverse",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must not include live-capable command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring includes submit-once live runner", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-submit-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["wideDisplayedSpread"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["wideDisplayedSpread"],
          action: "continue_spread_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:refresh-spot-perp-carry-spread-threshold-experiments",
            "npm run --silent dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
            "npm run --silent dry-run:summarize-live-goal-progress",
            "ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION=true node dist/src/cli/run-spot-perp-carry-live.js --submit-once",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must not include live-capable command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring includes live execution mode env", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-live-mode-env-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
            "npm run --silent dry-run:summarize-live-goal-progress",
            "DRY_RUN_EXECUTION_MODE=live npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must not include live-capable command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring includes exported quoted live env", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-exported-live-env-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
            "npm run --silent dry-run:summarize-live-goal-progress",
            "export TRADING_MODE='live' && npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must not include live-capable command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring includes process control command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-process-command-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
            "npm run --silent dry-run:summarize-live-goal-progress",
            "pm2 restart dry-run-spot-perp-carry-current-carry-fee-stress-observer",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must not include process-control command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when targeted market monitoring includes shell-separated live env", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-targeted-shell-live-env-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T14:22:10.788Z",
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["current_entry_sanity_clear"],
        outstandingWorkCounts: {
          autonomousEvidence: 0,
          operatorWork: 0,
          marketConditionWork: 1,
        },
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldStartLive: false,
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
        targetedMarketConditionMonitoring: {
          status: "active",
          blockers: ["selectedFocusCurrentEntryCarryBelowLiveThreshold"],
          action: "continue_current_entry_monitoring_without_full_live_goal_refresh",
          commands: [
            "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
            "npm run --silent dry-run:summarize-live-goal-progress",
            "true;TRADING_MODE=live;npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress",
          ],
          canAuthorizeLiveStartup: false,
          interpretation:
            "These market-condition checks can update short-cycle evidence; they cannot authorize live startup.",
        },
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T14:22:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /commands must not include live-capable command/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint delay metadata disagrees with timestamps", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-delay-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
        nextReviewDelayMinutes: 1,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.nextReviewDelayMinutes disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint overdue metadata disagrees with timestamps", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-overdue-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:02:10.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
        nextReviewOverdue: true,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /checkpointPlan\.nextReviewOverdue disagrees/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when waiting checkpoint has no next review time", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-missing-next-review-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T15:50:00.000Z",
      achieved: false,
      checkpointPlan: {
        shouldRunHeavyRefreshNow: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T15:55:00.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /nextReviewAt is missing or invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint summary is stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2000-01-01T00:00:00.000Z",
      achieved: false,
      checkpointPlan: {
        shouldRunHeavyRefreshNow: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary is stale/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due report marks stale source evidence without hiding checkpoint decision", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-source-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:00:00.000Z",
      source: {
        liveGoalStatusPath: "var/reports/live-goal-status-current.json",
        liveGoalGeneratedAt: "2026-05-14T14:00:00.000Z",
        processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
        processAlignmentGeneratedAt: "2026-05-14T15:50:00.000Z",
      },
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T18:00:00.000Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      exitCode: number;
      sourceEvidenceFreshness: {
        liveGoalAgeMinutes: number | null;
        processAlignmentAgeMinutes: number | null;
      };
      sourceEvidenceStaleness: {
        maxSourceAgeMinutes: number | null;
        liveGoalStatusStale: boolean;
        processAlignmentStale: boolean;
        researchSourceStale: boolean;
        currentEntryEvidenceStale: boolean;
        staleSources: string[];
        canUseForLiveStartupReview: boolean;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
        interpretation: string;
      };
      checkpointShouldRunHeavyRefreshNow: boolean;
      nextReviewDueByTime: boolean;
      sourceEvidenceRefreshDue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
      shouldRunHeavyRefreshNow: boolean;
    };
    assert.equal(report.decision, "refresh_stale_source_evidence");
    assert.equal(report.exitCode, 0);
    assert.equal(report.sourceEvidenceFreshness.liveGoalAgeMinutes, 122.5);
    assert.equal(report.sourceEvidenceFreshness.processAlignmentAgeMinutes, 12.5);
    assert.deepEqual(report.sourceEvidenceStaleness, {
      maxSourceAgeMinutes: 30,
      liveGoalStatusStale: true,
      processAlignmentStale: false,
      researchSourceStale: false,
      currentEntryEvidenceStale: false,
      liveReadinessStale: false,
      operationalProofStale: false,
      staleSources: ["liveGoalStatus"],
      canUseForLiveStartupReview: false,
      requiredBeforeLiveStartupReview: ["refresh_stale_live_goal_source_evidence"],
      refreshCommand:
        "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      interpretation:
        "Source evidence is stale; refresh live-goal sources before using this artifact for live startup review.",
    });
    assert.equal(report.checkpointShouldRunHeavyRefreshNow, false);
    assert.equal(report.nextReviewDueByTime, false);
    assert.equal(report.sourceEvidenceRefreshDue, true);
    assert.equal(report.refreshTrigger, "stale_source_evidence");
    assert.equal(report.refreshDue, true);
    assert.equal(report.shouldRunHeavyRefreshNow, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due report refreshes when live-goal status may lag newer research evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-lagging-live-goal-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:00:00.000Z",
      source: {
        liveGoalStatusPath: "var/reports/live-goal-status-current.json",
        liveGoalGeneratedAt: "2026-05-14T15:55:00.000Z",
        processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
        processAlignmentGeneratedAt: "2026-05-14T15:58:00.000Z",
      },
      researchSourceFreshness: {
        sourcePath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
        generatedAt: "2026-05-14T15:59:00.000Z",
        sourceNewerThanLiveGoal: true,
        observationCountDelta: 2,
        liveGoalMayLagResearchSource: true,
      },
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T18:00:00.000Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      exitCode: number;
      sourceEvidenceAlignment: {
        liveGoalMayLagResearchSource: boolean;
        sourceNewerThanLiveGoal: boolean | null;
        observationCountDelta: number | null;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
      };
      sourceEvidenceStaleness: {
        staleSources: string[];
        canUseForLiveStartupReview: boolean;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
      };
      checkpointShouldRunHeavyRefreshNow: boolean;
      nextReviewDueByTime: boolean;
      sourceEvidenceRefreshDue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
      shouldRunHeavyRefreshNow: boolean;
    };
    assert.equal(report.decision, "refresh_source_evidence_alignment");
    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.sourceEvidenceAlignment, {
      liveGoalMayLagResearchSource: true,
      sourceNewerThanLiveGoal: true,
      observationCountDelta: 2,
      requiredBeforeLiveStartupReview: ["refresh_live_goal_status_after_newer_research_source"],
      refreshCommand:
        "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      interpretation:
        "The research source is newer than the embedded live-goal status; refresh live-goal status before using this artifact for live startup review.",
    });
    assert.deepEqual(report.sourceEvidenceStaleness.staleSources, []);
    assert.equal(report.sourceEvidenceStaleness.canUseForLiveStartupReview, false);
    assert.deepEqual(report.sourceEvidenceStaleness.requiredBeforeLiveStartupReview, [
      "refresh_live_goal_status_after_newer_research_source",
    ]);
    assert.equal(
      report.sourceEvidenceStaleness.refreshCommand,
      "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
    );
    assert.equal(report.checkpointShouldRunHeavyRefreshNow, false);
    assert.equal(report.nextReviewDueByTime, false);
    assert.equal(report.sourceEvidenceRefreshDue, true);
    assert.equal(report.refreshTrigger, "source_evidence_alignment");
    assert.equal(report.refreshDue, true);
    assert.equal(report.shouldRunHeavyRefreshNow, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due report remains usable when fresh research evidence is aligned", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-aligned-live-goal-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:00:00.000Z",
      source: {
        liveGoalStatusPath: "var/reports/live-goal-status-current.json",
        liveGoalGeneratedAt: "2026-05-14T15:59:30.000Z",
        processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
        processAlignmentGeneratedAt: "2026-05-14T15:58:00.000Z",
      },
      researchSourceFreshness: {
        sourcePath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
        generatedAt: "2026-05-14T15:59:00.000Z",
        sourceNewerThanLiveGoal: false,
        observationCountDelta: 0,
        liveGoalMayLagResearchSource: false,
      },
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T18:00:00.000Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      sourceEvidenceAlignment: {
        liveGoalMayLagResearchSource: boolean;
        sourceNewerThanLiveGoal: boolean | null;
        observationCountDelta: number | null;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
      };
      sourceEvidenceStaleness: {
        canUseForLiveStartupReview: boolean;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
      };
      sourceEvidenceRefreshDue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
    };
    assert.equal(report.decision, "skip_full_refresh_until_next_review");
    assert.deepEqual(report.sourceEvidenceAlignment, {
      liveGoalMayLagResearchSource: false,
      sourceNewerThanLiveGoal: false,
      observationCountDelta: 0,
      requiredBeforeLiveStartupReview: [],
      refreshCommand: null,
      interpretation: "Embedded live-goal status is aligned with the research source for this due-check.",
    });
    assert.equal(report.sourceEvidenceStaleness.canUseForLiveStartupReview, true);
    assert.deepEqual(report.sourceEvidenceStaleness.requiredBeforeLiveStartupReview, []);
    assert.equal(report.sourceEvidenceStaleness.refreshCommand, null);
    assert.equal(report.sourceEvidenceRefreshDue, false);
    assert.equal(report.refreshTrigger, "not_due");
    assert.equal(report.refreshDue, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due report does not self-loop when newer research timestamp has no observation delta", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-zero-delta-live-goal-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:00:00.000Z",
      source: {
        liveGoalStatusPath: "var/reports/live-goal-status-current.json",
        liveGoalGeneratedAt: "2026-05-14T15:55:00.000Z",
        processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
        processAlignmentGeneratedAt: "2026-05-14T15:58:00.000Z",
      },
      researchSourceFreshness: {
        sourcePath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
        generatedAt: "2026-05-14T15:59:00.000Z",
        sourceNewerThanLiveGoal: true,
        observationCountDelta: 0,
        liveGoalMayLagResearchSource: true,
      },
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T18:00:00.000Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      sourceEvidenceAlignment: {
        liveGoalMayLagResearchSource: boolean;
        sourceNewerThanLiveGoal: boolean | null;
        observationCountDelta: number | null;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
      };
      sourceEvidenceStaleness: {
        canUseForLiveStartupReview: boolean;
        requiredBeforeLiveStartupReview: string[];
        refreshCommand: string | null;
      };
      sourceEvidenceRefreshDue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
      shouldRunHeavyRefreshNow: boolean;
    };
    assert.equal(report.decision, "skip_full_refresh_until_next_review");
    assert.deepEqual(report.sourceEvidenceAlignment, {
      liveGoalMayLagResearchSource: false,
      sourceNewerThanLiveGoal: true,
      observationCountDelta: 0,
      requiredBeforeLiveStartupReview: [],
      refreshCommand: null,
      interpretation: "Embedded live-goal status is aligned with the research source for this due-check.",
    });
    assert.equal(report.sourceEvidenceStaleness.canUseForLiveStartupReview, true);
    assert.deepEqual(report.sourceEvidenceStaleness.requiredBeforeLiveStartupReview, []);
    assert.equal(report.sourceEvidenceStaleness.refreshCommand, null);
    assert.equal(report.sourceEvidenceRefreshDue, false);
    assert.equal(report.refreshTrigger, "not_due");
    assert.equal(report.refreshDue, false);
    assert.equal(report.shouldRunHeavyRefreshNow, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due report marks stale embedded carry evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-carry-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:00:00.000Z",
      source: {
        liveGoalStatusPath: "var/reports/live-goal-status-current.json",
        liveGoalGeneratedAt: "2026-05-14T15:50:00.000Z",
        processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
        processAlignmentGeneratedAt: "2026-05-14T15:55:00.000Z",
      },
      researchSourceFreshness: {
        sourcePath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
        generatedAt: "2026-05-14T15:10:00.000Z",
      },
      strategyDecisionView: {
        reducedActivityGuardrail: {
          status: "active",
          rule:
            "Do not treat fewer executable entries or spread-filtered activity as proof of improved profitability.",
          interpretation:
            "This guardrail can block or downgrade a research-focus switch; it cannot authorize live startup.",
          livePromotionMinimumExecutionEligibleRate: 0.95,
          livePromotionMaximumSpreadRejectionRate: 0.05,
          currentFocus: {
            market: "KRW-PIEVERSE",
            executionEligibleRate: 1,
            spreadRejectedRate: 0,
            executionEligibleRateMeetsLiveGate: true,
            spreadRejectionMeetsLiveGate: true,
          },
          bestChallenger: {
            market: "KRW-AZTEC",
            executionEligibleRate: 1,
            executionEligibleRateMeetsLiveGate: true,
          },
          rawBestChallenger: {
            market: "KRW-AZTEC",
            knownQualityFailureReasons: [],
          },
          warnings: [],
        },
        currentEntrySanityView: {
          preferredSourcePath:
            "var/reports/spot-perp-carry-focus-current-entry-25bps-latest.json",
          currentEntryEvidenceTimestamp: "2026-05-14T15:20:00.000Z",
        },
      },
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
      },
      goalCompletionAuditView: {
        successCriteria: [
          {
            id: "profitability_evidence_satisfied",
            passed: false,
          },
          {
            id: "reduced_activity_guardrail_enforced",
            passed: true,
          },
        ],
        promptToArtifactChecklist: [
          {
            id: "subagent_current_analysis_handoff_reflected",
            status: "passed",
            evidence: {
              canAuthorizeLiveStartup: false,
              strategyStatus: "challenger_evidence_required",
              spreadSensitivity: {
                caveat:
                  "Spread sensitivity is diagnostic only; it does not relax live gates or prove profitability.",
              },
            },
          },
          {
            id: "reduced_activity_guardrail_enforced",
            status: "passed",
          },
        ],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T18:00:00.000Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
      strategyResearchHandoff: {
        status: "challenger_evidence_required",
        canAuthorizeLiveStartup: false,
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      exitCode: number;
      sourceEvidenceFreshness: {
        researchSourceAgeMinutes: number | null;
        currentEntryEvidenceAgeMinutes: number | null;
      };
      sourceEvidenceStaleness: {
        liveGoalStatusStale: boolean;
        processAlignmentStale: boolean;
        researchSourceStale: boolean;
        currentEntryEvidenceStale: boolean;
        staleSources: string[];
        canUseForLiveStartupReview: boolean;
      };
      checkpointShouldRunHeavyRefreshNow: boolean;
      nextReviewDueByTime: boolean;
      sourceEvidenceRefreshDue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
      shouldRunHeavyRefreshNow: boolean;
    };
    assert.equal(report.decision, "refresh_stale_source_evidence");
    assert.equal(report.exitCode, 0);
    assert.equal(report.sourceEvidenceFreshness.researchSourceAgeMinutes, 52.5);
    assert.equal(report.sourceEvidenceFreshness.currentEntryEvidenceAgeMinutes, 42.5);
    assert.deepEqual(report.sourceEvidenceStaleness, {
      maxSourceAgeMinutes: 30,
      liveGoalStatusStale: false,
      processAlignmentStale: false,
      researchSourceStale: true,
      currentEntryEvidenceStale: true,
      liveReadinessStale: false,
      operationalProofStale: false,
      staleSources: ["researchSource", "currentEntryEvidence"],
      canUseForLiveStartupReview: false,
      requiredBeforeLiveStartupReview: ["refresh_stale_live_goal_source_evidence"],
      refreshCommand:
        "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      interpretation:
        "Source evidence is stale; refresh live-goal sources before using this artifact for live startup review.",
    });
    assert.equal(report.checkpointShouldRunHeavyRefreshNow, false);
    assert.equal(report.nextReviewDueByTime, false);
    assert.equal(report.sourceEvidenceRefreshDue, true);
    assert.equal(report.refreshTrigger, "stale_source_evidence");
    assert.equal(report.refreshDue, true);
    assert.equal(report.shouldRunHeavyRefreshNow, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due report marks stale operational readiness evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-operational-readiness-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:00:00.000Z",
      source: {
        liveGoalStatusPath: "var/reports/live-goal-status-current.json",
        liveGoalGeneratedAt: "2026-05-14T15:50:00.000Z",
        processAlignmentPath: "var/reports/live-goal-process-alignment-latest.json",
        processAlignmentGeneratedAt: "2026-05-14T15:55:00.000Z",
      },
      researchSourceFreshness: {
        sourcePath: "var/reports/spot-perp-carry-pieverse-72h-latest.json",
        generatedAt: "2026-05-14T15:50:00.000Z",
      },
      operationalReadiness: {
        generatedAt: "2026-05-14T15:20:00.000Z",
        operationalProof: {
          generatedAt: "2026-05-14T15:10:00.000Z",
        },
        checks: {
          operationalProofFresh: true,
        },
      },
      achieved: false,
      completionAuditSummary: {
        achieved: false,
        failedCompletionCriteria: ["operational_readiness_complete"],
      },
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T18:00:00.000Z",
        outstandingAutonomousEvidence: [],
        outstandingOperatorWork: [],
        outstandingMarketConditionWork: [],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      sourceEvidenceFreshness: {
        liveReadinessAgeMinutes: number | null;
        operationalProofAgeMinutes: number | null;
      };
      sourceEvidenceStaleness: {
        liveReadinessStale: boolean;
        operationalProofStale: boolean;
        staleSources: string[];
        canUseForLiveStartupReview: boolean;
      };
      sourceEvidenceRefreshDue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
    };
    assert.equal(report.decision, "refresh_stale_source_evidence");
    assert.equal(report.sourceEvidenceFreshness.liveReadinessAgeMinutes, 42.5);
    assert.equal(report.sourceEvidenceFreshness.operationalProofAgeMinutes, 52.5);
    assert.equal(report.sourceEvidenceStaleness.liveReadinessStale, true);
    assert.equal(report.sourceEvidenceStaleness.operationalProofStale, true);
    assert.deepEqual(report.sourceEvidenceStaleness.staleSources, [
      "liveReadiness",
      "operationalProof",
    ]);
    assert.equal(report.sourceEvidenceStaleness.canUseForLiveStartupReview, false);
    assert.equal(report.sourceEvidenceRefreshDue, true);
    assert.equal(report.refreshTrigger, "stale_source_evidence");
    assert.equal(report.refreshDue, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check fails when checkpoint summary is from the future", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-future-summary-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T16:10:00.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:30:00.000Z",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--now",
        "2026-05-14T16:02:30.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary generatedAt is in the future/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check runs refresh when next review time has arrived even if checkpoint flag is stale", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-stale-flag-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T15:59:00.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
        nextReviewDelayMinutes: 1,
        nextReviewOverdue: false,
        nextReviewTrigger: "next_completed_fee_stressed_funding_window",
        recommendedAutonomousAction: "wait_then_run_full_live_goal_refresh",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "30",
        "--now",
        "2026-05-14T16:01:00.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      decision: string;
      checkpointShouldRunHeavyRefreshNow: boolean;
      nextReviewDueByTime: boolean;
      nextReviewDelayMinutes: number;
      checkpointNextReviewDelayMinutes: number;
      computedNextReviewDelayMinutes: number;
      nextReviewOverdue: boolean;
      checkpointNextReviewOverdue: boolean;
      computedNextReviewOverdue: boolean;
      refreshTrigger: string;
      refreshDue: boolean;
    };
    assert.equal(report.decision, "run_full_live_goal_refresh");
    assert.equal(report.checkpointShouldRunHeavyRefreshNow, false);
    assert.equal(report.nextReviewDueByTime, true);
    assert.equal(report.nextReviewDelayMinutes, -0.9999666666666667);
    assert.equal(report.checkpointNextReviewDelayMinutes, 1);
    assert.equal(report.computedNextReviewDelayMinutes, -0.9999666666666667);
    assert.equal(report.nextReviewOverdue, true);
    assert.equal(report.checkpointNextReviewOverdue, false);
    assert.equal(report.computedNextReviewOverdue, true);
    assert.equal(report.refreshTrigger, "next_review_time");
    assert.equal(report.refreshDue, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal refresh due check still enforces freshness after next review time", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-refresh-due-stale-summary-"));
  try {
    const summaryPath = join(directory, "summary.json");
    writeJson(summaryPath, {
      generatedAt: "2026-05-14T15:40:00.000Z",
      achieved: false,
      checkpointPlan: {
        status: "pause_heavy_refresh_until_next_completed_funding_window",
        shouldRunHeavyRefreshNow: false,
        nextReviewAt: "2026-05-14T16:00:00.002Z",
        nextReviewAtKst: "2026-05-15 01:00:00 KST",
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/check-live-goal-refresh-due.js",
        "--summary",
        summaryPath,
        "--max-summary-age-minutes",
        "15",
        "--now",
        "2026-05-14T16:01:00.000Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /summary is stale/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
