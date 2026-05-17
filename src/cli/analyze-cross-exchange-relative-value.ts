import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  inputObservationsPath: string | null;
  outputPath: string | null;
  market: string;
  binanceSymbol: string;
  referenceVenue: "all" | "upbit" | "binance";
  usdtKrwVenue: "none" | "bithumb" | "upbit";
  usdtKrwMarket: string;
  usdKrw: number | null;
  usdKrwUpdatedAtMs: number | null;
  overrideInputUsdKrw: boolean;
  notionalKrw: number;
  bithumbFeeBps: number;
  upbitFeeBps: number;
  globalFeeBps: number;
  minNetEdgeBps: number;
  minObservations: number;
  minObservationSpanMinutes: number;
  minEdgeObservationRate: number;
  minDepthCoverageRate: number;
  maxLatestAgeHours: number;
  maxFxAgeHours: number;
  maxSpreadBps: number;
  maxSnapshotSkewMs: number;
  allowReceiveTimeSkew: boolean;
  accountFeesConfirmed: boolean;
  inventoryReady: boolean;
  hedgeVenueReady: boolean;
  nowMs: number;
  durationSeconds: number;
  snapshotIntervalMs: number;
  requirePromotion: boolean;
}

interface VenueBook {
  venue: "bithumb" | "upbit" | "binance";
  market: string;
  bidPrice: number;
  bidSize: number | null;
  askPrice: number;
  askSize: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
  timestampMs: number | null;
  receivedAtMs: number | null;
}

interface BookLevel {
  price: number;
  size: number;
}

interface Observation {
  capturedAt: string;
  market: string;
  usdKrw?: number | null;
  bithumb: VenueBook;
  upbit: VenueBook;
  binance?: VenueBook | null;
  usdtKrw?: VenueBook | null;
}

interface EdgeRow {
  capturedAt: string;
  referenceVenue: "upbit" | "binance";
  direction: "sell_bithumb_buy_reference" | "buy_bithumb_sell_reference";
  netEdgeBps: number;
  grossEdgeBps: number;
  estimatedNetPnlKrw: number;
  bithumbSpreadBps: number;
  referenceSpreadBps: number;
  bithumbTopNotionalKrw: number | null;
  referenceTopNotionalKrw: number | null;
  bithumbDepthNotionalKrw: number | null;
  referenceDepthNotionalKrw: number | null;
  depthCovered: boolean;
  snapshotSkewMs: number | null;
  snapshotSkewSource: "source" | "receive" | "missing";
}

interface Summary {
  count: number;
  positiveCount: number;
  positiveRate: number | null;
  depthCoveredCount: number;
  depthCoverageRate: number | null;
  averageNetEdgeBps: number | null;
  medianNetEdgeBps: number | null;
  maxNetEdgeBps: number | null;
  minNetEdgeBps: number | null;
  totalEstimatedNetPnlKrw: number;
}

const BITHUMB_REST_BASE_URL = "https://api.bithumb.com/v1";
const UPBIT_REST_BASE_URL = "https://api.upbit.com/v1";
const BINANCE_REST_BASE_URL = "https://api.binance.com";

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    inputObservationsPath: null,
    outputPath: null,
    market: "KRW-BTC",
    binanceSymbol: "BTCUSDT",
    referenceVenue: "all",
    usdtKrwVenue: "none",
    usdtKrwMarket: "KRW-USDT",
    usdKrw: null,
    usdKrwUpdatedAtMs: null,
    overrideInputUsdKrw: false,
    notionalKrw: 500_000,
    bithumbFeeBps: 4,
    upbitFeeBps: 5,
    globalFeeBps: 10,
    minNetEdgeBps: 20,
    minObservations: 100,
    minObservationSpanMinutes: 60,
    minEdgeObservationRate: 0.6,
    minDepthCoverageRate: 0.95,
    maxLatestAgeHours: 24,
    maxFxAgeHours: 24,
    maxSpreadBps: 20,
    maxSnapshotSkewMs: 2_000,
    allowReceiveTimeSkew: false,
    accountFeesConfirmed: false,
    inventoryReady: false,
    hedgeVenueReady: false,
    nowMs: Date.now(),
    durationSeconds: 0,
    snapshotIntervalMs: 1_000,
    requirePromotion: false,
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
    if (arg === "--market") {
      if (!value) throw new Error("--market requires a value");
      args.market = value;
      index += 1;
      continue;
    }
    if (arg === "--binance-symbol") {
      if (!value) throw new Error("--binance-symbol requires a value");
      args.binanceSymbol = value;
      index += 1;
      continue;
    }
    if (arg === "--reference-venue") {
      if (value !== "all" && value !== "upbit" && value !== "binance") {
        throw new Error("--reference-venue must be all, upbit, or binance");
      }
      args.referenceVenue = value;
      index += 1;
      continue;
    }
    if (arg === "--usdt-krw-venue") {
      if (value !== "none" && value !== "bithumb" && value !== "upbit") {
        throw new Error("--usdt-krw-venue must be none, bithumb, or upbit");
      }
      args.usdtKrwVenue = value;
      index += 1;
      continue;
    }
    if (arg === "--usdt-krw-market") {
      if (!value) throw new Error("--usdt-krw-market requires a value");
      args.usdtKrwMarket = value;
      index += 1;
      continue;
    }
    if (arg === "--usd-krw") {
      if (!value) throw new Error("--usd-krw requires a value");
      args.usdKrw = positiveNumber(value, "--usd-krw");
      index += 1;
      continue;
    }
    if (arg === "--usd-krw-updated-at") {
      if (!value) throw new Error("--usd-krw-updated-at requires an ISO timestamp");
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) throw new Error("--usd-krw-updated-at must be a valid ISO timestamp");
      args.usdKrwUpdatedAtMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--override-input-usd-krw") {
      args.overrideInputUsdKrw = true;
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
    if (arg === "--upbit-fee-bps") {
      if (!value) throw new Error("--upbit-fee-bps requires a value");
      args.upbitFeeBps = nonNegativeNumber(value, "--upbit-fee-bps");
      index += 1;
      continue;
    }
    if (arg === "--global-fee-bps") {
      if (!value) throw new Error("--global-fee-bps requires a value");
      args.globalFeeBps = nonNegativeNumber(value, "--global-fee-bps");
      index += 1;
      continue;
    }
    if (arg === "--min-net-edge-bps") {
      if (!value) throw new Error("--min-net-edge-bps requires a value");
      args.minNetEdgeBps = nonNegativeNumber(value, "--min-net-edge-bps");
      index += 1;
      continue;
    }
    if (arg === "--min-observations") {
      if (!value) throw new Error("--min-observations requires a value");
      args.minObservations = positiveInteger(value, "--min-observations");
      index += 1;
      continue;
    }
    if (arg === "--min-observation-span-minutes") {
      if (!value) throw new Error("--min-observation-span-minutes requires a value");
      args.minObservationSpanMinutes = nonNegativeNumber(value, "--min-observation-span-minutes");
      index += 1;
      continue;
    }
    if (arg === "--min-edge-observation-rate") {
      if (!value) throw new Error("--min-edge-observation-rate requires a value");
      args.minEdgeObservationRate = rate(value, "--min-edge-observation-rate");
      index += 1;
      continue;
    }
    if (arg === "--min-depth-coverage-rate") {
      if (!value) throw new Error("--min-depth-coverage-rate requires a value");
      args.minDepthCoverageRate = rate(value, "--min-depth-coverage-rate");
      index += 1;
      continue;
    }
    if (arg === "--max-latest-age-hours") {
      if (!value) throw new Error("--max-latest-age-hours requires a value");
      args.maxLatestAgeHours = positiveNumber(value, "--max-latest-age-hours");
      index += 1;
      continue;
    }
    if (arg === "--max-fx-age-hours") {
      if (!value) throw new Error("--max-fx-age-hours requires a value");
      args.maxFxAgeHours = positiveNumber(value, "--max-fx-age-hours");
      index += 1;
      continue;
    }
    if (arg === "--max-spread-bps") {
      if (!value) throw new Error("--max-spread-bps requires a value");
      args.maxSpreadBps = positiveNumber(value, "--max-spread-bps");
      index += 1;
      continue;
    }
    if (arg === "--max-snapshot-skew-ms") {
      if (!value) throw new Error("--max-snapshot-skew-ms requires a value");
      args.maxSnapshotSkewMs = positiveInteger(value, "--max-snapshot-skew-ms");
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
    if (arg === "--allow-receive-time-skew") {
      args.allowReceiveTimeSkew = true;
      continue;
    }
    if (arg === "--hedge-venue-ready") {
      args.hedgeVenueReady = true;
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
    if (arg === "--require-promotion") {
      args.requirePromotion = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return args;
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

function overrideInputUsdKrw(observations: Observation[], args: Args): Observation[] {
  if (!args.overrideInputUsdKrw) return observations;
  if (args.usdKrw === null) {
    throw new Error("--override-input-usd-krw requires --usd-krw");
  }
  return observations.map((observation) => ({
    ...observation,
    usdKrw: args.usdKrw,
  }));
}

function normalizeObservation(value: unknown): Observation {
  if (value === null || typeof value !== "object") throw new Error("observation must be an object");
  const row = value as Record<string, unknown>;
  return {
    capturedAt: stringValue(row.capturedAt, "capturedAt"),
    market: stringValue(row.market, "market"),
    usdKrw: finiteNumber(row.usdKrw),
    bithumb: normalizeVenueBook(row.bithumb, "bithumb"),
    upbit: normalizeVenueBook(row.upbit, "upbit"),
    binance:
      row.binance === undefined || row.binance === null
        ? null
        : normalizeVenueBook(row.binance, "binance"),
    usdtKrw:
      row.usdtKrw === undefined || row.usdtKrw === null
        ? null
        : normalizeVenueBook(row.usdtKrw, "bithumb"),
  };
}

function normalizeVenueBook(value: unknown, venue: VenueBook["venue"]): VenueBook {
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
    bidSize,
    askPrice,
    askSize,
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

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
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

function firstUnit(row: Record<string, unknown>, label: string): Record<string, unknown> {
  const units = row.orderbook_units;
  if (Array.isArray(units) && units[0] !== null && typeof units[0] === "object") {
    return units[0] as Record<string, unknown>;
  }
  throw new Error(`${label} orderbook response has no orderbook_units`);
}

function venueLevels(
  row: Record<string, unknown>,
  side: "bid" | "ask",
): BookLevel[] {
  const units = row.orderbook_units;
  if (!Array.isArray(units)) return [];
  return units
    .map((unit) => {
      if (unit === null || typeof unit !== "object") return null;
      const item = unit as Record<string, unknown>;
      const price = finiteNumber(item[`${side}_price`]);
      const size = finiteNumber(item[`${side}_size`]);
      return price !== null && price > 0 && size !== null && size > 0
        ? { price, size }
        : null;
    })
    .filter((level): level is BookLevel => level !== null);
}

function orderbookTimestamp(row: Record<string, unknown>): number | null {
  return finiteNumber(row.timestamp ?? row.event_timestamp_ms ?? row.timestampMs);
}

async function fetchBithumbBook(market: string): Promise<VenueBook> {
  const url = new URL(`${BITHUMB_REST_BASE_URL}/orderbook`);
  url.searchParams.set("markets", market);
  const row = firstOrderbookRow(await fetchJson(url.toString()), "bithumb");
  const receivedAtMs = Date.now();
  const unit = firstUnit(row, "bithumb");
  return {
    venue: "bithumb",
    market,
    bidPrice: requiredPositive(unit.bid_price, "bithumb.bid_price"),
    bidSize: finiteNumber(unit.bid_size),
    askPrice: requiredPositive(unit.ask_price, "bithumb.ask_price"),
    askSize: finiteNumber(unit.ask_size),
    bids: venueLevels(row, "bid"),
    asks: venueLevels(row, "ask"),
    timestampMs: orderbookTimestamp(row),
    receivedAtMs,
  };
}

async function fetchUpbitBook(market: string): Promise<VenueBook> {
  const url = new URL(`${UPBIT_REST_BASE_URL}/orderbook`);
  url.searchParams.set("markets", market);
  const row = firstOrderbookRow(await fetchJson(url.toString()), "upbit");
  const receivedAtMs = Date.now();
  const unit = firstUnit(row, "upbit");
  return {
    venue: "upbit",
    market,
    bidPrice: requiredPositive(unit.bid_price, "upbit.bid_price"),
    bidSize: finiteNumber(unit.bid_size),
    askPrice: requiredPositive(unit.ask_price, "upbit.ask_price"),
    askSize: finiteNumber(unit.ask_size),
    bids: venueLevels(row, "bid"),
    asks: venueLevels(row, "ask"),
    timestampMs: orderbookTimestamp(row),
    receivedAtMs,
  };
}

async function fetchBinanceBook(symbol: string): Promise<VenueBook> {
  const url = new URL(`${BINANCE_REST_BASE_URL}/api/v3/depth`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("limit", "20");
  const payload = await fetchJson(url.toString());
  const receivedAtMs = Date.now();
  if (payload === null || typeof payload !== "object") {
    throw new Error("binance depth response must be an object");
  }
  const row = payload as Record<string, unknown>;
  const bids = binanceLevels(row.bids);
  const asks = binanceLevels(row.asks);
  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (bestBid === undefined || bestAsk === undefined) {
    throw new Error("binance depth response must include bids and asks");
  }
  return {
    venue: "binance",
    market: symbol,
    bidPrice: bestBid.price,
    bidSize: bestBid.size,
    askPrice: bestAsk.price,
    askSize: bestAsk.size,
    bids,
    asks,
    timestampMs: null,
    receivedAtMs,
  };
}

async function fetchUsdtKrwBook(args: Args): Promise<VenueBook | null> {
  if (args.usdtKrwVenue === "none") return null;
  return args.usdtKrwVenue === "bithumb"
    ? fetchBithumbBook(args.usdtKrwMarket)
    : fetchUpbitBook(args.usdtKrwMarket);
}

function binanceLevels(value: unknown): BookLevel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((level) => {
      if (!Array.isArray(level)) return null;
      const price = finiteNumber(level[0]);
      const size = finiteNumber(level[1]);
      return price !== null && price > 0 && size !== null && size > 0
        ? { price, size }
        : null;
    })
    .filter((level): level is BookLevel => level !== null);
}

async function fetchObservation(args: Args): Promise<Observation> {
  const shouldFetchBinance = args.usdKrw !== null || args.usdtKrwVenue !== "none";
  const [bithumb, upbit, binance, usdtKrw] = await Promise.all([
    fetchBithumbBook(args.market),
    fetchUpbitBook(args.market),
    shouldFetchBinance ? fetchBinanceBook(args.binanceSymbol) : Promise.resolve(null),
    fetchUsdtKrwBook(args),
  ]);
  return {
    capturedAt: new Date(args.nowMs).toISOString(),
    market: args.market,
    usdKrw: args.usdKrw,
    bithumb,
    upbit,
    binance,
    usdtKrw,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function collectLiveObservations(args: Args): Promise<Observation[]> {
  const count =
    args.durationSeconds <= 0
      ? 1
      : Math.max(1, Math.floor((args.durationSeconds * 1_000) / args.snapshotIntervalMs) + 1);
  const observations: Observation[] = [];
  for (let index = 0; index < count; index += 1) {
    const observationNowMs = args.durationSeconds <= 0 ? args.nowMs : Date.now();
    observations.push(await fetchObservation({ ...args, nowMs: observationNowMs }));
    if (index < count - 1) await sleep(args.snapshotIntervalMs);
  }
  return observations;
}

function spreadBps(book: VenueBook): number {
  return ((book.askPrice - book.bidPrice) / ((book.askPrice + book.bidPrice) / 2)) * 10_000;
}

function toKrwBook(book: VenueBook, usdKrw: number | null): VenueBook | null {
  if (book.venue !== "binance") return book;
  if (usdKrw === null) return null;
  return {
    ...book,
    bidPrice: book.bidPrice * usdKrw,
    askPrice: book.askPrice * usdKrw,
    bids: book.bids.map((level) => ({ price: level.price * usdKrw, size: level.size })),
    asks: book.asks.map((level) => ({ price: level.price * usdKrw, size: level.size })),
  };
}

function toKrwBookWithQuoteBook(book: VenueBook, quoteBook: VenueBook | null | undefined): VenueBook | null {
  if (book.venue !== "binance") return book;
  if (quoteBook === null || quoteBook === undefined) return null;
  return {
    ...book,
    bidPrice: book.bidPrice * quoteBook.bidPrice,
    askPrice: book.askPrice * quoteBook.askPrice,
    bids: book.bids.map((level) => ({ price: level.price * quoteBook.bidPrice, size: level.size })),
    asks: book.asks.map((level) => ({ price: level.price * quoteBook.askPrice, size: level.size })),
  };
}

function feeRate(bps: number): number {
  return bps / 10_000;
}

function edgeForReference(
  observation: Observation,
  referenceVenue: "upbit" | "binance",
  referenceBook: VenueBook,
  referenceFeeBps: number,
  args: Args,
): EdgeRow {
  const bithumb = observation.bithumb;
  const bFee = feeRate(args.bithumbFeeBps);
  const rFee = feeRate(referenceFeeBps);
  const bithumbBidDepth = executableDepth(bithumb.bids, args.notionalKrw);
  const bithumbAskDepth = executableDepth(bithumb.asks, args.notionalKrw);
  const referenceBidDepth = executableDepth(referenceBook.bids, args.notionalKrw);
  const referenceAskDepth = executableDepth(referenceBook.asks, args.notionalKrw);
  const bithumbExecutableBid = bithumbBidDepth.averagePrice ?? bithumb.bidPrice;
  const bithumbExecutableAsk = bithumbAskDepth.averagePrice ?? bithumb.askPrice;
  const referenceExecutableBid = referenceBidDepth.averagePrice ?? referenceBook.bidPrice;
  const referenceExecutableAsk = referenceAskDepth.averagePrice ?? referenceBook.askPrice;
  const sellBithumbNet = bithumbExecutableBid * (1 - bFee);
  const buyReferenceCost = referenceExecutableAsk * (1 + rFee);
  const sellReferenceNet = referenceExecutableBid * (1 - rFee);
  const buyBithumbCost = bithumbExecutableAsk * (1 + bFee);
  const premiumEdgeBps = (sellBithumbNet / buyReferenceCost - 1) * 10_000;
  const discountEdgeBps = (sellReferenceNet / buyBithumbCost - 1) * 10_000;

  if (premiumEdgeBps >= discountEdgeBps) {
    const grossEdgeBps = (bithumbExecutableBid / referenceExecutableAsk - 1) * 10_000;
    const bithumbTopNotionalKrw = topNotionalKrw(bithumb.bidPrice, bithumb.bidSize);
    const referenceTopNotionalKrw = topNotionalKrw(referenceBook.askPrice, referenceBook.askSize);
    return {
      capturedAt: observation.capturedAt,
      referenceVenue,
      direction: "sell_bithumb_buy_reference",
      netEdgeBps: Number(premiumEdgeBps.toFixed(6)),
      grossEdgeBps: Number(grossEdgeBps.toFixed(6)),
      estimatedNetPnlKrw: Number(((args.notionalKrw * premiumEdgeBps) / 10_000).toFixed(6)),
      bithumbSpreadBps: Number(spreadBps(bithumb).toFixed(6)),
      referenceSpreadBps: Number(spreadBps(referenceBook).toFixed(6)),
      bithumbTopNotionalKrw: numberOrNull(bithumbTopNotionalKrw),
      referenceTopNotionalKrw: numberOrNull(referenceTopNotionalKrw),
      bithumbDepthNotionalKrw: numberOrNull(bithumbBidDepth.availableNotional),
      referenceDepthNotionalKrw: numberOrNull(referenceAskDepth.availableNotional),
      depthCovered: bithumbBidDepth.coversNotional && referenceAskDepth.coversNotional,
      ...snapshotSkew(bithumb, referenceBook, args),
    };
  }

  const grossEdgeBps = (referenceExecutableBid / bithumbExecutableAsk - 1) * 10_000;
  const bithumbTopNotionalKrw = topNotionalKrw(bithumb.askPrice, bithumb.askSize);
  const referenceTopNotionalKrw = topNotionalKrw(referenceBook.bidPrice, referenceBook.bidSize);
  return {
    capturedAt: observation.capturedAt,
    referenceVenue,
    direction: "buy_bithumb_sell_reference",
    netEdgeBps: Number(discountEdgeBps.toFixed(6)),
    grossEdgeBps: Number(grossEdgeBps.toFixed(6)),
    estimatedNetPnlKrw: Number(((args.notionalKrw * discountEdgeBps) / 10_000).toFixed(6)),
    bithumbSpreadBps: Number(spreadBps(bithumb).toFixed(6)),
    referenceSpreadBps: Number(spreadBps(referenceBook).toFixed(6)),
    bithumbTopNotionalKrw: numberOrNull(bithumbTopNotionalKrw),
    referenceTopNotionalKrw: numberOrNull(referenceTopNotionalKrw),
    bithumbDepthNotionalKrw: numberOrNull(bithumbAskDepth.availableNotional),
    referenceDepthNotionalKrw: numberOrNull(referenceBidDepth.availableNotional),
    depthCovered: bithumbAskDepth.coversNotional && referenceBidDepth.coversNotional,
    ...snapshotSkew(bithumb, referenceBook, args),
  };
}

function topNotionalKrw(price: number, size: number | null): number | null {
  return size === null || size <= 0 ? null : price * size;
}

function coversNotional(availableNotional: number | null, requiredNotional: number): boolean {
  return availableNotional !== null && availableNotional >= requiredNotional;
}

function executableDepth(
  levels: BookLevel[],
  requiredNotional: number,
): {
  averagePrice: number | null;
  availableNotional: number | null;
  coversNotional: boolean;
} {
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
    availableNotional: levels.length === 0
      ? null
      : levels.reduce((sum, level) => sum + level.price * level.size, 0),
    coversNotional: totalNotional >= requiredNotional,
  };
}

function snapshotSkew(
  left: VenueBook,
  right: VenueBook,
  args: Args,
): Pick<EdgeRow, "snapshotSkewMs" | "snapshotSkewSource"> {
  if (left.timestampMs !== null && right.timestampMs !== null) {
    return {
      snapshotSkewMs: Math.abs(left.timestampMs - right.timestampMs),
      snapshotSkewSource: "source",
    };
  }
  if (args.allowReceiveTimeSkew && left.receivedAtMs !== null && right.receivedAtMs !== null) {
    return {
      snapshotSkewMs: Math.abs(left.receivedAtMs - right.receivedAtMs),
      snapshotSkewSource: "receive",
    };
  }
  return { snapshotSkewMs: null, snapshotSkewSource: "missing" };
}

function buildEdges(observations: Observation[], args: Args): EdgeRow[] {
  const edges: EdgeRow[] = [];
  for (const observation of observations) {
    if (args.referenceVenue === "all" || args.referenceVenue === "upbit") {
      edges.push(edgeForReference(observation, "upbit", observation.upbit, args.upbitFeeBps, args));
    }
    const usdKrw = observation.usdKrw ?? args.usdKrw;
    const globalBook =
      observation.binance === undefined || observation.binance === null
        ? null
        : observation.usdtKrw !== undefined && observation.usdtKrw !== null
          ? toKrwBookWithQuoteBook(observation.binance, observation.usdtKrw)
          : toKrwBook(observation.binance, usdKrw ?? null);
    if (globalBook !== null && (args.referenceVenue === "all" || args.referenceVenue === "binance")) {
      edges.push(edgeForReference(observation, "binance", globalBook, args.globalFeeBps, args));
    }
  }
  return edges;
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

function summarize(edges: EdgeRow[], minNetEdgeBps: number): Summary {
  const values = edges.map((edge) => edge.netEdgeBps);
  const positiveCount = edges.filter((edge) => edge.netEdgeBps >= minNetEdgeBps).length;
  const depthCoveredCount = edges.filter((edge) => edge.depthCovered).length;
  return {
    count: edges.length,
    positiveCount,
    positiveRate: edges.length === 0 ? null : Number((positiveCount / edges.length).toFixed(6)),
    depthCoveredCount,
    depthCoverageRate:
      edges.length === 0 ? null : Number((depthCoveredCount / edges.length).toFixed(6)),
    averageNetEdgeBps:
      values.length === 0 ? null : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
    medianNetEdgeBps: numberOrNull(median(values)),
    maxNetEdgeBps: values.length === 0 ? null : Math.max(...values),
    minNetEdgeBps: values.length === 0 ? null : Math.min(...values),
    totalEstimatedNetPnlKrw: Number(
      edges.reduce((sum, edge) => sum + edge.estimatedNetPnlKrw, 0).toFixed(6),
    ),
  };
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

function hasGlobalReference(observations: Observation[]): boolean {
  return observations.some((observation) => observation.binance !== undefined && observation.binance !== null);
}

function hasGlobalReferenceWithoutQuoteBook(observations: Observation[]): boolean {
  return observations.some(
    (observation) =>
      observation.binance !== undefined &&
      observation.binance !== null &&
      (observation.usdtKrw === undefined || observation.usdtKrw === null),
  );
}

function fxAgeHours(args: Args): number | null {
  return args.usdKrwUpdatedAtMs === null ? null : Math.max(0, (args.nowMs - args.usdKrwUpdatedAtMs) / 3_600_000);
}

function blockerList(observations: Observation[], edges: EdgeRow[], summary: Summary, args: Args): string[] {
  const blockers: string[] = [];
  if (observations.length < args.minObservations) blockers.push("insufficientObservations");
  const spanMinutes = observationSpanMinutes(observations);
  if (spanMinutes === null || spanMinutes < args.minObservationSpanMinutes) {
    blockers.push("insufficientObservationSpan");
  }
  if (!args.accountFeesConfirmed) blockers.push("feeScheduleUnconfirmed");
  if (!args.inventoryReady) blockers.push("inventoryNotReady");
  if (!args.hedgeVenueReady) blockers.push("hedgeVenueNotReady");
  const ageHours = latestAgeHours(observations, args.nowMs);
  if (ageHours === null) blockers.push("missingLatestObservationTimestamp");
  else if (ageHours > args.maxLatestAgeHours) blockers.push("staleLatestObservation");
  if (hasGlobalReferenceWithoutQuoteBook(observations)) {
    const fxAge = fxAgeHours(args);
    if (fxAge === null) blockers.push("missingFxTimestamp");
    else if (fxAge < 0 || fxAge > args.maxFxAgeHours) blockers.push("staleFxRate");
  }
  if ((summary.medianNetEdgeBps ?? Number.NEGATIVE_INFINITY) < args.minNetEdgeBps) {
    blockers.push("weakMedianNetEdge");
  }
  if ((summary.positiveRate ?? 0) < args.minEdgeObservationRate) {
    blockers.push("lowEdgeObservationRate");
  }
  if (
    edges.some(
      (edge) => edge.bithumbSpreadBps > args.maxSpreadBps || edge.referenceSpreadBps > args.maxSpreadBps,
    )
  ) {
    blockers.push("wideDisplayedSpread");
  }
  if ((summary.depthCoverageRate ?? 0) < args.minDepthCoverageRate) blockers.push("depthInsufficient");
  if (edges.some((edge) => edge.snapshotSkewMs === null)) blockers.push("missingSnapshotSkew");
  else if (edges.some((edge) => (edge.snapshotSkewMs ?? 0) > args.maxSnapshotSkewMs)) {
    blockers.push("snapshotSkewTooWide");
  }
  return blockers;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const observations =
    args.inputObservationsPath === null
      ? await collectLiveObservations(args)
      : overrideInputUsdKrw(await loadObservations(args.inputObservationsPath), args);
  const reportNowMs =
    args.inputObservationsPath === null && args.durationSeconds > 0 ? Date.now() : args.nowMs;
  const edges = buildEdges(observations, args);
  const bestEdgesByObservation = observations
    .map((observation) =>
      edges
        .filter((edge) => edge.capturedAt === observation.capturedAt)
        .sort((left, right) => right.netEdgeBps - left.netEdgeBps)[0],
    )
    .filter((edge): edge is EdgeRow => edge !== undefined);
  const summary = summarize(bestEdgesByObservation, args.minNetEdgeBps);
  const blockers = blockerList(observations, bestEdgesByObservation, summary, {
    ...args,
    nowMs: reportNowMs,
  });
  const promotionEligible = blockers.length === 0;
  const report = {
    generatedAt: new Date(reportNowMs).toISOString(),
    objective:
      "Measure cross-exchange relative value before considering any Bithumb KRW live strategy.",
    status: promotionEligible ? "promotion_candidate" : "blocked",
    promotionEligible,
    blockers,
    assumptions: {
      market: args.market,
      binanceSymbol: args.binanceSymbol,
      referenceVenue: args.referenceVenue,
      usdtKrwVenue: args.usdtKrwVenue,
      usdtKrwMarket: args.usdtKrwMarket,
      usdKrw: args.usdKrw,
      usdKrwUpdatedAt:
        args.usdKrwUpdatedAtMs === null ? null : new Date(args.usdKrwUpdatedAtMs).toISOString(),
      overrideInputUsdKrw: args.overrideInputUsdKrw,
      notionalKrw: args.notionalKrw,
      bithumbFeeBps: args.bithumbFeeBps,
      upbitFeeBps: args.upbitFeeBps,
      globalFeeBps: args.globalFeeBps,
      minNetEdgeBps: args.minNetEdgeBps,
      minObservations: args.minObservations,
      minObservationSpanMinutes: args.minObservationSpanMinutes,
      minEdgeObservationRate: args.minEdgeObservationRate,
      minDepthCoverageRate: args.minDepthCoverageRate,
      maxLatestAgeHours: args.maxLatestAgeHours,
      maxFxAgeHours: args.maxFxAgeHours,
      maxSpreadBps: args.maxSpreadBps,
      maxSnapshotSkewMs: args.maxSnapshotSkewMs,
      allowReceiveTimeSkew: args.allowReceiveTimeSkew,
      accountFeesConfirmed: args.accountFeesConfirmed,
      inventoryReady: args.inventoryReady,
      hedgeVenueReady: args.hedgeVenueReady,
      durationSeconds: args.durationSeconds,
      snapshotIntervalMs: args.snapshotIntervalMs,
      sourceUrls: {
        bithumbOrderbook: "https://apidocs.bithumb.com/reference/%ED%98%B8%EA%B0%80-%EC%A0%95%EB%B3%B4-%EC%A1%B0%ED%9A%8C",
        upbitOrderbook: "https://docs.upbit.com/kr/reference/%ED%98%B8%EA%B0%80-%EC%A0%95%EB%B3%B4-%EC%A1%B0%ED%9A%8C",
        binanceDepth: "https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#order-book",
        bithumbUsdtKrwOrderbook: "https://apidocs.bithumb.com/reference/%ED%98%B8%EA%B0%80-%EC%A1%B0%ED%9A%8C",
        upbitUsdtKrwOrderbook: "https://docs.upbit.com/kr/reference/%ED%98%B8%EA%B0%80-%EC%A0%95%EB%B3%B4-%EC%A1%B0%ED%9A%8C",
      },
    },
    observationCount: observations.length,
    observationSpanMinutes: numberOrNull(observationSpanMinutes(observations)),
    latestObservationAgeHours: numberOrNull(latestAgeHours(observations, reportNowMs)),
    fxAgeHours: numberOrNull(fxAgeHours({ ...args, nowMs: reportNowMs })),
    summary,
    topEdges: [...bestEdgesByObservation]
      .sort((left, right) => right.netEdgeBps - left.netEdgeBps)
      .slice(0, 20),
    observations,
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);

  if (args.requirePromotion && !promotionEligible) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
