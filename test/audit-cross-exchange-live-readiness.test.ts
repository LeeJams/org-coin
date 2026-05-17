import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

async function startMarketServer(options: {
  bithumbBidPrice?: number;
  bithumbAskPrice?: number;
  binanceBidPrice?: number;
  binanceAskPrice?: number;
} = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/orderbook") {
      response.end(JSON.stringify([
        {
          orderbook_units: [
            {
              bid_price: options.bithumbBidPrice ?? 119_600_000,
              bid_size: 0.01,
              ask_price: options.bithumbAskPrice ?? 119_610_000,
              ask_size: 0.01,
            },
          ],
        },
      ]));
      return;
    }
    if (url.pathname === "/api/v3/depth") {
      response.end(JSON.stringify({
        bids: [[String(options.binanceBidPrice ?? 80_800), "0.01"]],
        asks: [[String(options.binanceAskPrice ?? 80_850), "0.01"]],
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function spawnNode(
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function writeLiveCodebase(root: string): void {
  mkdirSync(join(root, "src/cli"), { recursive: true });
  mkdirSync(join(root, "src/live"), { recursive: true });
  mkdirSync(join(root, "src/execution"), { recursive: true });
  writeJson(join(root, "package.json"), {
    scripts: {
      "pm2:start:live-cross-exchange-relative-value": "pm2 start ecosystem.config.cjs --only live-cross-exchange-relative-value",
    },
  });
  writeFileSync(
    join(root, "ecosystem.config.cjs"),
    [
      "const crossExchangeOrderSubmissionEnabled = process.env.ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION === 'true';",
      "module.exports = { apps: [{",
      "name: 'live-cross-exchange-relative-value',",
      "args: ['--readiness-report', 'ready.json', '--output', 'var/reports/cross-exchange-live-execution-latest.json', ...(crossExchangeOrderSubmissionEnabled ? ['--submit-once'] : [])],",
      "env: { ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION: process.env.ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION ?? 'false' },",
      "}] };",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(root, "src/live/bithumb.ts"),
    "export function createBithumbRelativeValueVenue() { return {}; }\n",
    "utf8",
  );
  writeFileSync(
    join(root, "src/live/binance.ts"),
    "export function createBinancePrivateClient() { return {}; }\nexport function createBinanceRelativeValueVenue() { return { limitPriceCurrency: 'USDT', quoteToKrw: 1 }; }\n",
    "utf8",
  );
  writeFileSync(
    join(root, "src/cli/run-cross-exchange-relative-value-live.ts"),
    [
      "import { createBithumbRelativeValueVenue } from '../live/bithumb.js';",
      "import { writeFile } from 'node:fs/promises';",
      "import { createBinanceRelativeValueVenue } from '../live/binance.js';",
      "import { buildHedgedRelativeValuePlan, submitHedgedRelativeValueOrder } from '../execution/cross-exchange-relative-value-live.js';",
      "const outputFlag = '--output';",
      "void outputFlag;",
      "void writeFile;",
      "void createBithumbRelativeValueVenue;",
      "void createBinanceRelativeValueVenue;",
      "void buildHedgedRelativeValuePlan;",
      "void submitHedgedRelativeValueOrder;",
      "const depthEndpoint = '/api/v3/depth';",
      "const orderbookUnits = 'orderbook_units';",
      "function executableVwapPrice() { return 1; }",
      "function candidateWithProofFees() { return {}; }",
      "const observedNetEdgeBps = 1;",
      "const realizedPnlKrw = null;",
      "const realizedNetPnlKrw = null;",
      "const realizedGrossPnlKrw = null;",
      "void depthEndpoint;",
      "void orderbookUnits;",
      "void executableVwapPrice;",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(root, "src/execution/cross-exchange-relative-value-live.ts"),
    [
      "function reconcileFilledOrders() { return { pairNotionalImbalanceBps: 0, realizedNetPnlKrw: 0, realizedFeeKrw: 0 }; }",
      "export function submitHedgedRelativeValueOrder() { return { limitPriceCurrency: 'USDT', quoteToKrw: 1, reconciliation: reconcileFilledOrders() }; }",
      "",
    ].join("\n"),
    "utf8",
  );
}

function readCrossExchangePm2Target(env: NodeJS.ProcessEnv = {}): {
  args: string[];
  env: Record<string, string>;
} {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      [
        "const config = require('./ecosystem.config.cjs');",
        "const app = config.apps.find((entry) => entry.name === 'live-cross-exchange-relative-value');",
        "console.log(JSON.stringify({ args: app.args, env: app.env }));",
      ].join(" "),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ENABLE_LIVE_EXECUTION: "",
        ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "",
        ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION: "",
        ...env,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as { args: string[]; env: Record<string, string> };
}

function relativeValueReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    status: "blocked",
    promotionEligible: false,
    blockers: ["feeScheduleUnconfirmed", "inventoryNotReady", "hedgeVenueNotReady"],
    observationCount: 101,
    observationSpanMinutes: 120,
    latestObservationAgeHours: 0.1,
    fxAgeHours: 1,
    assumptions: {
      notionalKrw: 50_000,
      usdKrwUpdatedAt: now,
      minNetEdgeBps: 20,
      minObservations: 100,
      minObservationSpanMinutes: 60,
      minEdgeObservationRate: 0.6,
      minDepthCoverageRate: 0.95,
      maxLatestAgeHours: 24,
      maxFxAgeHours: 24,
      maxSnapshotSkewMs: 2000,
      accountFeesConfirmed: false,
      inventoryReady: false,
      hedgeVenueReady: false,
    },
    summary: {
      count: 101,
      positiveCount: 101,
      positiveRate: 1,
      depthCoveredCount: 99,
      depthCoverageRate: 0.980198,
      medianNetEdgeBps: 42.739405,
      totalEstimatedNetPnlKrw: 21_644.429254,
    },
    topEdges: [
      {
        capturedAt: now,
        referenceVenue: "binance",
        direction: "sell_bithumb_buy_reference",
        snapshotSkewMs: 28,
        snapshotSkewSource: "receive",
      },
    ],
    observations: [{ capturedAt: now }],
    ...overrides,
  };
}

function freshProof(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    accountFeesConfirmed: true,
    hedgeVenueReady: true,
    requirements: {
      bithumbBaseRequiredKrw: 50_000,
      bithumbQuoteRequiredKrw: 0,
      referenceBaseRequiredKrw: 0,
      referenceQuoteRequiredKrw: 50_050,
    },
    inventory: {
      bithumbBaseInventoryKrw: 50_000,
      bithumbQuoteInventoryKrw: 0,
      referenceBaseInventoryKrw: 0,
      referenceQuoteInventoryKrw: 50_050,
    },
    deficits: {
      bithumbBaseDeficitKrw: 0,
      bithumbQuoteDeficitKrw: 0,
      referenceBaseDeficitKrw: 0,
      referenceQuoteDeficitKrw: 0,
    },
    reasons: [],
    ...overrides,
  };
}

function liveGoalAllowsCrossExchange(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    liveReady: true,
    liveStartupAllowed: true,
    selectedLiveCandidate: {
      type: "cross_exchange_relative_value",
      market: "KRW-BTC",
      referenceMarket: "BTCUSDT",
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

function readyCrossExchangeReport(): Record<string, unknown> {
  return {
    generatedAt: new Date().toISOString(),
    liveReady: true,
    blockers: [],
    checklist: {
      reportPresent: true,
      bestEdgeDirectionKnown: true,
      globalReferenceVenue: true,
      sufficientObservations: true,
      positiveEdgeRate: true,
      positiveMedianNetEdge: true,
      positiveEstimatedNetPnl: true,
      depthCoverageReady: true,
      latestObservationFresh: true,
      fxFresh: true,
      snapshotSkewControlled: true,
      executionPathReady: true,
      operationalProofPresent: true,
      operationalProofFresh: true,
      operationalProofClean: true,
      accountFeesConfirmed: true,
      inventoryReady: true,
      hedgeVenueReady: true,
    },
    operationalProofSummary: {
      generatedAt: new Date().toISOString(),
      accountFeesConfirmed: true,
      hedgeVenueReady: true,
      deficits: {
        bithumbBaseDeficitKrw: 0,
        bithumbQuoteDeficitKrw: 0,
        referenceBaseDeficitKrw: 0,
        referenceQuoteDeficitKrw: 0,
      },
      details: {
        bithumbFeeBps: 4,
        referenceFeeBps: 10,
      },
      reasons: [],
    },
    candidate: {
      notionalKrw: 50_000,
      market: "KRW-BTC",
      referenceMarket: "BTCUSDT",
      referenceQuoteToKrw: 1473.05,
      minNetEdgeBps: 20,
      bithumbFeeBps: 4,
      referenceFeeBps: 10,
      referenceVenue: "binance",
      direction: "sell_bithumb_buy_reference",
      medianNetEdgeBps: 42.7,
    },
  };
}

test("cross-exchange PM2 target keeps order submission explicitly opt-in", () => {
  const defaultTarget = readCrossExchangePm2Target({
    ENABLE_LIVE_EXECUTION: "true",
    ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "false",
    ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION: "false",
  });
  assert.deepEqual(defaultTarget.args, [
    "--readiness-report",
    "var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-usdtkrw-orderbook-latest.json",
    "--output",
    "var/reports/cross-exchange-live-execution-latest.json",
    "--live-goal-status",
    "var/reports/live-goal-status-20260513-current.json",
  ]);
  assert.equal(defaultTarget.env.ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION, "false");
  assert.equal(defaultTarget.env.ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION, "false");

  const submitTarget = readCrossExchangePm2Target({
    ENABLE_LIVE_EXECUTION: "true",
    ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "true",
    ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION: "true",
  });
  assert.deepEqual(submitTarget.args, [
    "--readiness-report",
    "var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-usdtkrw-orderbook-latest.json",
    "--output",
    "var/reports/cross-exchange-live-execution-latest.json",
    "--live-goal-status",
    "var/reports/live-goal-status-20260513-current.json",
    "--submit-once",
  ]);
  assert.equal(submitTarget.env.ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION, "true");
  assert.equal(submitTarget.env.ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION, "true");
});

test("cross-exchange live readiness blocks positive edge without operational proof", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-blocked-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const codebaseRoot = join(directory, "codebase");
    writeJson(reportPath, relativeValueReport());
    writeLiveCodebase(codebaseRoot);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      liveReady: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
    };
    assert.equal(audit.liveReady, false);
    assert.equal(audit.checklist.positiveMedianNetEdge, true);
    assert.equal(audit.checklist.depthCoverageReady, true);
    assert.equal(audit.checklist.executionPathReady, true);
    assert.ok(audit.blockers.includes("operationalProofPresent"));
    assert.ok(audit.blockers.includes("operationalProofFresh"));
    assert.ok(audit.blockers.includes("operationalProofClean"));
    assert.ok(audit.blockers.includes("accountFeesConfirmed"));
    assert.ok(audit.blockers.includes("inventoryReady"));
    assert.ok(audit.blockers.includes("hedgeVenueReady"));
    assert.equal(audit.blockers.includes("executionPathReady"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness accepts complete proof for the measured direction", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-ready-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const proofPath = join(directory, "proof.json");
    const codebaseRoot = join(directory, "codebase");
    writeJson(reportPath, relativeValueReport());
    writeLiveCodebase(codebaseRoot);
    writeJson(proofPath, freshProof());

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        proofPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const audit = JSON.parse(output) as {
      liveReady: boolean;
      blockers: string[];
      operationalProofSummary: {
        requirements: { referenceQuoteInventoryKrw: number };
        deficits: { referenceQuoteDeficitKrw: number };
      };
      candidate: {
        notionalKrw: number;
        referenceVenue: string;
        direction: string;
        observationMedianNetEdgeBps: number;
        estimatedObservationPnlKrw: number;
        realizedLivePnlKrw: number | null;
      };
      measurementScope: {
        totalEstimatedNetPnlKrw: string;
      };
    };
    assert.equal(audit.liveReady, true);
    assert.deepEqual(audit.blockers, []);
    assert.equal(audit.operationalProofSummary.requirements.referenceQuoteInventoryKrw, 50_050);
    assert.equal(audit.operationalProofSummary.deficits.referenceQuoteDeficitKrw, 0);
    assert.equal(audit.candidate.notionalKrw, 50_000);
    assert.equal(audit.candidate.referenceVenue, "binance");
    assert.equal(audit.candidate.direction, "sell_bithumb_buy_reference");
    assert.equal(audit.candidate.observationMedianNetEdgeBps, 42.739405);
    assert.equal(audit.candidate.estimatedObservationPnlKrw, 21_644.429254);
    assert.equal(audit.candidate.realizedLivePnlKrw, null);
    assert.equal(audit.measurementScope.totalEstimatedNetPnlKrw, "observation_estimate_not_realized_live_pnl");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness blocks short observation spans", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-short-span-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const proofPath = join(directory, "proof.json");
    const codebaseRoot = join(directory, "codebase");
    writeJson(
      reportPath,
      relativeValueReport({
        observationSpanMinutes: 1.5,
        assumptions: {
          notionalKrw: 50_000,
          usdKrwUpdatedAt: new Date().toISOString(),
          minNetEdgeBps: 20,
          minObservations: 100,
          minObservationSpanMinutes: 60,
          minEdgeObservationRate: 0.6,
          minDepthCoverageRate: 0.95,
          maxLatestAgeHours: 24,
          maxFxAgeHours: 24,
          maxSnapshotSkewMs: 2000,
        },
      }),
    );
    writeLiveCodebase(codebaseRoot);
    writeJson(proofPath, freshProof());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        proofPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      liveReady: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
      candidate: {
        observationSpanMinutes: number;
        minObservationSpanMinutes: number;
      };
    };
    assert.equal(audit.liveReady, false);
    assert.equal(audit.checklist.observationSpanSufficient, false);
    assert.deepEqual(audit.blockers, ["observationSpanSufficient"]);
    assert.equal(audit.candidate.observationSpanMinutes, 1.5);
    assert.equal(audit.candidate.minObservationSpanMinutes, 60);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness uses fee-buffered proof requirements for inventory", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-fee-buffer-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const proofPath = join(directory, "proof.json");
    const codebaseRoot = join(directory, "codebase");
    writeJson(reportPath, relativeValueReport());
    writeLiveCodebase(codebaseRoot);
    writeJson(
      proofPath,
      freshProof({
        inventory: {
          bithumbBaseInventoryKrw: 50_000,
          bithumbQuoteInventoryKrw: 0,
          referenceBaseInventoryKrw: 0,
          referenceQuoteInventoryKrw: 50_000,
        },
        deficits: {
          bithumbBaseDeficitKrw: 0,
          bithumbQuoteDeficitKrw: 0,
          referenceBaseDeficitKrw: 0,
          referenceQuoteDeficitKrw: 50,
        },
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        proofPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      liveReady: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
      operationalProofSummary: {
        requirements: { referenceQuoteInventoryKrw: number };
        inventory: { referenceQuoteInventoryKrw: number };
        deficits: { referenceQuoteDeficitKrw: number };
      };
    };
    assert.equal(audit.liveReady, false);
    assert.equal(audit.checklist.inventoryReady, false);
    assert.deepEqual(audit.blockers, ["inventoryReady"]);
    assert.equal(audit.operationalProofSummary.requirements.referenceQuoteInventoryKrw, 50_050);
    assert.equal(audit.operationalProofSummary.inventory.referenceQuoteInventoryKrw, 50_000);
    assert.equal(audit.operationalProofSummary.deficits.referenceQuoteDeficitKrw, 50);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness recomputes observation and FX freshness from wall clock", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-stale-market-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const proofPath = join(directory, "proof.json");
    const codebaseRoot = join(directory, "codebase");
    const stale = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    writeLiveCodebase(codebaseRoot);
    writeJson(
      reportPath,
      relativeValueReport({
        generatedAt: stale,
        latestObservationAgeHours: 0.1,
        fxAgeHours: 1,
        assumptions: {
          notionalKrw: 50_000,
          usdKrwUpdatedAt: stale,
          minNetEdgeBps: 20,
          minObservations: 100,
          minEdgeObservationRate: 0.6,
          minDepthCoverageRate: 0.95,
          maxLatestAgeHours: 24,
          maxFxAgeHours: 24,
          maxSnapshotSkewMs: 2000,
        },
        observations: [{ capturedAt: stale }],
        topEdges: [
          {
            capturedAt: stale,
            referenceVenue: "binance",
            direction: "sell_bithumb_buy_reference",
            snapshotSkewMs: 28,
            snapshotSkewSource: "receive",
          },
        ],
      }),
    );
    writeJson(proofPath, freshProof());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        proofPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      liveReady: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
    };
    assert.equal(audit.liveReady, false);
    assert.equal(audit.checklist.latestObservationFresh, false);
    assert.equal(audit.checklist.fxFresh, false);
    assert.deepEqual(audit.blockers, ["latestObservationFresh", "fxFresh"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness treats missing operational proof as blocked evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-missing-proof-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const codebaseRoot = join(directory, "codebase");
    writeJson(reportPath, relativeValueReport());
    writeLiveCodebase(codebaseRoot);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        join(directory, "missing-proof.json"),
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      liveReady: boolean;
      operationalProof: string;
      blockers: string[];
    };
    assert.equal(audit.liveReady, false);
    assert.match(audit.operationalProof, /missing-proof\.json$/);
    assert.deepEqual(audit.blockers, [
      "operationalProofPresent",
      "operationalProofFresh",
      "operationalProofClean",
      "accountFeesConfirmed",
      "inventoryReady",
      "hedgeVenueReady",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness rejects stale or dirty operational proof", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-stale-proof-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const proofPath = join(directory, "proof.json");
    const codebaseRoot = join(directory, "codebase");
    writeLiveCodebase(codebaseRoot);
    writeJson(
      reportPath,
      relativeValueReport({
        assumptions: {
          notionalKrw: 50_000,
          minNetEdgeBps: 20,
          minObservations: 100,
          minEdgeObservationRate: 0.6,
          minDepthCoverageRate: 0.95,
          maxLatestAgeHours: 24,
          maxFxAgeHours: 24,
          maxSnapshotSkewMs: 2000,
          accountFeesConfirmed: true,
          inventoryReady: true,
          hedgeVenueReady: true,
        },
      }),
    );
    writeJson(
      proofPath,
      freshProof({
        generatedAt: "2026-01-01T00:00:00.000Z",
        reasons: ["credentialsMissing"],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        proofPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      blockers: string[];
    };
    assert.ok(audit.blockers.includes("operationalProofFresh"));
    assert.ok(audit.blockers.includes("operationalProofClean"));
    assert.equal(audit.blockers.includes("accountFeesConfirmed"), false);
    assert.equal(audit.blockers.includes("inventoryReady"), false);
    assert.equal(audit.blockers.includes("hedgeVenueReady"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness blocks when the PM2 runner is only a preflight", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-unwired-runner-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const proofPath = join(directory, "proof.json");
    const codebaseRoot = join(directory, "codebase");
    writeLiveCodebase(codebaseRoot);
    writeFileSync(
      join(codebaseRoot, "src/cli/run-cross-exchange-relative-value-live.ts"),
      "export function preflightOnly() { return 'no order submission'; }\n",
      "utf8",
    );
    writeJson(reportPath, relativeValueReport());
    writeJson(proofPath, freshProof());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        proofPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      liveReady: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
    };
    assert.equal(audit.liveReady, false);
    assert.equal(audit.checklist.executionPathReady, false);
    assert.deepEqual(audit.blockers, ["executionPathReady"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live readiness keeps depth as a blocker when notional is too large", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-live-depth-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    const proofPath = join(directory, "proof.json");
    const codebaseRoot = join(directory, "codebase");
    writeLiveCodebase(codebaseRoot);
    writeJson(
      reportPath,
      relativeValueReport({
        summary: {
          count: 101,
          positiveCount: 101,
          positiveRate: 1,
          depthCoveredCount: 81,
          depthCoverageRate: 0.80198,
          medianNetEdgeBps: 42.739405,
          totalEstimatedNetPnlKrw: 216_444.292383,
        },
      }),
    );
    writeJson(proofPath, freshProof({
      inventory: {
        bithumbBaseInventoryKrw: 500_000,
        referenceQuoteInventoryKrw: 500_000,
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-live-readiness.js",
        "--relative-value-report",
        reportPath,
        "--operational-proof",
        proofPath,
        "--codebase-root",
        codebaseRoot,
        "--require-live-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const audit = JSON.parse(result.stdout) as {
      liveReady: boolean;
      blockers: string[];
    };
    assert.equal(audit.liveReady, false);
    assert.deepEqual(audit.blockers, ["depthCoverageReady"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner fails closed when readiness is blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-blocked-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, {
      liveReady: false,
      blockers: ["accountFeesConfirmed"],
    });
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /cross-exchange live readiness is blocked/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner requires an output artifact for submit-once", () => {
  const result = spawnSync(
    process.execPath,
    [
      "dist/src/cli/run-cross-exchange-relative-value-live.js",
      "--readiness-report",
      "does-not-need-to-exist.json",
      "--submit-once",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--output is required when --submit-once is used/);
});

test("cross-exchange live runner checks global live-goal status before env and network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-live-goal-blocked-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyCrossExchangeReport());
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange({
      liveReady: false,
      liveStartupAllowed: false,
      selectedLiveCandidate: null,
      blockers: ["crossExchange:negativeMedianNetEdge"],
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal does not allow cross-exchange startup/);
    assert.match(result.stderr, /crossExchange:negativeMedianNetEdge/);
    assert.doesNotMatch(result.stderr, /ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner requires live-goal completion audit before env and network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-live-goal-audit-missing-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyCrossExchangeReport());
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange({
      completionAudit: undefined,
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal completion audit is required/);
    assert.doesNotMatch(result.stderr, /ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner rejects achieved audit with stale positive missing requirement count", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-live-goal-audit-missing-count-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyCrossExchangeReport());
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange({
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
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementCount must match missingRequirements/);
    assert.doesNotMatch(result.stderr, /ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner requires explicit missing requirement count", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-live-goal-audit-count-required-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyCrossExchangeReport());
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange({
      completionAudit: {
        achieved: true,
        failedCompletionCriteria: [],
        missingRequirements: [],
      },
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missingRequirementCount must be a non-negative integer/);
    assert.doesNotMatch(result.stderr, /ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner requires completion audit criteria before env and network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-live-goal-audit-criteria-required-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, readyCrossExchangeReport());
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange({
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
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /completion audit criteria is required/);
    assert.doesNotMatch(result.stderr, /ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner rejects live-goal status older than cross-exchange evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-live-goal-evidence-order-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    const nowMs = Date.now();
    writeJson(readinessPath, {
      ...readyCrossExchangeReport(),
      generatedAt: new Date(nowMs).toISOString(),
      operationalProofSummary: {
        ...(readyCrossExchangeReport().operationalProofSummary as Record<string, unknown>),
        generatedAt: new Date(nowMs).toISOString(),
      },
    });
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange({
      generatedAt: new Date(nowMs - 60_000).toISOString(),
    }));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "false",
          ENABLE_LIVE_EXECUTION: "false",
          BITHUMB_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
          BINANCE_PUBLIC_REST_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /live goal status is older than the cross-exchange evidence/);
    assert.doesNotMatch(result.stderr, /ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true/);
    assert.doesNotMatch(result.stderr, /request failed|fetch failed|ECONNREFUSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner requires explicit live flags and credentials", async () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-live-"));
  const marketServer = await startMarketServer();
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    const outputPath = join(directory, "live-execution.json");
    writeJson(readinessPath, {
      generatedAt: new Date().toISOString(),
      liveReady: true,
      blockers: [],
      checklist: {
        reportPresent: true,
        bestEdgeDirectionKnown: true,
        globalReferenceVenue: true,
        sufficientObservations: true,
        positiveEdgeRate: true,
        positiveMedianNetEdge: true,
        positiveEstimatedNetPnl: true,
        depthCoverageReady: true,
        latestObservationFresh: true,
        fxFresh: true,
        snapshotSkewControlled: true,
        executionPathReady: true,
        operationalProofPresent: true,
        operationalProofFresh: true,
        operationalProofClean: true,
        accountFeesConfirmed: true,
        inventoryReady: true,
        hedgeVenueReady: true,
      },
      operationalProofSummary: {
        generatedAt: new Date().toISOString(),
        accountFeesConfirmed: true,
        hedgeVenueReady: true,
        deficits: {
          bithumbBaseDeficitKrw: 0,
          bithumbQuoteDeficitKrw: 0,
          referenceBaseDeficitKrw: 0,
          referenceQuoteDeficitKrw: 0,
        },
        details: {
          bithumbFeeBps: 4,
          referenceFeeBps: 10,
        },
        reasons: [],
      },
      candidate: {
        notionalKrw: 50_000,
        market: "KRW-BTC",
        referenceMarket: "BTCUSDT",
        referenceQuoteToKrw: 1473.05,
        minNetEdgeBps: 20,
        bithumbFeeBps: 0,
        referenceFeeBps: 0,
        referenceVenue: "binance",
        direction: "sell_bithumb_buy_reference",
        medianNetEdgeBps: 42.7,
      },
    });
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange());

    const blocked = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--output",
        outputPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true/);

    const allowed = await spawnNode(
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--output",
        outputPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "true",
          ENABLE_LIVE_EXECUTION: "true",
          BITHUMB_ACCESS_KEY: "bithumb-access",
          BITHUMB_SECRET_KEY: "bithumb-secret",
          BINANCE_API_KEY: "binance-api",
          BINANCE_SECRET_KEY: "binance-secret",
          BITHUMB_PUBLIC_REST_BASE_URL: marketServer.url,
          BINANCE_PUBLIC_REST_BASE_URL: marketServer.url,
        },
      },
    );
    assert.equal(allowed.status, 0);
    const report = JSON.parse(allowed.stdout) as {
      mode: string;
      execution: unknown;
      freshObservedNetEdgeBps: number;
      estimatedFreshEdgePnlKrw: number;
      submitted: boolean;
      realizedPnlKrw: number | null;
      realizedNetPnlKrw: number | null;
      realizedNetEdgeBps: number | null;
      realizedFeeKrw: number | null;
      realizedGrossPnlKrw: number | null;
      realizedGrossEdgeBps: number | null;
      freshPlan: {
        legs: Array<{
          venue: string;
          limitPrice: number;
          limitPriceCurrency: string;
          quoteToKrw: number;
        }>;
      };
      candidate: {
        bithumbFeeBps: number;
        referenceFeeBps: number;
      };
    };
    assert.equal(report.mode, "cross_exchange_relative_value_live_plan");
    assert.equal(report.execution, null);
    assert.equal(existsSync(outputPath), true);
    assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), report);
    assert.equal(report.submitted, false);
    assert.equal(report.realizedPnlKrw, null);
    assert.equal(report.realizedNetPnlKrw, null);
    assert.equal(report.realizedNetEdgeBps, null);
    assert.equal(report.realizedFeeKrw, null);
    assert.equal(report.realizedGrossPnlKrw, null);
    assert.equal(report.realizedGrossEdgeBps, null);
    assert.ok(report.freshObservedNetEdgeBps > 20);
    assert.ok(report.estimatedFreshEdgePnlKrw > 0);
    assert.equal(report.candidate.bithumbFeeBps, 4);
    assert.equal(report.candidate.referenceFeeBps, 10);
    const binanceLeg = report.freshPlan.legs.find((leg) => leg.venue === "binance");
    assert.equal(binanceLeg?.limitPrice, 80_850);
    assert.equal(binanceLeg?.limitPriceCurrency, "USDT");
    assert.equal(binanceLeg?.quoteToKrw, 1473.05);
  } finally {
    await marketServer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner blocks fresh books below the live edge threshold", async () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-weak-edge-"));
  const marketServer = await startMarketServer({ bithumbBidPrice: 118_000_000 });
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, {
      generatedAt: new Date().toISOString(),
      liveReady: true,
      blockers: [],
      checklist: {
        reportPresent: true,
        bestEdgeDirectionKnown: true,
        globalReferenceVenue: true,
        sufficientObservations: true,
        positiveEdgeRate: true,
        positiveMedianNetEdge: true,
        positiveEstimatedNetPnl: true,
        depthCoverageReady: true,
        latestObservationFresh: true,
        fxFresh: true,
        snapshotSkewControlled: true,
        executionPathReady: true,
        operationalProofPresent: true,
        operationalProofFresh: true,
        operationalProofClean: true,
        accountFeesConfirmed: true,
        inventoryReady: true,
        hedgeVenueReady: true,
      },
      operationalProofSummary: {
        generatedAt: new Date().toISOString(),
        accountFeesConfirmed: true,
        hedgeVenueReady: true,
        deficits: {
          bithumbBaseDeficitKrw: 0,
          bithumbQuoteDeficitKrw: 0,
          referenceBaseDeficitKrw: 0,
          referenceQuoteDeficitKrw: 0,
        },
        details: {
          bithumbFeeBps: 4,
          referenceFeeBps: 10,
        },
        reasons: [],
      },
      candidate: {
        notionalKrw: 50_000,
        market: "KRW-BTC",
        referenceMarket: "BTCUSDT",
        referenceQuoteToKrw: 1473.05,
        minNetEdgeBps: 20,
        bithumbFeeBps: 4,
        referenceFeeBps: 10,
        referenceVenue: "binance",
        direction: "sell_bithumb_buy_reference",
        medianNetEdgeBps: 42.7,
      },
    });
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange());

    const result = await spawnNode(
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "true",
          ENABLE_LIVE_EXECUTION: "true",
          BITHUMB_ACCESS_KEY: "bithumb-access",
          BITHUMB_SECRET_KEY: "bithumb-secret",
          BINANCE_API_KEY: "binance-api",
          BINANCE_SECRET_KEY: "binance-secret",
          BITHUMB_PUBLIC_REST_BASE_URL: marketServer.url,
          BINANCE_PUBLIC_REST_BASE_URL: marketServer.url,
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /below the configured live threshold/);
  } finally {
    await marketServer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange live runner rejects hand-written readiness without proof details", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-run-forged-"));
  try {
    const readinessPath = join(directory, "readiness.json");
    const liveGoalPath = join(directory, "live-goal-status.json");
    writeJson(readinessPath, {
      liveReady: true,
      blockers: [],
      candidate: {
        notionalKrw: 50_000,
        referenceVenue: "binance",
        direction: "sell_bithumb_buy_reference",
        medianNetEdgeBps: 42.7,
      },
    });
    writeJson(liveGoalPath, liveGoalAllowsCrossExchange());

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/run-cross-exchange-relative-value-live.js",
        "--readiness-report",
        readinessPath,
        "--live-goal-status",
        liveGoalPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION: "true",
          ENABLE_LIVE_EXECUTION: "true",
          BITHUMB_ACCESS_KEY: "bithumb-access",
          BITHUMB_SECRET_KEY: "bithumb-secret",
          BINANCE_API_KEY: "binance-api",
          BINANCE_SECRET_KEY: "binance-secret",
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /cross-exchange readiness checklist is required/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
