import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  scanPaths: string[];
  orderbookRoot: string;
  outputPath: string | null;
  maxSkewMs: number;
  minRoundTripCoverageRate: number;
  minCoveredRoundTrips: number;
}

interface Trade {
  entryAt?: number;
  exitAt?: number;
  pnlKrw?: number;
}

interface Candidate {
  sourcePath: string;
  sourceBucket: "promotionCandidates" | "topByTest";
  sourceIndex: number;
  market: string;
  lookbackBars?: number;
  holdBars?: number;
  minReturnBps?: number;
  riskFilter?: string;
  train?: unknown;
  test?: unknown;
  walkForward?: unknown;
  tradeAudit?: {
    train?: { count?: number; trades?: Trade[] };
    test?: { count?: number; trades?: Trade[] };
  };
}

interface SnapshotMatch {
  requestedAt: number;
  matchedAt: number | null;
  skewMs: number | null;
  covered: boolean;
}

interface CoverageSummary {
  declaredTradeCount: number;
  auditedTradeCount: number;
  entryCoveredCount: number;
  exitCoveredCount: number;
  roundTripCoveredCount: number;
  entryCoverageRate: number | null;
  exitCoverageRate: number | null;
  roundTripCoverageRate: number | null;
}

const DEFAULT_ORDERBOOK_ROOT = "var/data/canonical/orderbook_snapshot";

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    scanPaths: [],
    orderbookRoot: resolve(cwd, DEFAULT_ORDERBOOK_ROOT),
    outputPath: null,
    maxSkewMs: 5 * 60 * 1000,
    minRoundTripCoverageRate: 0.8,
    minCoveredRoundTrips: 30,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--scan") {
      if (!value) throw new Error("--scan requires a value");
      args.scanPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--orderbook-root") {
      if (!value) throw new Error("--orderbook-root requires a value");
      args.orderbookRoot = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--max-skew-minutes") {
      if (!value) throw new Error("--max-skew-minutes requires a value");
      args.maxSkewMs = positiveNumber(value, "--max-skew-minutes") * 60 * 1000;
      index += 1;
      continue;
    }
    if (arg === "--min-round-trip-coverage-rate") {
      if (!value) throw new Error("--min-round-trip-coverage-rate requires a value");
      args.minRoundTripCoverageRate = rate(value, "--min-round-trip-coverage-rate");
      index += 1;
      continue;
    }
    if (arg === "--min-covered-round-trips") {
      if (!value) throw new Error("--min-covered-round-trips requires a value");
      args.minCoveredRoundTrips = positiveInteger(value, "--min-covered-round-trips");
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.scanPaths.length === 0) {
    throw new Error("at least one --scan path is required");
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

function rate(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
  return parsed;
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function loadCandidates(scanPath: string): Promise<Candidate[]> {
  const report = await readJson(scanPath);
  const assumptions = asRecord(report.assumptions);
  const fallbackMarket =
    typeof assumptions?.market === "string"
      ? assumptions.market
      : typeof report.market === "string"
        ? report.market
        : null;
  const candidates: Candidate[] = [];

  for (const sourceBucket of ["promotionCandidates", "topByTest"] as const) {
    const rows = asArray(report[sourceBucket]);
    rows.forEach((raw, sourceIndex) => {
      const row = asRecord(raw);
      if (!row) return;
      const market = typeof row.market === "string" ? row.market : fallbackMarket;
      if (!market) return;
      candidates.push({
        sourcePath: scanPath,
        sourceBucket,
        sourceIndex,
        market,
        lookbackBars: typeof row.lookbackBars === "number" ? row.lookbackBars : undefined,
        holdBars: typeof row.holdBars === "number" ? row.holdBars : undefined,
        minReturnBps: typeof row.minReturnBps === "number" ? row.minReturnBps : undefined,
        riskFilter: typeof row.riskFilter === "string" ? row.riskFilter : undefined,
        train: row.train,
        test: row.test,
        walkForward: row.walkForward,
        tradeAudit: asRecord(row.tradeAudit) as Candidate["tradeAudit"],
      });
    });
  }
  return candidates;
}

async function loadOrderbookTimestamps(root: string, market: string): Promise<number[]> {
  const timestamps: number[] = [];
  let dateEntries;
  try {
    dateEntries = await readdir(root, { withFileTypes: true });
  } catch {
    return timestamps;
  }

  for (const dateEntry of dateEntries) {
    if (!dateEntry.isDirectory() || !dateEntry.name.startsWith("date=")) continue;
    const marketDir = `${root}/${dateEntry.name}/market=${market}`;
    let files;
    try {
      files = await readdir(marketDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.isFile()) continue;
      const raw = await readFile(`${marketDir}/${file.name}`, "utf8");
      for (const line of raw.split(/\n/u)) {
        if (line.trim().length === 0) continue;
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const timestamp = finiteTimestamp(parsed.event_timestamp_ms);
        if (timestamp !== null) {
          timestamps.push(timestamp);
        }
      }
    }
  }

  return [...new Set(timestamps)].sort((left, right) => left - right);
}

function nearestTimestamp(timestamps: number[], target: number, maxSkewMs: number): SnapshotMatch {
  if (timestamps.length === 0) {
    return { requestedAt: target, matchedAt: null, skewMs: null, covered: false };
  }

  let low = 0;
  let high = timestamps.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((timestamps[mid] ?? 0) < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const candidates = [timestamps[low - 1], timestamps[low]].filter(
    (value): value is number => typeof value === "number",
  );
  const matchedAt =
    candidates.sort(
      (left, right) => Math.abs(left - target) - Math.abs(right - target),
    )[0] ?? null;
  const skewMs = matchedAt === null ? null : Math.abs(matchedAt - target);
  return {
    requestedAt: target,
    matchedAt,
    skewMs,
    covered: skewMs !== null && skewMs <= maxSkewMs,
  };
}

function summarizeCoverage(
  declaredTradeCount: number,
  trades: Trade[],
  timestamps: number[],
  maxSkewMs: number,
): CoverageSummary {
  let entryCoveredCount = 0;
  let exitCoveredCount = 0;
  let roundTripCoveredCount = 0;

  for (const trade of trades) {
    const entryAt = finiteTimestamp(trade.entryAt);
    const exitAt = finiteTimestamp(trade.exitAt);
    const entry = entryAt === null ? null : nearestTimestamp(timestamps, entryAt, maxSkewMs);
    const exit = exitAt === null ? null : nearestTimestamp(timestamps, exitAt, maxSkewMs);
    if (entry?.covered) entryCoveredCount += 1;
    if (exit?.covered) exitCoveredCount += 1;
    if (entry?.covered && exit?.covered) roundTripCoveredCount += 1;
  }

  return {
    declaredTradeCount,
    auditedTradeCount: trades.length,
    entryCoveredCount,
    exitCoveredCount,
    roundTripCoveredCount,
    entryCoverageRate: trades.length > 0 ? round(entryCoveredCount / trades.length) : null,
    exitCoverageRate: trades.length > 0 ? round(exitCoveredCount / trades.length) : null,
    roundTripCoverageRate: trades.length > 0 ? round(roundTripCoveredCount / trades.length) : null,
  };
}

function candidateReasons(
  candidate: Candidate,
  train: CoverageSummary,
  test: CoverageSummary,
  timestamps: number[],
  args: Args,
): string[] {
  const reasons: string[] = [];
  if (!candidate.tradeAudit) reasons.push("missing_trade_audit");
  if (timestamps.length === 0) reasons.push("no_orderbook_snapshots_for_market");
  if ((train.roundTripCoverageRate ?? 0) < args.minRoundTripCoverageRate) {
    reasons.push("train_round_trip_coverage_below_threshold");
  }
  if ((test.roundTripCoverageRate ?? 0) < args.minRoundTripCoverageRate) {
    reasons.push("test_round_trip_coverage_below_threshold");
  }
  if (train.roundTripCoveredCount + test.roundTripCoveredCount < args.minCoveredRoundTrips) {
    reasons.push("covered_round_trips_below_minimum");
  }
  return reasons;
}

function compactSummary(value: unknown): unknown {
  const summary = asRecord(value);
  if (!summary) return null;
  return {
    count: summary.count ?? null,
    totalPnlKrw: summary.totalPnlKrw ?? null,
    medianPnlKrw: summary.medianPnlKrw ?? null,
    returnPct: summary.returnPct ?? null,
  };
}

function compactWalkForward(value: unknown): unknown {
  const walkForward = asRecord(value);
  if (!walkForward) return null;
  return {
    foldCount: walkForward.foldCount ?? null,
    positiveTotalFoldCount: walkForward.positiveTotalFoldCount ?? null,
    positiveMedianFoldCount: walkForward.positiveMedianFoldCount ?? null,
    totalPnlKrw: walkForward.totalPnlKrw ?? null,
    minFoldPnlKrw: walkForward.minFoldPnlKrw ?? null,
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const candidates = (await Promise.all(args.scanPaths.map(loadCandidates))).flat();
  const marketTimestamps = new Map<string, number[]>();

  for (const market of new Set(candidates.map((candidate) => candidate.market))) {
    marketTimestamps.set(market, await loadOrderbookTimestamps(args.orderbookRoot, market));
  }

  const candidateReports = candidates.map((candidate) => {
    const timestamps = marketTimestamps.get(candidate.market) ?? [];
    const trainTrades = candidate.tradeAudit?.train?.trades ?? [];
    const testTrades = candidate.tradeAudit?.test?.trades ?? [];
    const train = summarizeCoverage(
      candidate.tradeAudit?.train?.count ?? 0,
      trainTrades,
      timestamps,
      args.maxSkewMs,
    );
    const test = summarizeCoverage(
      candidate.tradeAudit?.test?.count ?? 0,
      testTrades,
      timestamps,
      args.maxSkewMs,
    );
    const reasons = candidateReasons(candidate, train, test, timestamps, args);
    return {
      sourcePath: candidate.sourcePath,
      sourceBucket: candidate.sourceBucket,
      sourceIndex: candidate.sourceIndex,
      market: candidate.market,
      parameters: {
        lookbackBars: candidate.lookbackBars ?? null,
        holdBars: candidate.holdBars ?? null,
        minReturnBps: candidate.minReturnBps ?? null,
        riskFilter: candidate.riskFilter ?? null,
      },
      profitability: {
        train: compactSummary(candidate.train),
        test: compactSummary(candidate.test),
        walkForward: compactWalkForward(candidate.walkForward),
      },
      orderbookSnapshotCount: timestamps.length,
      coverage: { train, test },
      coverageReady: reasons.length === 0,
      reasons,
    };
  });

  const coverageReadyCandidates = candidateReports.filter((candidate) => candidate.coverageReady);
  const report = {
    generatedAt: new Date().toISOString(),
    objective:
      "Audit whether candle-scan signal timestamps have local orderbook evidence before any live execution overlay or promotion.",
    status: coverageReadyCandidates.length > 0 ? "coverage_ready" : "blocked",
    coverageReadyCandidateCount: coverageReadyCandidates.length,
    candidateCount: candidateReports.length,
    assumptions: {
      scanPaths: args.scanPaths,
      orderbookRoot: args.orderbookRoot,
      maxSkewMs: args.maxSkewMs,
      minRoundTripCoverageRate: args.minRoundTripCoverageRate,
      minCoveredRoundTrips: args.minCoveredRoundTrips,
      interpretation:
        "Coverage readiness only means signal timestamps can be checked against local orderbook snapshots; it is not profitability or live readiness.",
    },
    candidates: candidateReports,
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
