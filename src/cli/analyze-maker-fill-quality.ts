import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

interface Args {
  baseDir: string;
  market: string;
  outputPath: string | null;
  notionalKrw: number;
  ttlSeconds: number;
  sampleIntervalSeconds: number;
  maxRuns: number | null;
}

interface RunFiles {
  orderbook: string[];
  trades: string[];
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

interface FillObservation {
  runId: string;
  sampledAtMs: number;
  fillAtMs: number;
  entryPrice: number;
  quantity: number;
  notionalKrw: number;
  queueAheadBase: number;
  fillDelaySeconds: number;
  marks: Record<string, number | null>;
}

interface OutcomeSummary {
  markedFillCount: number;
  totalPnlNoRewardKrw: number;
  totalPnlWithMakerRewardKrw: number;
  averagePnlNoRewardKrw: number | null;
  averagePnlWithMakerRewardKrw: number | null;
  medianPnlNoRewardKrw: number | null;
  medianPnlWithMakerRewardKrw: number | null;
  winnersNoReward: number;
  losersNoReward: number;
  winnersWithMakerReward: number;
  losersWithMakerReward: number;
}

const HORIZONS_SECONDS = [30, 60, 240] as const;
const MAKER_FEE_RATE = 0.0004;
const TAKER_FEE_RATE = 0.0004;
const MAKER_REWARD_RATE = 0.0005;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baseDir: resolve(cwd, "var/data"),
    market: "KRW-BTC",
    outputPath: null,
    notionalKrw: 500_000,
    ttlSeconds: 60,
    sampleIntervalSeconds: 15,
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

    if (arg === "--market") {
      if (!value) throw new Error("--market requires a value");
      args.market = value;
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
      args.notionalKrw = parsePositiveNumber(value, "--notional-krw");
      index += 1;
      continue;
    }

    if (arg === "--ttl-seconds") {
      if (!value) throw new Error("--ttl-seconds requires a value");
      args.ttlSeconds = parsePositiveNumber(value, "--ttl-seconds");
      index += 1;
      continue;
    }

    if (arg === "--sample-interval-seconds") {
      if (!value) throw new Error("--sample-interval-seconds requires a value");
      args.sampleIntervalSeconds = parsePositiveNumber(
        value,
        "--sample-interval-seconds",
      );
      index += 1;
      continue;
    }

    if (arg === "--max-runs") {
      if (!value) throw new Error("--max-runs requires a value");
      args.maxRuns = Math.floor(parsePositiveNumber(value, "--max-runs"));
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument: ${arg}`);
  }

  return args;
}

function parsePositiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive finite number`);
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
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name.endsWith(".ndjson")) {
        paths.push(path);
      }
    }
  }

  await walk(root);
  paths.sort();
  return paths;
}

function runIdFromPath(path: string): string | null {
  const match = /^part-(.+)\.ndjson$/u.exec(basename(path));
  return match?.[1] ?? null;
}

async function collectRunFiles(baseDir: string, market: string): Promise<Map<string, RunFiles>> {
  const canonicalRoot = resolve(baseDir, "canonical");
  const [orderbookFiles, tradeFiles] = await Promise.all([
    collectFiles(resolve(canonicalRoot, "orderbook_level")),
    collectFiles(resolve(canonicalRoot, "trade_tick")),
  ]);
  const runs = new Map<string, RunFiles>();

  function add(path: string, key: keyof RunFiles): void {
    if (!path.includes(`market=${market}/`)) {
      return;
    }
    const runId = runIdFromPath(path);
    if (!runId) {
      return;
    }
    const entry = runs.get(runId) ?? { orderbook: [], trades: [] };
    entry[key].push(path);
    runs.set(runId, entry);
  }

  for (const path of orderbookFiles) add(path, "orderbook");
  for (const path of tradeFiles) add(path, "trades");

  return runs;
}

async function readNdjson(path: string): Promise<Record<string, unknown>[]> {
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function loadBook(files: string[]): Promise<BookPoint[]> {
  const byTimestamp = new Map<number, BookPoint>();
  for (const file of files) {
    for (const record of await readNdjson(file)) {
      if (finiteNumber(record.level_index) !== 0) {
        continue;
      }
      const timestampMs = finiteNumber(record.event_timestamp_ms);
      const bestBidPrice = finiteNumber(record.bid_price);
      const bestAskPrice = finiteNumber(record.ask_price);
      const bestBidSize = finiteNumber(record.bid_size);
      if (timestampMs <= 0 || bestBidPrice <= 0 || bestAskPrice <= 0) {
        continue;
      }
      byTimestamp.set(timestampMs, {
        timestampMs,
        bestBidPrice,
        bestAskPrice,
        bestBidSize,
      });
    }
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

async function loadTrades(files: string[]): Promise<TradeTick[]> {
  const trades: TradeTick[] = [];
  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const timestampMs = finiteNumber(
        record.trade_timestamp_ms ?? record.event_timestamp_ms,
      );
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

function lowerBoundByTimestamp<T extends { timestampMs: number }>(
  values: T[],
  timestampMs: number,
): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((values[mid]?.timestampMs ?? 0) < timestampMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
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
    if (!trade || trade.timestampMs > expiresAt) {
      break;
    }
    if (trade.side === "ASK" && trade.price <= sample.bestBidPrice) {
      cumulativeSellVolume += trade.volume;
      if (cumulativeSellVolume >= queueThreshold) {
        return trade.timestampMs;
      }
    }
  }

  return null;
}

function markFutureBid(book: BookPoint[], timestampMs: number): number | null {
  const index = lowerBoundByTimestamp(book, timestampMs);
  return book[index]?.bestBidPrice ?? null;
}

function analyzeRun(
  runId: string,
  book: BookPoint[],
  trades: TradeTick[],
  args: Args,
): { sampleCount: number; observations: FillObservation[] } {
  let sampleCount = 0;
  let nextSampleAt = -Infinity;
  const observations: FillObservation[] = [];
  const ttlMs = args.ttlSeconds * 1000;
  const sampleIntervalMs = args.sampleIntervalSeconds * 1000;

  for (const sample of book) {
    if (sample.timestampMs < nextSampleAt) {
      continue;
    }
    nextSampleAt = sample.timestampMs + sampleIntervalMs;
    if (sample.bestBidPrice <= 0 || sample.bestAskPrice <= sample.bestBidPrice) {
      continue;
    }
    sampleCount += 1;
    const quantity = args.notionalKrw / sample.bestBidPrice;
    const fillAtMs = findMakerBuyFill(sample, trades, quantity, ttlMs);
    if (fillAtMs === null) {
      continue;
    }
    const marks: Record<string, number | null> = {};
    for (const horizonSeconds of HORIZONS_SECONDS) {
      marks[`${horizonSeconds}s`] = markFutureBid(
        book,
        fillAtMs + horizonSeconds * 1000,
      );
    }
    observations.push({
      runId,
      sampledAtMs: sample.timestampMs,
      fillAtMs,
      entryPrice: sample.bestBidPrice,
      quantity,
      notionalKrw: args.notionalKrw,
      queueAheadBase: sample.bestBidSize,
      fillDelaySeconds: (fillAtMs - sample.timestampMs) / 1000,
      marks,
    });
  }

  return { sampleCount, observations };
}

function pnlForMark(
  observation: FillObservation,
  exitBidPrice: number,
  includeMakerReward: boolean,
): number {
  const exitProceeds = observation.quantity * exitBidPrice * (1 - TAKER_FEE_RATE);
  const entryCost =
    observation.notionalKrw *
    (1 + MAKER_FEE_RATE - (includeMakerReward ? MAKER_REWARD_RATE : 0));
  return exitProceeds - entryCost;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function summarizeOutcome(
  observations: FillObservation[],
  horizonLabel: string,
): OutcomeSummary {
  const noReward: number[] = [];
  const withReward: number[] = [];

  for (const observation of observations) {
    const mark = observation.marks[horizonLabel];
    if (mark === null || mark === undefined || mark <= 0) {
      continue;
    }
    noReward.push(pnlForMark(observation, mark, false));
    withReward.push(pnlForMark(observation, mark, true));
  }

  const totalNoReward = noReward.reduce((sum, value) => sum + value, 0);
  const totalWithReward = withReward.reduce((sum, value) => sum + value, 0);

  return {
    markedFillCount: noReward.length,
    totalPnlNoRewardKrw: round(totalNoReward),
    totalPnlWithMakerRewardKrw: round(totalWithReward),
    averagePnlNoRewardKrw:
      noReward.length > 0 ? round(totalNoReward / noReward.length) : null,
    averagePnlWithMakerRewardKrw:
      withReward.length > 0 ? round(totalWithReward / withReward.length) : null,
    medianPnlNoRewardKrw: roundNullable(median(noReward)),
    medianPnlWithMakerRewardKrw: roundNullable(median(withReward)),
    winnersNoReward: noReward.filter((value) => value > 0).length,
    losersNoReward: noReward.filter((value) => value < 0).length,
    winnersWithMakerReward: withReward.filter((value) => value > 0).length,
    losersWithMakerReward: withReward.filter((value) => value < 0).length,
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round(value);
}

function summarizeFillDelay(observations: FillObservation[]) {
  const delays = observations.map((observation) => observation.fillDelaySeconds);
  return {
    averageSeconds:
      delays.length > 0
        ? round(delays.reduce((sum, value) => sum + value, 0) / delays.length)
        : null,
    medianSeconds: roundNullable(median(delays)),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const runFiles = await collectRunFiles(args.baseDir, args.market);
  const runIds = [...runFiles.keys()]
    .filter((runId) => {
      const files = runFiles.get(runId);
      return (files?.orderbook.length ?? 0) > 0 && (files?.trades.length ?? 0) > 0;
    })
    .sort()
    .slice(0, args.maxRuns ?? undefined);

  let sampleCount = 0;
  const observations: FillObservation[] = [];
  let usedRunCount = 0;

  for (const runId of runIds) {
    const files = runFiles.get(runId);
    if (!files) {
      continue;
    }
    const [book, trades] = await Promise.all([
      loadBook(files.orderbook),
      loadTrades(files.trades),
    ]);
    if (book.length === 0 || trades.length === 0) {
      continue;
    }
    const result = analyzeRun(runId, book, trades, args);
    sampleCount += result.sampleCount;
    observations.push(...result.observations);
    usedRunCount += 1;
  }

  const horizons = Object.fromEntries(
    HORIZONS_SECONDS.map((seconds) => [
      `${seconds}s`,
      summarizeOutcome(observations, `${seconds}s`),
    ]),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Conservative maker-buy fill quality audit. Assumes a maker bid posted at best bid, waits behind displayed best-bid queue, fills only after subsequent sell-initiated trades consume queue plus order size, then marks exit at future best bid. NoReward is the live-fee baseline; WithMakerReward is a sensitivity case only, not a default live assumption.",
    assumptions: {
      market: args.market,
      notionalKrw: args.notionalKrw,
      ttlSeconds: args.ttlSeconds,
      sampleIntervalSeconds: args.sampleIntervalSeconds,
      makerFeeRate: MAKER_FEE_RATE,
      takerExitFeeRate: TAKER_FEE_RATE,
      makerRewardRate: MAKER_REWARD_RATE,
    },
    source: {
      baseDir: args.baseDir,
      availableRunCount: runFiles.size,
      usedRunCount,
      sampleCount,
      fillCount: observations.length,
      fillRate: sampleCount > 0 ? round(observations.length / sampleCount) : null,
      fillDelay: summarizeFillDelay(observations),
    },
    horizons,
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
