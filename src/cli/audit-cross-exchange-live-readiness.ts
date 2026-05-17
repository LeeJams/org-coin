import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  relativeValueReportPath: string | null;
  operationalProofPath: string | null;
  codebaseRoot: string;
  outputPath: string | null;
  requireLiveReady: boolean;
}

interface RelativeValueReport {
  generatedAt?: string;
  status?: string;
  market?: string;
  promotionEligible?: boolean;
  blockers?: string[];
  observationCount?: number;
  observationSpanMinutes?: number | null;
  latestObservationAgeHours?: number | null;
  fxAgeHours?: number | null;
  assumptions?: {
    market?: string;
    binanceSymbol?: string;
    usdKrw?: number;
    usdtKrwVenue?: string;
    usdtKrwMarket?: string;
    notionalKrw?: number;
    usdKrwUpdatedAt?: string;
    bithumbFeeBps?: number;
    globalFeeBps?: number;
    minNetEdgeBps?: number;
    minObservations?: number;
    minObservationSpanMinutes?: number;
    minEdgeObservationRate?: number;
    minDepthCoverageRate?: number;
    maxLatestAgeHours?: number;
    maxFxAgeHours?: number;
    maxOperationalProofAgeHours?: number;
    maxSnapshotSkewMs?: number;
    accountFeesConfirmed?: boolean;
    inventoryReady?: boolean;
    hedgeVenueReady?: boolean;
  };
  summary?: {
    count?: number;
    positiveCount?: number;
    positiveRate?: number | null;
    depthCoveredCount?: number;
    depthCoverageRate?: number | null;
    medianNetEdgeBps?: number | null;
    totalEstimatedNetPnlKrw?: number;
  };
  topEdges?: Array<{
    capturedAt?: string;
    referenceVenue?: string;
    direction?: string;
    snapshotSkewMs?: number | null;
    snapshotSkewSource?: string;
  }>;
  observations?: Array<{
    capturedAt?: string;
  }>;
}

interface OperationalProof {
  generatedAt?: string;
  accountFeesConfirmed?: boolean;
  hedgeVenueReady?: boolean;
  requirements?: {
    bithumbBaseRequiredKrw?: number;
    bithumbQuoteRequiredKrw?: number;
    referenceBaseRequiredKrw?: number;
    referenceQuoteRequiredKrw?: number;
  };
  inventory?: {
    bithumbBaseInventoryKrw?: number;
    bithumbQuoteInventoryKrw?: number;
    referenceBaseInventoryKrw?: number;
    referenceQuoteInventoryKrw?: number;
  };
  deficits?: {
    bithumbBaseDeficitKrw?: number;
    bithumbQuoteDeficitKrw?: number;
    referenceBaseDeficitKrw?: number;
    referenceQuoteDeficitKrw?: number;
  };
  details?: Record<string, unknown>;
  reasons?: string[];
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    relativeValueReportPath: null,
    operationalProofPath: null,
    codebaseRoot: cwd,
    outputPath: null,
    requireLiveReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--relative-value-report") {
      if (!value) throw new Error("--relative-value-report requires a value");
      args.relativeValueReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--operational-proof") {
      if (!value) throw new Error("--operational-proof requires a value");
      args.operationalProofPath = resolve(cwd, value);
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
    if (arg === "--require-live-ready") {
      args.requireLiveReady = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.relativeValueReportPath === null) {
    throw new Error("--relative-value-report is required");
  }
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function ageHours(isoTimestamp: unknown): number | null {
  if (typeof isoTimestamp !== "string" || isoTimestamp.trim().length === 0) {
    return null;
  }

  const timestampMs = Date.parse(isoTimestamp);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return (Date.now() - timestampMs) / 3_600_000;
}

function recentWallClockAge(isoTimestamp: unknown, maxAgeHours: number): boolean {
  const age = ageHours(isoTimestamp);
  return age !== null && age >= -1 / 60 && age <= maxAgeHours;
}

function latestObservationTimestamp(report: RelativeValueReport): string | undefined {
  return report.observations?.at(-1)?.capturedAt ?? topEdge(report)?.capturedAt ?? report.generatedAt;
}

function observationSpanMinutes(report: RelativeValueReport): number | null {
  const embedded = finiteNumber(report.observationSpanMinutes);
  if (embedded !== null) return embedded;

  let earliest: number | null = null;
  let latest: number | null = null;
  for (const observation of report.observations ?? []) {
    const parsed = Date.parse(observation.capturedAt ?? "");
    if (!Number.isFinite(parsed)) continue;
    earliest = earliest === null ? parsed : Math.min(earliest, parsed);
    latest = latest === null ? parsed : Math.max(latest, parsed);
  }
  return earliest === null || latest === null ? null : Math.max(0, (latest - earliest) / 60_000);
}

function proofIsClean(proof: OperationalProof | null): boolean {
  return proof !== null && Array.isArray(proof.reasons) && proof.reasons.length === 0;
}

type TopEdge = NonNullable<RelativeValueReport["topEdges"]>[number];
type InventoryRequirements = ReturnType<typeof requiredInventoryForDirection>;

function topEdge(report: RelativeValueReport): TopEdge | null {
  return report.topEdges?.[0] ?? null;
}

function requiredInventoryForDirection(
  direction: string | undefined,
  notionalKrw: number,
): {
  bithumbBaseInventoryKrw: number;
  bithumbQuoteInventoryKrw: number;
  referenceBaseInventoryKrw: number;
  referenceQuoteInventoryKrw: number;
} {
  if (direction === "sell_bithumb_buy_reference") {
    return {
      bithumbBaseInventoryKrw: notionalKrw,
      bithumbQuoteInventoryKrw: 0,
      referenceBaseInventoryKrw: 0,
      referenceQuoteInventoryKrw: notionalKrw,
    };
  }
  if (direction === "buy_bithumb_sell_reference") {
    return {
      bithumbBaseInventoryKrw: 0,
      bithumbQuoteInventoryKrw: notionalKrw,
      referenceBaseInventoryKrw: notionalKrw,
      referenceQuoteInventoryKrw: 0,
    };
  }
  return {
    bithumbBaseInventoryKrw: Number.POSITIVE_INFINITY,
    bithumbQuoteInventoryKrw: Number.POSITIVE_INFINITY,
    referenceBaseInventoryKrw: Number.POSITIVE_INFINITY,
    referenceQuoteInventoryKrw: Number.POSITIVE_INFINITY,
  };
}

function proofRequirements(
  proof: OperationalProof | null,
  fallback: InventoryRequirements,
): InventoryRequirements {
  const requirements = proof?.requirements ?? {};
  return {
    bithumbBaseInventoryKrw:
      finiteNumber(requirements.bithumbBaseRequiredKrw) ?? fallback.bithumbBaseInventoryKrw,
    bithumbQuoteInventoryKrw:
      finiteNumber(requirements.bithumbQuoteRequiredKrw) ?? fallback.bithumbQuoteInventoryKrw,
    referenceBaseInventoryKrw:
      finiteNumber(requirements.referenceBaseRequiredKrw) ?? fallback.referenceBaseInventoryKrw,
    referenceQuoteInventoryKrw:
      finiteNumber(requirements.referenceQuoteRequiredKrw) ?? fallback.referenceQuoteInventoryKrw,
  };
}

function hasInventory(
  proof: OperationalProof | null,
  required: InventoryRequirements,
): boolean {
  const inventory = proof?.inventory ?? {};
  return (
    (finiteNumber(inventory.bithumbBaseInventoryKrw) ?? 0) >= required.bithumbBaseInventoryKrw &&
    (finiteNumber(inventory.bithumbQuoteInventoryKrw) ?? 0) >= required.bithumbQuoteInventoryKrw &&
    (finiteNumber(inventory.referenceBaseInventoryKrw) ?? 0) >= required.referenceBaseInventoryKrw &&
    (finiteNumber(inventory.referenceQuoteInventoryKrw) ?? 0) >= required.referenceQuoteInventoryKrw
  );
}

async function hasCrossExchangeExecutionPath(codebaseRoot: string): Promise<boolean> {
  const [
    packageJson,
    ecosystem,
    liveRunner,
    bithumbLive,
    binanceLive,
    crossExchangeLive,
  ] = await Promise.all([
    readText(resolve(codebaseRoot, "package.json")),
    readText(resolve(codebaseRoot, "ecosystem.config.cjs")),
    readText(resolve(codebaseRoot, "src/cli/run-cross-exchange-relative-value-live.ts")),
    readText(resolve(codebaseRoot, "src/live/bithumb.ts")),
    readText(resolve(codebaseRoot, "src/live/binance.ts")),
    readText(resolve(codebaseRoot, "src/execution/cross-exchange-relative-value-live.ts")),
  ]);

  return (
    packageJson.includes("pm2:start:live-cross-exchange-relative-value") &&
    ecosystem.includes("live-cross-exchange-relative-value") &&
    liveRunner.includes("buildHedgedRelativeValuePlan") &&
    liveRunner.includes("submitHedgedRelativeValueOrder") &&
    liveRunner.includes("--output") &&
    liveRunner.includes("writeFile") &&
    liveRunner.includes("createBithumbRelativeValueVenue") &&
    liveRunner.includes("createBinanceRelativeValueVenue") &&
    liveRunner.includes("/api/v3/depth") &&
    liveRunner.includes("orderbook_units") &&
    liveRunner.includes("candidateWithProofFees") &&
    liveRunner.includes("executableVwapPrice") &&
    liveRunner.includes("observedNetEdgeBps") &&
    liveRunner.includes("realizedPnlKrw") &&
    liveRunner.includes("realizedNetPnlKrw") &&
    liveRunner.includes("realizedGrossPnlKrw") &&
    bithumbLive.includes("createBithumbRelativeValueVenue") &&
    binanceLive.includes("createBinancePrivateClient") &&
    binanceLive.includes("createBinanceRelativeValueVenue") &&
    binanceLive.includes("limitPriceCurrency") &&
    binanceLive.includes("quoteToKrw") &&
    ecosystem.includes("ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION") &&
    ecosystem.includes("--submit-once") &&
    ecosystem.includes("cross-exchange-live-execution-latest.json") &&
    ecosystem.includes("crossExchangeOrderSubmissionEnabled") &&
    crossExchangeLive.includes("limitPriceCurrency") &&
    crossExchangeLive.includes("quoteToKrw") &&
    crossExchangeLive.includes("reconcileFilledOrders") &&
    crossExchangeLive.includes("pairNotionalImbalanceBps") &&
    crossExchangeLive.includes("realizedNetPnlKrw") &&
    crossExchangeLive.includes("realizedFeeKrw") &&
    crossExchangeLive.includes("submitHedgedRelativeValueOrder")
  );
}

async function buildChecklist(
  report: RelativeValueReport,
  proof: OperationalProof | null,
  codebaseRoot: string,
): Promise<Record<string, boolean>> {
  const assumptions = report.assumptions ?? {};
  const summary = report.summary ?? {};
  const edge = topEdge(report);
  const notionalKrw = finiteNumber(assumptions.notionalKrw) ?? 0;
  const minObservations = finiteNumber(assumptions.minObservations) ?? 100;
  const minObservationSpanMinutes =
    finiteNumber(assumptions.minObservationSpanMinutes) ?? 60;
  const minNetEdgeBps = finiteNumber(assumptions.minNetEdgeBps) ?? 20;
  const minEdgeObservationRate = finiteNumber(assumptions.minEdgeObservationRate) ?? 0.6;
  const minDepthCoverageRate = finiteNumber(assumptions.minDepthCoverageRate) ?? 0.95;
  const maxLatestAgeHours = finiteNumber(assumptions.maxLatestAgeHours) ?? 24;
  const maxFxAgeHours = finiteNumber(assumptions.maxFxAgeHours) ?? 24;
  const maxOperationalProofAgeHours =
    finiteNumber(assumptions.maxOperationalProofAgeHours) ?? 1;
  const maxSnapshotSkewMs = finiteNumber(assumptions.maxSnapshotSkewMs) ?? 2000;
  const embeddedLatestAgeHours = finiteNumber(report.latestObservationAgeHours);
  const embeddedFxAgeHours = finiteNumber(report.fxAgeHours);
  const observedAt = latestObservationTimestamp(report);
  const observedSpanMinutes = observationSpanMinutes(report);
  const fxUpdatedAt = assumptions.usdKrwUpdatedAt;
  const usesObservedUsdtKrw =
    typeof assumptions.usdtKrwVenue === "string" &&
    assumptions.usdtKrwVenue !== "none";
  const proofAgeHours = ageHours(proof?.generatedAt);
  const snapshotSkewMs = finiteNumber(edge?.snapshotSkewMs);
  const requiredInventory = proofRequirements(
    proof,
    requiredInventoryForDirection(edge?.direction, notionalKrw),
  );
  const cleanProof = proofIsClean(proof);

  return {
    reportPresent: true,
    bestEdgeDirectionKnown:
      edge?.direction === "sell_bithumb_buy_reference" ||
      edge?.direction === "buy_bithumb_sell_reference",
    globalReferenceVenue: edge?.referenceVenue === "binance",
    sufficientObservations: (finiteNumber(report.observationCount) ?? 0) >= minObservations,
    observationSpanSufficient:
      observedSpanMinutes !== null && observedSpanMinutes >= minObservationSpanMinutes,
    positiveEdgeRate: (finiteNumber(summary.positiveRate) ?? 0) >= minEdgeObservationRate,
    positiveMedianNetEdge: (finiteNumber(summary.medianNetEdgeBps) ?? Number.NEGATIVE_INFINITY) >= minNetEdgeBps,
    positiveEstimatedNetPnl: (finiteNumber(summary.totalEstimatedNetPnlKrw) ?? Number.NEGATIVE_INFINITY) > 0,
    depthCoverageReady: (finiteNumber(summary.depthCoverageRate) ?? 0) >= minDepthCoverageRate,
    latestObservationFresh:
      recentWallClockAge(observedAt, maxLatestAgeHours) &&
      (embeddedLatestAgeHours === null || embeddedLatestAgeHours <= maxLatestAgeHours),
    fxFresh:
      usesObservedUsdtKrw ||
      (recentWallClockAge(fxUpdatedAt, maxFxAgeHours) &&
        (embeddedFxAgeHours === null || embeddedFxAgeHours <= maxFxAgeHours)),
    snapshotSkewControlled: snapshotSkewMs !== null && snapshotSkewMs <= maxSnapshotSkewMs,
    executionPathReady: await hasCrossExchangeExecutionPath(codebaseRoot),
    operationalProofPresent: proof !== null,
    operationalProofFresh:
      proofAgeHours !== null &&
      proofAgeHours >= -1 / 60 &&
      proofAgeHours <= maxOperationalProofAgeHours,
    operationalProofClean: cleanProof,
    accountFeesConfirmed: bool(proof?.accountFeesConfirmed),
    inventoryReady: hasInventory(proof, requiredInventory),
    hedgeVenueReady: bool(proof?.hedgeVenueReady),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const report = await readJson<RelativeValueReport>(args.relativeValueReportPath!);
  const proof = await readOptionalJson<OperationalProof>(args.operationalProofPath);
  const checklist = await buildChecklist(report, proof, args.codebaseRoot);
  const blockers = Object.entries(checklist)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const liveReady = blockers.length === 0;
  const edge = topEdge(report);
  const assumptions = report.assumptions ?? {};
  const notionalKrw = finiteNumber(report.assumptions?.notionalKrw) ?? null;
  const minNetEdgeBps = finiteNumber(assumptions.minNetEdgeBps) ?? null;
  const fallbackRequirements = requiredInventoryForDirection(
    edge?.direction,
    finiteNumber(report.assumptions?.notionalKrw) ?? 0,
  );
  const operationalProofSummary =
    proof === null
      ? null
      : {
          generatedAt: proof.generatedAt ?? null,
          accountFeesConfirmed: proof.accountFeesConfirmed === true,
          hedgeVenueReady: proof.hedgeVenueReady === true,
          requirements: proofRequirements(proof, fallbackRequirements),
          inventory: proof.inventory ?? {},
          deficits: proof.deficits ?? null,
          details: proof.details ?? {},
          reasons: proof.reasons ?? [],
        };

  const outputReport = {
    generatedAt: new Date().toISOString(),
    objective:
      "Gate Bithumb-Binance relative-value evidence before any live execution attempt.",
    sourceReport: args.relativeValueReportPath,
    operationalProof: args.operationalProofPath,
    codebaseRoot: args.codebaseRoot,
    liveReady,
    blockers,
    checklist,
    operationalProofSummary,
    candidate: {
      notionalKrw,
      market: assumptions.market ?? report.market ?? null,
      referenceMarket: assumptions.binanceSymbol ?? null,
      referenceQuoteToKrw: finiteNumber(assumptions.usdKrw),
      minNetEdgeBps,
      bithumbFeeBps: finiteNumber(assumptions.bithumbFeeBps),
      referenceFeeBps: finiteNumber(assumptions.globalFeeBps),
      referenceVenue: edge?.referenceVenue ?? null,
      direction: edge?.direction ?? null,
      medianNetEdgeBps: report.summary?.medianNetEdgeBps ?? null,
      observationMedianNetEdgeBps: report.summary?.medianNetEdgeBps ?? null,
      positiveRate: report.summary?.positiveRate ?? null,
      depthCoverageRate: report.summary?.depthCoverageRate ?? null,
      observationSpanMinutes: observationSpanMinutes(report),
      minObservationSpanMinutes:
        finiteNumber(assumptions.minObservationSpanMinutes) ?? 60,
      totalEstimatedNetPnlKrw: report.summary?.totalEstimatedNetPnlKrw ?? null,
      estimatedObservationPnlKrw: report.summary?.totalEstimatedNetPnlKrw ?? null,
      realizedLivePnlKrw: null,
    },
    measurementScope: {
      medianNetEdgeBps: "observation_estimate_not_realized_live_pnl",
      totalEstimatedNetPnlKrw: "observation_estimate_not_realized_live_pnl",
      realizedLivePnlKrw: "not_available_until_live_fills_are_reconciled",
    },
    interpretation: liveReady
      ? "All configured live-readiness gates passed for this evidence and operational proof. Candidate edge and PnL fields are observation estimates, not realized live PnL."
      : "Do not live-trade this candidate. Resolve every blocker with fresh evidence before promotion.",
  };

  const output = `${JSON.stringify(outputReport, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);

  if (args.requireLiveReady && !liveReady) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
