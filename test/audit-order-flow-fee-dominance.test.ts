import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("order-flow fee dominance certifies higher-fee no-promotion from a lower-fee rejected scan", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-order-flow-fee-dominance-"));
  const sourcePath = join(directory, "source.json");
  const outputPath = join(directory, "dominance.json");
  writeFileSync(
    sourcePath,
    JSON.stringify(
      {
        generatedAt: "2026-05-13T00:00:00.000Z",
        assumptions: {
          markets: ["KRW-BTC", "KRW-ETH"],
          signalMode: "recovery",
          horizonSecondsList: [60, 300],
          notionalKrw: 500_000,
          feeRoundTripBps: 8,
        },
        candidateCount: 2,
        promotionCandidateCount: 0,
        promotionCandidates: [],
        topByTest: [
          {
            market: "KRW-BTC",
            train: { count: 10, totalPnlKrw: -1 },
            test: { count: 1, totalPnlKrw: 10 },
            walkForward: { totalPnlKrw: -1, minFoldPnlKrw: -1 },
          },
        ],
      },
      null,
      2,
    ),
  );

  execFileSync(
    "node",
    [
      "dist/src/cli/audit-order-flow-fee-dominance.js",
      "--source-report",
      sourcePath,
      "--target-fee-round-trip-bps",
      "35",
      "--output",
      outputPath,
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );

  const report = JSON.parse(readFileSync(outputPath, "utf8")) as {
    status: string;
    candidateCount: number;
    promotionCandidateCount: number;
    checks: { targetNoPromotionByDominance: boolean };
    assumptions: { feeRoundTripBps: number; sourceFeeRoundTripBps: number };
  };
  assert.equal(report.status, "blocked");
  assert.equal(report.candidateCount, 2);
  assert.equal(report.promotionCandidateCount, 0);
  assert.equal(report.checks.targetNoPromotionByDominance, true);
  assert.equal(report.assumptions.sourceFeeRoundTripBps, 8);
  assert.equal(report.assumptions.feeRoundTripBps, 35);
});
