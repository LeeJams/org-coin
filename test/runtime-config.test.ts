import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDefaultRiskPolicy,
  loadExecutionRuntimeConfig,
  parseDotenv,
} from "../src/index.js";

test("parseDotenv parses comments and quoted values", () => {
  const env = parseDotenv(`
# comment
TRADING_MODE=paper
BITHUMB_ACCESS_KEY="abc123"
EMPTY=
`);

  assert.equal(env.TRADING_MODE, "paper");
  assert.equal(env.BITHUMB_ACCESS_KEY, "abc123");
  assert.equal(env.EMPTY, "");
});

test("loadExecutionRuntimeConfig reads .env values and keeps paper defaults for zero sentinels", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-runtime-"));

  try {
    writeFileSync(
      join(directory, ".env"),
      [
        "TRADING_MODE=dry_run",
        "ENABLE_LIVE_EXECUTION=false",
        "MAX_ORDER_NOTIONAL_KRW=750000",
        "MAX_POSITION_NOTIONAL_KRW=0",
        "DATA_STALE_AFTER_MS=4000",
      ].join("\n"),
      "utf8",
    );

    const config = loadExecutionRuntimeConfig({ cwd: directory });
    const defaults = createDefaultRiskPolicy();

    assert.equal(config.tradingMode, "dry_run");
    assert.equal(config.riskPolicy.maxOrderNotional, 750_000);
    assert.equal(config.riskPolicy.dataStaleAfterMs, 4_000);
    assert.deepEqual(
      config.riskPolicy.maxPositionNotionalByMarket,
      defaults.maxPositionNotionalByMarket,
    );
    assert.ok(config.envFilePath?.endsWith(".env"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loadExecutionRuntimeConfig rejects live-mode activation", () => {
  assert.throws(
    () =>
      loadExecutionRuntimeConfig({
        envFilePath: null,
        env: {
          TRADING_MODE: "paper",
          ENABLE_LIVE_EXECUTION: "true",
        },
      }),
    /ENABLE_LIVE_EXECUTION=true/,
  );

  assert.throws(
    () =>
      loadExecutionRuntimeConfig({
        envFilePath: null,
        env: {
          TRADING_MODE: "live",
          ENABLE_LIVE_EXECUTION: "false",
        },
      }),
    /TRADING_MODE=live/,
  );
});
