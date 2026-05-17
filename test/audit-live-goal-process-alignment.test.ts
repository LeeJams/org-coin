import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function liveGoalCompletionCriteria(
  overrides: Record<string, boolean> = {},
): Array<{ id: string; passed: boolean }> {
  return [
    "candidate_selected_from_current_evidence",
    "profitability_evidence_satisfied",
    "known_losing_paths_rejected",
    "current_entry_sanity_clear",
    "no_current_focus_recompare_caution",
    "live_startup_gate_allowed",
  ].map((id) => ({ id, passed: overrides[id] ?? true }));
}

function opportunityObserverMarketsFromPackageScript(): string[] {
  const packageJson = require(join(process.cwd(), "package.json")) as {
    scripts: Record<string, string>;
  };
  const script = packageJson.scripts["dry-run:observe-spot-perp-carry-opportunity-72h"];
  const match = script?.match(/--markets ([^ ]+)/);
  assert.ok(match?.[1], "dry-run:observe-spot-perp-carry-opportunity-72h market args are missing");
  return match[1].split(",");
}

function liveGoalStatus(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    liveStartupAllowed: false,
    selectedLiveCandidate: null,
    completionAudit: {
      achieved: false,
      criteria: liveGoalCompletionCriteria({
        profitability_evidence_satisfied: false,
      }),
      failedCompletionCriteria: ["profitability_evidence_satisfied"],
      missingRequirements: ["liveStartupBlocked"],
      missingRequirementCount: 1,
    },
    processControlPlan: {
      liveExecution: {
        desiredState: "stopped",
        allowed: false,
        selectedLiveCandidate: null,
      },
      btcMomentum: {
        desiredState: "exit_reconciliation_only",
        allowNewEntry: false,
        allowedObserverProcesses: [
          "dry-run-btc-240m-momentum-observer",
          "dry-run-btc-240m-momentum-min75-observer",
        ],
      },
      managedPaperReentry: {
        desiredState: "do_not_start_reentry_manager",
        allowNewEntry: false,
      },
      carryResearch: {
        desiredState: "continue_observation_only",
        allowLiveStart: false,
        focusMarket: "KRW-PIEVERSE",
        fallbackMarket: "KRW-EDU",
      },
    },
    ...overrides,
  };
}

function pm2Process(
  name: string,
  overrides: {
    status?: string;
    live?: string;
    mode?: string;
    args?: string[];
    autorestart?: boolean;
    restartDelay?: number;
    restartCount?: number;
    unstableRestarts?: number;
    pmUptime?: number;
  } = {},
): Record<string, unknown> {
  return {
    name,
    pm2_env: {
      status: overrides.status ?? "online",
      args: overrides.args ?? [],
      autorestart: overrides.autorestart ?? true,
      restart_delay: overrides.restartDelay ?? 300000,
      restart_time: overrides.restartCount ?? 1,
      unstable_restarts: overrides.unstableRestarts ?? 0,
      pm_uptime: overrides.pmUptime ?? Date.parse("2026-05-14T01:57:00.000Z"),
      env: {
        TRADING_MODE: overrides.mode ?? "paper",
        ENABLE_LIVE_EXECUTION: overrides.live ?? "false",
      },
    },
  };
}

test("live goal process alignment accepts carry observation and exit reconciliation only", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-aligned-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-live-goal-status-observer", {
        status: "waiting restart",
        args: ["run", "dry-run:refresh-live-goal-status-if-due"],
      }),
      pm2Process("dry-run-spot-perp-carry-pieverse-72h-observer", { status: "waiting restart" }),
      pm2Process("dry-run-spot-perp-carry-current-carry-fee-stress-observer", { status: "waiting restart" }),
      pm2Process("dry-run-btc-240m-momentum-observer"),
      pm2Process("dry-run-btc-240m-momentum-min75-observer", { status: "waiting restart" }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violationCount: number;
      processHealth: {
        waitingRestartCount: number;
        expectedLoopingObserverCount: number;
        expectedLoopingObserversWithoutAutorestart: string[];
        unstableRestartProcessCount: number;
        maxRestartDelayMs: number;
      };
      processes: Array<{
        name: string;
        allowed: boolean;
        allowedReason: string | null;
        expectedLoopingObserver: boolean;
        restartDelayMs: number;
        unstableRestarts: number;
        lastStartedAt: string;
      }>;
    };
    assert.equal(report.aligned, true);
    assert.equal(report.violationCount, 0);
    assert.equal(report.processHealth.waitingRestartCount, 4);
    assert.equal(report.processHealth.expectedLoopingObserverCount, 3);
    assert.deepEqual(report.processHealth.expectedLoopingObserversWithoutAutorestart, []);
    assert.equal(report.processHealth.unstableRestartProcessCount, 0);
    assert.equal(report.processHealth.maxRestartDelayMs, 300000);
    assert.ok(report.processes.every((process) => process.allowed));
    assert.ok(report.processes.some((process) =>
      process.name === "dry-run-spot-perp-carry-pieverse-72h-observer" &&
      process.allowedReason === "spot_perp_carry_observation_only" &&
      process.expectedLoopingObserver &&
      process.restartDelayMs === 300000 &&
      process.unstableRestarts === 0 &&
      process.lastStartedAt === "2026-05-14T01:57:00.000Z",
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment allows carry observers during challenger recompare", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-recompare-observers-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus({
      processControlPlan: {
        liveExecution: {
          desiredState: "stopped",
          allowed: false,
          selectedLiveCandidate: null,
        },
        btcMomentum: {
          desiredState: "exit_reconciliation_only",
          allowNewEntry: false,
          allowedObserverProcesses: [],
        },
        managedPaperReentry: {
          desiredState: "do_not_start_reentry_manager",
          allowNewEntry: false,
        },
        carryResearch: {
          desiredState: "recompare_challenger_before_live_review",
          allowLiveStart: false,
          focusMarket: "KRW-PIEVERSE",
          recompareChallengerPlan: {
            market: "KRW-AZTEC",
            action: "review_challenger_as_research_focus_before_current_focus_live_preparation",
          },
        },
      },
    }));
    writeJson(pm2Path, [
      pm2Process("dry-run-live-goal-status-observer", {
        status: "waiting restart",
        args: ["run", "dry-run:refresh-live-goal-status-if-due"],
      }),
      pm2Process("dry-run-spot-perp-carry-aztec-live-readiness-observer", {
        status: "waiting restart",
      }),
      pm2Process("dry-run-spot-perp-carry-opportunity-72h-observer", {
        status: "waiting restart",
        args: [
          "run",
          "dry-run:observe-spot-perp-carry-opportunity-72h",
          ...opportunityObserverMarketsFromPackageScript(),
          "var/reports/spot-perp-carry-opportunity-72h-latest.json",
        ],
      }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: unknown[];
      processes: Array<{ name: string; allowedReason: string | null }>;
    };
    assert.equal(report.aligned, true);
    assert.deepEqual(report.violations, []);
    assert.ok(report.processes.some((process) =>
      process.name === "dry-run-spot-perp-carry-aztec-live-readiness-observer" &&
      process.allowedReason === "spot_perp_carry_observation_only",
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks stale completion audit schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-audit-schema-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus({
      completionAudit: {
        achieved: false,
        criteria: liveGoalCompletionCriteria({
          profitability_evidence_satisfied: false,
        }),
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        missingRequirements: ["liveStartupBlocked"],
      },
    }));
    writeJson(pm2Path, []);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{
        processName: string;
        reason: string;
        detail?: { field?: string };
      }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-goal-status" &&
      violation.reason === "liveGoalCompletionAuditMalformed" &&
      violation.detail?.field === "missingRequirementCount",
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks stale completion audit failed criteria labels", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-audit-labels-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus({
      completionAudit: {
        achieved: false,
        criteria: liveGoalCompletionCriteria({
          profitability_evidence_satisfied: false,
        }),
        failedCompletionCriteria: [
          "The selected path has positive realized or live-ready profitability evidence.",
        ],
        missingRequirements: ["liveStartupBlocked"],
        missingRequirementCount: 1,
      },
    }));
    writeJson(pm2Path, []);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{
        processName: string;
        reason: string;
        detail?: {
          field?: string;
          expectedFailedCompletionCriteria?: string[];
        };
      }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-goal-status" &&
      violation.reason === "liveGoalCompletionAuditMalformed" &&
      violation.detail?.field === "failedCompletionCriteria" &&
      violation.detail.expectedFailedCompletionCriteria?.includes(
        "profitability_evidence_satisfied",
      ),
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks duplicated failed criteria that omit a failed id", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-audit-duplicate-failed-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus({
      completionAudit: {
        achieved: false,
        criteria: liveGoalCompletionCriteria({
          profitability_evidence_satisfied: false,
          no_current_focus_recompare_caution: false,
        }),
        failedCompletionCriteria: [
          "profitability_evidence_satisfied",
          "profitability_evidence_satisfied",
        ],
        missingRequirements: ["liveStartupBlocked"],
        missingRequirementCount: 1,
      },
    }));
    writeJson(pm2Path, []);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{
        processName: string;
        reason: string;
        detail?: {
          field?: string;
          expectedFailedCompletionCriteria?: string[];
        };
      }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-goal-status" &&
      violation.reason === "liveGoalCompletionAuditMalformed" &&
      violation.detail?.field === "failedCompletionCriteria" &&
      violation.detail.expectedFailedCompletionCriteria?.includes(
        "no_current_focus_recompare_caution",
      ),
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks completion audit missing required criteria ids", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-audit-required-ids-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus({
      completionAudit: {
        achieved: false,
        criteria: [
          {
            id: "profitability_evidence_satisfied",
            passed: false,
          },
        ],
        failedCompletionCriteria: ["profitability_evidence_satisfied"],
        missingRequirements: ["liveStartupBlocked"],
        missingRequirementCount: 1,
      },
    }));
    writeJson(pm2Path, []);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{
        processName: string;
        reason: string;
        detail?: { field?: string; missingRequiredCriterionIds?: string[] };
      }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-goal-status" &&
      violation.reason === "liveGoalCompletionAuditMalformed" &&
      violation.detail?.field === "criteria.requiredIds" &&
      violation.detail.missingRequiredCriterionIds?.includes("candidate_selected_from_current_evidence"),
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks stale opportunity observer market arguments", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-args-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-spot-perp-carry-opportunity-72h-observer", {
        status: "waiting restart",
        args: [
          "--markets",
          "KRW-PIEVERSE:PIEVERSEUSDT,KRW-PARTI:PARTIUSDT,KRW-EDU:EDUUSDT",
          "--output",
          "var/reports/spot-perp-carry-opportunity-72h-latest.json",
        ],
      }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{
        processName: string;
        reason: string;
        detail?: { missingSubstrings?: string[] };
      }>;
      processes: Array<{
        name: string;
        argumentAudit: { missingSubstrings: string[] } | null;
      }>;
    };
    assert.equal(report.aligned, false);
    const staleArgs = [
      "KRW-PIEVERSE:PIEVERSEUSDT",
      "KRW-PARTI:PARTIUSDT",
      "KRW-EDU:EDUUSDT",
    ];
    const expectedMissingSubstrings = opportunityObserverMarketsFromPackageScript()
      .filter((market) => !staleArgs.includes(market));
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dry-run-spot-perp-carry-opportunity-72h-observer" &&
	      violation.reason === "processArgumentsMissingRequiredValues" &&
	      violation.detail?.missingSubstrings?.includes("KRW-DEEP:DEEPUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-KITE:KITEUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-METIS:METISUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-MOVE:MOVEUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-BSV:BSVUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-BABY:BABYUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-EDEN:EDENUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-SXT:SXTUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-LIT:LITUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-MON:MONUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-MOCA:MOCAUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-MERL:MERLUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-ILV:ILVUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-FRAX:FRAXUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-PROMPT:PROMPTUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-SONIC:SONICUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-VVV:VVVUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-API3:API3USDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-POLYX:POLYXUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-ETHFI:ETHFIUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-TOSHI:TOSHIUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-STABLE:STABLEUSDT") &&
	      violation.detail?.missingSubstrings?.includes("KRW-HEMI:HEMIUSDT") &&
		      violation.detail?.missingSubstrings?.includes("KRW-AKT:AKTUSDT") &&
		      violation.detail?.missingSubstrings?.includes("KRW-ACX:ACXUSDT") &&
		      violation.detail?.missingSubstrings?.includes("KRW-SCR:SCRUSDT") &&
		      violation.detail?.missingSubstrings?.includes("KRW-RPL:RPLUSDT"),
		    ));
    const actualMissingSubstrings = report.processes.find((process) =>
      process.name === "dry-run-spot-perp-carry-opportunity-72h-observer"
    )?.argumentAudit?.missingSubstrings;
    assert.deepEqual(
      actualMissingSubstrings === undefined ? undefined : [...actualMissingSubstrings].sort(),
      [...expectedMissingSubstrings].sort(),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks stale live goal observer refresh command", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-live-goal-args-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-live-goal-status-observer", {
        status: "waiting restart",
        args: ["run", "dry-run:refresh-live-goal-status"],
      }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{
        processName: string;
        reason: string;
        detail?: { missingSubstrings?: string[] };
      }>;
      processes: Array<{
        name: string;
        argumentAudit: { missingSubstrings: string[] } | null;
      }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dry-run-live-goal-status-observer" &&
      violation.reason === "processArgumentsMissingRequiredValues" &&
      violation.detail?.missingSubstrings?.includes("dry-run:refresh-live-goal-status-if-due"),
    ));
    assert.deepEqual(
      report.processes.find((process) => process.name === "dry-run-live-goal-status-observer")
        ?.argumentAudit?.missingSubstrings,
      ["dry-run:refresh-live-goal-status-if-due"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks stale saved live goal observer dump", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-dump-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    const pm2DumpPath = join(directory, "dump.pm2");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-live-goal-status-observer", {
        status: "waiting restart",
        args: ["run", "dry-run:refresh-live-goal-status-if-due"],
        restartDelay: 600000,
      }),
    ]);
    writeJson(pm2DumpPath, [
      {
        name: "dry-run-live-goal-status-observer",
        args: ["run", "dry-run:refresh-live-goal-status"],
        autorestart: true,
        restart_delay: 3600000,
        env: {
          TRADING_MODE: "paper",
          ENABLE_LIVE_EXECUTION: "false",
        },
      },
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--pm2-dump",
        pm2DumpPath,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      savedProcessControl: {
        aligned: boolean;
        missingSubstrings: string[];
        restartDelayMs: number;
      };
      violations: Array<{
        processName: string;
        reason: string;
        detail?: { missingSubstrings?: string[]; restartDelayMs?: number };
      }>;
    };
    assert.equal(report.aligned, false);
    assert.equal(report.savedProcessControl.aligned, false);
    assert.deepEqual(report.savedProcessControl.missingSubstrings, [
      "dry-run:refresh-live-goal-status-if-due",
    ]);
    assert.equal(report.savedProcessControl.restartDelayMs, 3600000);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dump:dry-run-live-goal-status-observer" &&
      violation.reason === "savedLiveGoalObserverArgumentsMissingRequiredValues" &&
      violation.detail?.missingSubstrings?.includes("dry-run:refresh-live-goal-status-if-due"),
    ));
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dump:dry-run-live-goal-status-observer" &&
      violation.reason === "savedLiveGoalObserverRestartDelayMismatch" &&
      violation.detail?.restartDelayMs === 3600000,
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks unsaved looping observers", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-unsaved-observer-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    const pm2DumpPath = join(directory, "dump.pm2");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-live-goal-status-observer", {
        status: "waiting restart",
        args: ["run", "dry-run:refresh-live-goal-status-if-due"],
        restartDelay: 600000,
      }),
      pm2Process("dry-run-spot-perp-carry-elsa-live-readiness-observer", {
        status: "waiting restart",
        args: ["run", "dry-run:refresh-spot-perp-carry-elsa-live-readiness"],
      }),
    ]);
    writeJson(pm2DumpPath, [
      {
        name: "dry-run-live-goal-status-observer",
        args: ["run", "dry-run:refresh-live-goal-status-if-due"],
        autorestart: true,
        restart_delay: 600000,
        env: {
          TRADING_MODE: "paper",
          ENABLE_LIVE_EXECUTION: "false",
        },
      },
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--pm2-dump",
        pm2DumpPath,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      savedLoopingObserverControl: {
        aligned: boolean;
        missingObserverNames: string[];
      };
      violations: Array<{ processName: string; reason: string }>;
    };
    assert.equal(report.aligned, false);
    assert.equal(report.savedLoopingObserverControl.aligned, false);
    assert.deepEqual(report.savedLoopingObserverControl.missingObserverNames, [
      "dry-run-spot-perp-carry-elsa-live-readiness-observer",
    ]);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dump:dry-run-spot-perp-carry-elsa-live-readiness-observer" &&
      violation.reason === "expectedLoopingObserverMissingFromPm2Dump",
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks stale saved opportunity observer arguments", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-stale-saved-opportunity-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    const pm2DumpPath = join(directory, "dump.pm2");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-live-goal-status-observer", {
        status: "waiting restart",
        args: ["run", "dry-run:refresh-live-goal-status-if-due"],
        restartDelay: 600000,
      }),
      pm2Process("dry-run-spot-perp-carry-opportunity-72h-observer", {
        status: "waiting restart",
        args: [
          "--markets",
          opportunityObserverMarketsFromPackageScript().join(","),
          "--output",
          "var/reports/spot-perp-carry-opportunity-72h-latest.json",
        ],
        restartDelay: 600000,
      }),
    ]);
    writeJson(pm2DumpPath, [
      {
        name: "dry-run-live-goal-status-observer",
        args: ["run", "dry-run:refresh-live-goal-status-if-due"],
        autorestart: true,
        restart_delay: 600000,
        env: {
          TRADING_MODE: "paper",
          ENABLE_LIVE_EXECUTION: "false",
        },
      },
      {
        name: "dry-run-spot-perp-carry-opportunity-72h-observer",
        args: [
          "--markets",
          "KRW-PIEVERSE:PIEVERSEUSDT,KRW-AZTEC:AZTECUSDT",
          "--output",
          "var/reports/spot-perp-carry-opportunity-72h-latest.json",
        ],
        autorestart: true,
        restart_delay: 600000,
        env: {
          TRADING_MODE: "paper",
          ENABLE_LIVE_EXECUTION: "false",
        },
      },
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--pm2-dump",
        pm2DumpPath,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      savedLoopingObserverControl: {
        aligned: boolean;
        observers: Array<{
          name: string;
          missingSubstrings: string[];
        }>;
      };
      violations: Array<{
        processName: string;
        reason: string;
        detail?: { missingSubstrings?: string[] };
      }>;
    };
    assert.equal(report.aligned, false);
    assert.equal(report.savedLoopingObserverControl.aligned, false);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dump:dry-run-spot-perp-carry-opportunity-72h-observer" &&
      violation.reason === "savedExpectedLoopingObserverArgumentsMissingRequiredValues" &&
      violation.detail?.missingSubstrings?.includes("KRW-ELSA:ELSAUSDT"),
    ));
    assert.ok(report.savedLoopingObserverControl.observers.some((observer) =>
      observer.name === "dry-run-spot-perp-carry-opportunity-72h-observer" &&
      observer.missingSubstrings.includes("KRW-ELSA:ELSAUSDT"),
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks unstable looping observers", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-unstable-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-spot-perp-carry-opportunity-72h-observer", {
        status: "waiting restart",
        unstableRestarts: 1,
        restartCount: 3,
        args: [
          "--markets",
          opportunityObserverMarketsFromPackageScript().join(","),
          "--output",
          "var/reports/spot-perp-carry-opportunity-72h-latest.json",
        ],
      }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      processHealth: { unstableRestartProcessCount: number };
      violations: Array<{
        processName: string;
        reason: string;
        detail?: { unstableRestarts?: number; restartCount?: number };
      }>;
    };
    assert.equal(report.aligned, false);
    assert.equal(report.processHealth.unstableRestartProcessCount, 1);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dry-run-spot-perp-carry-opportunity-72h-observer" &&
      violation.reason === "expectedLoopingObserverHasUnstableRestarts" &&
      violation.detail?.unstableRestarts === 1 &&
      violation.detail?.restartCount === 3,
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks stale reentry and live processes while goal is blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-blocked-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    const outputPath = join(directory, "alignment.json");
    writeJson(liveGoalPath, liveGoalStatus());
    writeJson(pm2Path, [
      pm2Process("dry-run-spot-perp-carry-pieverse-72h-observer", { status: "waiting restart" }),
      pm2Process("dry-run-stable-60m-reversal-refresh-observer", { status: "waiting restart" }),
      pm2Process("dry-run-btc-240m-momentum-lb168-hold72-range-p70-managed-return-observer", {
        status: "waiting restart",
      }),
      pm2Process("live-spot-perp-carry-pieverse", { live: "true", mode: "live" }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--output",
        outputPath,
        "--require-aligned",
        "--quiet",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    const report = JSON.parse(readFileSync(outputPath, "utf8")) as {
      aligned: boolean;
      violationCount: number;
      violations: Array<{ processName: string; reason: string }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.violationCount >= 4);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dry-run-stable-60m-reversal-refresh-observer" &&
      violation.reason === "processNotAllowedByLiveGoalProcessControlPlan",
    ));
    assert.ok(report.violations.some((violation) =>
      violation.processName === "dry-run-btc-240m-momentum-lb168-hold72-range-p70-managed-return-observer" &&
      violation.reason === "processNotAllowedByLiveGoalProcessControlPlan",
    ));
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-spot-perp-carry-pieverse" &&
      violation.reason === "liveProcessPresentWhileLiveStartupBlocked",
    ));
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-spot-perp-carry-pieverse" &&
      violation.reason === "liveExecutionFlagTrueWhileLiveStartupBlocked",
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment allows only the selected live PM2 app after goal approval", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-selected-live-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus({
      liveStartupAllowed: true,
      selectedLiveCandidate: { market: "KRW-PIEVERSE" },
      completionAudit: {
        achieved: true,
        criteria: liveGoalCompletionCriteria(),
        failedCompletionCriteria: [],
        missingRequirements: [],
        missingRequirementCount: 0,
      },
      liveStartupPlan: {
        pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      },
      processControlPlan: {
        liveExecution: {
          desiredState: "running",
          allowed: true,
          selectedLiveCandidate: { market: "KRW-PIEVERSE" },
        },
        carryResearch: {
          desiredState: "continue_observation_only",
        },
      },
    }));
    writeJson(pm2Path, [
      pm2Process("live-spot-perp-carry-pieverse", { live: "true", mode: "live" }),
      pm2Process("live-spot-perp-carry", { live: "true", mode: "live" }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{ processName: string; reason: string }>;
      processes: Array<{ name: string; allowed: boolean; allowedReason: string | null }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.processes.some((process) =>
      process.name === "live-spot-perp-carry-pieverse" &&
      process.allowed &&
      process.allowedReason === "live_startup_allowed_by_goal_gate",
    ));
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-spot-perp-carry" &&
      violation.reason === "processNotAllowedByLiveGoalProcessControlPlan",
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live goal process alignment blocks live PM2 app when completion audit is incomplete", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-live-goal-process-audit-incomplete-"));
  try {
    const liveGoalPath = join(directory, "live-goal.json");
    const pm2Path = join(directory, "pm2.json");
    writeJson(liveGoalPath, liveGoalStatus({
      liveStartupAllowed: true,
      selectedLiveCandidate: { market: "KRW-PIEVERSE" },
      completionAudit: {
        achieved: true,
        criteria: liveGoalCompletionCriteria(),
        failedCompletionCriteria: [],
        missingRequirements: [],
        missingRequirementCount: 1,
      },
      liveStartupPlan: {
        pm2StartCommand: "npm run pm2:start:live-spot-perp-carry-pieverse",
      },
      processControlPlan: {
        liveExecution: {
          desiredState: "running",
          allowed: true,
          selectedLiveCandidate: { market: "KRW-PIEVERSE" },
        },
      },
    }));
    writeJson(pm2Path, [
      pm2Process("live-spot-perp-carry-pieverse", { live: "true", mode: "live" }),
    ]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-live-goal-process-alignment.js",
        "--live-goal-status",
        liveGoalPath,
        "--pm2-jlist",
        pm2Path,
        "--require-aligned",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout) as {
      aligned: boolean;
      violations: Array<{ processName: string; reason: string }>;
      processes: Array<{ name: string; allowed: boolean; allowedReason: string | null }>;
    };
    assert.equal(report.aligned, false);
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-goal-status" &&
      violation.reason === "liveStartupAllowedWithoutCompletedAudit",
    ));
    assert.ok(report.violations.some((violation) =>
      violation.processName === "live-spot-perp-carry-pieverse" &&
      violation.reason === "liveProcessPresentWhileLiveStartupBlocked",
    ));
    assert.ok(report.processes.some((process) =>
      process.name === "live-spot-perp-carry-pieverse" &&
      !process.allowed,
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
