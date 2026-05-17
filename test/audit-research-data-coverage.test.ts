import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeNdjson(path: string, rows: unknown[]): void {
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function writeCanonicalRows(
  directory: string,
  dataset: string,
  market: string,
  date: string,
  timestampMs: number,
): void {
  const root = join(directory, "canonical", dataset, `date=${date}`, `market=${market}`);
  mkdirSync(root, { recursive: true });
  const timestampKey = dataset === "candle_1m" ? "candle_timestamp_ms" : "event_timestamp_ms";
  writeNdjson(join(root, "part-test.ndjson"), [
    {
      dataset,
      market,
      [timestampKey]: timestampMs,
      close_price: 100,
      best_bid_price: 99,
      best_ask_price: 101,
    },
  ]);
}

test("research data coverage reports fresh local evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-data-fresh-"));
  try {
    writeCanonicalRows(directory, "candle_1m", "KRW-BTC", "2026-05-13", Date.parse("2026-05-13T00:00:00Z"));
    writeCanonicalRows(directory, "orderbook_snapshot", "KRW-BTC", "2026-05-13", Date.parse("2026-05-13T00:01:00Z"));

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/audit-research-data-coverage.js",
        "--base-dir",
        directory,
        "--markets",
        "KRW-BTC",
        "--datasets",
        "candle_1m,orderbook_snapshot",
        "--now",
        "2026-05-13T01:00:00Z",
        "--max-age-hours",
        "2",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      fresh: boolean;
      blockers: string[];
      coverage: Array<{ market: string; dataset: string; recordCount: number; fresh: boolean }>;
    };
    assert.equal(report.status, "fresh");
    assert.equal(report.fresh, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(report.coverage.length, 2);
    assert.ok(report.coverage.every((summary) => summary.fresh));
    assert.ok(report.coverage.every((summary) => summary.recordCount === 1));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("research data coverage blocks stale or missing market evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-data-stale-"));
  try {
    writeCanonicalRows(directory, "candle_1m", "KRW-BTC", "2026-05-11", Date.parse("2026-05-11T00:00:00Z"));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-research-data-coverage.js",
        "--base-dir",
        directory,
        "--markets",
        "KRW-BTC,KRW-ETH",
        "--datasets",
        "candle_1m",
        "--now",
        "2026-05-13T00:00:00Z",
        "--max-age-hours",
        "24",
        "--require-fresh",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      status: string;
      fresh: boolean;
      blockers: string[];
      coverage: Array<{ market: string; blockers: string[] }>;
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.fresh, false);
    assert.ok(report.blockers.includes("KRW-BTC:candle_1m:staleLatestTimestamp"));
    assert.ok(
      report.blockers.includes(
        "KRW-ETH:candle_1m:missingFiles+insufficientRecords+missingTimestamp",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
