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

test("intraday session edge scan reports fee-stressed promotion evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-intraday-session-"));
  try {
    const market = "KRW-BTC";
    const candleDir = join(directory, "canonical", "candle_1m", "date=2026-05-13", `market=${market}`);
    const bookDir = join(directory, "canonical", "orderbook_snapshot", "date=2026-05-13", `market=${market}`);
    mkdirSync(candleDir, { recursive: true });
    mkdirSync(bookDir, { recursive: true });

    const candles = [];
    const books = [];
    const first = Date.parse("2026-01-01T00:00:00Z");
    for (let index = 0; index < 100; index += 1) {
      const timestampMs = first + index * 24 * 60 * 60 * 1000;
      const entryAsk = 100 + index;
      const exitBid = entryAsk + 2;
      candles.push({
        dataset: "candle_1m",
        market,
        candle_timestamp_ms: timestampMs,
        close_price: entryAsk,
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
        event_timestamp_ms: timestampMs + 15 * 60_000,
        best_ask_price: exitBid + 0.01,
        best_bid_price: exitBid,
      });
    }

    writeNdjson(join(candleDir, "part-run.ndjson"), candles);
    writeNdjson(join(bookDir, "part-run.ndjson"), books);

    const outputPath = join(directory, "intraday-session.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-intraday-session-edge.js",
        "--base-dir",
        directory,
        "--markets",
        market,
        "--fee-round-trip-bps",
        "8",
        "--min-candles",
        "50",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      candidateCount: number;
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        market: string;
        sessionType: string;
        hourKst: number;
        holdBars: number;
        train: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
        walkForward: { positiveTotalFoldCount: number; positiveMedianFoldCount: number };
      }>;
    };

    assert.equal(report.candidateCount > 0, true);
    assert.equal(report.promotionCandidateCount > 0, true);
    assert.equal(report.promotionCandidates[0]?.market, market);
    assert.equal(report.promotionCandidates[0]!.sessionType, "hourKst");
    assert.equal(report.promotionCandidates[0]!.hourKst, 9);
    assert.equal(report.promotionCandidates[0]!.holdBars, 15);
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
