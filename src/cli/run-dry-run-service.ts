import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  executePaperSessionScenario,
  InvalidPaperSessionScenarioError,
} from "../execution/run-paper-session.js";
import {
  validateMarketSnapshot,
  type MarketSnapshot,
} from "../contracts/market-snapshot.js";
import type { PaperSessionScenario } from "../contracts/paper-session.js";
import type { SignalIntent } from "../contracts/signal-intent.js";
import type { KillSwitchTrigger } from "../execution/kill-switch.js";
import type { PortfolioState } from "../execution/types.js";
import { createBithumbPrivateClient } from "../live/bithumb.js";
import { loadExecutionRuntimeConfig } from "../runtime/config.js";
import { loadDryRunServiceConfig } from "../runtime/dry-run-service-config.js";

interface CommandResult {
  code: number;
  stdoutLines: string[];
  stderrLines: string[];
}

interface CommandRetryOptions {
  maxAttempts: number;
  retryDelayMs: number[];
}

interface DryRunServiceArgs {
  once: boolean;
}

export class DryRunCommandFailureError extends Error {
  readonly label: string;
  readonly status: number;
  readonly stdoutTail: string[];
  readonly stderrTail: string[];
  readonly failureKind: string | null;

  constructor(label: string, result: CommandResult) {
    super(`${label} exited with status ${result.code}`);
    this.name = "DryRunCommandFailureError";
    this.label = label;
    this.status = result.code;
    this.stdoutTail = result.stdoutLines.slice(-8);
    this.stderrTail = result.stderrLines.slice(-8);
    this.failureKind = classifyDryRunCommandFailure(label, result);
  }
}

interface PortfolioPositionLike {
  baseQuantity: number;
  market: string;
  avgEntryPrice?: number;
}

interface SessionReportLike {
  latestSnapshots: Record<
    string,
    {
      bestAskPrice?: number;
      bestBidPrice: number;
      lastTradePrice: number;
    }
  >;
  portfolio: {
    cashAvailable: number;
    dailyRealizedPnl: number;
    positions: Record<string, PortfolioPositionLike>;
  };
  reconciliation: {
    ok: boolean;
  };
  scenarioMetadata?: {
    initialCashKrw?: number;
    initialEquityKrw?: number;
    carryOpenPositions?: boolean;
    openPositionState?: ManagedOpenPositionState | null;
  };
  sessionId?: string;
  generatedAt: string;
  mode: string;
  processedEvents: number;
  rejectionSummary?: unknown;
  rejectLedger: {
    totalRejectedDecisions: number;
  };
  ledger: {
    orders: unknown[];
    fills: unknown[];
    decisions: unknown[];
  };
  suppressionSummary: Record<string, number>;
  artifacts?: unknown;
}

interface ManagedOpenPositionState {
  market: string;
  enteredAtMs: number;
  entryPrice: number;
  quantity: number;
  quoteNotional: number;
  consecutiveNegativeRet1m: number;
  consecutiveBookFailures: number;
  peakBidPrice: number;
}

interface ManagedKillSwitchState {
  active: boolean;
  trigger: KillSwitchTrigger;
  reason: string;
  detail?: Record<string, unknown>;
  occurredAt: string;
}

interface ManagedDryRunState {
  schemaVersion: "1.0.0";
  configSignature: string;
  executionMode: "dry_run" | "paper" | "live";
  runStartedAt: string;
  runInitialEquityKrw: number;
  currentEquityKrw: number;
  portfolio: PortfolioState;
  openPositionState: ManagedOpenPositionState | null;
  killSwitch?: ManagedKillSwitchState | null;
  lastCompletedAt?: string;
  lastSessionId?: string;
  cycle?: number;
}

interface ManagedTimeSeriesObservationReport {
  generatedAt: string;
  candidate: {
    market: string;
    signalMode: "momentum" | "reversal";
    unitMinutes: number;
    lookbackBars: number;
    holdBars: number;
    minReturnBps?: number;
    minDropBps?: number;
    riskFilter: string;
    riskThreshold: number | null;
    notionalKrw: number;
    expectedMedianEdgeBps: number | null;
  };
  signal: {
    active: boolean;
    latestCandleAt: string;
    previousCandleAt: string;
    lookbackReturnBps: number;
    riskValue: number | null;
  };
  orderbook: {
    bestAsk: number;
    bestBid: number;
    bestAskSize: number;
    bestBidSize: number;
    spreadBps: number | null;
    buyDepth: {
      notionalKrw: number;
      coversRequestedNotional: boolean;
      vwapPrice?: number;
      worstPrice?: number;
    };
    sellDepth: {
      notionalKrw: number;
      coversRequestedNotional: boolean;
      vwapPrice?: number;
      worstPrice?: number;
    };
  };
  ticker: {
    tradePrice: number;
    accTradePrice24h: number;
  };
  decision: {
    executionViability: string;
    reasons: string[];
  };
}

type Btc240mObservationReport = ManagedTimeSeriesObservationReport & {
  candidate: ManagedTimeSeriesObservationReport["candidate"] & {
    market: "KRW-BTC";
    signalMode: "momentum";
    unitMinutes: 240;
  };
};

type Pieverse60mReversalObservationReport = ManagedTimeSeriesObservationReport & {
  candidate: ManagedTimeSeriesObservationReport["candidate"] & {
    market: "KRW-PIEVERSE";
    signalMode: "reversal";
    unitMinutes: 60;
  };
};

type Stable60mReversalObservationReport = ManagedTimeSeriesObservationReport & {
  candidate: ManagedTimeSeriesObservationReport["candidate"] & {
    market: "KRW-STABLE";
    signalMode: "reversal";
    unitMinutes: 60;
  };
};

type KrwH60mMomentumObservationReport = ManagedTimeSeriesObservationReport & {
  candidate: ManagedTimeSeriesObservationReport["candidate"] & {
    market: "KRW-H";
    signalMode: "momentum";
    unitMinutes: 60;
  };
};

interface ManagedTimeSeriesScenarioResult {
  scenario: PaperSessionScenario;
  skippedReasons: string[];
  signalAction: "buy" | "sell" | "hold";
}

type Btc240mManagedScenarioResult = ManagedTimeSeriesScenarioResult;
type Pieverse60mReversalManagedScenarioResult = ManagedTimeSeriesScenarioResult;
type Stable60mReversalManagedScenarioResult = ManagedTimeSeriesScenarioResult;
type KrwH60mMomentumManagedScenarioResult = ManagedTimeSeriesScenarioResult;

interface LiveAccountClient {
  getAccounts(): Promise<unknown>;
  getOrderChance?(market: string): Promise<unknown>;
}

interface LiveManagedAccountSnapshot {
  krwFree: number;
  krwLocked: number;
  baseBalance: number;
  baseLocked: number;
  baseAvgEntryPrice: number;
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return fallback;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
}

function parseArgs(argv: string[]): DryRunServiceArgs {
  return {
    once: argv.includes("--once"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

export function estimatePortfolioEquity(report: SessionReportLike): number {
  return (
    report.portfolio.cashAvailable +
    Object.values(report.portfolio.positions).reduce((sum, position) => {
      if (Math.abs(position.baseQuantity) <= 1e-12) {
        return sum;
      }
      const snapshot = report.latestSnapshots[position.market];
      if (!snapshot) {
        throw new Error(
          `missing latest snapshot for carried market ${position.market}`,
        );
      }
      const markPrice = snapshot.bestBidPrice ?? snapshot.lastTradePrice;
      if (typeof markPrice !== "number" || !Number.isFinite(markPrice) || markPrice <= 0) {
        throw new Error(
          `invalid mark price for carried market ${position.market}`,
        );
      }
      return sum + position.baseQuantity * markPrice;
    }, 0)
  );
}

async function appendJsonLine(path: string, payload: Record<string, unknown>) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(payload)}\n`, "utf8");
}

async function readManagedState(path: string): Promise<ManagedDryRunState | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ManagedDryRunState;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function writeManagedState(path: string, state: ManagedDryRunState) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function buildConfigSignature(config: ReturnType<typeof loadDryRunServiceConfig>): string {
  return JSON.stringify({
    executionMode: config.executionMode,
    entryProfile: config.entryProfile,
    exitProfile: config.exitProfile,
    syntheticExitPolicy: config.syntheticExitPolicy,
    markets: config.bootstrap.markets,
    maxInitialCashKrw: config.initialCashKrw,
  });
}

const BTC_240M_STRATEGY_ID = "btc_240m_momentum_public_v1";
const BTC_240M_MIN75_STRATEGY_ID = "btc_240m_momentum_min75_candidate_v1";
const BTC_240M_LB168_HOLD72_RANGE_P70_STRATEGY_ID =
  "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1";
const BTC_240M_LB168_HOLD49_RANGE_P70_STRATEGY_ID =
  "btc_240m_momentum_lb168_hold49_range_p70_candidate_v1";
const PIEVERSE_60M_REVERSAL_LB168_STRATEGY_ID =
  "pieverse_60m_reversal_lb168_candidate_v1";
const STABLE_60M_REVERSAL_STRATEGY_ID =
  "stable_60m_reversal_candidate_v1";
const KRW_H_60M_MOMENTUM_TOP_STRATEGY_ID =
  "krw_h_60m_momentum_top_candidate_v1";

interface Btc240mProfileConfig {
  strategyId:
    | typeof BTC_240M_STRATEGY_ID
    | typeof BTC_240M_MIN75_STRATEGY_ID
    | typeof BTC_240M_LB168_HOLD72_RANGE_P70_STRATEGY_ID
    | typeof BTC_240M_LB168_HOLD49_RANGE_P70_STRATEGY_ID;
  lookbackBars: number;
  holdBars: number;
  minReturnBps: number;
  riskFilter: "rv24_below_p70" | "range24_below_p70";
  riskThreshold: number;
  notionalKrw: number;
  expectedMedianEdgeBps: number;
}

function btc240mProfileConfig(
  entryProfile: ReturnType<typeof loadDryRunServiceConfig>["entryProfile"],
): Btc240mProfileConfig | null {
  if (entryProfile === BTC_240M_STRATEGY_ID) {
    return {
      strategyId: BTC_240M_STRATEGY_ID,
      lookbackBars: 24,
      holdBars: 24,
      minReturnBps: 25,
      riskFilter: "rv24_below_p70",
      riskThreshold: 435.9906664851208,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 15.690478,
    };
  }
  if (entryProfile === BTC_240M_MIN75_STRATEGY_ID) {
    return {
      strategyId: BTC_240M_MIN75_STRATEGY_ID,
      lookbackBars: 24,
      holdBars: 24,
      minReturnBps: 75,
      riskFilter: "rv24_below_p70",
      riskThreshold: 435.9906664851208,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 15.690478,
    };
  }
  if (entryProfile === BTC_240M_LB168_HOLD72_RANGE_P70_STRATEGY_ID) {
    return {
      strategyId: BTC_240M_LB168_HOLD72_RANGE_P70_STRATEGY_ID,
      lookbackBars: 168,
      holdBars: 72,
      minReturnBps: 0,
      riskFilter: "range24_below_p70",
      riskThreshold: 783.7406329668073,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 58.09469328,
    };
  }
  if (entryProfile === BTC_240M_LB168_HOLD49_RANGE_P70_STRATEGY_ID) {
    return {
      strategyId: BTC_240M_LB168_HOLD49_RANGE_P70_STRATEGY_ID,
      lookbackBars: 168,
      holdBars: 49,
      minReturnBps: 0,
      riskFilter: "range24_below_p70",
      riskThreshold: 783.7406329668073,
      notionalKrw: 500_000,
      expectedMedianEdgeBps: 68.46922656,
    };
  }
  return null;
}

interface Pieverse60mReversalProfileConfig {
  strategyId: typeof PIEVERSE_60M_REVERSAL_LB168_STRATEGY_ID;
  lookbackBars: 168;
  holdBars: 24;
  minReturnBps: 50;
  minDropBps: 50;
  riskFilter: "rv24_below_median";
  riskThreshold: number;
  notionalKrw: number;
  expectedMedianEdgeBps: number;
}

function pieverse60mReversalProfileConfig(
  entryProfile: ReturnType<typeof loadDryRunServiceConfig>["entryProfile"],
): Pieverse60mReversalProfileConfig | null {
  if (entryProfile !== PIEVERSE_60M_REVERSAL_LB168_STRATEGY_ID) {
    return null;
  }

  return {
    strategyId: PIEVERSE_60M_REVERSAL_LB168_STRATEGY_ID,
    lookbackBars: 168,
    holdBars: 24,
    minReturnBps: 50,
    minDropBps: 50,
    riskFilter: "rv24_below_median",
    riskThreshold: 751.7214747340527,
    notionalKrw: 500_000,
    expectedMedianEdgeBps: 129.95314,
  };
}

interface KrwH60mMomentumProfileConfig {
  strategyId: typeof KRW_H_60M_MOMENTUM_TOP_STRATEGY_ID;
  lookbackBars: 168;
  holdBars: 24;
  minReturnBps: 0;
  minDropBps: 50;
  riskFilter: "range24_below_p70";
  riskThreshold: number;
  notionalKrw: number;
  expectedMedianEdgeBps: number;
}

interface Stable60mReversalProfileConfig {
  strategyId: typeof STABLE_60M_REVERSAL_STRATEGY_ID;
  lookbackBars: 24;
  holdBars: 24;
  minReturnBps: 50;
  minDropBps: 50;
  riskFilter: "none";
  riskThreshold: number;
  notionalKrw: number;
  expectedMedianEdgeBps: number;
}

function stable60mReversalProfileConfig(
  entryProfile: ReturnType<typeof loadDryRunServiceConfig>["entryProfile"],
): Stable60mReversalProfileConfig | null {
  if (entryProfile !== STABLE_60M_REVERSAL_STRATEGY_ID) {
    return null;
  }

  return {
    strategyId: STABLE_60M_REVERSAL_STRATEGY_ID,
    lookbackBars: 24,
    holdBars: 24,
    minReturnBps: 50,
    minDropBps: 50,
    riskFilter: "none",
    riskThreshold: 568.5299870739053,
    notionalKrw: 500_000,
    expectedMedianEdgeBps: 39.37016,
  };
}

function krwH60mMomentumProfileConfig(
  entryProfile: ReturnType<typeof loadDryRunServiceConfig>["entryProfile"],
): KrwH60mMomentumProfileConfig | null {
  if (entryProfile !== KRW_H_60M_MOMENTUM_TOP_STRATEGY_ID) {
    return null;
  }

  return {
    strategyId: KRW_H_60M_MOMENTUM_TOP_STRATEGY_ID,
    lookbackBars: 168,
    holdBars: 24,
    minReturnBps: 0,
    minDropBps: 50,
    riskFilter: "range24_below_p70",
    riskThreshold: 2065.7276995305174,
    notionalKrw: 500_000,
    expectedMedianEdgeBps: 138.73015874,
  };
}

function cliPath(fileName: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), fileName);
}

function artifactTimestampSlug(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  const source = Number.isFinite(parsed) ? new Date(parsed).toISOString() : timestamp;
  return source.replace(/[^0-9A-Za-z]/g, "");
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`${label} must be a finite number`);
}

function optionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function executableSide(
  topPrice: number,
  topSize: number,
  depth: { vwapPrice?: number; worstPrice?: number },
  notionalKrw: number,
): { price: number; size: number } {
  const price =
    topSize > 0
      ? topPrice
      : depth.vwapPrice ?? depth.worstPrice ?? topPrice;
  const size =
    topSize > 0
      ? topSize
      : price > 0 && notionalKrw > 0
        ? notionalKrw / price
        : Number.EPSILON;
  return { price, size };
}

async function fetchBithumbPublicJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://api.bithumb.com/v1/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`bithumb ${path} request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function findExecutableOrderbookLevel(
  units: Array<Record<string, unknown>>,
  priceKey: "ask_price" | "bid_price",
  sizeKey: "ask_size" | "bid_size",
): { price: number; size: number } | null {
  for (const unit of units) {
    const price = parseFiniteNumber(unit[priceKey], 0);
    const size = parseFiniteNumber(unit[sizeKey], 0);
    if (price > 0 && size > 0) {
      return { price, size };
    }
  }
  return null;
}

async function fetchBithumbBenchmarkSnapshot(
  market: string,
  notionalKrw: number,
): Promise<MarketSnapshot> {
  const [orderbookPayload, tickerPayload] = await Promise.all([
    fetchBithumbPublicJson<
      Array<{
        orderbook_units?: Array<Record<string, unknown>>;
      }>
    >("orderbook", { markets: market }),
    fetchBithumbPublicJson<Array<Record<string, unknown>>>("ticker", { markets: market }),
  ]);
  const units = orderbookPayload[0]?.orderbook_units ?? [];
  const bestAsk = findExecutableOrderbookLevel(units, "ask_price", "ask_size");
  const bestBid = findExecutableOrderbookLevel(units, "bid_price", "bid_size");
  const ticker = tickerPayload[0] ?? {};
  const tradePrice = parseFiniteNumberOrNull(ticker.trade_price);
  const rolling24hNotional = parseFiniteNumberOrNull(ticker.acc_trade_price_24h);

  if (
    bestAsk === null ||
    bestBid === null ||
    tradePrice === null ||
    rolling24hNotional === null
  ) {
    throw new Error(`bithumb ${market} benchmark snapshot is incomplete`);
  }

  const askDepthKrw = units.reduce(
    (sum, unit) =>
      sum +
      parseFiniteNumber(unit.ask_price, 0) *
        parseFiniteNumber(unit.ask_size, 0),
    0,
  );
  const bidDepthKrw = units.reduce(
    (sum, unit) =>
      sum +
      parseFiniteNumber(unit.bid_price, 0) *
        parseFiniteNumber(unit.bid_size, 0),
    0,
  );
  const depthBase = notionalKrw > 0 ? notionalKrw : 1;
  const depthRatio = Math.max(
    Math.min(askDepthKrw, bidDepthKrw) / depthBase,
    0.000001,
  );

  const snapshot: MarketSnapshot = {
    market,
    asOf: new Date().toISOString(),
    lastTradePrice: tradePrice,
    bestBidPrice: bestBid.price,
    bestAskPrice: bestAsk.price,
    bestBidSize: bestBid.size,
    bestAskSize: bestAsk.size,
    spreadBps: round(bps(bestAsk.price, bestBid.price)),
    depthRatio: round(depthRatio),
    rolling24hNotional,
  };
  const validation = validateMarketSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(
      `bithumb ${market} benchmark snapshot is invalid: ${validation.issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return validation.value;
}

function normalizeBtc240mObservation(input: unknown): Btc240mObservationReport {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("BTC 240m observation must be an object");
  }

  const record = input as Record<string, unknown>;
  const candidate = record.candidate as Record<string, unknown> | undefined;
  const signal = record.signal as Record<string, unknown> | undefined;
  const orderbook = record.orderbook as Record<string, unknown> | undefined;
  const ticker = record.ticker as Record<string, unknown> | undefined;
  const decision = record.decision as Record<string, unknown> | undefined;
  const buyDepth = orderbook?.buyDepth as Record<string, unknown> | undefined;
  const sellDepth = orderbook?.sellDepth as Record<string, unknown> | undefined;
  const generatedAt =
    typeof record.generatedAt === "string" ? record.generatedAt : "";
  const latestCandleAt =
    typeof signal?.latestCandleAt === "string" ? signal.latestCandleAt : "";
  const previousCandleAt =
    typeof signal?.previousCandleAt === "string" ? signal.previousCandleAt : "";

  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("BTC 240m observation generatedAt must be an ISO timestamp");
  }
  if (Number.isNaN(Date.parse(latestCandleAt))) {
    throw new Error("BTC 240m observation latestCandleAt must be an ISO timestamp");
  }
  if (Number.isNaN(Date.parse(previousCandleAt))) {
    throw new Error("BTC 240m observation previousCandleAt must be an ISO timestamp");
  }
  if (
    candidate?.market !== "KRW-BTC" ||
    candidate.signalMode !== "momentum" ||
    candidate.unitMinutes !== 240
  ) {
    throw new Error("managed BTC 240m service requires KRW-BTC 240m momentum observation");
  }

  return {
    generatedAt,
    candidate: {
      market: "KRW-BTC",
      signalMode: "momentum",
      unitMinutes: 240,
      lookbackBars: finiteNumber(candidate.lookbackBars, "candidate.lookbackBars"),
      holdBars: finiteNumber(candidate.holdBars, "candidate.holdBars"),
      minReturnBps:
        typeof candidate.minReturnBps === "number" ? candidate.minReturnBps : undefined,
      riskFilter:
        typeof candidate.riskFilter === "string" ? candidate.riskFilter : "",
      riskThreshold:
        candidate.riskThreshold === null
          ? null
          : finiteNumber(candidate.riskThreshold, "candidate.riskThreshold"),
      notionalKrw: finiteNumber(candidate.notionalKrw, "candidate.notionalKrw"),
      expectedMedianEdgeBps:
        candidate.expectedMedianEdgeBps === null
          ? null
          : finiteNumber(candidate.expectedMedianEdgeBps, "candidate.expectedMedianEdgeBps"),
    },
    signal: {
      active: signal?.active === true,
      latestCandleAt,
      previousCandleAt,
      lookbackReturnBps: finiteNumber(signal?.lookbackReturnBps, "signal.lookbackReturnBps"),
      riskValue:
        signal?.riskValue === null
          ? null
          : finiteNumber(signal?.riskValue, "signal.riskValue"),
    },
    orderbook: {
      bestAsk: finiteNumber(orderbook?.bestAsk, "orderbook.bestAsk"),
      bestBid: finiteNumber(orderbook?.bestBid, "orderbook.bestBid"),
      bestAskSize: finiteNumber(orderbook?.bestAskSize, "orderbook.bestAskSize"),
      bestBidSize: finiteNumber(orderbook?.bestBidSize, "orderbook.bestBidSize"),
      spreadBps:
        orderbook?.spreadBps === null
          ? null
          : finiteNumber(orderbook?.spreadBps, "orderbook.spreadBps"),
      buyDepth: {
        notionalKrw: finiteNumber(buyDepth?.notionalKrw, "orderbook.buyDepth.notionalKrw"),
        coversRequestedNotional: buyDepth?.coversRequestedNotional === true,
        vwapPrice: optionalPositiveNumber(buyDepth?.vwapPrice),
        worstPrice: optionalPositiveNumber(buyDepth?.worstPrice),
      },
      sellDepth: {
        notionalKrw: finiteNumber(sellDepth?.notionalKrw, "orderbook.sellDepth.notionalKrw"),
        coversRequestedNotional: sellDepth?.coversRequestedNotional === true,
        vwapPrice: optionalPositiveNumber(sellDepth?.vwapPrice),
        worstPrice: optionalPositiveNumber(sellDepth?.worstPrice),
      },
    },
    ticker: {
      tradePrice: finiteNumber(ticker?.tradePrice, "ticker.tradePrice"),
      accTradePrice24h: finiteNumber(ticker?.accTradePrice24h, "ticker.accTradePrice24h"),
    },
    decision: {
      executionViability:
        typeof decision?.executionViability === "string"
          ? decision.executionViability
          : "",
      reasons: stringArray(decision?.reasons),
    },
  };
}

function normalizeManagedTimeSeriesObservation(
  input: unknown,
  expected: {
    market: string;
    signalMode: "momentum" | "reversal";
    unitMinutes: number;
    label: string;
  },
): ManagedTimeSeriesObservationReport {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${expected.label} observation must be an object`);
  }

  const record = input as Record<string, unknown>;
  const candidate = record.candidate as Record<string, unknown> | undefined;
  const signal = record.signal as Record<string, unknown> | undefined;
  const orderbook = record.orderbook as Record<string, unknown> | undefined;
  const ticker = record.ticker as Record<string, unknown> | undefined;
  const decision = record.decision as Record<string, unknown> | undefined;
  const buyDepth = orderbook?.buyDepth as Record<string, unknown> | undefined;
  const sellDepth = orderbook?.sellDepth as Record<string, unknown> | undefined;
  const generatedAt =
    typeof record.generatedAt === "string" ? record.generatedAt : "";
  const latestCandleAt =
    typeof signal?.latestCandleAt === "string" ? signal.latestCandleAt : "";
  const previousCandleAt =
    typeof signal?.previousCandleAt === "string" ? signal.previousCandleAt : "";

  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error(`${expected.label} observation generatedAt must be an ISO timestamp`);
  }
  if (Number.isNaN(Date.parse(latestCandleAt))) {
    throw new Error(`${expected.label} observation latestCandleAt must be an ISO timestamp`);
  }
  if (Number.isNaN(Date.parse(previousCandleAt))) {
    throw new Error(`${expected.label} observation previousCandleAt must be an ISO timestamp`);
  }
  if (
    candidate?.market !== expected.market ||
    candidate.signalMode !== expected.signalMode ||
    candidate.unitMinutes !== expected.unitMinutes
  ) {
    throw new Error(
      `managed ${expected.label} service requires ${expected.market} ${expected.unitMinutes}m ${expected.signalMode} observation`,
    );
  }

  return {
    generatedAt,
    candidate: {
      market: expected.market,
      signalMode: expected.signalMode,
      unitMinutes: expected.unitMinutes,
      lookbackBars: finiteNumber(candidate.lookbackBars, "candidate.lookbackBars"),
      holdBars: finiteNumber(candidate.holdBars, "candidate.holdBars"),
      minReturnBps:
        typeof candidate.minReturnBps === "number" ? candidate.minReturnBps : undefined,
      minDropBps:
        typeof candidate.minDropBps === "number" ? candidate.minDropBps : undefined,
      riskFilter:
        typeof candidate.riskFilter === "string" ? candidate.riskFilter : "",
      riskThreshold:
        candidate.riskThreshold === null
          ? null
          : finiteNumber(candidate.riskThreshold, "candidate.riskThreshold"),
      notionalKrw: finiteNumber(candidate.notionalKrw, "candidate.notionalKrw"),
      expectedMedianEdgeBps:
        candidate.expectedMedianEdgeBps === null
          ? null
          : finiteNumber(candidate.expectedMedianEdgeBps, "candidate.expectedMedianEdgeBps"),
    },
    signal: {
      active: signal?.active === true,
      latestCandleAt,
      previousCandleAt,
      lookbackReturnBps: finiteNumber(signal?.lookbackReturnBps, "signal.lookbackReturnBps"),
      riskValue:
        signal?.riskValue === null
          ? null
          : finiteNumber(signal?.riskValue, "signal.riskValue"),
    },
    orderbook: {
      bestAsk: finiteNumber(orderbook?.bestAsk, "orderbook.bestAsk"),
      bestBid: finiteNumber(orderbook?.bestBid, "orderbook.bestBid"),
      bestAskSize: finiteNumber(orderbook?.bestAskSize, "orderbook.bestAskSize"),
      bestBidSize: finiteNumber(orderbook?.bestBidSize, "orderbook.bestBidSize"),
      spreadBps:
        orderbook?.spreadBps === null
          ? null
          : finiteNumber(orderbook?.spreadBps, "orderbook.spreadBps"),
      buyDepth: {
        notionalKrw: finiteNumber(buyDepth?.notionalKrw, "orderbook.buyDepth.notionalKrw"),
        coversRequestedNotional: buyDepth?.coversRequestedNotional === true,
        vwapPrice: optionalPositiveNumber(buyDepth?.vwapPrice),
        worstPrice: optionalPositiveNumber(buyDepth?.worstPrice),
      },
      sellDepth: {
        notionalKrw: finiteNumber(sellDepth?.notionalKrw, "orderbook.sellDepth.notionalKrw"),
        coversRequestedNotional: sellDepth?.coversRequestedNotional === true,
        vwapPrice: optionalPositiveNumber(sellDepth?.vwapPrice),
        worstPrice: optionalPositiveNumber(sellDepth?.worstPrice),
      },
    },
    ticker: {
      tradePrice: finiteNumber(ticker?.tradePrice, "ticker.tradePrice"),
      accTradePrice24h: finiteNumber(ticker?.accTradePrice24h, "ticker.accTradePrice24h"),
    },
    decision: {
      executionViability:
        typeof decision?.executionViability === "string"
          ? decision.executionViability
          : "",
      reasons: stringArray(decision?.reasons),
    },
  };
}

function normalizePieverse60mReversalObservation(
  input: unknown,
): Pieverse60mReversalObservationReport {
  return normalizeManagedTimeSeriesObservation(input, {
    market: "KRW-PIEVERSE",
    signalMode: "reversal",
    unitMinutes: 60,
    label: "PIEVERSE 60m reversal",
  }) as Pieverse60mReversalObservationReport;
}

function normalizeStable60mReversalObservation(
  input: unknown,
): Stable60mReversalObservationReport {
  return normalizeManagedTimeSeriesObservation(input, {
    market: "KRW-STABLE",
    signalMode: "reversal",
    unitMinutes: 60,
    label: "KRW-STABLE 60m reversal",
  }) as Stable60mReversalObservationReport;
}

function normalizeKrwH60mMomentumObservation(
  input: unknown,
): KrwH60mMomentumObservationReport {
  return normalizeManagedTimeSeriesObservation(input, {
    market: "KRW-H",
    signalMode: "momentum",
    unitMinutes: 60,
    label: "KRW-H 60m momentum",
  }) as KrwH60mMomentumObservationReport;
}

function buildManagedTimeSeriesScenario(
  observation: ManagedTimeSeriesObservationReport,
  state: ManagedDryRunState,
  options: {
    strategyId: string;
    signalLabel: "MOMENTUM" | "REVERSAL";
    unitLabel: string;
    holdMinutes: number;
    eligibilityNote: string;
    benchmarkSnapshots?: MarketSnapshot[];
  },
): ManagedTimeSeriesScenarioResult {
  const candidate = observation.candidate;
  const openPosition = state.openPositionState?.market === candidate.market
    ? state.openPositionState
    : null;
  const holdExitDueAtMs = openPosition
    ? openPosition.enteredAtMs + options.holdMinutes * 60_000
    : null;
  const generatedAtMs = Date.parse(observation.generatedAt);
  const holdElapsed = holdExitDueAtMs !== null && generatedAtMs >= holdExitDueAtMs;
  const viable = observation.decision.executionViability === "watch_candidate";
  const skippedReasons = [
    ...(observation.signal.active ? [] : ["signal_inactive"]),
    ...(viable ? [] : ["observation_not_execution_viable"]),
    ...(observation.orderbook.buyDepth.coversRequestedNotional ? [] : ["insufficient_buy_depth"]),
    ...(observation.orderbook.sellDepth.coversRequestedNotional ? [] : ["insufficient_sell_depth"]),
    ...(openPosition && !holdElapsed ? ["open_position_hold_window_active"] : []),
  ];
  const lastTradePrice =
    observation.ticker.tradePrice > 0
      ? observation.ticker.tradePrice
      : observation.orderbook.bestBid;
  const depthRatio =
    candidate.notionalKrw > 0
      ? Math.min(
          observation.orderbook.buyDepth.notionalKrw,
          observation.orderbook.sellDepth.notionalKrw,
        ) / candidate.notionalKrw
      : 0;
  const benchmarkSnapshotEvents = (options.benchmarkSnapshots ?? [])
    .filter(
      (snapshot) =>
        snapshot.market !== candidate.market && validateMarketSnapshot(snapshot).ok,
    )
    .map((snapshot) => ({ type: "snapshot" as const, snapshot }));
  const executableBid = executableSide(
    observation.orderbook.bestBid,
    observation.orderbook.bestBidSize,
    observation.orderbook.sellDepth,
    candidate.notionalKrw,
  );
  const executableAsk = executableSide(
    observation.orderbook.bestAsk,
    observation.orderbook.bestAskSize,
    observation.orderbook.buyDepth,
    candidate.notionalKrw,
  );
  const events: PaperSessionScenario["events"] = [
    {
      type: "snapshot",
      snapshot: {
        market: candidate.market,
        asOf: observation.generatedAt,
        lastTradePrice,
        bestBidPrice: executableBid.price,
        bestAskPrice: executableAsk.price,
        bestBidSize: executableBid.size,
        bestAskSize: executableAsk.size,
        spreadBps: observation.orderbook.spreadBps ?? 0,
        depthRatio: round(depthRatio),
        rolling24hNotional: observation.ticker.accTradePrice24h,
      },
    },
    ...benchmarkSnapshotEvents,
  ];

  let signalAction: ManagedTimeSeriesScenarioResult["signalAction"] = "hold";
  if (openPosition && holdElapsed) {
    signalAction = "sell";
  } else if (!openPosition && skippedReasons.length === 0) {
    signalAction = "buy";
  }

  if (signalAction !== "hold") {
    const signal: SignalIntent = {
      schemaVersion: "1.0.0",
      signalId:
        signalAction === "buy"
          ? `${options.strategyId}-${candidate.market}-${observation.signal.latestCandleAt}`
          : `${options.strategyId}-${candidate.market}-${observation.signal.latestCandleAt}-hold-exit`,
      strategyId: options.strategyId,
      market: candidate.market,
      side: signalAction,
      sizing:
        signalAction === "buy"
          ? { basis: "quote_notional", value: candidate.notionalKrw }
          : { basis: "position_fraction", value: 1 },
      confidence: 0.6,
      generatedAt: observation.generatedAt,
      expiresAt: new Date(generatedAtMs + 10 * 60_000).toISOString(),
      maxSlippageBps: 8,
      reduceOnly: signalAction === "sell",
      reasonCodes:
        signalAction === "buy"
          ? [
              `SIGNAL_${options.signalLabel}`,
              `UNIT_${options.unitLabel}`,
              `LOOKBACK_${candidate.lookbackBars}`,
              `HOLD_${candidate.holdBars}`,
              `RISK_${candidate.riskFilter.toUpperCase()}`,
            ]
          : [
              "TIME_SERIES_HOLD_EXIT",
              `UNIT_${options.unitLabel}`,
              `HOLD_${candidate.holdBars}`,
            ],
      metadata: {
        latestCandleAt: observation.signal.latestCandleAt,
        previousCandleAt: observation.signal.previousCandleAt,
        lookbackReturnBps: observation.signal.lookbackReturnBps,
        riskValue: observation.signal.riskValue,
        expectedMedianEdgeBps: candidate.expectedMedianEdgeBps,
        holdExitDueAt:
          holdExitDueAtMs === null ? null : new Date(holdExitDueAtMs).toISOString(),
      },
    };
    events.push({ type: "signal", signal, receivedAt: observation.generatedAt });
  }

  return {
    skippedReasons,
    signalAction,
    scenario: {
      schemaVersion: "1.0.0",
      clockAt: observation.generatedAt,
      reconcileAt: observation.generatedAt,
      initialPortfolio: state.portfolio,
      metadata: {
        generatedAt: observation.generatedAt,
        strategyId: options.strategyId,
        modeIntent: state.executionMode,
        initialCashKrw: state.portfolio.cashAvailable,
        initialEquityKrw: state.currentEquityKrw,
        entryProfile: options.strategyId,
        syntheticExitPolicy: "carry_open_until_hold_window",
        carryOpenPositions: signalAction !== "sell",
        openPositionState: state.openPositionState ?? undefined,
        eligibilityNote: options.eligibilityNote,
        summary: {
          snapshotCount: 1 + benchmarkSnapshotEvents.length,
          signalCount: signalAction === "hold" ? 0 : 1,
          entrySignalCount: signalAction === "buy" ? 1 : 0,
          exitSignalCount: signalAction === "sell" ? 1 : 0,
          syntheticCloseCount: 0,
          marketsTraded: signalAction === "hold" ? [] : [candidate.market],
          suppressedByReason:
            skippedReasons.length === 0
              ? {}
              : Object.fromEntries(skippedReasons.map((reason) => [reason, 1])),
        },
      },
      events,
    },
  };
}

export function buildBtc240mManagedScenario(
  observation: Btc240mObservationReport,
  state: ManagedDryRunState,
  strategyId = BTC_240M_STRATEGY_ID,
): Btc240mManagedScenarioResult {
  const candidate = observation.candidate;
  const openPosition = state.openPositionState?.market === candidate.market
    ? state.openPositionState
    : null;
  const holdExitDueAtMs = openPosition
    ? openPosition.enteredAtMs + candidate.holdBars * candidate.unitMinutes * 60_000
    : null;
  const generatedAtMs = Date.parse(observation.generatedAt);
  const holdElapsed = holdExitDueAtMs !== null && generatedAtMs >= holdExitDueAtMs;
  const viable = observation.decision.executionViability === "watch_candidate";
  const executableBid = executableSide(
    observation.orderbook.bestBid,
    observation.orderbook.bestBidSize,
    observation.orderbook.sellDepth,
    candidate.notionalKrw,
  );
  const executableAsk = executableSide(
    observation.orderbook.bestAsk,
    observation.orderbook.bestAskSize,
    observation.orderbook.buyDepth,
    candidate.notionalKrw,
  );
  const skippedReasons = [
    ...(observation.signal.active ? [] : ["signal_inactive"]),
    ...(viable ? [] : ["observation_not_execution_viable"]),
    ...(observation.orderbook.buyDepth.coversRequestedNotional ? [] : ["insufficient_buy_depth"]),
    ...(observation.orderbook.sellDepth.coversRequestedNotional ? [] : ["insufficient_sell_depth"]),
    ...(openPosition && !holdElapsed ? ["open_position_hold_window_active"] : []),
  ];
  const lastTradePrice =
    observation.ticker.tradePrice > 0
      ? observation.ticker.tradePrice
      : observation.orderbook.bestBid;
  const depthRatio =
    candidate.notionalKrw > 0
      ? Math.min(
          observation.orderbook.buyDepth.notionalKrw,
          observation.orderbook.sellDepth.notionalKrw,
        ) / candidate.notionalKrw
      : 0;
  const events: PaperSessionScenario["events"] = [
    {
      type: "snapshot",
      snapshot: {
        market: candidate.market,
        asOf: observation.generatedAt,
        lastTradePrice,
        bestBidPrice: executableBid.price,
        bestAskPrice: executableAsk.price,
        bestBidSize: executableBid.size,
        bestAskSize: executableAsk.size,
        spreadBps: observation.orderbook.spreadBps ?? 0,
        depthRatio: round(depthRatio),
        rolling24hNotional: observation.ticker.accTradePrice24h,
      },
    },
  ];

  let signalAction: Btc240mManagedScenarioResult["signalAction"] = "hold";
  if (openPosition && holdElapsed) {
    signalAction = "sell";
  } else if (!openPosition && skippedReasons.length === 0) {
    signalAction = "buy";
  }

  if (signalAction !== "hold") {
    const signal: SignalIntent = {
      schemaVersion: "1.0.0",
      signalId:
        signalAction === "buy"
          ? `${strategyId}-${candidate.market}-${observation.signal.latestCandleAt}`
          : `${strategyId}-${candidate.market}-${observation.signal.latestCandleAt}-hold-exit`,
      strategyId,
      market: candidate.market,
      side: signalAction,
      sizing:
        signalAction === "buy"
          ? { basis: "quote_notional", value: candidate.notionalKrw }
          : { basis: "position_fraction", value: 1 },
      confidence: 0.6,
      generatedAt: observation.generatedAt,
      expiresAt: new Date(generatedAtMs + 10 * 60_000).toISOString(),
      maxSlippageBps: 8,
      reduceOnly: signalAction === "sell",
      reasonCodes:
        signalAction === "buy"
          ? [
              "SIGNAL_MOMENTUM",
              "UNIT_240M",
              `LOOKBACK_${candidate.lookbackBars}`,
              `HOLD_${candidate.holdBars}`,
              `RISK_${candidate.riskFilter.toUpperCase()}`,
            ]
          : [
              "TIME_SERIES_HOLD_EXIT",
              "UNIT_240M",
              `HOLD_${candidate.holdBars}`,
            ],
      metadata: {
        latestCandleAt: observation.signal.latestCandleAt,
        previousCandleAt: observation.signal.previousCandleAt,
        lookbackReturnBps: observation.signal.lookbackReturnBps,
        riskValue: observation.signal.riskValue,
        expectedMedianEdgeBps: candidate.expectedMedianEdgeBps,
        holdExitDueAt:
          holdExitDueAtMs === null ? null : new Date(holdExitDueAtMs).toISOString(),
      },
    };
    events.push({ type: "signal", signal, receivedAt: observation.generatedAt });
  }

  return {
    skippedReasons,
    signalAction,
    scenario: {
      schemaVersion: "1.0.0",
      clockAt: observation.generatedAt,
      reconcileAt: observation.generatedAt,
      initialPortfolio: state.portfolio,
      metadata: {
        generatedAt: observation.generatedAt,
        strategyId,
        modeIntent: state.executionMode,
        initialCashKrw: state.portfolio.cashAvailable,
        initialEquityKrw: state.currentEquityKrw,
        entryProfile: strategyId,
        syntheticExitPolicy: "carry_open_until_hold_window",
        carryOpenPositions: signalAction !== "sell",
        openPositionState: state.openPositionState ?? undefined,
        eligibilityNote:
          "Managed BTC 240m momentum path. Buys only when the public observation is viable and no position is open; sells are reduce-only after the configured hold window.",
        summary: {
          snapshotCount: 1,
          signalCount: signalAction === "hold" ? 0 : 1,
          entrySignalCount: signalAction === "buy" ? 1 : 0,
          exitSignalCount: signalAction === "sell" ? 1 : 0,
          syntheticCloseCount: 0,
          marketsTraded: signalAction === "hold" ? [] : [candidate.market],
          suppressedByReason:
            skippedReasons.length === 0
              ? {}
              : Object.fromEntries(skippedReasons.map((reason) => [reason, 1])),
        },
      },
      events,
    },
  };
}

export function buildPieverse60mReversalManagedScenario(
  observation: Pieverse60mReversalObservationReport,
  state: ManagedDryRunState,
  options: { benchmarkSnapshots?: MarketSnapshot[] } = {},
): Pieverse60mReversalManagedScenarioResult {
  return buildManagedTimeSeriesScenario(observation, state, {
    strategyId: PIEVERSE_60M_REVERSAL_LB168_STRATEGY_ID,
    signalLabel: "REVERSAL",
    unitLabel: "60M",
    holdMinutes: observation.candidate.holdBars * observation.candidate.unitMinutes,
    eligibilityNote:
      "Managed PIEVERSE 60m reversal candidate path. Buys only when the public observation is viable and no position is open; sells are reduce-only after the configured hold window.",
    benchmarkSnapshots: options.benchmarkSnapshots,
  });
}

export function buildStable60mReversalManagedScenario(
  observation: Stable60mReversalObservationReport,
  state: ManagedDryRunState,
  options: { benchmarkSnapshots?: MarketSnapshot[] } = {},
): Stable60mReversalManagedScenarioResult {
  return buildManagedTimeSeriesScenario(observation, state, {
    strategyId: STABLE_60M_REVERSAL_STRATEGY_ID,
    signalLabel: "REVERSAL",
    unitLabel: "60M",
    holdMinutes: observation.candidate.holdBars * observation.candidate.unitMinutes,
    eligibilityNote:
      "Managed KRW-STABLE 60m reversal candidate path. Buys only when the public observation is viable and no position is open; sells are reduce-only after the configured hold window.",
    benchmarkSnapshots: options.benchmarkSnapshots,
  });
}

export function buildKrwH60mMomentumManagedScenario(
  observation: KrwH60mMomentumObservationReport,
  state: ManagedDryRunState,
  options: { benchmarkSnapshots?: MarketSnapshot[] } = {},
): KrwH60mMomentumManagedScenarioResult {
  return buildManagedTimeSeriesScenario(observation, state, {
    strategyId: KRW_H_60M_MOMENTUM_TOP_STRATEGY_ID,
    signalLabel: "MOMENTUM",
    unitLabel: "60M",
    holdMinutes: observation.candidate.holdBars * observation.candidate.unitMinutes,
    eligibilityNote:
      "Managed KRW-H 60m momentum candidate path. Buys only when the public observation is viable and no position is open; sells are reduce-only after the configured hold window.",
    benchmarkSnapshots: options.benchmarkSnapshots,
  });
}

function createInitialManagedState(
  initialCashKrw: number,
  configSignature: string,
  executionMode: "dry_run" | "paper" | "live",
): ManagedDryRunState {
  const startedAt = new Date().toISOString();
  return {
    schemaVersion: "1.0.0",
    configSignature,
    executionMode,
    runStartedAt: startedAt,
    runInitialEquityKrw: initialCashKrw,
    currentEquityKrw: initialCashKrw,
    portfolio: {
      cashAvailable: initialCashKrw,
      dailyRealizedPnl: 0,
      positions: {},
    },
    openPositionState: null,
  };
}

export function assertLiveKillSwitchClear(
  state: Pick<ManagedDryRunState, "killSwitch">,
  executionMode: "dry_run" | "paper" | "live",
) {
  if (executionMode !== "live" || state.killSwitch?.active !== true) {
    return;
  }

  throw new Error(
    `live startup blocked: kill switch active (${state.killSwitch.trigger}: ${state.killSwitch.reason})`,
  );
}

export function tripManagedKillSwitch(
  state: ManagedDryRunState,
  trigger: KillSwitchTrigger,
  reason: string,
  detail?: Record<string, unknown>,
  occurredAt: string = new Date().toISOString(),
): ManagedDryRunState {
  return {
    ...state,
    killSwitch: {
      active: true,
      trigger,
      reason,
      detail,
      occurredAt,
    },
  };
}

function asLiveAccountArray(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error("unexpected account entry shape");
      }
      return entry as Record<string, unknown>;
    });
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("unexpected accounts response shape");
  }

  const data = (raw as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    throw new Error("unexpected accounts response shape");
  }

  return data.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("unexpected account entry shape");
    }
    return entry as Record<string, unknown>;
  });
}

function parseFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parseFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseOrderChanceFeeRoundTripBps(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const chance = raw as Record<string, unknown>;
  const bidFee = parseFiniteNumberOrNull(chance.bid_fee);
  const askFee = parseFiniteNumberOrNull(chance.ask_fee);
  if (bidFee === null || askFee === null || bidFee < 0 || askFee < 0) {
    return null;
  }
  return (bidFee + askFee) * 10_000;
}

async function syncLiveManagedState(
  priorState: ManagedDryRunState,
  configSignature: string,
  expectedFeeRoundTripBps: number,
  feeCheckMarket: string,
): Promise<ManagedDryRunState> {
  const runtimeConfig = loadExecutionRuntimeConfig({
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRADING_MODE: "live",
      ENABLE_LIVE_EXECUTION: "true",
    },
  });

  if (!runtimeConfig.secrets.bithumbAccessKey || !runtimeConfig.secrets.bithumbSecretKey) {
    throw new Error("live mode requires exchange credentials");
  }

  const client = createBithumbPrivateClient({
    accessKey: runtimeConfig.secrets.bithumbAccessKey,
    secretKey: runtimeConfig.secrets.bithumbSecretKey,
    restBaseUrl: runtimeConfig.endpoints.bithumbRestBaseUrl,
  });

  return syncLiveManagedStateWithClient(priorState, configSignature, client, {
    expectedFeeRoundTripBps,
    feeCheckMarket,
    managedMarket: feeCheckMarket,
  });
}

function parseLiveManagedAccountSnapshot(
  accounts: Array<Record<string, unknown>>,
  priorState: ManagedDryRunState,
  managedMarket = "KRW-BTC",
): LiveManagedAccountSnapshot {
  const [, baseCurrencyRaw] = managedMarket.split("-");
  const baseCurrency = baseCurrencyRaw?.toUpperCase();
  if (!baseCurrency) {
    throw new Error(`live startup blocked: invalid managed market ${managedMarket}`);
  }

  let krwFree = 0;
  let krwLocked = 0;
  let baseBalance = 0;
  let baseLocked = 0;
  let baseAvgEntryPrice = priorState.portfolio.positions[managedMarket]?.avgEntryPrice ?? 0;
  const nonTradingCurrencies = new Set(["P"]);

  for (const account of accounts) {
    const currency =
      typeof account.currency === "string" ? account.currency.toUpperCase() : undefined;
    if (!currency) {
      continue;
    }

    const balance = parseFiniteNumber(account.balance);
    const locked = parseFiniteNumber(account.locked);

    if (currency === "KRW") {
      krwFree = balance;
      krwLocked = locked;
      continue;
    }

    if (currency === baseCurrency) {
      baseBalance = balance;
      baseLocked = locked;
      baseAvgEntryPrice = parseFiniteNumber(account.avg_buy_price);
      continue;
    }

    if (nonTradingCurrencies.has(currency)) {
      continue;
    }

    if (balance + locked > 1e-6) {
      throw new Error(
        `live startup blocked: non-${baseCurrency} asset balance detected for ${currency}`,
      );
    }
  }

  return {
    krwFree,
    krwLocked,
    baseBalance,
    baseLocked,
    baseAvgEntryPrice,
  };
}

export async function syncLiveManagedStateWithClient(
  priorState: ManagedDryRunState,
  configSignature: string,
  client: LiveAccountClient,
  options?: {
    expectedFeeRoundTripBps?: number;
    feeCheckMarket?: string;
    managedMarket?: string;
    maxAccountReads?: number;
    lockedBalanceRetryDelayMs?: number;
  },
): Promise<ManagedDryRunState> {
  const maxAccountReads = Math.max(1, options?.maxAccountReads ?? 2);
  const lockedBalanceRetryDelayMs = Math.max(0, options?.lockedBalanceRetryDelayMs ?? 250);
  let snapshot: LiveManagedAccountSnapshot | null = null;
  const expectedFeeRoundTripBps = options?.expectedFeeRoundTripBps;
  const feeCheckMarket = options?.feeCheckMarket ?? "KRW-BTC";
  const managedMarket = options?.managedMarket ?? feeCheckMarket;

  if (expectedFeeRoundTripBps !== undefined) {
    if (client.getOrderChance === undefined) {
      throw new Error(`live startup blocked: ${feeCheckMarket} account fee schedule is unavailable`);
    }
    const actualFeeRoundTripBps = parseOrderChanceFeeRoundTripBps(
      await client.getOrderChance(feeCheckMarket),
    );
    if (actualFeeRoundTripBps === null) {
      throw new Error(`live startup blocked: ${feeCheckMarket} account fee schedule is unavailable`);
    }
    if (actualFeeRoundTripBps > expectedFeeRoundTripBps + 1e-9) {
      throw new Error(
        `live startup blocked: ${feeCheckMarket} account fee round-trip bps ${actualFeeRoundTripBps} exceeds configured ${expectedFeeRoundTripBps}`,
      );
    }
  }

  for (let attempt = 1; attempt <= maxAccountReads; attempt += 1) {
    const accounts = asLiveAccountArray(await client.getAccounts());
    snapshot = parseLiveManagedAccountSnapshot(accounts, priorState, managedMarket);
    if (snapshot.krwLocked <= 1 && snapshot.baseLocked <= 1e-10) {
      break;
    }

    if (attempt < maxAccountReads) {
      await sleep(lockedBalanceRetryDelayMs);
    }
  }

  if (snapshot === null) {
    throw new Error("live startup blocked: unable to load exchange accounts");
  }

  const {
    krwFree,
    krwLocked,
    baseBalance,
    baseLocked,
    baseAvgEntryPrice,
  } = snapshot;

  if (krwLocked > 1 || baseLocked > 1e-10) {
    throw new Error("live startup blocked: locked balances detected; clear open orders first");
  }

  const portfolio: PortfolioState = {
    cashAvailable: krwFree,
    dailyRealizedPnl: priorState.portfolio.dailyRealizedPnl,
    positions:
      baseBalance > 1e-10
        ? {
            [managedMarket]: {
              market: managedMarket,
              baseQuantity: baseBalance,
              avgEntryPrice: baseAvgEntryPrice,
              realizedPnl: priorState.portfolio.positions[managedMarket]?.realizedPnl ?? 0,
            },
          }
        : {},
  };

  const nextEquity =
    krwFree + baseBalance * (baseAvgEntryPrice > 0 ? baseAvgEntryPrice : 0);
  const syncedAtMs = Date.now();
  const priorOpenPositionState =
    priorState.openPositionState?.market === managedMarket
      ? priorState.openPositionState
      : null;
  const openPositionState =
    baseBalance > 1e-10
      ? {
          market: managedMarket,
          enteredAtMs: normalizeNonNegativeInteger(
            priorOpenPositionState?.enteredAtMs && priorOpenPositionState.enteredAtMs > 0
              ? priorOpenPositionState.enteredAtMs
              : undefined,
            syncedAtMs,
          ),
          entryPrice: normalizePositiveNumber(
            baseAvgEntryPrice,
            normalizePositiveNumber(priorOpenPositionState?.entryPrice, 0),
          ),
          quantity: baseBalance,
          quoteNotional: baseBalance * (baseAvgEntryPrice > 0 ? baseAvgEntryPrice : 0),
          consecutiveNegativeRet1m: normalizeNonNegativeInteger(
            priorOpenPositionState?.consecutiveNegativeRet1m,
            0,
          ),
          consecutiveBookFailures: normalizeNonNegativeInteger(
            priorOpenPositionState?.consecutiveBookFailures,
            0,
          ),
          peakBidPrice: Math.max(
            normalizePositiveNumber(priorOpenPositionState?.peakBidPrice, 0),
            normalizePositiveNumber(baseAvgEntryPrice, 0),
          ),
        }
      : null;

  return {
    ...priorState,
    configSignature,
    executionMode: "live",
    runInitialEquityKrw:
      priorState.runInitialEquityKrw > 0 ? priorState.runInitialEquityKrw : nextEquity,
    currentEquityKrw: nextEquity,
    portfolio,
    openPositionState,
  };
}

export function buildCarryForwardPortfolio(
  portfolio: PortfolioState,
): PortfolioState {
  return {
    ...portfolio,
    positions: Object.fromEntries(
      Object.entries(portfolio.positions)
        .filter(([, position]) => Math.abs(position.baseQuantity) > 1e-12)
        .map(([market, position]) => [market, { ...position }]),
    ),
  };
}

export function deriveCarryForwardOpenPositionState(
  report: SessionReportLike,
): ManagedOpenPositionState | null {
  const openPositions = Object.values(report.portfolio.positions).filter(
    (position) => Math.abs(position.baseQuantity) > 1e-12,
  );
  if (openPositions.length === 0) {
    return null;
  }
  if (openPositions.length > 1) {
    throw new Error("multiple open positions are not supported for carry-forward");
  }

  const actualPosition = openPositions[0]!;
  const metadataState = report.scenarioMetadata?.openPositionState;
  const metadataMatchesMarket = metadataState?.market === actualPosition.market;
  const snapshot = report.latestSnapshots[actualPosition.market];
  if (!snapshot) {
    throw new Error(
      `missing latest snapshot for carried market ${actualPosition.market}`,
    );
  }
  const peakBidPrice = Math.max(
    metadataMatchesMarket
      ? normalizePositiveNumber(metadataState.peakBidPrice, Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY,
    snapshot.bestBidPrice ?? snapshot.lastTradePrice ?? 0,
    actualPosition.avgEntryPrice ?? 0,
  );
  const generatedAtMs = Date.parse(report.generatedAt);
  const fallbackEnteredAtMs = Number.isFinite(generatedAtMs) ? generatedAtMs : Date.now();
  const computedQuoteNotional =
    actualPosition.baseQuantity * (actualPosition.avgEntryPrice ?? 0);

  return {
    market: actualPosition.market,
    enteredAtMs:
      metadataMatchesMarket && metadataState.enteredAtMs > 0
        ? metadataState.enteredAtMs
        : fallbackEnteredAtMs,
    entryPrice: actualPosition.avgEntryPrice ?? 0,
    quantity: actualPosition.baseQuantity,
    quoteNotional: computedQuoteNotional,
    consecutiveNegativeRet1m:
      metadataMatchesMarket
        ? normalizeNonNegativeInteger(metadataState.consecutiveNegativeRet1m, 0)
        : 0,
    consecutiveBookFailures:
      metadataMatchesMarket
        ? normalizeNonNegativeInteger(metadataState.consecutiveBookFailures, 0)
        : 0,
    peakBidPrice,
  };
}

function extractPathLine(lines: string[], pattern: RegExp, label: string): string {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const value = lines[index]?.trim();
    if (value && pattern.test(value)) {
      return value;
    }
  }

  throw new Error(`missing ${label} in command output`);
}

function extractRunIdFromManifestPath(manifestPath: string): string {
  const match = /manifest-(.+)\.json$/u.exec(manifestPath);
  if (!match) {
    throw new Error(`unable to infer run id from manifest path: ${manifestPath}`);
  }

  return match[1];
}

async function runCommand(
  label: string,
  command: string,
  args: string[],
  env?: Record<string, string | undefined>,
): Promise<CommandResult> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.on("error", rejectPromise);

    const stdout = child.stdout;
    if (stdout) {
      const reader = createInterface({ input: stdout });
      reader.on("line", (line) => {
        stdoutLines.push(line);
        process.stdout.write(`[${label}] ${line}\n`);
      });
    }

    const stderr = child.stderr;
    if (stderr) {
      const reader = createInterface({ input: stderr });
      reader.on("line", (line) => {
        stderrLines.push(line);
        process.stderr.write(`[${label}] ${line}\n`);
      });
    }

    child.on("close", (code) => {
      resolvePromise({
        code: code ?? 1,
        stdoutLines,
        stderrLines,
      });
    });
  });
}

async function requireSuccessfulCommand(
  label: string,
  command: string,
  args: string[],
  retryOptions?: CommandRetryOptions,
): Promise<CommandResult> {
  const maxAttempts = Math.max(1, retryOptions?.maxAttempts ?? 1);
  let lastResult: CommandResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runCommand(label, command, args);
    if (result.code === 0) {
      return result;
    }

    lastResult = result;
    if (
      attempt >= maxAttempts ||
      !isRetryableDryRunCommandFailure(label, result)
    ) {
      break;
    }

    const delayMs =
      retryOptions?.retryDelayMs[attempt - 1] ??
      retryOptions?.retryDelayMs.at(-1) ??
      10_000;
    process.stderr.write(
      `${JSON.stringify({
        event: "managed_dry_run_command_retry",
        label,
        attempt,
        maxAttempts,
        delayMs,
        status: result.code,
      })}\n`,
    );
    await sleep(delayMs);
  }

  throw new DryRunCommandFailureError(
    label,
    lastResult ?? { code: 1, stdoutLines: [], stderrLines: [] },
  );
}

export function isRetryableDryRunCommandFailure(
  label: string,
  result: CommandResult,
): boolean {
  if (label !== "bootstrap" || result.code === 0) {
    return false;
  }

  const output = [...result.stdoutLines, ...result.stderrLines]
    .join("\n")
    .toLowerCase();
  return /http 5\d\d|invalidstatus|connection|timed out|timeout|websocket|network|econnreset|enotfound|eai_again|temporar|too many requests|rate limit/u.test(
    output,
  );
}

export function classifyDryRunCommandFailure(
  label: string,
  result: CommandResult,
): string | null {
  const output = [...result.stdoutLines, ...result.stderrLines]
    .join("\n")
    .toLowerCase();

  if (output.includes("no enriched market points found")) {
    return "no_enriched_market_points";
  }

  if (output.includes("invalid_paper_session_scenario")) {
    return "invalid_paper_session_scenario";
  }

  if (isRetryableDryRunCommandFailure(label, result)) {
    return "retryable_bootstrap_failure";
  }

  return null;
}

async function runBtc240mManagedCycle(
  cycle: number,
  config: ReturnType<typeof loadDryRunServiceConfig>,
  syncedState: ManagedDryRunState,
  startedAt: string,
) {
  const profile = btc240mProfileConfig(config.entryProfile);
  if (profile === null) {
    throw new Error("BTC 240m managed cycle requires a BTC 240m entry profile");
  }
  const artifactSlug = artifactTimestampSlug(startedAt);
  const observationPath = resolve(
    config.logDir,
    `btc-240m-momentum-observation-cycle-${cycle}-${artifactSlug}.json`,
  );
  const scenarioPath = resolve(
    config.logDir,
    `btc-240m-momentum-scenario-cycle-${cycle}-${artifactSlug}.json`,
  );

  await requireSuccessfulCommand(
    "btc-240m-observation",
    process.execPath,
    [
      cliPath("observe-bithumb-reversal-candidate.js"),
      "--market",
      "KRW-BTC",
      "--signal-mode",
      "momentum",
      "--unit-minutes",
      "240",
      "--lookback-bars",
      String(profile.lookbackBars),
      "--hold-bars",
      String(profile.holdBars),
      "--min-return-bps",
      String(profile.minReturnBps),
      "--risk-filter",
      profile.riskFilter,
      "--risk-threshold",
      String(profile.riskThreshold),
      "--notional-krw",
      String(profile.notionalKrw),
      "--expected-median-edge-bps",
      String(profile.expectedMedianEdgeBps),
      "--output",
      observationPath,
    ],
  );

  const observation = normalizeBtc240mObservation(
    JSON.parse(await readFile(observationPath, "utf8")) as unknown,
  );
  const { scenario, skippedReasons, signalAction } = buildBtc240mManagedScenario(
    observation,
    syncedState,
    profile.strategyId,
  );
  await mkdir(dirname(scenarioPath), { recursive: true });
  await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");

  const sessionReport = await executePaperSessionScenario({
    scenarioPath,
    cwd: process.cwd(),
    runtimeConfig: {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRADING_MODE: config.executionMode,
        ENABLE_LIVE_EXECUTION: config.executionMode === "live" ? "true" : "false",
      },
    },
  });
  const initialCashKrw = sessionReport.scenarioMetadata?.initialCashKrw;
  const initialEquityKrw =
    sessionReport.scenarioMetadata?.initialEquityKrw ?? syncedState.currentEquityKrw;
  const endingCashKrw = sessionReport.portfolio.cashAvailable;
  const endingEquityKrw = estimatePortfolioEquity(sessionReport);
  const realizedPnlKrw = sessionReport.portfolio.dailyRealizedPnl;
  const markedPnlKrw =
    typeof initialEquityKrw === "number" ? endingEquityKrw - initialEquityKrw : null;
  const returnPct =
    typeof initialEquityKrw === "number" && initialEquityKrw > 0
      ? ((endingEquityKrw - initialEquityKrw) / initialEquityKrw) * 100
      : null;
  const completedAt = new Date().toISOString();

  if (!sessionReport.reconciliation.ok) {
    if (config.executionMode === "live") {
      await writeManagedState(
        config.statePath,
        tripManagedKillSwitch(
          syncedState,
          "reconciliation_mismatch",
          `BTC 240m managed session reconciliation failed for cycle ${cycle}`,
          {
            scenarioPath,
            sessionId: sessionReport.sessionId,
          },
          completedAt,
        ),
      );
    }
    throw new Error(`BTC 240m managed session reconciliation failed for cycle ${cycle}`);
  }

  const nextState: ManagedDryRunState = {
    ...syncedState,
    currentEquityKrw: endingEquityKrw,
    portfolio: buildCarryForwardPortfolio(sessionReport.portfolio),
    openPositionState: deriveCarryForwardOpenPositionState(sessionReport),
    lastCompletedAt: completedAt,
    lastSessionId: sessionReport.sessionId,
    cycle,
  };
  await writeManagedState(config.statePath, nextState);
  const payload = {
    event: "managed_dry_run_cycle_completed",
    cycle,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    executionMode: config.executionMode,
    runId: `btc-240m-cycle-${cycle}`,
    entryProfile: profile.strategyId,
    exitProfile: config.exitProfile,
    syntheticExitPolicy: "carry_open_until_hold_window",
    observationPath,
    scenarioPath,
    signalAction,
    skippedReasons,
    session: {
      sessionId: sessionReport.sessionId,
      generatedAt: sessionReport.generatedAt,
      mode: sessionReport.mode,
      processedEvents: sessionReport.processedEvents,
      reconciliationOk: sessionReport.reconciliation.ok,
      rejectDecisions: sessionReport.rejectLedger.totalRejectedDecisions,
      orderCount: sessionReport.ledger.orders.length,
      fillCount: sessionReport.ledger.fills.length,
      decisionCount: sessionReport.ledger.decisions.length,
      initialCashKrw,
      initialEquityKrw,
      endingCashKrw,
      endingEquityKrw,
      realizedPnlKrw,
      markedPnlKrw,
      returnPct,
      runInitialEquityKrw: syncedState.runInitialEquityKrw,
      runCumulativeReturnPct:
        syncedState.runInitialEquityKrw > 0
          ? ((endingEquityKrw - syncedState.runInitialEquityKrw) /
              syncedState.runInitialEquityKrw) *
            100
          : null,
      openPositionCount: countOpenPositions(sessionReport),
      carryOpenPositions:
        sessionReport.scenarioMetadata?.carryOpenPositions === true,
      suppressions: sessionReport.suppressionSummary,
      artifactPaths: sessionReport.artifacts,
    },
  };

  await appendJsonLine(config.cycleLogPath, payload);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function runPieverse60mReversalManagedCycle(
  cycle: number,
  config: ReturnType<typeof loadDryRunServiceConfig>,
  syncedState: ManagedDryRunState,
  startedAt: string,
) {
  const profile = pieverse60mReversalProfileConfig(config.entryProfile);
  if (profile === null) {
    throw new Error("PIEVERSE 60m reversal managed cycle requires the PIEVERSE 60m reversal entry profile");
  }
  const artifactSlug = artifactTimestampSlug(startedAt);
  const observationPath = resolve(
    config.logDir,
    `pieverse-60m-reversal-lb168-observation-cycle-${cycle}-${artifactSlug}.json`,
  );
  const scenarioPath = resolve(
    config.logDir,
    `pieverse-60m-reversal-lb168-scenario-cycle-${cycle}-${artifactSlug}.json`,
  );

  await requireSuccessfulCommand(
    "pieverse-60m-reversal-observation",
    process.execPath,
    [
      cliPath("observe-bithumb-reversal-candidate.js"),
      "--market",
      "KRW-PIEVERSE",
      "--signal-mode",
      "reversal",
      "--unit-minutes",
      "60",
      "--lookback-bars",
      String(profile.lookbackBars),
      "--hold-bars",
      String(profile.holdBars),
      "--min-return-bps",
      String(profile.minReturnBps),
      "--min-drop-bps",
      String(profile.minDropBps),
      "--risk-filter",
      profile.riskFilter,
      "--risk-threshold",
      String(profile.riskThreshold),
      "--notional-krw",
      String(profile.notionalKrw),
      "--expected-median-edge-bps",
      String(profile.expectedMedianEdgeBps),
      "--output",
      observationPath,
    ],
  );

  const observation = normalizePieverse60mReversalObservation(
    JSON.parse(await readFile(observationPath, "utf8")) as unknown,
  );
  const btcBenchmarkSnapshot = await fetchBithumbBenchmarkSnapshot(
    "KRW-BTC",
    Math.max(syncedState.currentEquityKrw, profile.notionalKrw),
  );
  const { scenario, skippedReasons, signalAction } =
    buildPieverse60mReversalManagedScenario(observation, syncedState, {
      benchmarkSnapshots: [btcBenchmarkSnapshot],
    });
  await mkdir(dirname(scenarioPath), { recursive: true });
  await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");

  const sessionReport = await executePaperSessionScenario({
    scenarioPath,
    cwd: process.cwd(),
    runtimeConfig: {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRADING_MODE: config.executionMode,
        ENABLE_LIVE_EXECUTION: config.executionMode === "live" ? "true" : "false",
      },
    },
  });
  const initialCashKrw = sessionReport.scenarioMetadata?.initialCashKrw;
  const initialEquityKrw =
    sessionReport.scenarioMetadata?.initialEquityKrw ?? syncedState.currentEquityKrw;
  const endingCashKrw = sessionReport.portfolio.cashAvailable;
  const endingEquityKrw = estimatePortfolioEquity(sessionReport);
  const realizedPnlKrw = sessionReport.portfolio.dailyRealizedPnl;
  const markedPnlKrw =
    typeof initialEquityKrw === "number" ? endingEquityKrw - initialEquityKrw : null;
  const returnPct =
    typeof initialEquityKrw === "number" && initialEquityKrw > 0
      ? ((endingEquityKrw - initialEquityKrw) / initialEquityKrw) * 100
      : null;
  const completedAt = new Date().toISOString();

  if (!sessionReport.reconciliation.ok) {
    if (config.executionMode === "live") {
      await writeManagedState(
        config.statePath,
        tripManagedKillSwitch(
          syncedState,
          "reconciliation_mismatch",
          `PIEVERSE 60m reversal managed session reconciliation failed for cycle ${cycle}`,
          {
            scenarioPath,
            sessionId: sessionReport.sessionId,
          },
          completedAt,
        ),
      );
    }
    throw new Error(`PIEVERSE 60m reversal managed session reconciliation failed for cycle ${cycle}`);
  }

  const nextState: ManagedDryRunState = {
    ...syncedState,
    currentEquityKrw: endingEquityKrw,
    portfolio: buildCarryForwardPortfolio(sessionReport.portfolio),
    openPositionState: deriveCarryForwardOpenPositionState(sessionReport),
    lastCompletedAt: completedAt,
    lastSessionId: sessionReport.sessionId,
    cycle,
  };
  await writeManagedState(config.statePath, nextState);
  const payload = {
    event: "managed_dry_run_cycle_completed",
    cycle,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    executionMode: config.executionMode,
    runId: `pieverse-60m-reversal-lb168-cycle-${cycle}`,
    entryProfile: profile.strategyId,
    exitProfile: "time_series_hold_exit",
    syntheticExitPolicy: "carry_open_until_hold_window",
    observationPath,
    scenarioPath,
    signalAction,
    skippedReasons,
    session: {
      sessionId: sessionReport.sessionId,
      generatedAt: sessionReport.generatedAt,
      mode: sessionReport.mode,
      processedEvents: sessionReport.processedEvents,
      reconciliationOk: sessionReport.reconciliation.ok,
      rejectDecisions: sessionReport.rejectLedger.totalRejectedDecisions,
      orderCount: sessionReport.ledger.orders.length,
      fillCount: sessionReport.ledger.fills.length,
      decisionCount: sessionReport.ledger.decisions.length,
      initialCashKrw,
      initialEquityKrw,
      endingCashKrw,
      endingEquityKrw,
      realizedPnlKrw,
      markedPnlKrw,
      returnPct,
      runInitialEquityKrw: syncedState.runInitialEquityKrw,
      runCumulativeReturnPct:
        syncedState.runInitialEquityKrw > 0
          ? ((endingEquityKrw - syncedState.runInitialEquityKrw) /
              syncedState.runInitialEquityKrw) *
            100
          : null,
      openPositionCount: countOpenPositions(sessionReport),
      carryOpenPositions:
        sessionReport.scenarioMetadata?.carryOpenPositions === true,
      suppressions: sessionReport.suppressionSummary,
      artifactPaths: sessionReport.artifacts,
    },
  };

  await appendJsonLine(config.cycleLogPath, payload);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function runStable60mReversalManagedCycle(
  cycle: number,
  config: ReturnType<typeof loadDryRunServiceConfig>,
  syncedState: ManagedDryRunState,
  startedAt: string,
) {
  const profile = stable60mReversalProfileConfig(config.entryProfile);
  if (profile === null) {
    throw new Error("KRW-STABLE 60m reversal managed cycle requires the KRW-STABLE 60m reversal entry profile");
  }
  const artifactSlug = artifactTimestampSlug(startedAt);
  const observationPath = resolve(
    config.logDir,
    `stable-60m-reversal-observation-cycle-${cycle}-${artifactSlug}.json`,
  );
  const scenarioPath = resolve(
    config.logDir,
    `stable-60m-reversal-scenario-cycle-${cycle}-${artifactSlug}.json`,
  );

  await requireSuccessfulCommand(
    "stable-60m-reversal-observation",
    process.execPath,
    [
      cliPath("observe-bithumb-reversal-candidate.js"),
      "--market",
      "KRW-STABLE",
      "--signal-mode",
      "reversal",
      "--unit-minutes",
      "60",
      "--lookback-bars",
      String(profile.lookbackBars),
      "--hold-bars",
      String(profile.holdBars),
      "--min-return-bps",
      String(profile.minReturnBps),
      "--min-drop-bps",
      String(profile.minDropBps),
      "--risk-filter",
      profile.riskFilter,
      "--risk-threshold",
      String(profile.riskThreshold),
      "--notional-krw",
      String(profile.notionalKrw),
      "--expected-median-edge-bps",
      String(profile.expectedMedianEdgeBps),
      "--output",
      observationPath,
    ],
  );

  const observation = normalizeStable60mReversalObservation(
    JSON.parse(await readFile(observationPath, "utf8")) as unknown,
  );
  const btcBenchmarkSnapshot = await fetchBithumbBenchmarkSnapshot(
    "KRW-BTC",
    Math.max(syncedState.currentEquityKrw, profile.notionalKrw),
  );
  const { scenario, skippedReasons, signalAction } =
    buildStable60mReversalManagedScenario(observation, syncedState, {
      benchmarkSnapshots: [btcBenchmarkSnapshot],
    });
  await mkdir(dirname(scenarioPath), { recursive: true });
  await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");

  const sessionReport = await executePaperSessionScenario({
    scenarioPath,
    cwd: process.cwd(),
    runtimeConfig: {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRADING_MODE: config.executionMode,
        ENABLE_LIVE_EXECUTION: config.executionMode === "live" ? "true" : "false",
      },
    },
  });
  const initialCashKrw = sessionReport.scenarioMetadata?.initialCashKrw;
  const initialEquityKrw =
    sessionReport.scenarioMetadata?.initialEquityKrw ?? syncedState.currentEquityKrw;
  const endingCashKrw = sessionReport.portfolio.cashAvailable;
  const endingEquityKrw = estimatePortfolioEquity(sessionReport);
  const realizedPnlKrw = sessionReport.portfolio.dailyRealizedPnl;
  const markedPnlKrw =
    typeof initialEquityKrw === "number" ? endingEquityKrw - initialEquityKrw : null;
  const returnPct =
    typeof initialEquityKrw === "number" && initialEquityKrw > 0
      ? ((endingEquityKrw - initialEquityKrw) / initialEquityKrw) * 100
      : null;
  const completedAt = new Date().toISOString();

  if (!sessionReport.reconciliation.ok) {
    if (config.executionMode === "live") {
      await writeManagedState(
        config.statePath,
        tripManagedKillSwitch(
          syncedState,
          "reconciliation_mismatch",
          `KRW-STABLE 60m reversal managed session reconciliation failed for cycle ${cycle}`,
          {
            scenarioPath,
            sessionId: sessionReport.sessionId,
          },
          completedAt,
        ),
      );
    }
    throw new Error(`KRW-STABLE 60m reversal managed session reconciliation failed for cycle ${cycle}`);
  }

  const nextState: ManagedDryRunState = {
    ...syncedState,
    currentEquityKrw: endingEquityKrw,
    portfolio: buildCarryForwardPortfolio(sessionReport.portfolio),
    openPositionState: deriveCarryForwardOpenPositionState(sessionReport),
    lastCompletedAt: completedAt,
    lastSessionId: sessionReport.sessionId,
    cycle,
  };
  await writeManagedState(config.statePath, nextState);
  const payload = {
    event: "managed_dry_run_cycle_completed",
    cycle,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    executionMode: config.executionMode,
    runId: `stable-60m-reversal-cycle-${cycle}`,
    entryProfile: profile.strategyId,
    exitProfile: "time_series_hold_exit",
    syntheticExitPolicy: "carry_open_until_hold_window",
    observationPath,
    scenarioPath,
    signalAction,
    skippedReasons,
    session: {
      sessionId: sessionReport.sessionId,
      generatedAt: sessionReport.generatedAt,
      mode: sessionReport.mode,
      processedEvents: sessionReport.processedEvents,
      reconciliationOk: sessionReport.reconciliation.ok,
      rejectDecisions: sessionReport.rejectLedger.totalRejectedDecisions,
      orderCount: sessionReport.ledger.orders.length,
      fillCount: sessionReport.ledger.fills.length,
      decisionCount: sessionReport.ledger.decisions.length,
      initialCashKrw,
      initialEquityKrw,
      endingCashKrw,
      endingEquityKrw,
      realizedPnlKrw,
      markedPnlKrw,
      returnPct,
      runInitialEquityKrw: syncedState.runInitialEquityKrw,
      runCumulativeReturnPct:
        syncedState.runInitialEquityKrw > 0
          ? ((endingEquityKrw - syncedState.runInitialEquityKrw) /
              syncedState.runInitialEquityKrw) *
            100
          : null,
      openPositionCount: countOpenPositions(sessionReport),
      carryOpenPositions:
        sessionReport.scenarioMetadata?.carryOpenPositions === true,
      suppressions: sessionReport.suppressionSummary,
      artifactPaths: sessionReport.artifacts,
    },
  };

  await appendJsonLine(config.cycleLogPath, payload);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function runKrwH60mMomentumManagedCycle(
  cycle: number,
  config: ReturnType<typeof loadDryRunServiceConfig>,
  syncedState: ManagedDryRunState,
  startedAt: string,
) {
  const profile = krwH60mMomentumProfileConfig(config.entryProfile);
  if (profile === null) {
    throw new Error("KRW-H 60m momentum managed cycle requires the KRW-H 60m momentum entry profile");
  }
  const artifactSlug = artifactTimestampSlug(startedAt);
  const observationPath = resolve(
    config.logDir,
    `krw-h-60m-momentum-observation-cycle-${cycle}-${artifactSlug}.json`,
  );
  const scenarioPath = resolve(
    config.logDir,
    `krw-h-60m-momentum-scenario-cycle-${cycle}-${artifactSlug}.json`,
  );

  await requireSuccessfulCommand(
    "krw-h-60m-momentum-observation",
    process.execPath,
    [
      cliPath("observe-bithumb-reversal-candidate.js"),
      "--market",
      "KRW-H",
      "--signal-mode",
      "momentum",
      "--unit-minutes",
      "60",
      "--lookback-bars",
      String(profile.lookbackBars),
      "--hold-bars",
      String(profile.holdBars),
      "--min-return-bps",
      String(profile.minReturnBps),
      "--min-drop-bps",
      String(profile.minDropBps),
      "--risk-filter",
      profile.riskFilter,
      "--risk-threshold",
      String(profile.riskThreshold),
      "--notional-krw",
      String(profile.notionalKrw),
      "--expected-median-edge-bps",
      String(profile.expectedMedianEdgeBps),
      "--output",
      observationPath,
    ],
  );

  const observation = normalizeKrwH60mMomentumObservation(
    JSON.parse(await readFile(observationPath, "utf8")) as unknown,
  );
  const btcBenchmarkSnapshot = await fetchBithumbBenchmarkSnapshot(
    "KRW-BTC",
    Math.max(syncedState.currentEquityKrw, profile.notionalKrw),
  );
  const { scenario, skippedReasons, signalAction } =
    buildKrwH60mMomentumManagedScenario(observation, syncedState, {
      benchmarkSnapshots: [btcBenchmarkSnapshot],
    });
  await mkdir(dirname(scenarioPath), { recursive: true });
  await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");

  const sessionReport = await executePaperSessionScenario({
    scenarioPath,
    cwd: process.cwd(),
    runtimeConfig: {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRADING_MODE: config.executionMode,
        ENABLE_LIVE_EXECUTION: config.executionMode === "live" ? "true" : "false",
      },
    },
  });
  const initialCashKrw = sessionReport.scenarioMetadata?.initialCashKrw;
  const initialEquityKrw =
    sessionReport.scenarioMetadata?.initialEquityKrw ?? syncedState.currentEquityKrw;
  const endingCashKrw = sessionReport.portfolio.cashAvailable;
  const endingEquityKrw = estimatePortfolioEquity(sessionReport);
  const realizedPnlKrw = sessionReport.portfolio.dailyRealizedPnl;
  const markedPnlKrw =
    typeof initialEquityKrw === "number" ? endingEquityKrw - initialEquityKrw : null;
  const returnPct =
    typeof initialEquityKrw === "number" && initialEquityKrw > 0
      ? ((endingEquityKrw - initialEquityKrw) / initialEquityKrw) * 100
      : null;
  const completedAt = new Date().toISOString();

  if (!sessionReport.reconciliation.ok) {
    if (config.executionMode === "live") {
      await writeManagedState(
        config.statePath,
        tripManagedKillSwitch(
          syncedState,
          "reconciliation_mismatch",
          `KRW-H 60m momentum managed session reconciliation failed for cycle ${cycle}`,
          {
            scenarioPath,
            sessionId: sessionReport.sessionId,
          },
          completedAt,
        ),
      );
    }
    throw new Error(`KRW-H 60m momentum managed session reconciliation failed for cycle ${cycle}`);
  }

  const nextState: ManagedDryRunState = {
    ...syncedState,
    currentEquityKrw: endingEquityKrw,
    portfolio: buildCarryForwardPortfolio(sessionReport.portfolio),
    openPositionState: deriveCarryForwardOpenPositionState(sessionReport),
    lastCompletedAt: completedAt,
    lastSessionId: sessionReport.sessionId,
    cycle,
  };
  await writeManagedState(config.statePath, nextState);
  const payload = {
    event: "managed_dry_run_cycle_completed",
    cycle,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    executionMode: config.executionMode,
    runId: `krw-h-60m-momentum-cycle-${cycle}`,
    entryProfile: profile.strategyId,
    exitProfile: "time_series_hold_exit",
    syntheticExitPolicy: "carry_open_until_hold_window",
    observationPath,
    scenarioPath,
    signalAction,
    skippedReasons,
    session: {
      sessionId: sessionReport.sessionId,
      generatedAt: sessionReport.generatedAt,
      mode: sessionReport.mode,
      processedEvents: sessionReport.processedEvents,
      reconciliationOk: sessionReport.reconciliation.ok,
      rejectDecisions: sessionReport.rejectLedger.totalRejectedDecisions,
      orderCount: sessionReport.ledger.orders.length,
      fillCount: sessionReport.ledger.fills.length,
      decisionCount: sessionReport.ledger.decisions.length,
      initialCashKrw,
      initialEquityKrw,
      endingCashKrw,
      endingEquityKrw,
      realizedPnlKrw,
      markedPnlKrw,
      returnPct,
      runInitialEquityKrw: syncedState.runInitialEquityKrw,
      runCumulativeReturnPct:
        syncedState.runInitialEquityKrw > 0
          ? ((endingEquityKrw - syncedState.runInitialEquityKrw) /
              syncedState.runInitialEquityKrw) *
            100
          : null,
      openPositionCount: countOpenPositions(sessionReport),
      carryOpenPositions:
        sessionReport.scenarioMetadata?.carryOpenPositions === true,
      suppressions: sessionReport.suppressionSummary,
      artifactPaths: sessionReport.artifacts,
    },
  };

  await appendJsonLine(config.cycleLogPath, payload);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function runDryRunCycle(cycle: number) {
  const config = loadDryRunServiceConfig();
  const configSignature = buildConfigSignature(config);
  const loadedState = await readManagedState(config.statePath);
  const priorState =
    loadedState ??
    createInitialManagedState(
      config.executionMode === "live" ? 0 : config.initialCashKrw,
      configSignature,
      config.executionMode,
    );
  if (priorState.configSignature !== configSignature) {
    throw new Error(
      `managed dry run state was created under different execution settings; reset ${config.statePath} before continuing`,
    );
  }
  assertLiveKillSwitchClear(priorState, config.executionMode);
  const syncedState =
    config.executionMode === "live"
        ? await syncLiveManagedState(
          {
            ...priorState,
            executionMode: "live",
          },
          configSignature,
          config.liveTradingFeeRoundTripBps ?? 0,
          config.bootstrap.markets,
        )
      : {
          ...priorState,
          executionMode: config.executionMode,
        };
  await writeManagedState(config.statePath, syncedState);
  const startedAt = new Date().toISOString();
  if (btc240mProfileConfig(config.entryProfile) !== null) {
    await runBtc240mManagedCycle(cycle, config, syncedState, startedAt);
    return;
  }
  if (pieverse60mReversalProfileConfig(config.entryProfile) !== null) {
    await runPieverse60mReversalManagedCycle(cycle, config, syncedState, startedAt);
    return;
  }
  if (stable60mReversalProfileConfig(config.entryProfile) !== null) {
    await runStable60mReversalManagedCycle(cycle, config, syncedState, startedAt);
    return;
  }
  if (krwH60mMomentumProfileConfig(config.entryProfile) !== null) {
    await runKrwH60mMomentumManagedCycle(cycle, config, syncedState, startedAt);
    return;
  }

  const bootstrapArgs = [
    "-m",
    "org_coin_data",
    "bootstrap",
    "--base-dir",
    config.baseDir,
    "--markets",
    config.bootstrap.markets,
    "--freshness-sla-ms",
    String(config.bootstrap.freshnessSlaMs),
    "--candle-count",
    String(config.bootstrap.candleCount),
    "--trade-count",
    String(config.bootstrap.tradeCount),
    "--ws-seconds",
    String(config.bootstrap.wsSeconds),
    "--trade-warmup-seconds",
    String(config.bootstrap.tradeWarmupSeconds),
    "--iterations",
    String(config.bootstrap.iterations),
    "--interval-seconds",
    String(config.bootstrap.intervalSeconds),
    "--ws-channels",
    config.bootstrap.wsChannels,
  ];
  const bootstrap = await requireSuccessfulCommand(
    "bootstrap",
    config.pythonBin,
    bootstrapArgs,
    {
      maxAttempts: 3,
      retryDelayMs: [10_000, 30_000],
    },
  );
  const manifestPath = extractPathLine(
    bootstrap.stdoutLines,
    /manifest-.*\.json$/u,
    "manifest path",
  );
  const qualityMarkdownPath = extractPathLine(
    bootstrap.stdoutLines,
    /quality-.*\.md$/u,
    "quality markdown path",
  );
  const passiveFeatureMarkdownPath = extractPathLine(
    bootstrap.stdoutLines,
    /passive-features-.*\.md$/u,
    "passive-feature markdown path",
  );
  const defaultPreflightMarkdownPath = extractPathLine(
    bootstrap.stdoutLines,
    /preflight-.*\.md$/u,
    "preflight markdown path",
  );
  const runId = extractRunIdFromManifestPath(manifestPath);

  let preflightMarkdownPath = defaultPreflightMarkdownPath;
  if (config.entryProfile !== "v1") {
    const preflight = await requireSuccessfulCommand(
      "preflight",
      config.pythonBin,
      [
        "-m",
        "org_coin_data",
        "build-preflight-report",
        "--base-dir",
        config.baseDir,
        "--run-id",
        runId,
        "--profile",
        config.entryProfile,
      ],
    );
    preflightMarkdownPath = extractPathLine(
      preflight.stdoutLines,
      /preflight-.*\.md$/u,
      "profile preflight markdown path",
    );
  }

  const scenario = await requireSuccessfulCommand(
    "scenario",
    config.pythonBin,
    [
      "-m",
      "org_coin_data",
      "build-session-scenario",
      "--base-dir",
      config.baseDir,
      "--run-id",
      runId,
      "--initial-cash-krw",
      String(syncedState.portfolio.cashAvailable),
      "--initial-portfolio-path",
      config.statePath,
      "--initial-equity-krw",
      String(syncedState.currentEquityKrw),
      "--mode-intent",
      config.executionMode,
      "--entry-profile",
      config.entryProfile,
      "--exit-profile",
      config.exitProfile,
      "--synthetic-exit-policy",
      config.syntheticExitPolicy,
    ],
  );
  const scenarioPath = extractPathLine(
    scenario.stdoutLines,
    /session-.*\.json$/u,
    "session scenario path",
  );
  const sessionReport = await executePaperSessionScenario({
    scenarioPath,
    cwd: process.cwd(),
    runtimeConfig: {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRADING_MODE: config.executionMode,
        ENABLE_LIVE_EXECUTION: config.executionMode === "live" ? "true" : "false",
      },
    },
  });
  const initialCashKrw = sessionReport.scenarioMetadata?.initialCashKrw;
  const initialEquityKrw =
    sessionReport.scenarioMetadata?.initialEquityKrw ?? syncedState.currentEquityKrw;
  const endingCashKrw = sessionReport.portfolio.cashAvailable;
  const endingEquityKrw = estimatePortfolioEquity(sessionReport);
  const realizedPnlKrw = sessionReport.portfolio.dailyRealizedPnl;
  const markedPnlKrw =
    typeof initialEquityKrw === "number" ? endingEquityKrw - initialEquityKrw : null;
  const returnPct =
    typeof initialEquityKrw === "number" && initialEquityKrw > 0
      ? ((endingEquityKrw - initialEquityKrw) / initialEquityKrw) * 100
      : null;
  const completedAt = new Date().toISOString();
  if (!sessionReport.reconciliation.ok) {
    if (config.executionMode === "live") {
      await writeManagedState(
        config.statePath,
        tripManagedKillSwitch(
          syncedState,
          "reconciliation_mismatch",
          `paper session reconciliation failed for run ${runId}`,
          {
            runId,
            sessionId: sessionReport.sessionId,
          },
          completedAt,
        ),
      );
    }
    throw new Error(
      `paper session reconciliation failed for run ${runId}`,
    );
  }
  const nextState: ManagedDryRunState = {
    ...priorState,
    executionMode: config.executionMode,
    currentEquityKrw: endingEquityKrw,
    portfolio: buildCarryForwardPortfolio(sessionReport.portfolio),
    openPositionState: deriveCarryForwardOpenPositionState(sessionReport),
    lastCompletedAt: completedAt,
    lastSessionId: sessionReport.sessionId,
    cycle,
  };
  await writeManagedState(config.statePath, nextState);
  const payload = {
    event: "managed_dry_run_cycle_completed",
    cycle,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    executionMode: config.executionMode,
    runId,
    entryProfile: config.entryProfile,
    exitProfile: config.exitProfile,
    syntheticExitPolicy: config.syntheticExitPolicy,
    manifestPath,
    qualityMarkdownPath,
    passiveFeatureMarkdownPath,
    preflightMarkdownPath,
    scenarioPath,
    session: {
      sessionId: sessionReport.sessionId,
      generatedAt: sessionReport.generatedAt,
      mode: sessionReport.mode,
      processedEvents: sessionReport.processedEvents,
      reconciliationOk: sessionReport.reconciliation.ok,
      rejectDecisions: sessionReport.rejectLedger.totalRejectedDecisions,
      orderCount: sessionReport.ledger.orders.length,
      fillCount: sessionReport.ledger.fills.length,
      decisionCount: sessionReport.ledger.decisions.length,
      initialCashKrw,
      initialEquityKrw,
      endingCashKrw,
      endingEquityKrw,
      realizedPnlKrw,
      markedPnlKrw,
      returnPct,
      runInitialEquityKrw: syncedState.runInitialEquityKrw,
      runCumulativeReturnPct:
        syncedState.runInitialEquityKrw > 0
          ? ((endingEquityKrw - syncedState.runInitialEquityKrw) /
              syncedState.runInitialEquityKrw) *
            100
          : null,
      openPositionCount: countOpenPositions(sessionReport),
      carryOpenPositions:
        sessionReport.scenarioMetadata?.carryOpenPositions === true,
      suppressions: sessionReport.suppressionSummary,
      artifactPaths: sessionReport.artifacts,
    },
  };

  await appendJsonLine(config.cycleLogPath, payload);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function runDryRunServiceCli(
  argv: string[] = process.argv.slice(2),
): Promise<number> {
  const args = parseArgs(argv);
  const config = loadDryRunServiceConfig();

  await mkdir(config.logDir, { recursive: true });
  process.stdout.write(
      `${JSON.stringify({
        event: "managed_dry_run_service_started",
        executionMode: config.executionMode,
        entryProfile: config.entryProfile,
        exitProfile: config.exitProfile,
        syntheticExitPolicy: config.syntheticExitPolicy,
        loopIntervalSeconds: config.loopIntervalSeconds,
        cycleLogPath: config.cycleLogPath,
        statePath: config.statePath,
      pythonBin: config.pythonBin,
      once: args.once,
    })}\n`,
  );

  let cycle = 0;
  while (true) {
    cycle += 1;
    const cycleStartedAt = new Date().toISOString();
    let cycleFailed = false;

    try {
      await runDryRunCycle(cycle);
    } catch (error: unknown) {
      cycleFailed = true;
      const failure = buildDryRunCycleFailure(cycle, cycleStartedAt, error);
      await appendJsonLine(config.cycleLogPath, failure);
      process.stderr.write(`${JSON.stringify(failure)}\n`);
    }

    if (args.once) {
      return cycleFailed ? 1 : 0;
    }

    process.stdout.write(
      `${JSON.stringify({
        event: "managed_dry_run_cycle_sleep",
        cycle,
        sleepSeconds: config.loopIntervalSeconds,
      })}\n`,
    );
    await sleep(config.loopIntervalSeconds * 1000);
  }
}

export function buildDryRunCycleFailure(
  cycle: number,
  startedAt: string,
  error: unknown,
) {
  return {
    event: "managed_dry_run_cycle_failed",
    cycle,
    startedAt,
    failedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof InvalidPaperSessionScenarioError
      ? { issues: error.issues }
      : {}),
    ...(error instanceof DryRunCommandFailureError
      ? {
          ...(error.failureKind ? { failureKind: error.failureKind } : {}),
          command: {
            label: error.label,
            status: error.status,
            stdoutTail: error.stdoutTail,
            stderrTail: error.stderrTail,
            ...(error.failureKind ? { failureKind: error.failureKind } : {}),
          },
        }
      : {}),
  };
}

const isMain =
  process.argv[1] !== undefined &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
    process.env.pm_id !== undefined);

if (isMain) {
  runDryRunServiceCli().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        JSON.stringify(
          {
            error: "managed_dry_run_service_failed",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    },
  );
}
function countOpenPositions(report: SessionReportLike): number {
  return Object.values(report.portfolio.positions).filter(
    (position) => Math.abs(position.baseQuantity) > 1e-12,
  ).length;
}
