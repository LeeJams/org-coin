import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildHedgedRelativeValuePlan,
  type BookLevel,
  submitHedgedRelativeValueOrder,
  type HedgedRelativeValueExecutionResult,
  type HedgedRelativeValuePlan,
  type RelativeValueBook,
  type RelativeValueDirection,
} from "../execution/cross-exchange-relative-value-live.js";
import {
  createBinancePrivateClient,
  createBinanceRelativeValueVenue,
} from "../live/binance.js";
import {
  createBithumbPrivateClient,
  createBithumbRelativeValueVenue,
} from "../live/bithumb.js";
import { assertLiveGoalCompletionAuditAllowsStartup } from "../runtime/live-goal-completion-audit.js";

interface Args {
  readinessReportPath: string | null;
  liveGoalStatusPath: string | null;
  outputPath: string | null;
  submitOnce: boolean;
}

interface CrossExchangeReadinessReport {
  generatedAt?: string | null;
  liveReady?: boolean;
  blockers?: string[];
  checklist?: Record<string, boolean>;
  operationalProofSummary?: {
    generatedAt?: string | null;
    accountFeesConfirmed?: boolean;
    hedgeVenueReady?: boolean;
    deficits?: {
      bithumbBaseDeficitKrw?: number;
      bithumbQuoteDeficitKrw?: number;
      referenceBaseDeficitKrw?: number;
      referenceQuoteDeficitKrw?: number;
    };
    reasons?: string[];
    details?: {
      bithumbFeeBps?: number | null;
      referenceFeeBps?: number | null;
    };
  } | null;
  candidate?: {
    notionalKrw?: number | null;
    market?: string | null;
    referenceMarket?: string | null;
    referenceQuoteToKrw?: number | null;
    minNetEdgeBps?: number | null;
    bithumbFeeBps?: number | null;
    referenceFeeBps?: number | null;
    referenceVenue?: string | null;
    direction?: string | null;
    medianNetEdgeBps?: number | null;
  };
}

interface LiveGoalStatus {
  generatedAt?: string;
  liveReady?: boolean;
  liveStartupAllowed?: boolean;
  completionAudit?: {
    achieved?: boolean;
    failedCompletionCriteria?: string[];
    missingRequirements?: string[];
    missingRequirementCount?: number;
    criteria?: Array<{ id?: string; passed?: boolean }>;
  };
  selectedLiveCandidate?: {
    type?: string;
    market?: string | null;
    referenceMarket?: string | null;
  } | null;
  blockers?: string[];
}

interface FreshBooks {
  bithumb: RelativeValueBook;
  reference: RelativeValueBook;
}

type LiveCandidate = NonNullable<CrossExchangeReadinessReport["candidate"]>;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    readinessReportPath: null,
    liveGoalStatusPath: null,
    outputPath: null,
    submitOnce: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--readiness-report") {
      if (!value) throw new Error("--readiness-report requires a value");
      args.readinessReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--live-goal-status") {
      if (!value) throw new Error("--live-goal-status requires a value");
      args.liveGoalStatusPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--submit-once") {
      args.submitOnce = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.readinessReportPath === null) {
    throw new Error("--readiness-report is required");
  }
  if (args.submitOnce && args.outputPath === null) {
    throw new Error("--output is required when --submit-once is used");
  }
  if (args.liveGoalStatusPath === null) {
    throw new Error("--live-goal-status is required");
  }

  return args;
}

function requireEnvFlag(name: string): void {
  if (process.env[name] !== "true") {
    throw new Error(`${name}=true is required for cross-exchange live execution`);
  }
}

function requireEnvSecret(name: string): void {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required for cross-exchange live execution`);
  }
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? fallback : value;
}

function optionalPositiveNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function requireCandidate(candidate: CrossExchangeReadinessReport["candidate"]): void {
  if (finitePositive(candidate?.notionalKrw) === null) {
    throw new Error("cross-exchange readiness candidate requires positive notionalKrw");
  }
  if (candidate?.referenceVenue !== "binance") {
    throw new Error("cross-exchange readiness candidate must use binance reference venue");
  }
  if (
    candidate.direction !== "sell_bithumb_buy_reference" &&
    candidate.direction !== "buy_bithumb_sell_reference"
  ) {
    throw new Error("cross-exchange readiness candidate has unsupported direction");
  }
  if (finitePositive(candidate.medianNetEdgeBps) === null) {
    throw new Error("cross-exchange readiness candidate requires positive medianNetEdgeBps");
  }
  if (candidate.market !== "KRW-BTC") {
    throw new Error("cross-exchange readiness candidate must use KRW-BTC market");
  }
  if (candidate.referenceMarket !== "BTCUSDT") {
    throw new Error("cross-exchange readiness candidate must use BTCUSDT reference market");
  }
  if (finitePositive(candidate.referenceQuoteToKrw) === null) {
    throw new Error("cross-exchange readiness candidate requires referenceQuoteToKrw");
  }
  if (finiteNonNegative(candidate.minNetEdgeBps) === null) {
    throw new Error("cross-exchange readiness candidate requires minNetEdgeBps");
  }
  if (finiteNonNegative(candidate.bithumbFeeBps) === null) {
    throw new Error("cross-exchange readiness candidate requires bithumbFeeBps");
  }
  if (finiteNonNegative(candidate.referenceFeeBps) === null) {
    throw new Error("cross-exchange readiness candidate requires referenceFeeBps");
  }
}

function requireChecklist(checklist: Record<string, boolean> | undefined): void {
  if (checklist === undefined || Object.keys(checklist).length === 0) {
    throw new Error("cross-exchange readiness checklist is required");
  }
  const failed = Object.entries(checklist)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(`cross-exchange readiness checklist failed: ${failed.join(", ")}`);
  }
}

function requireRecentTimestamp(
  value: string | null | undefined,
  label: string,
  maxAgeMs: number,
  nowMs: number,
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} timestamp is required`);
  }
  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    throw new Error(`${label} timestamp is invalid`);
  }
  const ageMs = nowMs - timestampMs;
  if (ageMs < -60_000) {
    throw new Error(`${label} timestamp is in the future`);
  }
  if (ageMs > maxAgeMs) {
    throw new Error(`${label} timestamp is stale`);
  }
}

function timestampMs(value: string | null | undefined, label: string): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} timestamp is required`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} timestamp is invalid`);
  }
  return timestamp;
}

function requireFreshReadiness(readiness: CrossExchangeReadinessReport): void {
  const maxAgeMs = optionalPositiveNumberEnv("LIVE_READINESS_MAX_AGE_MS", 900_000);
  const nowMs = Date.now();
  requireRecentTimestamp(readiness.generatedAt, "cross-exchange readiness", maxAgeMs, nowMs);
  requireRecentTimestamp(
    readiness.operationalProofSummary?.generatedAt,
    "cross-exchange operational proof",
    maxAgeMs,
    nowMs,
  );
}

function requireLiveGoalCoversCrossExchangeEvidence(
  liveGoal: LiveGoalStatus,
  readiness: CrossExchangeReadinessReport,
): void {
  const liveGoalGeneratedAtMs = timestampMs(liveGoal.generatedAt, "live goal status");
  const readinessGeneratedAtMs = timestampMs(readiness.generatedAt, "cross-exchange readiness");
  const operationalProofGeneratedAtMs = timestampMs(
    readiness.operationalProofSummary?.generatedAt,
    "cross-exchange operational proof",
  );
  const latestEvidenceMs = Math.max(readinessGeneratedAtMs, operationalProofGeneratedAtMs);
  if (liveGoalGeneratedAtMs < latestEvidenceMs) {
    throw new Error(
      "live goal status is older than the cross-exchange evidence it is authorizing; refresh the live-goal gate after readiness and operational proof reports",
    );
  }
}

function requireLiveGoalAllowsCrossExchange(liveGoal: LiveGoalStatus, candidate: LiveCandidate): void {
  if (liveGoal.liveReady !== true || liveGoal.liveStartupAllowed !== true) {
    throw new Error(
      `live goal does not allow cross-exchange startup: ${(liveGoal.blockers ?? ["liveStartupAllowed"]).join(", ")}`,
    );
  }
  if (liveGoal.completionAudit === undefined) {
    assertLiveGoalCompletionAuditAllowsStartup(undefined, "cross-exchange startup");
  } else {
    assertLiveGoalCompletionAuditAllowsStartup(liveGoal.completionAudit, "cross-exchange startup");
  }
  const selected = liveGoal.selectedLiveCandidate;
  if (selected === null || selected === undefined) {
    throw new Error("live goal selectedLiveCandidate is required for cross-exchange startup");
  }
  if (selected.type !== "cross_exchange_relative_value") {
    throw new Error(
      `live goal selected candidate is not cross-exchange relative value: ${selected.type ?? "unknown"}`,
    );
  }
  if (typeof selected.market === "string" && selected.market !== candidate.market) {
    throw new Error(
      `live goal selected market ${selected.market} does not match requested ${candidate.market}`,
    );
  }
  if (
    typeof selected.referenceMarket === "string" &&
    selected.referenceMarket !== candidate.referenceMarket
  ) {
    throw new Error(
      `live goal selected reference market ${selected.referenceMarket} does not match requested ${candidate.referenceMarket}`,
    );
  }
}

function baseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`request failed ${response.status}: ${url}`);
  return (await response.json()) as unknown;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function firstRecord(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value) && value[0] !== null && typeof value[0] === "object") {
    return value[0] as Record<string, unknown>;
  }
  throw new Error(`${label} must be a non-empty array`);
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function numberValue(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return parsed;
}

function numberTupleLevel(value: unknown, label: string): BookLevel {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(`${label} must be a price/size tuple`);
  }
  return {
    price: numberValue(value[0], `${label} price`),
    size: numberValue(value[1], `${label} size`),
  };
}

async function fetchBithumbBook(market: string): Promise<RelativeValueBook> {
  const url = new URL(`${baseUrl(optionalEnv("BITHUMB_PUBLIC_REST_BASE_URL", "https://api.bithumb.com/v1"))}/orderbook`);
  url.searchParams.set("markets", market);
  const row = firstRecord(await fetchJson(url.toString()), "bithumb orderbook response");
  const units = row.orderbook_units;
  const unit = firstRecord(units, "bithumb orderbook units");
  const unitRows = Array.isArray(units) ? units : [];
  const bids = unitRows.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    return {
      price: numberValue(record.bid_price, `bithumb bid_price ${index}`),
      size: numberValue(record.bid_size, `bithumb bid_size ${index}`),
    };
  });
  const asks = unitRows.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    return {
      price: numberValue(record.ask_price, `bithumb ask_price ${index}`),
      size: numberValue(record.ask_size, `bithumb ask_size ${index}`),
    };
  });
  return {
    bidPrice: numberValue(unit.bid_price, "bithumb bid_price"),
    bidSize: numberValue(unit.bid_size, "bithumb bid_size"),
    askPrice: numberValue(unit.ask_price, "bithumb ask_price"),
    askSize: numberValue(unit.ask_size, "bithumb ask_size"),
    bids,
    asks,
  };
}

async function fetchBinanceBook(symbol: string): Promise<RelativeValueBook> {
  const url = new URL(`${baseUrl(optionalEnv("BINANCE_PUBLIC_REST_BASE_URL", "https://api.binance.com"))}/api/v3/depth`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", "20");
  const row = record(await fetchJson(url.toString()), "binance depth response");
  const bids = arrayValue(row.bids, "binance bids").map((level, index) =>
    numberTupleLevel(level, `binance bid ${index}`),
  );
  const asks = arrayValue(row.asks, "binance asks").map((level, index) =>
    numberTupleLevel(level, `binance ask ${index}`),
  );
  if (bids.length === 0 || asks.length === 0) {
    throw new Error("binance depth response must include bids and asks");
  }
  return {
    bidPrice: bids[0]!.price,
    bidSize: bids[0]!.size,
    askPrice: asks[0]!.price,
    askSize: asks[0]!.size,
    bids,
    asks,
  };
}

function candidateWithProofFees(
  candidate: LiveCandidate,
  proof: NonNullable<CrossExchangeReadinessReport["operationalProofSummary"]>,
): LiveCandidate {
  return {
    ...candidate,
    bithumbFeeBps: proof.details!.bithumbFeeBps!,
    referenceFeeBps: proof.details!.referenceFeeBps!,
  };
}

async function fetchFreshBooks(candidate: LiveCandidate): Promise<FreshBooks> {
  const [bithumb, reference] = await Promise.all([
    fetchBithumbBook(candidate.market!),
    fetchBinanceBook(candidate.referenceMarket!),
  ]);
  return { bithumb, reference };
}

function feeRate(bps: number): number {
  return bps / 10_000;
}

function levelsForSide(book: RelativeValueBook, side: "buy" | "sell"): BookLevel[] {
  const levels = side === "buy" ? book.asks : book.bids;
  if (Array.isArray(levels) && levels.length > 0) return levels;
  return side === "buy"
    ? [{ price: book.askPrice, size: book.askSize }]
    : [{ price: book.bidPrice, size: book.bidSize }];
}

function executableVwapPrice(
  book: RelativeValueBook,
  side: "buy" | "sell",
  notionalKrw: number,
  quoteToKrw: number,
): number {
  let remainingKrw = notionalKrw;
  let quantity = 0;
  let nativeQuoteNotional = 0;

  for (const level of levelsForSide(book, side)) {
    const levelKrw = level.price * level.size * quoteToKrw;
    if (levelKrw >= remainingKrw) {
      const takeQuantity = remainingKrw / (level.price * quoteToKrw);
      quantity += takeQuantity;
      nativeQuoteNotional += takeQuantity * level.price;
      remainingKrw = 0;
      break;
    }
    quantity += level.size;
    nativeQuoteNotional += level.price * level.size;
    remainingKrw -= levelKrw;
  }

  if (remainingKrw > 1e-6 || quantity <= 0) {
    throw new Error(`fresh ${side} depth is insufficient for the configured notional`);
  }
  return nativeQuoteNotional / quantity;
}

function observedNetEdgeBps(
  candidate: LiveCandidate,
  books: FreshBooks,
): number {
  const bFee = feeRate(candidate.bithumbFeeBps!);
  const rFee = feeRate(candidate.referenceFeeBps!);
  const quoteToKrw = candidate.referenceQuoteToKrw!;
  if (candidate.direction === "sell_bithumb_buy_reference") {
    const sellBithumbNet = executableVwapPrice(
      books.bithumb,
      "sell",
      candidate.notionalKrw!,
      1,
    ) * (1 - bFee);
    const buyReferenceCost = executableVwapPrice(
      books.reference,
      "buy",
      candidate.notionalKrw!,
      quoteToKrw,
    ) * quoteToKrw * (1 + rFee);
    return (sellBithumbNet / buyReferenceCost - 1) * 10_000;
  }

  const sellReferenceNet = executableVwapPrice(
    books.reference,
    "sell",
    candidate.notionalKrw!,
    quoteToKrw,
  ) * quoteToKrw * (1 - rFee);
  const buyBithumbCost = executableVwapPrice(
    books.bithumb,
    "buy",
    candidate.notionalKrw!,
    1,
  ) * (1 + bFee);
  return (sellReferenceNet / buyBithumbCost - 1) * 10_000;
}

function buildFreshPlan(
  candidate: LiveCandidate,
  books: FreshBooks,
): HedgedRelativeValuePlan {
  const freshEdgeBps = observedNetEdgeBps(candidate, books);
  return buildHedgedRelativeValuePlan({
    direction: candidate.direction as RelativeValueDirection,
    notionalKrw: candidate.notionalKrw!,
    market: candidate.market!,
    referenceMarket: candidate.referenceMarket!,
    referenceQuoteToKrw: candidate.referenceQuoteToKrw!,
    bithumb: books.bithumb,
    reference: books.reference,
    minNetEdgeBps: candidate.minNetEdgeBps!,
    observedNetEdgeBps: freshEdgeBps,
    bithumbFeeBps: candidate.bithumbFeeBps!,
    referenceFeeBps: candidate.referenceFeeBps!,
  });
}

async function maybeSubmitPlan(
  plan: HedgedRelativeValuePlan,
  submitOnce: boolean,
): Promise<HedgedRelativeValueExecutionResult | null> {
  if (!submitOnce) return null;
  requireEnvFlag("ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION");

  const bithumbClient = createBithumbPrivateClient({
    accessKey: process.env.BITHUMB_ACCESS_KEY!,
    secretKey: process.env.BITHUMB_SECRET_KEY!,
    restBaseUrl: optionalEnv("BITHUMB_REST_BASE_URL", "https://api.bithumb.com"),
  });
  const binanceClient = createBinancePrivateClient({
    apiKey: process.env.BINANCE_API_KEY!,
    secretKey: process.env.BINANCE_SECRET_KEY!,
    restBaseUrl: optionalEnv("BINANCE_REST_BASE_URL", "https://api.binance.com"),
  });

  return submitHedgedRelativeValueOrder(plan, {
    allowLiveExecution: true,
    venues: {
      bithumb: createBithumbRelativeValueVenue({ client: bithumbClient }),
      binance: createBinanceRelativeValueVenue({
        client: binanceClient,
        quoteToKrw: plan.legs.find((leg) => leg.venue === "binance")?.quoteToKrw ?? 0,
      }),
    },
  });
}

function requireCleanOperationalProof(
  proof: CrossExchangeReadinessReport["operationalProofSummary"],
): void {
  if (proof === null || proof === undefined) {
    throw new Error("cross-exchange operational proof summary is required");
  }
  if (proof.accountFeesConfirmed !== true) {
    throw new Error("cross-exchange operational proof did not confirm account fees");
  }
  if (proof.hedgeVenueReady !== true) {
    throw new Error("cross-exchange operational proof did not confirm hedge venue readiness");
  }
  if (!Array.isArray(proof.reasons) || proof.reasons.length > 0) {
    throw new Error(
      `cross-exchange operational proof is not clean: ${(proof.reasons ?? ["unknown"]).join(", ")}`,
    );
  }
  const deficits = proof.deficits ?? {};
  const nonZeroDeficits = Object.entries(deficits)
    .filter(([, value]) => typeof value !== "number" || !Number.isFinite(value) || value !== 0)
    .map(([key]) => key);
  if (nonZeroDeficits.length > 0) {
    throw new Error(`cross-exchange operational proof has inventory deficits: ${nonZeroDeficits.join(", ")}`);
  }
  if (finiteNonNegative(proof.details?.bithumbFeeBps) === null) {
    throw new Error("cross-exchange operational proof did not include Bithumb fee bps");
  }
  if (finiteNonNegative(proof.details?.referenceFeeBps) === null) {
    throw new Error("cross-exchange operational proof did not include reference fee bps");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const readiness = await readJson<CrossExchangeReadinessReport>(
    args.readinessReportPath!,
  );

  if (readiness.liveReady !== true) {
    throw new Error(
      `cross-exchange live readiness is blocked: ${(readiness.blockers ?? ["unknown"]).join(", ")}`,
    );
  }
  if ((readiness.blockers ?? []).length > 0) {
    throw new Error(`cross-exchange live readiness has blockers: ${(readiness.blockers ?? []).join(", ")}`);
  }

  requireChecklist(readiness.checklist);
  requireCandidate(readiness.candidate);
  requireCleanOperationalProof(readiness.operationalProofSummary);
  requireFreshReadiness(readiness);
  const candidate = candidateWithProofFees(
    readiness.candidate as LiveCandidate,
    readiness.operationalProofSummary!,
  );
  const liveGoal = await readJson<LiveGoalStatus>(args.liveGoalStatusPath!);
  requireRecentTimestamp(
    liveGoal.generatedAt,
    "live goal status",
    optionalPositiveNumberEnv("LIVE_GOAL_STATUS_MAX_AGE_MS", 900_000),
    Date.now(),
  );
  requireLiveGoalCoversCrossExchangeEvidence(liveGoal, readiness);
  requireLiveGoalAllowsCrossExchange(liveGoal, candidate);

  requireEnvFlag("ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION");
  requireEnvFlag("ENABLE_LIVE_EXECUTION");
  requireEnvSecret("BITHUMB_ACCESS_KEY");
  requireEnvSecret("BITHUMB_SECRET_KEY");
  requireEnvSecret("BINANCE_API_KEY");
  requireEnvSecret("BINANCE_SECRET_KEY");

  const books = await fetchFreshBooks(candidate);
  const plan = buildFreshPlan(candidate, books);
  const execution = await maybeSubmitPlan(plan, args.submitOnce);
  const estimatedFreshEdgePnlKrw =
    (plan.notionalKrw * plan.observedNetEdgeBps) / 10_000;
  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.submitOnce
      ? "cross_exchange_relative_value_live_submit_once"
      : "cross_exchange_relative_value_live_plan",
    liveReady: true,
    candidate,
    freshObservedNetEdgeBps: plan.observedNetEdgeBps,
    estimatedFreshEdgePnlKrw,
    submitted: args.submitOnce,
    realizedPnlKrw: execution === null
      ? null
      : execution.reconciliation.realizedNetPnlKrw,
    realizedNetPnlKrw: execution === null
      ? null
      : execution.reconciliation.realizedNetPnlKrw,
    realizedNetEdgeBps: execution === null
      ? null
      : execution.reconciliation.realizedNetEdgeBps,
    realizedFeeKrw: execution === null
      ? null
      : execution.reconciliation.realizedFeeKrw,
    realizedGrossPnlKrw: execution === null
      ? null
      : execution.reconciliation.realizedGrossPnlKrw,
    realizedGrossEdgeBps: execution === null
      ? null
      : execution.reconciliation.realizedGrossEdgeBps,
    freshPlan: plan,
    execution,
    interpretation: args.submitOnce
      ? "Cross-exchange live order submission was requested through the fail-closed hedged executor. realizedPnlKrw is fee-adjusted after filled-leg reconciliation."
      : "Cross-exchange live plan passed fresh-book validation. freshObservedNetEdgeBps and estimatedFreshEdgePnlKrw are executable-price estimates, not realized live PnL. Order submission remains disabled without --submit-once and ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION=true.",
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
