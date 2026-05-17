import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

interface Args {
  markets: string[] | null;
  topMarkets: number | null;
  unitMinutes: number;
  maxCandles: number;
  outputPath: string | null;
  inputDir: string | null;
  notionalKrw: number;
  feeRoundTripRate: number;
}

interface Candle {
  timestampMs: number;
  close: number;
}

interface MarketSummary {
  market: string;
  koreanName: string | null;
  englishName: string | null;
  accTradePrice24h: number | null;
}

interface CandidateConfig {
  lookbackBars: number;
  holdBars: number;
  minReturnBps: number;
  minEligibleMarkets: number;
}

interface Trade {
  market: string;
  entryAt: number;
  exitAt: number;
  entryPrice: number;
  exitPrice: number;
  signalReturnBps: number;
  eligibleMarketCount: number;
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
  marketsTraded: Record<string, number>;
}

interface WalkForwardSummary {
  foldCount: number;
  positiveTotalFoldCount: number;
  positiveMedianFoldCount: number;
  allPositiveFoldCount: number;
  totalPnlKrw: number;
  minFoldPnlKrw: number | null;
  folds: Array<{
    fold: number;
    startAt: string;
    endAt: string;
    summary: Summary;
  }>;
}

const REST_BASE_URL = "https://api.bithumb.com/v1";
const FEE_ROUND_TRIP_RATE = 0.0008;
const WALK_FORWARD_FOLDS = 5;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const LOOKBACKS = [24, 72, 168];
const HOLDS = [24, 72];
const MIN_RETURNS_BPS = [0, 25, 50, 100];
const MIN_ELIGIBLE_MARKETS = [3, 5, 10, 15];

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    markets: null,
    topMarkets: 20,
    unitMinutes: 60,
    maxCandles: 5_000,
    outputPath: null,
    inputDir: null,
    notionalKrw: 500_000,
    feeRoundTripRate: FEE_ROUND_TRIP_RATE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

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
    if (arg === "--input-dir") {
      if (!value) throw new Error("--input-dir requires a value");
      args.inputDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.inputDir !== null && args.markets === null) {
    throw new Error("--input-dir requires explicit --markets");
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
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
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
  return {
    timestampMs: candleTimestampMs(record),
    close: finiteNumber(record.trade_price ?? record.close_price),
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

function marketFileName(market: string): string {
  return `${market.replace(/[^A-Z0-9]+/gu, "_")}.json`;
}

async function fetchCandles(
  market: string,
  unitMinutes: number,
  maxCandles: number,
): Promise<Candle[]> {
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

function toBithumbKst(timestampMs: number): string {
  const kst = new Date(timestampMs + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 19);
}

async function fetchTopKrwMarkets(limit: number): Promise<MarketSummary[]> {
  const marketsResponse = await fetch(`${REST_BASE_URL}/market/all?isDetails=false`);
  if (!marketsResponse.ok) throw new Error(`bithumb market list request failed (${marketsResponse.status})`);
  const marketsPayload = (await marketsResponse.json()) as Array<Record<string, unknown>>;
  const markets: MarketSummary[] = marketsPayload
    .map((record) => ({
      market: String(record.market ?? ""),
      koreanName: typeof record.korean_name === "string" ? record.korean_name : null,
      englishName: typeof record.english_name === "string" ? record.english_name : null,
      accTradePrice24h: null,
    }))
    .filter((market) => market.market.startsWith("KRW-"));

  const byMarket = new Map(markets.map((market) => [market.market, market]));
  for (let index = 0; index < markets.length; index += 100) {
    const chunk = markets.slice(index, index + 100);
    const url = new URL(`${REST_BASE_URL}/ticker`);
    url.searchParams.set("markets", chunk.map((market) => market.market).join(","));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`bithumb ticker request failed (${response.status})`);
    const payload = (await response.json()) as Array<Record<string, unknown>>;
    for (const ticker of payload) {
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

function buildCandidates(maxMarketCount: number): CandidateConfig[] {
  const candidates: CandidateConfig[] = [];
  for (const lookbackBars of LOOKBACKS) {
    for (const holdBars of HOLDS) {
      for (const minReturnBps of MIN_RETURNS_BPS) {
        for (const minEligibleMarkets of MIN_ELIGIBLE_MARKETS) {
          if (minEligibleMarkets <= maxMarketCount) {
            candidates.push({ lookbackBars, holdBars, minReturnBps, minEligibleMarkets });
          }
        }
      }
    }
  }
  return candidates;
}

function simulate(
  candleMaps: Map<string, Map<number, Candle>>,
  timestamps: number[],
  candidate: CandidateConfig,
  startAt: number,
  endAt: number,
  unitMinutes: number,
  notionalKrw: number,
  feeRoundTripRate: number,
): Trade[] {
  const trades: Trade[] = [];
  const intervalMs = unitMinutes * 60 * 1000;
  let nextEntryAt = startAt;

  for (const timestamp of timestamps) {
    if (timestamp < startAt || timestamp > endAt || timestamp < nextEntryAt) continue;
    const previousAt = timestamp - candidate.lookbackBars * intervalMs;
    const exitAt = timestamp + candidate.holdBars * intervalMs;
    let best:
      | {
          market: string;
          signalReturnBps: number;
          entry: Candle;
          exit: Candle;
        }
      | null = null;
    let eligibleMarketCount = 0;

    for (const [market, marketCandles] of candleMaps) {
      const previous = marketCandles.get(previousAt);
      const entry = marketCandles.get(timestamp);
      const exit = marketCandles.get(exitAt);
      if (!previous || !entry || !exit) continue;
      eligibleMarketCount += 1;
      const signalReturnBps = bps(entry.close, previous.close);
      if (!best || signalReturnBps > best.signalReturnBps) {
        best = { market, signalReturnBps, entry, exit };
      }
    }

    if (
      !best ||
      eligibleMarketCount < candidate.minEligibleMarkets ||
      best.signalReturnBps < candidate.minReturnBps
    ) {
      continue;
    }

    trades.push({
      market: best.market,
      entryAt: timestamp,
      exitAt,
      entryPrice: best.entry.close,
      exitPrice: best.exit.close,
      signalReturnBps: best.signalReturnBps,
      eligibleMarketCount,
      pnlKrw: notionalKrw * (best.exit.close / best.entry.close - 1 - feeRoundTripRate),
    });
    nextEntryAt = exitAt + intervalMs;
  }

  return trades;
}

function summarize(trades: Trade[], notionalKrw: number): Summary {
  const values = trades.map((trade) => trade.pnlKrw);
  const total = values.reduce((sum, value) => sum + value, 0);
  const marketsTraded: Record<string, number> = {};
  for (const trade of trades) {
    marketsTraded[trade.market] = (marketsTraded[trade.market] ?? 0) + 1;
  }
  return {
    count: trades.length,
    totalPnlKrw: round(total),
    averagePnlKrw: trades.length > 0 ? round(total / trades.length) : null,
    medianPnlKrw: roundNullable(quantile(values, 0.5)),
    winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value < 0).length,
    returnPct: trades.length > 0 ? round((total / (trades.length * notionalKrw)) * 100) : null,
    marketsTraded,
  };
}

function walkForwardSummary(
  candleMaps: Map<string, Map<number, Candle>>,
  timestamps: number[],
  candidate: CandidateConfig,
  unitMinutes: number,
  notionalKrw: number,
  feeRoundTripRate: number,
): WalkForwardSummary {
  const folds: WalkForwardSummary["folds"] = [];
  for (let fold = 0; fold < WALK_FORWARD_FOLDS; fold += 1) {
    const startIndex = Math.floor((timestamps.length * fold) / WALK_FORWARD_FOLDS);
    const endIndex = Math.floor((timestamps.length * (fold + 1)) / WALK_FORWARD_FOLDS) - 1;
    const startAt = timestamps[startIndex] ?? 0;
    const endAt = timestamps[endIndex] ?? 0;
    const trades = simulate(
      candleMaps,
      timestamps,
      candidate,
      startAt,
      endAt,
      unitMinutes,
      notionalKrw,
      feeRoundTripRate,
    );
    folds.push({
      fold: fold + 1,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      summary: summarize(trades, notionalKrw),
    });
  }
  const foldPnls = folds.map((fold) => fold.summary.totalPnlKrw);
  return {
    foldCount: WALK_FORWARD_FOLDS,
    positiveTotalFoldCount: folds.filter((fold) => fold.summary.totalPnlKrw > 0).length,
    positiveMedianFoldCount: folds.filter((fold) => (fold.summary.medianPnlKrw ?? -Infinity) > 0).length,
    allPositiveFoldCount: folds.filter(
      (fold) => fold.summary.totalPnlKrw > 0 && (fold.summary.medianPnlKrw ?? -Infinity) > 0,
    ).length,
    totalPnlKrw: round(foldPnls.reduce((sum, value) => sum + value, 0)),
    minFoldPnlKrw: roundNullable(quantile(foldPnls, 0)),
    folds,
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round(value);
}

function scoreCandidate(train: Summary, test: Summary, walkForward: WalkForwardSummary): number {
  if (
    train.count < MIN_PROMOTION_TRAIN_TRADES ||
    test.count < MIN_PROMOTION_TEST_TRADES ||
    train.count + test.count < MIN_PROMOTION_TOTAL_TRADES ||
    train.totalPnlKrw <= 0 ||
    (train.medianPnlKrw ?? -Infinity) <= 0 ||
    test.totalPnlKrw <= 0 ||
    (test.medianPnlKrw ?? -Infinity) <= 0 ||
    walkForward.totalPnlKrw <= 0 ||
    (walkForward.minFoldPnlKrw ?? -Infinity) < 0 ||
    walkForward.allPositiveFoldCount < MIN_POSITIVE_WALK_FORWARD_FOLDS
  ) {
    return -Infinity;
  }
  return test.totalPnlKrw + (test.medianPnlKrw ?? 0) * 10 + (walkForward.minFoldPnlKrw ?? 0);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const selectedMarkets =
    args.markets?.map((market) => ({
      market,
      koreanName: null,
      englishName: null,
      accTradePrice24h: null,
    })) ?? (await fetchTopKrwMarkets(args.topMarkets ?? 20));

  const candleMaps = new Map<string, Map<number, Candle>>();
  const sources = [];
  const failures = [];
  for (const market of selectedMarkets) {
    try {
      const candles =
        args.inputDir === null
          ? await fetchCandles(market.market, args.unitMinutes, args.maxCandles)
          : await loadInputCandles(join(args.inputDir, marketFileName(market.market)));
      candleMaps.set(market.market, new Map(candles.map((candle) => [candle.timestampMs, candle])));
      sources.push({
        market: market.market,
        candleCount: candles.length,
        from: new Date(candles[0]?.timestampMs ?? 0).toISOString(),
        to: new Date(candles[candles.length - 1]?.timestampMs ?? 0).toISOString(),
      });
    } catch (error) {
      failures.push({ market: market.market, message: error instanceof Error ? error.message : String(error) });
    }
    await sleep(80);
  }

  const timestamps = [...new Set([...candleMaps.values()].flatMap((market) => [...market.keys()]))].sort(
    (left, right) => left - right,
  );
  if (candleMaps.size < 2 || timestamps.length < 500) {
    throw new Error("at least two markets and 500 timestamps are required for cross-sectional analysis");
  }

  const splitIndex = Math.floor(timestamps.length * 0.7);
  const splitAt = timestamps[splitIndex] ?? timestamps[timestamps.length - 1] ?? 0;
  const candidates = buildCandidates(candleMaps.size).map((candidate) => {
    const trainTrades = simulate(
      candleMaps,
      timestamps,
      candidate,
      timestamps[0] ?? 0,
      splitAt,
      args.unitMinutes,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    const testTrades = simulate(
      candleMaps,
      timestamps,
      candidate,
      splitAt + args.unitMinutes * 60 * 1000,
      timestamps[timestamps.length - 1] ?? 0,
      args.unitMinutes,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    const train = summarize(trainTrades, args.notionalKrw);
    const test = summarize(testTrades, args.notionalKrw);
    const walkForward = walkForwardSummary(
      candleMaps,
      timestamps,
      candidate,
      args.unitMinutes,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    return {
      ...candidate,
      train,
      test,
      walkForward,
      score: scoreCandidate(train, test, walkForward),
    };
  });

  const promotionCandidates = candidates
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, 20);
  const topByTest = [...candidates]
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 20);

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      `Public Bithumb KRW cross-sectional momentum scan. At each rebalance point it holds the single strongest eligible market by lookback return, close-to-close, with ${round(args.feeRoundTripRate * 10_000)} bps round-trip cost. Current-volume market selection is research evidence and may include survivorship bias.`,
    assumptions: {
      unitMinutes: args.unitMinutes,
      notionalKrw: args.notionalKrw,
      feeRoundTripRate: args.feeRoundTripRate,
      feeRoundTripBps: round(args.feeRoundTripRate * 10_000),
      split: "first 70% train, last 30% test",
      promotionMinimums: {
        trainTrades: MIN_PROMOTION_TRAIN_TRADES,
        testTrades: MIN_PROMOTION_TEST_TRADES,
        totalTrainTestTrades: MIN_PROMOTION_TOTAL_TRADES,
        trainMedianPnlKrw: "positive",
        testMedianPnlKrw: "positive",
        walkForwardTotalPnlKrw: "positive",
        walkForwardMinFoldPnlKrw: "non-negative",
      },
    },
    marketSelection: {
      mode: args.markets === null ? "top_24h_krw_volume" : "explicit_markets",
      selectedMarkets,
    },
    source: {
      timestampCount: timestamps.length,
      from: new Date(timestamps[0] ?? 0).toISOString(),
      to: new Date(timestamps[timestamps.length - 1] ?? 0).toISOString(),
      fetchedFromPublicApi: args.inputDir === null,
      markets: sources,
    },
    failureCount: failures.length,
    failures,
    candidateCount: candidates.length,
    promotionCandidateCount: promotionCandidates.length,
    promotionCandidates,
    topByTest,
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
