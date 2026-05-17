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
  writeFileSync(
    path,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

test("reversal observation audit separates edge spread from live spread gates", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-reversal-observation-"));
  try {
    const runId = "run-a";
    const snapshotDir = join(
      directory,
      "canonical",
      "passive_feature_snapshot",
      "date=2026-05-12",
      "market=KRW-THQ",
    );
    mkdirSync(snapshotDir, { recursive: true });

    writeNdjson(join(snapshotDir, `part-${runId}.ndjson`), [
      {
        dataset: "passive_feature_snapshot",
        market: "KRW-THQ",
        event_timestamp_ms: 1_000,
        source_run_id: runId,
        spread_bps: 20,
        window_coverage_sec: 60,
        depth_ratio_l5: 2,
        turnover_24h_krw: 40_000_000_000,
        trade_count_60s: 3,
        notional_60s: 500_000,
        ret_5m_bps: -120,
      },
      {
        dataset: "passive_feature_snapshot",
        market: "KRW-THQ",
        event_timestamp_ms: 2_000,
        source_run_id: runId,
        spread_bps: 80,
        window_coverage_sec: 60,
        depth_ratio_l5: 2,
        turnover_24h_krw: 40_000_000_000,
        trade_count_60s: 4,
        notional_60s: 600_000,
        ret_5m_bps: -90,
      },
    ]);

    const outputPath = join(directory, "reversal-observation.json");
    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-reversal-observation-data.js",
        "--base-dir",
        directory,
        "--market",
        "KRW-THQ",
        "--expected-median-edge-bps",
        "50",
        "--max-live-spread-bps",
        "8",
        "--min-snapshots",
        "2",
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      source: { snapshotCount: number; runIds: string[] };
      metrics: { spreadBps: { median: number } };
      compatibility: {
        edgeCompatibleSpreadCount: number;
        liveSpreadCompatibleCount: number;
        executionEnvironmentPassCount: number;
      };
      decision: {
        paperObservationCandidate: boolean;
        liveCandidate: boolean;
        reasons: string[];
      };
    };

    assert.equal(report.source.snapshotCount, 2);
    assert.deepEqual(report.source.runIds, [runId]);
    assert.equal(report.metrics.spreadBps.median, 20);
    assert.equal(report.compatibility.edgeCompatibleSpreadCount, 1);
    assert.equal(report.compatibility.liveSpreadCompatibleCount, 0);
    assert.equal(report.compatibility.executionEnvironmentPassCount, 1);
    assert.equal(report.decision.paperObservationCandidate, true);
    assert.equal(report.decision.liveCandidate, false);
    assert.deepEqual(report.decision.reasons, ["spread_never_below_live_gate"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
