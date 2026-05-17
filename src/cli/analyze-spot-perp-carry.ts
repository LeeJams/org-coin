import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  inputObservationsPath: string | null;
  outputPath: string | null;
  markets: MarketSpec[];
  explicitMarkets: boolean;
  autoTopFundingMarkets: number | null;
  autoTopCurrentCarryMarkets: number | null;
  notionalKrw: number;
  bithumbFeeBps: number;
  binanceTakerFeeBps: number;
  exitCostBufferBps: number;
  minObservations: number;
  minCompletedFundingEvents: number;
  minObservationSpanMinutes: number;
  minNetCarryBps: number;
  minPositiveCarryRate: number;
  minDepthCoverageRate: number;
  maxSpotSpreadBps: number;
  maxPerpSpreadBps: number;
  maxUsdtKrwSpreadBps: number;
  maxLatestAgeHours: number;
  accountFeesConfirmed: boolean;
  inventoryReady: boolean;
  hedgeVenueReady: boolean;
  nowMs: number;
  durationSeconds: number;
  snapshotIntervalMs: number;
  appendExistingOutput: boolean;
  filterInputToMarkets: boolean;
  requirePromotion: boolean;
  quiet: boolean;
}

interface MarketSpec {
  market: string;
  symbol: string;
}

interface BookLevel {
  price: number;
  size: number;
}

interface VenueBook {
  venue: "bithumb" | "binance";
  market: string;
  bidPrice: number;
  askPrice: number;
  bids: BookLevel[];
  asks: BookLevel[];
  timestampMs: number | null;
  receivedAtMs: number | null;
}

interface FundingSnapshot {
  symbol: string;
  lastFundingRate: number;
  nextFundingTimeMs: number | null;
  settledAtMs: number | null;
  markPrice: number | null;
  indexPrice: number | null;
}

interface Observation {
  capturedAt: string;
  market: string;
  symbol: string;
  spot: VenueBook;
  perp: VenueBook;
  usdtKrw: VenueBook;
  funding: FundingSnapshot;
}

interface CarryRow {
  capturedAt: string;
  market: string;
  symbol: string;
  direction: "long_bithumb_spot_short_binance_perp" | "unsupported_negative_funding";
  fundingRate: number;
  fundingBps: number;
  fundingCompleted: boolean;
  fundingSettledAt: string | null;
  basisEntryEdgeBps: number;
  netCarryBps: number;
  estimatedNetPnlKrw: number;
  spotSpreadBps: number;
  perpSpreadBps: number;
  usdtKrwSpreadBps: number;
  spotBuyDepthKrw: number | null;
  perpSellDepthKrw: number | null;
  usdtKrwSellDepthKrw: number | null;
  depthCovered: boolean;
  nextFundingTime: string | null;
}

type ExecutionRejectionReason =
  | "unsupportedFundingDirection"
  | "fundingNotCompleted"
  | "depthInsufficient"
  | "spotSpreadTooWide"
  | "perpSpreadTooWide"
  | "usdtKrwSpreadTooWide"
  | "rawNetCarryOutsideSanityBand";

interface Summary {
  count: number;
  supportedFundingCount: number;
  completedFundingCount: number;
  positiveCount: number;
  positiveRate: number | null;
  executionEligibleCount: number;
  executionEligibleRate: number | null;
  executionRejectedCount: number;
  executionRejectedRate: number | null;
  executionRejectionReasons: Record<ExecutionRejectionReason, number>;
  spreadControl: SpreadControlSummary;
  spreadSensitivity: SpreadSensitivitySummary[];
  executionEligiblePositiveCount: number;
  executionEligiblePositiveRate: number | null;
  executionEligibleMedianNetCarryBps: number | null;
  executionEligibleTotalEstimatedNetPnlKrw: number;
  rawPricingArtifactCount: number;
  rawPricingArtifactEstimatedNetPnlKrw: number;
  artifactExcludedCount: number;
  artifactExcludedMedianNetCarryBps: number | null;
  artifactExcludedAverageNetCarryBps: number | null;
  artifactExcludedTotalEstimatedNetPnlKrw: number;
  depthCoveredCount: number;
  depthCoverageRate: number | null;
  medianNetCarryBps: number | null;
  averageNetCarryBps: number | null;
  maxNetCarryBps: number | null;
  minNetCarryBps: number | null;
  totalEstimatedNetPnlKrw: number;
}

interface SpreadSensitivitySummary {
  maxSpotSpreadBps: number;
  maxPerpSpreadBps: number;
  maxUsdtKrwSpreadBps: number;
  executionEligibleCount: number;
  executionEligibleRate: number | null;
  spreadRejectedCount: number;
  spreadRejectedRate: number | null;
  completedFundingWindowCount: number;
  executableSampleCount: number;
  positiveWindowRate: number | null;
  medianWindowNetCarryBps: number | null;
  estimatedNetPnlKrwAcrossFundingWindows: number | null;
  interpretation: string;
}

interface SpreadControlSummary {
  passed: boolean;
  required: boolean;
  spreadRejectedCount: number;
  spreadRejectedRate: number | null;
  executionEligibleRate: number | null;
  minExecutionEligibleRate: number;
  maxSpreadRejectionRate: number;
  thresholds: {
    maxSpotSpreadBps: number;
    maxPerpSpreadBps: number;
    maxUsdtKrwSpreadBps: number;
  };
  rejectionReasons: Pick<
    Record<ExecutionRejectionReason, number>,
    "spotSpreadTooWide" | "perpSpreadTooWide" | "usdtKrwSpreadTooWide"
  >;
  spreadStats: {
    spot: SpreadStats;
    perp: SpreadStats;
    usdtKrw: SpreadStats;
  };
  fundingWindows: FundingWindowSpreadControlSummary[];
  interpretation: string;
}

interface SpreadStats {
  medianBps: number | null;
  p90Bps: number | null;
  maxBps: number | null;
}

interface FundingWindowSpreadControlSummary {
  fundingSettledAt: string;
  sampleCount: number;
  spreadRejectedCount: number;
  spreadRejectedRate: number | null;
  rejectionReasons: Pick<
    Record<ExecutionRejectionReason, number>,
    "spotSpreadTooWide" | "perpSpreadTooWide" | "usdtKrwSpreadTooWide"
  >;
  spreadStats: {
    spot: SpreadStats;
    perp: SpreadStats;
    usdtKrw: SpreadStats;
  };
}

interface PerMarketSummary extends Summary {
  market: string;
  symbol: string;
  fundingWindowSummary: FundingWindowCarrySummary;
  watchDecision: PerMarketWatchDecision;
}

interface PerMarketWatchDecision {
  status: "collect_more_evidence" | "kill_candidate" | "metric_candidate";
  reasons: string[];
  requiredBeforeMetricCandidate: string[];
  killPolicy: {
    minCompletedFundingEventsBeforeKill: number;
    minMedianNetCarryBps: number;
    minPositiveCarryRate: number;
    minExecutionEligibleRate: number;
    minDepthCoverageRate: number;
  };
}

interface FundingWindowCarrySummary {
  source: "all_execution_eligible_rows_grouped_by_market_symbol_fundingSettledAt";
  completedFundingWindowCount: number;
  executableSampleCount: number;
  positiveWindowCount: number;
  positiveWindowRate: number | null;
  medianWindowNetCarryBps: number | null;
  medianWindowCarryPct: number | null;
  medianWindowEstimatedNetPnlKrw: number | null;
  estimatedNetPnlKrwAcrossFundingWindows: number | null;
  isDeduplicatedByFundingWindow: true;
  isNotRealizedReturn: true;
  interpretation: string;
  windows: FundingWindowCarrySummaryWindow[];
}

interface FundingWindowCarrySummaryWindow {
  market: string;
  symbol: string;
  fundingSettledAt: string;
  sampleCount: number;
  medianNetCarryBps: number | null;
  bestNetCarryBps: number | null;
  worstNetCarryBps: number | null;
  medianEstimatedNetPnlKrw: number | null;
  bestEstimatedNetPnlKrw: number | null;
  worstEstimatedNetPnlKrw: number | null;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
}

interface CurrentCarryDiscoveryCandidate extends MarketSpec {
  fundingRate: number;
  fundingBps: number;
  basisEntryEdgeBps: number;
  currentNetCarryBps: number;
  spotSpreadBps: number;
  perpSpreadBps: number;
  usdtKrwSpreadBps: number;
}

const BITHUMB_REST_BASE_URL = "https://api.bithumb.com/v1";
const BINANCE_FUTURES_REST_BASE_URL = "https://fapi.binance.com";
const PER_MARKET_KILL_MIN_COMPLETED_FUNDING_EVENTS = 2;
const PER_MARKET_KILL_MIN_MEDIAN_NET_CARRY_BPS = 20;
const PER_MARKET_KILL_MIN_EXECUTION_ELIGIBLE_RATE = 0.5;
const SPREAD_CONTROL_MIN_EXECUTION_ELIGIBLE_RATE = 0.95;
const SPREAD_CONTROL_MAX_REJECTION_RATE = 0.05;
const MAX_EXECUTION_NET_CARRY_SANITY_BPS = 1_000;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    inputObservationsPath: null,
    outputPath: null,
    markets: [
      { market: "KRW-BTC", symbol: "BTCUSDT" },
      { market: "KRW-ETH", symbol: "ETHUSDT" },
      { market: "KRW-XRP", symbol: "XRPUSDT" },
      { market: "KRW-SOL", symbol: "SOLUSDT" },
      { market: "KRW-DOGE", symbol: "DOGEUSDT" },
      { market: "KRW-LINK", symbol: "LINKUSDT" },
    ],
    explicitMarkets: false,
    autoTopFundingMarkets: null,
    autoTopCurrentCarryMarkets: null,
    notionalKrw: 500_000,
    bithumbFeeBps: 4,
    binanceTakerFeeBps: 5,
    exitCostBufferBps: 20,
    minObservations: 18,
    minCompletedFundingEvents: 6,
    minObservationSpanMinutes: 4_320,
    minNetCarryBps: 10,
    minPositiveCarryRate: 0.67,
    minDepthCoverageRate: 0.95,
    maxSpotSpreadBps: 30,
    maxPerpSpreadBps: 10,
    maxUsdtKrwSpreadBps: 20,
    maxLatestAgeHours: 1,
    accountFeesConfirmed: false,
    inventoryReady: false,
    hedgeVenueReady: false,
    nowMs: Date.now(),
    durationSeconds: 0,
    snapshotIntervalMs: 60_000,
    appendExistingOutput: false,
    filterInputToMarkets: false,
    requirePromotion: false,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--input-observations") {
      if (!value) throw new Error("--input-observations requires a value");
      args.inputObservationsPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--markets") {
      if (!value) throw new Error("--markets requires comma-separated MARKET:SYMBOL values");
      args.markets = parseMarkets(value);
      args.explicitMarkets = true;
      index += 1;
      continue;
    }
    if (arg === "--auto-top-funding-markets") {
      if (!value) throw new Error("--auto-top-funding-markets requires a value");
      args.autoTopFundingMarkets = positiveInteger(value, "--auto-top-funding-markets");
      index += 1;
      continue;
    }
    if (arg === "--auto-top-current-carry-markets") {
      if (!value) throw new Error("--auto-top-current-carry-markets requires a value");
      args.autoTopCurrentCarryMarkets = positiveInteger(
        value,
        "--auto-top-current-carry-markets",
      );
      index += 1;
      continue;
    }
    if (arg === "--notional-krw") {
      if (!value) throw new Error("--notional-krw requires a value");
      args.notionalKrw = positiveNumber(value, "--notional-krw");
      index += 1;
      continue;
    }
    if (arg === "--bithumb-fee-bps") {
      if (!value) throw new Error("--bithumb-fee-bps requires a value");
      args.bithumbFeeBps = nonNegativeNumber(value, "--bithumb-fee-bps");
      index += 1;
      continue;
    }
    if (arg === "--binance-taker-fee-bps") {
      if (!value) throw new Error("--binance-taker-fee-bps requires a value");
      args.binanceTakerFeeBps = nonNegativeNumber(value, "--binance-taker-fee-bps");
      index += 1;
      continue;
    }
    if (arg === "--exit-cost-buffer-bps") {
      if (!value) throw new Error("--exit-cost-buffer-bps requires a value");
      args.exitCostBufferBps = nonNegativeNumber(value, "--exit-cost-buffer-bps");
      index += 1;
      continue;
    }
    if (arg === "--min-observations") {
      if (!value) throw new Error("--min-observations requires a value");
      args.minObservations = positiveInteger(value, "--min-observations");
      index += 1;
      continue;
    }
    if (arg === "--min-completed-funding-events") {
      if (!value) throw new Error("--min-completed-funding-events requires a value");
      args.minCompletedFundingEvents = positiveInteger(value, "--min-completed-funding-events");
      index += 1;
      continue;
    }
    if (arg === "--min-observation-span-minutes") {
      if (!value) throw new Error("--min-observation-span-minutes requires a value");
      args.minObservationSpanMinutes = nonNegativeNumber(value, "--min-observation-span-minutes");
      index += 1;
      continue;
    }
    if (arg === "--min-net-carry-bps") {
      if (!value) throw new Error("--min-net-carry-bps requires a value");
      args.minNetCarryBps = nonNegativeNumber(value, "--min-net-carry-bps");
      index += 1;
      continue;
    }
    if (arg === "--min-positive-carry-rate") {
      if (!value) throw new Error("--min-positive-carry-rate requires a value");
      args.minPositiveCarryRate = rate(value, "--min-positive-carry-rate");
      index += 1;
      continue;
    }
    if (arg === "--min-depth-coverage-rate") {
      if (!value) throw new Error("--min-depth-coverage-rate requires a value");
      args.minDepthCoverageRate = rate(value, "--min-depth-coverage-rate");
      index += 1;
      continue;
    }
    if (arg === "--max-spot-spread-bps") {
      if (!value) throw new Error("--max-spot-spread-bps requires a value");
      args.maxSpotSpreadBps = positiveNumber(value, "--max-spot-spread-bps");
      index += 1;
      continue;
    }
    if (arg === "--max-perp-spread-bps") {
      if (!value) throw new Error("--max-perp-spread-bps requires a value");
      args.maxPerpSpreadBps = positiveNumber(value, "--max-perp-spread-bps");
      index += 1;
      continue;
    }
    if (arg === "--max-usdt-krw-spread-bps") {
      if (!value) throw new Error("--max-usdt-krw-spread-bps requires a value");
      args.maxUsdtKrwSpreadBps = positiveNumber(value, "--max-usdt-krw-spread-bps");
      index += 1;
      continue;
    }
    if (arg === "--max-latest-age-hours") {
      if (!value) throw new Error("--max-latest-age-hours requires a value");
      args.maxLatestAgeHours = positiveNumber(value, "--max-latest-age-hours");
      index += 1;
      continue;
    }
    if (arg === "--now") {
      if (!value) throw new Error("--now requires an ISO timestamp");
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) throw new Error("--now must be a valid ISO timestamp");
      args.nowMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--duration-seconds") {
      if (!value) throw new Error("--duration-seconds requires a value");
      args.durationSeconds = nonNegativeNumber(value, "--duration-seconds");
      index += 1;
      continue;
    }
    if (arg === "--snapshot-interval-ms") {
      if (!value) throw new Error("--snapshot-interval-ms requires a value");
      args.snapshotIntervalMs = positiveInteger(value, "--snapshot-interval-ms");
      index += 1;
      continue;
    }
    if (arg === "--append-existing-output") {
      args.appendExistingOutput = true;
      continue;
    }
    if (arg === "--filter-input-to-markets") {
      args.filterInputToMarkets = true;
      continue;
    }
    if (arg === "--account-fees-confirmed") {
      args.accountFeesConfirmed = true;
      continue;
    }
    if (arg === "--inventory-ready") {
      args.inventoryReady = true;
      continue;
    }
    if (arg === "--hedge-venue-ready") {
      args.hedgeVenueReady = true;
      continue;
    }
    if (arg === "--require-promotion") {
      args.requirePromotion = true;
      continue;
    }
    if (arg === "--quiet") {
      args.quiet = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.autoTopFundingMarkets !== null && args.explicitMarkets) {
    throw new Error("--auto-top-funding-markets cannot be combined with --markets");
  }
  if (args.autoTopFundingMarkets !== null && args.inputObservationsPath !== null) {
    throw new Error("--auto-top-funding-markets cannot be combined with --input-observations");
  }
  if (args.autoTopCurrentCarryMarkets !== null && args.explicitMarkets) {
    throw new Error("--auto-top-current-carry-markets cannot be combined with --markets");
  }
  if (args.autoTopCurrentCarryMarkets !== null && args.inputObservationsPath !== null) {
    throw new Error("--auto-top-current-carry-markets cannot be combined with --input-observations");
  }
  if (args.autoTopFundingMarkets !== null && args.autoTopCurrentCarryMarkets !== null) {
    throw new Error(
      "--auto-top-funding-markets cannot be combined with --auto-top-current-carry-markets",
    );
  }

  return args;
}

function parseMarkets(value: string): MarketSpec[] {
  const markets = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [market, symbol] = entry.split(":");
      if (!market || !symbol) throw new Error("--markets entries must be formatted MARKET:SYMBOL");
      return { market, symbol };
    });
  if (markets.length === 0) throw new Error("--markets requires at least one entry");
  return markets;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function nonNegativeNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be non-negative`);
  return parsed;
}

function positiveInteger(value: string, label: string): number {
  const parsed = positiveNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function rate(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
  return parsed;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function loadObservations(path: string): Promise<Observation[]> {
  const parsed = await readJson(path);
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed !== null &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { observations?: unknown }).observations)
      ? (parsed as { observations: unknown[] }).observations
      : null;
  if (rows === null) throw new Error("--input-observations must contain an array or observations array");
  return rows.map((row) => normalizeObservation(row));
}

async function loadExistingOutputObservations(path: string): Promise<Observation[]> {
  try {
    return await loadObservations(path);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

function normalizeObservation(value: unknown): Observation {
  if (value === null || typeof value !== "object") throw new Error("observation must be an object");
  const row = value as Record<string, unknown>;
  return {
    capturedAt: stringValue(row.capturedAt, "capturedAt"),
    market: stringValue(row.market, "market"),
    symbol: stringValue(row.symbol, "symbol"),
    spot: normalizeBook(row.spot, "bithumb"),
    perp: normalizeBook(row.perp, "binance"),
    usdtKrw: normalizeBook(row.usdtKrw, "bithumb"),
    funding: normalizeFunding(row.funding),
  };
}

function filterObservationsToMarkets(observations: Observation[], markets: MarketSpec[]): Observation[] {
  const allowed = new Set(markets.map((market) => `${market.market}:${market.symbol}`));
  return observations.filter((observation) =>
    allowed.has(`${observation.market}:${observation.symbol}`),
  );
}

function observationDedupeKey(observation: Observation): string {
  return [
    observation.market,
    observation.symbol,
    observation.capturedAt,
    observation.funding.settledAtMs ?? "unsettled",
  ].join("|");
}

function dedupeObservations(observations: Observation[]): Observation[] {
  const seen = new Set<string>();
  const deduped: Observation[] = [];
  for (const observation of observations) {
    const key = observationDedupeKey(observation);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(observation);
  }
  return deduped;
}

function normalizeBook(value: unknown, venue: VenueBook["venue"]): VenueBook {
  if (value === null || typeof value !== "object") throw new Error(`${venue} book must be an object`);
  const row = value as Record<string, unknown>;
  const bidPrice = requiredPositive(row.bidPrice, `${venue}.bidPrice`);
  const askPrice = requiredPositive(row.askPrice, `${venue}.askPrice`);
  const bidSize = finiteNumber(row.bidSize);
  const askSize = finiteNumber(row.askSize);
  return {
    venue,
    market: stringValue(row.market, `${venue}.market`),
    bidPrice,
    askPrice,
    bids: normalizeLevels(row.bids, bidPrice, bidSize),
    asks: normalizeLevels(row.asks, askPrice, askSize),
    timestampMs: finiteNumber(row.timestampMs),
    receivedAtMs: finiteNumber(row.receivedAtMs),
  };
}

function normalizeLevels(value: unknown, fallbackPrice: number, fallbackSize: number | null): BookLevel[] {
  if (Array.isArray(value)) {
    const levels = value
      .map((level) => {
        if (level === null || typeof level !== "object") return null;
        const row = level as Record<string, unknown>;
        const price = finiteNumber(row.price);
        const size = finiteNumber(row.size);
        return price !== null && price > 0 && size !== null && size > 0 ? { price, size } : null;
      })
      .filter((level): level is BookLevel => level !== null);
    if (levels.length > 0) return levels;
  }
  return fallbackSize !== null && fallbackSize > 0 ? [{ price: fallbackPrice, size: fallbackSize }] : [];
}

function normalizeFunding(value: unknown): FundingSnapshot {
  if (value === null || typeof value !== "object") throw new Error("funding must be an object");
  const row = value as Record<string, unknown>;
  return {
    symbol: stringValue(row.symbol, "funding.symbol"),
    lastFundingRate: requiredFinite(row.lastFundingRate, "funding.lastFundingRate"),
    nextFundingTimeMs: finiteNumber(row.nextFundingTimeMs ?? row.nextFundingTime),
    settledAtMs: finiteNumber(row.settledAtMs ?? row.fundingTimeMs ?? row.fundingTime),
    markPrice: finiteNumber(row.markPrice),
    indexPrice: finiteNumber(row.indexPrice),
  };
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requiredFinite(value: unknown, label: string): number {
  const parsed = finiteNumber(value);
  if (parsed === null) throw new Error(`${label} must be finite`);
  return parsed;
}

function requiredPositive(value: unknown, label: string): number {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`request failed ${response.status}: ${url}`);
  return (await response.json()) as unknown;
}

function firstOrderbookRow(payload: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(payload) && payload[0] !== null && typeof payload[0] === "object") {
    return payload[0] as Record<string, unknown>;
  }
  throw new Error(`${label} orderbook response must be a non-empty array`);
}

function venueLevels(row: Record<string, unknown>, side: "bid" | "ask"): BookLevel[] {
  const units = row.orderbook_units;
  if (!Array.isArray(units)) return [];
  return units
    .map((unit) => {
      if (unit === null || typeof unit !== "object") return null;
      const item = unit as Record<string, unknown>;
      const price = finiteNumber(item[`${side}_price`]);
      const size = finiteNumber(item[`${side}_size`]);
      return price !== null && price > 0 && size !== null && size > 0 ? { price, size } : null;
    })
    .filter((level): level is BookLevel => level !== null);
}

async function fetchBithumbBook(market: string): Promise<VenueBook> {
  const url = new URL(`${BITHUMB_REST_BASE_URL}/orderbook`);
  url.searchParams.set("markets", market);
  const row = firstOrderbookRow(await fetchJson(url.toString()), "bithumb");
  const unit = firstOrderbookUnit(row, "bithumb");
  return {
    venue: "bithumb",
    market,
    bidPrice: requiredPositive(unit.bid_price, "bithumb.bid_price"),
    askPrice: requiredPositive(unit.ask_price, "bithumb.ask_price"),
    bids: venueLevels(row, "bid"),
    asks: venueLevels(row, "ask"),
    timestampMs: finiteNumber(row.timestamp ?? row.timestampMs),
    receivedAtMs: Date.now(),
  };
}

function firstOrderbookUnit(row: Record<string, unknown>, label: string): Record<string, unknown> {
  const units = row.orderbook_units;
  if (Array.isArray(units) && units[0] !== null && typeof units[0] === "object") {
    return units[0] as Record<string, unknown>;
  }
  throw new Error(`${label} orderbook response has no orderbook_units`);
}

async function fetchBinancePerpBook(symbol: string): Promise<VenueBook> {
  const url = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/depth`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", "20");
  const payload = await fetchJson(url.toString());
  if (payload === null || typeof payload !== "object") {
    throw new Error("binance futures depth response must be an object");
  }
  const row = payload as Record<string, unknown>;
  const bids = binanceLevels(row.bids);
  const asks = binanceLevels(row.asks);
  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (bestBid === undefined || bestAsk === undefined) {
    throw new Error("binance futures depth response must include bids and asks");
  }
  return {
    venue: "binance",
    market: symbol,
    bidPrice: bestBid.price,
    askPrice: bestAsk.price,
    bids,
    asks,
    timestampMs: finiteNumber(row.E ?? row.T),
    receivedAtMs: Date.now(),
  };
}

function binanceLevels(value: unknown): BookLevel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((level) => {
      if (!Array.isArray(level)) return null;
      const price = finiteNumber(level[0]);
      const size = finiteNumber(level[1]);
      return price !== null && price > 0 && size !== null && size > 0 ? { price, size } : null;
    })
    .filter((level): level is BookLevel => level !== null);
}

async function fetchFunding(symbol: string): Promise<FundingSnapshot> {
  const premiumUrl = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/premiumIndex`);
  premiumUrl.searchParams.set("symbol", symbol);
  const historyUrl = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/fundingRate`);
  historyUrl.searchParams.set("symbol", symbol);
  historyUrl.searchParams.set("limit", "1");
  const [premiumPayload, historyPayload] = await Promise.all([
    fetchJson(premiumUrl.toString()),
    fetchJson(historyUrl.toString()),
  ]);
  if (premiumPayload === null || typeof premiumPayload !== "object" || Array.isArray(premiumPayload)) {
    throw new Error("binance premium index response must be an object");
  }
  const row = premiumPayload as Record<string, unknown>;
  const settled = latestSettledFunding(historyPayload);
  return {
    symbol,
    lastFundingRate: settled?.fundingRate ?? requiredFinite(row.lastFundingRate, "lastFundingRate"),
    nextFundingTimeMs: finiteNumber(row.nextFundingTime),
    settledAtMs: settled?.settledAtMs ?? null,
    markPrice: finiteNumber(row.markPrice),
    indexPrice: finiteNumber(row.indexPrice),
  };
}

async function discoverTopFundingMarkets(limit: number): Promise<MarketSpec[]> {
  const marketUrl = new URL(`${BITHUMB_REST_BASE_URL}/market/all`);
  marketUrl.searchParams.set("isDetails", "false");
  const premiumUrl = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/premiumIndex`);
  const exchangeInfoUrl = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/exchangeInfo`);
  const [bithumbPayload, premiumPayload, exchangeInfoPayload] = await Promise.all([
    fetchJson(marketUrl.toString()),
    fetchJson(premiumUrl.toString()),
    fetchJson(exchangeInfoUrl.toString()),
  ]);
  if (!Array.isArray(bithumbPayload)) {
    throw new Error("bithumb market list response must be an array");
  }
  if (!Array.isArray(premiumPayload)) {
    throw new Error("binance premium index response must be an array");
  }

  const bithumbKrwBases = new Set(
    bithumbPayload
      .map((row) => {
        if (row === null || typeof row !== "object") return null;
        const market = (row as Record<string, unknown>).market;
        if (typeof market !== "string" || !market.startsWith("KRW-")) return null;
        return market.slice("KRW-".length);
      })
      .filter((base): base is string => base !== null && base.length > 0),
  );
  const tradableUsdtPerpetualSymbols = binanceTradableUsdtPerpetualSymbols(exchangeInfoPayload);

  const candidates = premiumPayload
    .map((row) => {
      if (row === null || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const symbol = typeof item.symbol === "string" ? item.symbol : null;
      const fundingRate = finiteNumber(item.lastFundingRate);
      if (symbol === null || !symbol.endsWith("USDT") || fundingRate === null || fundingRate <= 0) {
        return null;
      }
      if (!tradableUsdtPerpetualSymbols.has(symbol)) return null;
      const base = symbol.slice(0, symbol.length - "USDT".length);
      if (!bithumbKrwBases.has(base)) return null;
      return { market: `KRW-${base}`, symbol, fundingRate };
    })
    .filter(
      (candidate): candidate is MarketSpec & { fundingRate: number } => candidate !== null,
    )
    .sort((left, right) => {
      if (right.fundingRate !== left.fundingRate) return right.fundingRate - left.fundingRate;
      return left.symbol.localeCompare(right.symbol);
    })
    .slice(0, limit);

  if (candidates.length === 0) {
    throw new Error("no positive Binance funding symbols overlap with Bithumb KRW markets");
  }
  return candidates.map(({ market, symbol }) => ({ market, symbol }));
}

function krwBasesFromBithumbMarkets(payload: unknown): Set<string> {
  if (!Array.isArray(payload)) {
    throw new Error("bithumb market list response must be an array");
  }
  return new Set(
    payload
      .map((row) => {
        if (row === null || typeof row !== "object") return null;
        const market = (row as Record<string, unknown>).market;
        if (typeof market !== "string" || !market.startsWith("KRW-")) return null;
        return market.slice("KRW-".length);
      })
      .filter((base): base is string => base !== null && base.length > 0),
  );
}

function binanceBookTickerMap(payload: unknown): Map<string, { bid: number; ask: number }> {
  if (!Array.isArray(payload)) {
    throw new Error("binance book ticker response must be an array");
  }
  const books = new Map<string, { bid: number; ask: number }>();
  for (const row of payload) {
    if (row === null || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const symbol = typeof item.symbol === "string" ? item.symbol : null;
    const bid = finiteNumber(item.bidPrice);
    const ask = finiteNumber(item.askPrice);
    if (symbol !== null && bid !== null && bid > 0 && ask !== null && ask > 0) {
      books.set(symbol, { bid, ask });
    }
  }
  return books;
}

function premiumFundingMap(payload: unknown): Map<string, { fundingRate: number }> {
  if (!Array.isArray(payload)) {
    throw new Error("binance premium index response must be an array");
  }
  const funding = new Map<string, { fundingRate: number }>();
  for (const row of payload) {
    if (row === null || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const symbol = typeof item.symbol === "string" ? item.symbol : null;
    const fundingRate = finiteNumber(item.lastFundingRate);
    if (symbol !== null && fundingRate !== null) funding.set(symbol, { fundingRate });
  }
  return funding;
}

function binanceTradableUsdtPerpetualSymbols(payload: unknown): Set<string> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("binance exchange info response must be an object");
  }
  const symbols = (payload as Record<string, unknown>).symbols;
  if (!Array.isArray(symbols)) {
    throw new Error("binance exchange info symbols must be an array");
  }
  return new Set(
    symbols
      .map((row) => {
        if (row === null || typeof row !== "object") return null;
        const item = row as Record<string, unknown>;
        const symbol = typeof item.symbol === "string" ? item.symbol : null;
        const status = typeof item.status === "string" ? item.status : null;
        const contractType = typeof item.contractType === "string" ? item.contractType : null;
        return symbol !== null &&
          symbol.endsWith("USDT") &&
          status === "TRADING" &&
          contractType === "PERPETUAL"
          ? symbol
          : null;
      })
      .filter((symbol): symbol is string => symbol !== null),
  );
}

function bithumbBestBookMap(payload: unknown): Map<string, { bid: number; ask: number }> {
  if (!Array.isArray(payload)) {
    throw new Error("bithumb orderbook response must be an array");
  }
  const books = new Map<string, { bid: number; ask: number }>();
  for (const row of payload) {
    if (row === null || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const market = typeof item.market === "string" ? item.market : null;
    const units = item.orderbook_units;
    const firstUnit =
      Array.isArray(units) && units[0] !== null && typeof units[0] === "object"
        ? (units[0] as Record<string, unknown>)
        : null;
    const bid = finiteNumber(firstUnit?.bid_price);
    const ask = finiteNumber(firstUnit?.ask_price);
    if (market !== null && bid !== null && bid > 0 && ask !== null && ask > 0) {
      books.set(market, { bid, ask });
    }
  }
  return books;
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function discoverTopCurrentCarryMarkets(
  limit: number,
  args: Args,
): Promise<MarketSpec[]> {
  const marketUrl = new URL(`${BITHUMB_REST_BASE_URL}/market/all`);
  marketUrl.searchParams.set("isDetails", "false");
  const premiumUrl = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/premiumIndex`);
  const bookTickerUrl = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/ticker/bookTicker`);
  const exchangeInfoUrl = new URL(`${BINANCE_FUTURES_REST_BASE_URL}/fapi/v1/exchangeInfo`);
  const [bithumbPayload, premiumPayload, bookTickerPayload, exchangeInfoPayload, usdtKrwBook] = await Promise.all([
    fetchJson(marketUrl.toString()),
    fetchJson(premiumUrl.toString()),
    fetchJson(bookTickerUrl.toString()),
    fetchJson(exchangeInfoUrl.toString()),
    fetchBithumbBook("KRW-USDT"),
  ]);
  const bithumbKrwBases = krwBasesFromBithumbMarkets(bithumbPayload);
  const premiumBySymbol = premiumFundingMap(premiumPayload);
  const binanceBookBySymbol = binanceBookTickerMap(bookTickerPayload);
  const tradableUsdtPerpetualSymbols = binanceTradableUsdtPerpetualSymbols(exchangeInfoPayload);
  const marketSpecs = [...premiumBySymbol.entries()]
    .map(([symbol, funding]) => {
      if (!symbol.endsWith("USDT") || funding.fundingRate <= 0) return null;
      if (!tradableUsdtPerpetualSymbols.has(symbol)) return null;
      const base = symbol.slice(0, symbol.length - "USDT".length);
      if (!bithumbKrwBases.has(base) || !binanceBookBySymbol.has(symbol)) return null;
      return { market: `KRW-${base}`, symbol };
    })
    .filter((candidate): candidate is MarketSpec => candidate !== null);

  const bithumbBooks = new Map<string, { bid: number; ask: number }>();
  for (const chunk of chunked(marketSpecs, 80)) {
    const url = new URL(`${BITHUMB_REST_BASE_URL}/orderbook`);
    url.searchParams.set("markets", chunk.map((market) => market.market).join(","));
    for (const [market, book] of bithumbBestBookMap(await fetchJson(url.toString()))) {
      bithumbBooks.set(market, book);
    }
  }

  const usdtKrwSpreadBps = spreadBps(usdtKrwBook);
  const candidates = marketSpecs
    .map((spec): CurrentCarryDiscoveryCandidate | null => {
      const spot = bithumbBooks.get(spec.market);
      const perp = binanceBookBySymbol.get(spec.symbol);
      const funding = premiumBySymbol.get(spec.symbol);
      if (spot === undefined || perp === undefined || funding === undefined) return null;
      const spotMid = (spot.bid + spot.ask) / 2;
      const perpMid = (perp.bid + perp.ask) / 2;
      const spotSpreadBps = ((spot.ask - spot.bid) / spotMid) * 10_000;
      const perpSpreadBps = ((perp.ask - perp.bid) / perpMid) * 10_000;
      const spotCost = spot.ask * (1 + feeRate(args.bithumbFeeBps));
      const perpShortProceeds = perp.bid * usdtKrwBook.bidPrice * (1 - feeRate(args.binanceTakerFeeBps));
      const basisEntryEdgeBps = (perpShortProceeds / spotCost - 1) * 10_000;
      const fundingBps = funding.fundingRate * 10_000;
      return {
        ...spec,
        fundingRate: Number(funding.fundingRate.toFixed(8)),
        fundingBps: Number(fundingBps.toFixed(6)),
        basisEntryEdgeBps: Number(basisEntryEdgeBps.toFixed(6)),
        currentNetCarryBps: Number(
          (basisEntryEdgeBps + fundingBps - args.exitCostBufferBps).toFixed(6),
        ),
        spotSpreadBps: Number(spotSpreadBps.toFixed(6)),
        perpSpreadBps: Number(perpSpreadBps.toFixed(6)),
        usdtKrwSpreadBps: Number(usdtKrwSpreadBps.toFixed(6)),
      };
    })
    .filter((candidate): candidate is CurrentCarryDiscoveryCandidate => candidate !== null)
    .filter(
      (candidate) =>
        candidate.spotSpreadBps <= args.maxSpotSpreadBps &&
        candidate.perpSpreadBps <= args.maxPerpSpreadBps &&
        candidate.usdtKrwSpreadBps <= args.maxUsdtKrwSpreadBps &&
        Math.abs(candidate.currentNetCarryBps) <= MAX_EXECUTION_NET_CARRY_SANITY_BPS,
    )
    .sort((left, right) => {
      if (right.currentNetCarryBps !== left.currentNetCarryBps) {
        return right.currentNetCarryBps - left.currentNetCarryBps;
      }
      return left.symbol.localeCompare(right.symbol);
    })
    .slice(0, limit);

  if (candidates.length === 0) {
    throw new Error("no current positive-carry Binance symbols overlap with Bithumb KRW markets");
  }
  return candidates.map(({ market, symbol }) => ({ market, symbol }));
}

function latestSettledFunding(payload: unknown): { fundingRate: number; settledAtMs: number } | null {
  if (!Array.isArray(payload)) return null;
  const settled = payload
    .map((row) => {
      if (row === null || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const fundingRate = finiteNumber(item.fundingRate);
      const settledAtMs = finiteNumber(item.fundingTime);
      return fundingRate !== null && settledAtMs !== null ? { fundingRate, settledAtMs } : null;
    })
    .filter((row): row is { fundingRate: number; settledAtMs: number } => row !== null)
    .sort((left, right) => right.settledAtMs - left.settledAtMs);
  return settled[0] ?? null;
}

async function fetchObservation(spec: MarketSpec, capturedAt: string): Promise<Observation> {
  const [spot, perp, usdtKrw, funding] = await Promise.all([
    fetchBithumbBook(spec.market),
    fetchBinancePerpBook(spec.symbol),
    fetchBithumbBook("KRW-USDT"),
    fetchFunding(spec.symbol),
  ]);
  return { capturedAt, market: spec.market, symbol: spec.symbol, spot, perp, usdtKrw, funding };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function collectLiveObservations(args: Args): Promise<Observation[]> {
  const rounds =
    args.durationSeconds <= 0
      ? 1
      : Math.max(1, Math.floor((args.durationSeconds * 1_000) / args.snapshotIntervalMs) + 1);
  const observations: Observation[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const capturedAt = new Date(args.durationSeconds <= 0 ? args.nowMs : Date.now()).toISOString();
    observations.push(...(await Promise.all(args.markets.map((spec) => fetchObservation(spec, capturedAt)))));
    if (round < rounds - 1) await sleep(args.snapshotIntervalMs);
  }
  return observations;
}

function spreadBps(book: VenueBook): number {
  return ((book.askPrice - book.bidPrice) / ((book.askPrice + book.bidPrice) / 2)) * 10_000;
}

function convertedPerpBook(perp: VenueBook, usdtKrw: VenueBook): VenueBook {
  return {
    ...perp,
    bidPrice: perp.bidPrice * usdtKrw.bidPrice,
    askPrice: perp.askPrice * usdtKrw.askPrice,
    bids: perp.bids.map((level) => ({ price: level.price * usdtKrw.bidPrice, size: level.size })),
    asks: perp.asks.map((level) => ({ price: level.price * usdtKrw.askPrice, size: level.size })),
  };
}

function executableDepth(
  levels: BookLevel[],
  requiredNotional: number,
): { averagePrice: number | null; availableNotional: number | null; coversNotional: boolean } {
  let totalNotional = 0;
  let totalSize = 0;
  for (const level of levels) {
    if (totalNotional >= requiredNotional) break;
    const remainingNotional = requiredNotional - totalNotional;
    const levelNotional = level.price * level.size;
    const usedNotional = Math.min(levelNotional, remainingNotional);
    totalNotional += usedNotional;
    totalSize += usedNotional / level.price;
  }
  return {
    averagePrice: totalSize > 0 ? totalNotional / totalSize : null,
    availableNotional:
      levels.length === 0 ? null : levels.reduce((sum, level) => sum + level.price * level.size, 0),
    coversNotional: totalNotional >= requiredNotional,
  };
}

function feeRate(bps: number): number {
  return bps / 10_000;
}

function carryRow(observation: Observation, args: Args): CarryRow {
  const perpKrw = convertedPerpBook(observation.perp, observation.usdtKrw);
  const spotBuyDepth = executableDepth(observation.spot.asks, args.notionalKrw);
  const perpSellDepth = executableDepth(perpKrw.bids, args.notionalKrw);
  const usdtKrwSellDepth = executableDepth(observation.usdtKrw.bids, args.notionalKrw);
  const spotAsk = spotBuyDepth.averagePrice ?? observation.spot.askPrice;
  const perpBid = perpSellDepth.averagePrice ?? perpKrw.bidPrice;
  const spotCost = spotAsk * (1 + feeRate(args.bithumbFeeBps));
  const perpShortProceeds = perpBid * (1 - feeRate(args.binanceTakerFeeBps));
  const basisEntryEdgeBps = (perpShortProceeds / spotCost - 1) * 10_000;
  const fundingBps = observation.funding.lastFundingRate * 10_000;
  const fundingCompleted = observation.funding.settledAtMs !== null;
  const direction =
    observation.funding.lastFundingRate > 0
      ? "long_bithumb_spot_short_binance_perp"
      : "unsupported_negative_funding";
  const netCarryBps =
    direction === "long_bithumb_spot_short_binance_perp"
      ? basisEntryEdgeBps + fundingBps - args.exitCostBufferBps
      : basisEntryEdgeBps - Math.abs(fundingBps) - args.exitCostBufferBps;
  return {
    capturedAt: observation.capturedAt,
    market: observation.market,
    symbol: observation.symbol,
    direction,
    fundingRate: Number(observation.funding.lastFundingRate.toFixed(8)),
    fundingBps: Number(fundingBps.toFixed(6)),
    fundingCompleted,
    fundingSettledAt:
      observation.funding.settledAtMs === null
        ? null
        : new Date(observation.funding.settledAtMs).toISOString(),
    basisEntryEdgeBps: Number(basisEntryEdgeBps.toFixed(6)),
    netCarryBps: Number(netCarryBps.toFixed(6)),
    estimatedNetPnlKrw: Number(((args.notionalKrw * netCarryBps) / 10_000).toFixed(6)),
    spotSpreadBps: Number(spreadBps(observation.spot).toFixed(6)),
    perpSpreadBps: Number(spreadBps(observation.perp).toFixed(6)),
    usdtKrwSpreadBps: Number(spreadBps(observation.usdtKrw).toFixed(6)),
    spotBuyDepthKrw: numberOrNull(spotBuyDepth.availableNotional),
    perpSellDepthKrw: numberOrNull(perpSellDepth.availableNotional),
    usdtKrwSellDepthKrw: numberOrNull(usdtKrwSellDepth.availableNotional),
    depthCovered:
      spotBuyDepth.coversNotional &&
      perpSellDepth.coversNotional &&
      usdtKrwSellDepth.coversNotional,
    nextFundingTime:
      observation.funding.nextFundingTimeMs === null
        ? null
        : new Date(observation.funding.nextFundingTimeMs).toISOString(),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)] ?? null;
}

function executionRejectionReasons(row: CarryRow, args: Args): ExecutionRejectionReason[] {
  const reasons: ExecutionRejectionReason[] = [];
  if (row.direction !== "long_bithumb_spot_short_binance_perp") {
    reasons.push("unsupportedFundingDirection");
  }
  if (!row.fundingCompleted) reasons.push("fundingNotCompleted");
  if (!row.depthCovered) reasons.push("depthInsufficient");
  if (row.spotSpreadBps > args.maxSpotSpreadBps) reasons.push("spotSpreadTooWide");
  if (row.perpSpreadBps > args.maxPerpSpreadBps) reasons.push("perpSpreadTooWide");
  if (row.usdtKrwSpreadBps > args.maxUsdtKrwSpreadBps) reasons.push("usdtKrwSpreadTooWide");
  if (Math.abs(row.netCarryBps) > MAX_EXECUTION_NET_CARRY_SANITY_BPS) {
    reasons.push("rawNetCarryOutsideSanityBand");
  }
  return reasons;
}

function rowWithinExecutionPolicy(row: CarryRow, args: Args): boolean {
  return executionRejectionReasons(row, args).length === 0;
}

function countExecutionRejectionReasons(
  rows: CarryRow[],
  args: Args,
): Record<ExecutionRejectionReason, number> {
  const counts: Record<ExecutionRejectionReason, number> = {
    unsupportedFundingDirection: 0,
    fundingNotCompleted: 0,
    depthInsufficient: 0,
    spotSpreadTooWide: 0,
    perpSpreadTooWide: 0,
    usdtKrwSpreadTooWide: 0,
    rawNetCarryOutsideSanityBand: 0,
  };
  for (const row of rows) {
    for (const reason of executionRejectionReasons(row, args)) {
      counts[reason] += 1;
    }
  }
  return counts;
}

function summarizeSpreadStats(values: number[]): SpreadStats {
  return {
    medianBps: numberOrNull(median(values)),
    p90Bps: numberOrNull(percentile(values, 90)),
    maxBps: values.length === 0 ? null : Math.max(...values),
  };
}

function summarizeSpreadControlFundingWindows(
  rows: CarryRow[],
  args: Args,
): FundingWindowSpreadControlSummary[] {
  const rowsByFundingWindow = new Map<string, CarryRow[]>();

  for (const row of rows) {
    if (row.fundingSettledAt === null) continue;
    const key = row.fundingSettledAt;
    rowsByFundingWindow.set(key, [...(rowsByFundingWindow.get(key) ?? []), row]);
  }

  return [...rowsByFundingWindow.entries()]
    .map(([fundingSettledAt, windowRows]) => {
      const spreadRejectedCount = spreadRejectionCount(windowRows, args);
      const rejectionReasons = countExecutionRejectionReasons(windowRows, args);
      return {
        fundingSettledAt,
        sampleCount: windowRows.length,
        spreadRejectedCount,
        spreadRejectedRate:
          windowRows.length === 0
            ? null
            : Number((spreadRejectedCount / windowRows.length).toFixed(6)),
        rejectionReasons: {
          spotSpreadTooWide: rejectionReasons.spotSpreadTooWide,
          perpSpreadTooWide: rejectionReasons.perpSpreadTooWide,
          usdtKrwSpreadTooWide: rejectionReasons.usdtKrwSpreadTooWide,
        },
        spreadStats: {
          spot: summarizeSpreadStats(windowRows.map((row) => row.spotSpreadBps)),
          perp: summarizeSpreadStats(windowRows.map((row) => row.perpSpreadBps)),
          usdtKrw: summarizeSpreadStats(windowRows.map((row) => row.usdtKrwSpreadBps)),
        },
      };
    })
    .sort((left, right) => Date.parse(left.fundingSettledAt) - Date.parse(right.fundingSettledAt));
}

function summarizeSpreadControl(
  rows: CarryRow[],
  args: Args,
  executionEligibleRate: number | null,
): SpreadControlSummary {
  const spreadRejectedCount = spreadRejectionCount(rows, args);
  const spreadRejectedRate =
    rows.length === 0 ? null : Number((spreadRejectedCount / rows.length).toFixed(6));
  const required =
    spreadRejectedCount > 0 &&
    ((spreadRejectedRate ?? 1) > SPREAD_CONTROL_MAX_REJECTION_RATE ||
      (executionEligibleRate ?? 0) < SPREAD_CONTROL_MIN_EXECUTION_ELIGIBLE_RATE);
  const rejectionReasons = countExecutionRejectionReasons(rows, args);

  return {
    passed: !required,
    required,
    spreadRejectedCount,
    spreadRejectedRate,
    executionEligibleRate,
    minExecutionEligibleRate: SPREAD_CONTROL_MIN_EXECUTION_ELIGIBLE_RATE,
    maxSpreadRejectionRate: SPREAD_CONTROL_MAX_REJECTION_RATE,
    thresholds: {
      maxSpotSpreadBps: args.maxSpotSpreadBps,
      maxPerpSpreadBps: args.maxPerpSpreadBps,
      maxUsdtKrwSpreadBps: args.maxUsdtKrwSpreadBps,
    },
    rejectionReasons: {
      spotSpreadTooWide: rejectionReasons.spotSpreadTooWide,
      perpSpreadTooWide: rejectionReasons.perpSpreadTooWide,
      usdtKrwSpreadTooWide: rejectionReasons.usdtKrwSpreadTooWide,
    },
    spreadStats: {
      spot: summarizeSpreadStats(rows.map((row) => row.spotSpreadBps)),
      perp: summarizeSpreadStats(rows.map((row) => row.perpSpreadBps)),
      usdtKrw: summarizeSpreadStats(rows.map((row) => row.usdtKrwSpreadBps)),
    },
    fundingWindows: summarizeSpreadControlFundingWindows(rows, args),
    interpretation:
      "Diagnoses whether wide displayed spreads are isolated filtered rows or a persistent execution-quality blocker; this does not change carry PnL calculation or live eligibility rules.",
  };
}

function spreadSensitivityThresholds(currentMaxSpotSpreadBps: number): number[] {
  return [...new Set([10, 15, 20, 25, 30, 40, 50, currentMaxSpotSpreadBps])]
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
}

function summarizeSpreadSensitivity(rows: CarryRow[], args: Args): SpreadSensitivitySummary[] {
  return spreadSensitivityThresholds(args.maxSpotSpreadBps).map((maxSpotSpreadBps) => {
    const scenarioArgs = { ...args, maxSpotSpreadBps };
    const executionEligibleCount = rows.filter((row) => rowWithinExecutionPolicy(row, scenarioArgs))
      .length;
    const spreadRejectedCount = spreadRejectionCount(rows, scenarioArgs);
    const fundingWindowSummary = summarizeFundingWindows(rows, scenarioArgs);
    return {
      maxSpotSpreadBps,
      maxPerpSpreadBps: args.maxPerpSpreadBps,
      maxUsdtKrwSpreadBps: args.maxUsdtKrwSpreadBps,
      executionEligibleCount,
      executionEligibleRate:
        rows.length === 0 ? null : Number((executionEligibleCount / rows.length).toFixed(6)),
      spreadRejectedCount,
      spreadRejectedRate:
        rows.length === 0 ? null : Number((spreadRejectedCount / rows.length).toFixed(6)),
      completedFundingWindowCount: fundingWindowSummary.completedFundingWindowCount,
      executableSampleCount: fundingWindowSummary.executableSampleCount,
      positiveWindowRate: fundingWindowSummary.positiveWindowRate,
      medianWindowNetCarryBps: fundingWindowSummary.medianWindowNetCarryBps,
      estimatedNetPnlKrwAcrossFundingWindows:
        fundingWindowSummary.estimatedNetPnlKrwAcrossFundingWindows,
      interpretation:
        "Diagnostic only: compares spot-spread thresholds on the same observations so reduced activity is not mistaken for improved profitability.",
    };
  });
}

function summarizeFundingWindows(rows: CarryRow[], args: Args): FundingWindowCarrySummary {
  const rowsByFundingWindow = new Map<string, CarryRow[]>();

  for (const row of rows) {
    if (!rowWithinExecutionPolicy(row, args) || row.fundingSettledAt === null) continue;
    const key = `${row.market}|${row.symbol}|${row.fundingSettledAt}`;
    rowsByFundingWindow.set(key, [...(rowsByFundingWindow.get(key) ?? []), row]);
  }

  const windows: FundingWindowCarrySummaryWindow[] = [...rowsByFundingWindow.values()]
    .map((windowRows) => {
      const first = windowRows[0];
      if (first === undefined || first.fundingSettledAt === null) {
        throw new Error("funding window group unexpectedly empty");
      }
      const netCarryValues = windowRows.map((row) => row.netCarryBps);
      const pnlValues = windowRows.map((row) => row.estimatedNetPnlKrw);
      const capturedAtValues = windowRows.map((row) => row.capturedAt).sort();
      return {
        market: first.market,
        symbol: first.symbol,
        fundingSettledAt: first.fundingSettledAt,
        sampleCount: windowRows.length,
        medianNetCarryBps: numberOrNull(median(netCarryValues)),
        bestNetCarryBps: netCarryValues.length > 0 ? Math.max(...netCarryValues) : null,
        worstNetCarryBps: netCarryValues.length > 0 ? Math.min(...netCarryValues) : null,
        medianEstimatedNetPnlKrw: numberOrNull(median(pnlValues)),
        bestEstimatedNetPnlKrw: pnlValues.length > 0 ? Math.max(...pnlValues) : null,
        worstEstimatedNetPnlKrw: pnlValues.length > 0 ? Math.min(...pnlValues) : null,
        firstCapturedAt: capturedAtValues[0] ?? null,
        lastCapturedAt: capturedAtValues.at(-1) ?? null,
      };
    })
    .sort((left, right) => {
      const marketCompare = left.market.localeCompare(right.market);
      if (marketCompare !== 0) return marketCompare;
      const symbolCompare = left.symbol.localeCompare(right.symbol);
      if (symbolCompare !== 0) return symbolCompare;
      return Date.parse(left.fundingSettledAt) - Date.parse(right.fundingSettledAt);
    });

  const windowMedianCarryValues = windows
    .map((window) => window.medianNetCarryBps)
    .filter((value): value is number => value !== null);
  const windowMedianPnlValues = windows
    .map((window) => window.medianEstimatedNetPnlKrw)
    .filter((value): value is number => value !== null);
  const medianWindowNetCarryBps = numberOrNull(median(windowMedianCarryValues));
  const positiveWindowCount = windowMedianCarryValues.filter((value) => value >= args.minNetCarryBps).length;

  return {
    source: "all_execution_eligible_rows_grouped_by_market_symbol_fundingSettledAt",
    completedFundingWindowCount: windows.length,
    executableSampleCount: windows.reduce((total, window) => total + window.sampleCount, 0),
    positiveWindowCount,
    positiveWindowRate:
      windowMedianCarryValues.length === 0
        ? null
        : Number((positiveWindowCount / windowMedianCarryValues.length).toFixed(6)),
    medianWindowNetCarryBps,
    medianWindowCarryPct:
      medianWindowNetCarryBps === null ? null : Number((medianWindowNetCarryBps / 100).toFixed(6)),
    medianWindowEstimatedNetPnlKrw: numberOrNull(median(windowMedianPnlValues)),
    estimatedNetPnlKrwAcrossFundingWindows:
      windowMedianPnlValues.length === 0
        ? null
        : Number(windowMedianPnlValues.reduce((total, value) => total + value, 0).toFixed(6)),
    isDeduplicatedByFundingWindow: true,
    isNotRealizedReturn: true,
    interpretation:
      "Groups all execution-eligible carry samples by market, symbol, and completed funding settlement window so repeated snapshots in one funding window are not counted as repeated realized trades.",
    windows,
  };
}

function summarize(rows: CarryRow[], args: Args): Summary {
  const values = rows.map((row) => row.netCarryBps);
  const executionEligibleRows = rows.filter((row) => rowWithinExecutionPolicy(row, args));
  const executionRejectedRows = rows.filter((row) => !rowWithinExecutionPolicy(row, args));
  const executionEligibleValues = executionEligibleRows.map((row) => row.netCarryBps);
  const rawPricingArtifactRows = rows.filter((row) =>
    executionRejectionReasons(row, args).includes("rawNetCarryOutsideSanityBand"),
  );
  const rawPricingArtifactRowSet = new Set(rawPricingArtifactRows);
  const artifactExcludedRows = rows.filter((row) => !rawPricingArtifactRowSet.has(row));
  const artifactExcludedValues = artifactExcludedRows.map((row) => row.netCarryBps);
  const completedFundingEvents = new Set(
    rows
      .filter((row) => row.fundingCompleted && row.fundingSettledAt !== null)
      .map((row) => row.fundingSettledAt),
  );
  const positiveCount = executionEligibleRows.filter(
    (row) => row.netCarryBps >= args.minNetCarryBps,
  ).length;
  const depthCoveredCount = rows.filter((row) => row.depthCovered).length;
  const executionEligibleRate =
    rows.length === 0 ? null : Number((executionEligibleRows.length / rows.length).toFixed(6));
  const executionRejectedRate =
    rows.length === 0 ? null : Number((executionRejectedRows.length / rows.length).toFixed(6));
  return {
    count: rows.length,
    supportedFundingCount: rows.filter(
      (row) => row.direction === "long_bithumb_spot_short_binance_perp",
    ).length,
    completedFundingCount: completedFundingEvents.size,
    positiveCount,
    positiveRate: rows.length === 0 ? null : Number((positiveCount / rows.length).toFixed(6)),
    executionEligibleCount: executionEligibleRows.length,
    executionEligibleRate,
    executionRejectedCount: executionRejectedRows.length,
    executionRejectedRate,
    executionRejectionReasons: countExecutionRejectionReasons(rows, args),
    spreadControl: summarizeSpreadControl(rows, args, executionEligibleRate),
    spreadSensitivity: summarizeSpreadSensitivity(rows, args),
    executionEligiblePositiveCount: positiveCount,
    executionEligiblePositiveRate:
      executionEligibleRows.length === 0
        ? null
        : Number((positiveCount / executionEligibleRows.length).toFixed(6)),
    executionEligibleMedianNetCarryBps: numberOrNull(median(executionEligibleValues)),
    executionEligibleTotalEstimatedNetPnlKrw: Number(
      executionEligibleRows.reduce((sum, row) => sum + row.estimatedNetPnlKrw, 0).toFixed(6),
    ),
    rawPricingArtifactCount: rawPricingArtifactRows.length,
    rawPricingArtifactEstimatedNetPnlKrw: Number(
      rawPricingArtifactRows.reduce((sum, row) => sum + row.estimatedNetPnlKrw, 0).toFixed(6),
    ),
    artifactExcludedCount: artifactExcludedRows.length,
    artifactExcludedMedianNetCarryBps: numberOrNull(median(artifactExcludedValues)),
    artifactExcludedAverageNetCarryBps:
      artifactExcludedValues.length === 0
        ? null
        : Number(
            (
              artifactExcludedValues.reduce((sum, value) => sum + value, 0) /
              artifactExcludedValues.length
            ).toFixed(6),
          ),
    artifactExcludedTotalEstimatedNetPnlKrw: Number(
      artifactExcludedRows.reduce((sum, row) => sum + row.estimatedNetPnlKrw, 0).toFixed(6),
    ),
    depthCoveredCount,
    depthCoverageRate:
      rows.length === 0 ? null : Number((depthCoveredCount / rows.length).toFixed(6)),
    medianNetCarryBps: numberOrNull(median(values)),
    averageNetCarryBps:
      values.length === 0
        ? null
        : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
    maxNetCarryBps: values.length === 0 ? null : Math.max(...values),
    minNetCarryBps: values.length === 0 ? null : Math.min(...values),
    totalEstimatedNetPnlKrw: Number(
      rows.reduce((sum, row) => sum + row.estimatedNetPnlKrw, 0).toFixed(6),
    ),
  };
}

function summarizeByMarket(rows: CarryRow[], args: Args): PerMarketSummary[] {
  const groups = new Map<string, CarryRow[]>();
  for (const row of rows) {
    const key = `${row.market}:${row.symbol}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .map((marketRows) => {
      const first = marketRows[0];
      if (first === undefined) throw new Error("market group unexpectedly empty");
      const summary = summarize(marketRows, args);
      const fundingWindowSummary = summarizeFundingWindows(marketRows, args);
      return {
        market: first.market,
        symbol: first.symbol,
        ...summary,
        fundingWindowSummary,
        watchDecision: perMarketWatchDecision(marketRows, summary, fundingWindowSummary, args),
      };
    })
    .sort((left, right) => {
      const rightMedian = right.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
      const leftMedian = left.executionEligibleMedianNetCarryBps ?? Number.NEGATIVE_INFINITY;
      if (rightMedian !== leftMedian) return rightMedian - leftMedian;
      return right.executionEligibleTotalEstimatedNetPnlKrw -
        left.executionEligibleTotalEstimatedNetPnlKrw;
    });
}

function perMarketWatchDecision(
  rows: CarryRow[],
  summary: Summary,
  fundingWindowSummary: FundingWindowCarrySummary,
  args: Args,
): PerMarketWatchDecision {
  const reasons: string[] = [];
  const requiredBeforeMetricCandidate: string[] = [];
  const minMarketObservations = Math.max(1, Math.ceil(args.minObservations / args.markets.length));
  const medianNetCarryBps = fundingWindowSummary.medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY;
  const positiveRate = fundingWindowSummary.positiveWindowRate ?? 0;
  const executionEligibleRate = summary.executionEligibleRate ?? 0;
  const depthCoverageRate = summary.depthCoverageRate ?? 0;
  const spreadControlRequired = requiresSpreadControl(summary);

  if (summary.count < minMarketObservations) requiredBeforeMetricCandidate.push("moreObservations");
  if (summary.completedFundingCount < args.minCompletedFundingEvents) {
    requiredBeforeMetricCandidate.push("moreCompletedFundingEvents");
  }
  if (medianNetCarryBps < args.minNetCarryBps) requiredBeforeMetricCandidate.push("strongerMedianNetCarry");
  if (positiveRate < args.minPositiveCarryRate) requiredBeforeMetricCandidate.push("higherPositiveCarryRate");
  if (depthCoverageRate < args.minDepthCoverageRate) requiredBeforeMetricCandidate.push("betterDepthCoverage");
  if (spreadControlRequired) requiredBeforeMetricCandidate.push("spreadControl");

  if (summary.completedFundingCount < PER_MARKET_KILL_MIN_COMPLETED_FUNDING_EVENTS) {
    reasons.push("insufficientCompletedFundingEventsForKillDecision");
    return {
      status: "collect_more_evidence",
      reasons,
      requiredBeforeMetricCandidate,
      killPolicy: {
        minCompletedFundingEventsBeforeKill: PER_MARKET_KILL_MIN_COMPLETED_FUNDING_EVENTS,
        minMedianNetCarryBps: PER_MARKET_KILL_MIN_MEDIAN_NET_CARRY_BPS,
        minPositiveCarryRate: args.minPositiveCarryRate,
        minExecutionEligibleRate: PER_MARKET_KILL_MIN_EXECUTION_ELIGIBLE_RATE,
        minDepthCoverageRate: args.minDepthCoverageRate,
      },
    };
  }

  if (medianNetCarryBps < PER_MARKET_KILL_MIN_MEDIAN_NET_CARRY_BPS) {
    reasons.push("medianNetCarryBelowKillThresholdAfterTwoFundingWindows");
  }
  if (positiveRate < args.minPositiveCarryRate) {
    reasons.push("positiveCarryRateBelowPromotionThresholdAfterTwoFundingWindows");
  }
  if (executionEligibleRate < PER_MARKET_KILL_MIN_EXECUTION_ELIGIBLE_RATE) {
    reasons.push("executionEligibleRateBelowKillThresholdAfterTwoFundingWindows");
  }
  if (depthCoverageRate < args.minDepthCoverageRate) {
    reasons.push("depthCoverageBelowPromotionThresholdAfterTwoFundingWindows");
  }

  const status =
    reasons.length > 0
      ? "kill_candidate"
      : requiredBeforeMetricCandidate.length === 0
        ? "metric_candidate"
        : "collect_more_evidence";

  return {
    status,
    reasons,
    requiredBeforeMetricCandidate,
    killPolicy: {
      minCompletedFundingEventsBeforeKill: PER_MARKET_KILL_MIN_COMPLETED_FUNDING_EVENTS,
      minMedianNetCarryBps: PER_MARKET_KILL_MIN_MEDIAN_NET_CARRY_BPS,
      minPositiveCarryRate: args.minPositiveCarryRate,
      minExecutionEligibleRate: PER_MARKET_KILL_MIN_EXECUTION_ELIGIBLE_RATE,
      minDepthCoverageRate: args.minDepthCoverageRate,
    },
  };
}

function spreadRejectionCount(rows: CarryRow[], args: Args): number {
  return rows.filter(
    (row) =>
      row.spotSpreadBps > args.maxSpotSpreadBps ||
      row.perpSpreadBps > args.maxPerpSpreadBps ||
      row.usdtKrwSpreadBps > args.maxUsdtKrwSpreadBps,
  ).length;
}

function requiresSpreadControl(summary: Summary): boolean {
  return summary.spreadControl.required;
}

function numberOrNull(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(6));
}

function latestCapturedAt(observations: Observation[]): number | null {
  let latest: number | null = null;
  for (const observation of observations) {
    const parsed = Date.parse(observation.capturedAt);
    if (!Number.isFinite(parsed)) continue;
    latest = latest === null ? parsed : Math.max(latest, parsed);
  }
  return latest;
}

function latestAgeHours(observations: Observation[], nowMs: number): number | null {
  const latest = latestCapturedAt(observations);
  return latest === null ? null : Math.max(0, (nowMs - latest) / 3_600_000);
}

function observationSpanMinutes(observations: Observation[]): number | null {
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const observation of observations) {
    const parsed = Date.parse(observation.capturedAt);
    if (!Number.isFinite(parsed)) continue;
    earliest = earliest === null ? parsed : Math.min(earliest, parsed);
    latest = latest === null ? parsed : Math.max(latest, parsed);
  }
  return earliest === null || latest === null ? null : Math.max(0, (latest - earliest) / 60_000);
}

function blockerList(
  observations: Observation[],
  rows: CarryRow[],
  summary: Summary,
  fundingWindowSummary: FundingWindowCarrySummary,
  args: Args,
): string[] {
  const blockers: string[] = [];
  if (observations.length < args.minObservations) blockers.push("insufficientObservations");
  const spanMinutes = observationSpanMinutes(observations);
  if (spanMinutes === null || spanMinutes < args.minObservationSpanMinutes) {
    blockers.push("insufficientObservationSpan");
  }
  if (summary.completedFundingCount < args.minCompletedFundingEvents) {
    blockers.push("insufficientCompletedFundingEvents");
  }
  if (!args.accountFeesConfirmed) blockers.push("feeScheduleUnconfirmed");
  if (!args.inventoryReady) blockers.push("inventoryNotReady");
  if (!args.hedgeVenueReady) blockers.push("hedgeVenueNotReady");
  const ageHours = latestAgeHours(observations, args.nowMs);
  if (ageHours === null) blockers.push("missingLatestObservationTimestamp");
  else if (ageHours > args.maxLatestAgeHours) blockers.push("staleLatestObservation");
  if (summary.supportedFundingCount === 0) blockers.push("unsupportedFundingDirection");
  if ((fundingWindowSummary.medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY) < args.minNetCarryBps) {
    blockers.push("weakMedianNetCarry");
  }
  if ((fundingWindowSummary.positiveWindowRate ?? 0) < args.minPositiveCarryRate) {
    blockers.push("lowPositiveCarryRate");
  }
  if ((summary.depthCoverageRate ?? 0) < args.minDepthCoverageRate) blockers.push("depthInsufficient");
  if (requiresSpreadControl(summary)) {
    blockers.push("wideDisplayedSpread");
  }
  return blockers;
}

function stdoutSummary(report: {
  generatedAt: string;
  status: string;
  promotionEligible: boolean;
  blockers: string[];
  observationCount: number;
  observationSpanMinutes: number | null;
  summary: Summary;
  rankedCarryViews: Record<string, unknown>;
  perMarketSummary: PerMarketSummary[];
}): Record<string, unknown> {
  return {
    generatedAt: report.generatedAt,
    status: report.status,
    promotionEligible: report.promotionEligible,
    blockers: report.blockers,
    observationCount: report.observationCount,
    observationSpanMinutes: report.observationSpanMinutes,
    summary: report.summary,
    rankedCarryViews: report.rankedCarryViews,
    perMarketSummary: report.perMarketSummary.map((market) => ({
      market: market.market,
      symbol: market.symbol,
      count: market.count,
      completedFundingCount: market.completedFundingCount,
      positiveRate: market.positiveRate,
      executionEligibleRate: market.executionEligibleRate,
      executionEligibleMedianNetCarryBps: market.executionEligibleMedianNetCarryBps,
      executionEligibleTotalEstimatedNetPnlKrw: market.executionEligibleTotalEstimatedNetPnlKrw,
      spreadControl: market.spreadControl,
      fundingWindowSummary: market.fundingWindowSummary,
      depthCoverageRate: market.depthCoverageRate,
      watchDecision: market.watchDecision,
    })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  if (args.autoTopFundingMarkets !== null) {
    args.markets = await discoverTopFundingMarkets(args.autoTopFundingMarkets);
  }
  if (args.autoTopCurrentCarryMarkets !== null) {
    args.markets = await discoverTopCurrentCarryMarkets(args.autoTopCurrentCarryMarkets, args);
  }
  const existingObservations =
    args.appendExistingOutput && args.outputPath !== null
      ? await loadExistingOutputObservations(args.outputPath)
      : [];
  const newObservations =
    args.inputObservationsPath === null
      ? await collectLiveObservations(args)
      : await loadObservations(args.inputObservationsPath);
  const combinedObservations = [...existingObservations, ...newObservations];
  const filteredObservations = args.filterInputToMarkets
    ? filterObservationsToMarkets(combinedObservations, args.markets)
    : combinedObservations;
  const observations = dedupeObservations(filteredObservations);
  const filteredOutObservationCount = combinedObservations.length - filteredObservations.length;
  const duplicateObservationCount = filteredObservations.length - observations.length;
  const reportNowMs =
    args.inputObservationsPath === null && args.durationSeconds > 0 ? Date.now() : args.nowMs;
  const rows = observations.map((observation) => carryRow(observation, args));
  const summary = summarize(rows, args);
  const fundingWindowSummary = summarizeFundingWindows(rows, args);
  const executionEligibleRows = rows.filter((row) => rowWithinExecutionPolicy(row, args));
  const blockers = blockerList(observations, rows, summary, fundingWindowSummary, { ...args, nowMs: reportNowMs });
  const promotionEligible = blockers.length === 0;
  const checklist = {
    sufficientObservations: observations.length >= args.minObservations,
    sufficientObservationSpan:
      (observationSpanMinutes(observations) ?? -1) >= args.minObservationSpanMinutes,
    completedFundingEvents: summary.completedFundingCount >= args.minCompletedFundingEvents,
    feeScheduleConfirmed: args.accountFeesConfirmed,
    inventoryReady: args.inventoryReady,
    hedgeVenueReady: args.hedgeVenueReady,
    latestObservationFresh:
      (latestAgeHours(observations, reportNowMs) ?? Number.POSITIVE_INFINITY) <=
      args.maxLatestAgeHours,
    fundingDirectionSupported: summary.supportedFundingCount > 0,
    positiveMedianNetCarry:
      (fundingWindowSummary.medianWindowNetCarryBps ?? Number.NEGATIVE_INFINITY) >=
      args.minNetCarryBps,
    positiveCarryRate:
      (fundingWindowSummary.positiveWindowRate ?? 0) >= args.minPositiveCarryRate,
    depthCoverageReady: (summary.depthCoverageRate ?? 0) >= args.minDepthCoverageRate,
    spreadsControlled: !requiresSpreadControl(summary),
  };
  const report = {
    generatedAt: new Date(reportNowMs).toISOString(),
    objective:
      "Measure Bithumb spot plus Binance USD-M perpetual funding/basis carry before any live promotion.",
    status: promotionEligible ? "promotion_candidate" : "blocked",
    promotionEligible,
    blockers,
    checklist,
    measurementScope: {
      netCarryBps:
        "public_data_estimate_after_entry_fees_depth_conversion_funding_and_exit_buffer_not_realized_live_pnl",
      fundingBps:
        "counted_for_promotion_only_when_observation_includes_completed_settled_funding_timestamp",
      executionEligibleMetrics:
        "only rows passing direction_funding_depth_spread_and_raw_carry_sanity_checks are eligible for promotion",
      promotionEvidence:
        "use fundingWindowSummary rather than truncated topCarry or topExecutableCarry rankings for live promotion decisions",
      rawPricingArtifact:
        "rows outside the net-carry sanity band are retained for diagnostics but excluded from executable evidence",
      artifactExcludedSummary:
        "artifactExcluded* fields remove raw pricing artifacts from overall diagnostics; prefer these and executionEligible* fields over raw-inclusive totals when rawPricingArtifactCount is nonzero",
      spreadControl:
        "spreadControl distinguishes isolated filtered spread rows from persistent execution-quality blockers before any carry candidate can be promoted",
      maxExecutionNetCarrySanityBps: MAX_EXECUTION_NET_CARRY_SANITY_BPS,
      liveReady: "not_assessed_by_this_measurement_cli",
    },
    assumptions: {
      markets: args.markets,
      notionalKrw: args.notionalKrw,
      bithumbFeeBps: args.bithumbFeeBps,
      binanceTakerFeeBps: args.binanceTakerFeeBps,
      exitCostBufferBps: args.exitCostBufferBps,
      minObservations: args.minObservations,
      minCompletedFundingEvents: args.minCompletedFundingEvents,
      minObservationSpanMinutes: args.minObservationSpanMinutes,
      minNetCarryBps: args.minNetCarryBps,
      minPositiveCarryRate: args.minPositiveCarryRate,
      minDepthCoverageRate: args.minDepthCoverageRate,
      maxSpotSpreadBps: args.maxSpotSpreadBps,
      maxPerpSpreadBps: args.maxPerpSpreadBps,
      maxUsdtKrwSpreadBps: args.maxUsdtKrwSpreadBps,
      maxLatestAgeHours: args.maxLatestAgeHours,
      accountFeesConfirmed: args.accountFeesConfirmed,
      inventoryReady: args.inventoryReady,
      hedgeVenueReady: args.hedgeVenueReady,
      durationSeconds: args.durationSeconds,
      snapshotIntervalMs: args.snapshotIntervalMs,
      appendExistingOutput: args.appendExistingOutput,
      filterInputToMarkets: args.filterInputToMarkets,
      autoTopFundingMarkets: args.autoTopFundingMarkets,
      autoTopCurrentCarryMarkets: args.autoTopCurrentCarryMarkets,
      inputObservationsPath: args.inputObservationsPath,
      sourceUrls: {
        bithumbMarketAll: "https://content.bithumb.com/apidocs/intro3.html",
        bithumbOrderbook: "https://content.bithumb.com/apidocs/intro3.html",
        binanceFuturesDepth:
          "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Order-Book",
        binancePremiumIndex:
          "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Mark-Price",
        binanceFunding:
          "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History",
      },
    },
    observationMerge: {
      existingOutputObservationCount: existingObservations.length,
      newObservationCount: newObservations.length,
      filteredOutObservationCount,
      duplicateObservationCount,
      finalObservationCount: observations.length,
      dedupeKey: "market|symbol|capturedAt|funding.settledAtMs",
      filteredToRequestedMarkets: args.filterInputToMarkets,
    },
    observationCount: observations.length,
    observationSpanMinutes: numberOrNull(observationSpanMinutes(observations)),
    latestObservationAgeHours: numberOrNull(latestAgeHours(observations, reportNowMs)),
    summary,
    perMarketSummary: summarizeByMarket(rows, args),
    fundingWindowSummary,
    rankedCarryViews: {
      topCarry: {
        sourcePopulation: "all_rows_sorted_by_netCarryBps",
        resultLimit: 20,
        sourceCount: rows.length,
        isTruncatedTopN: rows.length > 20,
        promotionUsable: false,
        promotionReplacement: "fundingWindowSummary",
        interpretation:
          "Diagnostic ranking only; includes rejected rows and repeated snapshots, so it must not be used as live promotion evidence.",
      },
      topExecutableCarry: {
        sourcePopulation: "execution_eligible_rows_sorted_by_netCarryBps",
        resultLimit: 20,
        sourceCount: executionEligibleRows.length,
        isTruncatedTopN: executionEligibleRows.length > 20,
        promotionUsable: false,
        promotionReplacement: "fundingWindowSummary",
        interpretation:
          "Diagnostic ranking only; top-N executable snapshots can overrepresent one funding window, so use funding-window grouped evidence for keep/switch/live decisions.",
      },
    },
    topCarry: [...rows].sort((left, right) => right.netCarryBps - left.netCarryBps).slice(0, 20),
    topExecutableCarry: executionEligibleRows
      .sort((left, right) => right.netCarryBps - left.netCarryBps)
      .slice(0, 20),
    topRejectedCarry: rows
      .filter((row) => !rowWithinExecutionPolicy(row, args))
      .map((row) => ({
        ...row,
        executionRejectionReasons: executionRejectionReasons(row, args),
      }))
      .sort((left, right) => right.netCarryBps - left.netCarryBps)
      .slice(0, 20),
    topPricingArtifactCarry: rows
      .filter((row) =>
        executionRejectionReasons(row, args).includes("rawNetCarryOutsideSanityBand"),
      )
      .map((row) => ({
        ...row,
        executionRejectionReasons: executionRejectionReasons(row, args),
      }))
      .sort((left, right) => Math.abs(right.netCarryBps) - Math.abs(left.netCarryBps))
      .slice(0, 20),
    observations,
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(args.quiet ? `${JSON.stringify(stdoutSummary(report), null, 2)}\n` : output);

  if (args.requirePromotion && !promotionEligible) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
