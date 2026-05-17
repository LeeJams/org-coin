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

test("candidate benchmark compares compounded strategy return with buy and hold", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-candidate-benchmark-"));
  try {
    const candlesPath = join(directory, "candles.json");
    const candles = Array.from({ length: 80 }, (_, index) => ({
      candle_timestamp_ms: (index + 1) * 60_000,
      close_price: 100 + index,
      high_price: 100 + index,
      low_price: 100 + index,
    }));
    writeFileSync(candlesPath, JSON.stringify(candles), "utf8");

    const outputPath = join(directory, "benchmark.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-candidate-benchmark.js",
        "--input-candles",
        candlesPath,
        "--signal-mode",
        "momentum",
        "--lookback-bars",
        "1",
        "--hold-bars",
        "1",
        "--min-return-bps",
        "1",
        "--risk-filter",
        "none",
        "--fee-round-trip-bps",
        "1",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      source: { candleCount: number; fetchedFromPublicApi: boolean };
      strategy: {
        tradeCount: number;
        winners: number;
        finalCapitalKrw: number;
        returnPct: number;
        exposurePct: number;
      };
      benchmark: {
        buyHoldReturnPct: number;
        excessReturnVsBuyHoldPct: number;
      };
      validation: {
        train: { count: number; medianPnlKrw: number | null };
        test: { count: number; medianPnlKrw: number | null };
        walkForwardSummary: { foldCount: number; folds: unknown[] };
        checks: { minimumTotalTrades: boolean };
      };
    };

    assert.equal(report.source.candleCount, 80);
    assert.equal(report.source.fetchedFromPublicApi, false);
    assert.ok(report.strategy.tradeCount > 0);
    assert.equal(report.strategy.winners, report.strategy.tradeCount);
    assert.ok(report.strategy.finalCapitalKrw > 500_000);
    assert.ok(report.strategy.returnPct > 0);
    assert.ok(report.strategy.exposurePct > 0);
    assert.equal(report.benchmark.buyHoldReturnPct, 79);
    assert.ok(report.validation.train.count > 0);
    assert.ok(report.validation.test.count > 0);
    assert.equal(report.validation.walkForwardSummary.foldCount, 5);
    assert.equal(report.validation.walkForwardSummary.folds.length, 5);
    assert.equal(typeof report.validation.checks.minimumTotalTrades, "boolean");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("candidate benchmark accepts a zero minimum return threshold", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-candidate-benchmark-zero-min-"));
  try {
    const candlesPath = join(directory, "candles.json");
    const candles = Array.from({ length: 30 }, (_, index) => ({
      candle_timestamp_ms: (index + 1) * 60_000,
      close_price: 100 + index,
      high_price: 100 + index,
      low_price: 100 + index,
    }));
    writeFileSync(candlesPath, JSON.stringify(candles), "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-candidate-benchmark.js",
        "--input-candles",
        candlesPath,
        "--signal-mode",
        "momentum",
        "--lookback-bars",
        "1",
        "--hold-bars",
        "1",
        "--min-return-bps",
        "0",
        "--risk-filter",
        "none",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      candidate: { minReturnBps: number };
      strategy: { tradeCount: number };
    };
    assert.equal(report.candidate.minReturnBps, 0);
    assert.ok(report.strategy.tradeCount > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("candidate benchmark can evaluate profit-protect exits", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-candidate-benchmark-profit-protect-"));
  try {
    const candlesPath = join(directory, "candles.json");
    const prices = Array.from({ length: 40 }, () => 100);
    prices[23] = 99;
    prices[24] = 100;
    prices[25] = 104;
    prices[26] = 101;
    prices[27] = 100.5;
    prices[28] = 99;
    const candles = prices.map((price, index) => ({
      candle_timestamp_ms: (index + 1) * 60_000,
      close_price: price,
      high_price: price,
      low_price: price,
    }));
    writeFileSync(candlesPath, JSON.stringify(candles), "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-candidate-benchmark.js",
        "--input-candles",
        candlesPath,
        "--signal-mode",
        "momentum",
        "--lookback-bars",
        "1",
        "--hold-bars",
        "4",
        "--min-return-bps",
        "0",
        "--risk-filter",
        "none",
        "--fee-round-trip-bps",
        "1",
        "--exit-policy",
        "profit_protect",
        "--profit-protect-min-peak-pnl-krw",
        "1000",
        "--profit-protect-min-drawdown-krw",
        "1000",
        "--profit-protect-drawdown-bps",
        "0",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      candidate: {
        exitPolicy: string;
        profitProtect: {
          minPeakPnlKrw: number;
          minDrawdownKrw: number;
          drawdownBps: number;
        } | null;
      };
      strategy: {
        tradeCount: number;
        totalPnlKrw: number;
        exitReasonCounts: Record<string, number>;
      };
    };

    assert.equal(report.candidate.exitPolicy, "profit_protect");
    assert.deepEqual(report.candidate.profitProtect, {
      minPeakPnlKrw: 1000,
      minDrawdownKrw: 1000,
      drawdownBps: 0,
    });
    assert.ok(report.strategy.tradeCount > 0);
    assert.equal(report.strategy.exitReasonCounts.profit_protect, 1);
    assert.ok(report.strategy.totalPnlKrw > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
