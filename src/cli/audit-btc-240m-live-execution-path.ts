import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  outputPath: string | null;
  requireReady: boolean;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    outputPath: null,
    requireReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--require-ready") {
      args.requireReady = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return args;
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function includesAll(text: string, values: string[]): boolean {
  return values.every((value) => text.includes(value));
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2), cwd);
  const [packageJson, runtimeConfig, service, ecosystem] = await Promise.all([
    readText(resolve(cwd, "package.json")),
    readText(resolve(cwd, "src/runtime/dry-run-service-config.ts")),
    readText(resolve(cwd, "src/cli/run-dry-run-service.ts")),
    readText(resolve(cwd, "ecosystem.config.cjs")),
  ]);

  const checks = {
    refreshCommandAvailable: packageJson.includes("dry-run:refresh-btc-240m-momentum-readiness"),
    paperObservationCommandAvailable: packageJson.includes("dry-run:run-bithumb-time-series-paper-observation"),
    reduceOnlyExitAuditAvailable: packageJson.includes("dry-run:audit-bithumb-time-series-paper-position"),
    readinessCommandAvailable: packageJson.includes("dry-run:audit-bithumb-time-series-readiness"),
    paperObserverPm2Available: includesAll(packageJson, [
      "pm2:start:dry-run:btc-240m-momentum-observer",
      "pm2:logs:dry-run:btc-240m-momentum-observer",
    ]) && includesAll(ecosystem, [
      "dry-run-btc-240m-momentum-observer",
      "refresh-btc-240m-momentum-readiness.js",
      "--execute-exit-when-due",
    ]),
    min75PaperObserverPm2Available: includesAll(packageJson, [
      "pm2:start:dry-run:btc-240m-momentum-min75-observer",
      "pm2:logs:dry-run:btc-240m-momentum-min75-observer",
    ]) && includesAll(ecosystem, [
      "dry-run-btc-240m-momentum-min75-observer",
      "btc-240m-momentum-min75",
      "--min-return-bps",
      "75",
      "--execute-exit-when-due",
    ]),
    readinessGateRequiresLiveExecutionPath: runtimeConfig.includes("liveExecutionPathReady"),
    liveStartupRejectsStaleReadiness: includesAll(runtimeConfig, [
      "LIVE_READINESS_MAX_AGE_MS",
      "generatedAt",
      "fresh LIVE_READINESS_SUMMARY_PATH evidence",
    ]) && includesAll(ecosystem, [
      "LIVE_READINESS_MAX_AGE_MS",
      "900000",
    ]),
    liveStartupRequiresFeeScheduleConfirmation: includesAll(runtimeConfig, [
      "LIVE_TRADING_FEE_SCHEDULE_CONFIRMED",
      "LIVE_TRADING_FEE_ROUND_TRIP_BPS",
      "covered by BTC time-series benchmark feeRoundTripBps",
    ]) && includesAll(service, [
      'feeCheckMarket = options?.feeCheckMarket ?? "KRW-BTC"',
      "getOrderChance(feeCheckMarket)",
      "account fee round-trip bps",
      "account fee schedule is unavailable",
    ]),
    liveStartupAcceptsTimeSeriesReadiness: includesAll(runtimeConfig, [
      "REQUIRED_TIME_SERIES_LIVE_READINESS_CHECKS",
      "benchmarkSummary",
      "BTC 240m momentum readiness evidence",
    ]),
    managedServiceGenerates240mSignal: includesAll(service, [
      "btc_240m_momentum_public_v1",
      "observe-bithumb-reversal-candidate.js",
      "--unit-minutes",
      "240",
      "buildBtc240mManagedScenario",
      "TIME_SERIES_HOLD_EXIT",
    ]),
    managedServiceSupportsMin75Candidate: includesAll(service, [
      "btc_240m_momentum_min75_candidate_v1",
      "minReturnBps: 75",
      "btc240mProfileConfig",
    ]) && includesAll(runtimeConfig, [
      "btc_240m_momentum_min75_candidate_v1",
      "expectedMinReturnBps",
      "candidate.minReturnBps",
    ]),
    livePm2Uses240mSignalPath: includesAll(ecosystem, [
      "live-btc-manager",
      "btc_240m_momentum_public_v1",
      "btc-240m-momentum-readiness-latest-refresh.json",
      'LIVE_READINESS_APPROVED: process.env.LIVE_READINESS_APPROVED ?? "false"',
      'LIVE_TRADING_FEE_SCHEDULE_CONFIRMED: process.env.LIVE_TRADING_FEE_SCHEDULE_CONFIRMED ?? "false"',
      'LIVE_TRADING_FEE_ROUND_TRIP_BPS: process.env.LIVE_TRADING_FEE_ROUND_TRIP_BPS ?? "50"',
    ]),
    min75LivePm2UsesMin75SignalPath: includesAll(ecosystem, [
      "live-btc-min75-manager",
      "btc_240m_momentum_min75_candidate_v1",
      "btc-240m-momentum-min75-readiness-latest-refresh.json",
      'LIVE_READINESS_APPROVED: process.env.LIVE_READINESS_APPROVED ?? "false"',
      'LIVE_TRADING_FEE_SCHEDULE_CONFIRMED: process.env.LIVE_TRADING_FEE_SCHEDULE_CONFIRMED ?? "false"',
      'LIVE_TRADING_FEE_ROUND_TRIP_BPS: process.env.LIVE_TRADING_FEE_ROUND_TRIP_BPS ?? "50"',
    ]),
    livePm2StartRequiresLatestReadinessGate: includesAll(packageJson, [
      "dry-run:gate-btc-240m-live-ready",
      "pm2:start:live-btc",
      "--require-live-ready",
      "--execute-exit-when-due",
      "pm2 start ecosystem.config.cjs --only live-btc-manager",
    ]),
    livePm2RestartRequiresLatestReadinessGate: includesAll(packageJson, [
      "dry-run:gate-btc-240m-live-ready",
      "pm2:restart:live-btc",
      "--require-live-ready",
      "--execute-exit-when-due",
      "pm2 restart live-btc-manager --update-env",
      "pm2 start ecosystem.config.cjs --only live-btc-manager",
    ]),
    min75LivePm2StartRequiresLatestReadinessGate: includesAll(packageJson, [
      "dry-run:gate-btc-240m-min75-live-ready",
      "pm2:start:live-btc-min75",
      "--require-live-ready",
      "--execute-exit-when-due",
      "pm2 start ecosystem.config.cjs --only live-btc-min75-manager",
    ]),
    min75LivePm2RestartRequiresLatestReadinessGate: includesAll(packageJson, [
      "dry-run:gate-btc-240m-min75-live-ready",
      "pm2:restart:live-btc-min75",
      "--require-live-ready",
      "--execute-exit-when-due",
      "pm2 restart live-btc-min75-manager --update-env",
      "pm2 start ecosystem.config.cjs --only live-btc-min75-manager",
    ]),
  };
  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);
  const ready = missing.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Execution-path readiness audit for promoting the BTC 240m momentum candidate from paper evidence to managed live. This checks whether the codebase has a managed live path that can generate and execute the same 240m signal, not whether the strategy is profitable.",
    checks,
    ready,
    reasons: missing,
    interpretation: ready
      ? "The managed code path advertises all required BTC 240m live execution components."
      : "Live execution path is not ready. Do not set liveExecutionPathReady=true until every missing component is implemented and tested.",
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);

  if (args.requireReady && !ready) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
