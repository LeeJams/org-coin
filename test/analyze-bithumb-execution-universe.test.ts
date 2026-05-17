import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("execution universe screen separates executable markets from live-compatible markets", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-execution-universe-"));
  try {
    const tickersPath = join(directory, "tickers.json");
    const orderbooksPath = join(directory, "orderbooks.json");
    writeFileSync(
      tickersPath,
      JSON.stringify([
        {
          market: "KRW-BTC",
          acc_trade_price_24h: 100_000_000_000,
        },
        {
          market: "KRW-ALT",
          acc_trade_price_24h: 60_000_000_000,
        },
        {
          market: "KRW-WIDE",
          acc_trade_price_24h: 80_000_000_000,
        },
      ]),
      "utf8",
    );
    writeFileSync(
      orderbooksPath,
      JSON.stringify([
        {
          market: "KRW-BTC",
          orderbook_units: [
            {
              ask_price: 100.1,
              bid_price: 100,
              ask_size: 10_000,
              bid_size: 10_000,
            },
          ],
        },
        {
          market: "KRW-ALT",
          orderbook_units: [
            {
              ask_price: 50.05,
              bid_price: 50,
              ask_size: 20_000,
              bid_size: 20_000,
            },
          ],
        },
        {
          market: "KRW-WIDE",
          orderbook_units: [
            {
              ask_price: 11,
              bid_price: 10,
              ask_size: 100_000,
              bid_size: 100_000,
            },
          ],
        },
      ]),
      "utf8",
    );

    const outputPath = join(directory, "execution-universe.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-execution-universe.js",
        "--input-tickers",
        tickersPath,
        "--input-orderbooks",
        orderbooksPath,
        "--notional-krw",
        "500000",
        "--max-spread-bps",
        "20",
        "--min-turnover-24h-krw",
        "30000000000",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      summary: {
        executionCandidateCount: number;
        liveCompatibleExecutionCandidateCount: number;
        bestExecutionCandidates: string[];
        liveCompatibleExecutionCandidates: string[];
      };
      markets: Array<{
        market: string;
        executionCandidate: boolean;
        liveInfrastructureReady: boolean;
        reasons: string[];
      }>;
    };

    assert.equal(report.summary.executionCandidateCount, 2);
    assert.equal(report.summary.liveCompatibleExecutionCandidateCount, 1);
    assert.deepEqual(report.summary.bestExecutionCandidates, ["KRW-BTC", "KRW-ALT"]);
    assert.deepEqual(report.summary.liveCompatibleExecutionCandidates, ["KRW-BTC"]);
    assert.equal(report.markets[0]?.market, "KRW-BTC");
    assert.equal(report.markets[0]?.executionCandidate, true);
    assert.equal(report.markets[0]?.liveInfrastructureReady, true);
    assert.equal(report.markets[1]?.market, "KRW-ALT");
    assert.equal(report.markets[1]?.executionCandidate, true);
    assert.equal(report.markets[1]?.liveInfrastructureReady, false);
    assert.equal(report.markets[2]?.market, "KRW-WIDE");
    assert.deepEqual(report.markets[2]?.reasons, ["spread_above_threshold"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
