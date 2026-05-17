import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeNdjson(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

test("maker fill quality audit waits behind displayed bid queue", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-maker-fill-"));
  try {
    const runId = "run-a";
    const orderbookDir = join(
      directory,
      "canonical",
      "orderbook_level",
      "date=2026-04-02",
      "market=KRW-BTC",
    );
    const tradeDir = join(
      directory,
      "canonical",
      "trade_tick",
      "date=2026-04-02",
      "market=KRW-BTC",
    );
    mkdirSync(orderbookDir, { recursive: true });
    mkdirSync(tradeDir, { recursive: true });

    writeNdjson(join(orderbookDir, `part-${runId}.ndjson`), [
      {
        dataset: "orderbook_level",
        market: "KRW-BTC",
        event_timestamp_ms: 1_000,
        level_index: 0,
        ask_price: 101,
        bid_price: 100,
        bid_size: 0.5,
      },
      {
        dataset: "orderbook_level",
        market: "KRW-BTC",
        event_timestamp_ms: 61_000,
        level_index: 0,
        ask_price: 103,
        bid_price: 102,
        bid_size: 1,
      },
    ]);
    writeNdjson(join(tradeDir, `part-${runId}.ndjson`), [
      {
        dataset: "trade_tick",
        market: "KRW-BTC",
        trade_timestamp_ms: 2_000,
        price: 100,
        volume: 0.5,
        side: "ASK",
      },
      {
        dataset: "trade_tick",
        market: "KRW-BTC",
        trade_timestamp_ms: 3_000,
        price: 100,
        volume: 1,
        side: "ASK",
      },
    ]);

    const outputPath = join(directory, "maker-fill.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-maker-fill-quality.js",
        "--base-dir",
        directory,
        "--market",
        "KRW-BTC",
        "--notional-krw",
        "100",
        "--ttl-seconds",
        "10",
        "--sample-interval-seconds",
        "120",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      source: {
        sampleCount: number;
        fillCount: number;
        fillRate: number;
        fillDelay: { medianSeconds: number };
      };
      horizons: {
        "30s": {
          markedFillCount: number;
          totalPnlNoRewardKrw: number;
          totalPnlWithMakerRewardKrw: number;
          winnersWithMakerReward: number;
        };
        "60s": { markedFillCount: number };
      };
    };
    assert.equal(report.source.sampleCount, 1);
    assert.equal(report.source.fillCount, 1);
    assert.equal(report.source.fillRate, 1);
    assert.equal(report.source.fillDelay.medianSeconds, 2);
    assert.equal(report.horizons["30s"].markedFillCount, 1);
    assert.equal(report.horizons["30s"].totalPnlNoRewardKrw, 1.9192);
    assert.equal(report.horizons["30s"].totalPnlWithMakerRewardKrw, 1.9692);
    assert.equal(report.horizons["30s"].winnersWithMakerReward, 1);
    assert.equal(report.horizons["60s"].markedFillCount, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
