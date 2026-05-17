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

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("suppressed opportunity analysis prices stored shadow candidates", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-suppressed-"));
  try {
    const reportsRoot = join(directory, "reports");
    const sessionDir = join(reportsRoot, "session-a");
    const laterSessionDir = join(reportsRoot, "session-b");
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(laterSessionDir, { recursive: true });
    const scenarioPath = join(sessionDir, "scenario.json");
    const laterScenarioPath = join(laterSessionDir, "scenario.json");
    const outputPath = join(directory, "artifacts", "suppressed.json");

    writeJson(scenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-04-02T12:00:00.000Z",
            bestBidPrice: 100,
            bestAskPrice: 101,
            lastTradePrice: 100.5,
          },
        },
      ],
    });

    writeJson(laterScenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-04-02T12:05:00.000Z",
            bestBidPrice: 103,
            bestAskPrice: 104,
            lastTradePrice: 103.5,
          },
        },
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-04-02T12:15:00.000Z",
            bestBidPrice: 99,
            bestAskPrice: 100,
            lastTradePrice: 99.5,
          },
        },
      ],
    });

    writeJson(join(sessionDir, "report.json"), {
      scenarioPath,
      scenarioMetadata: {
        summary: {
          suppressedEntrySamples: [
            {
              market: "KRW-BTC",
              asOf: "2026-04-02T12:00:00.000Z",
              eventTimestampMs: Date.parse("2026-04-02T12:00:00.000Z"),
              suppressionReason: "SUPPRESS_WEAK_CONFLUENCE",
              requestedQuoteNotionalKrw: 101,
              bestAskPrice: 101,
              bestBidPrice: 100,
              lastTradePrice: 100.5,
              featureSnapshot: {
                ret_5m_bps: -1,
              },
              failingGates: [
                {
                  field: "ret_5m_bps",
                  comparator: ">=",
                  actual: -1,
                  threshold: 0,
                },
              ],
            },
          ],
        },
      },
    });
    writeJson(join(laterSessionDir, "report.json"), {
      scenarioPath: laterScenarioPath,
      scenarioMetadata: {
        summary: {},
      },
    });

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-suppressed-opportunities.js",
        "--reports-root",
        reportsRoot,
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);
    const summary = JSON.parse(output) as {
      source: {
        scenarioCount: number;
      };
      sampleCount: number;
      horizons: {
        plus5m: {
          markedSampleCount: number;
          markCoverageRate: number;
          totalBtcExcessPnlKrw: number;
          winners: number;
        };
        plus15m: {
          markedSampleCount: number;
          markCoverageRate: number;
          totalReturnPct: number;
          totalBtcExcessPnlKrw: number;
          losers: number;
        };
      };
      missedPositiveBtcWindows: {
        plus5m: {
          count: number;
          shadowCaptureRatio: number;
          stalePositiveOpportunityCount: number;
        };
      };
      bySuppressionReason: Record<string, { latest: { sampleCount: number } }>;
      byFailingGate: Record<string, { latest: { sampleCount: number } }>;
      opportunityAssessment: {
        classification: string;
        supportsLooseningEntry: boolean;
      };
    };

    assert.equal(summary.source.scenarioCount, 2);
    assert.equal(summary.sampleCount, 1);
    assert.equal(summary.horizons.plus5m.markedSampleCount, 1);
    assert.equal(summary.horizons.plus5m.markCoverageRate, 1);
    assert.equal(summary.horizons.plus5m.totalBtcExcessPnlKrw, 0);
    assert.equal(summary.horizons.plus5m.winners, 1);
    assert.equal(summary.horizons.plus15m.markedSampleCount, 1);
    assert.equal(summary.horizons.plus15m.markCoverageRate, 1);
    assert.ok(summary.horizons.plus15m.totalReturnPct < 0);
    assert.equal(summary.horizons.plus15m.totalBtcExcessPnlKrw, 0);
    assert.equal(summary.horizons.plus15m.losers, 1);
    assert.equal(summary.missedPositiveBtcWindows.plus5m.count, 1);
    assert.equal(summary.missedPositiveBtcWindows.plus5m.shadowCaptureRatio, 1);
    assert.equal(
      summary.missedPositiveBtcWindows.plus5m.stalePositiveOpportunityCount,
      0,
    );
    assert.equal(
      summary.bySuppressionReason.SUPPRESS_WEAK_CONFLUENCE?.latest.sampleCount,
      1,
    );
    assert.equal(summary.byFailingGate.ret_5m_bps?.latest.sampleCount, 1);
    assert.equal(
      summary.opportunityAssessment.classification,
      "insufficient_horizon_coverage",
    );
    assert.equal(summary.opportunityAssessment.supportsLooseningEntry, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
