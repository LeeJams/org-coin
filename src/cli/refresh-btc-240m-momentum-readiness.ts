import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface Args {
  benchmarkPath: string;
  stressBenchmarkPath: string | null;
  paperReportPath: string;
  paperObservationPath: string;
  inputObservationPath: string | null;
  outputDir: string;
  artifactPrefix: string;
  paperReportsDir: string;
  minReturnBps: number;
  riskThreshold: number;
  expectedMedianEdgeBps: number;
  executeExitWhenDue: boolean;
  requireLiveReady: boolean;
  liveExecutionPathReady: boolean;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    benchmarkPath: resolve(cwd, "var/reports/btc-240m-momentum-benchmark-fee20-20260512.json"),
    stressBenchmarkPath: null,
    paperReportPath: resolve(
      cwd,
      "var/paper-sessions-btc-240m-momentum-observation/date=2026-05-12/session=paper-btc_240m_momentum_public_v1-2026-05-12T110000000Z/report.json",
    ),
    paperObservationPath: resolve(cwd, "var/reports/btc-240m-momentum-paper-observation-20260512.json"),
    inputObservationPath: null,
    outputDir: resolve(cwd, "var/reports"),
    artifactPrefix: "btc-240m-momentum",
    paperReportsDir: resolve(cwd, "var/paper-sessions-btc-240m-momentum-observation"),
    minReturnBps: 25,
    riskThreshold: 435.9906664851208,
    expectedMedianEdgeBps: 15.690478,
    executeExitWhenDue: false,
    requireLiveReady: false,
    liveExecutionPathReady: false,
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
    if (arg === "--paper-report") {
      if (!value) throw new Error("--paper-report requires a value");
      args.paperReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--paper-observation") {
      if (!value) throw new Error("--paper-observation requires a value");
      args.paperObservationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--input-observation") {
      if (!value) throw new Error("--input-observation requires a value");
      args.inputObservationPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      if (!value) throw new Error("--output-dir requires a value");
      args.outputDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--artifact-prefix") {
      if (!value) throw new Error("--artifact-prefix requires a value");
      args.artifactPrefix = value;
      index += 1;
      continue;
    }
    if (arg === "--paper-reports-dir") {
      if (!value) throw new Error("--paper-reports-dir requires a value");
      args.paperReportsDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--min-return-bps") {
      if (!value) throw new Error("--min-return-bps requires a value");
      args.minReturnBps = positiveNumber(value, "--min-return-bps");
      index += 1;
      continue;
    }
    if (arg === "--risk-threshold") {
      if (!value) throw new Error("--risk-threshold requires a value");
      args.riskThreshold = positiveNumber(value, "--risk-threshold");
      index += 1;
      continue;
    }
    if (arg === "--expected-median-edge-bps") {
      if (!value) throw new Error("--expected-median-edge-bps requires a value");
      args.expectedMedianEdgeBps = positiveNumber(value, "--expected-median-edge-bps");
      index += 1;
      continue;
    }
    if (arg === "--execute-exit-when-due") {
      args.executeExitWhenDue = true;
      continue;
    }
    if (arg === "--require-live-ready") {
      args.requireLiveReady = true;
      continue;
    }
    if (arg === "--live-execution-path-ready") {
      args.liveExecutionPathReady = true;
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

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/gu, "");
}

function cliPath(fileName: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), fileName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function isSameResolvedPath(left: string, right: string): boolean {
  return resolve(process.cwd(), left) === resolve(process.cwd(), right);
}

async function runNodeCli(scriptPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function validatePaperObservationReportPath(args: Args): Promise<void> {
  const paperObservation = JSON.parse(await readFile(args.paperObservationPath, "utf8")) as unknown;
  if (!isRecord(paperObservation) || !isRecord(paperObservation.paper)) {
    throw new Error("paper observation must include a paper object");
  }
  const sourceObservationPath = nonEmptyString(paperObservation.sourceObservationPath);
  if (!sourceObservationPath) {
    throw new Error("paper observation must include sourceObservationPath");
  }
  const reportPath = nonEmptyString(paperObservation.paper.reportPath);
  if (!reportPath) {
    throw new Error("paper observation must include paper.reportPath");
  }
  if (!isSameResolvedPath(reportPath, args.paperReportPath)) {
    throw new Error("paper observation reportPath does not match --paper-report");
  }
  const paperReport = JSON.parse(await readFile(args.paperReportPath, "utf8")) as unknown;
  if (!isRecord(paperReport)) {
    throw new Error("paper report must be an object");
  }
  const scenarioPath = nonEmptyString(paperReport.scenarioPath);
  if (!scenarioPath) {
    throw new Error("paper report must include scenarioPath");
  }
  if (!isSameResolvedPath(sourceObservationPath, scenarioPath)) {
    throw new Error("paper observation sourceObservationPath does not match paper report scenarioPath");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  await mkdir(args.outputDir, { recursive: true });
  await validatePaperObservationReportPath(args);
  const stamp = todayStamp();
  const observationPath = resolve(
    args.outputDir,
    `${args.artifactPrefix}-forward-observation-${stamp}-refresh.json`,
  );
  const positionAuditPath = resolve(
    args.outputDir,
    `${args.artifactPrefix}-paper-position-audit-${stamp}-refresh.json`,
  );
  const readinessPath = resolve(
    args.outputDir,
    `${args.artifactPrefix}-readiness-${stamp}-refresh.json`,
  );
  const latestObservationPath = resolve(
    args.outputDir,
    `${args.artifactPrefix}-forward-observation-latest-refresh.json`,
  );
  const latestPositionAuditPath = resolve(
    args.outputDir,
    `${args.artifactPrefix}-paper-position-audit-latest-refresh.json`,
  );
  const latestReadinessPath = resolve(
    args.outputDir,
    `${args.artifactPrefix}-readiness-latest-refresh.json`,
  );

  if (args.inputObservationPath) {
    await writeFile(observationPath, await readFile(args.inputObservationPath, "utf8"), "utf8");
  } else {
    await runNodeCli(cliPath("observe-bithumb-reversal-candidate.js"), [
      "--market",
      "KRW-BTC",
      "--signal-mode",
      "momentum",
      "--unit-minutes",
      "240",
      "--max-candles",
      "200",
      "--lookback-bars",
      "24",
      "--hold-bars",
      "24",
      "--min-return-bps",
      String(args.minReturnBps),
      "--risk-filter",
      "rv24_below_p70",
      "--risk-threshold",
      String(args.riskThreshold),
      "--notional-krw",
      "500000",
      "--expected-median-edge-bps",
      String(args.expectedMedianEdgeBps),
      "--output",
      observationPath,
    ]);
  }

  await runNodeCli(cliPath("audit-bithumb-time-series-paper-position.js"), [
    "--input-paper-observation",
    args.paperObservationPath,
    "--input-observation",
    observationPath,
    "--output",
    positionAuditPath,
    "--reports-dir",
    args.paperReportsDir,
    ...(args.executeExitWhenDue ? ["--execute-exit-when-due"] : []),
  ]);

  const readinessStdout = await runNodeCli(cliPath("audit-bithumb-time-series-readiness.js"), [
    "--benchmark",
    args.benchmarkPath,
    ...(args.stressBenchmarkPath ? ["--stress-benchmark", args.stressBenchmarkPath] : []),
    "--observation",
    observationPath,
    "--paper-observation",
    args.paperObservationPath,
    "--position-audit",
    positionAuditPath,
    "--output",
    readinessPath,
    ...(args.liveExecutionPathReady ? ["--live-execution-path-ready"] : []),
  ]);
  await writeFile(latestObservationPath, await readFile(observationPath, "utf8"), "utf8");
  await writeFile(latestPositionAuditPath, await readFile(positionAuditPath, "utf8"), "utf8");
  await writeFile(latestReadinessPath, await readFile(readinessPath, "utf8"), "utf8");
  const readiness = JSON.parse(await readFile(readinessPath, "utf8")) as {
    strategyAssessment?: { classification?: string };
    paperReadiness?: { ready?: boolean };
    liveReadiness?: { ready?: boolean; reasons?: string[] };
    stressBenchmarkSummary?: { feeRoundTripBps?: number | null; excessReturnVsBuyHoldPct?: number | null } | null;
    openPosition?: { holdExitDueAt?: string | null };
  };
  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Refresh wrapper for the fixed BTC 240m momentum paper candidate. It refreshes current observation, audits the open paper position, and reruns readiness without changing strategy parameters.",
    artifacts: {
      observationPath,
      positionAuditPath,
      readinessPath,
      latestObservationPath,
      latestPositionAuditPath,
      latestReadinessPath,
    },
    summary: {
      classification: readiness.strategyAssessment?.classification ?? null,
      paperReady: readiness.paperReadiness?.ready ?? null,
      liveReady: readiness.liveReadiness?.ready ?? null,
      liveBlockers: readiness.liveReadiness?.reasons ?? [],
      stressFeeRoundTripBps: readiness.stressBenchmarkSummary?.feeRoundTripBps ?? null,
      stressExcessReturnVsBuyHoldPct:
        readiness.stressBenchmarkSummary?.excessReturnVsBuyHoldPct ?? null,
      holdExitDueAt: readiness.openPosition?.holdExitDueAt ?? null,
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (args.requireLiveReady && readiness.liveReadiness?.ready !== true) {
    process.exitCode = 1;
  }
  void readinessStdout;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
