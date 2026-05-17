import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  benchmarkPath: string | null;
  stressBenchmarkPath: string | null;
  observationPath: string | null;
  paperObservationPath: string | null;
  positionAuditPath: string | null;
  outputPath: string | null;
  requireLiveReady: boolean;
  requirePaperReady: boolean;
  liveExecutionPathReady: boolean;
  maxDrawdownPct: number;
}

interface BenchmarkReport {
  candidate?: {
    market?: string;
    signalMode?: string;
    unitMinutes?: number;
    feeRoundTripBps?: number;
    lookbackBars?: number;
    holdBars?: number;
    minReturnBps?: number;
    riskFilter?: string;
    riskThreshold?: number | null;
  };
  strategy?: {
    tradeCount?: number;
    returnPct?: number;
    annualizedReturnPct?: number | null;
    maxDrawdownPct?: number;
  };
  benchmark?: {
    buyHoldReturnPct?: number;
    excessReturnVsBuyHoldPct?: number;
  };
}

interface ObservationReport {
  signal?: {
    active?: boolean;
  };
  orderbook?: {
    spreadBps?: number | null;
    buyDepth?: { coversRequestedNotional?: boolean };
    sellDepth?: { coversRequestedNotional?: boolean };
  };
  decision?: {
    executionViability?: string;
    reasons?: string[];
  };
}

interface PaperObservationReport {
  paper?: {
    attemptedSignal?: boolean;
    acceptedSignals?: number;
    reconciliationOk?: boolean;
    openPositionCount?: number;
  };
}

interface PositionAuditReport {
  timing?: {
    holdElapsed?: boolean;
    holdExitDueAt?: string;
  };
  mark?: {
    estimatedExitNetPnlKrw?: number;
    estimatedExitReturnPct?: number | null;
  };
  exit?: {
    attempted?: boolean;
    reusePolicy?: string;
    exitObservationGeneratedAt?: string;
    reason?: string;
    reconciliationOk?: boolean;
    openPositionCount?: number;
    realizedExitNetPnlKrw?: number | null;
  };
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    benchmarkPath: null,
    stressBenchmarkPath: null,
    observationPath: null,
    paperObservationPath: null,
    positionAuditPath: null,
    outputPath: null,
    requireLiveReady: false,
    requirePaperReady: false,
    liveExecutionPathReady: false,
    maxDrawdownPct: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--benchmark") {
      if (!value) throw new Error("--benchmark requires a value");
      args.benchmarkPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--stress-benchmark") {
      if (!value) throw new Error("--stress-benchmark requires a value");
      args.stressBenchmarkPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--observation") {
      if (!value) throw new Error("--observation requires a value");
      args.observationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--paper-observation") {
      if (!value) throw new Error("--paper-observation requires a value");
      args.paperObservationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--position-audit") {
      if (!value) throw new Error("--position-audit requires a value");
      args.positionAuditPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--require-live-ready") {
      args.requireLiveReady = true;
      continue;
    }
    if (arg === "--require-paper-ready") {
      args.requirePaperReady = true;
      continue;
    }
    if (arg === "--live-execution-path-ready") {
      args.liveExecutionPathReady = true;
      continue;
    }
    if (arg === "--max-drawdown-pct") {
      if (!value) throw new Error("--max-drawdown-pct requires a value");
      args.maxDrawdownPct = positiveNumber(value, "--max-drawdown-pct");
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  const missing = [
    ["--benchmark", args.benchmarkPath],
    ["--observation", args.observationPath],
    ["--paper-observation", args.paperObservationPath],
    ["--position-audit", args.positionAuditPath],
  ].filter(([, value]) => value === null);
  if (missing.length > 0) {
    throw new Error(`missing required arguments: ${missing.map(([label]) => label).join(", ")}`);
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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function failedChecks(checks: Record<string, boolean>): string[] {
  return Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
}

function classify(
  paperReady: boolean,
  liveReady: boolean,
  benchmarkChecks: Record<string, boolean>,
): string {
  if (liveReady) return "live_candidate";
  if (paperReady) return "paper_candidate";
  if (Object.values(benchmarkChecks).some(Boolean)) return "research_candidate";
  return "discard_candidate";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const [benchmark, observation, paperObservation, positionAudit] = await Promise.all([
    readJson<BenchmarkReport>(args.benchmarkPath!),
    readJson<ObservationReport>(args.observationPath!),
    readJson<PaperObservationReport>(args.paperObservationPath!),
    readJson<PositionAuditReport>(args.positionAuditPath!),
  ]);
  const stressBenchmark = args.stressBenchmarkPath
    ? await readJson<BenchmarkReport>(args.stressBenchmarkPath)
    : null;

  const excessReturn = finite(benchmark.benchmark?.excessReturnVsBuyHoldPct);
  const strategyReturn = finite(benchmark.strategy?.returnPct);
  const maxDrawdown = finite(benchmark.strategy?.maxDrawdownPct);
  const feeRoundTripBps = finite(benchmark.candidate?.feeRoundTripBps);
  const stressExcessReturn = finite(stressBenchmark?.benchmark?.excessReturnVsBuyHoldPct);
  const stressStrategyReturn = finite(stressBenchmark?.strategy?.returnPct);
  const stressMaxDrawdown = finite(stressBenchmark?.strategy?.maxDrawdownPct);
  const stressFeeRoundTripBps = finite(stressBenchmark?.candidate?.feeRoundTripBps);
  const benchmarkChecks = {
    benchmarkAvailable: true,
    marketIsBtc: benchmark.candidate?.market === "KRW-BTC",
    unitIs240m: benchmark.candidate?.unitMinutes === 240,
    costAtLeast20Bps: feeRoundTripBps !== null && feeRoundTripBps >= 20,
    minimumHistoricalTrades: (benchmark.strategy?.tradeCount ?? 0) >= 60,
    positiveStrategyReturn: strategyReturn !== null && strategyReturn > 0,
    beatsBtcBuyAndHold: excessReturn !== null && excessReturn > 0,
    drawdownWithinLimit:
      maxDrawdown !== null && maxDrawdown >= -Math.abs(args.maxDrawdownPct),
  };
  const stressBenchmarkChecks: Record<string, boolean> =
    stressBenchmark === null
      ? {}
      : {
          stressBenchmarkAvailable: true,
          stressBenchmarkSameMarket: stressBenchmark.candidate?.market === benchmark.candidate?.market,
          stressBenchmarkSameUnit: stressBenchmark.candidate?.unitMinutes === benchmark.candidate?.unitMinutes,
          stressCostAtLeastPrimaryCost:
            stressFeeRoundTripBps !== null &&
            feeRoundTripBps !== null &&
            stressFeeRoundTripBps >= feeRoundTripBps,
          stressMinimumHistoricalTrades: (stressBenchmark.strategy?.tradeCount ?? 0) >= 60,
          stressPositiveStrategyReturn: stressStrategyReturn !== null && stressStrategyReturn > 0,
          stressBeatsBtcBuyAndHold: stressExcessReturn !== null && stressExcessReturn > 0,
          stressDrawdownWithinLimit:
            stressMaxDrawdown !== null && stressMaxDrawdown >= -Math.abs(args.maxDrawdownPct),
        };

  const observationChecks = {
    signalActive: bool(observation.signal?.active),
    executionViabilityWatchCandidate:
      observation.decision?.executionViability === "watch_candidate",
    spreadMeasured: finite(observation.orderbook?.spreadBps) !== null,
    buyDepthCoversNotional: bool(observation.orderbook?.buyDepth?.coversRequestedNotional),
    sellDepthCoversNotional: bool(observation.orderbook?.sellDepth?.coversRequestedNotional),
    noObservationReasons: (observation.decision?.reasons ?? []).length === 0,
  };
  const observationReasons = observation.decision?.reasons ?? [];
  const executionEnvironmentChecks = {
    spreadMeasured: observationChecks.spreadMeasured,
    buyDepthCoversNotional: observationChecks.buyDepthCoversNotional,
    sellDepthCoversNotional: observationChecks.sellDepthCoversNotional,
    noExecutionCostReasons: observationReasons.every(
      (reason) =>
        reason === "momentum_signal_inactive" ||
        reason === "reversal_signal_inactive" ||
        reason === "signal_inactive",
    ),
  };

  const paperChecks = {
    paperSignalAttempted: bool(paperObservation.paper?.attemptedSignal),
    paperSignalAccepted: (paperObservation.paper?.acceptedSignals ?? 0) > 0,
    paperEntryReconciliationOk: bool(paperObservation.paper?.reconciliationOk),
    paperEntryCreatedOpenPosition: (paperObservation.paper?.openPositionCount ?? 0) > 0,
  };

  const realizedExitNetPnl = finite(positionAudit.exit?.realizedExitNetPnlKrw);
  const realizedExitPolicyOk =
    positionAudit.exit?.reusePolicy === "first_reduce_only_exit_for_entry_signal" &&
    typeof positionAudit.exit.exitObservationGeneratedAt === "string" &&
    !Number.isNaN(Date.parse(positionAudit.exit.exitObservationGeneratedAt));
  const positionChecks = {
    positionAuditAvailable: true,
    holdExitTimeKnown:
      typeof positionAudit.timing?.holdExitDueAt === "string" &&
      !Number.isNaN(Date.parse(positionAudit.timing.holdExitDueAt)),
    prematureExitBlocked:
      positionAudit.timing?.holdElapsed === false
        ? positionAudit.exit?.attempted === false &&
          positionAudit.exit?.reason === "hold_window_not_elapsed"
        : true,
    realizedExitAvailable:
      positionAudit.exit?.attempted === true &&
      realizedExitPolicyOk &&
      positionAudit.exit?.reconciliationOk === true &&
      positionAudit.exit?.openPositionCount === 0,
    realizedExitReusePolicy: realizedExitPolicyOk,
    positiveRealizedPaperExitPnl:
      positionAudit.exit?.attempted === true &&
      realizedExitPolicyOk &&
      realizedExitNetPnl !== null &&
      realizedExitNetPnl > 0,
  };

  const paperReady =
    Object.values(benchmarkChecks).every(Boolean) &&
    Object.values(observationChecks).every(Boolean) &&
    Object.values(paperChecks).every(Boolean) &&
    positionChecks.holdExitTimeKnown &&
    positionChecks.prematureExitBlocked;
  const liveChecks = {
    ...benchmarkChecks,
    ...stressBenchmarkChecks,
    ...executionEnvironmentChecks,
    ...paperChecks,
    holdExitTimeKnown: positionChecks.holdExitTimeKnown,
    realizedExitAvailable: positionChecks.realizedExitAvailable,
    realizedExitReusePolicy: positionChecks.realizedExitReusePolicy,
    noOpenPaperPositionAfterExit: positionChecks.realizedExitAvailable,
    positiveRealizedPaperExitPnl: positionChecks.positiveRealizedPaperExitPnl,
    liveExecutionPathReady: args.liveExecutionPathReady,
  };
  const liveReady = Object.values(liveChecks).every(Boolean);
  const paperFailed = [
    ...failedChecks(benchmarkChecks),
    ...failedChecks(observationChecks),
    ...failedChecks(paperChecks),
    ...failedChecks({
      holdExitTimeKnown: positionChecks.holdExitTimeKnown,
      prematureExitBlocked: positionChecks.prematureExitBlocked,
    }),
  ];
  const liveFailed = failedChecks(liveChecks);
  const classification = classify(paperReady, liveReady, benchmarkChecks);

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Readiness gate for the public BTC 240m time-series candidate. This combines benchmark, current observation, paper entry, and open-position audit evidence. It deliberately blocks live readiness until a realized reduce-only paper exit is available.",
    inputs: {
      benchmarkPath: args.benchmarkPath,
      stressBenchmarkPath: args.stressBenchmarkPath,
      observationPath: args.observationPath,
      paperObservationPath: args.paperObservationPath,
      positionAuditPath: args.positionAuditPath,
    },
    strategyAssessment: {
      classification,
    },
    candidate: {
      market: benchmark.candidate?.market ?? null,
      signalMode: benchmark.candidate?.signalMode ?? null,
      unitMinutes: benchmark.candidate?.unitMinutes ?? null,
      lookbackBars: benchmark.candidate?.lookbackBars ?? null,
      holdBars: benchmark.candidate?.holdBars ?? null,
      minReturnBps: benchmark.candidate?.minReturnBps ?? null,
      riskFilter: benchmark.candidate?.riskFilter ?? null,
      riskThreshold: benchmark.candidate?.riskThreshold ?? null,
    },
    benchmarkSummary: {
      tradeCount: benchmark.strategy?.tradeCount ?? null,
      strategyReturnPct: benchmark.strategy?.returnPct ?? null,
      buyHoldReturnPct: benchmark.benchmark?.buyHoldReturnPct ?? null,
      excessReturnVsBuyHoldPct: benchmark.benchmark?.excessReturnVsBuyHoldPct ?? null,
      maxDrawdownPct: benchmark.strategy?.maxDrawdownPct ?? null,
      feeRoundTripBps: benchmark.candidate?.feeRoundTripBps ?? null,
    },
    stressBenchmarkSummary:
      stressBenchmark === null
        ? null
        : {
            tradeCount: stressBenchmark.strategy?.tradeCount ?? null,
            strategyReturnPct: stressBenchmark.strategy?.returnPct ?? null,
            buyHoldReturnPct: stressBenchmark.benchmark?.buyHoldReturnPct ?? null,
            excessReturnVsBuyHoldPct: stressBenchmark.benchmark?.excessReturnVsBuyHoldPct ?? null,
            maxDrawdownPct: stressBenchmark.strategy?.maxDrawdownPct ?? null,
            feeRoundTripBps: stressBenchmark.candidate?.feeRoundTripBps ?? null,
          },
    paperReadiness: {
      ready: paperReady,
      checks: {
        ...benchmarkChecks,
        ...observationChecks,
        ...paperChecks,
        holdExitTimeKnown: positionChecks.holdExitTimeKnown,
        prematureExitBlocked: positionChecks.prematureExitBlocked,
      },
      reasons: paperFailed,
    },
    liveReadiness: {
      ready: liveReady,
      paperOnlyRecommended: !liveReady,
      checks: liveChecks,
      reasons: liveFailed,
    },
    openPosition: {
      holdElapsed: positionAudit.timing?.holdElapsed ?? null,
      holdExitDueAt: positionAudit.timing?.holdExitDueAt ?? null,
      estimatedExitNetPnlKrw: positionAudit.mark?.estimatedExitNetPnlKrw ?? null,
      estimatedExitReturnPct: positionAudit.mark?.estimatedExitReturnPct ?? null,
    },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);

  if (args.requireLiveReady && !liveReady) {
    process.exitCode = 1;
  } else if (args.requirePaperReady && !paperReady) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
