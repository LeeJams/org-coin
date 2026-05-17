import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

function collectFlagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const value = args[index + 1];
      assert.ok(value, `${flag} requires a value`);
      values.push(value);
      index += 1;
    }
  }
  return values;
}

function collectCommandFlagValues(script: string, command: string, flag: string): string[] {
  const commandStart = script.indexOf(`npm run ${command}`);
  assert.notEqual(commandStart, -1, `script is missing npm run ${command}`);
  const commandEnd = script.indexOf(";", commandStart);
  const commandSegment = script.slice(commandStart, commandEnd === -1 ? undefined : commandEnd);
  const args = commandSegment.trim().split(/\s+/);
  const separatorIndex = args.indexOf("--");
  const commandArgs = separatorIndex === -1 ? args.slice(3) : args.slice(separatorIndex + 1);
  return collectFlagValues(commandArgs, flag);
}

function assertCommandOrder(script: string, first: string, second: string): void {
  const firstIndex = script.indexOf(first);
  const secondIndex = script.indexOf(second);
  assert.notEqual(firstIndex, -1, `script is missing ${first}`);
  assert.notEqual(secondIndex, -1, `script is missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} must run before ${second}`);
}

function assertLivePm2ProcessAlignmentGate(
  script: string | undefined,
  priorGate: string,
  pm2Command: string,
): void {
  assert.ok(script, "live PM2 script is missing");
  const processAlignmentGate = "npm run dry-run:audit-live-goal-process-alignment";
  assertCommandOrder(script, priorGate, processAlignmentGate);
  assertCommandOrder(script, processAlignmentGate, "npm run build");
  assertCommandOrder(script, "npm run build", pm2Command);
}

function assertNoSpreadThresholdOverrides(scriptName: string, script: string | undefined): void {
  assert.ok(script, `${scriptName} script is missing`);
  for (const flag of [
    "--max-spot-spread-bps",
    "--max-perp-spread-bps",
    "--max-usdt-krw-spread-bps",
  ]) {
    assert.ok(!script.includes(flag), `${scriptName} must keep ${flag} out of default live/readiness paths`);
  }
}

function assertOperationalProofFeeBudgetReports(
  scriptName: string,
  script: string | undefined,
  reports: readonly string[],
): void {
  assert.ok(script, `${scriptName} script is missing`);
  assert.ok(
    script.includes("dry-run:audit-spot-perp-carry-operational-proof"),
    `${scriptName} must refresh operational proof`,
  );
  for (const report of reports) {
    assert.ok(
      script.includes(`--fee-budget-report ${report}`),
      `${scriptName} must use ${report} as the operational fee budget`,
    );
  }
}

function joinedArgs(args: string | string[] | undefined): string {
  if (Array.isArray(args)) return args.join(" ");
  return args ?? "";
}

test("live goal PM2 observer uses the same replacement scans as the gated script", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{
      name?: string;
      args?: string | string[];
      script?: string;
      restart_delay?: number;
      max_memory_restart?: string;
      env?: Record<string, string>;
    }>;
  };

  const gateScript = packageJson.scripts["dry-run:gate-live-goal-ready"];
  assert.ok(gateScript, "dry-run:gate-live-goal-ready script is missing");
  for (const [scriptName, script] of Object.entries(packageJson.scripts)) {
    if (scriptName.includes("spot-perp-carry") && !scriptName.includes("spread-threshold-experiment")) {
      assertNoSpreadThresholdOverrides(scriptName, script);
    }
  }
  for (const app of ecosystem.apps) {
    if (app.name?.includes("spot-perp-carry")) {
      assertNoSpreadThresholdOverrides(app.name, joinedArgs(app.args));
    }
  }
  for (const [scriptName, reports] of [
    [
      "dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
      ["var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:review-spot-perp-carry-pieverse-live-ready",
      ["var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:refresh-spot-perp-carry-edu-live-readiness",
      ["var/reports/spot-perp-carry-edu-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:review-spot-perp-carry-edu-live-ready",
      ["var/reports/spot-perp-carry-edu-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:refresh-spot-perp-carry-cys-live-readiness",
      ["var/reports/spot-perp-carry-cys-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:review-spot-perp-carry-cys-live-ready",
      ["var/reports/spot-perp-carry-cys-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:refresh-spot-perp-carry-aztec-live-readiness",
      ["var/reports/spot-perp-carry-aztec-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:review-spot-perp-carry-aztec-live-ready",
      ["var/reports/spot-perp-carry-aztec-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:refresh-spot-perp-carry-nil-live-readiness",
      ["var/reports/spot-perp-carry-nil-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:review-spot-perp-carry-nil-live-ready",
      ["var/reports/spot-perp-carry-nil-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:refresh-spot-perp-carry-akt-live-readiness",
      ["var/reports/spot-perp-carry-akt-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:refresh-spot-perp-carry-elsa-live-readiness",
      ["var/reports/spot-perp-carry-elsa-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:review-spot-perp-carry-akt-live-ready",
      ["var/reports/spot-perp-carry-akt-fee-stress-25bps-latest.json"],
    ],
    [
      "dry-run:refresh-spot-perp-carry-pieverse-edu-live-readiness",
      [
        "var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json",
        "var/reports/spot-perp-carry-edu-fee-stress-25bps-latest.json",
      ],
    ],
    [
      "dry-run:review-spot-perp-carry-pieverse-edu-live-ready",
      [
        "var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json",
        "var/reports/spot-perp-carry-edu-fee-stress-25bps-latest.json",
      ],
    ],
  ] as const) {
    assertOperationalProofFeeBudgetReports(scriptName, packageJson.scripts[scriptName], reports);
  }
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-paired-evidence",
    "npm run dry-run:refresh-spot-perp-carry-cys-live-readiness",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-cys-live-readiness",
    "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-paired-evidence",
    "npm run dry-run:refresh-spot-perp-carry-fee-stress",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
    "npm run dry-run:refresh-spot-perp-carry-fee-stress",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-edu-live-readiness",
    "npm run dry-run:refresh-spot-perp-carry-fee-stress",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-pieverse-edu-live-readiness",
    "npm run dry-run:refresh-spot-perp-carry-fee-stress",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-fee-stress",
    "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:refresh-spot-perp-carry-opportunity-fee-stress",
    "npm run dry-run:discover-spot-perp-carry-top-funding-fee-stress",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:discover-spot-perp-carry-top-funding-fee-stress",
    "npm run dry-run:discover-spot-perp-carry-current-carry",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:discover-spot-perp-carry-current-carry",
    "npm run dry-run:discover-spot-perp-carry-current-carry-fee-stress",
  );
  assertCommandOrder(
    gateScript,
    "npm run dry-run:discover-spot-perp-carry-current-carry-fee-stress",
    "npm run dry-run:audit-live-goal-status",
  );
  assertCommandOrder(gateScript, "--quiet", "--require-live-ready");
  const observer = ecosystem.apps.find(
    (app) => app.name === "dry-run-live-goal-status-observer",
  );
  assert.ok(observer, "dry-run-live-goal-status-observer app is missing");
  assert.equal(observer.script, "npm");
  const observerArgs = observer.args;
  if (typeof observerArgs !== "string") {
    throw new Error("dry-run-live-goal-status-observer args must be a string");
  }
  assert.equal(observerArgs, "run dry-run:refresh-live-goal-status-if-due");
  assert.equal(observer.restart_delay, 600000);
  const refreshLiveGoalScript = packageJson.scripts["dry-run:refresh-live-goal-status"];
  assert.ok(refreshLiveGoalScript, "dry-run:refresh-live-goal-status script is missing");
  assert.ok(refreshLiveGoalScript.includes("npm run --silent dry-run:gate-live-goal-ready"));
  assert.ok(refreshLiveGoalScript.includes("npm run --silent dry-run:audit-live-goal-process-alignment >/dev/null"));
  assert.ok(refreshLiveGoalScript.includes("npm run --silent dry-run:summarize-live-goal-progress"));
  assert.ok(refreshLiveGoalScript.includes(">/dev/null"));
  assert.ok(refreshLiveGoalScript.includes("gate_status=$?"));
  assert.ok(refreshLiveGoalScript.includes("$gate_status -ne 2"));
  assert.ok(refreshLiveGoalScript.includes("alignment_status=$?"));
  assert.ok(refreshLiveGoalScript.includes("summary_status=$?"));
  const checkpointLiveGoalScript = packageJson.scripts["dry-run:checkpoint-live-goal-progress"];
  assert.ok(checkpointLiveGoalScript, "dry-run:checkpoint-live-goal-progress script is missing");
  assert.ok(checkpointLiveGoalScript.includes("dist/src/cli/summarize-live-goal-progress.js"));
  assert.ok(checkpointLiveGoalScript.includes("--checkpoint-only"));
  assert.ok(checkpointLiveGoalScript.includes("--output var/reports/live-goal-progress-summary-latest.json"));
  assert.ok(!checkpointLiveGoalScript.includes("dry-run:gate-live-goal-ready"));
  const checkRefreshDueScript = packageJson.scripts["dry-run:check-live-goal-refresh-due"];
  assert.ok(checkRefreshDueScript, "dry-run:check-live-goal-refresh-due script is missing");
  assert.ok(checkRefreshDueScript.includes("dist/src/cli/check-live-goal-refresh-due.js"));
  assert.ok(checkRefreshDueScript.includes("--summary var/reports/live-goal-progress-summary-latest.json"));
  assert.ok(checkRefreshDueScript.includes("--output var/reports/live-goal-refresh-due-latest.json"));
  assert.ok(checkRefreshDueScript.includes("--max-summary-age-minutes 30"));
  const processAlignmentScript = packageJson.scripts["dry-run:audit-live-goal-process-alignment"];
  assert.ok(processAlignmentScript, "dry-run:audit-live-goal-process-alignment script is missing");
  assert.ok(processAlignmentScript.includes("--pm2-dump ~/.pm2/dump.pm2"));
  const refreshIfDueScript = packageJson.scripts["dry-run:refresh-live-goal-status-if-due"];
  assert.ok(refreshIfDueScript, "dry-run:refresh-live-goal-status-if-due script is missing");
  assert.ok(refreshIfDueScript.includes("npm run --silent build"));
  assert.ok(refreshIfDueScript.includes("node dist/src/cli/audit-live-goal-process-alignment.js"));
  assert.ok(refreshIfDueScript.includes("--pm2-dump ~/.pm2/dump.pm2"));
  assert.ok(refreshIfDueScript.includes("--output var/reports/live-goal-process-alignment-latest.json"));
  assert.ok(refreshIfDueScript.includes("--require-aligned --quiet"));
  assert.ok(refreshIfDueScript.includes("node dist/src/cli/summarize-live-goal-progress.js"));
  assert.ok(refreshIfDueScript.includes("--checkpoint-only >/dev/null"));
  assert.ok(refreshIfDueScript.includes("node dist/src/cli/check-live-goal-refresh-due.js"));
  assert.ok(refreshIfDueScript.includes("--summary var/reports/live-goal-progress-summary-latest.json"));
  assert.ok(refreshIfDueScript.includes("--output var/reports/live-goal-refresh-due-latest.json"));
  assert.ok(refreshIfDueScript.includes("--max-summary-age-minutes 15"));
  assert.ok(refreshIfDueScript.includes("--max-summary-age-minutes 15 --quiet"));
  assert.ok(!refreshIfDueScript.includes("npm run --silent dry-run:check-live-goal-refresh-due"));
  assert.ok(refreshIfDueScript.includes("npm run --silent dry-run:refresh-live-goal-status"));
  assert.ok(refreshIfDueScript.includes("due_status=$?"));
  assert.ok(refreshIfDueScript.includes("refresh_status=$?"));
  assert.ok(refreshIfDueScript.includes("post_due_status=$?"));
  assert.ok(refreshIfDueScript.includes("post-refresh due check still requests full refresh"));
  assert.ok(refreshIfDueScript.includes("$due_status -eq 2"));
  assert.equal(observer.env?.TRADING_MODE, "paper");
  assert.equal(observer.env?.ENABLE_LIVE_EXECUTION, "false");

  const gatedScans = collectFlagValues(gateScript.split(/\s+/), "--replacement-scan");
  const gatedReadiness = collectFlagValues(gateScript.split(/\s+/), "--replacement-readiness");
  const gatedLivePathReadiness = collectFlagValues(
    gateScript.split(/\s+/),
    "--replacement-live-path-readiness",
  );
  const gatedManagedReturnSummaries = collectFlagValues(
    gateScript.split(/\s+/),
    "--replacement-managed-return-summary",
  );
  const gatedCarryReports = collectFlagValues(gateScript.split(/\s+/), "--spot-perp-carry-report");
  const gatedCarryWatchReports = collectFlagValues(
    gateScript.split(/\s+/),
    "--spot-perp-carry-watch-report",
  );
  const gatedCarryLiveReadiness = collectFlagValues(
    gateScript.split(/\s+/),
    "--spot-perp-carry-live-readiness",
  );
  const gatedCarryFeeStressReports = collectFlagValues(
    gateScript.split(/\s+/),
    "--spot-perp-carry-fee-stress-report",
  );
  const gatedSignalCoverageReports = collectFlagValues(
    gateScript.split(/\s+/),
    "--signal-execution-coverage",
  );
  const signalExecutionCoverageScript = packageJson.scripts["dry-run:audit-signal-execution-coverage"];
  const requiredLiveCompatibleScans = [
    "var/reports/btc-public-240m-momentum-fee50-refresh-20260513.json",
    "var/reports/btc-240m-momentum-extended-threshold-fee50-official-rules-20260513.json",
    "var/reports/krw-execution-candidates-49-60m-momentum-scan-fee35-500k-20260513.json",
    "var/reports/krw-h-60m-momentum-single-market-scan-fee35-500k-20260513.json",
    "var/reports/current-executable-27-60m-momentum-fee35-500k-20260513-autocheck.json",
    "var/reports/current-executable-27-60m-reversal-fee35-500k-20260513-autocheck.json",
    "var/reports/current-executable-27-240m-momentum-fee35-500k-20260513-autocheck.json",
    "var/reports/current-executable-27-240m-reversal-fee35-500k-20260513-autocheck.json",
    "var/reports/krw-execution-candidates-49-60m-reversal-scan-fee35-500k-20260513.json",
    "var/reports/krw-execution-candidates-49-240m-momentum-scan-fee35-500k-20260513.json",
    "var/reports/krw-execution-candidates-49-240m-reversal-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-60m-momentum-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-60m-reversal-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-60m-momentum-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-60m-reversal-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-240m-momentum-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-240m-reversal-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-240m-momentum-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-240m-reversal-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-exact5-60m-cross-sectional-momentum-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-exact5-60m-cross-sectional-momentum-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-exact5-240m-cross-sectional-momentum-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-exact5-240m-cross-sectional-momentum-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-mature4-240m-cross-sectional-momentum-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-exact5-240m-momentum-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-exact5-240m-reversal-scan-fee35-500k-20260513.json",
    "var/reports/live-compatible-exact5-240m-momentum-scan-fee50-500k-20260513.json",
    "var/reports/live-compatible-exact5-240m-reversal-scan-fee50-500k-20260513.json",
    "var/reports/guarded4-60m-momentum-scan-fee50-500k-20260514.json",
    "var/reports/guarded4-60m-reversal-scan-fee50-500k-20260514.json",
    "var/reports/guarded4-60m-cross-sectional-momentum-scan-fee50-500k-20260514.json",
    "var/reports/executable3-60m-momentum-scan-fee50-500k-20260514.json",
    "var/reports/executable3-60m-reversal-scan-fee50-500k-20260514.json",
    "var/reports/executable3-60m-cross-sectional-momentum-scan-fee50-500k-20260514.json",
    "var/reports/current-top40-240m-momentum-scan-fee50-500k-20260514.json",
    "var/reports/current-top40-60m-volatility-breakout-scan-fee50-500k-20260514.json",
    "var/reports/order-flow-continuation-sol-coverage-check-h300-fee50-20260514.json",
    "var/reports/order-flow-continuation-btc-eth-xrp-h60-180-300-900-1800-fee50-20260513.json",
    "var/reports/order-flow-reversion-btc-eth-xrp-h300-fee50-20260513.json",
    "var/reports/order-flow-absorption-btc-eth-xrp-h300-fee50-20260513.json",
    "var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee8-20260513.json",
    "var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee35-dominance-20260513.json",
    "var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee50-dominance-20260513.json",
    "var/reports/cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json",
    "var/reports/btc-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json",
    "var/reports/btc-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json",
    "var/reports/btc-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json",
    "var/reports/btc-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json",
    "var/reports/eth-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json",
    "var/reports/eth-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json",
    "var/reports/eth-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json",
    "var/reports/eth-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json",
    "var/reports/live-compatible-exact5-cross-market-lead-lag-fee35-500k-20260513.json",
    "var/reports/live-compatible-exact5-cross-market-lead-lag-fee50-500k-20260513.json",
    "var/reports/krw-top50-public-volatility-breakout-scan-fee35-500k-20260513.json",
    "var/reports/maker-fill-filter-btc-eth-xrp-500k-ttl60-sample60-max1000-20260513.json",
    "var/reports/intraday-session-edge-btc-eth-xrp-fee50-20260513.json",
  ];

  assert.equal(new Set(gatedScans).size, gatedScans.length, "gated replacement scans must be unique");
  assert.deepEqual(gatedReadiness, [
    "var/reports/h-60m-momentum-replacement-readiness-latest.json",
    "var/reports/stable-60m-reversal-replacement-readiness-latest.json",
    "var/reports/pieverse-60m-reversal-lb168-replacement-readiness-latest.json",
    "var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-replacement-readiness-latest.json",
    "var/reports/btc-240m-momentum-lb168-hold72-range-p70-replacement-readiness-latest.json",
  ]);
  assert.deepEqual(gatedLivePathReadiness, [
    "var/reports/h-60m-momentum-live-execution-path-readiness-latest.json",
    "var/reports/stable-60m-reversal-live-execution-path-readiness-latest.json",
    "var/reports/pieverse-60m-reversal-lb168-live-execution-path-readiness-latest.json",
  ]);
  assert.deepEqual(gatedManagedReturnSummaries, [
    "var/reports/pieverse-60m-reversal-lb168-managed-paper-return-summary-latest.json",
    "var/reports/stable-60m-reversal-managed-paper-return-summary-latest.json",
    "var/reports/krw-h-60m-momentum-managed-paper-return-summary-latest.json",
    "var/reports/btc-240m-momentum-lb168-hold72-range-p70-managed-paper-return-summary-latest.json",
  ]);
  assert.deepEqual(gatedCarryReports, [
    "var/reports/spot-perp-carry-72h-latest.json",
  ]);
  assert.deepEqual(gatedCarryWatchReports, [
    "var/reports/spot-perp-carry-top-funding-discovery-latest.json",
    "var/reports/spot-perp-carry-top-funding-discovery-25bps-current.json",
    "var/reports/spot-perp-carry-current-carry-discovery-latest.json",
    "var/reports/spot-perp-carry-current-carry-discovery-25bps-current.json",
    "var/reports/spot-perp-carry-focus-current-entry-25bps-latest.json",
    "var/reports/spot-perp-carry-cys-72h-latest.json",
    "var/reports/spot-perp-carry-edu-72h-latest.json",
    "var/reports/spot-perp-carry-opportunity-72h-latest.json",
    "var/reports/spot-perp-carry-pieverse-edu-72h-latest.json",
    "var/reports/spot-perp-carry-pieverse-72h-latest.json",
    "var/reports/spot-perp-carry-aztec-72h-latest.json",
    "var/reports/spot-perp-carry-nil-72h-latest.json",
    "var/reports/spot-perp-carry-akt-72h-latest.json",
    "var/reports/spot-perp-carry-elsa-72h-latest.json",
  ]);
  assert.deepEqual(gatedCarryLiveReadiness, [
    "var/reports/spot-perp-carry-pieverse-edu-live-readiness-latest.json",
    "var/reports/spot-perp-carry-pieverse-live-readiness-latest.json",
    "var/reports/spot-perp-carry-edu-live-readiness-latest.json",
    "var/reports/spot-perp-carry-cys-live-readiness-latest.json",
    "var/reports/spot-perp-carry-aztec-live-readiness-latest.json",
    "var/reports/spot-perp-carry-nil-live-readiness-latest.json",
    "var/reports/spot-perp-carry-akt-live-readiness-latest.json",
    "var/reports/spot-perp-carry-elsa-live-readiness-latest.json",
  ]);
  assert.deepEqual(gatedCarryFeeStressReports, [
    "var/reports/spot-perp-carry-pieverse-fee-stress-25bps-latest.json",
    "var/reports/spot-perp-carry-edu-fee-stress-25bps-latest.json",
    "var/reports/spot-perp-carry-cys-fee-stress-25bps-latest.json",
    "var/reports/spot-perp-carry-aztec-fee-stress-25bps-latest.json",
    "var/reports/spot-perp-carry-nil-fee-stress-25bps-latest.json",
    "var/reports/spot-perp-carry-akt-fee-stress-25bps-latest.json",
    "var/reports/spot-perp-carry-elsa-fee-stress-25bps-latest.json",
    "var/reports/spot-perp-carry-opportunity-fee-stress-25bps-latest.json",
  ]);
  assert.deepEqual(gatedSignalCoverageReports, [
    "var/reports/signal-execution-coverage-btc-eth-xrp-h-20260514.json",
  ]);
  assert.ok(
    signalExecutionCoverageScript?.includes(
      "--scan var/reports/execution-audit-seeded-btc-eth-xrp-60m-momentum-fee50-20260514.json",
    ),
  );
  assert.ok(
    signalExecutionCoverageScript?.includes(
      "--scan var/reports/execution-audit-seeded-krw-h-60m-momentum-fee50-20260514.json",
    ),
  );
  assert.ok(
    signalExecutionCoverageScript?.includes(
      "--output var/reports/signal-execution-coverage-btc-eth-xrp-h-20260514.json",
    ),
  );
  for (const scan of requiredLiveCompatibleScans) {
    assert.ok(gatedScans.includes(scan), `missing live-compatible scan: ${scan}`);
  }
});

test("spot-perp carry observer accumulates completed funding evidence before live gate use", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{
      name?: string;
      args?: string;
      script?: string;
      env?: Record<string, string>;
      restart_delay?: number;
      max_memory_restart?: string;
    }>;
  };

  const observer = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-72h-observer",
  );
  assert.ok(observer, "dry-run-spot-perp-carry-72h-observer app is missing");
  assert.equal(observer.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(observer.env?.TRADING_MODE, "paper");
  assert.equal(observer.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(observer.restart_delay, 600000);
  assert.ok(observer.args?.includes("--append-existing-output"));
  assert.ok(observer.args?.includes("var/reports/spot-perp-carry-72h-latest.json"));
  assert.ok(observer.args?.includes("--min-completed-funding-events 6"));
  assert.ok(observer.args?.includes("--min-observation-span-minutes 4320"));
  assert.ok(observer.args?.includes("--quiet"));

  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-72h"]?.includes("--append-existing-output"),
  );
  assert.ok(packageJson.scripts["dry-run:observe-spot-perp-carry-72h"]?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-72h"]?.includes(
      "dry-run-spot-perp-carry-72h-observer",
    ),
  );

  const eduObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-edu-72h-observer",
  );
  assert.ok(eduObserver, "dry-run-spot-perp-carry-edu-72h-observer app is missing");
  assert.equal(eduObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(eduObserver.env?.TRADING_MODE, "paper");
  assert.equal(eduObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(eduObserver.restart_delay, 600000);
  assert.ok(eduObserver.args?.includes("--markets KRW-EDU:EDUUSDT"));
  assert.ok(eduObserver.args?.includes("--append-existing-output"));
  assert.ok(eduObserver.args?.includes("var/reports/spot-perp-carry-edu-72h-latest.json"));
  assert.ok(eduObserver.args?.includes("--min-completed-funding-events 6"));
  assert.ok(eduObserver.args?.includes("--min-observation-span-minutes 4320"));
  assert.ok(eduObserver.args?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-edu-72h"]?.includes(
      "--markets KRW-EDU:EDUUSDT",
    ),
  );
  assert.ok(packageJson.scripts["dry-run:observe-spot-perp-carry-edu-72h"]?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-edu-72h"]?.includes(
      "dry-run-spot-perp-carry-edu-72h-observer",
    ),
  );
  const eduLiveReadinessObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-edu-live-readiness-observer",
  );
  assert.ok(
    eduLiveReadinessObserver,
    "dry-run-spot-perp-carry-edu-live-readiness-observer app is missing",
  );
  assert.equal(eduLiveReadinessObserver.script, "npm");
  assert.equal(eduLiveReadinessObserver.args, "run dry-run:refresh-spot-perp-carry-edu-live-readiness");
  assert.equal(eduLiveReadinessObserver.env?.TRADING_MODE, "paper");
  assert.equal(eduLiveReadinessObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(eduLiveReadinessObserver.restart_delay, 300000);
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-edu-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-edu-live-readiness-observer",
    ),
  );

  const cysObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-cys-72h-observer",
  );
  assert.ok(cysObserver, "dry-run-spot-perp-carry-cys-72h-observer app is missing");
  assert.equal(cysObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(cysObserver.env?.TRADING_MODE, "paper");
  assert.equal(cysObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(cysObserver.restart_delay, 600000);
  assert.ok(cysObserver.args?.includes("--markets KRW-CYS:CYSUSDT"));
  assert.ok(cysObserver.args?.includes("--append-existing-output"));
  assert.ok(cysObserver.args?.includes("var/reports/spot-perp-carry-cys-72h-latest.json"));
  assert.ok(cysObserver.args?.includes("--min-completed-funding-events 6"));
  assert.ok(cysObserver.args?.includes("--min-observation-span-minutes 4320"));
  assert.ok(cysObserver.args?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-cys-72h"]?.includes(
      "--markets KRW-CYS:CYSUSDT",
    ),
  );
  assert.ok(packageJson.scripts["dry-run:observe-spot-perp-carry-cys-72h"]?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-cys-72h"]?.includes(
      "dry-run-spot-perp-carry-cys-72h-observer",
    ),
  );
  const cysLiveReadinessObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-cys-live-readiness-observer",
  );
  assert.ok(
    cysLiveReadinessObserver,
    "dry-run-spot-perp-carry-cys-live-readiness-observer app is missing",
  );
  assert.equal(cysLiveReadinessObserver.script, "npm");
  assert.equal(cysLiveReadinessObserver.args, "run dry-run:refresh-spot-perp-carry-cys-live-readiness");
  assert.equal(cysLiveReadinessObserver.env?.TRADING_MODE, "paper");
  assert.equal(cysLiveReadinessObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(cysLiveReadinessObserver.restart_delay, 300000);
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-cys-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-cys-live-readiness-observer",
    ),
  );

  const opportunityObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-opportunity-72h-observer",
  );
  assert.ok(opportunityObserver, "dry-run-spot-perp-carry-opportunity-72h-observer app is missing");
  assert.equal(opportunityObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(opportunityObserver.env?.TRADING_MODE, "paper");
  assert.equal(opportunityObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(opportunityObserver.restart_delay, 600000);
  assert.equal(opportunityObserver.max_memory_restart, "512M");
  assert.ok(opportunityObserver.args?.includes("KRW-PIEVERSE:PIEVERSEUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-DEEP:DEEPUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-PARTI:PARTIUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-KITE:KITEUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-METIS:METISUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-MOVE:MOVEUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-NIL:NILUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-BSV:BSVUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-BABY:BABYUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-EDEN:EDENUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-SXT:SXTUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-LIT:LITUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-MON:MONUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-MOCA:MOCAUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-MERL:MERLUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ILV:ILVUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-AZTEC:AZTECUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-TIA:TIAUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-PRL:PRLUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-FRAX:FRAXUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ZK:ZKUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-D:DUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-H:HUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-HEMI:HEMIUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-SAHARA:SAHARAUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-IN:INUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-XAN:XANUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ICP:ICPUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ORCA:ORCAUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-RECALL:RECALLUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-CYS:CYSUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-PROMPT:PROMPTUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-SONIC:SONICUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-VVV:VVVUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-EDU:EDUUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-AKT:AKTUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ACX:ACXUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ARPA:ARPAUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-POLYX:POLYXUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ETHFI:ETHFIUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-TOSHI:TOSHIUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-STABLE:STABLEUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-SCR:SCRUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-CVC:CVCUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-BTR:BTRUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-EUL:EULUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-XVS:XVSUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-G:GUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-ELSA:ELSAUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-GPS:GPSUSDT"));
  assert.ok(opportunityObserver.args?.includes("KRW-RPL:RPLUSDT"));
  assert.ok(!opportunityObserver.args?.includes("KRW-RLC:RLCUSDT"));
  assert.ok(!opportunityObserver.args?.includes("KRW-COTI:COTIUSDT"));
  assert.ok(!opportunityObserver.args?.includes("KRW-KSM:KSMUSDT"));
  assert.ok(!opportunityObserver.args?.includes("KRW-SKR:SKRUSDT"));
  assert.ok(opportunityObserver.args?.includes("--append-existing-output"));
  assert.ok(opportunityObserver.args?.includes("--filter-input-to-markets"));
  assert.ok(opportunityObserver.args?.includes("var/reports/spot-perp-carry-opportunity-72h-latest.json"));
  assert.ok(opportunityObserver.args?.includes("--min-completed-funding-events 6"));
  assert.ok(opportunityObserver.args?.includes("--min-observation-span-minutes 4320"));
  assert.ok(opportunityObserver.args?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-PIEVERSE:PIEVERSEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-DEEP:DEEPUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-PARTI:PARTIUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-KITE:KITEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-METIS:METISUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-MOVE:MOVEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-BSV:BSVUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-BABY:BABYUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-EDEN:EDENUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-SXT:SXTUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-LIT:LITUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-MON:MONUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-MOCA:MOCAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-MERL:MERLUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ILV:ILVUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-AZTEC:AZTECUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-TIA:TIAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-PRL:PRLUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-FRAX:FRAXUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ZK:ZKUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-D:DUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-H:HUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-HEMI:HEMIUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-SAHARA:SAHARAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-IN:INUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-XAN:XANUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ICP:ICPUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ORCA:ORCAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-RECALL:RECALLUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-CYS:CYSUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-PROMPT:PROMPTUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-AKT:AKTUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ACX:ACXUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ARPA:ARPAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-POLYX:POLYXUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ETHFI:ETHFIUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-TOSHI:TOSHIUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-STABLE:STABLEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-SCR:SCRUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-CVC:CVCUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-BTR:BTRUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-EUL:EULUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-XVS:XVSUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-G:GUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-ELSA:ELSAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-GPS:GPSUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-RPL:RPLUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "--filter-input-to-markets",
    ),
  );
  assert.ok(
    !packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-RLC:RLCUSDT",
    ),
  );
  assert.ok(
    !packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes(
      "KRW-SKR:SKRUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"]?.includes("--quiet"),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-opportunity-72h"]?.includes(
      "dry-run-spot-perp-carry-opportunity-72h-observer",
    ),
  );

  const pieverseEduObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-pieverse-edu-72h-observer",
  );
  assert.ok(
    pieverseEduObserver,
    "dry-run-spot-perp-carry-pieverse-edu-72h-observer app is missing",
  );
  assert.equal(pieverseEduObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(pieverseEduObserver.env?.TRADING_MODE, "paper");
  assert.equal(pieverseEduObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(pieverseEduObserver.restart_delay, 600000);
  assert.ok(pieverseEduObserver.args?.includes("KRW-PIEVERSE:PIEVERSEUSDT,KRW-EDU:EDUUSDT"));
  assert.ok(pieverseEduObserver.args?.includes("--append-existing-output"));
  assert.ok(pieverseEduObserver.args?.includes("var/reports/spot-perp-carry-pieverse-edu-72h-latest.json"));
  assert.ok(pieverseEduObserver.args?.includes("--min-completed-funding-events 6"));
  assert.ok(pieverseEduObserver.args?.includes("--min-observation-span-minutes 4320"));
  assert.ok(pieverseEduObserver.args?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-pieverse-edu-72h"]?.includes(
      "KRW-PIEVERSE:PIEVERSEUSDT,KRW-EDU:EDUUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-pieverse-edu-72h"]?.includes("--quiet"),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-pieverse-edu-72h"]?.includes(
      "dry-run-spot-perp-carry-pieverse-edu-72h-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-top-funding"]?.includes(
      "--auto-top-funding-markets 10",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-top-funding-fee-stress"]?.includes(
      "--auto-top-funding-markets 20",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-top-funding-fee-stress"]?.includes(
      "--bithumb-fee-bps 25",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-current-carry"]?.includes(
      "--auto-top-current-carry-markets 10",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-current-carry-fee-stress"]?.includes(
      "--auto-top-current-carry-markets 20",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-current-carry-fee-stress"]?.includes(
      "--bithumb-fee-bps 25",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-focus-current-entry-fee-stress"]?.includes(
      "--markets KRW-PIEVERSE:PIEVERSEUSDT,KRW-AZTEC:AZTECUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-focus-current-entry-fee-stress"]?.includes(
      "var/reports/spot-perp-carry-focus-current-entry-25bps-latest.json",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "var/reports/spot-perp-carry-opportunity-72h-latest.json",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "var/reports/spot-perp-carry-opportunity-fee-stress-25bps-latest.json",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "--filter-input-to-markets",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-AKT:AKTUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ACX:ACXUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ARPA:ARPAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-BSV:BSVUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-KITE:KITEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-METIS:METISUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-MOVE:MOVEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-BABY:BABYUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-EDEN:EDENUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-SXT:SXTUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-LIT:LITUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-MON:MONUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-MOCA:MOCAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-MERL:MERLUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ILV:ILVUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-AZTEC:AZTECUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-TIA:TIAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-PRL:PRLUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-FRAX:FRAXUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ZK:ZKUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-D:DUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-H:HUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-HEMI:HEMIUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-SAHARA:SAHARAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-IN:INUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-XAN:XANUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ICP:ICPUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ORCA:ORCAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-RECALL:RECALLUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-CYS:CYSUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-PROMPT:PROMPTUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-POLYX:POLYXUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ETHFI:ETHFIUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-TOSHI:TOSHIUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-STABLE:STABLEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-SCR:SCRUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-CVC:CVCUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-BTR:BTRUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-EUL:EULUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-XVS:XVSUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-G:GUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-ELSA:ELSAUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-GPS:GPSUSDT",
    ),
  );
  assert.ok(
    !packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "KRW-SKR:SKRUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-opportunity-fee-stress"]?.includes(
      "--bithumb-fee-bps 25",
    ),
  );
  const topFundingDiscoveryObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-top-funding-discovery-observer",
  );
  assert.ok(
    topFundingDiscoveryObserver,
    "dry-run-spot-perp-carry-top-funding-discovery-observer app is missing",
  );
  assert.equal(topFundingDiscoveryObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(topFundingDiscoveryObserver.env?.TRADING_MODE, "paper");
  assert.equal(topFundingDiscoveryObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(topFundingDiscoveryObserver.restart_delay, 600000);
  assert.ok(topFundingDiscoveryObserver.args?.includes("--auto-top-funding-markets 10"));
  assert.ok(topFundingDiscoveryObserver.args?.includes("--quiet"));
  assert.ok(
    topFundingDiscoveryObserver.args?.includes(
      "var/reports/spot-perp-carry-top-funding-discovery-latest.json",
    ),
  );
  const topFundingFeeStressObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-top-funding-fee-stress-observer",
  );
  assert.ok(
    topFundingFeeStressObserver,
    "dry-run-spot-perp-carry-top-funding-fee-stress-observer app is missing",
  );
  assert.equal(topFundingFeeStressObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(topFundingFeeStressObserver.env?.TRADING_MODE, "paper");
  assert.equal(topFundingFeeStressObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(topFundingFeeStressObserver.restart_delay, 600000);
  assert.ok(topFundingFeeStressObserver.args?.includes("--auto-top-funding-markets 20"));
  assert.ok(topFundingFeeStressObserver.args?.includes("--bithumb-fee-bps 25"));
  assert.ok(topFundingFeeStressObserver.args?.includes("--binance-taker-fee-bps 5"));
  assert.ok(topFundingFeeStressObserver.args?.includes("--exit-cost-buffer-bps 20"));
  assert.ok(topFundingFeeStressObserver.args?.includes("--quiet"));
  assert.ok(
    topFundingFeeStressObserver.args?.includes(
      "var/reports/spot-perp-carry-top-funding-discovery-25bps-current.json",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-top-funding-discovery"]?.includes(
      "dry-run-spot-perp-carry-top-funding-discovery-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-top-funding-fee-stress"]?.includes(
      "dry-run-spot-perp-carry-top-funding-fee-stress-observer",
    ),
  );
  const currentCarryDiscoveryObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-current-carry-discovery-observer",
  );
  assert.ok(
    currentCarryDiscoveryObserver,
    "dry-run-spot-perp-carry-current-carry-discovery-observer app is missing",
  );
  assert.equal(currentCarryDiscoveryObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(currentCarryDiscoveryObserver.env?.TRADING_MODE, "paper");
  assert.equal(currentCarryDiscoveryObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(currentCarryDiscoveryObserver.restart_delay, 600000);
  assert.ok(currentCarryDiscoveryObserver.args?.includes("--auto-top-current-carry-markets 10"));
  assert.ok(currentCarryDiscoveryObserver.args?.includes("--quiet"));
  assert.ok(
    currentCarryDiscoveryObserver.args?.includes(
      "var/reports/spot-perp-carry-current-carry-discovery-latest.json",
    ),
  );
  const currentCarryFeeStressObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-current-carry-fee-stress-observer",
  );
  assert.ok(
    currentCarryFeeStressObserver,
    "dry-run-spot-perp-carry-current-carry-fee-stress-observer app is missing",
  );
  assert.equal(currentCarryFeeStressObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(currentCarryFeeStressObserver.env?.TRADING_MODE, "paper");
  assert.equal(currentCarryFeeStressObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(currentCarryFeeStressObserver.restart_delay, 600000);
  assert.ok(currentCarryFeeStressObserver.args?.includes("--auto-top-current-carry-markets 20"));
  assert.ok(currentCarryFeeStressObserver.args?.includes("--bithumb-fee-bps 25"));
  assert.ok(currentCarryFeeStressObserver.args?.includes("--binance-taker-fee-bps 5"));
  assert.ok(currentCarryFeeStressObserver.args?.includes("--exit-cost-buffer-bps 20"));
  assert.ok(currentCarryFeeStressObserver.args?.includes("--quiet"));
  assert.ok(
    currentCarryFeeStressObserver.args?.includes(
      "var/reports/spot-perp-carry-current-carry-discovery-25bps-current.json",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-current-carry-discovery"]?.includes(
      "dry-run-spot-perp-carry-current-carry-discovery-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-current-carry-fee-stress"]?.includes(
      "dry-run-spot-perp-carry-current-carry-fee-stress-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-pieverse-edu-live-readiness"]?.includes(
      "--quiet",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-top-funding"]?.includes(
      "var/reports/spot-perp-carry-top-funding-discovery-latest.json",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:discover-spot-perp-carry-top-funding-fee-stress"]?.includes(
      "var/reports/spot-perp-carry-top-funding-discovery-25bps-current.json",
    ),
  );
  const spotPerpReview =
    packageJson.scripts["dry-run:review-spot-perp-carry-pieverse-edu-live-ready"];
  assert.ok(spotPerpReview, "dry-run:review-spot-perp-carry-pieverse-edu-live-ready is missing");
  assertCommandOrder(
    spotPerpReview,
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assertCommandOrder(
    spotPerpReview,
    "dry-run:audit-spot-perp-carry-live-readiness",
    "dry-run:gate-live-goal-ready",
  );
  assert.ok(spotPerpReview.includes("var/reports/spot-perp-carry-pieverse-edu-72h-latest.json"));
  assert.ok(spotPerpReview.includes("var/reports/spot-perp-carry-pieverse-edu-operational-proof-latest.json"));

  const pieverseObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-pieverse-72h-observer",
  );
  assert.ok(pieverseObserver, "dry-run-spot-perp-carry-pieverse-72h-observer app is missing");
  assert.equal(pieverseObserver.script, "dist/src/cli/analyze-spot-perp-carry.js");
  assert.equal(pieverseObserver.env?.TRADING_MODE, "paper");
  assert.equal(pieverseObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(pieverseObserver.restart_delay, 600000);
  assert.ok(pieverseObserver.args?.includes("--markets KRW-PIEVERSE:PIEVERSEUSDT"));
  assert.ok(pieverseObserver.args?.includes("var/reports/spot-perp-carry-pieverse-72h-latest.json"));
  assert.ok(pieverseObserver.args?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["dry-run:observe-spot-perp-carry-pieverse-72h"]?.includes(
      "KRW-PIEVERSE:PIEVERSEUSDT",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:derive-spot-perp-carry-pieverse-72h"]?.includes(
      "--append-existing-output",
    ),
    "PIEVERSE derive script must preserve and dedupe existing single-market observations",
  );
  assert.ok(
    packageJson.scripts["dry-run:derive-spot-perp-carry-pieverse-72h"]?.includes(
      "--input-observations var/reports/spot-perp-carry-pieverse-edu-72h-latest.json",
    ),
  );
  assert.ok(
    packageJson.scripts["dry-run:derive-spot-perp-carry-pieverse-72h"]?.includes(
      "--filter-input-to-markets",
    ),
  );
  assert.ok(packageJson.scripts["dry-run:observe-spot-perp-carry-pieverse-72h"]?.includes("--quiet"));
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-pieverse-72h"]?.includes(
      "dry-run-spot-perp-carry-pieverse-72h-observer",
    ),
  );

  const pieverseLiveReadinessObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-pieverse-live-readiness-observer",
  );
  assert.ok(
    pieverseLiveReadinessObserver,
    "dry-run-spot-perp-carry-pieverse-live-readiness-observer app is missing",
  );
  assert.equal(pieverseLiveReadinessObserver.script, "npm");
  assert.equal(
    pieverseLiveReadinessObserver.args,
    "run dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
  );
  assert.equal(pieverseLiveReadinessObserver.env?.TRADING_MODE, "paper");
  assert.equal(pieverseLiveReadinessObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(pieverseLiveReadinessObserver.restart_delay, 300000);
  assert.ok(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-pieverse-live-readiness"]?.includes(
      "var/reports/spot-perp-carry-pieverse-72h-latest.json",
    ),
  );
  assertCommandOrder(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-pieverse-live-readiness"] ?? "",
    "dry-run:derive-spot-perp-carry-pieverse-72h",
    "dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    packageJson.scripts["dry-run:refresh-spot-perp-carry-pieverse-live-readiness"] ?? "",
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-pieverse-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-pieverse-live-readiness-observer",
    ),
  );

  const deriveEduScript = packageJson.scripts["dry-run:derive-spot-perp-carry-edu-72h"];
  assert.ok(deriveEduScript, "dry-run:derive-spot-perp-carry-edu-72h is missing");
  assert.ok(
    deriveEduScript.includes(
      "--input-observations var/reports/spot-perp-carry-pieverse-edu-72h-latest.json",
    ),
  );
  assert.ok(deriveEduScript.includes("--markets KRW-EDU:EDUUSDT"));
  assert.ok(deriveEduScript.includes("--filter-input-to-markets"));
  assert.ok(deriveEduScript.includes("--append-existing-output"));
  assert.ok(deriveEduScript.includes("--output var/reports/spot-perp-carry-edu-72h-latest.json"));
  assert.ok(deriveEduScript.includes("--quiet"));

  const pairedEvidenceRefresh =
    packageJson.scripts["dry-run:refresh-spot-perp-carry-paired-evidence"];
  assert.ok(
    pairedEvidenceRefresh,
    "dry-run:refresh-spot-perp-carry-paired-evidence is missing",
  );
  assertCommandOrder(
    pairedEvidenceRefresh,
    "dry-run:observe-spot-perp-carry-pieverse-edu-72h",
    "dry-run:derive-spot-perp-carry-pieverse-72h",
  );
  assertCommandOrder(
    pairedEvidenceRefresh,
    "dry-run:derive-spot-perp-carry-pieverse-72h",
    "dry-run:derive-spot-perp-carry-edu-72h",
  );
  assert.ok(pairedEvidenceRefresh.includes("observe_status=$?"));
  assert.ok(pairedEvidenceRefresh.includes("pieverse_status=$?"));
  assert.ok(pairedEvidenceRefresh.includes("edu_status=$?"));
  assert.ok(pairedEvidenceRefresh.includes("$observe_status -ne 0"));
  assert.ok(pairedEvidenceRefresh.includes("$pieverse_status -ne 0"));
  assert.ok(pairedEvidenceRefresh.includes("$edu_status -ne 0"));

  const eduLiveReadinessRefresh =
    packageJson.scripts["dry-run:refresh-spot-perp-carry-edu-live-readiness"];
  assert.ok(
    eduLiveReadinessRefresh,
    "dry-run:refresh-spot-perp-carry-edu-live-readiness is missing",
  );
  assertCommandOrder(
    eduLiveReadinessRefresh,
    "dry-run:derive-spot-perp-carry-edu-72h",
    "dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    eduLiveReadinessRefresh,
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assert.ok(eduLiveReadinessRefresh.includes("derive_status=$?"));
  assert.ok(eduLiveReadinessRefresh.includes("operational_status=$?"));
  assert.ok(eduLiveReadinessRefresh.includes("readiness_status=$?"));
  assert.ok(eduLiveReadinessRefresh.includes("$derive_status -ne 0"));
  assert.ok(eduLiveReadinessRefresh.includes("$operational_status -ne 0"));
  assert.ok(eduLiveReadinessRefresh.includes("$readiness_status -ne 0"));

  const cysLiveReadinessRefresh =
    packageJson.scripts["dry-run:refresh-spot-perp-carry-cys-live-readiness"];
  assert.ok(
    cysLiveReadinessRefresh,
    "dry-run:refresh-spot-perp-carry-cys-live-readiness is missing",
  );
  assertCommandOrder(
    cysLiveReadinessRefresh,
    "dry-run:observe-spot-perp-carry-cys-72h",
    "dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    cysLiveReadinessRefresh,
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assert.ok(cysLiveReadinessRefresh.includes("observe_status=$?"));
  assert.ok(cysLiveReadinessRefresh.includes("operational_status=$?"));
  assert.ok(cysLiveReadinessRefresh.includes("readiness_status=$?"));
  assert.ok(cysLiveReadinessRefresh.includes("$observe_status -ne 0"));
  assert.ok(cysLiveReadinessRefresh.includes("$operational_status -ne 0"));
  assert.ok(cysLiveReadinessRefresh.includes("$readiness_status -ne 0"));

  const aztecDeriveScript = packageJson.scripts["dry-run:derive-spot-perp-carry-aztec-72h"];
  assert.ok(aztecDeriveScript, "dry-run:derive-spot-perp-carry-aztec-72h is missing");
  assert.ok(
    aztecDeriveScript.includes(
      "--input-observations var/reports/spot-perp-carry-opportunity-72h-latest.json",
    ),
  );
  assert.ok(aztecDeriveScript.includes("--markets KRW-AZTEC:AZTECUSDT"));
  assert.ok(aztecDeriveScript.includes("--filter-input-to-markets"));
  assert.ok(aztecDeriveScript.includes("--append-existing-output"));
  assert.ok(aztecDeriveScript.includes("--output var/reports/spot-perp-carry-aztec-72h-latest.json"));

  const aztecLiveReadinessRefresh =
    packageJson.scripts["dry-run:refresh-spot-perp-carry-aztec-live-readiness"];
  assert.ok(
    aztecLiveReadinessRefresh,
    "dry-run:refresh-spot-perp-carry-aztec-live-readiness is missing",
  );
  assertCommandOrder(
    aztecLiveReadinessRefresh,
    "dry-run:derive-spot-perp-carry-aztec-72h",
    "dry-run:refresh-spot-perp-carry-aztec-fee-stress",
  );
  assertCommandOrder(
    aztecLiveReadinessRefresh,
    "dry-run:refresh-spot-perp-carry-aztec-fee-stress",
    "dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    aztecLiveReadinessRefresh,
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assert.ok(aztecLiveReadinessRefresh.includes("derive_status=$?"));
  assert.ok(aztecLiveReadinessRefresh.includes("stress_status=$?"));
  assert.ok(aztecLiveReadinessRefresh.includes("operational_status=$?"));
  assert.ok(aztecLiveReadinessRefresh.includes("readiness_status=$?"));

  const aztecLiveReadinessObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-aztec-live-readiness-observer",
  );
  assert.ok(
    aztecLiveReadinessObserver,
    "dry-run-spot-perp-carry-aztec-live-readiness-observer app is missing",
  );
  assert.equal(aztecLiveReadinessObserver.script, "npm");
  assert.equal(
    aztecLiveReadinessObserver.args,
    "run dry-run:refresh-spot-perp-carry-aztec-live-readiness",
  );
  assert.equal(aztecLiveReadinessObserver.env?.TRADING_MODE, "paper");
  assert.equal(aztecLiveReadinessObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(aztecLiveReadinessObserver.restart_delay, 300000);
  assert.ok(
    packageJson.scripts["pm2:start:dry-run:spot-perp-carry-aztec-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-aztec-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-aztec-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-aztec-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:logs:dry-run:spot-perp-carry-aztec-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-aztec-live-readiness-observer",
    ),
  );

  const liveGoalGate = packageJson.scripts["dry-run:gate-live-goal-ready"];
  assert.ok(liveGoalGate.includes("dry-run:refresh-spot-perp-carry-aztec-live-readiness"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-watch-report var/reports/spot-perp-carry-aztec-72h-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-live-readiness var/reports/spot-perp-carry-aztec-live-readiness-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-fee-stress-report var/reports/spot-perp-carry-aztec-fee-stress-25bps-latest.json"));

  const nilDeriveScript = packageJson.scripts["dry-run:derive-spot-perp-carry-nil-72h"];
  assert.ok(nilDeriveScript, "dry-run:derive-spot-perp-carry-nil-72h is missing");
  assert.ok(
    nilDeriveScript.includes(
      "--input-observations var/reports/spot-perp-carry-opportunity-72h-latest.json",
    ),
  );
  assert.ok(nilDeriveScript.includes("--markets KRW-NIL:NILUSDT"));
  assert.ok(nilDeriveScript.includes("--filter-input-to-markets"));
  assert.ok(nilDeriveScript.includes("--append-existing-output"));
  assert.ok(nilDeriveScript.includes("--output var/reports/spot-perp-carry-nil-72h-latest.json"));

  const nilLiveReadinessRefresh =
    packageJson.scripts["dry-run:refresh-spot-perp-carry-nil-live-readiness"];
  assert.ok(nilLiveReadinessRefresh, "dry-run:refresh-spot-perp-carry-nil-live-readiness is missing");
  assertCommandOrder(
    nilLiveReadinessRefresh,
    "dry-run:derive-spot-perp-carry-nil-72h",
    "dry-run:refresh-spot-perp-carry-nil-fee-stress",
  );
  assertCommandOrder(
    nilLiveReadinessRefresh,
    "dry-run:refresh-spot-perp-carry-nil-fee-stress",
    "dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    nilLiveReadinessRefresh,
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assert.ok(nilLiveReadinessRefresh.includes("derive_status=$?"));
  assert.ok(nilLiveReadinessRefresh.includes("stress_status=$?"));
  assert.ok(nilLiveReadinessRefresh.includes("operational_status=$?"));
  assert.ok(nilLiveReadinessRefresh.includes("readiness_status=$?"));

  const nilLiveReadinessObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-nil-live-readiness-observer",
  );
  assert.ok(
    nilLiveReadinessObserver,
    "dry-run-spot-perp-carry-nil-live-readiness-observer app is missing",
  );
  assert.equal(nilLiveReadinessObserver.script, "npm");
  assert.equal(
    nilLiveReadinessObserver.args,
    "run dry-run:refresh-spot-perp-carry-nil-live-readiness",
  );
  assert.equal(nilLiveReadinessObserver.env?.TRADING_MODE, "paper");
  assert.equal(nilLiveReadinessObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(nilLiveReadinessObserver.restart_delay, 300000);
  assert.ok(
    packageJson.scripts["pm2:start:dry-run:spot-perp-carry-nil-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-nil-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-nil-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-nil-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:logs:dry-run:spot-perp-carry-nil-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-nil-live-readiness-observer",
    ),
  );
  assert.ok(liveGoalGate.includes("dry-run:refresh-spot-perp-carry-nil-live-readiness"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-watch-report var/reports/spot-perp-carry-nil-72h-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-live-readiness var/reports/spot-perp-carry-nil-live-readiness-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-fee-stress-report var/reports/spot-perp-carry-nil-fee-stress-25bps-latest.json"));

  const aktDeriveScript = packageJson.scripts["dry-run:derive-spot-perp-carry-akt-72h"];
  assert.ok(aktDeriveScript, "dry-run:derive-spot-perp-carry-akt-72h is missing");
  assert.ok(
    aktDeriveScript.includes(
      "--input-observations var/reports/spot-perp-carry-opportunity-72h-latest.json",
    ),
  );
  assert.ok(aktDeriveScript.includes("--markets KRW-AKT:AKTUSDT"));
  assert.ok(aktDeriveScript.includes("--filter-input-to-markets"));
  assert.ok(aktDeriveScript.includes("--append-existing-output"));
  assert.ok(aktDeriveScript.includes("--output var/reports/spot-perp-carry-akt-72h-latest.json"));

  const aktFeeStressScript = packageJson.scripts["dry-run:refresh-spot-perp-carry-akt-fee-stress"];
  assert.ok(aktFeeStressScript, "dry-run:refresh-spot-perp-carry-akt-fee-stress is missing");
  assert.ok(aktFeeStressScript.includes("--markets KRW-AKT:AKTUSDT"));
  assert.ok(aktFeeStressScript.includes("--output var/reports/spot-perp-carry-akt-fee-stress-25bps-latest.json"));
  assert.ok(!aktFeeStressScript.includes("--max-spot-spread-bps"));
  assert.ok(!aktFeeStressScript.includes("--max-perp-spread-bps"));
  assert.ok(!aktFeeStressScript.includes("--max-usdt-krw-spread-bps"));
  assert.ok(!aktDeriveScript.includes("--max-spot-spread-bps"));
  assert.ok(!aktDeriveScript.includes("--max-perp-spread-bps"));
  assert.ok(!aktDeriveScript.includes("--max-usdt-krw-spread-bps"));

  const aktLiveReadinessRefresh =
    packageJson.scripts["dry-run:refresh-spot-perp-carry-akt-live-readiness"];
  assert.ok(aktLiveReadinessRefresh, "dry-run:refresh-spot-perp-carry-akt-live-readiness is missing");
  assertCommandOrder(
    aktLiveReadinessRefresh,
    "dry-run:derive-spot-perp-carry-akt-72h",
    "dry-run:refresh-spot-perp-carry-akt-fee-stress",
  );
  assertCommandOrder(
    aktLiveReadinessRefresh,
    "dry-run:refresh-spot-perp-carry-akt-fee-stress",
    "dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    aktLiveReadinessRefresh,
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assert.ok(aktLiveReadinessRefresh.includes("derive_status=$?"));
  assert.ok(aktLiveReadinessRefresh.includes("stress_status=$?"));
  assert.ok(aktLiveReadinessRefresh.includes("operational_status=$?"));
  assert.ok(aktLiveReadinessRefresh.includes("readiness_status=$?"));

  const aktLiveReadinessObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-akt-live-readiness-observer",
  );
  assert.ok(
    aktLiveReadinessObserver,
    "dry-run-spot-perp-carry-akt-live-readiness-observer app is missing",
  );
  assert.equal(aktLiveReadinessObserver.script, "npm");
  assert.equal(
    aktLiveReadinessObserver.args,
    "run dry-run:refresh-spot-perp-carry-akt-live-readiness",
  );
  assert.equal(aktLiveReadinessObserver.env?.TRADING_MODE, "paper");
  assert.equal(aktLiveReadinessObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(aktLiveReadinessObserver.restart_delay, 300000);
  assert.ok(
    packageJson.scripts["pm2:start:dry-run:spot-perp-carry-akt-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-akt-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-akt-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-akt-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:logs:dry-run:spot-perp-carry-akt-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-akt-live-readiness-observer",
    ),
  );
  assert.ok(liveGoalGate.includes("dry-run:refresh-spot-perp-carry-akt-live-readiness"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-watch-report var/reports/spot-perp-carry-akt-72h-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-live-readiness var/reports/spot-perp-carry-akt-live-readiness-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-fee-stress-report var/reports/spot-perp-carry-akt-fee-stress-25bps-latest.json"));

  const elsaDeriveScript = packageJson.scripts["dry-run:derive-spot-perp-carry-elsa-72h"];
  assert.ok(elsaDeriveScript, "dry-run:derive-spot-perp-carry-elsa-72h is missing");
  assert.ok(
    elsaDeriveScript.includes(
      "--input-observations var/reports/spot-perp-carry-opportunity-72h-latest.json",
    ),
  );
  assert.ok(elsaDeriveScript.includes("--markets KRW-ELSA:ELSAUSDT"));
  assert.ok(elsaDeriveScript.includes("--filter-input-to-markets"));
  assert.ok(elsaDeriveScript.includes("--append-existing-output"));
  assert.ok(elsaDeriveScript.includes("--output var/reports/spot-perp-carry-elsa-72h-latest.json"));

  const elsaFeeStressScript = packageJson.scripts["dry-run:refresh-spot-perp-carry-elsa-fee-stress"];
  assert.ok(elsaFeeStressScript, "dry-run:refresh-spot-perp-carry-elsa-fee-stress is missing");
  assert.ok(elsaFeeStressScript.includes("--markets KRW-ELSA:ELSAUSDT"));
  assert.ok(elsaFeeStressScript.includes("--output var/reports/spot-perp-carry-elsa-fee-stress-25bps-latest.json"));
  assert.ok(!elsaFeeStressScript.includes("--max-spot-spread-bps"));
  assert.ok(!elsaFeeStressScript.includes("--max-perp-spread-bps"));
  assert.ok(!elsaFeeStressScript.includes("--max-usdt-krw-spread-bps"));
  assert.ok(!elsaDeriveScript.includes("--max-spot-spread-bps"));
  assert.ok(!elsaDeriveScript.includes("--max-perp-spread-bps"));
  assert.ok(!elsaDeriveScript.includes("--max-usdt-krw-spread-bps"));

  const elsaLiveReadinessRefresh =
    packageJson.scripts["dry-run:refresh-spot-perp-carry-elsa-live-readiness"];
  assert.ok(elsaLiveReadinessRefresh, "dry-run:refresh-spot-perp-carry-elsa-live-readiness is missing");
  assertCommandOrder(
    elsaLiveReadinessRefresh,
    "dry-run:derive-spot-perp-carry-elsa-72h",
    "dry-run:refresh-spot-perp-carry-elsa-fee-stress",
  );
  assertCommandOrder(
    elsaLiveReadinessRefresh,
    "dry-run:refresh-spot-perp-carry-elsa-fee-stress",
    "dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    elsaLiveReadinessRefresh,
    "dry-run:audit-spot-perp-carry-operational-proof",
    "dry-run:audit-spot-perp-carry-live-readiness",
  );
  assert.ok(elsaLiveReadinessRefresh.includes("derive_status=$?"));
  assert.ok(elsaLiveReadinessRefresh.includes("stress_status=$?"));
  assert.ok(elsaLiveReadinessRefresh.includes("operational_status=$?"));
  assert.ok(elsaLiveReadinessRefresh.includes("readiness_status=$?"));

  const elsaLiveReadinessObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-spot-perp-carry-elsa-live-readiness-observer",
  );
  assert.ok(
    elsaLiveReadinessObserver,
    "dry-run-spot-perp-carry-elsa-live-readiness-observer app is missing",
  );
  assert.equal(elsaLiveReadinessObserver.script, "npm");
  assert.equal(
    elsaLiveReadinessObserver.args,
    "run dry-run:refresh-spot-perp-carry-elsa-live-readiness",
  );
  assert.equal(elsaLiveReadinessObserver.env?.TRADING_MODE, "paper");
  assert.equal(elsaLiveReadinessObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(elsaLiveReadinessObserver.restart_delay, 300000);
  assert.ok(
    packageJson.scripts["pm2:start:dry-run:spot-perp-carry-elsa-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-elsa-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:restart:dry-run:spot-perp-carry-elsa-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-elsa-live-readiness-observer",
    ),
  );
  assert.ok(
    packageJson.scripts["pm2:logs:dry-run:spot-perp-carry-elsa-live-readiness"]?.includes(
      "dry-run-spot-perp-carry-elsa-live-readiness-observer",
    ),
  );
  assert.ok(liveGoalGate.includes("dry-run:refresh-spot-perp-carry-elsa-live-readiness"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-watch-report var/reports/spot-perp-carry-elsa-72h-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-live-readiness var/reports/spot-perp-carry-elsa-live-readiness-latest.json"));
  assert.ok(liveGoalGate.includes("--spot-perp-carry-fee-stress-report var/reports/spot-perp-carry-elsa-fee-stress-25bps-latest.json"));

  const liveGoalStatusPath = "var/reports/live-goal-status-20260513-current.json";
  const spotPerpLiveApps = ecosystem.apps.filter((app) =>
    app.name?.startsWith("live-spot-perp-carry"),
  );
  assert.ok(spotPerpLiveApps.length > 0, "spot-perp carry live apps are missing");
  for (const app of spotPerpLiveApps) {
    const args: string[] = Array.isArray(app.args) ? app.args : [];
    assert.equal(app.script, "dist/src/cli/run-spot-perp-carry-live.js", `${app.name} must use the gated runner`);
    assert.equal(app.env?.TRADING_MODE, "live", `${app.name} must be a live app`);
    assert.equal(app.env?.ENABLE_LIVE_EXECUTION, "false", `${app.name} must default global live execution off`);
    assert.equal(
      app.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION,
      "false",
      `${app.name} must default spot-perp live execution off`,
    );
    assert.equal(
      app.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION,
      "false",
      `${app.name} must default spot-perp order submission off`,
    );
    assert.ok(args.includes("--require-live-ready"), `${app.name} must require live readiness`);
    assert.ok(!args.includes("--submit-once"), `${app.name} must not default to submit-once`);
    assert.deepEqual(
      collectFlagValues(args, "--live-goal-status"),
      [liveGoalStatusPath],
      `${app.name} must use the current live-goal status artifact`,
    );
    const appReadinessReports = collectFlagValues(args, "--readiness-report");
    const appCarryReports = collectFlagValues(args, "--carry-report");
    assert.deepEqual(
      appReadinessReports,
      [app.env?.LIVE_READINESS_SUMMARY_PATH],
      `${app.name} readiness arg must match LIVE_READINESS_SUMMARY_PATH`,
    );
    assert.equal(appCarryReports.length, 1, `${app.name} must use exactly one carry report`);
    assert.equal(
      collectFlagValues(args, "--output").length,
      1,
      `${app.name} must write exactly one execution report`,
    );
    const startScriptName = `pm2:start:${app.name}`;
    const restartScriptName = `pm2:restart:${app.name}`;
    const startScript = packageJson.scripts[startScriptName];
    const restartScript = packageJson.scripts[restartScriptName];
    assert.ok(startScript, `${startScriptName} script is missing`);
    assert.ok(restartScript, `${restartScriptName} script is missing`);
    const reviewCommand = startScript.match(/npm run (dry-run:review-spot-perp-carry-[^ ]+-live-ready)/)?.[1];
    assert.ok(reviewCommand, `${startScriptName} must run a spot-perp carry live review before PM2 startup`);
    assertCommandOrder(startScript, "npm run prepare:runtime-dirs", `npm run ${reviewCommand}`);
    assertCommandOrder(startScript, `npm run ${reviewCommand}`, "npm run build");
    assertCommandOrder(startScript, "npm run build", `pm2 start ecosystem.config.cjs --only ${app.name}`);
    assertCommandOrder(startScript, `npm run ${reviewCommand}`, `pm2 start ecosystem.config.cjs --only ${app.name}`);
    assertCommandOrder(restartScript, "npm run prepare:runtime-dirs", `npm run ${reviewCommand}`);
    assertCommandOrder(restartScript, `npm run ${reviewCommand}`, "npm run build");
    assertCommandOrder(restartScript, "npm run build", "pm2");
    assertCommandOrder(restartScript, `npm run ${reviewCommand}`, "pm2");
    const reviewScript = packageJson.scripts[reviewCommand];
    assert.ok(reviewScript, `${reviewCommand} script is missing`);
    assert.ok(
      reviewScript.includes("npm run dry-run:audit-spot-perp-carry-operational-proof"),
      `${reviewCommand} must refresh operational proof`,
    );
    assert.ok(
      reviewScript.includes("npm run dry-run:audit-spot-perp-carry-live-readiness"),
      `${reviewCommand} must audit spot-perp live readiness`,
    );
    assert.ok(reviewScript.includes("--require-live-ready"), `${reviewCommand} must require live readiness`);
    assert.ok(
      reviewScript.includes("npm run dry-run:gate-live-goal-ready"),
      `${reviewCommand} must run the global live-goal gate`,
    );
    assert.deepEqual(
      collectCommandFlagValues(reviewScript, "dry-run:audit-spot-perp-carry-operational-proof", "--carry-report"),
      appCarryReports,
      `${reviewCommand} operational proof carry report must match ${app.name}`,
    );
    assert.deepEqual(
      collectCommandFlagValues(reviewScript, "dry-run:audit-spot-perp-carry-live-readiness", "--carry-report"),
      appCarryReports,
      `${reviewCommand} live-readiness carry report must match ${app.name}`,
    );
    assert.deepEqual(
      collectCommandFlagValues(reviewScript, "dry-run:audit-spot-perp-carry-live-readiness", "--output"),
      appReadinessReports,
      `${reviewCommand} live-readiness output must match ${app.name}`,
    );
    const reviewOperationalProofOutputs = collectCommandFlagValues(
      reviewScript,
      "dry-run:audit-spot-perp-carry-operational-proof",
      "--output",
    );
    assert.deepEqual(
      collectCommandFlagValues(reviewScript, "dry-run:audit-spot-perp-carry-live-readiness", "--operational-proof"),
      reviewOperationalProofOutputs,
      `${reviewCommand} live-readiness operational proof must use the proof it refreshed`,
    );
    assert.deepEqual(
      collectCommandFlagValues(reviewScript, "dry-run:audit-spot-perp-carry-live-readiness", "--fee-stress-report"),
      collectCommandFlagValues(reviewScript, "dry-run:audit-spot-perp-carry-operational-proof", "--fee-budget-report"),
      `${reviewCommand} fee-stress reports must match operational fee-budget reports`,
    );
    for (const statusVariable of [
      "refresh_status=$?",
      "operational_status=$?",
      "carry_status=$?",
      "goal_status=$?",
    ]) {
      assert.ok(reviewScript.includes(statusVariable), `${reviewCommand} must capture ${statusVariable}`);
    }
    for (const statusVariable of [
      "$refresh_status -ne 0",
      "$operational_status -ne 0",
      "$carry_status -ne 0",
      "$goal_status -ne 0",
    ]) {
      assert.ok(reviewScript.includes(statusVariable), `${reviewCommand} must fail closed on ${statusVariable}`);
    }
  }

  const spotPerpLiveApp = ecosystem.apps.find((app) => app.name === "live-spot-perp-carry");
  assert.ok(spotPerpLiveApp, "live-spot-perp-carry app is missing");
  assert.equal(spotPerpLiveApp.script, "dist/src/cli/run-spot-perp-carry-live.js");
  assert.equal(spotPerpLiveApp.env?.TRADING_MODE, "live");
  assert.equal(spotPerpLiveApp.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(spotPerpLiveApp.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION, "false");
  assert.equal(spotPerpLiveApp.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION, "false");
  assert.ok(spotPerpLiveApp.args?.includes("--require-live-ready"));
  assert.ok(spotPerpLiveApp.args?.includes("--live-goal-status"));
  assert.ok(spotPerpLiveApp.args?.includes(liveGoalStatusPath));
  assert.ok(spotPerpLiveApp.args?.includes("var/reports/spot-perp-carry-pieverse-edu-live-readiness-latest.json"));
  assert.ok(spotPerpLiveApp.args?.includes("var/reports/spot-perp-carry-pieverse-edu-72h-latest.json"));

  const spotPerpLiveStart = packageJson.scripts["pm2:start:live-spot-perp-carry"];
  const spotPerpLiveRestart = packageJson.scripts["pm2:restart:live-spot-perp-carry"];
  assert.ok(
    packageJson.scripts["dry-run:run-spot-perp-carry-live"]?.includes(
      "run-spot-perp-carry-live.js",
    ),
  );
  assertCommandOrder(
    spotPerpLiveStart ?? "",
    "npm run dry-run:review-spot-perp-carry-pieverse-edu-live-ready",
    "pm2 start ecosystem.config.cjs --only live-spot-perp-carry",
  );
  assertCommandOrder(
    spotPerpLiveRestart ?? "",
    "npm run dry-run:review-spot-perp-carry-pieverse-edu-live-ready",
    "pm2",
  );
  assert.equal(packageJson.scripts["pm2:stop:live-spot-perp-carry"], "pm2 delete live-spot-perp-carry");
  assert.equal(packageJson.scripts["pm2:status:live-spot-perp-carry"], "pm2 show live-spot-perp-carry");
  assert.equal(packageJson.scripts["pm2:logs:live-spot-perp-carry"], "pm2 logs live-spot-perp-carry");

  const pieverseLiveApp = ecosystem.apps.find((app) => app.name === "live-spot-perp-carry-pieverse");
  assert.ok(pieverseLiveApp, "live-spot-perp-carry-pieverse app is missing");
  assert.equal(pieverseLiveApp.script, "dist/src/cli/run-spot-perp-carry-live.js");
  assert.equal(pieverseLiveApp.env?.TRADING_MODE, "live");
  assert.equal(pieverseLiveApp.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(pieverseLiveApp.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION, "false");
  assert.equal(pieverseLiveApp.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION, "false");
  assert.ok(pieverseLiveApp.args?.includes("--require-live-ready"));
  assert.ok(pieverseLiveApp.args?.includes("--live-goal-status"));
  assert.ok(pieverseLiveApp.args?.includes(liveGoalStatusPath));
  assert.ok(pieverseLiveApp.args?.includes("var/reports/spot-perp-carry-pieverse-live-readiness-latest.json"));
  assert.ok(pieverseLiveApp.args?.includes("var/reports/spot-perp-carry-pieverse-72h-latest.json"));
  assert.ok(pieverseLiveApp.args?.includes("--market"));
  assert.ok(pieverseLiveApp.args?.includes("KRW-PIEVERSE"));

  const pieverseLiveStart = packageJson.scripts["pm2:start:live-spot-perp-carry-pieverse"];
  const pieverseLiveRestart = packageJson.scripts["pm2:restart:live-spot-perp-carry-pieverse"];
  const pieverseLiveReview =
    packageJson.scripts["dry-run:review-spot-perp-carry-pieverse-live-ready"];
  assertCommandOrder(
    pieverseLiveReview ?? "",
    "npm run dry-run:refresh-spot-perp-carry-pieverse-live-readiness",
    "npm run dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    pieverseLiveReview ?? "",
    "npm run dry-run:audit-spot-perp-carry-live-readiness",
    "npm run dry-run:gate-live-goal-ready",
  );
  assertCommandOrder(
    pieverseLiveStart ?? "",
    "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
    "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-pieverse",
  );
  assertCommandOrder(
    pieverseLiveRestart ?? "",
    "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
    "pm2",
  );
  assert.equal(
    packageJson.scripts["pm2:stop:live-spot-perp-carry-pieverse"],
    "pm2 delete live-spot-perp-carry-pieverse",
  );

  const eduLiveApp = ecosystem.apps.find((app) => app.name === "live-spot-perp-carry-edu");
  assert.ok(eduLiveApp, "live-spot-perp-carry-edu app is missing");
  assert.equal(eduLiveApp.script, "dist/src/cli/run-spot-perp-carry-live.js");
  assert.equal(eduLiveApp.env?.TRADING_MODE, "live");
  assert.equal(eduLiveApp.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(eduLiveApp.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION, "false");
  assert.equal(eduLiveApp.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION, "false");
  assert.ok(eduLiveApp.args?.includes("--require-live-ready"));
  assert.ok(eduLiveApp.args?.includes("--live-goal-status"));
  assert.ok(eduLiveApp.args?.includes(liveGoalStatusPath));
  assert.ok(eduLiveApp.args?.includes("var/reports/spot-perp-carry-edu-live-readiness-latest.json"));
  assert.ok(eduLiveApp.args?.includes("var/reports/spot-perp-carry-edu-72h-latest.json"));
  assert.ok(eduLiveApp.args?.includes("--market"));
  assert.ok(eduLiveApp.args?.includes("KRW-EDU"));

  const eduLiveStart = packageJson.scripts["pm2:start:live-spot-perp-carry-edu"];
  const eduLiveRestart = packageJson.scripts["pm2:restart:live-spot-perp-carry-edu"];
  assertCommandOrder(
    eduLiveStart ?? "",
    "npm run dry-run:review-spot-perp-carry-edu-live-ready",
    "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-edu",
  );
  assertCommandOrder(
    eduLiveRestart ?? "",
    "npm run dry-run:review-spot-perp-carry-edu-live-ready",
    "pm2",
  );
  assert.equal(
    packageJson.scripts["pm2:stop:live-spot-perp-carry-edu"],
    "pm2 delete live-spot-perp-carry-edu",
  );

  const cysLiveApp = ecosystem.apps.find((app) => app.name === "live-spot-perp-carry-cys");
  assert.ok(cysLiveApp, "live-spot-perp-carry-cys app is missing");
  assert.equal(cysLiveApp.script, "dist/src/cli/run-spot-perp-carry-live.js");
  assert.equal(cysLiveApp.env?.TRADING_MODE, "live");
  assert.equal(cysLiveApp.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(cysLiveApp.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION, "false");
  assert.equal(cysLiveApp.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION, "false");
  assert.ok(cysLiveApp.args?.includes("--require-live-ready"));
  assert.ok(cysLiveApp.args?.includes("--live-goal-status"));
  assert.ok(cysLiveApp.args?.includes(liveGoalStatusPath));
  assert.ok(cysLiveApp.args?.includes("var/reports/spot-perp-carry-cys-live-readiness-latest.json"));
  assert.ok(cysLiveApp.args?.includes("var/reports/spot-perp-carry-cys-72h-latest.json"));
  assert.ok(cysLiveApp.args?.includes("--market"));
  assert.ok(cysLiveApp.args?.includes("KRW-CYS"));

  const cysLiveStart = packageJson.scripts["pm2:start:live-spot-perp-carry-cys"];
  const cysLiveRestart = packageJson.scripts["pm2:restart:live-spot-perp-carry-cys"];
  const cysLiveReview = packageJson.scripts["dry-run:review-spot-perp-carry-cys-live-ready"];
  assertCommandOrder(
    cysLiveReview ?? "",
    "npm run dry-run:refresh-spot-perp-carry-cys-live-readiness",
    "npm run dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    cysLiveReview ?? "",
    "npm run dry-run:audit-spot-perp-carry-live-readiness",
    "npm run dry-run:gate-live-goal-ready",
  );
  assertCommandOrder(
    cysLiveStart ?? "",
    "npm run dry-run:review-spot-perp-carry-cys-live-ready",
    "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-cys",
  );
  assertCommandOrder(
    cysLiveRestart ?? "",
    "npm run dry-run:review-spot-perp-carry-cys-live-ready",
    "pm2",
  );
  assert.equal(
    packageJson.scripts["pm2:stop:live-spot-perp-carry-cys"],
    "pm2 delete live-spot-perp-carry-cys",
  );

  const aztecLiveApp = ecosystem.apps.find((app) => app.name === "live-spot-perp-carry-aztec");
  assert.ok(aztecLiveApp, "live-spot-perp-carry-aztec app is missing");
  assert.equal(aztecLiveApp.script, "dist/src/cli/run-spot-perp-carry-live.js");
  assert.equal(aztecLiveApp.env?.TRADING_MODE, "live");
  assert.equal(aztecLiveApp.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(aztecLiveApp.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION, "false");
  assert.equal(aztecLiveApp.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION, "false");
  assert.ok(aztecLiveApp.args?.includes("--require-live-ready"));
  assert.ok(aztecLiveApp.args?.includes("--live-goal-status"));
  assert.ok(aztecLiveApp.args?.includes(liveGoalStatusPath));
  assert.ok(aztecLiveApp.args?.includes("var/reports/spot-perp-carry-aztec-live-readiness-latest.json"));
  assert.ok(aztecLiveApp.args?.includes("var/reports/spot-perp-carry-aztec-72h-latest.json"));
  assert.ok(aztecLiveApp.args?.includes("--market"));
  assert.ok(aztecLiveApp.args?.includes("KRW-AZTEC"));

  const aztecLiveStart = packageJson.scripts["pm2:start:live-spot-perp-carry-aztec"];
  const aztecLiveRestart = packageJson.scripts["pm2:restart:live-spot-perp-carry-aztec"];
  const aztecLiveReview = packageJson.scripts["dry-run:review-spot-perp-carry-aztec-live-ready"];
  assertCommandOrder(
    aztecLiveReview ?? "",
    "npm run dry-run:refresh-spot-perp-carry-aztec-live-readiness",
    "npm run dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    aztecLiveReview ?? "",
    "npm run dry-run:audit-spot-perp-carry-live-readiness",
    "npm run dry-run:gate-live-goal-ready",
  );
  assertCommandOrder(
    aztecLiveStart ?? "",
    "npm run dry-run:review-spot-perp-carry-aztec-live-ready",
    "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-aztec",
  );
  assertCommandOrder(
    aztecLiveRestart ?? "",
    "npm run dry-run:review-spot-perp-carry-aztec-live-ready",
    "pm2",
  );
  assert.equal(
    packageJson.scripts["pm2:stop:live-spot-perp-carry-aztec"],
    "pm2 delete live-spot-perp-carry-aztec",
  );

  const nilLiveApp = ecosystem.apps.find((app) => app.name === "live-spot-perp-carry-nil");
  assert.ok(nilLiveApp, "live-spot-perp-carry-nil app is missing");
  assert.equal(nilLiveApp.script, "dist/src/cli/run-spot-perp-carry-live.js");
  assert.equal(nilLiveApp.env?.TRADING_MODE, "live");
  assert.equal(nilLiveApp.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(nilLiveApp.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION, "false");
  assert.equal(nilLiveApp.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION, "false");
  assert.ok(nilLiveApp.args?.includes("--require-live-ready"));
  assert.ok(nilLiveApp.args?.includes("--live-goal-status"));
  assert.ok(nilLiveApp.args?.includes(liveGoalStatusPath));
  assert.ok(nilLiveApp.args?.includes("var/reports/spot-perp-carry-nil-live-readiness-latest.json"));
  assert.ok(nilLiveApp.args?.includes("var/reports/spot-perp-carry-nil-72h-latest.json"));
  assert.ok(nilLiveApp.args?.includes("--market"));
  assert.ok(nilLiveApp.args?.includes("KRW-NIL"));

  const nilLiveStart = packageJson.scripts["pm2:start:live-spot-perp-carry-nil"];
  const nilLiveRestart = packageJson.scripts["pm2:restart:live-spot-perp-carry-nil"];
  const nilLiveReview = packageJson.scripts["dry-run:review-spot-perp-carry-nil-live-ready"];
  assertCommandOrder(
    nilLiveReview ?? "",
    "npm run dry-run:refresh-spot-perp-carry-nil-live-readiness",
    "npm run dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    nilLiveReview ?? "",
    "npm run dry-run:audit-spot-perp-carry-live-readiness",
    "npm run dry-run:gate-live-goal-ready",
  );
  assertCommandOrder(
    nilLiveStart ?? "",
    "npm run dry-run:review-spot-perp-carry-nil-live-ready",
    "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-nil",
  );
  assertCommandOrder(
    nilLiveRestart ?? "",
    "npm run dry-run:review-spot-perp-carry-nil-live-ready",
    "pm2",
  );
  assert.equal(
    packageJson.scripts["pm2:stop:live-spot-perp-carry-nil"],
    "pm2 delete live-spot-perp-carry-nil",
  );

  const aktLiveApp = ecosystem.apps.find((app) => app.name === "live-spot-perp-carry-akt");
  assert.ok(aktLiveApp, "live-spot-perp-carry-akt app is missing");
  assert.equal(aktLiveApp.script, "dist/src/cli/run-spot-perp-carry-live.js");
  assert.equal(aktLiveApp.env?.TRADING_MODE, "live");
  assert.equal(aktLiveApp.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(aktLiveApp.env?.ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION, "false");
  assert.equal(aktLiveApp.env?.ENABLE_SPOT_PERP_CARRY_ORDER_SUBMISSION, "false");
  assert.ok(aktLiveApp.args?.includes("--require-live-ready"));
  assert.ok(aktLiveApp.args?.includes("--live-goal-status"));
  assert.ok(aktLiveApp.args?.includes(liveGoalStatusPath));
  assert.ok(aktLiveApp.args?.includes("var/reports/spot-perp-carry-akt-live-readiness-latest.json"));
  assert.ok(aktLiveApp.args?.includes("var/reports/spot-perp-carry-akt-72h-latest.json"));
  assert.ok(aktLiveApp.args?.includes("--market"));
  assert.ok(aktLiveApp.args?.includes("KRW-AKT"));

  const aktLiveStart = packageJson.scripts["pm2:start:live-spot-perp-carry-akt"];
  const aktLiveRestart = packageJson.scripts["pm2:restart:live-spot-perp-carry-akt"];
  const aktLiveReview = packageJson.scripts["dry-run:review-spot-perp-carry-akt-live-ready"];
  assertCommandOrder(
    aktLiveReview ?? "",
    "npm run dry-run:refresh-spot-perp-carry-akt-live-readiness",
    "npm run dry-run:audit-spot-perp-carry-operational-proof",
  );
  assertCommandOrder(
    aktLiveReview ?? "",
    "npm run dry-run:audit-spot-perp-carry-live-readiness",
    "npm run dry-run:gate-live-goal-ready",
  );
  assertCommandOrder(
    aktLiveStart ?? "",
    "npm run dry-run:review-spot-perp-carry-akt-live-ready",
    "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-akt",
  );
  assertCommandOrder(
    aktLiveRestart ?? "",
    "npm run dry-run:review-spot-perp-carry-akt-live-ready",
    "pm2",
  );
  assert.equal(
    packageJson.scripts["pm2:stop:live-spot-perp-carry-akt"],
    "pm2 delete live-spot-perp-carry-akt",
  );

  const liveSpotPerpStartGates: Array<[string | undefined, string, string]> = [
    [
      spotPerpLiveStart,
      "npm run dry-run:review-spot-perp-carry-pieverse-edu-live-ready",
      "pm2 start ecosystem.config.cjs --only live-spot-perp-carry",
    ],
    [
      pieverseLiveStart,
      "npm run dry-run:review-spot-perp-carry-pieverse-live-ready",
      "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-pieverse",
    ],
    [
      eduLiveStart,
      "npm run dry-run:review-spot-perp-carry-edu-live-ready",
      "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-edu",
    ],
    [
      cysLiveStart,
      "npm run dry-run:review-spot-perp-carry-cys-live-ready",
      "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-cys",
    ],
    [
      aztecLiveStart,
      "npm run dry-run:review-spot-perp-carry-aztec-live-ready",
      "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-aztec",
    ],
    [
      nilLiveStart,
      "npm run dry-run:review-spot-perp-carry-nil-live-ready",
      "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-nil",
    ],
    [
      aktLiveStart,
      "npm run dry-run:review-spot-perp-carry-akt-live-ready",
      "pm2 start ecosystem.config.cjs --only live-spot-perp-carry-akt",
    ],
  ];
  for (const [script, reviewGate, pm2Command] of liveSpotPerpStartGates) {
    assertLivePm2ProcessAlignmentGate(script, reviewGate, pm2Command);
  }

  const liveSpotPerpRestartGates: Array<[string | undefined, string]> = [
    [spotPerpLiveRestart, "npm run dry-run:review-spot-perp-carry-pieverse-edu-live-ready"],
    [pieverseLiveRestart, "npm run dry-run:review-spot-perp-carry-pieverse-live-ready"],
    [eduLiveRestart, "npm run dry-run:review-spot-perp-carry-edu-live-ready"],
    [cysLiveRestart, "npm run dry-run:review-spot-perp-carry-cys-live-ready"],
    [aztecLiveRestart, "npm run dry-run:review-spot-perp-carry-aztec-live-ready"],
    [nilLiveRestart, "npm run dry-run:review-spot-perp-carry-nil-live-ready"],
    [aktLiveRestart, "npm run dry-run:review-spot-perp-carry-akt-live-ready"],
  ];
  for (const [script, reviewGate] of liveSpotPerpRestartGates) {
    assertLivePm2ProcessAlignmentGate(script, reviewGate, "pm2");
  }
});

test("live BTC PM2 start scripts refresh readiness before goal gates and live PM2 startup", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{ name?: string; env?: Record<string, string> }>;
  };
  const liveBtcStart = packageJson.scripts["pm2:start:live-btc"];
  const liveBtcRestart = packageJson.scripts["pm2:restart:live-btc"];
  const min75Start = packageJson.scripts["pm2:start:live-btc-min75"];
  const min75Restart = packageJson.scripts["pm2:restart:live-btc-min75"];
  const min75Review = packageJson.scripts["dry-run:review-btc-240m-min75-live-ready"];
  const liveBtcApp = ecosystem.apps.find((app) => app.name === "live-btc-manager");
  const min75App = ecosystem.apps.find((app) => app.name === "live-btc-min75-manager");

  assert.ok(liveBtcStart, "pm2:start:live-btc script is missing");
  assert.ok(liveBtcRestart, "pm2:restart:live-btc script is missing");
  assert.ok(min75Start, "pm2:start:live-btc-min75 script is missing");
  assert.ok(min75Restart, "pm2:restart:live-btc-min75 script is missing");
  assert.ok(min75Review, "dry-run:review-btc-240m-min75-live-ready script is missing");
  assert.equal(liveBtcApp?.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(min75App?.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(
    liveBtcApp?.env?.LIVE_GOAL_STATUS_PATH,
    "var/reports/live-goal-status-20260513-current.json",
  );
  assert.equal(
    liveBtcApp?.env?.LIVE_READINESS_SUMMARY_PATH,
    "var/reports/btc-240m-momentum-readiness-latest-refresh.json",
  );
  assert.equal(
    min75App?.env?.LIVE_GOAL_STATUS_PATH,
    "var/reports/live-goal-status-20260513-current.json",
  );
  assert.equal(
    min75App?.env?.LIVE_READINESS_SUMMARY_PATH,
    "var/reports/btc-240m-momentum-min75-readiness-latest-refresh.json",
  );

  const btcGate = packageJson.scripts["dry-run:gate-btc-240m-live-ready"];
  const min75Gate = packageJson.scripts["dry-run:gate-btc-240m-min75-live-ready"];
  assert.ok(btcGate, "dry-run:gate-btc-240m-live-ready script is missing");
  assert.ok(min75Gate, "dry-run:gate-btc-240m-min75-live-ready script is missing");
  const btcGatePrefix = collectFlagValues(btcGate.split(/\s+/), "--artifact-prefix")[0] ?? "btc-240m-momentum";
  const min75GatePrefix = collectFlagValues(min75Gate.split(/\s+/), "--artifact-prefix")[0] ?? "btc-240m-momentum";
  assert.equal(
    liveBtcApp?.env?.LIVE_READINESS_SUMMARY_PATH,
    `var/reports/${btcGatePrefix}-readiness-latest-refresh.json`,
  );
  assert.equal(
    min75App?.env?.LIVE_READINESS_SUMMARY_PATH,
    `var/reports/${min75GatePrefix}-readiness-latest-refresh.json`,
  );

  for (const script of [liveBtcStart, liveBtcRestart]) {
    assertCommandOrder(script, "npm run prepare:runtime-dirs", "npm run dry-run:gate-btc-240m-live-ready");
    assertCommandOrder(script, "npm run dry-run:gate-btc-240m-live-ready", "npm run dry-run:gate-live-goal-ready");
    assertLivePm2ProcessAlignmentGate(script, "npm run dry-run:gate-live-goal-ready", "pm2");
    assert.ok(script.includes("--only live-btc-manager"));
  }

  for (const script of [min75Start, min75Restart]) {
    assertLivePm2ProcessAlignmentGate(
      script,
      "npm run dry-run:review-btc-240m-min75-live-ready",
      "pm2",
    );
    assert.ok(!script.includes("npm run dry-run:gate-live-goal-ready && npm run dry-run:gate-btc-240m-min75-live-ready"));
    assert.ok(script.includes("--only live-btc-min75-manager"));
  }

  assertCommandOrder(min75Review, "npm run dry-run:gate-btc-240m-min75-live-ready", "npm run dry-run:gate-live-goal-ready");
  assert.ok(min75Review.includes("min75_status=$?"));
  assert.ok(min75Review.includes("goal_status=$?"));
  assert.ok(min75Review.includes("$min75_status -ne 0"));
  assert.ok(min75Review.includes("$goal_status -ne 0"));
  assert.ok(!min75Review.includes("pm2"), "min75 review script must not start a live PM2 target");
});

test("cross-exchange live PM2 startup is gated by live-goal authority", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{ name?: string; script?: string; args?: string[]; env?: Record<string, string> }>;
  };
  const startScript = packageJson.scripts["pm2:start:live-cross-exchange-relative-value"];
  const restartScript = packageJson.scripts["pm2:restart:live-cross-exchange-relative-value"];
  const app = ecosystem.apps.find((entry) => entry.name === "live-cross-exchange-relative-value");
  const liveGoalStatusPath = "var/reports/live-goal-status-20260513-current.json";

  assert.ok(startScript, "pm2:start:live-cross-exchange-relative-value script is missing");
  assert.ok(restartScript, "pm2:restart:live-cross-exchange-relative-value script is missing");
  assert.ok(app, "live-cross-exchange-relative-value app is missing");
  const appArgs = app.args ?? [];
  assert.equal(app.script, "dist/src/cli/run-cross-exchange-relative-value-live.js");
  assert.equal(app.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(app.env?.ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION, "false");
  assert.ok(!appArgs.includes("--submit-once"), "cross-exchange live app must not default to submit-once");
  assert.deepEqual(
    collectFlagValues(appArgs, "--live-goal-status"),
    [liveGoalStatusPath],
    "cross-exchange live app must use the current live-goal status artifact",
  );
  const appReadinessReports = collectFlagValues(appArgs, "--readiness-report");
  assert.deepEqual(
    appReadinessReports,
    ["var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-usdtkrw-orderbook-latest.json"],
    "cross-exchange live app must use the reviewed readiness artifact",
  );
  assert.equal(
    collectFlagValues(appArgs, "--output").length,
    1,
    "cross-exchange live app must write one execution report",
  );
  assertCommandOrder(startScript, "npm run prepare:runtime-dirs", "npm run dry-run:audit-cross-exchange-live-readiness");
  assertCommandOrder(startScript, "npm run dry-run:audit-cross-exchange-live-readiness", "npm run dry-run:gate-live-goal-ready");
  assertLivePm2ProcessAlignmentGate(
    startScript,
    "npm run dry-run:gate-live-goal-ready",
    "pm2 start ecosystem.config.cjs --only live-cross-exchange-relative-value",
  );
  assert.deepEqual(
    collectCommandFlagValues(startScript, "dry-run:audit-cross-exchange-live-readiness", "--output"),
    appReadinessReports,
    "cross-exchange live start review output must match the PM2 app readiness input",
  );
  assert.ok(
    startScript.includes("--require-live-ready"),
    "cross-exchange live start review must require live readiness",
  );
  assertCommandOrder(restartScript, "npm run prepare:runtime-dirs", "npm run dry-run:audit-cross-exchange-live-readiness");
  assertCommandOrder(restartScript, "npm run dry-run:audit-cross-exchange-live-readiness", "npm run dry-run:gate-live-goal-ready");
  assertLivePm2ProcessAlignmentGate(restartScript, "npm run dry-run:gate-live-goal-ready", "pm2");
  assert.deepEqual(
    collectCommandFlagValues(restartScript, "dry-run:audit-cross-exchange-live-readiness", "--output"),
    appReadinessReports,
    "cross-exchange live restart review output must match the PM2 app readiness input",
  );
  assert.ok(
    restartScript.includes("--require-live-ready"),
    "cross-exchange live restart review must require live readiness",
  );
});

test("live goal status PM2 observer has idempotent lifecycle scripts", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const startScript = packageJson.scripts["pm2:start:dry-run:live-goal-status"];
  const restartScript = packageJson.scripts["pm2:restart:dry-run:live-goal-status"];
  const stopScript = packageJson.scripts["pm2:stop:dry-run:live-goal-status"];
  const statusScript = packageJson.scripts["pm2:status:dry-run:live-goal-status"];
  const logsScript = packageJson.scripts["pm2:logs:dry-run:live-goal-status"];
  const saveScript = packageJson.scripts["pm2:save"];

  assert.ok(startScript?.includes("--only dry-run-live-goal-status-observer"));
  assert.ok(restartScript?.includes("(pm2 delete dry-run-live-goal-status-observer || true)"));
  assert.ok(restartScript?.includes("--only dry-run-live-goal-status-observer"));
  assert.equal(stopScript, "(pm2 delete dry-run-live-goal-status-observer || true)");
  assert.equal(statusScript, "pm2 show dry-run-live-goal-status-observer");
  assert.equal(logsScript, "pm2 logs dry-run-live-goal-status-observer");
  assert.equal(saveScript, "pm2 save");
});

test("STABLE refresh observer generates focused evidence sequentially", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{ name?: string; args?: string; script?: string; env?: Record<string, string> }>;
  };
  const observer = ecosystem.apps.find(
    (app) => app.name === "dry-run-stable-60m-reversal-refresh-observer",
  );
  const managedPaper = ecosystem.apps.find(
    (app) => app.name === "dry-run-stable-60m-reversal-managed-paper",
  );
  const managedReturnObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-stable-60m-reversal-managed-return-observer",
  );
  assert.ok(observer, "dry-run-stable-60m-reversal-refresh-observer app is missing");
  const observerArgs = observer.args;
  if (typeof observerArgs !== "string") {
    throw new Error("dry-run-stable-60m-reversal-refresh-observer args must be a string");
  }

  const args = observerArgs.split(/\s+/);
  assert.deepEqual(collectFlagValues(args, "--scan"), [
    "var/reports/krw-stable-public-60m-reversal-scan-fee20-5000-20260513.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--observation-output"), [
    "var/reports/stable-60m-reversal-top-forward-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--paper-observation-output"), [
    "var/reports/stable-60m-reversal-paper-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--position-audit-output"), [
    "var/reports/stable-60m-reversal-position-audit-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--readiness-output"), [
    "var/reports/stable-60m-reversal-replacement-readiness-latest.json",
  ]);

  const oldObservers = new Set([
    "dry-run-stable-60m-reversal-observer",
    "dry-run-stable-60m-reversal-paper-observer",
    "dry-run-stable-60m-reversal-position-observer",
    "dry-run-stable-60m-reversal-readiness-observer",
  ]);
  assert.equal(
    ecosystem.apps.some((app) => app.name && oldObservers.has(app.name)),
    false,
    "STABLE evidence should not be split across independently restarted PM2 observers",
  );

  const startScript = packageJson.scripts["pm2:start:dry-run:stable-60m-reversal"];
  const restartScript = packageJson.scripts["pm2:restart:dry-run:stable-60m-reversal"];
  const stopScript = packageJson.scripts["pm2:stop:dry-run:stable-60m-reversal"];
  const statusScript = packageJson.scripts["pm2:status:dry-run:stable-60m-reversal"];
  const logsScript = packageJson.scripts["pm2:logs:dry-run:stable-60m-reversal"];
  const refreshScript = packageJson.scripts["dry-run:refresh-stable-60m-reversal-readiness"];
  const gateScript = packageJson.scripts["dry-run:gate-stable-60m-reversal-live-ready"];
  const livePathGateScript = packageJson.scripts["dry-run:gate-stable-60m-reversal-live-path-ready"];
  const reviewScript = packageJson.scripts["dry-run:review-stable-60m-reversal-live-ready"];
  assert.ok(refreshScript?.includes("refresh-bithumb-replacement-time-series-readiness.js"));
  assert.ok(refreshScript?.includes("--strategy-id stable_60m_reversal_candidate_v1"));
  assert.ok(gateScript?.includes("stable-60m-reversal-replacement-readiness-latest.json"));
  assert.ok(gateScript?.includes("--require-live-ready"));
  assert.ok(livePathGateScript?.includes("--market KRW-STABLE"));
  assert.ok(livePathGateScript?.includes("--strategy-id stable_60m_reversal_candidate_v1"));
  assert.ok(livePathGateScript?.includes("--require-ready"));
  assertCommandOrder(reviewScript ?? "", "npm run dry-run:refresh-stable-60m-reversal-readiness", "npm run dry-run:gate-stable-60m-reversal-live-path-ready");
  assertCommandOrder(reviewScript ?? "", "npm run dry-run:gate-stable-60m-reversal-live-path-ready", "npm run dry-run:gate-stable-60m-reversal-live-ready");
  assertCommandOrder(reviewScript ?? "", "npm run dry-run:gate-stable-60m-reversal-live-ready", "npm run dry-run:gate-live-goal-ready");
  assert.ok(startScript?.includes("--only dry-run-stable-60m-reversal-refresh-observer"));
  assert.ok(restartScript?.includes("(pm2 delete dry-run-stable-60m-reversal-observer || true)"));
  assert.ok(restartScript?.includes("--only dry-run-stable-60m-reversal-refresh-observer"));
  assert.ok(stopScript?.includes("dry-run-stable-60m-reversal-refresh-observer"));
  assert.equal(statusScript, "pm2 show dry-run-stable-60m-reversal-refresh-observer");
  assert.equal(logsScript, "pm2 logs dry-run-stable-60m-reversal-refresh-observer");

  assert.ok(managedPaper, "dry-run-stable-60m-reversal-managed-paper app is missing");
  assert.equal(managedPaper.script, "dist/src/cli/run-dry-run-service.js");
  assert.equal(managedPaper.env?.TRADING_MODE, "paper");
  assert.equal(managedPaper.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(managedPaper.env?.DRY_RUN_EXECUTION_MODE, "paper");
  assert.equal(managedPaper.env?.DRY_RUN_MARKETS, "KRW-STABLE");
  assert.equal(
    managedPaper.env?.DRY_RUN_ENTRY_PROFILE,
    "stable_60m_reversal_candidate_v1",
  );
  assert.equal(
    managedPaper.env?.DRY_RUN_LOG_DIR,
    "var/log/dry-run-stable-60m-reversal-managed-paper",
  );

  const managedStartScript =
    packageJson.scripts["pm2:start:dry-run:stable-60m-reversal-managed-paper"];
  const managedRestartScript =
    packageJson.scripts["pm2:restart:dry-run:stable-60m-reversal-managed-paper"];
  const managedStopScript =
    packageJson.scripts["pm2:stop:dry-run:stable-60m-reversal-managed-paper"];
  const managedStatusScript =
    packageJson.scripts["pm2:status:dry-run:stable-60m-reversal-managed-paper"];
  const managedLogsScript =
    packageJson.scripts["pm2:logs:dry-run:stable-60m-reversal-managed-paper"];
  const managedReturnScript =
    packageJson.scripts["dry-run:returns:stable-60m-reversal-managed-paper"];
  assert.ok(managedStartScript?.includes("--only dry-run-stable-60m-reversal-managed-paper"));
  assert.ok(managedRestartScript?.includes("(pm2 delete dry-run-stable-60m-reversal-managed-paper || true)"));
  assert.ok(managedRestartScript?.includes("--only dry-run-stable-60m-reversal-managed-paper"));
  assert.equal(managedStopScript, "(pm2 delete dry-run-stable-60m-reversal-managed-paper || true)");
  assert.equal(managedStatusScript, "pm2 show dry-run-stable-60m-reversal-managed-paper");
  assert.equal(managedLogsScript, "pm2 logs dry-run-stable-60m-reversal-managed-paper");
  assert.ok(!managedStartScript?.includes("LIVE_READINESS_APPROVED"));
  assert.ok(!managedStartScript?.includes("ENABLE_LIVE_EXECUTION=true"));
  assert.ok(managedReturnScript?.includes("var/paper-sessions-stable-60m-reversal-managed"));
  assert.ok(managedReturnScript?.includes("var/log/dry-run-stable-60m-reversal-managed-paper/cycles.ndjson"));
  assert.ok(managedReturnScript?.includes("var/reports/stable-60m-reversal-managed-paper-return-summary-latest.json"));

  assert.ok(
    managedReturnObserver,
    "dry-run-stable-60m-reversal-managed-return-observer app is missing",
  );
  assert.equal(managedReturnObserver?.script, "dist/src/cli/summarize-dry-run-returns.js");
  assert.ok(managedReturnObserver?.args?.includes("var/paper-sessions-stable-60m-reversal-managed"));
  assert.ok(managedReturnObserver?.args?.includes("var/reports/stable-60m-reversal-managed-paper-return-summary-latest.json"));
});

test("BTC extended near-miss refresh observer remains paper-only and sequential", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{ name?: string; args?: string; env?: Record<string, string> }>;
  };
  const observer = ecosystem.apps.find(
    (app) => app.name === "dry-run-btc-240m-momentum-lb48-hold72-min150-range-p70-refresh-observer",
  );
  assert.ok(observer, "BTC extended near-miss refresh observer app is missing");
  const observerArgs = observer.args;
  if (typeof observerArgs !== "string") {
    throw new Error("BTC extended near-miss refresh observer args must be a string");
  }

  const args = observerArgs.split(/\s+/);
  assert.deepEqual(collectFlagValues(args, "--scan"), [
    "var/reports/btc-240m-momentum-extended-threshold-fee50-official-rules-20260513.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--market"), ["KRW-BTC"]);
  assert.deepEqual(collectFlagValues(args, "--signal-mode"), ["momentum"]);
  assert.deepEqual(collectFlagValues(args, "--lookback-bars"), ["48"]);
  assert.deepEqual(collectFlagValues(args, "--hold-bars"), ["72"]);
  assert.deepEqual(collectFlagValues(args, "--min-return-bps"), ["150"]);
  assert.deepEqual(collectFlagValues(args, "--risk-filter"), ["range24_below_p70"]);
  assert.deepEqual(collectFlagValues(args, "--observation-output"), [
    "var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-forward-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--paper-observation-output"), [
    "var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-paper-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--position-audit-output"), [
    "var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-position-audit-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(args, "--readiness-output"), [
    "var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-replacement-readiness-latest.json",
  ]);
  assert.equal(observer.env?.TRADING_MODE, "paper");
  assert.equal(observer.env?.ENABLE_LIVE_EXECUTION, "false");

  const refreshScript = packageJson.scripts["dry-run:refresh-btc-240m-momentum-lb48-hold72-min150-range-p70-readiness"];
  const startScript = packageJson.scripts["pm2:start:dry-run:btc-240m-momentum-lb48-hold72-min150-range-p70"];
  const restartScript = packageJson.scripts["pm2:restart:dry-run:btc-240m-momentum-lb48-hold72-min150-range-p70"];
  const stopScript = packageJson.scripts["pm2:stop:dry-run:btc-240m-momentum-lb48-hold72-min150-range-p70"];
  const statusScript = packageJson.scripts["pm2:status:dry-run:btc-240m-momentum-lb48-hold72-min150-range-p70"];
  const logsScript = packageJson.scripts["pm2:logs:dry-run:btc-240m-momentum-lb48-hold72-min150-range-p70"];
  assert.ok(refreshScript?.includes("refresh-bithumb-replacement-time-series-readiness.js"));
  assert.ok(refreshScript?.includes("--strategy-id btc_240m_momentum_lb48_hold72_min150_range_p70_near_miss_v1"));
  const gateScript = packageJson.scripts["dry-run:gate-live-goal-ready"];
  assert.ok(gateScript?.includes("btc-240m-momentum-lb48-hold72-min150-range-p70-replacement-readiness-latest.json"));
  assert.ok(startScript?.includes("--only dry-run-btc-240m-momentum-lb48-hold72-min150-range-p70-refresh-observer"));
  assert.ok(restartScript?.includes("(pm2 delete dry-run-btc-240m-momentum-lb48-hold72-min150-range-p70-refresh-observer || true)"));
  assert.ok(stopScript?.includes("dry-run-btc-240m-momentum-lb48-hold72-min150-range-p70-refresh-observer"));
  assert.equal(statusScript, "pm2 show dry-run-btc-240m-momentum-lb48-hold72-min150-range-p70-refresh-observer");
  assert.equal(logsScript, "pm2 logs dry-run-btc-240m-momentum-lb48-hold72-min150-range-p70-refresh-observer");
});

test("BTC lb168 hold72 managed paper observer remains paper-only", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{ name?: string; args?: string; script?: string; env?: Record<string, string> }>;
  };
  const managedPaper = ecosystem.apps.find(
    (app) => app.name === "dry-run-btc-240m-momentum-lb168-hold72-range-p70-managed-paper",
  );
  const managedReturnObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-btc-240m-momentum-lb168-hold72-range-p70-managed-return-observer",
  );
  assert.ok(managedPaper, "BTC lb168 managed paper app is missing");
  assert.equal(managedPaper?.script, "dist/src/cli/run-dry-run-service.js");
  assert.equal(managedPaper?.env?.TRADING_MODE, "paper");
  assert.equal(managedPaper?.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(managedPaper?.env?.DRY_RUN_EXECUTION_MODE, "paper");
  assert.equal(managedPaper?.env?.DRY_RUN_MARKETS, "KRW-BTC");
  assert.equal(
    managedPaper?.env?.DRY_RUN_ENTRY_PROFILE,
    "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1",
  );
  assert.equal(
    managedPaper?.env?.PAPER_SESSION_ARTIFACTS_DIR,
    "var/paper-sessions-btc-240m-momentum-lb168-hold72-range-p70-managed",
  );

  assert.equal(managedReturnObserver?.script, "dist/src/cli/summarize-dry-run-returns.js");
  assert.ok(
    managedReturnObserver?.args?.includes(
      "var/paper-sessions-btc-240m-momentum-lb168-hold72-range-p70-managed",
    ),
  );
  assert.ok(
    managedReturnObserver?.args?.includes(
      "var/reports/btc-240m-momentum-lb168-hold72-range-p70-managed-paper-return-summary-latest.json",
    ),
  );
  const refreshScript =
    packageJson.scripts["dry-run:refresh-btc-240m-momentum-lb168-hold72-range-p70-readiness"];
  const returnScript =
    packageJson.scripts["dry-run:returns:btc-240m-momentum-lb168-hold72-range-p70-managed-paper"];
  const startScript =
    packageJson.scripts["pm2:start:dry-run:btc-240m-momentum-lb168-hold72-range-p70-managed-paper"];
  const gateScript = packageJson.scripts["dry-run:gate-live-goal-ready"];
  assert.ok(refreshScript?.includes("--strategy-id btc_240m_momentum_lb168_hold72_range_p70_candidate_v1"));
  assert.ok(refreshScript?.includes("--lookback-bars 168"));
  assert.ok(refreshScript?.includes("--hold-bars 72"));
  assert.ok(refreshScript?.includes("--risk-filter range24_below_p70"));
  assert.ok(returnScript?.includes("btc-240m-momentum-lb168-hold72-range-p70-managed"));
  assert.ok(startScript?.includes("--only dry-run-btc-240m-momentum-lb168-hold72-range-p70-managed-paper"));
  assert.ok(gateScript?.includes("btc-240m-momentum-lb168-hold72-range-p70-replacement-readiness-latest.json"));
  assert.ok(gateScript?.includes("btc-240m-momentum-lb168-hold72-range-p70-managed-paper-return-summary-latest.json"));
  assert.ok(!gateScript?.includes("btc-240m-momentum-lb168-hold49-range-p70-managed-paper-return-summary-latest.json"));
});

test("PIEVERSE refresh observer generates focused evidence sequentially", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{ name?: string; args?: string; script?: string; env?: Record<string, string> }>;
  };
  const observer = ecosystem.apps.find(
    (app) => app.name === "dry-run-pieverse-60m-reversal-lb168-refresh-observer",
  );
  assert.ok(observer, "dry-run-pieverse-60m-reversal-lb168-refresh-observer app is missing");
  const observerArgs = observer.args;
  if (typeof observerArgs !== "string") {
    throw new Error("dry-run-pieverse-60m-reversal-lb168-refresh-observer args must be a string");
  }

  const scans = collectFlagValues(observerArgs.split(/\s+/), "--scan");
  assert.deepEqual(scans, [
    "var/reports/krw-execution-candidates-49-60m-reversal-scan-fee35-500k-20260513.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--observation-output"), [
    "var/reports/pieverse-60m-reversal-lb168-rvmedian-forward-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--paper-observation-output"), [
    "var/reports/pieverse-60m-reversal-lb168-paper-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--position-audit-output"), [
    "var/reports/pieverse-60m-reversal-lb168-position-audit-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--readiness-output"), [
    "var/reports/pieverse-60m-reversal-lb168-replacement-readiness-latest.json",
  ]);

  const oldObservers = new Set([
    "dry-run-pieverse-60m-reversal-lb168-observer",
    "dry-run-pieverse-60m-reversal-lb168-paper-observer",
    "dry-run-pieverse-60m-reversal-lb168-position-observer",
    "dry-run-pieverse-60m-reversal-lb168-readiness-observer",
  ]);
  assert.equal(
    ecosystem.apps.some((app) => app.name && oldObservers.has(app.name)),
    false,
    "PIEVERSE evidence should not be split across independently restarted PM2 observers",
  );

  const startScript = packageJson.scripts["pm2:start:dry-run:pieverse-60m-reversal-lb168"];
  const restartScript = packageJson.scripts["pm2:restart:dry-run:pieverse-60m-reversal-lb168"];
  const stopScript = packageJson.scripts["pm2:stop:dry-run:pieverse-60m-reversal-lb168"];
  const statusScript = packageJson.scripts["pm2:status:dry-run:pieverse-60m-reversal-lb168"];
  const logsScript = packageJson.scripts["pm2:logs:dry-run:pieverse-60m-reversal-lb168"];
  const refreshScript = packageJson.scripts["dry-run:refresh-pieverse-60m-reversal-lb168-readiness"];
  const gateScript = packageJson.scripts["dry-run:gate-pieverse-60m-reversal-lb168-live-ready"];
  const reviewScript = packageJson.scripts["dry-run:review-pieverse-60m-reversal-lb168-live-ready"];
  const managedPaper = ecosystem.apps.find(
    (app) => app.name === "dry-run-pieverse-60m-reversal-lb168-managed-paper",
  );
  const managedReturnObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-pieverse-60m-reversal-lb168-managed-return-observer",
  );
  assert.ok(startScript?.includes("--only dry-run-pieverse-60m-reversal-lb168-refresh-observer"));
  assert.ok(restartScript?.includes("(pm2 delete dry-run-pieverse-60m-reversal-lb168-observer || true)"));
  assert.ok(restartScript?.includes("--only dry-run-pieverse-60m-reversal-lb168-refresh-observer"));
  assert.ok(stopScript?.includes("dry-run-pieverse-60m-reversal-lb168-refresh-observer"));
  assert.equal(statusScript, "pm2 show dry-run-pieverse-60m-reversal-lb168-refresh-observer");
  assert.equal(logsScript, "pm2 logs dry-run-pieverse-60m-reversal-lb168-refresh-observer");
  assert.ok(refreshScript?.includes("refresh-bithumb-replacement-time-series-readiness.js"));
  assert.ok(refreshScript?.includes("--market KRW-PIEVERSE"));
  assert.ok(refreshScript?.includes("--strategy-id pieverse_60m_reversal_lb168_candidate_v1"));
  assert.ok(refreshScript?.includes("--readiness-output var/reports/pieverse-60m-reversal-lb168-replacement-readiness-latest.json"));
  assert.ok(gateScript?.includes("dry-run:audit-bithumb-replacement-time-series-readiness"));
  assert.ok(gateScript?.includes("pieverse-60m-reversal-lb168-rvmedian-forward-observation-latest.json"));
  assert.ok(gateScript?.includes("pieverse-60m-reversal-lb168-paper-observation-latest.json"));
  assert.ok(gateScript?.includes("pieverse-60m-reversal-lb168-position-audit-latest.json"));
  assert.ok(gateScript?.includes("pieverse-60m-reversal-lb168-replacement-readiness-latest.json"));
  assert.ok(gateScript?.includes("--require-live-ready"));
  assert.ok(!gateScript?.includes("--live-execution-path-ready"));
  assert.ok(reviewScript?.includes("npm run pm2:stop:dry-run:pieverse-60m-reversal-lb168"));
  assert.ok(reviewScript?.includes("npm run dry-run:refresh-pieverse-60m-reversal-lb168-readiness"));
  assert.ok(reviewScript?.includes("npm run dry-run:gate-pieverse-60m-reversal-lb168-live-ready"));
  assert.ok(reviewScript?.includes("npm run dry-run:gate-live-goal-ready"));
  assert.ok(reviewScript?.includes("npm run pm2:start:dry-run:pieverse-60m-reversal-lb168"));
  assert.ok(reviewScript?.includes("pieverse_stop_status=$?"));
  assert.ok(reviewScript?.includes("pieverse_refresh_status=$?"));
  assert.ok(reviewScript?.includes("pieverse_status=$?"));
  assert.ok(reviewScript?.includes("goal_status=$?"));
  assert.ok(reviewScript?.includes("pieverse_observer_status=$?"));
  assert.ok(!reviewScript?.includes("pm2:restart:dry-run:pieverse-60m-reversal-lb168"));
  assert.ok(!reviewScript?.includes("pm2 start ecosystem.config.cjs --only live"));

  assert.ok(managedPaper, "dry-run-pieverse-60m-reversal-lb168-managed-paper app is missing");
  assert.equal(managedPaper.script, "dist/src/cli/run-dry-run-service.js");
  assert.equal(managedPaper.env?.TRADING_MODE, "paper");
  assert.equal(managedPaper.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(managedPaper.env?.DRY_RUN_EXECUTION_MODE, "paper");
  assert.equal(managedPaper.env?.DRY_RUN_MARKETS, "KRW-PIEVERSE");
  assert.equal(
    managedPaper.env?.DRY_RUN_ENTRY_PROFILE,
    "pieverse_60m_reversal_lb168_candidate_v1",
  );
  assert.equal(
    managedPaper.env?.DRY_RUN_LOG_DIR,
    "var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper",
  );

  const managedStartScript =
    packageJson.scripts["pm2:start:dry-run:pieverse-60m-reversal-lb168-managed-paper"];
  const managedRestartScript =
    packageJson.scripts["pm2:restart:dry-run:pieverse-60m-reversal-lb168-managed-paper"];
  const managedStopScript =
    packageJson.scripts["pm2:stop:dry-run:pieverse-60m-reversal-lb168-managed-paper"];
  const managedStatusScript =
    packageJson.scripts["pm2:status:dry-run:pieverse-60m-reversal-lb168-managed-paper"];
  const managedLogsScript =
    packageJson.scripts["pm2:logs:dry-run:pieverse-60m-reversal-lb168-managed-paper"];
  const managedReturnScript =
    packageJson.scripts["dry-run:returns:pieverse-60m-reversal-lb168-managed-paper"];
  assert.ok(managedStartScript?.includes("--only dry-run-pieverse-60m-reversal-lb168-managed-paper"));
  assert.ok(managedRestartScript?.includes("(pm2 delete dry-run-pieverse-60m-reversal-lb168-managed-paper || true)"));
  assert.ok(managedRestartScript?.includes("--only dry-run-pieverse-60m-reversal-lb168-managed-paper"));
  assert.equal(managedStopScript, "(pm2 delete dry-run-pieverse-60m-reversal-lb168-managed-paper || true)");
  assert.equal(managedStatusScript, "pm2 show dry-run-pieverse-60m-reversal-lb168-managed-paper");
  assert.equal(managedLogsScript, "pm2 logs dry-run-pieverse-60m-reversal-lb168-managed-paper");
  assert.ok(!managedStartScript?.includes("LIVE_READINESS_APPROVED"));
  assert.ok(!managedStartScript?.includes("ENABLE_LIVE_EXECUTION=true"));
  assert.ok(managedReturnScript?.includes("var/paper-sessions-pieverse-60m-reversal-lb168-managed"));
  assert.ok(managedReturnScript?.includes("var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper/cycles.ndjson"));
  assert.ok(managedReturnScript?.includes("var/reports/pieverse-60m-reversal-lb168-managed-paper-return-summary-latest.json"));

  assert.ok(
    managedReturnObserver,
    "dry-run-pieverse-60m-reversal-lb168-managed-return-observer app is missing",
  );
  assert.equal(managedReturnObserver.script, "dist/src/cli/summarize-dry-run-returns.js");
  assert.equal(managedReturnObserver.env?.TRADING_MODE, "paper");
  assert.equal(managedReturnObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  if (typeof managedReturnObserver.args !== "string") {
    throw new Error("dry-run-pieverse-60m-reversal-lb168-managed-return-observer args must be a string");
  }
  const managedReturnArgs = managedReturnObserver.args.split(/\s+/);
  assert.deepEqual(collectFlagValues(managedReturnArgs, "--reports-root"), [
    "var/paper-sessions-pieverse-60m-reversal-lb168-managed",
  ]);
  assert.deepEqual(collectFlagValues(managedReturnArgs, "--cycles-path"), [
    "var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper/cycles.ndjson",
  ]);
  assert.deepEqual(collectFlagValues(managedReturnArgs, "--output"), [
    "var/reports/pieverse-60m-reversal-lb168-managed-paper-return-summary-latest.json",
  ]);

  const managedReturnStartScript =
    packageJson.scripts["pm2:start:dry-run:pieverse-60m-reversal-lb168-managed-return"];
  const managedReturnRestartScript =
    packageJson.scripts["pm2:restart:dry-run:pieverse-60m-reversal-lb168-managed-return"];
  const managedReturnStopScript =
    packageJson.scripts["pm2:stop:dry-run:pieverse-60m-reversal-lb168-managed-return"];
  const managedReturnStatusScript =
    packageJson.scripts["pm2:status:dry-run:pieverse-60m-reversal-lb168-managed-return"];
  const managedReturnLogsScript =
    packageJson.scripts["pm2:logs:dry-run:pieverse-60m-reversal-lb168-managed-return"];
  assert.ok(managedReturnStartScript?.includes("--only dry-run-pieverse-60m-reversal-lb168-managed-return-observer"));
  assert.ok(managedReturnRestartScript?.includes("(pm2 delete dry-run-pieverse-60m-reversal-lb168-managed-return-observer || true)"));
  assert.ok(managedReturnRestartScript?.includes("--only dry-run-pieverse-60m-reversal-lb168-managed-return-observer"));
  assert.equal(
    managedReturnStopScript,
    "(pm2 delete dry-run-pieverse-60m-reversal-lb168-managed-return-observer || true)",
  );
  assert.equal(
    managedReturnStatusScript,
    "pm2 show dry-run-pieverse-60m-reversal-lb168-managed-return-observer",
  );
  assert.equal(
    managedReturnLogsScript,
    "pm2 logs dry-run-pieverse-60m-reversal-lb168-managed-return-observer",
  );
});

test("KRW-H refresh observer generates focused evidence sequentially", () => {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = require(join(process.cwd(), "ecosystem.config.cjs")) as {
    apps: Array<{ name?: string; args?: string; script?: string; env?: Record<string, string> }>;
  };
  const observer = ecosystem.apps.find(
    (app) => app.name === "dry-run-krw-h-60m-momentum-refresh-observer",
  );
  assert.ok(observer, "dry-run-krw-h-60m-momentum-refresh-observer app is missing");
  const observerArgs = observer.args;
  if (typeof observerArgs !== "string") {
    throw new Error("dry-run-krw-h-60m-momentum-refresh-observer args must be a string");
  }

  const scans = collectFlagValues(observerArgs.split(/\s+/), "--scan");
  assert.deepEqual(scans, [
    "var/reports/current-executable-27-60m-momentum-fee35-500k-20260513-autocheck.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--observation-output"), [
    "var/reports/h-60m-momentum-top-forward-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--paper-observation-output"), [
    "var/reports/h-60m-momentum-paper-observation-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--position-audit-output"), [
    "var/reports/h-60m-momentum-position-audit-latest.json",
  ]);
  assert.deepEqual(collectFlagValues(observerArgs.split(/\s+/), "--readiness-output"), [
    "var/reports/h-60m-momentum-replacement-readiness-latest.json",
  ]);

  const oldObservers = new Set([
    "dry-run-krw-h-60m-momentum-observer",
    "dry-run-krw-h-60m-momentum-paper-observer",
    "dry-run-krw-h-60m-momentum-readiness-observer",
  ]);
  assert.equal(
    ecosystem.apps.some((app) => app.name && oldObservers.has(app.name)),
    false,
    "KRW-H evidence should not be split across independently restarted PM2 observers",
  );

  const startScript = packageJson.scripts["pm2:start:dry-run:krw-h-60m-momentum"];
  const restartScript = packageJson.scripts["pm2:restart:dry-run:krw-h-60m-momentum"];
  const stopScript = packageJson.scripts["pm2:stop:dry-run:krw-h-60m-momentum"];
  const statusScript = packageJson.scripts["pm2:status:dry-run:krw-h-60m-momentum"];
  const logsScript = packageJson.scripts["pm2:logs:dry-run:krw-h-60m-momentum"];
  const refreshScript = packageJson.scripts["dry-run:refresh-h-60m-momentum-readiness"];
  const gateScript = packageJson.scripts["dry-run:gate-h-60m-momentum-live-ready"];
  const livePathGateScript = packageJson.scripts["dry-run:gate-h-60m-momentum-live-path-ready"];
  const managedPaper = ecosystem.apps.find(
    (app) => app.name === "dry-run-krw-h-60m-momentum-managed-paper",
  );
  const managedReturnObserver = ecosystem.apps.find(
    (app) => app.name === "dry-run-krw-h-60m-momentum-managed-return-observer",
  );
  assert.ok(startScript?.includes("--only dry-run-krw-h-60m-momentum-refresh-observer"));
  assert.ok(restartScript?.includes("pm2 start ecosystem.config.cjs --only dry-run-krw-h-60m-momentum-refresh-observer"));
  assert.ok(stopScript?.includes("dry-run-krw-h-60m-momentum-refresh-observer"));
  assert.ok(stopScript?.includes("|| true"));
  assert.equal(statusScript, "pm2 show dry-run-krw-h-60m-momentum-refresh-observer");
  assert.equal(logsScript, "pm2 logs dry-run-krw-h-60m-momentum-refresh-observer");
  assert.ok(refreshScript?.includes("refresh-bithumb-replacement-time-series-readiness.js"));
  assert.ok(refreshScript?.includes("--scan var/reports/current-executable-27-60m-momentum-fee35-500k-20260513-autocheck.json"));
  assert.ok(refreshScript?.includes("--market KRW-H"));
  assert.ok(refreshScript?.includes("--risk-threshold 2065.7276995305174"));
  assert.ok(refreshScript?.includes("--strategy-id krw_h_60m_momentum_top_candidate_v1"));
  assert.ok(refreshScript?.includes("--readiness-output var/reports/h-60m-momentum-replacement-readiness-latest.json"));
  assert.ok(gateScript?.includes("dry-run:audit-bithumb-replacement-time-series-readiness"));
  assert.ok(gateScript?.includes("--scan var/reports/current-executable-27-60m-momentum-fee35-500k-20260513-autocheck.json"));
  assert.ok(gateScript?.includes("h-60m-momentum-top-forward-observation-latest.json"));
  assert.ok(gateScript?.includes("h-60m-momentum-paper-observation-latest.json"));
  assert.ok(gateScript?.includes("h-60m-momentum-position-audit-latest.json"));
  assert.ok(gateScript?.includes("h-60m-momentum-replacement-readiness-latest.json"));
  assert.ok(gateScript?.includes("--require-live-ready"));
  assert.ok(livePathGateScript?.includes("audit-bithumb-replacement-live-execution-path"));
  assert.ok(livePathGateScript?.includes("--market KRW-H"));
  assert.ok(livePathGateScript?.includes("--strategy-id krw_h_60m_momentum_top_candidate_v1"));
  assert.ok(livePathGateScript?.includes("--live-process-name live-krw-h-60m-momentum-manager"));
  assert.ok(livePathGateScript?.includes("--refresh-command-name dry-run:refresh-h-60m-momentum-readiness"));
  assert.ok(livePathGateScript?.includes("--gate-command-name dry-run:gate-h-60m-momentum-live-ready"));
  assert.ok(livePathGateScript?.includes("--output var/reports/h-60m-momentum-live-execution-path-readiness-latest.json"));
  assert.ok(livePathGateScript?.includes("--require-ready"));

  assert.ok(managedPaper, "dry-run-krw-h-60m-momentum-managed-paper app is missing");
  assert.equal(managedPaper.script, "dist/src/cli/run-dry-run-service.js");
  assert.equal(managedPaper.env?.TRADING_MODE, "paper");
  assert.equal(managedPaper.env?.ENABLE_LIVE_EXECUTION, "false");
  assert.equal(managedPaper.env?.DRY_RUN_EXECUTION_MODE, "paper");
  assert.equal(managedPaper.env?.DRY_RUN_MARKETS, "KRW-H");
  assert.equal(
    managedPaper.env?.DRY_RUN_ENTRY_PROFILE,
    "krw_h_60m_momentum_top_candidate_v1",
  );
  assert.equal(
    managedPaper.env?.DRY_RUN_LOG_DIR,
    "var/log/dry-run-krw-h-60m-momentum-managed-paper",
  );

  const managedStartScript =
    packageJson.scripts["pm2:start:dry-run:krw-h-60m-momentum-managed-paper"];
  const managedRestartScript =
    packageJson.scripts["pm2:restart:dry-run:krw-h-60m-momentum-managed-paper"];
  const managedStopScript =
    packageJson.scripts["pm2:stop:dry-run:krw-h-60m-momentum-managed-paper"];
  const managedStatusScript =
    packageJson.scripts["pm2:status:dry-run:krw-h-60m-momentum-managed-paper"];
  const managedLogsScript =
    packageJson.scripts["pm2:logs:dry-run:krw-h-60m-momentum-managed-paper"];
  const managedReturnScript =
    packageJson.scripts["dry-run:returns:krw-h-60m-momentum-managed-paper"];
  assert.ok(managedStartScript?.includes("--only dry-run-krw-h-60m-momentum-managed-paper"));
  assert.ok(managedRestartScript?.includes("(pm2 delete dry-run-krw-h-60m-momentum-managed-paper || true)"));
  assert.ok(managedRestartScript?.includes("--only dry-run-krw-h-60m-momentum-managed-paper"));
  assert.equal(managedStopScript, "(pm2 delete dry-run-krw-h-60m-momentum-managed-paper || true)");
  assert.equal(managedStatusScript, "pm2 show dry-run-krw-h-60m-momentum-managed-paper");
  assert.equal(managedLogsScript, "pm2 logs dry-run-krw-h-60m-momentum-managed-paper");
  assert.ok(!managedStartScript?.includes("LIVE_READINESS_APPROVED"));
  assert.ok(!managedStartScript?.includes("ENABLE_LIVE_EXECUTION=true"));
  assert.ok(managedReturnScript?.includes("var/paper-sessions-krw-h-60m-momentum-managed"));
  assert.ok(managedReturnScript?.includes("var/log/dry-run-krw-h-60m-momentum-managed-paper/cycles.ndjson"));
  assert.ok(managedReturnScript?.includes("var/reports/krw-h-60m-momentum-managed-paper-return-summary-latest.json"));

  assert.ok(
    managedReturnObserver,
    "dry-run-krw-h-60m-momentum-managed-return-observer app is missing",
  );
  assert.equal(managedReturnObserver.script, "dist/src/cli/summarize-dry-run-returns.js");
  assert.equal(managedReturnObserver.env?.TRADING_MODE, "paper");
  assert.equal(managedReturnObserver.env?.ENABLE_LIVE_EXECUTION, "false");
  if (typeof managedReturnObserver.args !== "string") {
    throw new Error("dry-run-krw-h-60m-momentum-managed-return-observer args must be a string");
  }
  const managedReturnArgs = managedReturnObserver.args.split(/\s+/);
  assert.deepEqual(collectFlagValues(managedReturnArgs, "--reports-root"), [
    "var/paper-sessions-krw-h-60m-momentum-managed",
  ]);
  assert.deepEqual(collectFlagValues(managedReturnArgs, "--cycles-path"), [
    "var/log/dry-run-krw-h-60m-momentum-managed-paper/cycles.ndjson",
  ]);
  assert.deepEqual(collectFlagValues(managedReturnArgs, "--output"), [
    "var/reports/krw-h-60m-momentum-managed-paper-return-summary-latest.json",
  ]);

  const managedReturnStartScript =
    packageJson.scripts["pm2:start:dry-run:krw-h-60m-momentum-managed-return"];
  const managedReturnRestartScript =
    packageJson.scripts["pm2:restart:dry-run:krw-h-60m-momentum-managed-return"];
  const managedReturnStopScript =
    packageJson.scripts["pm2:stop:dry-run:krw-h-60m-momentum-managed-return"];
  const managedReturnStatusScript =
    packageJson.scripts["pm2:status:dry-run:krw-h-60m-momentum-managed-return"];
  const managedReturnLogsScript =
    packageJson.scripts["pm2:logs:dry-run:krw-h-60m-momentum-managed-return"];
  assert.ok(managedReturnStartScript?.includes("--only dry-run-krw-h-60m-momentum-managed-return-observer"));
  assert.ok(managedReturnRestartScript?.includes("(pm2 delete dry-run-krw-h-60m-momentum-managed-return-observer || true)"));
  assert.ok(managedReturnRestartScript?.includes("--only dry-run-krw-h-60m-momentum-managed-return-observer"));
  assert.equal(
    managedReturnStopScript,
    "(pm2 delete dry-run-krw-h-60m-momentum-managed-return-observer || true)",
  );
  assert.equal(
    managedReturnStatusScript,
    "pm2 show dry-run-krw-h-60m-momentum-managed-return-observer",
  );
  assert.equal(
    managedReturnLogsScript,
    "pm2 logs dry-run-krw-h-60m-momentum-managed-return-observer",
  );
});
