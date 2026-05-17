import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface Args {
  market: string;
  signalMode: "momentum" | "reversal";
  unitMinutes: number;
  maxCandles: number;
  lookbackBars: number;
  holdBars: number;
  minReturnBps: number;
  minDropBps: number;
  riskFilter: "none" | "rv24_below_median" | "rv24_below_p70" | "range24_below_p70";
  riskThreshold: number | null;
  notionalKrw: number;
  expectedMedianEdgeBps: number | null;
  outputPath: string | null;
}

interface Candle {
  timestampMs: number;
  close: number;
  high: number;
  low: number;
}

export interface OrderbookUnit {
  ask_price: number;
  bid_price: number;
  ask_size: number;
  bid_size: number;
}

const REST_BASE_URL = "https://api.bithumb.com/v1";
const LIVE_RISK_MAX_SPREAD_BPS = 8;
const LIVE_RISK_MIN_24H_NOTIONAL_KRW = 30_000_000_000;

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    market: "KRW-THQ",
    signalMode: "reversal",
    unitMinutes: 60,
    maxCandles: 500,
    lookbackBars: 12,
    holdBars: 4,
    minReturnBps: 50,
    minDropBps: 50,
    riskFilter: "rv24_below_median",
    riskThreshold: 568.5299870739053,
    notionalKrw: 500_000,
    expectedMedianEdgeBps: 52.006,
    outputPath: null,
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
    if (arg === "--min-drop-bps") {
      if (!value) throw new Error("--min-drop-bps requires a value");
      args.minDropBps = positiveNumber(value, "--min-drop-bps");
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
    if (arg === "--expected-median-edge-bps") {
      if (!value) throw new Error("--expected-median-edge-bps requires a value");
      args.expectedMedianEdgeBps = positiveNumber(value, "--expected-median-edge-bps");
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
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

async function fetchCandles(args: Args): Promise<Candle[]> {
  const url = new URL(`${REST_BASE_URL}/candles/minutes/${args.unitMinutes}`);
  url.searchParams.set("market", args.market);
  url.searchParams.set("count", String(Math.min(200, args.maxCandles)));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`bithumb candle request failed (${response.status})`);
  const payload = (await response.json()) as Array<Record<string, unknown>>;
  return payload
    .map(normalizeCandle)
    .filter((candle) => candle.timestampMs > 0 && candle.close > 0)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

async function fetchOrderbook(market: string): Promise<OrderbookUnit[]> {
  const url = new URL(`${REST_BASE_URL}/orderbook`);
  url.searchParams.set("markets", market);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`bithumb orderbook request failed (${response.status})`);
  const payload = (await response.json()) as Array<{ orderbook_units?: OrderbookUnit[] }>;
  return payload[0]?.orderbook_units ?? [];
}

async function fetchTicker(market: string): Promise<Record<string, unknown>> {
  const url = new URL(`${REST_BASE_URL}/ticker`);
  url.searchParams.set("markets", market);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`bithumb ticker request failed (${response.status})`);
  const payload = (await response.json()) as Array<Record<string, unknown>>;
  return payload[0] ?? {};
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

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function signalBlockReasons(
  signalMode: Args["signalMode"],
  directionalSignalActive: boolean,
  riskPass: boolean,
): string[] {
  return [
    ...(directionalSignalActive ? [] : [`${signalMode}_signal_inactive`]),
    ...(riskPass ? [] : ["risk_filter_failed"]),
  ];
}

export function depthNotional(units: OrderbookUnit[], side: "ask" | "bid", notionalKrw: number) {
  let cumulative = 0;
  let acquiredBase = 0;
  let levels = 0;
  let worstPrice = 0;
  let bestPrice = 0;
  for (const unit of units) {
    const price = side === "ask" ? finiteNumber(unit.ask_price) : finiteNumber(unit.bid_price);
    const size = side === "ask" ? finiteNumber(unit.ask_size) : finiteNumber(unit.bid_size);
    if (price <= 0 || size <= 0) continue;
    if (bestPrice === 0) bestPrice = price;
    const availableQuote = price * size;
    const usedQuote = Math.min(Math.max(notionalKrw - cumulative, 0), availableQuote);
    if (usedQuote <= 0) break;
    cumulative += usedQuote;
    acquiredBase += usedQuote / price;
    levels += 1;
    worstPrice = price;
    if (cumulative >= notionalKrw) break;
  }
  const vwapPrice = acquiredBase > 0 ? cumulative / acquiredBase : 0;
  const slippageBps =
    bestPrice > 0 && vwapPrice > 0
      ? side === "ask"
        ? bps(vwapPrice, bestPrice)
        : bps(bestPrice, vwapPrice)
      : null;
  return {
    levels,
    notionalKrw: round(cumulative),
    coversRequestedNotional: cumulative >= notionalKrw,
    worstPrice: round(worstPrice),
    vwapPrice: round(vwapPrice),
    slippageBps: slippageBps === null ? null : round(Math.max(0, slippageBps)),
  };
}

export function normalizeBithumbTickerTimestampMs(
  rawTimestampMs: number,
  observedAtMs: number,
): { timestampMs: number; adjustedFromKstEpoch: boolean } {
  if (rawTimestampMs <= 0) return { timestampMs: 0, adjustedFromKstEpoch: false };
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  if (rawTimestampMs - observedAtMs > 30 * 60 * 1000) {
    const adjusted = rawTimestampMs - kstOffsetMs;
    if (Math.abs(observedAtMs - adjusted) <= kstOffsetMs) {
      return { timestampMs: adjusted, adjustedFromKstEpoch: true };
    }
  }
  return { timestampMs: rawTimestampMs, adjustedFromKstEpoch: false };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const [candles, orderbookUnits, ticker] = await Promise.all([
    fetchCandles(args),
    fetchOrderbook(args.market),
    fetchTicker(args.market),
  ]);
  const latestIndex = candles.length - 1;
  const latest = candles[latestIndex];
  const previous = candles[latestIndex - args.lookbackBars];
  if (!latest || !previous) {
    throw new Error("not enough candles to evaluate time-series candidate");
  }

  const lookbackReturnBps = bps(latest.close, previous.close);
  const risk = riskValue(candles, latestIndex, args.riskFilter);
  const directionalSignalActive =
    args.signalMode === "momentum"
      ? lookbackReturnBps >= args.minReturnBps
      : lookbackReturnBps <= -args.minDropBps;
  const riskPass =
    args.riskFilter === "none" ||
    (risk !== null && args.riskThreshold !== null && risk <= args.riskThreshold);
  const signalActive =
    directionalSignalActive &&
    (args.riskFilter === "none" ||
      (risk !== null && args.riskThreshold !== null && risk <= args.riskThreshold));

  const best = orderbookUnits[0];
  const bestAsk = finiteNumber(best?.ask_price);
  const bestBid = finiteNumber(best?.bid_price);
  const bestAskSize = finiteNumber(best?.ask_size);
  const bestBidSize = finiteNumber(best?.bid_size);
  const spreadBps = bestAsk > 0 && bestBid > 0 ? bps(bestAsk, bestBid) : null;
  const buyDepth = depthNotional(orderbookUnits, "ask", args.notionalKrw);
  const sellDepth = depthNotional(orderbookUnits, "bid", args.notionalKrw);
  const expectedEdgeBps = args.expectedMedianEdgeBps;
  const spreadVsExpectedEdgeBps =
    spreadBps !== null && expectedEdgeBps !== null ? round(spreadBps - expectedEdgeBps) : null;
  const executableRoundTripCostBps =
    spreadBps !== null && buyDepth.slippageBps !== null && sellDepth.slippageBps !== null
      ? round(spreadBps + buyDepth.slippageBps + sellDepth.slippageBps)
      : null;
  const executableCostVsExpectedEdgeBps =
    executableRoundTripCostBps !== null && expectedEdgeBps !== null
      ? round(executableRoundTripCostBps - expectedEdgeBps)
      : null;
  const generatedAt = new Date();
  const tickerTimestampRaw = finiteNumber(ticker.timestamp);
  const tickerTimestamp = normalizeBithumbTickerTimestampMs(
    tickerTimestampRaw,
    generatedAt.getTime(),
  );
  const rolling24hNotional = finiteNumber(ticker.acc_trade_price_24h);
  const tickerAgeMs =
    tickerTimestamp.timestampMs > 0 ? generatedAt.getTime() - tickerTimestamp.timestampMs : null;
  const latestCandleAgeMs = generatedAt.getTime() - latest.timestampMs;
  const maxTickerAgeMs = 120_000;
  const maxLatestCandleAgeMs = (args.unitMinutes + 10) * 60_000;
  const tickerFresh =
    tickerAgeMs !== null && tickerAgeMs >= 0 && tickerAgeMs <= maxTickerAgeMs;
  const latestCandleRecent =
    latestCandleAgeMs >= 0 && latestCandleAgeMs <= maxLatestCandleAgeMs;
  const snapshotSkewControlled = tickerFresh && latestCandleRecent;
  const spreadWithinLiveRiskPolicy =
    spreadBps !== null && spreadBps <= LIVE_RISK_MAX_SPREAD_BPS;
  const rolling24hNotionalWithinLiveRiskPolicy =
    rolling24hNotional >= LIVE_RISK_MIN_24H_NOTIONAL_KRW;
  const executionCostWithinExpectedEdge =
    executableCostVsExpectedEdgeBps !== null && executableCostVsExpectedEdgeBps <= 0;
  const executionViable =
    signalActive &&
    executionCostWithinExpectedEdge &&
    spreadWithinLiveRiskPolicy &&
    rolling24hNotionalWithinLiveRiskPolicy &&
    buyDepth.coversRequestedNotional &&
    sellDepth.coversRequestedNotional &&
    snapshotSkewControlled;

  const report = {
    generatedAt: generatedAt.toISOString(),
    note:
      "Forward observation only. This does not place orders and does not promote the candidate; it checks whether the public time-series signal and current orderbook costs are compatible with the historical low-cost edge.",
    candidate: {
      market: args.market,
      signalMode: args.signalMode,
      unitMinutes: args.unitMinutes,
      lookbackBars: args.lookbackBars,
      holdBars: args.holdBars,
      minReturnBps: args.minReturnBps,
      minDropBps: args.minDropBps,
      riskFilter: args.riskFilter,
      riskThreshold: args.riskThreshold,
      notionalKrw: args.notionalKrw,
      expectedMedianEdgeBps: expectedEdgeBps,
    },
    signal: {
      active: signalActive,
      latestCandleAt: new Date(latest.timestampMs).toISOString(),
      previousCandleAt: new Date(previous.timestampMs).toISOString(),
      latestClose: latest.close,
      previousClose: previous.close,
      lookbackReturnBps: round(lookbackReturnBps),
      returnThresholdBps: args.minReturnBps,
      dropThresholdBps: args.minDropBps,
      riskValue: risk === null ? null : round(risk),
      riskThreshold: args.riskThreshold,
      riskExcessBps:
        risk !== null && args.riskThreshold !== null ? round(risk - args.riskThreshold) : null,
      directionalSignalPass: directionalSignalActive,
      riskPass,
    },
    orderbook: {
      bestAsk,
      bestBid,
      bestAskSize,
      bestBidSize,
      spreadBps: spreadBps === null ? null : round(spreadBps),
      spreadVsExpectedEdgeBps,
      executableRoundTripCostBps,
      executableCostVsExpectedEdgeBps,
      buyDepth,
      sellDepth,
    },
    executionPolicy: {
      maxSpreadBps: LIVE_RISK_MAX_SPREAD_BPS,
      min24hNotionalKrw: LIVE_RISK_MIN_24H_NOTIONAL_KRW,
      spreadWithinLiveRiskPolicy,
      rolling24hNotionalWithinLiveRiskPolicy,
    },
    ticker: {
      tradePrice: finiteNumber(ticker.trade_price),
      changeRate: finiteNumber(ticker.change_rate),
      accTradePrice24h: rolling24hNotional,
      timestamp: tickerTimestamp.timestampMs,
      rawTimestamp: tickerTimestampRaw,
      timestampAdjustedFromKstEpoch: tickerTimestamp.adjustedFromKstEpoch,
    },
    freshness: {
      tickerAgeMs: tickerAgeMs === null ? null : Math.round(tickerAgeMs),
      maxTickerAgeMs,
      tickerFresh,
      latestCandleAgeMs: Math.round(latestCandleAgeMs),
      maxLatestCandleAgeMs,
      latestCandleRecent,
      snapshotSkewControlled,
    },
    decision: {
      paperObservationOnly: true,
      executionViability: executionViable ? "watch_candidate" : "blocked_by_signal_or_execution_cost",
      reasons: [
        ...signalBlockReasons(args.signalMode, directionalSignalActive, riskPass),
        ...(executionCostWithinExpectedEdge ? [] : ["executable_cost_exceeds_expected_median_edge"]),
        ...(spreadWithinLiveRiskPolicy ? [] : ["spread_above_live_risk_policy"]),
        ...(rolling24hNotionalWithinLiveRiskPolicy
          ? []
          : ["rolling_24h_notional_below_live_risk_policy"]),
        ...(buyDepth.coversRequestedNotional ? [] : ["insufficient_ask_depth_for_notional"]),
        ...(sellDepth.coversRequestedNotional ? [] : ["insufficient_bid_depth_for_notional"]),
        ...(snapshotSkewControlled ? [] : ["snapshot_skew_uncontrolled"]),
      ],
    },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

const executedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
const executedByPm2 = process.env.pm_id !== undefined;

if (executedDirectly || executedByPm2) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
