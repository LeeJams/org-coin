import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function candle(market: string, timestampMs: number, close: number): Record<string, unknown> {
  return {
    market,
    candle_date_time_utc: new Date(timestampMs).toISOString().slice(0, 19),
    opening_price: close,
    high_price: close,
    low_price: close,
    trade_price: close,
    candle_acc_trade_price: 1_000_000,
  };
}

test("upbit-bithumb lead-lag scan reports fee-stressed promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-upbit-bithumb-lead-lag-"));
  try {
    const market = "KRW-BTC";
    const upbitCandles = [];
    const bithumbCandles = [];
    let upbitClose = 100;
    let bithumbClose = 100;

    for (let index = 0; index < 2_400; index += 1) {
      const timestampMs = 1_000 + index * 60_000;
      if (index % 12 === 0 && index > 0) {
        upbitClose += 2;
      } else {
        upbitClose += 0.01;
      }
      if (index % 12 === 2 && index > 2) {
        bithumbClose += 2;
      } else {
        bithumbClose += 0.01;
      }
      upbitCandles.push(candle(market, timestampMs, upbitClose));
      bithumbCandles.push(candle(market, timestampMs, bithumbClose));
    }

    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "report.json");
    writeFileSync(
      inputPath,
      `${JSON.stringify({ pairs: [{ market, upbitCandles, bithumbCandles }] })}\n`,
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-upbit-bithumb-lead-lag.js",
        "--input",
        inputPath,
        "--markets",
        market,
        "--unit-minutes",
        "1",
        "--min-candles",
        "100",
        "--min-promotion-span-days",
        "0.1",
        "--fee-round-trip-bps",
        "8",
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
        market: string;
        leaderVenue: string;
        executionVenue: string;
        lagBars: number;
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.equal(report.sourceReady, true);
    assert.equal(report.candidateCount > 0, true);
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(report.promotionCandidates[0]!.market, market);
    assert.equal(report.promotionCandidates[0]!.leaderVenue, "upbit");
    assert.equal(report.promotionCandidates[0]!.executionVenue, "bithumb");
    assert.equal(report.promotionCandidates[0]!.lagBars >= 1, true);
    assert.equal(report.promotionCandidates[0]!.train.count >= 30, true);
    assert.equal(report.promotionCandidates[0]!.test.count >= 15, true);
    assert.equal(report.promotionCandidates[0]!.train.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.train.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveTotalFoldCount >= 4, true);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveMedianFoldCount >= 4, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("upbit-bithumb lead-lag scan blocks promotion when aligned source span is too short", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-upbit-bithumb-short-span-"));
  try {
    const market = "KRW-BTC";
    const upbitCandles = [];
    const bithumbCandles = [];
    for (let index = 0; index < 180; index += 1) {
      const timestampMs = 1_000 + index * 60_000;
      upbitCandles.push(candle(market, timestampMs, 100 + index));
      bithumbCandles.push(candle(market, timestampMs, 100 + index));
    }
    const inputPath = join(directory, "input.json");
    writeFileSync(
      inputPath,
      `${JSON.stringify({ pairs: [{ market, upbitCandles, bithumbCandles }] })}\n`,
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-upbit-bithumb-lead-lag.js",
        "--input",
        inputPath,
        "--markets",
        market,
        "--unit-minutes",
        "1",
        "--min-candles",
        "100",
        "--min-promotion-span-days",
        "7",
        "--fee-round-trip-bps",
        "8",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      sourceReady: boolean;
      sourceFailureCount: number;
      promotionCandidateCount: number;
      sourceFailures: Array<{ reason: string }>;
    };
    assert.equal(report.sourceReady, false);
    assert.equal(report.sourceFailureCount, 1);
    assert.equal(report.sourceFailures[0]!.reason, "insufficient_aligned_candles_or_span");
    assert.equal(report.promotionCandidateCount, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
