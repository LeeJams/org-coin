import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  markets: string[];
  outputPath: string | null;
  inputPath: string | null;
  unitMinutes: number;
  maxCandles: number;
  minCandles: number;
  minPromotionSpanDays: number;
  notionalKrw: number;
  feeRoundTripRate: number;
  signalDirection: SignalDirection;
}

interface Candle {
  market: string;
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeKrw: number | null;
}

interface PairData {
  market: string;
  upbitCandles: Candle[];
  bithumbCandles: Candle[];
}

interface InputData {
  pairs?: Array<{
    market?: string;
    upbitCandles?: Array<Record<string, unknown>>;
    bithumbCandles?: Array<Record<string, unknown>>;
  }>;
}

interface CandidateConfig {
  market: string;
  lookbackBars: number;
  lagBars: number;
  holdBars: number;
  minReturnBps: number;
  signalDirection: SignalDirection;
}

interface Trade {
  market: string;
  signalAt: number;
  entryAt: number;
  exitAt: number;
  leaderReturnBps: number;
  entryPrice: number;
  exitPrice: number;
  pnlKrw: number;
  netReturnBps: number;
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

type SignalDirection = "positive" | "negative";

const BITHUMB_REST_BASE_URL = "https://api.bithumb.com/v1";
const UPBIT_REST_BASE_URL = "https://api.upbit.com/v1";
const LOOKBACK_BARS = [3, 5, 10, 15, 30, 60];
const LAG_BARS = [1, 2, 3, 5, 10, 15, 30];
const HOLD_BARS = [3, 5, 10, 15, 30, 60];
const MIN_RETURN_BPS = [5, 10, 20, 35, 50];
const WALK_FORWARD_FOLDS = 5;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    markets: ["KRW-BTC", "KRW-ETH", "KRW-XRP"],
    outputPath: null,
    inputPath: null,
    unitMinutes: 5,
    maxCandles: 3_000,
    minCandles: 1_000,
    minPromotionSpanDays: 7,
    notionalKrw: 500_000,
    feeRoundTripRate: 0.005,
    signalDirection: "positive",
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
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--input") {
      if (!value) throw new Error("--input requires a value");
      args.inputPath = resolve(cwd, value);
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
    if (arg === "--min-candles") {
      if (!value) throw new Error("--min-candles requires a value");
      args.minCandles = positiveInteger(value, "--min-candles");
      index += 1;
      continue;
    }
    if (arg === "--min-promotion-span-days") {
      if (!value) throw new Error("--min-promotion-span-days requires a value");
      args.minPromotionSpanDays = positiveNumber(value, "--min-promotion-span-days");
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
    if (arg === "--signal-direction") {
      if (value !== "positive" && value !== "negative") {
        throw new Error("--signal-direction must be positive or negative");
      }
      args.signalDirection = value;
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

function optionalFiniteNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed > 0 ? parsed : null;
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
  return finiteNumber(record.timestamp ?? record.candle_timestamp_ms ?? record.timestampMs);
}

function normalizeCandle(record: Record<string, unknown>, fallbackMarket: string): Candle {
  const market = typeof record.market === "string" && record.market.length > 0
    ? record.market
    : fallbackMarket;
  return {
    market,
    timestampMs: candleTimestampMs(record),
    open: finiteNumber(record.opening_price ?? record.open ?? record.open_price),
    high: finiteNumber(record.high_price ?? record.high),
    low: finiteNumber(record.low_price ?? record.low),
    close: finiteNumber(record.trade_price ?? record.close ?? record.close_price),
    volumeKrw: optionalFiniteNumber(record.candle_acc_trade_price ?? record.volumeKrw),
  };
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

function toBithumbKst(timestampMs: number): string {
  const kst = new Date(timestampMs + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 19);
}

function toUpbitUtc(timestampMs: number): string {
  return new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/u, "Z");
}

async function fetchJsonArray(url: URL, label: string): Promise<Array<Record<string, unknown>>> {
  let latestStatus: number | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url);
    latestStatus = response.status;
    if (response.ok) {
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error(`${label} response must be an array`);
      return payload as Array<Record<string, unknown>>;
    }
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`${label} request failed (${response.status})`);
    }
    await sleep(750 * (attempt + 1));
  }
  throw new Error(`${label} request failed (${latestStatus ?? "unknown"})`);
}

async function fetchBithumbCandles(
  market: string,
  unitMinutes: number,
  maxCandles: number,
): Promise<Candle[]> {
  const candles = new Map<number, Candle>();
  let to: string | undefined;
  while (candles.size < maxCandles) {
    const url = new URL(`${BITHUMB_REST_BASE_URL}/candles/minutes/${unitMinutes}`);
    url.searchParams.set("market", market);
    url.searchParams.set("count", String(Math.min(200, maxCandles - candles.size)));
    if (to) url.searchParams.set("to", to);
    const normalized = (await fetchJsonArray(url, `bithumb ${market} candles`))
      .map((record) => normalizeCandle(record, market));
    if (normalized.length === 0) break;
    for (const candle of normalized) {
      if (candle.timestampMs > 0 && candle.close > 0) candles.set(candle.timestampMs, candle);
    }
    const oldest = normalized
      .filter((candle) => candle.timestampMs > 0)
      .sort((left, right) => left.timestampMs - right.timestampMs)[0];
    if (!oldest) break;
    to = toBithumbKst(oldest.timestampMs - 1);
    await sleep(60);
  }
  return dedupeAndSort([...candles.values()]);
}

async function fetchUpbitCandles(
  market: string,
  unitMinutes: number,
  maxCandles: number,
): Promise<Candle[]> {
  const candles = new Map<number, Candle>();
  let to: string | undefined;
  while (candles.size < maxCandles) {
    const url = new URL(`${UPBIT_REST_BASE_URL}/candles/minutes/${unitMinutes}`);
    url.searchParams.set("market", market);
    url.searchParams.set("count", String(Math.min(200, maxCandles - candles.size)));
    if (to) url.searchParams.set("to", to);
    const normalized = (await fetchJsonArray(url, `upbit ${market} candles`))
      .map((record) => normalizeCandle(record, market));
    if (normalized.length === 0) break;
    for (const candle of normalized) {
      if (candle.timestampMs > 0 && candle.close > 0) candles.set(candle.timestampMs, candle);
    }
    const oldest = normalized
      .filter((candle) => candle.timestampMs > 0)
      .sort((left, right) => left.timestampMs - right.timestampMs)[0];
    if (!oldest) break;
    to = toUpbitUtc(oldest.timestampMs - 1);
    await sleep(60);
  }
  return dedupeAndSort([...candles.values()]);
}

async function loadInput(path: string): Promise<Map<string, PairData>> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as InputData;
  const byMarket = new Map<string, PairData>();
  for (const pair of parsed.pairs ?? []) {
    const market = pair.market ?? "";
    if (market.length === 0) continue;
    byMarket.set(market, {
      market,
      upbitCandles: dedupeAndSort((pair.upbitCandles ?? []).map((record) => normalizeCandle(record, market))),
      bithumbCandles: dedupeAndSort((pair.bithumbCandles ?? []).map((record) => normalizeCandle(record, market))),
    });
  }
  return byMarket;
}

async function loadPairData(market: string, args: Args, input: Map<string, PairData> | null): Promise<PairData> {
  const fixture = input?.get(market);
  if (fixture) return fixture;
  const [upbitCandles, bithumbCandles] = await Promise.all([
    fetchUpbitCandles(market, args.unitMinutes, args.maxCandles),
    fetchBithumbCandles(market, args.unitMinutes, args.maxCandles),
  ]);
  return { market, upbitCandles, bithumbCandles };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function signalPass(returnBps: number, candidate: CandidateConfig): boolean {
  return candidate.signalDirection === "positive"
    ? returnBps >= candidate.minReturnBps
    : returnBps <= -candidate.minReturnBps;
}

function buildCandidates(market: string, signalDirection: SignalDirection): CandidateConfig[] {
  const candidates: CandidateConfig[] = [];
  for (const lookbackBars of LOOKBACK_BARS) {
    for (const lagBars of LAG_BARS) {
      for (const holdBars of HOLD_BARS) {
        for (const minReturnBps of MIN_RETURN_BPS) {
          candidates.push({
            market,
            lookbackBars,
            lagBars,
            holdBars,
            minReturnBps,
            signalDirection,
          });
        }
      }
    }
  }
  return candidates;
}

function simulate(
  upbitByTimestamp: Map<number, Candle>,
  bithumbByTimestamp: Map<number, Candle>,
  signalTimestamps: number[],
  candidate: CandidateConfig,
  intervalMs: number,
  notionalKrw: number,
  feeRoundTripRate: number,
): Trade[] {
  const trades: Trade[] = [];
  let blockedUntil = -Infinity;
  for (const timestampMs of signalTimestamps) {
    const entryAt = timestampMs + candidate.lagBars * intervalMs;
    const exitAt = entryAt + candidate.holdBars * intervalMs;
    if (entryAt < blockedUntil) continue;
    const leaderCurrent = upbitByTimestamp.get(timestampMs);
    const leaderPrevious = upbitByTimestamp.get(timestampMs - candidate.lookbackBars * intervalMs);
    const entry = bithumbByTimestamp.get(entryAt);
    const exit = bithumbByTimestamp.get(exitAt);
    if (!leaderCurrent || !leaderPrevious || !entry || !exit) continue;
    const leaderReturnBps = bps(leaderCurrent.close, leaderPrevious.close);
    if (!signalPass(leaderReturnBps, candidate)) continue;
    const netReturn = exit.close / entry.close - 1 - feeRoundTripRate;
    trades.push({
      market: candidate.market,
      signalAt: timestampMs,
      entryAt,
      exitAt,
      leaderReturnBps: round(leaderReturnBps),
      entryPrice: entry.close,
      exitPrice: exit.close,
      pnlKrw: round(notionalKrw * netReturn),
      netReturnBps: round(netReturn * 10_000),
    });
    blockedUntil = exitAt;
  }
  return trades;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

function summarize(trades: Trade[], notionalKrw: number): Summary {
  const values = trades.map((trade) => trade.pnlKrw);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: trades.length,
    totalPnlKrw: round(total),
    averagePnlKrw: trades.length === 0 ? null : round(total / trades.length),
    medianPnlKrw: nullableRound(median(values)),
    winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value <= 0).length,
    returnPct: trades.length === 0 ? null : round((total / (notionalKrw * trades.length)) * 100),
  };
}

function walkForwardSummary(trades: Trade[], notionalKrw: number): WalkForwardSummary {
  if (trades.length === 0) {
    return {
      foldCount: 0,
      positiveTotalFoldCount: 0,
      positiveMedianFoldCount: 0,
      allPositiveFoldCount: 0,
      totalPnlKrw: 0,
      minFoldPnlKrw: null,
    };
  }
  const first = trades[0]!.entryAt;
  const last = trades.at(-1)!.entryAt;
  const span = Math.max(1, last - first + 1);
  const summaries: Summary[] = [];
  for (let fold = 0; fold < WALK_FORWARD_FOLDS; fold += 1) {
    const start = first + Math.floor((span * fold) / WALK_FORWARD_FOLDS);
    const end = fold === WALK_FORWARD_FOLDS - 1
      ? last + 1
      : first + Math.floor((span * (fold + 1)) / WALK_FORWARD_FOLDS);
    summaries.push(summarize(trades.filter((trade) => trade.entryAt >= start && trade.entryAt < end), notionalKrw));
  }
  const totals = summaries.map((summary) => summary.totalPnlKrw);
  return {
    foldCount: WALK_FORWARD_FOLDS,
    positiveTotalFoldCount: summaries.filter((summary) => summary.totalPnlKrw > 0).length,
    positiveMedianFoldCount: summaries.filter((summary) => (summary.medianPnlKrw ?? -Infinity) > 0).length,
    allPositiveFoldCount: summaries.filter(
      (summary) => summary.totalPnlKrw > 0 && (summary.medianPnlKrw ?? -Infinity) > 0,
    ).length,
    totalPnlKrw: round(totals.reduce((sum, value) => sum + value, 0)),
    minFoldPnlKrw: round(Math.min(...totals)),
  };
}

function promotionEligible(
  sourceReady: boolean,
  train: Summary,
  test: Summary,
  walkForward: WalkForwardSummary,
): boolean {
  return (
    sourceReady &&
    train.count >= MIN_PROMOTION_TRAIN_TRADES &&
    test.count >= MIN_PROMOTION_TEST_TRADES &&
    train.count + test.count >= MIN_PROMOTION_TOTAL_TRADES &&
    train.totalPnlKrw > 0 &&
    test.totalPnlKrw > 0 &&
    (train.medianPnlKrw ?? -Infinity) > 0 &&
    (test.medianPnlKrw ?? -Infinity) > 0 &&
    walkForward.totalPnlKrw > 0 &&
    (walkForward.minFoldPnlKrw ?? -Infinity) >= 0 &&
    walkForward.positiveTotalFoldCount >= MIN_POSITIVE_WALK_FORWARD_FOLDS &&
    walkForward.positiveMedianFoldCount >= MIN_POSITIVE_WALK_FORWARD_FOLDS
  );
}

function score(test: Summary, walkForward: WalkForwardSummary): number {
  return test.totalPnlKrw + (test.medianPnlKrw ?? 0) * 10 + (walkForward.minFoldPnlKrw ?? 0);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function nullableRound(value: number | null): number | null {
  return value === null ? null : round(value);
}

function spanDays(candles: Candle[]): number {
  const first = candles[0];
  const last = candles.at(-1);
  if (!first || !last) return 0;
  return (last.timestampMs - first.timestampMs) / (24 * 60 * 60 * 1000);
}

function sourceSummary(pair: PairData, args: Args) {
  const commonTimestamps = commonSignalTimestamps(pair, args.unitMinutes * 60 * 1000);
  const upbitSpanDays = spanDays(pair.upbitCandles);
  const bithumbSpanDays = spanDays(pair.bithumbCandles);
  const sourceReady =
    pair.upbitCandles.length >= args.minCandles &&
    pair.bithumbCandles.length >= args.minCandles &&
    Math.min(upbitSpanDays, bithumbSpanDays) >= args.minPromotionSpanDays &&
    commonTimestamps.length >= args.minCandles;
  return {
    market: pair.market,
    upbitCandleCount: pair.upbitCandles.length,
    bithumbCandleCount: pair.bithumbCandles.length,
    commonSignalTimestampCount: commonTimestamps.length,
    upbitFrom: pair.upbitCandles[0] ? new Date(pair.upbitCandles[0]!.timestampMs).toISOString() : null,
    upbitTo: pair.upbitCandles.at(-1) ? new Date(pair.upbitCandles.at(-1)!.timestampMs).toISOString() : null,
    bithumbFrom: pair.bithumbCandles[0] ? new Date(pair.bithumbCandles[0]!.timestampMs).toISOString() : null,
    bithumbTo: pair.bithumbCandles.at(-1) ? new Date(pair.bithumbCandles.at(-1)!.timestampMs).toISOString() : null,
    upbitSpanDays: round(upbitSpanDays),
    bithumbSpanDays: round(bithumbSpanDays),
    sourceReady,
  };
}

function commonSignalTimestamps(pair: PairData, intervalMs: number): number[] {
  const upbitTimestamps = new Set(pair.upbitCandles.map((candle) => candle.timestampMs));
  const bithumbTimestamps = new Set(pair.bithumbCandles.map((candle) => candle.timestampMs));
  return [...upbitTimestamps]
    .filter((timestampMs) => bithumbTimestamps.has(timestampMs + intervalMs))
    .sort((left, right) => left - right);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const input = args.inputPath === null ? null : await loadInput(args.inputPath);
  const intervalMs = args.unitMinutes * 60 * 1000;
  const pairData: PairData[] = [];
  for (const market of args.markets) {
    pairData.push(await loadPairData(market, args, input));
    await sleep(250);
  }
  const sources = pairData.map((pair) => sourceSummary(pair, args));
  const evaluated = [];

  for (const pair of pairData) {
    const source = sources.find((item) => item.market === pair.market);
    const sourceReady = source?.sourceReady === true;
    const upbitByTimestamp = new Map(pair.upbitCandles.map((candle) => [candle.timestampMs, candle]));
    const bithumbByTimestamp = new Map(pair.bithumbCandles.map((candle) => [candle.timestampMs, candle]));
    const signalTimestamps = commonSignalTimestamps(pair, intervalMs);
    const splitIndex = Math.floor(signalTimestamps.length * 0.7);
    const trainTimestamps = signalTimestamps.slice(0, splitIndex);
    const testTimestamps = signalTimestamps.slice(splitIndex);

    for (const candidate of buildCandidates(pair.market, args.signalDirection)) {
      const trainTrades = simulate(
        upbitByTimestamp,
        bithumbByTimestamp,
        trainTimestamps,
        candidate,
        intervalMs,
        args.notionalKrw,
        args.feeRoundTripRate,
      );
      const testTrades = simulate(
        upbitByTimestamp,
        bithumbByTimestamp,
        testTimestamps,
        candidate,
        intervalMs,
        args.notionalKrw,
        args.feeRoundTripRate,
      );
      const allTrades = simulate(
        upbitByTimestamp,
        bithumbByTimestamp,
        signalTimestamps,
        candidate,
        intervalMs,
        args.notionalKrw,
        args.feeRoundTripRate,
      );
      const train = summarize(trainTrades, args.notionalKrw);
      const test = summarize(testTrades, args.notionalKrw);
      const walkForward = walkForwardSummary(allTrades, args.notionalKrw);
      const eligible = promotionEligible(sourceReady, train, test, walkForward);
      evaluated.push({
        market: candidate.market,
        leaderVenue: "upbit",
        executionVenue: "bithumb",
        lookbackBars: candidate.lookbackBars,
        lagBars: candidate.lagBars,
        holdBars: candidate.holdBars,
        minReturnBps: candidate.minReturnBps,
        signalDirection: candidate.signalDirection,
        train,
        test,
        walkForward,
        passesPromotion: eligible,
        promotionEligible: eligible,
        score: score(test, walkForward),
      });
    }
  }

  const promotionCandidates = evaluated
    .filter((candidate) => candidate.promotionEligible)
    .sort((left, right) => right.score - left.score);
  const topByTest = [...evaluated]
    .filter((candidate) => candidate.train.count > 0 || candidate.test.count > 0)
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 20);
  const sourceFailures = sources
    .filter((source) => !source.sourceReady)
    .map((source) => ({
      market: source.market,
      reason: "insufficient_aligned_candles_or_span",
      upbitCandleCount: source.upbitCandleCount,
      bithumbCandleCount: source.bithumbCandleCount,
      commonSignalTimestampCount: source.commonSignalTimestampCount,
      upbitSpanDays: source.upbitSpanDays,
      bithumbSpanDays: source.bithumbSpanDays,
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Upbit-to-Bithumb lead/lag research. Upbit public candles are used only as leader signals; simulated execution is Bithumb long-only candle close after the configured lag and future close after hold, fee-stressed. Research evidence only, not live startup approval.",
    assumptions: {
      markets: args.markets,
      market: args.markets.length === 1 ? args.markets[0] : undefined,
      leaderVenue: "upbit",
      executionVenue: "bithumb",
      unitMinutes: args.unitMinutes,
      maxCandles: args.maxCandles,
      minCandles: args.minCandles,
      minPromotionSpanDays: args.minPromotionSpanDays,
      notionalKrw: args.notionalKrw,
      feeRoundTripRate: args.feeRoundTripRate,
      feeRoundTripBps: round(args.feeRoundTripRate * 10_000),
      signalDirection: args.signalDirection,
      split: "first 70% aligned signal timestamps train, last 30% test",
      execution:
        "entry at Bithumb close after lagBars following the Upbit signal candle, exit at future Bithumb close, non-overlapping long-only",
      promotionMinimums: {
        trainTrades: MIN_PROMOTION_TRAIN_TRADES,
        testTrades: MIN_PROMOTION_TEST_TRADES,
        totalTrainTestTrades: MIN_PROMOTION_TOTAL_TRADES,
        trainMedianPnlKrw: "positive",
        testMedianPnlKrw: "positive",
        walkForwardTotalPnlKrw: "positive",
        walkForwardMinFoldPnlKrw: "non-negative",
        positiveWalkForwardFolds: MIN_POSITIVE_WALK_FORWARD_FOLDS,
      },
    },
    sourceReady: sources.every((source) => source.sourceReady),
    sourceFailureCount: sourceFailures.length,
    sourceFailures,
    sources,
    marketCount: args.markets.length,
    candidateCount: evaluated.length,
    promotionCandidateCount: promotionCandidates.length,
    promotionCandidates,
    topByTest,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
