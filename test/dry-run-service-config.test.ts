import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadDryRunServiceConfig } from "../src/runtime/dry-run-service-config.js";

test("loadDryRunServiceConfig reads .env values and resolves paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-dry-run-service-"));

  try {
    mkdirSync(join(directory, ".venv", "bin"), { recursive: true });
    writeFileSync(join(directory, ".venv", "bin", "python"), "", "utf8");
    writeFileSync(
      join(directory, ".env"),
      [
        "DRY_RUN_ENTRY_PROFILE=exploratory_smoke",
        "DRY_RUN_INITIAL_CASH_KRW=2500000",
        "DRY_RUN_LOOP_INTERVAL_SECONDS=45",
        "DRY_RUN_LOG_DIR=tmp/dry-run",
        "DRY_RUN_CYCLE_LOG_FILE=service.ndjson",
        "DRY_RUN_BASE_DIR=tmp/data",
        "DRY_RUN_MARKETS=KRW-BTC,KRW-XRP",
        "DRY_RUN_FRESHNESS_SLA_MS=9000",
        "DRY_RUN_CANDLE_COUNT=120",
        "DRY_RUN_TRADE_COUNT=150",
        "DRY_RUN_WS_SECONDS=9",
        "DRY_RUN_TRADE_WARMUP_SECONDS=12",
        "DRY_RUN_BOOTSTRAP_ITERATIONS=2",
        "DRY_RUN_BOOTSTRAP_INTERVAL_SECONDS=3",
        "DRY_RUN_WS_CHANNELS=ticker,trade",
      ].join("\n"),
      "utf8",
    );

    const config = loadDryRunServiceConfig({ cwd: directory });

    assert.equal(config.entryProfile, "exploratory_smoke");
    assert.equal(config.initialCashKrw, 2_500_000);
    assert.equal(config.loopIntervalSeconds, 45);
    assert.equal(config.baseDir, join(directory, "tmp/data"));
    assert.equal(config.logDir, join(directory, "tmp/dry-run"));
    assert.equal(config.cycleLogPath, join(directory, "tmp/dry-run/service.ndjson"));
    assert.equal(config.pythonBin, join(directory, ".venv", "bin", "python"));
    assert.equal(config.bootstrap.markets, "KRW-BTC,KRW-XRP");
    assert.equal(config.bootstrap.freshnessSlaMs, 9_000);
    assert.equal(config.bootstrap.candleCount, 120);
    assert.equal(config.bootstrap.tradeCount, 150);
    assert.equal(config.bootstrap.wsSeconds, 9);
    assert.equal(config.bootstrap.tradeWarmupSeconds, 12);
    assert.equal(config.bootstrap.iterations, 2);
    assert.equal(config.bootstrap.intervalSeconds, 3);
    assert.equal(config.bootstrap.wsChannels, "ticker,trade");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadDryRunServiceConfig rejects unsupported profiles", () => {
  assert.throws(
    () =>
      loadDryRunServiceConfig({
        envFilePath: null,
        env: {
          DRY_RUN_ENTRY_PROFILE: "paper",
        },
      }),
    /DRY_RUN_ENTRY_PROFILE/,
  );
});
