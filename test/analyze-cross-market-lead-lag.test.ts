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

test("cross-market lead-lag scan reports fee-stressed promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-market-"));
  try {
    const markets = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
    for (const market of markets) {
      const candleDir = join(directory, "canonical", "candle_1m", "date=2026-05-13", `market=${market}`);
      const bookDir = join(directory, "canonical", "orderbook_snapshot", "date=2026-05-13", `market=${market}`);
      mkdirSync(candleDir, { recursive: true });
      mkdirSync(bookDir, { recursive: true });

      const candles = [];
      const books = [];
      for (let index = 0; index < 420; index += 1) {
        const timestampMs = 1_000 + index * 60_000;
        const trend = market === "KRW-XRP" ? 0.01 : 0.2;
        const close = 100 + index * trend;
        candles.push({
          dataset: "candle_1m",
          market,
          candle_timestamp_ms: timestampMs,
          close_price: close,
        });
        books.push({
          dataset: "orderbook_snapshot",
          market,
          event_timestamp_ms: timestampMs,
          best_ask_price: close,
          best_bid_price: close - 0.01,
        });
      }
      writeNdjson(join(candleDir, "part-run.ndjson"), candles);
      writeNdjson(join(bookDir, "part-run.ndjson"), books);
    }

    const outputPath = join(directory, "cross-market.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-market-lead-lag.js",
        "--base-dir",
        directory,
        "--markets",
        markets.join(","),
        "--fee-round-trip-bps",
        "8",
        "--min-candles",
        "100",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      sourceReady: boolean;
      candidateCount: number;
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        targetMarket: string;
        minConfirmingMarkets: number;
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.equal(report.sourceReady, true);
    assert.equal(report.candidateCount > 0, true);
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(["KRW-BTC", "KRW-ETH"].includes(report.promotionCandidates[0]!.targetMarket), true);
    assert.equal(report.promotionCandidates[0]!.minConfirmingMarkets >= 2, true);
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

test("cross-market lead-lag scan can require a single configured leader", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-market-leader-"));
  try {
    const markets = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
    for (const market of markets) {
      const candleDir = join(directory, "canonical", "candle_1m", "date=2026-05-13", `market=${market}`);
      const bookDir = join(directory, "canonical", "orderbook_snapshot", "date=2026-05-13", `market=${market}`);
      mkdirSync(candleDir, { recursive: true });
      mkdirSync(bookDir, { recursive: true });

      const candles = [];
      const books = [];
      for (let index = 0; index < 420; index += 1) {
        const timestampMs = 1_000 + index * 60_000;
        const trend = market === "KRW-XRP" ? 0.01 : 0.2;
        const close = 100 + index * trend;
        candles.push({
          dataset: "candle_1m",
          market,
          candle_timestamp_ms: timestampMs,
          close_price: close,
        });
        books.push({
          dataset: "orderbook_snapshot",
          market,
          event_timestamp_ms: timestampMs,
          best_ask_price: close,
          best_bid_price: close - 0.01,
        });
      }
      writeNdjson(join(candleDir, "part-run.ndjson"), candles);
      writeNdjson(join(bookDir, "part-run.ndjson"), books);
    }

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-market-lead-lag.js",
        "--base-dir",
        directory,
        "--markets",
        markets.join(","),
        "--leader-market",
        "KRW-BTC",
        "--fee-round-trip-bps",
        "8",
        "--min-candles",
        "100",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      assumptions: {
        leaderMarket: string;
        targetMarkets: string[];
      };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        targetMarket: string;
        leaderMarket: string;
        minConfirmingMarkets: number;
      }>;
    };

    assert.equal(report.assumptions.leaderMarket, "KRW-BTC");
    assert.deepEqual(report.assumptions.targetMarkets, ["KRW-ETH", "KRW-XRP"]);
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.notEqual(report.promotionCandidates[0]!.targetMarket, "KRW-BTC");
    assert.equal(report.promotionCandidates[0]!.leaderMarket, "KRW-BTC");
    assert.equal(report.promotionCandidates[0]!.minConfirmingMarkets, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-market lead-lag scan can test negative leader signals", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-market-negative-leader-"));
  try {
    const markets = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
    for (const market of markets) {
      const candleDir = join(directory, "canonical", "candle_1m", "date=2026-05-13", `market=${market}`);
      const bookDir = join(directory, "canonical", "orderbook_snapshot", "date=2026-05-13", `market=${market}`);
      mkdirSync(candleDir, { recursive: true });
      mkdirSync(bookDir, { recursive: true });

      const candles = [];
      const books = [];
      for (let index = 0; index < 420; index += 1) {
        const timestampMs = 1_000 + index * 60_000;
        const close = market === "KRW-BTC" ? 200 - index * 0.2 : 100 + index * 0.2;
        candles.push({
          dataset: "candle_1m",
          market,
          candle_timestamp_ms: timestampMs,
          close_price: close,
        });
        books.push({
          dataset: "orderbook_snapshot",
          market,
          event_timestamp_ms: timestampMs,
          best_ask_price: close,
          best_bid_price: close - 0.01,
        });
      }
      writeNdjson(join(candleDir, "part-run.ndjson"), candles);
      writeNdjson(join(bookDir, "part-run.ndjson"), books);
    }

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-market-lead-lag.js",
        "--base-dir",
        directory,
        "--markets",
        markets.join(","),
        "--leader-market",
        "KRW-BTC",
        "--signal-direction",
        "negative",
        "--fee-round-trip-bps",
        "8",
        "--min-candles",
        "100",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      assumptions: {
        leaderMarket: string;
        signalDirection: string;
      };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        targetMarket: string;
        leaderMarket: string;
        signalDirection: string;
        train: { count: number; totalPnlKrw: number };
        test: { count: number; medianPnlKrw: number };
      }>;
    };

    assert.equal(report.assumptions.leaderMarket, "KRW-BTC");
    assert.equal(report.assumptions.signalDirection, "negative");
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.notEqual(report.promotionCandidates[0]!.targetMarket, "KRW-BTC");
    assert.equal(report.promotionCandidates[0]!.leaderMarket, "KRW-BTC");
    assert.equal(report.promotionCandidates[0]!.signalDirection, "negative");
    assert.equal(report.promotionCandidates[0]!.train.count >= 30, true);
    assert.equal(report.promotionCandidates[0]!.test.count >= 15, true);
    assert.equal(report.promotionCandidates[0]!.train.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.medianPnlKrw > 0, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
