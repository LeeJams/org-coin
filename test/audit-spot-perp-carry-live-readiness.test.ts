import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(path: string, value: string): void {
  writeFileSync(path, value, "utf8");
}

function carryReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    status: "promotion_candidate",
    promotionEligible: true,
    blockers: [],
    observationSpanMinutes: 4_320,
    assumptions: {
      minObservations: 432,
      minCompletedFundingEvents: 6,
      minObservationSpanMinutes: 4_320,
      minNetCarryBps: 10,
      minPositiveCarryRate: 0.67,
      minDepthCoverageRate: 0.95,
      accountFeesConfirmed: false,
      inventoryReady: false,
      hedgeVenueReady: false,
    },
    summary: {
      count: 432,
      completedFundingCount: 6,
      executionEligibleCount: 420,
      executionEligiblePositiveRate: 0.82,
      executionEligibleMedianNetCarryBps: 42.5,
      executionEligibleTotalEstimatedNetPnlKrw: 125_000,
      depthCoverageRate: 0.99,
    },
    fundingWindowSummary: {
      completedFundingWindowCount: 6,
      positiveWindowRate: 0.82,
      medianWindowNetCarryBps: 42.5,
    },
    perMarketSummary: [
      {
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        count: 216,
        completedFundingCount: 6,
        executionEligibleCount: 210,
        executionEligiblePositiveRate: 0.86,
        executionEligibleMedianNetCarryBps: 55.1,
        executionEligibleTotalEstimatedNetPnlKrw: 78_000,
        depthCoverageRate: 0.99,
        fundingWindowSummary: {
          completedFundingWindowCount: 6,
          positiveWindowRate: 0.86,
          medianWindowNetCarryBps: 55.1,
        },
        watchDecision: {
          status: "metric_candidate",
          reasons: [],
          requiredBeforeMetricCandidate: [],
        },
      },
      {
        market: "KRW-EDU",
        symbol: "EDUUSDT",
        count: 216,
        completedFundingCount: 6,
        executionEligibleCount: 210,
        executionEligiblePositiveRate: 0.78,
        executionEligibleMedianNetCarryBps: 31.4,
        executionEligibleTotalEstimatedNetPnlKrw: 47_000,
        depthCoverageRate: 0.99,
        fundingWindowSummary: {
          completedFundingWindowCount: 6,
          positiveWindowRate: 0.78,
          medianWindowNetCarryBps: 31.4,
        },
        watchDecision: {
          status: "metric_candidate",
          reasons: [],
          requiredBeforeMetricCandidate: [],
        },
      },
    ],
    ...overrides,
  };
}

function feeStressReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    perMarketSummary: [
      {
        market: "KRW-PIEVERSE",
        symbol: "PIEVERSEUSDT",
        depthCoverageRate: 0.99,
        fundingWindowSummary: {
          completedFundingWindowCount: 6,
          positiveWindowRate: 0.82,
          medianWindowNetCarryBps: 42.5,
        },
      },
      {
        market: "KRW-EDU",
        symbol: "EDUUSDT",
        depthCoverageRate: 0.99,
        fundingWindowSummary: {
          completedFundingWindowCount: 6,
          positiveWindowRate: 0.78,
          medianWindowNetCarryBps: 31.4,
        },
      },
    ],
    ...overrides,
  };
}

test("spot-perp carry live readiness blocks current evidence without operational proof", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-blocked-"));
  try {
    const carryPath = join(directory, "carry.json");
    const feeStressPath = join(directory, "fee-stress.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport({
      promotionEligible: false,
      status: "blocked",
      blockers: ["insufficientCompletedFundingEvents"],
      summary: {
        count: 10,
        completedFundingCount: 1,
        executionEligibleCount: 10,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 77,
        executionEligibleTotalEstimatedNetPnlKrw: 20_000,
        depthCoverageRate: 1,
      },
      fundingWindowSummary: {
        completedFundingWindowCount: 1,
        positiveWindowRate: 1,
        medianWindowNetCarryBps: 77,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          completedFundingCount: 1,
          executionEligiblePositiveRate: 1,
          executionEligibleMedianNetCarryBps: 100,
          depthCoverageRate: 1,
          fundingWindowSummary: {
            completedFundingWindowCount: 1,
            positiveWindowRate: 1,
            medianWindowNetCarryBps: 100,
          },
          watchDecision: {
            status: "collect_more_evidence",
            reasons: ["insufficientCompletedFundingEventsForKillDecision"],
            requiredBeforeMetricCandidate: ["moreCompletedFundingEvents"],
          },
        },
      ],
    }));
    writeJson(feeStressPath, feeStressReport({
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          depthCoverageRate: 1,
          fundingWindowSummary: {
            completedFundingWindowCount: 1,
            positiveWindowRate: 1,
            medianWindowNetCarryBps: 77,
          },
        },
      ],
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--fee-stress-report",
        feeStressPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      reasons: string[];
      blockers: string[];
      nextOperationalSteps: Array<{
        action: string;
        gates?: unknown;
        markets?: Array<{ market?: string; requiredBeforeMetricCandidate?: string[] }>;
      }>;
      readinessGap: {
        observations: { current: number; required: number; remaining: number; passed: boolean };
        completedFundingEvents: { current: number; required: number; remaining: number; passed: boolean };
      };
      readinessTimeline: {
        fundingEventIntervalMinutes: number;
        estimatedObservationCadenceMinutes: number | null;
        estimatedRemainingMinutesByGate: {
          observations: number | null;
          observationSpanMinutes: number;
          completedFundingEvents: number;
        };
        bottleneck: string;
        estimatedEarliestReviewAt: string | null;
      };
      checks: { liveExecutionPathReady: boolean; perMarketMetricCandidates: boolean };
    };
    assert.equal(report.liveReady, false);
    assert.deepEqual(report.readinessGap.observations, {
      current: 10,
      required: 432,
      remaining: 422,
      passed: false,
    });
    assert.deepEqual(report.readinessGap.completedFundingEvents, {
      current: 1,
      required: 6,
      remaining: 5,
      passed: false,
    });
    assert.equal(report.readinessTimeline.fundingEventIntervalMinutes, 240);
    assert.equal(report.readinessTimeline.estimatedObservationCadenceMinutes, 480);
    assert.equal(report.readinessTimeline.estimatedRemainingMinutesByGate.observations, 202_560);
    assert.equal(report.readinessTimeline.estimatedRemainingMinutesByGate.completedFundingEvents, 1_200);
    assert.equal(report.readinessTimeline.bottleneck, "observations");
    assert.ok(report.readinessTimeline.estimatedEarliestReviewAt);
    assert.equal(report.checks.liveExecutionPathReady, true);
    assert.equal(report.checks.perMarketMetricCandidates, false);
    assert.ok(report.reasons.includes("carryReportNotPromotionEligible"));
    assert.ok(report.reasons.includes("operationalProofMissing"));
    assert.ok(report.reasons.includes("market:KRW-PIEVERSE:notMetricCandidate"));
    assert.deepEqual(report.blockers, report.reasons);
    assert.ok(report.nextOperationalSteps.some((step) => step.action === "continue_observation_until_evidence_gates_pass"));
    assert.ok(report.nextOperationalSteps.some((step) => step.action === "refresh_operational_proof_with_credentials"));
    assert.ok(report.nextOperationalSteps.some((step) =>
      step.action === "keep_markets_observation_only_until_metric_candidate" &&
      step.markets?.some((market) => market.market === "KRW-PIEVERSE" &&
        market.requiredBeforeMetricCandidate?.includes("moreCompletedFundingEvents")),
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live readiness quiet output omits bulky proof details", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-quiet-"));
  try {
    const carryPath = join(directory, "carry.json");
    const feeStressPath = join(directory, "fee-stress.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport({
      promotionEligible: false,
      status: "blocked",
      blockers: ["insufficientCompletedFundingEvents"],
      summary: {
        count: 10,
        completedFundingCount: 1,
        executionEligibleCount: 10,
        executionEligiblePositiveRate: 1,
        executionEligibleMedianNetCarryBps: 77,
        executionEligibleTotalEstimatedNetPnlKrw: 20_000,
        depthCoverageRate: 1,
      },
      fundingWindowSummary: {
        completedFundingWindowCount: 1,
        positiveWindowRate: 1,
        medianWindowNetCarryBps: 77,
      },
    }));
    writeJson(feeStressPath, feeStressReport());
    writeJson(proofPath, {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: false,
      inventoryReady: false,
      hedgeVenueReady: false,
      requirements: {
        totalSpotQuoteRequiredKrw: 501_250,
        totalFuturesMarginRequiredUsdt: 339.037614,
      },
      deficits: {
        bithumbQuoteDeficitKrw: 386_030,
        binanceUsdtDeficit: 339.037614,
      },
      details: {
        bithumbBidFeeBpsByMarket: { "KRW-PIEVERSE": 25 },
        binanceFuturesTakerFeeBpsBySymbol: { PIEVERSEUSDT: null },
        feeBudget: {
          carryReportPath: carryPath,
          feeBudgetReportPaths: [feeStressPath],
          maxBithumbFeeBps: 25,
          maxBinanceFuturesTakerFeeBps: 5,
        },
      },
      reasons: [
        "credentialsMissing",
        "symbol:PIEVERSEUSDT:binanceFuturesFeeUnavailable",
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--fee-stress-report",
        feeStressPath,
        "--operational-proof",
        proofPath,
        "--quiet",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      blockers: string[];
      nextOperationalSteps: unknown[];
      readinessTimeline: { fundingEventIntervalMinutes: number };
      evidence: {
        summary: unknown;
        operationalProof?: {
          feeBudget: {
            carryReportPath: string;
            feeBudgetReportPaths: string[];
            maxBithumbFeeBps: number;
            maxBinanceFuturesTakerFeeBps: number;
          };
          details?: unknown;
          reasons: string[];
        };
      };
    };
    assert.equal(report.liveReady, false);
    assert.ok(report.blockers.includes("operationalProof:credentialsMissing"));
    assert.ok(report.nextOperationalSteps.length > 0);
    assert.equal(report.readinessTimeline.fundingEventIntervalMinutes, 240);
    assert.ok(report.evidence.summary);
    assert.ok(report.evidence.operationalProof);
    assert.equal(report.evidence.operationalProof.details, undefined);
    assert.deepEqual(report.evidence.operationalProof.reasons, [
      "credentialsMissing",
      "symbol:PIEVERSEUSDT:binanceFuturesFeeUnavailable",
    ]);
    assert.equal(report.evidence.operationalProof.feeBudget.carryReportPath, carryPath);
    assert.deepEqual(report.evidence.operationalProof.feeBudget.feeBudgetReportPaths, [
      feeStressPath,
    ]);
    assert.equal(report.evidence.operationalProof.feeBudget.maxBithumbFeeBps, 25);
    assert.equal(report.evidence.operationalProof.feeBudget.maxBinanceFuturesTakerFeeBps, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live readiness blocks clean evidence without a gated live runner", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-ready-"));
  try {
    const carryPath = join(directory, "carry.json");
    const feeStressPath = join(directory, "fee-stress.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport());
    writeJson(feeStressPath, feeStressReport());
    writeJson(proofPath, {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
      approvedMarkets: ["KRW-PIEVERSE", "KRW-EDU"],
      reasons: [],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--operational-proof",
        proofPath,
        "--fee-stress-report",
        feeStressPath,
        "--codebase-root",
        directory,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      status: string;
      reasons: string[];
      blockers: string[];
      nextOperationalSteps: Array<{ action: string }>;
      evidence: {
        operationalProofGeneratedAt: string | null;
        operationalProof: {
          generatedAt: string | null;
          reasons: string[];
        };
      };
      checks: {
        accountFeesConfirmed: boolean;
        inventoryReady: boolean;
        hedgeVenueReady: boolean;
        liveExecutionPathReady: boolean;
        perMarketMetricCandidates: boolean;
      };
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.liveReady, false);
    assert.deepEqual(report.reasons, ["liveExecutionPathMissing"]);
    assert.deepEqual(report.blockers, ["liveExecutionPathMissing"]);
    assert.ok(report.nextOperationalSteps.some((step) => step.action === "restore_gated_live_execution_path"));
    assert.equal(report.checks.accountFeesConfirmed, true);
    assert.equal(report.checks.inventoryReady, true);
    assert.equal(report.checks.hedgeVenueReady, true);
    assert.equal(report.checks.liveExecutionPathReady, false);
    assert.equal(report.checks.perMarketMetricCandidates, true);
    assert.equal(report.evidence.operationalProof.generatedAt, report.evidence.operationalProofGeneratedAt);
    assert.deepEqual(report.evidence.operationalProof.reasons, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live readiness blocks when PIEVERSE-specific live path is missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-pieverse-path-missing-"));
  try {
    const carryPath = join(directory, "carry.json");
    const feeStressPath = join(directory, "fee-stress.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport());
    writeJson(feeStressPath, feeStressReport());
    writeJson(proofPath, {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
      approvedMarkets: ["KRW-PIEVERSE", "KRW-EDU"],
      reasons: [],
    });

    mkdirSync(join(directory, "src", "cli"), { recursive: true });
    mkdirSync(join(directory, "src", "live"), { recursive: true });
    writeJson(join(directory, "package.json"), {
      scripts: {
        "pm2:start:live-spot-perp-carry":
          "npm run prepare:runtime-dirs && pm2 start ecosystem.config.cjs --only live-spot-perp-carry",
      },
    });
    writeText(
      join(directory, "ecosystem.config.cjs"),
      "module.exports = { apps: [{ name: 'live-spot-perp-carry' }] };\n",
    );
    writeText(
      join(directory, "src", "cli", "run-spot-perp-carry-live.ts"),
      [
        "spot-perp carry",
        "createBithumbPrivateClient",
        "createBinanceUsdMFuturesPrivateClient",
        "--submit-once",
        "--require-live-ready",
        "reconcile",
        "realizedNetPnlKrw",
      ].join("\n"),
    );
    writeText(join(directory, "src", "live", "bithumb.ts"), "createBithumbPrivateClient\n");
    writeText(join(directory, "src", "live", "binance.ts"), "createBinanceUsdMFuturesPrivateClient\n");

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--operational-proof",
        proofPath,
        "--fee-stress-report",
        feeStressPath,
        "--codebase-root",
        directory,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      reasons: string[];
      blockers: string[];
      checks: { liveExecutionPathReady: boolean };
      nextOperationalSteps: Array<{ action: string }>;
    };
    assert.equal(report.liveReady, false);
    assert.deepEqual(report.reasons, ["liveExecutionPathMissing"]);
    assert.deepEqual(report.blockers, ["liveExecutionPathMissing"]);
    assert.equal(report.checks.liveExecutionPathReady, false);
    assert.ok(report.nextOperationalSteps.some((step) => step.action === "restore_gated_live_execution_path"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live readiness requires fee-stressed carry evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-fee-stress-"));
  try {
    const carryPath = join(directory, "carry.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport());
    writeJson(proofPath, {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
      approvedMarkets: ["KRW-PIEVERSE", "KRW-EDU"],
      reasons: [],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--operational-proof",
        proofPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      reasons: string[];
      checks: {
        feeStressReportsPresent: boolean;
        perMarketFeeStressReady: boolean;
      };
    };
    assert.equal(report.liveReady, false);
    assert.equal(report.checks.feeStressReportsPresent, false);
    assert.equal(report.checks.perMarketFeeStressReady, false);
    assert.ok(report.reasons.includes("feeStressReportMissing"));
    assert.ok(report.reasons.includes("market:KRW-PIEVERSE:feeStressMissing"));
    assert.ok(report.reasons.includes("market:KRW-EDU:feeStressMissing"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live readiness requires funding-window profitability evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-window-"));
  try {
    const carryPath = join(directory, "carry.json");
    const feeStressPath = join(directory, "fee-stress.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport({
      fundingWindowSummary: {
        completedFundingWindowCount: 6,
        positiveWindowRate: 0.5,
        medianWindowNetCarryBps: 8,
      },
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 216,
          completedFundingCount: 6,
          executionEligibleCount: 210,
          executionEligiblePositiveRate: 0.9,
          executionEligibleMedianNetCarryBps: 55.1,
          executionEligibleTotalEstimatedNetPnlKrw: 78_000,
          depthCoverageRate: 0.99,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            positiveWindowRate: 0.5,
            medianWindowNetCarryBps: 8,
          },
          watchDecision: {
            status: "metric_candidate",
            reasons: [],
            requiredBeforeMetricCandidate: [],
          },
        },
      ],
    }));
    writeJson(feeStressPath, feeStressReport({
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          depthCoverageRate: 0.99,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            positiveWindowRate: 0.5,
            medianWindowNetCarryBps: 8,
          },
        },
      ],
    }));
    writeJson(proofPath, {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
      approvedMarkets: ["KRW-PIEVERSE"],
      reasons: [],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--operational-proof",
        proofPath,
        "--fee-stress-report",
        feeStressPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      reasons: string[];
      checks: {
        fundingWindowSummaryPresent: boolean;
        positiveMedianNetCarry: boolean;
        positiveCarryRate: boolean;
      };
      evidence: {
        fundingWindowSummary: {
          medianWindowNetCarryBps: number;
          positiveWindowRate: number;
        };
      };
    };
    assert.equal(report.liveReady, false);
    assert.equal(report.checks.fundingWindowSummaryPresent, true);
    assert.equal(report.checks.positiveMedianNetCarry, false);
    assert.equal(report.checks.positiveCarryRate, false);
    assert.equal(report.evidence.fundingWindowSummary.medianWindowNetCarryBps, 8);
    assert.equal(report.evidence.fundingWindowSummary.positiveWindowRate, 0.5);
    assert.ok(report.reasons.includes("weakMedianNetCarry"));
    assert.ok(report.reasons.includes("lowPositiveCarryRate"));
    assert.ok(report.reasons.includes("market:KRW-PIEVERSE:weakMedianNetCarry"));
    assert.ok(report.reasons.includes("market:KRW-PIEVERSE:lowPositiveCarryRate"));
    assert.ok(report.reasons.includes("market:KRW-PIEVERSE:feeStressWeakMedianNetCarry"));
    assert.ok(report.reasons.includes("market:KRW-PIEVERSE:feeStressLowPositiveCarryRate"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live readiness blocks weak latest fee-stressed funding window", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-latest-window-"));
  try {
    const carryPath = join(directory, "carry.json");
    const feeStressPath = join(directory, "fee-stress.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport({
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          count: 432,
          completedFundingCount: 6,
          executionEligibleCount: 420,
          executionEligiblePositiveRate: 0.86,
          executionEligibleMedianNetCarryBps: 55.1,
          executionEligibleTotalEstimatedNetPnlKrw: 78_000,
          depthCoverageRate: 0.99,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            positiveWindowRate: 0.86,
            medianWindowNetCarryBps: 55.1,
          },
          watchDecision: {
            status: "metric_candidate",
            reasons: [],
            requiredBeforeMetricCandidate: [],
          },
        },
      ],
    }));
    writeJson(feeStressPath, feeStressReport({
      perMarketSummary: [
        {
          market: "KRW-PIEVERSE",
          symbol: "PIEVERSEUSDT",
          depthCoverageRate: 0.99,
          fundingWindowSummary: {
            completedFundingWindowCount: 6,
            positiveWindowRate: 0.86,
            medianWindowNetCarryBps: 42.5,
            windows: [
              {
                fundingSettledAt: "2026-05-14T00:00:00.000Z",
                medianNetCarryBps: 48,
              },
              {
                fundingSettledAt: "2026-05-14T04:00:00.000Z",
                medianNetCarryBps: 8,
              },
            ],
          },
        },
      ],
    }));
    writeJson(proofPath, {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
      approvedMarkets: ["KRW-PIEVERSE"],
      reasons: [],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--operational-proof",
        proofPath,
        "--fee-stress-report",
        feeStressPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      reasons: string[];
      checks: {
        perMarketFeeStressReady: boolean;
      };
    };
    assert.equal(report.liveReady, false);
    assert.equal(report.checks.perMarketFeeStressReady, false);
    assert.ok(report.reasons.includes("market:KRW-PIEVERSE:feeStressLatestWindowWeak"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry live readiness accepts clean evidence with the gated live runner", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-carry-live-readiness-clean-"));
  try {
    const carryPath = join(directory, "carry.json");
    const feeStressPath = join(directory, "fee-stress.json");
    const proofPath = join(directory, "proof.json");
    writeJson(carryPath, carryReport());
    writeJson(feeStressPath, feeStressReport());
    writeJson(proofPath, {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
      approvedMarkets: ["KRW-PIEVERSE", "KRW-EDU"],
      reasons: [],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-live-readiness.js",
        "--carry-report",
        carryPath,
        "--operational-proof",
        proofPath,
        "--fee-stress-report",
        feeStressPath,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout) as {
      liveReady: boolean;
      status: string;
      reasons: string[];
      blockers: string[];
      nextOperationalSteps: unknown[];
      evidence: {
        operationalProofGeneratedAt: string | null;
        operationalProof: {
          generatedAt: string | null;
          reasons: string[];
        };
      };
      checks: { liveExecutionPathReady: boolean };
    };
    assert.equal(report.status, "live_ready");
    assert.equal(report.liveReady, true);
    assert.deepEqual(report.reasons, []);
    assert.deepEqual(report.blockers, []);
    assert.deepEqual(report.nextOperationalSteps, []);
    assert.equal(report.evidence.operationalProof.generatedAt, report.evidence.operationalProofGeneratedAt);
    assert.deepEqual(report.evidence.operationalProof.reasons, []);
    assert.equal(report.checks.liveExecutionPathReady, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
