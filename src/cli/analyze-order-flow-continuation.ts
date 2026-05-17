import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  baseDir: string;
  markets: string[];
  signalMode: "continuation" | "reversion" | "absorption" | "recovery";
  outputPath: string | null;
  notionalKrw: number;
  feeRoundTripRate: number;
  horizonSeconds: number;
  horizonSecondsList: number[];
  minSnapshots: number;
}

interface PassiveSnapshot {
  market: string;
  timestampMs: number;
  ret5mBps: number;
  buyNotionalShare60s: number;
  depthRatioL5: number;
  spreadBps: number;
  turnover24hKrw: number;
  windowCoverageSeconds: number;
}

interface BookSnapshot {
  market: string;
  timestampMs: number;
  bestAskPrice: number;
  bestBidPrice: number;
}

interface CandidateConfig {
  horizonSeconds: number;
  minRet5mBps: number;
  minBuyNotionalShare60s: number;
  minDepthRatioL5: number;
  maxSpreadBps: number;
  recoveryLookbackSeconds: number;
  minRecoveryRetBps: number;
}

interface Trade {
  market: string;
  entryAt: number;
  exitAt: number;
  entryAskPrice: number;
  exitBidPrice: number;
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
const WALK_FORWARD_FOLDS = 5;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;
const MIN_RET_5M_BPS = [0, 5, 10, 20, 35];
const MIN_BUY_NOTIONAL_SHARE_60S = [0.55, 0.6, 0.65, 0.7];
const MIN_DEPTH_RATIO_L5 = [0.8, 1, 1.2, 1.5];
const MAX_SPREAD_BPS = [2, 5, 10, 20];
const RECOVERY_MIN_RET_5M_BPS = [10, 20, 35];
const RECOVERY_MIN_BUY_NOTIONAL_SHARE_60S = [0.55, 0.6, 0.65];
const RECOVERY_MIN_DEPTH_RATIO_L5 = [0.8, 1.2, 1.5];
const RECOVERY_MAX_SPREAD_BPS = [2, 5, 10];
const RECOVERY_LOOKBACK_SECONDS = [60, 180, 300];
const RECOVERY_MIN_RET_IMPROVEMENT_BPS = [0, 5, 10];

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baseDir: resolve(cwd, "var/data"),
    markets: ["KRW-BTC", "KRW-ETH", "KRW-XRP"],
    signalMode: "continuation",
    outputPath: null,
    notionalKrw: 500_000,
    feeRoundTripRate: FEE_ROUND_TRIP_RATE,
    horizonSeconds: 300,
    horizonSecondsList: [300],
    minSnapshots: 100,
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
      if (args.markets.length === 0) throw new Error("--markets requires at least one market");
      index += 1;
      continue;
    }
    if (arg === "--signal-mode") {
      if (value !== "continuation" && value !== "reversion" && value !== "absorption" && value !== "recovery") {
        throw new Error("--signal-mode must be continuation, reversion, absorption, or recovery");
      }
      args.signalMode = value;
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
    if (arg === "--horizon-seconds") {
      if (!value) throw new Error("--horizon-seconds requires a value");
      args.horizonSeconds = positiveInteger(value, "--horizon-seconds");
      args.horizonSecondsList = [args.horizonSeconds];
      index += 1;
      continue;
    }
    if (arg === "--horizons-seconds") {
      if (!value) throw new Error("--horizons-seconds requires a comma-separated value");
      args.horizonSecondsList = value
        .split(",")
        .map((part) => positiveInteger(part.trim(), "--horizons-seconds"))
        .filter((horizonSeconds, index, values) => values.indexOf(horizonSeconds) === index)
        .sort((left, right) => left - right);
      if (args.horizonSecondsList.length === 0) {
        throw new Error("--horizons-seconds requires at least one horizon");
      }
      args.horizonSeconds = args.horizonSecondsList[0]!;
      index += 1;
      continue;
    }
    if (arg === "--min-snapshots") {
      if (!value) throw new Error("--min-snapshots requires a value");
      args.minSnapshots = positiveInteger(value, "--min-snapshots");
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

async function collectMarketFiles(root: string, market: string): Promise<string[]> {
  const paths: string[] = [];
  let dateEntries;
  try {
    dateEntries = await readdir(root, { withFileTypes: true });
  } catch {
    return paths;
  }

  for (const dateEntry of dateEntries) {
    if (!dateEntry.isDirectory()) continue;
    const marketRoot = resolve(root, dateEntry.name, `market=${market}`);
    let marketEntries;
    try {
      marketEntries = await readdir(marketRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const marketEntry of marketEntries) {
      if (marketEntry.isFile() && marketEntry.name.endsWith(".ndjson")) {
        paths.push(resolve(marketRoot, marketEntry.name));
      }
    }
  }

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

async function loadPassiveSnapshots(baseDir: string, market: string): Promise<PassiveSnapshot[]> {
  const root = resolve(baseDir, "canonical", "passive_feature_snapshot");
  const files = await collectMarketFiles(root, market);
  const snapshots: PassiveSnapshot[] = [];

  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const recordMarket = stringValue(record.market);
      const timestampMs = finiteNumber(record.event_timestamp_ms);
      if (recordMarket !== market || timestampMs <= 0) continue;
      snapshots.push({
        market,
        timestampMs,
        ret5mBps: finiteNumber(record.ret_5m_bps),
        buyNotionalShare60s: finiteNumber(record.buy_notional_share_60s),
        depthRatioL5: finiteNumber(record.depth_ratio_l5),
        spreadBps: finiteNumber(record.spread_bps),
        turnover24hKrw: finiteNumber(record.turnover_24h_krw),
        windowCoverageSeconds: finiteNumber(record.window_coverage_sec),
      });
    }
  }

  return snapshots.sort((left, right) => left.timestampMs - right.timestampMs);
}

async function loadBookSnapshots(baseDir: string, market: string): Promise<BookSnapshot[]> {
  const root = resolve(baseDir, "canonical", "orderbook_snapshot");
  const files = await collectMarketFiles(root, market);
  const byTimestamp = new Map<number, BookSnapshot>();

  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const recordMarket = stringValue(record.market);
      const timestampMs = finiteNumber(record.event_timestamp_ms);
      const bestAskPrice = finiteNumber(record.best_ask_price);
      const bestBidPrice = finiteNumber(record.best_bid_price);
      if (recordMarket !== market || timestampMs <= 0 || bestAskPrice <= 0 || bestBidPrice <= 0) continue;
      byTimestamp.set(timestampMs, {
        market,
        timestampMs,
        bestAskPrice,
        bestBidPrice,
      });
    }
  }

  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

function candidateGrid(horizonSecondsList: number[], signalMode: Args["signalMode"]): CandidateConfig[] {
  const candidates: CandidateConfig[] = [];

  if (signalMode === "recovery") {
    for (const horizonSeconds of horizonSecondsList) {
      for (const minRet5mBps of RECOVERY_MIN_RET_5M_BPS) {
        for (const minBuyNotionalShare60s of RECOVERY_MIN_BUY_NOTIONAL_SHARE_60S) {
          for (const minDepthRatioL5 of RECOVERY_MIN_DEPTH_RATIO_L5) {
            for (const maxSpreadBps of RECOVERY_MAX_SPREAD_BPS) {
              for (const recoveryLookbackSeconds of RECOVERY_LOOKBACK_SECONDS) {
                for (const minRecoveryRetBps of RECOVERY_MIN_RET_IMPROVEMENT_BPS) {
                  candidates.push({
                    horizonSeconds,
                    minRet5mBps,
                    minBuyNotionalShare60s,
                    minDepthRatioL5,
                    maxSpreadBps,
                    recoveryLookbackSeconds,
                    minRecoveryRetBps,
                  });
                }
              }
            }
          }
        }
      }
    }
    return candidates;
  }

  for (const horizonSeconds of horizonSecondsList) {
    for (const minRet5mBps of MIN_RET_5M_BPS) {
      for (const minBuyNotionalShare60s of MIN_BUY_NOTIONAL_SHARE_60S) {
        for (const minDepthRatioL5 of MIN_DEPTH_RATIO_L5) {
          for (const maxSpreadBps of MAX_SPREAD_BPS) {
            candidates.push({
              horizonSeconds,
              minRet5mBps,
              minBuyNotionalShare60s,
              minDepthRatioL5,
              maxSpreadBps,
              recoveryLookbackSeconds: 0,
              minRecoveryRetBps: 0,
            });
          }
        }
      }
    }
  }
  return candidates;
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

function passes(
  snapshot: PassiveSnapshot,
  candidate: CandidateConfig,
  signalMode: Args["signalMode"],
  recoveryBase: PassiveSnapshot | null,
): boolean {
  const common =
    snapshot.depthRatioL5 >= candidate.minDepthRatioL5 &&
    snapshot.spreadBps <= candidate.maxSpreadBps &&
    snapshot.windowCoverageSeconds >= 55 &&
    snapshot.turnover24hKrw >= 30_000_000_000;
  if (!common) return false;

  if (signalMode === "recovery") {
    return (
      recoveryBase !== null &&
      recoveryBase.windowCoverageSeconds >= 55 &&
      recoveryBase.turnover24hKrw >= 30_000_000_000 &&
      recoveryBase.ret5mBps <= -candidate.minRet5mBps &&
      snapshot.ret5mBps >= recoveryBase.ret5mBps + candidate.minRecoveryRetBps &&
      snapshot.buyNotionalShare60s >= candidate.minBuyNotionalShare60s &&
      snapshot.spreadBps <= recoveryBase.spreadBps &&
      snapshot.depthRatioL5 >= recoveryBase.depthRatioL5
    );
  }

  if (signalMode === "reversion") {
    return (
      snapshot.ret5mBps <= -candidate.minRet5mBps &&
      snapshot.buyNotionalShare60s <= 1 - candidate.minBuyNotionalShare60s
    );
  }

  if (signalMode === "absorption") {
    return (
      snapshot.ret5mBps <= -candidate.minRet5mBps &&
      snapshot.buyNotionalShare60s >= candidate.minBuyNotionalShare60s
    );
  }

  return (
    snapshot.ret5mBps >= candidate.minRet5mBps &&
    snapshot.buyNotionalShare60s >= candidate.minBuyNotionalShare60s
  );
}

function simulate(
  snapshots: PassiveSnapshot[],
  books: BookSnapshot[],
  candidate: CandidateConfig,
  signalMode: Args["signalMode"],
  horizonMs: number,
  notionalKrw: number,
  feeRoundTripRate: number,
): Trade[] {
  const trades: Trade[] = [];
  let blockedUntil = -Infinity;
  let recoveryIndex = 0;
  const recoveryLookbackMs = candidate.recoveryLookbackSeconds * 1000;

  for (const snapshot of snapshots) {
    let recoveryBase: PassiveSnapshot | null = null;
    if (signalMode === "recovery") {
      const targetTimestampMs = snapshot.timestampMs - recoveryLookbackMs;
      while (
        recoveryIndex + 1 < snapshots.length &&
        snapshots[recoveryIndex + 1]!.timestampMs <= targetTimestampMs
      ) {
        recoveryIndex += 1;
      }
      const candidateBase = snapshots[recoveryIndex] ?? null;
      recoveryBase =
        candidateBase !== null && candidateBase.timestampMs <= targetTimestampMs ? candidateBase : null;
    }

    if (snapshot.timestampMs < blockedUntil || !passes(snapshot, candidate, signalMode, recoveryBase)) continue;

    const entryBook = lowerBoundBook(books, snapshot.timestampMs);
    const exitBook = lowerBoundBook(books, snapshot.timestampMs + horizonMs);
    if (!entryBook || !exitBook) continue;

    const grossReturn = exitBook.bestBidPrice / entryBook.bestAskPrice - 1;
    const netReturn = grossReturn - feeRoundTripRate;
    trades.push({
      market: snapshot.market,
      entryAt: snapshot.timestampMs,
      exitAt: exitBook.timestampMs,
      entryAskPrice: entryBook.bestAskPrice,
      exitBidPrice: exitBook.bestBidPrice,
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
  const totalPnlKrw = trades.reduce((sum, trade) => sum + trade.pnlKrw, 0);
  return {
    count: trades.length,
    totalPnlKrw: round(totalPnlKrw) ?? 0,
    averagePnlKrw: trades.length === 0 ? null : round(totalPnlKrw / trades.length),
    medianPnlKrw: round(median(trades.map((trade) => trade.pnlKrw))),
    winners: trades.filter((trade) => trade.pnlKrw > 0).length,
    losers: trades.filter((trade) => trade.pnlKrw <= 0).length,
    returnPct: trades.length === 0 ? null : round((totalPnlKrw / (notionalKrw * trades.length)) * 100),
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
  const end = trades[trades.length - 1]!.entryAt;
  const span = Math.max(1, end - start + 1);
  const foldSummaries: Summary[] = [];

  for (let fold = 0; fold < WALK_FORWARD_FOLDS; fold += 1) {
    const foldStart = start + Math.floor((span * fold) / WALK_FORWARD_FOLDS);
    const foldEnd = fold === WALK_FORWARD_FOLDS - 1 ? end + 1 : start + Math.floor((span * (fold + 1)) / WALK_FORWARD_FOLDS);
    foldSummaries.push(summarize(trades.filter((trade) => trade.entryAt >= foldStart && trade.entryAt < foldEnd), notionalKrw));
  }

  const totals = foldSummaries.map((summary) => summary.totalPnlKrw);
  const positiveTotalFoldCount = foldSummaries.filter((summary) => summary.totalPnlKrw > 0).length;
  const positiveMedianFoldCount = foldSummaries.filter((summary) => (summary.medianPnlKrw ?? -Infinity) > 0).length;

  return {
    foldCount: WALK_FORWARD_FOLDS,
    positiveTotalFoldCount,
    positiveMedianFoldCount,
    allPositiveFoldCount: foldSummaries.filter(
      (summary) => summary.totalPnlKrw > 0 && (summary.medianPnlKrw ?? -Infinity) > 0,
    ).length,
    totalPnlKrw: round(totals.reduce((sum, value) => sum + value, 0)) ?? 0,
    minFoldPnlKrw: round(Math.min(...totals)),
  };
}

function promotionEligible(
  train: Summary,
  test: Summary,
  walkForward: WalkForwardSummary,
): boolean {
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
  const generatedAt = new Date().toISOString();
  const candidates = candidateGrid(args.horizonSecondsList, args.signalMode);
  const marketReports = [];

  for (const market of args.markets) {
    const [snapshots, books] = await Promise.all([
      loadPassiveSnapshots(args.baseDir, market),
      loadBookSnapshots(args.baseDir, market),
    ]);
    const splitIndex = Math.floor(snapshots.length * 0.7);
    const trainSnapshots = snapshots.slice(0, splitIndex);
    const testSnapshots = snapshots.slice(splitIndex);

    const evaluated = candidates.map((candidate) => {
      const trainTrades = simulate(
        trainSnapshots,
        books,
        candidate,
        args.signalMode,
        candidate.horizonSeconds * 1000,
        args.notionalKrw,
        args.feeRoundTripRate,
      );
      const testTrades = simulate(
        testSnapshots,
        books,
        candidate,
        args.signalMode,
        candidate.horizonSeconds * 1000,
        args.notionalKrw,
        args.feeRoundTripRate,
      );
      const allTrades = simulate(
        snapshots,
        books,
        candidate,
        args.signalMode,
        candidate.horizonSeconds * 1000,
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
        promotionEligible: snapshots.length >= args.minSnapshots && promotionEligible(train, test, walkForward),
        score: score(test, walkForward),
      };
    });

    const promotionCandidates = evaluated
      .filter((candidate) => candidate.promotionEligible)
      .sort((left, right) => right.score - left.score);
    const topByTest = [...evaluated]
      .filter((candidate) => candidate.train.count > 0 || candidate.test.count > 0)
      .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
      .slice(0, 10);

    marketReports.push({
      market,
      source: {
        passiveSnapshotCount: snapshots.length,
        orderbookSnapshotCount: books.length,
        from: snapshots[0] ? new Date(snapshots[0].timestampMs).toISOString() : null,
        to: snapshots.at(-1) ? new Date(snapshots.at(-1)!.timestampMs).toISOString() : null,
      },
      candidateCount: evaluated.length,
      promotionCandidateCount: promotionCandidates.length,
      promotionCandidates,
      topByTest,
    });
  }

  const promotionCandidates = marketReports
    .flatMap((report) => report.promotionCandidates.map((candidate) => ({ market: report.market, ...candidate })))
    .sort((left, right) => right.score - left.score);
  const topByTest = marketReports
    .flatMap((report) => report.topByTest.map((candidate) => ({ market: report.market, ...candidate })))
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 20);
  const sourceFailures = marketReports
    .filter((report) => report.source.passiveSnapshotCount < args.minSnapshots || report.source.orderbookSnapshotCount === 0)
    .map((report) => ({
      market: report.market,
      passiveSnapshotCount: report.source.passiveSnapshotCount,
      orderbookSnapshotCount: report.source.orderbookSnapshotCount,
      reason:
        report.source.passiveSnapshotCount < args.minSnapshots
          ? `passive snapshot count is below ${args.minSnapshots}`
          : "orderbook snapshot count is zero",
    }));
  const sourceReady = sourceFailures.length === 0;

  const report = {
    generatedAt,
    note:
      `Order-flow ${args.signalMode} research from local passive snapshots and future best-bid marks. Non-overlapping long-only trades, taker-style ask entry to future bid exit, fee-stressed. This is measurement evidence only, not a live strategy.`,
    assumptions: {
      markets: args.markets,
      signalMode: args.signalMode,
      horizonSeconds: args.horizonSeconds,
      horizonSecondsList: args.horizonSecondsList,
      notionalKrw: args.notionalKrw,
      feeRoundTripRate: args.feeRoundTripRate,
      feeRoundTripBps: round(args.feeRoundTripRate * 10_000),
      split: "first 70% train, last 30% test by snapshot time per market",
      gates: {
        continuationSignal: "ret_5m_bps >= minRet5mBps and buy_notional_share_60s >= minBuyNotionalShare60s",
        reversionSignal: "ret_5m_bps <= -minRet5mBps and buy_notional_share_60s <= 1 - minBuyNotionalShare60s",
        absorptionSignal: "ret_5m_bps <= -minRet5mBps and buy_notional_share_60s >= minBuyNotionalShare60s",
        recoverySignal:
          "past ret_5m_bps <= -minRet5mBps, current ret_5m_bps improves by minRecoveryRetBps, current buy_notional_share_60s >= minBuyNotionalShare60s, spread_bps <= past spread_bps, and depth_ratio_l5 >= past depth_ratio_l5",
        windowCoverageSeconds: ">= 55",
        turnover24hKrw: ">= 30000000000",
      },
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
    sourceFailureCount: sourceFailures.length,
    sourceFailures,
    marketCount: marketReports.length,
    candidateCount: marketReports.reduce((sum, report) => sum + report.candidateCount, 0),
    promotionCandidateCount: promotionCandidates.length,
    promotionCandidates,
    topByTest,
    markets: marketReports,
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
