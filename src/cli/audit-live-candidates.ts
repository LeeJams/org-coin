import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface CandidateArg {
  label: string;
  reportsRoot: string;
}

interface Args {
  baselineReportsRoot: string | null;
  candidates: CandidateArg[];
  exitAttributionSupplements: CandidateArg[];
  entryFilterReplaySupplements: CandidateArg[];
  outputPath: string | null;
  requireLiveReady: boolean;
  requireObservationReady: boolean;
  requirePaperCandidate: boolean;
  summaryOnly: boolean;
}

interface DryRunSummary {
  source: {
    reportsRoot: string;
    cyclesPath: string | null;
  };
  cycleSummary: {
    evidenceAvailable?: boolean;
    failed?: number;
    observedCycleIntervalSeconds?: number | null;
    observedCycleIntervalSampleCount?: number;
    observedCompletedCycleDurationSeconds?: number | null;
    observedCompletedCycleDurationSampleCount?: number;
    failureMessages?: Record<string, number>;
    failureKinds?: Record<string, number>;
    latestFailure?: {
      cycle?: number;
      startedAt?: string;
      failedAt?: string;
      message: string;
      failureKind?: string;
      command?: {
        label?: string;
        status?: number;
        stdoutTail?: string[];
        stderrTail?: string[];
        failureKind?: string;
      };
    } | null;
    consecutiveCompletedSinceLatestFailure?: number;
    completionRate: number | null;
  };
  sessionCount: number;
  tradedSessionCount: number;
  allSessions: {
    totalPnlKrw: number;
    openPositionSessions: number;
  };
  tradedSessionsOnly: {
    totalPnlKrw: number;
  };
  closedTradesOnly: {
    closedTradeCount: number;
    totalPnlKrw: number;
  };
  btcBuyHoldBenchmark: {
    totalExcessPnlKrw: number;
    excessReturnInformationRatio: number | null;
  };
  btcTrendExposure: {
    benchmarkedSessionCount: number;
    positiveBenchmarkSessionCount: number;
    negativeBenchmarkSessionCount: number;
    positiveBenchmarkSessionRate: number | null;
    positiveBenchmarkPnlKrw: number;
    strategyPnlInPositiveBenchmarkWindowsKrw: number;
    missedPositiveBenchmarkPnlKrw: number;
    positiveWindowCaptureRatio: number | null;
    positiveWindowTradeCount: number;
    positiveWindowSignalCount: number;
    positiveWindowNoSignalSessionCount: number;
    positiveWindowNoFillSessionCount: number;
    positiveWindowSuppressionCounts: Record<string, number>;
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
    negativeBenchmarkSessionRate?: number | null;
    negativeBenchmarkPnlKrw: number;
    strategyPnlInNegativeBenchmarkWindowsKrw: number;
    negativeWindowAvoidedLossKrw: number;
    negativeWindowAvoidedLossRatio?: number | null;
    negativeWindowTradeCount?: number;
    negativeWindowSignalCount?: number;
    negativeWindowNoSignalSessionCount?: number;
    negativeWindowNoFillSessionCount?: number;
    negativeWindowSuppressionCounts?: Record<string, number>;
    negativeWindowGateFailureStats?: Record<
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
  exitQuality: {
    exitReasonProfitability: Record<
      string,
      {
        sessionCount: number;
        totalPnlKrw: number;
        avgPnlKrw: number | null;
        losingSessions: number;
        profitableSessions: number;
      }
    >;
    losingExitReasons: Array<{
      reasonCode: string;
      sessionCount: number;
      totalPnlKrw: number;
      avgPnlKrw: number | null;
      losingSessions: number;
      profitableSessions: number;
    }>;
    exitAttribution: {
      sellFillSessionCount: number;
      attributedExitReasonSessionCount: number;
      missingExitReasonSessionCount: number;
      missingExitReasonSellFillCount: number;
      missingExitReasonPnlKrw: number;
      missingExitReasonSessions: Array<{
        generatedAt: string;
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
  lossCauseExperiments: {
    feeHurdle?: {
      current: {
        sessionCount: number;
        totalPnlKrw: number;
        grossFeesPaidKrw: number;
        grossPnlBeforeFeesKrw: number;
      };
      zeroFeeSensitivity: {
        grossPnlBeforeFeesKrw: number;
        wouldStillLoseWithoutFees: boolean;
        feeDragShareOfNetLoss: number | null;
      };
      currentFeeBreakevenMultiple: number | null;
      requiredGrossEdgeToPayObservedFeesBps: number | null;
    };
    entryInactivity?: {
      zeroSignalSessions: number;
      zeroSignalSessionRate: number;
      latestInactiveSessionCount: number;
      entryEvaluationBucketCount: number;
      entrySuppressedCandidateCount: number;
      suppressionCounts: Record<string, number>;
      gateFailureStats: Record<
        string,
        {
          count: number;
          avgActual: number;
          avgThreshold: number;
          avgDeficit: number;
          maxDeficit: number;
          nearMissCount: number;
          nearMissRate: number;
        }
      >;
    };
    timeStopExit?: {
      affected?: {
        sessionCount: number;
        totalPnlKrw: number;
      };
    };
  };
  liveReadiness: {
    paperOnlyRecommended: boolean;
    checks: Record<string, boolean>;
    reasons: string[];
  };
  strategyAssessment: {
    classification: string;
  };
}

interface ExitAttributionSupplement {
  generatedAt?: string;
  source?: {
    reportsRoot?: string;
    runIdsFile?: string;
  };
  replay?: {
    sessionCount?: number;
    sellFillSessionCount?: number;
    missingExitReasonSessionCount?: number;
    totalSellSessionPnlKrw?: number;
  };
  recoveredSellSessions?: Array<{
    generatedAt?: string;
    sessionId?: string;
    sourceRunId?: string | null;
    reportPath?: string;
    sellFillCount?: number;
    exitReasonCodes?: string[];
    pnlKrw?: number;
  }>;
}

interface AppliedExitAttributionSupplement {
  path: string;
  generatedAt: string | null;
  sourceReportsRoot: string | null;
  matchedMissingSessionCount: number;
  matchedSourceRunIds: string[];
  matchedSellFillCount: number;
  matchedPnlKrw: number | null;
  unmatchedRecoveredSessionCount: number;
  remainingMissingSessionCount: number;
  reasonSummary: Record<
    string,
    {
      sessionCount: number;
      totalPnlKrw: number | null;
      avgPnlKrw: number | null;
      losingSessions: number;
      profitableSessions: number;
    }
  >;
}

interface PairedComparison {
  pairing: {
    pairedSessionCount: number;
    missingCandidateRunIds: string[];
    missingBaselineRunIds: string[];
  };
  allPairs: {
    delta: {
      totalPnlKrw: number;
      totalExcessPnlKrw: number;
      tradedSessionCount: number;
      closedSessionCount: number;
      openPositionSessions: number;
    };
  };
  focusCohort: {
    focusExitReason: string;
    pairedSessionCount: number;
    delta: {
      totalPnlKrw: number;
      totalExcessPnlKrw: number;
    };
    openRiskMigration: {
      candidateOpenPositionSessions: number;
      candidateOpenMarkedPnlKrw: number;
    };
    supportsExitChange: boolean;
  };
  liveEvidence: {
    supportsLivePromotion: boolean;
    reasons: string[];
  };
}

interface OutcomeSummary {
  sampleCount: number;
  markedSampleCount: number;
  unmarkedSampleCount: number;
  markCoverageRate: number | null;
  totalNotionalKrw: number | null;
  totalPnlKrw: number | null;
  totalBtcBenchmarkPnlKrw: number | null;
  totalBtcExcessPnlKrw: number | null;
  averagePnlKrw: number | null;
  medianPnlKrw: number | null;
  averageBtcExcessPnlKrw: number | null;
  medianBtcExcessPnlKrw: number | null;
  totalReturnPct: number | null;
  averageReturnPct: number | null;
  medianReturnPct: number | null;
  winners: number;
  losers: number;
}

interface MissedPositiveBtcWindowSummary {
  sampleCount: number;
  markedSampleCount: number;
  count: number;
  shadowPnlKrw: number | null;
  btcBenchmarkPnlKrw: number | null;
  btcExcessPnlKrw: number | null;
  shadowCaptureRatio: number | null;
  stalePositiveOpportunityCount: number;
}

interface SuppressedOpportunityAnalysis {
  sampleCount: number;
  horizons: {
    plus5m: OutcomeSummary;
    plus15m: OutcomeSummary;
    latest: OutcomeSummary;
  };
  missedPositiveBtcWindows: {
    plus5m: MissedPositiveBtcWindowSummary;
    plus15m: MissedPositiveBtcWindowSummary;
    latest: MissedPositiveBtcWindowSummary;
  };
  opportunityAssessment: {
    classification: string;
    supportsLooseningEntry: boolean;
    reasons: string[];
  };
  bySuppressionReason: Record<
    string,
    {
      plus5m: OutcomeSummary;
      plus15m: OutcomeSummary;
      latest: OutcomeSummary;
    }
  >;
  byFailingGate: Record<
    string,
    {
      plus5m: OutcomeSummary;
      plus15m: OutcomeSummary;
      latest: OutcomeSummary;
    }
  >;
}

interface ExitReasonPathDiagnostic {
  count: number;
  totalPnlKrw: number;
  winners: number;
  losers: number;
  losingImmediateAdverseCount: number;
  losingImmediateAdversePnlKrw: number;
  losingGaveBackPositiveMfeCount: number;
  losingGaveBackPositiveMfePnlKrw: number;
  losingOtherCount: number;
  losingOtherPnlKrw: number;
  dominantLosingPath:
    | "immediate_adverse"
    | "gave_back_positive_mfe"
    | "other_losing_path"
    | null;
}

interface TradeCohortSummary {
  count: number;
  totalPnlKrw: number;
  averagePnlKrw: number | null;
  medianPnlKrw: number | null;
  winners: number;
  losers: number;
  averageMfeKrw: number | null;
  averageMaeKrw: number | null;
  averageMfeBps: number | null;
  averageMaeBps: number | null;
  gaveBackPositiveMfeCount: number;
  immediateAdverseCount: number;
}

interface FeatureThresholdCandidate {
  feature: string;
  direction: ">=" | "<=";
  threshold: number;
  selected: TradeCohortSummary;
  skipped: TradeCohortSummary;
  selectedAveragePnlLiftKrw: number | null;
}

interface TradePathAnalysis {
  source: {
    reportsRoot: string;
    reportCount: number;
  };
  allClosedTrades: {
    count: number;
    totalPnlKrw: number;
  };
  exitReasonPathDiagnostics: Record<string, ExitReasonPathDiagnostic>;
  entryFeatureDiagnostics: {
    thresholdExperimentReadiness: {
      classification: string;
      eligibleForReplayExperiment: boolean;
      positiveThresholdCandidateCount: number;
      reasons: string[];
      bestPositiveThresholdCandidate: FeatureThresholdCandidate | null;
    };
  };
}

interface AuditedCandidate {
  label: string;
  classification: string;
  cycleEvidenceAvailable: boolean;
  liveReady: boolean;
  sessionCount: number;
  tradedSessionCount: number;
  closedTradeCount: number;
  openPositionSessions: number;
  totalPnlKrw: number | null;
  tradedPnlKrw: number | null;
  closedTradePnlKrw: number | null;
  totalExcessPnlKrw: number | null;
  excessReturnInformationRatio: number | null;
  exitRisk: {
    topLosingExitReasons: Array<{
      reasonCode: string;
      sessionCount: number;
      totalPnlKrw: number | null;
      avgPnlKrw: number | null;
      losingSessions: number;
      profitableSessions: number;
    }>;
    worstExitReason: string | null;
  };
  exitAttribution: {
    sellFillSessionCount: number;
    attributedExitReasonSessionCount: number;
    missingExitReasonSessionCount: number;
    missingExitReasonSellFillCount: number;
    missingExitReasonPnlKrw: number | null;
    missingExitReasonSessions: Array<{
      generatedAt: string;
      sessionId: string;
      sourceRunId: string | null;
      reportPath: string;
      scenarioPath: string | null;
      sellFillCount: number;
      sellFillQuoteNotionalKrw: number | null;
      markedPnlKrw: number | null;
      exitSignalIds: string[];
    }>;
  };
  feeHurdle: {
    tradedSessionCount: number;
    netPnlKrw: number | null;
    grossPnlBeforeFeesKrw: number | null;
    grossFeesPaidKrw: number | null;
    wouldStillLoseWithoutFees: boolean | null;
    feeDragShareOfNetLoss: number | null;
    currentFeeBreakevenMultiple: number | null;
    requiredGrossEdgeToPayObservedFeesBps: number | null;
  } | null;
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
      needsPositiveBtcExcess: boolean;
    };
    cycleRecovery: {
      additionalCompletedCyclesNeeded: number;
      observedCycleIntervalSeconds: number | null;
      observedCycleIntervalSampleCount: number;
      observedCompletedCycleDurationSeconds: number | null;
      observedCompletedCycleDurationSampleCount: number;
      estimatedRecoveryWaitMinutes: number | null;
    };
    cycleFailures: {
      failed: number;
      failureMessages: Record<string, number>;
      failureKinds: Record<string, number>;
      latestFailure: {
        cycle?: number;
        failedAt?: string;
        message: string;
        failureKind?: string;
      } | null;
    };
    operationalRisk: {
      hasOpenPositionBlocker: boolean;
      hasOpenMarkProfitDependency: boolean;
    };
  };
  suppressedOpportunity: {
    opportunityAssessment: {
      classification: string;
      supportsLooseningEntry: boolean;
    };
  };
  tradePathDiagnostics: {
    experimentType: string;
    reportCount: number;
    reconstructedClosedTradeCount: number;
    reconstructedClosedTradePnlKrw: number | null;
    thresholdExperimentReadiness: {
      classification: string;
      eligibleForReplayExperiment: boolean;
      positiveThresholdCandidateCount: number;
      reasons: string[];
      bestPositiveThresholdCandidate: FeatureThresholdCandidate | null;
    };
    topLosingExitPaths: Array<{
      reasonCode: string;
      count: number;
      totalPnlKrw: number | null;
      winners: number;
      losers: number;
      losingImmediateAdverseCount: number;
      losingImmediateAdversePnlKrw: number | null;
      losingGaveBackPositiveMfeCount: number;
      losingGaveBackPositiveMfePnlKrw: number | null;
      losingOtherCount: number;
      losingOtherPnlKrw: number | null;
      dominantLosingPath:
        | "immediate_adverse"
        | "gave_back_positive_mfe"
        | "other_losing_path"
        | null;
    }>;
  };
  exitAttributionSupplement?: AppliedExitAttributionSupplement | null;
  entryFilterReplaySupplement?: EntryFilterReplaySupplementSummary | null;
}

interface EntryFilterReplaySupplementSummary {
  path: string;
  generatedAt: string | null;
  candidateLabels: string[];
  liveReadyLabels: string[];
  profitablePaperLabels: string[];
  nextPaperCandidate: string | null;
  replayPassedPromotionGate: boolean;
  invalidatesReplayCandidate: boolean;
  reasons: string[];
  replayCandidates: Array<{
    label: string;
    sessionCount: number | null;
    tradedSessionCount: number | null;
    closedTradeCount: number | null;
    totalPnlKrw: number | null;
    closedTradePnlKrw: number | null;
  }>;
}

function parseCandidate(value: string, cwd: string): CandidateArg {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex > 0) {
    const label = value.slice(0, separatorIndex).trim();
    const reportsRoot = value.slice(separatorIndex + 1).trim();
    if (!label || !reportsRoot) {
      throw new Error(`invalid --candidate value: ${value}`);
    }
    return {
      label,
      reportsRoot: resolve(cwd, reportsRoot),
    };
  }

  const reportsRoot = resolve(cwd, value);
  return {
    label: basename(reportsRoot),
    reportsRoot,
  };
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baselineReportsRoot: null,
    candidates: [],
    exitAttributionSupplements: [],
    entryFilterReplaySupplements: [],
    outputPath: null,
    requireLiveReady: false,
    requireObservationReady: false,
    requirePaperCandidate: false,
    summaryOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--require-live-ready") {
      args.requireLiveReady = true;
      continue;
    }

    if (arg === "--require-observation-ready") {
      args.requireObservationReady = true;
      continue;
    }

    if (arg === "--require-paper-candidate") {
      args.requirePaperCandidate = true;
      continue;
    }

    if (arg === "--summary-only") {
      args.summaryOnly = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value`);
    }

    if (arg === "--baseline-reports-root") {
      args.baselineReportsRoot = resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--candidate" || arg === "--candidate-reports-root") {
      args.candidates.push(parseCandidate(value, cwd));
      index += 1;
      continue;
    }

    if (arg === "--exit-attribution-supplement") {
      args.exitAttributionSupplements.push(parseCandidate(value, cwd));
      index += 1;
      continue;
    }

    if (arg === "--entry-filter-replay-supplement") {
      args.entryFilterReplaySupplements.push(parseCandidate(value, cwd));
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.candidates.length === 0) {
    throw new Error("at least one --candidate is required");
  }

  return args;
}

async function runJson<T>(scriptName: string, args: string[]): Promise<T> {
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), scriptName);
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function round(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(6))
    : null;
}

function addReasonSummary(
  summaries: Map<
    string,
    {
      sessionCount: number;
      totalPnlKrw: number;
      losingSessions: number;
      profitableSessions: number;
    }
  >,
  reasonCode: string,
  pnlKrw: number,
): void {
  const current =
    summaries.get(reasonCode) ?? {
      sessionCount: 0,
      totalPnlKrw: 0,
      losingSessions: 0,
      profitableSessions: 0,
    };
  current.sessionCount += 1;
  current.totalPnlKrw += pnlKrw;
  if (pnlKrw < -1e-12) {
    current.losingSessions += 1;
  } else if (pnlKrw > 1e-12) {
    current.profitableSessions += 1;
  }
  summaries.set(reasonCode, current);
}

function formatReasonSummary(
  summaries: Map<
    string,
    {
      sessionCount: number;
      totalPnlKrw: number;
      losingSessions: number;
      profitableSessions: number;
    }
  >,
) {
  return Object.fromEntries(
    [...summaries.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([reasonCode, summary]) => [
        reasonCode,
        {
          sessionCount: summary.sessionCount,
          totalPnlKrw: round(summary.totalPnlKrw),
          avgPnlKrw: round(
            summary.sessionCount > 0
              ? summary.totalPnlKrw / summary.sessionCount
              : null,
          ),
          losingSessions: summary.losingSessions,
          profitableSessions: summary.profitableSessions,
        },
      ]),
  );
}

function applyExitAttributionSupplement(
  exitQuality: DryRunSummary["exitQuality"],
  supplement: ExitAttributionSupplement,
  supplementPath: string,
): AppliedExitAttributionSupplement {
  const missingByRunId = new Map(
    exitQuality.exitAttribution.missingExitReasonSessions
      .filter(
        (session) =>
          typeof session.sourceRunId === "string" &&
          session.sourceRunId.length > 0,
      )
      .map((session) => [session.sourceRunId as string, session] as const),
  );
  const matchedRunIds = new Set<string>();
  const reasonSummaries = new Map<
    string,
    {
      sessionCount: number;
      totalPnlKrw: number;
      losingSessions: number;
      profitableSessions: number;
    }
  >();
  let matchedSellFillCount = 0;
  let matchedPnlKrw = 0;
  let unmatchedRecoveredSessionCount = 0;

  for (const recovered of supplement.recoveredSellSessions ?? []) {
    const sourceRunId = recovered.sourceRunId;
    const reasonCodes = recovered.exitReasonCodes ?? [];
    if (
      typeof sourceRunId !== "string" ||
      sourceRunId.length === 0 ||
      reasonCodes.length === 0 ||
      matchedRunIds.has(sourceRunId)
    ) {
      unmatchedRecoveredSessionCount += 1;
      continue;
    }
    const missingSession = missingByRunId.get(sourceRunId);
    if (!missingSession) {
      unmatchedRecoveredSessionCount += 1;
      continue;
    }

    matchedRunIds.add(sourceRunId);
    matchedSellFillCount += missingSession.sellFillCount;
    matchedPnlKrw += missingSession.markedPnlKrw;
    for (const reasonCode of reasonCodes) {
      if (reasonCode.length > 0) {
        addReasonSummary(reasonSummaries, reasonCode, missingSession.markedPnlKrw);
      }
    }
  }

  return {
    path: supplementPath,
    generatedAt:
      typeof supplement.generatedAt === "string" ? supplement.generatedAt : null,
    sourceReportsRoot:
      typeof supplement.source?.reportsRoot === "string"
        ? supplement.source.reportsRoot
        : null,
    matchedMissingSessionCount: matchedRunIds.size,
    matchedSourceRunIds: [...matchedRunIds].sort(),
    matchedSellFillCount,
    matchedPnlKrw: round(matchedPnlKrw),
    unmatchedRecoveredSessionCount,
    remainingMissingSessionCount:
      exitQuality.exitAttribution.missingExitReasonSessionCount -
      matchedRunIds.size,
    reasonSummary: formatReasonSummary(reasonSummaries),
  };
}

function summarizeEntryInactivity(
  entryInactivity: DryRunSummary["lossCauseExperiments"]["entryInactivity"],
) {
  if (!entryInactivity) {
    return null;
  }

  return {
    zeroSignalSessions: entryInactivity.zeroSignalSessions,
    zeroSignalSessionRate: round(entryInactivity.zeroSignalSessionRate),
    latestInactiveSessionCount: entryInactivity.latestInactiveSessionCount,
    entryEvaluationBucketCount: entryInactivity.entryEvaluationBucketCount,
    entrySuppressedCandidateCount: entryInactivity.entrySuppressedCandidateCount,
    suppressionCounts: entryInactivity.suppressionCounts,
    topGateFailures: Object.entries(entryInactivity.gateFailureStats)
      .sort((left, right) => right[1].count - left[1].count)
      .slice(0, 3)
      .map(([gate, stats]) => ({
        gate,
        count: stats.count,
        avgActual: round(stats.avgActual),
        avgThreshold: round(stats.avgThreshold),
        avgDeficit: round(stats.avgDeficit),
        maxDeficit: round(stats.maxDeficit),
        nearMissCount: stats.nearMissCount,
        nearMissRate: round(stats.nearMissRate),
      })),
  };
}

function summarizeBtcTrendExposure(
  btcTrendExposure: DryRunSummary["btcTrendExposure"],
) {
  return {
    benchmarkedSessionCount: btcTrendExposure.benchmarkedSessionCount,
    positiveBenchmarkSessionCount:
      btcTrendExposure.positiveBenchmarkSessionCount,
    negativeBenchmarkSessionCount:
      btcTrendExposure.negativeBenchmarkSessionCount,
    positiveBenchmarkSessionRate: round(
      btcTrendExposure.positiveBenchmarkSessionRate,
    ),
    positiveBenchmarkPnlKrw: round(btcTrendExposure.positiveBenchmarkPnlKrw),
    strategyPnlInPositiveBenchmarkWindowsKrw: round(
      btcTrendExposure.strategyPnlInPositiveBenchmarkWindowsKrw,
    ),
    missedPositiveBenchmarkPnlKrw: round(
      btcTrendExposure.missedPositiveBenchmarkPnlKrw,
    ),
    positiveWindowCaptureRatio: round(
      btcTrendExposure.positiveWindowCaptureRatio,
    ),
    positiveWindowTradeCount: btcTrendExposure.positiveWindowTradeCount,
    positiveWindowSignalCount: btcTrendExposure.positiveWindowSignalCount,
    positiveWindowNoSignalSessionCount:
      btcTrendExposure.positiveWindowNoSignalSessionCount,
    positiveWindowNoFillSessionCount:
      btcTrendExposure.positiveWindowNoFillSessionCount,
    positiveWindowSuppressionCounts:
      btcTrendExposure.positiveWindowSuppressionCounts,
    positiveWindowTopGateFailures: Object.entries(
      btcTrendExposure.positiveWindowGateFailureStats,
    )
      .sort((left, right) => right[1].count - left[1].count)
      .slice(0, 3)
      .map(([gate, stats]) => ({
        gate,
        count: stats.count,
        avgActual: round(stats.avgActual),
        avgThreshold: round(stats.avgThreshold),
        avgDeficit: round(stats.avgDeficit),
        maxDeficit: round(stats.maxDeficit),
        nearMissCount: stats.nearMissCount ?? 0,
        nearMissRate: round(stats.nearMissRate ?? 0),
      })),
    negativeBenchmarkPnlKrw: round(btcTrendExposure.negativeBenchmarkPnlKrw),
    negativeBenchmarkSessionRate: round(
      btcTrendExposure.negativeBenchmarkSessionRate,
    ),
    strategyPnlInNegativeBenchmarkWindowsKrw: round(
      btcTrendExposure.strategyPnlInNegativeBenchmarkWindowsKrw,
    ),
    negativeWindowAvoidedLossKrw: round(
      btcTrendExposure.negativeWindowAvoidedLossKrw,
    ),
    negativeWindowAvoidedLossRatio: round(
      btcTrendExposure.negativeWindowAvoidedLossRatio,
    ),
    negativeWindowTradeCount: btcTrendExposure.negativeWindowTradeCount ?? 0,
    negativeWindowSignalCount: btcTrendExposure.negativeWindowSignalCount ?? 0,
    negativeWindowNoSignalSessionCount:
      btcTrendExposure.negativeWindowNoSignalSessionCount ?? 0,
    negativeWindowNoFillSessionCount:
      btcTrendExposure.negativeWindowNoFillSessionCount ?? 0,
    negativeWindowSuppressionCounts:
      btcTrendExposure.negativeWindowSuppressionCounts ?? {},
    negativeWindowTopGateFailures: Object.entries(
      btcTrendExposure.negativeWindowGateFailureStats ?? {},
    )
      .sort((left, right) => right[1].count - left[1].count)
      .slice(0, 3)
      .map(([gate, stats]) => ({
        gate,
        count: stats.count,
        avgActual: round(stats.avgActual),
        avgThreshold: round(stats.avgThreshold),
        avgDeficit: round(stats.avgDeficit),
        maxDeficit: round(stats.maxDeficit),
        nearMissCount: stats.nearMissCount ?? 0,
        nearMissRate: round(stats.nearMissRate ?? 0),
      })),
  };
}

function summarizeExitRisk(
  exitQuality: DryRunSummary["exitQuality"],
  supplement: AppliedExitAttributionSupplement | null = null,
) {
  const profitabilityByReason = new Map(
    Object.entries(exitQuality.exitReasonProfitability).map(
      ([reasonCode, summary]) =>
        [
          reasonCode,
          {
            sessionCount: summary.sessionCount,
            totalPnlKrw: summary.totalPnlKrw,
            losingSessions: summary.losingSessions,
            profitableSessions: summary.profitableSessions,
          },
        ] as const,
    ),
  );
  if (supplement) {
    for (const [reasonCode, summary] of Object.entries(
      supplement.reasonSummary,
    )) {
      const current =
        profitabilityByReason.get(reasonCode) ?? {
          sessionCount: 0,
          totalPnlKrw: 0,
          losingSessions: 0,
          profitableSessions: 0,
        };
      profitabilityByReason.set(reasonCode, {
        sessionCount: current.sessionCount + summary.sessionCount,
        totalPnlKrw: current.totalPnlKrw + (summary.totalPnlKrw ?? 0),
        losingSessions: current.losingSessions + summary.losingSessions,
        profitableSessions:
          current.profitableSessions + summary.profitableSessions,
      });
    }
  }
  const losingExitReasons =
    supplement === null && exitQuality.losingExitReasons.length > 0
      ? exitQuality.losingExitReasons
      : [...profitabilityByReason.entries()]
          .filter(
            ([reasonCode, summary]) =>
              summary.totalPnlKrw < 0 &&
              (supplement === null ||
                (reasonCode !== "UNKNOWN_EXIT_REASON" &&
                  summary.sessionCount >= 5)),
          )
          .map(([reasonCode, summary]) => ({
            reasonCode,
            sessionCount: summary.sessionCount,
            totalPnlKrw: summary.totalPnlKrw,
            avgPnlKrw:
              summary.sessionCount > 0
                ? summary.totalPnlKrw / summary.sessionCount
                : null,
            losingSessions: summary.losingSessions,
            profitableSessions: summary.profitableSessions,
          }));

  const topLosingExitReasons = losingExitReasons
    .sort((left, right) => left.totalPnlKrw - right.totalPnlKrw)
    .slice(0, 3)
    .map((summary) => ({
      reasonCode: summary.reasonCode,
      sessionCount: summary.sessionCount,
      totalPnlKrw: round(summary.totalPnlKrw),
      avgPnlKrw: round(summary.avgPnlKrw),
      losingSessions: summary.losingSessions,
      profitableSessions: summary.profitableSessions,
    }));

  return {
    topLosingExitReasons,
    worstExitReason: topLosingExitReasons.at(0)?.reasonCode ?? null,
  };
}

function summarizeExitAttribution(
  exitQuality: DryRunSummary["exitQuality"],
  supplement: AppliedExitAttributionSupplement | null = null,
) {
  const matchedRunIds = new Set(supplement?.matchedSourceRunIds ?? []);
  const remainingMissingSessions = supplement
    ? exitQuality.exitAttribution.missingExitReasonSessions.filter(
        (session) =>
          typeof session.sourceRunId !== "string" ||
          !matchedRunIds.has(session.sourceRunId),
      )
    : exitQuality.exitAttribution.missingExitReasonSessions;
  const matchedSellFillCount = supplement?.matchedSellFillCount ?? 0;
  const matchedPnlKrw = supplement?.matchedPnlKrw ?? 0;

  return {
    sellFillSessionCount: exitQuality.exitAttribution.sellFillSessionCount,
    attributedExitReasonSessionCount:
      exitQuality.exitAttribution.attributedExitReasonSessionCount +
      (supplement?.matchedMissingSessionCount ?? 0),
    missingExitReasonSessionCount:
      exitQuality.exitAttribution.missingExitReasonSessionCount -
      (supplement?.matchedMissingSessionCount ?? 0),
    missingExitReasonSellFillCount:
      exitQuality.exitAttribution.missingExitReasonSellFillCount -
      matchedSellFillCount,
    missingExitReasonPnlKrw: round(
      exitQuality.exitAttribution.missingExitReasonPnlKrw - matchedPnlKrw,
    ),
    missingExitReasonSessions:
      remainingMissingSessions.map((session) => ({
        ...session,
        sellFillQuoteNotionalKrw: round(session.sellFillQuoteNotionalKrw),
        markedPnlKrw: round(session.markedPnlKrw),
      })),
  };
}

function summarizeFeeHurdle(
  feeHurdle: DryRunSummary["lossCauseExperiments"]["feeHurdle"],
) {
  if (!feeHurdle || feeHurdle.current.sessionCount === 0) {
    return null;
  }

  return {
    tradedSessionCount: feeHurdle.current.sessionCount,
    netPnlKrw: round(feeHurdle.current.totalPnlKrw),
    grossPnlBeforeFeesKrw: round(feeHurdle.current.grossPnlBeforeFeesKrw),
    grossFeesPaidKrw: round(feeHurdle.current.grossFeesPaidKrw),
    wouldStillLoseWithoutFees:
      feeHurdle.zeroFeeSensitivity.wouldStillLoseWithoutFees,
    feeDragShareOfNetLoss: round(
      feeHurdle.zeroFeeSensitivity.feeDragShareOfNetLoss,
    ),
    currentFeeBreakevenMultiple: round(
      feeHurdle.currentFeeBreakevenMultiple,
    ),
    requiredGrossEdgeToPayObservedFeesBps: round(
      feeHurdle.requiredGrossEdgeToPayObservedFeesBps,
    ),
  };
}

function summarizeEvidenceGaps(
  summary: DryRunSummary,
  supplement: AppliedExitAttributionSupplement | null = null,
) {
  const checks = summary.liveReadiness.checks;
  const failedCycleCount = summary.cycleSummary.failed ?? 0;
  const completedSinceLatestFailure =
    summary.cycleSummary.consecutiveCompletedSinceLatestFailure ?? 0;
  const completedCyclesAfterFailureNeeded =
    summary.cycleSummary.evidenceAvailable === false || failedCycleCount === 0
      ? 0
      : Math.max(0, 30 - completedSinceLatestFailure);

  return {
    failedChecks: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([check]) => check)
      .filter(
        (check) =>
          check !== "noMissingExitReasonAttribution" ||
          supplement?.remainingMissingSessionCount !== 0,
      )
      .sort(),
    minimumClosedTrades: {
      required: 30,
      observed: summary.closedTradesOnly.closedTradeCount,
      additionalNeeded: Math.max(
        0,
        30 - summary.closedTradesOnly.closedTradeCount,
      ),
    },
    pnl: {
      tradedPnlKrw: round(summary.tradedSessionsOnly.totalPnlKrw),
      closedTradePnlKrw: round(summary.closedTradesOnly.totalPnlKrw),
      totalExcessPnlKrw: round(summary.btcBuyHoldBenchmark.totalExcessPnlKrw),
      needsPositiveTradedPnl: !checks.positiveTradedPnl,
      needsPositiveClosedTradePnl: !checks.positiveClosedTradePnl,
      needsPositiveBtcExcess: !checks.beatsBtcBuyAndHold,
    },
    cycleRecovery: {
      evidenceAvailable: summary.cycleSummary.evidenceAvailable ?? true,
      completionRate: round(summary.cycleSummary.completionRate),
      completedSinceLatestFailure,
      requiredCompletedSinceFailure:
        summary.cycleSummary.evidenceAvailable === false || failedCycleCount === 0
          ? 0
          : 30,
      additionalCompletedCyclesNeeded: completedCyclesAfterFailureNeeded,
      observedCycleIntervalSeconds: round(
        summary.cycleSummary.observedCycleIntervalSeconds,
      ),
      observedCycleIntervalSampleCount:
        summary.cycleSummary.observedCycleIntervalSampleCount ?? 0,
      observedCompletedCycleDurationSeconds: round(
        summary.cycleSummary.observedCompletedCycleDurationSeconds,
      ),
      observedCompletedCycleDurationSampleCount:
        summary.cycleSummary.observedCompletedCycleDurationSampleCount ?? 0,
      estimatedRecoveryWaitMinutes:
        completedCyclesAfterFailureNeeded > 0 &&
        typeof summary.cycleSummary.observedCycleIntervalSeconds === "number" &&
        Number.isFinite(summary.cycleSummary.observedCycleIntervalSeconds) &&
        summary.cycleSummary.observedCycleIntervalSeconds > 0
          ? round(
              (completedCyclesAfterFailureNeeded *
                summary.cycleSummary.observedCycleIntervalSeconds) /
                60,
            )
          : null,
    },
    cycleFailures: {
      failed: failedCycleCount,
      failureMessages: summary.cycleSummary.failureMessages ?? {},
      failureKinds: summary.cycleSummary.failureKinds ?? {},
      latestFailure: summary.cycleSummary.latestFailure
        ? {
            cycle: summary.cycleSummary.latestFailure.cycle,
            failedAt: summary.cycleSummary.latestFailure.failedAt,
            message: summary.cycleSummary.latestFailure.message,
            ...(summary.cycleSummary.latestFailure.failureKind
              ? { failureKind: summary.cycleSummary.latestFailure.failureKind }
              : {}),
          }
        : null,
    },
    operationalRisk: {
      hasOpenPositionBlocker: !checks.noOpenPosition,
      hasRejectedDecisionBlocker: !checks.noRejectedDecisionSessions,
      hasReconciliationBlocker: !checks.noReconciliationFailures,
      hasSyntheticCloseBlocker: !checks.noSyntheticCloseSessions,
      hasOpenMarkProfitDependency: !checks.noOpenMarkProfitDependency,
    },
  };
}

function summarizeOutcome(summary: OutcomeSummary) {
  return {
    sampleCount: summary.sampleCount,
    markedSampleCount: summary.markedSampleCount,
    markCoverageRate: round(summary.markCoverageRate),
    totalPnlKrw: round(summary.totalPnlKrw),
    totalBtcBenchmarkPnlKrw: round(summary.totalBtcBenchmarkPnlKrw),
    totalBtcExcessPnlKrw: round(summary.totalBtcExcessPnlKrw),
    totalReturnPct: round(summary.totalReturnPct),
    medianReturnPct: round(summary.medianReturnPct),
    medianBtcExcessPnlKrw: round(summary.medianBtcExcessPnlKrw),
    winners: summary.winners,
    losers: summary.losers,
  };
}

function summarizeMissedPositiveBtcWindow(
  summary: MissedPositiveBtcWindowSummary,
) {
  return {
    count: summary.count,
    markedSampleCount: summary.markedSampleCount,
    shadowPnlKrw: round(summary.shadowPnlKrw),
    btcBenchmarkPnlKrw: round(summary.btcBenchmarkPnlKrw),
    btcExcessPnlKrw: round(summary.btcExcessPnlKrw),
    shadowCaptureRatio: round(summary.shadowCaptureRatio),
    stalePositiveOpportunityCount: summary.stalePositiveOpportunityCount,
  };
}

function summarizeOutcomeGroups(
  groups: SuppressedOpportunityAnalysis["bySuppressionReason"],
) {
  return Object.fromEntries(
    Object.entries(groups).map(([key, value]) => [
      key,
      {
        plus5m: summarizeOutcome(value.plus5m),
        plus15m: summarizeOutcome(value.plus15m),
        latest: summarizeOutcome(value.latest),
      },
    ]),
  );
}

function summarizeSuppressedOpportunity(analysis: SuppressedOpportunityAnalysis) {
  return {
    sampleCount: analysis.sampleCount,
    horizons: {
      plus5m: summarizeOutcome(analysis.horizons.plus5m),
      plus15m: summarizeOutcome(analysis.horizons.plus15m),
      latest: summarizeOutcome(analysis.horizons.latest),
    },
    missedPositiveBtcWindows: {
      plus5m: summarizeMissedPositiveBtcWindow(
        analysis.missedPositiveBtcWindows.plus5m,
      ),
      plus15m: summarizeMissedPositiveBtcWindow(
        analysis.missedPositiveBtcWindows.plus15m,
      ),
      latest: summarizeMissedPositiveBtcWindow(
        analysis.missedPositiveBtcWindows.latest,
      ),
    },
    opportunityAssessment: analysis.opportunityAssessment,
    bySuppressionReason: summarizeOutcomeGroups(analysis.bySuppressionReason),
    topFailingGates: Object.entries(analysis.byFailingGate)
      .sort(
        (left, right) =>
          right[1].latest.sampleCount - left[1].latest.sampleCount,
      )
      .slice(0, 5)
      .map(([gate, value]) => ({
        gate,
        plus5m: summarizeOutcome(value.plus5m),
        latest: summarizeOutcome(value.latest),
      })),
  };
}

function summarizeTradePathDiagnostics(analysis: TradePathAnalysis) {
  const topLosingExitPaths = Object.entries(analysis.exitReasonPathDiagnostics)
    .filter(([, diagnostic]) => diagnostic.totalPnlKrw < 0)
    .sort((left, right) => left[1].totalPnlKrw - right[1].totalPnlKrw)
    .slice(0, 3)
    .map(([reasonCode, diagnostic]) => ({
      reasonCode,
      count: diagnostic.count,
      totalPnlKrw: round(diagnostic.totalPnlKrw),
      winners: diagnostic.winners,
      losers: diagnostic.losers,
      losingImmediateAdverseCount: diagnostic.losingImmediateAdverseCount,
      losingImmediateAdversePnlKrw: round(
        diagnostic.losingImmediateAdversePnlKrw,
      ),
      losingGaveBackPositiveMfeCount:
        diagnostic.losingGaveBackPositiveMfeCount,
      losingGaveBackPositiveMfePnlKrw: round(
        diagnostic.losingGaveBackPositiveMfePnlKrw,
      ),
      losingOtherCount: diagnostic.losingOtherCount,
      losingOtherPnlKrw: round(diagnostic.losingOtherPnlKrw),
      dominantLosingPath: diagnostic.dominantLosingPath,
    }));

  return {
    experimentType: "retrospective_closed_trade_diagnostic_not_strategy_pnl",
    reportCount: analysis.source.reportCount,
    reconstructedClosedTradeCount: analysis.allClosedTrades.count,
    reconstructedClosedTradePnlKrw: round(analysis.allClosedTrades.totalPnlKrw),
    thresholdExperimentReadiness:
      analysis.entryFeatureDiagnostics.thresholdExperimentReadiness,
    topLosingExitPaths,
  };
}

function summarizeEntryFilterReplaySupplement(
  audit: {
    generatedAt?: string;
    candidates?: Array<{
      label?: string;
      sessionCount?: number;
      tradedSessionCount?: number;
      closedTradeCount?: number;
      totalPnlKrw?: number | null;
      closedTradePnlKrw?: number | null;
    }>;
    recommendation?: {
      liveReadyLabels?: string[];
      profitablePaperLabels?: string[];
      nextPaperCandidate?: string | null;
    };
  },
  path: string,
): EntryFilterReplaySupplementSummary {
  const replayCandidates = (audit.candidates ?? []).map((candidate) => ({
    label: candidate.label ?? "unknown",
    sessionCount: round(candidate.sessionCount),
    tradedSessionCount: round(candidate.tradedSessionCount),
    closedTradeCount: round(candidate.closedTradeCount),
    totalPnlKrw: round(candidate.totalPnlKrw),
    closedTradePnlKrw: round(candidate.closedTradePnlKrw),
  }));
  const liveReadyLabels = audit.recommendation?.liveReadyLabels ?? [];
  const profitablePaperLabels = audit.recommendation?.profitablePaperLabels ?? [];
  const nextPaperCandidate = audit.recommendation?.nextPaperCandidate ?? null;
  const replayPassedPromotionGate =
    liveReadyLabels.length > 0 ||
    profitablePaperLabels.length > 0 ||
    nextPaperCandidate !== null;

  return {
    path,
    generatedAt: audit.generatedAt ?? null,
    candidateLabels: replayCandidates.map((candidate) => candidate.label),
    liveReadyLabels,
    profitablePaperLabels,
    nextPaperCandidate,
    replayPassedPromotionGate,
    invalidatesReplayCandidate: !replayPassedPromotionGate,
    reasons: replayPassedPromotionGate
      ? ["entry-filter replay supplement found a promoted candidate"]
      : [
          "entry-filter replay supplement found no live-ready candidate",
          "entry-filter replay supplement found no profitable paper candidate",
        ],
    replayCandidates,
  };
}

function summarizeRow(
  summary: DryRunSummary,
  exitAttributionSupplement: AppliedExitAttributionSupplement | null = null,
) {
  const timeStopAffected = summary.lossCauseExperiments.timeStopExit?.affected;
  return {
    reportsRoot: summary.source.reportsRoot,
    cyclesPath: summary.source.cyclesPath,
    cycleEvidenceAvailable: summary.cycleSummary.evidenceAvailable ?? true,
    sessionCount: summary.sessionCount,
    tradedSessionCount: summary.tradedSessionCount,
    closedTradeCount: summary.closedTradesOnly.closedTradeCount,
    openPositionSessions: summary.allSessions.openPositionSessions,
    totalPnlKrw: round(summary.allSessions.totalPnlKrw),
    tradedPnlKrw: round(summary.tradedSessionsOnly.totalPnlKrw),
    closedTradePnlKrw: round(summary.closedTradesOnly.totalPnlKrw),
    totalExcessPnlKrw: round(summary.btcBuyHoldBenchmark.totalExcessPnlKrw),
    excessReturnInformationRatio: round(
      summary.btcBuyHoldBenchmark.excessReturnInformationRatio,
    ),
    exitRisk: summarizeExitRisk(summary.exitQuality, exitAttributionSupplement),
    exitAttribution: summarizeExitAttribution(
      summary.exitQuality,
      exitAttributionSupplement,
    ),
    exitAttributionSupplement,
    feeHurdle: summarizeFeeHurdle(
      summary.lossCauseExperiments.feeHurdle,
    ),
    timeStopSessionCount: timeStopAffected?.sessionCount ?? 0,
    timeStopPnlKrw: round(timeStopAffected?.totalPnlKrw ?? 0),
    entryInactivity: summarizeEntryInactivity(
      summary.lossCauseExperiments.entryInactivity,
    ),
    btcTrendExposure: summarizeBtcTrendExposure(summary.btcTrendExposure),
    evidenceGaps: summarizeEvidenceGaps(summary, exitAttributionSupplement),
    classification: summary.strategyAssessment.classification,
    paperOnlyRecommended: summary.liveReadiness.paperOnlyRecommended,
    liveReady: !summary.liveReadiness.paperOnlyRecommended,
    readinessReasons: summary.liveReadiness.reasons,
  };
}

function isProfitablePaperCandidate(candidate: AuditedCandidate): boolean {
  return (
    !candidate.liveReady &&
    candidate.tradedSessionCount > 0 &&
    candidate.closedTradeCount > 0 &&
    candidate.evidenceGaps.minimumClosedTrades.additionalNeeded === 0 &&
    (candidate.tradedPnlKrw ?? 0) > 0 &&
    (candidate.closedTradePnlKrw ?? 0) > 0 &&
    candidate.openPositionSessions === 0
  );
}

function labelsByNonzeroGap(
  candidates: AuditedCandidate[],
  readGap: (candidate: AuditedCandidate) => number,
): Record<string, number> {
  return Object.fromEntries(
    candidates
      .map((candidate) => [candidate.label, readGap(candidate)] as const)
      .filter(([, value]) => value > 0),
  );
}

function buildRecommendation(candidates: AuditedCandidate[]) {
  const liveReadyLabels = candidates
    .filter((candidate) => candidate.liveReady)
    .map((candidate) => candidate.label);
  const discardLabels = candidates
    .filter((candidate) => candidate.classification === "discard_candidate")
    .map((candidate) => candidate.label);
  const profitablePaperCandidates = candidates
    .filter(isProfitablePaperCandidate)
    .sort(
      (left, right) =>
        (right.closedTradeCount - left.closedTradeCount) ||
        ((right.closedTradePnlKrw ?? Number.NEGATIVE_INFINITY) -
          (left.closedTradePnlKrw ?? Number.NEGATIVE_INFINITY)) ||
        ((right.totalExcessPnlKrw ?? Number.NEGATIVE_INFINITY) -
          (left.totalExcessPnlKrw ?? Number.NEGATIVE_INFINITY)),
    );
  const nextPaperCandidate = profitablePaperCandidates.at(0)?.label ?? null;
  const supportsLooseningEntryLabels = candidates
    .filter(
      (candidate) =>
        candidate.suppressedOpportunity.opportunityAssessment
          .supportsLooseningEntry,
    )
    .map((candidate) => candidate.label);
  const protectiveInactivityLabels = candidates
    .filter(
      (candidate) =>
        candidate.suppressedOpportunity.opportunityAssessment.classification ===
        "protective_inactivity",
    )
    .map((candidate) => candidate.label);
  const observationOnlyLabels = candidates
    .filter(
      (candidate) =>
        !candidate.liveReady &&
        candidate.classification !== "discard_candidate" &&
        !profitablePaperCandidates.some(
          (paperCandidate) => paperCandidate.label === candidate.label,
        ),
    )
    .map((candidate) => candidate.label);
  const additionalClosedTradesNeededByLabel = labelsByNonzeroGap(
    candidates,
    (candidate) => candidate.evidenceGaps.minimumClosedTrades.additionalNeeded,
  );
  const additionalRecoveryCyclesNeededByLabel = labelsByNonzeroGap(
    candidates,
    (candidate) =>
      candidate.evidenceGaps.cycleRecovery.additionalCompletedCyclesNeeded,
  );
  const estimatedRecoveryWaitMinutesByLabel = Object.fromEntries(
    candidates
      .map(
        (candidate) =>
          [
            candidate.label,
            candidate.evidenceGaps.cycleRecovery.estimatedRecoveryWaitMinutes,
          ] as const,
      )
      .filter(([, value]) => typeof value === "number" && value > 0),
  );
  const failureKindsByLabel = Object.fromEntries(
    candidates
      .map(
        (candidate) =>
          [
            candidate.label,
            candidate.evidenceGaps.cycleFailures.failureKinds,
          ] as const,
      )
      .filter(([, failureKinds]) => Object.keys(failureKinds).length > 0),
  );
  const latestFailureByLabel = Object.fromEntries(
    candidates
      .map(
        (candidate) =>
          [
            candidate.label,
            candidate.evidenceGaps.cycleFailures.latestFailure,
          ] as const,
      )
      .filter(([, latestFailure]) => latestFailure !== null),
  );
  const negativeTradedPnlLabels = candidates
    .filter((candidate) => candidate.evidenceGaps.pnl.needsPositiveTradedPnl)
    .map((candidate) => candidate.label);
  const negativeClosedPnlLabels = candidates
    .filter(
      (candidate) => candidate.evidenceGaps.pnl.needsPositiveClosedTradePnl,
    )
    .map((candidate) => candidate.label);
  const btcUnderperformanceLabels = candidates
    .filter((candidate) => candidate.evidenceGaps.pnl.needsPositiveBtcExcess)
    .map((candidate) => candidate.label);
  const openRiskLabels = candidates
    .filter(
      (candidate) =>
        candidate.evidenceGaps.operationalRisk.hasOpenPositionBlocker ||
        candidate.evidenceGaps.operationalRisk.hasOpenMarkProfitDependency,
    )
    .map((candidate) => candidate.label);
  const cycleFailureLabels = candidates
    .filter((candidate) => candidate.evidenceGaps.cycleFailures.failed > 0)
    .map((candidate) => candidate.label);
  const materialLosingExitReasonLabels = candidates
    .filter((candidate) => candidate.exitRisk.topLosingExitReasons.length > 0)
    .map((candidate) => candidate.label);
  const missingExitReasonLabels = candidates
    .filter(
      (candidate) =>
        candidate.exitAttribution.missingExitReasonSessionCount > 0,
    )
    .map((candidate) => candidate.label);
  const wouldStillLoseWithoutFeesLabels = candidates
    .filter((candidate) => candidate.feeHurdle?.wouldStillLoseWithoutFees)
    .map((candidate) => candidate.label);
  const cycleEvidenceUnavailableLabels = candidates
    .filter((candidate) => !candidate.cycleEvidenceAvailable)
    .map((candidate) => candidate.label);
  const entryFilterReplayCandidateLabels = candidates
    .filter(
      (candidate) =>
        candidate.tradePathDiagnostics.thresholdExperimentReadiness
          .eligibleForReplayExperiment &&
        !candidate.entryFilterReplaySupplement?.invalidatesReplayCandidate,
    )
    .map((candidate) => candidate.label);
  const invalidatedEntryFilterReplayLabels = candidates
    .filter(
      (candidate) =>
        candidate.tradePathDiagnostics.thresholdExperimentReadiness
          .eligibleForReplayExperiment &&
        candidate.entryFilterReplaySupplement?.invalidatesReplayCandidate,
    )
    .map((candidate) => candidate.label);
  const primaryBlockers = [
    ...(liveReadyLabels.length === 0 ? ["no_live_ready_candidate"] : []),
    ...(nextPaperCandidate === null ? ["no_profitable_paper_candidate"] : []),
    ...(cycleEvidenceUnavailableLabels.length > 0
      ? ["cycle_evidence_unavailable"]
      : []),
    ...(Object.keys(additionalClosedTradesNeededByLabel).length > 0
      ? ["insufficient_closed_trades"]
      : []),
    ...(Object.keys(additionalRecoveryCyclesNeededByLabel).length > 0
      ? ["cycle_recovery_incomplete"]
      : []),
    ...(negativeTradedPnlLabels.length > 0 ? ["negative_traded_pnl"] : []),
    ...(negativeClosedPnlLabels.length > 0 ? ["negative_closed_trade_pnl"] : []),
    ...(materialLosingExitReasonLabels.length > 0
      ? ["material_losing_exit_reasons"]
      : []),
    ...(missingExitReasonLabels.length > 0
      ? ["exit_reason_attribution_gap"]
      : []),
    ...(btcUnderperformanceLabels.length > 0 ? ["btc_underperformance"] : []),
    ...(openRiskLabels.length > 0 ? ["open_risk_or_mark_dependency"] : []),
    ...(invalidatedEntryFilterReplayLabels.length > 0
      ? ["entry_filter_replay_failed"]
      : []),
    ...(supportsLooseningEntryLabels.length === 0
      ? ["no_entry_loosening_evidence"]
      : []),
  ];
  const recoveryIncompleteLabels = Object.keys(
    additionalRecoveryCyclesNeededByLabel,
  );
  const recoveredWithHistoricalFailureLabels = cycleFailureLabels.filter(
    (label) => !recoveryIncompleteLabels.includes(label),
  );
  const closedTradeIncompleteLabels = Object.keys(
    additionalClosedTradesNeededByLabel,
  );
  const maxAdditionalClosedTradesNeeded = Math.max(
    0,
    ...Object.values(additionalClosedTradesNeededByLabel),
  );
  const maxAdditionalRecoveryCyclesNeeded = Math.max(
    0,
    ...Object.values(additionalRecoveryCyclesNeededByLabel),
  );
  const estimatedRecoveryWaitMinutes = Object.values(
    estimatedRecoveryWaitMinutesByLabel,
  ).filter((value): value is number => typeof value === "number");
  const maxEstimatedRecoveryWaitMinutes =
    estimatedRecoveryWaitMinutes.length > 0
      ? Math.max(...estimatedRecoveryWaitMinutes)
      : null;
  const observationHealth =
    cycleEvidenceUnavailableLabels.length > 0
      ? "unavailable"
      : recoveryIncompleteLabels.length > 0
      ? "recovering"
      : cycleFailureLabels.length > 0
        ? "recovered_with_historical_failures"
        : "healthy";
  const nextOperationalStep =
    liveReadyLabels.length > 0
      ? "review live startup gates and risk controls before enabling live execution"
      : nextPaperCandidate !== null
        ? "continue focused paper observation on the selected profitable candidate"
        : cycleEvidenceUnavailableLabels.length > 0
          ? "attach cycle evidence before judging promotion; do not promote live or loosen entry gates"
        : recoveryIncompleteLabels.length > 0
          ? "continue observation and verify cycle recovery; do not promote live or loosen entry gates"
        : missingExitReasonLabels.length > 0
          ? "repair exit reason attribution before judging exit changes; do not promote live"
          : entryFilterReplayCandidateLabels.length > 0
            ? "validate entry-quality threshold candidates with explicit replay before changing live gates; do not promote live"
          : invalidatedEntryFilterReplayLabels.length > 0
            ? "reject failed entry-filter replay and continue observation; do not promote live or loosen entry gates"
          : materialLosingExitReasonLabels.length > 0
            ? "analyze losing exit cohorts before changing entry or live gates; do not promote live"
          : "continue observation only; do not promote live or loosen entry gates";

  return {
    liveReadyLabels,
    paperOnlyLabels: candidates
      .filter(
        (candidate) =>
          !candidate.liveReady &&
          candidate.classification !== "discard_candidate",
      )
      .map((candidate) => candidate.label),
    discardLabels,
    profitablePaperLabels: profitablePaperCandidates.map(
      (candidate) => candidate.label,
    ),
    observationOnlyLabels,
    blockerSummary: {
      insufficientClosedTradeLabels: Object.keys(
        additionalClosedTradesNeededByLabel,
      ),
      additionalClosedTradesNeededByLabel,
      additionalRecoveryCyclesNeededByLabel,
      negativeTradedPnlLabels,
      negativeClosedPnlLabels,
      btcUnderperformanceLabels,
      openRiskLabels,
      cycleFailureLabels,
      materialLosingExitReasonLabels,
      missingExitReasonLabels,
      wouldStillLoseWithoutFeesLabels,
      failureKindsByLabel,
      latestFailureByLabel,
    },
    entryGateSummary: {
      supportsLooseningEntryLabels,
      entryFilterReplayCandidateLabels,
      invalidatedEntryFilterReplayLabels,
      protectiveInactivityLabels,
      inconclusiveLabels: candidates
        .filter(
          (candidate) =>
            candidate.suppressedOpportunity.opportunityAssessment
              .classification === "inconclusive",
        )
        .map((candidate) => candidate.label),
      noSuppressedSampleLabels: candidates
        .filter(
          (candidate) =>
            candidate.suppressedOpportunity.opportunityAssessment
              .classification === "no_suppressed_samples",
        )
        .map((candidate) => candidate.label),
    },
    decisionSummary: {
      live: liveReadyLabels.length > 0 ? "eligible" : "blocked",
      paper: nextPaperCandidate === null ? "blocked" : "candidate_available",
      observationHealth: {
        state: observationHealth,
        cycleEvidenceUnavailableLabels,
        recoveryIncompleteLabels,
        recoveredWithHistoricalFailureLabels,
        noCycleFailureLabels: candidates
          .filter(
            (candidate) =>
              !cycleFailureLabels.some((label) => label === candidate.label),
          )
          .map((candidate) => candidate.label),
      },
      evidenceTargets: {
        closedTradeIncompleteLabels,
        additionalClosedTradesNeededByLabel,
        maxAdditionalClosedTradesNeeded,
        recoveryIncompleteLabels,
        additionalRecoveryCyclesNeededByLabel,
        maxAdditionalRecoveryCyclesNeeded,
        estimatedRecoveryWaitMinutesByLabel,
        maxEstimatedRecoveryWaitMinutes,
      },
      entryGateChange:
        supportsLooseningEntryLabels.length > 0
          ? "review_supported_looseners"
          : "blocked_no_positive_suppressed_expectancy",
      nextOperationalStep,
      primaryBlockers,
    },
    promotionGates: {
      liveReady: {
        passed: liveReadyLabels.length > 0,
        blockingLabels:
          liveReadyLabels.length > 0
            ? []
            : candidates
                .filter((candidate) => !candidate.liveReady)
                .map((candidate) => candidate.label),
        failureExitCode: 2,
        command: "audit-live-candidates --require-live-ready",
      },
      observationReady: {
        passed:
          observationHealth === "healthy" ||
          observationHealth === "recovered_with_historical_failures",
        blockingLabels: [
          ...cycleEvidenceUnavailableLabels,
          ...recoveryIncompleteLabels,
        ],
        failureExitCode: 4,
        command: "audit-live-candidates --require-observation-ready",
      },
      paperCandidate: {
        passed: nextPaperCandidate !== null,
        blockingLabels:
          nextPaperCandidate === null
            ? candidates
                .filter((candidate) => !candidate.liveReady)
                .map((candidate) => candidate.label)
            : [],
        failureExitCode: 3,
        command: "audit-live-candidates --require-paper-candidate",
      },
    },
    nextPaperCandidate,
    nextPaperCandidateBasis:
      nextPaperCandidate === null
        ? "none: no non-live candidate has positive traded and closed PnL with at least 30 closed trades and no open-position carry"
        : "selected among non-live candidates with positive traded and closed PnL, at least 30 closed trades, and no open-position carry",
  };
}

function buildAuditConsoleSummary(audit: {
  generatedAt: string;
  baselineReportsRoot: string | null;
  candidates: Array<AuditedCandidate & Record<string, unknown>>;
  recommendation: ReturnType<typeof buildRecommendation>;
}) {
  const liveReadyLabels = new Set(audit.recommendation.liveReadyLabels);
  const profitablePaperLabels = new Set(
    audit.recommendation.profitablePaperLabels,
  );
  const observationOnlyLabels = new Set(
    audit.recommendation.observationOnlyLabels,
  );
  const discardLabels = new Set(audit.recommendation.discardLabels);

  const auditDispositionFor = (label: string): string => {
    if (liveReadyLabels.has(label)) {
      return "live_ready";
    }
    if (profitablePaperLabels.has(label)) {
      return "profitable_paper_candidate";
    }
    if (observationOnlyLabels.has(label)) {
      return "observation_only";
    }
    if (discardLabels.has(label)) {
      return "discard";
    }
    return "unclassified";
  };

  return {
    generatedAt: audit.generatedAt,
    baselineReportsRoot: audit.baselineReportsRoot,
    candidates: audit.candidates.map((candidate) => ({
      label: candidate.label,
      liveReady: candidate.liveReady,
      auditDisposition: auditDispositionFor(candidate.label),
      classification: candidate.classification,
      sessionCount: candidate.sessionCount,
      tradedSessionCount: candidate.tradedSessionCount,
      closedTradeCount: candidate.closedTradeCount,
      openPositionSessions: candidate.openPositionSessions,
      totalPnlKrw: candidate.totalPnlKrw,
      tradedPnlKrw: candidate.tradedPnlKrw,
      closedTradePnlKrw: candidate.closedTradePnlKrw,
      totalExcessPnlKrw: candidate.totalExcessPnlKrw,
      excessReturnInformationRatio: candidate.excessReturnInformationRatio,
      exitRisk: candidate.exitRisk,
      exitAttribution: candidate.exitAttribution,
      exitAttributionSupplement: candidate.exitAttributionSupplement ?? null,
      entryFilterReplaySupplement:
        candidate.entryFilterReplaySupplement ?? null,
      feeHurdle: candidate.feeHurdle,
      tradePathDiagnostics: candidate.tradePathDiagnostics,
      evidenceGaps: {
        failedChecks: candidate.evidenceGaps.failedChecks,
        additionalClosedTradesNeeded:
          candidate.evidenceGaps.minimumClosedTrades.additionalNeeded,
        additionalRecoveryCyclesNeeded:
          candidate.evidenceGaps.cycleRecovery.additionalCompletedCyclesNeeded,
        estimatedRecoveryWaitMinutes:
          candidate.evidenceGaps.cycleRecovery.estimatedRecoveryWaitMinutes,
        needsPositiveTradedPnl:
          candidate.evidenceGaps.pnl.needsPositiveTradedPnl,
        needsPositiveClosedTradePnl:
          candidate.evidenceGaps.pnl.needsPositiveClosedTradePnl,
        needsPositiveBtcExcess:
          candidate.evidenceGaps.pnl.needsPositiveBtcExcess,
        hasOpenPositionBlocker:
          candidate.evidenceGaps.operationalRisk.hasOpenPositionBlocker,
        hasOpenMarkProfitDependency:
          candidate.evidenceGaps.operationalRisk.hasOpenMarkProfitDependency,
        cycleFailures: candidate.evidenceGaps.cycleFailures,
      },
      entryOpportunity: {
        classification:
          candidate.suppressedOpportunity.opportunityAssessment.classification,
        supportsLooseningEntry:
          candidate.suppressedOpportunity.opportunityAssessment
            .supportsLooseningEntry,
      },
    })),
    recommendation: audit.recommendation,
  };
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2), cwd);
  const candidates: Array<AuditedCandidate & Record<string, unknown>> = [];
  const candidateLabels = new Set(args.candidates.map((candidate) => candidate.label));
  const supplementArgsByLabel = new Map<string, CandidateArg>();
  for (const supplementArg of args.exitAttributionSupplements) {
    if (!candidateLabels.has(supplementArg.label)) {
      throw new Error(
        `exit attribution supplement label does not match a candidate: ${supplementArg.label}`,
      );
    }
    if (supplementArgsByLabel.has(supplementArg.label)) {
      throw new Error(
        `duplicate exit attribution supplement for candidate: ${supplementArg.label}`,
      );
    }
    supplementArgsByLabel.set(supplementArg.label, supplementArg);
  }
  const entryReplaySupplementArgsByLabel = new Map<string, CandidateArg>();
  for (const supplementArg of args.entryFilterReplaySupplements) {
    if (!candidateLabels.has(supplementArg.label)) {
      throw new Error(
        `entry filter replay supplement label does not match a candidate: ${supplementArg.label}`,
      );
    }
    if (entryReplaySupplementArgsByLabel.has(supplementArg.label)) {
      throw new Error(
        `duplicate entry filter replay supplement for candidate: ${supplementArg.label}`,
      );
    }
    entryReplaySupplementArgsByLabel.set(supplementArg.label, supplementArg);
  }

  for (const candidate of args.candidates) {
    const summary = await runJson<DryRunSummary>("summarize-dry-run-returns.js", [
      "--reports-root",
      candidate.reportsRoot,
    ]);
    const suppressedOpportunity = await runJson<SuppressedOpportunityAnalysis>(
      "analyze-suppressed-opportunities.js",
      ["--reports-root", candidate.reportsRoot],
    );
    const tradePathAnalysis = await runJson<TradePathAnalysis>(
      "analyze-trade-paths.js",
      ["--reports-root", candidate.reportsRoot],
    );
    const paired =
      args.baselineReportsRoot === null
        ? null
        : await runJson<PairedComparison>("compare-paired-dry-runs.js", [
            "--baseline-reports-root",
            args.baselineReportsRoot,
            "--candidate-reports-root",
            candidate.reportsRoot,
          ]);
    const supplementArg = supplementArgsByLabel.get(candidate.label);
    const exitAttributionSupplement = supplementArg
      ? applyExitAttributionSupplement(
          summary.exitQuality,
          await readJsonFile<ExitAttributionSupplement>(
            supplementArg.reportsRoot,
          ),
          supplementArg.reportsRoot,
        )
      : null;
    const entryReplaySupplementArg = entryReplaySupplementArgsByLabel.get(
      candidate.label,
    );
    const entryFilterReplaySupplement = entryReplaySupplementArg
      ? summarizeEntryFilterReplaySupplement(
          await readJsonFile(entryReplaySupplementArg.reportsRoot),
          entryReplaySupplementArg.reportsRoot,
        )
      : null;
    candidates.push({
      label: candidate.label,
      ...summarizeRow(summary, exitAttributionSupplement),
      suppressedOpportunity: summarizeSuppressedOpportunity(suppressedOpportunity),
      tradePathDiagnostics: summarizeTradePathDiagnostics(tradePathAnalysis),
      entryFilterReplaySupplement,
      paired:
        paired === null
          ? null
          : {
              pairedSessionCount: paired.pairing.pairedSessionCount,
              missingCandidateRunIds: paired.pairing.missingCandidateRunIds.length,
              missingBaselineRunIds: paired.pairing.missingBaselineRunIds.length,
              deltaTotalPnlKrw: round(paired.allPairs.delta.totalPnlKrw),
              deltaTotalExcessPnlKrw: round(paired.allPairs.delta.totalExcessPnlKrw),
              deltaTradedSessionCount: paired.allPairs.delta.tradedSessionCount,
              deltaClosedSessionCount: paired.allPairs.delta.closedSessionCount,
              deltaOpenPositionSessions: paired.allPairs.delta.openPositionSessions,
              focusExitReason: paired.focusCohort.focusExitReason,
              focusPairedSessionCount: paired.focusCohort.pairedSessionCount,
              focusDeltaPnlKrw: round(paired.focusCohort.delta.totalPnlKrw),
              focusDeltaExcessPnlKrw: round(
                paired.focusCohort.delta.totalExcessPnlKrw,
              ),
              focusCandidateOpenPositionSessions:
                paired.focusCohort.openRiskMigration.candidateOpenPositionSessions,
              focusCandidateOpenMarkedPnlKrw: round(
                paired.focusCohort.openRiskMigration.candidateOpenMarkedPnlKrw,
              ),
              supportsExitChange: paired.focusCohort.supportsExitChange,
              supportsLivePromotion: paired.liveEvidence.supportsLivePromotion,
              liveEvidenceReasons: paired.liveEvidence.reasons,
            },
    });
  }

  const recommendation = buildRecommendation(candidates);
  const audit = {
    generatedAt: new Date().toISOString(),
    baselineReportsRoot: args.baselineReportsRoot,
    candidates,
    recommendation,
  };

  const fullOutput = `${JSON.stringify(audit, null, 2)}\n`;
  const consoleOutput = `${
    JSON.stringify(args.summaryOnly ? buildAuditConsoleSummary(audit) : audit, null, 2)
  }\n`;
  process.stdout.write(consoleOutput);

  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, fullOutput, "utf8");
  }

  if (args.requireLiveReady && recommendation.liveReadyLabels.length === 0) {
    process.stderr.write("no live-ready candidate found\n");
    process.exitCode = 2;
  } else if (
    args.requireObservationReady &&
    !recommendation.promotionGates.observationReady.passed
  ) {
    process.stderr.write("observation evidence is not ready\n");
    process.exitCode = 4;
  } else if (
    args.requirePaperCandidate &&
    recommendation.nextPaperCandidate === null
  ) {
    process.stderr.write("no profitable paper candidate found\n");
    process.exitCode = 3;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: "audit_live_candidates_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
