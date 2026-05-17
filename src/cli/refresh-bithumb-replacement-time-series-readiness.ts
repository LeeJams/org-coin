import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface Args {
  scanPath: string;
  market: string;
  signalMode: "momentum" | "reversal";
  unitMinutes: number;
  maxCandles: number;
  lookbackBars: number;
  holdBars: number;
  minReturnBps: number;
  minDropBps: number | null;
  riskFilter: "none" | "rv24_below_median" | "rv24_below_p70" | "range24_below_p70";
  riskThreshold: number | null;
  notionalKrw: number;
  expectedMedianEdgeBps: number;
  inputObservationPath: string | null;
  observationOutputPath: string;
  paperObservationOutputPath: string;
  positionAuditOutputPath: string;
  readinessOutputPath: string;
  paperReportsDir: string;
  strategyId: string;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    scanPath: resolve(cwd, "var/reports/current-executable-27-60m-momentum-fee35-500k-20260513-autocheck.json"),
    market: "KRW-H",
    signalMode: "momentum",
    unitMinutes: 60,
    maxCandles: 200,
    lookbackBars: 168,
    holdBars: 24,
    minReturnBps: 0,
    minDropBps: 50,
    riskFilter: "range24_below_p70",
    riskThreshold: 2065.7276995305174,
    notionalKrw: 500_000,
    expectedMedianEdgeBps: 138.73015874,
    inputObservationPath: null,
    observationOutputPath: resolve(cwd, "var/reports/h-60m-momentum-top-forward-observation-latest.json"),
    paperObservationOutputPath: resolve(cwd, "var/reports/h-60m-momentum-paper-observation-latest.json"),
    positionAuditOutputPath: resolve(cwd, "var/reports/h-60m-momentum-position-audit-latest.json"),
    readinessOutputPath: resolve(cwd, "var/reports/h-60m-momentum-replacement-readiness-latest.json"),
    paperReportsDir: resolve(cwd, "var/paper-sessions-krw-h-60m-momentum-observation"),
    strategyId: "krw_h_60m_momentum_top_candidate_v1",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--scan") {
      if (!value) throw new Error("--scan requires a value");
      args.scanPath = resolve(cwd, value);
      index += 1;
      continue;
    }
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
      if (value === "none") {
        args.riskThreshold = null;
      }
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
    if (arg === "--input-observation") {
      if (!value) throw new Error("--input-observation requires a value");
      args.inputObservationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--observation-output") {
      if (!value) throw new Error("--observation-output requires a value");
      args.observationOutputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--paper-observation-output") {
      if (!value) throw new Error("--paper-observation-output requires a value");
      args.paperObservationOutputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--position-audit-output") {
      if (!value) throw new Error("--position-audit-output requires a value");
      args.positionAuditOutputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--readiness-output") {
      if (!value) throw new Error("--readiness-output requires a value");
      args.readinessOutputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--paper-reports-dir") {
      if (!value) throw new Error("--paper-reports-dir requires a value");
      args.paperReportsDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--strategy-id") {
      if (!value) throw new Error("--strategy-id requires a value");
      args.strategyId = value;
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

function cliPath(fileName: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), fileName);
}

async function runNodeCli(scriptPath: string, args: string[]): Promise<void> {
  await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function writeObservation(args: Args): Promise<void> {
  await mkdir(dirname(args.observationOutputPath), { recursive: true });
  if (args.inputObservationPath) {
    await writeFile(args.observationOutputPath, await readFile(args.inputObservationPath, "utf8"), "utf8");
    return;
  }

  await runNodeCli(cliPath("observe-bithumb-reversal-candidate.js"), [
    "--market",
    args.market,
    "--signal-mode",
    args.signalMode,
    "--unit-minutes",
    String(args.unitMinutes),
    "--max-candles",
    String(args.maxCandles),
    "--lookback-bars",
    String(args.lookbackBars),
    "--hold-bars",
    String(args.holdBars),
    "--min-return-bps",
    String(args.minReturnBps),
    ...(args.minDropBps === null ? [] : ["--min-drop-bps", String(args.minDropBps)]),
    "--risk-filter",
    args.riskFilter,
    ...(args.riskThreshold === null ? [] : ["--risk-threshold", String(args.riskThreshold)]),
    "--notional-krw",
    String(args.notionalKrw),
    "--expected-median-edge-bps",
    String(args.expectedMedianEdgeBps),
    "--output",
    args.observationOutputPath,
  ]);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  await writeObservation(args);
  await runNodeCli(cliPath("run-bithumb-time-series-paper-observation.js"), [
    "--input-observation",
    args.observationOutputPath,
    "--reports-dir",
    args.paperReportsDir,
    "--strategy-id",
    args.strategyId,
    "--output",
    args.paperObservationOutputPath,
  ]);
  await runNodeCli(cliPath("audit-bithumb-time-series-paper-position.js"), [
    "--input-paper-observation",
    args.paperObservationOutputPath,
    "--input-observation",
    args.observationOutputPath,
    "--reports-dir",
    args.paperReportsDir,
    "--execute-exit-when-due",
    "--output",
    args.positionAuditOutputPath,
  ]);
  await runNodeCli(cliPath("audit-bithumb-replacement-time-series-readiness.js"), [
    "--scan",
    args.scanPath,
    "--observation",
    args.observationOutputPath,
    "--paper-observation",
    args.paperObservationOutputPath,
    "--position-audit",
    args.positionAuditOutputPath,
    "--output",
    args.readinessOutputPath,
  ]);

  const readiness = JSON.parse(await readFile(args.readinessOutputPath, "utf8")) as {
    strategyAssessment?: { classification?: string };
    paperReadiness?: { ready?: boolean; reasons?: string[] };
    liveReadiness?: { ready?: boolean; reasons?: string[] };
  };
  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Sequential refresh for replacement time-series readiness. Observation, paper observation, position audit, and readiness audit are generated in one process to avoid stale artifact ordering.",
    artifacts: {
      scanPath: args.scanPath,
      observationPath: args.observationOutputPath,
      paperObservationPath: args.paperObservationOutputPath,
      positionAuditPath: args.positionAuditOutputPath,
      readinessPath: args.readinessOutputPath,
    },
    summary: {
      classification: readiness.strategyAssessment?.classification ?? null,
      paperReady: readiness.paperReadiness?.ready ?? null,
      paperBlockers: readiness.paperReadiness?.reasons ?? [],
      liveReady: readiness.liveReadiness?.ready ?? null,
      liveBlockers: readiness.liveReadiness?.reasons ?? [],
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
