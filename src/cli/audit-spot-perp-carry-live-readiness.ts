import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  carryReportPath: string | null;
  feeStressReportPaths: string[];
  operationalProofPath: string | null;
  codebaseRoot: string;
  outputPath: string | null;
  requireLiveReady: boolean;
  maxReportAgeHours: number;
  maxProofAgeHours: number;
  quiet: boolean;
}

interface SpotPerpCarryReport {
  generatedAt?: string;
  status?: string;
  promotionEligible?: boolean;
  blockers?: string[];
  observationCount?: number;
  observationSpanMinutes?: number | null;
  assumptions?: {
    minObservations?: number;
    minCompletedFundingEvents?: number;
    minObservationSpanMinutes?: number;
    minNetCarryBps?: number;
    minPositiveCarryRate?: number;
    minDepthCoverageRate?: number;
    accountFeesConfirmed?: boolean;
    inventoryReady?: boolean;
    hedgeVenueReady?: boolean;
  };
  checklist?: Record<string, boolean>;
  summary?: {
    count?: number;
    completedFundingCount?: number;
    executionEligibleCount?: number;
    executionEligiblePositiveRate?: number | null;
    executionEligibleMedianNetCarryBps?: number | null;
    executionEligibleTotalEstimatedNetPnlKrw?: number;
    depthCoverageRate?: number | null;
  };
  fundingWindowSummary?: FundingWindowCarrySummary;
  perMarketSummary?: Array<{
    market?: string;
    symbol?: string;
    count?: number;
    completedFundingCount?: number;
    executionEligibleCount?: number;
    executionEligiblePositiveRate?: number | null;
    executionEligibleMedianNetCarryBps?: number | null;
    executionEligibleTotalEstimatedNetPnlKrw?: number;
    depthCoverageRate?: number | null;
    fundingWindowSummary?: FundingWindowCarrySummary;
    watchDecision?: {
      status?: string;
      reasons?: string[];
      requiredBeforeMetricCandidate?: string[];
    };
  }>;
}

interface FeeStressCarryReport {
  generatedAt?: string;
  summary?: {
    completedFundingCount?: number;
    executionEligibleMedianNetCarryBps?: number | null;
    executionEligiblePositiveRate?: number | null;
    depthCoverageRate?: number | null;
  };
  fundingWindowSummary?: FundingWindowCarrySummary;
  perMarketSummary?: Array<{
    market?: string;
    symbol?: string;
    completedFundingCount?: number;
    executionEligibleMedianNetCarryBps?: number | null;
    executionEligiblePositiveRate?: number | null;
    depthCoverageRate?: number | null;
    fundingWindowSummary?: FundingWindowCarrySummary;
  }>;
}

interface FundingWindowCarrySummary {
  completedFundingWindowCount?: number;
  positiveWindowRate?: number | null;
  medianWindowNetCarryBps?: number | null;
  windows?: Array<{
    fundingSettledAt?: string;
    medianNetCarryBps?: number | null;
  }>;
}

interface OperationalProof {
  generatedAt?: string;
  accountFeesConfirmed?: boolean;
  inventoryReady?: boolean;
  hedgeVenueReady?: boolean;
  approvedMarkets?: string[];
  reasons?: string[];
  requirements?: Record<string, unknown>;
  deficits?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

const FUNDING_EVENT_INTERVAL_MINUTES = 240;

interface ReadinessGap {
  observations: { current: number; required: number; remaining: number; passed: boolean };
  observationSpanMinutes: { current: number; required: number; remaining: number; passed: boolean };
  completedFundingEvents: { current: number; required: number; remaining: number; passed: boolean };
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    carryReportPath: null,
    feeStressReportPaths: [],
    operationalProofPath: null,
    codebaseRoot: cwd,
    outputPath: null,
    requireLiveReady: false,
    maxReportAgeHours: 1,
    maxProofAgeHours: 24,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--carry-report") {
      if (!value) throw new Error("--carry-report requires a value");
      args.carryReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--operational-proof") {
      if (!value) throw new Error("--operational-proof requires a value");
      args.operationalProofPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--fee-stress-report") {
      if (!value) throw new Error("--fee-stress-report requires a value");
      args.feeStressReportPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--codebase-root") {
      if (!value) throw new Error("--codebase-root requires a value");
      args.codebaseRoot = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--max-report-age-hours") {
      if (!value) throw new Error("--max-report-age-hours requires a value");
      args.maxReportAgeHours = positiveNumber(value, "--max-report-age-hours");
      index += 1;
      continue;
    }
    if (arg === "--max-proof-age-hours") {
      if (!value) throw new Error("--max-proof-age-hours requires a value");
      args.maxProofAgeHours = positiveNumber(value, "--max-proof-age-hours");
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

  if (args.carryReportPath === null) throw new Error("--carry-report is required");
  return args;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
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

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function ageHours(isoTimestamp: unknown): number | null {
  if (typeof isoTimestamp !== "string" || isoTimestamp.trim().length === 0) return null;
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return null;
  return (Date.now() - parsed) / 3_600_000;
}

function fresh(isoTimestamp: unknown, maxAgeHours: number): boolean {
  const age = ageHours(isoTimestamp);
  return age !== null && age >= -1 / 60 && age <= maxAgeHours;
}

function bool(value: unknown): boolean {
  return value === true;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function addMinutesIso(isoTimestamp: string, minutes: number): string | null {
  const timestamp = Date.parse(isoTimestamp);
  if (!Number.isFinite(timestamp) || !Number.isFinite(minutes)) return null;
  return new Date(timestamp + minutes * 60_000).toISOString();
}

function progressRatio(current: number, required: number): number {
  if (required <= 0) return 1;
  return rounded(Math.min(1, Math.max(0, current / required)));
}

function buildReadinessTimeline(
  generatedAt: string,
  readinessGap: ReadinessGap,
  observationCount: number,
  observationSpanMinutes: number,
): Record<string, unknown> {
  const observationCadenceMinutes =
    observationCount > 1 && observationSpanMinutes > 0
      ? observationSpanMinutes / (observationCount - 1)
      : null;
  const estimatedRemainingMinutesByGate = {
    observations:
      observationCadenceMinutes === null
        ? null
        : rounded(readinessGap.observations.remaining * observationCadenceMinutes),
    observationSpanMinutes: rounded(readinessGap.observationSpanMinutes.remaining),
    completedFundingEvents: rounded(
      readinessGap.completedFundingEvents.remaining * FUNDING_EVENT_INTERVAL_MINUTES,
    ),
  };
  const candidates = [
    { gate: "observations", minutes: estimatedRemainingMinutesByGate.observations },
    {
      gate: "observationSpanMinutes",
      minutes: estimatedRemainingMinutesByGate.observationSpanMinutes,
    },
    {
      gate: "completedFundingEvents",
      minutes: estimatedRemainingMinutesByGate.completedFundingEvents,
    },
  ].filter((candidate): candidate is { gate: string; minutes: number } =>
    candidate.minutes !== null && candidate.minutes > 0,
  );
  const bottleneck = candidates.reduce<{ gate: string; minutes: number } | null>(
    (current, candidate) =>
      current === null || candidate.minutes > current.minutes ? candidate : current,
    null,
  );

  return {
    fundingEventIntervalMinutes: FUNDING_EVENT_INTERVAL_MINUTES,
    estimatedObservationCadenceMinutes:
      observationCadenceMinutes === null ? null : rounded(observationCadenceMinutes),
    estimatedRemainingMinutesByGate,
    progressByGate: {
      observations: progressRatio(readinessGap.observations.current, readinessGap.observations.required),
      observationSpanMinutes: progressRatio(
        readinessGap.observationSpanMinutes.current,
        readinessGap.observationSpanMinutes.required,
      ),
      completedFundingEvents: progressRatio(
        readinessGap.completedFundingEvents.current,
        readinessGap.completedFundingEvents.required,
      ),
    },
    bottleneck: bottleneck?.gate ?? "none",
    estimatedEarliestReviewAt:
      bottleneck === null ? generatedAt : addMinutesIso(generatedAt, bottleneck.minutes),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function marketKey(market: string | undefined, symbol: string | undefined): string {
  return `${market ?? ""}|${symbol ?? ""}`;
}

function buildFeeStressRowsByMarket(
  reports: FeeStressCarryReport[],
): Map<string, NonNullable<FeeStressCarryReport["perMarketSummary"]>[number]> {
  const rowsByMarket = new Map<string, NonNullable<FeeStressCarryReport["perMarketSummary"]>[number]>();
  for (const report of reports) {
    for (const row of report.perMarketSummary ?? []) {
      if (row.market === undefined || row.symbol === undefined) continue;
      rowsByMarket.set(marketKey(row.market, row.symbol), row);
    }
  }
  return rowsByMarket;
}

function feeStressRowsForCarryMarkets(
  carry: SpotPerpCarryReport,
  reports: FeeStressCarryReport[],
): Array<NonNullable<FeeStressCarryReport["perMarketSummary"]>[number] | null> {
  const feeStressRowsByMarket = buildFeeStressRowsByMarket(reports);
  return (carry.perMarketSummary ?? []).map((market) =>
    feeStressRowsByMarket.get(marketKey(market.market, market.symbol)) ?? null,
  );
}

function marketReadinessSteps(
  perMarketSummary: SpotPerpCarryReport["perMarketSummary"],
): Array<Record<string, unknown>> {
  return (perMarketSummary ?? [])
    .filter((market) => market.watchDecision?.status !== "metric_candidate")
    .map((market) => ({
      market: market.market ?? null,
      symbol: market.symbol ?? null,
      status: market.watchDecision?.status ?? null,
      requiredBeforeMetricCandidate: market.watchDecision?.requiredBeforeMetricCandidate ?? [],
      reasons: market.watchDecision?.reasons ?? [],
      completedFundingCount: market.completedFundingCount ?? null,
      completedFundingWindowCount:
        market.fundingWindowSummary?.completedFundingWindowCount ?? null,
      executionEligibleMedianNetCarryBps: market.executionEligibleMedianNetCarryBps ?? null,
      medianWindowNetCarryBps: market.fundingWindowSummary?.medianWindowNetCarryBps ?? null,
      executionEligiblePositiveRate: market.executionEligiblePositiveRate ?? null,
      positiveWindowRate: market.fundingWindowSummary?.positiveWindowRate ?? null,
      depthCoverageRate: market.depthCoverageRate ?? null,
    }));
}

function latestFundingWindowMedianNetCarryBps(summary: FundingWindowCarrySummary | undefined): number | null {
  const windows = summary?.windows ?? [];
  const datedWindows = windows
    .map((window) => ({
      timestamp: typeof window.fundingSettledAt === "string" ? Date.parse(window.fundingSettledAt) : NaN,
      medianNetCarryBps: finite(window.medianNetCarryBps),
    }))
    .filter((window) => Number.isFinite(window.timestamp) && window.medianNetCarryBps !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
  return datedWindows.at(-1)?.medianNetCarryBps ?? null;
}

function buildNextOperationalSteps(params: {
  blockers: string[];
  readinessGap: ReadinessGap;
  readinessTimeline: Record<string, unknown>;
  proof: OperationalProof | null;
  perMarketSummary: SpotPerpCarryReport["perMarketSummary"];
  liveExecutionPathReady: boolean;
}): Array<Record<string, unknown>> {
  const blockerSet = new Set(params.blockers);
  const steps: Array<Record<string, unknown>> = [];
  if (
    blockerSet.has("insufficientObservations") ||
    blockerSet.has("insufficientObservationSpan") ||
    blockerSet.has("insufficientCompletedFundingEvents")
  ) {
    steps.push({
      action: "continue_observation_until_evidence_gates_pass",
      gates: params.readinessGap,
      estimatedEarliestReviewAt: params.readinessTimeline.estimatedEarliestReviewAt ?? null,
      bottleneck: params.readinessTimeline.bottleneck ?? null,
    });
  }
  if (blockerSet.has("feeScheduleUnconfirmed")) {
    steps.push({
      action: "confirm_account_fee_schedule",
      reason: "Fee assumptions must be proven with current account data before live promotion.",
      missingSecrets: stringArray(params.proof?.details?.missingSecrets),
      requirements: params.proof?.requirements ?? null,
      deficits: params.proof?.deficits ?? null,
    });
  }
  if (blockerSet.has("inventoryNotReady")) {
    steps.push({
      action: "fund_or_verify_spot_inventory",
      reason: "Bithumb spot leg must have sufficient KRW inventory for the configured notional.",
      requirements: params.proof?.requirements ?? null,
      deficits: params.proof?.deficits ?? null,
    });
  }
  if (blockerSet.has("hedgeVenueNotReady")) {
    steps.push({
      action: "fund_or_verify_futures_hedge_venue",
      reason: "Binance USD-M hedge leg must have sufficient USDT margin and approved symbols.",
      missingSecrets: stringArray(params.proof?.details?.missingSecrets),
      requirements: params.proof?.requirements ?? null,
      deficits: params.proof?.deficits ?? null,
    });
  }
  if (blockerSet.has("operationalProofMissing") || blockerSet.has("operationalProof:credentialsMissing")) {
    steps.push({
      action: "refresh_operational_proof_with_credentials",
      reason: "Live readiness requires fresh private account proof, not public market data only.",
      missingSecrets: stringArray(params.proof?.details?.missingSecrets),
    });
  }
  const marketSteps = marketReadinessSteps(params.perMarketSummary);
  if (marketSteps.length > 0) {
    steps.push({
      action: "keep_markets_observation_only_until_metric_candidate",
      markets: marketSteps,
    });
  }
  if (!params.liveExecutionPathReady) {
    steps.push({
      action: "restore_gated_live_execution_path",
      reason: "The repository must contain the fail-closed live runner, PM2 command, private clients, readiness gate, and reconciliation checks.",
    });
  }
  return steps;
}

async function hasSpotPerpCarryExecutionPath(codebaseRoot: string): Promise<boolean> {
  const [
    packageJson,
    ecosystem,
    liveRunner,
    bithumbLive,
    binanceLive,
  ] = await Promise.all([
    readText(resolve(codebaseRoot, "package.json")),
    readText(resolve(codebaseRoot, "ecosystem.config.cjs")),
    readText(resolve(codebaseRoot, "src/cli/run-spot-perp-carry-live.ts")),
    readText(resolve(codebaseRoot, "src/live/bithumb.ts")),
    readText(resolve(codebaseRoot, "src/live/binance.ts")),
  ]);

  return (
    packageJson.includes("pm2:start:live-spot-perp-carry") &&
    packageJson.includes("pm2:start:live-spot-perp-carry-pieverse") &&
    packageJson.includes("dry-run:review-spot-perp-carry-pieverse-live-ready") &&
    ecosystem.includes("live-spot-perp-carry") &&
    ecosystem.includes("live-spot-perp-carry-pieverse") &&
    ecosystem.includes("var/reports/spot-perp-carry-pieverse-live-readiness-latest.json") &&
    ecosystem.includes("var/reports/spot-perp-carry-pieverse-72h-latest.json") &&
    ecosystem.includes("KRW-PIEVERSE") &&
    liveRunner.includes("spot-perp carry") &&
    liveRunner.includes("createBithumbPrivateClient") &&
    liveRunner.includes("createBinanceUsdMFuturesPrivateClient") &&
    liveRunner.includes("--submit-once") &&
    liveRunner.includes("--require-live-ready") &&
    liveRunner.includes("reconcile") &&
    liveRunner.includes("realizedNetPnlKrw") &&
    bithumbLive.includes("createBithumbPrivateClient") &&
    binanceLive.includes("createBinanceUsdMFuturesPrivateClient")
  );
}

async function buildReport(
  carry: SpotPerpCarryReport,
  feeStressReports: FeeStressCarryReport[],
  proof: OperationalProof | null,
  args: Args,
): Promise<Record<string, unknown>> {
  const reasons: string[] = [];
  const summary = carry.summary ?? {};
  const assumptions = carry.assumptions ?? {};
  const perMarketSummary = carry.perMarketSummary ?? [];
  const feeStressRows = feeStressRowsForCarryMarkets(carry, feeStressReports);
  const liveExecutionPathReady = await hasSpotPerpCarryExecutionPath(args.codebaseRoot);
  const approvedMarkets = new Set(proof?.approvedMarkets ?? []);
  const accountFeesConfirmed = bool(assumptions.accountFeesConfirmed) || bool(proof?.accountFeesConfirmed);
  const inventoryReady = bool(assumptions.inventoryReady) || bool(proof?.inventoryReady);
  const hedgeVenueReady = bool(assumptions.hedgeVenueReady) || bool(proof?.hedgeVenueReady);
  const minObservations = assumptions.minObservations ?? 432;
  const minCompletedFundingEvents = assumptions.minCompletedFundingEvents ?? 6;
  const minObservationSpanMinutes = assumptions.minObservationSpanMinutes ?? 4_320;
  const minNetCarryBps = assumptions.minNetCarryBps ?? 10;
  const minPositiveCarryRate = assumptions.minPositiveCarryRate ?? 0.67;
  const minDepthCoverageRate = assumptions.minDepthCoverageRate ?? 0.95;
  const observationCount = summary.count ?? carry.observationCount ?? 0;
  const observationSpanMinutes = carry.observationSpanMinutes ?? 0;
  const fundingWindowSummary = carry.fundingWindowSummary;
  const completedFundingCount = summary.completedFundingCount ?? 0;
  const medianWindowNetCarryBps = fundingWindowSummary?.medianWindowNetCarryBps ?? null;
  const positiveWindowRate = fundingWindowSummary?.positiveWindowRate ?? null;

  if (!fresh(carry.generatedAt, args.maxReportAgeHours)) reasons.push("carryReportStale");
  if (feeStressReports.length === 0) {
    reasons.push("feeStressReportMissing");
  }
  for (const [index, feeStress] of feeStressReports.entries()) {
    if (!fresh(feeStress.generatedAt, args.maxReportAgeHours)) {
      reasons.push(`feeStressReport:${index}:stale`);
    }
  }
  if (carry.promotionEligible !== true) reasons.push("carryReportNotPromotionEligible");
  for (const blocker of carry.blockers ?? []) reasons.push(`carryBlocker:${blocker}`);
  if (fundingWindowSummary === undefined) reasons.push("fundingWindowSummaryMissing");
  if (observationCount < minObservations) reasons.push("insufficientObservations");
  if (observationSpanMinutes < minObservationSpanMinutes) {
    reasons.push("insufficientObservationSpan");
  }
  if (completedFundingCount < minCompletedFundingEvents) {
    reasons.push("insufficientCompletedFundingEvents");
  }
  if ((medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY) < minNetCarryBps) {
    reasons.push("weakMedianNetCarry");
  }
  if ((positiveWindowRate ?? 0) < minPositiveCarryRate) {
    reasons.push("lowPositiveCarryRate");
  }
  if ((summary.depthCoverageRate ?? 0) < minDepthCoverageRate) reasons.push("depthCoverageInsufficient");
  if (!accountFeesConfirmed) reasons.push("feeScheduleUnconfirmed");
  if (!inventoryReady) reasons.push("inventoryNotReady");
  if (!hedgeVenueReady) reasons.push("hedgeVenueNotReady");
  if (!liveExecutionPathReady) reasons.push("liveExecutionPathMissing");
  if (proof === null) reasons.push("operationalProofMissing");
  else {
    if (!fresh(proof.generatedAt, args.maxProofAgeHours)) reasons.push("operationalProofStale");
    for (const reason of proof.reasons ?? []) reasons.push(`operationalProof:${reason}`);
  }

  for (const [marketIndex, market] of perMarketSummary.entries()) {
    const label = market.market ?? market.symbol ?? "unknown";
    const marketFundingWindowSummary = market.fundingWindowSummary;
    const feeStress = feeStressRows[marketIndex] ?? null;
    const feeStressFundingWindowSummary = feeStress?.fundingWindowSummary;
    const feeStressLatestWindowMedianNetCarryBps =
      latestFundingWindowMedianNetCarryBps(feeStressFundingWindowSummary);
    if (market.watchDecision?.status !== "metric_candidate") {
      reasons.push(`market:${label}:notMetricCandidate`);
      for (const reason of market.watchDecision?.reasons ?? []) {
        reasons.push(`market:${label}:${reason}`);
      }
      for (const requirement of market.watchDecision?.requiredBeforeMetricCandidate ?? []) {
        reasons.push(`market:${label}:requires:${requirement}`);
      }
    }
    if (marketFundingWindowSummary === undefined) {
      reasons.push(`market:${label}:fundingWindowSummaryMissing`);
    }
    if ((marketFundingWindowSummary?.completedFundingWindowCount ?? 0) < minCompletedFundingEvents) {
      reasons.push(`market:${label}:insufficientCompletedFundingEvents`);
    }
    if ((marketFundingWindowSummary?.medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY) < minNetCarryBps) {
      reasons.push(`market:${label}:weakMedianNetCarry`);
    }
    if ((marketFundingWindowSummary?.positiveWindowRate ?? 0) < minPositiveCarryRate) {
      reasons.push(`market:${label}:lowPositiveCarryRate`);
    }
    if (feeStress === null) {
      reasons.push(`market:${label}:feeStressMissing`);
    }
    if ((feeStressFundingWindowSummary?.medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY) < minNetCarryBps) {
      reasons.push(`market:${label}:feeStressWeakMedianNetCarry`);
    }
    if (
      feeStressLatestWindowMedianNetCarryBps !== null &&
      feeStressLatestWindowMedianNetCarryBps < minNetCarryBps
    ) {
      reasons.push(`market:${label}:feeStressLatestWindowWeak`);
    }
    if ((feeStressFundingWindowSummary?.positiveWindowRate ?? 0) < minPositiveCarryRate) {
      reasons.push(`market:${label}:feeStressLowPositiveCarryRate`);
    }
    if ((feeStress?.depthCoverageRate ?? 0) < minDepthCoverageRate) {
      reasons.push(`market:${label}:feeStressDepthCoverageInsufficient`);
    }
    if ((market.depthCoverageRate ?? 0) < minDepthCoverageRate) {
      reasons.push(`market:${label}:depthCoverageInsufficient`);
    }
    if (proof !== null && approvedMarkets.size > 0 && market.market !== undefined && !approvedMarkets.has(market.market)) {
      reasons.push(`market:${label}:notApprovedForLive`);
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const liveReady = uniqueReasons.length === 0;
  const generatedAt = new Date().toISOString();
  const readinessGap = {
    observations: {
      current: observationCount,
      required: minObservations,
      remaining: Math.max(0, minObservations - observationCount),
      passed: observationCount >= minObservations,
    },
    observationSpanMinutes: {
      current: observationSpanMinutes,
      required: minObservationSpanMinutes,
      remaining: Math.max(0, minObservationSpanMinutes - observationSpanMinutes),
      passed: observationSpanMinutes >= minObservationSpanMinutes,
    },
    completedFundingEvents: {
      current: completedFundingCount,
      required: minCompletedFundingEvents,
      remaining: Math.max(0, minCompletedFundingEvents - completedFundingCount),
      passed: completedFundingCount >= minCompletedFundingEvents,
    },
  };
  const readinessTimeline = buildReadinessTimeline(
    generatedAt,
    readinessGap,
    observationCount,
    observationSpanMinutes,
  );
  const nextOperationalSteps = buildNextOperationalSteps({
    blockers: uniqueReasons,
    readinessGap,
    readinessTimeline,
    proof,
    perMarketSummary,
    liveExecutionPathReady,
  });
  return {
    generatedAt,
    objective:
      "Audit whether a spot-perp carry measurement report is ready for separate gated live review.",
    status: liveReady ? "live_ready" : "blocked",
    liveReady,
    reasons: uniqueReasons,
    blockers: uniqueReasons,
    nextOperationalSteps,
    readinessGap,
    readinessTimeline,
    checks: {
      carryReportFresh: fresh(carry.generatedAt, args.maxReportAgeHours),
      feeStressReportsPresent: feeStressReports.length > 0,
      feeStressReportsFresh: feeStressReports.length > 0 &&
        feeStressReports.every((feeStress) => fresh(feeStress.generatedAt, args.maxReportAgeHours)),
      carryPromotionEligible: carry.promotionEligible === true,
      noCarryBlockers: (carry.blockers ?? []).length === 0,
      fundingWindowSummaryPresent: fundingWindowSummary !== undefined,
      sufficientObservations: observationCount >= minObservations,
      sufficientObservationSpan:
        observationSpanMinutes >= minObservationSpanMinutes,
      completedFundingEvents:
        completedFundingCount >= minCompletedFundingEvents,
      positiveMedianNetCarry:
        (medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY) >=
        minNetCarryBps,
      positiveCarryRate:
        (positiveWindowRate ?? 0) >= minPositiveCarryRate,
      depthCoverageReady: (summary.depthCoverageRate ?? 0) >= minDepthCoverageRate,
      accountFeesConfirmed,
      inventoryReady,
      hedgeVenueReady,
      liveExecutionPathReady,
      operationalProofPresent: proof !== null,
      operationalProofFresh:
        proof !== null && fresh(proof.generatedAt, args.maxProofAgeHours),
      perMarketMetricCandidates:
        perMarketSummary.length > 0 &&
        perMarketSummary.every((market) => market.watchDecision?.status === "metric_candidate"),
      perMarketFeeStressReady:
        perMarketSummary.length > 0 &&
        feeStressRows.length === perMarketSummary.length &&
        feeStressRows.every((feeStress) =>
          feeStress !== null &&
          (feeStress.fundingWindowSummary?.medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY) >=
            minNetCarryBps &&
          (latestFundingWindowMedianNetCarryBps(feeStress.fundingWindowSummary) ??
            minNetCarryBps) >= minNetCarryBps &&
          (feeStress.fundingWindowSummary?.positiveWindowRate ?? 0) >= minPositiveCarryRate &&
          (feeStress.depthCoverageRate ?? 0) >= minDepthCoverageRate
        ),
    },
    evidence: {
      carryGeneratedAt: carry.generatedAt ?? null,
      operationalProofGeneratedAt: proof?.generatedAt ?? null,
      codebaseRoot: args.codebaseRoot,
      summary,
      fundingWindowSummary: fundingWindowSummary ?? null,
      feeStressReports: feeStressReports.map((feeStress) => ({
        generatedAt: feeStress.generatedAt ?? null,
        summary: feeStress.summary ?? null,
        fundingWindowSummary: feeStress.fundingWindowSummary ?? null,
      })),
      perMarketSummary,
      feeStressPerMarketSummary: feeStressRows.map((feeStress) => feeStress ?? null),
      operationalProof: proof === null
        ? null
        : {
            generatedAt: proof.generatedAt ?? null,
            accountFeesConfirmed: proof.accountFeesConfirmed === true,
            inventoryReady: proof.inventoryReady === true,
            hedgeVenueReady: proof.hedgeVenueReady === true,
            approvedMarkets: proof.approvedMarkets ?? [],
            requirements: proof.requirements ?? null,
            deficits: proof.deficits ?? null,
            details: proof.details ?? null,
            reasons: proof.reasons ?? [],
          },
      thresholds: {
        minObservations,
        minCompletedFundingEvents,
        minObservationSpanMinutes,
        minNetCarryBps,
        minPositiveCarryRate,
        minDepthCoverageRate,
        maxReportAgeHours: args.maxReportAgeHours,
        maxProofAgeHours: args.maxProofAgeHours,
      },
    },
    interpretation: liveReady
      ? "Spot-perp carry evidence, operational proof, and gated live execution path cleared this readiness audit; final operator review is still required before order submission."
      : "Do not live-trade spot-perp carry; resolve every reason with fresh evidence before promotion.",
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const carry = await readJson<SpotPerpCarryReport>(args.carryReportPath as string);
  const feeStressReports = await Promise.all(
    args.feeStressReportPaths.map((path) => readJson<FeeStressCarryReport>(path)),
  );
  const proof = await readOptionalJson<OperationalProof>(args.operationalProofPath);
  const report = await buildReport(carry, feeStressReports, proof, args);
  const compactReport = report as {
    generatedAt: string;
    status: string;
    liveReady: boolean;
    reasons: string[];
    blockers: string[];
    nextOperationalSteps: Array<Record<string, unknown>>;
    readinessGap: Record<string, unknown>;
    readinessTimeline: Record<string, unknown>;
    checks: Record<string, boolean>;
    evidence: {
      carryGeneratedAt?: string | null;
      operationalProofGeneratedAt?: string | null;
      operationalProof?: {
        generatedAt?: string | null;
        accountFeesConfirmed?: boolean;
        inventoryReady?: boolean;
        hedgeVenueReady?: boolean;
        requirements?: Record<string, unknown> | null;
        deficits?: Record<string, unknown> | null;
        details?: {
          feeBudget?: Record<string, unknown>;
        } | null;
        reasons?: string[];
      } | null;
      summary?: Record<string, unknown>;
      fundingWindowSummary?: Record<string, unknown> | null;
      feeStressReports?: Array<Record<string, unknown>>;
      perMarketSummary?: Array<{
        market?: string;
        symbol?: string;
        count?: number;
        completedFundingCount?: number;
        fundingWindowSummary?: Record<string, unknown>;
        executionEligibleMedianNetCarryBps?: number | null;
        executionEligibleTotalEstimatedNetPnlKrw?: number;
        watchDecision?: Record<string, unknown>;
      }>;
    };
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(
    args.quiet
      ? `${JSON.stringify(
          {
            generatedAt: compactReport.generatedAt,
            status: compactReport.status,
            liveReady: compactReport.liveReady,
            reasons: compactReport.reasons,
            blockers: compactReport.blockers,
            nextOperationalSteps: compactReport.nextOperationalSteps,
            readinessGap: compactReport.readinessGap,
            readinessTimeline: compactReport.readinessTimeline,
            checks: compactReport.checks,
            evidence: {
              carryGeneratedAt: compactReport.evidence.carryGeneratedAt,
              operationalProofGeneratedAt: compactReport.evidence.operationalProofGeneratedAt,
              operationalProof:
                compactReport.evidence.operationalProof === null ||
                compactReport.evidence.operationalProof === undefined
                  ? undefined
                  : {
                      generatedAt: compactReport.evidence.operationalProof.generatedAt ?? null,
                      accountFeesConfirmed:
                        compactReport.evidence.operationalProof.accountFeesConfirmed === true,
                      inventoryReady: compactReport.evidence.operationalProof.inventoryReady === true,
                      hedgeVenueReady:
                        compactReport.evidence.operationalProof.hedgeVenueReady === true,
                      requirements: compactReport.evidence.operationalProof.requirements ?? null,
                      deficits: compactReport.evidence.operationalProof.deficits ?? null,
                      feeBudget:
                        compactReport.evidence.operationalProof.details?.feeBudget ?? null,
                      reasons: compactReport.evidence.operationalProof.reasons ?? [],
                    },
              summary: compactReport.evidence.summary,
              fundingWindowSummary: compactReport.evidence.fundingWindowSummary,
              feeStressReports: compactReport.evidence.feeStressReports,
              perMarketSummary: compactReport.evidence.perMarketSummary?.map((market) => ({
                market: market.market,
                symbol: market.symbol,
                count: market.count,
                completedFundingCount: market.completedFundingCount,
                fundingWindowSummary: market.fundingWindowSummary,
                executionEligibleMedianNetCarryBps: market.executionEligibleMedianNetCarryBps,
                executionEligibleTotalEstimatedNetPnlKrw:
                  market.executionEligibleTotalEstimatedNetPnlKrw,
                watchDecision: market.watchDecision,
              })),
            },
          },
          null,
          2,
        )}\n`
      : output,
  );
  if (args.requireLiveReady && report.liveReady !== true) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
