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

test("maker fill filter scan promotes a robust feature-conditioned maker subset", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-maker-filter-"));
  try {
    const market = "KRW-BTC";
    const runId = "run-a";
    const orderbookDir = join(
      directory,
      "canonical",
      "orderbook_level",
      "date=2026-04-02",
      `market=${market}`,
    );
    const tradeDir = join(
      directory,
      "canonical",
      "trade_tick",
      "date=2026-04-02",
      `market=${market}`,
    );
    const passiveDir = join(
      directory,
      "canonical",
      "passive_feature_snapshot",
      "date=2026-04-02",
      `market=${market}`,
    );
    mkdirSync(orderbookDir, { recursive: true });
    mkdirSync(tradeDir, { recursive: true });
    mkdirSync(passiveDir, { recursive: true });

    const orderbook = [];
    const trades = [];
    const passive = [];
    for (let index = 0; index < 100; index += 1) {
      const timestampMs = 1_000 + index * 120_000;
      orderbook.push({
        dataset: "orderbook_level",
        market,
        event_timestamp_ms: timestampMs,
        level_index: 0,
        ask_price: 101,
        bid_price: 100,
        bid_size: 0,
      });
      orderbook.push({
        dataset: "orderbook_level",
        market,
        event_timestamp_ms: timestampMs + 31_000,
        level_index: 0,
        ask_price: 103,
        bid_price: 102,
        bid_size: 1,
      });
      trades.push({
        dataset: "trade_tick",
        market,
        trade_timestamp_ms: timestampMs + 1_000,
        price: 100,
        volume: 1,
        side: "ASK",
      });
      passive.push({
        dataset: "passive_feature_snapshot",
        market,
        event_timestamp_ms: timestampMs,
        ret_5m_bps: 10,
        buy_notional_share_60s: 0.55,
        depth_ratio_l5: 1.2,
        spread_bps: 1,
        turnover_24h_krw: 40_000_000_000,
        window_coverage_sec: 60,
      });
    }

    writeNdjson(join(orderbookDir, `part-${runId}.ndjson`), orderbook);
    writeNdjson(join(tradeDir, `part-${runId}.ndjson`), trades);
    writeNdjson(join(passiveDir, `part-${runId}.ndjson`), passive);

    const outputPath = join(directory, "maker-filter.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-maker-fill-filter.js",
        "--base-dir",
        directory,
        "--markets",
        market,
        "--notional-krw",
        "100",
        "--ttl-seconds",
        "10",
        "--sample-interval-seconds",
        "120",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        market: string;
        horizonSeconds: number;
        train: { count: number; medianPnlKrw: number };
        test: { count: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; minFoldPnlKrw: number };
      }>;
      markets: Array<{
        source: {
          sampleCount: number;
          fillCount: number;
          featureMatchedFillCount: number;
        };
      }>;
    };
    assert.ok(report.promotionCandidateCount > 0);
    assert.equal(report.promotionCandidates[0]?.market, market);
    assert.equal(report.promotionCandidates[0]?.horizonSeconds, 30);
    assert.equal(report.promotionCandidates[0]?.train.count, 70);
    assert.equal(report.promotionCandidates[0]?.test.count, 30);
    assert.ok((report.promotionCandidates[0]?.train.medianPnlKrw ?? 0) > 0);
    assert.ok((report.promotionCandidates[0]?.test.medianPnlKrw ?? 0) > 0);
    assert.equal(report.promotionCandidates[0]?.walkForward.positiveTotalFoldCount, 5);
    assert.ok((report.promotionCandidates[0]?.walkForward.minFoldPnlKrw ?? -1) > 0);
    assert.equal(report.markets[0]?.source.sampleCount, 100);
    assert.equal(report.markets[0]?.source.fillCount, 100);
    assert.equal(report.markets[0]?.source.featureMatchedFillCount, 100);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
