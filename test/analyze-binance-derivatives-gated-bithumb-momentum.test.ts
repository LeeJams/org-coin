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

test("binance derivatives gated bithumb momentum reports diagnostic improvement without promotion", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-derivatives-gated-momentum-"));
  try {
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "output.json");
    mkdirSync(directory, { recursive: true });

    const candles = [];
    const fundingRate = [];
    const openInterestHist = [];
    const globalLongShortAccountRatio = [];
    const takerLongShortRatio = [];
    const start = Date.parse("2026-05-01T00:00:00.000Z");
    for (let cycle = 0; cycle < 30; cycle += 1) {
      const goodRegime = cycle % 2 === 0;
      const base = 100 + cycle * 0.2;
      const prices = goodRegime
        ? [
            base,
            base + 2,
            base + 4,
            base + 6,
            base + 8,
            base + 12,
            base + 16,
            base + 20,
            base + 24,
            base + 28,
            base + 32,
            base + 36,
          ]
        : [
            base,
            base + 2,
            base + 4,
            base + 6,
            base + 8,
            base - 10,
            base - 20,
            base - 30,
            base - 40,
            base - 42,
            base - 44,
            base - 46,
          ];
      for (let offset = 0; offset < prices.length; offset += 1) {
        const index = cycle * prices.length + offset;
        const timestamp = start + index * 60 * 60 * 1000;
        candles.push({ timestampMs: timestamp, close: prices[offset] });
        fundingRate.push({ fundingRate: "0.00005", fundingTime: timestamp });
        openInterestHist.push({
          timestamp,
          sumOpenInterestValue: String(goodRegime ? 1_000_000 + index * 1_000 : 1_000_000 - index * 100),
        });
        globalLongShortAccountRatio.push({
          timestamp,
          longShortRatio: goodRegime ? "0.9" : "2.0",
        });
        takerLongShortRatio.push({
          timestamp,
          buySellRatio: goodRegime ? "1.3" : "0.7",
        });
      }
    }

    writeFileSync(
      inputPath,
      JSON.stringify({
        pairs: {
          "KRW-BTC:BTCUSDT": {
            candles,
            derivatives: {
              fundingRate,
              openInterestHist,
              globalLongShortAccountRatio,
              takerLongShortRatio,
            },
          },
        },
      }),
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-binance-derivatives-gated-bithumb-momentum.js",
        "--pairs",
        "KRW-BTC:BTCUSDT",
        "--input",
        inputPath,
        "--fee-round-trip-bps",
        "1",
        "--open-interest-change-lookback-hours",
        "1",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      source: string;
      promotionCandidateCount: number;
      diagnosticImprovementCount: number;
      pairs: Array<{
        source: { candleSpanDays: number; pairedSpanDays: number; spanDays: number };
        topDiagnosticCandidates: Array<{
          diagnosticImprovement: boolean;
          baselineTest: { totalPnlKrw: number; medianPnlKrw: number };
          test: { count: number; totalPnlKrw: number; medianPnlKrw: number };
          promotionEligible: boolean;
        }>;
      }>;
    };

    assert.equal(report.source, "input_snapshot");
    assert.equal(report.promotionCandidateCount, 0);
    assert.equal(report.diagnosticImprovementCount > 0, true);
    assert.equal(report.pairs[0]!.source.spanDays < 90, true);
    assert.equal(report.pairs[0]!.source.pairedSpanDays, report.pairs[0]!.source.spanDays);
    const improved = report.pairs[0]!.topDiagnosticCandidates.find(
      (candidate) => candidate.diagnosticImprovement,
    );
    assert.notEqual(improved, undefined);
    assert.equal(improved!.promotionEligible, false);
    assert.equal(improved!.test.totalPnlKrw > improved!.baselineTest.totalPnlKrw, true);
    assert.equal(improved!.test.medianPnlKrw > improved!.baselineTest.medianPnlKrw, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("binance derivatives gated bithumb momentum uses paired derivatives span for promotion", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-derivatives-gated-span-"));
  try {
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "output.json");
    mkdirSync(directory, { recursive: true });

    const candles = [];
    const fundingRate = [];
    const openInterestHist = [];
    const globalLongShortAccountRatio = [];
    const takerLongShortRatio = [];
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const hourMs = 60 * 60 * 1000;
    for (let index = 0; index < 120 * 24; index += 1) {
      const timestamp = start + index * hourMs;
      candles.push({ timestampMs: timestamp, close: 100 + index * 0.01 });
    }
    const derivativeStartIndex = 110 * 24;
    for (let index = derivativeStartIndex; index < 120 * 24; index += 1) {
      const timestamp = start + index * hourMs;
      fundingRate.push({ fundingRate: "0.00001", fundingTime: timestamp });
      openInterestHist.push({
        timestamp,
        sumOpenInterestValue: String(1_000_000 + index * 100),
      });
      globalLongShortAccountRatio.push({ timestamp, longShortRatio: "0.8" });
      takerLongShortRatio.push({ timestamp, buySellRatio: "1.5" });
    }

    writeFileSync(
      inputPath,
      JSON.stringify({
        pairs: {
          "KRW-BTC:BTCUSDT": {
            candles,
            derivatives: {
              fundingRate,
              openInterestHist,
              globalLongShortAccountRatio,
              takerLongShortRatio,
            },
          },
        },
      }),
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-binance-derivatives-gated-bithumb-momentum.js",
        "--pairs",
        "KRW-BTC:BTCUSDT",
        "--input",
        inputPath,
        "--fee-round-trip-bps",
        "1",
        "--open-interest-change-lookback-hours",
        "1",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      promotionCandidateCount: number;
      pairs: Array<{
        source: {
          candleSpanDays: number;
          pairedSpanDays: number;
          spanDays: number;
          pairedCandleCount: number;
        };
      }>;
    };

    const source = report.pairs[0]!.source;
    assert.equal(source.candleSpanDays > 90, true);
    assert.equal(source.pairedSpanDays < 10, true);
    assert.equal(source.spanDays, source.pairedSpanDays);
    assert.equal(source.pairedCandleCount < candles.length, true);
    assert.equal(report.promotionCandidateCount, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("binance derivatives gated bithumb momentum does not count loss reduction as diagnostic improvement", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-derivatives-gated-loss-reduction-"));
  try {
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "output.json");
    mkdirSync(directory, { recursive: true });

    const candles = [];
    const fundingRate = [];
    const openInterestHist = [];
    const globalLongShortAccountRatio = [];
    const takerLongShortRatio = [];
    const start = Date.parse("2026-05-01T00:00:00.000Z");
    for (let index = 0; index < 240; index += 1) {
      const timestamp = start + index * 60 * 60 * 1000;
      candles.push({ timestampMs: timestamp, close: 100 - index * 0.01 });
      fundingRate.push({ fundingRate: "0.00001", fundingTime: timestamp });
      openInterestHist.push({ timestamp, sumOpenInterestValue: String(1_000_000 + index * 100) });
      globalLongShortAccountRatio.push({ timestamp, longShortRatio: "0.9" });
      takerLongShortRatio.push({ timestamp, buySellRatio: index % 3 === 0 ? "1.2" : "0.7" });
    }

    writeFileSync(
      inputPath,
      JSON.stringify({
        pairs: {
          "KRW-BTC:BTCUSDT": {
            candles,
            derivatives: {
              fundingRate,
              openInterestHist,
              globalLongShortAccountRatio,
              takerLongShortRatio,
            },
          },
        },
      }),
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-binance-derivatives-gated-bithumb-momentum.js",
        "--pairs",
        "KRW-BTC:BTCUSDT",
        "--input",
        inputPath,
        "--fee-round-trip-bps",
        "1",
        "--open-interest-change-lookback-hours",
        "1",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      diagnosticImprovementCount: number;
      pairs: Array<{
        topDiagnosticCandidates: Array<{
          diagnosticImprovement: boolean;
          baselineTest: { totalPnlKrw: number };
          test: { totalPnlKrw: number };
        }>;
      }>;
    };

    assert.equal(report.diagnosticImprovementCount, 0);
    assert.equal(
      report.pairs[0]!.topDiagnosticCandidates.every((candidate) => !candidate.diagnosticImprovement),
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
