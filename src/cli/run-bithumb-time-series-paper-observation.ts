import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { PaperSessionScenario } from "../contracts/paper-session.js";
import type { SignalIntent } from "../contracts/signal-intent.js";
import { persistPaperSessionReport } from "../execution/paper-session-artifacts.js";
import { createPaperSessionRunner } from "../execution/session-runner.js";
import { loadExecutionRuntimeConfig } from "../runtime/config.js";

interface Args {
  inputObservationPath: string | null;
  outputPath: string | null;
  reportsDir: string;
  strategyId: string;
  confidence: number;
  maxSlippageBps: number;
  initialCashKrw: number;
}

interface ObservationReport {
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
    latestClose: number;
    previousClose: number;
    lookbackReturnBps: number;
    riskValue: number | null;
    directionalSignalPass: boolean;
    riskPass: boolean;
  };
  orderbook: {
    bestAsk: number;
    bestBid: number;
    bestAskSize: number;
    bestBidSize: number;
    spreadBps: number | null;
    buyDepth: { notionalKrw: number; coversRequestedNotional: boolean };
    sellDepth: { notionalKrw: number; coversRequestedNotional: boolean };
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

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    inputObservationPath: null,
    outputPath: null,
    reportsDir: resolve(cwd, "var/paper-sessions-btc-240m-momentum-observation"),
    strategyId: "btc_240m_momentum_public_v1",
    confidence: 0.6,
    maxSlippageBps: 8,
    initialCashKrw: 10_000_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
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
    if (arg === "--strategy-id") {
      if (!value) throw new Error("--strategy-id requires a value");
      args.strategyId = value;
      index += 1;
      continue;
    }
    if (arg === "--confidence") {
      if (!value) throw new Error("--confidence requires a value");
      args.confidence = boundedNumber(value, "--confidence", 0, 1);
      index += 1;
      continue;
    }
    if (arg === "--max-slippage-bps") {
      if (!value) throw new Error("--max-slippage-bps requires a value");
      args.maxSlippageBps = positiveNumber(value, "--max-slippage-bps");
      index += 1;
      continue;
    }
    if (arg === "--initial-cash-krw") {
      if (!value) throw new Error("--initial-cash-krw requires a value");
      args.initialCashKrw = positiveNumber(value, "--initial-cash-krw");
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.inputObservationPath === null) {
    throw new Error("--input-observation is required");
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

function boundedNumber(value: string, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}`);
  }
  return parsed;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNestedRecord(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (!isRecord(value)) throw new Error(`observation.${key} must be an object`);
  return value;
}

function normalizeObservation(input: unknown): ObservationReport {
  if (!isRecord(input)) throw new Error("observation report must be an object");
  const candidate = readNestedRecord(input, "candidate");
  const signal = readNestedRecord(input, "signal");
  const orderbook = readNestedRecord(input, "orderbook");
  const ticker = readNestedRecord(input, "ticker");
  const decision = readNestedRecord(input, "decision");
  const buyDepth = readNestedRecord(orderbook, "buyDepth");
  const sellDepth = readNestedRecord(orderbook, "sellDepth");

  const generatedAt = nonEmptyString(input.generatedAt);
  const market = nonEmptyString(candidate.market);
  const signalMode = candidate.signalMode;
  const latestCandleAt = nonEmptyString(signal.latestCandleAt);
  const previousCandleAt = nonEmptyString(signal.previousCandleAt);
  const bestAskSize = finiteNumber(orderbook.bestAskSize);
  const bestBidSize = finiteNumber(orderbook.bestBidSize);
  const executionViability = nonEmptyString(decision.executionViability);
  const mayAttemptPaperExecution =
    executionViability === "watch_candidate" &&
    signal.active === true &&
    signal.directionalSignalPass === true &&
    signal.riskPass === true;

  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("observation.generatedAt must be an ISO timestamp");
  }
  if (!market) throw new Error("observation.candidate.market is required");
  if (signalMode !== "momentum" && signalMode !== "reversal") {
    throw new Error("observation.candidate.signalMode must be momentum or reversal");
  }
  if (!latestCandleAt || Number.isNaN(Date.parse(latestCandleAt))) {
    throw new Error("observation.signal.latestCandleAt must be an ISO timestamp");
  }
  if (!previousCandleAt || Number.isNaN(Date.parse(previousCandleAt))) {
    throw new Error("observation.signal.previousCandleAt must be an ISO timestamp");
  }
  if (mayAttemptPaperExecution && (bestAskSize <= 0 || bestBidSize <= 0)) {
    throw new Error("observation.orderbook.bestAskSize and bestBidSize are required for paper execution");
  }

  return {
    generatedAt,
    candidate: {
      market,
      signalMode,
      unitMinutes: finiteNumber(candidate.unitMinutes),
      lookbackBars: finiteNumber(candidate.lookbackBars),
      holdBars: finiteNumber(candidate.holdBars),
      minReturnBps: finiteNumber(candidate.minReturnBps),
      minDropBps: finiteNumber(candidate.minDropBps),
      riskFilter: nonEmptyString(candidate.riskFilter),
      riskThreshold:
        candidate.riskThreshold === null ? null : finiteNumber(candidate.riskThreshold),
      notionalKrw: finiteNumber(candidate.notionalKrw),
      expectedMedianEdgeBps:
        candidate.expectedMedianEdgeBps === null
          ? null
          : finiteNumber(candidate.expectedMedianEdgeBps),
    },
    signal: {
      active: signal.active === true,
      latestCandleAt,
      previousCandleAt,
      latestClose: finiteNumber(signal.latestClose),
      previousClose: finiteNumber(signal.previousClose),
      lookbackReturnBps: finiteNumber(signal.lookbackReturnBps),
      riskValue: signal.riskValue === null ? null : finiteNumber(signal.riskValue),
      directionalSignalPass: signal.directionalSignalPass === true,
      riskPass: signal.riskPass === true,
    },
    orderbook: {
      bestAsk: finiteNumber(orderbook.bestAsk),
      bestBid: finiteNumber(orderbook.bestBid),
      bestAskSize,
      bestBidSize,
      spreadBps: orderbook.spreadBps === null ? null : finiteNumber(orderbook.spreadBps),
      buyDepth: {
        notionalKrw: finiteNumber(buyDepth.notionalKrw),
        coversRequestedNotional: buyDepth.coversRequestedNotional === true,
      },
      sellDepth: {
        notionalKrw: finiteNumber(sellDepth.notionalKrw),
        coversRequestedNotional: sellDepth.coversRequestedNotional === true,
      },
    },
    ticker: {
      tradePrice: finiteNumber(ticker.tradePrice),
      accTradePrice24h: finiteNumber(ticker.accTradePrice24h),
    },
    decision: {
      executionViability,
      reasons: Array.isArray(decision.reasons)
        ? decision.reasons.filter((reason): reason is string => typeof reason === "string")
        : [],
    },
  };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString();
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function signalSkippedReasons(observation: ObservationReport): string[] {
  if (observation.signal.active) return [];
  const reasons = [
    ...(observation.signal.directionalSignalPass
      ? []
      : [`${observation.candidate.signalMode}_signal_inactive`]),
    ...(observation.signal.riskPass ? [] : ["risk_filter_failed"]),
  ];
  return reasons.length > 0 ? reasons : ["signal_inactive"];
}

function buildScenario(
  observation: ObservationReport,
  args: Args,
): { scenario: PaperSessionScenario; skippedReasons: string[] } {
  const candidate = observation.candidate;
  const notionalKrw = candidate.notionalKrw;
  const viable = observation.decision.executionViability === "watch_candidate";
  const skippedReasons = [
    ...signalSkippedReasons(observation),
    ...(viable ? [] : ["observation_not_execution_viable"]),
    ...(observation.orderbook.buyDepth.coversRequestedNotional ? [] : ["insufficient_buy_depth"]),
    ...(observation.orderbook.sellDepth.coversRequestedNotional ? [] : ["insufficient_sell_depth"]),
  ];
  const lastTradePrice =
    observation.ticker.tradePrice > 0 ? observation.ticker.tradePrice : observation.signal.latestClose;
  const depthRatio =
    notionalKrw > 0
      ? Math.min(
          observation.orderbook.buyDepth.notionalKrw,
          observation.orderbook.sellDepth.notionalKrw,
        ) / notionalKrw
      : 0;

  const events: PaperSessionScenario["events"] = [
    {
      type: "snapshot",
      snapshot: {
        market: candidate.market,
        asOf: observation.generatedAt,
        lastTradePrice,
        bestBidPrice: observation.orderbook.bestBid,
        bestAskPrice: observation.orderbook.bestAsk,
        bestBidSize: observation.orderbook.bestBidSize,
        bestAskSize: observation.orderbook.bestAskSize,
        spreadBps: observation.orderbook.spreadBps ?? 0,
        depthRatio: round(depthRatio),
        rolling24hNotional: observation.ticker.accTradePrice24h,
      },
    },
  ];

  if (skippedReasons.length === 0) {
    const signal: SignalIntent = {
      schemaVersion: "1.0.0",
      signalId: `${args.strategyId}-${candidate.market}-${observation.signal.latestCandleAt}`,
      strategyId: args.strategyId,
      market: candidate.market,
      side: "buy",
      sizing: {
        basis: "quote_notional",
        value: notionalKrw,
      },
      confidence: args.confidence,
      generatedAt: observation.generatedAt,
      expiresAt: addMinutes(observation.generatedAt, 10),
      maxSlippageBps: args.maxSlippageBps,
      reasonCodes: [
        `SIGNAL_${candidate.signalMode.toUpperCase()}`,
        `UNIT_${candidate.unitMinutes}M`,
        `LOOKBACK_${candidate.lookbackBars}`,
        `HOLD_${candidate.holdBars}`,
        `RISK_${candidate.riskFilter.toUpperCase()}`,
      ],
      metadata: {
        latestCandleAt: observation.signal.latestCandleAt,
        previousCandleAt: observation.signal.previousCandleAt,
        lookbackReturnBps: observation.signal.lookbackReturnBps,
        riskValue: observation.signal.riskValue,
        expectedMedianEdgeBps: candidate.expectedMedianEdgeBps,
      },
    };
    events.push({ type: "signal", signal, receivedAt: observation.generatedAt });
  }

  return {
    skippedReasons,
    scenario: {
      schemaVersion: "1.0.0",
      clockAt: observation.generatedAt,
      reconcileAt: observation.generatedAt,
      initialPortfolio: {
        cashAvailable: args.initialCashKrw,
        dailyRealizedPnl: 0,
        positions: {},
      },
      metadata: {
        generatedAt: observation.generatedAt,
        strategyId: args.strategyId,
        modeIntent: "paper",
        initialCashKrw: args.initialCashKrw,
        initialEquityKrw: args.initialCashKrw,
        entryProfile: `${candidate.market}_${candidate.unitMinutes}m_${candidate.signalMode}`,
        syntheticExitPolicy: "carry_open_until_hold_window",
        carryOpenPositions: true,
        eligibilityNote:
          "Paper observation generated from public time-series candidate evidence. Open positions are explicitly carried because the configured hold window has not elapsed.",
        summary: {
          snapshotCount: 1,
          signalCount: skippedReasons.length === 0 ? 1 : 0,
          entrySignalCount: skippedReasons.length === 0 ? 1 : 0,
          exitSignalCount: 0,
          syntheticCloseCount: 0,
          marketsTraded: skippedReasons.length === 0 ? [candidate.market] : [],
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const raw = await readFile(args.inputObservationPath!, "utf8");
  const observation = normalizeObservation(JSON.parse(raw) as unknown);
  const { scenario, skippedReasons } = buildScenario(observation, args);
  const config = loadExecutionRuntimeConfig({
    cwd: process.cwd(),
    envFilePath: null,
    env: {
      TRADING_MODE: "paper",
      ENABLE_LIVE_EXECUTION: "false",
      DRY_RUN_MARKETS: observation.candidate.market,
      PAPER_SESSION_ARTIFACTS_DIR: args.reportsDir,
      DATA_STALE_AFTER_MS: "600000",
    },
  });
  const runner = createPaperSessionRunner(config, {
    clock: () => new Date(observation.generatedAt),
    portfolio: scenario.initialPortfolio,
  });
  const report = await persistPaperSessionReport({
    report: await runner.runScenario(scenario),
    baseDir: args.reportsDir,
    sessionId: `paper-${args.strategyId}-${observation.signal.latestCandleAt.replace(/[:.]/gu, "")}`,
    scenarioPath: args.inputObservationPath!,
  });
  const signalOutcomes = report.outcomes.filter((outcome) => outcome.type === "signal");
  const acceptedSignals = signalOutcomes.filter((outcome) => outcome.decision.accepted).length;
  const rejectedSignalReasons = signalOutcomes.flatMap((outcome) =>
    outcome.decision.accepted ? [] : outcome.decision.reasons,
  );
  const outputReport = {
    generatedAt: new Date().toISOString(),
    note:
      "Paper observation only. This records whether the public time-series candidate can pass the paper risk/fill/reconciliation path; it is not live approval.",
    sourceObservationPath: args.inputObservationPath,
    strategyId: args.strategyId,
    candidate: observation.candidate,
    skippedReasons,
    paper: {
      attemptedSignal: skippedReasons.length === 0,
      acceptedSignals,
      rejectedSignalReasons,
      reconciliationOk: report.reconciliation.ok,
      openPositionCount: report.reconciliation.openPositions.length,
      sessionDir: report.artifacts?.sessionDir,
      reportPath: report.artifacts?.reportPath,
      ledgerPath: report.artifacts?.ledgerPath,
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
