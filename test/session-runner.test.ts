import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPaperSessionRunner,
  loadExecutionRuntimeConfig,
  persistPaperSessionReport,
  validatePaperSessionScenario,
  type MarketSnapshot,
  type PaperSessionScenario,
  type PortfolioState,
} from "../src/index.js";

function buildSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    market: "KRW-BTC",
    asOf: "2026-04-02T12:00:00.000Z",
    lastTradePrice: 140_000_000,
    bestBidPrice: 139_990_000,
    bestAskPrice: 140_010_000,
    bestBidSize: 0.4,
    bestAskSize: 0.4,
    spreadBps: 1.4,
    depthRatio: 1.25,
    rolling24hNotional: 450_000_000_000,
    ...overrides,
  };
}

function buildBuySignal(signalId = "sig-buy-1") {
  return {
    schemaVersion: "1.0.0" as const,
    signalId,
    strategyId: "momentum-v1",
    market: "KRW-BTC",
    side: "buy" as const,
    sizing: {
      basis: "quote_notional" as const,
      value: 500_000,
    },
    confidence: 0.72,
    generatedAt: "2026-04-02T11:59:58.000Z",
    expiresAt: "2026-04-02T12:00:10.000Z",
    maxSlippageBps: 6,
    reasonCodes: ["momentum_positive", "depth_support"],
  };
}

function buildRuntimeConfig(mode: "paper" | "dry_run" = "paper") {
  return loadExecutionRuntimeConfig({
    envFilePath: null,
    env: {
      TRADING_MODE: mode,
      ENABLE_LIVE_EXECUTION: "false",
    },
  });
}

test("validatePaperSessionScenario rejects malformed snapshot events", () => {
  const validation = validatePaperSessionScenario({
    schemaVersion: "1.0.0",
    events: [
      {
        type: "snapshot",
        snapshot: {
          market: "KRW-BTC",
        },
      },
    ],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) {
    return;
  }

  assert.ok(
    validation.issues.some((issue) => issue.path === "events[0].snapshot.asOf"),
  );
});

test("paper session runner executes a clean buy/sell scenario", async () => {
  const portfolio: PortfolioState = {
    cashAvailable: 5_000_000,
    dailyRealizedPnl: 0,
    positions: {},
  };
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    initialPortfolio: portfolio,
    reconcileAt: "2026-04-02T12:00:02.000Z",
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
      {
        type: "signal",
        signal: buildBuySignal(),
      },
      {
        type: "snapshot",
        snapshot: buildSnapshot({
          asOf: "2026-04-02T12:00:01.000Z",
          bestBidPrice: 140_050_000,
          bestAskPrice: 140_060_000,
          lastTradePrice: 140_055_000,
        }),
      },
      {
        type: "signal",
        signal: {
          schemaVersion: "1.0.0",
          signalId: "sig-sell-1",
          strategyId: "momentum-v1",
          market: "KRW-BTC",
          side: "sell",
          sizing: {
            basis: "position_fraction",
            value: 1,
          },
          confidence: 0.68,
          generatedAt: "2026-04-02T12:00:01.000Z",
          expiresAt: "2026-04-02T12:00:10.000Z",
          maxSlippageBps: 6,
          reasonCodes: ["momentum_reversal"],
          reduceOnly: true,
        },
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig(), {
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
    portfolio,
  });

  const report = await runner.runScenario(scenario);

  assert.equal(report.mode, "paper");
  assert.equal(report.generatedAt, "2026-04-02T12:00:02.000Z");
  assert.equal(report.processedEvents, 4);
  assert.equal(report.outcomes.filter((outcome) => outcome.type === "signal").length, 2);
  assert.equal(report.rejectLedger.totalRejectedDecisions, 0);
  assert.equal(report.reconciliation.ok, true);
  assert.equal(report.reconciliation.openPositions.length, 0);
});

test("paper session runner rejects signals when no snapshot is loaded", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    events: [
      {
        type: "signal",
        signal: buildBuySignal("sig-no-snapshot"),
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig(), {
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
  });

  const report = await runner.runScenario(scenario);
  const outcome = report.outcomes[0];

  assert.equal(outcome?.type, "signal");
  if (!outcome || outcome.type !== "signal" || outcome.decision.accepted) {
    return;
  }

  assert.equal(outcome.decision.reasons[0]?.code, "missing_market_snapshot");
  assert.equal(report.rejectLedger.totalRejectedDecisions, 1);
  assert.equal(
    report.rejectLedger.byMarket["KRW-BTC"]?.reasons.missing_market_snapshot,
    1,
  );
  assert.equal(report.reconciliation.ok, true);
});

test("paper session runner fails reconciliation when the session ends with an open position", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    reconcileAt: "2026-04-02T12:00:01.000Z",
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
      {
        type: "signal",
        signal: buildBuySignal("sig-open-position"),
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig(), {
    clock: () => new Date("2026-04-02T12:00:00.000Z"),
  });

  const report = await runner.runScenario(scenario);

  assert.equal(report.reconciliation.ok, false);
  assert.equal(report.reconciliation.reasons[0]?.code, "reconciliation_mismatch");
  assert.equal(report.reconciliation.openPositions.length, 1);
});

test("paper session runner falls back to signal generatedAt when receivedAt is absent", async () => {
  const scenario: PaperSessionScenario = {
    schemaVersion: "1.0.0",
    events: [
      {
        type: "snapshot",
        snapshot: buildSnapshot(),
      },
      {
        type: "signal",
        signal: buildBuySignal("sig-generated-at"),
      },
    ],
  };
  const runner = createPaperSessionRunner(buildRuntimeConfig("dry_run"), {
    clock: () => new Date("2026-04-02T12:05:00.000Z"),
  });

  const report = await runner.runScenario(scenario);
  const signalOutcome = report.outcomes.find((outcome) => outcome.type === "signal");

  assert.equal(signalOutcome?.type, "signal");
  if (!signalOutcome || signalOutcome.type !== "signal" || !signalOutcome.decision.accepted) {
    return;
  }

  assert.equal(signalOutcome.decision.order.createdAt, "2026-04-02T11:59:58.000Z");
});

test("persistPaperSessionReport writes the artifact bundle for audit", async () => {
  const artifactDir = mkdtempSync(join(tmpdir(), "org-coin-paper-session-"));

  try {
    const portfolio: PortfolioState = {
      cashAvailable: 5_000_000,
      dailyRealizedPnl: 0,
      positions: {},
    };
    const scenario: PaperSessionScenario = {
      schemaVersion: "1.0.0",
      reconcileAt: "2026-04-02T12:00:02.000Z",
      initialPortfolio: portfolio,
      events: [
        {
          type: "snapshot",
          snapshot: buildSnapshot(),
        },
        {
          type: "signal",
          signal: buildBuySignal("sig-artifact-buy"),
          receivedAt: "2026-04-02T12:00:00.500Z",
        },
        {
          type: "signal",
          signal: buildBuySignal("sig-artifact-buy"),
          receivedAt: "2026-04-02T12:00:01.000Z",
        },
        {
          type: "snapshot",
          snapshot: buildSnapshot({
            asOf: "2026-04-02T12:00:01.000Z",
            bestBidPrice: 140_050_000,
            bestAskPrice: 140_060_000,
            lastTradePrice: 140_055_000,
          }),
        },
        {
          type: "signal",
          signal: {
            schemaVersion: "1.0.0",
            signalId: "sig-artifact-sell",
            strategyId: "momentum-v1",
            market: "KRW-BTC",
            side: "sell",
            sizing: {
              basis: "position_fraction",
              value: 1,
            },
            confidence: 0.68,
            generatedAt: "2026-04-02T12:00:01.000Z",
            expiresAt: "2026-04-02T12:00:10.000Z",
            maxSlippageBps: 6,
            reasonCodes: ["momentum_reversal"],
            reduceOnly: true,
          },
          receivedAt: "2026-04-02T12:00:01.500Z",
        },
      ],
    };
    const runner = createPaperSessionRunner(buildRuntimeConfig(), {
      clock: () => new Date("2026-04-02T12:00:00.000Z"),
      portfolio,
    });

    const report = await runner.runScenario(scenario);
    const persisted = await persistPaperSessionReport({
      report,
      baseDir: artifactDir,
      sessionId: "session-fixture",
      scenarioPath: "/tmp/scenario.json",
    });

    assert.equal(persisted.sessionId, "session-fixture");
    assert.equal(persisted.scenarioPath, "/tmp/scenario.json");
    assert.ok(existsSync(persisted.artifacts?.reportPath ?? ""));
    assert.ok(existsSync(persisted.artifacts?.reportMarkdownPath ?? ""));
    assert.ok(existsSync(persisted.artifacts?.ledgerPath ?? ""));
    assert.ok(existsSync(persisted.artifacts?.rejectLedgerPath ?? ""));

    const storedReport = JSON.parse(
      readFileSync(persisted.artifacts!.reportPath, "utf8"),
    ) as { sessionId: string };
    const storedRejectLedger = JSON.parse(
      readFileSync(persisted.artifacts!.rejectLedgerPath, "utf8"),
    ) as { totalRejectedDecisions: number };
    const ledgerLines = readFileSync(
      persisted.artifacts!.ledgerPath,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    const markdown = readFileSync(
      persisted.artifacts!.reportMarkdownPath,
      "utf8",
    );

    assert.equal(storedReport.sessionId, "session-fixture");
    assert.equal(storedRejectLedger.totalRejectedDecisions, 1);
    assert.ok(ledgerLines.some((line) => line.type === "decision"));
    assert.ok(ledgerLines.some((line) => line.type === "order"));
    assert.ok(ledgerLines.some((line) => line.type === "fill"));
    assert.match(markdown, /session-fixture/);
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});
