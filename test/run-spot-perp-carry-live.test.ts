import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function liveGoalCompletionCriteria(): Array<{ id: string; passed: boolean }> {
  return [
    "candidate_selected_from_current_evidence",
    "profitability_evidence_satisfied",
    "known_losing_paths_rejected",
    "current_entry_sanity_clear",
    "no_current_focus_recompare_caution",
    "live_startup_gate_allowed",
  ].map((id) => ({ id, passed: true }));
}

function carryReport(): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    assumptions: {
      notionalKrw: 500_000,
      bithumbFeeBps: 4,
      binanceTakerFeeBps: 5,
      exitCostBufferBps: 20,
      minNetCarryBps: 10,
    },
    perMarketSummary: [
      {
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        executionEligibleMedianNetCarryBps: 100,
        watchDecision: { status: "metric_candidate" },
      },
    ],
  };
}

function readyReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    liveReady: true,
    checks: {
      carryReportFresh: true,
      feeStressReportsPresent: true,
      feeStressReportsFresh: true,
      carryPromotionEligible: true,
      noCarryBlockers: true,
      sufficientObservations: true,
      sufficientObservationSpan: true,
      completedFundingEvents: true,
      positiveMedianNetCarry: true,
      positiveCarryRate: true,
      depthCoverageReady: true,
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
      liveExecutionPathReady: true,
      operationalProofPresent: true,
      operationalProofFresh: true,
      perMarketMetricCandidates: true,
      perMarketFeeStressReady: true,
    },
    reasons: [],
    evidence: {
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          watchDecision: { status: "metric_candidate" },
        },
      ],
      operationalProof: {
        details: {
          bithumbBidFeeBpsByMarket: { "KRW-PIEVERSE": 4 },
          binanceFuturesTakerFeeBpsBySymbol: { PIEVERSEUSDT: 5 },
          referenceQuoteToKrw: 1486.5,
        },
      },
    },
    ...overrides,
  };
}

function liveGoalAllowsSpotPerpCarry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    liveReady: true,
    liveStartupAllowed: true,
    selectedLiveCandidate: {
      type: "spot_perp_carry",
      market: "KRW-PIEVERSE",
      symbol: "PIEVERSEUSDT",
    },
    completionAudit: {
      achieved: true,
      failedCompletionCriteria: [],
      missingRequirements: [],
      missingRequirementCount: 0,
      criteria: liveGoalCompletionCriteria(),
    },
    blockers: [],
    ...overrides,
  };
}

test("spot-perp carry live runner rejects submit-once without output", () => {
  const result = spawnSync(
    process.execPath,
    [
      "dist/src/cli/run-spot-perp-carry-live.js",
      "--readiness-report",
      "missing-readiness.json",
      "--carry-report",
      "missing-carry.json",
      "--submit-once",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--output is required when --submit-once is used/);
});

test("spot-perp carry live runner fails closed before network calls when readiness is blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-blocked-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    writeJson(readinessPath, readyReport({
      liveReady: false,
      checks: { carryReportFresh: true, liveExecutionPathReady: true },
      reasons: ["insufficientCompletedFundingEvents"],
    }));
    writeJson(carryPath, carryReport());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /spot-perp carry live readiness is blocked: insufficientCompletedFundingEvents/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner rejects readiness and carry market mismatch before network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-mismatch-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    writeJson(readinessPath, readyReport({
      evidence: {
        perMarketSummary: [
          {
            market: "KRW-EDU",
            symbol: "EDUUSDT",
            watchDecision: { status: "metric_candidate" },
          },
        ],
        operationalProof: {
          details: {
            bithumbBidFeeBpsByMarket: { "KRW-EDU": 4 },
            binanceFuturesTakerFeeBpsBySymbol: { EDUUSDT: 5 },
            referenceQuoteToKrw: 1486.5,
          },
        },
      },
    }));
    writeJson(carryPath, carryReport());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--market",
        "KRW-PIEVERSE",
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /spot-perp carry readiness does not cover requested market KRW-PIEVERSE:PIEVERSEUSDT/,
    );
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner checks global live-goal status before env and network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-blocked-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, {
      generatedAt: new Date().toISOString(),
      liveReady: false,
      liveStartupAllowed: false,
      selectedLiveCandidate: null,
      blockers: ["spotPerpCarryFocusRecompareRequired"],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal does not allow spot-perp carry startup/);
    assert.match(result.stderr, /spotPerpCarryFocusRecompareRequired/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner checks live-goal completion audit before env and network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-audit-blocked-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      completionAudit: {
        achieved: false,
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        missingRequirements: ["spotPerpCarryFocusRecompareRequired"],
        missingRequirementCount: 1,
        criteria: liveGoalCompletionCriteria().map((criterion) =>
          criterion.id === "profitability_evidence_satisfied"
            ? { ...criterion, passed: false }
            : criterion,
        ),
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal completion audit is not achieved/);
    assert.match(result.stderr, /failedCriteria=profitability_evidence_satisfied/);
    assert.match(result.stderr, /missingRequirementCount=1/);
    assert.match(result.stderr, /spotPerpCarryFocusRecompareRequired/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner requires live-goal completion audit before env and network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-audit-required-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      completionAudit: undefined,
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal completion audit is required/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner requires explicit completion audit failed criteria list", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-audit-list-required-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      completionAudit: {
        achieved: true,
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /failedCompletionCriteria is required/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner rejects achieved audit with missing requirements", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-audit-missing-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      completionAudit: {
        achieved: true,
        failedCompletionCriteria: [],
        missingRequirements: ["spotPerpCarrySpreadControl"],
        missingRequirementCount: 1,
        criteria: liveGoalCompletionCriteria(),
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal completion audit still has missing requirements/);
    assert.match(result.stderr, /spotPerpCarrySpreadControl/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner rejects achieved audit with stale positive missing requirement count", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-audit-missing-count-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      completionAudit: {
        achieved: true,
        failedCompletionCriteria: [],
        missingRequirements: [],
        missingRequirementCount: 1,
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementCount must match missingRequirements/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner requires explicit missing requirement count", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-audit-count-required-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      completionAudit: {
        achieved: true,
        failedCompletionCriteria: [],
        missingRequirements: [],
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementCount must be a non-negative integer/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner requires completion audit criteria before network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-audit-criteria-required-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      completionAudit: {
        achieved: true,
        failedCompletionCriteria: [],
        missingRequirements: [],
        missingRequirementCount: 0,
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completion audit criteria is required/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner rejects live-goal status older than spot-perp evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-evidence-order-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    const nowMs = Date.now();
    writeJson(readinessPath, {
      ...readyReport(),
      generatedAt: new Date(nowMs).toISOString(),
    });
    writeJson(carryPath, {
      ...carryReport(),
      generatedAt: new Date(nowMs).toISOString(),
    });
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry({
      generatedAt: new Date(nowMs - 60_000).toISOString(),
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal status is older than the spot-perp carry evidence/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner requires global live-goal status for any live execution", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-goal-required-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /--live-goal-status is required for spot-perp carry live execution/);
    assert.doesNotMatch(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live runner requires explicit live flags before fetching fresh books", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-live-env-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const carryPath = join(directory, "carry.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyReport());
    writeJson(carryPath, carryReport());
    writeJson(liveGoalPath, liveGoalAllowsSpotPerpCarry());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-spot-perp-carry-live.js",
        "--readiness-report",
        readinessPath,
        "--carry-report",
        carryPath,
        "--live-goal-status",
        liveGoalPath,
        "--require-live-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_FUTURES_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENABLE_SPOT_PERP_CARRY_LIVE_EXECUTION=true is required/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
