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

test("bithumb cross-sectional momentum scan can rotate across local market fixtures", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-xsmom-"));
  try {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const markets = ["KRW_AAA", "KRW_BBB", "KRW_CCC"];
    for (const [marketIndex, market] of markets.entries()) {
      let price = 100 + marketIndex * 10;
      const candles = [];
      for (let index = 0; index < 4000; index += 1) {
        const boost =
          (marketIndex === 0 && index < 1400) ||
          (marketIndex === 1 && index >= 1400 && index < 2800) ||
          (marketIndex === 2 && index >= 2800);
        price *= boost ? 1.0025 : 1.0003;
        candles.push({
          timestamp: start + index * 60 * 60 * 1000,
          trade_price: price,
        });
      }
      writeFileSync(join(directory, `${market}.json`), `${JSON.stringify(candles)}\n`, "utf8");
    }

    const outputPath = join(directory, "cross-sectional.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-cross-sectional-momentum.js",
        "--markets",
        "KRW-AAA,KRW-BBB,KRW-CCC",
        "--input-dir",
        directory,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      assumptions: { feeRoundTripBps: number };
      source: { timestampCount: number; fetchedFromPublicApi: boolean };
      promotionCandidateCount: number;
      promotionCandidates: Array<{
        train: { totalPnlKrw: number; marketsTraded: Record<string, number> };
        test: { totalPnlKrw: number; medianPnlKrw: number };
      }>;
    };
    assert.equal(report.assumptions.feeRoundTripBps, 8);
    assert.equal(report.source.timestampCount, 4000);
    assert.equal(report.source.fetchedFromPublicApi, false);
    assert.ok(report.promotionCandidateCount > 0);
    assert.ok(report.promotionCandidates[0]?.train.totalPnlKrw ?? 0 > 0);
    assert.ok(report.promotionCandidates[0]?.test.totalPnlKrw ?? 0 > 0);
    assert.ok(report.promotionCandidates[0]?.test.medianPnlKrw ?? 0 > 0);
    assert.ok(Object.keys(report.promotionCandidates[0]?.train.marketsTraded ?? {}).length > 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("bithumb cross-sectional momentum scan applies configured round-trip fees", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-xsmom-fee-"));
  try {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const markets = ["KRW_AAA", "KRW_BBB", "KRW_CCC"];
    for (const [marketIndex, market] of markets.entries()) {
      let price = 100 + marketIndex * 10;
      const candles = [];
      for (let index = 0; index < 4000; index += 1) {
        const boost =
          (marketIndex === 0 && index < 1400) ||
          (marketIndex === 1 && index >= 1400 && index < 2800) ||
          (marketIndex === 2 && index >= 2800);
        price *= boost ? 1.0025 : 1.0003;
        candles.push({
          timestamp: start + index * 60 * 60 * 1000,
          trade_price: price,
        });
      }
      writeFileSync(join(directory, `${market}.json`), `${JSON.stringify(candles)}\n`, "utf8");
    }

    const lowFee = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "dist/src/cli/analyze-bithumb-cross-sectional-momentum.js",
          "--markets",
          "KRW-AAA,KRW-BBB,KRW-CCC",
          "--input-dir",
          directory,
          "--fee-round-trip-bps",
          "8",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      ),
    ) as {
      assumptions: { feeRoundTripBps: number };
      topByTest: Array<{ test: { totalPnlKrw: number } }>;
    };
    const highFee = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "dist/src/cli/analyze-bithumb-cross-sectional-momentum.js",
          "--markets",
          "KRW-AAA,KRW-BBB,KRW-CCC",
          "--input-dir",
          directory,
          "--fee-round-trip-bps",
          "50",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      ),
    ) as {
      assumptions: { feeRoundTripBps: number };
      topByTest: Array<{ test: { totalPnlKrw: number } }>;
    };

    assert.equal(lowFee.assumptions.feeRoundTripBps, 8);
    assert.equal(highFee.assumptions.feeRoundTripBps, 50);
    assert.ok((highFee.topByTest[0]?.test.totalPnlKrw ?? 0) < (lowFee.topByTest[0]?.test.totalPnlKrw ?? 0));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
