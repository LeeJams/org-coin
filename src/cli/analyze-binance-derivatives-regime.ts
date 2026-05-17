import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  symbols: string[];
  period: string;
  limit: number;
  inputPath: string | null;
  outputPath: string | null;
  maxFundingBpsForLong: number;
  maxLongShortRatioForLong: number;
  minTakerBuySellRatioForLong: number;
  minOpenInterestChangePctForLong: number;
}

interface FundingRow {
  symbol?: string;
  fundingRate?: string | number;
  fundingTime?: number;
}

interface OpenInterestRow {
  symbol?: string;
  sumOpenInterest?: string | number;
  sumOpenInterestValue?: string | number;
  timestamp?: number;
}

interface LongShortRow {
  symbol?: string;
  longShortRatio?: string | number;
  longAccount?: string | number;
  shortAccount?: string | number;
  timestamp?: number;
}

interface TakerLongShortRow {
  buySellRatio?: string | number;
  buyVol?: string | number;
  sellVol?: string | number;
  timestamp?: number;
}

interface SymbolSnapshot {
  fundingRate?: FundingRow[];
  openInterestHist?: OpenInterestRow[];
  globalLongShortAccountRatio?: LongShortRow[];
  takerLongShortRatio?: TakerLongShortRow[];
}

const BINANCE_FAPI_BASE_URL = "https://fapi.binance.com";
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT"];

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    symbols: DEFAULT_SYMBOLS,
    period: "1h",
    limit: 500,
    inputPath: null,
    outputPath: null,
    maxFundingBpsForLong: 2,
    maxLongShortRatioForLong: 1.35,
    minTakerBuySellRatioForLong: 1,
    minOpenInterestChangePctForLong: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--symbols") {
      if (!value) throw new Error("--symbols requires a comma-separated value");
      args.symbols = value
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => symbol.length > 0);
      if (args.symbols.length === 0) throw new Error("--symbols requires at least one symbol");
      index += 1;
      continue;
    }
    if (arg === "--period") {
      if (!value) throw new Error("--period requires a value");
      args.period = value;
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      if (!value) throw new Error("--limit requires a value");
      args.limit = positiveInteger(value, "--limit");
      index += 1;
      continue;
    }
    if (arg === "--input") {
      if (!value) throw new Error("--input requires a value");
      args.inputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--max-funding-bps-for-long") {
      if (!value) throw new Error("--max-funding-bps-for-long requires a value");
      args.maxFundingBpsForLong = finiteNumber(value, "--max-funding-bps-for-long");
      index += 1;
      continue;
    }
    if (arg === "--max-long-short-ratio-for-long") {
      if (!value) throw new Error("--max-long-short-ratio-for-long requires a value");
      args.maxLongShortRatioForLong = positiveNumber(value, "--max-long-short-ratio-for-long");
      index += 1;
      continue;
    }
    if (arg === "--min-taker-buy-sell-ratio-for-long") {
      if (!value) throw new Error("--min-taker-buy-sell-ratio-for-long requires a value");
      args.minTakerBuySellRatioForLong = positiveNumber(value, "--min-taker-buy-sell-ratio-for-long");
      index += 1;
      continue;
    }
    if (arg === "--min-open-interest-change-pct-for-long") {
      if (!value) throw new Error("--min-open-interest-change-pct-for-long requires a value");
      args.minOpenInterestChangePctForLong = finiteNumber(value, "--min-open-interest-change-pct-for-long");
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return args;
}

function finiteNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function positiveNumber(value: string, label: string): number {
  const parsed = finiteNumber(value, label);
  if (parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function positiveInteger(value: string, label: string): number {
  const parsed = positiveNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function latestByTimestamp<T extends { timestamp?: number; fundingTime?: number }>(rows: T[]): T | null {
  return rows
    .filter((row) => Number.isFinite(row.timestamp ?? row.fundingTime))
    .sort((left, right) => (right.timestamp ?? right.fundingTime ?? 0) - (left.timestamp ?? left.fundingTime ?? 0))[0] ?? null;
}

function firstByTimestamp<T extends { timestamp?: number; fundingTime?: number }>(rows: T[]): T | null {
  return rows
    .filter((row) => Number.isFinite(row.timestamp ?? row.fundingTime))
    .sort((left, right) => (left.timestamp ?? left.fundingTime ?? 0) - (right.timestamp ?? right.fundingTime ?? 0))[0] ?? null;
}

async function fetchJson(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BINANCE_FAPI_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`binance ${path} failed (${response.status})`);
  }
  return response.json();
}

async function fetchSymbolSnapshot(symbol: string, args: Args): Promise<SymbolSnapshot> {
  const [fundingRate, openInterestHist, globalLongShortAccountRatio, takerLongShortRatio] =
    await Promise.all([
      fetchJson("/fapi/v1/fundingRate", { symbol, limit: String(Math.min(args.limit, 1000)) }),
      fetchJson("/futures/data/openInterestHist", { symbol, period: args.period, limit: String(args.limit) }),
      fetchJson("/futures/data/globalLongShortAccountRatio", { symbol, period: args.period, limit: String(args.limit) }),
      fetchJson("/futures/data/takerlongshortRatio", { symbol, period: args.period, limit: String(args.limit) }),
    ]);
  return {
    fundingRate: Array.isArray(fundingRate) ? fundingRate as FundingRow[] : [],
    openInterestHist: Array.isArray(openInterestHist) ? openInterestHist as OpenInterestRow[] : [],
    globalLongShortAccountRatio: Array.isArray(globalLongShortAccountRatio) ? globalLongShortAccountRatio as LongShortRow[] : [],
    takerLongShortRatio: Array.isArray(takerLongShortRatio) ? takerLongShortRatio as TakerLongShortRow[] : [],
  };
}

async function loadSnapshots(args: Args): Promise<Record<string, SymbolSnapshot>> {
  if (args.inputPath !== null) {
    const parsed = JSON.parse(await readFile(args.inputPath, "utf8")) as Record<string, unknown>;
    if (parsed.symbols !== undefined && typeof parsed.symbols === "object" && parsed.symbols !== null) {
      return parsed.symbols as Record<string, SymbolSnapshot>;
    }
    return parsed as Record<string, SymbolSnapshot>;
  }

  const entries = await Promise.all(
    args.symbols.map(async (symbol) => [symbol, await fetchSymbolSnapshot(symbol, args)] as const),
  );
  return Object.fromEntries(entries);
}

function summarizeSymbol(symbol: string, snapshot: SymbolSnapshot, args: Args) {
  const latestFunding = latestByTimestamp(snapshot.fundingRate ?? []);
  const latestOpenInterest = latestByTimestamp(snapshot.openInterestHist ?? []);
  const firstOpenInterest = firstByTimestamp(snapshot.openInterestHist ?? []);
  const latestLongShort = latestByTimestamp(snapshot.globalLongShortAccountRatio ?? []);
  const latestTaker = latestByTimestamp(snapshot.takerLongShortRatio ?? []);

  const latestFundingBps = round((numberValue(latestFunding?.fundingRate) ?? 0) * 10_000);
  const latestOpenInterestValue = numberValue(latestOpenInterest?.sumOpenInterestValue);
  const firstOpenInterestValue = numberValue(firstOpenInterest?.sumOpenInterestValue);
  const openInterestChangePct =
    latestOpenInterestValue !== null &&
    firstOpenInterestValue !== null &&
    firstOpenInterestValue > 0
      ? round((latestOpenInterestValue / firstOpenInterestValue - 1) * 100)
      : null;
  const latestLongShortRatio = round(numberValue(latestLongShort?.longShortRatio));
  const latestTakerBuySellRatio = round(numberValue(latestTaker?.buySellRatio));

  const checks = {
    fundingNotOverheatedForLong:
      latestFundingBps !== null && latestFundingBps <= args.maxFundingBpsForLong,
    crowdingNotOverheatedForLong:
      latestLongShortRatio !== null && latestLongShortRatio <= args.maxLongShortRatioForLong,
    takerFlowSupportsLong:
      latestTakerBuySellRatio !== null && latestTakerBuySellRatio >= args.minTakerBuySellRatioForLong,
    openInterestExpanding:
      openInterestChangePct !== null && openInterestChangePct >= args.minOpenInterestChangePctForLong,
  };
  const favorableForLongSpotFilter = Object.values(checks).every(Boolean);

  return {
    symbol,
    sampleCounts: {
      fundingRate: snapshot.fundingRate?.length ?? 0,
      openInterestHist: snapshot.openInterestHist?.length ?? 0,
      globalLongShortAccountRatio: snapshot.globalLongShortAccountRatio?.length ?? 0,
      takerLongShortRatio: snapshot.takerLongShortRatio?.length ?? 0,
    },
    latest: {
      fundingTime: latestFunding?.fundingTime === undefined ? null : new Date(latestFunding.fundingTime).toISOString(),
      fundingBps: latestFundingBps,
      openInterestTimestamp:
        latestOpenInterest?.timestamp === undefined ? null : new Date(latestOpenInterest.timestamp).toISOString(),
      openInterestValue: round(latestOpenInterestValue),
      openInterestChangePct,
      globalLongShortTimestamp:
        latestLongShort?.timestamp === undefined ? null : new Date(latestLongShort.timestamp).toISOString(),
      globalLongShortRatio: latestLongShortRatio,
      takerTimestamp:
        latestTaker?.timestamp === undefined ? null : new Date(latestTaker.timestamp).toISOString(),
      takerBuySellRatio: latestTakerBuySellRatio,
      takerBuyVol: round(numberValue(latestTaker?.buyVol)),
      takerSellVol: round(numberValue(latestTaker?.sellVol)),
    },
    checks,
    favorableForLongSpotFilter,
    interpretation: favorableForLongSpotFilter
      ? "Derivative regime does not block a long-only Bithumb spot entry under the configured diagnostic thresholds."
      : "Derivative regime blocks long-only Bithumb spot entry under the configured diagnostic thresholds.",
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const snapshots = await loadSnapshots(args);
  const symbols = args.symbols.filter((symbol) => snapshots[symbol] !== undefined);
  const summaries = symbols.map((symbol) => summarizeSymbol(symbol, snapshots[symbol]!, args));
  const report = {
    generatedAt: new Date().toISOString(),
    source: args.inputPath === null ? "binance_public_rest" : "input_snapshot",
    sourceLinks: {
      fundingRate: "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History",
      openInterestHist: "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics",
      globalLongShortAccountRatio: "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Long-Short-Ratio",
      takerLongShortRatio: "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Taker-BuySell-Volume",
    },
    assumptions: {
      symbols: args.symbols,
      period: args.period,
      limit: args.limit,
      thresholds: {
        maxFundingBpsForLong: args.maxFundingBpsForLong,
        maxLongShortRatioForLong: args.maxLongShortRatioForLong,
        minTakerBuySellRatioForLong: args.minTakerBuySellRatioForLong,
        minOpenInterestChangePctForLong: args.minOpenInterestChangePctForLong,
      },
      liveExecutionScope:
        "Use only as an external state filter for Bithumb spot candidates; this report is not live-trading evidence.",
    },
    favorableSymbolCount: summaries.filter((summary) => summary.favorableForLongSpotFilter).length,
    blockedSymbolCount: summaries.filter((summary) => !summary.favorableForLongSpotFilter).length,
    symbols: summaries,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
