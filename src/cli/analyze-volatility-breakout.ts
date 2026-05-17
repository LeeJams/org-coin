import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  market: string;
  markets: string[] | null;
  topMarkets: number | null;
  unitMinutes: number;
  maxCandles: number;
  inputCandlesPath: string | null;
  outputPath: string | null;
  notionalKrw: number;
  feeRoundTripRate: number;
}

interface Candle {
  timestampMs: number;
  close: number;
  high: number;
  low: number;
  volumeKrw: number;
}

interface MarketSummary {
  market: string;
  koreanName: string | null;
  englishName: string | null;
  accTradePrice24h: number | null;
}

interface CandidateConfig {
  breakoutLookbackBars: number;
  contractionBars: number;
  holdBars: number;
  maxRangePercentile: number;
  minBreakoutBps: number;
  minVolumeMultiple: number;
}

interface PreparedCandidate extends CandidateConfig {
  rangeThresholdBps: number;
}

interface Trade {
  entryAt: number;
  exitAt: number;
  entryPrice: number;
  exitPrice: number;
  pnlKrw: number;
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
  allPositiveFoldCount: number;
  totalPnlKrw: number;
  minFoldPnlKrw: number | null;
}

const REST_BASE_URL = "https://api.bithumb.com/v1";
const FEE_ROUND_TRIP_RATE = 0.005;
const WALK_FORWARD_FOLDS = 5;
const MIN_PROMOTION_CANDLES = 3_000;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;
const BREAKOUT_LOOKBACKS = [24, 72];
const CONTRACTION_BARS = [12, 24, 72];
const HOLDS = [4, 8, 24];
const MAX_RANGE_PERCENTILES = [0.25, 0.5];
const MIN_BREAKOUT_BPS = [0, 25, 50];
const MIN_VOLUME_MULTIPLES = [1, 1.25, 1.5];

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    market: "KRW-BTC",
    markets: null,
    topMarkets: null,
    unitMinutes: 60,
    maxCandles: 5_000,
    inputCandlesPath: null,
    outputPath: null,
    notionalKrw: 500_000,
    feeRoundTripRate: FEE_ROUND_TRIP_RATE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--market") {
      if (!value) throw new Error("--market requires a value");
      args.market = value;
      index += 1;
      continue;
    }
    if (arg === "--markets") {
      if (!value) throw new Error("--markets requires a comma-separated value");
      args.markets = value
        .split(",")
        .map((market) => market.trim())
        .filter((market) => market.length > 0);
      if (args.markets.length === 0) throw new Error("--markets requires at least one market");
      args.topMarkets = null;
      index += 1;
      continue;
    }
    if (arg === "--top-markets") {
      if (!value) throw new Error("--top-markets requires a value");
      args.topMarkets = positiveInteger(value, "--top-markets");
      args.markets = null;
      index += 1;
      continue;
    }
    if (arg === "--unit-minutes") {
      if (!value) throw new Error("--unit-minutes requires a value");
      args.unitMinutes = positiveInteger(value, "--unit-minutes");
      index += 1;
      continue;
    }
    if (arg === "--max-candles") {
      if (!value) throw new Error("--max-candles requires a value");
      args.maxCandles = positiveInteger(value, "--max-candles");
      index += 1;
      continue;
    }
    if (arg === "--input-candles") {
      if (!value) throw new Error("--input-candles requires a value");
      args.inputCandlesPath = resolve(cwd, value);
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
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.inputCandlesPath && (args.markets !== null || args.topMarkets !== null)) {
    throw new Error("--input-candles can only be used with a single --market scan");
  }

  return args;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return parsed;
}

function positiveInteger(value: string, label: string): number {
  const parsed = positiveNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function finiteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function candleTimestampMs(record: Record<string, unknown>): number {
  if (typeof record.candle_date_time_utc === "string") {
    const parsed = Date.parse(`${record.candle_date_time_utc}Z`);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof record.candle_date_time_kst === "string") {
    const parsed = Date.parse(`${record.candle_date_time_kst}+09:00`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return finiteNumber(record.timestamp ?? record.candle_timestamp_ms);
}

function normalizeCandle(record: Record<string, unknown>): Candle {
  const close = finiteNumber(record.trade_price ?? record.close_price);
  return {
    timestampMs: candleTimestampMs(record),
    close,
    high: finiteNumber(record.high_price) || close,
    low: finiteNumber(record.low_price) || close,
    volumeKrw: finiteNumber(record.candle_acc_trade_price),
  };
}

async function loadInputCandles(path: string): Promise<Candle[]> {
  const raw = await readFile(path, "utf8");
  const parsed = raw.trim().startsWith("[")
    ? (JSON.parse(raw) as Array<Record<string, unknown>>)
    : raw
        .split(/\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
  return dedupeAndSort(parsed.map(normalizeCandle));
}

function toBithumbKst(timestampMs: number): string {
  const kst = new Date(timestampMs + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 19);
}

async function fetchMarketCandles(market: string, unitMinutes: number, maxCandles: number): Promise<Candle[]> {
  const candles = new Map<number, Candle>();
  let to: string | undefined;

  while (candles.size < maxCandles) {
    const url = new URL(`${REST_BASE_URL}/candles/minutes/${unitMinutes}`);
    url.searchParams.set("market", market);
    url.searchParams.set("count", String(Math.min(200, maxCandles - candles.size)));
    if (to) url.searchParams.set("to", to);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`bithumb candle request failed for ${market} (${response.status})`);
    const payload = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(payload) || payload.length === 0) break;
    const normalized = payload.map(normalizeCandle);
    for (const candle of normalized) {
      if (candle.timestampMs > 0 && candle.close > 0) candles.set(candle.timestampMs, candle);
    }
    const oldest = normalized
      .filter((candle) => candle.timestampMs > 0)
      .sort((left, right) => left.timestampMs - right.timestampMs)[0];
    if (!oldest) break;
    to = toBithumbKst(oldest.timestampMs - 1);
    await sleep(80);
  }

  return dedupeAndSort([...candles.values()]);
}

async function fetchTopKrwMarkets(limit: number): Promise<MarketSummary[]> {
  const response = await fetch(`${REST_BASE_URL}/market/all?isDetails=false`);
  if (!response.ok) throw new Error(`bithumb market list request failed (${response.status})`);
  const payload = (await response.json()) as Array<Record<string, unknown>>;
  const markets = payload
    .map((record) => ({
      market: String(record.market ?? ""),
      koreanName: stringOrNull(record.korean_name),
      englishName: stringOrNull(record.english_name),
      accTradePrice24h: null as number | null,
    }))
    .filter((market) => market.market.startsWith("KRW-"));

  const byMarket = new Map(markets.map((market) => [market.market, market]));
  for (let index = 0; index < markets.length; index += 100) {
    const chunk = markets.slice(index, index + 100);
    const url = new URL(`${REST_BASE_URL}/ticker`);
    url.searchParams.set("markets", chunk.map((market) => market.market).join(","));
    const tickerResponse = await fetch(url);
    if (!tickerResponse.ok) throw new Error(`bithumb ticker request failed (${tickerResponse.status})`);
    const tickers = (await tickerResponse.json()) as Array<Record<string, unknown>>;
    for (const ticker of tickers) {
      const market = typeof ticker.market === "string" ? byMarket.get(ticker.market) : undefined;
      if (market) market.accTradePrice24h = finiteNumber(ticker.acc_trade_price_24h);
    }
    await sleep(80);
  }

  return [...byMarket.values()]
    .filter((market) => market.accTradePrice24h !== null && market.accTradePrice24h > 0)
    .sort((left, right) => (right.accTradePrice24h ?? 0) - (left.accTradePrice24h ?? 0))
    .slice(0, limit);
}

function dedupeAndSort(candles: Candle[]): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const candle of candles) {
    if (candle.timestampMs > 0 && candle.close > 0) byTimestamp.set(candle.timestampMs, candle);
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function quantile(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index] ?? null;
}

function rangeBps(candles: Candle[], index: number, bars: number): number | null {
  if (index < bars) return null;
  const window = candles.slice(index - bars, index);
  if (window.length !== bars) return null;
  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));
  return bps(high, low);
}

function averageVolume(candles: Candle[], index: number, bars: number): number | null {
  if (index < bars) return null;
  const window = candles.slice(index - bars, index);
  if (window.length !== bars) return null;
  return window.reduce((sum, candle) => sum + candle.volumeKrw, 0) / window.length;
}

function previousHigh(candles: Candle[], index: number, bars: number): number | null {
  if (index < bars) return null;
  const window = candles.slice(index - bars, index);
  if (window.length !== bars) return null;
  return Math.max(...window.map((candle) => candle.high));
}

function buildCandidates(candles: Candle[], splitIndex: number): PreparedCandidate[] {
  const candidates: PreparedCandidate[] = [];
  for (const breakoutLookbackBars of BREAKOUT_LOOKBACKS) {
    for (const contractionBars of CONTRACTION_BARS) {
      for (const holdBars of HOLDS) {
        for (const maxRangePercentile of MAX_RANGE_PERCENTILES) {
          const rangeValues: number[] = [];
          for (let index = Math.max(breakoutLookbackBars, contractionBars); index < splitIndex; index += 1) {
            const value = rangeBps(candles, index, contractionBars);
            if (value !== null && Number.isFinite(value)) rangeValues.push(value);
          }
          const rangeThresholdBps = quantile(rangeValues, maxRangePercentile);
          if (rangeThresholdBps === null) continue;
          for (const minBreakoutBps of MIN_BREAKOUT_BPS) {
            for (const minVolumeMultiple of MIN_VOLUME_MULTIPLES) {
              candidates.push({
                breakoutLookbackBars,
                contractionBars,
                holdBars,
                maxRangePercentile,
                minBreakoutBps,
                minVolumeMultiple,
                rangeThresholdBps,
              });
            }
          }
        }
      }
    }
  }
  return candidates;
}

function passesSignal(candles: Candle[], index: number, candidate: PreparedCandidate): boolean {
  const current = candles[index];
  if (!current) return false;
  const high = previousHigh(candles, index, candidate.breakoutLookbackBars);
  const range = rangeBps(candles, index, candidate.contractionBars);
  const avgVolume = averageVolume(candles, index, candidate.contractionBars);
  if (high === null || range === null || avgVolume === null || avgVolume <= 0) return false;
  if (range > candidate.rangeThresholdBps) return false;
  if (bps(current.close, high) < candidate.minBreakoutBps) return false;
  if (current.volumeKrw < avgVolume * candidate.minVolumeMultiple) return false;
  return true;
}

function simulate(
  candles: Candle[],
  candidate: PreparedCandidate,
  startIndex: number,
  endIndex: number,
  notionalKrw: number,
  feeRoundTripRate: number,
): Trade[] {
  const trades: Trade[] = [];
  let nextEntryIndex = startIndex;
  const firstIndex = Math.max(startIndex, candidate.breakoutLookbackBars, candidate.contractionBars);
  const lastEntryIndex = Math.min(endIndex, candles.length - candidate.holdBars - 1);

  for (let index = firstIndex; index <= lastEntryIndex; index += 1) {
    if (index < nextEntryIndex || !passesSignal(candles, index, candidate)) continue;
    const entry = candles[index];
    const exit = candles[index + candidate.holdBars];
    if (!entry || !exit) continue;
    trades.push({
      entryAt: entry.timestampMs,
      exitAt: exit.timestampMs,
      entryPrice: entry.close,
      exitPrice: exit.close,
      pnlKrw: notionalKrw * (exit.close / entry.close - 1 - feeRoundTripRate),
    });
    nextEntryIndex = index + candidate.holdBars;
  }
  return trades;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round(value);
}

function summarize(trades: Trade[], notionalKrw: number): Summary {
  const values = trades.map((trade) => trade.pnlKrw);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: trades.length,
    totalPnlKrw: round(total),
    averagePnlKrw: trades.length > 0 ? round(total / trades.length) : null,
    medianPnlKrw: roundNullable(quantile(values, 0.5)),
    winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value <= 0).length,
    returnPct: trades.length > 0 ? round((total / (trades.length * notionalKrw)) * 100) : null,
  };
}

function walkForwardSummary(
  candles: Candle[],
  candidate: PreparedCandidate,
  notionalKrw: number,
  feeRoundTripRate: number,
): WalkForwardSummary {
  const summaries: Summary[] = [];
  for (let fold = 0; fold < WALK_FORWARD_FOLDS; fold += 1) {
    const startIndex = Math.floor((candles.length * fold) / WALK_FORWARD_FOLDS);
    const endIndex = Math.floor((candles.length * (fold + 1)) / WALK_FORWARD_FOLDS) - 1;
    summaries.push(summarize(simulate(candles, candidate, startIndex, endIndex, notionalKrw, feeRoundTripRate), notionalKrw));
  }
  const foldPnls = summaries.map((summary) => summary.totalPnlKrw);
  return {
    foldCount: WALK_FORWARD_FOLDS,
    positiveTotalFoldCount: summaries.filter((summary) => summary.totalPnlKrw > 0).length,
    positiveMedianFoldCount: summaries.filter((summary) => (summary.medianPnlKrw ?? -Infinity) > 0).length,
    allPositiveFoldCount: summaries.filter(
      (summary) => summary.totalPnlKrw > 0 && (summary.medianPnlKrw ?? -Infinity) > 0,
    ).length,
    totalPnlKrw: round(foldPnls.reduce((sum, value) => sum + value, 0)),
    minFoldPnlKrw: roundNullable(quantile(foldPnls, 0)),
  };
}

function scoreCandidate(candleCount: number, train: Summary, test: Summary, walkForward: WalkForwardSummary): number {
  if (
    candleCount < MIN_PROMOTION_CANDLES ||
    train.count < MIN_PROMOTION_TRAIN_TRADES ||
    test.count < MIN_PROMOTION_TEST_TRADES ||
    train.count + test.count < MIN_PROMOTION_TOTAL_TRADES ||
    train.totalPnlKrw <= 0 ||
    (train.medianPnlKrw ?? -Infinity) <= 0 ||
    test.totalPnlKrw <= 0 ||
    (test.medianPnlKrw ?? -Infinity) <= 0 ||
    walkForward.totalPnlKrw <= 0 ||
    (walkForward.minFoldPnlKrw ?? -Infinity) < 0 ||
    walkForward.positiveTotalFoldCount < MIN_POSITIVE_WALK_FORWARD_FOLDS ||
    walkForward.positiveMedianFoldCount < MIN_POSITIVE_WALK_FORWARD_FOLDS
  ) {
    return -Infinity;
  }
  return test.totalPnlKrw + (test.medianPnlKrw ?? 0) * 10 + (walkForward.minFoldPnlKrw ?? 0);
}

async function analyzeCandles(candles: Candle[], args: Args, market: string) {
  if (candles.length < 500) throw new Error(`at least 500 candles are required for ${market} volatility breakout analysis`);
  const splitIndex = Math.floor(candles.length * 0.7);
  const candidates = buildCandidates(candles, splitIndex).map((candidate) => {
    const train = summarize(simulate(candles, candidate, 0, splitIndex, args.notionalKrw, args.feeRoundTripRate), args.notionalKrw);
    const test = summarize(
      simulate(candles, candidate, splitIndex, candles.length - 1, args.notionalKrw, args.feeRoundTripRate),
      args.notionalKrw,
    );
    const walkForward = walkForwardSummary(candles, candidate, args.notionalKrw, args.feeRoundTripRate);
    return {
      ...candidate,
      train,
      test,
      walkForward,
      score: scoreCandidate(candles.length, train, test, walkForward),
    };
  });

  return {
    market,
    source: {
      candleCount: candles.length,
      from: new Date(candles[0]?.timestampMs ?? 0).toISOString(),
      to: new Date(candles.at(-1)?.timestampMs ?? 0).toISOString(),
      fetchedFromPublicApi: args.inputCandlesPath === null,
    },
    candidateCount: candidates.length,
    promotionCandidateCount: candidates.filter((candidate) => Number.isFinite(candidate.score)).length,
    promotionCandidates: candidates
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((left, right) => right.score - left.score)
      .slice(0, 10),
    topByTest: [...candidates]
      .filter((candidate) => candidate.train.count > 0 || candidate.test.count > 0)
      .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
      .slice(0, 20),
  };
}

async function analyzeMarket(args: Args, market: string) {
  const candles =
    args.inputCandlesPath === null
      ? await fetchMarketCandles(market, args.unitMinutes, args.maxCandles)
      : await loadInputCandles(args.inputCandlesPath);
  return analyzeCandles(candles, args, market);
}

function baseReportFields(args: Args) {
  const feeRoundTripBps = round(args.feeRoundTripRate * 10_000);
  return {
    generatedAt: new Date().toISOString(),
    note:
      `Public Bithumb volatility-contraction breakout scan. Non-overlapping long-only close-to-close trades with volume confirmation and ${feeRoundTripBps} bps round-trip cost. Research evidence only; live promotion requires paper/orderbook validation.`,
    assumptions: {
      unitMinutes: args.unitMinutes,
      notionalKrw: args.notionalKrw,
      feeRoundTripRate: args.feeRoundTripRate,
      feeRoundTripBps,
      split: "first 70% train, last 30% test",
      signal:
        "prior range below train-derived percentile, current close breaks previous high by threshold, and current volume exceeds prior average by a configured multiple",
      promotionMinimums: {
        candleCount: MIN_PROMOTION_CANDLES,
        trainTrades: MIN_PROMOTION_TRAIN_TRADES,
        testTrades: MIN_PROMOTION_TEST_TRADES,
        totalTrainTestTrades: MIN_PROMOTION_TOTAL_TRADES,
        trainMedianPnlKrw: "positive",
        testMedianPnlKrw: "positive",
        walkForwardTotalPnlKrw: "positive",
        walkForwardMinFoldPnlKrw: "non-negative",
      },
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const selectedMarkets =
    args.topMarkets === null
      ? (args.markets ?? [args.market]).map((market) => ({
          market,
          koreanName: null,
          englishName: null,
          accTradePrice24h: null,
        }))
      : await fetchTopKrwMarkets(args.topMarkets);

  if (selectedMarkets.length === 1) {
    const marketReport = await analyzeMarket(args, selectedMarkets[0]?.market ?? args.market);
    const report = {
      ...baseReportFields(args),
      assumptions: {
        ...baseReportFields(args).assumptions,
        market: marketReport.market,
      },
      source: marketReport.source,
      candidateCount: marketReport.candidateCount,
      promotionCandidateCount: marketReport.promotionCandidateCount,
      promotionCandidates: marketReport.promotionCandidates,
      topByTest: marketReport.topByTest,
    };
    const output = `${JSON.stringify(report, null, 2)}\n`;
    if (args.outputPath) {
      await mkdir(dirname(args.outputPath), { recursive: true });
      await writeFile(args.outputPath, output, "utf8");
    }
    process.stdout.write(output);
    return;
  }

  const marketReports = [];
  const failures = [];
  for (const market of selectedMarkets) {
    try {
      marketReports.push({
        selection: market,
        report: await analyzeMarket(args, market.market),
      });
    } catch (error) {
      failures.push({
        market: market.market,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    await sleep(120);
  }

  const promotionCandidates = marketReports
    .flatMap(({ report }) => report.promotionCandidates.map((candidate) => ({ market: report.market, ...candidate })))
    .sort((left, right) => right.score - left.score)
    .slice(0, 20);
  const topByTest = marketReports
    .flatMap(({ report }) => report.topByTest.map((candidate) => ({ market: report.market, ...candidate })))
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 20);

  const report = {
    ...baseReportFields(args),
    marketSelection: {
      mode: args.topMarkets === null ? "explicit_markets" : "top_24h_krw_volume",
      requestedTopMarkets: args.topMarkets,
      selectedMarkets,
    },
    marketCount: marketReports.length,
    failureCount: failures.length,
    failures,
    candidateCount: marketReports.reduce((sum, { report }) => sum + report.candidateCount, 0),
    promotionCandidateCount: promotionCandidates.length,
    promotionCandidates,
    topByTest,
    markets: marketReports.map(({ selection, report }) => ({
      selection,
      ...report,
    })),
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
