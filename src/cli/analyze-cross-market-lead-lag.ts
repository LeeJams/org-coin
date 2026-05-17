import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  baseDir: string;
  markets: string[];
  leaderMarket: string | null;
  outputPath: string | null;
  notionalKrw: number;
  feeRoundTripRate: number;
  unitMinutes: number;
  minCandles: number;
  signalDirection: SignalDirection;
}

interface Candle {
  market: string;
  timestampMs: number;
  close: number;
}

interface BookSnapshot {
  market: string;
  timestampMs: number;
  bestAskPrice: number;
  bestBidPrice: number;
}

interface CandidateConfig {
  targetMarket: string;
  leaderMarket?: string;
  signalDirection: SignalDirection;
  lookbackBars: number;
  holdBars: number;
  minLeaderReturnBps: number;
  minConfirmingMarkets: number;
  requireTargetConfirmation: boolean;
}

interface Trade {
  market: string;
  entryAt: number;
  exitAt: number;
  entryAskPrice: number;
  exitBidPrice: number;
  confirmingMarketCount: number;
  targetReturnBps: number | null;
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

const FEE_ROUND_TRIP_RATE = 0.005;
type SignalDirection = "positive" | "negative";
const WALK_FORWARD_FOLDS = 5;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;
const LOOKBACK_BARS = [5, 15, 30, 60];
const HOLD_BARS = [5, 15, 30, 60, 240];
const MIN_LEADER_RETURN_BPS = [5, 10, 20, 35, 50];
const MIN_CONFIRMING_MARKETS = [2, 3];
const REQUIRE_TARGET_CONFIRMATION = [false, true];

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baseDir: resolve(cwd, "var/data"),
    markets: ["KRW-BTC", "KRW-ETH", "KRW-XRP"],
    leaderMarket: null,
    outputPath: null,
    notionalKrw: 500_000,
    feeRoundTripRate: FEE_ROUND_TRIP_RATE,
    unitMinutes: 1,
    minCandles: 500,
    signalDirection: "positive",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--base-dir") {
      if (!value) throw new Error("--base-dir requires a value");
      args.baseDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--markets") {
      if (!value) throw new Error("--markets requires a comma-separated value");
      args.markets = value
        .split(",")
        .map((market) => market.trim())
        .filter((market) => market.length > 0);
      if (args.markets.length < 2) throw new Error("--markets requires at least two markets");
      index += 1;
      continue;
    }
    if (arg === "--leader-market") {
      if (!value) throw new Error("--leader-market requires a value");
      args.leaderMarket = value.trim();
      if (args.leaderMarket.length === 0) throw new Error("--leader-market requires a non-empty market");
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
    if (arg === "--unit-minutes") {
      if (!value) throw new Error("--unit-minutes requires a value");
      args.unitMinutes = positiveInteger(value, "--unit-minutes");
      index += 1;
      continue;
    }
    if (arg === "--min-candles") {
      if (!value) throw new Error("--min-candles requires a value");
      args.minCandles = positiveInteger(value, "--min-candles");
      index += 1;
      continue;
    }
    if (arg === "--signal-direction") {
      if (!value) throw new Error("--signal-direction requires a value");
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
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive finite number`);
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function collectFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".ndjson")) paths.push(path);
    }
  }
  await walk(root);
  paths.sort();
  return paths;
}

async function readNdjson(path: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function includesMarket(path: string, market: string): boolean {
  return path.includes(`market=${market}/`);
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

async function loadCandles(baseDir: string, market: string, unitMinutes: number): Promise<Candle[]> {
  const root = resolve(baseDir, "canonical", `candle_${unitMinutes}m`);
  const intervalMs = unitMinutes * 60 * 1000;
  const files = (await collectFiles(root)).filter((path) => includesMarket(path, market));
  const byTimestamp = new Map<number, Candle>();
  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const recordMarket = stringValue(record.market);
      const rawTimestampMs = candleTimestampMs(record);
      const timestampMs = Math.floor(rawTimestampMs / intervalMs) * intervalMs;
      const close = finiteNumber(record.trade_price ?? record.close_price);
      if (recordMarket !== market || timestampMs <= 0 || close <= 0) continue;
      byTimestamp.set(timestampMs, { market, timestampMs, close });
    }
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

async function loadBookSnapshots(baseDir: string, market: string): Promise<BookSnapshot[]> {
  const root = resolve(baseDir, "canonical", "orderbook_snapshot");
  const files = (await collectFiles(root)).filter((path) => includesMarket(path, market));
  const byTimestamp = new Map<number, BookSnapshot>();
  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const recordMarket = stringValue(record.market);
      const timestampMs = finiteNumber(record.event_timestamp_ms);
      const bestAskPrice = finiteNumber(record.best_ask_price);
      const bestBidPrice = finiteNumber(record.best_bid_price);
      if (recordMarket !== market || timestampMs <= 0 || bestAskPrice <= 0 || bestBidPrice <= 0) continue;
      byTimestamp.set(timestampMs, { market, timestampMs, bestAskPrice, bestBidPrice });
    }
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

function lowerBoundBook(books: BookSnapshot[], timestampMs: number): BookSnapshot | null {
  let low = 0;
  let high = books.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (books[middle]!.timestampMs < timestampMs) low = middle + 1;
    else high = middle;
  }
  return books[low] ?? null;
}

function candidateGrid(markets: string[], leaderMarket: string | null, signalDirection: SignalDirection): CandidateConfig[] {
  const candidates: CandidateConfig[] = [];
  const targetMarkets = leaderMarket === null
    ? markets
    : markets.filter((market) => market !== leaderMarket);
  for (const targetMarket of targetMarkets) {
    for (const lookbackBars of LOOKBACK_BARS) {
      for (const holdBars of HOLD_BARS) {
        for (const minLeaderReturnBps of MIN_LEADER_RETURN_BPS) {
          const confirmingMarketOptions =
            leaderMarket === null ? MIN_CONFIRMING_MARKETS : [1];
          for (const minConfirmingMarkets of confirmingMarketOptions) {
            if (minConfirmingMarkets > markets.length) continue;
            for (const requireTargetConfirmation of REQUIRE_TARGET_CONFIRMATION) {
              candidates.push({
                targetMarket,
                ...(leaderMarket === null ? {} : { leaderMarket }),
                signalDirection,
                lookbackBars,
                holdBars,
                minLeaderReturnBps,
                minConfirmingMarkets,
                requireTargetConfirmation,
              });
            }
          }
        }
      }
    }
  }
  return candidates;
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function signalDirectionPass(returnBps: number, minReturnBps: number, signalDirection: SignalDirection): boolean {
  return signalDirection === "positive" ? returnBps >= minReturnBps : returnBps <= -minReturnBps;
}

function simulate(
  candleMaps: Map<string, Map<number, Candle>>,
  bookMaps: Map<string, BookSnapshot[]>,
  signalTimestamps: number[],
  candidate: CandidateConfig,
  intervalMs: number,
  notionalKrw: number,
  feeRoundTripRate: number,
): Trade[] {
  const trades: Trade[] = [];
  let blockedUntil = -Infinity;
  const targetBooks = bookMaps.get(candidate.targetMarket) ?? [];

  for (const timestampMs of signalTimestamps) {
    const entrySignalAt = timestampMs + intervalMs;
    if (entrySignalAt < blockedUntil) continue;

    let confirmingMarketCount = 0;
    let targetReturnBps: number | null = null;
    if (candidate.leaderMarket !== undefined) {
      const leaderCandles = candleMaps.get(candidate.leaderMarket);
      const targetCandles = candleMaps.get(candidate.targetMarket);
      const leaderCurrent = leaderCandles?.get(timestampMs);
      const leaderPrevious = leaderCandles?.get(timestampMs - candidate.lookbackBars * intervalMs);
      const targetCurrent = targetCandles?.get(timestampMs);
      const targetPrevious = targetCandles?.get(timestampMs - candidate.lookbackBars * intervalMs);
      if (targetCurrent && targetPrevious) {
        targetReturnBps = bps(targetCurrent.close, targetPrevious.close);
      }
      if (leaderCurrent && leaderPrevious) {
        const leaderReturnBps = bps(leaderCurrent.close, leaderPrevious.close);
        confirmingMarketCount = signalDirectionPass(
          leaderReturnBps,
          candidate.minLeaderReturnBps,
          candidate.signalDirection,
        )
          ? 1
          : 0;
      }
    } else {
      for (const [market, candles] of candleMaps) {
        const current = candles.get(timestampMs);
        const previous = candles.get(timestampMs - candidate.lookbackBars * intervalMs);
        if (!current || !previous) continue;
        const returnBps = bps(current.close, previous.close);
        if (market === candidate.targetMarket) targetReturnBps = returnBps;
        if (signalDirectionPass(returnBps, candidate.minLeaderReturnBps, candidate.signalDirection)) {
          confirmingMarketCount += 1;
        }
      }
    }

    if (confirmingMarketCount < candidate.minConfirmingMarkets) continue;
    if (
      candidate.requireTargetConfirmation &&
      !signalDirectionPass(targetReturnBps ?? 0, candidate.minLeaderReturnBps, candidate.signalDirection)
    ) {
      continue;
    }

    const entryBook = lowerBoundBook(targetBooks, entrySignalAt);
    const exitBook = lowerBoundBook(targetBooks, entrySignalAt + candidate.holdBars * intervalMs);
    if (!entryBook || !exitBook) continue;

    const netReturn = exitBook.bestBidPrice / entryBook.bestAskPrice - 1 - feeRoundTripRate;
    trades.push({
      market: candidate.targetMarket,
      entryAt: entryBook.timestampMs,
      exitAt: exitBook.timestampMs,
      entryAskPrice: entryBook.bestAskPrice,
      exitBidPrice: exitBook.bestBidPrice,
      confirmingMarketCount,
      targetReturnBps,
      pnlKrw: notionalKrw * netReturn,
      netReturnBps: netReturn * 10_000,
    });
    blockedUntil = exitBook.timestampMs;
  }

  return trades;
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
  const total = trades.reduce((sum, trade) => sum + trade.pnlKrw, 0);
  return {
    count: trades.length,
    totalPnlKrw: round(total) ?? 0,
    averagePnlKrw: trades.length === 0 ? null : round(total / trades.length),
    medianPnlKrw: round(median(trades.map((trade) => trade.pnlKrw))),
    winners: trades.filter((trade) => trade.pnlKrw > 0).length,
    losers: trades.filter((trade) => trade.pnlKrw <= 0).length,
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
    allPositiveFoldCount: summaries.filter(
      (summary) => summary.totalPnlKrw > 0 && (summary.medianPnlKrw ?? -Infinity) > 0,
    ).length,
    totalPnlKrw: round(totals.reduce((sum, value) => sum + value, 0)) ?? 0,
    minFoldPnlKrw: round(Math.min(...totals)),
  };
}

function promotionEligible(train: Summary, test: Summary, walkForward: WalkForwardSummary): boolean {
  return (
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  if (args.leaderMarket !== null && !args.markets.includes(args.leaderMarket)) {
    throw new Error("--leader-market must be included in --markets");
  }
  const intervalMs = args.unitMinutes * 60 * 1000;
  const candleMaps = new Map<string, Map<number, Candle>>();
  const bookMaps = new Map<string, BookSnapshot[]>();
  const sources = [];

  for (const market of args.markets) {
    const [candles, books] = await Promise.all([
      loadCandles(args.baseDir, market, args.unitMinutes),
      loadBookSnapshots(args.baseDir, market),
    ]);
    candleMaps.set(market, new Map(candles.map((candle) => [candle.timestampMs, candle])));
    bookMaps.set(market, books);
    sources.push({
      market,
      candleCount: candles.length,
      orderbookSnapshotCount: books.length,
      from: candles[0] ? new Date(candles[0].timestampMs).toISOString() : null,
      to: candles.at(-1) ? new Date(candles.at(-1)!.timestampMs).toISOString() : null,
    });
  }

  const marketTimestampSets = [...candleMaps.values()].map((candles) => new Set(candles.keys()));
  const firstTimestampSet = marketTimestampSets[0] ?? new Set<number>();
  const signalTimestamps = [...firstTimestampSet]
    .filter((timestampMs) => marketTimestampSets.every((timestamps) => timestamps.has(timestampMs)))
    .sort((left, right) => left - right);
  const splitIndex = Math.floor(signalTimestamps.length * 0.7);
  const trainSignalTimestamps = signalTimestamps.slice(0, splitIndex);
  const testSignalTimestamps = signalTimestamps.slice(splitIndex);
  const sourceReady = sources.every((source) => source.candleCount >= args.minCandles);

  const evaluated = candidateGrid(args.markets, args.leaderMarket, args.signalDirection).map((candidate) => {
    const trainTrades = simulate(
      candleMaps,
      bookMaps,
      trainSignalTimestamps,
      candidate,
      intervalMs,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    const testTrades = simulate(
      candleMaps,
      bookMaps,
      testSignalTimestamps,
      candidate,
      intervalMs,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    const allTrades = simulate(
      candleMaps,
      bookMaps,
      signalTimestamps,
      candidate,
      intervalMs,
      args.notionalKrw,
      args.feeRoundTripRate,
    );
    const train = summarize(trainTrades, args.notionalKrw);
    const test = summarize(testTrades, args.notionalKrw);
    const walkForward = walkForwardSummary(allTrades, args.notionalKrw);
    return {
      ...candidate,
      train,
      test,
      walkForward,
      promotionEligible: sourceReady && promotionEligible(train, test, walkForward),
      score: score(test, walkForward),
    };
  });

  const promotionCandidates = evaluated
    .filter((candidate) => candidate.promotionEligible)
    .sort((left, right) => right.score - left.score);
  const topByTest = [...evaluated]
    .filter((candidate) => candidate.train.count > 0 || candidate.test.count > 0)
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 20);

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Cross-market lead/lag confirmation research from local 1m candles and orderbook execution marks. Signals require multiple KRW majors to move together; entries use next-period best ask and exits use future best bid with fee stress. Research evidence only, not live startup approval.",
    assumptions: {
      markets: args.markets,
      leaderMarket: args.leaderMarket,
      signalDirection: args.signalDirection,
      targetMarkets:
        args.leaderMarket === null
          ? args.markets
          : args.markets.filter((market) => market !== args.leaderMarket),
      unitMinutes: args.unitMinutes,
      notionalKrw: args.notionalKrw,
      feeRoundTripRate: args.feeRoundTripRate,
      feeRoundTripBps: round(args.feeRoundTripRate * 10_000),
      split: "first 70% signal timestamps train, last 30% test",
      signal:
        args.leaderMarket === null
          ? args.signalDirection === "positive"
            ? "enter target market next period when at least minConfirmingMarkets among the configured markets have lookback returns >= minLeaderReturnBps; optional target confirmation requires target to be one of them"
            : "enter target market next period when at least minConfirmingMarkets among the configured markets have lookback returns <= -minLeaderReturnBps; optional target confirmation requires target to be one of them"
          : args.signalDirection === "positive"
            ? "enter target market next period when the configured leader market has lookback return >= minLeaderReturnBps; optional target confirmation requires the target to also clear the threshold"
            : "enter target market next period when the configured leader market has lookback return <= -minLeaderReturnBps; optional target confirmation requires the target to also clear the negative threshold",
      execution: "entry at target best ask after signal period, exit at future target best bid, non-overlapping long-only",
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
    sourceReady,
    sources,
    signalTimestampCount: signalTimestamps.length,
    candidateCount: evaluated.length,
    promotionCandidateCount: promotionCandidates.length,
    promotionCandidates,
    topByTest,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
