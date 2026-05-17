import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("trade path analysis marks open trades from scenario snapshots", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "org-coin-trade-paths-"));
  try {
    const reportsRoot = join(tempDir, "reports");
    const firstSession = join(reportsRoot, "date=2026-05-07", "session=first");
    const secondSession = join(reportsRoot, "date=2026-05-07", "session=second");
    const scenariosDir = join(reportsRoot, "scenarios");
    mkdirSync(firstSession, { recursive: true });
    mkdirSync(secondSession, { recursive: true });
    mkdirSync(scenariosDir, { recursive: true });

    const buySignalId = "sig-buy";
    const sellSignalId = "sig-sell";
    const losingBuySignalId = "sig-buy-losing";
    const losingSellSignalId = "sig-sell-losing";
    const firstScenarioPath = join(scenariosDir, "first.json");
    const secondScenarioPath = join(scenariosDir, "second.json");

    writeJson(firstScenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-05-07T00:00:00.000Z",
            bestBidPrice: 100,
          },
        },
        {
          type: "signal",
          signal: {
            signalId: buySignalId,
            metadata: {
              confidenceTier: "medium",
              featureSnapshot: {
                ret_5m_bps: 20,
              },
            },
          },
        },
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-05-07T00:01:00.000Z",
            bestBidPrice: 103,
          },
        },
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-05-07T00:02:00.000Z",
            bestBidPrice: 99,
          },
        },
      ],
    });
    writeJson(secondScenarioPath, {
      schemaVersion: "1.0.0",
      events: [
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-05-07T00:03:00.000Z",
            bestBidPrice: 104,
          },
        },
        {
          type: "signal",
          signal: {
            signalId: sellSignalId,
            side: "sell",
            reasonCodes: ["EXIT_TIME_STOP_15M"],
            metadata: {},
          },
        },
        {
          type: "signal",
          signal: {
            signalId: losingBuySignalId,
            metadata: {
              confidenceTier: "low",
              featureSnapshot: {
                ret_5m_bps: 5,
              },
            },
          },
        },
        {
          type: "snapshot",
          snapshot: {
            market: "KRW-BTC",
            asOf: "2026-05-07T00:04:00.000Z",
            bestBidPrice: 99,
          },
        },
        {
          type: "signal",
          signal: {
            signalId: losingSellSignalId,
            side: "sell",
            reasonCodes: ["EXIT_TIME_STOP_15M"],
            metadata: {},
          },
        },
      ],
    });

    writeJson(join(firstSession, "report.json"), {
      generatedAt: "2026-05-07T00:02:30.000Z",
      scenarioPath: firstScenarioPath,
      outcomes: [
        {
          type: "signal",
          signalId: buySignalId,
          decision: {
            fills: [
              {
                signalId: buySignalId,
                market: "KRW-BTC",
                side: "buy",
                quantity: 1,
                price: 100,
                quoteNotional: 100,
                feesPaid: 1,
                occurredAt: "2026-05-07T00:00:01.000Z",
              },
            ],
          },
        },
      ],
    });
    writeJson(join(secondSession, "report.json"), {
      generatedAt: "2026-05-07T00:03:30.000Z",
      scenarioPath: secondScenarioPath,
      outcomes: [
        {
          type: "signal",
          signalId: sellSignalId,
          decision: {
            fills: [
              {
                signalId: sellSignalId,
                market: "KRW-BTC",
                side: "sell",
                quantity: 1,
                price: 104,
                quoteNotional: 104,
                feesPaid: 1,
                occurredAt: "2026-05-07T00:03:01.000Z",
              },
            ],
          },
        },
        {
          type: "signal",
          signalId: losingBuySignalId,
          decision: {
            fills: [
              {
                signalId: losingBuySignalId,
                market: "KRW-BTC",
                side: "buy",
                quantity: 1,
                price: 100,
                quoteNotional: 100,
                feesPaid: 1,
                occurredAt: "2026-05-07T00:03:02.000Z",
              },
            ],
          },
        },
        {
          type: "signal",
          signalId: losingSellSignalId,
          decision: {
            fills: [
              {
                signalId: losingSellSignalId,
                market: "KRW-BTC",
                side: "sell",
                quantity: 1,
                price: 98,
                quoteNotional: 98,
                feesPaid: 1,
                occurredAt: "2026-05-07T00:04:01.000Z",
              },
            ],
          },
        },
      ],
    });

    const output = execFileSync(
      process.execPath,
      [
        join(process.cwd(), "dist/src/cli/analyze-trade-paths.js"),
        "--reports-root",
        reportsRoot,
      ],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(output) as {
      allClosedTrades: {
        count: number;
        totalPnlKrw: number;
        averageMfeKrw: number;
        averageMaeKrw: number;
        immediateAdverseCount: number;
      };
      losingClosedTrades: {
        count: number;
        immediateAdverseCount: number;
      };
      exitReasonCohorts: Record<
        string,
        {
          count: number;
          totalPnlKrw: number;
        }
      >;
      exitReasonPathDiagnostics: Record<
        string,
        {
          count: number;
          winners: number;
          losers: number;
          losingImmediateAdverseCount: number;
          losingImmediateAdversePnlKrw: number;
          losingGaveBackPositiveMfeCount: number;
          dominantLosingPath: string | null;
        }
      >;
      pathCohortEntryFeatureDiagnostics: Record<
        string,
        {
          immediateAdverse: {
            target: {
              count: number;
              totalPnlKrw: number;
            };
            comparison: {
              count: number;
            };
            featureAverages: Record<
              string,
              {
                observedTradeCount: number;
                winningAverage: number | null;
                losingAverage: number | null;
              }
            >;
            avoidanceThresholdCandidates: Array<{
              feature: string;
              selected: {
                count: number;
                totalPnlKrw: number;
              };
              skippedTargetCount: number;
              targetSkipRate: number | null;
            }>;
          };
        }
      >;
      entryFeatureDiagnostics: {
        sampleTooSmallForLiveReadiness: boolean;
        byFeature: Record<
          string,
          {
            observedTradeCount: number;
            allAverage: number | null;
          }
        >;
        topThresholdCandidates: Array<{
          feature: string;
          selected: {
            count: number;
          };
        }>;
        thresholdExperimentReadiness: {
          classification: string;
          eligibleForReplayExperiment: boolean;
          positiveThresholdCandidateCount: number;
          reasons: string[];
          bestPositiveThresholdCandidate: unknown | null;
        };
      };
      worstClosedTrades: Array<{
        confidenceTier?: string;
        exitReasonCodes: string[];
        entryFeatureSnapshot: Record<string, number | null>;
      }>;
    };

    assert.equal(parsed.allClosedTrades.count, 2);
    assert.equal(parsed.allClosedTrades.totalPnlKrw, -2);
    assert.equal(parsed.allClosedTrades.averageMfeKrw, 1);
    assert.equal(parsed.allClosedTrades.averageMaeKrw, -2);
    assert.equal(parsed.allClosedTrades.immediateAdverseCount, 1);
    assert.equal(parsed.losingClosedTrades.count, 1);
    assert.equal(parsed.losingClosedTrades.immediateAdverseCount, 1);
    assert.equal(parsed.exitReasonCohorts.EXIT_TIME_STOP_15M?.count, 2);
    assert.equal(parsed.exitReasonCohorts.EXIT_TIME_STOP_15M?.totalPnlKrw, -2);
    assert.equal(
      parsed.exitReasonPathDiagnostics.EXIT_TIME_STOP_15M?.losingImmediateAdverseCount,
      1,
    );
    assert.equal(
      parsed.exitReasonPathDiagnostics.EXIT_TIME_STOP_15M
        ?.losingImmediateAdversePnlKrw,
      -4,
    );
    assert.equal(
      parsed.exitReasonPathDiagnostics.EXIT_TIME_STOP_15M
        ?.losingGaveBackPositiveMfeCount,
      0,
    );
    assert.equal(
      parsed.exitReasonPathDiagnostics.EXIT_TIME_STOP_15M?.dominantLosingPath,
      "immediate_adverse",
    );
    const timeStopPathFeatures =
      parsed.pathCohortEntryFeatureDiagnostics.EXIT_TIME_STOP_15M;
    assert.equal(timeStopPathFeatures?.immediateAdverse.target.count, 1);
    assert.equal(timeStopPathFeatures?.immediateAdverse.target.totalPnlKrw, -4);
    assert.equal(timeStopPathFeatures?.immediateAdverse.comparison.count, 1);
    assert.equal(
      timeStopPathFeatures?.immediateAdverse.featureAverages.ret_5m_bps
        ?.winningAverage,
      20,
    );
    assert.equal(
      timeStopPathFeatures?.immediateAdverse.featureAverages.ret_5m_bps
        ?.losingAverage,
      5,
    );
    assert.equal(
      timeStopPathFeatures?.immediateAdverse.avoidanceThresholdCandidates[0]
        ?.feature,
      "ret_5m_bps",
    );
    assert.equal(
      timeStopPathFeatures?.immediateAdverse.avoidanceThresholdCandidates[0]
        ?.selected.count,
      1,
    );
    assert.equal(
      timeStopPathFeatures?.immediateAdverse.avoidanceThresholdCandidates[0]
        ?.selected.totalPnlKrw,
      2,
    );
    assert.equal(
      timeStopPathFeatures?.immediateAdverse.avoidanceThresholdCandidates[0]
        ?.skippedTargetCount,
      1,
    );
    assert.equal(
      timeStopPathFeatures?.immediateAdverse.avoidanceThresholdCandidates[0]
        ?.targetSkipRate,
      1,
    );
    assert.equal(parsed.entryFeatureDiagnostics.sampleTooSmallForLiveReadiness, true);
    assert.equal(
      parsed.entryFeatureDiagnostics.byFeature.ret_5m_bps?.observedTradeCount,
      2,
    );
    assert.equal(parsed.entryFeatureDiagnostics.byFeature.ret_5m_bps?.allAverage, 12.5);
    assert.deepEqual(parsed.entryFeatureDiagnostics.topThresholdCandidates, []);
    assert.equal(
      parsed.entryFeatureDiagnostics.thresholdExperimentReadiness.classification,
      "insufficient_closed_trade_sample",
    );
    assert.equal(
      parsed.entryFeatureDiagnostics.thresholdExperimentReadiness
        .eligibleForReplayExperiment,
      false,
    );
    assert.equal(
      parsed.entryFeatureDiagnostics.thresholdExperimentReadiness
        .positiveThresholdCandidateCount,
      0,
    );
    assert.equal(
      parsed.entryFeatureDiagnostics.thresholdExperimentReadiness
        .bestPositiveThresholdCandidate,
      null,
    );
    assert.match(
      parsed.entryFeatureDiagnostics.thresholdExperimentReadiness.reasons.join(" "),
      /30-trade live-readiness floor/,
    );
    assert.equal(parsed.worstClosedTrades[0]?.confidenceTier, "low");
    assert.deepEqual(parsed.worstClosedTrades[0]?.exitReasonCodes, [
      "EXIT_TIME_STOP_15M",
    ]);
    assert.equal(parsed.worstClosedTrades[0]?.entryFeatureSnapshot.ret_5m_bps, 5);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
