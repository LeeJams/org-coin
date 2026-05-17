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

test("bithumb momentum scan can read local candle fixtures", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-momentum-"));
  try {
    const candles = [];
    let price = 100;
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    for (let index = 0; index < 4000; index += 1) {
      price *= index < 2800 ? 1.001 : 1.002;
      candles.push({
        timestamp: start + index * 60 * 60 * 1000,
        trade_price: price,
        high_price: price * 1.001,
        low_price: price * 0.999,
        candle_acc_trade_price: 1_000_000,
      });
    }
    const inputPath = join(directory, "candles.json");
    const outputPath = join(directory, "momentum.json");
    writeFileSync(inputPath, `${JSON.stringify(candles)}\n`, "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-momentum.js",
        "--input-candles",
        inputPath,
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
        train: { totalPnlKrw: number };
        test: { totalPnlKrw: number; medianPnlKrw: number };
      }>;
    };
    assert.equal(report.source.candleCount, 4000);
    assert.equal(report.source.fetchedFromPublicApi, false);
    assert.ok(report.promotionCandidateCount > 0);
    assert.ok(report.promotionCandidates[0]?.train.totalPnlKrw ?? 0 > 0);
    assert.ok(report.promotionCandidates[0]?.test.totalPnlKrw ?? 0 > 0);
    assert.ok(report.promotionCandidates[0]?.test.medianPnlKrw ?? 0 > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("bithumb momentum scan can evaluate reversal signals", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-reversal-"));
  try {
    const candles = [];
    let price = 100;
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    for (let index = 0; index < 4000; index += 1) {
      const phase = index % 48;
      price *= phase < 24 ? 0.998 : 1.004;
      candles.push({
        timestamp: start + index * 60 * 60 * 1000,
        trade_price: price,
        high_price: price * 1.001,
        low_price: price * 0.999,
        candle_acc_trade_price: 1_000_000,
      });
    }
    const inputPath = join(directory, "candles.json");
    const outputPath = join(directory, "reversal.json");
    writeFileSync(inputPath, `${JSON.stringify(candles)}\n`, "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-momentum.js",
        "--signal-mode",
        "reversal",
        "--input-candles",
        inputPath,
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
        train: { totalPnlKrw: number; medianPnlKrw: number };
        test: { totalPnlKrw: number; medianPnlKrw: number };
      }>;
    };
    assert.equal(report.assumptions.signalMode, "reversal");
    assert.ok(report.promotionCandidateCount > 0);
    assert.ok(report.promotionCandidates[0]?.train.totalPnlKrw ?? 0 > 0);
    assert.ok(report.promotionCandidates[0]?.train.medianPnlKrw ?? 0 > 0);
    assert.ok(report.promotionCandidates[0]?.test.totalPnlKrw ?? 0 > 0);
    assert.ok(report.promotionCandidates[0]?.test.medianPnlKrw ?? 0 > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("bithumb momentum scan can expose trade timestamps for execution audit", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-momentum-audit-"));
  try {
    const candles = [];
    let price = 100;
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    for (let index = 0; index < 4000; index += 1) {
      price *= index < 2800 ? 1.001 : 1.002;
      candles.push({
        timestamp: start + index * 60 * 60 * 1000,
        trade_price: price,
        high_price: price * 1.001,
        low_price: price * 0.999,
        candle_acc_trade_price: 1_000_000,
      });
    }
    const inputPath = join(directory, "candles.json");
    writeFileSync(inputPath, `${JSON.stringify(candles)}\n`, "utf8");

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-bithumb-momentum.js",
        "--input-candles",
        inputPath,
        "--include-trade-audit",
        "--trade-audit-limit",
        "2",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      assumptions: {
        tradeAudit: { enabled: boolean; limitPerTrainOrTestCandidate: number };
      };
      topByTest: Array<{
        tradeAudit?: {
          train: {
            count: number;
            trades: Array<{ entryAt: number; exitAt: number; pnlKrw: number }>;
          };
          test: {
            count: number;
            trades: Array<{ entryAt: number; exitAt: number; pnlKrw: number }>;
          };
        };
      }>;
    };
    const audit = report.topByTest[0]?.tradeAudit;
    assert.equal(report.assumptions.tradeAudit.enabled, true);
    assert.equal(report.assumptions.tradeAudit.limitPerTrainOrTestCandidate, 2);
    assert.ok(audit);
    assert.ok(audit.train.count > 0);
    assert.ok(audit.test.count > 0);
    assert.equal(audit.train.trades.length, 2);
    assert.ok((audit.train.trades[0]?.entryAt ?? 0) > 0);
    assert.ok((audit.train.trades[0]?.exitAt ?? 0) > (audit.train.trades[0]?.entryAt ?? 0));
    assert.equal(typeof audit.train.trades[0]?.pnlKrw, "number");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
