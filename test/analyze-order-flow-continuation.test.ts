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
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

test("order-flow continuation scan reports fee-stressed promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-order-flow-"));
  try {
    const market = "KRW-BTC";
    const featureDir = join(
      directory,
      "canonical",
      "passive_feature_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    const bookDir = join(
      directory,
      "canonical",
      "orderbook_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    mkdirSync(featureDir, { recursive: true });
    mkdirSync(bookDir, { recursive: true });

    const features = [];
    const books = [];
    for (let index = 0; index < 80; index += 1) {
      const timestampMs = 1_000 + index * 600_000;
      const entryAsk = 100 + index;
      const exitBid = entryAsk + 2;
      features.push({
        dataset: "passive_feature_snapshot",
        market,
        event_timestamp_ms: timestampMs,
        ret_5m_bps: 25,
        buy_notional_share_60s: 0.7,
        depth_ratio_l5: 1.4,
        spread_bps: 1,
        turnover_24h_krw: 50_000_000_000,
        window_coverage_sec: 60,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: timestampMs,
        best_ask_price: entryAsk,
        best_bid_price: entryAsk - 0.01,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: timestampMs + 300_000,
        best_ask_price: exitBid + 0.01,
        best_bid_price: exitBid,
      });
    }

    writeNdjson(join(featureDir, "part-run.ndjson"), features);
    writeNdjson(join(bookDir, "part-run.ndjson"), books);

    const outputPath = join(directory, "order-flow.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-order-flow-continuation.js",
        "--base-dir",
        directory,
        "--markets",
        market,
        "--fee-round-trip-bps",
        "8",
        "--horizons-seconds",
        "60,300",
        "--min-snapshots",
        "10",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      assumptions: { horizonSecondsList: number[] };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        market: string;
        horizonSeconds: number;
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.deepEqual(report.assumptions.horizonSecondsList, [60, 300]);
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(report.promotionCandidates[0]?.market, market);
    assert.equal([60, 300].includes(report.promotionCandidates[0]!.horizonSeconds), true);
    assert.equal(report.promotionCandidates[0]!.train.count >= 30, true);
    assert.equal(report.promotionCandidates[0]!.test.count >= 15, true);
    assert.equal(report.promotionCandidates[0]!.train.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveTotalFoldCount, 5);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveMedianFoldCount, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("order-flow reversion scan reports fee-stressed promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-order-flow-reversion-"));
  try {
    const market = "KRW-BTC";
    const featureDir = join(
      directory,
      "canonical",
      "passive_feature_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    const bookDir = join(
      directory,
      "canonical",
      "orderbook_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    mkdirSync(featureDir, { recursive: true });
    mkdirSync(bookDir, { recursive: true });

    const features = [];
    const books = [];
    for (let index = 0; index < 80; index += 1) {
      const timestampMs = 1_000 + index * 600_000;
      const entryAsk = 180 - index * 0.2;
      const exitBid = entryAsk + 2;
      features.push({
        dataset: "passive_feature_snapshot",
        market,
        event_timestamp_ms: timestampMs,
        ret_5m_bps: -25,
        buy_notional_share_60s: 0.3,
        depth_ratio_l5: 1.4,
        spread_bps: 1,
        turnover_24h_krw: 50_000_000_000,
        window_coverage_sec: 60,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: timestampMs,
        best_ask_price: entryAsk,
        best_bid_price: entryAsk - 0.01,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: timestampMs + 300_000,
        best_ask_price: exitBid + 0.01,
        best_bid_price: exitBid,
      });
    }

    writeNdjson(join(featureDir, "part-run.ndjson"), features);
    writeNdjson(join(bookDir, "part-run.ndjson"), books);

    const outputPath = join(directory, "order-flow-reversion.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-order-flow-continuation.js",
        "--base-dir",
        directory,
        "--markets",
        market,
        "--signal-mode",
        "reversion",
        "--fee-round-trip-bps",
        "8",
        "--horizon-seconds",
        "300",
        "--min-snapshots",
        "10",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      assumptions: { signalMode: string };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        market: string;
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.equal(report.assumptions.signalMode, "reversion");
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(report.promotionCandidates[0]?.market, market);
    assert.equal(report.promotionCandidates[0]!.train.count >= 30, true);
    assert.equal(report.promotionCandidates[0]!.test.count >= 15, true);
    assert.equal(report.promotionCandidates[0]!.train.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveTotalFoldCount, 5);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveMedianFoldCount, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("order-flow absorption scan reports fee-stressed promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-order-flow-absorption-"));
  try {
    const market = "KRW-BTC";
    const featureDir = join(
      directory,
      "canonical",
      "passive_feature_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    const bookDir = join(
      directory,
      "canonical",
      "orderbook_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    mkdirSync(featureDir, { recursive: true });
    mkdirSync(bookDir, { recursive: true });

    const features = [];
    const books = [];
    for (let index = 0; index < 80; index += 1) {
      const timestampMs = 1_000 + index * 600_000;
      const entryAsk = 220 - index * 0.1;
      const exitBid = entryAsk + 2;
      features.push({
        dataset: "passive_feature_snapshot",
        market,
        event_timestamp_ms: timestampMs,
        ret_5m_bps: -25,
        buy_notional_share_60s: 0.7,
        depth_ratio_l5: 1.4,
        spread_bps: 1,
        turnover_24h_krw: 50_000_000_000,
        window_coverage_sec: 60,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: timestampMs,
        best_ask_price: entryAsk,
        best_bid_price: entryAsk - 0.01,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: timestampMs + 300_000,
        best_ask_price: exitBid + 0.01,
        best_bid_price: exitBid,
      });
    }

    writeNdjson(join(featureDir, "part-run.ndjson"), features);
    writeNdjson(join(bookDir, "part-run.ndjson"), books);

    const outputPath = join(directory, "order-flow-absorption.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-order-flow-continuation.js",
        "--base-dir",
        directory,
        "--markets",
        market,
        "--signal-mode",
        "absorption",
        "--fee-round-trip-bps",
        "8",
        "--horizon-seconds",
        "300",
        "--min-snapshots",
        "10",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      assumptions: { signalMode: string };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        market: string;
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.equal(report.assumptions.signalMode, "absorption");
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(report.promotionCandidates[0]?.market, market);
    assert.equal(report.promotionCandidates[0]!.train.count >= 30, true);
    assert.equal(report.promotionCandidates[0]!.test.count >= 15, true);
    assert.equal(report.promotionCandidates[0]!.train.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveTotalFoldCount, 5);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveMedianFoldCount, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("order-flow recovery scan requires a prior shock and current recovery confirmation", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-order-flow-recovery-"));
  try {
    const market = "KRW-BTC";
    const featureDir = join(
      directory,
      "canonical",
      "passive_feature_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    const bookDir = join(
      directory,
      "canonical",
      "orderbook_snapshot",
      "date=2026-05-13",
      `market=${market}`,
    );
    mkdirSync(featureDir, { recursive: true });
    mkdirSync(bookDir, { recursive: true });

    const features = [];
    const books = [];
    for (let index = 0; index < 80; index += 1) {
      const baseTimestampMs = 1_000 + index * 600_000;
      const signalTimestampMs = baseTimestampMs + 180_000;
      const entryAsk = 160 - index * 0.1;
      const exitBid = entryAsk + 2;
      features.push({
        dataset: "passive_feature_snapshot",
        market,
        event_timestamp_ms: baseTimestampMs,
        ret_5m_bps: -30,
        buy_notional_share_60s: 0.35,
        depth_ratio_l5: 1.0,
        spread_bps: 4,
        turnover_24h_krw: 50_000_000_000,
        window_coverage_sec: 60,
      });
      features.push({
        dataset: "passive_feature_snapshot",
        market,
        event_timestamp_ms: signalTimestampMs,
        ret_5m_bps: -20,
        buy_notional_share_60s: 0.65,
        depth_ratio_l5: 1.3,
        spread_bps: 2,
        turnover_24h_krw: 50_000_000_000,
        window_coverage_sec: 60,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: signalTimestampMs,
        best_ask_price: entryAsk,
        best_bid_price: entryAsk - 0.01,
      });
      books.push({
        dataset: "orderbook_snapshot",
        market,
        event_timestamp_ms: signalTimestampMs + 300_000,
        best_ask_price: exitBid + 0.01,
        best_bid_price: exitBid,
      });
    }

    writeNdjson(join(featureDir, "part-run.ndjson"), features);
    writeNdjson(join(bookDir, "part-run.ndjson"), books);

    const outputPath = join(directory, "order-flow-recovery.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-order-flow-continuation.js",
        "--base-dir",
        directory,
        "--markets",
        market,
        "--signal-mode",
        "recovery",
        "--fee-round-trip-bps",
        "8",
        "--horizon-seconds",
        "300",
        "--min-snapshots",
        "10",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      assumptions: { signalMode: string };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        market: string;
        recoveryLookbackSeconds: number;
        minRecoveryRetBps: number;
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.equal(report.assumptions.signalMode, "recovery");
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(report.promotionCandidates[0]?.market, market);
    assert.equal([60, 180, 300].includes(report.promotionCandidates[0]!.recoveryLookbackSeconds), true);
    assert.equal(report.promotionCandidates[0]!.minRecoveryRetBps <= 10, true);
    assert.equal(report.promotionCandidates[0]!.train.count >= 30, true);
    assert.equal(report.promotionCandidates[0]!.test.count >= 15, true);
    assert.equal(report.promotionCandidates[0]!.train.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveTotalFoldCount, 5);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveMedianFoldCount, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
