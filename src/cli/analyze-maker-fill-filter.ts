import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

interface Args {
  baseDir: string;
  markets: string[];
  outputPath: string | null;
  notionalKrw: number;
  ttlSeconds: number;
  sampleIntervalSeconds: number;
  maxFeatureSkewSeconds: number;
  maxRuns: number | null;
}

interface RunFiles {
  orderbook: string[];
  trades: string[];
  passive: string[];
}

interface BookPoint {
  timestampMs: number;
  bestBidPrice: number;
  bestAskPrice: number;
  bestBidSize: number;
}

interface TradeTick {
  timestampMs: number;
  price: number;
  volume: number;
  side: string;
}

interface PassiveSnapshot {
  timestampMs: number;
  ret5mBps: number;
  buyNotionalShare60s: number;
  depthRatioL5: number;
  spreadBps: number;
  turnover24hKrw: number;
  windowCoverageSeconds: number;
}

interface FillObservation {
  market: string;
  sampledAtMs: number;
  fillAtMs: number;
  entryPrice: number;
  quantity: number;
  notionalKrw: number;
  fillDelaySeconds: number;
  featureSkewSeconds: number;
  ret5mBps: number;
  buyNotionalShare60s: number;
  depthRatioL5: number;
  spreadBps: number;
  turnover24hKrw: number;
  windowCoverageSeconds: number;
  marks: Record<string, number | null>;
}

interface CandidateConfig {
  horizonSeconds: number;
  minRet5mBps: number;
  maxRet5mBps: number | null;
  minBuyNotionalShare60s: number;
  maxBuyNotionalShare60s: number;
  minDepthRatioL5: number;
  maxSpreadBps: number;
  maxFillDelaySeconds: number;
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

const HORIZONS_SECONDS = [30, 60] as const;
const MAKER_FEE_RATE = 0.0004;
const TAKER_EXIT_FEE_RATE = 0.0004;
const WALK_FORWARD_FOLDS = 5;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;
const MIN_TURNOVER_24H_KRW = 30_000_000_000;
const MIN_WINDOW_COVERAGE_SECONDS = 55;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baseDir: resolve(cwd, "var/data"),
    markets: ["KRW-BTC", "KRW-ETH", "KRW-XRP"],
    outputPath: null,
    notionalKrw: 500_000,
    ttlSeconds: 60,
    sampleIntervalSeconds: 15,
    maxFeatureSkewSeconds: 30,
    maxRuns: null,
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
    if (arg === "--ttl-seconds") {
      if (!value) throw new Error("--ttl-seconds requires a value");
      args.ttlSeconds = positiveNumber(value, "--ttl-seconds");
      index += 1;
      continue;
    }
    if (arg === "--sample-interval-seconds") {
      if (!value) throw new Error("--sample-interval-seconds requires a value");
      args.sampleIntervalSeconds = positiveNumber(value, "--sample-interval-seconds");
      index += 1;
      continue;
    }
    if (arg === "--max-feature-skew-seconds") {
      if (!value) throw new Error("--max-feature-skew-seconds requires a value");
      args.maxFeatureSkewSeconds = positiveNumber(value, "--max-feature-skew-seconds");
      index += 1;
      continue;
    }
    if (arg === "--max-runs") {
      if (!value) throw new Error("--max-runs requires a value");
      args.maxRuns = Math.floor(positiveNumber(value, "--max-runs"));
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

function runIdFromPath(path: string): string | null {
  const match = /^part-(.+)\.ndjson$/u.exec(basename(path));
  return match?.[1] ?? null;
}

function includesMarket(path: string, market: string): boolean {
  return path.includes(`market=${market}/`);
}

async function collectRunFiles(baseDir: string, market: string): Promise<Map<string, RunFiles>> {
  const canonicalRoot = resolve(baseDir, "canonical");
  const [orderbookFiles, tradeFiles] = await Promise.all([
    collectFiles(resolve(canonicalRoot, "orderbook_level")),
    collectFiles(resolve(canonicalRoot, "trade_tick")),
  ]);
  const passiveFiles = await collectFiles(resolve(canonicalRoot, "passive_feature_snapshot"));
  const runs = new Map<string, RunFiles>();

  function add(path: string, key: keyof RunFiles): void {
    if (!includesMarket(path, market)) return;
    const runId = runIdFromPath(path);
    if (!runId) return;
    const entry = runs.get(runId) ?? { orderbook: [], trades: [], passive: [] };
    entry[key].push(path);
    runs.set(runId, entry);
  }

  for (const path of orderbookFiles) add(path, "orderbook");
  for (const path of tradeFiles) add(path, "trades");
  for (const path of passiveFiles) add(path, "passive");

  return runs;
}

async function loadBook(files: string[]): Promise<BookPoint[]> {
  const byTimestamp = new Map<number, BookPoint>();
  for (const file of files) {
    for (const record of await readNdjson(file)) {
      if (finiteNumber(record.level_index) !== 0) continue;
      const timestampMs = finiteNumber(record.event_timestamp_ms);
      const bestBidPrice = finiteNumber(record.bid_price);
      const bestAskPrice = finiteNumber(record.ask_price);
      const bestBidSize = finiteNumber(record.bid_size);
      if (timestampMs <= 0 || bestBidPrice <= 0 || bestAskPrice <= bestBidPrice || bestBidSize < 0) {
        continue;
      }
      byTimestamp.set(timestampMs, { timestampMs, bestBidPrice, bestAskPrice, bestBidSize });
    }
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

async function loadTrades(files: string[]): Promise<TradeTick[]> {
  const trades: TradeTick[] = [];
  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const timestampMs = finiteNumber(record.trade_timestamp_ms ?? record.event_timestamp_ms);
      const price = finiteNumber(record.price);
      const volume = finiteNumber(record.volume);
      const side = stringValue(record.side).toUpperCase();
      if (timestampMs > 0 && price > 0 && volume > 0) {
        trades.push({ timestampMs, price, volume, side });
      }
    }
  }
  trades.sort((left, right) => left.timestampMs - right.timestampMs);
  return trades;
}

async function loadPassiveSnapshots(files: string[], market: string): Promise<PassiveSnapshot[]> {
  const snapshots: PassiveSnapshot[] = [];

  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const recordMarket = stringValue(record.market);
      const timestampMs = finiteNumber(record.event_timestamp_ms);
      if (recordMarket !== market || timestampMs <= 0) continue;
      snapshots.push({
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

function lowerBoundByTimestamp<T extends { timestampMs: number }>(
  values: T[],
  timestampMs: number,
): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle]?.timestampMs ?? 0) < timestampMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function nearestPassiveFeature(
  snapshots: PassiveSnapshot[],
  timestampMs: number,
  maxSkewMs: number,
): { snapshot: PassiveSnapshot; skewSeconds: number } | null {
  const index = lowerBoundByTimestamp(snapshots, timestampMs);
  const before = snapshots[index - 1] ?? null;
  const after = snapshots[index] ?? null;
  const nearest =
    before === null
      ? after
      : after === null
        ? before
        : Math.abs(before.timestampMs - timestampMs) <= Math.abs(after.timestampMs - timestampMs)
          ? before
          : after;
  if (!nearest) return null;
  const skewMs = Math.abs(nearest.timestampMs - timestampMs);
  if (skewMs > maxSkewMs) return null;
  return { snapshot: nearest, skewSeconds: round(skewMs / 1000) };
}

function findMakerBuyFill(
  sample: BookPoint,
  trades: TradeTick[],
  quantity: number,
  ttlMs: number,
): number | null {
  const queueThreshold = sample.bestBidSize + quantity;
  let cumulativeSellVolume = 0;
  const startIndex = lowerBoundByTimestamp(trades, sample.timestampMs + 1);
  const expiresAt = sample.timestampMs + ttlMs;

  for (let index = startIndex; index < trades.length; index += 1) {
    const trade = trades[index];
    if (!trade || trade.timestampMs > expiresAt) break;
    if (trade.side === "ASK" && trade.price <= sample.bestBidPrice) {
      cumulativeSellVolume += trade.volume;
      if (cumulativeSellVolume >= queueThreshold) return trade.timestampMs;
    }
  }

  return null;
}

function markFutureBid(book: BookPoint[], timestampMs: number): number | null {
  const index = lowerBoundByTimestamp(book, timestampMs);
  return book[index]?.bestBidPrice ?? null;
}

function candidateGrid(): CandidateConfig[] {
  const candidates: CandidateConfig[] = [];
  const minRet5mBpsValues = [-20, 0, 20];
  const maxRet5mBpsValues: Array<number | null> = [null];
  const minBuyShareValues = [0.45, 0.55, 0.6];
  const maxBuyShareValues = [0.55, 0.7, 1];
  const minDepthRatioValues = [0.8, 1.2];
  const maxSpreadBpsValues = [5, 20];
  const maxFillDelaySecondsValues = [10, 60];

  for (const horizonSeconds of HORIZONS_SECONDS) {
    for (const minRet5mBps of minRet5mBpsValues) {
      for (const maxRet5mBps of maxRet5mBpsValues) {
        if (maxRet5mBps !== null && maxRet5mBps < minRet5mBps) continue;
        for (const minBuyNotionalShare60s of minBuyShareValues) {
          for (const maxBuyNotionalShare60s of maxBuyShareValues) {
            if (maxBuyNotionalShare60s < minBuyNotionalShare60s) continue;
            for (const minDepthRatioL5 of minDepthRatioValues) {
              for (const maxSpreadBps of maxSpreadBpsValues) {
                for (const maxFillDelaySeconds of maxFillDelaySecondsValues) {
                  candidates.push({
                    horizonSeconds,
                    minRet5mBps,
                    maxRet5mBps,
                    minBuyNotionalShare60s,
                    maxBuyNotionalShare60s,
                    minDepthRatioL5,
                    maxSpreadBps,
                    maxFillDelaySeconds,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return candidates;
}

function passes(observation: FillObservation, candidate: CandidateConfig): boolean {
  return (
    observation.ret5mBps >= candidate.minRet5mBps &&
    (candidate.maxRet5mBps === null || observation.ret5mBps <= candidate.maxRet5mBps) &&
    observation.buyNotionalShare60s >= candidate.minBuyNotionalShare60s &&
    observation.buyNotionalShare60s <= candidate.maxBuyNotionalShare60s &&
    observation.depthRatioL5 >= candidate.minDepthRatioL5 &&
    observation.spreadBps <= candidate.maxSpreadBps &&
    observation.fillDelaySeconds <= candidate.maxFillDelaySeconds &&
    observation.windowCoverageSeconds >= MIN_WINDOW_COVERAGE_SECONDS &&
    observation.turnover24hKrw >= MIN_TURNOVER_24H_KRW
  );
}

function pnlForMark(observation: FillObservation, exitBidPrice: number): number {
  const exitProceeds = observation.quantity * exitBidPrice * (1 - TAKER_EXIT_FEE_RATE);
  const entryCost = observation.notionalKrw * (1 + MAKER_FEE_RATE);
  return exitProceeds - entryCost;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round(value);
}

function summarize(observations: FillObservation[], candidate: CandidateConfig): Summary {
  const pnlValues: number[] = [];
  const horizonLabel = `${candidate.horizonSeconds}s`;
  for (const observation of observations) {
    if (!passes(observation, candidate)) continue;
    const mark = observation.marks[horizonLabel];
    if (mark === null || mark === undefined || mark <= 0) continue;
    pnlValues.push(pnlForMark(observation, mark));
  }
  const totalPnlKrw = pnlValues.reduce((sum, value) => sum + value, 0);
  return {
    count: pnlValues.length,
    totalPnlKrw: round(totalPnlKrw),
    averagePnlKrw: pnlValues.length > 0 ? round(totalPnlKrw / pnlValues.length) : null,
    medianPnlKrw: roundNullable(median(pnlValues)),
    winners: pnlValues.filter((value) => value > 0).length,
    losers: pnlValues.filter((value) => value <= 0).length,
    returnPct: pnlValues.length > 0 ? round((totalPnlKrw / (pnlValues.length * (observations[0]?.notionalKrw ?? 1))) * 100) : null,
  };
}

function walkForwardSummary(observations: FillObservation[], candidate: CandidateConfig): WalkForwardSummary {
  if (observations.length === 0) {
    return {
      foldCount: 0,
      positiveTotalFoldCount: 0,
      positiveMedianFoldCount: 0,
      totalPnlKrw: 0,
      minFoldPnlKrw: null,
    };
  }

  const start = observations[0]!.sampledAtMs;
  const end = observations.at(-1)!.sampledAtMs;
  const span = Math.max(1, end - start + 1);
  const foldSummaries: Summary[] = [];

  for (let fold = 0; fold < WALK_FORWARD_FOLDS; fold += 1) {
    const foldStart = start + Math.floor((span * fold) / WALK_FORWARD_FOLDS);
    const foldEnd =
      fold === WALK_FORWARD_FOLDS - 1
        ? end + 1
        : start + Math.floor((span * (fold + 1)) / WALK_FORWARD_FOLDS);
    foldSummaries.push(
      summarize(
        observations.filter(
          (observation) => observation.sampledAtMs >= foldStart && observation.sampledAtMs < foldEnd,
        ),
        candidate,
      ),
    );
  }

  const totals = foldSummaries.map((summary) => summary.totalPnlKrw);
  return {
    foldCount: WALK_FORWARD_FOLDS,
    positiveTotalFoldCount: foldSummaries.filter((summary) => summary.totalPnlKrw > 0).length,
    positiveMedianFoldCount: foldSummaries.filter((summary) => (summary.medianPnlKrw ?? -Infinity) > 0).length,
    totalPnlKrw: round(totals.reduce((sum, value) => sum + value, 0)),
    minFoldPnlKrw: roundNullable(totals.length > 0 ? Math.min(...totals) : null),
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

function summarizeDelay(observations: FillObservation[]) {
  const delays = observations.map((observation) => observation.fillDelaySeconds);
  return {
    averageSeconds: delays.length > 0 ? round(delays.reduce((sum, value) => sum + value, 0) / delays.length) : null,
    medianSeconds: roundNullable(median(delays)),
  };
}

async function collectObservationsForMarket(
  args: Args,
  market: string,
): Promise<{
  availableRunCount: number;
  usedRunCount: number;
  sampleCount: number;
  fillCount: number;
  featureMatchedFillCount: number;
  passiveSnapshotCount: number;
  observations: FillObservation[];
}> {
  const runFiles = await collectRunFiles(args.baseDir, market);
  const runIds = [...runFiles.keys()]
    .filter((runId) => {
      const files = runFiles.get(runId);
      return (files?.orderbook.length ?? 0) > 0 && (files?.trades.length ?? 0) > 0;
    })
    .sort()
    .slice(0, args.maxRuns ?? undefined);
  const observations: FillObservation[] = [];
  let sampleCount = 0;
  let fillCount = 0;
  let usedRunCount = 0;
  let passiveSnapshotCount = 0;
  const ttlMs = args.ttlSeconds * 1000;
  const sampleIntervalMs = args.sampleIntervalSeconds * 1000;
  const maxFeatureSkewMs = args.maxFeatureSkewSeconds * 1000;

  for (const runId of runIds) {
    const files = runFiles.get(runId);
    if (!files) continue;
    const [book, trades, passiveSnapshots] = await Promise.all([
      loadBook(files.orderbook),
      loadTrades(files.trades),
      loadPassiveSnapshots(files.passive, market),
    ]);
    if (book.length === 0 || trades.length === 0) continue;
    passiveSnapshotCount += passiveSnapshots.length;
    usedRunCount += 1;
    let nextSampleAt = -Infinity;

    for (const sample of book) {
      if (sample.timestampMs < nextSampleAt) continue;
      nextSampleAt = sample.timestampMs + sampleIntervalMs;
      sampleCount += 1;

      const quantity = args.notionalKrw / sample.bestBidPrice;
      const fillAtMs = findMakerBuyFill(sample, trades, quantity, ttlMs);
      if (fillAtMs === null) continue;
      fillCount += 1;

      const feature = nearestPassiveFeature(passiveSnapshots, sample.timestampMs, maxFeatureSkewMs);
      if (feature === null) continue;

      const marks: Record<string, number | null> = {};
      for (const horizonSeconds of HORIZONS_SECONDS) {
        marks[`${horizonSeconds}s`] = markFutureBid(book, fillAtMs + horizonSeconds * 1000);
      }

      observations.push({
        market,
        sampledAtMs: sample.timestampMs,
        fillAtMs,
        entryPrice: sample.bestBidPrice,
        quantity,
        notionalKrw: args.notionalKrw,
        fillDelaySeconds: round((fillAtMs - sample.timestampMs) / 1000),
        featureSkewSeconds: feature.skewSeconds,
        ret5mBps: feature.snapshot.ret5mBps,
        buyNotionalShare60s: feature.snapshot.buyNotionalShare60s,
        depthRatioL5: feature.snapshot.depthRatioL5,
        spreadBps: feature.snapshot.spreadBps,
        turnover24hKrw: feature.snapshot.turnover24hKrw,
        windowCoverageSeconds: feature.snapshot.windowCoverageSeconds,
        marks,
      });
    }
  }

  return {
    availableRunCount: runFiles.size,
    usedRunCount,
    sampleCount,
    fillCount,
    featureMatchedFillCount: observations.length,
    passiveSnapshotCount,
    observations: observations.sort((left, right) => left.sampledAtMs - right.sampledAtMs),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const candidates = candidateGrid();
  const marketReports = [];

  for (const market of args.markets) {
    const source = await collectObservationsForMarket(args, market);
    const splitIndex = Math.floor(source.observations.length * 0.7);
    const trainObservations = source.observations.slice(0, splitIndex);
    const testObservations = source.observations.slice(splitIndex);
    const evaluated = candidates.map((candidate) => {
      const train = summarize(trainObservations, candidate);
      const test = summarize(testObservations, candidate);
      const walkForward = walkForwardSummary(source.observations, candidate);
      const eligible = promotionEligible(train, test, walkForward);
      return {
        market,
        ...candidate,
        train,
        test,
        walkForward,
        promotionEligible: eligible,
        passesPromotion: eligible,
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
        availableRunCount: source.availableRunCount,
        usedRunCount: source.usedRunCount,
        passiveSnapshotCount: source.passiveSnapshotCount,
        sampleCount: source.sampleCount,
        fillCount: source.fillCount,
        featureMatchedFillCount: source.featureMatchedFillCount,
        fillRate: source.sampleCount > 0 ? round(source.fillCount / source.sampleCount) : null,
        featureMatchRate: source.fillCount > 0 ? round(source.featureMatchedFillCount / source.fillCount) : null,
        fillDelay: summarizeDelay(source.observations),
        from: source.observations[0] ? new Date(source.observations[0].sampledAtMs).toISOString() : null,
        to: source.observations.at(-1)
          ? new Date(source.observations.at(-1)!.sampledAtMs).toISOString()
          : null,
      },
      candidateCount: evaluated.length,
      promotionCandidateCount: promotionCandidates.length,
      promotionCandidates: promotionCandidates.slice(0, 50),
      topByTest,
    });
  }

  const promotionCandidates = marketReports
    .flatMap((report) => report.promotionCandidates)
    .sort((left, right) => right.score - left.score);
  const topByTest = marketReports
    .flatMap((report) => report.topByTest)
    .sort((left, right) => right.test.totalPnlKrw - left.test.totalPnlKrw)
    .slice(0, 20);

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Maker-fill microstructure filter scan. Assumes a maker bid posted at best bid, waits behind displayed best-bid queue, fills only after subsequent sell-initiated trades consume queue plus order size, then exits at future best bid with no maker reward. This is measurement evidence only, not live startup approval.",
    assumptions: {
      markets: args.markets,
      notionalKrw: args.notionalKrw,
      ttlSeconds: args.ttlSeconds,
      sampleIntervalSeconds: args.sampleIntervalSeconds,
      maxFeatureSkewSeconds: args.maxFeatureSkewSeconds,
      makerFeeRate: MAKER_FEE_RATE,
      takerExitFeeRate: TAKER_EXIT_FEE_RATE,
      split: "first 70% feature-matched fills train, last 30% test by sample time per market",
      featureGates: {
        windowCoverageSeconds: `>= ${MIN_WINDOW_COVERAGE_SECONDS}`,
        turnover24hKrw: `>= ${MIN_TURNOVER_24H_KRW}`,
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
    marketCount: marketReports.length,
    candidateCount: marketReports.reduce((sum, report) => sum + report.candidateCount, 0),
    promotionCandidateCount: marketReports.reduce(
      (sum, report) => sum + report.promotionCandidateCount,
      0,
    ),
    promotionCandidates: promotionCandidates.slice(0, 50),
    topByTest,
    markets: marketReports,
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
