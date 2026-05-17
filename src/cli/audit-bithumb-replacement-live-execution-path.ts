import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  market: string;
  strategyId: string;
  liveProcessName: string;
  refreshCommandName: string;
  gateCommandName: string;
  outputPath: string | null;
  requireReady: boolean;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    market: "KRW-PIEVERSE",
    strategyId: "pieverse_60m_reversal_lb168_candidate_v1",
    liveProcessName: "live-pieverse-60m-reversal-lb168-manager",
    refreshCommandName: "dry-run:refresh-pieverse-60m-reversal-lb168-readiness",
    gateCommandName: "dry-run:gate-pieverse-60m-reversal-lb168-live-ready",
    outputPath: null,
    requireReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--market") {
      if (!value) throw new Error("--market requires a value");
      args.market = value;
      index += 1;
      continue;
    }
    if (arg === "--strategy-id") {
      if (!value) throw new Error("--strategy-id requires a value");
      args.strategyId = value;
      index += 1;
      continue;
    }
    if (arg === "--live-process-name") {
      if (!value) throw new Error("--live-process-name requires a value");
      args.liveProcessName = value;
      index += 1;
      continue;
    }
    if (arg === "--refresh-command-name") {
      if (!value) throw new Error("--refresh-command-name requires a value");
      args.refreshCommandName = value;
      index += 1;
      continue;
    }
    if (arg === "--gate-command-name") {
      if (!value) throw new Error("--gate-command-name requires a value");
      args.gateCommandName = value;
      index += 1;
      continue;
    }
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

function expectedManagedCycleFunction(strategyId: string): string | null {
  if (strategyId === "pieverse_60m_reversal_lb168_candidate_v1") {
    return "runPieverse60mReversalManagedCycle";
  }
  if (strategyId === "krw_h_60m_momentum_top_candidate_v1") {
    return "runKrwH60mMomentumManagedCycle";
  }
  return null;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2), cwd);
  const [
    packageJson,
    runtimeConfig,
    dryRunServiceConfig,
    dryRunService,
    liveVenue,
    ecosystem,
  ] = await Promise.all([
    readText(resolve(cwd, "package.json")),
    readText(resolve(cwd, "src/runtime/config.ts")),
    readText(resolve(cwd, "src/runtime/dry-run-service-config.ts")),
    readText(resolve(cwd, "src/cli/run-dry-run-service.ts")),
    readText(resolve(cwd, "src/execution/live-venue.ts")),
    readText(resolve(cwd, "ecosystem.config.cjs")),
  ]);
  const managedCycleFunction = expectedManagedCycleFunction(args.strategyId);

  const checks = {
    replacementReadinessCommandAvailable: packageJson.includes(
      "dry-run:audit-bithumb-replacement-time-series-readiness",
    ),
    replacementRefreshCommandAvailable: packageJson.includes(
      `"${args.refreshCommandName}"`,
    ),
    liveRuntimeAllowsRequestedMarket: runtimeConfig.includes(
      `allowedMarkets:\n        tradingModeRaw === "live" ? ["${args.market}"]`,
    ),
    dryRunLiveAllowsRequestedMarket: dryRunServiceConfig.includes(
      `DRY_RUN_EXECUTION_MODE=live requires DRY_RUN_MARKETS=${args.market}`,
    ),
    liveReadinessAcceptsReplacementEvidence:
      dryRunServiceConfig.includes(args.strategyId) &&
      dryRunServiceConfig.includes(args.market) &&
      dryRunServiceConfig.includes("replacement time-series readiness evidence"),
    managedServiceGeneratesRequestedStrategy:
      managedCycleFunction !== null &&
      dryRunService.includes(args.strategyId) &&
      dryRunService.includes(args.market) &&
      dryRunService.includes(managedCycleFunction),
    liveAccountSyncSupportsRequestedBase:
      dryRunService.includes("managedMarket") &&
      dryRunService.includes("baseCurrency") &&
      !dryRunService.includes("live startup blocked: non-BTC asset balance detected"),
    liveFeeCheckUsesRequestedMarket:
      dryRunService.includes("feeCheckMarket") &&
      dryRunService.includes("client.getOrderChance(feeCheckMarket)") &&
      !dryRunService.includes('getOrderChance("KRW-BTC")'),
    sellPreflightUsesRequestedBaseBalance:
      liveVenue.includes("baseCurrency") &&
      !liveVenue.includes("BTC balance is below requested sell quantity"),
    livePm2TargetAvailable:
      ecosystem.includes(args.liveProcessName) &&
      ecosystem.includes(args.strategyId) &&
      ecosystem.includes(args.market) &&
      ecosystem.includes("TRADING_MODE: \"live\"") &&
      ecosystem.includes("ENABLE_LIVE_EXECUTION: \"true\""),
    liveStartScriptRequiresReplacementGate: includesAll(packageJson, [
      args.strategyId,
      args.gateCommandName,
      `pm2 start ecosystem.config.cjs --only ${args.liveProcessName}`,
      "--require-live-ready",
    ]),
    liveRestartScriptRequiresReplacementGate: includesAll(packageJson, [
      args.strategyId,
      args.gateCommandName,
      `pm2 restart ${args.liveProcessName}`,
      "--update-env",
    ]),
  };

  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);
  const ready = missing.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    market: args.market,
    strategyId: args.strategyId,
    liveProcessName: args.liveProcessName,
    refreshCommandName: args.refreshCommandName,
    gateCommandName: args.gateCommandName,
    note:
      "Static execution-path audit for promoting a Bithumb KRW replacement time-series candidate from paper evidence to managed live. This checks operational wiring only; profitability still requires realized positive paper evidence.",
    checks,
    ready,
    reasons: missing,
    interpretation: ready
      ? "The codebase advertises all required managed live execution components for this replacement candidate."
      : "Replacement live execution path is not ready. Keep liveExecutionPathReady=false and do not add a live PM2 target until every missing component is implemented and tested.",
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
