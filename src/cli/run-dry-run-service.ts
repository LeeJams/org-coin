import { spawn } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { executePaperSessionScenario } from "../execution/run-paper-session.js";
import { loadDryRunServiceConfig } from "../runtime/dry-run-service-config.js";

interface CommandResult {
  code: number;
  stdoutLines: string[];
  stderrLines: string[];
}

interface DryRunServiceArgs {
  once: boolean;
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

async function appendJsonLine(path: string, payload: Record<string, unknown>) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(payload)}\n`, "utf8");
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
): Promise<CommandResult> {
  const result = await runCommand(label, command, args);
  if (result.code !== 0) {
    throw new Error(`${label} exited with status ${result.code}`);
  }
  return result;
}

async function runDryRunCycle(cycle: number) {
  const config = loadDryRunServiceConfig();
  const startedAt = new Date().toISOString();
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
      String(config.initialCashKrw),
      "--profile",
      config.entryProfile,
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
        TRADING_MODE: "dry_run",
        ENABLE_LIVE_EXECUTION: "false",
      },
    },
  });
  const completedAt = new Date().toISOString();
  const payload = {
    event: "managed_dry_run_cycle_completed",
    cycle,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    runId,
    profile: config.entryProfile,
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
      entryProfile: config.entryProfile,
      loopIntervalSeconds: config.loopIntervalSeconds,
      cycleLogPath: config.cycleLogPath,
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
      const failure = {
        event: "managed_dry_run_cycle_failed",
        cycle,
        startedAt: cycleStartedAt,
        failedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
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
