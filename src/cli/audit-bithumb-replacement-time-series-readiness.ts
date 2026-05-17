import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  scanPath: string | null;
  observationPath: string | null;
  paperObservationPath: string | null;
  positionAuditPath: string | null;
  outputPath: string | null;
  requirePaperReady: boolean;
  requireLiveReady: boolean;
  liveExecutionPathReady: boolean;
}

interface ScanReport {
  generatedAt?: string;
  assumptions?: {
    market?: string;
    unitMinutes?: number;
    signalMode?: string;
    feeRoundTripBps?: number;
  };
  promotionCandidateCount?: number;
  promotionCandidates?: ReplacementCandidate[];
}

interface ReplacementCandidate {
  market?: string;
  lookbackBars?: number;
  holdBars?: number;
  minReturnBps?: number;
  minDropBps?: number;
  riskFilter?: string;
  riskThreshold?: number | null;
  train?: SummaryStats;
  test?: SummaryStats;
  walkForward?: {
    positiveTotalFoldCount?: number;
    positiveMedianFoldCount?: number;
    minFoldPnlKrw?: number | null;
  };
}

interface SummaryStats {
  count?: number;
  totalPnlKrw?: number;
  medianPnlKrw?: number | null;
  returnPct?: number;
}

interface ObservationReport {
  generatedAt?: string;
  candidate?: {
    market?: string;
    signalMode?: string;
    unitMinutes?: number;
    lookbackBars?: number;
    holdBars?: number;
    minReturnBps?: number;
    minDropBps?: number;
    riskFilter?: string;
    riskThreshold?: number | null;
  };
  signal?: {
    active?: boolean;
    directionalSignalPass?: boolean;
    riskPass?: boolean;
  };
  orderbook?: {
    spreadBps?: number | null;
    executableRoundTripCostBps?: number | null;
    executableCostVsExpectedEdgeBps?: number | null;
    buyDepth?: { coversRequestedNotional?: boolean };
    sellDepth?: { coversRequestedNotional?: boolean };
  };
  executionPolicy?: {
    maxSpreadBps?: number;
    min24hNotionalKrw?: number;
  };
  ticker?: {
    accTradePrice24h?: number | null;
  };
  freshness?: {
    tickerFresh?: boolean;
    latestCandleRecent?: boolean;
    snapshotSkewControlled?: boolean;
  };
  decision?: {
    executionViability?: string;
    reasons?: string[];
  };
}

const DEFAULT_LIVE_RISK_MAX_SPREAD_BPS = 8;
const DEFAULT_LIVE_RISK_MIN_24H_NOTIONAL_KRW = 30_000_000_000;

interface PaperObservationReport {
  generatedAt?: string;
  sourceObservationPath?: string;
  candidate?: {
    market?: string;
    signalMode?: string;
    unitMinutes?: number;
    lookbackBars?: number;
    holdBars?: number;
    minReturnBps?: number;
    minDropBps?: number;
    riskFilter?: string;
    riskThreshold?: number | null;
  };
  paper?: {
    attemptedSignal?: boolean;
    acceptedSignals?: number;
    rejectedSignalReasons?: Array<{
      code?: string;
      message?: string;
      detail?: unknown;
    }>;
    reconciliationOk?: boolean;
    openPositionCount?: number;
  };
  skippedReasons?: string[];
}

interface PositionAuditReport {
  timing?: {
    holdElapsed?: boolean;
    holdExitDueAt?: string;
  };
  mark?: {
    estimatedExitNetPnlKrw?: number;
    estimatedExitReturnPct?: number | null;
  };
  exit?: {
    attempted?: boolean;
    reusePolicy?: string;
    exitObservationGeneratedAt?: string;
    reason?: string;
    reconciliationOk?: boolean;
    openPositionCount?: number;
    realizedExitNetPnlKrw?: number | null;
  };
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    scanPath: null,
    observationPath: null,
    paperObservationPath: null,
    positionAuditPath: null,
    outputPath: null,
    requirePaperReady: false,
    requireLiveReady: false,
    liveExecutionPathReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--scan") {
      if (!value) throw new Error("--scan requires a value");
      args.scanPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--observation") {
      if (!value) throw new Error("--observation requires a value");
      args.observationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--paper-observation") {
      if (!value) throw new Error("--paper-observation requires a value");
      args.paperObservationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--position-audit") {
      if (!value) throw new Error("--position-audit requires a value");
      args.positionAuditPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--require-paper-ready") {
      args.requirePaperReady = true;
      continue;
    }
    if (arg === "--require-live-ready") {
      args.requireLiveReady = true;
      continue;
    }
    if (arg === "--live-execution-path-ready") {
      args.liveExecutionPathReady = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  const missing = [
    ["--scan", args.scanPath],
    ["--observation", args.observationPath],
    ["--paper-observation", args.paperObservationPath],
  ].filter(([, value]) => value === null);
  if (missing.length > 0) {
    throw new Error(`missing required arguments: ${missing.map(([label]) => label).join(", ")}`);
  }
  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function failedChecks(checks: Record<string, boolean>): string[] {
  return Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
}

function sameNumber(left: number | null | undefined, right: number | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function timestampMs(iso: string | undefined): number | null {
  if (typeof iso !== "string") return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourcePathMatches(sourcePath: string | undefined, expectedPath: string): boolean {
  if (typeof sourcePath !== "string") return false;
  return resolve(sourcePath) === expectedPath;
}

function paperCandidateMatchesObservation(
  paper: PaperObservationReport,
  observation: ObservationReport,
): boolean {
  if (paper.candidate === undefined || observation.candidate === undefined) return false;
  return (
    paper.candidate.market === observation.candidate.market &&
    paper.candidate.signalMode === observation.candidate.signalMode &&
    paper.candidate.unitMinutes === observation.candidate.unitMinutes &&
    paper.candidate.lookbackBars === observation.candidate.lookbackBars &&
    paper.candidate.holdBars === observation.candidate.holdBars &&
    sameNumber(paper.candidate.minReturnBps, observation.candidate.minReturnBps) &&
    sameNumber(paper.candidate.minDropBps, observation.candidate.minDropBps) &&
    paper.candidate.riskFilter === observation.candidate.riskFilter &&
    sameNumber(paper.candidate.riskThreshold, observation.candidate.riskThreshold)
  );
}

function findCandidate(scan: ScanReport, observation: ObservationReport): ReplacementCandidate | null {
  const candidates = scan.promotionCandidates ?? [];
  const observed = observation.candidate;
  if (observed === undefined) return candidates[0] ?? null;
  return (
    candidates.find(
      (candidate) =>
        candidateMarketMatches(scan, candidate, observed.market) &&
        candidate.lookbackBars === observed.lookbackBars &&
        candidate.holdBars === observed.holdBars &&
        sameNumber(candidate.minReturnBps, observed.minReturnBps) &&
        candidate.riskFilter === observed.riskFilter,
    ) ??
    candidates[0] ??
    null
  );
}

function candidateMarketMatches(
  scan: ScanReport,
  candidate: ReplacementCandidate,
  observedMarket: string | undefined,
): boolean {
  if (observedMarket === undefined) return false;
  return candidate.market === observedMarket || (candidate.market === undefined && scan.assumptions?.market === observedMarket);
}

function classify(historicalReady: boolean, paperReady: boolean, liveReady: boolean): string {
  if (liveReady) return "live_candidate";
  if (paperReady) return "paper_candidate";
  if (historicalReady) return "research_candidate";
  return "discard_candidate";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const [scan, observation, paperObservation, positionAudit] = await Promise.all([
    readJson<ScanReport>(args.scanPath!),
    readJson<ObservationReport>(args.observationPath!),
    readJson<PaperObservationReport>(args.paperObservationPath!),
    args.positionAuditPath === null
      ? Promise.resolve(null)
      : readJson<PositionAuditReport>(args.positionAuditPath),
  ]);

  const candidate = findCandidate(scan, observation);
  const scanGeneratedAtMs = timestampMs(scan.generatedAt);
  const observationGeneratedAtMs = timestampMs(observation.generatedAt);
  const paperGeneratedAtMs = timestampMs(paperObservation.generatedAt);
  const historicalArtifactChecks = {
    scanGeneratedAtValid: scanGeneratedAtMs !== null,
    observationGeneratedAtValid: observationGeneratedAtMs !== null,
  };
  const paperArtifactChecks = {
    paperObservationGeneratedAtValid: paperGeneratedAtMs !== null,
    paperObservationAfterObservation:
      observationGeneratedAtMs !== null &&
      paperGeneratedAtMs !== null &&
      paperGeneratedAtMs >= observationGeneratedAtMs,
    paperObservationSourceMatches:
      args.observationPath !== null &&
      sourcePathMatches(paperObservation.sourceObservationPath, args.observationPath),
    paperCandidateMatchesObservation: paperCandidateMatchesObservation(
      paperObservation,
      observation,
    ),
  };
  const trainCount = candidate?.train?.count ?? 0;
  const testCount = candidate?.test?.count ?? 0;
  const trainMedian = finite(candidate?.train?.medianPnlKrw);
  const testMedian = finite(candidate?.test?.medianPnlKrw);
  const trainTotal = finite(candidate?.train?.totalPnlKrw);
  const testTotal = finite(candidate?.test?.totalPnlKrw);
  const minFoldPnl = finite(candidate?.walkForward?.minFoldPnlKrw);
  const feeRoundTripBps = finite(scan.assumptions?.feeRoundTripBps);
  const historicalChecks = {
    ...historicalArtifactChecks,
    scanHasPromotionCandidate: (scan.promotionCandidateCount ?? 0) > 0 && candidate !== null,
    feeAtLeast20Bps: feeRoundTripBps !== null && feeRoundTripBps >= 20,
    candidateMatchesObservation:
      observation.candidate !== undefined &&
      candidate !== null &&
      candidateMarketMatches(scan, candidate, observation.candidate?.market) &&
      candidate.lookbackBars === observation.candidate?.lookbackBars &&
      candidate.holdBars === observation.candidate?.holdBars &&
      sameNumber(candidate.minReturnBps, observation.candidate?.minReturnBps) &&
      candidate.riskFilter === observation.candidate?.riskFilter,
    minimumHistoricalTrades: trainCount >= 30 && testCount >= 15 && trainCount + testCount >= 60,
    positiveTrainMedianPnl: trainMedian !== null && trainMedian > 0,
    positiveTestMedianPnl: testMedian !== null && testMedian > 0,
    positiveTrainAndTestTotalPnl:
      trainTotal !== null && trainTotal > 0 && testTotal !== null && testTotal > 0,
    walkForwardTotalPasses: (candidate?.walkForward?.positiveTotalFoldCount ?? 0) >= 4,
    walkForwardMedianPasses: (candidate?.walkForward?.positiveMedianFoldCount ?? 0) >= 4,
    walkForwardMinFoldNonNegative: minFoldPnl !== null && minFoldPnl >= 0,
  };

  const observationReasons = observation.decision?.reasons ?? [];
  const maxSpreadBps =
    finite(observation.executionPolicy?.maxSpreadBps) ?? DEFAULT_LIVE_RISK_MAX_SPREAD_BPS;
  const min24hNotionalKrw =
    finite(observation.executionPolicy?.min24hNotionalKrw) ?? DEFAULT_LIVE_RISK_MIN_24H_NOTIONAL_KRW;
  const observedSpreadBps = finite(observation.orderbook?.spreadBps);
  const observed24hNotional = finite(observation.ticker?.accTradePrice24h);
  const observationChecks = {
    signalActive: bool(observation.signal?.active),
    directionalSignalPass: bool(observation.signal?.directionalSignalPass),
    riskPass: bool(observation.signal?.riskPass),
    executionViabilityWatchCandidate:
      observation.decision?.executionViability === "watch_candidate",
    spreadMeasured: finite(observation.orderbook?.spreadBps) !== null,
    spreadWithinLiveRiskPolicy:
      observedSpreadBps !== null && observedSpreadBps <= maxSpreadBps,
    rolling24hNotionalWithinLiveRiskPolicy:
      observed24hNotional !== null && observed24hNotional >= min24hNotionalKrw,
    executableCostMeasured:
      finite(observation.orderbook?.executableRoundTripCostBps) !== null,
    executableCostWithinExpectedEdge:
      finite(observation.orderbook?.executableCostVsExpectedEdgeBps) !== null &&
      (observation.orderbook?.executableCostVsExpectedEdgeBps ?? Number.POSITIVE_INFINITY) <= 0,
    tickerFresh: bool(observation.freshness?.tickerFresh),
    latestCandleRecent: bool(observation.freshness?.latestCandleRecent),
    snapshotSkewControlled: bool(observation.freshness?.snapshotSkewControlled),
    buyDepthCoversNotional: bool(observation.orderbook?.buyDepth?.coversRequestedNotional),
    sellDepthCoversNotional: bool(observation.orderbook?.sellDepth?.coversRequestedNotional),
    noObservationReasons: observationReasons.length === 0,
  };

  const paperChecks = {
    paperSignalAttempted: bool(paperObservation.paper?.attemptedSignal),
    paperSignalAccepted: (paperObservation.paper?.acceptedSignals ?? 0) > 0,
    paperEntryReconciliationOk: bool(paperObservation.paper?.reconciliationOk),
    paperEntryCreatedOpenPosition: (paperObservation.paper?.openPositionCount ?? 0) > 0,
  };

  const realizedExitNetPnl = finite(positionAudit?.exit?.realizedExitNetPnlKrw);
  const realizedExitPolicyOk =
    positionAudit?.exit?.reusePolicy === "first_reduce_only_exit_for_entry_signal" &&
    typeof positionAudit.exit.exitObservationGeneratedAt === "string" &&
    !Number.isNaN(Date.parse(positionAudit.exit.exitObservationGeneratedAt));
  const positionChecks = {
    positionAuditAvailable: positionAudit !== null,
    holdExitTimeKnown:
      typeof positionAudit?.timing?.holdExitDueAt === "string" &&
      !Number.isNaN(Date.parse(positionAudit.timing.holdExitDueAt)),
    prematureExitBlocked:
      positionAudit?.timing?.holdElapsed === false
        ? positionAudit.exit?.attempted === false &&
          positionAudit.exit?.reason === "hold_window_not_elapsed"
        : true,
    realizedExitAvailable:
      positionAudit?.exit?.attempted === true &&
      realizedExitPolicyOk &&
      positionAudit.exit.reconciliationOk === true &&
      positionAudit.exit.openPositionCount === 0,
    realizedExitReusePolicy: realizedExitPolicyOk,
    positiveRealizedPaperExitPnl:
      positionAudit?.exit?.attempted === true &&
      realizedExitPolicyOk &&
      realizedExitNetPnl !== null &&
      realizedExitNetPnl > 0,
  };

  const historicalReady = Object.values(historicalChecks).every(Boolean);
  const reportedRiskFilter = candidate?.riskFilter ?? observation.candidate?.riskFilter ?? null;
  const paperReady =
    historicalReady &&
    Object.values(paperArtifactChecks).every(Boolean) &&
    Object.values(observationChecks).every(Boolean) &&
    Object.values(paperChecks).every(Boolean) &&
    positionChecks.holdExitTimeKnown &&
    positionChecks.prematureExitBlocked;
  const liveChecks = {
    ...historicalChecks,
    ...paperArtifactChecks,
    ...observationChecks,
    ...paperChecks,
    holdExitTimeKnown: positionChecks.holdExitTimeKnown,
    realizedExitAvailable: positionChecks.realizedExitAvailable,
    realizedExitReusePolicy: positionChecks.realizedExitReusePolicy,
    noOpenPaperPositionAfterExit: positionChecks.realizedExitAvailable,
    positiveRealizedPaperExitPnl: positionChecks.positiveRealizedPaperExitPnl,
    liveExecutionPathReady: args.liveExecutionPathReady,
  };
  const liveReady = Object.values(liveChecks).every(Boolean);
  const classification = classify(historicalReady, paperReady, liveReady);
  const paperFailed = [
    ...failedChecks(historicalChecks),
    ...failedChecks(paperArtifactChecks),
    ...failedChecks(observationChecks),
    ...failedChecks(paperChecks),
    ...failedChecks({
      holdExitTimeKnown: positionChecks.holdExitTimeKnown,
      prematureExitBlocked: positionChecks.prematureExitBlocked,
    }),
  ];
  const liveFailed = failedChecks(liveChecks);

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Readiness gate for a KRW-market replacement time-series candidate. This is not a live runner; it converts scan, observation, paper entry, and optional paper exit evidence into a goal-status-readable readiness artifact.",
    inputs: {
      scanPath: args.scanPath,
      observationPath: args.observationPath,
      paperObservationPath: args.paperObservationPath,
      positionAuditPath: args.positionAuditPath,
    },
    strategyAssessment: { classification },
    candidate: {
      market: candidate?.market ?? observation.candidate?.market ?? null,
      signalMode: scan.assumptions?.signalMode ?? observation.candidate?.signalMode ?? null,
      unitMinutes: scan.assumptions?.unitMinutes ?? observation.candidate?.unitMinutes ?? null,
      lookbackBars: candidate?.lookbackBars ?? observation.candidate?.lookbackBars ?? null,
      holdBars: candidate?.holdBars ?? observation.candidate?.holdBars ?? null,
      minReturnBps: candidate?.minReturnBps ?? observation.candidate?.minReturnBps ?? null,
      minDropBps: candidate?.minDropBps ?? observation.candidate?.minDropBps ?? null,
      riskFilter: reportedRiskFilter,
      riskThreshold:
        reportedRiskFilter === "none"
          ? null
          : candidate?.riskThreshold ?? observation.candidate?.riskThreshold ?? null,
    },
    benchmarkSummary: {
      tradeCount: trainCount + testCount,
      strategyReturnPct:
        (candidate?.train?.returnPct ?? 0) + (candidate?.test?.returnPct ?? 0),
      comparisonBasis:
        "historical train/test candidate returns only; buy-and-hold comparison is not measured by this replacement readiness audit",
      buyHoldReturnPct: null,
      excessReturnVsBuyHoldPct: null,
      trainReturnPct: candidate?.train?.returnPct ?? null,
      testReturnPct: candidate?.test?.returnPct ?? null,
      maxDrawdownPct: null,
      feeRoundTripBps: scan.assumptions?.feeRoundTripBps ?? null,
      train: candidate?.train ?? null,
      test: candidate?.test ?? null,
      walkForward: candidate?.walkForward ?? null,
    },
    paperReadiness: {
      ready: paperReady,
      checks: {
        ...historicalChecks,
        ...paperArtifactChecks,
        ...observationChecks,
        ...paperChecks,
        holdExitTimeKnown: positionChecks.holdExitTimeKnown,
        prematureExitBlocked: positionChecks.prematureExitBlocked,
      },
      reasons: paperFailed,
    },
    paperExecution: {
      skippedReasons: paperObservation.skippedReasons ?? [],
      rejectedSignalReasons: paperObservation.paper?.rejectedSignalReasons ?? [],
    },
    liveReadiness: {
      ready: liveReady,
      paperOnlyRecommended: !liveReady,
      checks: liveChecks,
      reasons: liveFailed,
    },
    openPosition: {
      holdElapsed: positionAudit?.timing?.holdElapsed ?? null,
      holdExitDueAt: positionAudit?.timing?.holdExitDueAt ?? null,
      estimatedExitNetPnlKrw: positionAudit?.mark?.estimatedExitNetPnlKrw ?? null,
      estimatedExitReturnPct: positionAudit?.mark?.estimatedExitReturnPct ?? null,
    },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);

  if (args.requireLiveReady && !liveReady) {
    process.exitCode = 1;
  } else if (args.requirePaperReady && !paperReady) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
