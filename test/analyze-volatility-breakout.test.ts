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

function writeCandles(path: string): void {
  const candles = [];
  let base = 100;
  let timestampMs = Date.parse("2025-01-01T00:00:00.000Z");

  for (let cycle = 0; candles.length < 4_000; cycle += 1) {
    base *= 1.018;
    for (let bar = 0; bar < 48 && candles.length < 4_000; bar += 1) {
      let close = base;
      let volume = 1_000_000;
      if (bar === 36) {
        close = base * 1.01;
        volume = 2_500_000;
      } else if (bar > 36) {
        close = base * (1.01 + (bar - 36) * 0.0015);
      }
      candles.push({
        candle_date_time_utc: new Date(timestampMs).toISOString().slice(0, 19),
        trade_price: close,
        high_price: close * 1.0002,
        low_price: close * 0.9998,
        candle_acc_trade_price: volume,
      });
      timestampMs += 60 * 60 * 1000;
    }
  }

  writeFileSync(path, `${JSON.stringify(candles, null, 2)}\n`, "utf8");
}

test("volatility breakout scan reports fee-stressed promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-vol-breakout-"));
  try {
    mkdirSync(directory, { recursive: true });
    const inputPath = join(directory, "candles.json");
    const outputPath = join(directory, "volatility-breakout.json");
    writeCandles(inputPath);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-volatility-breakout.js",
        "--market",
        "KRW-BTC",
        "--input-candles",
        inputPath,
        "--fee-round-trip-bps",
        "8",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      source: { candleCount: number; fetchedFromPublicApi: boolean };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.equal(report.source.candleCount, 4_000);
    assert.equal(report.source.fetchedFromPublicApi, false);
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(report.promotionCandidates[0]!.train.count >= 30, true);
    assert.equal(report.promotionCandidates[0]!.test.count >= 15, true);
    assert.equal(report.promotionCandidates[0]!.train.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.train.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.totalPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.test.medianPnlKrw > 0, true);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveTotalFoldCount, 5);
    assert.equal(report.promotionCandidates[0]!.walkForward.positiveMedianFoldCount, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
