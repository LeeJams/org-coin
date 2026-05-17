import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  baseDir: string;
  market: string;
  outputPath: string | null;
  runIds: Set<string> | null;
  expectedMedianEdgeBps: number;
  maxLiveSpreadBps: number;
  minCoverageSeconds: number;
  minDepthRatioL5: number;
  minTurnover24hKrw: number;
  minSnapshots: number;
}

interface PassiveSnapshot {
  runId: string;
  timestampMs: number;
  spreadBps: number;
  windowCoverageSeconds: number;
  depthRatioL5: number;
  turnover24hKrw: number;
  tradeCount60s: number;
  notional60s: number;
  ret5mBps: number;
}

interface NumericSummary {
  count: number;
  min: number | null;
  p05: number | null;
  median: number | null;
  p95: number | null;
  max: number | null;
  mean: number | null;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baseDir: resolve(cwd, "var/data"),
    market: "KRW-THQ",
    outputPath: null,
    runIds: null,
    expectedMedianEdgeBps: 52.006,
    maxLiveSpreadBps: 8,
    minCoverageSeconds: 55,
    minDepthRatioL5: 1.2,
    minTurnover24hKrw: 30_000_000_000,
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

    if (arg === "--run-id") {
      if (!value) throw new Error("--run-id requires a value");
      args.runIds ??= new Set<string>();
      args.runIds.add(value);
      index += 1;
      continue;
    }

    if (arg === "--expected-median-edge-bps") {
      if (!value) throw new Error("--expected-median-edge-bps requires a value");
      args.expectedMedianEdgeBps = parsePositiveNumber(
        value,
        "--expected-median-edge-bps",
      );
      index += 1;
      continue;
    }

    if (arg === "--max-live-spread-bps") {
      if (!value) throw new Error("--max-live-spread-bps requires a value");
      args.maxLiveSpreadBps = parsePositiveNumber(value, "--max-live-spread-bps");
      index += 1;
      continue;
    }

    if (arg === "--min-coverage-seconds") {
      if (!value) throw new Error("--min-coverage-seconds requires a value");
      args.minCoverageSeconds = parsePositiveNumber(
        value,
        "--min-coverage-seconds",
      );
      index += 1;
      continue;
    }

    if (arg === "--min-depth-ratio-l5") {
      if (!value) throw new Error("--min-depth-ratio-l5 requires a value");
      args.minDepthRatioL5 = parsePositiveNumber(value, "--min-depth-ratio-l5");
      index += 1;
      continue;
    }

    if (arg === "--min-turnover-24h-krw") {
      if (!value) throw new Error("--min-turnover-24h-krw requires a value");
      args.minTurnover24hKrw = parsePositiveNumber(
        value,
        "--min-turnover-24h-krw",
      );
      index += 1;
      continue;
    }

    if (arg === "--min-snapshots") {
      if (!value) throw new Error("--min-snapshots requires a value");
      args.minSnapshots = Math.floor(parsePositiveNumber(value, "--min-snapshots"));
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

async function readNdjson(path: string): Promise<Record<string, unknown>[]> {
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function loadSnapshots(args: Args): Promise<PassiveSnapshot[]> {
  const root = resolve(args.baseDir, "canonical", "passive_feature_snapshot");
  const files = (await collectFiles(root)).filter((path) =>
    path.includes(`market=${args.market}/`),
  );
  const snapshots: PassiveSnapshot[] = [];

  for (const file of files) {
    for (const record of await readNdjson(file)) {
      const market = stringValue(record.market);
      const runId = stringValue(record.source_run_id);
      if (market !== args.market) {
        continue;
      }
      if (args.runIds && !args.runIds.has(runId)) {
        continue;
      }

      const timestampMs = finiteNumber(record.event_timestamp_ms);
      const spreadBps = finiteNumber(record.spread_bps);
      const windowCoverageSeconds = finiteNumber(record.window_coverage_sec);
      const depthRatioL5 = finiteNumber(record.depth_ratio_l5);
      const turnover24hKrw = finiteNumber(record.turnover_24h_krw);
      if (timestampMs <= 0 || spreadBps <= 0) {
        continue;
      }

      snapshots.push({
        runId,
        timestampMs,
        spreadBps,
        windowCoverageSeconds,
        depthRatioL5,
        turnover24hKrw,
        tradeCount60s: finiteNumber(record.trade_count_60s),
        notional60s: finiteNumber(record.notional_60s),
        ret5mBps: finiteNumber(record.ret_5m_bps),
      });
    }
  }

  snapshots.sort((left, right) => left.timestampMs - right.timestampMs);
  return snapshots;
}

function summarize(values: number[]): NumericSummary {
  const finiteValues = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finiteValues.length === 0) {
    return {
      count: 0,
      min: null,
      p05: null,
      median: null,
      p95: null,
      max: null,
      mean: null,
    };
  }
  const total = finiteValues.reduce((sum, value) => sum + value, 0);
  return {
    count: finiteValues.length,
    min: round(finiteValues[0] ?? 0),
    p05: round(percentile(finiteValues, 0.05)),
    median: round(percentile(finiteValues, 0.5)),
    p95: round(percentile(finiteValues, 0.95)),
    max: round(finiteValues[finiteValues.length - 1] ?? 0),
    mean: round(total / finiteValues.length),
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * percentileValue)),
  );
  return sortedValues[index] ?? 0;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function isoOrNull(timestampMs: number | undefined): string | null {
  return timestampMs === undefined ? null : new Date(timestampMs).toISOString();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const snapshots = await loadSnapshots(args);
  const runIds = [...new Set(snapshots.map((snapshot) => snapshot.runId))].sort();

  const edgeCompatible = snapshots.filter(
    (snapshot) => snapshot.spreadBps <= args.expectedMedianEdgeBps,
  );
  const liveSpreadCompatible = snapshots.filter(
    (snapshot) => snapshot.spreadBps <= args.maxLiveSpreadBps,
  );
  const executionEnvironmentPass = snapshots.filter(
    (snapshot) =>
      snapshot.spreadBps <= args.expectedMedianEdgeBps &&
      snapshot.windowCoverageSeconds >= args.minCoverageSeconds &&
      snapshot.depthRatioL5 >= args.minDepthRatioL5 &&
      snapshot.turnover24hKrw >= args.minTurnover24hKrw,
  );

  const enoughSnapshots = snapshots.length >= args.minSnapshots;
  const paperObservationCandidate =
    enoughSnapshots && executionEnvironmentPass.length > 0;
  const liveCandidate =
    paperObservationCandidate && liveSpreadCompatible.length > 0;
  const reasons: string[] = [];
  if (!enoughSnapshots) {
    reasons.push("insufficient_observation_sample");
  }
  if (edgeCompatible.length === 0) {
    reasons.push("spread_never_below_expected_median_edge");
  }
  if (liveSpreadCompatible.length === 0) {
    reasons.push("spread_never_below_live_gate");
  }
  if (executionEnvironmentPass.length === 0) {
    reasons.push("no_snapshot_passed_execution_environment_gates");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Execution-environment audit for a reversal candidate. This checks observed passive features against expected edge and operational gates; it does not infer profitability from reduced trading activity.",
    source: {
      baseDir: args.baseDir,
      market: args.market,
      runIds,
      snapshotCount: snapshots.length,
      firstSnapshotAt: isoOrNull(snapshots[0]?.timestampMs),
      lastSnapshotAt: isoOrNull(snapshots[snapshots.length - 1]?.timestampMs),
    },
    thresholds: {
      expectedMedianEdgeBps: args.expectedMedianEdgeBps,
      maxLiveSpreadBps: args.maxLiveSpreadBps,
      minCoverageSeconds: args.minCoverageSeconds,
      minDepthRatioL5: args.minDepthRatioL5,
      minTurnover24hKrw: args.minTurnover24hKrw,
      minSnapshots: args.minSnapshots,
    },
    metrics: {
      spreadBps: summarize(snapshots.map((snapshot) => snapshot.spreadBps)),
      windowCoverageSeconds: summarize(
        snapshots.map((snapshot) => snapshot.windowCoverageSeconds),
      ),
      depthRatioL5: summarize(snapshots.map((snapshot) => snapshot.depthRatioL5)),
      turnover24hKrw: summarize(
        snapshots.map((snapshot) => snapshot.turnover24hKrw),
      ),
      tradeCount60s: summarize(snapshots.map((snapshot) => snapshot.tradeCount60s)),
      notional60s: summarize(snapshots.map((snapshot) => snapshot.notional60s)),
      ret5mBps: summarize(snapshots.map((snapshot) => snapshot.ret5mBps)),
    },
    compatibility: {
      edgeCompatibleSpreadCount: edgeCompatible.length,
      edgeCompatibleSpreadRate:
        snapshots.length > 0 ? round(edgeCompatible.length / snapshots.length) : null,
      liveSpreadCompatibleCount: liveSpreadCompatible.length,
      liveSpreadCompatibleRate:
        snapshots.length > 0
          ? round(liveSpreadCompatible.length / snapshots.length)
          : null,
      executionEnvironmentPassCount: executionEnvironmentPass.length,
      executionEnvironmentPassRate:
        snapshots.length > 0
          ? round(executionEnvironmentPass.length / snapshots.length)
          : null,
    },
    decision: {
      paperObservationCandidate,
      liveCandidate,
      reasons,
    },
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
