import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("BTC 240m live execution path audit accepts the managed 240m path wiring", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-path-"));
  try {
    const outputPath = join(directory, "live-path.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-btc-240m-live-execution-path.js",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      ready: boolean;
      checks: {
        refreshCommandAvailable: boolean;
        paperObserverPm2Available: boolean;
        reduceOnlyExitAuditAvailable: boolean;
        readinessGateRequiresLiveExecutionPath: boolean;
        liveStartupRejectsStaleReadiness: boolean;
        liveStartupRequiresFeeScheduleConfirmation: boolean;
        liveStartupAcceptsTimeSeriesReadiness: boolean;
        min75PaperObserverPm2Available: boolean;
        managedServiceGenerates240mSignal: boolean;
        managedServiceSupportsMin75Candidate: boolean;
        livePm2Uses240mSignalPath: boolean;
        min75LivePm2UsesMin75SignalPath: boolean;
        livePm2StartRequiresLatestReadinessGate: boolean;
        livePm2RestartRequiresLatestReadinessGate: boolean;
        min75LivePm2StartRequiresLatestReadinessGate: boolean;
        min75LivePm2RestartRequiresLatestReadinessGate: boolean;
      };
      reasons: string[];
    };

    assert.equal(report.ready, true);
    assert.equal(report.checks.refreshCommandAvailable, true);
    assert.equal(report.checks.paperObserverPm2Available, true);
    assert.equal(report.checks.reduceOnlyExitAuditAvailable, true);
    assert.equal(report.checks.readinessGateRequiresLiveExecutionPath, true);
    assert.equal(report.checks.liveStartupRejectsStaleReadiness, true);
    assert.equal(report.checks.liveStartupRequiresFeeScheduleConfirmation, true);
    assert.equal(report.checks.liveStartupAcceptsTimeSeriesReadiness, true);
    assert.equal(report.checks.min75PaperObserverPm2Available, true);
    assert.equal(report.checks.managedServiceGenerates240mSignal, true);
    assert.equal(report.checks.managedServiceSupportsMin75Candidate, true);
    assert.equal(report.checks.livePm2Uses240mSignalPath, true);
    assert.equal(report.checks.min75LivePm2UsesMin75SignalPath, true);
    assert.equal(report.checks.livePm2StartRequiresLatestReadinessGate, true);
    assert.equal(report.checks.livePm2RestartRequiresLatestReadinessGate, true);
    assert.equal(report.checks.min75LivePm2StartRequiresLatestReadinessGate, true);
    assert.equal(report.checks.min75LivePm2RestartRequiresLatestReadinessGate, true);
    assert.deepEqual(report.reasons, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("BTC 240m live execution path audit exits zero when readiness is required", () => {
  const result = spawnSync(
    process.execPath,
    [
      "dist/src/cli/audit-btc-240m-live-execution-path.js",
      "--require-ready",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /"ready": true/);
});
