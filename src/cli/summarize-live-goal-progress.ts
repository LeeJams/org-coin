import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

interface Args {
  liveGoalStatusPath: string | null;
  processAlignmentPath: string | null;
  spreadThresholdExperimentPaths: string[];
  outputPath: string | null;
  requireLiveReady: boolean;
  quiet: boolean;
  checkpointOnly: boolean;
}

const RECOMPARE_LATEST_WINDOW_SAMPLE_BUFFER_MINUTES = 30;

interface LiveGoalStatus {
  generatedAt?: string;
  objective?: string;
  status?: string;
  liveReady?: boolean;
  liveStartupAllowed?: boolean;
  selectedLiveCandidate?: unknown;
  selectedResearchFocus?: {
    type?: string;
    market?: string;
    symbol?: string;
    sourcePath?: string;
    candidateRole?: string;
    usableForLivePromotion?: boolean;
    rationale?: string;
  } | null;
  profitabilityEvidence?: {
    status?: string;
    realizedPnlKrw?: number | null;
    realizedReturnPct?: number | null;
    realizedEvidenceAvailable?: boolean;
    estimatedCarry?: Record<string, unknown> | null;
    fallbackEstimatedCarry?: Record<string, unknown> | null;
    livePromotionEvidenceSatisfied?: boolean;
    interpretation?: string;
  };
  nextActionPlan?: Array<{
    priority?: number;
    track?: string;
    action?: string;
    requiredEvidenceBeforeLive?: string[];
    verificationCommand?: string;
    currentEvidence?: {
      readinessGap?: unknown;
      readinessTimeline?: unknown;
      usableForLivePromotion?: boolean;
      spreadControl?: unknown;
      researchFocusDecision?: unknown;
      liveReadinessPath?: string;
    };
  }>;
  liveStartupPlan?: {
    status?: string;
    focusRecompare?: unknown;
    recompareChallengerPlan?: unknown;
    gateCommand?: string;
    reviewCommand?: string | null;
    manualValidationCommand?: string | null;
    pm2StartCommand?: string | null;
    blockedReason?: string | null;
    blockedCommands?: {
      reviewCommand?: string | null;
      manualValidationCommand?: string | null;
      pm2StartCommand?: string | null;
    } | null;
    orderSubmissionDefault?: string;
    requiredEnvForLiveValidation?: string[];
    requiredEnvForOrderSubmission?: string[];
    hardStops?: string[];
    currentBlockers?: string[];
  };
  processControlPlan?: unknown;
  strategyDecision?: Record<string, unknown>;
  strategyLifecycleDecision?: Record<string, unknown>;
  spotPerpCarryResearchFocusDecision?: Record<string, unknown>;
  carryStrategyComparison?: Record<string, unknown>;
  switchPlan?: Record<string, unknown>;
  carryMarketDecisionMatrix?: Array<Record<string, unknown>>;
  carryWatchlist?: Array<Record<string, unknown>>;
  carryLiveReadinessReports?: Array<Record<string, unknown>>;
  completionAudit?: {
    achieved?: boolean;
    failedCompletionCriteria?: string[];
    missingRequirements?: string[];
    missingRequirementCount?: number;
    criteria?: Array<{
      id?: string;
      criterion?: string;
      passed?: boolean;
    }>;
  };
  blockers?: string[];
}

interface ProcessAlignment {
  generatedAt?: string;
  aligned?: boolean;
  violationCount?: number;
  processCount?: number;
  processes?: Array<{
    name?: string;
    argumentAudit?: {
      requiredSubstrings?: string[];
      missingSubstrings?: string[];
    } | null;
  }>;
  processHealth?: {
    onlineCount?: number;
    waitingRestartCount?: number;
    expectedLoopingObserverCount?: number;
    expectedLoopingObserversWithoutAutorestart?: string[];
    unstableRestartProcessCount?: number;
    maxRestartDelayMs?: number;
  };
  savedProcessControl?: Record<string, unknown> | null;
  status?: string;
}

interface SpotPerpLiveReadiness {
  generatedAt?: string;
  status?: string;
  liveReady?: boolean;
  blockers?: string[];
  nextOperationalSteps?: Array<{
    action?: string;
    reason?: string;
    missingSecrets?: string[];
    requirements?: Record<string, unknown>;
    deficits?: Record<string, unknown>;
  }>;
  checks?: Record<string, unknown>;
  evidence?: {
    feeStressReports?: Array<{
      generatedAt?: string | null;
      fundingWindowSummary?: Record<string, unknown> | null;
      summary?: Record<string, unknown> | null;
    }>;
    operationalProof?: {
      generatedAt?: string;
      accountFeesConfirmed?: boolean;
      inventoryReady?: boolean;
      hedgeVenueReady?: boolean;
      requirements?: Record<string, unknown>;
      deficits?: Record<string, unknown>;
      details?: {
        missingSecrets?: string[];
        feeBudget?: Record<string, unknown>;
      };
      reasons?: string[];
    };
  };
}

interface SpotPerpCarryReport {
  generatedAt?: string;
  status?: string;
  promotionEligible?: boolean;
  observationCount?: number;
  observationSpanMinutes?: number;
  assumptions?: {
    notionalKrw?: number;
  };
  fundingWindowSummary?: Record<string, unknown>;
  summary?: {
    completedFundingCount?: number;
    executionEligibleMedianNetCarryBps?: number;
    executionEligibleTotalEstimatedNetPnlKrw?: number;
    executionEligibleRate?: number;
    executionEligiblePositiveRate?: number;
  };
}

type NextAction = NonNullable<LiveGoalStatus["nextActionPlan"]>[number];

const AUTONOMOUS_CHALLENGER_CHECK_MARKETS = [
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
];
const REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH = 6;
const MIN_LATEST_FEE_STRESS_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE = 5;
const LIVE_PROMOTION_MIN_NET_CARRY_BPS = 20;
const LIVE_PROMOTION_MIN_EXECUTION_ELIGIBLE_RATE = 0.95;
const LIVE_PROMOTION_MAX_SPREAD_REJECTION_RATE = 0.05;
const MAX_CURRENT_ENTRY_EVIDENCE_AGE_MINUTES = 30;
const RECOMPARE_BLOCKED_COMMAND_HARD_STOP =
  "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.";

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    liveGoalStatusPath: null,
    processAlignmentPath: null,
    spreadThresholdExperimentPaths: [],
    outputPath: null,
    requireLiveReady: false,
    quiet: false,
    checkpointOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--live-goal-status") {
      if (!value) throw new Error("--live-goal-status requires a value");
      args.liveGoalStatusPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--process-alignment") {
      if (!value) throw new Error("--process-alignment requires a value");
      args.processAlignmentPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--spread-threshold-experiment") {
      if (!value) throw new Error("--spread-threshold-experiment requires a value");
      args.spreadThresholdExperimentPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--require-live-ready") {
      args.requireLiveReady = true;
      continue;
    }
    if (arg === "--quiet") {
      args.quiet = true;
      continue;
    }
    if (arg === "--checkpoint-only") {
      args.checkpointOnly = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.liveGoalStatusPath === null) throw new Error("--live-goal-status is required");
  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string | null): Promise<T | null> {
  if (path === null) return null;
  try {
    return await readJson<T>(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isCurrentEntryReportPath(path: string): boolean {
  return (
    path.includes("spot-perp-carry-current-carry") ||
    path.includes("spot-perp-carry-top-funding-discovery") ||
    path.includes("spot-perp-carry-focus-current-entry")
  );
}

function isOpportunityObservationReportPath(path: string): boolean {
  return path.includes("spot-perp-carry-opportunity");
}

function isRefreshableCarryWatchReportPath(path: string): boolean {
  return isCurrentEntryReportPath(path) || isOpportunityObservationReportPath(path);
}

async function refreshCarryWatchReportSnapshots(
  carryWatchlist: Array<Record<string, unknown>> | undefined,
): Promise<Array<Record<string, unknown>> | undefined> {
  if (carryWatchlist === undefined) return undefined;
  return await Promise.all(
    carryWatchlist.map(async (report) => {
      const sourcePath = stringField(report.path);
      if (sourcePath === null || !isAbsolute(sourcePath) || !isRefreshableCarryWatchReportPath(sourcePath)) {
        return report;
      }
      const diskReport = await readOptionalJson<Record<string, unknown>>(sourcePath);
      if (diskReport === null) return report;
      const diskGeneratedAtMs = timestampMs(stringField(diskReport.generatedAt));
      const embeddedGeneratedAtMs = timestampMs(stringField(report.generatedAt));
      if (
        diskGeneratedAtMs === null ||
        (embeddedGeneratedAtMs !== null && diskGeneratedAtMs <= embeddedGeneratedAtMs)
      ) {
        return report;
      }
      return {
        ...diskReport,
        path: sourcePath,
        embeddedGeneratedAt: report.generatedAt ?? null,
        embeddedReportWasStale: true,
      };
    }),
  );
}

function firstPriorityAction(liveGoal: LiveGoalStatus): NextAction | null {
  const actions = liveGoal.nextActionPlan ?? [];
  if (actions.length === 0) return null;
  return [...actions].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))[0] ?? null;
}

function decisionStatus(liveGoal: LiveGoalStatus, processAlignment: ProcessAlignment | null): string {
  if (liveGoal.liveReady === true && liveGoal.liveStartupAllowed === true && processAlignment?.aligned !== false) {
    return "live_startup_review_allowed";
  }
  if (processAlignment?.aligned === false) return "blocked_process_alignment";
  if (liveGoal.selectedResearchFocus) return "blocked_continue_research_focus";
  return "blocked_no_live_candidate";
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function numericField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function kstTimestamp(value: string | null | undefined): string | null {
  const timestamp = timestampMs(value);
  if (timestamp === null) return null;
  return `${new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ")} KST`;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function classificationCounts(value: unknown): Record<string, number> | null {
  const record = recordField(value);
  if (Object.keys(record).length === 0) return null;
  return Object.fromEntries(
    Object.entries(record).map(([key, bucket]) => [key, stringArrayField(bucket).length]),
  );
}

function summarizeSourceCompletionAudit(audit: LiveGoalStatus["completionAudit"] | undefined): Record<string, unknown> | null {
  if (audit === undefined) return null;
  const criteria = Array.isArray(audit.criteria)
    ? audit.criteria
        .map((criterion) => ({
          id: stringField(criterion.id),
          criterion: stringField(criterion.criterion),
          passed: criterion.passed === true,
        }))
        .filter((criterion) => criterion.id !== null)
    : [];
  const failedCompletionCriteria = stringArrayField(audit.failedCompletionCriteria);
  const failedCriteriaIds = criteria
    .filter((criterion) => criterion.passed !== true)
    .map((criterion) => criterion.id)
    .filter((id): id is string => id !== null);
  const missingRequirements = stringArrayField(audit.missingRequirements);
  const missingRequirementCount = numericField(audit.missingRequirementCount);
  return {
    achieved: audit.achieved === true,
    failedCompletionCriteria,
    missingRequirements,
    missingRequirementCount,
    criteria,
    failedCriteriaIds,
    failedCriteriaIdsMatch:
      criteria.length > 0 && audit.failedCompletionCriteria !== undefined
        ? sameStringSet(failedCompletionCriteria, failedCriteriaIds)
        : null,
    missingRequirementCountMatches:
      missingRequirementCount !== null ? missingRequirementCount === missingRequirements.length : null,
  };
}

function buildCompletionAuditScopeComparison(
  sourceCompletionAuditSummary: Record<string, unknown> | null,
  derivedMissingRequirements: string[],
): Record<string, unknown> | null {
  if (sourceCompletionAuditSummary === null) return null;
  const sourceMissingRequirements = stringArrayField(sourceCompletionAuditSummary.missingRequirements);
  const addedBySummary = derivedMissingRequirements.filter(
    (requirement) => !sourceMissingRequirements.includes(requirement),
  );
  const missingFromSummary = sourceMissingRequirements.filter(
    (requirement) => !derivedMissingRequirements.includes(requirement),
  );
  return {
    sourceMissingRequirementCount: sourceMissingRequirements.length,
    derivedMissingRequirementCount: derivedMissingRequirements.length,
    countsMatch: sourceMissingRequirements.length === derivedMissingRequirements.length,
    addedBySummary,
    missingFromSummary,
    scopeInterpretation:
      addedBySummary.length === 0 && missingFromSummary.length === 0
        ? "The source completion audit and derived progress summary cover the same missing requirements."
        : "The derived progress summary adds live-goal blocker requirements that are not present in the source completion audit.",
  };
}

function fundingWindowMedianCarryBpsFromSummary(summary: Record<string, unknown>): number | null {
  return numericField(summary.medianWindowNetCarryBps);
}

function fundingWindowMedianCarryBpsFromMetrics(metrics: Record<string, unknown>): number | null {
  return fundingWindowMedianCarryBpsFromSummary(recordField(metrics.fundingWindowSummary));
}

function feeStressCompletedFundingWindowCount(feeStressEvidence: Record<string, unknown>): number | null {
  return numericField(recordField(feeStressEvidence.fundingWindowSummary).completedFundingWindowCount);
}

function latestFundingWindowSnapshot(summary: Record<string, unknown>): Record<string, unknown> | null {
  const windows = Array.isArray(summary.windows)
    ? summary.windows
        .filter((window): window is Record<string, unknown> =>
          window !== null && typeof window === "object" && !Array.isArray(window),
        )
        .map((window) => ({
          source: window,
          timestamp: timestampMs(stringField(window.fundingSettledAt)),
          medianNetCarryBps: numericField(window.medianNetCarryBps),
        }))
        .filter((window) => window.timestamp !== null && window.medianNetCarryBps !== null)
        .sort((left, right) => (right.timestamp as number) - (left.timestamp as number))
    : [];
  const latest = windows[0]?.source;
  if (!latest) return null;

  return {
    fundingSettledAt: latest.fundingSettledAt ?? null,
    sampleCount: latest.sampleCount ?? null,
    medianNetCarryBps: latest.medianNetCarryBps ?? null,
    medianEstimatedNetPnlKrw: latest.medianEstimatedNetPnlKrw ?? null,
  };
}

function latestSpreadControlFundingWindow(spreadControl: Record<string, unknown>): Record<string, unknown> | null {
  const windows = Array.isArray(spreadControl.fundingWindows)
    ? spreadControl.fundingWindows
        .filter((window): window is Record<string, unknown> =>
          window !== null && typeof window === "object" && !Array.isArray(window),
        )
        .map((window) => ({
          source: window,
          timestamp: timestampMs(stringField(window.fundingSettledAt)),
        }))
        .filter((window) => window.timestamp !== null)
        .sort((left, right) => (right.timestamp as number) - (left.timestamp as number))
    : [];
  return windows[0]?.source ?? null;
}

function firstArrayRecord(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  const first = value.find(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item),
  );
  return first ?? {};
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function feeStressSpreadControlFromReadiness(readinessReport: unknown): Record<string, unknown> {
  const evidence = recordField(recordField(readinessReport).evidence);
  const firstFeeStressReport = firstArrayRecord(evidence.feeStressReports);
  return recordField(recordField(firstFeeStressReport.summary).spreadControl);
}

function feeStressSpreadSensitivityFromReadiness(
  readinessReport: unknown,
): Array<Record<string, unknown>> {
  const evidence = recordField(recordField(readinessReport).evidence);
  const firstFeeStressReport = firstArrayRecord(evidence.feeStressReports);
  return arrayRecords(recordField(firstFeeStressReport.summary).spreadSensitivity);
}

function largestReason(reasons: Record<string, unknown>): string | null {
  let largest: { reason: string; count: number } | null = null;
  for (const [reason, value] of Object.entries(reasons)) {
    const count = numericField(value);
    if (count === null) continue;
    if (largest === null || count > largest.count) largest = { reason, count };
  }
  return largest?.reason ?? null;
}

function spreadFailureTriage(spreadControl: Record<string, unknown>): Record<string, unknown> | null {
  if (Object.keys(spreadControl).length === 0) return null;

  const latestWindow = latestSpreadControlFundingWindow(spreadControl);
  const maxSpreadRejectionRate = numericField(spreadControl.maxSpreadRejectionRate);
  const spreadRejectedRate = numericField(spreadControl.spreadRejectedRate);
  const latestSpreadRejectedRate = numericField(latestWindow?.spreadRejectedRate);
  const fundingWindows = Array.isArray(spreadControl.fundingWindows)
    ? spreadControl.fundingWindows.filter(
        (window): window is Record<string, unknown> =>
          window !== null && typeof window === "object" && !Array.isArray(window),
      )
    : [];
  const failedWindowCount =
    maxSpreadRejectionRate === null
      ? null
      : fundingWindows.filter((window) => {
          const rate = numericField(window.spreadRejectedRate);
          return rate !== null && rate > maxSpreadRejectionRate;
        }).length;
  const passWindowCount =
    maxSpreadRejectionRate === null || failedWindowCount === null
      ? null
      : fundingWindows.length - failedWindowCount;
  const latestFailureMultiple =
    latestSpreadRejectedRate !== null && maxSpreadRejectionRate !== null && maxSpreadRejectionRate > 0
      ? Number((latestSpreadRejectedRate / maxSpreadRejectionRate).toFixed(6))
      : null;
  const overallFailureMultiple =
    spreadRejectedRate !== null && maxSpreadRejectionRate !== null && maxSpreadRejectionRate > 0
      ? Number((spreadRejectedRate / maxSpreadRejectionRate).toFixed(6))
      : null;
  const severeLatestSpreadFailure = latestFailureMultiple !== null && latestFailureMultiple >= 3;
  const persistentSpreadFailure =
    failedWindowCount !== null &&
    fundingWindows.length > 0 &&
    failedWindowCount >= Math.ceil(fundingWindows.length / 2);
  const overallSpreadFailure = overallFailureMultiple !== null && overallFailureMultiple > 1;
  const spreadFailureSeverity =
    severeLatestSpreadFailure
      ? "severe_latest_window"
      : persistentSpreadFailure
        ? "persistent_across_windows"
        : overallSpreadFailure
          ? "overall_gate_failed"
          : spreadControl.passed === true
            ? "none"
            : "incomplete_or_unclassified";

  return {
    passed: spreadControl.passed === true,
    required: spreadControl.required === true,
    spreadFailureSeverity,
    primaryOverallReason: largestReason(recordField(spreadControl.rejectionReasons)),
    primaryLatestReason:
      latestWindow === null ? null : largestReason(recordField(latestWindow.rejectionReasons)),
    spreadRejectedRate,
    maxSpreadRejectionRate,
    latestSpreadRejectedRate,
    latestFailureMultiple,
    overallFailureMultiple,
    fundingWindowCount: fundingWindows.length,
    failedWindowCount,
    passWindowCount,
    latestWindow:
      latestWindow === null
        ? null
        : {
            fundingSettledAt: latestWindow.fundingSettledAt ?? null,
            sampleCount: latestWindow.sampleCount ?? null,
            spreadRejectedRate: latestWindow.spreadRejectedRate ?? null,
            rejectionReasons: latestWindow.rejectionReasons ?? null,
            spreadStats: latestWindow.spreadStats ?? null,
          },
    action:
      spreadControl.passed === true
        ? "spread_control_clear"
        : severeLatestSpreadFailure || persistentSpreadFailure
          ? "do_not_switch_until_spread_rejection_recovers_below_gate"
          : "collect_more_spread_quality_samples_before_switch_review",
    interpretation:
      "Classifies whether the challenger spread gap is a temporary sample issue or an execution-quality reason to avoid switching despite higher carry.",
  };
}

function spreadThresholdBreaches(
  spreadControl: Record<string, unknown>,
  source: string,
): Array<Record<string, unknown>> {
  const thresholds = recordField(spreadControl.thresholds);
  const maxSpreadRejectionRate = numericField(spreadControl.maxSpreadRejectionRate);
  const minExecutionEligibleRate = numericField(spreadControl.minExecutionEligibleRate);
  const spreadRejectedRate = numericField(spreadControl.spreadRejectedRate);
  const executionEligibleRate = numericField(spreadControl.executionEligibleRate);
  const breaches: Array<Record<string, unknown>> = [];

  if (
    spreadRejectedRate !== null &&
    maxSpreadRejectionRate !== null &&
    spreadRejectedRate > maxSpreadRejectionRate
  ) {
    breaches.push({
      source,
      metric: "spreadRejectedRate",
      observed: spreadRejectedRate,
      threshold: maxSpreadRejectionRate,
      direction: "above_max",
    });
  }
  if (
    executionEligibleRate !== null &&
    minExecutionEligibleRate !== null &&
    executionEligibleRate < minExecutionEligibleRate
  ) {
    breaches.push({
      source,
      metric: "executionEligibleRate",
      observed: executionEligibleRate,
      threshold: minExecutionEligibleRate,
      direction: "below_min",
    });
  }

  const spreadStats = recordField(spreadControl.spreadStats);
  for (const [venue, thresholdKey] of [
    ["spot", "maxSpotSpreadBps"],
    ["perp", "maxPerpSpreadBps"],
    ["usdtKrw", "maxUsdtKrwSpreadBps"],
  ] as const) {
    const observed = numericField(recordField(spreadStats[venue]).maxBps);
    const threshold = numericField(thresholds[thresholdKey]);
    if (observed !== null && threshold !== null && observed > threshold) {
      breaches.push({
        source,
        metric: `${venue}MaxSpreadBps`,
        observed,
        threshold,
        direction: "above_max",
      });
    }
  }

  const latestWindow = latestSpreadControlFundingWindow(spreadControl);
  if (latestWindow !== null) {
    const latestSpreadRejectedRate = numericField(latestWindow.spreadRejectedRate);
    if (
      latestSpreadRejectedRate !== null &&
      maxSpreadRejectionRate !== null &&
      latestSpreadRejectedRate > maxSpreadRejectionRate
    ) {
      breaches.push({
        source: `${source}.latestWindow`,
        metric: "spreadRejectedRate",
        observed: latestSpreadRejectedRate,
        threshold: maxSpreadRejectionRate,
        direction: "above_max",
      });
    }
    const latestSpreadStats = recordField(latestWindow.spreadStats);
    for (const [venue, thresholdKey] of [
      ["spot", "maxSpotSpreadBps"],
      ["perp", "maxPerpSpreadBps"],
      ["usdtKrw", "maxUsdtKrwSpreadBps"],
    ] as const) {
      const observed = numericField(recordField(latestSpreadStats[venue]).maxBps);
      const threshold = numericField(thresholds[thresholdKey]);
      if (observed !== null && threshold !== null && observed > threshold) {
        breaches.push({
          source: `${source}.latestWindow`,
          metric: `${venue}MaxSpreadBps`,
          observed,
          threshold,
          direction: "above_max",
        });
      }
    }
  }

  return breaches;
}

function maxSpreadBpsExcess(spreadControl: Record<string, unknown>): number | null {
  const thresholds = recordField(spreadControl.thresholds);
  const spreadStats = recordField(spreadControl.spreadStats);
  const excesses = ([
    ["spot", "maxSpotSpreadBps"],
    ["perp", "maxPerpSpreadBps"],
    ["usdtKrw", "maxUsdtKrwSpreadBps"],
  ] as const)
    .map(([venue, thresholdKey]) => {
      const observed = numericField(recordField(spreadStats[venue]).maxBps);
      const threshold = numericField(thresholds[thresholdKey]);
      return observed !== null && threshold !== null ? observed - threshold : null;
    })
    .filter((value): value is number => value !== null);
  if (excesses.length === 0) return null;
  return Number(Math.max(...excesses).toFixed(6));
}

function latestWindowSpreadPassed(spreadControl: Record<string, unknown>): boolean | null {
  const latestWindow = latestSpreadControlFundingWindow(spreadControl);
  if (latestWindow === null) return null;
  const maxSpreadRejectionRate = numericField(spreadControl.maxSpreadRejectionRate);
  const latestSpreadRejectedRate = numericField(latestWindow.spreadRejectedRate);
  if (
    latestSpreadRejectedRate !== null &&
    maxSpreadRejectionRate !== null &&
    latestSpreadRejectedRate > maxSpreadRejectionRate
  ) {
    return false;
  }
  const thresholds = recordField(spreadControl.thresholds);
  const latestSpreadStats = recordField(latestWindow.spreadStats);
  for (const [venue, thresholdKey] of [
    ["spot", "maxSpotSpreadBps"],
    ["perp", "maxPerpSpreadBps"],
    ["usdtKrw", "maxUsdtKrwSpreadBps"],
  ] as const) {
    const observed = numericField(recordField(latestSpreadStats[venue]).maxBps);
    const threshold = numericField(thresholds[thresholdKey]);
    if (observed !== null && threshold !== null && observed > threshold) return false;
  }
  return true;
}

function spreadClearanceProgress(
  spreadControl: Record<string, unknown>,
  source: string,
): Record<string, unknown> | null {
  if (Object.keys(spreadControl).length === 0) return null;
  const spreadRejectedRate = numericField(spreadControl.spreadRejectedRate);
  const maxSpreadRejectionRate = numericField(spreadControl.maxSpreadRejectionRate);
  const executionEligibleRate = numericField(spreadControl.executionEligibleRate);
  const minExecutionEligibleRate = numericField(spreadControl.minExecutionEligibleRate);
  const latestWindow = latestSpreadControlFundingWindow(spreadControl);
  const spreadRejectedRateExcess =
    spreadRejectedRate !== null && maxSpreadRejectionRate !== null
      ? Number((spreadRejectedRate - maxSpreadRejectionRate).toFixed(6))
      : null;
  const executionEligibleRateShortfall =
    executionEligibleRate !== null && minExecutionEligibleRate !== null
      ? Number((minExecutionEligibleRate - executionEligibleRate).toFixed(6))
      : null;
  return {
    source,
    aggregatePassed: spreadControl.passed === true,
    latestWindowPassed: latestWindowSpreadPassed(spreadControl),
    spreadRejectedRate,
    maxSpreadRejectionRate,
    spreadRejectedRateExcess,
    executionEligibleRate,
    minExecutionEligibleRate,
    executionEligibleRateShortfall,
    maxSpreadBpsExcess: maxSpreadBpsExcess(spreadControl),
    latestWindow:
      latestWindow === null
        ? null
        : {
            fundingSettledAt: latestWindow.fundingSettledAt ?? null,
            sampleCount: latestWindow.sampleCount ?? null,
            spreadRejectedRate: latestWindow.spreadRejectedRate ?? null,
            spreadStats: latestWindow.spreadStats ?? null,
          },
  };
}

function buildSpreadBlockerEvidence(
  spreadControl: Record<string, unknown>,
  liveReadinessSpreadControl: Record<string, unknown>,
  blockerActive: boolean,
): Record<string, unknown> | null {
  if (!blockerActive) return null;
  const breaches = [
    ...spreadThresholdBreaches(spreadControl, "selectedMarketCurrentEntrySpreadControl"),
    ...spreadThresholdBreaches(liveReadinessSpreadControl, "liveReadinessSpreadControl"),
  ];
  const clearanceProgress = [
    spreadClearanceProgress(spreadControl, "selectedMarketCurrentEntrySpreadControl"),
    spreadClearanceProgress(liveReadinessSpreadControl, "liveReadinessSpreadControl"),
  ].filter((item): item is Record<string, unknown> => item !== null);
  return {
    blockerActive,
    breachCount: breaches.length,
    breaches,
    clearanceProgress,
    interpretation:
      "wideDisplayedSpread remains only when current spread evidence records concrete threshold breaches; clearance progress is diagnostic and cannot relax live gates.",
  };
}

function spreadControlHandoffView(
  spreadControl: Record<string, unknown>,
  blockerActive: boolean,
  scope: string,
): Record<string, unknown> | null {
  if (Object.keys(spreadControl).length === 0) return null;
  const rawPassed = spreadControl.passed === true;
  return {
    scope,
    passed: rawPassed && !blockerActive,
    rawPassed,
    blockerActive,
    required: spreadControl.required === true,
    spreadRejectedRate: spreadControl.spreadRejectedRate ?? null,
    executionEligibleRate: spreadControl.executionEligibleRate ?? null,
    minExecutionEligibleRate: spreadControl.minExecutionEligibleRate ?? null,
    maxSpreadRejectionRate: spreadControl.maxSpreadRejectionRate ?? null,
    thresholds: spreadControl.thresholds ?? null,
    rejectionReasons: spreadControl.rejectionReasons ?? null,
    spreadStats: spreadControl.spreadStats ?? null,
    latestWindow: latestSpreadControlFundingWindow(spreadControl),
  };
}

function scenarioView(scenario: Record<string, unknown> | null): Record<string, unknown> | null {
  if (scenario === null) return null;
  return {
    maxSpotSpreadBps: scenario.maxSpotSpreadBps ?? null,
    maxPerpSpreadBps: scenario.maxPerpSpreadBps ?? null,
    maxUsdtKrwSpreadBps: scenario.maxUsdtKrwSpreadBps ?? null,
    executionEligibleRate: scenario.executionEligibleRate ?? null,
    spreadRejectedRate: scenario.spreadRejectedRate ?? null,
    completedFundingWindowCount: scenario.completedFundingWindowCount ?? null,
    positiveWindowRate: scenario.positiveWindowRate ?? null,
    medianWindowNetCarryBps: scenario.medianWindowNetCarryBps ?? null,
    estimatedNetPnlKrwAcrossFundingWindows:
      scenario.estimatedNetPnlKrwAcrossFundingWindows ?? null,
  };
}

function spreadSensitivityTriage(
  spreadControl: Record<string, unknown>,
  spreadSensitivity: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  if (spreadSensitivity.length === 0) return null;

  const thresholds = recordField(spreadControl.thresholds);
  const baselineMaxSpotSpreadBps = numericField(thresholds.maxSpotSpreadBps);
  const minExecutionEligibleRate = numericField(spreadControl.minExecutionEligibleRate);
  const maxSpreadRejectionRate = numericField(spreadControl.maxSpreadRejectionRate);
  const scenarios = [...spreadSensitivity].sort(
    (left, right) =>
      (numericField(left.maxSpotSpreadBps) ?? Number.POSITIVE_INFINITY) -
      (numericField(right.maxSpotSpreadBps) ?? Number.POSITIVE_INFINITY),
  );
  const baselineScenario =
    baselineMaxSpotSpreadBps === null
      ? null
      : scenarios.find(
          (scenario) => numericField(scenario.maxSpotSpreadBps) === baselineMaxSpotSpreadBps,
        ) ?? null;
  const passingScenarios =
    minExecutionEligibleRate === null || maxSpreadRejectionRate === null
      ? []
      : scenarios.filter((scenario) => {
          const executionEligibleRate = numericField(scenario.executionEligibleRate);
          const spreadRejectedRate = numericField(scenario.spreadRejectedRate);
          return (
            executionEligibleRate !== null &&
            spreadRejectedRate !== null &&
            executionEligibleRate >= minExecutionEligibleRate &&
            spreadRejectedRate <= maxSpreadRejectionRate
          );
        });
  const nearestPassingScenario =
    baselineMaxSpotSpreadBps === null
      ? passingScenarios[0] ?? null
      : (passingScenarios.find(
          (scenario) =>
            (numericField(scenario.maxSpotSpreadBps) ?? Number.NEGATIVE_INFINITY) >=
            baselineMaxSpotSpreadBps,
        ) ??
        passingScenarios[0] ??
        null);

  return {
    baselineMaxSpotSpreadBps,
    minExecutionEligibleRate,
    maxSpreadRejectionRate,
    baselineScenario: scenarioView(baselineScenario),
    nearestPassingScenario: scenarioView(nearestPassingScenario),
    passingScenarioCount: passingScenarios.length,
    action:
      nearestPassingScenario === null
        ? "keep_default_spread_gate_and_collect_more_quality_evidence"
        : "run_explicit_spread_threshold_experiment_before_any_policy_change",
    caveat:
      "Spread sensitivity is diagnostic only; it does not relax live gates or prove profitability because wider displayed spreads may hide adverse fill quality.",
  };
}

function spreadThresholdScenario(
  scenarios: Array<Record<string, unknown>>,
  maxSpotSpreadBps: number | null,
): Record<string, unknown> | null {
  if (maxSpotSpreadBps === null) return null;
  const scenario =
    scenarios.find((row) => numericField(row.maxSpotSpreadBps) === maxSpotSpreadBps) ?? null;
  return scenarioView(scenario);
}

function numericDelta(left: unknown, right: unknown): number | null {
  const leftValue = numericField(left);
  const rightValue = numericField(right);
  if (leftValue === null || rightValue === null) return null;
  return Number((leftValue - rightValue).toFixed(6));
}

function spreadThresholdExperimentViews(
  experiments: Array<{ sourcePath: string; report: SpotPerpCarryReport }>,
): Array<Record<string, unknown>> {
  return experiments.map(({ sourcePath, report }) => {
    const assumptions = recordField(report.assumptions);
    const marketAssumptions = arrayRecords(assumptions.markets);
    const firstMarket = recordField(marketAssumptions[0]);
    const summary = recordField(report.summary);
    const spreadSensitivity = arrayRecords(summary.spreadSensitivity);
    const baselineMaxSpotSpreadBps = 30;
    const candidateMaxSpotSpreadBps =
      numericField(assumptions.maxSpotSpreadBps) ??
      numericField(recordField(recordField(summary.spreadControl).thresholds).maxSpotSpreadBps);
    const baselineScenario = spreadThresholdScenario(
      spreadSensitivity,
      baselineMaxSpotSpreadBps,
    );
    const candidateScenario = spreadThresholdScenario(
      spreadSensitivity,
      candidateMaxSpotSpreadBps,
    );
    const medianWindowNetCarryDeltaBps =
      candidateScenario === null || baselineScenario === null
        ? null
        : numericDelta(
            candidateScenario.medianWindowNetCarryBps,
            baselineScenario.medianWindowNetCarryBps,
          );
    const estimatedNetPnlDeltaKrw =
      candidateScenario === null || baselineScenario === null
        ? null
        : numericDelta(
            candidateScenario.estimatedNetPnlKrwAcrossFundingWindows,
            baselineScenario.estimatedNetPnlKrwAcrossFundingWindows,
          );
    const expectancyImproved =
      (medianWindowNetCarryDeltaBps ?? Number.NEGATIVE_INFINITY) > 0 &&
      (estimatedNetPnlDeltaKrw ?? Number.NEGATIVE_INFINITY) > 0;
    return {
      sourcePath,
      generatedAt: report.generatedAt ?? null,
      market: firstMarket.market ?? null,
      symbol: firstMarket.symbol ?? null,
      status: report.status ?? null,
      promotionEligible: report.promotionEligible === true,
      blockers: recordField(report).blockers ?? [],
      observationCount: report.observationCount ?? null,
      observationSpanMinutes: report.observationSpanMinutes ?? null,
      baselineMaxSpotSpreadBps,
      candidateMaxSpotSpreadBps,
      baselineScenario,
      candidateScenario,
      deltaCandidateMinusBaseline: {
        executionEligibleRate:
          candidateScenario === null || baselineScenario === null
            ? null
            : numericDelta(
                candidateScenario.executionEligibleRate,
                baselineScenario.executionEligibleRate,
              ),
        spreadRejectedRate:
          candidateScenario === null || baselineScenario === null
            ? null
            : numericDelta(
                candidateScenario.spreadRejectedRate,
                baselineScenario.spreadRejectedRate,
              ),
        medianWindowNetCarryBps: medianWindowNetCarryDeltaBps,
        estimatedNetPnlKrwAcrossFundingWindows: estimatedNetPnlDeltaKrw,
      },
      expectancyImproved,
      policyDecision: expectancyImproved
        ? "do_not_relax_live_gate_without_fill_quality_validation"
        : "do_not_relax_spread_gate_no_expectancy_improvement",
      liveGateImpact: "none_diagnostic_only",
      caveat:
        "Explicit spread-threshold experiments are diagnostic only; they do not relax live gates or prove profitability without fill-quality validation and all readiness gates.",
    };
  });
}

function comparisonCarryBps(
  metrics: Record<string, unknown>,
  feeStressEvidence: Record<string, unknown>,
): number | null {
  return (
    fundingWindowMedianCarryBpsFromSummary(recordField(feeStressEvidence.fundingWindowSummary)) ??
    fundingWindowMedianCarryBpsFromMetrics(metrics) ??
    numericField(metrics.executionEligibleMedianNetCarryBps)
  );
}

function comparisonCarrySource(
  metrics: Record<string, unknown>,
  feeStressEvidence: Record<string, unknown>,
): string | null {
  if (fundingWindowMedianCarryBpsFromSummary(recordField(feeStressEvidence.fundingWindowSummary)) !== null) {
    return "fee_stress_funding_window_median";
  }
  if (fundingWindowMedianCarryBpsFromMetrics(metrics) !== null) return "funding_window_median";
  if (numericField(metrics.executionEligibleMedianNetCarryBps) !== null) {
    return "execution_eligible_sample_median";
  }
  return null;
}

function executionEligibleRateFromMetrics(metrics: Record<string, unknown>): number | null {
  const explicitRate = numericField(metrics.executionEligibleRate);
  if (explicitRate !== null) return explicitRate;

  const count = numericField(metrics.count);
  const executionEligibleCount = numericField(metrics.executionEligibleCount);
  return count !== null && count > 0 && executionEligibleCount !== null ? executionEligibleCount / count : null;
}

function challengerQualitySummary(
  metrics: Record<string, unknown>,
  feeStressEvidence: Record<string, unknown>,
): Record<string, unknown> {
  const executionEligibleRate = executionEligibleRateFromMetrics(metrics);
  const positiveRate = numericField(metrics.executionEligiblePositiveRate);
  const depthCoverageRate = numericField(metrics.depthCoverageRate);
  const feeStressFailed = feeStressEvidence.failed === true;
  const knownQualityFailureReasons = [
    positiveRate !== null && positiveRate < 0.67 ? "positiveRateBelowSwitchThreshold" : null,
    executionEligibleRate !== null && executionEligibleRate < 0.5
      ? "executionEligibleRateBelowSwitchThreshold"
      : null,
    depthCoverageRate !== null && depthCoverageRate < 0.95 ? "depthCoverageBelowSwitchThreshold" : null,
    feeStressFailed ? "feeStressFailed" : null,
  ].filter((reason): reason is string => reason !== null);

  const hasCompleteQualityInputs =
    positiveRate !== null && executionEligibleRate !== null && depthCoverageRate !== null;
  const qualityPasses =
    hasCompleteQualityInputs &&
    positiveRate >= 0.67 &&
    executionEligibleRate >= 0.5 &&
    depthCoverageRate >= 0.95 &&
    !feeStressFailed;

  return {
    executionEligibleRate,
    qualityPasses,
    knownQualityFailureReasons,
    qualityStatus: qualityPasses
      ? "quality_cleared"
      : knownQualityFailureReasons.length > 0
        ? "quality_blocked"
        : "quality_incomplete",
  };
}

function marketFromRecord(value: Record<string, unknown> | null | undefined): string | null {
  return stringField(value?.market);
}

function buildFundingWindowCarryView(
  researchSource: SpotPerpCarryReport | null,
  researchSourcePath: string | null,
): Record<string, unknown> | null {
  if (researchSource?.fundingWindowSummary === undefined) return null;
  return {
    sourcePath: researchSourcePath,
    ...researchSource.fundingWindowSummary,
  };
}

function buildFeeStressFundingWindowCarryView(
  liveReadiness: SpotPerpLiveReadiness | null,
  liveReadinessPath: string | null,
): Record<string, unknown> | null {
  const feeStressReports = liveReadiness?.evidence?.feeStressReports ?? [];
  const report = feeStressReports.find((item) => item.fundingWindowSummary !== null && item.fundingWindowSummary !== undefined);
  if (report?.fundingWindowSummary === null || report?.fundingWindowSummary === undefined) return null;
  return {
    sourcePath: liveReadinessPath,
    generatedAt: report.generatedAt ?? null,
    summary: report.summary ?? null,
    ...report.fundingWindowSummary,
  };
}

function buildFundingWindowTrendView(
  fundingWindowCarryView: Record<string, unknown> | null,
  minLivePromotionMedianNetCarryBps = LIVE_PROMOTION_MIN_NET_CARRY_BPS,
): Record<string, unknown> | null {
  const windows = Array.isArray(fundingWindowCarryView?.windows)
    ? fundingWindowCarryView.windows
        .filter((window): window is Record<string, unknown> =>
          window !== null && typeof window === "object" && !Array.isArray(window),
        )
        .map((window) => ({
          source: window,
          timestamp: timestampMs(stringField(window.fundingSettledAt)),
          medianNetCarryBps: numericField(window.medianNetCarryBps),
        }))
        .filter((window): window is {
          source: Record<string, unknown>;
          timestamp: number;
          medianNetCarryBps: number;
        } => window.timestamp !== null && window.medianNetCarryBps !== null)
        .sort((left, right) => left.timestamp - right.timestamp)
    : [];
  if (windows.length === 0) return null;

  const latest = windows[windows.length - 1];
  const previous = windows.length > 1 ? windows[windows.length - 2] : null;
  const overallMedianNetCarryBps = numericField(fundingWindowCarryView?.medianWindowNetCarryBps);
  const latestVsPreviousMedianNetCarryBps =
    previous === null ? null : latest.medianNetCarryBps - previous.medianNetCarryBps;
  const latestVsOverallMedianNetCarryBps =
    overallMedianNetCarryBps === null ? null : latest.medianNetCarryBps - overallMedianNetCarryBps;
  const latestWindowMeetsLivePromotionCarryThreshold =
    latest.medianNetCarryBps >= minLivePromotionMedianNetCarryBps;
  const latestWindowDeteriorating =
    latestVsPreviousMedianNetCarryBps !== null &&
    latestVsPreviousMedianNetCarryBps < 0 &&
    (latestVsOverallMedianNetCarryBps ?? 0) < 0;
  let consecutiveDeterioratingWindowCount = 0;
  for (let index = windows.length - 1; index > 0; index -= 1) {
    const current = windows[index] as { medianNetCarryBps: number };
    const prior = windows[index - 1] as { medianNetCarryBps: number };
    if (current.medianNetCarryBps >= prior.medianNetCarryBps) break;
    consecutiveDeterioratingWindowCount += 1;
  }
  const latestVsPeakMedianNetCarryBps =
    latest.medianNetCarryBps - Math.max(...windows.map((window) => window.medianNetCarryBps));
  const latestWindowLowCarry = latest.medianNetCarryBps < minLivePromotionMedianNetCarryBps;
  const degradationSeverity =
    latestWindowLowCarry
      ? "below_live_promotion_threshold"
      : consecutiveDeterioratingWindowCount >= 2
        ? "multi_window_degradation"
        : latestWindowDeteriorating
          ? "single_window_degradation"
          : "none";
  const fundingWindowIntervalMs = medianNumber(
    windows
      .slice(1)
      .map((window, index) => window.timestamp - (windows[index] as { timestamp: number }).timestamp)
      .filter((interval) => interval > 0),
  );
  const estimatedNextFundingSettledAt =
    fundingWindowIntervalMs === null
      ? null
      : new Date(latest.timestamp + fundingWindowIntervalMs).toISOString();
  const demotionGate = {
    reviewTrigger: "next_completed_fee_stressed_funding_window",
    latestFundingSettledAt: latest.source.fundingSettledAt ?? null,
    estimatedNextFundingSettledAt,
    currentLatestMedianNetCarryBps: latest.medianNetCarryBps,
    previousMedianNetCarryBps: previous?.medianNetCarryBps ?? null,
    mustExceedLatestMedianNetCarryBpsToRecover: latest.medianNetCarryBps,
    lowCarryDemotionThresholdBps: minLivePromotionMedianNetCarryBps,
    demotionCondition:
      "prepare demotion if the next completed fee-stressed funding window does not exceed the current latest median carry, or if it falls below the live-promotion carry threshold",
    recoveryCondition:
      "clear the demotion preparation only if the next completed fee-stressed funding window exceeds the current latest median carry and stays above the live-promotion carry threshold",
  };

  return {
    sourcePath: fundingWindowCarryView?.sourcePath ?? null,
    source: fundingWindowCarryView?.source ?? null,
    windowCount: windows.length,
    minLivePromotionMedianNetCarryBps,
    latestWindow: {
      fundingSettledAt: latest.source.fundingSettledAt ?? null,
      sampleCount: latest.source.sampleCount ?? null,
      medianNetCarryBps: latest.medianNetCarryBps,
      medianEstimatedNetPnlKrw: latest.source.medianEstimatedNetPnlKrw ?? null,
    },
    previousWindow: previous === null
      ? null
      : {
          fundingSettledAt: previous.source.fundingSettledAt ?? null,
          sampleCount: previous.source.sampleCount ?? null,
          medianNetCarryBps: previous.medianNetCarryBps,
          medianEstimatedNetPnlKrw: previous.source.medianEstimatedNetPnlKrw ?? null,
        },
    overallMedianNetCarryBps,
    latestVsPreviousMedianNetCarryBps,
    latestVsOverallMedianNetCarryBps,
    latestWindowMeetsLivePromotionCarryThreshold,
    latestWindowDeteriorating,
    consecutiveDeterioratingWindowCount,
    latestVsPeakMedianNetCarryBps,
    degradationSeverity,
    demotionGate,
    action:
      latestWindowLowCarry
        ? "watch_for_switch_or_demote_on_next_completed_window"
        : consecutiveDeterioratingWindowCount >= 2
          ? "prepare_focus_demotion_if_next_window_does_not_recover"
        : latestWindowDeteriorating
          ? "continue_observation_but_monitor_degradation"
          : "continue_observation",
    interpretation:
      "Latest completed fee-stressed funding window trend; use it to detect deterioration, not to authorize live trading by itself.",
  };
}

function buildCheckpointPlan(
  liveReady: boolean,
  liveStartupAllowed: boolean,
  processAlignment: ProcessAlignment | null,
  feeStressFundingWindowTrendView: Record<string, unknown> | null,
  priorityAction: NextAction | null,
  nextAutonomousWork: string[],
  nextOperatorWork: string[],
  nextMarketConditionWork: string[],
  selectedMarket: string | null,
  generatedAtMs: number,
): Record<string, unknown> {
  const targetedMarketConditionMonitoring = buildTargetedMarketConditionMonitoring(
    nextMarketConditionWork,
    selectedMarket,
  );
  const demotionGate = recordField(feeStressFundingWindowTrendView?.demotionGate);
  const nextCompletedFundingWindowAt = stringField(demotionGate.estimatedNextFundingSettledAt);
  const nextCompletedFundingWindowAtMs = timestampMs(nextCompletedFundingWindowAt);
  const recompareSampleBufferRequired =
    nextAutonomousWork.includes("latestWindowFundingAlignment") ||
    nextAutonomousWork.includes("latestWindowSampleQuality");
  const bufferedNextReviewAtMs =
    nextCompletedFundingWindowAtMs === null
      ? null
      : nextCompletedFundingWindowAtMs +
        (recompareSampleBufferRequired ? RECOMPARE_LATEST_WINDOW_SAMPLE_BUFFER_MINUTES * 60_000 : 0);
  const bufferedNextReviewAt =
    bufferedNextReviewAtMs === null ? null : new Date(bufferedNextReviewAtMs).toISOString();
  const nextReviewDelayMinutes =
    bufferedNextReviewAtMs === null
      ? null
      : Number(((bufferedNextReviewAtMs - generatedAtMs) / 60000).toFixed(3));
  const nextReviewOverdue =
    nextReviewDelayMinutes === null ? null : nextReviewDelayMinutes <= 0;
  const readinessTimeline = recordField(priorityAction?.currentEvidence?.readinessTimeline);
  const autonomousEvidenceSufficiencyReviewAt = nextAutonomousWork.includes("insufficientObservationSpan")
    ? stringField(readinessTimeline.estimatedEarliestReviewAt)
    : null;
  const autonomousEvidenceSufficiencyReviewAtMs = timestampMs(autonomousEvidenceSufficiencyReviewAt);
  const autonomousEvidenceSufficiencyDelayMinutes =
    autonomousEvidenceSufficiencyReviewAtMs === null
      ? null
      : Number(((autonomousEvidenceSufficiencyReviewAtMs - generatedAtMs) / 60000).toFixed(3));
  const nextReviewCanCompleteAutonomousEvidence =
    autonomousEvidenceSufficiencyReviewAtMs === null || bufferedNextReviewAtMs === null
      ? null
      : bufferedNextReviewAtMs >= autonomousEvidenceSufficiencyReviewAtMs;
  const autonomousEvidenceSufficiency =
    autonomousEvidenceSufficiencyReviewAt === null
      ? null
      : {
          blocker: "insufficientObservationSpan",
          bottleneck: readinessTimeline.bottleneck ?? null,
          earliestReviewAt: autonomousEvidenceSufficiencyReviewAt,
          earliestReviewAtKst: kstTimestamp(autonomousEvidenceSufficiencyReviewAt),
          delayMinutes: autonomousEvidenceSufficiencyDelayMinutes,
          nextReviewCanCompleteAutonomousEvidence,
          interpretation:
            nextReviewCanCompleteAutonomousEvidence === false
              ? "The next completed funding-window refresh can update latest-window evidence, but the observation-span gate is not expected to be complete yet."
              : "The next completed funding-window refresh is at or after the estimated autonomous evidence sufficiency time.",
        };
  const waitingForFundingEvidence =
    nextAutonomousWork.includes("insufficientObservationSpan") ||
    nextAutonomousWork.includes("collectChallengerFundingEvidence");
  const waitingEvidenceLabels = [
    nextAutonomousWork.includes("insufficientObservationSpan")
      ? "insufficient observation span"
      : null,
    nextAutonomousWork.includes("collectChallengerFundingEvidence")
      ? "challenger funding evidence coverage"
      : null,
  ].filter((label): label is string => label !== null);
  const waitingEvidenceReason =
    waitingEvidenceLabels.length === 1
      ? `Current autonomous blocker is ${waitingEvidenceLabels[0]}; repeated heavy refreshes before the next completed funding window do not add a decision-quality sample.`
      : `Current autonomous blockers are ${waitingEvidenceLabels.join(
          " and ",
        )}; repeated heavy refreshes before the next completed funding window do not add a decision-quality sample.`;
  const sufficiencyCaveat =
    autonomousEvidenceSufficiencyReviewAt !== null &&
    nextReviewCanCompleteAutonomousEvidence === false
      ? ` The observation-span gate is not expected to be complete until ${autonomousEvidenceSufficiencyReviewAt}.`
      : "";
  const recompareSampleBufferCaveat =
    recompareSampleBufferRequired
      ? ` The next review is delayed ${RECOMPARE_LATEST_WINDOW_SAMPLE_BUFFER_MINUTES} minutes after the funding settlement so latest-window recompare samples can accumulate.`
      : "";
  const processAligned = processAlignment?.aligned !== false;

  if (liveReady && liveStartupAllowed && processAligned) {
    return {
      status: "live_review_allowed",
      shouldStartLive: false,
      shouldRunHeavyRefreshNow: false,
      nextReviewAt: null,
      nextReviewTrigger: "manual_live_review_gate",
      recommendedAutonomousAction: "run_review_command_before_any_live_pm2_start",
      reviewCommand: "npm run dry-run:gate-live-goal-ready",
      reason: "Live gates report ready, but startup still requires an explicit final review command.",
    };
  }

  if (!processAligned) {
    return {
      status: "fix_process_alignment_before_waiting",
      shouldStartLive: false,
      shouldRunHeavyRefreshNow: false,
      nextReviewAt: null,
      nextReviewTrigger: "process_alignment_repaired",
      recommendedAutonomousAction: "repair_or_stop_unaligned_processes_before_strategy_review",
      reviewCommand: "npm run dry-run:audit-live-goal-process-alignment",
      reason: "Process alignment is blocking reliable strategy evidence, so waiting for more data is not sufficient.",
    };
  }

  if (waitingForFundingEvidence && nextCompletedFundingWindowAt !== null) {
    return {
      status:
        nextReviewOverdue === true
          ? "run_full_live_goal_refresh_for_completed_funding_window"
          : "pause_heavy_refresh_until_next_completed_funding_window",
      shouldStartLive: false,
      shouldRunHeavyRefreshNow: nextReviewOverdue === true,
      nextReviewAt: bufferedNextReviewAt,
      nextReviewAtKst: kstTimestamp(bufferedNextReviewAt),
      nextReviewDelayMinutes,
      nextReviewOverdue,
      nextReviewTrigger: "next_completed_fee_stressed_funding_window",
      nextCompletedFundingWindowAt,
      recompareSampleBufferRequired,
      recompareSampleBufferMinutes: recompareSampleBufferRequired
        ? RECOMPARE_LATEST_WINDOW_SAMPLE_BUFFER_MINUTES
        : 0,
      recommendedAutonomousAction:
        nextReviewOverdue === true
          ? "run_full_live_goal_refresh_now"
          : "wait_then_run_full_live_goal_refresh",
      reviewCommand:
        "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress",
      outstandingAutonomousEvidence: nextAutonomousWork,
      outstandingOperatorWork: nextOperatorWork,
      outstandingMarketConditionWork: nextMarketConditionWork,
      targetedMarketConditionMonitoring,
      autonomousEvidenceSufficiency,
      reason:
        nextReviewOverdue === true
          ? "The next completed funding-window checkpoint has passed; run the full live-goal refresh before making another strategy decision."
          : `${waitingEvidenceReason}${recompareSampleBufferCaveat}${sufficiencyCaveat}`,
    };
  }

  return {
    status: "continue_targeted_blocker_work",
    shouldStartLive: false,
    shouldRunHeavyRefreshNow: nextAutonomousWork.length > 0,
    nextReviewAt: nextCompletedFundingWindowAt,
    nextReviewAtKst: kstTimestamp(nextCompletedFundingWindowAt),
    nextReviewDelayMinutes,
    nextReviewOverdue,
    nextReviewTrigger: nextCompletedFundingWindowAt === null ? "targeted_blocker_update" : "next_completed_fee_stressed_funding_window",
    recommendedAutonomousAction:
      nextAutonomousWork.length > 0
        ? "run_only_the_targeted_evidence_command_for_the_listed_blocker"
        : "wait_for_operator_readiness_before_live_review",
    reviewCommand: "npm run --silent dry-run:summarize-live-goal-progress",
    outstandingAutonomousEvidence: nextAutonomousWork,
    outstandingOperatorWork: nextOperatorWork,
    outstandingMarketConditionWork: nextMarketConditionWork,
    targetedMarketConditionMonitoring,
    autonomousEvidenceSufficiency,
    reason:
      "Live startup remains blocked; only the listed blocker work should run before another live review.",
  };
}

function liveReadinessRefreshCommandForMarket(market: string | null): string | undefined {
  if (market === "KRW-AZTEC") return "npm run --silent dry-run:refresh-spot-perp-carry-aztec-live-readiness";
  if (market === "KRW-NIL") return "npm run --silent dry-run:refresh-spot-perp-carry-nil-live-readiness";
  if (market === "KRW-AKT") return "npm run --silent dry-run:refresh-spot-perp-carry-akt-live-readiness";
  if (market === "KRW-ELSA") return "npm run --silent dry-run:refresh-spot-perp-carry-elsa-live-readiness";
  if (market === "KRW-PIEVERSE") return "npm run --silent dry-run:refresh-spot-perp-carry-pieverse-live-readiness";
  if (market === "KRW-EDU") return "npm run --silent dry-run:refresh-spot-perp-carry-edu-live-readiness";
  if (market === "KRW-CYS") return "npm run --silent dry-run:refresh-spot-perp-carry-cys-live-readiness";
  return undefined;
}

function buildTargetedMarketConditionMonitoring(
  nextMarketConditionWork: string[],
  selectedMarket: string | null,
): Record<string, unknown> | null {
  const blockers = uniqueStrings(nextMarketConditionWork);
  if (blockers.length === 0) return null;
  const currentEntryBlockers = blockers.filter((blocker) =>
    /CurrentEntry|currentEntry|selectedFocusCurrentEntry/.test(blocker),
  );
  const spreadBlockers = blockers.filter((blocker) =>
    /wideDisplayedSpread|spreadControl|SpreadControl/.test(blocker),
  );
  const commands = uniqueStrings([
    currentEntryBlockers.length > 0
      ? "npm run --silent dry-run:refresh-spot-perp-carry-focus-current-entry-fee-stress"
      : undefined,
    currentEntryBlockers.length > 0
      ? "npm run --silent dry-run:discover-spot-perp-carry-current-carry-fee-stress"
      : undefined,
    spreadBlockers.length > 0
      ? "npm run --silent dry-run:refresh-spot-perp-carry-spread-threshold-experiments"
      : undefined,
    spreadBlockers.length > 0 ? liveReadinessRefreshCommandForMarket(selectedMarket) : undefined,
    "npm run --silent dry-run:summarize-live-goal-progress",
  ]);
  const action =
    currentEntryBlockers.length > 0 && spreadBlockers.length > 0
      ? "continue_current_entry_and_spread_monitoring_without_full_live_goal_refresh"
      : currentEntryBlockers.length > 0
        ? "continue_current_entry_monitoring_without_full_live_goal_refresh"
        : spreadBlockers.length > 0
          ? "continue_spread_monitoring_without_full_live_goal_refresh"
          : "continue_market_condition_monitoring_without_full_live_goal_refresh";

  return {
    status: "active",
    selectedMarket,
    blockers,
    currentEntryBlockers,
    spreadBlockers,
    action,
    commands,
    canAuthorizeLiveStartup: false,
    interpretation:
      "These market-condition checks can update short-cycle evidence while a full live-goal refresh waits for funding-window evidence; they cannot authorize live startup.",
  };
}

function medianNumber(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
      : (sorted[middle] as number);
  return Number(value.toFixed(6));
}

function marketSlug(market: string | null): string | null {
  if (market === null) return null;
  return market.toLowerCase().replace(/^krw-/, "");
}

function carryReadinessReportMatchesMarket(
  report: Record<string, unknown>,
  market: string | null,
  symbol: string | null,
): boolean {
  if (market === null) return false;

  if (stringField(report.market) === market) return true;
  const marketKeys = stringArrayField(report.marketKeys);
  if (
    marketKeys.some(
      (key) => key === market || key.startsWith(`${market}:`) || (symbol !== null && key.endsWith(`:${symbol}`)),
    )
  ) {
    return true;
  }

  const path = stringField(report.path)?.toLowerCase() ?? "";
  const slug = marketSlug(market);
  return slug !== null && path.includes(`spot-perp-carry-${slug}-live-readiness`);
}

function carryReadinessReportForMarket(
  reports: unknown,
  market: string | null,
  symbol: string | null,
): Record<string, unknown> {
  if (!Array.isArray(reports)) return {};
  return (
    reports.find(
      (report): report is Record<string, unknown> =>
        report !== null &&
        typeof report === "object" &&
        !Array.isArray(report) &&
        carryReadinessReportMatchesMarket(report as Record<string, unknown>, market, symbol),
    ) ?? {}
  );
}

function newestGeneratedReport(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(left).length === 0) return right;
  if (Object.keys(right).length === 0) return left;

  const leftGeneratedAtMs = timestampMs(stringField(left.generatedAt));
  const rightGeneratedAtMs = timestampMs(stringField(right.generatedAt));
  if (leftGeneratedAtMs === null) return right;
  if (rightGeneratedAtMs === null) return left;
  if (rightGeneratedAtMs > leftGeneratedAtMs) return right;
  if (leftGeneratedAtMs > rightGeneratedAtMs) return left;

  const leftEvidenceScore = readinessEvidenceScore(left);
  const rightEvidenceScore = readinessEvidenceScore(right);
  if (rightEvidenceScore > leftEvidenceScore) return { ...left, ...right };
  if (leftEvidenceScore > rightEvidenceScore) return { ...right, ...left };
  return left;
}

function readinessEvidenceScore(report: Record<string, unknown>): number {
  const evidence = recordField(report.evidence);
  const feeStressReports = arrayRecords(evidence.feeStressReports);
  const feeStressSpreadControl = feeStressSpreadControlFromReadiness(report);
  return (
    feeStressReports.length * 10 +
    (Object.keys(feeStressSpreadControl).length > 0 ? 5 : 0) +
    (Object.keys(recordField(report.readinessGap)).length > 0 ? 1 : 0) +
    stringArrayField(report.blockers).length +
    stringArrayField(report.marketSpecificBlockers).length +
    stringArrayField(report.globalBlockers).length
  );
}

async function refreshCarryReadinessReportSnapshots(
  reports: unknown,
): Promise<Array<Record<string, unknown>>> {
  const readinessReports = arrayRecords(reports);
  const refreshedReports: Array<Record<string, unknown>> = [];

  for (const report of readinessReports) {
    const sourcePath = stringField(report.sourceReadinessPath) ?? stringField(report.path);
    const fileReport =
      sourcePath === null
        ? null
        : await readOptionalJson<Record<string, unknown>>(resolve(process.cwd(), sourcePath));
    if (fileReport === null) {
      refreshedReports.push(report);
      continue;
    }

    refreshedReports.push({
      ...report,
      ...fileReport,
      path: sourcePath,
      sourceReadinessPath: sourcePath,
      marketKeys: report.marketKeys ?? fileReport.marketKeys,
    });
  }

  return refreshedReports;
}

function readinessGapBlockers(readinessGap: unknown): string[] {
  const gap = recordField(readinessGap);
  return uniqueStrings([
    recordField(gap.observations).passed === false ? "insufficientObservations" : undefined,
    recordField(gap.observationSpanMinutes).passed === false ? "insufficientObservationSpan" : undefined,
    recordField(gap.completedFundingEvents).passed === false
      ? "insufficientCompletedFundingEvents"
      : undefined,
  ]);
}

function liveReadinessBlockers(readiness: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...stringArrayField(readiness.blockers),
    ...stringArrayField(readiness.reasons),
    ...stringArrayField(readiness.globalBlockers),
    ...stringArrayField(readiness.marketSpecificBlockers),
    ...readinessGapBlockers(readiness.readinessGap),
  ]);
}

function latestIsoTimestamp(values: Array<string | null>): string | null {
  const timestamps = values
    .map((value) => timestampMs(value))
    .filter((timestamp): timestamp is number => timestamp !== null);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function buildPaperFundingWindowReturnView(
  fundingWindowCarryView: Record<string, unknown> | null,
  sourceLabel: string,
  notionalKrw: number | null,
): Record<string, unknown> | null {
  if (fundingWindowCarryView === null) return null;

  const ledgerRows = Array.isArray(fundingWindowCarryView.windows)
    ? fundingWindowCarryView.windows
        .filter((window): window is Record<string, unknown> =>
          window !== null && typeof window === "object" && !Array.isArray(window),
        )
        .map((window) => {
          const paperNetPnlKrw = numericField(window.medianEstimatedNetPnlKrw);
          const paperReturnPct =
            paperNetPnlKrw !== null && notionalKrw !== null && notionalKrw > 0
              ? Number(((paperNetPnlKrw / notionalKrw) * 100).toFixed(6))
              : null;
          return {
            market: window.market ?? null,
            symbol: window.symbol ?? null,
            fundingSettledAt: window.fundingSettledAt ?? null,
            sampleCount: window.sampleCount ?? null,
            medianNetCarryBps: window.medianNetCarryBps ?? null,
            paperNetPnlKrw,
            paperReturnPct,
            firstCapturedAt: window.firstCapturedAt ?? null,
            lastCapturedAt: window.lastCapturedAt ?? null,
            pricingMethod: "median_execution_eligible_snapshot",
          };
        })
        .sort(
          (left, right) =>
            (timestampMs(stringField(left.fundingSettledAt)) ?? Number.NEGATIVE_INFINITY) -
            (timestampMs(stringField(right.fundingSettledAt)) ?? Number.NEGATIVE_INFINITY),
        )
    : [];
  const latestLedgerRow = ledgerRows.at(-1) ?? null;
  const previousLedgerRow = ledgerRows.length > 1 ? (ledgerRows.at(-2) ?? null) : null;
  const paperReturnPctValues = ledgerRows
    .map((row) => row.paperReturnPct)
    .filter((value): value is number => value !== null);
  const paperNetPnlValues = ledgerRows
    .map((row) => row.paperNetPnlKrw)
    .filter((value): value is number => value !== null);
  const positivePaperWindowCount = paperNetPnlValues.filter((value) => value > 0).length;
  const estimatedNetPnlKrwAcrossFundingWindows = numericField(
    fundingWindowCarryView.estimatedNetPnlKrwAcrossFundingWindows,
  );
  const paperReturnPctAcrossFundingWindows =
    estimatedNetPnlKrwAcrossFundingWindows !== null && notionalKrw !== null && notionalKrw > 0
      ? Number(((estimatedNetPnlKrwAcrossFundingWindows / notionalKrw) * 100).toFixed(6))
      : null;
  const medianPaperReturnPct = medianNumber(paperReturnPctValues);
  const latestPaperReturnPct = latestLedgerRow?.paperReturnPct ?? null;
  const previousPaperReturnPct = previousLedgerRow?.paperReturnPct ?? null;
  const latestVsPreviousPaperReturnPct =
    latestPaperReturnPct !== null && previousPaperReturnPct !== null
      ? Number((latestPaperReturnPct - previousPaperReturnPct).toFixed(6))
      : null;
  const latestPaperReturnDeteriorating =
    latestVsPreviousPaperReturnPct !== null &&
    latestVsPreviousPaperReturnPct < 0 &&
    (medianPaperReturnPct === null || latestPaperReturnPct !== null && latestPaperReturnPct < medianPaperReturnPct);
  const paperReturnAction =
    ledgerRows.length === 0
      ? "collect_paper_funding_window_evidence"
      : latestPaperReturnPct === null
        ? "collect_complete_paper_return_inputs"
        : latestPaperReturnPct <= 0
          ? "demote_or_switch_if_next_window_confirms_loss"
          : latestPaperReturnDeteriorating
            ? "continue_observation_but_monitor_paper_return_degradation"
            : "continue_observation";

  return {
    status: "paper_funding_window_estimate_only",
    returnType: "paper_settled_funding_window",
    source: sourceLabel,
    sourcePath: fundingWindowCarryView.sourcePath ?? null,
    realizedReturnPct: null,
    realizedEvidenceAvailable: false,
    paperReturnIsUsableForLivePromotion: false,
    notionalKrw,
    completedFundingWindowCount: fundingWindowCarryView.completedFundingWindowCount ?? null,
    positiveWindowRate: fundingWindowCarryView.positiveWindowRate ?? null,
    positivePaperWindowCount,
    positivePaperWindowRate:
      paperNetPnlValues.length === 0
        ? null
        : Number((positivePaperWindowCount / paperNetPnlValues.length).toFixed(6)),
    medianWindowCarryPct: fundingWindowCarryView.medianWindowCarryPct ?? null,
    medianPaperReturnPct,
    previousPaperReturnPct,
    latestPaperNetPnlKrw: latestLedgerRow?.paperNetPnlKrw ?? null,
    latestPaperReturnPct,
    latestVsPreviousPaperReturnPct,
    latestPaperReturnDeteriorating,
    estimatedNetPnlKrwAcrossFundingWindows,
    paperReturnPctAcrossFundingWindows,
    action: paperReturnAction,
    ledgerRows,
    isDeduplicatedByFundingWindow: fundingWindowCarryView.isDeduplicatedByFundingWindow === true,
    isNotRealizedReturn: true,
    interpretation:
      "Deduped funding-window paper estimate for strategy comparison only; it is not realized account return because it lacks live/paper fill, funding settlement, inventory, margin, and unwind reconciliation.",
  };
}

function classifyNextWork(
  requiredEvidenceBeforeLive: string[],
  liveReadinessBlockers: string[],
  processAlignment: ProcessAlignment | null,
  liveReady: boolean,
): Record<string, unknown> {
  const evidenceCollectionBlockers = new Set([
    "insufficientObservations",
    "insufficientObservationSpan",
    "insufficientCompletedFundingEvents",
  ]);
  const operationalBlockers = new Set([
    "feeScheduleUnconfirmed",
    "inventoryNotReady",
    "hedgeVenueNotReady",
    "operationalProof:credentialsMissing",
  ]);
  const isOperationalBlocker = (blocker: string): boolean =>
    operationalBlockers.has(blocker) || blocker.startsWith("operationalProof:");
  const marketConditionBlockerSet = new Set([
    "wideDisplayedSpread",
    "weakMedianNetCarry",
    "lowPositiveCarryRate",
    "selectedFocusCurrentEntryCarryBelowLiveThreshold",
    "currentEntryDiagnosticOnly",
  ]);

  const normalizedBlockers = uniqueStrings([
    ...requiredEvidenceBeforeLive,
    ...liveReadinessBlockers
      .map((blocker) => blocker.replace(/^carryBlocker:/, ""))
      .map((blocker) => blocker.replace(/^spotPerpCarryLiveReadiness:/, "")),
  ]);

  const autonomousEvidenceCollection = normalizedBlockers.filter((blocker) =>
    evidenceCollectionBlockers.has(blocker),
  );
  const liveOperationalPrerequisites = normalizedBlockers.filter((blocker) =>
    isOperationalBlocker(blocker),
  );
  const marketConditionBlockers = normalizedBlockers.filter((blocker) =>
    marketConditionBlockerSet.has(blocker),
  );
  const processWork = processAlignment?.aligned === false ? ["fixProcessAlignment"] : [];
  const otherLiveGateBlockers = normalizedBlockers.filter(
    (blocker) =>
      !evidenceCollectionBlockers.has(blocker) &&
      !isOperationalBlocker(blocker) &&
      !marketConditionBlockerSet.has(blocker) &&
      !blocker.startsWith("market:") &&
      blocker !== "carryReportNotPromotionEligible",
  );

  return {
    autonomousEvidenceCollection,
    liveOperationalPrerequisites,
    marketConditionBlockers,
    processWork,
    otherLiveGateBlockers,
    canContinueAutonomously: autonomousEvidenceCollection.length > 0 || processAlignment?.aligned === true,
    canStartLiveWithoutOperatorInput:
      liveReady &&
      liveOperationalPrerequisites.length === 0 &&
      marketConditionBlockers.length === 0 &&
      processWork.length === 0 &&
      otherLiveGateBlockers.length === 0,
    recommendedAutonomousAction:
      autonomousEvidenceCollection.length > 0
        ? "continue_observation_and_refresh_live_goal_status"
        : "wait_for_next_gate_refresh_or_research_switch_signal",
    recommendedLiveAction:
      liveReady ? "run_live_startup_review_before_orders" : "keep_live_startup_blocked",
  };
}

const OPERATOR_ACTION_NAMES = new Set([
  "confirm_account_fee_schedule",
  "fund_or_verify_spot_inventory",
  "fund_or_verify_futures_hedge_venue",
  "refresh_operational_proof_with_credentials",
]);

type OperatorActionView = {
  action: string | null;
  reason: unknown;
  missingSecrets: string[];
  requirements: unknown;
  deficits: unknown;
};

function operatorActionViews(liveReadiness: SpotPerpLiveReadiness | null): OperatorActionView[] {
  return (liveReadiness?.nextOperationalSteps ?? [])
    .filter((step) => typeof step.action === "string" && OPERATOR_ACTION_NAMES.has(step.action))
    .map((step) => ({
      action: step.action ?? null,
      reason: step.reason ?? null,
      missingSecrets: Array.isArray(step.missingSecrets)
        ? step.missingSecrets.filter((item): item is string => typeof item === "string")
        : [],
      requirements: step.requirements ?? null,
      deficits: step.deficits ?? null,
    }));
}

function buildOperatorLiveReadinessHandoff(
  liveReadiness: SpotPerpLiveReadiness | null,
  liveStartupPlan: LiveGoalStatus["liveStartupPlan"],
  nextOperatorWork: string[],
  currentFocusLiveStartupCaution: Record<string, unknown>,
): Record<string, unknown> {
  const operationalProof = liveReadiness?.evidence?.operationalProof ?? null;
  const operatorActions = operatorActionViews(liveReadiness);
  const missingSecrets = uniqueStrings([
    ...(operationalProof?.details?.missingSecrets ?? []),
    ...(operatorActions.flatMap((step) => step.missingSecrets) ?? []),
  ]);
  const accountFeesConfirmed = operationalProof?.accountFeesConfirmed === true;
  const inventoryReady = operationalProof?.inventoryReady === true;
  const hedgeVenueReady = operationalProof?.hedgeVenueReady === true;
  const requiredBeforeLiveReview = uniqueStrings(nextOperatorWork);
  const deficits = operationalProof?.deficits ?? null;
  const feeBudget = operationalProof?.details?.feeBudget ?? null;
  const operationalProofReasons = operationalProof?.reasons ?? [];
  const operatorBlockerEvidence = requiredBeforeLiveReview.map((blocker) => {
    const matchingAction = operatorActions.find((step) => {
      if (blocker === "feeScheduleUnconfirmed" || /binanceFuturesFeeUnavailable/.test(blocker)) {
        return step.action === "confirm_account_fee_schedule";
      }
      if (blocker === "inventoryNotReady" || /bithumbQuoteInventoryInsufficient/.test(blocker)) {
        return step.action === "fund_or_verify_spot_inventory";
      }
      if (blocker === "hedgeVenueNotReady" || /binanceUsdtMarginInsufficient/.test(blocker)) {
        return step.action === "fund_or_verify_futures_hedge_venue";
      }
      if (blocker === "operationalProof:credentialsMissing") return step.action === "refresh_operational_proof_with_credentials";
      return false;
    });
    return {
      blocker,
      active: true,
      checks: {
        accountFeesConfirmed,
        inventoryReady,
        hedgeVenueReady,
        operationalProofPresent: operationalProof !== null,
        operationalProofFresh: liveReadiness?.checks?.operationalProofFresh === true,
      },
      missingSecrets:
        blocker === "operationalProof:credentialsMissing" ||
        blocker === "feeScheduleUnconfirmed" ||
        /binanceFuturesFeeUnavailable/.test(blocker)
          ? missingSecrets
          : [],
      deficits:
        /inventoryNotReady|bithumbQuoteInventoryInsufficient|hedgeVenueNotReady|binanceUsdtMarginInsufficient/.test(blocker)
          ? deficits
          : null,
      feeBudget: blocker === "feeScheduleUnconfirmed" ? feeBudget : null,
      sourceReasons: operationalProofReasons.filter((reason) =>
        blocker.startsWith("operationalProof:")
          ? blocker.endsWith(reason)
          : reason === blocker || blocker.toLowerCase().includes(reason.toLowerCase()),
      ),
      operatorAction: matchingAction ?? null,
    };
  });
  const currentFocusStartupBlocked = Object.keys(currentFocusLiveStartupCaution).length > 0;
  const blockedCommands = liveStartupBlockedCommands(liveStartupPlan);
  return {
    status:
      liveReadiness === null
        ? "live_readiness_artifact_missing"
        : requiredBeforeLiveReview.length > 0
          ? "operator_prerequisites_required"
          : "operator_prerequisites_clear_recheck_gate",
    canStartLiveWithoutOperatorInput:
      liveReadiness?.liveReady === true &&
      requiredBeforeLiveReview.length === 0 &&
      missingSecrets.length === 0 &&
      accountFeesConfirmed &&
      inventoryReady &&
      hedgeVenueReady,
    requiredBeforeLiveReview,
    privateDataRequired:
      missingSecrets.length > 0 || !accountFeesConfirmed || !inventoryReady || !hedgeVenueReady,
    missingSecrets,
    checks: {
      accountFeesConfirmed,
      inventoryReady,
      hedgeVenueReady,
      operationalProofPresent: operationalProof !== null,
      operationalProofFresh: liveReadiness?.checks?.operationalProofFresh === true,
    },
    requirements: operationalProof?.requirements ?? null,
    deficits,
    feeBudget,
    operatorBlockerEvidence,
    operatorActions,
    verificationCommands: {
      reviewCommand: currentFocusStartupBlocked ? null : liveStartupPlan?.reviewCommand ?? null,
      gateCommand: liveStartupPlan?.gateCommand ?? "npm run dry-run:gate-live-goal-ready",
      pm2StartCommandAfterAllGatesPass: currentFocusStartupBlocked
        ? null
        : liveStartupPlan?.pm2StartCommand ?? null,
    },
    blockedCommands: currentFocusStartupBlocked
      ? {
          ...blockedCommands,
          reason:
            stringField(currentFocusLiveStartupCaution.reason) ??
            "current_focus_requires_fee_stressed_challenger_recompare",
        }
      : null,
    hardStops: currentFocusStartupBlocked
      ? uniqueStrings([
          ...(liveStartupPlan?.hardStops ?? []),
          RECOMPARE_BLOCKED_COMMAND_HARD_STOP,
        ])
      : liveStartupPlan?.hardStops ?? [],
    interpretation:
      "Operator prerequisites require private account proof; resolving them does not start live trading until the review and goal gates pass.",
  };
}

function buildMarketConditionHandoff(
  nextMarketConditionWork: string[],
  currentEntrySanityView: Record<string, unknown>,
  strategyResearchHandoff: Record<string, unknown>,
  liveReadiness: SpotPerpLiveReadiness | null,
  liveStartupPlan: LiveGoalStatus["liveStartupPlan"],
  explicitSpreadThresholdExperiments: Array<Record<string, unknown>>,
  currentFocusLiveStartupCaution: Record<string, unknown>,
): Record<string, unknown> {
  const blockedCommands = liveStartupBlockedCommands(liveStartupPlan);
  const currentFocusStartupBlocked = Object.keys(currentFocusLiveStartupCaution).length > 0;
  const liveReviewBlocked =
    currentFocusStartupBlocked ||
    (liveStartupPlan?.reviewCommand === null && blockedCommands.reviewCommand !== null);
  const aggregateDiagnostics = recordField(currentEntrySanityView.aggregateCurrentEntryDiagnostics);
  const broadCurrentEntrySpreadControl = recordField(aggregateDiagnostics.spreadControl);
  const selectedMarketCurrentEntrySpreadControl = recordField(
    currentEntrySanityView.selectedMarketCurrentEntrySpreadControl,
  );
  const researchFocusSpreadControl = recordField(strategyResearchHandoff.researchFocusSpreadControl);
  const liveReadinessSpreadControl = feeStressSpreadControlFromReadiness(liveReadiness);
  const liveReadinessSpreadSensitivity = feeStressSpreadSensitivityFromReadiness(liveReadiness);
  const spreadSensitivity = spreadSensitivityTriage(
    liveReadinessSpreadControl,
    liveReadinessSpreadSensitivity,
  );
	  const hasLiveReadinessSpreadEvidence = Object.keys(liveReadinessSpreadControl).length > 0;
	  const wideSpreadWorkRemains = nextMarketConditionWork.includes("wideDisplayedSpread");
	  const selectedSnapshot = recordField(currentEntrySanityView.selectedMarketCurrentEntrySnapshot);
  const spreadBlockerEvidence = buildSpreadBlockerEvidence(
    selectedMarketCurrentEntrySpreadControl,
    liveReadinessSpreadControl,
    wideSpreadWorkRemains,
  );
	  return {
    status:
      nextMarketConditionWork.length > 0
        ? "market_conditions_required"
        : "market_conditions_clear_recheck_gate",
    canStartLiveWithoutMarketConditionWork: nextMarketConditionWork.length === 0,
    requiredBeforeLiveReview: uniqueStrings(nextMarketConditionWork),
    selectedMarket: currentEntrySanityView.selectedMarket ?? null,
    currentEntryStatus: currentEntrySanityView.status ?? null,
    currentEntryBlockers: currentEntrySanityView.currentEntryBlockers ?? [],
    currentEntrySourcePath: currentEntrySanityView.preferredSourcePath ?? null,
    currentEntryCarryGate: currentEntrySanityView.currentEntryCarryGate ?? null,
	    selectedMarketCurrentEntrySnapshot: Object.keys(selectedSnapshot).length > 0 ? selectedSnapshot : null,
    selectedMarketCurrentEntrySpreadControl: spreadControlHandoffView(
      selectedMarketCurrentEntrySpreadControl,
      wideSpreadWorkRemains,
      "selected_market_current_entry",
    ),
    researchFocusSpreadControl:
      Object.keys(researchFocusSpreadControl).length > 0 ? researchFocusSpreadControl : null,
    broadCurrentEntrySpreadControl: spreadControlHandoffView(
      broadCurrentEntrySpreadControl,
      false,
      "broad_current_entry_aggregate_diagnostic_only",
    ),
    currentEntryAlternativeCandidates:
      currentEntrySanityView.currentEntryAlternativeCandidates ?? [],
    currentEntryAlternativeCandidateCount:
      currentEntrySanityView.currentEntryAlternativeCandidateCount ?? 0,
    spreadBlockerEvidence,
    spreadControl: spreadControlHandoffView(
      selectedMarketCurrentEntrySpreadControl,
      wideSpreadWorkRemains,
      "selected_market_current_entry",
    ),
    liveReadinessSpreadControl: hasLiveReadinessSpreadEvidence
      ? spreadControlHandoffView(
          liveReadinessSpreadControl,
          wideSpreadWorkRemains,
          "live_readiness_fee_stress",
        )
      : null,
    spreadSensitivity,
    explicitSpreadThresholdExperiments,
    verificationCommands: {
      reviewCommand: liveReviewBlocked ? null : liveStartupPlan?.reviewCommand ?? null,
      gateCommand: liveStartupPlan?.gateCommand ?? "npm run dry-run:gate-live-goal-ready",
    },
    blockedCommands: liveReviewBlocked
      ? {
          ...blockedCommands,
          reason:
            stringField(currentFocusLiveStartupCaution.reason) ??
            "current_focus_requires_fee_stressed_challenger_recompare",
        }
      : null,
    interpretation:
      "Market-condition blockers require fresh execution-quality evidence; reduced spread rejection alone is not live permission until the review and goal gates pass.",
  };
}

function buildAutonomousEvidenceHandoff(
  nextAutonomousWork: string[],
  priorityAction: NextAction | null,
  checkpointPlan: Record<string, unknown>,
  challengerObservationCoverage: Record<string, unknown>,
  strategyResearchHandoff: Record<string, unknown>,
): Record<string, unknown> {
  const readinessGap = priorityAction?.currentEvidence?.readinessGap ?? null;
  const readinessTimeline = priorityAction?.currentEvidence?.readinessTimeline ?? null;
  const latestFeeStressWindowComparison = recordField(
    strategyResearchHandoff.latestFeeStressWindowComparison,
  );
  const minLatestWindowSampleCount = numericField(
    latestFeeStressWindowComparison.minSampleCountForRecompare,
  );
  const currentFocusLatestWindowSampleCount = numericField(
    latestFeeStressWindowComparison.currentFocusLatestWindowSampleCount,
  );
  const bestChallengerLatestWindowSampleCount = numericField(
    latestFeeStressWindowComparison.bestChallengerLatestWindowSampleCount,
  );
  const autonomousBlockerEvidence = uniqueStrings(nextAutonomousWork).map((blocker) => {
    const baseEvidence = {
      blocker,
      active: true,
      readinessGap:
        blocker === "insufficientObservationSpan"
          ? recordField(readinessGap).observationSpanMinutes ?? null
          : readinessGap,
      readinessTimeline,
      nextReviewAt: checkpointPlan.nextReviewAt ?? null,
      nextReviewAtKst: checkpointPlan.nextReviewAtKst ?? null,
      nextReviewTrigger: checkpointPlan.nextReviewTrigger ?? null,
      recommendedAutonomousAction: checkpointPlan.recommendedAutonomousAction ?? null,
    };
    if (blocker === "latestWindowSampleQuality" || blocker === "latestWindowFundingAlignment") {
      return {
        ...baseEvidence,
        latestFeeStressWindowComparison,
        currentFocusLatestWindow:
          latestFeeStressWindowComparison.currentFocusLatestWindow ?? null,
        bestChallengerLatestWindow:
          latestFeeStressWindowComparison.bestChallengerLatestWindow ?? null,
        fundingWindowAligned:
          latestFeeStressWindowComparison.fundingWindowAligned ?? null,
        sampleQualityPasses:
          latestFeeStressWindowComparison.sampleQualityPasses ?? null,
        minSampleCountForRecompare: minLatestWindowSampleCount,
        currentFocusLatestWindowSampleCount,
        bestChallengerLatestWindowSampleCount,
        currentFocusLatestWindowSampleShortfall:
          minLatestWindowSampleCount !== null && currentFocusLatestWindowSampleCount !== null
            ? Math.max(0, minLatestWindowSampleCount - currentFocusLatestWindowSampleCount)
            : null,
        bestChallengerLatestWindowSampleShortfall:
          minLatestWindowSampleCount !== null && bestChallengerLatestWindowSampleCount !== null
            ? Math.max(0, minLatestWindowSampleCount - bestChallengerLatestWindowSampleCount)
            : null,
        requiredBeforeFocusSwitch: strategyResearchHandoff.requiredBeforeFocusSwitch ?? [],
        strategyResearchAction: strategyResearchHandoff.action ?? null,
        strategyResearchReason: strategyResearchHandoff.reason ?? null,
      };
    }
    if (blocker !== "opportunityObserverCoverage") return baseEvidence;
    return {
      ...baseEvidence,
      opportunityObservationCovered:
        challengerObservationCoverage.opportunityObservationCovered ?? null,
      opportunityObserverConfiguredForMissingMarkets:
        challengerObservationCoverage.opportunityObserverConfiguredForMissingMarkets ?? null,
      missingOpportunityObservation:
        challengerObservationCoverage.missingOpportunityObservation ?? [],
      observedOpportunityObservation:
        challengerObservationCoverage.observedOpportunityObservation ?? [],
      requiredAction: challengerObservationCoverage.action ?? null,
      interpretation: challengerObservationCoverage.interpretation ?? null,
    };
  });
  return {
    status:
      nextAutonomousWork.length > 0
        ? "autonomous_evidence_required"
        : "autonomous_evidence_clear_recheck_gate",
    canStartLiveWithoutAutonomousEvidenceWork: nextAutonomousWork.length === 0,
    requiredBeforeLiveReview: uniqueStrings(nextAutonomousWork),
    readinessGap,
    readinessTimeline,
    autonomousBlockerEvidence,
    evidenceCollectionStillRequired: (priorityAction?.requiredEvidenceBeforeLive ?? []).filter((requirement) =>
      [
        "insufficientObservations",
        "insufficientObservationSpan",
        "insufficientCompletedFundingEvents",
      ].includes(requirement),
    ),
    nextReviewAt: checkpointPlan.nextReviewAt ?? null,
    nextReviewAtKst: checkpointPlan.nextReviewAtKst ?? null,
    nextReviewTrigger: checkpointPlan.nextReviewTrigger ?? null,
    recommendedAutonomousAction: checkpointPlan.recommendedAutonomousAction ?? null,
    reviewCommand: checkpointPlan.reviewCommand ?? null,
    reason: checkpointPlan.reason ?? null,
    interpretation:
      "Autonomous evidence blockers require additional observation or a scheduled refresh; they do not authorize live startup until all review and goal gates pass.",
  };
}

function buildStrategyResearchHandoff(
  challengerSwitchDecision: Record<string, unknown>,
  challengerObservationCoverage: Record<string, unknown>,
  spreadCleanEmergingChallengers: Array<Record<string, unknown>>,
  currentEntrySanityView: Record<string, unknown>,
  liveStartupPlan: LiveGoalStatus["liveStartupPlan"],
  switchPlan: Record<string, unknown> | undefined,
  carryLiveReadinessReports: unknown,
): Record<string, unknown> {
  const bestChallenger = recordField(challengerSwitchDecision.bestChallenger);
  const rawLatestFeeStressWindowComparison = recordField(
    challengerSwitchDecision.latestFeeStressWindowComparison,
  );
  const liveStartupFocusRecompare = recordField(liveStartupPlan?.focusRecompare);
  const liveStartupRecomparePlan = recordField(liveStartupPlan?.recompareChallengerPlan);
  const liveStartupRecompareBestChallenger = recordField(
    liveStartupFocusRecompare.bestChallenger,
  );
  const liveStartupRecompareCurrentFocusTrend = recordField(
    liveStartupFocusRecompare.currentFocusTrend,
  );
  const liveStartupRecompareCurrentLatestWindow = recordField(
    liveStartupRecompareCurrentFocusTrend.latestWindow,
  );
  const liveStartupRecompareChallengerLatestWindow = recordField(
    liveStartupRecompareBestChallenger.latestWindow,
  );
  const liveStartupRecompareSignal =
    liveStartupPlan?.status === "blocked_current_focus_recompare_required" &&
    (liveStartupFocusRecompare.needsRecompareBeforeLive === true ||
      liveStartupFocusRecompare.latestWindowRecompareSignal === true);
  const latestFeeStressWindowComparison = liveStartupRecompareSignal
    ? {
        currentFocusLatestWindow:
          Object.keys(liveStartupRecompareCurrentLatestWindow).length > 0
            ? liveStartupRecompareCurrentLatestWindow
            : liveStartupRecomparePlan.currentFocusLatestWindow ?? null,
        bestChallengerLatestWindow:
          Object.keys(liveStartupRecompareChallengerLatestWindow).length > 0
            ? liveStartupRecompareChallengerLatestWindow
            : liveStartupRecomparePlan.latestWindow ?? null,
        deltaToCurrentFocusBps:
          liveStartupRecompareBestChallenger.deltaToCurrentLatestBps ??
          (() => {
            const challengerLatest = numericField(
              recordField(liveStartupRecomparePlan.latestWindow).medianNetCarryBps,
            );
            const currentLatest = numericField(
              recordField(liveStartupRecomparePlan.currentFocusLatestWindow)
                .medianNetCarryBps,
            );
            return challengerLatest !== null && currentLatest !== null
              ? challengerLatest - currentLatest
              : null;
          })(),
        bestChallengerBeatsCurrentFocus:
          liveStartupFocusRecompare.challengerBeatsCurrentLatest === true ||
          liveStartupFocusRecompare.qualityClearedChallengerBeatsCurrentLatest === true,
        fundingWindowAligned: liveStartupFocusRecompare.latestWindowsAligned === true,
        sampleQualityPasses:
          liveStartupFocusRecompare.latestWindowSampleQualityPasses === true,
        minSampleCountForRecompare:
          liveStartupFocusRecompare.minLatestWindowSampleCountForRecompare ?? null,
        currentFocusLatestWindowSampleCount:
          liveStartupRecompareCurrentLatestWindow.sampleCount ??
          recordField(liveStartupRecomparePlan.currentFocusLatestWindow).sampleCount ??
          null,
        bestChallengerLatestWindowSampleCount:
          liveStartupRecompareChallengerLatestWindow.sampleCount ??
          recordField(liveStartupRecomparePlan.latestWindow).sampleCount ??
          null,
        action: "recompare_before_next_live_review",
      }
    : rawLatestFeeStressWindowComparison;
  const bestChallengerMarket =
    (liveStartupRecompareSignal
      ? stringField(liveStartupRecompareBestChallenger.market) ??
        stringField(liveStartupRecomparePlan.market)
      : null) ??
    stringField(challengerSwitchDecision.bestChallengerMarket) ??
    stringField(bestChallenger.market);
  const bestChallengerSymbol =
    (liveStartupRecompareSignal
      ? stringField(liveStartupRecompareBestChallenger.symbol) ??
        stringField(liveStartupRecomparePlan.symbol)
      : null) ?? stringField(bestChallenger.symbol);
  const action = liveStartupRecompareSignal
    ? "compare_or_switch_research_focus"
    : stringField(challengerSwitchDecision.action) ?? "continue_current_research_focus";
  const blockedCommands = liveStartupBlockedCommands(liveStartupPlan);
  const latestWindowAction = stringField(latestFeeStressWindowComparison.action);
  const latestWindowSampleQualityPasses =
    latestFeeStressWindowComparison.sampleQualityPasses === true;
  const rawSwitchPlanBestChallengerLiveReadiness = recordField(
    switchPlan?.bestChallengerLiveReadiness,
  );
  const switchPlanBestChallengerLiveReadiness = carryReadinessReportMatchesMarket(
    rawSwitchPlanBestChallengerLiveReadiness,
    bestChallengerMarket,
    bestChallengerSymbol,
  )
    ? rawSwitchPlanBestChallengerLiveReadiness
    : {};
  const reportBestChallengerLiveReadiness = carryReadinessReportForMarket(
    carryLiveReadinessReports,
    bestChallengerMarket,
    bestChallengerSymbol,
  );
  const bestChallengerLiveReadiness = newestGeneratedReport(
    switchPlanBestChallengerLiveReadiness,
    reportBestChallengerLiveReadiness,
  );
  const bestChallengerReadinessInterpretation =
    stringField(bestChallengerLiveReadiness.interpretation);
  const bestChallengerReadinessBlockers = liveReadinessBlockers(bestChallengerLiveReadiness);
  const bestChallengerRequiredBeforeMetricCandidate = stringArrayField(
    bestChallenger.requiredBeforeMetricCandidate,
  );
  const bestChallengerSpreadRequired =
    bestChallengerRequiredBeforeMetricCandidate.includes("spreadControl") ||
    bestChallengerReadinessBlockers.some((blocker) =>
      /wideDisplayedSpread|requires:spreadControl|spreadControl/i.test(blocker),
    );
  const bestChallengerSpreadControl = feeStressSpreadControlFromReadiness(bestChallengerLiveReadiness);
  const bestChallengerSpreadControlView = spreadControlHandoffView(
    bestChallengerSpreadControl,
    bestChallengerSpreadRequired,
    "best_challenger_live_readiness_fee_stress",
  );
  const researchFocusSpreadControlAction =
    bestChallengerSpreadControlView === null
      ? "collect_challenger_spread_control_evidence_before_recompare"
      : bestChallengerSpreadControlView.passed === true
        ? "verify_challenger_spread_control_clear_before_focus_switch"
        : "keep_research_focus_recompare_blocked_until_challenger_spread_control_clears";
  const bestChallengerLiveReadinessView =
    Object.keys(bestChallengerLiveReadiness).length === 0
      ? null
      : {
          market: bestChallengerLiveReadiness.market ?? bestChallengerMarket ?? null,
          symbol: bestChallengerLiveReadiness.symbol ?? bestChallengerSymbol ?? null,
          status: bestChallengerLiveReadiness.status ?? null,
          liveReady: bestChallengerLiveReadiness.liveReady === true,
          sourceReadinessPath:
            bestChallengerLiveReadiness.sourceReadinessPath ??
            bestChallengerLiveReadiness.path ??
            null,
          generatedAt: bestChallengerLiveReadiness.generatedAt ?? null,
          fresh: bestChallengerLiveReadiness.fresh ?? null,
          readinessGap: bestChallengerLiveReadiness.readinessGap ?? null,
          readinessTimeline: bestChallengerLiveReadiness.readinessTimeline ?? null,
          checks: bestChallengerLiveReadiness.checks ?? null,
          blockers: bestChallengerReadinessBlockers,
          marketSpecificBlockers:
            bestChallengerLiveReadiness.marketSpecificBlockers ?? [],
          globalBlockers: bestChallengerLiveReadiness.globalBlockers ?? [],
          requiredBeforeMetricCandidate:
            bestChallengerLiveReadiness.requiredBeforeMetricCandidate ?? [],
          spreadControl: bestChallengerSpreadControlView,
          spreadFailureTriage: spreadFailureTriage(bestChallengerSpreadControl),
          action: bestChallengerLiveReadiness.action ?? null,
          interpretation:
            bestChallengerReadinessInterpretation !== null &&
            /cannot authorize live startup/.test(bestChallengerReadinessInterpretation)
              ? bestChallengerReadinessInterpretation
              : uniqueStrings([
                  bestChallengerReadinessInterpretation ?? undefined,
                  "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
                ]).join(" "),
        };
  const opportunityCoverageWork =
    challengerObservationCoverage.opportunityObservationCovered === false
      ? challengerObservationCoverage.opportunityObserverConfiguredForMissingMarkets === true
        ? ["opportunityObservationSample"]
        : ["opportunityObserverCoverage"]
      : [];
  const researchWork = uniqueStrings([
    ...bestChallengerRequiredBeforeMetricCandidate,
    ...(latestFeeStressWindowComparison.fundingWindowAligned === false &&
    latestWindowAction === "collect_synchronized_latest_window_samples_before_recompare"
      ? ["latestWindowFundingAlignment"]
      : []),
    ...(latestWindowSampleQualityPasses
      ? []
      : latestWindowAction === null
        ? []
        : ["latestWindowSampleQuality"]),
    ...opportunityCoverageWork,
  ]);
  const emergingCleanCandidates = spreadCleanEmergingChallengers.slice(0, 4).map((candidate) => ({
    market: candidate.market ?? null,
    symbol: candidate.symbol ?? null,
    comparisonCarryBps: candidate.comparisonCarryBps ?? null,
    comparisonCarrySource: candidate.comparisonCarrySource ?? null,
    completedFundingWindowCount: candidate.completedFundingWindowCount ?? null,
    remainingFundingWindowCount: candidate.remainingFundingWindowCount ?? null,
    executionEligibleRate: candidate.executionEligibleRate ?? null,
    qualityStatus: candidate.qualityStatus ?? null,
    qualityPasses: candidate.qualityPasses === true,
    evidenceAction: candidate.evidenceAction ?? null,
  }));

  return {
    status:
      action === "compare_or_switch_research_focus"
        ? "research_focus_recompare_required"
        : action === "collect_challenger_funding_evidence"
          ? "challenger_evidence_required"
          : "research_focus_hold",
    canAuthorizeLiveStartup: false,
    currentFocusMarket: challengerSwitchDecision.currentFocusMarket ?? null,
    currentFocusComparisonCarryBps:
      challengerSwitchDecision.currentFocusComparisonCarryBps ?? null,
    bestChallengerMarket,
    bestChallengerSymbol,
    bestChallengerComparisonCarryBps:
      challengerSwitchDecision.bestChallengerComparisonCarryBps ?? null,
    bestChallengerComparisonCarrySource:
      challengerSwitchDecision.bestChallengerComparisonCarrySource ?? null,
    deltaToCurrentFocusComparisonBps:
      challengerSwitchDecision.deltaToCurrentFocusComparisonBps ?? null,
    action,
    reason: liveStartupRecompareSignal
      ? stringField(liveStartupPlan?.blockedReason) ??
        "best_challenger_beats_current_focus_after_basic_quality_gates"
      : challengerSwitchDecision.reason ?? null,
    requiredBeforeFocusSwitch: researchWork,
    researchFocusSpreadControl:
      researchWork.includes("spreadControl")
        ? {
            scope: "best_challenger_recompare",
            currentFocusMarket: challengerSwitchDecision.currentFocusMarket ?? null,
            bestChallengerMarket,
            bestChallengerSymbol,
            requiredBeforeFocusSwitch: ["spreadControl"],
            bestChallengerSpreadControl: bestChallengerSpreadControlView,
            blockerEvidence: spreadThresholdBreaches(
              bestChallengerSpreadControl,
              "bestChallengerSpreadControl",
            ),
            clearanceProgress: spreadClearanceProgress(
              bestChallengerSpreadControl,
              "bestChallengerSpreadControl",
            ),
            action: researchFocusSpreadControlAction,
            interpretation:
              bestChallengerSpreadControlView === null
                ? "Challenger spread-control evidence is missing; collect challenger live-readiness spread evidence before treating spreadControl as cleared or breached."
                : "This spread-control blocker belongs to the research-focus challenger recompare, not the selected current-entry spread gate.",
          }
        : null,
    bestChallengerLiveReadiness: bestChallengerLiveReadinessView,
	    requiredBeforeChallengerLiveStartup:
	      bestChallengerLiveReadinessView === null
	        ? []
	        : [
	            ...stringArrayField(bestChallengerLiveReadinessView.requiredBeforeMetricCandidate),
	            ...stringArrayField(bestChallengerLiveReadinessView.blockers),
	            ...(bestChallengerLiveReadinessView.liveReady ? [] : ["challengerLiveReadiness"]),
	          ],
    latestFeeStressWindowComparison: {
      currentFocusLatestWindow:
        latestFeeStressWindowComparison.currentFocusLatestWindow ?? null,
      bestChallengerLatestWindow:
        latestFeeStressWindowComparison.bestChallengerLatestWindow ?? null,
      deltaToCurrentFocusBps:
        latestFeeStressWindowComparison.deltaToCurrentFocusBps ?? null,
      bestChallengerBeatsCurrentFocus:
        latestFeeStressWindowComparison.bestChallengerBeatsCurrentFocus === true,
      fundingWindowAligned:
        latestFeeStressWindowComparison.fundingWindowAligned ?? null,
      sampleQualityPasses: latestWindowSampleQualityPasses,
      minSampleCountForRecompare:
        latestFeeStressWindowComparison.minSampleCountForRecompare ?? null,
      currentFocusLatestWindowSampleCount:
        latestFeeStressWindowComparison.currentFocusLatestWindowSampleCount ?? null,
      bestChallengerLatestWindowSampleCount:
        latestFeeStressWindowComparison.bestChallengerLatestWindowSampleCount ?? null,
      action: latestWindowAction,
    },
    observationCoverage: {
      opportunityObservationCovered:
        challengerObservationCoverage.opportunityObservationCovered ?? null,
      opportunityObserverConfiguredForMissingMarkets:
        challengerObservationCoverage.opportunityObserverConfiguredForMissingMarkets ?? null,
      missingOpportunityObservation:
        challengerObservationCoverage.missingOpportunityObservation ?? [],
      action: challengerObservationCoverage.action ?? null,
    },
    emergingCleanOpportunities: {
      candidateCount: spreadCleanEmergingChallengers.length,
      candidates: emergingCleanCandidates,
      action:
        emergingCleanCandidates.length > 0
          ? "continue_spread_clean_opportunity_observation"
          : null,
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
    currentEntrySanity: {
      status: currentEntrySanityView.status ?? null,
      selectedMarket: currentEntrySanityView.selectedMarket ?? null,
      currentEntryBlockers: currentEntrySanityView.currentEntryBlockers ?? [],
      preferredSourcePath: currentEntrySanityView.preferredSourcePath ?? null,
      currentEntryEvidenceTimestamp: currentEntrySanityView.currentEntryEvidenceTimestamp ?? null,
      currentEntryEvidenceAgeMinutes: currentEntrySanityView.currentEntryEvidenceAgeMinutes ?? null,
      maxCurrentEntryEvidenceAgeMinutes:
        currentEntrySanityView.maxCurrentEntryEvidenceAgeMinutes ?? null,
      currentEntryCarryGate: currentEntrySanityView.currentEntryCarryGate ?? null,
      selectedMarketCurrentEntrySnapshot:
        currentEntrySanityView.selectedMarketCurrentEntrySnapshot ?? null,
    },
    verificationCommands: {
      reviewCommand:
        action === "compare_or_switch_research_focus" ? null : liveStartupPlan?.reviewCommand ?? null,
      gateCommand: liveStartupPlan?.gateCommand ?? "npm run dry-run:gate-live-goal-ready",
      refreshGoalStatusCommand: "npm run dry-run:refresh-live-goal-status",
      observeOpportunityCommand: "npm run dry-run:observe-spot-perp-carry-opportunity-72h",
      refreshOpportunityFeeStressCommand:
        "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
    },
    blockedCommands:
      action === "compare_or_switch_research_focus"
        ? {
            ...blockedCommands,
            reason:
              "Live review is blocked until the fee-stressed research-focus recompare is resolved.",
          }
        : null,
    interpretation:
      "Strategy research can recommend keep/switch evidence collection, but it cannot authorize live startup without profitability, readiness, operational-proof, market-condition, and goal gates.",
  };
}

function prioritizeNextWorkForChallengerEvidence(
  nextWorkClassification: Record<string, unknown>,
  challengerSwitchDecision: Record<string, unknown>,
  carryLiveReadinessReports: unknown,
): Record<string, unknown> {
  const latestFeeStressWindowComparison = recordField(
    challengerSwitchDecision.latestFeeStressWindowComparison,
  );
  const bestChallenger = recordField(challengerSwitchDecision.bestChallenger);
  const latestChallengerWindow = recordField(
    latestFeeStressWindowComparison.bestChallengerLatestWindow,
  );
  const bestChallengerFeeStressFundingWindowSummary = recordField(
    recordField(bestChallenger.feeStressEvidence).fundingWindowSummary,
  );
  const bestChallengerMarket = stringField(bestChallenger.market) ?? stringField(challengerSwitchDecision.bestChallengerMarket);
  const bestChallengerSymbol = stringField(bestChallenger.symbol);
  const challengerReadinessReport = carryReadinessReportForMarket(
    carryLiveReadinessReports,
    bestChallengerMarket,
    bestChallengerSymbol,
  );
  const challengerReadinessTimeline = recordField(challengerReadinessReport.readinessTimeline);
  const challengerReadinessGap = recordField(challengerReadinessReport.readinessGap);
  const challengerFeeStressSpreadControl =
    feeStressSpreadControlFromReadiness(challengerReadinessReport);
  const challengerFeeStressSpreadSensitivity =
    feeStressSpreadSensitivityFromReadiness(challengerReadinessReport);
  const challengerLatestSpreadControlWindow =
    latestSpreadControlFundingWindow(challengerFeeStressSpreadControl);
  const challengerSpreadFailureTriage = spreadFailureTriage(challengerFeeStressSpreadControl);
  const challengerSpreadSensitivityTriage = spreadSensitivityTriage(
    challengerFeeStressSpreadControl,
    challengerFeeStressSpreadSensitivity,
  );
  const challengerSpreadControlAvailable =
    Object.keys(challengerFeeStressSpreadControl).length > 0;
  const challengerSpreadControlRequired =
    challengerFeeStressSpreadControl.required === true;
  const estimatedEarliestLiveReadinessReviewAt = stringField(
    challengerReadinessTimeline.estimatedEarliestReviewAt,
  );
  const liveReadinessReviewBottleneck = stringField(challengerReadinessTimeline.bottleneck);
  const fundingWindowTimestamps = Array.isArray(bestChallengerFeeStressFundingWindowSummary.windows)
    ? bestChallengerFeeStressFundingWindowSummary.windows
        .filter((window): window is Record<string, unknown> =>
          window !== null && typeof window === "object" && !Array.isArray(window),
        )
        .map((window) => timestampMs(stringField(window.fundingSettledAt)))
        .filter((timestamp): timestamp is number => timestamp !== null)
        .sort((left, right) => left - right)
    : [];
  const fundingWindowIntervalMs = medianNumber(
    fundingWindowTimestamps
      .slice(1)
      .map((timestamp, index) => timestamp - (fundingWindowTimestamps[index] as number))
      .filter((interval) => interval > 0),
  );
  const latestCompletedFundingSettledAtMs = timestampMs(
    stringField(latestChallengerWindow.fundingSettledAt),
  );
  const completedFundingWindowCount = numericField(bestChallenger.feeStressCompletedFundingWindowCount);
  const requiredFundingWindowCount = numericField(bestChallenger.requiredFundingWindowCountForSwitch);
  const remainingFundingWindowCount =
    completedFundingWindowCount !== null && requiredFundingWindowCount !== null
      ? Math.max(0, requiredFundingWindowCount - completedFundingWindowCount)
      : null;
  const estimatedNextFundingSettledAt =
    latestCompletedFundingSettledAtMs !== null && fundingWindowIntervalMs !== null
      ? new Date(latestCompletedFundingSettledAtMs + fundingWindowIntervalMs).toISOString()
      : null;
  const estimatedEarliestFundingWindowReviewAt =
    latestCompletedFundingSettledAtMs !== null &&
    fundingWindowIntervalMs !== null &&
    remainingFundingWindowCount !== null &&
    remainingFundingWindowCount > 0
      ? new Date(
          latestCompletedFundingSettledAtMs +
            fundingWindowIntervalMs * remainingFundingWindowCount,
        ).toISOString()
      : null;
  const estimatedEarliestSwitchReviewAt = latestIsoTimestamp([
    estimatedEarliestFundingWindowReviewAt,
    estimatedEarliestLiveReadinessReviewAt,
  ]);
  const fundingWindowReviewAtMs = timestampMs(estimatedEarliestFundingWindowReviewAt);
  const liveReadinessReviewAtMs = timestampMs(estimatedEarliestLiveReadinessReviewAt);
  const liveReadinessReviewDominatesFundingWindowReview =
    fundingWindowReviewAtMs === null || liveReadinessReviewAtMs === null
      ? null
      : liveReadinessReviewAtMs > fundingWindowReviewAtMs;
  const shouldPrioritizeChallengerEvidence =
    challengerSwitchDecision.action === "collect_challenger_funding_evidence" &&
    [
      "collect_synchronized_latest_window_samples_before_recompare",
      "collect_challenger_funding_evidence_for_latest_window_advantage",
      "collect_latest_window_samples_before_recompare",
    ].includes(stringField(latestFeeStressWindowComparison.action) ?? "");

  if (!shouldPrioritizeChallengerEvidence) return nextWorkClassification;
  const latestFeeStressFundingWindowAligned =
    latestFeeStressWindowComparison.fundingWindowAligned === true;
  const latestWindowSampleQualityPasses =
    latestFeeStressWindowComparison.sampleQualityPasses === true;

  const challengerLiveReadinessCommand =
    bestChallengerMarket === "KRW-AZTEC"
      ? "npm run dry-run:refresh-spot-perp-carry-aztec-live-readiness"
      : bestChallengerMarket === "KRW-NIL"
        ? "npm run dry-run:refresh-spot-perp-carry-nil-live-readiness"
      : bestChallengerMarket === "KRW-AKT"
        ? "npm run dry-run:refresh-spot-perp-carry-akt-live-readiness"
      : bestChallengerMarket === "KRW-ELSA"
        ? "npm run dry-run:refresh-spot-perp-carry-elsa-live-readiness"
      : bestChallengerMarket === "KRW-PIEVERSE"
        ? "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness"
      : bestChallengerMarket === "KRW-EDU"
        ? "npm run dry-run:refresh-spot-perp-carry-edu-live-readiness"
      : bestChallengerMarket === "KRW-CYS"
        ? "npm run dry-run:refresh-spot-perp-carry-cys-live-readiness"
        : null;

  return {
    ...nextWorkClassification,
    autonomousEvidenceCollection: uniqueStrings([
      ...stringArrayField(nextWorkClassification.autonomousEvidenceCollection),
      "collectChallengerFundingEvidence",
    ]),
    strategyEvidencePriority: !latestFeeStressFundingWindowAligned
      ? "challenger_latest_fee_stress_window_alignment_gap"
      : challengerSpreadControlRequired
      ? "challenger_latest_fee_stress_window_spread_gap"
      : latestWindowSampleQualityPasses
      ? "challenger_latest_fee_stress_window_advantage"
      : "challenger_latest_fee_stress_window_sample_gap",
    priorityMarket: challengerSwitchDecision.bestChallengerMarket ?? null,
    priorityReason: !latestFeeStressFundingWindowAligned
      ? "Best challenger and current focus do not yet share the same latest completed fee-stressed funding window, so the recompare must wait for synchronized evidence."
      : challengerSpreadControlRequired
      ? "Best challenger beat the current focus in the latest completed fee-stressed funding window, but its spread control has not cleared."
      : latestWindowSampleQualityPasses
      ? "Best challenger beat the current focus in the latest completed fee-stressed funding window but still lacks enough completed funding windows for a switch."
      : "Best challenger beat the current focus in the latest completed fee-stressed funding window, but the latest-window sample count is too low for a switch review.",
    priorityFundingWindowEvidence: {
      market: bestChallengerMarket,
      symbol: bestChallengerSymbol,
      completedFundingWindowCount,
      requiredFundingWindowCount,
      remainingFundingWindowCount,
      latestCompletedFundingSettledAt: latestChallengerWindow.fundingSettledAt ?? null,
      estimatedFundingWindowIntervalMinutes:
        fundingWindowIntervalMs === null ? null : Number((fundingWindowIntervalMs / 60000).toFixed(6)),
      estimatedNextFundingSettledAt,
      estimatedEarliestFundingWindowReviewAt,
      estimatedEarliestLiveReadinessReviewAt,
      estimatedEarliestSwitchReviewAt,
      switchReviewGate:
        estimatedEarliestLiveReadinessReviewAt === null
          ? "funding_windows_only_no_live_readiness_report"
          : "funding_windows_and_live_readiness",
      liveReadinessReviewBottleneck,
      liveReadinessReviewDominatesFundingWindowReview,
      liveReadinessGap: Object.keys(challengerReadinessGap).length === 0 ? null : challengerReadinessGap,
      latestFeeStressWindowDeltaToCurrentFocusBps:
        latestFeeStressWindowComparison.deltaToCurrentFocusBps ?? null,
      latestFeeStressFundingWindowAligned,
      currentFocusLatestFundingSettledAt:
        latestFeeStressWindowComparison.currentFocusLatestFundingSettledAt ?? null,
      challengerLatestFundingSettledAt:
        latestFeeStressWindowComparison.bestChallengerLatestFundingSettledAt ?? null,
      latestFeeStressWindowBeatsCurrentFocus:
        latestFeeStressWindowComparison.bestChallengerBeatsCurrentFocus === true,
      latestFeeStressWindowSampleQualityPasses: latestWindowSampleQualityPasses,
      minLatestFeeStressWindowSampleCount:
        latestFeeStressWindowComparison.minSampleCountForRecompare ?? null,
      currentFocusLatestWindowSampleCount:
        latestFeeStressWindowComparison.currentFocusLatestWindowSampleCount ?? null,
      challengerLatestWindowSampleCount:
        latestFeeStressWindowComparison.bestChallengerLatestWindowSampleCount ?? null,
      ...(challengerSpreadControlAvailable
        ? {
            challengerSpreadControlPasses: challengerFeeStressSpreadControl.passed === true,
            challengerSpreadControlRequired,
            challengerSpreadRejectedRate:
              challengerFeeStressSpreadControl.spreadRejectedRate ?? null,
            challengerMaxSpreadRejectionRate:
              challengerFeeStressSpreadControl.maxSpreadRejectionRate ?? null,
            challengerExecutionEligibleRate:
              challengerFeeStressSpreadControl.executionEligibleRate ?? null,
            challengerSpreadFailureTriage,
            challengerSpreadSensitivityTriage,
            challengerLatestSpreadControlWindow:
              challengerLatestSpreadControlWindow === null
                ? null
                : {
                    fundingSettledAt:
                      challengerLatestSpreadControlWindow.fundingSettledAt ?? null,
                    sampleCount: challengerLatestSpreadControlWindow.sampleCount ?? null,
                    spreadRejectedCount:
                      challengerLatestSpreadControlWindow.spreadRejectedCount ?? null,
                    spreadRejectedRate:
                      challengerLatestSpreadControlWindow.spreadRejectedRate ?? null,
                    rejectionReasons:
                      challengerLatestSpreadControlWindow.rejectionReasons ?? null,
                    spreadStats: challengerLatestSpreadControlWindow.spreadStats ?? null,
                  },
          }
        : {}),
      evidenceAction: !latestFeeStressFundingWindowAligned
        ? "collect_synchronized_fee_stressed_funding_window_before_switch_review"
        : !latestWindowSampleQualityPasses
          ? "collect_more_latest_window_samples_before_switch_review"
        : challengerSpreadControlRequired
          ? "collect_spread_quality_and_remaining_fee_stressed_funding_windows_before_switch_review"
          : "collect_remaining_fee_stressed_funding_windows_before_switch_review",
      evidenceCommands: [
        "npm run dry-run:observe-spot-perp-carry-opportunity-72h",
        "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
        ...(challengerLiveReadinessCommand === null ? [] : [challengerLiveReadinessCommand]),
        "npm run dry-run:refresh-live-goal-status",
      ],
      estimateCaveat:
        "Funding-window timing is only one gate; switch review also requires the challenger live-readiness timeline, operational proof, and fresh fee-stressed evidence.",
    },
    recommendedAutonomousAction:
      challengerSpreadFailureTriage !== null &&
      ["severe_latest_window", "persistent_across_windows"].includes(
        stringField(challengerSpreadFailureTriage.spreadFailureSeverity) ?? "",
      )
        ? "triage_spread_failed_challenger_and_continue_broad_opportunity_observation"
        : "prioritize_challenger_funding_evidence_and_refresh_live_goal_status",
  };
}

function addCurrentFocusLiveStartupCaution(
  nextWorkClassification: Record<string, unknown>,
  feeStressFundingWindowTrendView: Record<string, unknown> | null,
  challengerSwitchDecision: Record<string, unknown>,
  replacementCandidateQueue: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const latestFeeStressWindowComparison = recordField(
    challengerSwitchDecision.latestFeeStressWindowComparison,
  );
  const latestChallengerBeatsDeterioratingFocus =
    feeStressFundingWindowTrendView?.latestWindowDeteriorating === true &&
    latestFeeStressWindowComparison.bestChallengerBeatsCurrentFocus === true;
  const recompareRequiredByQualityClearedChallenger =
    challengerSwitchDecision.action === "compare_or_switch_research_focus" &&
    latestFeeStressWindowComparison.action === "recompare_before_next_live_review";
  if (!latestChallengerBeatsDeterioratingFocus && !recompareRequiredByQualityClearedChallenger) {
    return nextWorkClassification;
  }
  const degradationSeverity = stringField(feeStressFundingWindowTrendView?.degradationSeverity);
  const focusDemotionPreparationRequired = [
    "below_live_promotion_threshold",
    "multi_window_degradation",
  ].includes(degradationSeverity ?? "");
  const focusDegradationEvidence = {
    market: challengerSwitchDecision.currentFocusMarket ?? null,
    latestWindow: latestFeeStressWindowComparison.currentFocusLatestWindow ?? null,
    latestVsPreviousMedianNetCarryBps:
      feeStressFundingWindowTrendView?.latestVsPreviousMedianNetCarryBps ?? null,
    latestVsOverallMedianNetCarryBps:
      feeStressFundingWindowTrendView?.latestVsOverallMedianNetCarryBps ?? null,
    consecutiveDeterioratingWindowCount:
      feeStressFundingWindowTrendView?.consecutiveDeterioratingWindowCount ?? null,
    latestVsPeakMedianNetCarryBps:
      feeStressFundingWindowTrendView?.latestVsPeakMedianNetCarryBps ?? null,
    degradationSeverity,
    trendAction: feeStressFundingWindowTrendView?.action ?? null,
    demotionGate: feeStressFundingWindowTrendView?.demotionGate ?? null,
    challengerMarket: challengerSwitchDecision.bestChallengerMarket ?? null,
    latestFeeStressWindowDeltaToCurrentFocusBps:
      latestFeeStressWindowComparison.deltaToCurrentFocusBps ?? null,
    action: focusDemotionPreparationRequired
      ? "prepare_focus_demotion_if_next_window_does_not_recover"
      : "monitor_focus_degradation",
    reviewCommand: "npm run dry-run:refresh-live-goal-status",
    evidenceCommands: [
      "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
      "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
      "npm run dry-run:refresh-live-goal-status",
    ],
    replacementCandidateQueue: replacementCandidateQueue.slice(0, 4).map((candidate) => ({
      market: candidate.market ?? null,
      symbol: candidate.symbol ?? null,
      comparisonCarryBps: candidate.comparisonCarryBps ?? null,
      feeStressCompletedFundingWindowCount:
        candidate.feeStressCompletedFundingWindowCount ?? null,
      priorityBlocker: candidate.priorityBlocker ?? null,
      action: candidate.action ?? null,
    })),
    interpretation:
      "Current focus degradation is a demotion/switch diagnostic only; it blocks live preparation but does not authorize switching to a spread-failed challenger.",
  };

  return {
    ...nextWorkClassification,
    canStartLiveWithoutOperatorInput: false,
    recommendedLiveAction: "keep_current_focus_live_startup_blocked_until_recompare_clears",
    recommendedAutonomousAction: focusDemotionPreparationRequired
      ? "prepare_current_focus_demotion_if_next_window_does_not_recover_and_continue_broad_opportunity_observation"
      : nextWorkClassification.recommendedAutonomousAction,
    focusEvidencePriority: focusDemotionPreparationRequired
      ? "current_focus_multi_window_degradation"
      : "current_focus_latest_window_degradation",
    currentFocusDegradationEvidence: focusDegradationEvidence,
    currentFocusLiveStartupCaution: {
      currentFocusMarket: challengerSwitchDecision.currentFocusMarket ?? null,
      currentFocusLatestWindow: latestFeeStressWindowComparison.currentFocusLatestWindow ?? null,
      latestVsPreviousMedianNetCarryBps:
        feeStressFundingWindowTrendView?.latestVsPreviousMedianNetCarryBps ?? null,
      latestVsOverallMedianNetCarryBps:
        feeStressFundingWindowTrendView?.latestVsOverallMedianNetCarryBps ?? null,
      latestWindowDeteriorating: feeStressFundingWindowTrendView?.latestWindowDeteriorating === true,
      consecutiveDeterioratingWindowCount:
        feeStressFundingWindowTrendView?.consecutiveDeterioratingWindowCount ?? null,
      latestVsPeakMedianNetCarryBps:
        feeStressFundingWindowTrendView?.latestVsPeakMedianNetCarryBps ?? null,
      degradationSeverity: feeStressFundingWindowTrendView?.degradationSeverity ?? null,
      trendAction: feeStressFundingWindowTrendView?.action ?? null,
      demotionGate: feeStressFundingWindowTrendView?.demotionGate ?? null,
      challengerMarket: challengerSwitchDecision.bestChallengerMarket ?? null,
      challengerLatestWindow: latestFeeStressWindowComparison.bestChallengerLatestWindow ?? null,
      latestFeeStressWindowDeltaToCurrentFocusBps:
        latestFeeStressWindowComparison.deltaToCurrentFocusBps ?? null,
      latestFeeStressWindowSampleQualityPasses:
        latestFeeStressWindowComparison.sampleQualityPasses === true,
      minLatestFeeStressWindowSampleCount:
        latestFeeStressWindowComparison.minSampleCountForRecompare ?? null,
      currentFocusLatestWindowSampleCount:
        latestFeeStressWindowComparison.currentFocusLatestWindowSampleCount ?? null,
      challengerLatestWindowSampleCount:
        latestFeeStressWindowComparison.bestChallengerLatestWindowSampleCount ?? null,
      action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
      reason:
        recompareRequiredByQualityClearedChallenger
          ? "A quality-cleared challenger beat the current focus in the latest aligned fee-stressed funding window; recompare or switch before preparing live startup."
          : latestFeeStressWindowComparison.sampleQualityPasses === true
          ? "Current focus is deteriorating in the latest fee-stressed funding window while the priority challenger beat it in that same window."
          : "Current focus is deteriorating and a challenger beat it in the latest fee-stressed funding window, but latest-window samples are still too thin for a switch review.",
    },
  };
}

function summarizeLiveStartupPlan(
  liveStartupPlan: LiveGoalStatus["liveStartupPlan"],
  currentFocusLiveStartupCaution: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!liveStartupPlan) return null;

  const currentFocusStartupBlocked = Object.keys(currentFocusLiveStartupCaution).length > 0;
  const blockedCommands = liveStartupBlockedCommands(liveStartupPlan);
  const startupPlan = {
    status: currentFocusStartupBlocked
      ? "blocked_current_focus_recompare_required"
      : liveStartupPlan.status ?? null,
    gateCommand: liveStartupPlan.gateCommand ?? null,
    reviewCommand: currentFocusStartupBlocked ? null : liveStartupPlan.reviewCommand ?? null,
    pm2StartCommand: currentFocusStartupBlocked ? null : liveStartupPlan.pm2StartCommand ?? null,
    orderSubmissionDefault: liveStartupPlan.orderSubmissionDefault ?? null,
    requiredEnvForLiveValidation: liveStartupPlan.requiredEnvForLiveValidation ?? [],
    requiredEnvForOrderSubmission: liveStartupPlan.requiredEnvForOrderSubmission ?? [],
    hardStops: currentFocusStartupBlocked
      ? uniqueStrings([
          ...(liveStartupPlan.hardStops ?? []),
          RECOMPARE_BLOCKED_COMMAND_HARD_STOP,
        ])
      : liveStartupPlan.hardStops ?? [],
  };

  if (!currentFocusStartupBlocked) return startupPlan;

  return {
    ...startupPlan,
    blockedReason:
      stringField(currentFocusLiveStartupCaution.reason) ??
      "current_focus_requires_fee_stressed_challenger_recompare",
    blockedCommands,
    currentFocusLiveStartupCaution,
  };
}

function liveStartupBlockedCommands(
  liveStartupPlan: LiveGoalStatus["liveStartupPlan"],
): {
  reviewCommand: string | null;
  pm2StartCommand: string | null;
  manualValidationCommand?: string | null;
} {
  const manualValidationCommand =
    liveStartupPlan?.blockedCommands?.manualValidationCommand ??
    liveStartupPlan?.manualValidationCommand ??
    null;
  const blockedCommands = {
    reviewCommand:
      liveStartupPlan?.blockedCommands?.reviewCommand ??
      liveStartupPlan?.reviewCommand ??
      null,
    pm2StartCommand:
      liveStartupPlan?.blockedCommands?.pm2StartCommand ??
      liveStartupPlan?.pm2StartCommand ??
      null,
  };
  return manualValidationCommand === null
    ? blockedCommands
    : { ...blockedCommands, manualValidationCommand };
}

function effectiveCurrentFocusLiveStartupCaution(
  rawCaution: Record<string, unknown>,
  strategyResearchHandoff: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(rawCaution).length > 0) return rawCaution;
  if (strategyResearchHandoff.status !== "research_focus_recompare_required") return {};

  const latestComparison = recordField(strategyResearchHandoff.latestFeeStressWindowComparison);
  return {
    currentFocusMarket: strategyResearchHandoff.currentFocusMarket ?? null,
    currentFocusLatestWindow: latestComparison.currentFocusLatestWindow ?? null,
    challengerMarket: strategyResearchHandoff.bestChallengerMarket ?? null,
    challengerLatestWindow: latestComparison.bestChallengerLatestWindow ?? null,
    latestFeeStressWindowDeltaToCurrentFocusBps:
      latestComparison.deltaToCurrentFocusBps ?? null,
    latestFeeStressWindowAligned:
      latestComparison.fundingWindowAligned === true,
    latestFeeStressWindowSampleQualityPasses:
      latestComparison.sampleQualityPasses === true,
    minLatestFeeStressWindowSampleCount:
      latestComparison.minSampleCountForRecompare ?? null,
    currentFocusLatestWindowSampleCount:
      latestComparison.currentFocusLatestWindowSampleCount ?? null,
    challengerLatestWindowSampleCount:
      latestComparison.bestChallengerLatestWindowSampleCount ?? null,
    requiredBeforeFocusSwitch:
      strategyResearchHandoff.requiredBeforeFocusSwitch ?? [],
    action: "do_not_prepare_current_focus_live_startup_until_recompare_clears",
    reason:
      stringField(latestComparison.action) === "collect_synchronized_latest_window_samples_before_recompare"
        ? "A challenger remains ahead on fee-stressed evidence, but the latest funding windows are not synchronized; collect synchronized samples before preparing live startup."
        : stringField(latestComparison.action) === "collect_latest_window_samples_before_recompare"
          ? "A challenger remains ahead on fee-stressed evidence, but latest-window sample quality is too thin; collect more samples before preparing live startup."
          : stringField(strategyResearchHandoff.reason) ??
            "Research focus recompare is required before preparing live startup.",
  };
}

function summarizeCarryMarketDecisionMatrix(
  matrix: Array<Record<string, unknown>> | undefined,
  selectedMarket: string | null,
  fallbackMarket: string | null,
): Array<Record<string, unknown>> {
  if (!matrix) return [];

  const selectedMarkets = new Set([selectedMarket, fallbackMarket].filter((market): market is string => market !== null));
  const selectedRows = matrix.filter((row) => selectedMarkets.has(stringField(row.market) ?? "")).slice(0, 6);
  const rejectedRows = matrix
    .filter((row) => {
      const decision = stringField(row.decision) ?? "";
      return decision.includes("reject") || decision.includes("demote");
    })
    .slice(0, 6);

  const rowsByKey = new Map<string, Record<string, unknown>>();
  for (const row of [...selectedRows, ...rejectedRows]) {
    const key = `${stringField(row.sourcePath) ?? "unknown"}:${stringField(row.market) ?? "unknown"}:${
      stringField(row.decision) ?? "unknown"
    }`;
    if (!rowsByKey.has(key)) rowsByKey.set(key, row);
  }

  return [...rowsByKey.values()].slice(0, 12).map((row) => ({
    sourcePath: row.sourcePath ?? null,
    market: row.market ?? null,
    symbol: row.symbol ?? null,
    status: row.status ?? null,
    decision: row.decision ?? null,
    nextDecisionTrigger: row.nextDecisionTrigger ?? null,
    reasons: row.reasons ?? [],
    requiredBeforeMetricCandidate: row.requiredBeforeMetricCandidate ?? [],
    feeStressEvidence: row.feeStressEvidence ?? null,
    metrics: row.metrics ?? null,
  }));
}

function summarizeChallengerCarryMarkets(
  matrix: Array<Record<string, unknown>> | undefined,
  selectedMarket: string | null,
  fallbackMarket: string | null,
): Array<Record<string, unknown>> {
  if (!matrix) return [];

  const excludedMarkets = new Set([selectedMarket, fallbackMarket].filter((market): market is string => market !== null));
  const rejectedOrDemotedMarkets = new Set<string>();
  const rowsByMarket = new Map<string, Record<string, unknown>>();

  function rowMetrics(row: Record<string, unknown>): Record<string, unknown> {
    return recordField(row.metrics);
  }

  function isOpportunityRow(row: Record<string, unknown>): boolean {
    return (stringField(row.sourcePath) ?? "").includes("spot-perp-carry-opportunity");
  }

  function shouldReplaceChallengerRow(
    next: Record<string, unknown>,
    current: Record<string, unknown> | undefined,
  ): boolean {
    if (current === undefined) return true;

    const nextIsOpportunity = isOpportunityRow(next);
    const currentIsOpportunity = isOpportunityRow(current);
    if (nextIsOpportunity !== currentIsOpportunity) return nextIsOpportunity;

    const nextMetrics = rowMetrics(next);
    const currentMetrics = rowMetrics(current);
    const nextFundingCount = numericField(nextMetrics.completedFundingCount) ?? 0;
    const currentFundingCount = numericField(currentMetrics.completedFundingCount) ?? 0;
    if (nextFundingCount !== currentFundingCount) return nextFundingCount > currentFundingCount;

    const nextCount = numericField(nextMetrics.count) ?? 0;
    const currentCount = numericField(currentMetrics.count) ?? 0;
    if (nextCount !== currentCount) return nextCount > currentCount;

    const nextCarryBps =
      comparisonCarryBps(nextMetrics, recordField(next.feeStressEvidence)) ?? Number.NEGATIVE_INFINITY;
    const currentCarryBps =
      comparisonCarryBps(currentMetrics, recordField(current.feeStressEvidence)) ?? Number.NEGATIVE_INFINITY;
    return nextCarryBps > currentCarryBps;
  }

  for (const row of matrix) {
    const market = stringField(row.market);
    if (market === null || excludedMarkets.has(market)) continue;

    const decision = stringField(row.decision) ?? "";
    if (decision.includes("reject") || decision.includes("demote")) rejectedOrDemotedMarkets.add(market);
  }

  for (const row of matrix) {
    const market = stringField(row.market);
    if (market === null || excludedMarkets.has(market) || rejectedOrDemotedMarkets.has(market)) continue;

    const metrics = row.metrics && typeof row.metrics === "object" ? (row.metrics as Record<string, unknown>) : {};
    const carryBps = comparisonCarryBps(metrics, recordField(row.feeStressEvidence));
    if (carryBps === null) continue;

    const current = rowsByMarket.get(market);
    if (shouldReplaceChallengerRow(row, current)) rowsByMarket.set(market, row);
  }

  return [...rowsByMarket.values()]
    .sort((left, right) => {
      const leftMetrics = recordField(left.metrics);
      const rightMetrics = recordField(right.metrics);
      const leftComparisonCarryBps =
        comparisonCarryBps(leftMetrics, recordField(left.feeStressEvidence)) ?? Number.NEGATIVE_INFINITY;
      const rightComparisonCarryBps =
        comparisonCarryBps(rightMetrics, recordField(right.feeStressEvidence)) ?? Number.NEGATIVE_INFINITY;
      return rightComparisonCarryBps - leftComparisonCarryBps;
    })
    .slice(0, 6)
    .map((row) => {
      const metrics = recordField(row.metrics);
      const feeStressEvidence = recordField(row.feeStressEvidence);
      const quality = challengerQualitySummary(metrics, feeStressEvidence);
      const fundingWindowMedianNetCarryBps = fundingWindowMedianCarryBpsFromMetrics(metrics);
      const feeStressFundingWindowMedianNetCarryBps = fundingWindowMedianCarryBpsFromSummary(
        recordField(feeStressEvidence.fundingWindowSummary),
      );
      const feeStressCompletedFundingWindowCountValue =
        feeStressCompletedFundingWindowCount(feeStressEvidence);
      return {
        sourcePath: row.sourcePath ?? null,
        market: row.market ?? null,
        symbol: row.symbol ?? null,
        status: row.status ?? null,
        decision: row.decision ?? null,
        nextDecisionTrigger: row.nextDecisionTrigger ?? null,
        reasons: row.reasons ?? [],
        requiredBeforeMetricCandidate: row.requiredBeforeMetricCandidate ?? [],
        feeStressEvidence: row.feeStressEvidence ?? null,
        metrics: row.metrics ?? null,
        comparisonCarryBps: comparisonCarryBps(metrics, feeStressEvidence),
        comparisonCarrySource: comparisonCarrySource(metrics, feeStressEvidence),
        fundingWindowMedianNetCarryBps,
        feeStressFundingWindowMedianNetCarryBps,
        feeStressCompletedFundingWindowCount: feeStressCompletedFundingWindowCountValue,
        requiredFundingWindowCountForSwitch: REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH,
        ...quality,
        hasEnoughFundingWindows:
          (feeStressCompletedFundingWindowCountValue ?? 0) >=
          REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH,
      };
    });
}

function summarizeSpreadCleanEmergingChallengers(
  matrix: Array<Record<string, unknown>> | undefined,
  selectedMarket: string | null,
  fallbackMarket: string | null,
): Array<Record<string, unknown>> {
  if (!matrix) return [];

  const excludedMarkets = new Set([selectedMarket, fallbackMarket].filter((market): market is string => market !== null));
  const rowsByMarket = new Map<string, Record<string, unknown>>();

  function isOpportunityRow(row: Record<string, unknown>): boolean {
    return (stringField(row.sourcePath) ?? "").includes("spot-perp-carry-opportunity");
  }

  function isRejectedOrDemotedRow(row: Record<string, unknown>): boolean {
    const decision = stringField(row.decision) ?? "";
    return decision.includes("reject") || decision.includes("demote");
  }

  function requiredBeforeMetricCandidate(row: Record<string, unknown>): string[] {
    return stringArrayField(row.requiredBeforeMetricCandidate);
  }

  function shouldReplaceRow(next: Record<string, unknown>, current: Record<string, unknown> | undefined): boolean {
    if (current === undefined) return true;

    const nextIsOpportunity = isOpportunityRow(next);
    const currentIsOpportunity = isOpportunityRow(current);
    if (nextIsOpportunity !== currentIsOpportunity) return nextIsOpportunity;

    const nextMetrics = recordField(next.metrics);
    const currentMetrics = recordField(current.metrics);
    const nextFeeStress = recordField(next.feeStressEvidence);
    const currentFeeStress = recordField(current.feeStressEvidence);
    const nextComparisonCarryBps = comparisonCarryBps(nextMetrics, nextFeeStress) ?? Number.NEGATIVE_INFINITY;
    const currentComparisonCarryBps =
      comparisonCarryBps(currentMetrics, currentFeeStress) ?? Number.NEGATIVE_INFINITY;
    if (nextComparisonCarryBps !== currentComparisonCarryBps) {
      return nextComparisonCarryBps > currentComparisonCarryBps;
    }

    const nextFundingCount = numericField(nextMetrics.completedFundingCount) ?? 0;
    const currentFundingCount = numericField(currentMetrics.completedFundingCount) ?? 0;
    return nextFundingCount > currentFundingCount;
  }

  for (const row of matrix) {
    const market = stringField(row.market);
    if (market === null || excludedMarkets.has(market) || isRejectedOrDemotedRow(row)) continue;
    if (!isOpportunityRow(row)) continue;

    const requiredBefore = requiredBeforeMetricCandidate(row);
    if (requiredBefore.includes("spreadControl")) continue;

    const metrics = recordField(row.metrics);
    const feeStressEvidence = recordField(row.feeStressEvidence);
    const quality = challengerQualitySummary(metrics, feeStressEvidence);
    const knownQualityFailureReasons = quality.knownQualityFailureReasons as string[];
    if (
      knownQualityFailureReasons.includes("executionEligibleRateBelowSwitchThreshold") ||
      knownQualityFailureReasons.includes("depthCoverageBelowSwitchThreshold") ||
      knownQualityFailureReasons.includes("feeStressFailed")
    ) {
      continue;
    }

    const carryBps = comparisonCarryBps(metrics, feeStressEvidence);
    if (carryBps === null || carryBps < LIVE_PROMOTION_MIN_NET_CARRY_BPS) continue;

    const feeStressCompletedFundingWindowCountValue =
      feeStressCompletedFundingWindowCount(feeStressEvidence);
    if (
      (feeStressCompletedFundingWindowCountValue ?? numericField(metrics.completedFundingCount) ?? 0) >=
      REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH
    ) {
      continue;
    }

    const current = rowsByMarket.get(market);
    if (shouldReplaceRow(row, current)) rowsByMarket.set(market, row);
  }

  return [...rowsByMarket.values()]
    .map((row) => {
      const metrics = recordField(row.metrics);
      const feeStressEvidence = recordField(row.feeStressEvidence);
      const quality = challengerQualitySummary(metrics, feeStressEvidence);
      const feeStressCompletedFundingWindowCountValue =
        feeStressCompletedFundingWindowCount(feeStressEvidence);
      const completedFundingWindowCount =
        feeStressCompletedFundingWindowCountValue ?? numericField(metrics.completedFundingCount);
      const remainingFundingWindowCount =
        completedFundingWindowCount === null
          ? null
          : Math.max(0, REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH - completedFundingWindowCount);
      return {
        sourcePath: row.sourcePath ?? null,
        market: row.market ?? null,
        symbol: row.symbol ?? null,
        status: row.status ?? null,
        decision: row.decision ?? null,
        nextDecisionTrigger: row.nextDecisionTrigger ?? null,
        requiredBeforeMetricCandidate: row.requiredBeforeMetricCandidate ?? [],
        comparisonCarryBps: comparisonCarryBps(metrics, feeStressEvidence),
        comparisonCarrySource: comparisonCarrySource(metrics, feeStressEvidence),
        fundingWindowMedianNetCarryBps: fundingWindowMedianCarryBpsFromMetrics(metrics),
        feeStressFundingWindowMedianNetCarryBps: fundingWindowMedianCarryBpsFromSummary(
          recordField(feeStressEvidence.fundingWindowSummary),
        ),
        completedFundingWindowCount,
        requiredFundingWindowCountForSwitch: REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH,
        remainingFundingWindowCount,
        executionEligibleRate: quality.executionEligibleRate,
        qualityStatus: quality.qualityStatus,
        qualityPasses: quality.qualityPasses,
        knownQualityFailureReasons: quality.knownQualityFailureReasons,
        evidenceAction:
          remainingFundingWindowCount === null || remainingFundingWindowCount > 0
            ? "continue_spread_clean_opportunity_observation"
            : "review_as_quality_cleared_challenger",
        livePromotionCaveat:
          "Spread-clean emerging candidates are research targets only until funding-window, live-readiness, operational-proof, and fee gates pass.",
      };
    })
    .sort((left, right) => {
      const carryDelta =
        (numericField(right.comparisonCarryBps) ?? Number.NEGATIVE_INFINITY) -
        (numericField(left.comparisonCarryBps) ?? Number.NEGATIVE_INFINITY);
      if (carryDelta !== 0) return carryDelta;
      return (
        (numericField(right.completedFundingWindowCount) ?? 0) -
        (numericField(left.completedFundingWindowCount) ?? 0)
      );
    })
    .slice(0, 6);
}

function summarizeReplacementCandidateQueue(
  challengerCarryMarkets: Array<Record<string, unknown>>,
  carryLiveReadinessReports: unknown,
): Array<Record<string, unknown>> {
  return challengerCarryMarkets.slice(0, 8).map((challenger) => {
    const market = stringField(challenger.market);
    const symbol = stringField(challenger.symbol);
    const readinessReport = carryReadinessReportForMarket(
      carryLiveReadinessReports,
      market,
      symbol,
    );
    const spreadTriage = spreadFailureTriage(feeStressSpreadControlFromReadiness(readinessReport));
    const knownQualityFailureReasons = stringArrayField(challenger.knownQualityFailureReasons);
    const requiredBeforeMetricCandidate = stringArrayField(challenger.requiredBeforeMetricCandidate);
    const hasEnoughFundingWindows = challenger.hasEnoughFundingWindows === true;
    const qualityPasses = challenger.qualityPasses === true;
    const spreadBlocked =
      spreadTriage !== null && spreadTriage.passed !== true && spreadTriage.required === true;
    const priorityBlocker = knownQualityFailureReasons.length > 0
      ? "quality_gate_blocked"
      : spreadBlocked || requiredBeforeMetricCandidate.includes("spreadControl")
        ? "spread_control_blocked"
        : !hasEnoughFundingWindows
          ? "funding_window_gap"
          : !qualityPasses
            ? "quality_inputs_incomplete"
            : "switch_review_candidate";

    return {
      market,
      symbol,
      decision: challenger.decision ?? null,
      comparisonCarryBps: challenger.comparisonCarryBps ?? null,
      comparisonCarrySource: challenger.comparisonCarrySource ?? null,
      feeStressFundingWindowMedianNetCarryBps:
        challenger.feeStressFundingWindowMedianNetCarryBps ?? null,
      feeStressCompletedFundingWindowCount:
        challenger.feeStressCompletedFundingWindowCount ?? null,
      requiredFundingWindowCountForSwitch:
        challenger.requiredFundingWindowCountForSwitch ?? null,
      hasEnoughFundingWindows,
      qualityStatus: challenger.qualityStatus ?? null,
      qualityPasses,
      knownQualityFailureReasons,
      requiredBeforeMetricCandidate,
      spreadFailureTriage: spreadTriage,
      priorityBlocker,
      action:
        priorityBlocker === "switch_review_candidate"
          ? "review_for_research_focus_switch_after_live_readiness_refresh"
          : priorityBlocker === "spread_control_blocked"
            ? "do_not_switch_until_spread_control_clears"
            : priorityBlocker === "funding_window_gap"
              ? "collect_remaining_fee_stressed_funding_windows"
              : "keep_observation_only_until_blocker_clears",
      livePromotionCaveat:
        "Replacement queue ranks research alternatives only; no candidate can start live until profitability, spread, readiness, operational proof, and gate checks pass.",
    };
  });
}

function summarizeAutonomousChallengerChecks(
  matrix: Array<Record<string, unknown>> | undefined,
  selectedMarket: string | null,
  fallbackMarket: string | null,
  selectedMedianNetCarryBps: number | null,
  selectedComparisonCarryBps: number | null,
): Array<Record<string, unknown>> {
  const excludedMarkets = new Set([selectedMarket, fallbackMarket].filter((market): market is string => market !== null));

  function isOpportunityRow(row: Record<string, unknown>): boolean {
    return (stringField(row.sourcePath) ?? "").includes("spot-perp-carry-opportunity");
  }

  function isRejectedOrDemotedRow(row: Record<string, unknown>): boolean {
    const decision = stringField(row.decision) ?? "";
    return decision.includes("reject") || decision.includes("demote");
  }

  function bestRowForMarket(market: string): Record<string, unknown> | null {
    if (!matrix) return null;
    return (
      matrix
        .filter((row) => stringField(row.market) === market)
        .sort((left, right) => {
          const leftIsRejected = isRejectedOrDemotedRow(left) ? 1 : 0;
          const rightIsRejected = isRejectedOrDemotedRow(right) ? 1 : 0;
          if (leftIsRejected !== rightIsRejected) return rightIsRejected - leftIsRejected;

          const leftMetrics = recordField(left.metrics);
          const rightMetrics = recordField(right.metrics);
          const fundingDelta =
            (numericField(rightMetrics.completedFundingCount) ?? 0) -
            (numericField(leftMetrics.completedFundingCount) ?? 0);
          if (fundingDelta !== 0) return fundingDelta;

          const countDelta = (numericField(rightMetrics.count) ?? 0) - (numericField(leftMetrics.count) ?? 0);
          if (countDelta !== 0) return countDelta;

          const leftIsOpportunity = isOpportunityRow(left) ? 1 : 0;
          const rightIsOpportunity = isOpportunityRow(right) ? 1 : 0;
          if (leftIsOpportunity !== rightIsOpportunity) return rightIsOpportunity - leftIsOpportunity;

          return (
            (numericField(rightMetrics.executionEligibleMedianNetCarryBps) ?? Number.NEGATIVE_INFINITY) -
            (numericField(leftMetrics.executionEligibleMedianNetCarryBps) ?? Number.NEGATIVE_INFINITY)
          );
        })[0] ?? null
    );
  }

  return AUTONOMOUS_CHALLENGER_CHECK_MARKETS.map((market) => {
    if (excludedMarkets.has(market)) {
      return {
        market,
        evaluationStatus: "already_selected_or_fallback",
        reason: "tracked_challenger_is_current_focus_or_fallback",
      };
    }

    const row = bestRowForMarket(market);
    if (row === null) {
      return {
        market,
        evaluationStatus: "not_observed",
        requiredAction: "add_to_spot_perp_carry_opportunity_72h_observer",
      };
    }

    const metrics = recordField(row.metrics);
    const feeStressEvidence = recordField(row.feeStressEvidence);
    const quality = challengerQualitySummary(metrics, feeStressEvidence);
    const medianNetCarryBps = numericField(metrics.executionEligibleMedianNetCarryBps);
    const feeStressMedianNetCarryBps = numericField(feeStressEvidence.executionEligibleMedianNetCarryBps);
    const fundingWindowMedianNetCarryBps = fundingWindowMedianCarryBpsFromMetrics(metrics);
    const feeStressFundingWindowMedianNetCarryBps = fundingWindowMedianCarryBpsFromSummary(
      recordField(feeStressEvidence.fundingWindowSummary),
    );
    const feeStressCompletedFundingWindowCountValue =
      feeStressCompletedFundingWindowCount(feeStressEvidence);
    const rowComparisonCarryBps = comparisonCarryBps(metrics, feeStressEvidence);
    const rowComparisonCarrySource = comparisonCarrySource(metrics, feeStressEvidence);
    const hasEnoughFundingWindows =
      (feeStressCompletedFundingWindowCountValue ?? 0) >=
      REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH;
    const deltaToCurrentFocusBps =
      medianNetCarryBps !== null && selectedMedianNetCarryBps !== null
        ? medianNetCarryBps - selectedMedianNetCarryBps
        : null;
    const deltaToCurrentFocusComparisonBps =
      rowComparisonCarryBps !== null && selectedComparisonCarryBps !== null
        ? rowComparisonCarryBps - selectedComparisonCarryBps
        : null;
    const beatsCurrentFocus =
      deltaToCurrentFocusComparisonBps !== null && deltaToCurrentFocusComparisonBps > 0;
    const decision = stringField(row.decision) ?? "";
    const decisionRejected = decision.includes("reject") || decision.includes("demote");
    const feeStressFailed = feeStressEvidence.failed === true;
    const evaluationReasons = [
      medianNetCarryBps !== null && medianNetCarryBps < LIVE_PROMOTION_MIN_NET_CARRY_BPS
        ? "medianNetCarryBelowSwitchThreshold"
        : null,
      feeStressMedianNetCarryBps !== null && feeStressMedianNetCarryBps < 10
        ? "feeStressCarryBelowSwitchThreshold"
        : null,
      ...(quality.knownQualityFailureReasons as string[]),
      !hasEnoughFundingWindows ? "insufficientFeeStressFundingWindowsForSwitch" : null,
      !beatsCurrentFocus ? "doesNotBeatCurrentFocus" : null,
      decisionRejected ? "decisionRejectedOrDemoted" : null,
      feeStressFailed ? "feeStressFailed" : null,
    ].filter((reason, index, reasons): reason is string => reason !== null && reasons.indexOf(reason) === index);

    return {
      sourcePath: row.sourcePath ?? null,
      market: row.market ?? null,
      symbol: row.symbol ?? null,
      status: row.status ?? null,
      decision: row.decision ?? null,
      nextDecisionTrigger: row.nextDecisionTrigger ?? null,
      reasons: row.reasons ?? [],
      requiredBeforeMetricCandidate: row.requiredBeforeMetricCandidate ?? [],
      metrics: row.metrics ?? null,
      feeStressEvidence: row.feeStressEvidence ?? null,
      medianNetCarryBps,
      feeStressMedianNetCarryBps,
      fundingWindowMedianNetCarryBps,
      feeStressFundingWindowMedianNetCarryBps,
      comparisonCarryBps: rowComparisonCarryBps,
      comparisonCarrySource: rowComparisonCarrySource,
      deltaToCurrentFocusBps,
      deltaToCurrentFocusComparisonBps,
      beatsCurrentFocus,
      feeStressCompletedFundingWindowCount: feeStressCompletedFundingWindowCountValue,
      requiredFundingWindowCountForSwitch: REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH,
      hasEnoughFundingWindows,
      ...quality,
      evaluationStatus:
        decisionRejected || feeStressFailed || evaluationReasons.length > 0
          ? "do_not_switch"
          : beatsCurrentFocus
            ? "switch_candidate_needs_review"
            : "observe_only",
      evaluationReasons,
    };
  });
}

function buildChallengerSwitchDecision(
  challengers: Array<Record<string, unknown>>,
  selectedMarket: string | null,
  selectedMedianNetCarryBps: number | null,
  selectedComparisonCarryBps: number | null,
  currentFocusFeeStressFundingWindowCarryView: Record<string, unknown> | null,
): Record<string, unknown> {
  const currentFocusLatestFeeStressWindow = latestFundingWindowSnapshot(
    currentFocusFeeStressFundingWindowCarryView ?? {},
  );

  function challengerSnapshot(challenger: Record<string, unknown> | null): Record<string, unknown> {
    const metrics = recordField(challenger?.metrics);
    const medianNetCarryBps = numericField(metrics.executionEligibleMedianNetCarryBps);
    const challengerComparisonCarryBps = numericField(challenger?.comparisonCarryBps);
    const feeStressEvidence = recordField(challenger?.feeStressEvidence);
    const latestFeeStressFundingWindow = latestFundingWindowSnapshot(
      recordField(feeStressEvidence.fundingWindowSummary),
    );
    const feeStressCompletedFundingWindowCountValue =
      feeStressCompletedFundingWindowCount(feeStressEvidence);
    const quality = challengerQualitySummary(metrics, feeStressEvidence);

    return {
      market: challenger?.market ?? null,
      symbol: challenger?.symbol ?? null,
      sourcePath: challenger?.sourcePath ?? null,
      decision: challenger?.decision ?? null,
      nextDecisionTrigger: challenger?.nextDecisionTrigger ?? null,
      reasons: challenger?.reasons ?? [],
      requiredBeforeMetricCandidate: challenger?.requiredBeforeMetricCandidate ?? [],
      metrics: challenger?.metrics ?? null,
      feeStressEvidence: challenger?.feeStressEvidence ?? null,
      medianNetCarryBps,
      comparisonCarryBps: challengerComparisonCarryBps,
      comparisonCarrySource: challenger?.comparisonCarrySource ?? null,
      fundingWindowMedianNetCarryBps: challenger?.fundingWindowMedianNetCarryBps ?? null,
      feeStressFundingWindowMedianNetCarryBps:
        challenger?.feeStressFundingWindowMedianNetCarryBps ?? null,
      latestFeeStressFundingWindow,
      completedFundingCount: numericField(metrics.completedFundingCount),
      feeStressCompletedFundingWindowCount: feeStressCompletedFundingWindowCountValue,
      requiredFundingWindowCountForSwitch: REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH,
      ...quality,
      hasEnoughFundingWindows:
        (feeStressCompletedFundingWindowCountValue ?? 0) >=
        REQUIRED_FEE_STRESS_FUNDING_WINDOWS_FOR_SWITCH,
      deltaToCurrentFocusBps:
        medianNetCarryBps !== null && selectedMedianNetCarryBps !== null
          ? medianNetCarryBps - selectedMedianNetCarryBps
          : null,
      deltaToCurrentFocusComparisonBps:
        challengerComparisonCarryBps !== null && selectedComparisonCarryBps !== null
          ? challengerComparisonCarryBps - selectedComparisonCarryBps
          : null,
    };
  }

  const bestOverallChallenger = challengers[0] ?? null;
  const bestQualityClearedChallenger =
    challengers.find((challenger) => {
      const snapshot = challengerSnapshot(challenger);
      return (
        (snapshot.knownQualityFailureReasons as string[]).length === 0 &&
        snapshot.qualityPasses === true
      );
    }) ?? null;
  const bestChallenger = bestQualityClearedChallenger ?? bestOverallChallenger;
  const bestSnapshot = challengerSnapshot(bestChallenger);
  const bestOverallSnapshot = challengerSnapshot(bestOverallChallenger);
  const bestQualityClearedSnapshot = challengerSnapshot(bestQualityClearedChallenger);
  const bestChallengerSelectionScope =
    bestQualityClearedChallenger !== null
      ? "best_quality_cleared_challenger"
      : bestOverallChallenger !== null
        ? "best_overall_challenger_no_quality_cleared"
        : "none";
  const challengerHasEnoughFundingWindows = bestSnapshot.hasEnoughFundingWindows === true;
  const challengerQualityPasses = bestSnapshot.qualityPasses === true;
  const challengerKnownQualityFailureReasons = bestSnapshot.knownQualityFailureReasons as string[];
  const deltaToCurrentFocusBps = numericField(bestSnapshot.deltaToCurrentFocusBps);
  const deltaToCurrentFocusComparisonBps = numericField(bestSnapshot.deltaToCurrentFocusComparisonBps);
  const challengerBeatsCurrentFocus =
    deltaToCurrentFocusComparisonBps !== null && deltaToCurrentFocusComparisonBps > 0;
  const currentFocusLatestFeeStressCarryBps = numericField(
    currentFocusLatestFeeStressWindow?.medianNetCarryBps,
  );
  const bestChallengerLatestFeeStressWindow = recordField(bestSnapshot.latestFeeStressFundingWindow);
  const bestChallengerLatestFeeStressCarryBps = numericField(
    bestChallengerLatestFeeStressWindow.medianNetCarryBps,
  );
  const currentFocusLatestFeeStressWindowSampleCount =
    numericField(currentFocusLatestFeeStressWindow?.sampleCount);
  const bestChallengerLatestFeeStressWindowSampleCount =
    numericField(bestChallengerLatestFeeStressWindow.sampleCount);
  const currentFocusLatestFundingSettledAt = stringField(
    currentFocusLatestFeeStressWindow?.fundingSettledAt,
  );
  const bestChallengerLatestFundingSettledAt = stringField(
    bestChallengerLatestFeeStressWindow.fundingSettledAt,
  );
  const latestFeeStressFundingWindowAligned =
    currentFocusLatestFundingSettledAt !== null &&
    bestChallengerLatestFundingSettledAt !== null &&
    currentFocusLatestFundingSettledAt === bestChallengerLatestFundingSettledAt;
  const latestFeeStressWindowSampleQualityPasses =
    currentFocusLatestFeeStressWindowSampleCount !== null &&
    bestChallengerLatestFeeStressWindowSampleCount !== null &&
    currentFocusLatestFeeStressWindowSampleCount >=
      MIN_LATEST_FEE_STRESS_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE &&
    bestChallengerLatestFeeStressWindowSampleCount >=
      MIN_LATEST_FEE_STRESS_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE;
  const latestFeeStressWindowDeltaToCurrentFocusBps =
    latestFeeStressFundingWindowAligned &&
    bestChallengerLatestFeeStressCarryBps !== null && currentFocusLatestFeeStressCarryBps !== null
      ? bestChallengerLatestFeeStressCarryBps - currentFocusLatestFeeStressCarryBps
      : null;
  const bestChallengerBeatsCurrentFocusLatestFeeStressWindow =
    latestFeeStressWindowDeltaToCurrentFocusBps !== null &&
    latestFeeStressWindowDeltaToCurrentFocusBps > 0;
  const bestOverallChallengerBeatsCurrentFocus =
    numericField(bestOverallSnapshot.deltaToCurrentFocusComparisonBps) !== null &&
    (numericField(bestOverallSnapshot.deltaToCurrentFocusComparisonBps) as number) > 0;
  const bestQualityClearedChallengerBeatsCurrentFocus =
    numericField(bestQualityClearedSnapshot.deltaToCurrentFocusComparisonBps) !== null &&
    (numericField(bestQualityClearedSnapshot.deltaToCurrentFocusComparisonBps) as number) > 0;

  let action = "continue_current_focus";
  let reason =
    bestQualityClearedChallenger !== null
      ? "no_quality_cleared_challenger_beats_current_focus"
      : "no_challenger_beats_current_focus";
  if (bestChallenger === null) {
    reason = "no_challenger_markets";
  } else if (challengerKnownQualityFailureReasons.length > 0) {
    action = "keep_challenger_observation_only";
    reason = "best_challenger_quality_gates_not_clear";
  } else if (!challengerHasEnoughFundingWindows) {
    action = "collect_challenger_funding_evidence";
    reason = "best_challenger_needs_more_completed_funding_events";
  } else if (!challengerQualityPasses) {
    action = "keep_challenger_observation_only";
    reason = "best_challenger_quality_gates_not_clear";
  } else if (challengerBeatsCurrentFocus && bestChallengerBeatsCurrentFocusLatestFeeStressWindow) {
    action = "compare_or_switch_research_focus";
    reason = "best_challenger_beats_current_focus_after_basic_quality_gates";
  } else if (challengerBeatsCurrentFocus) {
    action = "keep_challenger_observation_only";
    reason = latestFeeStressFundingWindowAligned
      ? "best_challenger_aggregate_edge_not_confirmed_in_latest_fee_stressed_window"
      : "best_challenger_aggregate_edge_waiting_for_synchronized_latest_fee_stress_window";
  }

  return {
    action,
    reason,
    currentFocusMarket: selectedMarket,
    currentFocusMedianNetCarryBps: selectedMedianNetCarryBps,
    currentFocusComparisonCarryBps: selectedComparisonCarryBps,
    bestChallengerMarket: bestChallenger?.market ?? null,
    bestChallengerMedianNetCarryBps: bestSnapshot.medianNetCarryBps,
    bestChallengerComparisonCarryBps: bestSnapshot.comparisonCarryBps,
    bestChallengerComparisonCarrySource: bestSnapshot.comparisonCarrySource,
    bestChallengerSelectionScope,
    comparisonScope: "quality_cleared_challengers_preferred_over_raw_carry_rank",
    latestFeeStressWindowComparison: {
      currentFocusLatestWindow: currentFocusLatestFeeStressWindow,
      bestChallengerLatestWindow:
        Object.keys(bestChallengerLatestFeeStressWindow).length > 0
          ? bestChallengerLatestFeeStressWindow
          : null,
      deltaToCurrentFocusBps: latestFeeStressWindowDeltaToCurrentFocusBps,
      bestChallengerBeatsCurrentFocus:
        bestChallengerBeatsCurrentFocusLatestFeeStressWindow,
      fundingWindowAligned: latestFeeStressFundingWindowAligned,
      currentFocusLatestFundingSettledAt,
      bestChallengerLatestFundingSettledAt,
      minSampleCountForRecompare: MIN_LATEST_FEE_STRESS_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE,
      currentFocusLatestWindowSampleCount: currentFocusLatestFeeStressWindowSampleCount,
      bestChallengerLatestWindowSampleCount: bestChallengerLatestFeeStressWindowSampleCount,
      sampleQualityPasses: latestFeeStressWindowSampleQualityPasses,
      action:
        !latestFeeStressFundingWindowAligned
          ? "collect_synchronized_latest_window_samples_before_recompare"
          : bestChallengerBeatsCurrentFocusLatestFeeStressWindow &&
        !latestFeeStressWindowSampleQualityPasses
          ? "collect_latest_window_samples_before_recompare"
          : bestChallengerBeatsCurrentFocusLatestFeeStressWindow && !challengerHasEnoughFundingWindows
          ? "collect_challenger_funding_evidence_for_latest_window_advantage"
          : challengerQualityPasses &&
              challengerHasEnoughFundingWindows &&
              bestChallengerBeatsCurrentFocusLatestFeeStressWindow
            ? "recompare_before_next_live_review"
            : "no_latest_window_recompare_signal",
      interpretation:
        "Latest completed fee-stressed funding window comparison is a deterioration/switch diagnostic only; it does not authorize live promotion without the full evidence gates.",
    },
    deltaToCurrentFocusBps,
    deltaToCurrentFocusComparisonBps,
    challengerHasEnoughFundingWindows,
    challengerQualityPasses,
    challengerExecutionEligibleRate: bestSnapshot.executionEligibleRate,
    challengerKnownQualityFailureReasons,
    challengerBeatsCurrentFocus,
    bestOverallChallengerBeatsCurrentFocus,
    bestQualityClearedChallengerBeatsCurrentFocus,
    bestOverallChallenger: bestOverallChallenger ? bestOverallSnapshot : null,
    bestQualityClearedChallenger: bestQualityClearedChallenger
      ? challengerSnapshot(bestQualityClearedChallenger)
      : null,
    bestChallenger: bestChallenger ? bestSnapshot : null,
  };
}

function buildReducedActivityGuardrail(
  carryStrategyComparison: Record<string, unknown> | undefined,
  challengerSwitchDecision: Record<string, unknown>,
  replacementCandidateQueue: Array<Record<string, unknown>>,
  carryMarketDecisionMatrix: Array<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const focusedWatch = recordField(carryStrategyComparison?.focusedWatch);
  const focusedWatchSpreadControl = recordField(focusedWatch.spreadControl);
  const bestChallenger = recordField(challengerSwitchDecision.bestChallenger);
  const bestOverallChallenger = recordField(challengerSwitchDecision.bestOverallChallenger);
  const latestFeeStressWindowComparison = recordField(
    challengerSwitchDecision.latestFeeStressWindowComparison,
  );
  const currentFocusMarket =
    stringField(challengerSwitchDecision.currentFocusMarket) ?? stringField(focusedWatch.market);
  const currentFocusDecisionRow =
    (carryMarketDecisionMatrix ?? []).find((row) => stringField(row.market) === currentFocusMarket) ??
    null;
  const currentFocusDecisionMetrics = recordField(currentFocusDecisionRow?.metrics);

  const currentFocusExecutionEligibleRate =
    numericField(focusedWatch.executionEligibleRate) ??
    numericField(focusedWatchSpreadControl.executionEligibleRate) ??
    executionEligibleRateFromMetrics(currentFocusDecisionMetrics);
  const currentFocusSpreadRejectedRate =
    numericField(focusedWatchSpreadControl.spreadRejectionSignalRate) ??
    numericField(focusedWatchSpreadControl.spreadRejectedRate) ??
    numericField(focusedWatchSpreadControl.executionRejectedRate);
  const bestChallengerExecutionEligibleRate = numericField(bestChallenger.executionEligibleRate);
  const bestOverallChallengerExecutionEligibleRate = numericField(
    bestOverallChallenger.executionEligibleRate,
  );
  const bestOverallChallengerQualityFailures = stringArrayField(
    bestOverallChallenger.knownQualityFailureReasons,
  );
  const currentFocusMarketValue = currentFocusMarket;
  const rawCarryBlockedCandidateRows = (carryMarketDecisionMatrix ?? [])
    .flatMap((row): Array<Record<string, unknown>> => {
      const market = stringField(row.market);
      if (market === null || market === currentFocusMarketValue) return [];
      const metrics = recordField(row.metrics);
      const feeStressEvidence = recordField(row.feeStressEvidence);
      const carryBps = comparisonCarryBps(metrics, feeStressEvidence);
      if (carryBps === null || carryBps < LIVE_PROMOTION_MIN_NET_CARRY_BPS) return [];
      const quality = challengerQualitySummary(metrics, feeStressEvidence);
      const knownQualityFailureReasons = stringArrayField(quality.knownQualityFailureReasons);
      const requiredBeforeMetricCandidate = stringArrayField(row.requiredBeforeMetricCandidate);
      const blockedReasons = uniqueStrings([
        ...knownQualityFailureReasons,
        ...requiredBeforeMetricCandidate.map((requirement) => `requires:${requirement}`),
      ]);
      if (blockedReasons.length === 0) return [];
      return [{
        market,
        symbol: row.symbol ?? null,
        comparisonCarryBps: carryBps,
        comparisonCarrySource: comparisonCarrySource(metrics, feeStressEvidence),
        executionEligibleRate: quality.executionEligibleRate,
        qualityStatus: quality.qualityStatus,
        knownQualityFailureReasons,
        requiredBeforeMetricCandidate,
        blockedReasons,
        sourceRowCount: 1,
        action: "do_not_promote_raw_carry_without_quality_gates",
      }];
    });
  const rawCarryBlockedCandidatesByKey = new Map<string, Record<string, unknown>>();
  for (const candidate of rawCarryBlockedCandidateRows) {
    const key = `${String(candidate.market ?? "")}:${String(candidate.symbol ?? "")}`;
    const existing = rawCarryBlockedCandidatesByKey.get(key);
    if (existing === undefined) {
      rawCarryBlockedCandidatesByKey.set(key, candidate);
      continue;
    }

    const existingCarry = numericField(existing.comparisonCarryBps) ?? Number.NEGATIVE_INFINITY;
    const candidateCarry = numericField(candidate.comparisonCarryBps) ?? Number.NEGATIVE_INFINITY;
    const existingExecutionEligibleRate = numericField(existing.executionEligibleRate);
    const candidateExecutionEligibleRate = numericField(candidate.executionEligibleRate);
    const mergedExecutionEligibleRate =
      existingExecutionEligibleRate === null
        ? candidateExecutionEligibleRate
        : candidateExecutionEligibleRate === null
          ? existingExecutionEligibleRate
          : Math.min(existingExecutionEligibleRate, candidateExecutionEligibleRate);

    rawCarryBlockedCandidatesByKey.set(key, {
      ...existing,
      comparisonCarryBps: Math.max(existingCarry, candidateCarry),
      comparisonCarrySource:
        candidateCarry > existingCarry ? candidate.comparisonCarrySource : existing.comparisonCarrySource,
      executionEligibleRate: mergedExecutionEligibleRate,
      qualityStatus:
        existing.qualityStatus === "quality_blocked" || candidate.qualityStatus === "quality_blocked"
          ? "quality_blocked"
          : existing.qualityStatus ?? candidate.qualityStatus ?? null,
      knownQualityFailureReasons: uniqueStrings([
        ...stringArrayField(existing.knownQualityFailureReasons),
        ...stringArrayField(candidate.knownQualityFailureReasons),
      ]),
      requiredBeforeMetricCandidate: uniqueStrings([
        ...stringArrayField(existing.requiredBeforeMetricCandidate),
        ...stringArrayField(candidate.requiredBeforeMetricCandidate),
      ]),
      blockedReasons: uniqueStrings([
        ...stringArrayField(existing.blockedReasons),
        ...stringArrayField(candidate.blockedReasons),
      ]),
      sourceRowCount:
        (numericField(existing.sourceRowCount) ?? 1) + (numericField(candidate.sourceRowCount) ?? 1),
    });
  }
  const rawCarryBlockedCandidates = [...rawCarryBlockedCandidatesByKey.values()]
    .sort((left, right) => {
      const carryDelta =
        (numericField(right.comparisonCarryBps) ?? Number.NEGATIVE_INFINITY) -
        (numericField(left.comparisonCarryBps) ?? Number.NEGATIVE_INFINITY);
      if (carryDelta !== 0) return carryDelta;
      return String(left.market ?? "").localeCompare(String(right.market ?? ""));
    })
    .slice(0, 6);
  const reducedActivityBlockedCandidates = replacementCandidateQueue
    .filter((candidate) =>
      stringArrayField(candidate.knownQualityFailureReasons).includes(
        "executionEligibleRateBelowSwitchThreshold",
      ),
    )
    .slice(0, 4)
    .map((candidate) => ({
      market: candidate.market ?? null,
      symbol: candidate.symbol ?? null,
      comparisonCarryBps: candidate.comparisonCarryBps ?? null,
      priorityBlocker: candidate.priorityBlocker ?? null,
      knownQualityFailureReasons: candidate.knownQualityFailureReasons ?? [],
      action: "do_not_treat_reduced_activity_as_profitability",
    }));

  const warnings = uniqueStrings([
    currentFocusExecutionEligibleRate !== null &&
    currentFocusExecutionEligibleRate < LIVE_PROMOTION_MIN_EXECUTION_ELIGIBLE_RATE
      ? "current_focus_below_live_execution_eligible_rate"
      : undefined,
    currentFocusSpreadRejectedRate !== null &&
    currentFocusSpreadRejectedRate > LIVE_PROMOTION_MAX_SPREAD_REJECTION_RATE
      ? "current_focus_spread_rejection_above_live_limit"
      : undefined,
    bestChallengerExecutionEligibleRate !== null &&
    bestChallengerExecutionEligibleRate < LIVE_PROMOTION_MIN_EXECUTION_ELIGIBLE_RATE
      ? "best_challenger_below_live_execution_eligible_rate"
      : undefined,
    bestOverallChallengerQualityFailures.includes("executionEligibleRateBelowSwitchThreshold")
      ? "raw_best_challenger_activity_too_low_for_switch"
      : undefined,
    reducedActivityBlockedCandidates.length > 0
      ? "some_ranked_challengers_blocked_by_low_execution_eligibility"
      : undefined,
    rawCarryBlockedCandidates.some((candidate) =>
      stringArrayField(candidate.knownQualityFailureReasons).includes(
        "executionEligibleRateBelowSwitchThreshold",
      ),
    )
      ? "raw_high_carry_candidates_blocked_by_low_execution_eligibility"
      : undefined,
  ]);

  return {
    status: "active",
    rule:
      "Do not treat fewer executable entries, lower execution eligibility, or spread-filtered activity as proof of improved profitability.",
    comparisonBasis:
      "fee-stressed funding-window carry must be read together with execution eligible rate, spread rejection, sample count, and operational readiness.",
    livePromotionMinimumExecutionEligibleRate: LIVE_PROMOTION_MIN_EXECUTION_ELIGIBLE_RATE,
    livePromotionMaximumSpreadRejectionRate: LIVE_PROMOTION_MAX_SPREAD_REJECTION_RATE,
    currentFocus: {
      market: currentFocusMarket,
      comparisonCarryBps: challengerSwitchDecision.currentFocusComparisonCarryBps ?? null,
      executionEligibleRate: currentFocusExecutionEligibleRate,
      spreadRejectedRate: currentFocusSpreadRejectedRate,
      executionEligibleRateMeetsLiveGate:
        currentFocusExecutionEligibleRate !== null
          ? currentFocusExecutionEligibleRate >= LIVE_PROMOTION_MIN_EXECUTION_ELIGIBLE_RATE
          : null,
      spreadRejectionMeetsLiveGate:
        currentFocusSpreadRejectedRate !== null
          ? currentFocusSpreadRejectedRate <= LIVE_PROMOTION_MAX_SPREAD_REJECTION_RATE
          : null,
    },
    bestChallenger: {
      market: bestChallenger.market ?? null,
      symbol: bestChallenger.symbol ?? null,
      comparisonCarryBps: bestChallenger.comparisonCarryBps ?? null,
      comparisonCarrySource: bestChallenger.comparisonCarrySource ?? null,
      executionEligibleRate: bestChallengerExecutionEligibleRate,
      qualityPasses: bestChallenger.qualityPasses === true,
      knownQualityFailureReasons: bestChallenger.knownQualityFailureReasons ?? [],
      executionEligibleRateMeetsLiveGate:
        bestChallengerExecutionEligibleRate !== null
          ? bestChallengerExecutionEligibleRate >= LIVE_PROMOTION_MIN_EXECUTION_ELIGIBLE_RATE
          : null,
    },
    rawBestChallenger: {
      market: bestOverallChallenger.market ?? null,
      symbol: bestOverallChallenger.symbol ?? null,
      comparisonCarryBps: bestOverallChallenger.comparisonCarryBps ?? null,
      executionEligibleRate: bestOverallChallengerExecutionEligibleRate,
      qualityPasses: bestOverallChallenger.qualityPasses === true,
      knownQualityFailureReasons: bestOverallChallenger.knownQualityFailureReasons ?? [],
    },
    latestFeeStressWindowComparison: {
      deltaToCurrentFocusBps: latestFeeStressWindowComparison.deltaToCurrentFocusBps ?? null,
      sampleQualityPasses: latestFeeStressWindowComparison.sampleQualityPasses ?? null,
      action: latestFeeStressWindowComparison.action ?? null,
    },
    rawCarryBlockedCandidates,
    reducedActivityBlockedCandidates,
    warnings,
    interpretation:
      "This guardrail can block or downgrade a research-focus switch; it cannot authorize live startup. A candidate that looks better only after many entries are filtered remains observation-only.",
  };
}

function buildChallengerObservationCoverage(
  challengers: Array<Record<string, unknown>>,
  matrix: Array<Record<string, unknown>> | undefined,
  processAlignment: ProcessAlignment | null,
  carryWatchlist: Array<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const relevantChallengers = challengers.filter((challenger) => {
    const metrics = recordField(challenger.metrics);
    const fundingWindowSummary = recordField(metrics.fundingWindowSummary);
    const carryBps =
      numericField(challenger.comparisonCarryBps) ??
      numericField(challenger.medianNetCarryBps) ??
      numericField(metrics.executionEligibleMedianNetCarryBps) ??
      numericField(fundingWindowSummary.medianWindowNetCarryBps);
    const positiveRate =
      numericField(metrics.executionEligiblePositiveRate) ??
      numericField(fundingWindowSummary.positiveWindowRate);

    if (carryBps !== null && carryBps <= 0) return false;
    if (positiveRate !== null && positiveRate <= 0) return false;
    return true;
  });
  const ignoredNonPositiveOpportunityCandidates = challengers
    .filter((challenger) => !relevantChallengers.includes(challenger))
    .map((challenger) => ({
      market: challenger.market ?? null,
      symbol: challenger.symbol ?? null,
      sourcePath: challenger.sourcePath ?? null,
      metrics: challenger.metrics ?? null,
      reason: "non_positive_execution_eligible_carry",
    }));
  const opportunityMarkets = new Set<string>();
  const opportunityMarketEvidence = new Map<string, Record<string, unknown>>();
  for (const row of matrix ?? []) {
    const market = stringField(row.market);
    const sourcePath = stringField(row.sourcePath) ?? "";
    if (market !== null && sourcePath.includes("spot-perp-carry-opportunity")) {
      opportunityMarkets.add(market);
    }
  }
  for (const report of carryWatchlist ?? []) {
    const sourcePath = stringField(report.path) ?? "";
    if (!isOpportunityObservationReportPath(sourcePath)) continue;
    for (const marketSummary of arrayRecords(report.perMarketSummary)) {
      const market = stringField(marketSummary.market);
      if (market === null) continue;
      opportunityMarkets.add(market);
      opportunityMarketEvidence.set(market, {
        sourcePath,
        generatedAt: report.generatedAt ?? null,
        market,
        symbol: marketSummary.symbol ?? null,
        count: marketSummary.count ?? null,
        completedFundingCount: marketSummary.completedFundingCount ?? null,
        executionEligibleRate: marketSummary.executionEligibleRate ?? null,
        executionEligibleMedianNetCarryBps:
          marketSummary.executionEligibleMedianNetCarryBps ?? null,
        spreadRejectedRate: recordField(marketSummary.spreadControl).spreadRejectedRate ?? null,
        rejectionReasons: recordField(marketSummary.spreadControl).rejectionReasons ?? null,
        watchDecision: marketSummary.watchDecision ?? null,
      });
    }
  }

  const opportunityObserverProcess = processAlignment?.processes?.find(
    (process) => process.name === "dry-run-spot-perp-carry-opportunity-72h-observer",
  );
  const configuredOpportunityMarkets = new Set<string>();
  for (const requiredSubstring of stringArrayField(
    opportunityObserverProcess?.argumentAudit?.requiredSubstrings,
  )) {
    const [market] = requiredSubstring.split(":");
    if (market?.startsWith("KRW-")) configuredOpportunityMarkets.add(market);
  }

  const missingOpportunityObservation = relevantChallengers
    .filter((challenger) => {
      const market = stringField(challenger.market);
      return market !== null && !opportunityMarkets.has(market);
    })
    .map((challenger) => {
      const market = stringField(challenger.market);
      const configuredInOpportunityObserver =
        market !== null && configuredOpportunityMarkets.has(market);
      return {
        market: challenger.market ?? null,
        symbol: challenger.symbol ?? null,
        sourcePath: challenger.sourcePath ?? null,
        metrics: challenger.metrics ?? null,
        configuredInOpportunityObserver,
        requiredAction: configuredInOpportunityObserver
          ? "wait_for_next_opportunity_observation_sample"
          : "add_to_spot_perp_carry_opportunity_72h_observer",
      };
    });
  const opportunityObserverConfiguredForMissingMarkets =
    missingOpportunityObservation.length === 0
      ? null
      : missingOpportunityObservation.every(
      (missing) => missing.configuredInOpportunityObserver === true,
    );

  return {
    opportunityObservationCovered: missingOpportunityObservation.length === 0,
    opportunityObserverConfiguredForMissingMarkets,
    missingOpportunityObservation,
    ignoredNonPositiveOpportunityCandidates,
    observedOpportunityObservation: relevantChallengers
      .map((challenger) => {
        const market = stringField(challenger.market);
        return market === null ? null : opportunityMarketEvidence.get(market) ?? null;
      })
      .filter((row): row is Record<string, unknown> => row !== null),
    action:
      missingOpportunityObservation.length === 0
        ? null
        : opportunityObserverConfiguredForMissingMarkets
          ? "wait_for_next_opportunity_observation_sample"
          : "add_missing_markets_to_opportunity_observer",
    interpretation:
      missingOpportunityObservation.length === 0
        ? "Top challenger carry markets are represented in the long-horizon opportunity observer."
        : opportunityObserverConfiguredForMissingMarkets
          ? "Some top challenger carry markets are only discovery snapshots, but the long-horizon opportunity observer is already configured for them; wait for the next observer sample before making keep/switch decisions."
          : "Some top challenger carry markets are only discovery snapshots; add them to the long-horizon opportunity observer before making keep/switch decisions.",
  };
}

function summarizeWatchlistEntry(report: Record<string, unknown>): Record<string, unknown> {
  const summary = recordField(report.summary);
  const spreadControl = recordField(summary.spreadControl);
  const topExecutableCarry = Array.isArray(report.topExecutableCarry)
    ? report.topExecutableCarry
        .filter((row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row),
        )
        .slice(0, 5)
        .map((row) => ({
          capturedAt: row.capturedAt ?? null,
          market: row.market ?? null,
          symbol: row.symbol ?? null,
          netCarryBps: row.netCarryBps ?? null,
          estimatedNetPnlKrw: row.estimatedNetPnlKrw ?? null,
          spotSpreadBps: row.spotSpreadBps ?? null,
          perpSpreadBps: row.perpSpreadBps ?? null,
          usdtKrwSpreadBps: row.usdtKrwSpreadBps ?? null,
          depthCovered: row.depthCovered === true,
          fundingSettledAt: row.fundingSettledAt ?? null,
          nextFundingTime: row.nextFundingTime ?? null,
        }))
    : [];

  return {
    path: report.path ?? null,
    generatedAt: report.generatedAt ?? null,
    status: report.status ?? null,
    promotionEligible: report.promotionEligible === true,
    usableForLivePromotion: report.usableForLivePromotion === true,
    blockers: report.blockers ?? [],
    summary: {
      observationCount: summary.count ?? null,
      completedFundingCount: summary.completedFundingCount ?? null,
      medianNetCarryBps: summary.medianNetCarryBps ?? null,
      executionEligibleMedianNetCarryBps: summary.executionEligibleMedianNetCarryBps ?? null,
      positiveRate: summary.positiveRate ?? null,
      executionEligibleRate: summary.executionEligibleRate ?? null,
      spreadRejectedRate: spreadControl.spreadRejectedRate ?? null,
      spreadControlPassed: spreadControl.passed === true,
      rawPricingArtifactCount: summary.rawPricingArtifactCount ?? null,
      rawPricingArtifactEstimatedNetPnlKrw: summary.rawPricingArtifactEstimatedNetPnlKrw ?? null,
    },
    primaryMarketEvidence: report.primaryMarketEvidence ?? null,
    executableEvidence: report.executableEvidence ?? null,
    spreadControl: Object.keys(recordField(report.spreadControl)).length === 0 ? null : report.spreadControl,
    topExecutableCarry,
  };
}

function selectedMarketCurrentEntrySnapshot(
  report: Record<string, unknown> | null,
  selectedMarket: string | null,
): Record<string, unknown> | null {
  if (report === null || selectedMarket === null) return null;
  const rows = Array.isArray(report.topExecutableCarry)
    ? report.topExecutableCarry.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
  const topRow = rows.find((row) => stringField(row.market) === selectedMarket) ?? null;
  if (topRow !== null) {
    return {
      source: "top_executable_carry",
      capturedAt: topRow.capturedAt ?? null,
      market: topRow.market ?? null,
      symbol: topRow.symbol ?? null,
      netCarryBps: topRow.netCarryBps ?? null,
      estimatedNetPnlKrw: topRow.estimatedNetPnlKrw ?? null,
      spotSpreadBps: topRow.spotSpreadBps ?? null,
      perpSpreadBps: topRow.perpSpreadBps ?? null,
      usdtKrwSpreadBps: topRow.usdtKrwSpreadBps ?? null,
      depthCovered: topRow.depthCovered === true,
      fundingSettledAt: topRow.fundingSettledAt ?? null,
      nextFundingTime: topRow.nextFundingTime ?? null,
    };
  }

  const perMarketRows = Array.isArray(report.perMarketSummary)
    ? report.perMarketSummary.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
  const marketSummary = perMarketRows.find((row) => stringField(row.market) === selectedMarket) ?? null;
  if (marketSummary === null) return null;

  return {
    source: "per_market_summary",
    market: marketSummary.market ?? null,
    symbol: marketSummary.symbol ?? null,
    netCarryBps:
      marketSummary.executionEligibleMedianNetCarryBps ??
      recordField(marketSummary.fundingWindowSummary).medianWindowNetCarryBps ??
      marketSummary.medianNetCarryBps ??
      null,
    estimatedNetPnlKrw:
      marketSummary.executionEligibleTotalEstimatedNetPnlKrw ??
      recordField(marketSummary.fundingWindowSummary).medianWindowEstimatedNetPnlKrw ??
      null,
    positiveRate: marketSummary.positiveRate ?? null,
    executionEligibleRate: marketSummary.executionEligibleRate ?? null,
    spreadRejectedRate: recordField(marketSummary.spreadControl).spreadRejectedRate ?? null,
    completedFundingWindowCount:
      recordField(marketSummary.fundingWindowSummary).completedFundingWindowCount ??
      marketSummary.completedFundingCount ??
      null,
  };
}

function selectedMarketCurrentEntrySpreadControl(
  report: Record<string, unknown> | null,
  selectedMarket: string | null,
  aggregateSpreadControl: Record<string, unknown>,
): Record<string, unknown> | null {
  if (report === null || selectedMarket === null) return null;
  const marketSummary =
    arrayRecords(report.perMarketSummary).find((row) => stringField(row.market) === selectedMarket) ??
    null;
  if (marketSummary === null) return null;

  const marketSpreadControl = recordField(marketSummary.spreadControl);
  const aggregateThresholds = recordField(aggregateSpreadControl.thresholds);
  const marketThresholds = recordField(marketSpreadControl.thresholds);
  const thresholds =
    Object.keys(marketThresholds).length > 0
      ? marketThresholds
      : Object.keys(aggregateThresholds).length > 0
        ? aggregateThresholds
        : null;
  const spreadControl: Record<string, unknown> = {
    ...marketSpreadControl,
    market: marketSummary.market ?? null,
    symbol: marketSummary.symbol ?? null,
    spreadRejectedRate:
      marketSpreadControl.spreadRejectedRate ?? marketSummary.spreadRejectedRate ?? null,
    executionEligibleRate:
      marketSpreadControl.executionEligibleRate ?? marketSummary.executionEligibleRate ?? null,
    minExecutionEligibleRate:
      marketSpreadControl.minExecutionEligibleRate ??
      aggregateSpreadControl.minExecutionEligibleRate ??
      null,
    maxSpreadRejectionRate:
      marketSpreadControl.maxSpreadRejectionRate ??
      aggregateSpreadControl.maxSpreadRejectionRate ??
      null,
    thresholds,
  };
  const computedPassed = selectedMarketSpreadControlPassed(spreadControl);
  if (spreadControl.passed === undefined && computedPassed !== null) {
    spreadControl.passed = computedPassed;
  }
  return Object.keys(spreadControl).length > 0 ? spreadControl : null;
}

function selectedMarketSpreadControlPassed(spreadControl: Record<string, unknown>): boolean | null {
  const checks: boolean[] = [];
  const spreadRejectedRate = numericField(spreadControl.spreadRejectedRate);
  const maxSpreadRejectionRate = numericField(spreadControl.maxSpreadRejectionRate);
  if (spreadRejectedRate !== null && maxSpreadRejectionRate !== null) {
    checks.push(spreadRejectedRate <= maxSpreadRejectionRate);
  }
  const executionEligibleRate = numericField(spreadControl.executionEligibleRate);
  const minExecutionEligibleRate = numericField(spreadControl.minExecutionEligibleRate);
  if (executionEligibleRate !== null && minExecutionEligibleRate !== null) {
    checks.push(executionEligibleRate >= minExecutionEligibleRate);
  }
  const thresholds = recordField(spreadControl.thresholds);
  const spreadStats = recordField(spreadControl.spreadStats);
  for (const [venue, thresholdKey] of [
    ["spot", "maxSpotSpreadBps"],
    ["perp", "maxPerpSpreadBps"],
    ["usdtKrw", "maxUsdtKrwSpreadBps"],
  ] as const) {
    const observed = numericField(recordField(spreadStats[venue]).maxBps);
    const threshold = numericField(thresholds[thresholdKey]);
    if (observed !== null && threshold !== null) checks.push(observed <= threshold);
  }
  return checks.length > 0 ? checks.every(Boolean) : null;
}

function currentEntryAlternativeCandidates(
  report: Record<string, unknown> | null,
  selectedMarket: string | null,
  selectedNetCarryBps: number | null,
): Array<Record<string, unknown>> {
  if (report === null) return [];
  const candidatesByMarket = new Map<string, Record<string, unknown>>();
  const upsertCandidate = (candidate: Record<string, unknown>): void => {
    const market = stringField(candidate.market);
    if (market === null || market === selectedMarket) return;
    const netCarryBps = numericField(candidate.netCarryBps);
    if (netCarryBps === null || netCarryBps < LIVE_PROMOTION_MIN_NET_CARRY_BPS) return;
    const existing = candidatesByMarket.get(market);
    const existingCarry = numericField(existing?.netCarryBps) ?? Number.NEGATIVE_INFINITY;
    if (netCarryBps > existingCarry) candidatesByMarket.set(market, candidate);
  };

  for (const row of arrayRecords(report.topExecutableCarry)) {
    upsertCandidate({
      source: "top_executable_carry",
      capturedAt: row.capturedAt ?? null,
      market: row.market ?? null,
      symbol: row.symbol ?? null,
      netCarryBps: row.netCarryBps ?? null,
      estimatedNetPnlKrw: row.estimatedNetPnlKrw ?? null,
      spotSpreadBps: row.spotSpreadBps ?? null,
      perpSpreadBps: row.perpSpreadBps ?? null,
      usdtKrwSpreadBps: row.usdtKrwSpreadBps ?? null,
      depthCovered: row.depthCovered === true,
      fundingSettledAt: row.fundingSettledAt ?? null,
      nextFundingTime: row.nextFundingTime ?? null,
    });
  }

  for (const row of arrayRecords(report.perMarketSummary)) {
    const fundingWindowSummary = recordField(row.fundingWindowSummary);
    upsertCandidate({
      source: "per_market_summary",
      market: row.market ?? null,
      symbol: row.symbol ?? null,
      netCarryBps:
        row.executionEligibleMedianNetCarryBps ??
        fundingWindowSummary.medianWindowNetCarryBps ??
        row.medianNetCarryBps ??
        null,
      estimatedNetPnlKrw:
        row.executionEligibleTotalEstimatedNetPnlKrw ??
        fundingWindowSummary.medianWindowEstimatedNetPnlKrw ??
        null,
      positiveRate: row.executionEligiblePositiveRate ?? row.positiveRate ?? null,
      executionEligibleRate: row.executionEligibleRate ?? null,
      spreadRejectedRate: recordField(row.spreadControl).spreadRejectedRate ?? null,
      completedFundingWindowCount:
        fundingWindowSummary.completedFundingWindowCount ?? row.completedFundingCount ?? null,
    });
  }

  return [...candidatesByMarket.values()]
    .map((candidate): Record<string, unknown> => {
      const netCarryBps = numericField(candidate.netCarryBps);
      const positiveRate = numericField(candidate.positiveRate);
      const executionEligibleRate = numericField(candidate.executionEligibleRate);
      const spreadRejectedRate = numericField(candidate.spreadRejectedRate);
      const depthCovered = candidate.depthCovered;
      const blockedReasons = uniqueStrings([
        positiveRate !== null && positiveRate < 0.67
          ? "positiveRateBelowCurrentEntryThreshold"
          : undefined,
        executionEligibleRate !== null && executionEligibleRate < LIVE_PROMOTION_MIN_EXECUTION_ELIGIBLE_RATE
          ? "executionEligibleRateBelowLiveThreshold"
          : undefined,
        spreadRejectedRate !== null && spreadRejectedRate > LIVE_PROMOTION_MAX_SPREAD_REJECTION_RATE
          ? "spreadRejectedRateAboveLiveThreshold"
          : undefined,
        depthCovered === false ? "depthInsufficient" : undefined,
      ]);
      return {
        ...candidate,
        deltaToSelectedFocusBps:
          netCarryBps === null || selectedNetCarryBps === null
            ? null
            : netCarryBps - selectedNetCarryBps,
        currentEntryGatePassed:
          netCarryBps !== null && netCarryBps >= LIVE_PROMOTION_MIN_NET_CARRY_BPS,
        executionQualityStatus:
          blockedReasons.length > 0
            ? "quality_blocked"
            : "quality_clear_or_top_executable",
        blockedReasons,
        action:
          blockedReasons.length > 0
            ? "keep_observation_only_until_current_entry_quality_clears"
            : "use_for_research_focus_recheck_only_not_live_startup",
      };
    })
    .sort((left, right) => {
      const carryDelta =
        (numericField(right.netCarryBps) ?? Number.NEGATIVE_INFINITY) -
        (numericField(left.netCarryBps) ?? Number.NEGATIVE_INFINITY);
      if (carryDelta !== 0) return carryDelta;
      return String(left.market ?? "").localeCompare(String(right.market ?? ""));
    })
    .slice(0, 5);
}

function summarizeCurrentEntrySanity(
  carryWatchlist: Array<Record<string, unknown>> | undefined,
  selectedMarket: string | null,
  nowMs: number,
): Record<string, unknown> {
  const reports = (carryWatchlist ?? []).filter((report) => {
    const path = stringField(report.path) ?? "";
    return isCurrentEntryReportPath(path);
  });
  const focusedCurrentEntry =
    reports.find((report) =>
      (stringField(report.path) ?? "").includes("spot-perp-carry-focus-current-entry-25bps-latest"),
    ) ?? null;
  const feeStressCurrentCarry =
    reports.find((report) =>
      (stringField(report.path) ?? "").includes("spot-perp-carry-current-carry-discovery-25bps-current"),
    ) ?? null;
  const topFundingFeeStress =
    reports.find((report) =>
      (stringField(report.path) ?? "").includes("spot-perp-carry-top-funding-discovery-25bps-current"),
    ) ?? null;
  const preferredCandidates = [
    focusedCurrentEntry,
    feeStressCurrentCarry,
    topFundingFeeStress,
    ...reports,
  ].filter(
    (report, index, candidates): report is Record<string, unknown> =>
      report !== null && candidates.indexOf(report) === index,
  );
  const defaultPreferred = focusedCurrentEntry ?? feeStressCurrentCarry ?? topFundingFeeStress ?? reports[0] ?? null;
  const preferredReport =
    preferredCandidates.find((report) => selectedMarketCurrentEntrySnapshot(report, selectedMarket) !== null) ??
    defaultPreferred;
  const preferredSummary = recordField(preferredReport?.summary);
  const preferredSpreadControl = recordField(
    preferredSummary.spreadControl ?? preferredReport?.spreadControl,
  );
  const preferredSpreadThresholds = recordField(preferredSpreadControl.thresholds);
  const selectedSnapshot = selectedMarketCurrentEntrySnapshot(preferredReport, selectedMarket);
  const selectedSpreadControl = selectedMarketCurrentEntrySpreadControl(
    preferredReport,
    selectedMarket,
    preferredSpreadControl,
  );
  const selectedNetCarryBps = numericField(selectedSnapshot?.netCarryBps);
  const selectedPositiveRate = numericField(selectedSnapshot?.positiveRate);
  const selectedExecutionEligibleRate = numericField(selectedSnapshot?.executionEligibleRate);
  const selectedSpreadRejectedRate = numericField(selectedSnapshot?.spreadRejectedRate);
  const selectedSpotSpreadBps = numericField(selectedSnapshot?.spotSpreadBps);
  const selectedPerpSpreadBps = numericField(selectedSnapshot?.perpSpreadBps);
  const selectedUsdtKrwSpreadBps = numericField(selectedSnapshot?.usdtKrwSpreadBps);
  const selectedCapturedAt = stringField(selectedSnapshot?.capturedAt);
  const preferredGeneratedAt = stringField(preferredReport?.generatedAt);
  const currentEntryEvidenceTimestamp = selectedCapturedAt ?? preferredGeneratedAt;
  const currentEntryEvidenceTimestampMs = timestampMs(currentEntryEvidenceTimestamp);
  const currentEntryEvidenceAgeMinutes =
    currentEntryEvidenceTimestampMs === null
      ? null
      : (nowMs - currentEntryEvidenceTimestampMs) / 60_000;
  const maxSpotSpreadBps = numericField(preferredSpreadThresholds.maxSpotSpreadBps);
  const maxPerpSpreadBps = numericField(preferredSpreadThresholds.maxPerpSpreadBps);
  const maxUsdtKrwSpreadBps = numericField(preferredSpreadThresholds.maxUsdtKrwSpreadBps);
  const currentEntryCarryGate = {
    minNetCarryBps: LIVE_PROMOTION_MIN_NET_CARRY_BPS,
    selectedNetCarryBps,
    deltaToThresholdBps:
      selectedNetCarryBps === null
        ? null
        : selectedNetCarryBps - LIVE_PROMOTION_MIN_NET_CARRY_BPS,
    passed:
      selectedNetCarryBps !== null &&
      selectedNetCarryBps >= LIVE_PROMOTION_MIN_NET_CARRY_BPS,
  };
  const currentEntryBlockers = uniqueStrings([
    preferredReport === null ? "currentEntryReportMissing" : undefined,
    selectedSnapshot === null ? "selectedFocusMissingFromCurrentEntrySnapshot" : undefined,
    currentEntryEvidenceTimestamp === null || currentEntryEvidenceTimestampMs === null
      ? "currentEntryTimestampMissing"
      : undefined,
    currentEntryEvidenceAgeMinutes !== null && currentEntryEvidenceAgeMinutes < -1
      ? "currentEntryTimestampInFuture"
      : undefined,
    currentEntryEvidenceAgeMinutes !== null &&
    currentEntryEvidenceAgeMinutes > MAX_CURRENT_ENTRY_EVIDENCE_AGE_MINUTES
      ? "staleCurrentEntrySnapshot"
      : undefined,
    selectedNetCarryBps === null ? "selectedFocusCurrentEntryCarryMissing" : undefined,
    selectedNetCarryBps !== null && selectedNetCarryBps <= 0 ? "nonPositiveSelectedFocusCurrentEntryCarry" : undefined,
    currentEntryCarryGate.selectedNetCarryBps !== null &&
    currentEntryCarryGate.selectedNetCarryBps < currentEntryCarryGate.minNetCarryBps
      ? "selectedFocusCurrentEntryCarryBelowLiveThreshold"
      : undefined,
    selectedPositiveRate !== null && selectedPositiveRate < 0.67 ? "lowSelectedFocusCurrentEntryPositiveRate" : undefined,
    selectedExecutionEligibleRate !== null && selectedExecutionEligibleRate < 0.95
      ? "lowCurrentEntryExecutionEligibleRate"
      : undefined,
    selectedSpreadRejectedRate !== null && selectedSpreadRejectedRate > 0.05 ? "wideCurrentEntrySpreadRejection" : undefined,
    selectedSnapshot?.depthCovered === false ? "selectedFocusCurrentEntryDepthInsufficient" : undefined,
    selectedSpotSpreadBps !== null && maxSpotSpreadBps !== null && selectedSpotSpreadBps > maxSpotSpreadBps
      ? "selectedFocusCurrentEntrySpotSpreadTooWide"
      : undefined,
    selectedPerpSpreadBps !== null && maxPerpSpreadBps !== null && selectedPerpSpreadBps > maxPerpSpreadBps
      ? "selectedFocusCurrentEntryPerpSpreadTooWide"
      : undefined,
    selectedUsdtKrwSpreadBps !== null &&
    maxUsdtKrwSpreadBps !== null &&
    selectedUsdtKrwSpreadBps > maxUsdtKrwSpreadBps
      ? "selectedFocusCurrentEntryUsdtKrwSpreadTooWide"
      : undefined,
  ]);
  const reportEntries = reports.map((report) => summarizeWatchlistEntry(report));
  const alternativeCandidates = currentEntryAlternativeCandidates(
    preferredReport,
    selectedMarket,
    selectedNetCarryBps,
  );

  return {
    status: currentEntryBlockers.length === 0 ? "current_entry_clear" : "current_entry_blocked_or_diagnostic_only",
    selectedMarket,
    preferredSourcePath: preferredReport?.path ?? null,
    preferredGeneratedAt: preferredGeneratedAt ?? null,
    preferredEmbeddedGeneratedAt: preferredReport?.embeddedGeneratedAt ?? null,
    preferredEmbeddedReportWasStale: preferredReport?.embeddedReportWasStale === true,
    preferredSourceKind:
      preferredReport === focusedCurrentEntry
        ? "focused_current_entry_fee_stress"
        : preferredReport === feeStressCurrentCarry
        ? "current_carry_fee_stress"
        : preferredReport === topFundingFeeStress
          ? "top_funding_fee_stress"
          : preferredReport === null
            ? null
            : "other_current_entry_watchlist",
    currentEntryBlockers,
    currentEntryEvidenceTimestamp,
    currentEntryEvidenceAgeMinutes,
    maxCurrentEntryEvidenceAgeMinutes: MAX_CURRENT_ENTRY_EVIDENCE_AGE_MINUTES,
    currentEntryCarryGate,
    selectedMarketCurrentEntrySnapshot: selectedSnapshot,
    selectedMarketCurrentEntrySpreadControl: selectedSpreadControl,
    currentEntryAlternativeCandidates: alternativeCandidates,
    currentEntryAlternativeCandidateCount: alternativeCandidates.length,
    aggregateCurrentEntryDiagnostics: {
      reportPromotionEligible: preferredReport?.promotionEligible ?? null,
      reportUsableForLivePromotion: preferredReport?.usableForLivePromotion ?? null,
      medianNetCarryBps: preferredSummary.medianNetCarryBps ?? null,
      executionEligibleMedianNetCarryBps:
        preferredSummary.executionEligibleMedianNetCarryBps ?? null,
      positiveRate: preferredSummary.positiveRate ?? null,
      executionEligibleRate: preferredSummary.executionEligibleRate ?? null,
      rawPricingArtifactCount: preferredSummary.rawPricingArtifactCount ?? null,
      spreadControl:
        Object.keys(preferredSpreadControl).length > 0 ? preferredSpreadControl : null,
    },
    currentEntryReports: reportEntries,
    action:
      currentEntryBlockers.length === 0
        ? "allow_current_entry_as_one_required_live_sanity_input"
        : "keep_live_blocked_and_continue_current_entry_discovery",
    livePromotionCaveat:
      "Current-entry discovery is a sanity gate only; single snapshots cannot authorize live startup without funding-window, readiness, operational-proof, and reconciliation gates.",
    interpretation:
      "Checks whether the selected market's latest public entry snapshot supports the research focus; alternative current-entry candidates are research-focus diagnostics only and cannot authorize live startup.",
  };
}

function isCurrentEntryMissingRequirement(requirement: string): boolean {
  return /^spotPerpCarryCurrentEntry/.test(requirement);
}

function currentEntryMissingRequirements(currentEntryBlockers: string[]): string[] {
  if (currentEntryBlockers.length === 0) return [];
  return uniqueStrings([
    "spotPerpCarryCurrentEntrySanity",
    ...currentEntryBlockers.map((blocker) => `spotPerpCarryCurrentEntry:${blocker}`),
  ]);
}

function reconcileCurrentEntryMissingRequirements(
  missingRequirements: string[],
  currentEntryBlockers: string[],
): string[] {
  return uniqueStrings([
    ...missingRequirements.filter((requirement) => !isCurrentEntryMissingRequirement(requirement)),
    ...currentEntryMissingRequirements(currentEntryBlockers),
  ]);
}

function strategyResearchMissingRequirements(strategyResearchWork: string[]): string[] {
  return uniqueStrings(
    strategyResearchWork.map((work) => `spotPerpCarryResearchFocus:${work}`),
  );
}

function prioritizeOpportunityObservationCoverage(
  nextWorkClassification: Record<string, unknown>,
  challengerObservationCoverage: Record<string, unknown>,
): Record<string, unknown> {
  const missingOpportunityObservationRaw = challengerObservationCoverage.missingOpportunityObservation;
  const missingOpportunityObservation = (Array.isArray(missingOpportunityObservationRaw)
    ? missingOpportunityObservationRaw
    : []
  ).filter((row): row is Record<string, unknown> =>
    row !== null && typeof row === "object" && !Array.isArray(row),
  );
  if (missingOpportunityObservation.length === 0) return nextWorkClassification;

  const firstMissing = recordField(missingOpportunityObservation[0]);
  const metrics = recordField(firstMissing.metrics);
  const fundingWindowSummary = recordField(metrics.fundingWindowSummary);
  const observerConfiguredForMissing =
    challengerObservationCoverage.opportunityObserverConfiguredForMissingMarkets === true;

  return {
    ...nextWorkClassification,
    strategyEvidencePriority: "challenger_opportunity_observation_gap",
    priorityMarket: firstMissing.market ?? null,
    priorityReason: observerConfiguredForMissing
      ? "A profitable-looking challenger is only present in discovery snapshots, but it is already configured in long-horizon opportunity observation; wait for the next sample before keep/switch/live decisions."
      : "A profitable-looking challenger is only present in discovery snapshots; add it to long-horizon opportunity observation before keep/switch/live decisions.",
    priorityOpportunityObservationEvidence: {
      missingCount: missingOpportunityObservation.length,
      missingMarkets: missingOpportunityObservation.map((row) => ({
        market: row.market ?? null,
        symbol: row.symbol ?? null,
        sourcePath: row.sourcePath ?? null,
        configuredInOpportunityObserver: row.configuredInOpportunityObserver ?? null,
        requiredAction: row.requiredAction ?? null,
      })),
      firstMissingMarket: {
        market: firstMissing.market ?? null,
        symbol: firstMissing.symbol ?? null,
        sourcePath: firstMissing.sourcePath ?? null,
        executionEligibleMedianNetCarryBps:
          metrics.executionEligibleMedianNetCarryBps ?? null,
        executionEligiblePositiveRate: metrics.executionEligiblePositiveRate ?? null,
        completedFundingWindowCount:
          fundingWindowSummary.completedFundingWindowCount ??
          metrics.completedFundingCount ??
          null,
        medianWindowNetCarryBps: fundingWindowSummary.medianWindowNetCarryBps ?? null,
        medianWindowEstimatedNetPnlKrw:
          fundingWindowSummary.medianWindowEstimatedNetPnlKrw ?? null,
      },
      displacedStrategyEvidencePriority:
        nextWorkClassification.strategyEvidencePriority ?? null,
      displacedPriorityMarket: nextWorkClassification.priorityMarket ?? null,
      evidenceAction: observerConfiguredForMissing
        ? "wait_for_next_spot_perp_carry_opportunity_observer_sample"
        : "add_missing_challengers_to_spot_perp_carry_opportunity_observer",
      evidenceCommands: observerConfiguredForMissing
        ? [
            "wait for dry-run-spot-perp-carry-opportunity-72h-observer to publish a sample",
            "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
            "npm run dry-run:refresh-live-goal-status",
          ]
        : [
            "update the opportunity observer market list",
            "npm run dry-run:observe-spot-perp-carry-opportunity-72h",
            "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
            "npm run dry-run:refresh-live-goal-status",
          ],
      estimateCaveat:
        "Discovery-only carry is a one-snapshot signal; it must enter the long-horizon observer and fee-stressed funding-window evidence before it can affect switch or live decisions.",
    },
    recommendedAutonomousAction: observerConfiguredForMissing
      ? "wait_for_next_opportunity_observation_sample_and_refresh_live_goal_status"
      : "add_missing_challengers_to_opportunity_observer_and_refresh_live_goal_status",
  };
}

function classifyAutonomousStrategyAction(
  selectedMarket: string | null,
  fallbackMarket: string | null,
  researchFocusDecision: Record<string, unknown> | undefined,
  matrix: Array<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (selectedMarket === null) {
    return {
      action: "search_for_new_research_focus",
      currentFocusMarket: null,
      fallbackMarket,
      reason: "no_selected_research_focus",
      canPromoteLive: false,
    };
  }

  const currentFocusRows = (matrix ?? []).filter((row) => stringField(row.market) === selectedMarket);
  const rejectedFocusRows = currentFocusRows.filter((row) => {
    const decision = stringField(row.decision) ?? "";
    return decision.includes("reject") || decision.includes("demote");
  });
  const switchAction = stringField(researchFocusDecision?.action)?.includes("switch") === true;

  if (rejectedFocusRows.length > 0) {
    return {
      action: fallbackMarket ? "demote_focus_and_compare_fallback" : "demote_focus_and_search_replacement",
      currentFocusMarket: selectedMarket,
      fallbackMarket,
      reason: "current_focus_has_reject_or_demote_decision",
      rejectedFocusRows: rejectedFocusRows.slice(0, 3).map((row) => ({
        sourcePath: row.sourcePath ?? null,
        decision: row.decision ?? null,
        reasons: row.reasons ?? [],
        metrics: row.metrics ?? null,
      })),
      canPromoteLive: false,
    };
  }

  if (switchAction) {
    return {
      action: "switch_research_focus_before_more_observation",
      currentFocusMarket: selectedMarket,
      fallbackMarket,
      reason: researchFocusDecision?.action ?? "research_focus_decision_requests_switch",
      switchCriteria: researchFocusDecision?.switchCriteria ?? [],
      canPromoteLive: false,
    };
  }

  return {
    action: "continue_current_research_focus",
    currentFocusMarket: selectedMarket,
    fallbackMarket,
    reason: researchFocusDecision?.action ?? "current_focus_not_rejected_and_no_switch_requested",
    switchCriteria: researchFocusDecision?.switchCriteria ?? [],
    canPromoteLive: false,
  };
}

function buildPromptToArtifactChecklist(
  liveGoal: LiveGoalStatus,
  liveReadiness: SpotPerpLiveReadiness | null,
  processAlignment: ProcessAlignment | null,
  operationalReadinessComplete: boolean,
  autonomousChallengerChecks: Array<Record<string, unknown>>,
  currentFocusLiveStartupCaution: Record<string, unknown>,
  currentEntrySanityView: Record<string, unknown>,
  checkpointPlan: Record<string, unknown>,
  strategyResearchHandoff: Record<string, unknown>,
  marketConditionHandoff: Record<string, unknown>,
  reducedActivityGuardrail: Record<string, unknown>,
  startupPlanView: Record<string, unknown> | null,
  completionAuditScopeComparison: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  const estimatedCarry = liveGoal.profitabilityEvidence?.estimatedCarry ?? null;
  const estimatedCarryBps = numericField(estimatedCarry?.medianNetCarryBps);
  const feeStressCarryBps = numericField(estimatedCarry?.feeStressMedianNetCarryBps);
  const selectedResearchFocus = liveGoal.selectedResearchFocus ?? null;
  const selectedResearchMarket = selectedResearchFocus?.market ?? marketFromRecord(estimatedCarry);
  const hasPositiveEstimatedCandidate =
    selectedResearchMarket !== null &&
    ((feeStressCarryBps !== null && feeStressCarryBps > 0) ||
      (feeStressCarryBps === null && estimatedCarryBps !== null && estimatedCarryBps > 0));
  const currentFocusStartupBlocked = Object.keys(currentFocusLiveStartupCaution).length > 0;
  const startupPlan = recordField(startupPlanView);
  const startupBlockedCommands = recordField(startupPlan.blockedCommands);
  const startupGateCommand =
    stringField(startupPlan.gateCommand) ?? liveGoal.liveStartupPlan?.gateCommand ?? null;
  const startupReviewCommand =
    stringField(startupPlan.reviewCommand) ?? liveGoal.liveStartupPlan?.reviewCommand ?? null;
  const startupPm2StartCommand =
    stringField(startupPlan.pm2StartCommand) ?? liveGoal.liveStartupPlan?.pm2StartCommand ?? null;
  const startupCommands = uniqueStrings([
    startupGateCommand ?? undefined,
    ...(currentFocusStartupBlocked
      ? []
      : [
          startupReviewCommand ?? undefined,
          startupPm2StartCommand ?? undefined,
        ]),
  ]);
  const priorityAction = firstPriorityAction(liveGoal);
  const observedAutonomousChallengerChecks = autonomousChallengerChecks.filter(
    (check) => stringField(check.evaluationStatus) !== "not_observed",
  );
  const autonomousChallengerArtifacts = uniqueStrings(
    observedAutonomousChallengerChecks.flatMap((check) => [
      stringField(check.sourcePath) ?? undefined,
      stringField(recordField(check.feeStressEvidence).path) ?? undefined,
    ]),
  );
  const liveGoalProgressSummaryPath = "var/reports/live-goal-progress-summary-latest.json";
  const liveGoalRefreshDuePath = "var/reports/live-goal-refresh-due-latest.json";
  const bestChallengerLiveReadiness = recordField(
    strategyResearchHandoff.bestChallengerLiveReadiness,
  );
  const marketSpreadSensitivity = recordField(marketConditionHandoff.spreadSensitivity);
  const explicitSpreadThresholdExperiments = arrayRecords(
    marketConditionHandoff.explicitSpreadThresholdExperiments,
  );
  const spreadSensitivityCaveat = stringField(marketSpreadSensitivity.caveat);
  const spreadSensitivityIsDiagnostic =
    Object.keys(marketSpreadSensitivity).length === 0 ||
    (
      spreadSensitivityCaveat !== null &&
      /diagnostic only/i.test(spreadSensitivityCaveat) &&
      /does not relax live gates/i.test(spreadSensitivityCaveat)
    );
  const explicitSpreadExperimentsAreDiagnostic = explicitSpreadThresholdExperiments.every(
    (experiment) =>
      experiment.liveGateImpact === "none_diagnostic_only" &&
      experiment.policyDecision !== "relax_spread_gate" &&
      experiment.policyDecision !== "authorize_live_startup",
  );
  const reducedActivityWarnings = stringArrayField(reducedActivityGuardrail.warnings);
  const completionAuditScopeAvailable = completionAuditScopeComparison !== null;
  const auditScopeAddedBySummary = stringArrayField(completionAuditScopeComparison?.addedBySummary);
  const auditScopeMissingFromSummary = stringArrayField(completionAuditScopeComparison?.missingFromSummary);
  const reducedActivityGuardrailPassed =
    reducedActivityGuardrail.status === "active" &&
    typeof reducedActivityGuardrail.rule === "string" &&
    /do not treat/i.test(reducedActivityGuardrail.rule) &&
    /profitability/i.test(reducedActivityGuardrail.rule) &&
    typeof reducedActivityGuardrail.interpretation === "string" &&
    /cannot authorize live startup/i.test(reducedActivityGuardrail.interpretation);
  const analysisHandoffAvailable =
    Object.keys(strategyResearchHandoff).length > 0 ||
    Object.keys(marketConditionHandoff).length > 0;
  const analysisHandoffPassed =
    analysisHandoffAvailable &&
    strategyResearchHandoff.canAuthorizeLiveStartup === false &&
    spreadSensitivityIsDiagnostic &&
    explicitSpreadExperimentsAreDiagnostic;
  const operationalProof = liveReadiness?.evidence?.operationalProof ?? null;
  const operationalProofEvidence =
    operationalProof === null
      ? null
      : {
          generatedAt: operationalProof.generatedAt ?? null,
          accountFeesConfirmed: operationalProof.accountFeesConfirmed === true,
          inventoryReady: operationalProof.inventoryReady === true,
          hedgeVenueReady: operationalProof.hedgeVenueReady === true,
          missingSecrets: uniqueStrings([
            ...(operationalProof.details?.missingSecrets ?? []),
            ...(liveReadiness?.nextOperationalSteps ?? []).flatMap((step) => step.missingSecrets ?? []),
          ]),
          reasons: operationalProof.reasons ?? [],
          requirements: operationalProof.requirements ?? null,
          deficits: operationalProof.deficits ?? null,
          feeBudget: operationalProof.details?.feeBudget ?? null,
        };

  return [
    {
      id: "profitable_research_candidate_identified",
      requirement: "Find the best currently measured profit candidate without treating estimated carry as realized return.",
      status: liveGoal.profitabilityEvidence?.livePromotionEvidenceSatisfied === true
        ? "passed"
        : hasPositiveEstimatedCandidate
          ? "partial"
          : "missing",
      artifactPaths: uniqueStrings([selectedResearchFocus?.sourcePath]),
      command: "npm run dry-run:summarize-live-goal-progress",
      evidence: {
        selectedResearchMarket,
        profitabilityStatus: liveGoal.profitabilityEvidence?.status ?? null,
        realizedEvidenceAvailable: liveGoal.profitabilityEvidence?.realizedEvidenceAvailable === true,
        estimatedMedianNetCarryBps: estimatedCarryBps,
        feeStressMedianNetCarryBps: feeStressCarryBps,
      },
      gap:
        liveGoal.profitabilityEvidence?.livePromotionEvidenceSatisfied === true
          ? null
          : "estimated_carry_only_not_realized_or_live_promotable",
    },
    {
      id: "loss_paths_rejected_or_not_promoted",
      requirement: "Do not keep pushing strategies whose evidence is not live-promotable.",
      status: liveGoal.liveStartupAllowed === true ? "blocked" : "passed",
      artifactPaths: [liveGoalProgressSummaryPath],
      command: "npm run dry-run:summarize-live-goal-progress",
      evidence: {
        selectedLiveCandidate: liveGoal.selectedLiveCandidate ?? null,
        liveStartupAllowed: liveGoal.liveStartupAllowed === true,
        currentMode: liveGoal.strategyDecision?.currentMode ?? null,
        lifecycleDecisions: liveGoal.strategyLifecycleDecision?.decisions ?? null,
      },
      gap: liveGoal.liveStartupAllowed === true ? "live_startup_allowed_before_audit_completed" : null,
    },
    {
      id: "autonomous_challenger_search_active",
      requirement: "Keep searching and comparing challengers instead of depending on new user input.",
      status:
        (liveGoal.carryMarketDecisionMatrix?.length ?? 0) > 0 && liveGoal.nextActionPlan !== undefined
          ? "passed"
          : "missing",
      artifactPaths: uniqueStrings([
        selectedResearchFocus?.sourcePath,
        priorityAction?.currentEvidence?.liveReadinessPath,
      ]),
      command: priorityAction?.verificationCommand ?? "npm run dry-run:refresh-live-goal-status",
      evidence: {
        carryMarketDecisionCount: liveGoal.carryMarketDecisionMatrix?.length ?? 0,
        priorityAction: priorityAction?.action ?? null,
        requiredEvidenceBeforeLive: priorityAction?.requiredEvidenceBeforeLive ?? [],
      },
      gap:
        (liveGoal.carryMarketDecisionMatrix?.length ?? 0) > 0
          ? null
          : "no_challenger_decision_matrix_available",
    },
    {
      id: "web_challenger_evaluation_recorded",
      requirement: "Evaluate externally discovered challengers with local carry and fee-stress evidence before switching.",
      status:
        observedAutonomousChallengerChecks.length >= AUTONOMOUS_CHALLENGER_CHECK_MARKETS.length
          ? "passed"
          : "missing",
      artifactPaths: autonomousChallengerArtifacts,
      command:
        "npm run dry-run:observe-spot-perp-carry-opportunity-72h && npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
      evidence: {
        requiredMarkets: AUTONOMOUS_CHALLENGER_CHECK_MARKETS,
        evaluatedMarkets: autonomousChallengerChecks.map((check) => ({
          market: check.market ?? null,
          evaluationStatus: check.evaluationStatus ?? null,
          decision: check.decision ?? null,
          medianNetCarryBps: check.medianNetCarryBps ?? null,
          feeStressMedianNetCarryBps: check.feeStressMedianNetCarryBps ?? null,
          evaluationReasons: check.evaluationReasons ?? [],
        })),
      },
      gap:
        observedAutonomousChallengerChecks.length >= AUTONOMOUS_CHALLENGER_CHECK_MARKETS.length
          ? null
          : "externally_discovered_challenger_not_evaluated_locally",
    },
    {
      id: "subagent_current_analysis_handoff_reflected",
      requirement:
        "Reflect subagent and current-analysis conclusions as explicit research-only handoffs before any live startup decision.",
      status: analysisHandoffPassed
        ? "passed"
        : analysisHandoffAvailable
          ? "blocked"
          : "missing",
      artifactPaths: [liveGoalProgressSummaryPath],
      command: "npm run dry-run:summarize-live-goal-progress",
      evidence: {
        strategyStatus: strategyResearchHandoff.status ?? null,
        canAuthorizeLiveStartup: strategyResearchHandoff.canAuthorizeLiveStartup ?? null,
        bestChallengerMarket: strategyResearchHandoff.bestChallengerMarket ?? null,
        bestChallengerLiveReady:
          Object.keys(bestChallengerLiveReadiness).length > 0
            ? bestChallengerLiveReadiness.liveReady === true
            : null,
        requiredBeforeFocusSwitch: strategyResearchHandoff.requiredBeforeFocusSwitch ?? [],
        requiredBeforeChallengerLiveStartup:
          strategyResearchHandoff.requiredBeforeChallengerLiveStartup ?? [],
        marketConditionStatus: marketConditionHandoff.status ?? null,
        marketConditionRequiredBeforeLiveReview:
          marketConditionHandoff.requiredBeforeLiveReview ?? [],
        spreadSensitivity: Object.keys(marketSpreadSensitivity).length > 0
          ? {
              baselineScenario: marketSpreadSensitivity.baselineScenario ?? null,
              nearestPassingScenario:
                marketSpreadSensitivity.nearestPassingScenario ?? null,
              action: marketSpreadSensitivity.action ?? null,
              caveat: marketSpreadSensitivity.caveat ?? null,
            }
          : null,
        explicitSpreadThresholdExperiments: explicitSpreadThresholdExperiments.map((experiment) => ({
          sourcePath: experiment.sourcePath ?? null,
          market: experiment.market ?? null,
          baselineMaxSpotSpreadBps: experiment.baselineMaxSpotSpreadBps ?? null,
          candidateMaxSpotSpreadBps: experiment.candidateMaxSpotSpreadBps ?? null,
          deltaCandidateMinusBaseline: experiment.deltaCandidateMinusBaseline ?? null,
          expectancyImproved: experiment.expectancyImproved === true,
          policyDecision: experiment.policyDecision ?? null,
          liveGateImpact: experiment.liveGateImpact ?? null,
        })),
      },
      gap: analysisHandoffPassed
        ? null
        : !analysisHandoffAvailable
          ? "analysis_handoff_missing"
          : strategyResearchHandoff.canAuthorizeLiveStartup !== false
            ? "strategy_handoff_must_not_authorize_live_startup"
            : !explicitSpreadExperimentsAreDiagnostic
              ? "spread_threshold_experiment_must_not_relax_live_gate"
              : "spread_sensitivity_handoff_must_remain_diagnostic_only",
    },
    {
      id: "reduced_activity_guardrail_enforced",
      requirement:
        "Do not treat reduced executable activity, low execution eligibility, or spread-filtered samples as profitability improvement or live permission.",
      status: reducedActivityGuardrailPassed ? "passed" : "blocked",
      artifactPaths: [liveGoalProgressSummaryPath],
      command: "npm run dry-run:summarize-live-goal-progress",
      evidence: {
        status: reducedActivityGuardrail.status ?? null,
        currentFocus: reducedActivityGuardrail.currentFocus ?? null,
        bestChallenger: reducedActivityGuardrail.bestChallenger ?? null,
        warnings: reducedActivityWarnings,
        rule: reducedActivityGuardrail.rule ?? null,
        interpretation: reducedActivityGuardrail.interpretation ?? null,
      },
      gap: reducedActivityGuardrailPassed
        ? null
        : "reduced_activity_guardrail_missing_or_live_permission_ambiguous",
    },
    {
      id: "completion_audit_scope_reconciled",
      requirement:
        "Expose source-audit versus derived-summary missing requirement scope so added live blockers cannot be hidden by source counts.",
      status: completionAuditScopeAvailable ? "passed" : "missing",
      artifactPaths: [liveGoalProgressSummaryPath, liveGoalRefreshDuePath],
      command: "npm run dry-run:summarize-live-goal-progress && npm run dry-run:check-live-goal-refresh-due",
      evidence: {
        sourceMissingRequirementCount:
          completionAuditScopeComparison?.sourceMissingRequirementCount ?? null,
        derivedMissingRequirementCount:
          completionAuditScopeComparison?.derivedMissingRequirementCount ?? null,
        countsMatch: completionAuditScopeComparison?.countsMatch ?? null,
        addedBySummary: auditScopeAddedBySummary,
        missingFromSummary: auditScopeMissingFromSummary,
        scopeInterpretation: completionAuditScopeComparison?.scopeInterpretation ?? null,
      },
      gap: completionAuditScopeAvailable ? null : "completion_audit_scope_comparison_missing",
    },
    {
      id: "live_startup_method_documented",
      requirement: "Have a concrete gated method to start live only after the review passes.",
      status: currentFocusStartupBlocked ? "blocked" : startupCommands.length >= 2 ? "passed" : "missing",
      artifactPaths: [liveGoalProgressSummaryPath],
      command: currentFocusStartupBlocked
        ? startupGateCommand
        : startupReviewCommand,
      evidence: {
        gateCommand: startupGateCommand,
        reviewCommand: currentFocusStartupBlocked ? null : startupReviewCommand,
        pm2StartCommand: currentFocusStartupBlocked ? null : startupPm2StartCommand,
        blockedCommands: currentFocusStartupBlocked
          ? startupBlockedCommands
          : null,
        currentFocusLiveStartupCaution: currentFocusStartupBlocked ? currentFocusLiveStartupCaution : null,
        hardStops: startupPlan.hardStops ?? liveGoal.liveStartupPlan?.hardStops ?? [],
      },
      gap: currentFocusStartupBlocked
        ? "current_focus_requires_fee_stressed_challenger_recompare"
        : liveGoal.liveStartupAllowed === true
          ? null
          : "startup_method_exists_but_gate_currently_blocks_live",
    },
    {
      id: "current_entry_sanity_checked",
      requirement:
        "Verify the latest current-entry carry snapshot so accumulated estimated carry is not promoted when the immediate entry is weak or artifact-prone.",
      status: Object.keys(currentEntrySanityView).length === 0
        ? "missing"
        : stringArrayField(currentEntrySanityView.currentEntryBlockers).length > 0
          ? "blocked"
          : "passed",
      artifactPaths: uniqueStrings([stringField(currentEntrySanityView.preferredSourcePath) ?? undefined]),
      command: "npm run dry-run:refresh-spot-perp-carry-focus-current-entry-fee-stress",
      evidence: {
        status: currentEntrySanityView.status ?? null,
        selectedMarket: currentEntrySanityView.selectedMarket ?? null,
        preferredSourcePath: currentEntrySanityView.preferredSourcePath ?? null,
        currentEntryEvidenceTimestamp: currentEntrySanityView.currentEntryEvidenceTimestamp ?? null,
        currentEntryEvidenceAgeMinutes: currentEntrySanityView.currentEntryEvidenceAgeMinutes ?? null,
        maxCurrentEntryEvidenceAgeMinutes:
          currentEntrySanityView.maxCurrentEntryEvidenceAgeMinutes ?? null,
        currentEntryCarryGate: currentEntrySanityView.currentEntryCarryGate ?? null,
        selectedMarketCurrentEntrySnapshot:
          currentEntrySanityView.selectedMarketCurrentEntrySnapshot ?? null,
        currentEntryBlockers: currentEntrySanityView.currentEntryBlockers ?? [],
      },
      gap:
        Object.keys(currentEntrySanityView).length === 0
          ? "current_entry_sanity_not_available"
          : stringArrayField(currentEntrySanityView.currentEntryBlockers).length > 0
            ? "current_entry_snapshot_does_not_clear_live_sanity"
            : null,
    },
    {
      id: "live_readiness_verified",
      requirement: "Confirm fees, inventory, hedge venue, credentials, and evidence gates before live.",
      status: operationalReadinessComplete ? "passed" : "blocked",
      artifactPaths: uniqueStrings([priorityAction?.currentEvidence?.liveReadinessPath]),
      command: liveGoal.liveStartupPlan?.gateCommand ?? "npm run dry-run:refresh-live-goal-status",
      evidence: {
        liveReadinessStatus: liveReadiness?.status ?? null,
        liveReady: liveReadiness?.liveReady === true,
        blockers: liveReadiness?.blockers ?? [],
        checks: liveReadiness?.checks ?? {},
        operationalProof: operationalProofEvidence,
        operatorActions: operatorActionViews(liveReadiness),
      },
      gap: operationalReadinessComplete ? null : "operational_or_evidence_gates_still_block_live",
    },
    {
      id: "process_control_clean",
      requirement: "Keep running processes aligned with research-only/live-blocked state.",
      status: processAlignment?.aligned === true && (processAlignment.violationCount ?? 0) === 0
        ? "passed"
        : "blocked",
      artifactPaths: ["var/reports/live-goal-process-alignment-latest.json"],
      command: "npm run dry-run:audit-live-goal-process-alignment",
      evidence: {
        aligned: processAlignment?.aligned === true,
        violationCount: processAlignment?.violationCount ?? null,
        processHealth: processAlignment?.processHealth ?? null,
        savedProcessControl: processAlignment?.savedProcessControl ?? null,
      },
      gap:
        processAlignment?.aligned === true && (processAlignment.violationCount ?? 0) === 0
          ? null
          : "process_alignment_not_clean",
    },
    {
      id: "checkpoint_plan_recorded",
      requirement:
        "Record whether to wait or refresh before the next strategy decision so dry-run evidence collection does not loop without a new funding-window sample.",
      status: Object.keys(checkpointPlan).length === 0 ? "missing" : "passed",
      artifactPaths: [liveGoalProgressSummaryPath, liveGoalRefreshDuePath],
      command: stringField(checkpointPlan.reviewCommand),
      evidence: {
        status: checkpointPlan.status ?? null,
        shouldStartLive: checkpointPlan.shouldStartLive ?? null,
        shouldRunHeavyRefreshNow: checkpointPlan.shouldRunHeavyRefreshNow ?? null,
        nextReviewAt: checkpointPlan.nextReviewAt ?? null,
        nextReviewAtKst: checkpointPlan.nextReviewAtKst ?? null,
        nextReviewDelayMinutes: checkpointPlan.nextReviewDelayMinutes ?? null,
        nextReviewOverdue: checkpointPlan.nextReviewOverdue ?? null,
        nextReviewTrigger: checkpointPlan.nextReviewTrigger ?? null,
        recommendedAutonomousAction: checkpointPlan.recommendedAutonomousAction ?? null,
        outstandingAutonomousEvidence: checkpointPlan.outstandingAutonomousEvidence ?? [],
        outstandingOperatorWork: checkpointPlan.outstandingOperatorWork ?? [],
        outstandingMarketConditionWork: checkpointPlan.outstandingMarketConditionWork ?? [],
        autonomousEvidenceSufficiency: checkpointPlan.autonomousEvidenceSufficiency ?? null,
        reason: checkpointPlan.reason ?? null,
      },
      gap: Object.keys(checkpointPlan).length === 0 ? "checkpoint_plan_missing" : null,
    },
  ];
}

function buildGoalCompletionAudit(
  liveGoal: LiveGoalStatus,
  liveReadiness: SpotPerpLiveReadiness | null,
  processAlignment: ProcessAlignment | null,
  missingRequirements: string[],
  autonomousChallengerChecks: Array<Record<string, unknown>>,
  currentFocusLiveStartupCaution: Record<string, unknown>,
  currentEntrySanityView: Record<string, unknown>,
  checkpointPlan: Record<string, unknown>,
  strategyResearchHandoff: Record<string, unknown>,
  marketConditionHandoff: Record<string, unknown>,
  reducedActivityGuardrail: Record<string, unknown>,
  startupPlanView: Record<string, unknown> | null,
  completionAuditScopeComparison: Record<string, unknown> | null,
): Record<string, unknown> {
  const liveReady = liveGoal.liveReady === true && liveGoal.liveStartupAllowed === true;
  const liveReadinessChecks = liveReadiness?.checks ?? {};
  const operationalReadinessComplete =
    liveReadiness?.liveReady === true &&
    liveReadinessChecks.accountFeesConfirmed === true &&
    liveReadinessChecks.inventoryReady === true &&
    liveReadinessChecks.hedgeVenueReady === true &&
    liveReadinessChecks.operationalProofPresent === true &&
    liveReadinessChecks.operationalProofFresh === true &&
    liveReadinessChecks.liveExecutionPathReady === true;
  const operationalProof = liveReadiness?.evidence?.operationalProof ?? null;
  const operationalProofEvidence =
    operationalProof === null
      ? null
      : {
          generatedAt: operationalProof.generatedAt ?? null,
          accountFeesConfirmed: operationalProof.accountFeesConfirmed === true,
          inventoryReady: operationalProof.inventoryReady === true,
          hedgeVenueReady: operationalProof.hedgeVenueReady === true,
          missingSecrets: uniqueStrings([
            ...(operationalProof.details?.missingSecrets ?? []),
            ...(liveReadiness?.nextOperationalSteps ?? []).flatMap((step) => step.missingSecrets ?? []),
          ]),
          reasons: operationalProof.reasons ?? [],
          requirements: operationalProof.requirements ?? null,
          deficits: operationalProof.deficits ?? null,
          feeBudget: operationalProof.details?.feeBudget ?? null,
        };
  const currentFocusNeedsRecompare = Object.keys(currentFocusLiveStartupCaution).length > 0;
  const currentEntryBlockers = stringArrayField(currentEntrySanityView.currentEntryBlockers);
  const reducedActivityGuardrailPassed =
    reducedActivityGuardrail.status === "active" &&
    typeof reducedActivityGuardrail.rule === "string" &&
    /do not treat/i.test(reducedActivityGuardrail.rule) &&
    /profitability/i.test(reducedActivityGuardrail.rule) &&
    typeof reducedActivityGuardrail.interpretation === "string" &&
    /cannot authorize live startup/i.test(reducedActivityGuardrail.interpretation);
  const missingRequirementClassification = {
    autonomousEvidence: missingRequirements.filter((requirement) =>
      /insufficientObservations|insufficientObservationSpan|insufficientCompletedFundingEvents|ObservationSpan|latestWindowSampleQuality|latestWindowFundingAlignment|opportunityObservationSample|opportunityObserverCoverage/.test(
        requirement,
      ),
    ),
    operatorPrerequisites: missingRequirements.filter((requirement) =>
      /feeScheduleUnconfirmed|inventoryNotReady|hedgeVenueNotReady|credentialsMissing|binanceFuturesFeeUnavailable|bithumbQuoteInventoryInsufficient|binanceUsdtMarginInsufficient|OperationalReadiness/.test(
        requirement,
      ),
    ),
    marketConditions: missingRequirements.filter((requirement) =>
      /wideDisplayedSpread|[Ss]preadControl|requires:spreadControl|notMetricCandidate|[Cc]urrentEntry|FocusRecompare/.test(
        requirement,
      ),
    ),
  };
  const classifiedMissingRequirements = new Set([
    ...missingRequirementClassification.autonomousEvidence,
    ...missingRequirementClassification.operatorPrerequisites,
    ...missingRequirementClassification.marketConditions,
  ]);
  const liveReadinessGates = missingRequirements.filter(
    (requirement) =>
      !classifiedMissingRequirements.has(requirement) &&
      /LiveReadiness|carryReportNotPromotionEligible/.test(requirement),
  );
  for (const requirement of liveReadinessGates) classifiedMissingRequirements.add(requirement);
  const missingRequirementClassificationView = {
    ...missingRequirementClassification,
    liveReadinessGates,
    other: missingRequirements.filter((requirement) => !classifiedMissingRequirements.has(requirement)),
  };

  const successCriteria = [
    {
      id: "live_candidate_selected",
      required: "selectedLiveCandidate must name the strategy that can be reviewed for live startup.",
      passed: liveGoal.selectedLiveCandidate !== null && liveGoal.selectedLiveCandidate !== undefined,
      evidence: { selectedLiveCandidate: liveGoal.selectedLiveCandidate ?? null },
    },
    {
      id: "profitability_evidence_satisfied",
      required: "Profitability evidence must satisfy the live promotion rule, not just show estimated carry.",
      passed: liveGoal.profitabilityEvidence?.livePromotionEvidenceSatisfied === true,
      evidence: {
        status: liveGoal.profitabilityEvidence?.status ?? null,
        realizedEvidenceAvailable: liveGoal.profitabilityEvidence?.realizedEvidenceAvailable === true,
        livePromotionEvidenceSatisfied:
          liveGoal.profitabilityEvidence?.livePromotionEvidenceSatisfied === true,
      },
    },
    {
      id: "live_startup_gate_allowed",
      required: "liveReady and liveStartupAllowed must both be true.",
      passed: liveReady,
      evidence: {
        liveReady: liveGoal.liveReady === true,
        liveStartupAllowed: liveGoal.liveStartupAllowed === true,
      },
    },
    {
      id: "operational_readiness_complete",
      required: "Fee, inventory, hedge venue, fresh operational proof, and live execution path checks must pass.",
      passed: operationalReadinessComplete,
      evidence: {
        liveReadinessStatus: liveReadiness?.status ?? null,
        liveReady: liveReadiness?.liveReady === true,
        checks: liveReadinessChecks,
        blockers: liveReadiness?.blockers ?? [],
        operationalProof: operationalProofEvidence,
      },
    },
    {
      id: "process_alignment_clean",
      required: "PM2/process control must be aligned with zero violations.",
      passed: processAlignment?.aligned === true && (processAlignment.violationCount ?? 0) === 0,
      evidence: {
        aligned: processAlignment?.aligned === true,
        violationCount: processAlignment?.violationCount ?? null,
        processHealth: processAlignment?.processHealth ?? null,
      },
    },
    {
      id: "reduced_activity_guardrail_enforced",
      required:
        "Strategy selection must explicitly reject reduced executable activity as standalone profitability evidence.",
      passed: reducedActivityGuardrailPassed,
      evidence: {
        status: reducedActivityGuardrail.status ?? null,
        currentFocus: reducedActivityGuardrail.currentFocus ?? null,
        bestChallenger: reducedActivityGuardrail.bestChallenger ?? null,
        warnings: reducedActivityGuardrail.warnings ?? [],
        interpretation: reducedActivityGuardrail.interpretation ?? null,
      },
    },
    {
      id: "no_current_focus_recompare_caution",
      required: "Current focus must not require a fee-stressed challenger recompare before live startup.",
      passed: !currentFocusNeedsRecompare,
      evidence: {
        currentFocusLiveStartupCaution: currentFocusNeedsRecompare ? currentFocusLiveStartupCaution : null,
      },
    },
    {
      id: "current_entry_sanity_clear",
      required:
        "The latest current-entry discovery must clear the fee-stressed entry sanity check before live startup can be considered.",
      passed:
        Object.keys(currentEntrySanityView).length > 0 &&
        currentEntryBlockers.length === 0 &&
        currentEntrySanityView.status === "current_entry_clear",
      evidence: {
        status: currentEntrySanityView.status ?? null,
        preferredSourcePath: currentEntrySanityView.preferredSourcePath ?? null,
        currentEntryEvidenceTimestamp: currentEntrySanityView.currentEntryEvidenceTimestamp ?? null,
        currentEntryEvidenceAgeMinutes: currentEntrySanityView.currentEntryEvidenceAgeMinutes ?? null,
        maxCurrentEntryEvidenceAgeMinutes:
          currentEntrySanityView.maxCurrentEntryEvidenceAgeMinutes ?? null,
        currentEntryCarryGate: currentEntrySanityView.currentEntryCarryGate ?? null,
        selectedMarketCurrentEntrySnapshot:
          currentEntrySanityView.selectedMarketCurrentEntrySnapshot ?? null,
        currentEntryBlockers,
      },
    },
    {
      id: "no_missing_requirements",
      required: "The live-goal completion audit must have no missing requirements.",
      passed: missingRequirements.length === 0,
      evidence: {
        missingRequirements,
        outstandingAutonomousEvidence: checkpointPlan.outstandingAutonomousEvidence ?? [],
        outstandingOperatorWork: checkpointPlan.outstandingOperatorWork ?? [],
        outstandingMarketConditionWork: checkpointPlan.outstandingMarketConditionWork ?? [],
        missingRequirementClassification: missingRequirementClassificationView,
      },
    },
  ];

  return {
    objective:
      liveGoal.objective ??
      "Find a profitable strategy that can safely progress to live execution.",
    achieved: successCriteria.every((criterion) => criterion.passed === true),
    successCriteria,
    promptToArtifactChecklist: buildPromptToArtifactChecklist(
      liveGoal,
      liveReadiness,
      processAlignment,
      operationalReadinessComplete,
      autonomousChallengerChecks,
      currentFocusLiveStartupCaution,
      currentEntrySanityView,
      checkpointPlan,
      strategyResearchHandoff,
      marketConditionHandoff,
      reducedActivityGuardrail,
      startupPlanView,
      completionAuditScopeComparison,
    ),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const liveGoal = await readJson<LiveGoalStatus>(args.liveGoalStatusPath!);
  const processAlignment = await readOptionalJson<ProcessAlignment>(args.processAlignmentPath);
  const carryLiveReadinessReports = await refreshCarryReadinessReportSnapshots(
    liveGoal.carryLiveReadinessReports,
  );
  const carryWatchlistForCurrentEntry = await refreshCarryWatchReportSnapshots(liveGoal.carryWatchlist);
  const explicitSpreadThresholdExperiments = spreadThresholdExperimentViews(
    (
      await Promise.all(
        args.spreadThresholdExperimentPaths.map(async (sourcePath) => ({
          sourcePath,
          report: await readOptionalJson<SpotPerpCarryReport>(sourcePath),
        })),
      )
    ).filter(
      (experiment): experiment is { sourcePath: string; report: SpotPerpCarryReport } =>
        experiment.report !== null,
    ),
  );
  const priorityAction = firstPriorityAction(liveGoal);
  const liveReadinessPath = priorityAction?.currentEvidence?.liveReadinessPath ?? null;
  const liveReadiness = await readOptionalJson<SpotPerpLiveReadiness>(liveReadinessPath);
  const researchSourcePath = liveGoal.selectedResearchFocus?.sourcePath
    ? resolve(process.cwd(), liveGoal.selectedResearchFocus.sourcePath)
    : null;
  const researchSource = await readOptionalJson<SpotPerpCarryReport>(researchSourcePath);
  const liveReady = liveGoal.liveReady === true && liveGoal.liveStartupAllowed === true;
  const operationalProof = liveReadiness?.evidence?.operationalProof ?? null;
  const estimatedCarry = liveGoal.profitabilityEvidence?.estimatedCarry ?? null;
  const fallbackEstimatedCarry = liveGoal.profitabilityEvidence?.fallbackEstimatedCarry ?? null;
  const medianNetCarryBps = numericField(estimatedCarry?.medianNetCarryBps);
  const feeStressMedianNetCarryBps = numericField(estimatedCarry?.feeStressMedianNetCarryBps);
  const liveGoalObservationCount = numericField(estimatedCarry?.observationCount);
  const researchSourceObservationCount = numericField(researchSource?.observationCount);
  const researchSourceGeneratedAtMs = timestampMs(researchSource?.generatedAt);
  const liveGoalGeneratedAtMs = timestampMs(liveGoal.generatedAt);
  const fundingWindowCarryView = buildFundingWindowCarryView(researchSource, researchSourcePath);
  const feeStressFundingWindowCarryView = buildFeeStressFundingWindowCarryView(liveReadiness, liveReadinessPath);
  const feeStressFundingWindowTrendView = buildFundingWindowTrendView(feeStressFundingWindowCarryView);
  const notionalKrw = numericField(researchSource?.assumptions?.notionalKrw);
  const paperFundingWindowReturnView = buildPaperFundingWindowReturnView(
    feeStressFundingWindowCarryView ?? fundingWindowCarryView,
    feeStressFundingWindowCarryView !== null ? "fee_stress_funding_window" : "funding_window",
    notionalKrw,
  );
  const selectedComparisonCarryBps =
    numericField(feeStressFundingWindowCarryView?.medianWindowNetCarryBps) ??
    numericField(fundingWindowCarryView?.medianWindowNetCarryBps) ??
    medianNetCarryBps;
  const selectedResearchMarket = liveGoal.selectedResearchFocus?.market ?? marketFromRecord(estimatedCarry);
  const fallbackResearchMarket = marketFromRecord(fallbackEstimatedCarry);
  const sourceMissingRequirements = liveGoal.completionAudit?.missingRequirements ?? liveGoal.blockers ?? [];
  const autonomousStrategyAction = classifyAutonomousStrategyAction(
    selectedResearchMarket,
    fallbackResearchMarket,
    liveGoal.spotPerpCarryResearchFocusDecision,
    liveGoal.carryMarketDecisionMatrix,
  );
  const nextWorkClassification = classifyNextWork(
    priorityAction?.requiredEvidenceBeforeLive ?? [],
    liveReadiness?.blockers ?? [],
    processAlignment,
    liveReady,
  );
  const autonomousChallengerChecks = summarizeAutonomousChallengerChecks(
    liveGoal.carryMarketDecisionMatrix,
    selectedResearchMarket,
    fallbackResearchMarket,
    medianNetCarryBps,
    selectedComparisonCarryBps,
  );
  const carryMarketDecisionMatrix = summarizeCarryMarketDecisionMatrix(
    liveGoal.carryMarketDecisionMatrix,
    selectedResearchMarket,
    fallbackResearchMarket,
  );
  const challengerCarryMarkets = summarizeChallengerCarryMarkets(
    liveGoal.carryMarketDecisionMatrix,
    selectedResearchMarket,
    fallbackResearchMarket,
  );
  const spreadCleanEmergingChallengers = summarizeSpreadCleanEmergingChallengers(
    liveGoal.carryMarketDecisionMatrix,
    selectedResearchMarket,
    fallbackResearchMarket,
  );
  const generatedAt = new Date().toISOString();
  const generatedAtMs = Date.parse(generatedAt);
  const replacementCandidateQueue = summarizeReplacementCandidateQueue(
    challengerCarryMarkets,
    carryLiveReadinessReports,
  );
  const challengerSwitchDecision = buildChallengerSwitchDecision(
    challengerCarryMarkets,
    selectedResearchMarket,
    medianNetCarryBps,
    selectedComparisonCarryBps,
    feeStressFundingWindowCarryView,
  );
  const reducedActivityGuardrail = buildReducedActivityGuardrail(
    liveGoal.carryStrategyComparison,
    challengerSwitchDecision,
    replacementCandidateQueue,
    liveGoal.carryMarketDecisionMatrix,
  );
  const challengerObservationCoverage = buildChallengerObservationCoverage(
    challengerCarryMarkets,
    liveGoal.carryMarketDecisionMatrix,
    processAlignment,
    carryWatchlistForCurrentEntry,
  );
  const currentEntrySanityView = summarizeCurrentEntrySanity(
    carryWatchlistForCurrentEntry,
    selectedResearchMarket,
    generatedAtMs,
  );
  const challengerPrioritizedNextWorkClassification = prioritizeNextWorkForChallengerEvidence(
    nextWorkClassification,
    challengerSwitchDecision,
    carryLiveReadinessReports,
  );
  const cautionPrioritizedNextWorkClassification = addCurrentFocusLiveStartupCaution(
    challengerPrioritizedNextWorkClassification,
    feeStressFundingWindowTrendView,
    challengerSwitchDecision,
    replacementCandidateQueue,
  );
  const prioritizedNextWorkClassification = prioritizeOpportunityObservationCoverage(
    cautionPrioritizedNextWorkClassification,
    challengerObservationCoverage,
  );
  const currentEntryBlockers = stringArrayField(currentEntrySanityView.currentEntryBlockers);
  const strategyResearchHandoff = buildStrategyResearchHandoff(
    challengerSwitchDecision,
    challengerObservationCoverage,
    spreadCleanEmergingChallengers,
    currentEntrySanityView,
    liveGoal.liveStartupPlan,
    liveGoal.switchPlan,
    carryLiveReadinessReports,
  );
  const strategyResearchWork = stringArrayField(strategyResearchHandoff.requiredBeforeFocusSwitch);
  const missingRequirements = uniqueStrings([
    ...reconcileCurrentEntryMissingRequirements(sourceMissingRequirements, currentEntryBlockers),
    ...strategyResearchMissingRequirements(strategyResearchWork),
  ]);
  const autonomousRecompareWork = strategyResearchWork.filter((work) =>
    [
      "latestWindowSampleQuality",
      "latestWindowFundingAlignment",
      "opportunityObservationSample",
      "opportunityObserverCoverage",
    ].includes(work),
  );
  const marketConditionRecompareWork = strategyResearchWork.filter((work) =>
    ["spreadControl"].includes(work),
  );
  const currentEntryPrioritizedNextWorkClassification: Record<string, unknown> = {
    ...prioritizedNextWorkClassification,
    currentEntrySanityView,
    ...(currentEntryBlockers.length > 0
      ? {
          currentEntryEvidencePriority: "current_entry_snapshot_sanity_blocked",
          currentEntryEvidenceAction: "keep_live_blocked_and_continue_current_entry_discovery",
        }
      : {
          currentEntryEvidencePriority: "current_entry_snapshot_sanity_clear",
          currentEntryEvidenceAction: "keep_as_required_live_sanity_input",
        }),
  };
  const nextAutonomousWork = uniqueStrings(
    [
      ...stringArrayField(currentEntryPrioritizedNextWorkClassification.autonomousEvidenceCollection),
      ...autonomousRecompareWork,
    ],
  );
  const nextOperatorWork = uniqueStrings([
    ...stringArrayField(currentEntryPrioritizedNextWorkClassification.liveOperationalPrerequisites),
    ...stringArrayField(currentEntryPrioritizedNextWorkClassification.processWork),
    ...stringArrayField(currentEntryPrioritizedNextWorkClassification.otherLiveGateBlockers),
  ]);
  const nextMarketConditionWork = uniqueStrings([
    ...stringArrayField(currentEntryPrioritizedNextWorkClassification.marketConditionBlockers),
    ...marketConditionRecompareWork,
    ...currentEntryBlockers,
  ]);
  const finalNextWorkClassification: Record<string, unknown> = {
    ...currentEntryPrioritizedNextWorkClassification,
    autonomousEvidenceCollection: nextAutonomousWork,
    liveOperationalPrerequisites: nextOperatorWork,
    marketConditionBlockers: nextMarketConditionWork,
    otherLiveGateBlockers: stringArrayField(
      currentEntryPrioritizedNextWorkClassification.otherLiveGateBlockers,
    ).filter((blocker) => !nextOperatorWork.includes(blocker)),
    canStartLiveWithoutOperatorInput:
      liveReady &&
      nextOperatorWork.length === 0 &&
      nextMarketConditionWork.length === 0 &&
      stringArrayField(currentEntryPrioritizedNextWorkClassification.processWork).length === 0,
  };
  const checkpointPlan = buildCheckpointPlan(
    liveReady,
    liveGoal.liveStartupAllowed === true,
    processAlignment,
    feeStressFundingWindowTrendView,
    priorityAction,
    nextAutonomousWork,
    nextOperatorWork,
    nextMarketConditionWork,
    selectedResearchMarket,
    generatedAtMs,
  );
  const autonomousEvidenceHandoff = buildAutonomousEvidenceHandoff(
    nextAutonomousWork,
    priorityAction,
    checkpointPlan,
    challengerObservationCoverage,
    strategyResearchHandoff,
  );
	  const rawCurrentFocusLiveStartupCaution = recordField(
	    finalNextWorkClassification.currentFocusLiveStartupCaution,
	  );
  const currentFocusLiveStartupCaution = effectiveCurrentFocusLiveStartupCaution(
    rawCurrentFocusLiveStartupCaution,
    strategyResearchHandoff,
  );
  const startupPlanView = summarizeLiveStartupPlan(
    liveGoal.liveStartupPlan,
    currentFocusLiveStartupCaution,
  );
  const operatorLiveReadinessHandoff = buildOperatorLiveReadinessHandoff(
    liveReadiness,
    liveGoal.liveStartupPlan,
    nextOperatorWork,
    currentFocusLiveStartupCaution,
  );
  const marketConditionHandoff = buildMarketConditionHandoff(
    nextMarketConditionWork,
    currentEntrySanityView,
    strategyResearchHandoff,
    liveReadiness,
    liveGoal.liveStartupPlan,
    explicitSpreadThresholdExperiments,
    currentFocusLiveStartupCaution,
  );
  const sourceCompletionAuditSummary = summarizeSourceCompletionAudit(liveGoal.completionAudit);
  const completionAuditScopeComparison = buildCompletionAuditScopeComparison(
    sourceCompletionAuditSummary,
    missingRequirements,
  );
  const goalCompletionAuditView = buildGoalCompletionAudit(
    liveGoal,
    liveReadiness,
    processAlignment,
    missingRequirements,
    autonomousChallengerChecks,
    currentFocusLiveStartupCaution,
    currentEntrySanityView,
    checkpointPlan,
    strategyResearchHandoff,
    marketConditionHandoff,
    reducedActivityGuardrail,
    startupPlanView,
    completionAuditScopeComparison,
  );
  const completionAchieved = goalCompletionAuditView.achieved === true;
  const completionCriteria = Array.isArray(goalCompletionAuditView.successCriteria)
    ? goalCompletionAuditView.successCriteria.map((criterion) => recordField(criterion))
    : [];
  const failedCompletionCriteria = completionCriteria
    .filter((criterion) => criterion.passed !== true)
    .map((criterion) => stringField(criterion.id))
    .filter((id): id is string => id !== null);
  const missingRequirementClassification =
    recordField(
      completionCriteria.find((criterion) => criterion.id === "no_missing_requirements")?.evidence,
    ).missingRequirementClassification ?? null;
  const missingRequirementClassificationCounts = classificationCounts(missingRequirementClassification);
  const outstandingWorkCounts = {
    autonomousEvidence: nextAutonomousWork.length,
    operatorWork: nextOperatorWork.length,
    marketConditionWork: nextMarketConditionWork.length,
  };
  const completionAuditSummary = {
    achieved: completionAchieved,
    failedCompletionCriteria,
    missingRequirements,
    missingRequirementCount: missingRequirements.length,
    missingRequirementClassification,
    missingRequirementClassificationCounts,
    outstandingWorkCounts,
  };

  const report = {
    generatedAt,
    source: {
      liveGoalStatusPath: args.liveGoalStatusPath,
      liveGoalGeneratedAt: liveGoal.generatedAt ?? null,
      processAlignmentPath: args.processAlignmentPath,
      processAlignmentGeneratedAt: processAlignment?.generatedAt ?? null,
    },
    objective:
      liveGoal.objective ??
      "Find a profitable strategy that can safely progress to live execution.",
    status: decisionStatus(liveGoal, processAlignment),
    achieved: completionAchieved,
    live: {
      reportStatus: liveGoal.status ?? null,
      liveReady: liveGoal.liveReady === true,
      liveStartupAllowed: liveGoal.liveStartupAllowed === true,
      selectedLiveCandidate: liveGoal.selectedLiveCandidate ?? null,
      startupPlan: startupPlanView,
    },
    profitability: liveGoal.profitabilityEvidence ?? null,
    profitabilityReturnView: {
      realizedReturnPct: liveGoal.profitabilityEvidence?.realizedReturnPct ?? null,
      realizedEvidenceAvailable: liveGoal.profitabilityEvidence?.realizedEvidenceAvailable === true,
      estimatedMedianCarryPct: medianNetCarryBps !== null ? medianNetCarryBps / 100 : null,
      feeStressEstimatedMedianCarryPct:
        feeStressMedianNetCarryBps !== null ? feeStressMedianNetCarryBps / 100 : null,
      estimatedNetPnlKrwIsObservationSum: estimatedCarry?.estimatedNetPnlKrw !== undefined,
      estimatedNetPnlKrwIsNotRealizedAccountReturn: true,
      fundingWindowCarryView,
      feeStressFundingWindowCarryView,
      feeStressFundingWindowTrendView,
      paperFundingWindowReturnView,
    },
    researchFocus: liveGoal.selectedResearchFocus ?? null,
    strategyDecisionView: {
      currentMode: liveGoal.strategyDecision?.currentMode ?? null,
      selectedLiveCandidate: liveGoal.strategyLifecycleDecision?.selectedLiveCandidate ?? liveGoal.selectedLiveCandidate ?? null,
      selectedResearchFocus:
        liveGoal.strategyLifecycleDecision?.selectedResearchFocus ?? liveGoal.selectedResearchFocus ?? null,
      liveStartupAllowed:
        typeof liveGoal.strategyLifecycleDecision?.liveStartupAllowed === "boolean"
          ? liveGoal.strategyLifecycleDecision.liveStartupAllowed
          : liveGoal.liveStartupAllowed === true,
      decisions: liveGoal.strategyLifecycleDecision?.decisions ?? null,
      researchFocusDecision: liveGoal.spotPerpCarryResearchFocusDecision ?? null,
      autonomousStrategyAction,
      carryStrategyComparison: liveGoal.carryStrategyComparison ?? null,
      carryMarketDecisionMatrix,
      challengerCarryMarkets,
      spreadCleanEmergingChallengers,
      replacementCandidateQueue,
      challengerSwitchDecision,
      reducedActivityGuardrail,
      currentEntrySanityView,
      autonomousChallengerChecks,
      challengerObservationCoverage,
      interpretation:
        "This view is the strategy keep/switch/reject decision layer; it can change research focus, but it cannot authorize live startup unless selectedLiveCandidate and live gates pass.",
    },
    researchSourceFreshness: researchSource
      ? {
          sourcePath: researchSourcePath,
          generatedAt: researchSource.generatedAt ?? null,
          status: researchSource.status ?? null,
          promotionEligible: researchSource.promotionEligible === true,
          observationCount: researchSourceObservationCount,
          liveGoalObservationCount,
          observationCountDelta:
            researchSourceObservationCount !== null && liveGoalObservationCount !== null
              ? researchSourceObservationCount - liveGoalObservationCount
              : null,
          observationSpanMinutes: researchSource.observationSpanMinutes ?? null,
          completedFundingCount: researchSource.summary?.completedFundingCount ?? null,
          executionEligibleMedianNetCarryBps:
            researchSource.summary?.executionEligibleMedianNetCarryBps ?? null,
          executionEligibleTotalEstimatedNetPnlKrw:
            researchSource.summary?.executionEligibleTotalEstimatedNetPnlKrw ?? null,
          executionEligibleRate: researchSource.summary?.executionEligibleRate ?? null,
          executionEligiblePositiveRate: researchSource.summary?.executionEligiblePositiveRate ?? null,
          sourceNewerThanLiveGoal:
            researchSourceGeneratedAtMs !== null && liveGoalGeneratedAtMs !== null
              ? researchSourceGeneratedAtMs > liveGoalGeneratedAtMs
              : null,
          liveGoalMayLagResearchSource:
            (researchSourceObservationCount !== null &&
              liveGoalObservationCount !== null &&
              researchSourceObservationCount > liveGoalObservationCount) ||
            (researchSourceGeneratedAtMs !== null &&
              liveGoalGeneratedAtMs !== null &&
              researchSourceGeneratedAtMs > liveGoalGeneratedAtMs),
        }
      : null,
    priorityAction: priorityAction
      ? {
          priority: priorityAction.priority ?? null,
          track: priorityAction.track ?? null,
          action: priorityAction.action ?? null,
          verificationCommand: priorityAction.verificationCommand ?? null,
          requiredEvidenceBeforeLive: priorityAction.requiredEvidenceBeforeLive ?? [],
          readinessGap: priorityAction.currentEvidence?.readinessGap ?? null,
          readinessTimeline: priorityAction.currentEvidence?.readinessTimeline ?? null,
          usableForLivePromotion: priorityAction.currentEvidence?.usableForLivePromotion === true,
          spreadControl: priorityAction.currentEvidence?.spreadControl ?? null,
        }
      : null,
    readinessProgress: priorityAction?.currentEvidence
      ? {
          readinessGap: priorityAction.currentEvidence.readinessGap ?? null,
          readinessTimeline: priorityAction.currentEvidence.readinessTimeline ?? null,
          usableForLivePromotion: priorityAction.currentEvidence.usableForLivePromotion === true,
          spreadControl: priorityAction.currentEvidence.spreadControl ?? null,
          evidenceCollectionStillRequired: (priorityAction.requiredEvidenceBeforeLive ?? []).filter((requirement) =>
            [
              "insufficientObservations",
              "insufficientObservationSpan",
              "insufficientCompletedFundingEvents",
            ].includes(requirement),
          ),
        }
      : null,
    operationalReadiness: liveReadiness
      ? {
          liveReadinessPath,
          generatedAt: liveReadiness.generatedAt ?? null,
          status: liveReadiness.status ?? null,
          liveReady: liveReadiness.liveReady === true,
          blockers: liveReadiness.blockers ?? [],
          checks: {
            accountFeesConfirmed: liveReadiness.checks?.accountFeesConfirmed === true,
            inventoryReady: liveReadiness.checks?.inventoryReady === true,
            hedgeVenueReady: liveReadiness.checks?.hedgeVenueReady === true,
            operationalProofPresent: liveReadiness.checks?.operationalProofPresent === true,
            operationalProofFresh: liveReadiness.checks?.operationalProofFresh === true,
            liveExecutionPathReady: liveReadiness.checks?.liveExecutionPathReady === true,
          },
          operationalProof: operationalProof
            ? {
                generatedAt: operationalProof.generatedAt ?? null,
                accountFeesConfirmed: operationalProof.accountFeesConfirmed === true,
                inventoryReady: operationalProof.inventoryReady === true,
                hedgeVenueReady: operationalProof.hedgeVenueReady === true,
                missingSecrets: uniqueStrings([
                  ...(operationalProof.details?.missingSecrets ?? []),
                  ...(liveReadiness.nextOperationalSteps ?? []).flatMap((step) => step.missingSecrets ?? []),
                ]),
                reasons: operationalProof.reasons ?? [],
                requirements: operationalProof.requirements ?? null,
                deficits: operationalProof.deficits ?? null,
                feeBudget: operationalProof.details?.feeBudget ?? null,
              }
            : null,
          nextOperationalSteps: (liveReadiness.nextOperationalSteps ?? []).map((step) => ({
            action: step.action ?? null,
            reason: step.reason ?? null,
            missingSecrets: step.missingSecrets ?? [],
            requirements: step.requirements ?? null,
            deficits: step.deficits ?? null,
          })),
        }
      : null,
	    processAlignment: processAlignment
	      ? {
	          status: processAlignment.status ?? null,
	          aligned: processAlignment.aligned === true,
	          violationCount: processAlignment.violationCount ?? null,
	          processCount: processAlignment.processCount ?? null,
	          onlineCount: processAlignment.processHealth?.onlineCount ?? null,
	          waitingRestartCount: processAlignment.processHealth?.waitingRestartCount ?? null,
	          expectedLoopingObserverCount:
	            processAlignment.processHealth?.expectedLoopingObserverCount ?? null,
	          unstableRestartProcessCount:
	            processAlignment.processHealth?.unstableRestartProcessCount ?? null,
	          maxRestartDelayMs: processAlignment.processHealth?.maxRestartDelayMs ?? null,
	          processHealth: processAlignment.processHealth ?? null,
	        }
	      : null,
	    missingRequirements,
	    missingRequirementCount: completionAuditSummary.missingRequirementCount,
	    missingRequirementClassification: completionAuditSummary.missingRequirementClassification,
	    missingRequirementClassificationCounts: completionAuditSummary.missingRequirementClassificationCounts,
	    outstandingWorkCounts: completionAuditSummary.outstandingWorkCounts,
	    completionAuditSummary,
	    sourceCompletionAuditSummary,
	    completionAuditScopeComparison,
    goalCompletionAuditView,
    nextWorkClassification: finalNextWorkClassification,
    checkpointPlan,
    strategyResearchHandoff,
    autonomousEvidenceHandoff,
    operatorLiveReadinessHandoff,
    marketConditionHandoff,
    nextAutonomousWork,
    nextOperatorWork,
    nextMarketConditionWork,
    nextRequiredOperatorWork: nextOperatorWork,
    interpretation: completionAchieved
      ? "The live objective is achieved and live startup review is allowed by the gate."
      : "The live objective is not achieved; continue the selected research focus and keep live startup blocked until all readiness, funding-span, fee, inventory, hedge, credential, and process-alignment gates pass.",
  };

  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (args.checkpointOnly || !args.quiet || args.outputPath === null) {
    const stdoutReport = args.checkpointOnly
      ? {
          generatedAt: report.generatedAt,
	          status: report.status,
	          achieved: report.achieved,
          failedCompletionCriteria: completionAuditSummary.failedCompletionCriteria,
          sourceCompletionAuditSummary,
          completionAuditScopeComparison,
	          missingRequirements: completionAuditSummary.missingRequirements,
	          missingRequirementCount: completionAuditSummary.missingRequirementCount,
	          missingRequirementClassification: completionAuditSummary.missingRequirementClassification,
	          missingRequirementClassificationCounts: completionAuditSummary.missingRequirementClassificationCounts,
	          outstandingWorkCounts: completionAuditSummary.outstandingWorkCounts,
          live: report.live,
	          profitability: report.profitability,
	          checkpointPlan: report.checkpointPlan,
	          strategyResearchHandoff: report.strategyResearchHandoff,
	          autonomousEvidenceHandoff: report.autonomousEvidenceHandoff,
	          operatorLiveReadinessHandoff: report.operatorLiveReadinessHandoff,
	          marketConditionHandoff: report.marketConditionHandoff,
	          nextAutonomousWork: report.nextAutonomousWork,
          nextRequiredOperatorWork: report.nextRequiredOperatorWork,
          nextMarketConditionWork: report.nextMarketConditionWork,
          interpretation: report.interpretation,
        }
      : report;
    process.stdout.write(`${JSON.stringify(stdoutReport, null, 2)}\n`);
  }

  if (args.requireLiveReady && !completionAchieved) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
