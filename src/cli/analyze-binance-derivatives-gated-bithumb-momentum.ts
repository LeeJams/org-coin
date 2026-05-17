import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  pairs: Array<{ market: string; symbol: string }>;
  unitMinutes: number;
  limit: number;
  inputPath: string | null;
  outputPath: string | null;
  notionalKrw: number;
  feeRoundTripRate: number;
  maxFundingBpsForLong: number;
  maxLongShortRatioForLong: number;
  minTakerBuySellRatioForLong: number;
  minOpenInterestChangePctForLong: number;
  openInterestChangeLookbackHours: number;
}

interface Candle {
  timestampMs: number;
  close: number;
}

interface FundingRow {
  fundingRate?: string | number;
  fundingTime?: number;
}

interface TimestampRow {
  timestamp?: number;
}

interface OpenInterestRow extends TimestampRow {
  sumOpenInterestValue?: string | number;
}

interface LongShortRow extends TimestampRow {
  longShortRatio?: string | number;
}

interface TakerLongShortRow extends TimestampRow {
  buySellRatio?: string | number;
}

interface DerivativeRows {
  fundingRate?: FundingRow[];
  openInterestHist?: OpenInterestRow[];
  globalLongShortAccountRatio?: LongShortRow[];
  takerLongShortRatio?: TakerLongShortRow[];
}

interface PairInput {
  candles?: Array<Record<string, unknown>>;
  derivatives?: DerivativeRows;
}

interface CandidateConfig {
  lookbackBars: number;
  holdBars: number;
  minReturnBps: number;
}

interface Trade {
  entryAt: number;
  exitAt: number;
  pnlKrw: number;
  regimePassed: boolean;
}

interface Summary {
  count: number;
  totalPnlKrw: number;
  averagePnlKrw: number | null;
  medianPnlKrw: number | null;
  winners: number;
  losers: number;
  returnPct: number | null;
}

interface WalkForwardSummary {
  foldCount: number;
  positiveTotalFoldCount: number;
  positiveMedianFoldCount: number;
  totalPnlKrw: number;
  minFoldPnlKrw: number | null;
}

interface TimeRange {
  fromMs: number | null;
  toMs: number | null;
}

interface PairedCoverage {
  candleSpanDays: number;
  pairedFromMs: number | null;
  pairedToMs: number | null;
  pairedSpanDays: number;
  pairedCandleCount: number;
  ranges: {
    candles: TimeRange;
    funding: TimeRange;
    openInterest: TimeRange;
    longShort: TimeRange;
    takerLongShort: TimeRange;
  };
}

const BITHUMB_REST_BASE_URL = "https://api.bithumb.com/v1";
const BINANCE_FAPI_BASE_URL = "https://fapi.binance.com";
const DEFAULT_PAIRS = [
  { market: "KRW-BTC", symbol: "BTCUSDT" },
  { market: "KRW-ETH", symbol: "ETHUSDT" },
  { market: "KRW-XRP", symbol: "XRPUSDT" },
];
const LOOKBACK_BARS = [4, 8, 12, 24, 72];
const HOLD_BARS = [4, 8, 24, 72];
const MIN_RETURNS_BPS = [0, 10, 25, 50];
const WALK_FORWARD_FOLDS = 5;
const MIN_PROMOTION_SPAN_DAYS = 90;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    pairs: DEFAULT_PAIRS,
    unitMinutes: 60,
    limit: 500,
    inputPath: null,
    outputPath: null,
    notionalKrw: 500_000,
    feeRoundTripRate: 0.005,
    maxFundingBpsForLong: 2,
    maxLongShortRatioForLong: 1.35,
    minTakerBuySellRatioForLong: 1,
    minOpenInterestChangePctForLong: 0,
    openInterestChangeLookbackHours: 24,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--pairs") {
      if (!value) throw new Error("--pairs requires comma-separated MARKET:SYMBOL values");
      args.pairs = value.split(",").map(parsePair);
      if (args.pairs.length === 0) throw new Error("--pairs requires at least one pair");
      index += 1;
      continue;
    }
    if (arg === "--unit-minutes") {
      if (!value) throw new Error("--unit-minutes requires a value");
      args.unitMinutes = positiveInteger(value, "--unit-minutes");
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      if (!value) throw new Error("--limit requires a value");
      args.limit = positiveInteger(value, "--limit");
      index += 1;
      continue;
    }
    if (arg === "--input") {
      if (!value) throw new Error("--input requires a value");
      args.inputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--notional-krw") {
      if (!value) throw new Error("--notional-krw requires a value");
      args.notionalKrw = positiveNumber(value, "--notional-krw");
      index += 1;
      continue;
    }
    if (arg === "--fee-round-trip-bps") {
      if (!value) throw new Error("--fee-round-trip-bps requires a value");
      args.feeRoundTripRate = positiveNumber(value, "--fee-round-trip-bps") / 10_000;
      index += 1;
      continue;
    }
    if (arg === "--max-funding-bps-for-long") {
      if (!value) throw new Error("--max-funding-bps-for-long requires a value");
      args.maxFundingBpsForLong = finiteNumber(value, "--max-funding-bps-for-long");
      index += 1;
      continue;
    }
    if (arg === "--max-long-short-ratio-for-long") {
      if (!value) throw new Error("--max-long-short-ratio-for-long requires a value");
      args.maxLongShortRatioForLong = positiveNumber(value, "--max-long-short-ratio-for-long");
      index += 1;
      continue;
    }
    if (arg === "--min-taker-buy-sell-ratio-for-long") {
      if (!value) throw new Error("--min-taker-buy-sell-ratio-for-long requires a value");
      args.minTakerBuySellRatioForLong = positiveNumber(value, "--min-taker-buy-sell-ratio-for-long");
      index += 1;
      continue;
    }
    if (arg === "--min-open-interest-change-pct-for-long") {
      if (!value) throw new Error("--min-open-interest-change-pct-for-long requires a value");
      args.minOpenInterestChangePctForLong = finiteNumber(value, "--min-open-interest-change-pct-for-long");
      index += 1;
      continue;
    }
    if (arg === "--open-interest-change-lookback-hours") {
      if (!value) throw new Error("--open-interest-change-lookback-hours requires a value");
      args.openInterestChangeLookbackHours = positiveInteger(value, "--open-interest-change-lookback-hours");
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return args;
}

function parsePair(value: string): { market: string; symbol: string } {
  const [market, symbol] = value.split(":");
  if (!market || !symbol) throw new Error(`invalid pair: ${value}`);
  return { market: market.trim(), symbol: symbol.trim().toUpperCase() };
}

function finiteNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function positiveNumber(value: string, label: string): number {
  const parsed = finiteNumber(value, label);
  if (parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function positiveInteger(value: string, label: string): number {
  const parsed = positiveNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function timestampMs(record: Record<string, unknown>): number {
  if (typeof record.candle_date_time_utc === "string") {
    const parsed = Date.parse(`${record.candle_date_time_utc}Z`);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof record.candle_date_time_kst === "string") {
    const parsed = Date.parse(`${record.candle_date_time_kst}+09:00`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return numberValue(record.timestampMs ?? record.timestamp ?? record.candle_timestamp_ms) ?? 0;
}

function normalizeCandle(record: Record<string, unknown>): Candle | null {
  const close = numberValue(record.close ?? record.trade_price ?? record.close_price);
  const timestamp = timestampMs(record);
  return timestamp > 0 && close !== null && close > 0
    ? { timestampMs: timestamp, close }
    : null;
}

function dedupeCandles(records: Array<Record<string, unknown>>): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const record of records) {
    const candle = normalizeCandle(record);
    if (candle !== null) byTimestamp.set(candle.timestampMs, candle);
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

function toBithumbKst(timestamp: number): string {
  const kst = new Date(timestamp + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 19);
}

async function fetchJson(path: string, params: Record<string, string>, baseUrl: string): Promise<unknown> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${baseUrl}${path} failed (${response.status})`);
  return response.json();
}

async function fetchBithumbCandles(market: string, unitMinutes: number, limit: number): Promise<Candle[]> {
  const candles = new Map<number, Candle>();
  let to: string | undefined;
  while (candles.size < limit) {
    const payload = await fetchJson(
      `/candles/minutes/${unitMinutes}`,
      {
        market,
        count: String(Math.min(200, limit - candles.size)),
        ...(to === undefined ? {} : { to }),
      },
      BITHUMB_REST_BASE_URL,
    );
    if (!Array.isArray(payload) || payload.length === 0) break;
    for (const candle of dedupeCandles(payload as Array<Record<string, unknown>>)) {
      candles.set(candle.timestampMs, candle);
    }
    const oldest = [...candles.values()].sort((left, right) => left.timestampMs - right.timestampMs)[0];
    if (!oldest) break;
    to = toBithumbKst(oldest.timestampMs - 1);
    await sleep(80);
  }
  return [...candles.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

async function fetchDerivatives(symbol: string, args: Args): Promise<DerivativeRows> {
  const period = binancePeriod(args.unitMinutes);
  const [fundingRate, openInterestHist, globalLongShortAccountRatio, takerLongShortRatio] =
    await Promise.all([
      fetchJson("/fapi/v1/fundingRate", { symbol, limit: String(Math.min(args.limit, 1000)) }, BINANCE_FAPI_BASE_URL),
      fetchJson("/futures/data/openInterestHist", { symbol, period, limit: String(args.limit) }, BINANCE_FAPI_BASE_URL),
      fetchJson("/futures/data/globalLongShortAccountRatio", { symbol, period, limit: String(args.limit) }, BINANCE_FAPI_BASE_URL),
      fetchJson("/futures/data/takerlongshortRatio", { symbol, period, limit: String(args.limit) }, BINANCE_FAPI_BASE_URL),
    ]);
  return {
    fundingRate: Array.isArray(fundingRate) ? fundingRate as FundingRow[] : [],
    openInterestHist: Array.isArray(openInterestHist) ? openInterestHist as OpenInterestRow[] : [],
    globalLongShortAccountRatio: Array.isArray(globalLongShortAccountRatio) ? globalLongShortAccountRatio as LongShortRow[] : [],
    takerLongShortRatio: Array.isArray(takerLongShortRatio) ? takerLongShortRatio as TakerLongShortRow[] : [],
  };
}

function binancePeriod(unitMinutes: number): string {
  if (unitMinutes === 60) return "1h";
  if (unitMinutes === 240) return "4h";
  if (unitMinutes === 1440) return "1d";
  return `${unitMinutes}m`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function lowerOrEqual<T extends TimestampRow | FundingRow>(
  rows: T[],
  timestamp: number,
  getTimestamp: (row: T) => number | undefined,
): T | null {
  let result: T | null = null;
  for (const row of rows) {
    const rowTimestamp = getTimestamp(row);
    if (rowTimestamp !== undefined && rowTimestamp <= timestamp) {
      result = row;
    }
  }
  return result;
}

function derivativeRegimePass(rows: DerivativeRows, timestamp: number, args: Args): boolean {
  const funding = lowerOrEqual(rows.fundingRate ?? [], timestamp, (row) => row.fundingTime);
  const openInterest = lowerOrEqual(rows.openInterestHist ?? [], timestamp, (row) => row.timestamp);
  const previousOpenInterest = lowerOrEqual(
    rows.openInterestHist ?? [],
    timestamp - args.openInterestChangeLookbackHours * 60 * 60 * 1000,
    (row) => row.timestamp,
  );
  const longShort = lowerOrEqual(rows.globalLongShortAccountRatio ?? [], timestamp, (row) => row.timestamp);
  const taker = lowerOrEqual(rows.takerLongShortRatio ?? [], timestamp, (row) => row.timestamp);

  const fundingBps = (numberValue(funding?.fundingRate) ?? Infinity) * 10_000;
  const currentOi = numberValue(openInterest?.sumOpenInterestValue);
  const previousOi = numberValue(previousOpenInterest?.sumOpenInterestValue);
  const openInterestChangePct =
    currentOi !== null && previousOi !== null && previousOi > 0
      ? (currentOi / previousOi - 1) * 100
      : -Infinity;
  const longShortRatio = numberValue(longShort?.longShortRatio) ?? Infinity;
  const takerBuySellRatio = numberValue(taker?.buySellRatio) ?? -Infinity;

  return (
    fundingBps <= args.maxFundingBpsForLong &&
    openInterestChangePct >= args.minOpenInterestChangePctForLong &&
    longShortRatio <= args.maxLongShortRatioForLong &&
    takerBuySellRatio >= args.minTakerBuySellRatioForLong
  );
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function simulate(
  candles: Candle[],
  derivatives: DerivativeRows,
  candidate: CandidateConfig,
  args: Args,
  startIndex: number,
  endIndex: number,
): { baseline: Trade[]; gated: Trade[] } {
  const baseline: Trade[] = [];
  const gated: Trade[] = [];
  let nextBaselineEntry = startIndex;
  let nextGatedEntry = startIndex;
  const firstIndex = Math.max(startIndex, candidate.lookbackBars);
  const lastIndex = Math.min(endIndex, candles.length - candidate.holdBars - 1);

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const current = candles[index];
    const previous = candles[index - candidate.lookbackBars];
    const exit = candles[index + candidate.holdBars];
    if (!current || !previous || !exit) continue;
    if (bps(current.close, previous.close) < candidate.minReturnBps) continue;

    const trade = {
      entryAt: current.timestampMs,
      exitAt: exit.timestampMs,
      pnlKrw: args.notionalKrw * (exit.close / current.close - 1 - args.feeRoundTripRate),
      regimePassed: derivativeRegimePass(derivatives, current.timestampMs, args),
    };
    if (index >= nextBaselineEntry) {
      baseline.push(trade);
      nextBaselineEntry = index + candidate.holdBars;
    }
    if (index >= nextGatedEntry && trade.regimePassed) {
      gated.push(trade);
      nextGatedEntry = index + candidate.holdBars;
    }
  }
  return { baseline, gated };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

function round(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function summarize(trades: Trade[], notionalKrw: number): Summary {
  const values = trades.map((trade) => trade.pnlKrw);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: trades.length,
    totalPnlKrw: round(total) ?? 0,
    averagePnlKrw: trades.length === 0 ? null : round(total / trades.length),
    medianPnlKrw: round(median(values)),
    winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value <= 0).length,
    returnPct: trades.length === 0 ? null : round((total / (notionalKrw * trades.length)) * 100),
  };
}

function walkForward(trades: Trade[], notionalKrw: number): WalkForwardSummary {
  if (trades.length === 0) {
    return {
      foldCount: 0,
      positiveTotalFoldCount: 0,
      positiveMedianFoldCount: 0,
      totalPnlKrw: 0,
      minFoldPnlKrw: null,
    };
  }
  const start = trades[0]!.entryAt;
  const end = trades.at(-1)!.entryAt;
  const span = Math.max(1, end - start + 1);
  const summaries: Summary[] = [];
  for (let fold = 0; fold < WALK_FORWARD_FOLDS; fold += 1) {
    const foldStart = start + Math.floor((span * fold) / WALK_FORWARD_FOLDS);
    const foldEnd = fold === WALK_FORWARD_FOLDS - 1 ? end + 1 : start + Math.floor((span * (fold + 1)) / WALK_FORWARD_FOLDS);
    summaries.push(summarize(trades.filter((trade) => trade.entryAt >= foldStart && trade.entryAt < foldEnd), notionalKrw));
  }
  const totals = summaries.map((summary) => summary.totalPnlKrw);
  return {
    foldCount: WALK_FORWARD_FOLDS,
    positiveTotalFoldCount: summaries.filter((summary) => summary.totalPnlKrw > 0).length,
    positiveMedianFoldCount: summaries.filter((summary) => (summary.medianPnlKrw ?? -Infinity) > 0).length,
    totalPnlKrw: round(totals.reduce((sum, value) => sum + value, 0)) ?? 0,
    minFoldPnlKrw: round(Math.min(...totals)),
  };
}

function promotionEligible(
  train: Summary,
  test: Summary,
  walkForwardSummary: WalkForwardSummary,
  pairedSpanDays: number,
): boolean {
  return (
    pairedSpanDays >= MIN_PROMOTION_SPAN_DAYS &&
    train.count >= MIN_PROMOTION_TRAIN_TRADES &&
    test.count >= MIN_PROMOTION_TEST_TRADES &&
    train.totalPnlKrw > 0 &&
    test.totalPnlKrw > 0 &&
    (train.medianPnlKrw ?? -Infinity) > 0 &&
    (test.medianPnlKrw ?? -Infinity) > 0 &&
    (walkForwardSummary.minFoldPnlKrw ?? -Infinity) >= 0 &&
    walkForwardSummary.positiveTotalFoldCount >= MIN_POSITIVE_WALK_FORWARD_FOLDS &&
    walkForwardSummary.positiveMedianFoldCount >= MIN_POSITIVE_WALK_FORWARD_FOLDS
  );
}

function score(test: Summary, baselineTest: Summary, walkForwardSummary: WalkForwardSummary): number {
  return (
    test.totalPnlKrw -
    baselineTest.totalPnlKrw +
    (test.medianPnlKrw ?? 0) * 10 +
    (walkForwardSummary.minFoldPnlKrw ?? 0)
  );
}

async function loadInput(path: string): Promise<Record<string, PairInput>> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  if (parsed.pairs !== undefined && typeof parsed.pairs === "object" && parsed.pairs !== null) {
    return parsed.pairs as Record<string, PairInput>;
  }
  return parsed as Record<string, PairInput>;
}

async function loadPairData(pair: { market: string; symbol: string }, args: Args, input: Record<string, PairInput> | null) {
  const key = `${pair.market}:${pair.symbol}`;
  if (input !== null) {
    const row = input[key];
    if (!row) throw new Error(`input missing ${key}`);
    return {
      candles: dedupeCandles(row.candles ?? []),
      derivatives: row.derivatives ?? {},
    };
  }
  const [candles, derivatives] = await Promise.all([
    fetchBithumbCandles(pair.market, args.unitMinutes, args.limit),
    fetchDerivatives(pair.symbol, args),
  ]);
  return { candles, derivatives };
}

function rangeFromValues(values: number[]): TimeRange {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return { fromMs: null, toMs: null };
  return {
    fromMs: Math.min(...finiteValues),
    toMs: Math.max(...finiteValues),
  };
}

function candleRange(candles: Candle[]): TimeRange {
  return rangeFromValues(candles.map((candle) => candle.timestampMs));
}

function derivativeRange<T>(
  rows: T[] | undefined,
  timestampOf: (row: T) => number | undefined,
): TimeRange {
  return rangeFromValues((rows ?? []).map((row) => timestampOf(row) ?? NaN));
}

function daysBetween(fromMs: number | null, toMs: number | null): number {
  if (fromMs === null || toMs === null || toMs <= fromMs) return 0;
  return (toMs - fromMs) / (24 * 60 * 60 * 1000);
}

function buildPairedCoverage(
  candles: Candle[],
  derivatives: DerivativeRows,
  openInterestChangeLookbackHours: number,
): PairedCoverage {
  const ranges = {
    candles: candleRange(candles),
    funding: derivativeRange(derivatives.fundingRate, (row) => row.fundingTime),
    openInterest: derivativeRange(derivatives.openInterestHist, (row) => row.timestamp),
    longShort: derivativeRange(derivatives.globalLongShortAccountRatio, (row) => row.timestamp),
    takerLongShort: derivativeRange(derivatives.takerLongShortRatio, (row) => row.timestamp),
  };
  const openInterestLookbackMs = openInterestChangeLookbackHours * 60 * 60 * 1000;
  const fromCandidates = [
    ranges.candles.fromMs,
    ranges.funding.fromMs,
    ranges.openInterest.fromMs === null ? null : ranges.openInterest.fromMs + openInterestLookbackMs,
    ranges.longShort.fromMs,
    ranges.takerLongShort.fromMs,
  ];
  const toCandidates = [
    ranges.candles.toMs,
    ranges.funding.toMs,
    ranges.openInterest.toMs,
    ranges.longShort.toMs,
    ranges.takerLongShort.toMs,
  ];
  const coverageMissing =
    fromCandidates.some((value) => value === null) || toCandidates.some((value) => value === null);
  const pairedFromMs = coverageMissing ? null : Math.max(...(fromCandidates as number[]));
  const pairedToMs = coverageMissing ? null : Math.min(...(toCandidates as number[]));
  const pairedSpanDays = daysBetween(pairedFromMs, pairedToMs);
  const pairedCandleCount =
    pairedFromMs === null || pairedToMs === null
      ? 0
      : candles.filter((candle) => candle.timestampMs >= pairedFromMs && candle.timestampMs <= pairedToMs).length;

  return {
    candleSpanDays: daysBetween(ranges.candles.fromMs, ranges.candles.toMs),
    pairedFromMs,
    pairedToMs,
    pairedSpanDays,
    pairedCandleCount,
    ranges,
  };
}

function restrictToPairedCoverage(candles: Candle[], coverage: PairedCoverage): Candle[] {
  if (coverage.pairedFromMs === null || coverage.pairedToMs === null) return [];
  return candles.filter(
    (candle) =>
      candle.timestampMs >= coverage.pairedFromMs! && candle.timestampMs <= coverage.pairedToMs!,
  );
}

function isoOrNull(timestampMs: number | null): string | null {
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}

function outputRange(range: TimeRange): { from: string | null; to: string | null; spanDays: number } {
  return {
    from: isoOrNull(range.fromMs),
    to: isoOrNull(range.toMs),
    spanDays: round(daysBetween(range.fromMs, range.toMs)) ?? 0,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const input = args.inputPath === null ? null : await loadInput(args.inputPath);
  const pairReports = [];

  for (const pair of args.pairs) {
    const { candles, derivatives } = await loadPairData(pair, args, input);
    const coverage = buildPairedCoverage(candles, derivatives, args.openInterestChangeLookbackHours);
    const pairedCandles = restrictToPairedCoverage(candles, coverage);
    const splitIndex = Math.floor(pairedCandles.length * 0.7);
    const candidates = [];
    for (const lookbackBars of LOOKBACK_BARS) {
      for (const holdBars of HOLD_BARS) {
        if (holdBars > lookbackBars && lookbackBars < 24) continue;
        for (const minReturnBps of MIN_RETURNS_BPS) {
          const candidate = { lookbackBars, holdBars, minReturnBps };
          const trainTrades = simulate(pairedCandles, derivatives, candidate, args, 0, splitIndex);
          const testTrades = simulate(pairedCandles, derivatives, candidate, args, splitIndex, pairedCandles.length);
          const allTrades = simulate(pairedCandles, derivatives, candidate, args, 0, pairedCandles.length);
          const train = summarize(trainTrades.gated, args.notionalKrw);
          const test = summarize(testTrades.gated, args.notionalKrw);
          const baselineTrain = summarize(trainTrades.baseline, args.notionalKrw);
          const baselineTest = summarize(testTrades.baseline, args.notionalKrw);
          const wf = walkForward(allTrades.gated, args.notionalKrw);
          candidates.push({
            ...candidate,
            baselineTrain,
            baselineTest,
            train,
            test,
            walkForward: wf,
            gatedTradeCount: train.count + test.count,
            baselineTradeCount: baselineTrain.count + baselineTest.count,
            promotionEligible: promotionEligible(train, test, wf, coverage.pairedSpanDays),
            diagnosticImprovement:
              test.count > 0 &&
              test.totalPnlKrw > 0 &&
              (test.medianPnlKrw ?? -Infinity) > 0 &&
              test.totalPnlKrw > baselineTest.totalPnlKrw &&
              (test.medianPnlKrw ?? -Infinity) > (baselineTest.medianPnlKrw ?? -Infinity),
            score: score(test, baselineTest, wf),
          });
        }
      }
    }
    const sorted = candidates.sort(
      (left, right) =>
        Number(right.diagnosticImprovement) - Number(left.diagnosticImprovement) ||
        right.score - left.score,
    );
    pairReports.push({
      market: pair.market,
      symbol: pair.symbol,
      source: {
        candleCount: candles.length,
        candleFrom: candles[0] ? new Date(candles[0].timestampMs).toISOString() : null,
        candleTo: candles.at(-1) ? new Date(candles.at(-1)!.timestampMs).toISOString() : null,
        candleSpanDays: round(coverage.candleSpanDays),
        pairedCandleCount: coverage.pairedCandleCount,
        pairedFrom: isoOrNull(coverage.pairedFromMs),
        pairedTo: isoOrNull(coverage.pairedToMs),
        pairedSpanDays: round(coverage.pairedSpanDays),
        spanDays: round(coverage.pairedSpanDays),
        spanDaysInterpretation:
          "promotion span is the event-time overlap of Bithumb candles and all required Binance derivatives feeds, not the full candle range",
        rawRanges: {
          candles: outputRange(coverage.ranges.candles),
          funding: outputRange(coverage.ranges.funding),
          openInterest: outputRange(coverage.ranges.openInterest),
          longShort: outputRange(coverage.ranges.longShort),
          takerLongShort: outputRange(coverage.ranges.takerLongShort),
        },
        fundingCount: derivatives.fundingRate?.length ?? 0,
        openInterestCount: derivatives.openInterestHist?.length ?? 0,
        longShortCount: derivatives.globalLongShortAccountRatio?.length ?? 0,
        takerLongShortCount: derivatives.takerLongShortRatio?.length ?? 0,
      },
      promotionCandidateCount: sorted.filter((candidate) => candidate.promotionEligible).length,
      diagnosticImprovementCount: sorted.filter((candidate) => candidate.diagnosticImprovement).length,
      topDiagnosticCandidates: sorted.slice(0, 10),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: args.inputPath === null ? "bithumb_binance_public_rest" : "input_snapshot",
    interpretation:
      "Diagnostic only: promotion uses only the paired overlap of Bithumb candles and Binance derivative feeds; live startup still requires promotion gates plus Bithumb orderbook/paper execution proof.",
    assumptions: {
      pairs: args.pairs,
      unitMinutes: args.unitMinutes,
      limit: args.limit,
      notionalKrw: args.notionalKrw,
      feeRoundTripBps: args.feeRoundTripRate * 10_000,
      minPromotionSpanDays: MIN_PROMOTION_SPAN_DAYS,
      thresholds: {
        maxFundingBpsForLong: args.maxFundingBpsForLong,
        maxLongShortRatioForLong: args.maxLongShortRatioForLong,
        minTakerBuySellRatioForLong: args.minTakerBuySellRatioForLong,
        minOpenInterestChangePctForLong: args.minOpenInterestChangePctForLong,
        openInterestChangeLookbackHours: args.openInterestChangeLookbackHours,
      },
    },
    promotionCandidateCount: pairReports.reduce((sum, pair) => sum + pair.promotionCandidateCount, 0),
    diagnosticImprovementCount: pairReports.reduce((sum, pair) => sum + pair.diagnosticImprovementCount, 0),
    pairs: pairReports,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
