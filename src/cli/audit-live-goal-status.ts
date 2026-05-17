import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { REQUIRED_LIVE_GOAL_COMPLETION_CRITERIA_IDS } from "../runtime/live-goal-completion-audit.js";

const SPOT_PERP_CARRY_SPREAD_CONTROL_MIN_EXECUTION_ELIGIBLE_RATE = 0.95;
const SPOT_PERP_CARRY_SPREAD_CONTROL_MAX_REJECTION_RATE = 0.05;
const SPOT_PERP_CARRY_MIN_LIVE_PROMOTION_CARRY_BPS = 20;
const SPOT_PERP_CARRY_MIN_LATEST_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE = 5;
const SPOT_PERP_CARRY_REQUIRED_FEE_STRESS_WINDOWS_FOR_SWITCH = 6;

interface Args {
  min75ReadinessPath: string;
  legacyAuditPath: string;
  dataCoveragePath: string | null;
  crossExchangeReadinessPath: string | null;
  spotPerpCarryReportPath: string | null;
  spotPerpCarryWatchReportPaths: string[];
  spotPerpCarryFeeStressReportPaths: string[];
  spotPerpCarryLiveReadinessPaths: string[];
  signalExecutionCoveragePath: string | null;
  replacementReadinessPaths: string[];
  replacementLivePathReadinessPaths: string[];
  replacementManagedReturnSummaryPaths: string[];
  replacementScanPaths: string[];
  derivativesGatedReportPaths: string[];
  outputPath: string | null;
  requireLiveReady: boolean;
  quiet: boolean;
}

interface TimeSeriesReadiness {
  generatedAt?: string;
  inputs?: {
    observationPath?: string | null;
    paperObservationPath?: string | null;
    positionAuditPath?: string | null;
  };
  strategyAssessment?: {
    classification?: string;
  };
  candidate?: {
    market?: string;
    signalMode?: string;
    unitMinutes?: number;
    minReturnBps?: number;
  };
  benchmarkSummary?: {
    tradeCount?: number;
    strategyReturnPct?: number;
    excessReturnVsBuyHoldPct?: number;
    feeRoundTripBps?: number;
    test?: {
      totalPnlKrw?: number;
      medianPnlKrw?: number | null;
      returnPct?: number;
    } | null;
    walkForward?: {
      positiveTotalFoldCount?: number;
      positiveMedianFoldCount?: number;
      minFoldPnlKrw?: number | null;
    } | null;
  };
  stressBenchmarkSummary?: {
    tradeCount?: number;
    strategyReturnPct?: number;
    buyHoldReturnPct?: number;
    excessReturnVsBuyHoldPct?: number;
    maxDrawdownPct?: number;
    feeRoundTripBps?: number;
  } | null;
  liveReadiness?: {
    ready?: boolean;
    reasons?: string[];
    checks?: Record<string, unknown>;
  };
  paperReadiness?: {
    ready?: boolean;
    reasons?: string[];
    checks?: Record<string, unknown>;
  };
  paperExecution?: {
    skippedReasons?: string[];
    rejectedSignalReasons?: Array<{
      code?: string;
      message?: string;
      detail?: unknown;
    }>;
  };
  openPosition?: {
    holdElapsed?: boolean;
    holdExitDueAt?: string;
    estimatedExitNetPnlKrw?: number;
    estimatedExitReturnPct?: number;
  } | null;
}

interface LegacyAudit {
  generatedAt?: string;
  candidates?: Array<{
    label?: string;
    liveReady?: boolean;
    tradedPnlKrw?: number;
    closedTradePnlKrw?: number;
  }>;
  recommendation?: {
    liveReadyLabels?: string[];
    nextPaperCandidate?: unknown;
    decisionSummary?: {
      live?: string;
      paper?: string;
      primaryBlockers?: string[];
    };
    blockerSummary?: {
      negativeTradedPnlLabels?: string[];
      negativeClosedPnlLabels?: string[];
    };
  };
}

interface TimeSeriesObservation {
  generatedAt?: string;
  signal?: {
    active?: boolean;
    latestCandleAt?: string;
    lookbackReturnBps?: number;
    riskValue?: number | null;
    riskThreshold?: number | null;
    riskExcessBps?: number | null;
    directionalSignalPass?: boolean;
    riskPass?: boolean;
  };
  orderbook?: {
    executableRoundTripCostBps?: number | null;
    executableCostVsExpectedEdgeBps?: number | null;
    buyDepth?: { coversRequestedNotional?: boolean };
    sellDepth?: { coversRequestedNotional?: boolean };
  };
  decision?: {
    executionViability?: string;
    reasons?: string[];
  };
}

interface TimeSeriesPaperObservation {
  generatedAt?: string;
  skippedReasons?: string[];
  paper?: {
    attemptedSignal?: boolean;
    acceptedSignals?: number;
    reconciliationOk?: boolean;
    openPositionCount?: number;
  };
}

interface ReplacementScan {
  generatedAt?: string;
  candidateCount?: number;
  promotionCandidateCount?: number;
  sourceReady?: boolean;
  sourceFailureCount?: number;
  sourceFailures?: Array<{
    market?: string;
    passiveSnapshotCount?: number;
    orderbookSnapshotCount?: number;
    reason?: string;
  }>;
  assumptions?: {
    market?: string;
    feeRoundTripBps?: number;
  };
  promotionCandidates?: ReplacementCandidate[];
  topByTest?: ReplacementCandidate[];
  nearMiss?: ReplacementCandidate[];
  topByExcess?: ReplacementCandidate[];
}

interface ReplacementCandidate {
  market?: string;
  lookbackBars?: number;
  holdBars?: number;
  minReturnBps?: number;
  minEligibleMarkets?: number;
  riskFilter?: string;
  tradeCount?: number;
  returnPct?: number;
  buyHoldReturnPct?: number;
  excessReturnVsBuyHoldPct?: number;
  maxDrawdownPct?: number;
  passesPromotion?: boolean;
  train?: {
    count?: number;
    totalPnlKrw?: number;
    medianPnlKrw?: number | null;
  };
  test?: {
    count?: number;
    totalPnlKrw?: number;
    medianPnlKrw?: number | null;
  };
  walkForward?: {
    positiveTotalFoldCount?: number;
    positiveMedianFoldCount?: number;
    minFoldPnlKrw?: number | null;
  };
}

interface DataCoverageAudit {
  generatedAt?: string;
  fresh?: boolean;
  status?: string;
  blockers?: string[];
}

interface CrossExchangeReadiness {
  generatedAt?: string;
  liveReady?: boolean;
  blockers?: string[];
  checklist?: Record<string, boolean>;
  operationalProofSummary?: {
    generatedAt?: string | null;
    accountFeesConfirmed?: boolean;
    hedgeVenueReady?: boolean;
    requirements?: unknown;
    inventory?: unknown;
    deficits?: unknown;
    details?: unknown;
    reasons?: string[];
  } | null;
  candidate?: {
    notionalKrw?: number;
    referenceVenue?: string;
    direction?: string;
    medianNetEdgeBps?: number;
    positiveRate?: number;
    depthCoverageRate?: number;
    totalEstimatedNetPnlKrw?: number;
  };
  interpretation?: string;
}

interface SpotPerpCarryReport {
  generatedAt?: string;
  status?: string;
  promotionEligible?: boolean;
  blockers?: string[];
  observationSpanMinutes?: number | null;
  checklist?: Record<string, boolean>;
  measurementScope?: Record<string, unknown>;
  assumptions?: {
    notionalKrw?: number;
    bithumbFeeBps?: number;
    binanceTakerFeeBps?: number;
    exitCostBufferBps?: number;
    markets?: Array<{
      market?: string;
      symbol?: string;
    }>;
  };
  summary?: {
    count?: number;
    supportedFundingCount?: number;
    completedFundingCount?: number;
    positiveCount?: number;
    positiveRate?: number | null;
    depthCoverageRate?: number | null;
    medianNetCarryBps?: number | null;
    totalEstimatedNetPnlKrw?: number;
    executionEligibleCount?: number;
    executionEligibleRate?: number | null;
    executionRejectedCount?: number;
    executionRejectedRate?: number | null;
    executionRejectionReasons?: Record<string, number>;
    executionEligiblePositiveCount?: number;
    executionEligiblePositiveRate?: number | null;
    executionEligibleMedianNetCarryBps?: number | null;
    executionEligibleTotalEstimatedNetPnlKrw?: number;
    rawPricingArtifactCount?: number;
    rawPricingArtifactEstimatedNetPnlKrw?: number;
  };
  perMarketSummary?: Array<{
    market?: string;
    symbol?: string;
    count?: number;
    completedFundingCount?: number;
    fundingWindowSummary?: Record<string, unknown>;
    executionEligibleCount?: number;
    executionEligibleRate?: number | null;
    executionEligiblePositiveRate?: number | null;
    executionEligibleMedianNetCarryBps?: number | null;
    executionEligibleTotalEstimatedNetPnlKrw?: number;
    depthCoverageRate?: number | null;
    rawPricingArtifactCount?: number;
    positiveRate?: number | null;
    medianNetCarryBps?: number | null;
    totalEstimatedNetPnlKrw?: number;
    watchDecision?: {
      status?: string;
      reasons?: string[];
      requiredBeforeMetricCandidate?: string[];
      killPolicy?: Record<string, unknown>;
    };
  }>;
  topCarry?: Array<{
    market?: string;
    symbol?: string;
    fundingBps?: number;
    fundingCompleted?: boolean;
    basisEntryEdgeBps?: number;
    netCarryBps?: number;
    estimatedNetPnlKrw?: number;
    depthCovered?: boolean;
    spotSpreadBps?: number;
    perpSpreadBps?: number;
    usdtKrwSpreadBps?: number;
  }>;
  topExecutableCarry?: Array<{
    market?: string;
    symbol?: string;
    fundingBps?: number;
    fundingCompleted?: boolean;
    basisEntryEdgeBps?: number;
    netCarryBps?: number;
    estimatedNetPnlKrw?: number;
    depthCovered?: boolean;
    spotSpreadBps?: number;
    perpSpreadBps?: number;
    usdtKrwSpreadBps?: number;
  }>;
}

interface SpotPerpCarryLiveReadinessReport {
  generatedAt?: string;
  status?: string;
  liveReady?: boolean;
  reasons?: string[];
  checks?: Record<string, boolean>;
  readinessGap?: Record<string, unknown>;
  readinessTimeline?: Record<string, unknown>;
  evidence?: {
    summary?: Record<string, unknown>;
    perMarketSummary?: Array<{
      market?: string;
      symbol?: string;
    }>;
    operationalProof?: SpotPerpCarryOperationalProofSummary | null;
  };
  interpretation?: string;
}

interface SpotPerpCarryOperationalProofSummary {
  generatedAt?: string | null;
  accountFeesConfirmed?: boolean;
  inventoryReady?: boolean;
  hedgeVenueReady?: boolean;
  requirements?: Record<string, unknown>;
  inventory?: Record<string, unknown>;
  deficits?: Record<string, unknown>;
  details?: {
    missingSecrets?: string[];
    [key: string]: unknown;
  } | null;
  reasons?: string[];
}

interface SignalExecutionCoverageReport {
  generatedAt?: string;
  status?: string;
  coverageReadyCandidateCount?: number;
  candidateCount?: number;
  candidates?: Array<{
    market?: string;
    sourceIndex?: number;
    parameters?: Record<string, unknown>;
    profitability?: {
      train?: SummaryLike | null;
      test?: SummaryLike | null;
      walkForward?: {
        foldCount?: number | null;
        positiveTotalFoldCount?: number | null;
        positiveMedianFoldCount?: number | null;
        totalPnlKrw?: number | null;
        minFoldPnlKrw?: number | null;
      } | null;
    };
    orderbookSnapshotCount?: number;
    coverage?: {
      train?: {
        roundTripCoveredCount?: number;
        roundTripCoverageRate?: number | null;
      };
      test?: {
        roundTripCoveredCount?: number;
        roundTripCoverageRate?: number | null;
      };
    };
    coverageReady?: boolean;
    reasons?: string[];
  }>;
}

interface ReplacementLivePathReadiness {
  generatedAt?: string;
  market?: string;
  strategyId?: string;
  liveProcessName?: string;
  refreshCommandName?: string;
  gateCommandName?: string;
  checks?: Record<string, boolean>;
  ready?: boolean;
  reasons?: string[];
  interpretation?: string;
}

interface ManagedReturnSummary {
  source?: {
    reportsRoot?: string;
    cyclesPath?: string | null;
  };
  sessionCount?: number;
  exposureSessionCount?: number;
  tradedSessionCount?: number;
  filledSessionCount?: number;
  orderedSessionCount?: number;
  openMarkSessionCount?: number;
  openPositionSessionCount?: number;
  sessionCountInterpretation?: string;
  allSessions?: {
    avgReturnPct?: number | null;
    totalPnlKrw?: number;
    openPositionSessions?: number;
  };
  tradedSessionsOnly?: {
    totalPnlKrw?: number;
    avgReturnPct?: number | null;
    closedTradeCount?: number;
    openPositionSessions?: number;
  };
  closedTradesOnly?: {
    sessionCount?: number;
    totalPnlKrw?: number;
    avgReturnPct?: number | null;
    closedTradeCount?: number;
  };
  cycleSummary?: {
    evidenceAvailable?: boolean;
    completed?: number;
    failed?: number;
    completionRate?: number | null;
    consecutiveCompletedSinceLatestFailure?: number;
  };
  strategyAssessment?: {
    classification?: string;
    rationale?: string;
  };
  latestSession?: {
    generatedAt?: string;
    sessionId?: string;
    returnPct?: number;
    realizedPnlKrw?: number;
    markedPnlKrw?: number;
    openPositionCount?: number;
    reconciliationOk?: boolean;
    suppressionCounts?: Record<string, number>;
  };
  quality?: {
    rejectedDecisionSessions?: number;
    signalRejectedDecisionSessions?: number;
    signalRejectedDecisionCount?: number;
    signalRejectedReasonCounts?: Record<string, number>;
  };
  lossCauseExperiments?: {
    entryExecutionGuardRejections?: {
      experimentType?: string;
      signalSessionCount?: number;
      signalDecisionCount?: number;
      signalRejectedSessionCount?: number;
      signalRejectedDecisionCount?: number;
      signalRejectedSessionRate?: number | null;
      signalRejectedDecisionRate?: number | null;
      reasonCounts?: Record<string, number>;
    };
  };
  liveReadiness?: {
    checks?: Record<string, unknown>;
    reasons?: string[];
  };
}

interface DerivativesGatedReport {
  generatedAt?: string;
  source?: Record<string, unknown>;
  interpretation?: string;
  assumptions?: {
    unitMinutes?: number;
    limit?: number;
    notionalKrw?: number;
    feeRoundTripBps?: number;
    minPromotionSpanDays?: number;
    thresholds?: Record<string, unknown>;
  };
  promotionCandidateCount?: number;
  diagnosticImprovementCount?: number;
  pairs?: DerivativesGatedPair[];
}

interface DerivativesGatedPair {
  market?: string;
  symbol?: string;
  source?: {
    candleCount?: number;
    candleFrom?: string;
    candleTo?: string;
    spanDays?: number;
    fundingCount?: number;
    openInterestCount?: number;
    longShortCount?: number;
    takerLongShortCount?: number;
  };
  promotionCandidateCount?: number;
  diagnosticImprovementCount?: number;
  topDiagnosticCandidates?: DerivativesGatedCandidate[];
  topByGatedTest?: DerivativesGatedCandidate[];
}

interface DerivativesGatedCandidate {
  lookbackBars?: number;
  holdBars?: number;
  minReturnBps?: number;
  baselineTrain?: SummaryLike;
  baselineTest?: SummaryLike;
  train?: SummaryLike;
  test?: SummaryLike;
  walkForward?: {
    foldCount?: number;
    positiveTotalFoldCount?: number;
    positiveMedianFoldCount?: number;
    totalPnlKrw?: number;
    minFoldPnlKrw?: number | null;
  };
  gatedTradeCount?: number;
  baselineTradeCount?: number;
  promotionEligible?: boolean;
  diagnosticImprovement?: boolean;
  score?: number;
}

interface SummaryLike {
  count?: number;
  totalPnlKrw?: number;
  averagePnlKrw?: number | null;
  medianPnlKrw?: number | null;
  winners?: number;
  losers?: number;
  returnPct?: number | null;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    min75ReadinessPath: resolve(cwd, "var/reports/btc-240m-momentum-min75-readiness-latest-refresh.json"),
    legacyAuditPath: resolve(cwd, "var/reports/current-live-audit-all-running-20260513-refresh.json"),
    dataCoveragePath: null,
    crossExchangeReadinessPath: null,
    spotPerpCarryReportPath: null,
    spotPerpCarryWatchReportPaths: [],
    spotPerpCarryFeeStressReportPaths: [],
    spotPerpCarryLiveReadinessPaths: [],
    signalExecutionCoveragePath: null,
    replacementReadinessPaths: [],
    replacementLivePathReadinessPaths: [],
    replacementManagedReturnSummaryPaths: [],
    replacementScanPaths: [],
    derivativesGatedReportPaths: [],
    outputPath: null,
    requireLiveReady: false,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--min75-readiness") {
      if (!value) throw new Error("--min75-readiness requires a value");
      args.min75ReadinessPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--legacy-audit") {
      if (!value) throw new Error("--legacy-audit requires a value");
      args.legacyAuditPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--replacement-scan") {
      if (!value) throw new Error("--replacement-scan requires a value");
      args.replacementScanPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--replacement-readiness") {
      if (!value) throw new Error("--replacement-readiness requires a value");
      args.replacementReadinessPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--replacement-live-path-readiness") {
      if (!value) throw new Error("--replacement-live-path-readiness requires a value");
      args.replacementLivePathReadinessPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--replacement-managed-return-summary") {
      if (!value) throw new Error("--replacement-managed-return-summary requires a value");
      args.replacementManagedReturnSummaryPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--derivatives-gated-report") {
      if (!value) throw new Error("--derivatives-gated-report requires a value");
      args.derivativesGatedReportPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--data-coverage") {
      if (!value) throw new Error("--data-coverage requires a value");
      args.dataCoveragePath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--cross-exchange-readiness") {
      if (!value) throw new Error("--cross-exchange-readiness requires a value");
      args.crossExchangeReadinessPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--spot-perp-carry-report") {
      if (!value) throw new Error("--spot-perp-carry-report requires a value");
      args.spotPerpCarryReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--spot-perp-carry-watch-report") {
      if (!value) throw new Error("--spot-perp-carry-watch-report requires a value");
      args.spotPerpCarryWatchReportPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--spot-perp-carry-fee-stress-report") {
      if (!value) throw new Error("--spot-perp-carry-fee-stress-report requires a value");
      args.spotPerpCarryFeeStressReportPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--spot-perp-carry-live-readiness") {
      if (!value) throw new Error("--spot-perp-carry-live-readiness requires a value");
      args.spotPerpCarryLiveReadinessPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--signal-execution-coverage") {
      if (!value) throw new Error("--signal-execution-coverage requires a value");
      args.signalExecutionCoveragePath = resolve(cwd, value);
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
    throw new Error(`unsupported argument: ${arg}`);
  }

  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string | null | undefined): Promise<T | null> {
  if (!path) return null;
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

function isFresh(iso: string | undefined, maxAgeMs: number): boolean {
  if (!iso) return false;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) && Date.now() - parsed <= maxAgeMs;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumFinite(values: Array<number | undefined>): number | null {
  let total = 0;
  let count = 0;
  for (const value of values) {
    const numberValue = finite(value);
    if (numberValue === null) continue;
    total += numberValue;
    count += 1;
  }
  return count === 0 ? null : total;
}

function carryMarketKey(market?: string | null, symbol?: string | null): string | null {
  const normalizedMarket = typeof market === "string" && market.length > 0 ? market : null;
  const normalizedSymbol = typeof symbol === "string" && symbol.length > 0 ? symbol : null;
  if (normalizedMarket === null && normalizedSymbol === null) return null;
  return `${normalizedMarket ?? "unknown"}:${normalizedSymbol ?? "unknown"}`;
}

function sameKeySet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function spotPerpCarryWatchVerificationCommand(path: string | null): string {
  if (path?.endsWith("spot-perp-carry-cys-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-cys-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  if (path?.endsWith("spot-perp-carry-aztec-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-aztec-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  if (path?.endsWith("spot-perp-carry-nil-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-nil-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  if (path?.endsWith("spot-perp-carry-akt-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-akt-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  if (path?.endsWith("spot-perp-carry-elsa-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-elsa-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  if (path?.endsWith("spot-perp-carry-pieverse-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  if (path?.endsWith("spot-perp-carry-pieverse-edu-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-pieverse-edu-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  if (path?.endsWith("spot-perp-carry-edu-72h-latest.json")) {
    return "npm run dry-run:refresh-spot-perp-carry-edu-live-readiness && npm run dry-run:gate-live-goal-ready";
  }
  return "npm run dry-run:gate-live-goal-ready";
}

function carrySummaryEstimatedPnlKrw(report: SpotPerpCarryReport | null): number | null {
  return (
    finite(report?.summary?.executionEligibleTotalEstimatedNetPnlKrw) ??
    finite(report?.summary?.totalEstimatedNetPnlKrw)
  );
}

function carrySummaryMedianNetCarryBps(report: SpotPerpCarryReport | null): number | null {
  return (
    finite(report?.summary?.executionEligibleMedianNetCarryBps) ??
    finite(report?.summary?.medianNetCarryBps)
  );
}

function carrySummaryPositiveRate(report: SpotPerpCarryReport | null): number | null {
  return (
    finite(report?.summary?.executionEligiblePositiveRate) ??
    finite(report?.summary?.positiveRate)
  );
}

function carryPrimaryMarketEvidence(report: SpotPerpCarryReport | null): {
  market: string | null;
  symbol: string | null;
  estimatedNetPnlKrw: number | null;
  medianNetCarryBps: number | null;
  positiveRate: number | null;
  completedFundingCount: number | null;
  observationCount: number | null;
  observationSpanMinutes: number | null;
} {
  const top = report?.topExecutableCarry?.[0] ?? report?.topCarry?.[0] ?? null;
  const market = typeof top?.market === "string" ? top.market : null;
  const symbol = typeof top?.symbol === "string" ? top.symbol : null;
  const perMarket =
    report?.perMarketSummary?.find(
      (summary) =>
        (market === null || summary.market === market) &&
        (symbol === null || summary.symbol === symbol),
    ) ??
    report?.perMarketSummary?.find((summary) => market !== null && summary.market === market) ??
    null;
  const isSingleMarketReport = (report?.perMarketSummary?.length ?? 0) <= 1;
  return {
    market,
    symbol,
    estimatedNetPnlKrw:
      finite(perMarket?.executionEligibleTotalEstimatedNetPnlKrw) ??
      finite(perMarket?.totalEstimatedNetPnlKrw) ??
      carrySummaryEstimatedPnlKrw(report),
    medianNetCarryBps:
      finite(perMarket?.executionEligibleMedianNetCarryBps) ??
      finite(perMarket?.medianNetCarryBps) ??
      carrySummaryMedianNetCarryBps(report),
    positiveRate:
      finite(perMarket?.executionEligiblePositiveRate) ??
      finite(perMarket?.positiveRate) ??
      carrySummaryPositiveRate(report),
    completedFundingCount:
      finite(perMarket?.completedFundingCount) ??
      finite(report?.summary?.completedFundingCount),
    observationCount:
      finite(perMarket?.count) ??
      (isSingleMarketReport ? finite(report?.summary?.count) : null),
    observationSpanMinutes: isSingleMarketReport ? finite(report?.observationSpanMinutes) : null,
  };
}

function carrySpreadControlDiagnostics(report: SpotPerpCarryReport | null): Record<string, unknown> | null {
  if (report === null || report.summary === undefined) return null;
  const reasons = report.summary.executionRejectionReasons ?? {};
  const executionDiagnosticsMissing =
    report.summary.executionRejectedCount === undefined ||
    report.summary.executionRejectedRate === undefined ||
    report.summary.executionRejectionReasons === undefined;
  const rawArtifactDiagnosticsMissing =
    report.summary.rawPricingArtifactCount === undefined ||
    report.summary.rawPricingArtifactEstimatedNetPnlKrw === undefined;
  const diagnosticsMissing = executionDiagnosticsMissing || rawArtifactDiagnosticsMissing;
  const spotSpreadTooWideCount = finite(reasons.spotSpreadTooWide) ?? 0;
  const perpSpreadTooWideCount = finite(reasons.perpSpreadTooWide) ?? 0;
  const usdtKrwSpreadTooWideCount = finite(reasons.usdtKrwSpreadTooWide) ?? 0;
  const spreadRejectionSignalCount =
    spotSpreadTooWideCount + perpSpreadTooWideCount + usdtKrwSpreadTooWideCount;
  const observationCount = report.summary.count ?? null;
  const spreadRejectionSignalRate =
    observationCount === null || observationCount === 0
      ? null
      : Number((spreadRejectionSignalCount / observationCount).toFixed(6));
  const executionEligibleRate = report.summary.executionEligibleRate ?? null;
  const rawPricingArtifactCount = report.summary.rawPricingArtifactCount ?? null;
  const passed =
    diagnosticsMissing === false &&
    rawPricingArtifactCount === 0 &&
    executionEligibleRate !== null &&
    executionEligibleRate >= SPOT_PERP_CARRY_SPREAD_CONTROL_MIN_EXECUTION_ELIGIBLE_RATE &&
    spreadRejectionSignalRate !== null &&
    spreadRejectionSignalRate <= SPOT_PERP_CARRY_SPREAD_CONTROL_MAX_REJECTION_RATE;
  return {
    policy: "filter_wide_spread_entries",
    minExecutionEligibleRate: SPOT_PERP_CARRY_SPREAD_CONTROL_MIN_EXECUTION_ELIGIBLE_RATE,
    maxSpreadRejectionSignalRate: SPOT_PERP_CARRY_SPREAD_CONTROL_MAX_REJECTION_RATE,
    observationCount,
    executionEligibleCount: report.summary.executionEligibleCount ?? null,
    executionEligibleRate,
    executionRejectedCount: report.summary.executionRejectedCount ?? null,
    executionRejectedRate: report.summary.executionRejectedRate ?? null,
    spreadRejectionSignalCount,
    spreadRejectionSignalRate,
    spotSpreadTooWideCount,
    perpSpreadTooWideCount,
    usdtKrwSpreadTooWideCount,
    rawPricingArtifactCount,
    rawPricingArtifactEstimatedNetPnlKrw:
      report.summary.rawPricingArtifactEstimatedNetPnlKrw ?? null,
    diagnosticsMissing,
    executionDiagnosticsMissing,
    rawArtifactDiagnosticsMissing,
    passed,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function uniqueStringList(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function currentEntrySelectedMarketSnapshot(
  watch: Record<string, unknown> | null,
  selectedMarket: string | null,
): Record<string, unknown> | null {
  if (watch === null || selectedMarket === null) return null;
  const topExecutableCarry = Array.isArray(watch.topExecutableCarry)
    ? watch.topExecutableCarry.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
  const topRow = topExecutableCarry.find((row) => stringValue(row.market) === selectedMarket) ?? null;
  if (topRow !== null) {
    return {
      source: "top_executable_carry",
      market: topRow.market ?? null,
      symbol: topRow.symbol ?? null,
      capturedAt: topRow.capturedAt ?? null,
      fundingSettledAt: topRow.fundingSettledAt ?? null,
      nextFundingTime: topRow.nextFundingTime ?? null,
      netCarryBps: topRow.netCarryBps ?? null,
      estimatedNetPnlKrw: topRow.estimatedNetPnlKrw ?? null,
      spotSpreadBps: topRow.spotSpreadBps ?? null,
      perpSpreadBps: topRow.perpSpreadBps ?? null,
      usdtKrwSpreadBps: topRow.usdtKrwSpreadBps ?? null,
      depthCovered: topRow.depthCovered === true,
    };
  }

  const perMarketSummary = Array.isArray(watch.perMarketSummary)
    ? watch.perMarketSummary.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
  const marketSummary = perMarketSummary.find((row) => stringValue(row.market) === selectedMarket) ?? null;
  if (marketSummary === null) return null;
  const fundingWindowSummary = recordValue(marketSummary.fundingWindowSummary);
  const spreadControl = recordValue(marketSummary.spreadControl);
  return {
    source: "per_market_summary",
    market: marketSummary.market ?? null,
    symbol: marketSummary.symbol ?? null,
    netCarryBps:
      marketSummary.executionEligibleMedianNetCarryBps ??
      fundingWindowSummary.medianWindowNetCarryBps ??
      marketSummary.medianNetCarryBps ??
      null,
    estimatedNetPnlKrw:
      marketSummary.executionEligibleTotalEstimatedNetPnlKrw ??
      fundingWindowSummary.medianWindowEstimatedNetPnlKrw ??
      null,
    positiveRate: marketSummary.positiveRate ?? null,
    executionEligibleRate: marketSummary.executionEligibleRate ?? null,
    spreadRejectedRate: spreadControl.spreadRejectedRate ?? null,
    completedFundingWindowCount:
      fundingWindowSummary.completedFundingWindowCount ??
      marketSummary.completedFundingCount ??
      null,
  };
}

function buildCurrentEntrySanity(
  watchlist: Array<Record<string, unknown>>,
  selectedMarket: string | null,
): Record<string, unknown> {
  const currentEntryReports = watchlist.filter((watch) => {
    const path = stringValue(watch.path) ?? "";
    return (
      path.includes("spot-perp-carry-current-carry") ||
      path.includes("spot-perp-carry-top-funding-discovery") ||
      path.includes("spot-perp-carry-focus-current-entry")
    );
  });
  const focusedCurrentEntry =
    currentEntryReports.find((watch) =>
      (stringValue(watch.path) ?? "").includes("spot-perp-carry-focus-current-entry-25bps-latest"),
    ) ?? null;
  const feeStressCurrentCarry =
    currentEntryReports.find((watch) =>
      (stringValue(watch.path) ?? "").includes("spot-perp-carry-current-carry-discovery-25bps-current"),
    ) ?? null;
  const topFundingFeeStress =
    currentEntryReports.find((watch) =>
      (stringValue(watch.path) ?? "").includes("spot-perp-carry-top-funding-discovery-25bps-current"),
    ) ?? null;
  const preferredCandidates = [
    focusedCurrentEntry,
    feeStressCurrentCarry,
    topFundingFeeStress,
    ...currentEntryReports,
  ].filter(
    (watch, index, candidates): watch is Record<string, unknown> =>
      watch !== null && candidates.indexOf(watch) === index,
  );
  const defaultPreferred = focusedCurrentEntry ?? feeStressCurrentCarry ?? topFundingFeeStress ?? currentEntryReports[0] ?? null;
  const preferred =
    preferredCandidates.find((watch) => currentEntrySelectedMarketSnapshot(watch, selectedMarket) !== null) ??
    defaultPreferred;
  const summary = recordValue(preferred?.summary);
  const aggregateSpreadControl = recordValue(summary.spreadControl ?? preferred?.spreadControl);
  const aggregateSpreadThresholds = recordValue(aggregateSpreadControl.thresholds);
  const selectedSnapshot = currentEntrySelectedMarketSnapshot(preferred, selectedMarket);
  const selectedNetCarryBps = finite(selectedSnapshot?.netCarryBps);
  const selectedPositiveRate = finite(selectedSnapshot?.positiveRate);
  const selectedExecutionEligibleRate = finite(selectedSnapshot?.executionEligibleRate);
  const selectedSpreadRejectedRate = finite(selectedSnapshot?.spreadRejectedRate);
  const selectedSpotSpreadBps = finite(selectedSnapshot?.spotSpreadBps);
  const selectedPerpSpreadBps = finite(selectedSnapshot?.perpSpreadBps);
  const selectedUsdtKrwSpreadBps = finite(selectedSnapshot?.usdtKrwSpreadBps);
  const selectedDepthCovered =
    selectedSnapshot?.depthCovered === true
      ? true
      : selectedSnapshot?.depthCovered === false
        ? false
        : null;
  const maxSpotSpreadBps = finite(aggregateSpreadThresholds.maxSpotSpreadBps);
  const maxPerpSpreadBps = finite(aggregateSpreadThresholds.maxPerpSpreadBps);
  const maxUsdtKrwSpreadBps = finite(aggregateSpreadThresholds.maxUsdtKrwSpreadBps);
  const blockers = uniqueStringList([
    preferred === null ? "currentEntryReportMissing" : undefined,
    selectedSnapshot === null ? "selectedFocusMissingFromCurrentEntrySnapshot" : undefined,
    selectedNetCarryBps === null ? "selectedFocusCurrentEntryCarryMissing" : undefined,
    selectedNetCarryBps !== null && selectedNetCarryBps <= 0 ? "nonPositiveSelectedFocusCurrentEntryCarry" : undefined,
    selectedNetCarryBps !== null && selectedNetCarryBps < 20 ? "selectedFocusCurrentEntryCarryBelowLiveThreshold" : undefined,
    selectedPositiveRate !== null && selectedPositiveRate < 0.67 ? "lowSelectedFocusCurrentEntryPositiveRate" : undefined,
    selectedExecutionEligibleRate !== null &&
    selectedExecutionEligibleRate < SPOT_PERP_CARRY_SPREAD_CONTROL_MIN_EXECUTION_ELIGIBLE_RATE
      ? "lowCurrentEntryExecutionEligibleRate"
      : undefined,
    selectedSpreadRejectedRate !== null &&
    selectedSpreadRejectedRate > SPOT_PERP_CARRY_SPREAD_CONTROL_MAX_REJECTION_RATE
      ? "wideCurrentEntrySpreadRejection"
      : undefined,
    selectedDepthCovered === false ? "selectedFocusCurrentEntryDepthInsufficient" : undefined,
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

  return {
    status: blockers.length === 0 ? "current_entry_clear" : "current_entry_blocked_or_diagnostic_only",
    selectedMarket,
    preferredSourcePath: preferred?.path ?? null,
    preferredGeneratedAt: preferred?.generatedAt ?? null,
    preferredSourceKind:
      preferred === focusedCurrentEntry
        ? "focused_current_entry_fee_stress"
        : preferred === feeStressCurrentCarry
        ? "current_carry_fee_stress"
        : preferred === topFundingFeeStress
          ? "top_funding_fee_stress"
          : preferred === null
            ? null
            : "other_current_entry_watchlist",
    currentEntryBlockers: blockers,
    selectedMarketCurrentEntrySnapshot: selectedSnapshot,
    aggregateCurrentEntryDiagnostics: {
      reportPromotionEligible: preferred?.promotionEligible ?? null,
      reportUsableForLivePromotion: preferred?.usableForLivePromotion ?? null,
      medianNetCarryBps: summary.medianNetCarryBps ?? null,
      executionEligibleMedianNetCarryBps: summary.executionEligibleMedianNetCarryBps ?? null,
      positiveRate: summary.positiveRate ?? null,
      executionEligibleRate: summary.executionEligibleRate ?? null,
      rawPricingArtifactCount: summary.rawPricingArtifactCount ?? null,
      spreadControl: Object.keys(aggregateSpreadControl).length > 0 ? aggregateSpreadControl : null,
    },
    action:
      blockers.length === 0
        ? "allow_current_entry_as_one_required_live_sanity_input"
        : "keep_live_blocked_and_continue_current_entry_discovery",
    interpretation:
      "Current-entry sanity blocks promotion when the selected market's latest public entry snapshot is weak or rejected; broad current-scan aggregate metrics are reported only as diagnostics so unrelated markets do not block the selected focus.",
  };
}

function fundingWindowRows(summary: Record<string, unknown>): Array<{
  source: Record<string, unknown>;
  timestamp: number;
  medianNetCarryBps: number;
  sampleCount: number | null;
}> {
  return (Array.isArray(summary.windows) ? summary.windows : [])
    .filter(
      (window): window is Record<string, unknown> =>
        window !== null && typeof window === "object" && !Array.isArray(window),
    )
    .map((window) => ({
      source: window,
      timestamp: Date.parse(stringValue(window.fundingSettledAt) ?? ""),
      medianNetCarryBps: finite(window.medianNetCarryBps),
      sampleCount: finite(window.sampleCount),
    }))
    .filter(
      (
        window,
      ): window is {
        source: Record<string, unknown>;
        timestamp: number;
        medianNetCarryBps: number;
        sampleCount: number | null;
      } => Number.isFinite(window.timestamp) && window.medianNetCarryBps !== null,
    )
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildFundingWindowTrend(summary: Record<string, unknown>): Record<string, unknown> | null {
  const windows = fundingWindowRows(summary);
  if (windows.length === 0) return null;
  const latest = windows[windows.length - 1];
  const previous = windows.length > 1 ? windows[windows.length - 2] : null;
  const overallMedianNetCarryBps = finite(summary.medianWindowNetCarryBps);
  const latestVsPreviousMedianNetCarryBps =
    previous === null ? null : latest.medianNetCarryBps - previous.medianNetCarryBps;
  const latestVsOverallMedianNetCarryBps =
    overallMedianNetCarryBps === null
      ? null
      : latest.medianNetCarryBps - overallMedianNetCarryBps;
  let consecutiveDeterioratingWindowCount = 0;
  for (let index = windows.length - 1; index > 0; index -= 1) {
    const current = windows[index] as { medianNetCarryBps: number };
    const prior = windows[index - 1] as { medianNetCarryBps: number };
    if (current.medianNetCarryBps >= prior.medianNetCarryBps) break;
    consecutiveDeterioratingWindowCount += 1;
  }
  const latestWindowLowCarry =
    latest.medianNetCarryBps < SPOT_PERP_CARRY_MIN_LIVE_PROMOTION_CARRY_BPS;
  const latestWindowDeteriorating =
    latestVsPreviousMedianNetCarryBps !== null &&
    latestVsPreviousMedianNetCarryBps < 0 &&
    (latestVsOverallMedianNetCarryBps ?? 0) < 0;
  const degradationSeverity = latestWindowLowCarry
    ? "below_live_promotion_threshold"
    : consecutiveDeterioratingWindowCount >= 2
      ? "multi_window_degradation"
      : latestWindowDeteriorating
        ? "single_window_degradation"
        : "none";
  const intervals = windows
    .slice(1)
    .map((window, index) => window.timestamp - (windows[index] as { timestamp: number }).timestamp)
    .filter((interval) => interval > 0)
    .sort((left, right) => left - right);
  const interval =
    intervals.length === 0
      ? null
      : intervals.length % 2 === 0
        ? ((intervals[intervals.length / 2 - 1] as number) +
            (intervals[intervals.length / 2] as number)) /
          2
        : (intervals[Math.floor(intervals.length / 2)] as number);
  return {
    windowCount: windows.length,
    latestWindow: {
      fundingSettledAt: latest.source.fundingSettledAt ?? null,
      sampleCount: latest.sampleCount,
      medianNetCarryBps: latest.medianNetCarryBps,
      medianEstimatedNetPnlKrw: latest.source.medianEstimatedNetPnlKrw ?? null,
    },
    previousWindow:
      previous === null
        ? null
        : {
            fundingSettledAt: previous.source.fundingSettledAt ?? null,
            sampleCount: previous.sampleCount,
            medianNetCarryBps: previous.medianNetCarryBps,
            medianEstimatedNetPnlKrw: previous.source.medianEstimatedNetPnlKrw ?? null,
          },
    overallMedianNetCarryBps,
    latestVsPreviousMedianNetCarryBps,
    latestVsOverallMedianNetCarryBps,
    latestWindowDeteriorating,
    consecutiveDeterioratingWindowCount,
    latestVsPeakMedianNetCarryBps:
      latest.medianNetCarryBps - Math.max(...windows.map((window) => window.medianNetCarryBps)),
    degradationSeverity,
    demotionGate: {
      reviewTrigger: "next_completed_fee_stressed_funding_window",
      latestFundingSettledAt: latest.source.fundingSettledAt ?? null,
      estimatedNextFundingSettledAt:
        interval === null ? null : new Date(latest.timestamp + interval).toISOString(),
      mustExceedLatestMedianNetCarryBpsToRecover: latest.medianNetCarryBps,
      lowCarryDemotionThresholdBps: SPOT_PERP_CARRY_MIN_LIVE_PROMOTION_CARRY_BPS,
      demotionCondition:
        "prepare demotion if the next completed fee-stressed funding window does not exceed the current latest median carry, or if it falls below the live-promotion carry threshold",
      recoveryCondition:
        "clear the demotion preparation only if the next completed fee-stressed funding window exceeds the current latest median carry and stays above the live-promotion carry threshold",
    },
  };
}

function buildFocusRecompareView(
  feeStressSummaries: Array<{
    path: string | null;
    generatedAt: string | null;
    fresh: boolean;
    assumptions: Record<string, unknown>;
    perMarketSummary: Array<Record<string, unknown>>;
  }>,
  selectedMarket: string | null,
): Record<string, unknown> | null {
  if (selectedMarket === null) return null;
  const rows: Array<Record<string, unknown> & { assumptions: Record<string, unknown> }> =
    feeStressSummaries.flatMap((report) =>
      report.perMarketSummary.map((market) => ({
        ...market,
        path: report.path,
        generatedAt: report.generatedAt,
        fresh: report.fresh,
        assumptions: report.assumptions,
      })),
    );
  const current = rows
    .filter((row) => stringValue(row.market) === selectedMarket)
    .sort(
      (left, right) =>
        (finite(right.assumptions.bithumbFeeBps) ?? 0) -
        (finite(left.assumptions.bithumbFeeBps) ?? 0),
    )[0] ?? null;
  const currentTrend = buildFundingWindowTrend(recordValue(current?.fundingWindowSummary));
  const currentLatest = recordValue(currentTrend?.latestWindow);
  const currentLatestCarry = finite(currentLatest.medianNetCarryBps);
  const currentLatestSampleCount = finite(currentLatest.sampleCount);
  const challengers = rows
    .filter((row) => stringValue(row.market) !== selectedMarket)
    .map((row) => {
      const trend = buildFundingWindowTrend(recordValue(row.fundingWindowSummary));
      const latest = recordValue(trend?.latestWindow);
      const latestCarry = finite(latest.medianNetCarryBps);
      const executionEligiblePositiveRate = finite(row.executionEligiblePositiveRate);
      const executionEligibleRate = finite(row.executionEligibleRate);
      const depthCoverageRate = finite(row.depthCoverageRate);
      const rawPricingArtifactCount = finite(row.rawPricingArtifactCount);
      const knownQualityFailureReasons = [
        executionEligiblePositiveRate !== null && executionEligiblePositiveRate < 0.67
          ? "positiveRateBelowSwitchThreshold"
          : null,
        executionEligibleRate !== null && executionEligibleRate < 0.5
          ? "executionEligibleRateBelowSwitchThreshold"
          : null,
        depthCoverageRate !== null && depthCoverageRate < 0.95
          ? "depthCoverageBelowSwitchThreshold"
          : null,
        rawPricingArtifactCount !== null && rawPricingArtifactCount > 0
          ? "rawPricingArtifactPresent"
          : null,
      ].filter((reason): reason is string => reason !== null);
      const qualityPasses =
        executionEligiblePositiveRate !== null &&
        executionEligibleRate !== null &&
        depthCoverageRate !== null &&
        executionEligiblePositiveRate >= 0.67 &&
        executionEligibleRate >= 0.5 &&
        depthCoverageRate >= 0.95 &&
        (rawPricingArtifactCount ?? 0) === 0;
      return {
        market: row.market ?? null,
        symbol: row.symbol ?? null,
        path: row.path ?? null,
        generatedAt: row.generatedAt ?? null,
        completedFundingCount:
          finite(recordValue(row.fundingWindowSummary).completedFundingWindowCount) ??
          finite(row.completedFundingCount),
        executionEligibleMedianNetCarryBps: finite(row.executionEligibleMedianNetCarryBps),
        executionEligiblePositiveRate,
        executionEligibleRate,
        depthCoverageRate,
        rawPricingArtifactCount,
        qualityPasses,
        knownQualityFailureReasons,
        trend,
        latestWindow: Object.keys(latest).length === 0 ? null : latest,
        latestCarry,
        deltaToCurrentLatestBps:
          latestCarry !== null && currentLatestCarry !== null ? latestCarry - currentLatestCarry : null,
      };
    })
    .filter((row) => row.latestCarry !== null)
    .sort((left, right) => {
      const rightDelta = right.deltaToCurrentLatestBps ?? Number.NEGATIVE_INFINITY;
      const leftDelta = left.deltaToCurrentLatestBps ?? Number.NEGATIVE_INFINITY;
      if (rightDelta !== leftDelta) return rightDelta - leftDelta;
      return (right.latestCarry ?? Number.NEGATIVE_INFINITY) - (left.latestCarry ?? Number.NEGATIVE_INFINITY);
    });
  const bestOverallChallenger = challengers[0] ?? null;
  const bestQualityClearedChallenger =
    challengers.find((challenger) => challenger.qualityPasses === true) ?? null;
  const currentLatestFundingSettledAt = stringValue(currentLatest.fundingSettledAt);
  const bestAlignedQualityClearedChallenger =
    challengers.find(
      (challenger) =>
        challenger.qualityPasses === true &&
        currentLatestFundingSettledAt !== null &&
        stringValue(recordValue(challenger.latestWindow).fundingSettledAt) ===
          currentLatestFundingSettledAt,
    ) ?? null;
  const bestChallenger =
    bestAlignedQualityClearedChallenger ?? bestQualityClearedChallenger ?? bestOverallChallenger;
  const bestChallengerSampleCount = finite(recordValue(bestChallenger?.latestWindow).sampleCount);
  const bestChallengerDelta = bestChallenger?.deltaToCurrentLatestBps ?? null;
  const bestChallengerLatestFundingSettledAt = stringValue(
    recordValue(bestChallenger?.latestWindow).fundingSettledAt,
  );
  const latestWindowsAligned =
    currentLatestFundingSettledAt !== null &&
    bestChallengerLatestFundingSettledAt !== null &&
    currentLatestFundingSettledAt === bestChallengerLatestFundingSettledAt;
  const currentFocusDeteriorating =
    ["multi_window_degradation", "below_live_promotion_threshold"].includes(
      stringValue(currentTrend?.degradationSeverity) ?? "",
    );
  const currentFocusLatestWindowDeteriorating =
    recordValue(currentTrend).latestWindowDeteriorating === true;
  const currentFocusDegradationSeverity =
    stringValue(currentTrend?.degradationSeverity) ?? null;
  const latestWindowSampleQualityPasses =
    (currentLatestSampleCount ?? 0) >= SPOT_PERP_CARRY_MIN_LATEST_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE &&
    (bestChallengerSampleCount ?? 0) >= SPOT_PERP_CARRY_MIN_LATEST_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE;
  const challengerBeatsCurrentLatest =
    latestWindowsAligned && bestChallengerDelta !== null && bestChallengerDelta > 0;
  const qualityClearedChallengerBeatsCurrentLatest =
    bestChallenger?.qualityPasses === true &&
    challengerBeatsCurrentLatest;
  const latestWindowRecompareSignal =
    challengerBeatsCurrentLatest &&
    (currentFocusDeteriorating || qualityClearedChallengerBeatsCurrentLatest);
  const needsRecompareBeforeLive =
    latestWindowRecompareSignal;
  return {
    status: needsRecompareBeforeLive ? "current_focus_recompare_required" : "current_focus_recompare_clear",
    selectedMarket,
    currentFocusTrend: currentTrend,
    bestChallenger:
      bestChallenger === null
        ? null
        : {
            market: bestChallenger.market,
            symbol: bestChallenger.symbol,
            path: bestChallenger.path,
            generatedAt: bestChallenger.generatedAt,
            completedFundingCount: bestChallenger.completedFundingCount,
            executionEligibleMedianNetCarryBps:
              bestChallenger.executionEligibleMedianNetCarryBps,
            executionEligiblePositiveRate: bestChallenger.executionEligiblePositiveRate,
            executionEligibleRate: bestChallenger.executionEligibleRate,
            depthCoverageRate: bestChallenger.depthCoverageRate,
            rawPricingArtifactCount: bestChallenger.rawPricingArtifactCount,
            qualityPasses: bestChallenger.qualityPasses,
            knownQualityFailureReasons: bestChallenger.knownQualityFailureReasons,
            latestWindow: bestChallenger.latestWindow,
            deltaToCurrentLatestBps: bestChallenger.deltaToCurrentLatestBps,
          },
    bestOverallChallenger:
      bestOverallChallenger === null
        ? null
        : {
            market: bestOverallChallenger.market,
            symbol: bestOverallChallenger.symbol,
            latestWindow: bestOverallChallenger.latestWindow,
            deltaToCurrentLatestBps: bestOverallChallenger.deltaToCurrentLatestBps,
            qualityPasses: bestOverallChallenger.qualityPasses,
            knownQualityFailureReasons: bestOverallChallenger.knownQualityFailureReasons,
          },
    bestChallengerSelectionScope:
      bestAlignedQualityClearedChallenger !== null
        ? "best_aligned_quality_cleared_challenger"
        : bestQualityClearedChallenger !== null
        ? "best_quality_cleared_challenger"
        : bestOverallChallenger !== null
          ? "best_overall_challenger_no_quality_cleared"
          : "none",
    requiredFundingWindowCountForSwitch: SPOT_PERP_CARRY_REQUIRED_FEE_STRESS_WINDOWS_FOR_SWITCH,
    minLatestWindowSampleCountForRecompare:
      SPOT_PERP_CARRY_MIN_LATEST_WINDOW_SAMPLE_COUNT_FOR_RECOMPARE,
    latestWindowSampleQualityPasses,
    latestWindowsAligned,
    currentFocusLatestFundingSettledAt: currentLatestFundingSettledAt,
    bestChallengerLatestFundingSettledAt,
    currentFocusDeteriorating,
    currentFocusLatestWindowDeteriorating,
    currentFocusDegradationSeverity,
    challengerBeatsCurrentLatest,
    qualityClearedChallengerBeatsCurrentLatest,
    latestWindowRecompareSignal,
    needsRecompareBeforeLive,
    action: needsRecompareBeforeLive
      ? latestWindowSampleQualityPasses
        ? "block_current_focus_live_startup_and_recompare_challengers"
        : "collect_latest_window_samples_and_keep_current_focus_live_startup_blocked"
      : "continue_current_focus_observation",
    interpretation:
      "Blocks live preparation when the current carry focus is deteriorating or a quality-cleared challenger beats it in the aligned latest fee-stressed funding window; this is a research-focus rule, not live authorization.",
  };
}

function carryEvidenceSnapshot(
  label: string,
  path: string | null,
  report: SpotPerpCarryReport | null,
): Record<string, unknown> | null {
  if (report === null) return null;
  return {
    label,
    path,
    status: report.status ?? null,
    promotionEligible: report.promotionEligible === true,
    blockers: report.blockers ?? [],
    estimatedNetPnlKrw: carrySummaryEstimatedPnlKrw(report),
    medianNetCarryBps: carrySummaryMedianNetCarryBps(report),
    positiveRate: carrySummaryPositiveRate(report),
    completedFundingCount: report.summary?.completedFundingCount ?? null,
    observationCount: report.summary?.count ?? null,
    observationSpanMinutes: finite(report.observationSpanMinutes),
    executionEligibleCount: report.summary?.executionEligibleCount ?? null,
    executionEligibleRate: report.summary?.executionEligibleRate ?? null,
    spreadControl: carrySpreadControlDiagnostics(report),
  };
}

function carryWatchCandidateRole(
  role: string,
  watch: {
    path: string | null;
    executableEvidence: {
      estimatedNetPnlKrw: number | null;
      medianNetCarryBps: number | null;
      positiveRate: number | null;
      completedFundingCount: number | null;
      observationCount: number | null;
      observationSpanMinutes: number | null;
    };
    spreadControl: Record<string, unknown> | null;
    topExecutableCarry: Array<{
      market?: string;
      symbol?: string;
      netCarryBps?: number;
      estimatedNetPnlKrw?: number;
    }>;
    blockers: string[];
  } | null,
): Record<string, unknown> | null {
  if (watch === null) return null;
  return {
    role,
    path: watch.path,
    market: watch.topExecutableCarry[0]?.market ?? null,
    symbol: watch.topExecutableCarry[0]?.symbol ?? null,
    estimatedNetPnlKrw: watch.executableEvidence.estimatedNetPnlKrw,
    medianNetCarryBps: watch.executableEvidence.medianNetCarryBps,
    positiveRate: watch.executableEvidence.positiveRate,
    completedFundingCount: watch.executableEvidence.completedFundingCount,
    observationCount: watch.executableEvidence.observationCount,
    observationSpanMinutes: watch.executableEvidence.observationSpanMinutes,
    spreadControlPassed: watch.spreadControl?.passed === true,
    executionRejectedRate: watch.spreadControl?.executionRejectedRate ?? null,
    rawPricingArtifactCount: watch.spreadControl?.rawPricingArtifactCount ?? null,
    blockers: watch.blockers,
    usableForLivePromotion: false,
  };
}

function carryPerMarketEvidence(row: NonNullable<SpotPerpCarryReport["perMarketSummary"]>[number]) {
  return {
    market: row.market ?? null,
    symbol: row.symbol ?? null,
    count: finite(row.count),
    completedFundingCount: finite(row.completedFundingCount),
    executionEligibleCount: finite(row.executionEligibleCount),
    executionEligibleRate: finite(row.executionEligibleRate),
    executionEligiblePositiveRate:
      finite(row.executionEligiblePositiveRate) ?? finite(row.positiveRate),
    executionEligibleMedianNetCarryBps:
      finite(row.executionEligibleMedianNetCarryBps) ?? finite(row.medianNetCarryBps),
    executionEligibleTotalEstimatedNetPnlKrw:
      finite(row.executionEligibleTotalEstimatedNetPnlKrw) ??
      finite(row.totalEstimatedNetPnlKrw),
    fundingWindowSummary: row.fundingWindowSummary ?? null,
    depthCoverageRate: finite(row.depthCoverageRate),
    rawPricingArtifactCount: finite(row.rawPricingArtifactCount),
    watchDecision: row.watchDecision ?? null,
  };
}

function buildSpotPerpCarryPairedMarketComparison(
  reports: SpotPerpCarryReport[],
  paths: string[],
  focusMarket: string | null,
  focusSymbol: string | null,
): Record<string, unknown> | null {
  const pairedReports = reports
    .map((report, index) => ({
      report,
      path: paths[index] ?? null,
      generatedAt: report.generatedAt ?? null,
      generatedAtMs: Date.parse(report.generatedAt ?? ""),
      marketCount: report.perMarketSummary?.length ?? 0,
      repeatedMarketCount:
        report.perMarketSummary?.filter((market) => (finite(market.count) ?? 0) > 1).length ?? 0,
      focusMarketCount:
        report.perMarketSummary?.find(
          (market) =>
            (focusMarket === null || market.market === focusMarket) &&
            (focusSymbol === null || market.symbol === focusSymbol),
        )?.count ?? null,
    }))
    .filter((entry) => entry.marketCount > 1)
    .sort((left, right) => {
      const rightFocusCount = finite(right.focusMarketCount) ?? 0;
      const leftFocusCount = finite(left.focusMarketCount) ?? 0;
      const rightRepeatedFocus = rightFocusCount > 1 ? 1 : 0;
      const leftRepeatedFocus = leftFocusCount > 1 ? 1 : 0;
      if (rightRepeatedFocus !== leftRepeatedFocus) {
        return rightRepeatedFocus - leftRepeatedFocus;
      }
      if (rightFocusCount !== leftFocusCount) return rightFocusCount - leftFocusCount;
      if (right.repeatedMarketCount !== left.repeatedMarketCount) {
        return right.repeatedMarketCount - left.repeatedMarketCount;
      }
      const rightTime = Number.isFinite(right.generatedAtMs) ? right.generatedAtMs : 0;
      const leftTime = Number.isFinite(left.generatedAtMs) ? left.generatedAtMs : 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return right.marketCount - left.marketCount;
    });
  const selected = pairedReports[0] ?? null;
  if (selected === null) return null;
  const markets = (selected.report.perMarketSummary ?? []).map(carryPerMarketEvidence);
  const executableMarkets = markets.filter(
    (market) =>
      (market.executionEligibleCount === null || market.executionEligibleCount > 0) &&
      (market.executionEligibleRate ?? 0) > 0 &&
      (market.rawPricingArtifactCount ?? 0) === 0,
  );
  const strongestByMedianNetCarry =
    executableMarkets
      .filter((market) => market.executionEligibleMedianNetCarryBps !== null)
      .sort(
        (left, right) =>
          (right.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY) -
          (left.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY),
      )[0] ?? null;
  const strongestByEstimatedPnl =
    executableMarkets
      .filter((market) => market.executionEligibleTotalEstimatedNetPnlKrw !== null)
      .sort(
        (left, right) =>
          (right.executionEligibleTotalEstimatedNetPnlKrw ?? Number.NEGATIVE_INFINITY) -
          (left.executionEligibleTotalEstimatedNetPnlKrw ?? Number.NEGATIVE_INFINITY),
      )[0] ?? null;
  return {
    path: selected.path,
    generatedAt: selected.generatedAt,
    fresh: isFresh(selected.generatedAt ?? undefined, 60 * 60 * 1000),
    observationCount: finite(selected.report.summary?.count),
    observationSpanMinutes: finite(selected.report.observationSpanMinutes),
    completedFundingCount: finite(selected.report.summary?.completedFundingCount),
    marketCount: markets.length,
    repeatedMarketCount: selected.repeatedMarketCount,
    focusMarket,
    focusSymbol,
    focusMarketCount: finite(selected.focusMarketCount),
    markets,
    strongestByMedianNetCarry,
    strongestByEstimatedPnl,
    interpretation:
      "Same-sample market comparison from one repeated paired observation report; use this to sanity-check research ranking before relying on appended single-market histories. Raw pricing artifacts and markets with zero executable observations are excluded from strongest-market selection.",
  };
}

function pairedComparisonSupportsFocus(
  comparison: Record<string, unknown> | null,
  focusMarket: string | null,
  focusSymbol: string | null,
): boolean | null {
  if (comparison === null) return null;
  const strongest = comparison.strongestByMedianNetCarry;
  if (typeof strongest !== "object" || strongest === null) return false;
  const strongestRecord = strongest as Record<string, unknown>;
  const strongestMarket =
    typeof strongestRecord.market === "string" ? strongestRecord.market : null;
  const strongestSymbol =
    typeof strongestRecord.symbol === "string" ? strongestRecord.symbol : null;
  if (focusMarket === null || strongestMarket === null) return false;
  return strongestMarket === focusMarket && (focusSymbol === null || strongestSymbol === focusSymbol);
}

function diffNullable(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return Math.round((left - right) * 1_000_000) / 1_000_000;
}

function rowKey(row: { market?: string; symbol?: string }): string {
  return `${row.market ?? ""}|${row.symbol ?? ""}`;
}

function buildCarryArtifactWarnings(
  report: SpotPerpCarryReport | null,
  path: string | null,
  role: string,
): Array<Record<string, unknown>> {
  if (report === null || !Array.isArray(report.topExecutableCarry)) return [];
  const executableKeys = new Set(report.topExecutableCarry.map(rowKey));
  const warnings: Array<Record<string, unknown>> = [];
  for (const row of report.topCarry ?? []) {
    const netCarryBps = finite(row.netCarryBps);
    if (netCarryBps === null || Math.abs(netCarryBps) < 1_000) continue;
    if (executableKeys.has(rowKey(row))) continue;
    warnings.push({
      role,
      path,
      market: row.market ?? null,
      symbol: row.symbol ?? null,
      reason: "rawTopCarryExcludedByExecutionPolicy",
      rawNetCarryBps: netCarryBps,
      estimatedNetPnlKrw: finite(row.estimatedNetPnlKrw),
      spotSpreadBps: finite(row.spotSpreadBps),
      perpSpreadBps: finite(row.perpSpreadBps),
      usdtKrwSpreadBps: finite(row.usdtKrwSpreadBps),
      interpretation:
        "Raw carry is not executable evidence; use executionEligible metrics for live decisions.",
    });
  }
  for (const market of report.perMarketSummary ?? []) {
    const rawMedian = finite(market.medianNetCarryBps);
    const executionEligibleCount = market.executionEligibleCount ?? 0;
    if (rawMedian === null || Math.abs(rawMedian) < 1_000 || executionEligibleCount > 0) {
      continue;
    }
    warnings.push({
      role,
      path,
      market: market.market ?? null,
      symbol: market.symbol ?? null,
      reason: "rawPerMarketCarryExcludedByExecutionPolicy",
      rawMedianNetCarryBps: rawMedian,
      executionEligibleCount,
      interpretation:
        "Per-market raw carry is excluded because it has no execution-eligible observations.",
    });
  }
  return warnings;
}

function everyChecklistPasses(
  checklist: Record<string, boolean> | undefined,
  keys: string[],
): boolean {
  return keys.every((key) => checklist?.[key] === true);
}

function inferManagedReturnMarket(summary: {
  source?: { reportsRoot?: string } | null;
  path?: string | null;
}): string | null {
  const source = `${summary.source?.reportsRoot ?? ""} ${summary.path ?? ""}`;
  if (source.includes("pieverse")) return "KRW-PIEVERSE";
  if (source.includes("stable")) return "KRW-STABLE";
  if (source.includes("krw-h")) return "KRW-H";
  if (source.includes("btc-240m") || source.includes("KRW-BTC")) return "KRW-BTC";
  return null;
}

function replacementResearchScore(summary: {
  fresh: boolean;
  classification: string | null;
  paperReady: boolean;
  liveReady: boolean;
  benchmarkSummary: TimeSeriesReadiness["benchmarkSummary"] | null;
}): number {
  if (!summary.fresh || summary.classification === "discard_candidate") {
    return Number.NEGATIVE_INFINITY;
  }
  const benchmark = summary.benchmarkSummary;
  return (
    (summary.liveReady ? 1_000_000_000 : 0) +
    (summary.paperReady ? 100_000_000 : 0) +
    ((benchmark?.test?.medianPnlKrw ?? 0) * 10) +
    (benchmark?.test?.totalPnlKrw ?? 0) +
    ((benchmark?.walkForward?.minFoldPnlKrw ?? 0) * 5) +
    (benchmark?.strategyReturnPct ?? 0)
  );
}

function summarizeReplacementCandidate(candidate: ReplacementCandidate | null, fallbackMarket?: string) {
  return candidate === null
    ? null
    : {
        market: candidate.market ?? fallbackMarket ?? null,
        lookbackBars: candidate.lookbackBars ?? null,
        holdBars: candidate.holdBars ?? null,
        minReturnBps: candidate.minReturnBps ?? null,
        minEligibleMarkets: candidate.minEligibleMarkets ?? null,
        riskFilter: candidate.riskFilter ?? null,
        tradeCount: candidate.tradeCount ?? null,
        returnPct: candidate.returnPct ?? null,
        buyHoldReturnPct: candidate.buyHoldReturnPct ?? null,
        excessReturnVsBuyHoldPct: candidate.excessReturnVsBuyHoldPct ?? null,
        maxDrawdownPct: candidate.maxDrawdownPct ?? null,
        passesPromotion: candidate.passesPromotion ?? null,
        train: candidate.train ?? null,
        test: candidate.test ?? null,
        walkForward:
          candidate.walkForward === undefined
            ? null
            : {
                positiveTotalFoldCount:
                  candidate.walkForward.positiveTotalFoldCount ?? null,
                positiveMedianFoldCount:
                  candidate.walkForward.positiveMedianFoldCount ?? null,
                minFoldPnlKrw: candidate.walkForward.minFoldPnlKrw ?? null,
              },
  };
}

function strongestNearMissCandidate(scan: ReplacementScan): ReplacementCandidate | null {
  const candidates = scan.nearMiss ?? scan.topByExcess ?? [];
  return candidates[0] ?? null;
}

function replacementPromotionScore(candidate: ReturnType<typeof summarizeReplacementCandidate>): number {
  if (candidate === null) {
    return Number.NEGATIVE_INFINITY;
  }
  return (
    ((candidate.walkForward?.minFoldPnlKrw ?? 0) * 5) +
    (candidate.test?.totalPnlKrw ?? 0) +
    ((candidate.test?.medianPnlKrw ?? 0) * 10) +
    (candidate.train?.totalPnlKrw ?? 0)
  );
}

function replacementVerificationCommand(market: string | null | undefined): string {
  if (market === "KRW-PIEVERSE") {
    return "npm run dry-run:review-pieverse-60m-reversal-lb168-live-ready";
  }
  if (market === "KRW-STABLE") {
    return "npm run dry-run:refresh-stable-60m-reversal-readiness && npm run dry-run:gate-stable-60m-reversal-live-path-ready && npm run dry-run:gate-stable-60m-reversal-live-ready && npm run dry-run:gate-live-goal-ready";
  }
  if (market === "KRW-H") {
    return "npm run dry-run:refresh-h-60m-momentum-readiness && npm run dry-run:gate-h-60m-momentum-live-path-ready && npm run dry-run:gate-h-60m-momentum-live-ready && npm run dry-run:gate-live-goal-ready";
  }
  return "npm run dry-run:gate-live-goal-ready";
}

function managedPaperScore(summary: {
  classification: string | null;
  tradedSessionCount: number;
  closedTradeCount: number;
  closedTradePnlKrw: number | null;
  tradedPnlKrw: number | null;
  totalPnlKrw: number | null;
  latestSession?: { openPositionCount?: number; markedPnlKrw?: number } | null;
}): number {
  if (summary.classification === null || summary.classification === "discard_candidate") {
    return Number.NEGATIVE_INFINITY;
  }
  return (
    summary.closedTradeCount * 1_000_000 +
    Math.max(summary.closedTradePnlKrw ?? 0, 0) * 100 +
    summary.tradedSessionCount * 10_000 +
    Math.max(summary.tradedPnlKrw ?? 0, 0) +
    Math.max(summary.totalPnlKrw ?? 0, 0) +
    ((summary.latestSession?.openPositionCount ?? 0) > 0 ? 100 : 0) +
    Math.max(summary.latestSession?.markedPnlKrw ?? 0, 0)
  );
}

function managedPaperHasLosingEvidence(summary: {
  tradedPnlKrw: number | null;
  closedTradePnlKrw: number | null;
  totalPnlKrw: number | null;
}): boolean {
  return (
    (summary.tradedPnlKrw ?? 0) < 0 ||
    (summary.closedTradePnlKrw ?? 0) < 0 ||
    (summary.totalPnlKrw ?? 0) < 0
  );
}

function managedPaperVerificationCommand(market: string | null | undefined): string {
  if (market === "KRW-BTC") {
    return "npm run dry-run:returns:btc-240m-momentum-lb168-hold72-range-p70-managed-paper && npm run dry-run:gate-live-goal-ready";
  }
  return "npm run dry-run:gate-live-goal-ready";
}

function summarizeSummaryLike(summary: SummaryLike | undefined) {
  return summary === undefined
    ? null
    : {
        count: summary.count ?? null,
        totalPnlKrw: summary.totalPnlKrw ?? null,
        medianPnlKrw: summary.medianPnlKrw ?? null,
        returnPct: summary.returnPct ?? null,
      };
}

function summarizeDerivativesGatedCandidate(
  candidate: DerivativesGatedCandidate | undefined,
  pair: DerivativesGatedPair,
) {
  return candidate === undefined
    ? null
    : {
        market: pair.market ?? null,
        symbol: pair.symbol ?? null,
        lookbackBars: candidate.lookbackBars ?? null,
        holdBars: candidate.holdBars ?? null,
        minReturnBps: candidate.minReturnBps ?? null,
        baselineTrain: summarizeSummaryLike(candidate.baselineTrain),
        baselineTest: summarizeSummaryLike(candidate.baselineTest),
        train: summarizeSummaryLike(candidate.train),
        test: summarizeSummaryLike(candidate.test),
        walkForward:
          candidate.walkForward === undefined
            ? null
            : {
                foldCount: candidate.walkForward.foldCount ?? null,
                positiveTotalFoldCount:
                  candidate.walkForward.positiveTotalFoldCount ?? null,
                positiveMedianFoldCount:
                  candidate.walkForward.positiveMedianFoldCount ?? null,
                totalPnlKrw: candidate.walkForward.totalPnlKrw ?? null,
                minFoldPnlKrw: candidate.walkForward.minFoldPnlKrw ?? null,
              },
        gatedTradeCount: candidate.gatedTradeCount ?? null,
        baselineTradeCount: candidate.baselineTradeCount ?? null,
        promotionEligible: candidate.promotionEligible === true,
        diagnosticImprovement: candidate.diagnosticImprovement === true,
        score: candidate.score ?? null,
      };
}

function derivativesGatedCandidateScore(
  candidate: ReturnType<typeof summarizeDerivativesGatedCandidate>,
): number {
  if (candidate === null) return Number.NEGATIVE_INFINITY;
  return (
    (candidate.promotionEligible ? 1_000_000_000 : 0) +
    (candidate.diagnosticImprovement ? 100_000_000 : 0) +
    (candidate.test?.totalPnlKrw ?? 0) +
    ((candidate.test?.medianPnlKrw ?? 0) * 10) +
    (candidate.train?.totalPnlKrw ?? 0) +
    ((candidate.walkForward?.positiveTotalFoldCount ?? 0) * 10_000) +
    ((candidate.walkForward?.positiveMedianFoldCount ?? 0) * 10_000) +
    Math.max(candidate.walkForward?.minFoldPnlKrw ?? 0, 0)
  );
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2), cwd);
  const [min75, legacy, ...replacementScans] = await Promise.all([
    readJson<TimeSeriesReadiness>(args.min75ReadinessPath),
    readJson<LegacyAudit>(args.legacyAuditPath),
    ...args.replacementScanPaths.map((path) => readJson<ReplacementScan>(path)),
  ]);
  const replacementReadinessReports = await Promise.all(
    args.replacementReadinessPaths.map((path) => readJson<TimeSeriesReadiness>(path)),
  );
  const replacementLivePathReadinessReports = await Promise.all(
    args.replacementLivePathReadinessPaths.map((path) =>
      readJson<ReplacementLivePathReadiness>(path),
    ),
  );
  const replacementManagedReturnSummaryReports = await Promise.all(
    args.replacementManagedReturnSummaryPaths.map((path) =>
      readJson<ManagedReturnSummary>(path),
    ),
  );
  const derivativesGatedReports = await Promise.all(
    args.derivativesGatedReportPaths.map((path) => readJson<DerivativesGatedReport>(path)),
  );
  const dataCoverage =
    args.dataCoveragePath === null
      ? null
      : await readJson<DataCoverageAudit>(args.dataCoveragePath);
  const crossExchange =
    args.crossExchangeReadinessPath === null
      ? null
      : await readJson<CrossExchangeReadiness>(args.crossExchangeReadinessPath);
  const spotPerpCarry =
    args.spotPerpCarryReportPath === null
      ? null
      : await readJson<SpotPerpCarryReport>(args.spotPerpCarryReportPath);
  const spotPerpCarryWatchReports = await Promise.all(
    args.spotPerpCarryWatchReportPaths.map((path) => readJson<SpotPerpCarryReport>(path)),
  );
  const spotPerpCarryFeeStressReports = await Promise.all(
    args.spotPerpCarryFeeStressReportPaths.map((path) =>
      readJson<SpotPerpCarryReport>(path),
    ),
  );
  const spotPerpCarryLiveReadinessReports = await Promise.all(
    args.spotPerpCarryLiveReadinessPaths.map((path) =>
      readJson<SpotPerpCarryLiveReadinessReport>(path),
    ),
  );
  const signalExecutionCoverage =
    args.signalExecutionCoveragePath === null
      ? null
      : await readJson<SignalExecutionCoverageReport>(args.signalExecutionCoveragePath);

  const min75LiveReady = min75.liveReadiness?.ready === true;
  const liveReasons = min75.liveReadiness?.reasons ?? [];
  const realizedExitAvailable = min75.liveReadiness?.checks?.realizedExitAvailable === true;
  const noOpenPaperPositionAfterExit =
    min75.liveReadiness?.checks?.noOpenPaperPositionAfterExit === true;
  const positiveRealizedPaperExitPnl =
    min75.liveReadiness?.checks?.positiveRealizedPaperExitPnl === true;
  const benchmarkBeatsHold =
    finite(min75.benchmarkSummary?.excessReturnVsBuyHoldPct) !== null &&
    (min75.benchmarkSummary?.excessReturnVsBuyHoldPct ?? 0) > 0;
  const feeBenchmarkPresent =
    finite(min75.benchmarkSummary?.feeRoundTripBps) !== null &&
    (min75.benchmarkSummary?.feeRoundTripBps ?? 0) >= 20;
  const legacyLiveReadyLabels = legacy.recommendation?.liveReadyLabels ?? [];
  const legacyNextPaperCandidate = legacy.recommendation?.nextPaperCandidate ?? null;
  const legacyCandidatesBlocked =
    legacy.recommendation?.decisionSummary?.live === "blocked" &&
    legacyLiveReadyLabels.length === 0 &&
    legacyNextPaperCandidate === null;
  const replacementScanSummaries = replacementScans.map((scan, index) => {
    const top = scan.topByTest?.[0] ?? null;
    const topPromotionCandidate = scan.promotionCandidates?.[0] ?? null;
    const topNearMiss = strongestNearMissCandidate(scan);
    const fallbackMarket = scan.assumptions?.market;
    return {
      path: args.replacementScanPaths[index] ?? null,
      generatedAt: scan.generatedAt ?? null,
      feeRoundTripBps: scan.assumptions?.feeRoundTripBps ?? null,
      sourceReady: scan.sourceReady ?? null,
      sourceFailureCount: scan.sourceFailureCount ?? null,
      sourceFailures: scan.sourceFailures ?? [],
      candidateCount: scan.candidateCount ?? null,
      promotionCandidateCount: scan.promotionCandidateCount ?? null,
      topPromotionCandidate: summarizeReplacementCandidate(topPromotionCandidate, fallbackMarket),
      topByTest: summarizeReplacementCandidate(top, fallbackMarket),
      topNearMiss: summarizeReplacementCandidate(topNearMiss, fallbackMarket),
    };
  });
  const latestReplacementScan =
    replacementScanSummaries
      .slice()
      .sort((a, b) => {
        const aTime = Date.parse(a.generatedAt ?? "");
        const bTime = Date.parse(b.generatedAt ?? "");
        const aRank = Number.isFinite(aTime) ? aTime : -Infinity;
        const bRank = Number.isFinite(bTime) ? bTime : -Infinity;
        return bRank - aRank;
      })[0] ?? null;
  const replacementScansHaveNoPromotionCandidates =
    replacementScanSummaries.length > 0 &&
    replacementScanSummaries.every((scan) => scan.promotionCandidateCount === 0);
  const latestReplacementScanHasNoPromotionCandidate =
    latestReplacementScan !== null && latestReplacementScan.promotionCandidateCount === 0;
  const supersededPromotionCandidateCount =
    latestReplacementScan === null
      ? 0
      : replacementScanSummaries
          .filter((scan) => scan.path !== latestReplacementScan.path)
          .reduce((sum, scan) => sum + (scan.promotionCandidateCount ?? 0), 0);
  const promotionCandidatesByScan = replacementScanSummaries
    .filter((scan) => scan.topPromotionCandidate !== null && scan.topPromotionCandidate !== undefined)
    .map((scan) => ({
      sourcePath: scan.path,
      generatedAt: scan.generatedAt,
      feeRoundTripBps: scan.feeRoundTripBps,
      candidate: scan.topPromotionCandidate,
      score: replacementPromotionScore(scan.topPromotionCandidate),
    }));
  const strongestPromotionCandidate =
    promotionCandidatesByScan
      .slice()
      .sort((left, right) => right.score - left.score)[0] ?? null;
  const strongestLiveCompatiblePromotionCandidate =
    promotionCandidatesByScan
      .filter(
        (entry) =>
          (entry.feeRoundTripBps ?? 0) >= 35 &&
          (entry.sourcePath ?? "").includes("live-compatible"),
      )
      .slice()
      .sort((left, right) => right.score - left.score)[0] ?? null;
  const nextReplacementCandidate =
    latestReplacementScan?.topPromotionCandidate === null ||
    latestReplacementScan?.topPromotionCandidate === undefined
      ? null
      : {
          sourcePath: latestReplacementScan.path,
          generatedAt: latestReplacementScan.generatedAt,
          feeRoundTripBps: latestReplacementScan.feeRoundTripBps,
          candidate: latestReplacementScan.topPromotionCandidate,
        };
  const replacementReadinessSummaries = replacementReadinessReports.map((readiness, index) => {
    const fresh = isFresh(readiness.generatedAt, 15 * 60 * 1000);
    const liveReady = readiness.liveReadiness?.ready === true;
    const paperReady = readiness.paperReadiness?.ready === true;
    return {
      path: args.replacementReadinessPaths[index] ?? null,
      generatedAt: readiness.generatedAt ?? null,
      fresh,
      classification: readiness.strategyAssessment?.classification ?? null,
      paperReady,
      paperReasons: readiness.paperReadiness?.reasons ?? [],
      paperChecks: readiness.paperReadiness?.checks ?? {},
      liveReady,
      liveReasons: readiness.liveReadiness?.reasons ?? [],
      liveChecks: readiness.liveReadiness?.checks ?? {},
      paperExecution: readiness.paperExecution ?? null,
      inputs: readiness.inputs ?? null,
      candidate: readiness.candidate ?? null,
      benchmarkSummary: readiness.benchmarkSummary ?? null,
      openPosition: readiness.openPosition ?? null,
    };
  });
  const replacementLivePathSummaries = replacementLivePathReadinessReports.map((readiness, index) => ({
    path: args.replacementLivePathReadinessPaths[index] ?? null,
    generatedAt: readiness.generatedAt ?? null,
    fresh: isFresh(readiness.generatedAt, 15 * 60 * 1000),
    market: readiness.market ?? null,
    strategyId: readiness.strategyId ?? null,
    ready: readiness.ready === true,
    reasons: readiness.reasons ?? [],
    checks: readiness.checks ?? {},
    liveProcessName: readiness.liveProcessName ?? null,
    refreshCommandName: readiness.refreshCommandName ?? null,
    gateCommandName: readiness.gateCommandName ?? null,
    interpretation: readiness.interpretation ?? null,
  }));
  const replacementManagedReturnSummaries = replacementManagedReturnSummaryReports.map(
    (summary, index) => {
      const path = args.replacementManagedReturnSummaryPaths[index] ?? null;
      const normalized = {
        path,
        source: summary.source ?? null,
      };
      return {
        ...normalized,
        market: inferManagedReturnMarket(normalized),
        sessionCount: summary.sessionCount ?? 0,
        exposureSessionCount: summary.exposureSessionCount ?? summary.tradedSessionCount ?? 0,
        tradedSessionCount: summary.tradedSessionCount ?? 0,
        filledSessionCount: summary.filledSessionCount ?? 0,
        orderedSessionCount: summary.orderedSessionCount ?? 0,
        openMarkSessionCount: summary.openMarkSessionCount ?? 0,
        openPositionSessionCount: summary.openPositionSessionCount ?? 0,
        sessionCountInterpretation: summary.sessionCountInterpretation ?? null,
        totalPnlKrw: summary.allSessions?.totalPnlKrw ?? null,
        avgReturnPct: summary.allSessions?.avgReturnPct ?? null,
        tradedPnlKrw: summary.tradedSessionsOnly?.totalPnlKrw ?? null,
        tradedAvgReturnPct: summary.tradedSessionsOnly?.avgReturnPct ?? null,
        closedTradeCount: summary.closedTradesOnly?.closedTradeCount ?? 0,
        closedTradePnlKrw: summary.closedTradesOnly?.totalPnlKrw ?? null,
        openPositionSessions: summary.allSessions?.openPositionSessions ?? 0,
        cycleSummary: summary.cycleSummary ?? null,
        classification: summary.strategyAssessment?.classification ?? null,
        rationale: summary.strategyAssessment?.rationale ?? null,
        latestSession: summary.latestSession ?? null,
        quality:
          summary.quality === undefined
            ? null
            : {
                rejectedDecisionSessions:
                  summary.quality.rejectedDecisionSessions ?? null,
                signalRejectedDecisionSessions:
                  summary.quality.signalRejectedDecisionSessions ?? null,
                signalRejectedDecisionCount:
                  summary.quality.signalRejectedDecisionCount ?? null,
                signalRejectedReasonCounts:
                  summary.quality.signalRejectedReasonCounts ?? {},
              },
        executionGuardRejections:
          summary.lossCauseExperiments?.entryExecutionGuardRejections ?? null,
        liveReasons: summary.liveReadiness?.reasons ?? [],
        liveChecks: summary.liveReadiness?.checks ?? {},
      };
    },
  );
  const derivativesGatedSummaries = derivativesGatedReports.map((report, index) => {
    const pairs = report.pairs ?? [];
    const topCandidates = pairs
      .map((pair) => summarizeDerivativesGatedCandidate(pair.topDiagnosticCandidates?.[0], pair))
      .filter((candidate) => candidate !== null);
    const bestDiagnosticCandidate =
      topCandidates
        .slice()
        .sort(
          (left, right) =>
            derivativesGatedCandidateScore(right) - derivativesGatedCandidateScore(left),
        )[0] ?? null;
    const promotionCandidateCount =
      report.promotionCandidateCount ??
      pairs.reduce((sum, pair) => sum + (pair.promotionCandidateCount ?? 0), 0);
    const diagnosticImprovementCount =
      report.diagnosticImprovementCount ??
      pairs.reduce((sum, pair) => sum + (pair.diagnosticImprovementCount ?? 0), 0);
    return {
      path: args.derivativesGatedReportPaths[index] ?? null,
      generatedAt: report.generatedAt ?? null,
      fresh: isFresh(report.generatedAt, 24 * 60 * 60 * 1000),
      unitMinutes: report.assumptions?.unitMinutes ?? null,
      feeRoundTripBps: report.assumptions?.feeRoundTripBps ?? null,
      minPromotionSpanDays: report.assumptions?.minPromotionSpanDays ?? null,
      promotionCandidateCount,
      diagnosticImprovementCount,
      bestDiagnosticCandidate,
      pairs: pairs.map((pair) => ({
        market: pair.market ?? null,
        symbol: pair.symbol ?? null,
        source: pair.source ?? null,
        promotionCandidateCount: pair.promotionCandidateCount ?? null,
        diagnosticImprovementCount: pair.diagnosticImprovementCount ?? null,
        topDiagnosticCandidate: summarizeDerivativesGatedCandidate(
          pair.topDiagnosticCandidates?.[0],
          pair,
        ),
      })),
      interpretation: report.interpretation ?? null,
    };
  });
  const derivativesGatedPromotionCandidateCount = derivativesGatedSummaries.reduce(
    (sum, report) => sum + (report.promotionCandidateCount ?? 0),
    0,
  );
  const derivativesGatedDiagnosticImprovementCount = derivativesGatedSummaries.reduce(
    (sum, report) => sum + (report.diagnosticImprovementCount ?? 0),
    0,
  );
  const strongestDerivativesGatedCandidate =
    derivativesGatedSummaries
      .map((summary) => ({
        report: summary,
        candidate: summary.bestDiagnosticCandidate,
      }))
      .filter(({ candidate }) => candidate !== null)
      .sort(
        (left, right) =>
          derivativesGatedCandidateScore(right.candidate) -
          derivativesGatedCandidateScore(left.candidate),
      )[0] ?? null;
  const derivativesGatedHasPromotionCandidate =
    derivativesGatedPromotionCandidateCount > 0 &&
    strongestDerivativesGatedCandidate?.candidate?.promotionEligible === true;
  const managedReturnForMarket = (market: string | null | undefined) =>
    market === null || market === undefined
      ? null
      : replacementManagedReturnSummaries.find((summary) => summary.market === market) ?? null;
  const rankedReplacementReadinessSummaries = replacementReadinessSummaries
    .map((summary) => ({
      summary,
      score: replacementResearchScore(summary),
    }))
    .sort((left, right) => right.score - left.score);
  const latestFreshReplacementReadiness =
    replacementReadinessSummaries
      .filter((summary) => summary.fresh)
      .slice()
      .sort((left, right) => {
        const leftTime = Date.parse(left.generatedAt ?? "");
        const rightTime = Date.parse(right.generatedAt ?? "");
        const leftRank = Number.isFinite(leftTime) ? leftTime : -Infinity;
        const rightRank = Number.isFinite(rightTime) ? rightTime : -Infinity;
        return rightRank - leftRank;
      })[0] ?? null;
  const replacementLiveCandidate =
    rankedReplacementReadinessSummaries.find(
      ({ summary }) => summary.fresh && summary.liveReady && summary.classification === "live_candidate",
    )?.summary ?? null;
  const strongestLiveCompatiblePromotionMarket =
    strongestLiveCompatiblePromotionCandidate?.candidate?.market ?? null;
  const strongestLiveCompatiblePromotionReadiness =
    strongestLiveCompatiblePromotionMarket === null
      ? null
      : replacementReadinessSummaries.find(
          (summary) =>
            summary.fresh &&
            summary.candidate?.market === strongestLiveCompatiblePromotionMarket,
        ) ?? null;
  const activeStrongestLiveCompatiblePromotionReadiness =
    strongestLiveCompatiblePromotionReadiness?.classification === "discard_candidate" ||
    (managedReturnForMarket(strongestLiveCompatiblePromotionReadiness?.candidate?.market)
      ?.classification === "discard_candidate")
      ? null
      : strongestLiveCompatiblePromotionReadiness;
  const strongestActiveReplacementReadiness =
    rankedReplacementReadinessSummaries.find(({ score }) => Number.isFinite(score))?.summary ??
    null;
  const replacementResearchFocus =
    replacementLiveCandidate ??
    activeStrongestLiveCompatiblePromotionReadiness ??
    strongestActiveReplacementReadiness ??
    strongestLiveCompatiblePromotionReadiness ??
    latestFreshReplacementReadiness ??
    (nextReplacementCandidate === null
      ? null
      : {
          path: nextReplacementCandidate.sourcePath,
          generatedAt: nextReplacementCandidate.generatedAt,
          fresh: isFresh(nextReplacementCandidate.generatedAt ?? undefined, 24 * 60 * 60 * 1000),
          classification: "research_candidate",
          paperReady: false,
          paperReasons: ["replacementReadinessReportMissing"],
          paperChecks: {},
          liveReady: false,
          liveReasons: ["replacementReadinessReportMissing"],
          liveChecks: {},
          inputs: null,
          candidate: nextReplacementCandidate.candidate,
          benchmarkSummary: null,
          openPosition: null,
        });
  const replacementResearchFocusLivePath =
    replacementResearchFocus?.candidate?.market === undefined
      ? null
      : replacementLivePathSummaries.find(
          (summary) =>
            summary.fresh &&
            summary.market === replacementResearchFocus.candidate?.market,
        ) ?? null;
  const replacementResearchFocusManagedReturn =
    managedReturnForMarket(replacementResearchFocus?.candidate?.market);
  const replacementResearchFocusManagedDiscarded =
    replacementResearchFocusManagedReturn?.classification === "discard_candidate";
  const leadingActiveManagedPaperReturn =
    replacementManagedReturnSummaries
      .map((summary) => ({
        summary,
        score: managedPaperScore(summary),
      }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) => right.score - left.score)[0]?.summary ?? null;
  const researchDataFresh = dataCoverage === null || dataCoverage.fresh === true;

  const min75Checklist = {
    min75ReadinessFresh: isFresh(min75.generatedAt, 15 * 60 * 1000),
    min75IsBtc240mMomentum:
      min75.candidate?.market === "KRW-BTC" &&
      min75.candidate.signalMode === "momentum" &&
      min75.candidate.unitMinutes === 240,
    min75UsesReplacementThreshold: min75.candidate?.minReturnBps === 75,
    min75BenchmarkBeatsBuyHold: benchmarkBeatsHold,
    min75BenchmarkCoversDiscountedFees: feeBenchmarkPresent,
    min75LiveReady,
    realizedExitAvailable,
    noOpenPaperPositionAfterExit,
    positiveRealizedPaperExitPnl,
    legacyCandidatesBlocked,
    researchDataFresh,
  };

  const min75CandidateLiveReady =
    min75Checklist.min75ReadinessFresh &&
    min75Checklist.min75IsBtc240mMomentum &&
    min75Checklist.min75UsesReplacementThreshold &&
    min75Checklist.min75BenchmarkBeatsBuyHold &&
    min75Checklist.min75BenchmarkCoversDiscountedFees &&
    min75Checklist.min75LiveReady &&
    min75Checklist.realizedExitAvailable &&
    min75Checklist.noOpenPaperPositionAfterExit &&
    min75Checklist.positiveRealizedPaperExitPnl &&
    min75Checklist.legacyCandidatesBlocked &&
    min75Checklist.researchDataFresh;

  const crossExchangeStrategyEvidenceKeys = [
    "reportPresent",
    "bestEdgeDirectionKnown",
    "globalReferenceVenue",
    "sufficientObservations",
    "observationSpanSufficient",
    "positiveEdgeRate",
    "positiveMedianNetEdge",
    "positiveEstimatedNetPnl",
    "depthCoverageReady",
    "latestObservationFresh",
    "fxFresh",
    "snapshotSkewControlled",
  ];
  const crossExchangeOperationalKeys = [
    "executionPathReady",
    "operationalProofPresent",
    "operationalProofFresh",
    "operationalProofClean",
    "accountFeesConfirmed",
    "inventoryReady",
    "hedgeVenueReady",
  ];
  const crossExchangeCandidateEvidenceKeys = crossExchangeStrategyEvidenceKeys.filter(
    (key) => key !== "observationSpanSufficient",
  );
  const crossExchangeReadinessFresh =
    crossExchange === null || isFresh(crossExchange.generatedAt, 60 * 60 * 1000);
  const crossExchangeCandidateEvidenceReady =
    crossExchange !== null &&
    everyChecklistPasses(crossExchange.checklist, crossExchangeCandidateEvidenceKeys);
  const crossExchangeStrategyEvidenceReady =
    crossExchange !== null &&
    everyChecklistPasses(crossExchange.checklist, crossExchangeStrategyEvidenceKeys);
  const crossExchangeLiveReady =
    crossExchange !== null &&
    crossExchangeReadinessFresh &&
    crossExchange.liveReady === true &&
    everyChecklistPasses(crossExchange.checklist, [
      ...crossExchangeStrategyEvidenceKeys,
      ...crossExchangeOperationalKeys,
    ]);
  const spotPerpCarryFresh =
    spotPerpCarry === null || isFresh(spotPerpCarry.generatedAt, 60 * 60 * 1000);
  const spotPerpCarryPromotionEligible =
    spotPerpCarry !== null &&
    spotPerpCarryFresh &&
    spotPerpCarry.promotionEligible === true;
  const min75OpenPositionPnlKrw = finite(min75.openPosition?.estimatedExitNetPnlKrw);
  const min75OpenPositionReturnPct = finite(min75.openPosition?.estimatedExitReturnPct);
  const min75PaperReady = min75.paperReadiness?.ready === true;
  const min75StressExcessReturn = finite(
    min75.stressBenchmarkSummary?.excessReturnVsBuyHoldPct,
  );
  const min75StressBeatsBtcBuyAndHold =
    min75.stressBenchmarkSummary === null || min75.stressBenchmarkSummary === undefined
      ? !liveReasons.includes("stressBeatsBtcBuyAndHold") &&
        min75.liveReadiness?.checks?.stressBeatsBtcBuyAndHold !== false
      : min75StressExcessReturn !== null && min75StressExcessReturn > 0;
  const legacyTradedPnlKrw = sumFinite(
    legacy.candidates?.map((candidate) => candidate.tradedPnlKrw) ?? [],
  );
  const legacyClosedTradePnlKrw = sumFinite(
    legacy.candidates?.map((candidate) => candidate.closedTradePnlKrw) ?? [],
  );
  const replacementResearchFocusOpenPositionPnlKrw = finite(
    replacementResearchFocus?.openPosition?.estimatedExitNetPnlKrw,
  );
  const replacementResearchFocusOpenPositionReturnPct = finite(
    replacementResearchFocus?.openPosition?.estimatedExitReturnPct,
  );
  const replacementFocusObservation = await readOptionalJson<TimeSeriesObservation>(
    replacementResearchFocus?.inputs?.observationPath,
  );
  const replacementFocusPaperObservation = await readOptionalJson<TimeSeriesPaperObservation>(
    replacementResearchFocus?.inputs?.paperObservationPath,
  );
  const crossExchangeEstimatedPnlKrw = finite(
    crossExchange?.candidate?.totalEstimatedNetPnlKrw,
  );
  const carryEstimatedPnlKrw = carrySummaryEstimatedPnlKrw(spotPerpCarry);
  const carryMedianNetCarryBps = carrySummaryMedianNetCarryBps(spotPerpCarry);
  const carryPositiveRate = carrySummaryPositiveRate(spotPerpCarry);
  const carryObservationStillCollecting =
    spotPerpCarry !== null &&
    (spotPerpCarry.blockers ?? []).some((blocker) =>
      [
        "insufficientObservations",
        "insufficientObservationSpan",
        "insufficientCompletedFundingEvents",
      ].includes(blocker),
    );
  const spotPerpCarryWatchlist = spotPerpCarryWatchReports
    .map((report, index) => {
      const primaryMarketEvidence = carryPrimaryMarketEvidence(report);
      return {
        path: args.spotPerpCarryWatchReportPaths[index] ?? null,
        generatedAt: report.generatedAt ?? null,
        status: report.status ?? null,
        fresh: isFresh(report.generatedAt, 60 * 60 * 1000),
        promotionEligible: report.promotionEligible === true,
        usableForLivePromotion: false,
        blockers: report.blockers ?? [],
        checklist: report.checklist ?? {},
        measurementScope: report.measurementScope ?? null,
        assumptions: report.assumptions ?? null,
        summary: report.summary ?? null,
        executableEvidence: {
          estimatedNetPnlKrw: primaryMarketEvidence.estimatedNetPnlKrw,
          medianNetCarryBps: primaryMarketEvidence.medianNetCarryBps,
          positiveRate: primaryMarketEvidence.positiveRate,
          completedFundingCount: primaryMarketEvidence.completedFundingCount,
          observationCount: primaryMarketEvidence.observationCount,
          observationSpanMinutes: primaryMarketEvidence.observationSpanMinutes,
        },
        primaryMarketEvidence,
        spreadControl: carrySpreadControlDiagnostics(report),
        perMarketSummary: report.perMarketSummary ?? [],
        topExecutableCarry: (report.topExecutableCarry ?? report.topCarry ?? []).slice(0, 10),
        interpretation:
          "Observation-only carry candidate; do not use for live promotion until its own span, completed funding, fees, inventory, hedge, and live readiness gates pass.",
      };
    })
    .sort((left, right) => {
      const rightCompleted = right.executableEvidence.completedFundingCount ?? 0;
      const leftCompleted = left.executableEvidence.completedFundingCount ?? 0;
      if (rightCompleted !== leftCompleted) return rightCompleted - leftCompleted;
      const rightObservations = right.executableEvidence.observationCount ?? 0;
      const leftObservations = left.executableEvidence.observationCount ?? 0;
      if (rightObservations !== leftObservations) return rightObservations - leftObservations;
      const rightSpan = right.executableEvidence.observationSpanMinutes ?? 0;
      const leftSpan = left.executableEvidence.observationSpanMinutes ?? 0;
      if (rightSpan !== leftSpan) return rightSpan - leftSpan;
      const rightMedian = right.executableEvidence.medianNetCarryBps ?? Number.NEGATIVE_INFINITY;
      const leftMedian = left.executableEvidence.medianNetCarryBps ?? Number.NEGATIVE_INFINITY;
      return rightMedian - leftMedian;
    });
  const bestSpotPerpCarryWatch = spotPerpCarryWatchlist[0] ?? null;
  const bestSpotPerpCarryMarket = bestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? null;
  const bestSpotPerpCarrySymbol = bestSpotPerpCarryWatch?.topExecutableCarry[0]?.symbol ?? null;
  const spotPerpCarryPairedMarketComparison = buildSpotPerpCarryPairedMarketComparison(
    spotPerpCarryWatchReports,
    args.spotPerpCarryWatchReportPaths,
    bestSpotPerpCarryMarket,
    bestSpotPerpCarrySymbol,
  );
  const pairedMarketComparisonSupportsResearchFocus = pairedComparisonSupportsFocus(
    spotPerpCarryPairedMarketComparison,
    bestSpotPerpCarryMarket,
    bestSpotPerpCarrySymbol,
  );
  const cleanestSpotPerpCarryWatch =
    spotPerpCarryWatchlist
      .filter(
        (watch) => {
          const topExecutableMarket = watch.topExecutableCarry[0]?.market ?? null;
          const topExecutableSummary =
            topExecutableMarket === null
              ? null
              : watch.perMarketSummary.find((row) => row.market === topExecutableMarket) ?? null;
          const completedFundingCount =
            finite(topExecutableSummary?.completedFundingCount) ??
            watch.executableEvidence.completedFundingCount ??
            0;
          return (
            watch.fresh &&
            watch.spreadControl?.passed === true &&
            topExecutableSummary?.watchDecision?.status !== "kill_candidate" &&
            completedFundingCount >= 2 &&
            (watch.executableEvidence.medianNetCarryBps ?? Number.NEGATIVE_INFINITY) >= 10 &&
            (watch.executableEvidence.positiveRate ?? 0) >= 0.67 &&
            (watch.spreadControl?.rawPricingArtifactCount ?? 0) === 0
          );
        },
      )
      .sort((left, right) => {
        const rightRejected = finite(right.spreadControl?.executionRejectedRate) ?? 1;
        const leftRejected = finite(left.spreadControl?.executionRejectedRate) ?? 1;
        if (rightRejected !== leftRejected) return leftRejected - rightRejected;
        const rightEligible = finite(right.spreadControl?.executionEligibleRate) ?? 0;
        const leftEligible = finite(left.spreadControl?.executionEligibleRate) ?? 0;
        if (rightEligible !== leftEligible) return rightEligible - leftEligible;
        const rightCompleted = right.executableEvidence.completedFundingCount ?? 0;
        const leftCompleted = left.executableEvidence.completedFundingCount ?? 0;
        if (rightCompleted !== leftCompleted) return rightCompleted - leftCompleted;
        const rightObservations = right.executableEvidence.observationCount ?? 0;
        const leftObservations = left.executableEvidence.observationCount ?? 0;
        if (rightObservations !== leftObservations) return rightObservations - leftObservations;
        const rightSpan = right.executableEvidence.observationSpanMinutes ?? 0;
        const leftSpan = left.executableEvidence.observationSpanMinutes ?? 0;
        if (rightSpan !== leftSpan) return rightSpan - leftSpan;
        const rightMedian =
          right.executableEvidence.medianNetCarryBps ?? Number.NEGATIVE_INFINITY;
        const leftMedian =
          left.executableEvidence.medianNetCarryBps ?? Number.NEGATIVE_INFINITY;
        return rightMedian - leftMedian;
      })[0] ?? null;
  const spotPerpCarryCandidateRoles =
    spotPerpCarryWatchlist.length === 0
      ? null
      : {
          highestExpectedCarryCandidate: carryWatchCandidateRole(
            "highest_expected_carry",
            bestSpotPerpCarryWatch,
          ),
          cleanestExecutionCandidate: carryWatchCandidateRole(
            "cleanest_execution",
            cleanestSpotPerpCarryWatch,
          ),
          selectedResearchFocusRole: "highest_expected_carry",
          interpretation:
            "Highest expected carry decides the research focus; cleanest execution is tracked separately so repeated spread failures can redirect the strategy without treating lower activity as profitability.",
        };
  const highestAndCleanestCarryMarketsDiffer =
    bestSpotPerpCarryWatch?.topExecutableCarry[0]?.market !== undefined &&
    cleanestSpotPerpCarryWatch?.topExecutableCarry[0]?.market !== undefined &&
    bestSpotPerpCarryWatch.topExecutableCarry[0].market !==
      cleanestSpotPerpCarryWatch.topExecutableCarry[0].market;
  const spotPerpCarryResearchFocusDecision =
    spotPerpCarryCandidateRoles === null
      ? null
      : {
          action:
            pairedMarketComparisonSupportsResearchFocus === false
              ? "compare_paired_disagreement_before_continuing_focus"
              : bestSpotPerpCarryWatch?.spreadControl?.passed === true
              ? "continue_highest_expected_carry_observation"
              : cleanestSpotPerpCarryWatch !== null && highestAndCleanestCarryMarketsDiffer
                ? "keep_highest_expected_under_watch_compare_cleanest_execution"
                : "reduce_confidence_until_spread_control_clears",
          currentFocusMarket: bestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? null,
          cleanestExecutionMarket:
            cleanestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? null,
          highestExpectedSpreadPassed:
            bestSpotPerpCarryWatch?.spreadControl?.passed === true,
          highestExpectedExecutionRejectedRate:
            bestSpotPerpCarryWatch?.spreadControl?.executionRejectedRate ?? null,
          cleanestExecutionRejectedRate:
            cleanestSpotPerpCarryWatch?.spreadControl?.executionRejectedRate ?? null,
          pairedMarketComparisonSupportsResearchFocus:
            pairedMarketComparisonSupportsResearchFocus,
          switchCriteria: [
            "If same-sample paired comparison does not support the current research focus, recompare or switch focus before continuing observation.",
            "Do not promote the highest-expected carry candidate while spreadControlPassed is false.",
            "Compare the cleanest execution candidate if the highest-expected candidate remains spread-failed after repeated completed funding windows; lower rejection alone is not profitability.",
            "Prefer a clean execution candidate only if it also clears observation span, completed funding, fee, inventory, hedge, and live-readiness gates with median net carry >= 20 bps and positive rate >= 0.67.",
            "Kill or demote any carry candidate after the kill window if median net carry < 20 bps, positive rate < 0.67, execution eligible rate < 0.5, or depth coverage < 0.95.",
          ],
          interpretation:
            "This is a research-focus decision only; no carry candidate can become live until its independent readiness and operational proof pass.",
        };
  const feeStressWatchEvidenceByMarket = new Map<
    string,
    Array<{
      source: "fee_stress_report" | "fee_stress_watch_report";
      path: string | null;
      market: string | null;
      symbol: string | null;
      bithumbFeeBps: number | null;
      executionEligibleMedianNetCarryBps: number | null;
      executionEligiblePositiveRate: number | null;
      rawPricingArtifactCount: number | null;
      fundingWindowSummary: Record<string, unknown> | null;
      failed: boolean;
    }>
  >();
  const addFeeStressEvidence = (
    evidence: {
      source: "fee_stress_report" | "fee_stress_watch_report";
      path: string | null;
      market: string | null;
      symbol: string | null;
      bithumbFeeBps: number | null;
      executionEligibleMedianNetCarryBps: number | null;
      executionEligiblePositiveRate: number | null;
      rawPricingArtifactCount: number | null;
      fundingWindowSummary?: Record<string, unknown> | null;
    },
  ) => {
    if (evidence.market === null) return;
    const failed =
      (evidence.rawPricingArtifactCount ?? 0) > 0 ||
      (evidence.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY) < 20 ||
      (evidence.executionEligiblePositiveRate ?? 0) < 0.67;
    const row = { ...evidence, fundingWindowSummary: evidence.fundingWindowSummary ?? null, failed };
    const rows = feeStressWatchEvidenceByMarket.get(evidence.market) ?? [];
    rows.push(row);
    feeStressWatchEvidenceByMarket.set(evidence.market, rows);
  };
  for (const [index, report] of spotPerpCarryFeeStressReports.entries()) {
    const bithumbFeeBps = finite(report.assumptions?.bithumbFeeBps);
    const isSingleMarketReport = (report.perMarketSummary?.length ?? 0) <= 1;
    for (const market of report.perMarketSummary ?? []) {
      addFeeStressEvidence({
        source: "fee_stress_report",
        path: args.spotPerpCarryFeeStressReportPaths[index] ?? null,
        market: market.market ?? null,
        symbol: market.symbol ?? null,
        bithumbFeeBps,
        executionEligibleMedianNetCarryBps:
          finite(market.executionEligibleMedianNetCarryBps) ??
          finite(market.medianNetCarryBps),
        executionEligiblePositiveRate:
          finite(market.executionEligiblePositiveRate) ??
          finite(market.positiveRate),
        rawPricingArtifactCount:
          finite(market.rawPricingArtifactCount) ??
          (isSingleMarketReport ? finite(report.summary?.rawPricingArtifactCount) : null),
        fundingWindowSummary: market.fundingWindowSummary ?? null,
      });
    }
  }
  for (const watch of spotPerpCarryWatchlist) {
    const bithumbFeeBps = finite(watch.assumptions?.bithumbFeeBps);
    if (bithumbFeeBps === null || bithumbFeeBps < 20) continue;
    const isSingleMarketReport = watch.perMarketSummary.length <= 1;
    for (const market of watch.perMarketSummary) {
      addFeeStressEvidence({
        source: "fee_stress_watch_report",
        path: watch.path,
        market: market.market ?? null,
        symbol: market.symbol ?? null,
        bithumbFeeBps,
        executionEligibleMedianNetCarryBps:
          finite(market.executionEligibleMedianNetCarryBps) ??
          finite(market.medianNetCarryBps),
        executionEligiblePositiveRate:
          finite(market.executionEligiblePositiveRate) ??
          finite(market.positiveRate),
        rawPricingArtifactCount:
          finite(market.rawPricingArtifactCount) ??
          (isSingleMarketReport ? finite(watch.summary?.rawPricingArtifactCount) : null),
        fundingWindowSummary: market.fundingWindowSummary ?? null,
      });
    }
  }
  const feeStressEvidenceForMatrix = (market: string | null | undefined) => {
    if (market === null || market === undefined) return null;
    const rows = feeStressWatchEvidenceByMarket.get(market) ?? [];
    return rows
      .sort((left, right) => {
        const rightSourcePriority = right.source === "fee_stress_report" ? 1 : 0;
        const leftSourcePriority = left.source === "fee_stress_report" ? 1 : 0;
        if (rightSourcePriority !== leftSourcePriority) {
          return rightSourcePriority - leftSourcePriority;
        }
        if (left.failed !== right.failed) return left.failed ? -1 : 1;
        const rightFee = finite(right.bithumbFeeBps) ?? 0;
        const leftFee = finite(left.bithumbFeeBps) ?? 0;
        return rightFee - leftFee;
      })[0] ?? null;
  };
  const carryMarketDecisionMatrix = spotPerpCarryWatchlist
    .flatMap((watch) =>
      watch.perMarketSummary.map((market) => {
        const killPolicy = market.watchDecision?.killPolicy ?? {};
        const minCompletedFundingEventsBeforeKill =
          finite(killPolicy.minCompletedFundingEventsBeforeKill) ?? 2;
        const completedFundingCount = finite(market.completedFundingCount) ?? 0;
        const status = market.watchDecision?.status ?? "unknown";
        const requiredBeforeMetricCandidate =
          market.watchDecision?.requiredBeforeMetricCandidate ?? [];
        const feeStressEvidence = feeStressEvidenceForMatrix(market.market);
        const feeStressFailed = feeStressEvidence?.failed === true;
        const decision =
          status === "kill_candidate"
            ? "reject_or_demote"
            : feeStressFailed
              ? "reject_or_demote_fee_stress_failed"
            : status === "metric_candidate"
              ? "promote_to_live_readiness_queue"
              : completedFundingCount < minCompletedFundingEventsBeforeKill
                ? "continue_until_kill_window"
                : "continue_until_metric_requirements_clear";
        const nextDecisionTrigger =
          feeStressFailed
            ? "fresh_fee_stress_recovery_with_median_net_carry >= 20 bps and positive_rate >= 0.67"
            : status === "collect_more_evidence" &&
          completedFundingCount < minCompletedFundingEventsBeforeKill
            ? `completedFundingCount >= ${minCompletedFundingEventsBeforeKill}`
            : requiredBeforeMetricCandidate.length > 0
              ? requiredBeforeMetricCandidate.join(",")
              : "live_readiness_audit";
        const reasons = market.watchDecision?.reasons ?? [];
        return {
          sourcePath: watch.path,
          market: market.market ?? null,
          symbol: market.symbol ?? null,
          status,
          decision,
          nextDecisionTrigger,
          reasons: feeStressFailed ? [...reasons, "feeStressFailed"] : reasons,
          requiredBeforeMetricCandidate,
          killPolicy,
          feeStressEvidence,
          metrics: {
            count: market.count ?? null,
            completedFundingCount: market.completedFundingCount ?? null,
            executionEligibleCount: market.executionEligibleCount ?? null,
            executionEligibleMedianNetCarryBps:
              market.executionEligibleMedianNetCarryBps ?? null,
            executionEligiblePositiveRate:
              market.executionEligiblePositiveRate ?? null,
            fundingWindowSummary: market.fundingWindowSummary ?? null,
            depthCoverageRate: market.depthCoverageRate ?? null,
          },
        };
      }),
    )
    .sort((left, right) => {
      const rightCompleted = finite(right.metrics.completedFundingCount) ?? 0;
      const leftCompleted = finite(left.metrics.completedFundingCount) ?? 0;
      if (rightCompleted !== leftCompleted) return rightCompleted - leftCompleted;
      const rightMedian =
        right.status === "kill_candidate"
          ? Number.NEGATIVE_INFINITY
          : right.metrics.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
      const leftMedian =
        left.status === "kill_candidate"
          ? Number.NEGATIVE_INFINITY
          : left.metrics.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
      return rightMedian - leftMedian;
    });
  const feeStressDemotedMarkets = [
    ...carryMarketDecisionMatrix
      .filter((decision) => decision.decision === "reject_or_demote_fee_stress_failed")
      .reduce<
        Map<
          string,
          {
            market: string | null;
            symbol: string | null;
            sourcePath: string | null;
            decision: string;
            reasons: string[];
            feeStressEvidence: (typeof carryMarketDecisionMatrix)[number]["feeStressEvidence"];
            metrics: (typeof carryMarketDecisionMatrix)[number]["metrics"];
            interpretation: string;
          }
        >
      >((demoted, decision) => {
        const key = `${decision.market ?? "unknown"}|${decision.symbol ?? "unknown"}`;
        if (!demoted.has(key)) {
          demoted.set(key, {
            market: decision.market,
            symbol: decision.symbol,
            sourcePath: decision.sourcePath,
            decision: decision.decision,
            reasons: decision.reasons,
            feeStressEvidence: decision.feeStressEvidence,
            metrics: decision.metrics,
            interpretation:
              "Current fee-stress evidence fails the carry threshold; keep out of live focus until fresh stress evidence recovers.",
          });
        }
        return demoted;
      }, new Map())
      .values(),
  ];
  const spotPerpCarryFeeStressSummaries = spotPerpCarryFeeStressReports.map(
    (report, index) => ({
      path: args.spotPerpCarryFeeStressReportPaths[index] ?? null,
      generatedAt: report.generatedAt ?? null,
      fresh: isFresh(report.generatedAt, 60 * 60 * 1000),
      assumptions: {
        notionalKrw: report.assumptions?.notionalKrw ?? null,
        bithumbFeeBps: report.assumptions?.bithumbFeeBps ?? null,
        binanceTakerFeeBps: report.assumptions?.binanceTakerFeeBps ?? null,
        exitCostBufferBps: report.assumptions?.exitCostBufferBps ?? null,
      },
      summary: {
        executionEligibleMedianNetCarryBps:
          report.summary?.executionEligibleMedianNetCarryBps ?? null,
        executionEligiblePositiveRate:
          report.summary?.executionEligiblePositiveRate ?? null,
        executionEligibleTotalEstimatedNetPnlKrw:
          report.summary?.executionEligibleTotalEstimatedNetPnlKrw ?? null,
        rawPricingArtifactCount: report.summary?.rawPricingArtifactCount ?? null,
      },
      perMarketSummary: (report.perMarketSummary ?? []).map((market) => ({
        market: market.market ?? null,
        symbol: market.symbol ?? null,
        completedFundingCount: market.completedFundingCount ?? null,
        executionEligibleRate: market.executionEligibleRate ?? null,
        executionEligibleMedianNetCarryBps:
          market.executionEligibleMedianNetCarryBps ?? null,
        executionEligiblePositiveRate:
          market.executionEligiblePositiveRate ?? null,
        executionEligibleTotalEstimatedNetPnlKrw:
          market.executionEligibleTotalEstimatedNetPnlKrw ?? null,
        fundingWindowSummary: market.fundingWindowSummary ?? null,
        depthCoverageRate: market.depthCoverageRate ?? null,
        rawPricingArtifactCount:
          market.rawPricingArtifactCount ??
          ((report.perMarketSummary?.length ?? 0) <= 1
            ? report.summary?.rawPricingArtifactCount ?? null
            : null),
      })),
    }),
  );
  const feeStressForMarket = (market: string | null | undefined) => {
    if (market === null || market === undefined) return null;
    const matches = spotPerpCarryFeeStressSummaries
      .flatMap((report) =>
        report.perMarketSummary.map((summary) => ({
          ...summary,
          path: report.path,
          generatedAt: report.generatedAt,
          fresh: report.fresh,
          assumptions: report.assumptions,
        })),
      )
      .filter((summary) => summary.market === market);
    return matches
      .sort((left, right) => {
        const rightFee = finite(right.assumptions.bithumbFeeBps) ?? 0;
        const leftFee = finite(left.assumptions.bithumbFeeBps) ?? 0;
        return rightFee - leftFee;
      })[0] ?? null;
  };
  const highestExpectedFeeStress = feeStressForMarket(
    bestSpotPerpCarryWatch?.topExecutableCarry[0]?.market,
  );
  const cleanestExecutionFeeStress = feeStressForMarket(
    cleanestSpotPerpCarryWatch?.topExecutableCarry[0]?.market,
  );
  const feeStressPasses = (
    stress: ReturnType<typeof feeStressForMarket>,
    minMedianNetCarryBps: number,
  ) =>
    stress !== null &&
    stress.fresh &&
    (stress.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY) >=
      minMedianNetCarryBps &&
    (stress.executionEligiblePositiveRate ?? 0) >= 0.67 &&
    (stress.rawPricingArtifactCount ?? 0) === 0;
  const spotPerpCarryFeeStressDecision =
    spotPerpCarryFeeStressSummaries.length === 0
      ? null
      : {
          highestExpectedCarryStress: highestExpectedFeeStress,
          cleanestExecutionStress: cleanestExecutionFeeStress,
          highestExpectedStressPassed: feeStressPasses(highestExpectedFeeStress, 20),
          cleanestExecutionStressPassed: feeStressPasses(cleanestExecutionFeeStress, 20),
          interpretation:
            "Fee stress is a sensitivity test for fee-schedule uncertainty; it supports research ranking but does not replace live readiness or confirmed account fees.",
        };
  const carryLiveReadinessReports = spotPerpCarryLiveReadinessReports.map(
    (report, index) => {
      const fresh = isFresh(report.generatedAt, 60 * 60 * 1000);
      const marketKeys = new Set(
        (report.evidence?.perMarketSummary ?? [])
          .map((market) => carryMarketKey(market.market, market.symbol))
          .filter((key): key is string => key !== null),
      );
      return {
        path: args.spotPerpCarryLiveReadinessPaths[index] ?? null,
        generatedAt: report.generatedAt ?? null,
        status: report.status ?? null,
        fresh,
        liveReady: fresh && report.liveReady === true,
        reasons: report.reasons ?? [],
        checks: report.checks ?? {},
        readinessGap: report.readinessGap ?? null,
        readinessTimeline: report.readinessTimeline ?? null,
        evidence: report.evidence ?? null,
        marketKeys: [...marketKeys],
        interpretation: report.interpretation ?? null,
      };
    },
  );
  const summarizeCarryLiveReadinessForMarket = (
    market: string | null,
    symbol: string | null,
  ): Record<string, unknown> | null => {
    const targetKey = carryMarketKey(market, symbol);
    if (targetKey === null) return null;
    const report =
      carryLiveReadinessReports.find((candidate) => candidate.marketKeys.includes(targetKey)) ??
      (market === null
        ? null
        : carryLiveReadinessReports.find((candidate) =>
            candidate.marketKeys.some((key) => key.startsWith(`${market}:`)),
          )) ??
      null;
    if (report === null) {
      return {
        market,
        symbol,
        status: "missing_live_readiness_report",
        liveReady: false,
        sourceReadinessPath: null,
        blockers: ["liveReadinessReportMissing"],
        action: "generate_challenger_live_readiness_before_any_live_switch",
        interpretation:
          "A challenger can replace the research focus only after recompare, but it still cannot start live without its own readiness report.",
      };
    }
    const marketPrefix = market === null ? null : `market:${market}:`;
    const marketSpecificBlockers =
      marketPrefix === null
        ? []
        : report.reasons.filter((reason) => reason.startsWith(marketPrefix));
    const requiredBeforeMetricCandidate =
      marketPrefix === null
        ? []
        : marketSpecificBlockers
            .map((reason) =>
              reason.startsWith(`${marketPrefix}requires:`)
                ? reason.slice(`${marketPrefix}requires:`.length)
                : null,
            )
            .filter((reason): reason is string => reason !== null && reason.length > 0);
    return {
      market,
      symbol,
      status: report.status,
      liveReady: report.liveReady === true,
      sourceReadinessPath: report.path,
      generatedAt: report.generatedAt,
      fresh: report.fresh,
      readinessGap: report.readinessGap,
      readinessTimeline: report.readinessTimeline,
      checks: {
        sufficientObservations: report.checks.sufficientObservations ?? null,
        sufficientObservationSpan: report.checks.sufficientObservationSpan ?? null,
        completedFundingEvents: report.checks.completedFundingEvents ?? null,
        accountFeesConfirmed: report.checks.accountFeesConfirmed ?? null,
        inventoryReady: report.checks.inventoryReady ?? null,
        hedgeVenueReady: report.checks.hedgeVenueReady ?? null,
        liveExecutionPathReady: report.checks.liveExecutionPathReady ?? null,
        perMarketMetricCandidates: report.checks.perMarketMetricCandidates ?? null,
        perMarketFeeStressReady: report.checks.perMarketFeeStressReady ?? null,
      },
      blockers: report.reasons,
      marketSpecificBlockers,
      globalBlockers: report.reasons.filter((reason) => !reason.startsWith("market:")),
      requiredBeforeMetricCandidate,
      action:
        report.liveReady === true
          ? "challenger_readiness_clear_but_goal_gates_still_required"
          : "keep_challenger_research_only_until_live_readiness_clears",
      interpretation:
        "This challenger readiness view is a switch-safety check; it cannot authorize live startup without the global live-goal gate.",
    };
  };
  const bestSpotPerpCarryWatchMarketKeys = new Set(
    (bestSpotPerpCarryWatch?.perMarketSummary ?? [])
      .map((market) => carryMarketKey(market.market, market.symbol))
      .filter((key): key is string => key !== null),
  );
  const primarySpotPerpCarryLiveReadiness =
    carryLiveReadinessReports.find(
      (report) =>
        bestSpotPerpCarryWatchMarketKeys.size > 0 &&
        sameKeySet(new Set(report.marketKeys), bestSpotPerpCarryWatchMarketKeys),
    ) ??
    carryLiveReadinessReports.find(
      (report) =>
        bestSpotPerpCarryWatchMarketKeys.size > 0 &&
        [...bestSpotPerpCarryWatchMarketKeys].some((key) => report.marketKeys.includes(key)),
    ) ??
    carryLiveReadinessReports[0] ??
    null;
  const primarySpotPerpCarryOperationalProof =
    primarySpotPerpCarryLiveReadiness?.evidence?.operationalProof ?? null;
  const carryOperationalReadiness =
    primarySpotPerpCarryLiveReadiness === null
      ? null
      : {
          sourceReadinessPath: primarySpotPerpCarryLiveReadiness.path,
          generatedAt: primarySpotPerpCarryLiveReadiness.generatedAt,
          liveReady: primarySpotPerpCarryLiveReadiness.liveReady,
          accountFeesConfirmed:
            primarySpotPerpCarryOperationalProof?.accountFeesConfirmed === true,
          inventoryReady:
            primarySpotPerpCarryOperationalProof?.inventoryReady === true,
          hedgeVenueReady:
            primarySpotPerpCarryOperationalProof?.hedgeVenueReady === true,
          operationalProofPresent: primarySpotPerpCarryOperationalProof !== null,
          operationalProofGeneratedAt:
            primarySpotPerpCarryOperationalProof?.generatedAt ?? null,
          missingSecrets:
            primarySpotPerpCarryOperationalProof?.details?.missingSecrets ?? [],
          requirements:
            primarySpotPerpCarryOperationalProof?.requirements ?? null,
          inventory:
            primarySpotPerpCarryOperationalProof?.inventory ?? null,
          deficits:
            primarySpotPerpCarryOperationalProof?.deficits ?? null,
          reasons:
            primarySpotPerpCarryOperationalProof?.reasons ??
            primarySpotPerpCarryLiveReadiness.reasons.filter((reason) =>
              reason.startsWith("operationalProof:"),
            ),
          nextActions: [
            ...(!primarySpotPerpCarryOperationalProof?.accountFeesConfirmed
              ? ["confirm_account_fee_schedule"]
              : []),
            ...(!primarySpotPerpCarryOperationalProof?.inventoryReady
              ? ["fund_or_verify_spot_inventory"]
              : []),
            ...(!primarySpotPerpCarryOperationalProof?.hedgeVenueReady
              ? ["fund_or_verify_futures_hedge_venue"]
              : []),
            ...((primarySpotPerpCarryOperationalProof?.details?.missingSecrets ?? [])
              .length > 0 || primarySpotPerpCarryOperationalProof === null
              ? ["refresh_operational_proof_with_credentials"]
              : []),
          ],
          interpretation:
            "Operational readiness is separate from carry profitability; every operational flag must pass before any live startup is allowed.",
        };
  const bestSpotPerpCarryTopExecutable =
    bestSpotPerpCarryWatch?.topExecutableCarry[0] ?? null;
  const bestSpotPerpCarryDecision =
    carryMarketDecisionMatrix.find(
      (decision) =>
        decision.sourcePath === bestSpotPerpCarryWatch?.path &&
        (bestSpotPerpCarryTopExecutable?.market === undefined ||
          decision.market === bestSpotPerpCarryTopExecutable.market),
    ) ??
    carryMarketDecisionMatrix.find(
      (decision) => decision.sourcePath === bestSpotPerpCarryWatch?.path,
    ) ??
    null;
  const spotPerpCarryLiveReadinessReady =
    primarySpotPerpCarryLiveReadiness?.liveReady === true;
  const carryStrategyComparison =
    spotPerpCarry === null || bestSpotPerpCarryWatch === null
      ? null
      : {
          baseline: carryEvidenceSnapshot(
            "baseline_spot_perp_carry",
            args.spotPerpCarryReportPath,
            spotPerpCarry,
          ),
          focusedWatch: carryEvidenceSnapshot(
            "best_spot_perp_carry_watch",
            bestSpotPerpCarryWatch.path,
            spotPerpCarryWatchReports[
              args.spotPerpCarryWatchReportPaths.indexOf(bestSpotPerpCarryWatch.path ?? "")
            ] ?? null,
          ),
          delta: {
            estimatedNetPnlKrw: diffNullable(
              bestSpotPerpCarryWatch.executableEvidence.estimatedNetPnlKrw,
              carryEstimatedPnlKrw,
            ),
            medianNetCarryBps: diffNullable(
              bestSpotPerpCarryWatch.executableEvidence.medianNetCarryBps,
              carryMedianNetCarryBps,
            ),
            positiveRate: diffNullable(
              bestSpotPerpCarryWatch.executableEvidence.positiveRate,
              carryPositiveRate,
            ),
          },
          interpretation:
            "Use this comparison only to choose the research focus; live promotion still requires the focused watch to clear its own funding-span and operational readiness gates.",
        };
  const carryArtifactWarnings = [
    ...buildCarryArtifactWarnings(
      spotPerpCarry,
      args.spotPerpCarryReportPath,
      "baseline_spot_perp_carry",
    ),
    ...spotPerpCarryWatchReports.flatMap((report, index) =>
      buildCarryArtifactWarnings(
        report,
        args.spotPerpCarryWatchReportPaths[index] ?? null,
        "spot_perp_carry_watch",
      ),
    ),
  ];
  const signalExecutionCoverageFresh =
    signalExecutionCoverage === null ||
    isFresh(signalExecutionCoverage.generatedAt, 24 * 60 * 60 * 1000);
  const topSignalCoverageCandidates =
    signalExecutionCoverage?.candidates
      ?.slice()
      .sort((left, right) => {
        const rightTestCoverage = right.coverage?.test?.roundTripCoverageRate ?? -Infinity;
        const leftTestCoverage = left.coverage?.test?.roundTripCoverageRate ?? -Infinity;
        if (rightTestCoverage !== leftTestCoverage) {
          return rightTestCoverage - leftTestCoverage;
        }
        return (right.profitability?.test?.totalPnlKrw ?? -Infinity) -
          (left.profitability?.test?.totalPnlKrw ?? -Infinity);
      })
      .slice(0, 5) ?? [];

  const useReplacementLiveCandidate = replacementLiveCandidate !== null;
  const useCrossExchangeCandidate =
    !useReplacementLiveCandidate &&
    (crossExchangeLiveReady || (!min75CandidateLiveReady && crossExchangeCandidateEvidenceReady));
  const useMin75PaperCandidate =
    !useReplacementLiveCandidate &&
    !useCrossExchangeCandidate &&
    !min75CandidateLiveReady &&
    min75StressBeatsBtcBuyAndHold &&
    min75PaperReady &&
    min75OpenPositionPnlKrw !== null &&
    min75OpenPositionPnlKrw > 0;
  const useManagedPaperCandidate =
    !useReplacementLiveCandidate &&
    !useCrossExchangeCandidate &&
    !useMin75PaperCandidate &&
    !min75CandidateLiveReady &&
    leadingActiveManagedPaperReturn !== null &&
    !managedPaperHasLosingEvidence(leadingActiveManagedPaperReturn) &&
    (replacementResearchFocus === null || replacementResearchFocusManagedDiscarded);
  const useSpotPerpCarryWatchCandidate =
    !useReplacementLiveCandidate &&
    !useCrossExchangeCandidate &&
    !useMin75PaperCandidate &&
    !useManagedPaperCandidate &&
    !min75CandidateLiveReady &&
    bestSpotPerpCarryWatch !== null &&
    bestSpotPerpCarryWatch.fresh &&
    (bestSpotPerpCarryWatch.executableEvidence.estimatedNetPnlKrw ?? Number.NEGATIVE_INFINITY) >
      0 &&
    (bestSpotPerpCarryWatch.executableEvidence.medianNetCarryBps ?? Number.NEGATIVE_INFINITY) >
      0 &&
    (bestSpotPerpCarryWatch.executableEvidence.positiveRate ?? 0) >= 0.67;
  const useReplacementResearchCandidate =
    !useReplacementLiveCandidate &&
    !useCrossExchangeCandidate &&
    !useMin75PaperCandidate &&
    !useManagedPaperCandidate &&
    !useSpotPerpCarryWatchCandidate &&
    !min75CandidateLiveReady &&
    replacementResearchFocus !== null;
  const spotPerpCarryFocusMarket =
    bestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? null;
  const spotPerpCarryFocusSymbol =
    bestSpotPerpCarryWatch?.topExecutableCarry[0]?.symbol ?? null;
  const spotPerpCarryCurrentEntrySanity = buildCurrentEntrySanity(
    spotPerpCarryWatchlist.map((watch) => watch as Record<string, unknown>),
    spotPerpCarryFocusMarket,
  );
  const spotPerpCarryCurrentEntryBlockers = Array.isArray(
    spotPerpCarryCurrentEntrySanity.currentEntryBlockers,
  )
    ? spotPerpCarryCurrentEntrySanity.currentEntryBlockers.filter(
        (blocker): blocker is string => typeof blocker === "string",
      )
    : [];
  const spotPerpCarryFocusRecompare = buildFocusRecompareView(
    spotPerpCarryFeeStressSummaries.map((summary) => ({
      ...summary,
      assumptions: summary.assumptions as Record<string, unknown>,
      perMarketSummary: summary.perMarketSummary.map((market) => market as Record<string, unknown>),
    })),
    spotPerpCarryFocusMarket,
  );
  const spotPerpCarryFocusRecompareRequired =
    spotPerpCarryFocusRecompare?.needsRecompareBeforeLive === true;
  const spotPerpCarryFocusRecompareBestChallenger = recordValue(
    spotPerpCarryFocusRecompare?.bestChallenger,
  );
  const spotPerpCarryFocusRecompareBestChallengerMarket =
    stringValue(spotPerpCarryFocusRecompareBestChallenger.market) ?? "unknown";
  const spotPerpCarryFocusRecompareBestChallengerSymbol =
    stringValue(spotPerpCarryFocusRecompareBestChallenger.symbol);
  const spotPerpCarryFocusRecompareChallengerLiveReadiness =
    spotPerpCarryFocusRecompareRequired
      ? summarizeCarryLiveReadinessForMarket(
          spotPerpCarryFocusRecompareBestChallengerMarket,
          spotPerpCarryFocusRecompareBestChallengerSymbol,
        )
      : null;
  const spotPerpCarryFocusRecompareBestChallengerLatestWindow = recordValue(
    spotPerpCarryFocusRecompareBestChallenger.latestWindow,
  );
  const checklist = useReplacementLiveCandidate
    ? {
        replacementReadinessFresh: replacementLiveCandidate.fresh,
        replacementLiveReady: replacementLiveCandidate.liveReady,
        replacementIsLiveCandidate:
          replacementLiveCandidate.classification === "live_candidate",
        researchDataFresh,
      }
    : useCrossExchangeCandidate
    ? {
        crossExchangeReadinessFresh,
        crossExchangeCandidateEvidenceReady,
        crossExchangeStrategyEvidenceReady,
        crossExchangeLiveReady,
      }
    : useMin75PaperCandidate
      ? min75Checklist
    : useManagedPaperCandidate
      ? {
          managedPaperCandidatePresent: true,
          managedPaperMinimumClosedTrades:
            leadingActiveManagedPaperReturn?.liveChecks.minimumClosedTrades === true,
          managedPaperPositiveClosedTradePnl:
            leadingActiveManagedPaperReturn?.liveChecks.positiveClosedTradePnl === true,
          managedPaperNoOpenMarkProfitDependency:
            leadingActiveManagedPaperReturn?.liveChecks.noOpenMarkProfitDependency === true,
          managedPaperPositiveMedianExcessReturn:
            leadingActiveManagedPaperReturn?.liveChecks.positiveMedianExcessReturn === true,
          managedPaperNoOpenPosition:
            leadingActiveManagedPaperReturn?.liveChecks.noOpenPosition === true,
          managedPaperCycleHealthy:
            leadingActiveManagedPaperReturn?.liveChecks.cycleCompletionRateOk === true &&
            leadingActiveManagedPaperReturn?.liveChecks.cycleRecoverySinceLatestFailureOk === true,
        }
    : useSpotPerpCarryWatchCandidate
    ? {
        spotPerpCarryWatchFresh: bestSpotPerpCarryWatch?.fresh === true,
        spotPerpCarryWatchPositiveMedian:
          (bestSpotPerpCarryWatch?.executableEvidence.medianNetCarryBps ??
            Number.NEGATIVE_INFINITY) > 0,
        spotPerpCarryWatchPositiveRate:
          (bestSpotPerpCarryWatch?.executableEvidence.positiveRate ?? 0) >= 0.67,
        spotPerpCarryPairedFocusSupported:
          pairedMarketComparisonSupportsResearchFocus !== false,
        spotPerpCarrySpreadControl:
          bestSpotPerpCarryWatch?.spreadControl?.passed === true,
        spotPerpCarryWatchCompletedFundingEvents:
          !(bestSpotPerpCarryWatch?.blockers ?? []).includes(
            "insufficientCompletedFundingEvents",
          ),
        spotPerpCarryWatchObservationSpan:
          !(bestSpotPerpCarryWatch?.blockers ?? []).includes("insufficientObservationSpan"),
        spotPerpCarryWatchOperationalReadiness:
          !(bestSpotPerpCarryWatch?.blockers ?? []).some((blocker) =>
            ["feeScheduleUnconfirmed", "inventoryNotReady", "hedgeVenueNotReady"].includes(
              blocker,
            ),
          ),
        spotPerpCarryFeeStressEvidence:
          spotPerpCarryFeeStressDecision !== null &&
          spotPerpCarryFeeStressDecision.highestExpectedCarryStress !== null,
        spotPerpCarryFeeStressPositive:
          spotPerpCarryFeeStressDecision?.highestExpectedStressPassed === true,
        spotPerpCarryCurrentEntrySanity:
          spotPerpCarryCurrentEntryBlockers.length === 0,
        spotPerpCarryFocusRecompareClear:
          !spotPerpCarryFocusRecompareRequired,
        spotPerpCarryLiveReadiness:
          carryLiveReadinessReports.length === 0 ? false : spotPerpCarryLiveReadinessReady,
      }
    : useReplacementResearchCandidate
    ? {
        replacementReadinessFresh: replacementResearchFocus.fresh,
        replacementIsNotDiscard:
          replacementResearchFocus.classification !== null &&
          replacementResearchFocus.classification !== "discard_candidate",
        replacementPaperReady: replacementResearchFocus.paperReady,
        replacementLiveReady: replacementResearchFocus.liveReady,
        researchDataFresh,
      }
    : min75Checklist;

  const liveReady = useReplacementLiveCandidate
    ? Object.values(checklist).every(Boolean)
    : useCrossExchangeCandidate
      ? crossExchangeLiveReady
      : useMin75PaperCandidate
        ? false
      : useManagedPaperCandidate
        ? false
      : useSpotPerpCarryWatchCandidate
        ? false
      : useReplacementResearchCandidate
        ? false
        : min75CandidateLiveReady;
  const blockers = Object.entries(checklist)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (
    useMin75PaperCandidate ||
    (!useReplacementLiveCandidate &&
      !useCrossExchangeCandidate &&
      !useManagedPaperCandidate &&
      !useSpotPerpCarryWatchCandidate &&
      !useReplacementResearchCandidate)
  ) {
    for (const blocker of liveReasons) {
      if (!blockers.includes(blocker)) {
        blockers.push(blocker);
      }
    }
  }
  if (useCrossExchangeCandidate && crossExchange?.liveReady !== true) {
    for (const blocker of crossExchange.blockers ?? []) {
      blockers.push(`crossExchange:${blocker}`);
    }
  } else if (useManagedPaperCandidate) {
    for (const blocker of leadingActiveManagedPaperReturn?.liveReasons ?? []) {
      blockers.push(`managedPaper:${blocker}`);
    }
  } else if (useSpotPerpCarryWatchCandidate) {
    for (const blocker of bestSpotPerpCarryWatch?.blockers ?? []) {
      blockers.push(`spotPerpCarryWatch:${blocker}`);
    }
    if (primarySpotPerpCarryLiveReadiness !== null) {
      for (const reason of primarySpotPerpCarryLiveReadiness.reasons) {
        blockers.push(`spotPerpCarryLiveReadiness:${reason}`);
      }
      if (!primarySpotPerpCarryLiveReadiness.fresh) {
        blockers.push(
          `spotPerpCarryLiveReadiness:stale:${primarySpotPerpCarryLiveReadiness.path ?? "unknown"}`,
        );
      }
    } else {
      blockers.push("spotPerpCarryLiveReadiness:missingPrimaryReadinessReport");
    }
    for (const blocker of spotPerpCarryCurrentEntryBlockers) {
      blockers.push(`spotPerpCarryCurrentEntry:${blocker}`);
    }
    if (spotPerpCarryFocusRecompareRequired) {
      blockers.push("spotPerpCarryFocusRecompareRequired");
    }
  } else if (useReplacementResearchCandidate) {
    for (const blocker of replacementResearchFocus.liveReasons) {
      blockers.push(`replacement:${blocker}`);
    }
    if (replacementResearchFocusManagedDiscarded) {
      for (const blocker of replacementResearchFocusManagedReturn?.liveReasons ?? []) {
        blockers.push(`replacementManagedPaper:${blocker}`);
      }
    }
    if (replacementResearchFocusLivePath !== null && !replacementResearchFocusLivePath.ready) {
      for (const blocker of replacementResearchFocusLivePath.reasons) {
        blockers.push(`replacementLivePath:${blocker}`);
      }
    }
  }
  const uniqueBlockers = [...new Set(blockers)];
  blockers.length = 0;
  blockers.push(...uniqueBlockers);

  const selectedCandidate = useReplacementLiveCandidate
    ? {
        type: "replacement_time_series",
        rationale:
          "A replacement time-series readiness report is fresh and live-ready; review operational scope before starting live.",
      }
    : useCrossExchangeCandidate
    ? {
        type: "cross_exchange_relative_value",
        rationale:
          "Bithumb-Binance BTC relative value is the only current candidate with positive executable edge evidence; live remains blocked until operational proof is clean.",
      }
    : useMin75PaperCandidate
    ? {
        type: "btc_240m_momentum_min75_paper_candidate",
        rationale:
          "No candidate is live-ready; the BTC min75 paper path is the closest live lifecycle because it has a positive open paper mark, but it still requires cost-stress and realized positive reduce-only exit evidence before live.",
      }
    : useManagedPaperCandidate
    ? {
        type: "managed_paper_candidate",
        rationale:
          "No candidate is live-ready; the leading managed-paper path has active paper evidence, but it remains blocked until closed trades, realized PnL, open-position dependency, and cycle health gates pass.",
      }
    : useSpotPerpCarryWatchCandidate
    ? {
        type: "spot_perp_carry_watch_candidate",
        rationale:
          "No candidate is live-ready; the strongest current research focus is positive spot-perp carry watch evidence, but it remains observation-only until repeated completed funding windows and operational readiness pass.",
      }
    : useReplacementResearchCandidate
    ? replacementResearchFocus.classification === "discard_candidate"
      ? {
          type: "replacement_time_series_discarded",
          rationale:
            "No candidate is live-ready; the latest replacement readiness report discards the observed replacement candidate, so it must not be treated as the leading live path.",
        }
      : replacementResearchFocusManagedDiscarded
        ? {
            type: "replacement_time_series_managed_inactive",
            rationale:
              "No candidate is live-ready; the leading historical replacement research has managed-paper evidence with no accepted trades or positive realized PnL, so it must not be treated as a live path.",
          }
      : {
          type: "replacement_time_series_research",
          rationale:
            "No candidate is live-ready; the leading research focus is the replacement time-series candidate, which must pass paper entry, realized exit, and positive PnL before live.",
        }
    : {
        type: "btc_240m_momentum_min75",
        rationale: min75StressBeatsBtcBuyAndHold
          ? "No cross-exchange readiness report was provided with passing strategy evidence, so the legacy min75 paper candidate remains the active gate."
          : "No candidate is live-ready; BTC min75 has an open paper lifecycle but fails cost-stress evidence, so it must remain paper-only while replacement research continues.",
      };
  const replacementResearchFocusFromReadiness =
    replacementResearchFocus?.path !== null &&
    replacementResearchFocus?.path !== undefined &&
    args.replacementReadinessPaths.includes(replacementResearchFocus.path);
  const recommendedAction = liveReady
    ? useReplacementLiveCandidate
      ? "Review replacement readiness evidence and start only through a gated live runner for that exact candidate."
      : useCrossExchangeCandidate
      ? "Review fresh operational proof, then start the cross-exchange relative-value PM2 target through the gated script."
      : "Review account fee confirmation and start the min75 live PM2 target through the gated script."
      : useCrossExchangeCandidate
        ? `Keep live blocked; resolve cross-exchange operational blockers: ${
            (crossExchange?.blockers ?? []).join(", ") || "crossExchangeLiveReady"
          }.`
      : useMin75PaperCandidate
          ? "Keep live blocked; require BTC min75 cost-stress evidence plus a positive realized BTC min75 reduce-only paper exit before live."
        : useManagedPaperCandidate
          ? `Keep live blocked; continue managed-paper measurement for ${
              leadingActiveManagedPaperReturn?.market ?? "unknown"
            } until it has closed trades, positive realized PnL, no open-mark dependency, no open position, and healthy cycle recovery.`
        : useSpotPerpCarryWatchCandidate
          ? spotPerpCarryFocusRecompareRequired
            ? `Keep live blocked; current carry focus ${
                bestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? "unknown"
              } must be re-compared against ${
                spotPerpCarryFocusRecompareBestChallengerMarket
              } before any live preparation. Latest challenger window is ${
                spotPerpCarryFocusRecompareBestChallengerLatestWindow.medianNetCarryBps ??
                "unknown"
              } bps; current-entry and live-readiness gates still block startup.`
            : `Keep live blocked; highest expected research focus is spot-perp carry watch ${
                bestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? "unknown"
              } with median net carry ${
                bestSpotPerpCarryWatch?.executableEvidence.medianNetCarryBps ?? "unknown"
              } bps and estimated net PnL ${
                bestSpotPerpCarryWatch?.executableEvidence.estimatedNetPnlKrw ?? "unknown"
              } KRW; cleanest execution candidate is ${
                cleanestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? "none"
              }. Both remain research-only until the funding-span, fee, inventory, hedge, spread, and live-readiness gates pass.`
        : useReplacementResearchCandidate
          ? replacementResearchFocus.classification === "discard_candidate"
            ? `Keep live blocked; replacement research ${
                replacementResearchFocus.candidate?.market ?? "unknown"
              } is discarded by the latest readiness report, so it must not be used for paper or live promotion.`
            : replacementResearchFocusManagedDiscarded
              ? `Keep live blocked; replacement research ${
                  replacementResearchFocus.candidate?.market ?? "unknown"
                } has managed-paper evidence with no accepted trades or positive realized PnL, so treat it as observation-only and continue searching for a better executable candidate.`
            : !replacementResearchFocusFromReadiness &&
              latestReplacementScan !== null &&
              latestReplacementScan.topPromotionCandidate === null
            ? `Keep live blocked; current replacement research ${
                replacementResearchFocus.candidate?.market ?? "unknown"
              } is observation-only, and the latest replacement scan has no promotion candidate.`
            : `Keep live blocked; observe replacement research ${
                replacementResearchFocus.candidate?.market ?? "unknown"
              } until signal, execution, paper entry, realized exit, and positive paper PnL all pass.`
        : nextReplacementCandidate === null
          ? "Keep live blocked; continue min75 paper observation until reduce-only exit realizes positive PnL."
          : `Keep live blocked; observe replacement candidate ${nextReplacementCandidate.candidate.market ?? "unknown"} until signal, execution, paper entry, realized exit, and positive paper PnL all pass.`;

  const spotPerpCarryReadinessPathForMarket = (market: string | null) =>
    market === "KRW-CYS"
      ? "var/reports/spot-perp-carry-cys-live-readiness-latest.json"
      : market === "KRW-AZTEC"
        ? "var/reports/spot-perp-carry-aztec-live-readiness-latest.json"
      : market === "KRW-NIL"
        ? "var/reports/spot-perp-carry-nil-live-readiness-latest.json"
      : market === "KRW-AKT"
        ? "var/reports/spot-perp-carry-akt-live-readiness-latest.json"
      : market === "KRW-ELSA"
        ? "var/reports/spot-perp-carry-elsa-live-readiness-latest.json"
      : market === "KRW-PIEVERSE"
      ? "var/reports/spot-perp-carry-pieverse-live-readiness-latest.json"
      : market === "KRW-EDU"
        ? "var/reports/spot-perp-carry-edu-live-readiness-latest.json"
        : primarySpotPerpCarryLiveReadiness?.path ?? null;
  const spotPerpCarryReportPathForMarket = (market: string | null, fallbackPath: string | null) =>
    market === "KRW-CYS"
      ? "var/reports/spot-perp-carry-cys-72h-latest.json"
      : market === "KRW-AZTEC"
        ? "var/reports/spot-perp-carry-aztec-72h-latest.json"
      : market === "KRW-NIL"
        ? "var/reports/spot-perp-carry-nil-72h-latest.json"
      : market === "KRW-AKT"
        ? "var/reports/spot-perp-carry-akt-72h-latest.json"
      : market === "KRW-ELSA"
        ? "var/reports/spot-perp-carry-elsa-72h-latest.json"
      : market === "KRW-PIEVERSE"
      ? "var/reports/spot-perp-carry-pieverse-72h-latest.json"
      : market === "KRW-EDU"
        ? "var/reports/spot-perp-carry-edu-72h-latest.json"
        : fallbackPath;
  const spotPerpCarryReviewCommandForMarket = (market: string | null) =>
    market === "KRW-CYS"
      ? "npm run dry-run:review-spot-perp-carry-cys-live-ready"
      : market === "KRW-AZTEC"
        ? "npm run dry-run:review-spot-perp-carry-aztec-live-ready"
      : market === "KRW-NIL"
        ? "npm run dry-run:review-spot-perp-carry-nil-live-ready"
      : market === "KRW-AKT"
        ? "npm run dry-run:review-spot-perp-carry-akt-live-ready"
      : market === "KRW-PIEVERSE"
      ? "npm run dry-run:review-spot-perp-carry-pieverse-live-ready"
      : market === "KRW-EDU"
        ? "npm run dry-run:review-spot-perp-carry-edu-live-ready"
        : "npm run dry-run:gate-live-goal-ready";
  const spotPerpCarryPm2StartCommandForMarket = (market: string | null) =>
    market === "KRW-CYS"
      ? "npm run pm2:start:live-spot-perp-carry-cys"
      : market === "KRW-AZTEC"
        ? "npm run pm2:start:live-spot-perp-carry-aztec"
      : market === "KRW-NIL"
        ? "npm run pm2:start:live-spot-perp-carry-nil"
      : market === "KRW-AKT"
        ? "npm run pm2:start:live-spot-perp-carry-akt"
      : market === "KRW-PIEVERSE"
      ? "npm run pm2:start:live-spot-perp-carry-pieverse"
      : market === "KRW-EDU"
        ? "npm run pm2:start:live-spot-perp-carry-edu"
        : "npm run pm2:start:live-spot-perp-carry";
  const spotPerpCarryManualValidationCommandForMarket = (
    market: string | null,
    readinessPath: string | null,
    reportPath: string | null,
  ) =>
    readinessPath === null ||
    reportPath === null ||
    market === null
      ? null
      : [
          "npm run dry-run:run-spot-perp-carry-live --",
          "--readiness-report",
          readinessPath,
          "--carry-report",
          reportPath,
          "--market",
          market,
          "--output",
          `var/reports/spot-perp-carry-${market.replace("KRW-", "").toLowerCase()}-live-execution-latest.json`,
          "--live-goal-status",
          "var/reports/live-goal-status-20260513-current.json",
          "--require-live-ready",
        ].join(" ");
  const spotPerpCarryReadinessPath = spotPerpCarryReadinessPathForMarket(
    spotPerpCarryFocusMarket,
  );
  const spotPerpCarryReportPath = spotPerpCarryReportPathForMarket(
    spotPerpCarryFocusMarket,
    bestSpotPerpCarryWatch?.path ?? null,
  );
  const spotPerpCarryReviewCommand = spotPerpCarryReviewCommandForMarket(
    spotPerpCarryFocusMarket,
  );
  const spotPerpCarryPm2StartCommand = spotPerpCarryPm2StartCommandForMarket(
    spotPerpCarryFocusMarket,
  );
  const spotPerpCarryManualValidationCommand =
    spotPerpCarryManualValidationCommandForMarket(
      spotPerpCarryFocusMarket,
      spotPerpCarryReadinessPath,
      spotPerpCarryReportPath,
    );
  const recompareChallengerMarket = spotPerpCarryFocusRecompareRequired
    ? spotPerpCarryFocusRecompareBestChallengerMarket
    : null;
  const recompareChallengerSymbol = spotPerpCarryFocusRecompareRequired
    ? spotPerpCarryFocusRecompareBestChallengerSymbol
    : null;
  const recompareChallengerReadinessPath =
    recompareChallengerMarket === null
      ? null
      : spotPerpCarryReadinessPathForMarket(recompareChallengerMarket);
  const recompareChallengerReportPath =
    recompareChallengerMarket === null
      ? null
      : spotPerpCarryReportPathForMarket(
          recompareChallengerMarket,
          stringValue(spotPerpCarryFocusRecompareBestChallenger.path),
        );
  const recompareChallengerPlan =
    spotPerpCarryFocusRecompareRequired && recompareChallengerMarket !== null
      ? {
          market: recompareChallengerMarket,
          symbol: recompareChallengerSymbol,
          sourcePath: stringValue(spotPerpCarryFocusRecompareBestChallenger.path),
          readinessPath: recompareChallengerReadinessPath,
          reportPath: recompareChallengerReportPath,
          latestWindow: recordValue(spotPerpCarryFocusRecompareBestChallenger.latestWindow),
          currentFocusLatestWindow:
            recordValue(recordValue(spotPerpCarryFocusRecompare?.currentFocusTrend).latestWindow),
          latestWindowSampleQualityPasses:
            spotPerpCarryFocusRecompare?.latestWindowSampleQualityPasses === true,
          action:
            spotPerpCarryFocusRecompare?.latestWindowSampleQualityPasses === true
              ? "review_challenger_as_research_focus_before_current_focus_live_preparation"
              : "collect_more_latest_window_samples_before_switch_review",
          refreshEvidenceCommand:
            "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress && npm run dry-run:gate-live-goal-ready",
          postSwitchReviewCommand:
            spotPerpCarryReviewCommandForMarket(recompareChallengerMarket),
          postSwitchManualValidationCommand:
            spotPerpCarryManualValidationCommandForMarket(
              recompareChallengerMarket,
              recompareChallengerReadinessPath,
              recompareChallengerReportPath,
            ),
          postSwitchPm2StartCommand:
            spotPerpCarryPm2StartCommandForMarket(recompareChallengerMarket),
          liveStartupCaveat:
            "Challenger recompare is research-focus guidance only; its live review and PM2 commands remain blocked until the challenger independently clears live readiness and the global live-goal gate.",
        }
      : null;
  const cleanestExecutionMarket =
    cleanestSpotPerpCarryWatch?.topExecutableCarry[0]?.market ?? null;
  const cleanestExecutionSymbol =
    cleanestSpotPerpCarryWatch?.topExecutableCarry[0]?.symbol ?? null;
  const cleanestExecutionReadinessPath = spotPerpCarryReadinessPathForMarket(
    cleanestExecutionMarket,
  );
  const cleanestExecutionReportPath = spotPerpCarryReportPathForMarket(
    cleanestExecutionMarket,
    cleanestSpotPerpCarryWatch?.path ?? null,
  );
  const fallbackStartupPlan =
    cleanestExecutionMarket === null ||
    cleanestExecutionMarket === spotPerpCarryFocusMarket
      ? null
      : {
          market: cleanestExecutionMarket,
          symbol: cleanestExecutionSymbol,
          reviewCommand: spotPerpCarryReviewCommandForMarket(cleanestExecutionMarket),
          manualValidationCommand: spotPerpCarryManualValidationCommandForMarket(
            cleanestExecutionMarket,
            cleanestExecutionReadinessPath,
            cleanestExecutionReportPath,
          ),
          pm2StartCommand: spotPerpCarryPm2StartCommandForMarket(cleanestExecutionMarket),
          condition:
            "Use only if the current research focus fails switch criteria and this fallback independently passes live readiness.",
        };
  const demotedCarryMarketKeys = new Set(
    carryMarketDecisionMatrix
      .filter(
        (decision) =>
          decision.decision === "reject_or_demote" ||
          decision.decision === "reject_or_demote_fee_stress_failed",
      )
      .map((decision) => `${decision.market ?? "unknown"}|${decision.symbol ?? "unknown"}`),
  );
  const alternativeSpotPerpCarryResearchCandidates = carryMarketDecisionMatrix
    .filter((decision) => {
      if (decision.market === null || decision.symbol === null) return false;
      const key = `${decision.market ?? "unknown"}|${decision.symbol ?? "unknown"}`;
      if (demotedCarryMarketKeys.has(key)) return false;
      if (decision.market === spotPerpCarryFocusMarket) return false;
      if (decision.market === cleanestExecutionMarket) return false;
      if (
        decision.decision === "reject_or_demote" ||
        decision.decision === "reject_or_demote_fee_stress_failed"
      ) {
        return false;
      }
      const median =
        finite(decision.metrics.executionEligibleMedianNetCarryBps) ??
        Number.NEGATIVE_INFINITY;
      const positiveRate = finite(decision.metrics.executionEligiblePositiveRate) ?? 0;
      return median >= 20 && positiveRate >= 0.67;
    })
    .sort((left, right) => {
      const rightFeeStressMedian =
        finite(right.feeStressEvidence?.executionEligibleMedianNetCarryBps) ??
        Number.NEGATIVE_INFINITY;
      const leftFeeStressMedian =
        finite(left.feeStressEvidence?.executionEligibleMedianNetCarryBps) ??
        Number.NEGATIVE_INFINITY;
      if (rightFeeStressMedian !== leftFeeStressMedian) {
        return rightFeeStressMedian - leftFeeStressMedian;
      }
      const rightCompleted = finite(right.metrics.completedFundingCount) ?? 0;
      const leftCompleted = finite(left.metrics.completedFundingCount) ?? 0;
      if (rightCompleted !== leftCompleted) return rightCompleted - leftCompleted;
      const rightMedian =
        finite(right.metrics.executionEligibleMedianNetCarryBps) ??
        Number.NEGATIVE_INFINITY;
      const leftMedian =
        finite(left.metrics.executionEligibleMedianNetCarryBps) ??
        Number.NEGATIVE_INFINITY;
      return rightMedian - leftMedian;
    })
    .reduce<typeof carryMarketDecisionMatrix>((unique, decision) => {
      const key = `${decision.market ?? "unknown"}|${decision.symbol ?? "unknown"}`;
      const alreadyIncluded = unique.some(
        (existing) => `${existing.market ?? "unknown"}|${existing.symbol ?? "unknown"}` === key,
      );
      if (!alreadyIncluded) {
        unique.push(decision);
      }
      return unique;
    }, [])
    .slice(0, 5)
    .map((decision) => {
      const completedFundingCount = finite(decision.metrics.completedFundingCount) ?? 0;
      const observationCount = finite(decision.metrics.count) ?? 0;
      return {
        market: decision.market,
        symbol: decision.symbol,
        status: decision.status,
        decision: decision.decision,
        evidenceQuality:
          completedFundingCount < 2 || observationCount < 10
            ? "single_snapshot_or_early"
            : completedFundingCount < 6
              ? "early_repeated_funding"
              : "ready_for_readiness_review",
        metrics: decision.metrics,
        feeStressEvidence: decision.feeStressEvidence,
        requiredBeforeLive: [
          "focused_72h_report_or_equivalent_per_market_evidence",
          "completed funding events >= required events",
          "observation span >= required span",
          "fee schedule confirmed",
          "inventory ready",
          "hedge venue ready",
          "fresh operational proof",
        ],
        usableForLivePromotion: false as const,
        interpretation:
          "Alternative research candidate only; it may replace the focus after repeated evidence, but it cannot bypass live-readiness gates.",
      };
    });
  const livePromotionRoadmap = useSpotPerpCarryWatchCandidate
    ? {
        status: liveReady ? "ready_for_final_manual_review" : "not_live_ready",
        selectedLiveCandidate: liveReady ? selectedCandidate : null,
        researchFocus: {
          market: spotPerpCarryFocusMarket,
          symbol: spotPerpCarryFocusSymbol,
          role: "highest_expected_carry",
          expectedCarry: {
            estimatedNetPnlKrw:
              bestSpotPerpCarryWatch?.executableEvidence.estimatedNetPnlKrw ?? null,
            medianNetCarryBps:
              bestSpotPerpCarryWatch?.executableEvidence.medianNetCarryBps ?? null,
            positiveRate: bestSpotPerpCarryWatch?.executableEvidence.positiveRate ?? null,
            completedFundingCount:
              bestSpotPerpCarryWatch?.executableEvidence.completedFundingCount ?? null,
            observationCount:
              bestSpotPerpCarryWatch?.executableEvidence.observationCount ?? null,
            observationSpanMinutes:
              bestSpotPerpCarryWatch?.executableEvidence.observationSpanMinutes ?? null,
            spreadControlPassed: bestSpotPerpCarryWatch?.spreadControl?.passed === true,
          },
          feeStress: highestExpectedFeeStress === null
            ? null
            : {
                medianNetCarryBps:
                  highestExpectedFeeStress.executionEligibleMedianNetCarryBps ?? null,
                positiveRate:
                  highestExpectedFeeStress.executionEligiblePositiveRate ?? null,
                estimatedNetPnlKrw:
                  highestExpectedFeeStress.executionEligibleTotalEstimatedNetPnlKrw ?? null,
                passed: feeStressPasses(highestExpectedFeeStress, 20),
                path: highestExpectedFeeStress.path,
              },
          usableForLivePromotion: false,
        },
        fallbackResearchCandidate:
          cleanestExecutionMarket === null
            ? null
            : {
                market: cleanestExecutionMarket,
                symbol: cleanestExecutionSymbol,
                role: "cleanest_execution",
                expectedCarry: {
                  estimatedNetPnlKrw:
                    cleanestSpotPerpCarryWatch?.executableEvidence.estimatedNetPnlKrw ?? null,
                  medianNetCarryBps:
                    cleanestSpotPerpCarryWatch?.executableEvidence.medianNetCarryBps ?? null,
                  positiveRate:
                    cleanestSpotPerpCarryWatch?.executableEvidence.positiveRate ?? null,
                  completedFundingCount:
                    cleanestSpotPerpCarryWatch?.executableEvidence.completedFundingCount ?? null,
                  observationCount:
                    cleanestSpotPerpCarryWatch?.executableEvidence.observationCount ?? null,
                  observationSpanMinutes:
                    cleanestSpotPerpCarryWatch?.executableEvidence.observationSpanMinutes ?? null,
                  spreadControlPassed:
                    cleanestSpotPerpCarryWatch?.spreadControl?.passed === true,
                },
                feeStress: cleanestExecutionFeeStress === null
                  ? null
                  : {
                      medianNetCarryBps:
                        cleanestExecutionFeeStress.executionEligibleMedianNetCarryBps ?? null,
                      positiveRate:
                        cleanestExecutionFeeStress.executionEligiblePositiveRate ?? null,
                      estimatedNetPnlKrw:
                        cleanestExecutionFeeStress.executionEligibleTotalEstimatedNetPnlKrw ??
                        null,
                      passed: feeStressPasses(cleanestExecutionFeeStress, 20),
                      path: cleanestExecutionFeeStress.path,
                },
                usableForLivePromotion: false,
              },
        alternativeResearchCandidates: alternativeSpotPerpCarryResearchCandidates,
        readiness: {
          sourceReadinessPath: primarySpotPerpCarryLiveReadiness?.path ?? null,
          liveReady: primarySpotPerpCarryLiveReadiness?.liveReady === true,
          gap: primarySpotPerpCarryLiveReadiness?.readinessGap ?? null,
          timeline: primarySpotPerpCarryLiveReadiness?.readinessTimeline ?? null,
          blockers: primarySpotPerpCarryLiveReadiness?.reasons ?? [],
        },
        operational: carryOperationalReadiness,
        nextReview: {
          gateCommand: "npm run dry-run:gate-live-goal-ready",
          earliestReviewAt:
            primarySpotPerpCarryLiveReadiness?.readinessTimeline?.estimatedEarliestReviewAt ??
            null,
          bottleneck:
            primarySpotPerpCarryLiveReadiness?.readinessTimeline?.bottleneck ?? null,
          requiredBeforeLive: [
            "readiness.liveReady=true",
            "operational.accountFeesConfirmed=true",
            "operational.inventoryReady=true",
            "operational.hedgeVenueReady=true",
            "currentEntrySanity.status=current_entry_clear",
            "liveStartupAllowed=true",
          ],
        },
        interpretation:
          "This roadmap identifies the next live-review point; it is not permission to start live trading.",
      }
    : null;
  const profitabilityEvidence = useSpotPerpCarryWatchCandidate
    ? {
        status: "estimated_carry_only",
        realizedPnlKrw: null,
        realizedReturnPct: null,
        realizedEvidenceAvailable: false,
        estimatedCarry: {
          market: spotPerpCarryFocusMarket,
          symbol: spotPerpCarryFocusSymbol,
          estimatedNetPnlKrw:
            bestSpotPerpCarryWatch?.executableEvidence.estimatedNetPnlKrw ?? null,
          medianNetCarryBps:
            bestSpotPerpCarryWatch?.executableEvidence.medianNetCarryBps ?? null,
          positiveRate: bestSpotPerpCarryWatch?.executableEvidence.positiveRate ?? null,
          completedFundingCount:
            bestSpotPerpCarryWatch?.executableEvidence.completedFundingCount ?? null,
          observationCount:
            bestSpotPerpCarryWatch?.executableEvidence.observationCount ?? null,
          observationSpanMinutes:
            bestSpotPerpCarryWatch?.executableEvidence.observationSpanMinutes ?? null,
          feeStressEstimatedNetPnlKrw:
            highestExpectedFeeStress?.executionEligibleTotalEstimatedNetPnlKrw ?? null,
          feeStressMedianNetCarryBps:
            highestExpectedFeeStress?.executionEligibleMedianNetCarryBps ?? null,
        },
        fallbackEstimatedCarry:
          cleanestExecutionMarket === null
            ? null
            : {
                market: cleanestExecutionMarket,
                symbol: cleanestExecutionSymbol,
                estimatedNetPnlKrw:
                  cleanestSpotPerpCarryWatch?.executableEvidence.estimatedNetPnlKrw ?? null,
                medianNetCarryBps:
                  cleanestSpotPerpCarryWatch?.executableEvidence.medianNetCarryBps ?? null,
                feeStressEstimatedNetPnlKrw:
                  cleanestExecutionFeeStress?.executionEligibleTotalEstimatedNetPnlKrw ?? null,
                feeStressMedianNetCarryBps:
                  cleanestExecutionFeeStress?.executionEligibleMedianNetCarryBps ?? null,
              },
        livePromotionEvidenceSatisfied: liveReady,
        interpretation:
          "Spot-perp carry profitability is public-data estimated carry, not realized live or closed-trade PnL; it can guide research focus but cannot start live trading without readiness and operational proof.",
      }
    : null;
  const liveStartupPlan = useSpotPerpCarryWatchCandidate
    ? {
        status: spotPerpCarryFocusRecompareRequired
          ? "blocked_current_focus_recompare_required"
          : liveReady
            ? "ready_for_gated_manual_review"
            : "blocked_until_all_gates_pass",
        candidateType: selectedCandidate.type,
        researchFocusMarket: spotPerpCarryFocusMarket,
        researchFocusSymbol: spotPerpCarryFocusSymbol,
        cleanestExecutionMarket,
        fallbackStartupPlan,
        gateCommand: "npm run dry-run:gate-live-goal-ready",
        reviewCommand: spotPerpCarryFocusRecompareRequired ? null : spotPerpCarryReviewCommand,
        manualValidationCommand: spotPerpCarryFocusRecompareRequired
          ? null
          : spotPerpCarryManualValidationCommand,
        pm2StartCommand: spotPerpCarryFocusRecompareRequired ? null : spotPerpCarryPm2StartCommand,
        blockedReason: spotPerpCarryFocusRecompareRequired
          ? "A stronger fee-stressed challenger requires research-focus recompare before current focus live preparation."
          : null,
        blockedCommands: spotPerpCarryFocusRecompareRequired
          ? {
              reviewCommand: spotPerpCarryReviewCommand,
              manualValidationCommand: spotPerpCarryManualValidationCommand,
              pm2StartCommand: spotPerpCarryPm2StartCommand,
            }
          : null,
        recompareChallengerPlan,
        focusRecompare: spotPerpCarryFocusRecompareRequired ? spotPerpCarryFocusRecompare : null,
        orderSubmissionDefault: "disabled",
        requiredEnvForLiveValidation: [
          "ENABLE_LIVE_EXECUTION=true",
          "ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true",
        ],
        requiredEnvForOrderSubmission: [
          "ENABLE_LIVE_EXECUTION=true",
          "ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true",
          "ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION=true",
          "--submit-once",
        ],
        requiredSecrets: [
          "BITHUMB_ACCESS_KEY",
          "BITHUMB_SECRET_KEY",
          "BINANCE_API_KEY",
          "BINANCE_SECRET_KEY",
        ],
        hardStops: [
          "Do not run the PM2 live command while liveReady is false.",
          "Do not add --submit-once unless the review command and live-goal gate pass.",
          "Do not submit orders unless ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION=true is explicit in the process environment.",
          "Do not promote a spread-failed focus market; switch or demote according to spotPerpCarryResearchFocusDecision.switchCriteria.",
          "Do not promote accumulated carry if the latest current-entry snapshot is weak, rejected, or diagnostic-only.",
          ...(spotPerpCarryFocusRecompareRequired
            ? [
                "Do not use blocked live review, manual validation, or PM2 start commands until the fee-stressed challenger recompare clears.",
              ]
            : []),
        ],
        currentBlockers: blockers,
        interpretation:
          "This is a gated startup path, not approval to trade. It becomes actionable only after readiness, fee, inventory, hedge, credentials, spread, and operational proof gates pass.",
      }
    : {
        status: liveReady ? "ready_for_gated_manual_review" : "blocked_no_spot_perp_carry_live_candidate",
        candidateType: selectedCandidate.type,
        gateCommand: "npm run dry-run:gate-live-goal-ready",
        orderSubmissionDefault: "disabled",
        hardStops: [
          "Do not start live trading while liveReady is false.",
          "Do not promote estimates or open marks without live-readiness evidence.",
        ],
        currentBlockers: blockers,
        interpretation:
          "No spot-perp carry watch candidate is currently selected as the live-goal research focus.",
      };
  const switchPlan =
    spotPerpCarryResearchFocusDecision === null
      ? null
      : {
          currentFocusMarket: spotPerpCarryResearchFocusDecision.currentFocusMarket,
          fallbackCandidateMarket: spotPerpCarryResearchFocusDecision.cleanestExecutionMarket,
          alternativeCandidateMarkets: alternativeSpotPerpCarryResearchCandidates.map(
            (candidate) => candidate.market,
          ),
          currentAction: spotPerpCarryFocusRecompareRequired
            ? "block_current_focus_live_startup_recompare_challenger"
            : spotPerpCarryResearchFocusDecision.action,
          switchTrigger:
            spotPerpCarryFocusRecompareRequired
              ? "Recompare the current focus against the best quality-cleared challenger after the next completed fee-stressed funding window; switch research focus only if repeated evidence clears quality gates."
              : "Switch research focus only after repeated completed funding windows show the current focus remains spread-failed or falls below carry/positive-rate gates while the fallback clears the same readiness gates.",
          focusRecompare: spotPerpCarryFocusRecompare,
          bestChallengerLiveReadiness:
            spotPerpCarryFocusRecompareChallengerLiveReadiness,
          recommendedResearchFocus:
            spotPerpCarryFocusRecompareRequired &&
            spotPerpCarryFocusRecompare?.latestWindowSampleQualityPasses === true
              ? {
                  market: recompareChallengerMarket,
                  symbol: recompareChallengerSymbol,
                  reason:
                    "The quality-cleared challenger beat the current focus in the aligned latest fee-stressed funding window.",
                  caveat:
                    "This is a research-focus recommendation only; it cannot authorize live startup.",
                }
              : null,
          doNotContinueIf: [
            "current focus recompare remains required after the next completed fee-stressed funding window",
            "median net carry < 20 bps after the kill window",
            "positive rate < 0.67 after the kill window",
            "execution eligible rate < 0.5 after the kill window",
            "depth coverage < 0.95 after the kill window",
            "spreadControlPassed remains false at live-readiness review",
          ],
          requiredBeforeSwitchToLive: [
            "observation span >= required span",
            "completed funding events >= required events",
            "fee schedule confirmed",
            "inventory ready",
            "hedge venue ready",
            "credentials and operational proof fresh",
            "current-entry sanity clears for the selected market",
            "current focus recompare clears",
            "best challenger live readiness clears before any live startup if focus switches",
            "liveStartupPlan gate command passes",
          ],
          interpretation:
            "Switching research focus is allowed by evidence; switching to live remains blocked until every live-readiness gate passes.",
        };
  const selectedLiveCandidate = liveReady ? selectedCandidate : null;
  const selectedMetricCandidates = [
    ...carryMarketDecisionMatrix
      .filter((decision) => decision.decision === "promote_to_live_readiness_queue")
      .reduce<
        Map<
          string,
          {
            market: string | null;
            symbol: string | null;
            sourcePath: string | null;
            status: string;
            decision: string;
            metrics: (typeof carryMarketDecisionMatrix)[number]["metrics"];
            feeStressEvidence: (typeof carryMarketDecisionMatrix)[number]["feeStressEvidence"];
            usableForLivePromotion: false;
          }
        >
      >((candidates, decision) => {
        const key = `${decision.market ?? "unknown"}|${decision.symbol ?? "unknown"}`;
        if (!candidates.has(key)) {
          candidates.set(key, {
            market: decision.market,
            symbol: decision.symbol,
            sourcePath: decision.sourcePath,
            status: decision.status,
            decision: decision.decision,
            metrics: decision.metrics,
            feeStressEvidence: decision.feeStressEvidence,
            usableForLivePromotion: false as const,
          });
        }
        return candidates;
      }, new Map())
      .values(),
  ];
  const selectedMetricCandidate = selectedMetricCandidates[0] ?? null;
  const rejectedCarryMarketKeys = new Set(
    carryMarketDecisionMatrix
      .filter(
        (decision) =>
          decision.decision === "reject_or_demote" ||
          decision.decision === "reject_or_demote_fee_stress_failed",
      )
      .map((decision) => `${decision.market ?? "unknown"}|${decision.symbol ?? "unknown"}`),
  );
  const feeStressMetricCandidates = [
    ...spotPerpCarryFeeStressSummaries
      .flatMap((report) =>
        report.perMarketSummary
          .filter((market) => {
            const key = `${market.market ?? "unknown"}|${market.symbol ?? "unknown"}`;
            if (rejectedCarryMarketKeys.has(key)) return false;
            const median =
              market.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
            const positiveRate = market.executionEligiblePositiveRate ?? 0;
            return (
              median >= 20 &&
              positiveRate >= 0.67 &&
              (market.rawPricingArtifactCount ?? 0) === 0
            );
          })
          .map((market) => ({
            sourcePath: report.path,
            generatedAt: report.generatedAt,
            market: market.market,
            symbol: market.symbol,
            assumptions: report.assumptions,
            metrics: {
              completedFundingCount: market.completedFundingCount,
              executionEligibleMedianNetCarryBps:
                market.executionEligibleMedianNetCarryBps,
              executionEligiblePositiveRate:
                market.executionEligiblePositiveRate,
              executionEligibleTotalEstimatedNetPnlKrw:
                market.executionEligibleTotalEstimatedNetPnlKrw,
              depthCoverageRate: market.depthCoverageRate,
              rawPricingArtifactCount: market.rawPricingArtifactCount,
            },
            usableForLivePromotion: false as const,
            interpretation:
              "Fee-stress metric candidate only; this supports research ranking but does not bypass full observation-span, funding-window, operational-proof, and live-readiness gates.",
          })),
      )
      .reduce<
        Map<
          string,
          {
            sourcePath: string | null;
            generatedAt: string | null;
            market: string | null;
            symbol: string | null;
            assumptions: (typeof spotPerpCarryFeeStressSummaries)[number]["assumptions"];
            metrics: {
              completedFundingCount: number | null;
              executionEligibleMedianNetCarryBps: number | null;
              executionEligiblePositiveRate: number | null;
              executionEligibleTotalEstimatedNetPnlKrw: number | null;
              depthCoverageRate: number | null;
              rawPricingArtifactCount: number | null;
            };
            usableForLivePromotion: false;
            interpretation: string;
          }
        >
      >((candidates, candidate) => {
        const key = `${candidate.market ?? "unknown"}|${candidate.symbol ?? "unknown"}`;
        const existing = candidates.get(key);
        const candidateMedian =
          candidate.metrics.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
        const existingMedian =
          existing?.metrics.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
        if (existing === undefined || candidateMedian > existingMedian) {
          candidates.set(key, candidate);
        }
        return candidates;
      }, new Map())
      .values(),
  ].sort((left, right) => {
    const rightMedian =
      right.metrics.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
    const leftMedian =
      left.metrics.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
    return rightMedian - leftMedian;
  });
  const selectedResearchFocus =
    selectedLiveCandidate !== null
      ? null
      : useSpotPerpCarryWatchCandidate
        ? {
            type: "spot_perp_carry_research_focus",
            market: spotPerpCarryFocusMarket,
            symbol: spotPerpCarryFocusSymbol,
            sourcePath: spotPerpCarryReportPath,
            candidateRole:
              spotPerpCarryCandidateRoles?.selectedResearchFocusRole ?? null,
            rationale: selectedCandidate.rationale,
            usableForLivePromotion: false,
          }
        : {
            type: selectedCandidate.type,
            market: replacementResearchFocus?.candidate?.market ?? null,
            symbol: null,
            sourcePath: replacementResearchFocus?.path ?? null,
            candidateRole: "research_only",
            rationale: selectedCandidate.rationale,
            usableForLivePromotion: false,
          };
  const selectedCandidateScope =
    selectedLiveCandidate === null ? "research_or_blocked_path" : "live_candidate";
  const selectedCandidateUsableForLivePromotion = selectedLiveCandidate !== null;
  const liveStartupAllowed =
    liveReady &&
    selectedLiveCandidate !== null &&
    selectedCandidateUsableForLivePromotion;
  const selectedCandidateInterpretation =
    selectedLiveCandidate === null
      ? "Legacy selectedCandidate identifies the leading research or blocked path only; selectedLiveCandidate and liveStartupAllowed are the live-trading authority."
      : "selectedCandidate is live-ready only because selectedLiveCandidate is populated and liveStartupAllowed is true.";
  const strategyLifecycleDecision = {
    selectedLiveCandidate,
    selectedResearchFocus,
    liveStartupAllowed,
    decisions: {
      legacy:
        legacyTradedPnlKrw !== null && legacyTradedPnlKrw < 0
          ? {
              decision: "reject",
              reason: "negative_realized_or_traded_paper_pnl",
              tradedPnlKrw: legacyTradedPnlKrw,
            }
          : null,
      crossExchange:
        crossExchange === null
          ? null
          : {
              decision: crossExchangeLiveReady ? "live_review" : "reject_or_remeasure",
              reason: crossExchangeLiveReady
                ? "readiness_passed"
                : "nonpositive_edge_or_missing_operational_proof",
              estimatedNetPnlKrw: crossExchangeEstimatedPnlKrw,
            },
      spotPerpCarryBaseline:
        spotPerpCarry === null
          ? null
          : {
              decision:
                carryEstimatedPnlKrw !== null && carryEstimatedPnlKrw <= 0
                  ? "demote_negative_baseline_collect_only"
                  : "research_only_remeasure",
              reason:
                carryEstimatedPnlKrw !== null && carryEstimatedPnlKrw <= 0
                  ? "current_net_carry_after_costs_is_not_positive"
                  : "requires_live_readiness_before_promotion",
              estimatedNetPnlKrw: carryEstimatedPnlKrw,
              medianNetCarryBps: carryMedianNetCarryBps,
            },
      highestExpectedCarry:
        spotPerpCarryCandidateRoles?.highestExpectedCarryCandidate === null ||
        spotPerpCarryCandidateRoles === null
          ? null
          : {
              decision: spotPerpCarryFocusRecompareRequired
                ? "recompare_or_prepare_demotion"
                : "continue_research_only",
              market: spotPerpCarryCandidateRoles.highestExpectedCarryCandidate.market,
              reason:
                spotPerpCarryFocusRecompareRequired
                  ? "current_focus_requires_recompare_against_challenger_beating_latest_fee_stressed_window"
                  : spotPerpCarryCandidateRoles.highestExpectedCarryCandidate.spreadControlPassed
                  ? "positive_expected_carry_but_live_gates_missing"
                  : "positive_expected_carry_but_spread_control_failed",
              focusRecompare: spotPerpCarryFocusRecompare,
              usableForLivePromotion:
                spotPerpCarryCandidateRoles.highestExpectedCarryCandidate
                  .usableForLivePromotion,
            },
      cleanestExecutionCarry:
        spotPerpCarryCandidateRoles?.cleanestExecutionCandidate === null ||
        spotPerpCarryCandidateRoles === null
          ? null
          : {
              decision: "fallback_research_only",
              market: spotPerpCarryCandidateRoles.cleanestExecutionCandidate.market,
              reason:
                "cleaner execution is not proof of profitability; require independent carry and live-readiness gates.",
              usableForLivePromotion:
                spotPerpCarryCandidateRoles.cleanestExecutionCandidate.usableForLivePromotion,
            },
    },
    interpretation:
      "Research candidates may be continued, switched, or demoted by evidence; only selectedLiveCandidate can start through the gated live path.",
  };
  const strategyDecision = {
    currentMode: liveReady ? "ready_for_gated_live_review" : "live_blocked",
    objectiveFit: liveReady
      ? "A candidate cleared the configured live evidence gates; start only through the matching gated runner after reviewing scope."
      : "The goal remains correctly focused on finding a profitable live candidate while rejecting losing or unproven evidence.",
    leadingResearch:
      replacementResearchFocus === null
        ? null
        : {
            market: replacementResearchFocus.candidate?.market ?? null,
            action: replacementResearchFocus.liveReady
              ? "review_for_gated_live"
              : replacementResearchFocus.classification === "discard_candidate"
                ? "reject"
                : replacementResearchFocusManagedDiscarded
                  ? "demote_from_live_focus"
                : "continue_paper_only_observation",
            classification: replacementResearchFocus.classification,
            evidenceType: replacementResearchFocus.liveReady
              ? "live_ready_readiness"
              : replacementResearchFocus.paperReady
                ? "paper_ready_unrealized_or_not_live"
                : replacementResearchFocusManagedDiscarded
                  ? "managed_paper_no_trade"
                : "historical_research_only",
            historicalReturnPct:
              replacementResearchFocus.benchmarkSummary?.strategyReturnPct ?? null,
            testReturnPct:
              replacementResearchFocus.benchmarkSummary?.test?.returnPct ?? null,
            testMedianPnlKrw:
              replacementResearchFocus.benchmarkSummary?.test?.medianPnlKrw ?? null,
            walkForwardMinFoldPnlKrw:
              replacementResearchFocus.benchmarkSummary?.walkForward?.minFoldPnlKrw ?? null,
            missingBeforeLive: replacementResearchFocus.liveReasons,
            liveExecutionPath: replacementResearchFocusLivePath,
            managedPaperReturn: replacementResearchFocusManagedReturn,
            liveGateChecks: {
              signalActive:
                replacementFocusObservation?.signal?.active ??
                replacementResearchFocus.liveChecks.signalActive ??
                null,
              directionalSignalPass:
                replacementFocusObservation?.signal?.directionalSignalPass ??
                replacementResearchFocus.liveChecks.directionalSignalPass ??
                null,
              riskPass:
                replacementFocusObservation?.signal?.riskPass ??
                replacementResearchFocus.liveChecks.riskPass ??
                null,
              executionViabilityWatchCandidate:
                replacementResearchFocus.liveChecks.executionViabilityWatchCandidate ?? null,
              paperSignalAttempted:
                replacementFocusPaperObservation?.paper?.attemptedSignal ??
                replacementResearchFocus.liveChecks.paperSignalAttempted ??
                null,
              paperEntryCreatedOpenPosition:
                replacementFocusPaperObservation?.paper?.openPositionCount === undefined
                  ? replacementResearchFocus.liveChecks.paperEntryCreatedOpenPosition ?? null
                  : replacementFocusPaperObservation.paper.openPositionCount > 0,
              positiveRealizedPaperExitPnl:
                replacementResearchFocus.liveChecks.positiveRealizedPaperExitPnl ?? null,
            },
            latestForwardObservation:
              replacementFocusObservation === null
                ? null
                : {
                    generatedAt: replacementFocusObservation.generatedAt ?? null,
                    latestCandleAt:
                      replacementFocusObservation.signal?.latestCandleAt ?? null,
                    lookbackReturnBps:
                      replacementFocusObservation.signal?.lookbackReturnBps ?? null,
                    riskValue: replacementFocusObservation.signal?.riskValue ?? null,
                    riskThreshold: replacementFocusObservation.signal?.riskThreshold ?? null,
                    riskExcessBps:
                      replacementFocusObservation.signal?.riskExcessBps ?? null,
                    executableCostVsExpectedEdgeBps:
                      replacementFocusObservation.orderbook?.executableCostVsExpectedEdgeBps ??
                      null,
                    buyDepthCoversNotional:
                      replacementFocusObservation.orderbook?.buyDepth?.coversRequestedNotional ??
                      null,
                    sellDepthCoversNotional:
                      replacementFocusObservation.orderbook?.sellDepth?.coversRequestedNotional ??
                      null,
                    executionViability:
                      replacementFocusObservation.decision?.executionViability ?? null,
                    reasons: replacementFocusObservation.decision?.reasons ?? [],
                  },
            latestPaperObservation:
              replacementFocusPaperObservation === null
                ? null
                : {
                    generatedAt: replacementFocusPaperObservation.generatedAt ?? null,
                    skippedReasons: replacementFocusPaperObservation.skippedReasons ?? [],
                    attemptedSignal:
                      replacementFocusPaperObservation.paper?.attemptedSignal ?? null,
                    acceptedSignals:
                      replacementFocusPaperObservation.paper?.acceptedSignals ?? null,
                    reconciliationOk:
                      replacementFocusPaperObservation.paper?.reconciliationOk ?? null,
                    openPositionCount:
                      replacementFocusPaperObservation.paper?.openPositionCount ?? null,
                  },
          },
    closestPaperPath: {
      strategy: "btc_240m_momentum_min75",
      action: min75CandidateLiveReady
        ? "review_for_gated_live"
        : min75StressBeatsBtcBuyAndHold
          ? "await_realized_reduce_only_exit"
          : "paper_only_do_not_promote_until_stress_edge_improves",
      evidenceType: min75CandidateLiveReady
        ? "realized_positive_paper_exit"
        : "open_paper_mark",
      estimatedOpenPnlKrw: min75OpenPositionPnlKrw,
      estimatedOpenReturnPct: min75OpenPositionReturnPct,
      holdExitDueAt: min75.openPosition?.holdExitDueAt ?? null,
      stressBeatsBtcBuyAndHold: min75StressBeatsBtcBuyAndHold,
      stressExcessReturnVsBuyHoldPct: min75StressExcessReturn,
      missingBeforeLive: liveReasons,
    },
    leadingManagedPaperPath:
      leadingActiveManagedPaperReturn === null
        ? null
        : {
            market: leadingActiveManagedPaperReturn.market,
            action: useManagedPaperCandidate
              ? "continue_managed_paper_measurement"
              : managedPaperHasLosingEvidence(leadingActiveManagedPaperReturn)
                ? "stop_reentry_keep_exit_reconciliation_only"
                : "observe_as_secondary_managed_paper_path",
            classification: leadingActiveManagedPaperReturn.classification,
            sessionCount: leadingActiveManagedPaperReturn.sessionCount,
            tradedSessionCount: leadingActiveManagedPaperReturn.tradedSessionCount,
            filledSessionCount: leadingActiveManagedPaperReturn.filledSessionCount,
            openMarkSessionCount: leadingActiveManagedPaperReturn.openMarkSessionCount,
            closedTradeCount: leadingActiveManagedPaperReturn.closedTradeCount,
            tradedPnlKrw: leadingActiveManagedPaperReturn.tradedPnlKrw,
            closedTradePnlKrw: leadingActiveManagedPaperReturn.closedTradePnlKrw,
            latestReturnPct: leadingActiveManagedPaperReturn.latestSession?.returnPct ?? null,
            latestMarkedPnlKrw: leadingActiveManagedPaperReturn.latestSession?.markedPnlKrw ?? null,
            openPositionCount:
              leadingActiveManagedPaperReturn.latestSession?.openPositionCount ?? null,
            liveReasons: leadingActiveManagedPaperReturn.liveReasons,
          },
    derivativesRegimeResearch:
      derivativesGatedSummaries.length === 0
        ? null
        : {
            action: derivativesGatedHasPromotionCandidate
              ? "review_research_candidate_not_live"
              : derivativesGatedDiagnosticImprovementCount > 0
                ? "continue_data_collection_not_live"
                : "reject_current_window",
            evidenceType: derivativesGatedHasPromotionCandidate
              ? "historical_regime_candidate_needs_forward_proof"
              : derivativesGatedDiagnosticImprovementCount > 0
                ? "diagnostic_improvement_only"
                : "no_regime_improvement",
            promotionCandidateCount: derivativesGatedPromotionCandidateCount,
            diagnosticImprovementCount: derivativesGatedDiagnosticImprovementCount,
            bestDiagnosticCandidate:
              strongestDerivativesGatedCandidate?.candidate ?? null,
            usableForLivePromotion: false,
            missingBeforeLive: [
              "historical span >= configured minimum",
              "train/test trade counts meet promotion minimums",
              "positive train and test totals and medians",
              "at least 4/5 positive walk-forward folds",
              "fresh Bithumb orderbook/paper execution proof",
              "positive realized paper exit PnL",
            ],
            reports: derivativesGatedSummaries,
          },
    signalExecutionCoverage:
      signalExecutionCoverage === null
        ? null
        : {
            action:
              signalExecutionCoverageFresh &&
              (signalExecutionCoverage.coverageReadyCandidateCount ?? 0) > 0
                ? "use_as_input_for_execution_overlay_not_live"
                : "block_historical_candidates_until_signal_time_orderbook_coverage_exists",
            status: signalExecutionCoverage.status ?? null,
            fresh: signalExecutionCoverageFresh,
            coverageReadyCandidateCount:
              signalExecutionCoverage.coverageReadyCandidateCount ?? null,
            candidateCount: signalExecutionCoverage.candidateCount ?? null,
            topCandidates: topSignalCoverageCandidates.map((candidate) => ({
              market: candidate.market ?? null,
              sourceIndex: candidate.sourceIndex ?? null,
              parameters: candidate.parameters ?? null,
              testPnlKrw: candidate.profitability?.test?.totalPnlKrw ?? null,
              walkForwardPnlKrw:
                candidate.profitability?.walkForward?.totalPnlKrw ?? null,
              orderbookSnapshotCount: candidate.orderbookSnapshotCount ?? null,
              trainRoundTripCoverageRate:
                candidate.coverage?.train?.roundTripCoverageRate ?? null,
              testRoundTripCoverageRate:
                candidate.coverage?.test?.roundTripCoverageRate ?? null,
              coverageReady: candidate.coverageReady ?? false,
              reasons: candidate.reasons ?? [],
            })),
            usableForLivePromotion: false,
            missingBeforeLive: [
              "coverage-ready signal timestamps",
              "orderbook-priced execution overlay PnL",
              "positive realized managed paper after accepted signals",
              "live readiness audit",
            ],
          },
    rejectedPaths: {
      legacy:
        legacyTradedPnlKrw === null && legacyClosedTradePnlKrw === null
          ? null
          : {
              action: "reject",
              reason: "negative_realized_or_traded_paper_pnl",
              tradedPnlKrw: legacyTradedPnlKrw,
              closedTradePnlKrw: legacyClosedTradePnlKrw,
            },
      crossExchange:
        crossExchange === null
          ? null
          : {
              action: crossExchangeLiveReady ? "review_for_gated_live" : "reject_or_remeasure",
              reason: crossExchangeLiveReady
                ? "configured_readiness_passed"
                : "current_executable_edge_is_not_positive_or_operational_proof_missing",
              estimatedNetPnlKrw: crossExchangeEstimatedPnlKrw,
              medianNetEdgeBps: crossExchange.candidate?.medianNetEdgeBps ?? null,
              positiveRate: crossExchange.candidate?.positiveRate ?? null,
              missingBeforeLive: crossExchange.blockers ?? [],
            },
      spotPerpCarry:
        spotPerpCarry === null
          ? null
          : {
              action: "reject_or_remeasure",
              reason: "current_net_carry_after_costs_is_not_positive",
              estimatedNetPnlKrw: carryEstimatedPnlKrw,
              medianNetCarryBps: carryMedianNetCarryBps,
              positiveRate: carryPositiveRate,
              completedFundingCount: spotPerpCarry.summary?.completedFundingCount ?? null,
              missingBeforeLive: spotPerpCarry.blockers ?? [],
            },
    },
  };
  const knownLosingPathsRejected =
    (legacyTradedPnlKrw === null || legacyTradedPnlKrw < 0) &&
    (crossExchangeEstimatedPnlKrw === null ||
      crossExchangeEstimatedPnlKrw <= 0 ||
      crossExchangeLiveReady) &&
    (carryEstimatedPnlKrw === null || carryEstimatedPnlKrw <= 0);
  const negativePnlPaths = [
    legacyTradedPnlKrw !== null && legacyTradedPnlKrw < 0
      ? {
          path: "legacy",
          pnlKrw: legacyTradedPnlKrw,
          action: "reject",
        }
      : null,
    crossExchangeEstimatedPnlKrw !== null && crossExchangeEstimatedPnlKrw <= 0
      ? {
          path: "cross_exchange",
          pnlKrw: crossExchangeEstimatedPnlKrw,
          action: "reject_or_remeasure",
        }
      : null,
    carryEstimatedPnlKrw !== null && carryEstimatedPnlKrw <= 0
      ? {
          path: "spot_perp_carry_baseline",
          pnlKrw: carryEstimatedPnlKrw,
          action: "demote_negative_baseline_collect_only",
        }
      : null,
  ].filter((path): path is { path: string; pnlKrw: number; action: string } => path !== null);
  const lossPersistenceGuard = {
    activeLosingPathsRejected: knownLosingPathsRejected,
    negativePnlPaths,
    estimatesAllowedForResearchOnly: true,
    openMarksAllowedForLivePromotion: false,
    rule:
      "A strategy with persistent negative realized/traded PnL or nonpositive executable edge must be rejected, demoted, or remeasured instead of defended as a live path.",
  };
  const processControlPlan = {
    interpretation:
      "Process guidance is operational safety context only; it never grants live startup authority. selectedLiveCandidate and liveStartupAllowed remain the live-trading authority.",
    liveExecution: {
      desiredState: liveStartupAllowed ? "start_only_through_gated_live_runner" : "stopped",
      allowed: liveStartupAllowed,
      gateCommand: "npm run dry-run:gate-live-goal-ready",
      selectedLiveCandidate,
    },
    btcMomentum: {
      desiredState: "exit_reconciliation_only",
      allowNewEntry: false,
      allowedObserverProcesses: [
        "dry-run-btc-240m-momentum-observer",
        "dry-run-btc-240m-momentum-min75-observer",
      ],
      disallowedPurpose:
        "Do not treat BTC 240m momentum observers as live-entry promotion evidence while open marks are negative or realized exits are unavailable.",
      stopAfter: [
        "open paper position count is zero",
        "reduce-only exit, if due, has been audited",
        "realized paper exit PnL is nonpositive or the live gate remains blocked",
      ],
      currentEvidence: {
        min75OpenPositionPnlKrw,
        min75OpenPositionReturnPct,
        min75HoldExitDueAt: min75.openPosition?.holdExitDueAt ?? null,
        min75StressBeatsBtcBuyAndHold,
        leadingManagedPaperAction:
          strategyDecision.leadingManagedPaperPath?.action ?? null,
        leadingManagedPaperTradedPnlKrw:
          strategyDecision.leadingManagedPaperPath?.tradedPnlKrw ?? null,
        leadingManagedPaperOpenPositionCount:
          strategyDecision.leadingManagedPaperPath?.openPositionCount ?? null,
      },
    },
    managedPaperReentry: {
      desiredState:
        leadingActiveManagedPaperReturn !== null &&
        managedPaperHasLosingEvidence(leadingActiveManagedPaperReturn)
          ? "do_not_start_reentry_manager"
          : "paper_only_until_realized_profit_and_cycle_health_pass",
      allowNewEntry: false,
      reason:
        "Managed paper paths need positive closed-trade PnL, no open position, and cycle-health gates before any live promotion; negative traded PnL is a demotion signal.",
    },
    carryResearch: {
      desiredState: spotPerpCarryFocusRecompareRequired
        ? "recompare_challenger_before_live_review"
        : useSpotPerpCarryWatchCandidate
          ? "continue_observation_only"
          : "search_or_remeasure",
      allowLiveStart: false,
      focusMarket: spotPerpCarryFocusMarket,
      fallbackMarket:
        spotPerpCarryCandidateRoles?.cleanestExecutionCandidate?.market ?? null,
      recompareChallengerPlan,
      currentEntrySanity: spotPerpCarryCurrentEntrySanity,
      focusRecompare: spotPerpCarryFocusRecompare,
      requiredBeforeLive: [
        "minimum observations and observation span",
        "minimum completed funding events",
        "current entry sanity clear",
        "current focus recompare clear",
        "fee schedule confirmed",
        "spot inventory ready",
        "futures hedge venue ready",
        "fresh operational proof with required secrets",
      ],
    },
  };
  const feeStressFailedMarketKeys = [
    ...new Set(
      carryMarketDecisionMatrix
        .filter((decision) => decision.decision === "reject_or_demote_fee_stress_failed")
        .map((decision) => carryMarketKey(decision.market, decision.symbol))
        .filter((key): key is string => key !== null),
    ),
  ];
  const feeStressDemotedMarketKeys = new Set(
    feeStressDemotedMarkets
      .map((decision) => carryMarketKey(decision.market, decision.symbol))
      .filter((key): key is string => key !== null),
  );
  const feeStressDemotionAudit = {
    failedMarketCount: feeStressFailedMarketKeys.length,
    demotedMarketCount: feeStressDemotedMarketKeys.size,
    demotedMarkets: feeStressDemotedMarkets.map((decision) => ({
      market: decision.market,
      symbol: decision.symbol,
      decision: decision.decision,
      medianNetCarryBps:
        decision.feeStressEvidence?.executionEligibleMedianNetCarryBps ?? null,
      positiveRate: decision.feeStressEvidence?.executionEligiblePositiveRate ?? null,
      rawPricingArtifactCount: decision.feeStressEvidence?.rawPricingArtifactCount ?? null,
    })),
  };
  const feeStressDemotionAuditPassed = feeStressFailedMarketKeys.every((key) =>
    feeStressDemotedMarketKeys.has(key),
  );
  const promptToArtifactChecklist = [
    {
      requirement:
        "Use current subagent/research evidence instead of stale or losing paths.",
      artifact:
        "selectedCandidate, selectedLiveCandidate, selectedResearchFocus, strategyDecision, profitabilitySnapshot",
      passed: selectedCandidate.type !== "none" && knownLosingPathsRejected,
      evidence: {
        selectedCandidateType: selectedCandidate.type,
        selectedCandidateScope,
        selectedLiveCandidate,
        selectedResearchFocus,
        selectedCandidateRationale: selectedCandidate.rationale,
        rejectedPaths: strategyDecision.rejectedPaths,
      },
    },
    {
      requirement:
        "Identify the best current profitability research focus without calling it live-ready.",
      artifact:
        "spotPerpCarryCandidateRoles, spotPerpCarryResearchFocusDecision, spotPerpCarryPairedMarketComparison",
      passed:
        useSpotPerpCarryWatchCandidate &&
        spotPerpCarryCandidateRoles !== null &&
        spotPerpCarryResearchFocusDecision !== null &&
        pairedMarketComparisonSupportsResearchFocus !== false,
      evidence: {
        candidateRoles: spotPerpCarryCandidateRoles,
        researchFocusDecision: spotPerpCarryResearchFocusDecision,
        pairedMarketComparison: spotPerpCarryPairedMarketComparison,
        pairedMarketComparisonSupportsResearchFocus,
      },
    },
    {
      requirement:
        "Do not keep insisting on a spread-failed candidate without a switch or demotion rule.",
      artifact: "spotPerpCarryResearchFocusDecision.switchCriteria, switchPlan",
      passed:
        spotPerpCarryResearchFocusDecision === null ||
        (Array.isArray(spotPerpCarryResearchFocusDecision.switchCriteria) &&
          switchPlan !== null),
      evidence: {
        spotPerpCarryResearchFocusDecision,
        switchPlan,
      },
    },
    {
      requirement:
        "Do not keep defending strategies that keep losing or have nonpositive executable edge.",
      artifact: "strategyLifecycleDecision, lossPersistenceGuard",
      passed: knownLosingPathsRejected && lossPersistenceGuard.negativePnlPaths.length > 0,
      evidence: {
        strategyLifecycleDecision,
        lossPersistenceGuard,
      },
    },
    {
      requirement:
        "Keep running process guidance aligned with the strategy decision so losing momentum paths are exit/reconciliation only.",
      artifact: "processControlPlan",
      passed:
        processControlPlan.liveExecution.allowed === liveStartupAllowed &&
        processControlPlan.btcMomentum.allowNewEntry === false &&
        processControlPlan.managedPaperReentry.allowNewEntry === false &&
        processControlPlan.carryResearch.allowLiveStart === false,
      evidence: processControlPlan,
    },
    {
      requirement:
        "Do not rely on unstressed spot-perp carry fee assumptions when account fees are unconfirmed.",
      artifact: "spotPerpCarryFeeStressDecision",
      passed:
        !useSpotPerpCarryWatchCandidate ||
        (spotPerpCarryFeeStressDecision !== null &&
          spotPerpCarryFeeStressDecision.highestExpectedStressPassed === true),
      evidence: spotPerpCarryFeeStressDecision,
    },
    {
      requirement:
        "Do not keep nominally positive carry markets in live focus when current fee-stress evidence fails.",
      artifact: "feeStressDemotedMarkets, carryMarketDecisionMatrix",
      passed: feeStressDemotionAuditPassed,
      evidence: feeStressDemotionAudit,
    },
    {
      requirement:
        "Do not promote accumulated carry when the latest current-entry snapshot is weak, rejected, or diagnostic-only.",
      artifact: "spotPerpCarryCurrentEntrySanity",
      passed:
        !useSpotPerpCarryWatchCandidate ||
        spotPerpCarryCurrentEntryBlockers.length === 0,
      evidence: spotPerpCarryCurrentEntrySanity,
    },
    {
      requirement:
        "Do not keep preparing a carry focus for live when a quality-cleared challenger beats the latest fee-stressed funding window.",
      artifact: "spotPerpCarryFocusRecompare",
      passed:
        !useSpotPerpCarryWatchCandidate ||
        !spotPerpCarryFocusRecompareRequired,
      evidence: spotPerpCarryFocusRecompare,
    },
    {
      requirement:
        "Live startup is allowed only after readiness, fee, inventory, hedge, and operational proof gates pass.",
      artifact:
        "liveReady, selectedLiveCandidate, liveStartupAllowed, blockers, carryLiveReadinessReports, liveStartupPlan",
      passed: liveStartupAllowed,
      evidence: {
        liveReady,
        liveStartupAllowed,
        selectedLiveCandidate,
        selectedCandidateScope,
        selectedCandidateUsableForLivePromotion,
        blockers,
        carryLiveReadinessReady: spotPerpCarryLiveReadinessReady,
        liveStartupPlan,
      },
    },
    {
      requirement:
        "When a path eventually becomes live-ready, the startup method remains explicit and fail-closed.",
      artifact: "liveStartupPlan",
      passed:
        liveStartupPlan.orderSubmissionDefault === "disabled" &&
        Array.isArray(liveStartupPlan.hardStops) &&
        liveStartupPlan.hardStops.length > 0,
      evidence: liveStartupPlan,
    },
    {
      requirement:
        "When live is blocked, missing requirements are explicit enough to continue work without operator guesswork.",
      artifact: "completionAudit.missingRequirements, nextActionPlan",
      passed: liveReady || blockers.length > 0,
      evidence: {
        missingRequirementCount: blockers.length,
        recommendedAction,
      },
    },
  ];
  const completionCriteria = [
    {
      id: "candidate_selected_from_current_evidence",
      criterion:
        "A live candidate is selected from current evidence, not from stale, losing, or research-only paths.",
      passed: selectedLiveCandidate !== null,
      evidence: {
        selectedCandidateScope,
        selectedLiveCandidate,
        selectedResearchFocus,
        rationale:
          selectedLiveCandidate === null
            ? "No current evidence has cleared every live gate; selectedCandidate is research or blocked-path context only."
            : selectedCandidate.rationale,
      },
    },
    {
      id: "profitability_evidence_satisfied",
      criterion: "The selected path has positive realized or live-ready profitability evidence.",
      passed: liveStartupAllowed,
      evidence: liveStartupAllowed
        ? "Configured live readiness passed and selectedLiveCandidate is populated."
        : "No realized positive paper exit or live-ready operational proof is available; open marks remain monitoring-only.",
    },
    {
      id: "known_losing_paths_rejected",
      criterion: "Known losing paths are rejected instead of promoted.",
      passed: knownLosingPathsRejected,
      evidence: {
        legacyTradedPnlKrw,
        crossExchangeEstimatedPnlKrw,
        carryEstimatedPnlKrw,
      },
    },
    {
      id: "current_entry_sanity_clear",
      criterion:
        "The selected carry focus clears the latest current-entry sanity check before live startup.",
      passed:
        !useSpotPerpCarryWatchCandidate ||
        spotPerpCarryCurrentEntryBlockers.length === 0,
      evidence: spotPerpCarryCurrentEntrySanity,
    },
    {
      id: "no_current_focus_recompare_caution",
      criterion:
        "The selected carry focus is not behind a stronger latest fee-stressed challenger that requires recompare.",
      passed:
        !useSpotPerpCarryWatchCandidate ||
        !spotPerpCarryFocusRecompareRequired,
      evidence: spotPerpCarryFocusRecompare,
    },
    {
      id: "live_startup_gate_allowed",
      criterion:
        "The global live-startup gate explicitly allows the selected live candidate.",
      passed: liveStartupAllowed && blockers.length === 0 && selectedLiveCandidate !== null,
      evidence: {
        blockers,
        liveStartupAllowed,
        selectedLiveCandidate,
      },
    },
  ];
  const failedCompletionCriteria = completionCriteria
    .filter((criterion) => criterion.passed !== true)
    .map((criterion) => criterion.id);
  const completionCriterionIds = completionCriteria.map((criterion) => criterion.id);
  const missingRequiredCompletionCriterionIds = REQUIRED_LIVE_GOAL_COMPLETION_CRITERIA_IDS.filter(
    (id) => !completionCriterionIds.includes(id),
  );
  if (missingRequiredCompletionCriterionIds.length > 0) {
    throw new Error(
      `live goal completion audit is missing required criteria: ${missingRequiredCompletionCriterionIds.join(", ")}`,
    );
  }
  const completionAchieved =
    liveStartupAllowed && blockers.length === 0 && failedCompletionCriteria.length === 0;
  const completionAudit = {
    objective:
      "Use subagent/research evidence to find a profitable strategy that can be started live only after trustworthy live-readiness gates pass.",
    achieved: completionAchieved,
    promptToArtifactChecklist,
    criteria: completionCriteria,
    failedCompletionCriteria,
    missingRequirements: blockers,
    missingRequirementCount: blockers.length,
  };
  const executableCandidateSearchNeeded =
    !liveReady &&
    !useManagedPaperCandidate &&
    !useCrossExchangeCandidate &&
    (replacementResearchFocusManagedDiscarded ||
      replacementScansHaveNoPromotionCandidates ||
      latestReplacementScanHasNoPromotionCandidate ||
      (derivativesGatedSummaries.length > 0 &&
        !derivativesGatedHasPromotionCandidate &&
        derivativesGatedDiagnosticImprovementCount === 0));
  const carryBaselineHasPositiveSignal =
    (carryEstimatedPnlKrw ?? Number.NEGATIVE_INFINITY) > 0 &&
    (carryMedianNetCarryBps ?? Number.NEGATIVE_INFINITY) > 0 &&
    (carryPositiveRate ?? 0) > 0.5;
  const carryObservationPriority =
    bestSpotPerpCarryWatch !== null ? 4 : carryBaselineHasPositiveSignal ? 1 : 2;
  const nextActionPlan = [
    ...(carryObservationStillCollecting
      ? [
          {
            priority: carryObservationPriority,
            track: "spot_perp_carry_72h_observation",
            action: carryBaselineHasPositiveSignal
              ? "continue_completed_funding_observation_do_not_promote"
              : "demote_negative_baseline_collect_only_do_not_promote",
            currentEvidence: {
              estimatedNetPnlKrw: carryEstimatedPnlKrw,
              medianNetCarryBps: carryMedianNetCarryBps,
              positiveRate: carryPositiveRate,
              completedFundingCount: spotPerpCarry.summary?.completedFundingCount ?? null,
              observationCount: spotPerpCarry.summary?.count ?? null,
              usableForLivePromotion: false,
            },
            requiredEvidenceBeforeLive: [
              "72h observation span",
              "at least 6 unique completed funding windows",
              "median net carry above promotion threshold",
              "positive carry rate above promotion threshold",
              "fee schedule, inventory, and hedge venue confirmed",
              "separate live readiness audit",
            ],
            verificationCommand:
              "npm run dry-run:observe-spot-perp-carry-72h && npm run dry-run:gate-live-goal-ready",
          },
        ]
      : []),
    ...(bestSpotPerpCarryWatch === null
      ? []
      : [
          {
            priority: 1,
            track: "spot_perp_carry_watchlist",
            action: spotPerpCarryFocusRecompareRequired
              ? "recompare_current_focus_against_quality_challenger_do_not_promote"
              : "continue_best_positive_watch_candidate_observation_do_not_promote",
            currentEvidence: {
              path: bestSpotPerpCarryWatch.path,
              estimatedNetPnlKrw:
                bestSpotPerpCarryWatch.executableEvidence.estimatedNetPnlKrw,
              medianNetCarryBps:
                bestSpotPerpCarryWatch.executableEvidence.medianNetCarryBps,
              positiveRate: bestSpotPerpCarryWatch.executableEvidence.positiveRate,
              completedFundingCount:
                bestSpotPerpCarryWatch.executableEvidence.completedFundingCount,
              observationCount: bestSpotPerpCarryWatch.executableEvidence.observationCount,
              topExecutableCarry: bestSpotPerpCarryTopExecutable,
              decision: bestSpotPerpCarryDecision,
              candidateRoles: spotPerpCarryCandidateRoles,
              researchFocusDecision: spotPerpCarryResearchFocusDecision,
              focusRecompare: spotPerpCarryFocusRecompare,
              focusRecompareChallengerLiveReadiness:
                spotPerpCarryFocusRecompareChallengerLiveReadiness,
              pairedMarketComparison: spotPerpCarryPairedMarketComparison,
              spreadControl: bestSpotPerpCarryWatch.spreadControl,
              liveReadinessPath: primarySpotPerpCarryLiveReadiness?.path ?? null,
              readinessGap: primarySpotPerpCarryLiveReadiness?.readinessGap ?? null,
              readinessTimeline:
                primarySpotPerpCarryLiveReadiness?.readinessTimeline ?? null,
              usableForLivePromotion: false,
            },
            promotionCriteria: {
              minObservations: 432,
              minObservationSpanMinutes: 4320,
              minCompletedFundingEvents: 6,
              minNetCarryBps: 10,
              minPositiveCarryRate: 0.67,
              minDepthCoverageRate: 0.95,
              accountFeesConfirmed: true,
              inventoryReady: true,
              hedgeVenueReady: true,
              liveReadinessRequired: true,
            },
            killCriteria: bestSpotPerpCarryDecision?.killPolicy ?? null,
            requiredEvidenceBeforeLive: bestSpotPerpCarryWatch.blockers,
            verificationCommand: spotPerpCarryWatchVerificationCommand(
              bestSpotPerpCarryWatch.path,
            ),
          },
        ]),
    ...(executableCandidateSearchNeeded
      ? [
          {
            priority:
              carryObservationStillCollecting || bestSpotPerpCarryWatch !== null ? 3 : 1,
            track: "executable_candidate_search",
            action: "search_new_executable_edge_do_not_defend_failed_paths",
            currentEvidence: {
              liveReady,
              replacementScanCount: replacementScanSummaries.length,
              replacementScansHaveNoPromotionCandidates,
              latestReplacementScanHasNoPromotionCandidate,
              derivativesGatedPromotionCandidateCount,
              derivativesGatedDiagnosticImprovementCount,
              signalExecutionCoverage:
                signalExecutionCoverage === null
                  ? null
                  : {
                      status: signalExecutionCoverage.status ?? null,
                      fresh: signalExecutionCoverageFresh,
                      coverageReadyCandidateCount:
                        signalExecutionCoverage.coverageReadyCandidateCount ?? null,
                      candidateCount: signalExecutionCoverage.candidateCount ?? null,
                      bestCoverageCandidate: topSignalCoverageCandidates[0] ?? null,
                    },
              demotedReplacementMarket: replacementResearchFocusManagedDiscarded
                ? replacementResearchFocus?.candidate?.market ?? null
                : null,
              demotedReplacementReason: replacementResearchFocusManagedDiscarded
                ? "managed_paper_execution_guard_or_no_trade"
                : null,
            },
            requiredEvidenceBeforeLive: [
              "fresh executable market universe",
              "positive train and test net PnL after realistic fees",
              "positive median trade PnL",
              "sufficient trade count and walk-forward folds",
              "fresh orderbook execution viability",
              "positive realized paper exit PnL",
            ],
            verificationCommand:
              "node dist/src/cli/audit-signal-execution-coverage.js --scan var/reports/execution-audit-seeded-btc-eth-xrp-60m-momentum-fee50-20260514.json --scan var/reports/execution-audit-seeded-krw-h-60m-momentum-fee50-20260514.json --output var/reports/signal-execution-coverage-btc-eth-xrp-h-20260514.json && npm run dry-run:gate-live-goal-ready",
          },
        ]
      : []),
    ...(leadingActiveManagedPaperReturn === null
      ? []
      : [
          {
            priority: useManagedPaperCandidate ? 1 : 5,
            track: "managed_paper",
            market: leadingActiveManagedPaperReturn.market,
            action: managedPaperHasLosingEvidence(leadingActiveManagedPaperReturn)
              ? "stop_reentry_keep_exit_reconciliation_only"
              : "continue_until_closed_realized_profit_and_cycle_health_pass",
            currentEvidence: {
              classification: leadingActiveManagedPaperReturn.classification,
              sessionCount: leadingActiveManagedPaperReturn.sessionCount,
              tradedSessionCount: leadingActiveManagedPaperReturn.tradedSessionCount,
              filledSessionCount: leadingActiveManagedPaperReturn.filledSessionCount,
              openMarkSessionCount: leadingActiveManagedPaperReturn.openMarkSessionCount,
              closedTradeCount: leadingActiveManagedPaperReturn.closedTradeCount,
              tradedPnlKrw: leadingActiveManagedPaperReturn.tradedPnlKrw,
              closedTradePnlKrw: leadingActiveManagedPaperReturn.closedTradePnlKrw,
              latestReturnPct: leadingActiveManagedPaperReturn.latestSession?.returnPct ?? null,
              latestMarkedPnlKrw:
                leadingActiveManagedPaperReturn.latestSession?.markedPnlKrw ?? null,
              openPositionCount:
                leadingActiveManagedPaperReturn.latestSession?.openPositionCount ?? null,
              quality: leadingActiveManagedPaperReturn.quality,
              executionGuardRejections:
                leadingActiveManagedPaperReturn.executionGuardRejections,
            },
            requiredEvidenceBeforeLive: leadingActiveManagedPaperReturn.liveReasons,
            verificationCommand: managedPaperVerificationCommand(
              leadingActiveManagedPaperReturn.market,
            ),
          },
        ]),
    ...(derivativesGatedSummaries.length === 0
      ? []
      : [
          {
            priority: useManagedPaperCandidate ? 2 : 2,
            track: "derivatives_regime_filter",
            action: derivativesGatedHasPromotionCandidate
              ? "review_research_candidate_but_keep_live_blocked"
              : derivativesGatedDiagnosticImprovementCount > 0
                ? "continue_historical_alignment_until_promotion_gates_pass"
                : "reject_current_window_search_other_signal",
            currentEvidence: {
              evidenceType: derivativesGatedHasPromotionCandidate
                ? "historical_regime_candidate_needs_forward_proof"
                : derivativesGatedDiagnosticImprovementCount > 0
                  ? "diagnostic_improvement_only"
                  : "no_regime_improvement",
              promotionCandidateCount: derivativesGatedPromotionCandidateCount,
              diagnosticImprovementCount: derivativesGatedDiagnosticImprovementCount,
              bestDiagnosticCandidate:
                strongestDerivativesGatedCandidate?.candidate ?? null,
              usableForLivePromotion: false,
            },
            requiredEvidenceBeforeLive: [
              "historical span >= configured minimum",
              "train/test trade counts meet promotion minimums",
              "positive train and test totals and medians",
              "at least 4/5 positive walk-forward folds",
              "fresh Bithumb orderbook/paper execution proof",
              "positive realized paper exit PnL",
            ],
            verificationCommand:
              "npm run dry-run:analyze-binance-derivatives-gated-bithumb-momentum -- --pairs KRW-BTC:BTCUSDT,KRW-ETH:ETHUSDT,KRW-XRP:XRPUSDT --unit-minutes 240 --limit 500 --fee-round-trip-bps 50 --output var/reports/binance-derivatives-gated-bithumb-momentum-240m-live-risk-20260514.json && npm run dry-run:gate-live-goal-ready",
          },
        ]),
    {
      priority: useManagedPaperCandidate ? 2 : min75StressBeatsBtcBuyAndHold ? 1 : 2,
      track: "btc_240m_momentum_min75",
      action: min75CandidateLiveReady
        ? "review_for_gated_live_start"
        : min75StressBeatsBtcBuyAndHold
          ? "wait_for_realized_reduce_only_exit"
          : "paper_only_do_not_promote_until_stress_edge_improves",
      earliestReviewAt: min75.openPosition?.holdExitDueAt ?? null,
      currentEvidence: {
        evidenceType: min75CandidateLiveReady
          ? "realized_positive_paper_exit"
          : min75OpenPositionPnlKrw === null
            ? "no_open_mark"
            : "open_paper_mark",
        estimatedOpenPnlKrw: min75OpenPositionPnlKrw,
        estimatedOpenReturnPct: min75OpenPositionReturnPct,
        stressBeatsBtcBuyAndHold: min75StressBeatsBtcBuyAndHold,
        stressExcessReturnVsBuyHoldPct: min75StressExcessReturn,
        usableForLivePromotion: min75CandidateLiveReady,
      },
      requiredEvidenceBeforeLive: liveReasons,
      verificationCommand: "npm run dry-run:gate-btc-240m-min75-live-ready",
    },
    ...(replacementResearchFocus === null
      ? []
      : [
          {
            priority: replacementResearchFocusManagedDiscarded
              ? 5
              : useManagedPaperCandidate
                ? 3
                : min75StressBeatsBtcBuyAndHold
                  ? 2
                  : 1,
            track: "replacement_time_series",
            market: replacementResearchFocus.candidate?.market ?? null,
            action: replacementResearchFocus.liveReady
              ? "review_for_gated_live_start"
              : replacementResearchFocusManagedDiscarded
                ? "demote_from_live_focus_search_for_better_executable_candidate"
                : "continue_observation_until_forward_paper_entry_and_realized_exit",
            currentEvidence: {
              classification: replacementResearchFocus.classification,
              evidenceType: replacementResearchFocus.liveReady
                ? "live_ready_readiness"
                : replacementResearchFocus.paperReady
                  ? "paper_ready_unrealized_or_not_live"
                  : replacementResearchFocusManagedDiscarded
                    ? "managed_paper_no_trade"
                  : "historical_research_only",
              signalActive: replacementFocusObservation?.signal?.active ?? null,
              directionalSignalPass:
                replacementFocusObservation?.signal?.directionalSignalPass ?? null,
              riskPass: replacementFocusObservation?.signal?.riskPass ?? null,
              forwardReasons: replacementFocusObservation?.decision?.reasons ?? [],
              paperSkippedReasons: replacementFocusPaperObservation?.skippedReasons ?? [],
              openPositionCount:
                replacementFocusPaperObservation?.paper?.openPositionCount ?? null,
              managedPaperQuality:
                replacementResearchFocusManagedReturn?.quality ?? null,
              managedPaperExecutionGuardRejections:
                replacementResearchFocusManagedReturn?.executionGuardRejections ?? null,
            },
            requiredEvidenceBeforeLive: replacementResearchFocus.liveReasons,
            verificationCommand: replacementResearchFocusManagedDiscarded
              ? "npm run dry-run:gate-live-goal-ready"
              : replacementVerificationCommand(replacementResearchFocus.candidate?.market),
          },
        ]),
    ...(crossExchange === null
      ? []
      : [
          {
            priority: 3,
            track: "cross_exchange_relative_value",
            action: crossExchangeLiveReady ? "review_for_gated_live_start" : "reject_or_remeasure",
            currentEvidence: {
              estimatedNetPnlKrw: crossExchangeEstimatedPnlKrw,
              medianNetEdgeBps: crossExchange.candidate?.medianNetEdgeBps ?? null,
              positiveRate: crossExchange.candidate?.positiveRate ?? null,
              usableForLivePromotion: crossExchangeLiveReady,
            },
            requiredEvidenceBeforeLive: crossExchange.blockers ?? [],
            verificationCommand: "npm run dry-run:gate-live-goal-ready",
          },
        ]),
    ...(spotPerpCarry === null
      ? []
      : [
          {
            priority: 4,
            track: "spot_perp_carry",
            action: spotPerpCarryPromotionEligible
              ? "remeasure_with_live_readiness_audit"
              : carryObservationStillCollecting
                ? "continue_72h_observation_not_live"
                : "reject_or_remeasure",
            currentEvidence: {
              estimatedNetPnlKrw: carryEstimatedPnlKrw,
              medianNetCarryBps: carryMedianNetCarryBps,
              positiveRate: carryPositiveRate,
              completedFundingCount: spotPerpCarry.summary?.completedFundingCount ?? null,
              usableForLivePromotion: false,
            },
            requiredEvidenceBeforeLive: spotPerpCarry.blockers ?? [],
            verificationCommand: "npm run dry-run:gate-live-goal-ready",
          },
        ]),
  ].sort((left, right) => left.priority - right.priority);

  const report = {
    generatedAt: new Date().toISOString(),
    objective:
      "Find a profitable KRW-market strategy candidate and keep live startup blocked until evidence is live-ready.",
    status: liveReady ? "live_ready" : "blocked",
    liveReady,
    selectedCandidate,
    selectedCandidateScope,
    selectedCandidateUsableForLivePromotion,
    selectedCandidateInterpretation,
    selectedLiveCandidate,
    selectedResearchFocus,
    selectedMetricCandidate,
    selectedMetricCandidates,
    feeStressMetricCandidates,
    liveStartupAllowed,
    recommendedAction,
    profitabilityEvidence,
    livePromotionRoadmap,
    liveStartupPlan,
    strategyLifecycleDecision,
    switchPlan,
    lossPersistenceGuard,
    processControlPlan,
    completionAudit,
    strategyDecision,
    nextActionPlan,
    profitabilitySnapshot: {
      interpretation:
        "Only realized positive paper exit PnL may support live promotion; open marks and public-data estimates are monitoring signals, not live evidence.",
      leadingPaperMark:
        min75OpenPositionPnlKrw === null
          ? null
          : {
              strategy: "btc_240m_momentum_min75",
              status: min75.openPosition?.holdElapsed === true ? "hold_elapsed" : "open_hold",
              estimatedExitNetPnlKrw: min75OpenPositionPnlKrw,
              estimatedExitReturnPct: min75OpenPositionReturnPct,
              holdExitDueAt: min75.openPosition?.holdExitDueAt ?? null,
              usableForLivePromotion: false,
              requiredBeforeLive: liveReasons,
            },
      replacementFocusMark:
        replacementResearchFocus === null
          ? null
          : {
              strategy: "replacement_time_series",
              market: replacementResearchFocus.candidate?.market ?? null,
              classification: replacementResearchFocus.classification,
              paperReady: replacementResearchFocus.paperReady,
              liveReady: replacementResearchFocus.liveReady,
              estimatedExitNetPnlKrw: replacementResearchFocusOpenPositionPnlKrw,
              estimatedExitReturnPct: replacementResearchFocusOpenPositionReturnPct,
              usableForLivePromotion: replacementResearchFocus.liveReady,
            },
      replacementManagedPaper:
        replacementResearchFocusManagedReturn === null
          ? null
          : {
              market: replacementResearchFocus?.candidate?.market ?? null,
              sessionCount: replacementResearchFocusManagedReturn.sessionCount,
              tradedSessionCount: replacementResearchFocusManagedReturn.tradedSessionCount,
              totalPnlKrw: replacementResearchFocusManagedReturn.totalPnlKrw,
              avgReturnPct: replacementResearchFocusManagedReturn.avgReturnPct,
              tradedPnlKrw: replacementResearchFocusManagedReturn.tradedPnlKrw,
              closedTradeCount: replacementResearchFocusManagedReturn.closedTradeCount,
              closedTradePnlKrw: replacementResearchFocusManagedReturn.closedTradePnlKrw,
              cycleCompleted:
                replacementResearchFocusManagedReturn.cycleSummary?.completed ?? null,
              cycleFailed:
                replacementResearchFocusManagedReturn.cycleSummary?.failed ?? null,
              quality: replacementResearchFocusManagedReturn.quality,
              executionGuardRejections:
                replacementResearchFocusManagedReturn.executionGuardRejections,
              classification: replacementResearchFocusManagedReturn.classification,
              usableForLivePromotion: false,
              interpretation:
                "Managed paper evidence is monitoring-only until it includes positive realized closed-trade PnL and all replacement readiness gates pass.",
            },
      leadingManagedPaper:
        leadingActiveManagedPaperReturn === null
          ? null
          : {
              market: leadingActiveManagedPaperReturn.market,
              classification: leadingActiveManagedPaperReturn.classification,
              sessionCount: leadingActiveManagedPaperReturn.sessionCount,
              tradedSessionCount: leadingActiveManagedPaperReturn.tradedSessionCount,
              filledSessionCount: leadingActiveManagedPaperReturn.filledSessionCount,
              openMarkSessionCount: leadingActiveManagedPaperReturn.openMarkSessionCount,
              totalPnlKrw: leadingActiveManagedPaperReturn.totalPnlKrw,
              tradedPnlKrw: leadingActiveManagedPaperReturn.tradedPnlKrw,
              closedTradeCount: leadingActiveManagedPaperReturn.closedTradeCount,
              closedTradePnlKrw: leadingActiveManagedPaperReturn.closedTradePnlKrw,
              latestReturnPct: leadingActiveManagedPaperReturn.latestSession?.returnPct ?? null,
              latestMarkedPnlKrw:
                leadingActiveManagedPaperReturn.latestSession?.markedPnlKrw ?? null,
              openPositionCount:
                leadingActiveManagedPaperReturn.latestSession?.openPositionCount ?? null,
              cycleCompleted:
                leadingActiveManagedPaperReturn.cycleSummary?.completed ?? null,
              cycleFailed:
                leadingActiveManagedPaperReturn.cycleSummary?.failed ?? null,
              quality: leadingActiveManagedPaperReturn.quality,
              executionGuardRejections:
                leadingActiveManagedPaperReturn.executionGuardRejections,
              usableForLivePromotion: false,
              interpretation:
                "Managed-paper marks are not live evidence until closed realized PnL, no-open-position, and cycle-health gates pass.",
            },
      derivativesRegimeResearch:
        derivativesGatedSummaries.length === 0
          ? null
          : {
              promotionCandidateCount: derivativesGatedPromotionCandidateCount,
              diagnosticImprovementCount: derivativesGatedDiagnosticImprovementCount,
              bestDiagnosticCandidate:
                strongestDerivativesGatedCandidate?.candidate ?? null,
              usableForLivePromotion: false,
              interpretation:
                "Derivatives-regime gating is diagnostic research only until train/test, walk-forward, span, execution, and realized paper-exit gates all pass.",
            },
      rejectedEvidence: {
        legacy: {
          tradedPnlKrw: legacyTradedPnlKrw,
          closedTradePnlKrw: legacyClosedTradePnlKrw,
          usableForLivePromotion: false,
        },
        crossExchange:
          crossExchange === null
            ? null
            : {
                estimatedNetPnlKrw: crossExchangeEstimatedPnlKrw,
                medianNetEdgeBps: crossExchange.candidate?.medianNetEdgeBps ?? null,
                positiveRate: crossExchange.candidate?.positiveRate ?? null,
                usableForLivePromotion: crossExchangeLiveReady,
              },
        spotPerpCarry:
          spotPerpCarry === null
            ? null
            : {
                estimatedNetPnlKrw: carryEstimatedPnlKrw,
                medianNetCarryBps: carryMedianNetCarryBps,
                positiveRate: carryPositiveRate,
                completedFundingCount: spotPerpCarry.summary?.completedFundingCount ?? null,
                usableForLivePromotion: false,
              },
      },
    },
    inputs: {
      min75ReadinessPath: args.min75ReadinessPath,
      legacyAuditPath: args.legacyAuditPath,
      dataCoveragePath: args.dataCoveragePath,
      crossExchangeReadinessPath: args.crossExchangeReadinessPath,
      spotPerpCarryReportPath: args.spotPerpCarryReportPath,
      spotPerpCarryWatchReportPaths: args.spotPerpCarryWatchReportPaths,
      spotPerpCarryFeeStressReportPaths: args.spotPerpCarryFeeStressReportPaths,
      spotPerpCarryLiveReadinessPath: args.spotPerpCarryLiveReadinessPaths[0] ?? null,
      spotPerpCarryLiveReadinessPaths: args.spotPerpCarryLiveReadinessPaths,
      replacementReadinessPaths: args.replacementReadinessPaths,
      replacementLivePathReadinessPaths: args.replacementLivePathReadinessPaths,
      replacementManagedReturnSummaryPaths: args.replacementManagedReturnSummaryPaths,
      replacementScanPaths: args.replacementScanPaths,
      derivativesGatedReportPaths: args.derivativesGatedReportPaths,
    },
    checklist,
    blockers,
    min75: {
      generatedAt: min75.generatedAt ?? null,
      classification: min75.strategyAssessment?.classification ?? null,
      liveReady: min75LiveReady,
      liveReasons,
      candidate: min75.candidate ?? null,
      benchmarkSummary: min75.benchmarkSummary ?? null,
      stressBenchmarkSummary: min75.stressBenchmarkSummary ?? null,
      openPosition: min75.openPosition ?? null,
    },
    crossExchange:
      crossExchange === null
        ? null
        : {
            generatedAt: crossExchange.generatedAt ?? null,
            liveReady: crossExchange.liveReady === true,
            readinessFresh: crossExchangeReadinessFresh,
            candidateEvidenceReady: crossExchangeCandidateEvidenceReady,
            strategyEvidenceReady: crossExchangeStrategyEvidenceReady,
            blockers: crossExchange.blockers ?? [],
            checklist: crossExchange.checklist ?? {},
            operationalProofSummary: crossExchange.operationalProofSummary ?? null,
            candidate: crossExchange.candidate ?? null,
            interpretation: crossExchange.interpretation ?? null,
          },
    legacy: {
      generatedAt: legacy.generatedAt ?? null,
      liveDecision: legacy.recommendation?.decisionSummary?.live ?? null,
      paperDecision: legacy.recommendation?.decisionSummary?.paper ?? null,
      liveReadyLabels: legacyLiveReadyLabels,
      nextPaperCandidate: legacyNextPaperCandidate,
      primaryBlockers: legacy.recommendation?.decisionSummary?.primaryBlockers ?? [],
      negativeTradedPnlLabels:
        legacy.recommendation?.blockerSummary?.negativeTradedPnlLabels ?? [],
      negativeClosedPnlLabels:
        legacy.recommendation?.blockerSummary?.negativeClosedPnlLabels ?? [],
      candidates:
        legacy.candidates?.map((candidate) => ({
          label: candidate.label ?? null,
          liveReady: candidate.liveReady === true,
          tradedPnlKrw: candidate.tradedPnlKrw ?? null,
          closedTradePnlKrw: candidate.closedTradePnlKrw ?? null,
        })) ?? [],
    },
    replacementResearch: {
      scanCount: replacementScanSummaries.length,
      noPromotionCandidates: replacementScansHaveNoPromotionCandidates,
      latestScanHasNoPromotionCandidate: latestReplacementScanHasNoPromotionCandidate,
      supersededPromotionCandidateCount,
      latestScan: latestReplacementScan,
      nextCandidate: nextReplacementCandidate,
      strongestPromotionCandidate,
      strongestLiveCompatiblePromotionCandidate,
      readinessReports: replacementReadinessSummaries,
      livePathReports: replacementLivePathSummaries,
      managedReturnReports: replacementManagedReturnSummaries,
      leadingActiveManagedPaperReturn,
      liveCandidate: replacementLiveCandidate,
      researchFocus: replacementResearchFocus,
      scans: replacementScanSummaries,
    },
    derivativesRegimeResearch:
      derivativesGatedSummaries.length === 0
        ? null
        : {
            reportCount: derivativesGatedSummaries.length,
            promotionCandidateCount: derivativesGatedPromotionCandidateCount,
            diagnosticImprovementCount: derivativesGatedDiagnosticImprovementCount,
            hasPromotionCandidate: derivativesGatedHasPromotionCandidate,
            bestDiagnosticCandidate:
              strongestDerivativesGatedCandidate?.candidate ?? null,
            reports: derivativesGatedSummaries,
            interpretation:
              derivativesGatedHasPromotionCandidate
                ? "Research candidate only; live still requires forward execution and paper PnL gates."
                : derivativesGatedDiagnosticImprovementCount > 0
                  ? "Some filters improved a baseline window, but not enough for promotion or live startup."
                  : "No useful derivatives-regime improvement in the supplied reports.",
          },
    carryResearch:
      spotPerpCarry === null
        ? null
        : {
            generatedAt: spotPerpCarry.generatedAt ?? null,
            status: spotPerpCarry.status ?? null,
            fresh: spotPerpCarryFresh,
            promotionEligible: spotPerpCarryPromotionEligible,
            blockers: spotPerpCarry.blockers ?? [],
            checklist: spotPerpCarry.checklist ?? {},
            measurementScope: spotPerpCarry.measurementScope ?? null,
            summary: spotPerpCarry.summary ?? null,
            topCarry: (spotPerpCarry.topCarry ?? []).slice(0, 10),
            topExecutableCarry: (
              spotPerpCarry.topExecutableCarry ??
              spotPerpCarry.topCarry ??
              []
            ).slice(0, 10),
            executableEvidence: {
              estimatedNetPnlKrw: carryEstimatedPnlKrw,
              medianNetCarryBps: carryMedianNetCarryBps,
              positiveRate: carryPositiveRate,
              completedFundingCount: spotPerpCarry.summary?.completedFundingCount ?? null,
              observationCount: spotPerpCarry.summary?.count ?? null,
            },
            currentEntrySanity: spotPerpCarryCurrentEntrySanity,
            focusRecompare: spotPerpCarryFocusRecompare,
            interpretation:
              spotPerpCarryPromotionEligible
                ? "Research promotion candidate only; a separate live readiness audit and operational proof are still required."
                : "Not a live candidate; keep blocked unless repeated completed funding windows clear the carry gate.",
          },
    carryStrategyComparison,
    spotPerpCarryCandidateRoles,
    spotPerpCarryResearchFocusDecision,
    spotPerpCarryPairedMarketComparison,
    spotPerpCarryCurrentEntrySanity,
    spotPerpCarryFocusRecompare,
    spotPerpCarryFeeStressDecision,
    spotPerpCarryFeeStressReports: spotPerpCarryFeeStressSummaries,
    feeStressDemotedMarkets,
    carryArtifactWarnings,
    carryWatchlist: spotPerpCarryWatchlist,
    carryMarketDecisionMatrix,
    carryLiveReadiness:
      primarySpotPerpCarryLiveReadiness === null
        ? null
        : primarySpotPerpCarryLiveReadiness,
    carryOperationalReadiness,
    carryLiveReadinessReports,
    dataCoverage:
      dataCoverage === null
        ? null
        : {
            generatedAt: dataCoverage.generatedAt ?? null,
            status: dataCoverage.status ?? null,
            fresh: dataCoverage.fresh === true,
            blockers: dataCoverage.blockers ?? [],
          },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(
    args.quiet
      ? `${JSON.stringify(
          {
            generatedAt: report.generatedAt,
            status: report.status,
            liveReady: report.liveReady,
            selectedCandidate: report.selectedCandidate,
            selectedCandidateScope: report.selectedCandidateScope,
            selectedCandidateUsableForLivePromotion:
              report.selectedCandidateUsableForLivePromotion,
            selectedCandidateInterpretation: report.selectedCandidateInterpretation,
            selectedLiveCandidate: report.selectedLiveCandidate,
            selectedResearchFocus: report.selectedResearchFocus,
            recommendedAction: report.recommendedAction,
            livePromotionRoadmap: report.livePromotionRoadmap,
            liveStartupPlan: report.liveStartupPlan,
            spotPerpCarryFeeStressDecision: report.spotPerpCarryFeeStressDecision,
            feeStressDemotedMarkets: report.feeStressDemotedMarkets,
            strategyLifecycleDecision: {
              selectedLiveCandidate: report.strategyLifecycleDecision.selectedLiveCandidate,
              selectedResearchFocus: report.strategyLifecycleDecision.selectedResearchFocus,
              liveStartupAllowed: report.strategyLifecycleDecision.liveStartupAllowed,
              decisions: report.strategyLifecycleDecision.decisions,
            },
            switchPlan: report.switchPlan,
            lossPersistenceGuard: report.lossPersistenceGuard,
            completionAudit: {
              achieved: report.completionAudit.achieved,
              missingRequirementsCount: report.completionAudit.missingRequirements.length,
            },
            carryLiveReadiness:
              report.carryLiveReadiness === null
                ? null
                : {
                    generatedAt: report.carryLiveReadiness.generatedAt,
                    status: report.carryLiveReadiness.status,
                    liveReady: report.carryLiveReadiness.liveReady,
                    checks: report.carryLiveReadiness.checks,
                    readinessGap: report.carryLiveReadiness.readinessGap,
                    readinessTimeline: report.carryLiveReadiness.readinessTimeline,
                  },
            carryOperationalReadiness: report.carryOperationalReadiness,
          },
          null,
          2,
        )}\n`
      : output,
  );

  if (args.requireLiveReady && !liveReady) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
