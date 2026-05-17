import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("replacement live execution path audit fails closed for PIEVERSE", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-replacement-live-path-"));
  try {
    const outputPath = join(directory, "live-path.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-bithumb-replacement-live-execution-path.js",
        "--market",
        "KRW-PIEVERSE",
        "--strategy-id",
        "pieverse_60m_reversal_lb168_candidate_v1",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      ready: boolean;
      checks: Record<string, boolean>;
      reasons: string[];
      interpretation: string;
    };

    assert.equal(report.ready, false);
    assert.equal(report.checks.replacementReadinessCommandAvailable, true);
    assert.equal(report.checks.replacementRefreshCommandAvailable, true);
    assert.equal(report.checks.liveRuntimeAllowsRequestedMarket, false);
    assert.equal(report.checks.dryRunLiveAllowsRequestedMarket, false);
    assert.equal(report.checks.liveReadinessAcceptsReplacementEvidence, true);
    assert.equal(report.checks.managedServiceGeneratesRequestedStrategy, true);
    assert.equal(report.checks.liveAccountSyncSupportsRequestedBase, true);
    assert.equal(report.checks.liveFeeCheckUsesRequestedMarket, true);
    assert.equal(report.checks.sellPreflightUsesRequestedBaseBalance, true);
    assert.equal(report.checks.livePm2TargetAvailable, false);
    assert.equal(report.checks.liveStartScriptRequiresReplacementGate, false);
    assert.equal(report.checks.liveRestartScriptRequiresReplacementGate, false);
    assert.deepEqual(report.reasons, [
      "liveRuntimeAllowsRequestedMarket",
      "dryRunLiveAllowsRequestedMarket",
      "livePm2TargetAvailable",
      "liveStartScriptRequiresReplacementGate",
      "liveRestartScriptRequiresReplacementGate",
    ]);
    assert.match(report.interpretation, /Keep liveExecutionPathReady=false/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replacement live execution path audit exits nonzero when readiness is required", () => {
  const result = spawnSync(
    process.execPath,
    [
      "dist/src/cli/audit-bithumb-replacement-live-execution-path.js",
      "--market",
      "KRW-PIEVERSE",
      "--strategy-id",
      "pieverse_60m_reversal_lb168_candidate_v1",
      "--require-ready",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /"ready": false/);
  assert.match(result.stdout, /"liveReadinessAcceptsReplacementEvidence": true/);
  assert.match(result.stdout, /"managedServiceGeneratesRequestedStrategy": true/);
  assert.match(result.stdout, /"liveAccountSyncSupportsRequestedBase": true/);
  assert.match(result.stdout, /"liveFeeCheckUsesRequestedMarket": true/);
  assert.match(result.stdout, /"sellPreflightUsesRequestedBaseBalance": true/);
  assert.match(result.stdout, /"livePm2TargetAvailable": false/);
});

test("replacement live execution path audit checks requested refresh and gate commands", () => {
  const output = execFileSync(
    process.execPath,
    [
      "dist/src/cli/audit-bithumb-replacement-live-execution-path.js",
      "--market",
      "KRW-H",
      "--strategy-id",
      "krw_h_60m_momentum_top_candidate_v1",
      "--live-process-name",
      "live-krw-h-60m-momentum-manager",
      "--refresh-command-name",
      "dry-run:refresh-h-60m-momentum-readiness",
      "--gate-command-name",
      "dry-run:gate-h-60m-momentum-live-ready",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  const report = JSON.parse(output) as {
    ready: boolean;
    refreshCommandName: string;
    gateCommandName: string;
    checks: Record<string, boolean>;
    reasons: string[];
  };

  assert.equal(report.ready, false);
  assert.equal(report.refreshCommandName, "dry-run:refresh-h-60m-momentum-readiness");
  assert.equal(report.gateCommandName, "dry-run:gate-h-60m-momentum-live-ready");
  assert.equal(report.checks.replacementReadinessCommandAvailable, true);
  assert.equal(report.checks.replacementRefreshCommandAvailable, true);
  assert.equal(report.checks.managedServiceGeneratesRequestedStrategy, true);
  assert.equal(report.checks.livePm2TargetAvailable, false);
  assert.equal(report.checks.liveStartScriptRequiresReplacementGate, false);
  assert.ok(report.reasons.includes("livePm2TargetAvailable"));
});

test("replacement live execution path audit fails closed for STABLE without managed live support", () => {
  const output = execFileSync(
    process.execPath,
    [
      "dist/src/cli/audit-bithumb-replacement-live-execution-path.js",
      "--market",
      "KRW-STABLE",
      "--strategy-id",
      "stable_60m_reversal_candidate_v1",
      "--live-process-name",
      "live-stable-60m-reversal-manager",
      "--refresh-command-name",
      "dry-run:refresh-stable-60m-reversal-readiness",
      "--gate-command-name",
      "dry-run:gate-stable-60m-reversal-live-ready",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  const report = JSON.parse(output) as {
    ready: boolean;
    refreshCommandName: string;
    gateCommandName: string;
    checks: Record<string, boolean>;
    reasons: string[];
  };

  assert.equal(report.ready, false);
  assert.equal(report.refreshCommandName, "dry-run:refresh-stable-60m-reversal-readiness");
  assert.equal(report.gateCommandName, "dry-run:gate-stable-60m-reversal-live-ready");
  assert.equal(report.checks.replacementRefreshCommandAvailable, true);
  assert.equal(report.checks.managedServiceGeneratesRequestedStrategy, false);
  assert.equal(report.checks.livePm2TargetAvailable, false);
  assert.ok(report.reasons.includes("managedServiceGeneratesRequestedStrategy"));
  assert.ok(report.reasons.includes("livePm2TargetAvailable"));
});
