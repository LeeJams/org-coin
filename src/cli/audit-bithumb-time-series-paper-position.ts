import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import type { PaperSessionScenario } from "../contracts/paper-session.js";
import { persistPaperSessionReport } from "../execution/paper-session-artifacts.js";
import { createPaperSessionRunner, type PaperSessionReport } from "../execution/session-runner.js";
import type { PortfolioPosition, PortfolioState } from "../execution/types.js";
import { loadExecutionRuntimeConfig } from "../runtime/config.js";

interface Args {
  inputPaperReportPath: string | null;
  inputPaperObservationPath: string | null;
  inputObservationPath: string | null;
  outputPath: string | null;
  reportsDir: string;
  executeExitWhenDue: boolean;
  maxSlippageBps: number;
  confidence: number;
}

interface ObservationReport {
  generatedAt: string;
  candidate: {
    market: string;
    unitMinutes: number;
    holdBars: number;
  };
  orderbook: {
    bestAsk: number;
    bestBid: number;
    bestAskSize: number;
    bestBidSize: number;
    spreadBps: number | null;
    sellDepth: DepthSummary | null;
  };
  ticker: {
    tradePrice: number;
    accTradePrice24h: number;
  };
}

interface DepthSummary {
  levels: number;
  notionalKrw: number;
  coversRequestedNotional: boolean;
  worstPrice: number;
  vwapPrice: number;
  slippageBps: number | null;
}

interface PaperObservationReport {
  sourceObservationPath?: string;
  paper?: {
    reportPath?: string;
    openPositionCount?: number;
  };
}

interface PaperReportInput {
  path: string;
  sourceObservationPath: string | null;
}

interface ExitRegistry {
  schemaVersion: "1.0.0";
  reusePolicy: "first_reduce_only_exit_for_entry_signal";
  sourceEntrySignalId: string;
  firstObservedAt: string;
  exitObservationGeneratedAt: string;
  reportPath?: string;
  ledgerPath?: string;
  reconciliationOk: boolean;
  openPositionCount: number;
  realizedExitNetPnlKrw?: number;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    inputPaperReportPath: null,
    inputPaperObservationPath: null,
    inputObservationPath: null,
    outputPath: null,
    reportsDir: resolve(cwd, "var/paper-sessions-btc-240m-momentum-observation"),
    executeExitWhenDue: false,
    maxSlippageBps: 8,
    confidence: 0.6,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--input-paper-report") {
      if (!value) throw new Error("--input-paper-report requires a value");
      args.inputPaperReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--input-paper-observation") {
      if (!value) throw new Error("--input-paper-observation requires a value");
      args.inputPaperObservationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--input-observation") {
      if (!value) throw new Error("--input-observation requires a value");
      args.inputObservationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--reports-dir") {
      if (!value) throw new Error("--reports-dir requires a value");
      args.reportsDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--execute-exit-when-due") {
      args.executeExitWhenDue = true;
      continue;
    }
    if (arg === "--max-slippage-bps") {
      if (!value) throw new Error("--max-slippage-bps requires a value");
      args.maxSlippageBps = positiveNumber(value, "--max-slippage-bps");
      index += 1;
      continue;
    }
    if (arg === "--confidence") {
      if (!value) throw new Error("--confidence requires a value");
      args.confidence = boundedNumber(value, "--confidence", 0, 1);
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.inputPaperReportPath === null && args.inputPaperObservationPath === null) {
    throw new Error("--input-paper-report or --input-paper-observation is required");
  }
  if (args.inputObservationPath === null) throw new Error("--input-observation is required");

  return args;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return parsed;
}

function boundedNumber(value: string, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function nestedRecord(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (!isRecord(value)) throw new Error(`${key} must be an object`);
  return value;
}

function maybeDepthSummary(value: unknown): DepthSummary | null {
  if (!isRecord(value)) return null;
  return {
    levels: finiteNumber(value.levels),
    notionalKrw: finiteNumber(value.notionalKrw),
    coversRequestedNotional: value.coversRequestedNotional === true,
    worstPrice: finiteNumber(value.worstPrice),
    vwapPrice: finiteNumber(value.vwapPrice),
    slippageBps: value.slippageBps === null ? null : finiteNumber(value.slippageBps),
  };
}

function normalizeObservation(input: unknown): ObservationReport {
  if (!isRecord(input)) throw new Error("observation report must be an object");
  const candidate = nestedRecord(input, "candidate");
  const orderbook = nestedRecord(input, "orderbook");
  const ticker = nestedRecord(input, "ticker");
  const generatedAt = nonEmptyString(input.generatedAt);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("observation.generatedAt must be an ISO timestamp");
  }
  return {
    generatedAt,
    candidate: {
      market: nonEmptyString(candidate.market),
      unitMinutes: finiteNumber(candidate.unitMinutes),
      holdBars: finiteNumber(candidate.holdBars),
    },
    orderbook: {
      bestAsk: finiteNumber(orderbook.bestAsk),
      bestBid: finiteNumber(orderbook.bestBid),
      bestAskSize: finiteNumber(orderbook.bestAskSize),
      bestBidSize: finiteNumber(orderbook.bestBidSize),
      spreadBps: orderbook.spreadBps === null ? null : finiteNumber(orderbook.spreadBps),
      sellDepth: maybeDepthSummary(orderbook.sellDepth),
    },
    ticker: {
      tradePrice: finiteNumber(ticker.tradePrice),
      accTradePrice24h: finiteNumber(ticker.accTradePrice24h),
    },
  };
}

function normalizePaperReport(input: unknown): PaperSessionReport {
  if (!isRecord(input)) throw new Error("paper report must be an object");
  if (input.schemaVersion !== "1.0.0") throw new Error("paper report schemaVersion must be 1.0.0");
  return input as unknown as PaperSessionReport;
}

function normalizePaperObservation(input: unknown): PaperObservationReport {
  if (!isRecord(input)) throw new Error("paper observation report must be an object");
  const paper = isRecord(input.paper) ? input.paper : undefined;
  return {
    sourceObservationPath: nonEmptyString(input.sourceObservationPath),
    paper:
      paper === undefined
        ? undefined
        : {
            reportPath: nonEmptyString(paper.reportPath),
            openPositionCount: finiteNumber(paper.openPositionCount),
          },
  };
}

function resolvePossiblyRelativePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function conservativeExitPrice(observation: ObservationReport): number {
  const sellDepth = observation.orderbook.sellDepth;
  if (
    sellDepth &&
    sellDepth.coversRequestedNotional &&
    sellDepth.vwapPrice > 0 &&
    sellDepth.vwapPrice <= observation.orderbook.bestBid
  ) {
    return sellDepth.vwapPrice;
  }
  return observation.orderbook.bestBid;
}

function findOpenPosition(report: PaperSessionReport, market: string): PortfolioPosition {
  const position = report.portfolio.positions[market];
  if (!position || position.baseQuantity <= 0) {
    throw new Error(`paper report has no open position for ${market}`);
  }
  return position;
}

function maybeOpenPosition(report: PaperSessionReport, market: string): PortfolioPosition | null {
  const position = report.portfolio.positions[market];
  return position && position.baseQuantity > 0 ? position : null;
}

function acceptedEntrySignalId(report: PaperSessionReport, market: string): string {
  const accepted = report.ledger.decisions.find(
    (decision) => decision.accepted && decision.market === market && decision.signalId,
  );
  if (!accepted?.signalId) throw new Error(`paper report has no accepted entry signal for ${market}`);
  return accepted.signalId;
}

function maybeAcceptedEntrySignalId(report: PaperSessionReport, market: string): string | null {
  const accepted = report.ledger.decisions.find(
    (decision) => decision.accepted && decision.market === market && decision.signalId,
  );
  return accepted?.signalId ?? null;
}

function entryCandleAtFromSignal(signalId: string): string {
  const match = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/u.exec(signalId);
  if (!match) throw new Error("accepted signalId does not end with an entry candle timestamp");
  return match[1]!;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString();
}

function buildSnapshot(observation: ObservationReport) {
  const exitPrice = conservativeExitPrice(observation);
  const adjustedSpreadBps =
    exitPrice !== observation.orderbook.bestBid &&
    observation.orderbook.bestAsk > 0 &&
    exitPrice > 0
      ? Math.max(0, bps(observation.orderbook.bestAsk, exitPrice))
      : (observation.orderbook.spreadBps ?? 0);
  const sellDepth = observation.orderbook.sellDepth;
  const exitSize =
    sellDepth && sellDepth.notionalKrw > 0 && exitPrice > 0
      ? sellDepth.notionalKrw / exitPrice
      : observation.orderbook.bestBidSize;
  return {
    market: observation.candidate.market,
    asOf: observation.generatedAt,
    lastTradePrice:
      observation.ticker.tradePrice > 0
        ? Math.min(observation.ticker.tradePrice, exitPrice)
        : exitPrice,
    bestBidPrice: exitPrice,
    bestAskPrice: observation.orderbook.bestAsk,
    bestBidSize: exitSize,
    bestAskSize: observation.orderbook.bestAskSize,
    spreadBps: adjustedSpreadBps,
    depthRatio: 1,
    rolling24hNotional: observation.ticker.accTradePrice24h,
  };
}

function markPosition(position: PortfolioPosition, observation: ObservationReport) {
  const exitPrice = conservativeExitPrice(observation);
  const grossExitValue = position.baseQuantity * exitPrice;
  const exitFee = grossExitValue * 0.0004;
  const entryCost = position.baseQuantity * position.avgEntryPrice;
  const estimatedExitNetPnl = grossExitValue - exitFee - entryCost;
  return {
    quantity: position.baseQuantity,
    avgEntryPrice: round(position.avgEntryPrice),
    markBidPrice: observation.orderbook.bestBid,
    markExitPrice: round(exitPrice),
    markPricingBasis:
      exitPrice === observation.orderbook.bestBid ? "best_bid" : "sell_depth_vwap",
    entryCostKrw: round(entryCost),
    grossExitValueKrw: round(grossExitValue),
    estimatedExitFeeKrw: round(exitFee),
    estimatedExitNetPnlKrw: round(estimatedExitNetPnl),
    estimatedExitReturnPct: entryCost > 0 ? round((estimatedExitNetPnl / entryCost) * 100) : null,
  };
}

function registryPath(args: Args, entrySignalId: string): string {
  const safeId = entrySignalId.replace(/[^a-zA-Z0-9._-]/gu, "_");
  return resolve(args.reportsDir, "exit-registry", `${safeId}.json`);
}

async function readExitRegistry(path: string, entrySignalId: string): Promise<ExitRegistry | null> {
  try {
    const registry = JSON.parse(await readFile(path, "utf8")) as ExitRegistry;
    if (
      registry.schemaVersion === "1.0.0" &&
      registry.reusePolicy === "first_reduce_only_exit_for_entry_signal" &&
      registry.sourceEntrySignalId === entrySignalId &&
      typeof registry.exitObservationGeneratedAt === "string" &&
      !Number.isNaN(Date.parse(registry.exitObservationGeneratedAt)) &&
      registry.reconciliationOk === true &&
      registry.openPositionCount === 0 &&
      typeof registry.realizedExitNetPnlKrw === "number" &&
      Number.isFinite(registry.realizedExitNetPnlKrw)
    ) {
      return registry;
    }
    return null;
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

async function writeExitRegistry(path: string, registry: ExitRegistry): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

async function executeExit(
  args: Args,
  report: PaperSessionReport,
  observation: ObservationReport,
  position: PortfolioPosition,
  entrySignalId: string,
) {
  const strategyId = report.scenarioMetadata?.strategyId ?? "btc_240m_momentum_public_v1";
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    clockAt: observation.generatedAt,
    reconcileAt: observation.generatedAt,
    initialPortfolio: report.portfolio as PortfolioState,
    metadata: {
      generatedAt: observation.generatedAt,
      strategyId,
      modeIntent: "paper",
      initialCashKrw: report.portfolio.cashAvailable,
      entryProfile: report.scenarioMetadata?.entryProfile,
      exitProfile: "hold_window_reduce_only",
      carryOpenPositions: false,
      eligibilityNote:
        "Reduce-only paper exit generated only after the configured public candle hold window elapsed.",
      summary: {
        snapshotCount: 1,
        signalCount: 1,
        entrySignalCount: 0,
        exitSignalCount: 1,
        syntheticCloseCount: 0,
        marketsTraded: [observation.candidate.market],
        suppressedByReason: {},
      },
    },
    events: [
      { type: "snapshot", snapshot: buildSnapshot(observation) },
      {
        type: "signal",
        receivedAt: observation.generatedAt,
        signal: {
          schemaVersion: "1.0.0",
          signalId: `${entrySignalId}-exit-${observation.generatedAt}`,
          strategyId,
          market: observation.candidate.market,
          side: "sell",
          sizing: { basis: "position_fraction", value: 1 },
          confidence: args.confidence,
          generatedAt: observation.generatedAt,
          expiresAt: addMinutes(observation.generatedAt, 10),
          maxSlippageBps: args.maxSlippageBps,
          reduceOnly: true,
          reasonCodes: ["EXIT_HOLD_WINDOW_ELAPSED", "REDUCE_ONLY"],
          metadata: {
            sourceEntrySignalId: entrySignalId,
            baseQuantity: position.baseQuantity,
          },
        },
      },
    ],
  };
  const config = loadExecutionRuntimeConfig({
    cwd: process.cwd(),
    envFilePath: null,
    env: {
      TRADING_MODE: "paper",
      ENABLE_LIVE_EXECUTION: "false",
      PAPER_SESSION_ARTIFACTS_DIR: args.reportsDir,
      DATA_STALE_AFTER_MS: "600000",
    },
  });
  const runner = createPaperSessionRunner(config, {
    clock: () => new Date(observation.generatedAt),
    portfolio: scenario.initialPortfolio,
  });
  return persistPaperSessionReport({
    report: await runner.runScenario(scenario),
    baseDir: args.reportsDir,
    sessionId: `paper-${strategyId}-exit-${observation.generatedAt.replace(/[:.]/gu, "")}`,
    scenarioPath: args.inputObservationPath ?? undefined,
  });
}

async function resolvePaperReportInput(args: Args): Promise<PaperReportInput> {
  if (args.inputPaperReportPath !== null) {
    return { path: args.inputPaperReportPath, sourceObservationPath: null };
  }
  const rawPaperObservation = await readFile(args.inputPaperObservationPath!, "utf8");
  const paperObservation = normalizePaperObservation(JSON.parse(rawPaperObservation) as unknown);
  const sourceObservationPath = paperObservation.sourceObservationPath;
  if (!sourceObservationPath) {
    throw new Error("paper observation does not include sourceObservationPath");
  }
  const reportPath = paperObservation.paper?.reportPath;
  if (!reportPath) {
    throw new Error("paper observation does not include paper.reportPath");
  }
  return {
    path: resolvePossiblyRelativePath(reportPath),
    sourceObservationPath: resolvePossiblyRelativePath(sourceObservationPath),
  };
}

function validatePaperObservationSource(
  paperReport: PaperSessionReport,
  paperReportInput: PaperReportInput,
): void {
  if (paperReportInput.sourceObservationPath === null) return;
  const scenarioPath = nonEmptyString(paperReport.scenarioPath);
  if (!scenarioPath) {
    throw new Error("paper report must include scenarioPath when using --input-paper-observation");
  }
  if (resolvePossiblyRelativePath(scenarioPath) !== paperReportInput.sourceObservationPath) {
    throw new Error("paper observation sourceObservationPath does not match paper report scenarioPath");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const paperReportInput = await resolvePaperReportInput(args);
  const [rawPaperReport, rawObservation] = await Promise.all([
    readFile(paperReportInput.path, "utf8"),
    readFile(args.inputObservationPath!, "utf8"),
  ]);
  const paperReport = normalizePaperReport(JSON.parse(rawPaperReport) as unknown);
  validatePaperObservationSource(paperReport, paperReportInput);
  const observation = normalizeObservation(JSON.parse(rawObservation) as unknown);
  const position = maybeOpenPosition(paperReport, observation.candidate.market);
  const entrySignalId = maybeAcceptedEntrySignalId(paperReport, observation.candidate.market);
  if (position === null || entrySignalId === null) {
    const outputReport = {
      generatedAt: new Date().toISOString(),
      note:
        "Paper position audit for the public time-series candidate. No open position is treated as a normal observation state, not a command failure.",
      sourcePaperReportPath: paperReportInput.path,
      sourcePaperObservationPath: args.inputPaperObservationPath,
      sourceObservationPath: args.inputObservationPath,
      candidate: observation.candidate,
      timing: {
        entryCandleAt: null,
        observedAt: observation.generatedAt,
        holdExitDueAt: null,
        holdElapsed: null,
        minutesUntilHoldExit: null,
      },
      mark: {
        estimatedExitNetPnlKrw: null,
        estimatedExitReturnPct: null,
      },
      exit: {
        attempted: false,
        reason: position === null ? "no_open_position" : "no_accepted_entry_signal",
        reconciliationOk: paperReport.reconciliation.ok,
        openPositionCount: paperReport.reconciliation.openPositions.length,
      },
    };
    const output = `${JSON.stringify(outputReport, null, 2)}\n`;
    if (args.outputPath) {
      await mkdir(dirname(args.outputPath), { recursive: true });
      await writeFile(args.outputPath, output, "utf8");
    }
    process.stdout.write(output);
    return;
  }
  const entryCandleAt = entryCandleAtFromSignal(entrySignalId);
  const holdExitDueAt = addMinutes(
    entryCandleAt,
    observation.candidate.unitMinutes * observation.candidate.holdBars,
  );
  const holdElapsed = Date.parse(observation.generatedAt) >= Date.parse(holdExitDueAt);
  const exitRegistryPath = registryPath(args, entrySignalId);
  const priorExit = holdElapsed ? await readExitRegistry(exitRegistryPath, entrySignalId) : null;
  const exitReport =
    holdElapsed && args.executeExitWhenDue && priorExit === null
      ? await executeExit(args, paperReport, observation, position, entrySignalId)
      : null;
  const exitRegistry =
    exitReport !== null
      ? {
          schemaVersion: "1.0.0" as const,
          reusePolicy: "first_reduce_only_exit_for_entry_signal" as const,
          sourceEntrySignalId: entrySignalId,
          firstObservedAt: observation.generatedAt,
          exitObservationGeneratedAt: observation.generatedAt,
          reportPath: exitReport.artifacts?.reportPath,
          ledgerPath: exitReport.artifacts?.ledgerPath,
          reconciliationOk: exitReport.reconciliation.ok,
          openPositionCount: exitReport.reconciliation.openPositions.length,
          realizedExitNetPnlKrw: round(exitReport.portfolio.dailyRealizedPnl),
        }
      : priorExit;
  if (exitReport !== null && exitRegistry !== null) {
    await writeExitRegistry(exitRegistryPath, exitRegistry);
  }

  const outputReport = {
    generatedAt: new Date().toISOString(),
    note:
      "Paper position audit for the public time-series candidate. Mark-to-market is diagnostic only; reduce-only exit is generated only when the configured hold window has elapsed and --execute-exit-when-due is set.",
    sourcePaperReportPath: paperReportInput.path,
    sourcePaperObservationPath: args.inputPaperObservationPath,
    sourceObservationPath: args.inputObservationPath,
    candidate: observation.candidate,
    timing: {
      entryCandleAt,
      observedAt: observation.generatedAt,
      holdExitDueAt,
      holdElapsed,
      minutesUntilHoldExit:
        holdElapsed
          ? 0
          : round((Date.parse(holdExitDueAt) - Date.parse(observation.generatedAt)) / 60_000),
    },
    mark: markPosition(position, observation),
    exit: exitRegistry
      ? {
          attempted: true,
          reusedExistingExit: exitReport === null,
          reusePolicy: exitRegistry.reusePolicy,
          registryPath: exitRegistryPath,
          firstObservedAt: exitRegistry.firstObservedAt,
          exitObservationGeneratedAt: exitRegistry.exitObservationGeneratedAt,
          reconciliationOk: exitRegistry.reconciliationOk,
          openPositionCount: exitRegistry.openPositionCount,
          realizedExitNetPnlKrw: exitRegistry.realizedExitNetPnlKrw ?? null,
          reportPath: exitRegistry.reportPath,
          ledgerPath: exitRegistry.ledgerPath,
        }
      : {
          attempted: false,
          reason: holdElapsed ? "execute_exit_when_due_not_set" : "hold_window_not_elapsed",
        },
  };

  const output = `${JSON.stringify(outputReport, null, 2)}\n`;
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
