import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("signal execution coverage blocks candidates without local orderbook evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-signal-coverage-"));
  try {
    const scanPath = join(directory, "scan.json");
    const orderbookRoot = join(directory, "orderbook_snapshot");
    const btcDir = join(orderbookRoot, "date=2026-01-01", "market=KRW-BTC");
    mkdirSync(btcDir, { recursive: true });
    writeFileSync(
      join(btcDir, "part-1.ndjson"),
      [
        JSON.stringify({ event_timestamp_ms: 1_000_000, best_ask_price: 100, best_bid_price: 99 }),
        JSON.stringify({ event_timestamp_ms: 1_010_000, best_ask_price: 101, best_bid_price: 100 }),
        JSON.stringify({ event_timestamp_ms: 2_000_000, best_ask_price: 110, best_bid_price: 109 }),
        JSON.stringify({ event_timestamp_ms: 2_010_000, best_ask_price: 111, best_bid_price: 110 }),
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      scanPath,
      `${JSON.stringify({
        assumptions: { market: "KRW-BTC" },
        topByTest: [
          {
            market: "KRW-BTC",
            lookbackBars: 24,
            holdBars: 4,
            minReturnBps: 0,
            riskFilter: "none",
            tradeAudit: {
              train: {
                count: 1,
                trades: [{ entryAt: 1_000_000, exitAt: 2_000_000, pnlKrw: 1000 }],
              },
              test: {
                count: 1,
                trades: [{ entryAt: 1_010_000, exitAt: 2_010_000, pnlKrw: 2000 }],
              },
            },
          },
          {
            market: "KRW-H",
            lookbackBars: 168,
            holdBars: 72,
            minReturnBps: 0,
            riskFilter: "range24_below_p70",
            tradeAudit: {
              train: {
                count: 1,
                trades: [{ entryAt: 1_000_000, exitAt: 2_000_000, pnlKrw: 1000 }],
              },
              test: {
                count: 1,
                trades: [{ entryAt: 1_010_000, exitAt: 2_010_000, pnlKrw: 2000 }],
              },
            },
          },
        ],
      })}\n`,
      "utf8",
    );

    const outputPath = join(directory, "coverage.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-signal-execution-coverage.js",
        "--scan",
        scanPath,
        "--orderbook-root",
        orderbookRoot,
        "--max-skew-minutes",
        "1",
        "--min-round-trip-coverage-rate",
        "1",
        "--min-covered-round-trips",
        "2",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      status: string;
      coverageReadyCandidateCount: number;
      candidates: Array<{
        market: string;
        coverageReady: boolean;
        orderbookSnapshotCount: number;
        reasons: string[];
        coverage: {
          train: { roundTripCoveredCount: number; roundTripCoverageRate: number | null };
          test: { roundTripCoveredCount: number; roundTripCoverageRate: number | null };
        };
      }>;
    };
    const btc = report.candidates.find((candidate) => candidate.market === "KRW-BTC");
    const h = report.candidates.find((candidate) => candidate.market === "KRW-H");

    assert.equal(report.status, "coverage_ready");
    assert.equal(report.coverageReadyCandidateCount, 1);
    assert.equal(btc?.coverageReady, true);
    assert.equal(btc?.coverage.train.roundTripCoverageRate, 1);
    assert.equal(btc?.coverage.test.roundTripCoveredCount, 1);
    assert.equal(h?.coverageReady, false);
    assert.equal(h?.orderbookSnapshotCount, 0);
    assert.deepEqual(h?.reasons, [
      "no_orderbook_snapshots_for_market",
      "train_round_trip_coverage_below_threshold",
      "test_round_trip_coverage_below_threshold",
      "covered_round_trips_below_minimum",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
