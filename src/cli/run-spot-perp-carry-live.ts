import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildSpotPerpCarryEntryPlan,
  type SpotPerpCarryBook,
  type SpotPerpCarryBookLevel,
  submitSpotPerpCarryEntry,
} from "../execution/spot-perp-carry-live.js";
import {
  createBinanceUsdMFuturesPrivateClient,
  createBinanceUsdMFuturesSpotPerpCarryVenue,
} from "../live/binance.js";
import {
  createBithumbPrivateClient,
  createBithumbSpotPerpCarryVenue,
} from "../live/bithumb.js";
import { assertLiveGoalCompletionAuditAllowsStartup } from "../runtime/live-goal-completion-audit.js";

interface Args {
  readinessReportPath: string | null;
  carryReportPath: string | null;
  liveGoalStatusPath: string | null;
  market: string | null;
  outputPath: string | null;
  submitOnce: boolean;
  requireLiveReady: boolean;
}

interface CarryReport {
  generatedAt?: string;
  assumptions?: {
    notionalKrw?: number;
    bithumbFeeBps?: number;
    binanceTakerFeeBps?: number;
    exitCostBufferBps?: number;
    minNetCarryBps?: number;
  };
  perMarketSummary?: Array<{
    market?: string;
    symbol?: string;
    executionEligibleMedianNetCarryBps?: number | null;
    watchDecision?: { status?: string };
  }>;
}

interface CarryReadinessReport {
  generatedAt?: string;
  liveReady?: boolean;
  reasons?: string[];
  checks?: Record<string, boolean>;
  evidence?: {
    perMarketSummary?: Array<{
      market?: string;
      symbol?: string;
      watchDecision?: { status?: string };
    }>;
    operationalProof?: {
      details?: {
        bithumbBidFeeBpsByMarket?: Record<string, number | null>;
        binanceFuturesTakerFeeBpsBySymbol?: Record<string, number | null>;
        referenceQuoteToKrw?: number;
      };
    };
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
    symbol?: string | null;
  } | null;
  blockers?: string[];
}

interface Candidate {
  market: string;
  symbol: string;
  direction: "long_bithumb_spot_short_binance_perp";
  notionalKrw: number;
  bithumbFeeBps: number;
  binanceFuturesFeeBps: number;
  quoteToKrw: number;
  minNetCarryBps: number;
  exitCostBufferBps: number;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    readinessReportPath: null,
    carryReportPath: null,
    liveGoalStatusPath: null,
    market: null,
    outputPath: null,
    submitOnce: false,
    requireLiveReady: false,
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
    if (arg === "--carry-report") {
      if (!value) throw new Error("--carry-report requires a value");
      args.carryReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--live-goal-status") {
      if (!value) throw new Error("--live-goal-status requires a value");
      args.liveGoalStatusPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--market") {
      if (!value) throw new Error("--market requires a value");
      args.market = value;
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
    if (arg === "--require-live-ready") {
      args.requireLiveReady = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.readinessReportPath === null) throw new Error("--readiness-report is required");
  if (args.carryReportPath === null) throw new Error("--carry-report is required");
  if (args.submitOnce && args.outputPath === null) {
    throw new Error("--output is required when --submit-once is used");
  }
  return args;
}

function requireEnvFlag(name: string): void {
  if (process.env[name] !== "true") {
    throw new Error(`${name}=true is required for spot-perp carry live execution`);
  }
}

function requireEnvSecret(name: string): void {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required for spot-perp carry live execution`);
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
  if (!Number.isFinite(timestampMs)) throw new Error(`${label} timestamp is invalid`);
  const ageMs = nowMs - timestampMs;
  if (ageMs < -60_000) throw new Error(`${label} timestamp is in the future`);
  if (ageMs > maxAgeMs) throw new Error(`${label} timestamp is stale`);
}

function timestampMs(value: string | null | undefined, label: string): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} timestamp is required`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is invalid`);
  return parsed;
}

function requireFreshReadiness(readiness: CarryReadinessReport, carry: CarryReport): void {
  const maxAgeMs = optionalPositiveNumberEnv("LIVE_READINESS_MAX_AGE_MS", 900_000);
  const nowMs = Date.now();
  requireRecentTimestamp(readiness.generatedAt, "spot-perp carry readiness", maxAgeMs, nowMs);
  requireRecentTimestamp(carry.generatedAt, "spot-perp carry report", maxAgeMs, nowMs);
}

function requireLiveGoalCoversSpotPerpEvidence(
  liveGoal: LiveGoalStatus,
  readiness: CarryReadinessReport,
  carry: CarryReport,
): void {
  const liveGoalGeneratedAtMs = timestampMs(liveGoal.generatedAt, "live goal status");
  const readinessGeneratedAtMs = timestampMs(readiness.generatedAt, "spot-perp carry readiness");
  const carryGeneratedAtMs = timestampMs(carry.generatedAt, "spot-perp carry report");
  const latestEvidenceMs = Math.max(readinessGeneratedAtMs, carryGeneratedAtMs);
  if (liveGoalGeneratedAtMs < latestEvidenceMs) {
    throw new Error(
      "live goal status is older than the spot-perp carry evidence it is authorizing; refresh the live-goal gate after readiness and carry reports",
    );
  }
}

function requireLiveGoalAllowsSpotPerpCarry(liveGoal: LiveGoalStatus, candidate: Candidate): void {
  if (liveGoal.liveReady !== true || liveGoal.liveStartupAllowed !== true) {
    throw new Error(
      `live goal does not allow spot-perp carry startup: ${(liveGoal.blockers ?? ["liveStartupAllowed"]).join(", ")}`,
    );
  }
  if (liveGoal.completionAudit === undefined) {
    assertLiveGoalCompletionAuditAllowsStartup(undefined, "spot-perp carry startup");
  } else {
    assertLiveGoalCompletionAuditAllowsStartup(liveGoal.completionAudit, "spot-perp carry startup");
  }
  const selected = liveGoal.selectedLiveCandidate;
  if (selected === null || selected === undefined) {
    throw new Error("live goal selectedLiveCandidate is required for spot-perp carry startup");
  }
  const selectedType = selected.type ?? "";
  if (!selectedType.startsWith("spot_perp_carry")) {
    throw new Error(
      `live goal selected candidate is not spot-perp carry: ${selectedType || "unknown"}`,
    );
  }
  if (typeof selected.market === "string" && selected.market !== candidate.market) {
    throw new Error(
      `live goal selected market ${selected.market} does not match requested ${candidate.market}`,
    );
  }
  if (typeof selected.symbol === "string" && selected.symbol !== candidate.symbol) {
    throw new Error(
      `live goal selected symbol ${selected.symbol} does not match requested ${candidate.symbol}`,
    );
  }
}

function requireChecklist(checks: Record<string, boolean> | undefined): void {
  if (checks === undefined || Object.keys(checks).length === 0) {
    throw new Error("spot-perp carry readiness checks are required");
  }
  const failed = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(`spot-perp carry readiness checks failed: ${failed.join(", ")}`);
  }
}

function selectMarket(carry: CarryReport, market: string | null): NonNullable<CarryReport["perMarketSummary"]>[number] {
  const rows = carry.perMarketSummary ?? [];
  const selected =
    market === null
      ? rows.find((row) => row.watchDecision?.status === "metric_candidate") ?? rows[0]
      : rows.find((row) => row.market === market);
  if (selected === undefined) throw new Error("spot-perp carry report does not include a usable market candidate");
  if (typeof selected.market !== "string" || selected.market.length === 0) {
    throw new Error("spot-perp carry candidate market is required");
  }
  if (typeof selected.symbol !== "string" || selected.symbol.length === 0) {
    throw new Error("spot-perp carry candidate symbol is required");
  }
  return selected;
}

function requireReadinessMarket(
  readiness: CarryReadinessReport,
  selected: NonNullable<CarryReport["perMarketSummary"]>[number],
): void {
  const rows = readiness.evidence?.perMarketSummary ?? [];
  if (rows.length === 0) {
    throw new Error("spot-perp carry readiness per-market evidence is required");
  }
  const matched = rows.find(
    (row) => row.market === selected.market && row.symbol === selected.symbol,
  );
  if (matched === undefined) {
    throw new Error(
      `spot-perp carry readiness does not cover requested market ${selected.market}:${selected.symbol}`,
    );
  }
  if (matched.watchDecision?.status !== "metric_candidate") {
    throw new Error(
      `spot-perp carry readiness market ${selected.market}:${selected.symbol} is not a metric_candidate`,
    );
  }
}

function proofFee(
  map: Record<string, number | null> | undefined,
  key: string,
  fallback: number | null,
  label: string,
): number {
  const value = map?.[key] ?? fallback;
  const checked = finiteNonNegative(value);
  if (checked === null) throw new Error(`${label} is required`);
  return checked;
}

function candidateFromReports(
  readiness: CarryReadinessReport,
  carry: CarryReport,
  market: string | null,
): Candidate {
  if (readiness.liveReady !== true) {
    throw new Error(
      `spot-perp carry live readiness is blocked: ${(readiness.reasons ?? ["unknown"]).join(", ")}`,
    );
  }
  requireChecklist(readiness.checks);
  const selected = selectMarket(carry, market);
  requireReadinessMarket(readiness, selected);
  const assumptions = carry.assumptions ?? {};
  const details = readiness.evidence?.operationalProof?.details ?? {};
  const quoteToKrw = finitePositive(details.referenceQuoteToKrw);
  const notionalKrw = finitePositive(assumptions.notionalKrw);
  const minNetCarryBps = finiteNonNegative(assumptions.minNetCarryBps);
  const exitCostBufferBps = finiteNonNegative(assumptions.exitCostBufferBps);
  const medianCarry = finitePositive(selected.executionEligibleMedianNetCarryBps);
  if (quoteToKrw === null) throw new Error("spot-perp carry readiness requires referenceQuoteToKrw");
  if (notionalKrw === null) throw new Error("spot-perp carry report requires notionalKrw");
  if (minNetCarryBps === null) throw new Error("spot-perp carry report requires minNetCarryBps");
  if (exitCostBufferBps === null) throw new Error("spot-perp carry report requires exitCostBufferBps");
  if (medianCarry === null) throw new Error("spot-perp carry candidate requires positive median net carry");

  return {
    market: selected.market!,
    symbol: selected.symbol!,
    direction: "long_bithumb_spot_short_binance_perp",
    notionalKrw,
    bithumbFeeBps: proofFee(
      details.bithumbBidFeeBpsByMarket,
      selected.market!,
      finiteNonNegative(assumptions.bithumbFeeBps),
      "Bithumb spot fee bps",
    ),
    binanceFuturesFeeBps: proofFee(
      details.binanceFuturesTakerFeeBpsBySymbol,
      selected.symbol!,
      finiteNonNegative(assumptions.binanceTakerFeeBps),
      "Binance futures fee bps",
    ),
    quoteToKrw,
    minNetCarryBps,
    exitCostBufferBps,
  };
}

function baseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`request failed ${response.status}: ${url}`);
  return (await response.json()) as unknown;
}

function firstRecord(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value) && value[0] !== null && typeof value[0] === "object") {
    return value[0] as Record<string, unknown>;
  }
  throw new Error(`${label} must be a non-empty array`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function numberValue(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive finite number`);
  return parsed;
}

function finiteNumberValue(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function tupleLevel(value: unknown, label: string): SpotPerpCarryBookLevel {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label} must be a price/size tuple`);
  return { price: numberValue(value[0], `${label} price`), size: numberValue(value[1], `${label} size`) };
}

async function fetchBithumbBook(market: string): Promise<SpotPerpCarryBook> {
  const url = new URL(`${baseUrl(optionalEnv("BITHUMB_PUBLIC_REST_BASE_URL", "https://api.bithumb.com/v1"))}/orderbook`);
  url.searchParams.set("markets", market);
  const row = firstRecord(await fetchJson(url.toString()), "bithumb orderbook response");
  const units = row.orderbook_units;
  const unit = firstRecord(units, "bithumb orderbook units");
  const unitRows = Array.isArray(units) ? units : [];
  const bids = unitRows.map((entry, index) => {
    const entryRecord = record(entry, `bithumb orderbook unit ${index}`);
    return {
      price: numberValue(entryRecord.bid_price, `bithumb bid_price ${index}`),
      size: numberValue(entryRecord.bid_size, `bithumb bid_size ${index}`),
    };
  });
  const asks = unitRows.map((entry, index) => {
    const entryRecord = record(entry, `bithumb orderbook unit ${index}`);
    return {
      price: numberValue(entryRecord.ask_price, `bithumb ask_price ${index}`),
      size: numberValue(entryRecord.ask_size, `bithumb ask_size ${index}`),
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

async function fetchBinanceFuturesBook(symbol: string): Promise<SpotPerpCarryBook> {
  const url = new URL(`${baseUrl(optionalEnv("BINANCE_FUTURES_PUBLIC_REST_BASE_URL", "https://fapi.binance.com"))}/fapi/v1/depth`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", "20");
  const row = record(await fetchJson(url.toString()), "binance futures depth response");
  if (!Array.isArray(row.bids) || !Array.isArray(row.asks)) {
    throw new Error("binance futures depth response must include bids and asks");
  }
  const bids = row.bids.map((level, index) => tupleLevel(level, `binance futures bid ${index}`));
  const asks = row.asks.map((level, index) => tupleLevel(level, `binance futures ask ${index}`));
  if (bids.length === 0 || asks.length === 0) throw new Error("binance futures depth response must include bids and asks");
  return {
    bidPrice: bids[0]!.price,
    bidSize: bids[0]!.size,
    askPrice: asks[0]!.price,
    askSize: asks[0]!.size,
    bids,
    asks,
  };
}

interface FundingSnapshot {
  lastFundingRate: number;
  fundingBps: number;
  nextFundingTime: number | null;
}

async function fetchFundingSnapshot(symbol: string): Promise<FundingSnapshot> {
  const url = new URL(`${baseUrl(optionalEnv("BINANCE_FUTURES_PUBLIC_REST_BASE_URL", "https://fapi.binance.com"))}/fapi/v1/premiumIndex`);
  url.searchParams.set("symbol", symbol);
  const row = record(await fetchJson(url.toString()), "binance futures premium index response");
  const lastFundingRate = finiteNumberValue(row.lastFundingRate, "lastFundingRate");
  const nextFundingTime =
    row.nextFundingTime === undefined || row.nextFundingTime === null
      ? null
      : finiteNumberValue(row.nextFundingTime, "nextFundingTime");
  return {
    lastFundingRate,
    fundingBps: lastFundingRate * 10_000,
    nextFundingTime,
  };
}

function feeRate(bps: number): number {
  return bps / 10_000;
}

function levelsForSide(book: SpotPerpCarryBook, side: "buy" | "sell"): SpotPerpCarryBookLevel[] {
  const levels = side === "buy" ? book.asks : book.bids;
  if (Array.isArray(levels) && levels.length > 0) return levels;
  return side === "buy"
    ? [{ price: book.askPrice, size: book.askSize }]
    : [{ price: book.bidPrice, size: book.bidSize }];
}

function executableVwapPrice(
  book: SpotPerpCarryBook,
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

function freshNetCarryBps(
  candidate: Candidate,
  spot: SpotPerpCarryBook,
  perp: SpotPerpCarryBook,
  fundingRate: number,
): number {
  const spotCost = executableVwapPrice(spot, "buy", candidate.notionalKrw, 1) *
    (1 + feeRate(candidate.bithumbFeeBps));
  const perpShortProceeds = executableVwapPrice(perp, "sell", candidate.notionalKrw, candidate.quoteToKrw) *
    candidate.quoteToKrw *
    (1 - feeRate(candidate.binanceFuturesFeeBps));
  const basisEntryEdgeBps = (perpShortProceeds / spotCost - 1) * 10_000;
  return basisEntryEdgeBps + fundingRate * 10_000 - candidate.exitCostBufferBps;
}

function freshBasis(
  candidate: Candidate,
  spot: SpotPerpCarryBook,
  perp: SpotPerpCarryBook,
): {
  spotEntryAskKrw: number;
  perpEntryBidUsdt: number;
  usdtKrw: number;
  basisEntryEdgeBps: number;
} {
  const spotEntryAskKrw = executableVwapPrice(spot, "buy", candidate.notionalKrw, 1);
  const perpEntryBidUsdt = executableVwapPrice(perp, "sell", candidate.notionalKrw, candidate.quoteToKrw);
  const spotCost = spotEntryAskKrw * (1 + feeRate(candidate.bithumbFeeBps));
  const perpShortProceeds = perpEntryBidUsdt * candidate.quoteToKrw *
    (1 - feeRate(candidate.binanceFuturesFeeBps));
  return {
    spotEntryAskKrw,
    perpEntryBidUsdt,
    usdtKrw: candidate.quoteToKrw,
    basisEntryEdgeBps: (perpShortProceeds / spotCost - 1) * 10_000,
  };
}

async function maybeSubmitPlan(
  plan: ReturnType<typeof buildSpotPerpCarryEntryPlan>,
  submitOnce: boolean,
): Promise<Awaited<ReturnType<typeof submitSpotPerpCarryEntry>> | null> {
  if (!submitOnce) return null;
  requireEnvFlag("ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION");
  const bithumbClient = createBithumbPrivateClient({
    accessKey: process.env.BITHUMB_ACCESS_KEY!,
    secretKey: process.env.BITHUMB_SECRET_KEY!,
    restBaseUrl: optionalEnv("BITHUMB_REST_BASE_URL", "https://api.bithumb.com"),
  });
  const binanceFuturesClient = createBinanceUsdMFuturesPrivateClient({
    apiKey: process.env.BINANCE_API_KEY!,
    secretKey: process.env.BINANCE_SECRET_KEY!,
    restBaseUrl: optionalEnv("BINANCE_FUTURES_REST_BASE_URL", "https://fapi.binance.com"),
  });
  const perpLeg = plan.legs.find((leg) => leg.venue === "binance_usdm");
  return submitSpotPerpCarryEntry(plan, {
    allowLiveExecution: true,
    venues: {
      bithumb: createBithumbSpotPerpCarryVenue({ client: bithumbClient }),
      binance_usdm: createBinanceUsdMFuturesSpotPerpCarryVenue({
        client: binanceFuturesClient,
        quoteToKrw: perpLeg?.quoteToKrw ?? 0,
      }),
    },
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const readiness = await readJson<CarryReadinessReport>(args.readinessReportPath!);
  const carry = await readJson<CarryReport>(args.carryReportPath!);
  requireFreshReadiness(readiness, carry);
  const candidate = candidateFromReports(readiness, carry, args.market);
  if (args.liveGoalStatusPath === null) {
    throw new Error("--live-goal-status is required for spot-perp carry live execution");
  }
  const liveGoal = await readJson<LiveGoalStatus>(args.liveGoalStatusPath);
  requireRecentTimestamp(
    liveGoal.generatedAt,
    "live goal status",
    optionalPositiveNumberEnv("LIVE_GOAL_STATUS_MAX_AGE_MS", 900_000),
    Date.now(),
  );
  requireLiveGoalCoversSpotPerpEvidence(liveGoal, readiness, carry);
  requireLiveGoalAllowsSpotPerpCarry(liveGoal, candidate);

  requireEnvFlag("ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION");
  requireEnvFlag("ENABLE_LIVE_EXECUTION");
  requireEnvSecret("BITHUMB_ACCESS_KEY");
  requireEnvSecret("BITHUMB_SECRET_KEY");
  requireEnvSecret("BINANCE_API_KEY");
  requireEnvSecret("BINANCE_SECRET_KEY");

  const [spot, perp, funding] = await Promise.all([
    fetchBithumbBook(candidate.market),
    fetchBinanceFuturesBook(candidate.symbol),
    fetchFundingSnapshot(candidate.symbol),
  ]);
  const basis = freshBasis(candidate, spot, perp);
  const observedNetCarryBps = freshNetCarryBps(candidate, spot, perp, funding.lastFundingRate);
  const plan = buildSpotPerpCarryEntryPlan({
    direction: "long_bithumb_spot_short_binance_perp",
    notionalKrw: candidate.notionalKrw,
    market: candidate.market,
    symbol: candidate.symbol,
    quoteToKrw: candidate.quoteToKrw,
    spot,
    perp,
    minNetCarryBps: candidate.minNetCarryBps,
    observedNetCarryBps,
    bithumbFeeBps: candidate.bithumbFeeBps,
    binanceFuturesFeeBps: candidate.binanceFuturesFeeBps,
  });
  const execution = await maybeSubmitPlan(plan, args.submitOnce);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.submitOnce
      ? "spot_perp_carry_live_submit_once"
      : "spot_perp_carry_live_plan",
    liveReady: true,
    submitted: args.submitOnce,
    candidate,
    funding,
    basis,
    freshObservedNetCarryBps: observedNetCarryBps,
    estimatedFreshCarryPnlKrw: candidate.notionalKrw * observedNetCarryBps / 10_000,
    reconcileMode: "filled_pair_only",
    reconciliation: execution?.reconciliation ?? null,
    realizedNetPnlKrw: execution?.reconciliation.realizedNetPnlKrw ?? null,
    realizedNetEdgeBps: execution?.reconciliation.realizedNetEdgeBps ?? null,
    realizedEntryNetPnlKrw: execution?.reconciliation.realizedEntryNetPnlKrw ?? null,
    realizedFeeKrw: execution?.reconciliation.realizedFeeKrw ?? null,
    realizedGrossPnlKrw: execution?.reconciliation.realizedEntryGrossPnlKrw ?? null,
    freshPlan: plan,
    execution,
    interpretation: args.submitOnce
      ? "Spot-perp carry live entry submission was requested through the fail-closed paired executor. realizedNetPnlKrw is entry-leg fee-adjusted reconciliation only; final carry PnL still requires funding settlement and unwind reconciliation."
      : "Spot-perp carry live plan passed fresh-book validation. Order submission remains disabled without --submit-once and ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION=true.",
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
