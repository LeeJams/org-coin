import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

import { executePaperSessionScenario } from "../execution/run-paper-session.js";
import type { PortfolioState } from "../execution/types.js";
import {
  buildCarryForwardPortfolio,
  deriveCarryForwardOpenPositionState,
  estimatePortfolioEquity,
} from "./run-dry-run-service.js";

const execFileAsync = promisify(execFile);

interface ReplayExistingRunsArgs {
  baseDir: string;
  reportsDir: string;
  pythonBin: string;
  entryProfile: string;
  exitProfile: string;
  syntheticExitPolicy: string;
  initialCashKrw: number;
  limit: number;
  runIdsFile?: string;
  outputPath?: string;
  carryForward: boolean;
}

interface ManifestCandidate {
  runId: string;
  path: string;
  mtimeMs: number;
}

function parsePositiveNumber(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive finite number`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, key: string): number {
  const parsed = parsePositiveNumber(value, key);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${key} must be an integer`);
  }
  return parsed;
}

function parseArgs(argv: string[], cwd: string): ReplayExistingRunsArgs {
  const args: ReplayExistingRunsArgs = {
    baseDir: resolve(cwd, "var/data"),
    reportsDir: resolve(cwd, "var/paper-sessions-btc-trend-backfill"),
    pythonBin: resolve(cwd, ".venv/bin/python"),
    entryProfile: "btc_trend_v1",
    exitProfile: "balanced_v1_book_confirm3",
    syntheticExitPolicy: "carry_open",
    initialCashKrw: 1_000_000,
    limit: 100,
    carryForward: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--carry-forward") {
      args.carryForward = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value`);
    }

    if (arg === "--base-dir") {
      args.baseDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--reports-dir") {
      args.reportsDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--python-bin") {
      args.pythonBin = value;
      index += 1;
      continue;
    }
    if (arg === "--entry-profile") {
      args.entryProfile = value;
      index += 1;
      continue;
    }
    if (arg === "--exit-profile") {
      args.exitProfile = value;
      index += 1;
      continue;
    }
    if (arg === "--synthetic-exit-policy") {
      args.syntheticExitPolicy = value;
      index += 1;
      continue;
    }
    if (arg === "--initial-cash-krw") {
      args.initialCashKrw = parsePositiveNumber(value, "--initial-cash-krw");
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      args.limit = parsePositiveInteger(value, "--limit");
      index += 1;
      continue;
    }
    if (arg === "--run-ids-file") {
      args.runIdsFile = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument: ${arg}`);
  }

  return args;
}

async function collectManifestCandidates(baseDir: string): Promise<ManifestCandidate[]> {
  const manifestDir = resolve(baseDir, "replay/manifests");
  const entries = await readdir(manifestDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^manifest-.+\.json$/u.test(entry.name))
      .map(async (entry) => {
        const path = resolve(manifestDir, entry.name);
        const match = /^manifest-(.+)\.json$/u.exec(entry.name);
        if (!match) {
          return null;
        }
        const fileStat = await stat(path);
        return {
          runId: match[1]!,
          path,
          mtimeMs: fileStat.mtimeMs,
        };
      }),
  );

  return candidates
    .filter((candidate): candidate is ManifestCandidate => candidate !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.runId.localeCompare(right.runId));
}

async function collectRunIdCandidates(
  baseDir: string,
  runIdsFile: string,
): Promise<ManifestCandidate[]> {
  const manifestDir = resolve(baseDir, "replay/manifests");
  const raw = await readFile(runIdsFile, "utf8");
  const runIds = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const seen = new Set<string>();
  const uniqueRunIds = runIds.filter((runId) => {
    if (seen.has(runId)) {
      return false;
    }
    seen.add(runId);
    return true;
  });

  return Promise.all(
    uniqueRunIds.map(async (runId) => {
      if (!/^[A-Za-z0-9_-]+$/u.test(runId)) {
        throw new Error(`invalid run id in ${runIdsFile}: ${runId}`);
      }
      const path = resolve(manifestDir, `manifest-${runId}.json`);
      const fileStat = await stat(path);
      return {
        runId,
        path,
        mtimeMs: fileStat.mtimeMs,
      };
    }),
  );
}

async function buildScenarioForRun(
  candidate: ManifestCandidate,
  args: ReplayExistingRunsArgs,
  initialState?: {
    initialCashKrw: number;
    initialEquityKrw: number;
    statePath: string;
  },
): Promise<string> {
  const scenarioOutputPath = resolve(
    args.reportsDir,
    "scenarios",
    `session-${candidate.runId}-entry-${args.entryProfile}-exit-${args.exitProfile}-synthetic-${args.syntheticExitPolicy}.json`,
  );
  const commandArgs = [
    "-m",
    "org_coin_data",
    "build-session-scenario",
    "--base-dir",
    args.baseDir,
    "--run-id",
    candidate.runId,
    "--initial-cash-krw",
    String(initialState?.initialCashKrw ?? args.initialCashKrw),
    "--entry-profile",
    args.entryProfile,
    "--exit-profile",
    args.exitProfile,
    "--synthetic-exit-policy",
    args.syntheticExitPolicy,
    "--mode-intent",
    "paper",
    "--output-path",
    scenarioOutputPath,
  ];
  if (initialState !== undefined) {
    commandArgs.splice(
      commandArgs.length - 2,
      0,
      "--initial-portfolio-path",
      initialState.statePath,
      "--initial-equity-krw",
      String(initialState.initialEquityKrw),
    );
  }
  const { stdout } = await execFileAsync(args.pythonBin, commandArgs);
  const scenarioPath = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  if (!scenarioPath) {
    throw new Error(`scenario builder produced no path for ${candidate.runId}`);
  }
  return resolve(process.cwd(), scenarioPath);
}

interface CarryForwardReplayState {
  currentEquityKrw: number;
  portfolio: PortfolioState;
  openPositionState: ReturnType<typeof deriveCarryForwardOpenPositionState>;
}

function initialCarryForwardState(initialCashKrw: number): CarryForwardReplayState {
  return {
    currentEquityKrw: initialCashKrw,
    portfolio: {
      cashAvailable: initialCashKrw,
      dailyRealizedPnl: 0,
      positions: {},
    },
    openPositionState: null,
  };
}

async function writeCarryForwardState(
  statePath: string,
  state: CarryForwardReplayState,
): Promise<void> {
  await mkdir(resolve(statePath, ".."), { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify(
      {
        currentEquityKrw: state.currentEquityKrw,
        portfolio: state.portfolio,
        openPositionState: state.openPositionState,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2), cwd);
  const candidates = (
    args.runIdsFile === undefined
      ? await collectManifestCandidates(args.baseDir)
      : await collectRunIdCandidates(args.baseDir, args.runIdsFile)
  ).slice(0, args.limit);
  const completed: Array<{
    runId: string;
    sessionId?: string;
    scenarioPath: string;
    reportPath?: string;
    fillCount: number;
    orderCount: number;
    openPositionCount: number;
    reconciliationOk: boolean;
    initialEquityKrw?: number;
    endingEquityKrw?: number;
    cumulativePnlKrw?: number;
  }> = [];
  const failed: Array<{ runId: string; manifestPath: string; message: string }> = [];
  const statePath = resolve(args.reportsDir, "state", "carry-forward-state.json");
  let carryForwardState = initialCarryForwardState(args.initialCashKrw);
  let aborted = false;

  for (const candidate of candidates) {
    try {
      const initialEquityKrw = carryForwardState.currentEquityKrw;
      if (args.carryForward) {
        await writeCarryForwardState(statePath, carryForwardState);
      }
      const scenarioPath = await buildScenarioForRun(
        candidate,
        args,
        args.carryForward
          ? {
              initialCashKrw: carryForwardState.portfolio.cashAvailable,
              initialEquityKrw,
              statePath,
            }
          : undefined,
      );
      const report = await executePaperSessionScenario({
        scenarioPath,
        cwd,
        runtimeConfig: {
          cwd,
          env: {
            ...process.env,
            TRADING_MODE: "paper",
            ENABLE_LIVE_EXECUTION: "false",
            PAPER_SESSION_ARTIFACTS_DIR: args.reportsDir,
          },
        },
      });
      if (args.carryForward && !report.reconciliation.ok) {
        throw new Error(`carry-forward replay reconciliation failed for ${candidate.runId}`);
      }
      const endingEquityKrw = args.carryForward
        ? estimatePortfolioEquity(report)
        : undefined;
      if (args.carryForward && endingEquityKrw !== undefined) {
        carryForwardState = {
          currentEquityKrw: endingEquityKrw,
          portfolio: buildCarryForwardPortfolio(report.portfolio),
          openPositionState: deriveCarryForwardOpenPositionState(report),
        };
      }
      completed.push({
        runId: candidate.runId,
        sessionId: report.sessionId,
        scenarioPath,
        reportPath: report.artifacts?.reportPath,
        fillCount: report.ledger.fills.length,
        orderCount: report.ledger.orders.length,
        openPositionCount: report.reconciliation.openPositions.length,
        reconciliationOk: report.reconciliation.ok,
        initialEquityKrw: args.carryForward ? initialEquityKrw : undefined,
        endingEquityKrw,
        cumulativePnlKrw:
          args.carryForward && endingEquityKrw !== undefined
            ? endingEquityKrw - args.initialCashKrw
            : undefined,
      });
    } catch (error: unknown) {
      failed.push({
        runId: candidate.runId,
        manifestPath: candidate.path,
        message: error instanceof Error ? error.message : String(error),
      });
      if (args.carryForward) {
        aborted = true;
        break;
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    profile: {
      entryProfile: args.entryProfile,
      exitProfile: args.exitProfile,
      syntheticExitPolicy: args.syntheticExitPolicy,
    },
    source: {
      baseDir: args.baseDir,
      reportsDir: args.reportsDir,
      runIdsFile: args.runIdsFile ?? null,
      manifestCount: candidates.length,
      latestManifest: candidates[0] ? basename(candidates[0].path) : null,
      carryForward: args.carryForward,
      statePath: args.carryForward ? statePath : null,
    },
    aborted,
    completedCount: completed.length,
    failedCount: failed.length,
    fillSessionCount: completed.filter((row) => row.fillCount > 0).length,
    openPositionSessionCount: completed.filter((row) => row.openPositionCount > 0).length,
    finalEquityKrw: args.carryForward ? carryForwardState.currentEquityKrw : null,
    cumulativePnlKrw: args.carryForward
      ? carryForwardState.currentEquityKrw - args.initialCashKrw
      : null,
    completed,
    failed,
  };
  const output = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.outputPath !== undefined) {
    await mkdir(resolve(args.outputPath, ".."), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        ...payload,
        completed: completed.slice(0, 20),
        failed: failed.slice(0, 20),
        outputPath: args.outputPath ?? null,
        truncatedForStdout: completed.length > 20 || failed.length > 20,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: "replay_existing_runs_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
