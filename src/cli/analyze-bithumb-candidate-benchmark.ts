import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  market: string;
  signalMode: "momentum" | "reversal";
  unitMinutes: number;
  maxCandles: number;
  inputCandlesPath: string | null;
  outputPath: string | null;
  lookbackBars: number;
  holdBars: number;
  minReturnBps: number;
  riskFilter: "none" | "rv24_below_median" | "rv24_below_p70" | "range24_below_p70";
  riskThreshold: number | null;
  notionalKrw: number;
  feeRoundTripRate: number;
  exitPolicy: "fixed_hold" | "profit_protect";
  profitProtectMinPeakPnlKrw: number;
  profitProtectMinDrawdownKrw: number;
  profitProtectDrawdownBps: number;
}

interface Candle {
  timestampMs: number;
  close: number;
  high: number;
  low: number;
}

interface TradeMark {
  entryAt: number;
  exitAt: number;
  netReturn: number;
  pnlKrw: number;
  heldBars: number;
  exitReason: "fixed_hold" | "profit_protect";
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

const REST_BASE_URL = "https://api.bithumb.com/v1";
const WALK_FORWARD_FOLDS = 5;
const MIN_PROMOTION_TRAIN_TRADES = 30;
const MIN_PROMOTION_TEST_TRADES = 15;
const MIN_PROMOTION_TOTAL_TRADES = 60;
const MIN_POSITIVE_WALK_FORWARD_FOLDS = 4;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    market: "KRW-BTC",
    signalMode: "momentum",
    unitMinutes: 240,
    maxCandles: 5_000,
    inputCandlesPath: null,
    outputPath: null,
    lookbackBars: 24,
    holdBars: 24,
    minReturnBps: 25,
    riskFilter: "rv24_below_p70",
    riskThreshold: null,
    notionalKrw: 500_000,
    feeRoundTripRate: 0.002,
    exitPolicy: "fixed_hold",
    profitProtectMinPeakPnlKrw: 750,
    profitProtectMinDrawdownKrw: 500,
    profitProtectDrawdownBps: 0.5,
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
    if (arg === "--lookback-bars") {
      if (!value) throw new Error("--lookback-bars requires a value");
      args.lookbackBars = positiveInteger(value, "--lookback-bars");
      index += 1;
      continue;
    }
    if (arg === "--hold-bars") {
      if (!value) throw new Error("--hold-bars requires a value");
      args.holdBars = positiveInteger(value, "--hold-bars");
      index += 1;
      continue;
    }
    if (arg === "--min-return-bps") {
      if (!value) throw new Error("--min-return-bps requires a value");
      args.minReturnBps = nonNegativeNumber(value, "--min-return-bps");
      index += 1;
      continue;
    }
    if (arg === "--risk-filter") {
      if (
        value !== "none" &&
        value !== "rv24_below_median" &&
        value !== "rv24_below_p70" &&
        value !== "range24_below_p70"
      ) {
        throw new Error("--risk-filter must be none, rv24_below_median, rv24_below_p70, or range24_below_p70");
      }
      args.riskFilter = value;
      index += 1;
      continue;
    }
    if (arg === "--risk-threshold") {
      if (!value) throw new Error("--risk-threshold requires a value");
      args.riskThreshold = positiveNumber(value, "--risk-threshold");
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
    if (arg === "--exit-policy") {
      if (value !== "fixed_hold" && value !== "profit_protect") {
        throw new Error("--exit-policy must be fixed_hold or profit_protect");
      }
      args.exitPolicy = value;
      index += 1;
      continue;
    }
    if (arg === "--profit-protect-min-peak-pnl-krw") {
      if (!value) throw new Error("--profit-protect-min-peak-pnl-krw requires a value");
      args.profitProtectMinPeakPnlKrw = nonNegativeNumber(value, "--profit-protect-min-peak-pnl-krw");
      index += 1;
      continue;
    }
    if (arg === "--profit-protect-min-drawdown-krw") {
      if (!value) throw new Error("--profit-protect-min-drawdown-krw requires a value");
      args.profitProtectMinDrawdownKrw = nonNegativeNumber(value, "--profit-protect-min-drawdown-krw");
      index += 1;
      continue;
    }
    if (arg === "--profit-protect-drawdown-bps") {
      if (!value) throw new Error("--profit-protect-drawdown-bps requires a value");
      args.profitProtectDrawdownBps = nonNegativeNumber(value, "--profit-protect-drawdown-bps");
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

function nonNegativeNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
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

function normalizeCandle(record: Record<string, unknown>): Candle {
  return {
    timestampMs: candleTimestampMs(record),
    close: finiteNumber(record.trade_price ?? record.close_price),
    high: finiteNumber(record.high_price),
    low: finiteNumber(record.low_price),
  };
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

async function fetchCandles(args: Args): Promise<Candle[]> {
  if (args.inputCandlesPath) {
    return loadInputCandles(args.inputCandlesPath);
  }
  const candles = new Map<number, Candle>();
  let to: string | undefined;
  while (candles.size < args.maxCandles) {
    const url = new URL(`${REST_BASE_URL}/candles/minutes/${args.unitMinutes}`);
    url.searchParams.set("market", args.market);
    url.searchParams.set("count", String(Math.min(200, args.maxCandles - candles.size)));
    if (to) url.searchParams.set("to", to);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`bithumb candle request failed (${response.status})`);
    const payload = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(payload) || payload.length === 0) break;
    const normalized = payload.map(normalizeCandle);
    for (const candle of normalized) {
      if (candle.timestampMs > 0 && candle.close > 0) candles.set(candle.timestampMs, candle);
    }
    const oldest = normalized
      .filter((candle) => candle.timestampMs > 0)
      .sort((left, right) => left.timestampMs - right.timestampMs)[0];
    if (!oldest) break;
    to = toBithumbKst(oldest.timestampMs - 1);
    await sleep(80);
  }
  return dedupeAndSort([...candles.values()]);
}

function dedupeAndSort(candles: Candle[]): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const candle of candles) {
    if (candle.timestampMs > 0 && candle.close > 0) byTimestamp.set(candle.timestampMs, candle);
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestampMs - right.timestampMs);
}

function toBithumbKst(timestampMs: number): string {
  const date = new Date(timestampMs + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00`;
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function riskValue(candles: Candle[], index: number, filter: Args["riskFilter"]): number | null {
  if (filter === "none") return null;
  if (index < 24) return null;
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

function passesSignal(candles: Candle[], index: number, args: Args): boolean {
  const previous = candles[index - args.lookbackBars];
  const current = candles[index];
  if (!previous || !current) return false;
  const signalReturnBps = bps(current.close, previous.close);
  if (args.signalMode === "momentum" && signalReturnBps < args.minReturnBps) return false;
  if (args.signalMode === "reversal" && signalReturnBps > -args.minReturnBps) return false;
  if (args.riskFilter !== "none") {
    const value = riskValue(candles, index, args.riskFilter);
    if (value === null || args.riskThreshold === null || value > args.riskThreshold) {
      return false;
    }
  }
  return true;
}

function simulate(candles: Candle[], args: Args, startIndex = 0, endIndex = candles.length - 1): TradeMark[] {
  const trades: TradeMark[] = [];
  let nextEntryIndex = startIndex;
  const firstIndex = Math.max(startIndex, args.lookbackBars, 24);
  const lastEntryIndex = Math.min(endIndex, candles.length - args.holdBars - 1);
  for (let index = firstIndex; index <= lastEntryIndex; index += 1) {
    if (index < nextEntryIndex || !passesSignal(candles, index, args)) continue;
    const entry = candles[index];
    let exitIndex = index + args.holdBars;
    let exitReason: TradeMark["exitReason"] = "fixed_hold";
    if (!entry) continue;
    if (args.exitPolicy === "profit_protect") {
      const drawdownThresholdKrw = Math.max(
        args.profitProtectMinDrawdownKrw,
        args.notionalKrw * (args.profitProtectDrawdownBps / 10_000),
      );
      let peakMarkPnlKrw = Number.NEGATIVE_INFINITY;
      for (let cursor = index + 1; cursor <= index + args.holdBars; cursor += 1) {
        const mark = candles[cursor];
        if (!mark) continue;
        const currentMarkPnlKrw = args.notionalKrw * (mark.close / entry.close - 1);
        peakMarkPnlKrw = Math.max(peakMarkPnlKrw, currentMarkPnlKrw);
        const drawdownFromPeakKrw = currentMarkPnlKrw - peakMarkPnlKrw;
        if (
          peakMarkPnlKrw >= args.profitProtectMinPeakPnlKrw &&
          currentMarkPnlKrw > 0 &&
          drawdownFromPeakKrw <= -drawdownThresholdKrw
        ) {
          exitIndex = cursor;
          exitReason = "profit_protect";
          break;
        }
      }
    }
    const exit = candles[exitIndex];
    if (!exit) continue;
    const netReturn = exit.close / entry.close - 1 - args.feeRoundTripRate;
    trades.push({
      entryAt: entry.timestampMs,
      exitAt: exit.timestampMs,
      netReturn,
      pnlKrw: args.notionalKrw * netReturn,
      heldBars: exitIndex - index,
      exitReason,
    });
    nextEntryIndex = exitIndex;
  }
  return trades;
}

function quantile(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index] ?? null;
}

function summarize(trades: TradeMark[], notionalKrw: number): Summary {
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

function walkForwardSummary(candles: Candle[], args: Args, foldCount = WALK_FORWARD_FOLDS): WalkForwardSummary {
  const folds: WalkForwardSummary["folds"] = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const startIndex = Math.floor((candles.length * fold) / foldCount);
    const endIndex = Math.floor((candles.length * (fold + 1)) / foldCount) - 1;
    const trades = simulate(candles, args, startIndex, endIndex);
    const summary = summarize(trades, args.notionalKrw);
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

function maxDrawdown(capitalPath: number[]): number {
  let peak = capitalPath[0] ?? 0;
  let worst = 0;
  for (const value of capitalPath) {
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.min(worst, value / peak - 1);
  }
  return worst;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const candles = await fetchCandles(args);
  if (candles.length < Math.max(args.lookbackBars, args.holdBars, 24) + 2) {
    throw new Error("not enough candles to benchmark candidate");
  }
  const trades = simulate(candles, args);
  const splitIndex = Math.floor(candles.length * 0.7);
  const train = summarize(simulate(candles, args, 0, splitIndex - 1), args.notionalKrw);
  const test = summarize(simulate(candles, args, splitIndex, candles.length - 1), args.notionalKrw);
  const walkForward = walkForwardSummary(candles, args);
  let capital = args.notionalKrw;
  const capitalPath = [capital];
  for (const trade of trades) {
    capital *= 1 + trade.netReturn;
    capitalPath.push(capital);
  }
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) throw new Error("not enough candles to benchmark candidate");
  const elapsedYears = (last.timestampMs - first.timestampMs) / (365.25 * 24 * 60 * 60 * 1000);
  const strategyReturn = capital / args.notionalKrw - 1;
  const buyHoldReturn = last.close / first.close - 1;
  const exposureBars = trades.reduce((sum, trade) => sum + trade.heldBars, 0);
  const exitReasonCounts = trades.reduce<Record<string, number>>((counts, trade) => {
    counts[trade.exitReason] = (counts[trade.exitReason] ?? 0) + 1;
    return counts;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Single-candidate benchmark. Simulates non-overlapping all-in entries with compounding and compares against full-period buy-and-hold. This is research evidence, not live approval.",
    candidate: {
      market: args.market,
      signalMode: args.signalMode,
      unitMinutes: args.unitMinutes,
      lookbackBars: args.lookbackBars,
      holdBars: args.holdBars,
      minReturnBps: args.minReturnBps,
      riskFilter: args.riskFilter,
      riskThreshold: args.riskThreshold,
      notionalKrw: args.notionalKrw,
      feeRoundTripBps: args.feeRoundTripRate * 10_000,
      exitPolicy: args.exitPolicy,
      profitProtect:
        args.exitPolicy === "profit_protect"
          ? {
              minPeakPnlKrw: args.profitProtectMinPeakPnlKrw,
              minDrawdownKrw: args.profitProtectMinDrawdownKrw,
              drawdownBps: args.profitProtectDrawdownBps,
            }
          : null,
    },
    source: {
      candleCount: candles.length,
      from: new Date(first.timestampMs).toISOString(),
      to: new Date(last.timestampMs).toISOString(),
      fetchedFromPublicApi: args.inputCandlesPath === null,
    },
    strategy: {
      tradeCount: trades.length,
      winners: trades.filter((trade) => trade.netReturn > 0).length,
      losers: trades.filter((trade) => trade.netReturn < 0).length,
      finalCapitalKrw: round(capital),
      returnPct: round(strategyReturn * 100),
      annualizedReturnPct:
        elapsedYears > 0 ? round((Math.pow(1 + strategyReturn, 1 / elapsedYears) - 1) * 100) : null,
      maxDrawdownPct: round(maxDrawdown(capitalPath) * 100),
      exposurePct: round((exposureBars / candles.length) * 100),
      totalPnlKrw: round(trades.reduce((sum, trade) => sum + trade.pnlKrw, 0)),
      exitReasonCounts,
    },
    benchmark: {
      buyHoldReturnPct: round(buyHoldReturn * 100),
      annualizedBuyHoldReturnPct:
        elapsedYears > 0 ? round((Math.pow(1 + buyHoldReturn, 1 / elapsedYears) - 1) * 100) : null,
      excessReturnVsBuyHoldPct: round((strategyReturn - buyHoldReturn) * 100),
    },
    validation: {
      split: "first 70% train, last 30% test",
      walkForward:
        "five chronological folds using the same fixed candidate parameters; this does not replace realized paper exit evidence",
      train,
      test,
      walkForwardSummary: walkForward,
      checks: {
        minimumTrainTrades: train.count >= MIN_PROMOTION_TRAIN_TRADES,
        minimumTestTrades: test.count >= MIN_PROMOTION_TEST_TRADES,
        minimumTotalTrades: train.count + test.count >= MIN_PROMOTION_TOTAL_TRADES,
        positiveTrainMedianPnl: (train.medianPnlKrw ?? -Infinity) > 0,
        positiveTestMedianPnl: (test.medianPnlKrw ?? -Infinity) > 0,
        positiveTrainAndTestTotalPnl: train.totalPnlKrw > 0 && test.totalPnlKrw > 0,
        walkForwardTotalPasses: walkForward.positiveTotalFoldCount >= MIN_POSITIVE_WALK_FORWARD_FOLDS,
        walkForwardMedianPasses: walkForward.positiveMedianFoldCount >= MIN_POSITIVE_WALK_FORWARD_FOLDS,
        walkForwardMinFoldNonNegative:
          walkForward.minFoldPnlKrw !== null && walkForward.minFoldPnlKrw >= 0,
      },
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
