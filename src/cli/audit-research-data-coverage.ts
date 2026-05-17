import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  baseDir: string;
  markets: string[];
  datasets: string[];
  maxAgeHours: number;
  minRecords: number;
  nowMs: number;
  outputPath: string | null;
  requireFresh: boolean;
}

interface CoverageSummary {
  dataset: string;
  market: string;
  fileCount: number;
  recordCount: number;
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
  latestAgeHours: number | null;
  fresh: boolean;
  blockers: string[];
}

const DEFAULT_MARKETS = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
const DEFAULT_DATASETS = [
  "candle_1m",
  "trade_tick",
  "orderbook_snapshot",
  "passive_feature_snapshot",
];

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baseDir: resolve(cwd, "var/data"),
    markets: DEFAULT_MARKETS,
    datasets: DEFAULT_DATASETS,
    maxAgeHours: 24,
    minRecords: 1,
    nowMs: Date.now(),
    outputPath: null,
    requireFresh: false,
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
      args.markets = parseList(value, "--markets");
      index += 1;
      continue;
    }
    if (arg === "--datasets") {
      if (!value) throw new Error("--datasets requires a comma-separated value");
      args.datasets = parseList(value, "--datasets");
      index += 1;
      continue;
    }
    if (arg === "--max-age-hours") {
      if (!value) throw new Error("--max-age-hours requires a value");
      args.maxAgeHours = positiveNumber(value, "--max-age-hours");
      index += 1;
      continue;
    }
    if (arg === "--min-records") {
      if (!value) throw new Error("--min-records requires a value");
      args.minRecords = positiveInteger(value, "--min-records");
      index += 1;
      continue;
    }
    if (arg === "--now") {
      if (!value) throw new Error("--now requires an ISO timestamp");
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) throw new Error("--now must be a valid ISO timestamp");
      args.nowMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--require-fresh") {
      args.requireFresh = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return args;
}

function parseList(value: string, label: string): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) throw new Error(`${label} requires at least one value`);
  return items;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function positiveInteger(value: string, label: string): number {
  const parsed = positiveNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
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

async function readNdjson(path: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(path, "utf8");
  return raw
    .split(/\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function pathIncludesMarket(path: string, market: string): boolean {
  return path.includes(`market=${market}/`);
}

function marketMatches(record: Record<string, unknown>, market: string): boolean {
  return record.market === market || record.code === market;
}

function timestampMs(record: Record<string, unknown>): number | null {
  for (const key of ["event_timestamp_ms", "candle_timestamp_ms", "timestamp_ms", "timestamp"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
  }

  for (const key of ["candle_date_time_utc", "ingested_at", "created_at"]) {
    const value = record[key];
    if (typeof value !== "string" || value.trim().length === 0) continue;
    const suffix = key === "candle_date_time_utc" && !value.endsWith("Z") ? "Z" : "";
    const parsed = Date.parse(`${value}${suffix}`);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

async function summarizeCoverage(args: Args, dataset: string, market: string): Promise<CoverageSummary> {
  const root = resolve(args.baseDir, "canonical", dataset);
  const files = (await collectFiles(root)).filter((path) => pathIncludesMarket(path, market));
  let recordCount = 0;
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const file of files) {
    for (const record of await readNdjson(file)) {
      if (!marketMatches(record, market)) continue;
      const ts = timestampMs(record);
      if (ts === null) continue;
      recordCount += 1;
      earliest = earliest === null ? ts : Math.min(earliest, ts);
      latest = latest === null ? ts : Math.max(latest, ts);
    }
  }

  const latestAgeHours = latest === null ? null : (args.nowMs - latest) / 3_600_000;
  const blockers: string[] = [];
  if (files.length === 0) blockers.push("missingFiles");
  if (recordCount < args.minRecords) blockers.push("insufficientRecords");
  if (latestAgeHours === null) blockers.push("missingTimestamp");
  else if (latestAgeHours > args.maxAgeHours) blockers.push("staleLatestTimestamp");

  return {
    dataset,
    market,
    fileCount: files.length,
    recordCount,
    earliestTimestamp: toIso(earliest),
    latestTimestamp: toIso(latest),
    latestAgeHours: latestAgeHours === null ? null : Number(latestAgeHours.toFixed(6)),
    fresh: blockers.length === 0,
    blockers,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const coverage: CoverageSummary[] = [];
  for (const dataset of args.datasets) {
    for (const market of args.markets) {
      coverage.push(await summarizeCoverage(args, dataset, market));
    }
  }

  const blockers = coverage
    .filter((summary) => !summary.fresh)
    .map((summary) => `${summary.market}:${summary.dataset}:${summary.blockers.join("+")}`);
  const fresh = blockers.length === 0;
  const report = {
    generatedAt: new Date(args.nowMs).toISOString(),
    objective:
      "Confirm that local research evidence is fresh enough before promoting any multi-market or microstructure strategy.",
    fresh,
    status: fresh ? "fresh" : "blocked",
    blockers,
    assumptions: {
      baseDir: args.baseDir,
      markets: args.markets,
      datasets: args.datasets,
      maxAgeHours: args.maxAgeHours,
      minRecords: args.minRecords,
    },
    coverage,
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);

  if (args.requireFresh && !fresh) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
