import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  market: string;
  markets: string[] | null;
  topMarkets: number | null;
  signalMode: "momentum" | "reversal";
  unitMinutes: number;
  maxCandles: number;
  outputPath: string | null;
  inputCandlesPath: string | null;
  notionalKrw: number;
  feeRoundTripRate: number;
  includeTradeAudit: boolean;
  tradeAuditLimit: number;
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
  lookbackBars: number;
  holdBars: number;
  minReturnBps: number;
  riskFilter: "none" | "rv24_below_median" | "rv24_below_p70" | "range24_below_p70";
}

interface PreparedCandidate extends CandidateConfig {
  riskThreshold: number | null;
}

interface Trade {
  entryAt: number;
  exitAt: number;
  entryPrice: number;
  exitPrice: number;
  pnlKrw: number;
}

interface TradeAudit {
  train: {
    count: number;
    trades: Trade[];
  };
  test: {
    count: number;
    trades: Trade[];
  };
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
  folds: Array<{
    fold: number;
    startAt: string;
    endAt: string;
    summary: Summary;
  }>;
}

const FEE_ROUND_TRIP_RATE = 0.0008;
const WALK_FORWARD_FOLDS = 5;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;
const MIN_PROMOTION_CANDLES = 3_000;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const REST_BASE_URL = "https://api.bithumb.com/v1";
const LOOKBACKS = [4, 8, 12, 24, 72, 168];
const HOLDS = [4, 8, 24, 72];
const MIN_RETURNS_BPS = [0, 10, 25, 50];
const RISK_FILTERS: CandidateConfig["riskFilter"][] = [
  "none",
  "rv24_below_median",
  "rv24_below_p70",
  "range24_below_p70",
];

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    market: "KRW-BTC",
    markets: null,
    topMarkets: null,
    signalMode: "momentum",
    unitMinutes: 60,
    maxCandles: 5_000,
    outputPath: null,
    inputCandlesPath: null,
    notionalKrw: 500_000,
    feeRoundTripRate: FEE_ROUND_TRIP_RATE,
    includeTradeAudit: false,
    tradeAuditLimit: 100,
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
      if (args.markets.length === 0) {
        throw new Error("--markets requires at least one market");
      }
      index += 1;
      continue;
    }
    if (arg === "--top-markets") {
      if (!value) throw new Error("--top-markets requires a value");
      args.topMarkets = positiveInteger(value, "--top-markets");
      index += 1;
      continue;
    }
    if (arg === "--signal-mode") {
      if (value !== "momentum" && value !== "reversal") {
        throw new Error("--signal-mode must be momentum or reversal");
      }
      args.signalMode = value;
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
    if (arg === "--include-trade-audit") {
      args.includeTradeAudit = true;
      continue;
    }
    if (arg === "--trade-audit-limit") {
      if (!value) throw new Error("--trade-audit-limit requires a value");
      args.tradeAuditLimit = positiveInteger(value, "--trade-audit-limit");
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
    throw new Error(`unsupported argument: ${arg}`);
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeCandle(record: Record<string, unknown>): Candle {
  const timestampMs = candleTimestampMs(record);
  return {
    timestampMs,
    close: finiteNumber(record.trade_price ?? record.close_price),
    high: finiteNumber(record.high_price),
    low: finiteNumber(record.low_price),
    volumeKrw: finiteNumber(record.candle_acc_trade_price),
  };
}

function candleTimestampMs(record: Record<string, unknown>): number {
  if (typeof record.candle_date_time_utc === "string") {
    const parsed = Date.parse(`${record.candle_date_time_utc}Z`);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof record.candle_date_time_kst === "string") {
    const parsed = Date.parse(`${record.candle_date_time_kst}+09:00`);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return finiteNumber(record.timestamp ?? record.candle_timestamp_ms);
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

async function fetchCandles(args: Args): Promise<Candle[]> {
  return fetchMarketCandles(args.market, args.unitMinutes, args.maxCandles);
}

async function fetchMarketCandles(
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
    if (to) {
      url.searchParams.set("to", to);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`bithumb candle request failed (${response.status})`);
    }
    const payload = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(payload) || payload.length === 0) {
      break;
    }
    const normalized = payload.map(normalizeCandle);
    for (const candle of normalized) {
      if (candle.timestampMs > 0 && candle.close > 0) {
        candles.set(candle.timestampMs, candle);
      }
    }
    const oldest = normalized
      .filter((candle) => candle.timestampMs > 0)
      .sort((left, right) => left.timestampMs - right.timestampMs)[0];
    if (!oldest) {
      break;
    }
    to = toBithumbKst(oldest.timestampMs - 1);
    await sleep(80);
  }

  return dedupeAndSort([...candles.values()]);
}

async function fetchTopKrwMarkets(limit: number): Promise<MarketSummary[]> {
  const marketsResponse = await fetch(`${REST_BASE_URL}/market/all?isDetails=false`);
  if (!marketsResponse.ok) {
    throw new Error(`bithumb market list request failed (${marketsResponse.status})`);
  }
  const marketsPayload = (await marketsResponse.json()) as Array<Record<string, unknown>>;
  const krwMarkets: MarketSummary[] = marketsPayload
    .map((record) => ({
      market: String(record.market ?? ""),
      koreanName: typeof record.korean_name === "string" ? record.korean_name : null,
      englishName: typeof record.english_name === "string" ? record.english_name : null,
      accTradePrice24h: null,
    }))
    .filter((market) => market.market.startsWith("KRW-"));

  const byMarket = new Map(krwMarkets.map((market) => [market.market, market]));
  for (let index = 0; index < krwMarkets.length; index += 100) {
    const chunk = krwMarkets.slice(index, index + 100);
    const url = new URL(`${REST_BASE_URL}/ticker`);
    url.searchParams.set("markets", chunk.map((market) => market.market).join(","));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`bithumb ticker request failed (${response.status})`);
    }
    const payload = (await response.json()) as Array<Record<string, unknown>>;
    for (const ticker of payload) {
      const market = typeof ticker.market === "string" ? byMarket.get(ticker.market) : undefined;
      if (market) {
        market.accTradePrice24h = finiteNumber(ticker.acc_trade_price_24h);
      }
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
    if (candle.timestampMs > 0 && candle.close > 0) {
      byTimestamp.set(candle.timestampMs, candle);
    }
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
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * percentile)),
  );
  return sorted[index] ?? null;
}

function riskValue(candles: Candle[], index: number, filter: CandidateConfig["riskFilter"]): number | null {
  if (filter === "none") {
    return null;
  }
  if (index < 24) {
    return null;
  }
  if (filter.startsWith("rv24")) {
    let sumSquares = 0;
    for (let cursor = index - 23; cursor <= index; cursor += 1) {
      const prev = candles[cursor - 1];
      const current = candles[cursor];
      if (!prev || !current) return null;
      const ret = bps(current.close, prev.close);
      sumSquares += ret * ret;
    }
    return Math.sqrt(sumSquares);
  }
  const window = candles.slice(index - 23, index + 1);
  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));
  return bps(high, low);
}

function buildCandidates(candles: Candle[], splitIndex: number): PreparedCandidate[] {
  const candidates: PreparedCandidate[] = [];
  for (const lookbackBars of LOOKBACKS) {
    for (const holdBars of HOLDS) {
      if (holdBars > lookbackBars && lookbackBars < 24) {
        continue;
      }
      for (const minReturnBps of MIN_RETURNS_BPS) {
        for (const riskFilter of RISK_FILTERS) {
          let riskThreshold: number | null = null;
          if (riskFilter !== "none") {
            const values: number[] = [];
            for (let index = 24; index < splitIndex; index += 1) {
              const value = riskValue(candles, index, riskFilter);
              if (value !== null && Number.isFinite(value)) {
                values.push(value);
              }
            }
            riskThreshold = quantile(
              values,
              riskFilter === "rv24_below_median" ? 0.5 : 0.7,
            );
            if (riskThreshold === null) {
              continue;
            }
          }
          candidates.push({ lookbackBars, holdBars, minReturnBps, riskFilter, riskThreshold });
        }
      }
    }
  }
  return candidates;
}

function passesSignal(
  candles: Candle[],
  index: number,
  candidate: PreparedCandidate,
  signalMode: Args["signalMode"],
): boolean {
  const previous = candles[index - candidate.lookbackBars];
  const current = candles[index];
  if (!previous || !current) {
    return false;
  }
  const signalReturnBps = bps(current.close, previous.close);
  if (signalMode === "momentum" && signalReturnBps < candidate.minReturnBps) {
    return false;
  }
  if (signalMode === "reversal" && signalReturnBps > -candidate.minReturnBps) {
    return false;
  }
  if (candidate.riskFilter !== "none") {
    const value = riskValue(candles, index, candidate.riskFilter);
    if (
      value === null ||
      candidate.riskThreshold === null ||
      value > candidate.riskThreshold
    ) {
      return false;
    }
  }
  return true;
}

function simulate(
  candles: Candle[],
  candidate: PreparedCandidate,
  signalMode: Args["signalMode"],
  startIndex: number,
  endIndex: number,
  notionalKrw: number,
  feeRoundTripRate: number,
): Trade[] {
  const trades: Trade[] = [];
  let nextEntryIndex = startIndex;
  const firstIndex = Math.max(startIndex, candidate.lookbackBars, 24);
  const lastEntryIndex = Math.min(endIndex, candles.length - candidate.holdBars - 1);

  for (let index = firstIndex; index <= lastEntryIndex; index += 1) {
    if (index < nextEntryIndex) {
      continue;
    }
    if (!passesSignal(candles, index, candidate, signalMode)) {
      continue;
    }
    const entry = candles[index];
    const exit = candles[index + candidate.holdBars];
    if (!entry || !exit) {
      continue;
    }
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

function summarize(trades: Trade[], notionalKrw: number): Summary {
  const values = trades.map((trade) => trade.pnlKrw);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: trades.length,
    totalPnlKrw: round(total),
    averagePnlKrw: trades.length > 0 ? round(total / trades.length) : null,
    medianPnlKrw: roundNullable(quantile(values, 0.5)),
    winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value < 0).length,
    returnPct: trades.length > 0 ? round((total / (trades.length * notionalKrw)) * 100) : null,
  };
}

function walkForwardSummary(
  candles: Candle[],
  candidate: PreparedCandidate,
  signalMode: Args["signalMode"],
  notionalKrw: number,
  feeRoundTripRate: number,
  foldCount = WALK_FORWARD_FOLDS,
): WalkForwardSummary {
  const folds: WalkForwardSummary["folds"] = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const startIndex = Math.floor((candles.length * fold) / foldCount);
    const endIndex = Math.floor((candles.length * (fold + 1)) / foldCount) - 1;
    const trades = simulate(
      candles,
      candidate,
      signalMode,
      startIndex,
      endIndex,
      notionalKrw,
      feeRoundTripRate,
    );
    const summary = summarize(trades, notionalKrw);
    folds.push({
      fold: fold + 1,
      startAt: new Date(candles[startIndex]?.timestampMs ?? 0).toISOString(),
      endAt: new Date(candles[endIndex]?.timestampMs ?? 0).toISOString(),
      summary,
    });
  }

  const foldPnls = folds.map((fold) => fold.summary.totalPnlKrw);
  return {
    foldCount,
    positiveTotalFoldCount: folds.filter((fold) => fold.summary.totalPnlKrw > 0).length,
    positiveMedianFoldCount: folds.filter((fold) => (fold.summary.medianPnlKrw ?? -Infinity) > 0)
      .length,
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

function scoreCandidate(
  candleCount: number,
  train: Summary,
  test: Summary,
  walkForward: WalkForwardSummary,
): number {
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
    (walkForward.minFoldPnlKrw ?? -Infinity) <= 0 ||
    walkForward.allPositiveFoldCount < MIN_POSITIVE_WALK_FORWARD_FOLDS ||
    walkForward.positiveTotalFoldCount < MIN_POSITIVE_WALK_FORWARD_FOLDS
  ) {
    return -Infinity;
  }
  return test.totalPnlKrw + (test.medianPnlKrw ?? 0) * 10 + (walkForward.minFoldPnlKrw ?? 0);
}

function tradeAudit(
  candles: Candle[],
  candidate: PreparedCandidate,
  signalMode: Args["signalMode"],
  splitIndex: number,
  notionalKrw: number,
  feeRoundTripRate: number,
  limit: number,
): TradeAudit {
  const trainTrades = simulate(
    candles,
    candidate,
    signalMode,
    0,
    splitIndex,
    notionalKrw,
    feeRoundTripRate,
  );
  const testTrades = simulate(
    candles,
    candidate,
    signalMode,
    splitIndex,
    candles.length - 1,
    notionalKrw,
    feeRoundTripRate,
  );
  return {
    train: {
      count: trainTrades.length,
      trades: trainTrades.slice(0, limit).map(roundTrade),
    },
    test: {
      count: testTrades.length,
      trades: testTrades.slice(0, limit).map(roundTrade),
    },
  };
}

function roundTrade(trade: Trade): Trade {
  return {
    entryAt: trade.entryAt,
    exitAt: trade.exitAt,
    entryPrice: round(trade.entryPrice),
    exitPrice: round(trade.exitPrice),
    pnlKrw: round(trade.pnlKrw),
  };
}

async function analyzeCandles(candles: Candle[], args: Args, market: string) {
  if (candles.length < 500) {
    throw new Error(`at least 500 candles are required for ${market} momentum analysis`);
  }

  const splitIndex = Math.floor(candles.length * 0.7);
  const candidates = buildCandidates(candles, splitIndex).map((candidate) => {
    const trainTrades = simulate(
      candles,
      candidate,
      args.signalMode,
      0,
      splitIndex,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    const testTrades = simulate(
      candles,
      candidate,
      args.signalMode,
      splitIndex,
      candles.length - 1,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    const train = summarize(trainTrades, args.notionalKrw);
    const test = summarize(testTrades, args.notionalKrw);
    const walkForward = walkForwardSummary(
      candles,
      candidate,
      args.signalMode,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    return {
      ...candidate,
      train,
      test,
      walkForward,
      score: scoreCandidate(candles.length, train, test, walkForward),
    };
  });

  const topByTest = [...candidates]
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 20);
  const promotionCandidates = candidates
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  const withOptionalTradeAudit = <Candidate extends PreparedCandidate>(candidate: Candidate) =>
    args.includeTradeAudit
      ? {
          ...candidate,
          tradeAudit: tradeAudit(
            candles,
            candidate,
            args.signalMode,
            splitIndex,
            args.notionalKrw,
            args.feeRoundTripRate,
            args.tradeAuditLimit,
          ),
        }
      : candidate;

  return {
    market,
    source: {
      candleCount: candles.length,
      from: new Date(candles[0]?.timestampMs ?? 0).toISOString(),
      to: new Date(candles[candles.length - 1]?.timestampMs ?? 0).toISOString(),
      fetchedFromPublicApi: args.inputCandlesPath === null,
    },
    candidateCount: candidates.length,
    promotionCandidateCount: promotionCandidates.length,
    promotionCandidates: promotionCandidates.map(withOptionalTradeAudit),
    topByTest: topByTest.map(withOptionalTradeAudit),
  };
}

async function analyzeSingleMarket(args: Args, market: string) {
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
      `Public Bithumb candle time-series momentum scan. Non-overlapping long-only trades, close-to-close, ${feeRoundTripBps} bps round-trip cost. This is research evidence; live promotion still requires local paper/orderbook validation.`,
    assumptions: {
      unitMinutes: args.unitMinutes,
      signalMode: args.signalMode,
      notionalKrw: args.notionalKrw,
      feeRoundTripRate: args.feeRoundTripRate,
      feeRoundTripBps,
      split: "first 70% train, last 30% test",
      walkForward:
        "five chronological folds using the same fixed candidate parameters; promotion requires at least four folds with positive total and median PnL",
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
      tradeAudit: args.includeTradeAudit
        ? {
            enabled: true,
            limitPerTrainOrTestCandidate: args.tradeAuditLimit,
            purpose:
              "expose signal entry/exit timestamps for later orderbook execution coverage checks; this does not change strategy scoring",
          }
        : {
            enabled: false,
          },
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  if (args.inputCandlesPath && (args.markets !== null || args.topMarkets !== null)) {
    throw new Error("--input-candles can only be used with a single --market scan");
  }

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
    const marketReport = await analyzeSingleMarket(args, selectedMarkets[0]?.market ?? args.market);
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
        report: await analyzeSingleMarket(args, market.market),
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
    .flatMap(({ report }) =>
      report.promotionCandidates.map((candidate) => ({ market: report.market, ...candidate })),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 20);
  const topByTest = marketReports
    .flatMap(({ report }) =>
      report.topByTest.map((candidate) => ({ market: report.market, ...candidate })),
    )
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 30);

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
    candidateCount: marketReports.reduce((sum, entry) => sum + entry.report.candidateCount, 0),
    promotionCandidateCount: promotionCandidates.length,
    promotionCandidates,
    topByTest,
    markets: marketReports.map(({ selection, report }) => ({
      selection,
      market: report.market,
      source: report.source,
      candidateCount: report.candidateCount,
      promotionCandidateCount: report.promotionCandidateCount,
      topPromotionCandidate: report.promotionCandidates[0] ?? null,
      topByTest: report.topByTest[0] ?? null,
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
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
