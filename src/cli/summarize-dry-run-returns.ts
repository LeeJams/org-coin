import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

interface SessionReturnRow {
  reportPath: string;
  scenarioPath: string | null;
  sourceRunId: string | null;
  generatedAt: string;
  sessionId: string;
  initialCashKrw: number;
  initialEquityKrw: number;
  endingCashKrw: number;
  endingEquityKrw: number;
  realizedPnlKrw: number;
  markedPnlKrw: number;
  returnPct: number;
  fillCount: number;
  buyFillCount: number;
  sellFillCount: number;
  grossFeesPaidKrw: number;
  orderCount: number;
  marketsTraded: string[];
  fillMarkets: string[];
  activeMarkets: string[];
  openPositionCount: number;
  executionMode: "dry_run" | "paper";
  syntheticClose: boolean;
  naturalExit: boolean;
  rejectDecisionCount: number;
  signalDecisionCount: number;
  signalRejectedDecisionCount: number;
  signalRejectedReasonCounts: Record<string, number>;
  reconciliationOk: boolean;
  exitReasonCodes: string[];
  exitSignalIds: string[];
  suppressionCounts: Record<string, number>;
  signalCount: number;
  totalQuoteNotionalKrw: number;
  buyQuoteNotionalKrw: number;
  sellQuoteNotionalKrw: number;
  nonFeePnlKrw: number;
  partialOrderCount: number;
  partialResidualQuantity: number;
  partialResidualQuoteNotionalKrw: number;
  entryEvaluationBucketCount: number;
  entrySuppressedCandidateCount: number;
  entryBlockedOpenPositionBucketCount: number;
  entryBlockedAfterExitBucketCount: number;
  entryBelowMinNotionalCount: number;
  entrySuppressedByGateFailure: Record<string, number>;
  entrySuppressedGateFailureCombinations: Record<string, number>;
  entrySuppressedGateFailureStats: Record<string, GateFailureStats>;
  btcBuyHoldBenchmark: BtcBuyHoldBenchmark | null;
}

interface GateFailureStats {
  count: number;
  avgActual: number;
  avgThreshold: number;
  avgDeficit: number;
  maxDeficit: number;
  nearMissCount?: number;
  nearMissRate?: number;
}

interface SummaryArgs {
  reportsRoot: string;
  cyclesPath: string | null;
  outputPath: string | null;
}

const KNOWN_REPORT_ROOT_CYCLE_LOGS: Record<string, string> = {
  "paper-sessions-btc": "var/log/dry-run-btc-service/cycles.ndjson",
  "paper-sessions-btc-confirm2": "var/log/dry-run-btc-confirm2-service/cycles.ndjson",
  "paper-sessions-btc-confirm3": "var/log/dry-run-btc-confirm3-service/cycles.ndjson",
  "paper-sessions-btc-trend": "var/log/dry-run-btc-trend-service/cycles.ndjson",
  "paper-sessions-btc-trend-hold":
    "var/log/dry-run-btc-trend-hold-service/cycles.ndjson",
  "paper-sessions-btc-trend-hold-guarded":
    "var/log/dry-run-btc-trend-hold-guarded-service/cycles.ndjson",
  "paper-sessions-btc-trend-ret1-turnover-cap":
    "var/log/dry-run-btc-trend-ret1-turnover-cap-service/cycles.ndjson",
  "paper-sessions-pieverse-60m-reversal-lb168-managed":
    "var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper/cycles.ndjson",
  "paper-sessions-krw-h-60m-momentum-managed":
    "var/log/dry-run-krw-h-60m-momentum-managed-paper/cycles.ndjson",
};

const MIN_COMPLETED_CYCLES_AFTER_FAILURE_FOR_LIVE = 30;
const UNKNOWN_EXIT_REASON = "UNKNOWN_EXIT_REASON";

interface SnapshotPriceLike {
  bestAskPrice?: number;
  bestBidPrice?: number;
  lastTradePrice?: number;
}

interface BtcBuyHoldBenchmark {
  market: "KRW-BTC";
  initialPriceKrw: number;
  endingPriceKrw: number;
  baseQuantity: number;
  endingEquityKrw: number;
  pnlKrw: number;
  returnPct: number;
  excessPnlKrw: number;
  excessReturnPct: number;
}

function parseArgs(argv: string[], cwd: string): SummaryArgs {
  let reportsRoot = resolve(cwd, "var/paper-sessions");
  let cyclesPath: string | null = null;
  let outputPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      continue;
    }

    if (arg === "--reports-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--reports-root requires a path");
      }
      reportsRoot = resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--cycles-path") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--cycles-path requires a path");
      }
      cyclesPath = resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--output requires a path");
      }
      outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument: ${arg}`);
  }

  return {
    reportsRoot,
    cyclesPath: cyclesPath ?? inferCyclesPathForReportsRoot(reportsRoot, cwd),
    outputPath,
  };
}

function inferCyclesPathForReportsRoot(reportsRoot: string, cwd: string): string | null {
  const knownRelativePath = KNOWN_REPORT_ROOT_CYCLE_LOGS[basename(reportsRoot)];
  return knownRelativePath === undefined ? null : resolve(cwd, knownRelativePath);
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function markPriceForOpenPosition(
  snapshot:
    | {
        bestAskPrice?: number;
        bestBidPrice?: number;
        lastTradePrice?: number;
      }
    | undefined,
  syntheticExitPolicy: string | undefined,
): number {
  if (!snapshot) {
    throw new Error("missing latest snapshot for carried market");
  }

  if (
    syntheticExitPolicy === "mark_mid" &&
    typeof snapshot.bestBidPrice === "number" &&
    typeof snapshot.bestAskPrice === "number"
  ) {
    return (snapshot.bestBidPrice + snapshot.bestAskPrice) / 2;
  }

  const markPrice = snapshot.bestBidPrice ?? snapshot.lastTradePrice;
  if (typeof markPrice !== "number" || !Number.isFinite(markPrice) || markPrice <= 0) {
    throw new Error("invalid mark price for carried market");
  }

  return markPrice;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left === undefined || right === undefined) {
    return null;
  }

  return (left + right) / 2;
}

function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const mean = average(values);
  if (mean === null) {
    return null;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function positiveFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function benchmarkInitialPrice(snapshot: SnapshotPriceLike | undefined): number | null {
  return (
    positiveFiniteNumber(snapshot?.bestAskPrice) ??
    positiveFiniteNumber(snapshot?.lastTradePrice) ??
    null
  );
}

function benchmarkEndingPrice(snapshot: SnapshotPriceLike | undefined): number | null {
  return (
    positiveFiniteNumber(snapshot?.bestBidPrice) ??
    positiveFiniteNumber(snapshot?.lastTradePrice) ??
    null
  );
}

function buildBtcBuyHoldBenchmark(input: {
  initialEquityKrw: number;
  strategyEndingEquityKrw: number;
  initialSnapshot?: SnapshotPriceLike;
  endingSnapshot?: SnapshotPriceLike;
}): BtcBuyHoldBenchmark | null {
  const initialPriceKrw = benchmarkInitialPrice(input.initialSnapshot);
  const endingPriceKrw = benchmarkEndingPrice(input.endingSnapshot);
  if (
    input.initialEquityKrw <= 0 ||
    initialPriceKrw === null ||
    endingPriceKrw === null
  ) {
    return null;
  }

  const baseQuantity = input.initialEquityKrw / initialPriceKrw;
  const endingEquityKrw = baseQuantity * endingPriceKrw;
  const pnlKrw = endingEquityKrw - input.initialEquityKrw;
  const returnPct = (pnlKrw / input.initialEquityKrw) * 100;
  return {
    market: "KRW-BTC",
    initialPriceKrw,
    endingPriceKrw,
    baseQuantity,
    endingEquityKrw,
    pnlKrw,
    returnPct,
    excessPnlKrw: input.strategyEndingEquityKrw - endingEquityKrw,
    excessReturnPct:
      ((input.strategyEndingEquityKrw - endingEquityKrw) / input.initialEquityKrw) *
      100,
  };
}

function maxDrawdownPct(equityCurve: number[]): number | null {
  if (equityCurve.length === 0) {
    return null;
  }

  let peak = equityCurve[0] ?? 0;
  let maxDrawdown = 0;
  for (const equity of equityCurve) {
    if (equity > peak) {
      peak = equity;
    }
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, ((equity - peak) / peak) * 100);
    }
  }

  return maxDrawdown;
}

function maxDrawdownValue(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  let peak = values[0] ?? 0;
  let maxDrawdown = 0;
  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    maxDrawdown = Math.min(maxDrawdown, value - peak);
  }

  return maxDrawdown;
}

function groupExitReasonProfitability(rows: SessionReturnRow[]) {
  const grouped = new Map<
    string,
    {
      sessionCount: number;
      totalPnlKrw: number;
      returnPct: number[];
      profitableSessions: number;
      losingSessions: number;
      flatSessions: number;
    }
  >();

  for (const row of rows) {
    const reasonCodes = [...new Set(attributedExitReasonCodes(row))];
    if (reasonCodes.length === 0) {
      continue;
    }

    const allocatedPnl = row.markedPnlKrw / reasonCodes.length;
    for (const reasonCode of reasonCodes) {
      const current = grouped.get(reasonCode) ?? {
        sessionCount: 0,
        totalPnlKrw: 0,
        returnPct: [],
        profitableSessions: 0,
        losingSessions: 0,
        flatSessions: 0,
      };
      current.sessionCount += 1;
      current.totalPnlKrw += allocatedPnl;
      current.returnPct.push(row.returnPct / reasonCodes.length);
      if (allocatedPnl > 1e-12) {
        current.profitableSessions += 1;
      } else if (allocatedPnl < -1e-12) {
        current.losingSessions += 1;
      } else {
        current.flatSessions += 1;
      }
      grouped.set(reasonCode, current);
    }
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([reasonCode, summary]) => {
        const { returnPct, ...outputSummary } = summary;
        return [
          reasonCode,
          {
          ...outputSummary,
          avgPnlKrw:
            summary.sessionCount > 0
              ? summary.totalPnlKrw / summary.sessionCount
              : null,
          avgReturnPct: average(returnPct),
          medianReturnPct: median(returnPct),
          },
        ];
      }),
  );
}

function attributedExitReasonCodes(row: SessionReturnRow): string[] {
  return row.exitReasonCodes.length > 0
    ? row.exitReasonCodes
    : row.sellFillCount > 0
      ? [UNKNOWN_EXIT_REASON]
      : [];
}

function summarizeExitAttribution(rows: SessionReturnRow[]) {
  const sellFillRows = rows.filter((row) => row.sellFillCount > 0);
  const missingReasonRows = sellFillRows.filter(
    (row) => row.exitReasonCodes.length === 0,
  );
  return {
    sellFillSessionCount: sellFillRows.length,
    attributedExitReasonSessionCount:
      sellFillRows.length - missingReasonRows.length,
    missingExitReasonSessionCount: missingReasonRows.length,
    missingExitReasonSellFillCount: missingReasonRows.reduce(
      (sum, row) => sum + row.sellFillCount,
      0,
    ),
    missingExitReasonPnlKrw: missingReasonRows.reduce(
      (sum, row) => sum + row.markedPnlKrw,
      0,
    ),
    missingExitReasonSessions: missingReasonRows.map((row) => ({
      generatedAt: row.generatedAt,
      sessionId: row.sessionId,
      sourceRunId: row.sourceRunId,
      reportPath: row.reportPath,
      scenarioPath: row.scenarioPath,
      sellFillCount: row.sellFillCount,
      sellFillQuoteNotionalKrw: row.sellQuoteNotionalKrw,
      markedPnlKrw: row.markedPnlKrw,
      exitSignalIds: row.exitSignalIds,
    })),
  };
}

function sumRows(rows: SessionReturnRow[], select: (row: SessionReturnRow) => number): number {
  return rows.reduce((sum, row) => sum + select(row), 0);
}

function summarizeExperimentRows(rows: SessionReturnRow[]) {
  const totalPnlKrw = sumRows(rows, (row) => row.markedPnlKrw);
  const grossFeesPaidKrw = sumRows(rows, (row) => row.grossFeesPaidKrw);
  const totalQuoteNotionalKrw = sumRows(rows, (row) => row.totalQuoteNotionalKrw);
  return {
    sessionCount: rows.length,
    totalPnlKrw,
    avgPnlKrw: average(rows.map((row) => row.markedPnlKrw)),
    grossFeesPaidKrw,
    grossPnlBeforeFeesKrw: totalPnlKrw + grossFeesPaidKrw,
    totalQuoteNotionalKrw,
    observedNetEdgeBps:
      totalQuoteNotionalKrw > 0 ? (totalPnlKrw / totalQuoteNotionalKrw) * 10_000 : null,
    observedGrossEdgeBeforeFeesBps:
      totalQuoteNotionalKrw > 0
        ? ((totalPnlKrw + grossFeesPaidKrw) / totalQuoteNotionalKrw) * 10_000
        : null,
    profitableSessions: rows.filter((row) => row.markedPnlKrw > 1e-12).length,
    losingSessions: rows.filter((row) => row.markedPnlKrw < -1e-12).length,
    flatSessions: rows.filter((row) => Math.abs(row.markedPnlKrw) <= 1e-12).length,
  };
}

function summarizeBenchmarkComparison(rows: SessionReturnRow[]) {
  const benchmarkRows = rows.flatMap((row) =>
    row.btcBuyHoldBenchmark === null
      ? []
      : [{ row, benchmark: row.btcBuyHoldBenchmark }],
  );
  const positiveBenchmarkRows = benchmarkRows.filter(
    ({ benchmark }) => benchmark.pnlKrw > 1e-12,
  );
  const negativeBenchmarkRows = benchmarkRows.filter(
    ({ benchmark }) => benchmark.pnlKrw < -1e-12,
  );
  const totalStrategyPnlKrw = benchmarkRows.reduce(
    (sum, { row }) => sum + row.markedPnlKrw,
    0,
  );
  const totalBenchmarkPnlKrw = benchmarkRows.reduce(
    (sum, { benchmark }) => sum + benchmark.pnlKrw,
    0,
  );
  const totalExcessPnlKrw = totalStrategyPnlKrw - totalBenchmarkPnlKrw;
  const positiveBenchmarkPnlKrw = positiveBenchmarkRows.reduce(
    (sum, { benchmark }) => sum + benchmark.pnlKrw,
    0,
  );
  const strategyPnlInPositiveBenchmarkWindowsKrw = positiveBenchmarkRows.reduce(
    (sum, { row }) => sum + row.markedPnlKrw,
    0,
  );
  const negativeBenchmarkPnlKrw = negativeBenchmarkRows.reduce(
    (sum, { benchmark }) => sum + benchmark.pnlKrw,
    0,
  );
  const strategyPnlInNegativeBenchmarkWindowsKrw = negativeBenchmarkRows.reduce(
    (sum, { row }) => sum + row.markedPnlKrw,
    0,
  );
  const excessReturns = benchmarkRows.map(
    ({ benchmark }) => benchmark.excessReturnPct,
  );

  return {
    sessionCount: rows.length,
    benchmarkedSessionCount: benchmarkRows.length,
    missingBenchmarkSessionCount: rows.length - benchmarkRows.length,
    totalStrategyPnlKrw,
    totalBenchmarkPnlKrw,
    totalExcessPnlKrw,
    avgExcessReturnPct: average(excessReturns),
    medianExcessReturnPct: median(excessReturns),
    profitableExcessSessions: benchmarkRows.filter(
      ({ benchmark }) => benchmark.excessPnlKrw > 1e-12,
    ).length,
    losingExcessSessions: benchmarkRows.filter(
      ({ benchmark }) => benchmark.excessPnlKrw < -1e-12,
    ).length,
    positiveBenchmarkSessionCount: positiveBenchmarkRows.length,
    positiveBenchmarkPnlKrw,
    strategyPnlInPositiveBenchmarkWindowsKrw,
    positiveWindowCaptureRatio:
      positiveBenchmarkPnlKrw > 0
        ? strategyPnlInPositiveBenchmarkWindowsKrw / positiveBenchmarkPnlKrw
        : null,
    positiveWindowNoSignalSessionCount: positiveBenchmarkRows.filter(
      ({ row }) => row.signalCount === 0,
    ).length,
    positiveWindowNoFillSessionCount: positiveBenchmarkRows.filter(
      ({ row }) => row.fillCount === 0,
    ).length,
    negativeBenchmarkSessionCount: negativeBenchmarkRows.length,
    negativeBenchmarkPnlKrw,
    strategyPnlInNegativeBenchmarkWindowsKrw,
    negativeWindowAvoidedLossKrw:
      strategyPnlInNegativeBenchmarkWindowsKrw - negativeBenchmarkPnlKrw,
  };
}

function summarizeBtcBuyHoldBenchmark(rows: SessionReturnRow[]) {
  const benchmarkRows = rows.flatMap((row) =>
    row.btcBuyHoldBenchmark === null
      ? []
      : [{ row, benchmark: row.btcBuyHoldBenchmark }],
  );
  const excessReturnPct = benchmarkRows.map(
    ({ benchmark }) => benchmark.excessReturnPct,
  );
  const avgExcessReturnPct = average(excessReturnPct);
  const excessReturnStdDevPct = sampleStdDev(excessReturnPct);
  const excessReturnInformationRatio =
    avgExcessReturnPct !== null &&
    excessReturnStdDevPct !== null &&
    excessReturnStdDevPct > 0
      ? avgExcessReturnPct / excessReturnStdDevPct
      : null;
  const strategyEquityCurve =
    benchmarkRows.length > 0
      ? [
          benchmarkRows[0]?.row.initialEquityKrw ?? 0,
          ...benchmarkRows.map(({ row }) => row.endingEquityKrw),
        ]
      : [];
  const benchmarkEquityCurve =
    benchmarkRows.length > 0
      ? [
          benchmarkRows[0]?.row.initialEquityKrw ?? 0,
          ...benchmarkRows.map(({ benchmark }) => benchmark.endingEquityKrw),
        ]
      : [];
  const totalStrategyPnlKrw = benchmarkRows.reduce(
    (sum, { row }) => sum + row.markedPnlKrw,
    0,
  );
  const totalBenchmarkPnlKrw = benchmarkRows.reduce(
    (sum, { benchmark }) => sum + benchmark.pnlKrw,
    0,
  );
  const totalInitialEquityKrw = benchmarkRows.reduce(
    (sum, { row }) => sum + row.initialEquityKrw,
    0,
  );
  const totalExcessPnlKrw = totalStrategyPnlKrw - totalBenchmarkPnlKrw;

  return {
    benchmarkType: "btc_buy_and_hold_same_window",
    pricing: {
      entry: "KRW-BTC first scenario bestAskPrice fallback lastTradePrice",
      exit: "KRW-BTC latest report bestBidPrice fallback lastTradePrice",
    },
    sessionCount: benchmarkRows.length,
    missingBenchmarkSessionCount: rows.length - benchmarkRows.length,
    totalInitialEquityKrw,
    totalStrategyPnlKrw,
    totalBenchmarkPnlKrw,
    totalExcessPnlKrw,
    totalStrategyReturnPct:
      totalInitialEquityKrw > 0
        ? (totalStrategyPnlKrw / totalInitialEquityKrw) * 100
        : null,
    totalBenchmarkReturnPct:
      totalInitialEquityKrw > 0
        ? (totalBenchmarkPnlKrw / totalInitialEquityKrw) * 100
        : null,
    totalExcessReturnPct:
      totalInitialEquityKrw > 0
        ? (totalExcessPnlKrw / totalInitialEquityKrw) * 100
        : null,
    avgExcessReturnPct,
    medianExcessReturnPct: median(excessReturnPct),
    excessReturnStdDevPct,
    excessReturnInformationRatio,
    strategyMaxDrawdownPct: maxDrawdownPct(strategyEquityCurve),
    benchmarkMaxDrawdownPct: maxDrawdownPct(benchmarkEquityCurve),
    profitableExcessSessions: benchmarkRows.filter(
      ({ benchmark }) => benchmark.excessPnlKrw > 1e-12,
    ).length,
    losingExcessSessions: benchmarkRows.filter(
      ({ benchmark }) => benchmark.excessPnlKrw < -1e-12,
    ).length,
    latestSession: benchmarkRows.at(-1)?.benchmark ?? null,
  };
}

function groupExitReasonBenchmarkComparison(rows: SessionReturnRow[]) {
  return Object.fromEntries(
    [...new Set(rows.flatMap((row) => row.exitReasonCodes))]
      .sort()
      .map((reasonCode) => {
        const affectedRows = rows.filter((row) =>
          row.exitReasonCodes.includes(reasonCode),
        );
        return [reasonCode, summarizeBenchmarkComparison(affectedRows)];
      }),
  );
}

function summarizeBtcTrendExposure(rows: SessionReturnRow[]) {
  const benchmarkRows = rows.flatMap((row) =>
    row.btcBuyHoldBenchmark === null
      ? []
      : [{ row, benchmark: row.btcBuyHoldBenchmark }],
  );
  const positiveBenchmarkRows = benchmarkRows.filter(
    ({ benchmark }) => benchmark.pnlKrw > 1e-12,
  );
  const negativeBenchmarkRows = benchmarkRows.filter(
    ({ benchmark }) => benchmark.pnlKrw < -1e-12,
  );
  const flatBenchmarkRows = benchmarkRows.filter(
    ({ benchmark }) => Math.abs(benchmark.pnlKrw) <= 1e-12,
  );
  const positiveBenchmarkPnlKrw = positiveBenchmarkRows.reduce(
    (sum, { benchmark }) => sum + benchmark.pnlKrw,
    0,
  );
  const strategyPnlInPositiveBenchmarkWindowsKrw = positiveBenchmarkRows.reduce(
    (sum, { row }) => sum + row.markedPnlKrw,
    0,
  );
  const negativeBenchmarkPnlKrw = negativeBenchmarkRows.reduce(
    (sum, { benchmark }) => sum + benchmark.pnlKrw,
    0,
  );
  const strategyPnlInNegativeBenchmarkWindowsKrw = negativeBenchmarkRows.reduce(
    (sum, { row }) => sum + row.markedPnlKrw,
    0,
  );
  const positiveWindowTradeCount = positiveBenchmarkRows.reduce(
    (sum, { row }) => sum + row.fillCount,
    0,
  );
  const positiveWindowOpenPositionCount = positiveBenchmarkRows.filter(
    ({ row }) => row.openPositionCount > 0,
  ).length;
  const positiveWindowSignalCount = positiveBenchmarkRows.reduce(
    (sum, { row }) => sum + row.signalCount,
    0,
  );
  const positiveWindowExitReasonCounts = positiveBenchmarkRows
    .flatMap(({ row }) => row.exitReasonCodes)
    .reduce<Record<string, number>>((counts, reasonCode) => {
      counts[reasonCode] = (counts[reasonCode] ?? 0) + 1;
      return counts;
    }, {});
  const positiveWindowRows = positiveBenchmarkRows.map(({ row }) => row);
  const positiveWindowNoSignalRows = positiveWindowRows.filter(
    (row) => row.signalCount === 0,
  );
  const positiveWindowNoFillRows = positiveWindowRows.filter(
    (row) => row.fillCount === 0,
  );
  const negativeWindowTradeCount = negativeBenchmarkRows.reduce(
    (sum, { row }) => sum + row.fillCount,
    0,
  );
  const negativeWindowOpenPositionCount = negativeBenchmarkRows.filter(
    ({ row }) => row.openPositionCount > 0,
  ).length;
  const negativeWindowSignalCount = negativeBenchmarkRows.reduce(
    (sum, { row }) => sum + row.signalCount,
    0,
  );
  const negativeWindowExitReasonCounts = negativeBenchmarkRows
    .flatMap(({ row }) => row.exitReasonCodes)
    .reduce<Record<string, number>>((counts, reasonCode) => {
      counts[reasonCode] = (counts[reasonCode] ?? 0) + 1;
      return counts;
    }, {});
  const negativeWindowRows = negativeBenchmarkRows.map(({ row }) => row);
  const negativeWindowNoSignalRows = negativeWindowRows.filter(
    (row) => row.signalCount === 0,
  );
  const negativeWindowNoFillRows = negativeWindowRows.filter(
    (row) => row.fillCount === 0,
  );
  const negativeWindowAvoidedLossKrw =
    strategyPnlInNegativeBenchmarkWindowsKrw - negativeBenchmarkPnlKrw;

  return {
    experimentType: "diagnostic_opportunity_measurement_not_strategy_pnl",
    note:
      "Uses realized same-window BTC buy-and-hold returns to measure missed upside exposure; this is a retrospective diagnostic, not a tradable signal.",
    benchmarkedSessionCount: benchmarkRows.length,
    positiveBenchmarkSessionCount: positiveBenchmarkRows.length,
    negativeBenchmarkSessionCount: negativeBenchmarkRows.length,
    flatBenchmarkSessionCount: flatBenchmarkRows.length,
    positiveBenchmarkSessionRate:
      benchmarkRows.length > 0
        ? positiveBenchmarkRows.length / benchmarkRows.length
        : null,
    negativeBenchmarkSessionRate:
      benchmarkRows.length > 0
        ? negativeBenchmarkRows.length / benchmarkRows.length
        : null,
    positiveBenchmarkPnlKrw,
    strategyPnlInPositiveBenchmarkWindowsKrw,
    missedPositiveBenchmarkPnlKrw:
      positiveBenchmarkPnlKrw - strategyPnlInPositiveBenchmarkWindowsKrw,
    positiveWindowCaptureRatio:
      positiveBenchmarkPnlKrw > 0
        ? strategyPnlInPositiveBenchmarkWindowsKrw / positiveBenchmarkPnlKrw
        : null,
    positiveWindowTradeCount,
    positiveWindowSignalCount,
    positiveWindowOpenPositionCount,
    positiveWindowExitReasonCounts,
    positiveWindowNoSignalSessionCount: positiveWindowNoSignalRows.length,
    positiveWindowNoFillSessionCount: positiveWindowNoFillRows.length,
    positiveWindowEntryEvaluationBucketCount: sumRows(
      positiveWindowRows,
      (row) => row.entryEvaluationBucketCount,
    ),
    positiveWindowEntrySuppressedCandidateCount: sumRows(
      positiveWindowRows,
      (row) => row.entrySuppressedCandidateCount,
    ),
    positiveWindowEntryBlockedOpenPositionBucketCount: sumRows(
      positiveWindowRows,
      (row) => row.entryBlockedOpenPositionBucketCount,
    ),
    positiveWindowEntryBlockedAfterExitBucketCount: sumRows(
      positiveWindowRows,
      (row) => row.entryBlockedAfterExitBucketCount,
    ),
    positiveWindowEntryBelowMinNotionalCount: sumRows(
      positiveWindowRows,
      (row) => row.entryBelowMinNotionalCount,
    ),
    positiveWindowSuppressionCounts:
      summarizeSuppressionCounts(positiveWindowRows),
    positiveWindowNoSignalSuppressionCounts: summarizeSuppressionCounts(
      positiveWindowNoSignalRows,
    ),
    positiveWindowNoFillSuppressionCounts:
      summarizeSuppressionCounts(positiveWindowNoFillRows),
    positiveWindowSuppressedByGateFailure:
      summarizeGateFailureCounts(positiveWindowRows),
    positiveWindowNoSignalSuppressedByGateFailure: summarizeGateFailureCounts(
      positiveWindowNoSignalRows,
    ),
    positiveWindowNoFillSuppressedByGateFailure:
      summarizeGateFailureCounts(positiveWindowNoFillRows),
    positiveWindowGateFailureCombinations:
      summarizeGateFailureCombinations(positiveWindowRows),
    positiveWindowNoSignalGateFailureCombinations:
      summarizeGateFailureCombinations(positiveWindowNoSignalRows),
    positiveWindowNoFillGateFailureCombinations:
      summarizeGateFailureCombinations(positiveWindowNoFillRows),
    positiveWindowGateFailureStats: summarizeGateFailureStats(positiveWindowRows),
    positiveWindowNoSignalGateFailureStats:
      summarizeGateFailureStats(positiveWindowNoSignalRows),
    positiveWindowNoFillGateFailureStats:
      summarizeGateFailureStats(positiveWindowNoFillRows),
    negativeBenchmarkPnlKrw,
    strategyPnlInNegativeBenchmarkWindowsKrw,
    negativeWindowAvoidedLossKrw,
    negativeWindowAvoidedLossRatio:
      negativeBenchmarkPnlKrw < 0
        ? negativeWindowAvoidedLossKrw / Math.abs(negativeBenchmarkPnlKrw)
        : null,
    negativeWindowTradeCount,
    negativeWindowSignalCount,
    negativeWindowOpenPositionCount,
    negativeWindowExitReasonCounts,
    negativeWindowNoSignalSessionCount: negativeWindowNoSignalRows.length,
    negativeWindowNoFillSessionCount: negativeWindowNoFillRows.length,
    negativeWindowEntryEvaluationBucketCount: sumRows(
      negativeWindowRows,
      (row) => row.entryEvaluationBucketCount,
    ),
    negativeWindowEntrySuppressedCandidateCount: sumRows(
      negativeWindowRows,
      (row) => row.entrySuppressedCandidateCount,
    ),
    negativeWindowEntryBlockedOpenPositionBucketCount: sumRows(
      negativeWindowRows,
      (row) => row.entryBlockedOpenPositionBucketCount,
    ),
    negativeWindowEntryBlockedAfterExitBucketCount: sumRows(
      negativeWindowRows,
      (row) => row.entryBlockedAfterExitBucketCount,
    ),
    negativeWindowEntryBelowMinNotionalCount: sumRows(
      negativeWindowRows,
      (row) => row.entryBelowMinNotionalCount,
    ),
    negativeWindowSuppressionCounts:
      summarizeSuppressionCounts(negativeWindowRows),
    negativeWindowNoSignalSuppressionCounts: summarizeSuppressionCounts(
      negativeWindowNoSignalRows,
    ),
    negativeWindowNoFillSuppressionCounts:
      summarizeSuppressionCounts(negativeWindowNoFillRows),
    negativeWindowSuppressedByGateFailure:
      summarizeGateFailureCounts(negativeWindowRows),
    negativeWindowNoSignalSuppressedByGateFailure: summarizeGateFailureCounts(
      negativeWindowNoSignalRows,
    ),
    negativeWindowNoFillSuppressedByGateFailure:
      summarizeGateFailureCounts(negativeWindowNoFillRows),
    negativeWindowGateFailureCombinations:
      summarizeGateFailureCombinations(negativeWindowRows),
    negativeWindowNoSignalGateFailureCombinations:
      summarizeGateFailureCombinations(negativeWindowNoSignalRows),
    negativeWindowNoFillGateFailureCombinations:
      summarizeGateFailureCombinations(negativeWindowNoFillRows),
    negativeWindowGateFailureStats: summarizeGateFailureStats(negativeWindowRows),
    negativeWindowNoSignalGateFailureStats:
      summarizeGateFailureStats(negativeWindowNoSignalRows),
    negativeWindowNoFillGateFailureStats:
      summarizeGateFailureStats(negativeWindowNoFillRows),
  };
}

function addSuppressionCounts(
  total: Record<string, number>,
  counts: Record<string, number>,
): void {
  for (const [reason, count] of Object.entries(counts)) {
    total[reason] = (total[reason] ?? 0) + count;
  }
}

function summarizeSuppressionCounts(
  rows: Pick<SessionReturnRow, "suppressionCounts">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    addSuppressionCounts(counts, row.suppressionCounts);
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function summarizeGateFailureCounts(
  rows: Pick<SessionReturnRow, "entrySuppressedByGateFailure">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const [field, count] of Object.entries(row.entrySuppressedByGateFailure)) {
      counts[field] = (counts[field] ?? 0) + count;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function summarizeSignalRejectedReasonCounts(
  rows: Pick<SessionReturnRow, "signalRejectedReasonCounts">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const [reasonCode, count] of Object.entries(row.signalRejectedReasonCounts)) {
      counts[reasonCode] = (counts[reasonCode] ?? 0) + count;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function summarizeGateFailureCombinations(
  rows: Pick<SessionReturnRow, "entrySuppressedGateFailureCombinations">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const [fieldSet, count] of Object.entries(
      row.entrySuppressedGateFailureCombinations,
    )) {
      counts[fieldSet] = (counts[fieldSet] ?? 0) + count;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function summarizeGateFailureStats(
  rows: Pick<SessionReturnRow, "entrySuppressedGateFailureStats">[],
): Record<string, GateFailureStats> {
  const totals: Record<
    string,
    {
      count: number;
      actualSum: number;
      thresholdSum: number;
      deficitSum: number;
      maxDeficit: number;
      nearMissCount: number;
    }
  > = {};
  for (const row of rows) {
    for (const [field, stats] of Object.entries(row.entrySuppressedGateFailureStats)) {
      const total =
        totals[field] ??
        (totals[field] = {
          count: 0,
          actualSum: 0,
          thresholdSum: 0,
          deficitSum: 0,
          maxDeficit: 0,
          nearMissCount: 0,
        });
      total.count += stats.count;
      total.actualSum += stats.avgActual * stats.count;
      total.thresholdSum += stats.avgThreshold * stats.count;
      total.deficitSum += stats.avgDeficit * stats.count;
      total.maxDeficit = Math.max(total.maxDeficit, stats.maxDeficit);
      total.nearMissCount += stats.nearMissCount ?? 0;
    }
  }
  return Object.fromEntries(
    Object.entries(totals)
      .sort((left, right) => right[1].count - left[1].count)
      .map(([field, total]) => [
        field,
        {
          count: total.count,
          avgActual: total.count > 0 ? total.actualSum / total.count : 0,
          avgThreshold: total.count > 0 ? total.thresholdSum / total.count : 0,
          avgDeficit: total.count > 0 ? total.deficitSum / total.count : 0,
          maxDeficit: total.maxDeficit,
          nearMissCount: total.nearMissCount,
          nearMissRate: total.count > 0 ? total.nearMissCount / total.count : 0,
        },
      ]),
  );
}

async function collectReportPaths(root: string): Promise<string[]> {
  const reportPaths: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      if (entry.isFile() && entry.name === "report.json") {
        reportPaths.push(path);
      }
    }
  }

  try {
    await walk(root);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return reportPaths;
    }

    throw error;
  }
  reportPaths.sort();
  return reportPaths;
}

async function readCycleSummary(path: string | null): Promise<{
  evidenceAvailable: boolean;
  completed: number;
  failed: number;
  observedCycleIntervalSeconds: number | null;
  observedCycleIntervalSampleCount: number;
  observedCompletedCycleDurationSeconds: number | null;
  observedCompletedCycleDurationSampleCount: number;
  failureMessages: Record<string, number>;
  failureKinds: Record<string, number>;
  latestFailure: {
    cycle?: number;
    startedAt?: string;
    failedAt?: string;
    message: string;
    failureKind?: string;
    command?: {
      label?: string;
      status?: number;
      stdoutTail?: string[];
      stderrTail?: string[];
      failureKind?: string;
    };
  } | null;
  consecutiveCompletedSinceLatestFailure: number;
}> {
  if (path === null) {
    return {
      evidenceAvailable: false,
      completed: 0,
      failed: 0,
      observedCycleIntervalSeconds: null,
      observedCycleIntervalSampleCount: 0,
      observedCompletedCycleDurationSeconds: null,
      observedCompletedCycleDurationSampleCount: 0,
      failureMessages: {},
      failureKinds: {},
      latestFailure: null,
      consecutiveCompletedSinceLatestFailure: 0,
    };
  }

  try {
    const raw = await readFile(path, "utf8");
    const summary = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .reduce(
        (summary, line) => {
          const parsed = JSON.parse(line) as {
            event?: string;
            cycle?: number;
            startedAt?: string;
            completedAt?: string;
            failedAt?: string;
            message?: string;
            failureKind?: string;
            command?: {
              label?: string;
              status?: number;
              stdoutTail?: string[];
              stderrTail?: string[];
              failureKind?: string;
            };
          };
          if (parsed.event === "managed_dry_run_cycle_completed") {
            summary.completed += 1;
            const completedAtMs = timestampMs(parsed.completedAt);
            const startedAtMs = timestampMs(parsed.startedAt);
            if (completedAtMs !== null) {
              summary.completedAtMs.push(completedAtMs);
            }
            if (
              completedAtMs !== null &&
              startedAtMs !== null &&
              completedAtMs >= startedAtMs
            ) {
              summary.completedDurationsSeconds.push(
                (completedAtMs - startedAtMs) / 1000,
              );
            }
            summary.consecutiveCompletedSinceLatestFailure += 1;
          } else if (parsed.event === "managed_dry_run_cycle_failed") {
            summary.failed += 1;
            const message = parsed.message ?? "unknown_failure";
            const failureKind =
              parsed.failureKind ??
              parsed.command?.failureKind ??
              inferCycleFailureKind({
                message,
                command: parsed.command,
              });
            summary.failureMessages[message] =
              (summary.failureMessages[message] ?? 0) + 1;
            if (failureKind !== null) {
              summary.failureKinds[failureKind] =
                (summary.failureKinds[failureKind] ?? 0) + 1;
            }
            summary.latestFailure = {
              cycle: parsed.cycle,
              startedAt: parsed.startedAt,
              failedAt: parsed.failedAt,
              message,
              ...(failureKind !== null ? { failureKind } : {}),
              ...(parsed.command ? { command: parsed.command } : {}),
            };
            summary.consecutiveCompletedSinceLatestFailure = 0;
          }
          return summary;
        },
        {
          evidenceAvailable: true,
          completed: 0,
          failed: 0,
          failureMessages: {},
          failureKinds: {},
          latestFailure: null,
          consecutiveCompletedSinceLatestFailure: 0,
          completedAtMs: [],
          completedDurationsSeconds: [],
        } as {
          evidenceAvailable: boolean;
          completed: number;
          failed: number;
          observedCycleIntervalSeconds?: number | null;
          observedCycleIntervalSampleCount?: number;
          observedCompletedCycleDurationSeconds?: number | null;
          observedCompletedCycleDurationSampleCount?: number;
          failureMessages: Record<string, number>;
          failureKinds: Record<string, number>;
          latestFailure: {
            cycle?: number;
            startedAt?: string;
            failedAt?: string;
            message: string;
            failureKind?: string;
            command?: {
              label?: string;
              status?: number;
              stdoutTail?: string[];
              stderrTail?: string[];
              failureKind?: string;
            };
          } | null;
          consecutiveCompletedSinceLatestFailure: number;
          completedAtMs: number[];
          completedDurationsSeconds: number[];
        },
      );
    summary.evidenceAvailable = true;
    const completedAtMs = [...summary.completedAtMs].sort(
      (left, right) => left - right,
    );
    const completedIntervalsSeconds = completedAtMs
      .slice(1)
      .map(
        (completedAt, index) =>
          (completedAt - (completedAtMs[index] ?? completedAt)) / 1000,
      )
      .filter((seconds) => Number.isFinite(seconds) && seconds > 0);
    const {
      completedAtMs: _completedAtMs,
      completedDurationsSeconds,
      ...output
    } = summary;
    return {
      ...output,
      observedCycleIntervalSeconds: median(completedIntervalsSeconds),
      observedCycleIntervalSampleCount: completedIntervalsSeconds.length,
      observedCompletedCycleDurationSeconds: median(completedDurationsSeconds),
      observedCompletedCycleDurationSampleCount:
        completedDurationsSeconds.length,
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        evidenceAvailable: false,
        completed: 0,
        failed: 0,
        observedCycleIntervalSeconds: null,
        observedCycleIntervalSampleCount: 0,
        observedCompletedCycleDurationSeconds: null,
        observedCompletedCycleDurationSampleCount: 0,
        failureMessages: {},
        failureKinds: {},
        latestFailure: null,
        consecutiveCompletedSinceLatestFailure: 0,
      };
    }

    throw error;
  }
}

function inferCycleFailureKind(input: {
  message?: string;
  command?: {
    stdoutTail?: string[];
    stderrTail?: string[];
  };
}): string | null {
  const output = [
    input.message,
    ...(input.command?.stdoutTail ?? []),
    ...(input.command?.stderrTail ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();

  if (output.includes("invalid_paper_session_scenario")) {
    return "invalid_paper_session_scenario";
  }

  if (output.includes("no enriched market points found")) {
    return "no_enriched_market_points";
  }

  if (
    /http 5\d\d|invalidstatus|connection|timed out|timeout|websocket|network|econnreset|enotfound|eai_again|temporar|too many requests|rate limit/u.test(
      output,
    )
  ) {
    return "retryable_bootstrap_failure";
  }

  if (/exited with status \d+/u.test(output)) {
    return "unclassified_command_failure";
  }

  return null;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const { reportsRoot, cyclesPath, outputPath } = parseArgs(process.argv.slice(2), cwd);
  const reportPaths = await collectReportPaths(reportsRoot);
  const rows: SessionReturnRow[] = [];
  let skippedSessionCount = 0;
  let skippedMissingMarkCount = 0;

  for (const reportPath of reportPaths) {
    const raw = await readFile(reportPath, "utf8");
    const parsed = JSON.parse(raw) as {
      generatedAt: string;
      sessionId: string;
      latestSnapshots?: Record<
        string,
        {
          bestAskPrice?: number;
          bestBidPrice?: number;
          lastTradePrice?: number;
        }
      >;
      mode?: string;
      portfolio: {
        cashAvailable: number;
        dailyRealizedPnl: number;
        positions?: Record<
          string,
          {
            market: string;
            baseQuantity: number;
          }
        >;
      };
      ledger: {
        decisions?: unknown[];
        fills: Array<{
          market?: string;
          side?: string;
          quantity?: number;
          quoteNotional?: number;
          feesPaid?: number;
        }>;
        orders: Array<{
          market?: string;
          side?: string;
          status?: string;
          requestedQuantity?: number;
          executedQuantity?: number;
          requestedQuoteNotional?: number;
          executedQuoteNotional?: number;
          feesPaid?: number;
        }>;
      };
      outcomes: Array<{
        type: string;
        signalId?: string;
        decision?: {
          accepted?: boolean;
          reasons?: Array<{
            code?: string;
          }>;
          order?: {
            side?: string;
            signalId?: string;
          };
        };
        signal?: {
          side?: string;
          reasonCodes?: string[];
        };
      }>;
      rejectLedger?: {
        totalRejectedDecisions?: number;
        entries?: Array<{
          reasonCodes?: string[];
          reasons?: Array<{ code?: string }>;
        }>;
      };
      reconciliation?: { ok?: boolean };
      scenarioPath?: string;
      scenarioMetadata?: {
        sourceRunId?: string;
        initialCashKrw?: number;
        initialEquityKrw?: number;
        modeIntent?: string;
        syntheticExitPolicy?: string;
        summary?: {
          marketsTraded?: string[];
          syntheticCloseCount?: number;
          signalCount?: number;
          entryEvaluationBucketCount?: number;
          entrySuppressedCandidateCount?: number;
          entryBlockedOpenPositionBucketCount?: number;
          entryBlockedAfterExitBucketCount?: number;
          entryBelowMinNotionalCount?: number;
          suppressedByReason?: Record<string, number>;
          entrySuppressedByGateFailure?: Record<string, number>;
          entrySuppressedGateFailureCombinations?: Record<string, number>;
          entrySuppressedGateFailureStats?: Record<string, GateFailureStats>;
        };
      };
    };
    const executionMode = parsed.mode;
    if (
      (executionMode !== "dry_run" && executionMode !== "paper") ||
      (parsed.scenarioMetadata?.modeIntent !== "dry_run" &&
        parsed.scenarioMetadata?.modeIntent !== "paper")
    ) {
      skippedSessionCount += 1;
      continue;
    }
    if (typeof parsed.scenarioMetadata?.initialCashKrw !== "number") {
      skippedSessionCount += 1;
      continue;
    }
    const initialCashKrw = parsed.scenarioMetadata.initialCashKrw;
    const initialEquityKrw =
      parsed.scenarioMetadata.initialEquityKrw ?? initialCashKrw;
    const endingCashKrw = parsed.portfolio.cashAvailable;
    const positions = Object.values(parsed.portfolio.positions ?? {}).filter(
      (position) => Math.abs(position.baseQuantity) > 1e-12,
    );
    let endingEquityKrw: number;
    try {
      endingEquityKrw =
        endingCashKrw +
        positions.reduce((sum, position) => {
          const snapshot = parsed.latestSnapshots?.[position.market];
          const markPrice = markPriceForOpenPosition(
            snapshot,
            parsed.scenarioMetadata?.syntheticExitPolicy,
          );
          return sum + position.baseQuantity * markPrice;
        }, 0);
    } catch {
      skippedSessionCount += 1;
      skippedMissingMarkCount += 1;
      continue;
    }
    const realizedPnlKrw = parsed.portfolio.dailyRealizedPnl;
    const markedPnlKrw = endingEquityKrw - initialEquityKrw;
    const returnPct =
      initialEquityKrw > 0
        ? ((endingEquityKrw - initialEquityKrw) / initialEquityKrw) * 100
        : 0;
    const sellSignals = parsed.outcomes.filter(
      (outcome) =>
        outcome.type === "signal" &&
        (outcome.decision?.order?.side === "sell" || outcome.signal?.side === "sell"),
    );
    const signalOutcomes = parsed.outcomes.filter((outcome) => outcome.type === "signal");
    const rejectedSignalOutcomes = signalOutcomes.filter(
      (outcome) => outcome.decision?.accepted === false,
    );
    const signalRejectedReasonCounts = rejectedSignalOutcomes.reduce<Record<string, number>>(
      (counts, outcome) => {
        for (const reason of outcome.decision?.reasons ?? []) {
          if (typeof reason.code === "string" && reason.code.length > 0) {
            counts[reason.code] = (counts[reason.code] ?? 0) + 1;
          }
        }
        return counts;
      },
      {},
    );
    if (rejectedSignalOutcomes.length === 0) {
      for (const entry of parsed.rejectLedger?.entries ?? []) {
        const reasonCodes =
          entry.reasonCodes ??
          (entry.reasons ?? [])
            .map((reason) => reason.code)
            .filter((code): code is string => typeof code === "string" && code.length > 0);
        for (const reasonCode of reasonCodes) {
          signalRejectedReasonCounts[reasonCode] =
            (signalRejectedReasonCounts[reasonCode] ?? 0) + 1;
        }
      }
    }
    let exitReasonCodes: string[] = sellSignals.flatMap(
      (outcome) => outcome.signal?.reasonCodes ?? [],
    );
    const exitSignalIds = [
      ...new Set(
        sellSignals
          .map((outcome) => outcome.signalId ?? outcome.decision?.order?.signalId)
          .filter(
            (signalId): signalId is string =>
              typeof signalId === "string" && signalId.length > 0,
          ),
      ),
    ].sort();
    let initialBtcSnapshot: SnapshotPriceLike | undefined;
    if (typeof parsed.scenarioPath === "string" && parsed.scenarioPath.length > 0) {
      try {
        const scenarioRaw = await readFile(parsed.scenarioPath, "utf8");
        const scenarioParsed = JSON.parse(scenarioRaw) as {
          events?: Array<{
            type?: string;
            snapshot?: SnapshotPriceLike & {
              market?: string;
            };
            signal?: {
              side?: string;
              reasonCodes?: string[];
            };
          }>;
        };
        initialBtcSnapshot = (scenarioParsed.events ?? [])
          .find(
            (event) =>
              event.type === "snapshot" && event.snapshot?.market === "KRW-BTC",
          )?.snapshot;
        if (exitReasonCodes.length === 0) {
          exitReasonCodes = (scenarioParsed.events ?? [])
            .filter(
              (event) => event.type === "signal" && event.signal?.side === "sell",
            )
            .flatMap((event) => event.signal?.reasonCodes ?? []);
        }
      } catch {
        // Keep outcome-embedded reason codes when an older scenario file is missing
        // or has been replaced by a replay artifact.
      }
    }
    const syntheticClose =
      (parsed.scenarioMetadata?.summary?.syntheticCloseCount ?? 0) > 0 ||
      sellSignals.some((outcome) =>
        outcome.decision?.order?.signalId?.includes("synthetic-exit"),
      );
    const naturalExit = sellSignals.some(
      (outcome) =>
        !outcome.decision?.order?.signalId?.includes("synthetic-exit"),
    );

    const fillMarkets = [
      ...new Set(
        parsed.ledger.fills
          .map((fill) => fill.market)
          .filter((market): market is string => typeof market === "string" && market.length > 0),
      ),
    ].sort();
    const activeMarkets = [
      ...new Set([
        ...(parsed.scenarioMetadata?.summary?.marketsTraded ?? []),
        ...fillMarkets,
        ...positions.map((position) => position.market),
      ]),
    ].sort();
    const buyQuoteNotionalKrw = parsed.ledger.fills
      .filter((fill) => fill.side === "buy")
      .reduce((sum, fill) => sum + finiteNumber(fill.quoteNotional), 0);
    const sellQuoteNotionalKrw = parsed.ledger.fills
      .filter((fill) => fill.side === "sell")
      .reduce((sum, fill) => sum + finiteNumber(fill.quoteNotional), 0);
    const totalQuoteNotionalKrw = buyQuoteNotionalKrw + sellQuoteNotionalKrw;
    const partialOrders = parsed.ledger.orders.filter((order) => {
      const requestedQuantity = finiteNumber(order.requestedQuantity);
      const executedQuantity = finiteNumber(order.executedQuantity);
      return (
        (order.status === "partially_filled" || order.status === "cancelled") &&
        requestedQuantity > executedQuantity + 1e-12
      );
    });
    const partialResidualQuantity = partialOrders.reduce(
      (sum, order) =>
        sum +
        Math.max(
          finiteNumber(order.requestedQuantity) - finiteNumber(order.executedQuantity),
          0,
        ),
      0,
    );
    const partialResidualQuoteNotionalKrw = partialOrders.reduce((sum, order) => {
      const requestedQuantity = finiteNumber(order.requestedQuantity);
      const executedQuantity = finiteNumber(order.executedQuantity);
      const requestedQuote = finiteNumber(order.requestedQuoteNotional);
      const executedQuote = finiteNumber(order.executedQuoteNotional);
      if (requestedQuote > executedQuote) {
        return sum + (requestedQuote - executedQuote);
      }
      if (requestedQuantity <= 0) {
        return sum;
      }
      return sum + (requestedQuote * Math.max(requestedQuantity - executedQuantity, 0)) / requestedQuantity;
    }, 0);
    const grossFeesPaidKrw = parsed.ledger.fills.reduce(
      (sum, fill) => sum + finiteNumber(fill.feesPaid),
      0,
    );
    const btcBuyHoldBenchmark = buildBtcBuyHoldBenchmark({
      initialEquityKrw,
      strategyEndingEquityKrw: endingEquityKrw,
      initialSnapshot: initialBtcSnapshot,
      endingSnapshot: parsed.latestSnapshots?.["KRW-BTC"],
    });

    rows.push({
      reportPath,
      scenarioPath:
        typeof parsed.scenarioPath === "string" && parsed.scenarioPath.length > 0
          ? parsed.scenarioPath
          : null,
      sourceRunId:
        typeof parsed.scenarioMetadata?.sourceRunId === "string" &&
        parsed.scenarioMetadata.sourceRunId.length > 0
          ? parsed.scenarioMetadata.sourceRunId
          : null,
      generatedAt: parsed.generatedAt,
      sessionId: parsed.sessionId,
      initialCashKrw,
      initialEquityKrw,
      endingCashKrw,
      endingEquityKrw,
      realizedPnlKrw,
      markedPnlKrw,
      returnPct,
      fillCount: parsed.ledger.fills.length,
      buyFillCount: parsed.ledger.fills.filter((fill) => fill.side === "buy").length,
      sellFillCount: parsed.ledger.fills.filter((fill) => fill.side === "sell").length,
      grossFeesPaidKrw,
      orderCount: parsed.ledger.orders.length,
      marketsTraded: parsed.scenarioMetadata?.summary?.marketsTraded ?? [],
      fillMarkets,
      activeMarkets,
      openPositionCount: positions.length,
      executionMode,
      syntheticClose,
      naturalExit,
      rejectDecisionCount: parsed.rejectLedger?.totalRejectedDecisions ?? 0,
      signalDecisionCount: signalOutcomes.length,
      signalRejectedDecisionCount:
        rejectedSignalOutcomes.length > 0
          ? rejectedSignalOutcomes.length
          : parsed.rejectLedger?.entries?.length ?? 0,
      signalRejectedReasonCounts,
      reconciliationOk: parsed.reconciliation?.ok !== false,
      exitReasonCodes,
      exitSignalIds,
      suppressionCounts: parsed.scenarioMetadata?.summary?.suppressedByReason ?? {},
      signalCount:
        parsed.scenarioMetadata?.summary?.signalCount ??
        parsed.ledger.decisions?.length ??
        sellSignals.length,
      totalQuoteNotionalKrw,
      buyQuoteNotionalKrw,
      sellQuoteNotionalKrw,
      nonFeePnlKrw: markedPnlKrw + grossFeesPaidKrw,
      partialOrderCount: partialOrders.length,
      partialResidualQuantity,
      partialResidualQuoteNotionalKrw,
      entryEvaluationBucketCount:
        parsed.scenarioMetadata?.summary?.entryEvaluationBucketCount ?? 0,
      entrySuppressedCandidateCount:
        parsed.scenarioMetadata?.summary?.entrySuppressedCandidateCount ??
        Object.values(parsed.scenarioMetadata?.summary?.suppressedByReason ?? {}).reduce(
          (sum, count) => sum + count,
          0,
        ),
      entryBlockedOpenPositionBucketCount:
        parsed.scenarioMetadata?.summary?.entryBlockedOpenPositionBucketCount ?? 0,
      entryBlockedAfterExitBucketCount:
        parsed.scenarioMetadata?.summary?.entryBlockedAfterExitBucketCount ?? 0,
      entryBelowMinNotionalCount:
        parsed.scenarioMetadata?.summary?.entryBelowMinNotionalCount ?? 0,
      entrySuppressedByGateFailure:
        parsed.scenarioMetadata?.summary?.entrySuppressedByGateFailure ?? {},
      entrySuppressedGateFailureCombinations:
        parsed.scenarioMetadata?.summary?.entrySuppressedGateFailureCombinations ?? {},
      entrySuppressedGateFailureStats:
        parsed.scenarioMetadata?.summary?.entrySuppressedGateFailureStats ?? {},
      btcBuyHoldBenchmark,
    });
  }

  const tradedRows = rows.filter(
    (row) =>
      row.fillCount > 0 ||
      row.orderCount > 0 ||
      Math.abs(row.markedPnlKrw) > 1e-12 ||
      row.openPositionCount > 0,
  );
  const filledRows = rows.filter((row) => row.fillCount > 0);
  const orderedRows = rows.filter((row) => row.orderCount > 0);
  const carryOpenMarkRows = tradedRows.filter(
    (row) =>
      row.openPositionCount > 0 &&
      row.fillCount === 0 &&
      row.orderCount === 0,
  );
  const closedTradeRows = rows.filter((row) => row.sellFillCount > 0);
  const allReturnPct = rows.map((row) => row.returnPct);
  const tradedReturnPct = tradedRows.map((row) => row.returnPct);
  const allPnl = rows.map((row) => row.markedPnlKrw);
  const tradedPnl = tradedRows.map((row) => row.markedPnlKrw);
  const closedTradePnl = closedTradeRows.map((row) => row.markedPnlKrw);
  const latest = rows.at(-1) ?? null;
  const btcBuyHoldBenchmark = summarizeBtcBuyHoldBenchmark(rows);
  const promotionBtcBuyHoldBenchmark = summarizeBtcBuyHoldBenchmark(tradedRows);
  const btcTrendExposure = summarizeBtcTrendExposure(rows);
  const cycleSummary = await readCycleSummary(cyclesPath);
  const cycleCompletionRate =
    cycleSummary.completed + cycleSummary.failed > 0
      ? cycleSummary.completed / (cycleSummary.completed + cycleSummary.failed)
      : null;
  const byMarket = Object.fromEntries(
    [...new Set(tradedRows.flatMap((row) => row.activeMarkets))].sort().map((market) => [
      market,
      {
        tradedSessionCount: tradedRows.filter((row) => row.activeMarkets.includes(market)).length,
        filledSessionCount: filledRows.filter((row) => row.fillMarkets.includes(market)).length,
        orderedSessionCount: orderedRows.filter((row) => row.activeMarkets.includes(market)).length,
        openMarkSessionCount: carryOpenMarkRows.filter((row) =>
          row.activeMarkets.includes(market),
        ).length,
        openPositionSessionCount: rows.filter((row) =>
          row.activeMarkets.includes(market) && row.openPositionCount > 0,
        ).length,
        totalPnlKrw: tradedRows
          .filter((row) => row.activeMarkets.includes(market))
          .reduce((sum, row) => sum + row.markedPnlKrw, 0),
      },
    ]),
  );
  const exitReasonCounts = tradedRows
    .flatMap((row) => attributedExitReasonCodes(row))
    .reduce<Record<string, number>>((counts, reasonCode) => {
      counts[reasonCode] = (counts[reasonCode] ?? 0) + 1;
      return counts;
    }, {});
  const exitReasonProfitability = groupExitReasonProfitability(tradedRows);
  const exitAttribution = summarizeExitAttribution(tradedRows);
  const losingExitReasons = Object.entries(exitReasonProfitability)
    .filter(
      ([reasonCode, summary]) =>
        reasonCode !== UNKNOWN_EXIT_REASON &&
        summary.sessionCount >= 5 &&
        summary.totalPnlKrw < 0,
    )
    .map(([reasonCode, summary]) => ({
      reasonCode,
      sessionCount: summary.sessionCount,
      totalPnlKrw: summary.totalPnlKrw,
      avgPnlKrw: summary.avgPnlKrw,
      losingSessions: summary.losingSessions,
      profitableSessions: summary.profitableSessions,
    }));
  const closedTradeCount = rows.reduce((sum, row) => sum + row.sellFillCount, 0);
  const tradedTotalPnlKrw = tradedPnl.reduce((sum, value) => sum + value, 0);
  const closedTradeTotalPnlKrw = closedTradePnl.reduce((sum, value) => sum + value, 0);
  const carryOpenMarkTotalPnlKrw = carryOpenMarkRows.reduce(
    (sum, row) => sum + row.markedPnlKrw,
    0,
  );
  const carryOpenMarkPnlSeries = carryOpenMarkRows.map((row) => row.markedPnlKrw);
  const carryOpenMarkReturnPctSeries = carryOpenMarkRows.map((row) => row.returnPct);
  const carryOpenMarkPeakPnlKrw =
    carryOpenMarkPnlSeries.length === 0 ? null : Math.max(...carryOpenMarkPnlSeries);
  const carryOpenMarkLatestPnlKrw = carryOpenMarkPnlSeries.at(-1) ?? null;
  const tradedPnlWithoutCarryOpenMarksKrw =
    tradedTotalPnlKrw - carryOpenMarkTotalPnlKrw;
  const pnlDependsOnOpenMarks =
    tradedTotalPnlKrw > 0 && tradedPnlWithoutCarryOpenMarksKrw <= 0;
  const reconciliationFailureSessions = rows.filter((row) => !row.reconciliationOk).length;
  const rejectedDecisionSessions = rows.filter((row) => row.rejectDecisionCount > 0).length;
  const signalSessionCount = rows.filter((row) => row.signalCount > 0).length;
  const signalDecisionCount = sumRows(rows, (row) => row.signalDecisionCount);
  const signalRejectedDecisionSessions = rows.filter(
    (row) => row.signalRejectedDecisionCount > 0,
  ).length;
  const signalRejectedDecisionCount = sumRows(
    rows,
    (row) => row.signalRejectedDecisionCount,
  );
  const signalRejectedReasonCounts = summarizeSignalRejectedReasonCounts(rows);
  const syntheticCloseSessions = tradedRows.filter((row) => row.syntheticClose).length;
  const readinessChecks = {
    minimumClosedTrades: closedTradeCount >= 30,
    positiveTradedPnl: tradedTotalPnlKrw > 0,
    positiveAverageTradedPnl:
      tradedRows.length > 0 && (average(tradedPnl) ?? 0) > 0,
    positiveClosedTradePnl: closedTradeTotalPnlKrw > 0,
    noOpenMarkProfitDependency: !pnlDependsOnOpenMarks,
    noReconciliationFailures: reconciliationFailureSessions === 0,
    noRejectedDecisionSessions: rejectedDecisionSessions === 0,
    noSyntheticCloseSessions: syntheticCloseSessions === 0,
    noOpenPosition: latest !== null && latest.openPositionCount === 0,
    cycleCompletionRateOk:
      cycleSummary.evidenceAvailable &&
      cycleCompletionRate !== null &&
      cycleCompletionRate >= 0.99,
    cycleRecoverySinceLatestFailureOk:
      cycleSummary.evidenceAvailable &&
      (cycleSummary.failed === 0 ||
        cycleSummary.consecutiveCompletedSinceLatestFailure >=
          MIN_COMPLETED_CYCLES_AFTER_FAILURE_FOR_LIVE),
    noMissingExitReasonAttribution:
      exitAttribution.missingExitReasonSessionCount === 0,
    noMaterialLosingExitReasons: losingExitReasons.length === 0,
    btcBuyHoldBenchmarkAvailable:
      tradedRows.length > 0 &&
      promotionBtcBuyHoldBenchmark.missingBenchmarkSessionCount === 0,
    beatsBtcBuyAndHold: promotionBtcBuyHoldBenchmark.totalExcessPnlKrw > 0,
    positiveAverageExcessReturn:
      (promotionBtcBuyHoldBenchmark.avgExcessReturnPct ?? 0) > 0,
    positiveMedianExcessReturn:
      (promotionBtcBuyHoldBenchmark.medianExcessReturnPct ?? 0) > 0,
    positiveRiskAdjustedExcessReturn:
      (promotionBtcBuyHoldBenchmark.excessReturnInformationRatio ?? 0) > 0,
    drawdownNoWorseThanBtcBuyAndHold:
      promotionBtcBuyHoldBenchmark.strategyMaxDrawdownPct !== null &&
      promotionBtcBuyHoldBenchmark.benchmarkMaxDrawdownPct !== null &&
      promotionBtcBuyHoldBenchmark.strategyMaxDrawdownPct >=
        promotionBtcBuyHoldBenchmark.benchmarkMaxDrawdownPct,
  };
  const liveReadinessReasons = [
    ...(readinessChecks.minimumClosedTrades
      ? []
      : [`closed trade count ${closedTradeCount} is below 30`]),
    ...(readinessChecks.positiveTradedPnl
      ? []
      : [`traded total PnL ${tradedTotalPnlKrw.toFixed(6)} KRW is not positive`]),
    ...(readinessChecks.positiveAverageTradedPnl
      ? []
      : ["average traded-session PnL is not positive"]),
    ...(readinessChecks.positiveClosedTradePnl
      ? []
      : [
          `closed-trade total PnL ${closedTradeTotalPnlKrw.toFixed(6)} KRW is not positive across ${closedTradeCount} closed trades`,
        ]),
    ...(readinessChecks.noOpenMarkProfitDependency
      ? []
      : [
          `positive traded PnL depends on carry-open marked PnL ${carryOpenMarkTotalPnlKrw.toFixed(6)} KRW; realized/closed evidence remains non-positive`,
        ]),
    ...(readinessChecks.noReconciliationFailures
      ? []
      : [`${reconciliationFailureSessions} sessions failed reconciliation`]),
    ...(readinessChecks.noRejectedDecisionSessions
      ? []
      : [`${rejectedDecisionSessions} sessions had rejected decisions`]),
    ...(readinessChecks.noSyntheticCloseSessions
      ? []
      : [`${syntheticCloseSessions} traded sessions used synthetic closes`]),
    ...(readinessChecks.noOpenPosition
      ? []
      : latest === null
        ? ["no sessions available for open-position readiness check"]
        : [
            `latest session has ${latest.openPositionCount} open positions`,
          ]),
    ...(readinessChecks.cycleCompletionRateOk
      ? []
      : !cycleSummary.evidenceAvailable
        ? ["cycle evidence unavailable for this report root"]
        : [
            `cycle completion rate ${
              cycleCompletionRate === null ? "unknown" : cycleCompletionRate.toFixed(4)
            } is below 0.9900`,
          ]),
    ...(readinessChecks.cycleRecoverySinceLatestFailureOk
      ? []
      : !cycleSummary.evidenceAvailable
        ? []
        : [
          `only ${cycleSummary.consecutiveCompletedSinceLatestFailure} completed cycles since latest failure; require at least ${MIN_COMPLETED_CYCLES_AFTER_FAILURE_FOR_LIVE}`,
          ]),
    ...(readinessChecks.noMissingExitReasonAttribution
      ? []
      : [
          `${exitAttribution.missingExitReasonSessionCount} sell-fill sessions are missing exit reason attribution with total PnL ${exitAttribution.missingExitReasonPnlKrw.toFixed(6)} KRW`,
        ]),
    ...(readinessChecks.noMaterialLosingExitReasons
      ? []
      : losingExitReasons.map(
          (summary) =>
            `${summary.reasonCode} exit total PnL ${summary.totalPnlKrw.toFixed(6)} KRW across ${summary.sessionCount} sessions is negative`,
        )),
    ...(readinessChecks.btcBuyHoldBenchmarkAvailable
      ? []
      : tradedRows.length === 0
        ? ["BTC buy-and-hold benchmark has no traded sessions to evaluate"]
        : [
            `BTC buy-and-hold benchmark unavailable for ${promotionBtcBuyHoldBenchmark.missingBenchmarkSessionCount} of ${tradedRows.length} traded sessions`,
          ]),
    ...(readinessChecks.beatsBtcBuyAndHold
      ? []
      : [
          `strategy excess PnL versus BTC buy-and-hold is ${promotionBtcBuyHoldBenchmark.totalExcessPnlKrw.toFixed(6)} KRW`,
        ]),
    ...(readinessChecks.positiveAverageExcessReturn
      ? []
      : [
          `average excess return versus BTC buy-and-hold is ${
            promotionBtcBuyHoldBenchmark.avgExcessReturnPct === null
              ? "unknown"
              : promotionBtcBuyHoldBenchmark.avgExcessReturnPct.toFixed(6)
          }%`,
        ]),
    ...(readinessChecks.positiveMedianExcessReturn
      ? []
      : [
          `median excess return versus BTC buy-and-hold is ${
            promotionBtcBuyHoldBenchmark.medianExcessReturnPct === null
              ? "unknown"
              : promotionBtcBuyHoldBenchmark.medianExcessReturnPct.toFixed(6)
          }%`,
        ]),
    ...(readinessChecks.positiveRiskAdjustedExcessReturn
      ? []
      : [
          `risk-adjusted excess return versus BTC buy-and-hold is ${
            promotionBtcBuyHoldBenchmark.excessReturnInformationRatio === null
              ? "unknown"
              : promotionBtcBuyHoldBenchmark.excessReturnInformationRatio.toFixed(6)
          }`,
        ]),
    ...(readinessChecks.drawdownNoWorseThanBtcBuyAndHold
      ? []
      : [
          `strategy max drawdown ${
            promotionBtcBuyHoldBenchmark.strategyMaxDrawdownPct === null
              ? "unknown"
              : promotionBtcBuyHoldBenchmark.strategyMaxDrawdownPct.toFixed(6)
          }% is worse than BTC buy-and-hold max drawdown ${
            promotionBtcBuyHoldBenchmark.benchmarkMaxDrawdownPct === null
              ? "unknown"
              : promotionBtcBuyHoldBenchmark.benchmarkMaxDrawdownPct.toFixed(6)
          }%`,
        ]),
  ];
  const benchmarkFailedWithEnoughClosedEvidence =
    readinessChecks.minimumClosedTrades &&
    (!readinessChecks.beatsBtcBuyAndHold ||
      !readinessChecks.positiveAverageExcessReturn ||
      !readinessChecks.positiveMedianExcessReturn ||
      !readinessChecks.positiveRiskAdjustedExcessReturn);
  const strategyAssessment = {
    classification:
      liveReadinessReasons.length === 0
        ? "live_candidate"
        : !readinessChecks.btcBuyHoldBenchmarkAvailable ||
            benchmarkFailedWithEnoughClosedEvidence
          ? "discard_candidate"
          : "paper_candidate",
    benchmark: "KRW-BTC buy-and-hold",
    rationale:
      liveReadinessReasons.length === 0
        ? "strategy cleared operational, exit-quality, and BTC benchmark gates"
        : !readinessChecks.btcBuyHoldBenchmarkAvailable
          ? "strategy cannot be promoted because BTC buy-and-hold benchmark evidence is unavailable"
          : benchmarkFailedWithEnoughClosedEvidence
            ? "strategy has enough closed-trade evidence and failed BTC buy-and-hold excess-return gates"
            : "strategy remains paper-only until it has enough closed trades and demonstrates positive risk-adjusted excess return versus BTC buy-and-hold",
  };
  const suppressionCounts: Record<string, number> = {};
  for (const row of rows) {
    addSuppressionCounts(suppressionCounts, row.suppressionCounts);
  }
  const sortedSuppressionCounts = Object.fromEntries(
    Object.entries(suppressionCounts).sort((left, right) => right[1] - left[1]),
  );
  const totalQuoteNotionalKrw = sumRows(tradedRows, (row) => row.totalQuoteNotionalKrw);
  const grossFeesPaidKrw = sumRows(tradedRows, (row) => row.grossFeesPaidKrw);
  const grossPnlBeforeFeesKrw = tradedTotalPnlKrw + grossFeesPaidKrw;
  const bookImbalanceRows = tradedRows.filter((row) =>
    row.exitReasonCodes.includes("EXIT_BOOK_IMBALANCE_FAIL"),
  );
  const withoutBookImbalanceRows = tradedRows.filter(
    (row) => !row.exitReasonCodes.includes("EXIT_BOOK_IMBALANCE_FAIL"),
  );
  const exitReasonAblations = Object.fromEntries(
    [...new Set(tradedRows.flatMap((row) => row.exitReasonCodes))]
      .sort()
      .map((reasonCode) => {
        const affectedRows = tradedRows.filter((row) =>
          row.exitReasonCodes.includes(reasonCode),
        );
        const remainingRows = tradedRows.filter(
          (row) => !row.exitReasonCodes.includes(reasonCode),
        );
        return [
          reasonCode,
          {
            affected: summarizeExperimentRows(affectedRows),
            diagnosticAblationRemaining: summarizeExperimentRows(remainingRows),
          },
        ];
      }),
  );
  const exitReasonBenchmarkComparison =
    groupExitReasonBenchmarkComparison(tradedRows);
  const timeStopRows = tradedRows.filter((row) =>
    row.exitReasonCodes.includes("EXIT_TIME_STOP_15M"),
  );
  const timeStopPositiveBenchmarkRows = timeStopRows.filter(
    (row) => (row.btcBuyHoldBenchmark?.pnlKrw ?? 0) > 1e-12,
  );
  const timeStopNegativeBenchmarkRows = timeStopRows.filter(
    (row) => (row.btcBuyHoldBenchmark?.pnlKrw ?? 0) < -1e-12,
  );
  const partialResidualRows = rows.filter((row) => row.partialOrderCount > 0);
  let latestInactiveSessionCount = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || row.signalCount > 0 || row.fillCount > 0 || row.orderCount > 0) {
      break;
    }
    latestInactiveSessionCount += 1;
  }
  const latestInactiveSince =
    latestInactiveSessionCount > 0
      ? rows.at(-latestInactiveSessionCount)?.generatedAt ?? null
      : null;

  const summary = {
    source: {
      reportsRoot,
      cyclesPath,
    },
    cycleSummary: {
      ...cycleSummary,
      completionRate: cycleCompletionRate,
    },
    sessionCount: rows.length,
    skippedSessionCount,
    skippedMissingMarkCount,
    exposureSessionCount: tradedRows.length,
    tradedSessionCount: tradedRows.length,
    filledSessionCount: filledRows.length,
    orderedSessionCount: orderedRows.length,
    openMarkSessionCount: carryOpenMarkRows.length,
    openPositionSessionCount: rows.filter((row) => row.openPositionCount > 0).length,
    sessionCountInterpretation:
      "tradedSessionCount/exposureSessionCount includes sessions with fills, orders, non-zero PnL, or carried open positions; filledSessionCount counts sessions with actual fills.",
    latestSession: latest,
    exitQuality: {
      syntheticCloseRate:
        tradedRows.length > 0
          ? tradedRows.filter((row) => row.syntheticClose).length / tradedRows.length
          : null,
      naturalExitRate:
        tradedRows.length > 0
          ? tradedRows.filter((row) => row.naturalExit).length / tradedRows.length
          : null,
      exitReasonCounts,
      exitReasonProfitability,
      exitReasonBenchmarkComparison,
      losingExitReasons,
      exitAttribution,
    },
    btcBuyHoldBenchmark,
    promotionBtcBuyHoldBenchmark,
    btcTrendExposure,
    strategyAssessment,
    liveReadiness: {
      paperOnlyRecommended: liveReadinessReasons.length > 0,
      checks: readinessChecks,
      reasons: liveReadinessReasons,
      closedTradeCount,
    },
    quality: {
      reconciliationFailureSessions,
      rejectedDecisionSessions,
      signalRejectedDecisionSessions,
      signalRejectedDecisionCount,
      signalRejectedReasonCounts,
    },
    lossCauseExperiments: {
      feeHurdle: {
        experimentType: "diagnostic_sensitivity",
        current: summarizeExperimentRows(tradedRows),
        closedTradesOnly: summarizeExperimentRows(closedTradeRows),
        zeroFeeSensitivity: {
          grossPnlBeforeFeesKrw,
          wouldStillLoseWithoutFees: grossPnlBeforeFeesKrw <= 0,
          feeDragShareOfNetLoss:
            tradedTotalPnlKrw < 0 && grossFeesPaidKrw > 0
              ? grossFeesPaidKrw / Math.abs(tradedTotalPnlKrw)
              : null,
        },
        currentFeeBreakevenMultiple:
          grossFeesPaidKrw > 0 ? Math.max(grossPnlBeforeFeesKrw, 0) / grossFeesPaidKrw : null,
        requiredGrossEdgeToPayObservedFeesBps:
          totalQuoteNotionalKrw > 0 ? (grossFeesPaidKrw / totalQuoteNotionalKrw) * 10_000 : null,
      },
      bookImbalanceExit: {
        experimentType: "diagnostic_ablation_not_strategy_pnl",
        affected: summarizeExperimentRows(bookImbalanceRows),
        withoutAffectedSessions: summarizeExperimentRows(withoutBookImbalanceRows),
        exitReasonAblations,
      },
      timeStopExit: {
        experimentType: "exit_reason_benchmark_diagnostic",
        note:
          "Compares EXIT_TIME_STOP_15M rows against same-window BTC buy-and-hold to separate weak entries from premature exits.",
        affected: summarizeExperimentRows(timeStopRows),
        benchmarkComparison: summarizeBenchmarkComparison(timeStopRows),
        positiveBenchmarkWindows: summarizeBenchmarkComparison(
          timeStopPositiveBenchmarkRows,
        ),
        negativeBenchmarkWindows: summarizeBenchmarkComparison(
          timeStopNegativeBenchmarkRows,
        ),
      },
      partialFillResidual: {
        experimentType: "operational_risk_measurement",
        sessionCount: partialResidualRows.length,
        partialOrderCount: sumRows(rows, (row) => row.partialOrderCount),
        residualQuantity: sumRows(rows, (row) => row.partialResidualQuantity),
        residualQuoteNotionalKrw: sumRows(rows, (row) => row.partialResidualQuoteNotionalKrw),
        affectedPnlKrw: sumRows(partialResidualRows, (row) => row.markedPnlKrw),
        affectedBenchmarkComparison: summarizeBenchmarkComparison(partialResidualRows),
        affectedSessionIds: partialResidualRows.map((row) => row.sessionId),
      },
      openMarkDependency: {
        experimentType: "open_risk_conversion_measurement",
        note:
          "Separates closed-trade evidence from mark-to-market gains on carried positions so reduced exits are not mistaken for realized profitability.",
        closedTradeTotalPnlKrw,
        carryOpenMarkTotalPnlKrw,
        carryOpenMarkPeakPnlKrw,
        carryOpenMarkLatestPnlKrw,
        carryOpenMarkDrawdownFromPeakKrw:
          carryOpenMarkPeakPnlKrw === null || carryOpenMarkLatestPnlKrw === null
            ? null
            : carryOpenMarkLatestPnlKrw - carryOpenMarkPeakPnlKrw,
        carryOpenMarkMaxDrawdownKrw: maxDrawdownValue(carryOpenMarkPnlSeries),
        carryOpenMarkReturnStdDevPct: sampleStdDev(carryOpenMarkReturnPctSeries),
        tradedTotalPnlKrw,
        tradedPnlWithoutCarryOpenMarksKrw,
        pnlDependsOnOpenMarks,
        carryOpenMarkOnly: summarizeExperimentRows(carryOpenMarkRows),
      },
      entryInactivity: {
        experimentType: "suppression_denominator_measurement",
        zeroSignalSessions: rows.filter((row) => row.signalCount === 0).length,
        zeroSignalSessionRate:
          rows.length > 0
            ? rows.filter((row) => row.signalCount === 0).length / rows.length
            : null,
        latestInactiveSessionCount,
        latestInactiveSince,
        entryEvaluationBucketCount: sumRows(rows, (row) => row.entryEvaluationBucketCount),
        entrySuppressedCandidateCount: sumRows(rows, (row) => row.entrySuppressedCandidateCount),
        entryBlockedOpenPositionBucketCount: sumRows(
          rows,
          (row) => row.entryBlockedOpenPositionBucketCount,
        ),
        entryBlockedAfterExitBucketCount: sumRows(
          rows,
          (row) => row.entryBlockedAfterExitBucketCount,
        ),
        entryBelowMinNotionalCount: sumRows(rows, (row) => row.entryBelowMinNotionalCount),
        suppressionCounts: sortedSuppressionCounts,
        suppressedByGateFailure: summarizeGateFailureCounts(rows),
        gateFailureCombinations: summarizeGateFailureCombinations(rows),
        gateFailureStats: summarizeGateFailureStats(rows),
      },
      entryExecutionGuardRejections: {
        experimentType: "signal_execution_guard_denominator",
        signalSessionCount,
        signalDecisionCount,
        signalRejectedSessionCount: signalRejectedDecisionSessions,
        signalRejectedDecisionCount,
        signalRejectedSessionRate:
          signalSessionCount > 0 ? signalRejectedDecisionSessions / signalSessionCount : null,
        signalRejectedDecisionRate:
          signalDecisionCount > 0 ? signalRejectedDecisionCount / signalDecisionCount : null,
        reasonCounts: signalRejectedReasonCounts,
      },
    },
    allSessions: {
      avgReturnPct: average(allReturnPct),
      medianReturnPct: median(allReturnPct),
      avgPnlKrw: average(allPnl),
      totalPnlKrw: allPnl.reduce((sum, value) => sum + value, 0),
      profitableSessions: rows.filter((row) => row.markedPnlKrw > 1e-12).length,
      losingSessions: rows.filter((row) => row.markedPnlKrw < -1e-12).length,
      flatSessions: rows.filter((row) => Math.abs(row.markedPnlKrw) <= 1e-12).length,
      openPositionSessions: rows.filter((row) => row.openPositionCount > 0).length,
    },
    tradedSessionsOnly: {
      avgReturnPct: average(tradedReturnPct),
      medianReturnPct: median(tradedReturnPct),
      avgPnlKrw: average(tradedPnl),
      totalPnlKrw: tradedPnl.reduce((sum, value) => sum + value, 0),
      grossFeesPaidKrw: tradedRows.reduce(
        (sum, row) => sum + row.grossFeesPaidKrw,
        0,
      ),
      closedTradeCount: tradedRows.reduce((sum, row) => sum + row.sellFillCount, 0),
      profitableSessions: tradedRows.filter((row) => row.markedPnlKrw > 1e-12).length,
      losingSessions: tradedRows.filter((row) => row.markedPnlKrw < -1e-12).length,
      flatSessions: tradedRows.filter((row) => Math.abs(row.markedPnlKrw) <= 1e-12).length,
      openPositionSessions: tradedRows.filter((row) => row.openPositionCount > 0).length,
    },
    closedTradesOnly: {
      sessionCount: closedTradeRows.length,
      avgReturnPct: average(closedTradeRows.map((row) => row.returnPct)),
      medianReturnPct: median(closedTradeRows.map((row) => row.returnPct)),
      avgPnlKrw: average(closedTradePnl),
      totalPnlKrw: closedTradePnl.reduce((sum, value) => sum + value, 0),
      grossFeesPaidKrw: closedTradeRows.reduce(
        (sum, row) => sum + row.grossFeesPaidKrw,
        0,
      ),
      closedTradeCount,
      profitableSessions: closedTradeRows.filter((row) => row.markedPnlKrw > 1e-12).length,
      losingSessions: closedTradeRows.filter((row) => row.markedPnlKrw < -1e-12).length,
      flatSessions: closedTradeRows.filter((row) => Math.abs(row.markedPnlKrw) <= 1e-12).length,
    },
    carryOpenMarkOnly: {
      sessionCount: carryOpenMarkRows.length,
      avgReturnPct: average(carryOpenMarkRows.map((row) => row.returnPct)),
      medianReturnPct: median(carryOpenMarkRows.map((row) => row.returnPct)),
      avgPnlKrw: average(carryOpenMarkRows.map((row) => row.markedPnlKrw)),
      totalPnlKrw: carryOpenMarkRows.reduce((sum, row) => sum + row.markedPnlKrw, 0),
      latestSessionId: carryOpenMarkRows.at(-1)?.sessionId ?? null,
    },
    byMarket,
    recentTradedSessions: tradedRows.slice(-10),
  };

  const output = `${JSON.stringify(summary, null, 2)}\n`;
  if (outputPath !== null) {
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: "dry_run_return_summary_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
