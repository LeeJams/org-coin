import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function book(
  venue: "bithumb" | "binance",
  market: string,
  bidPrice: number,
  askPrice: number,
  size = 100,
): unknown {
  return {
    venue,
    market,
    bidPrice,
    askPrice,
    bidSize: size,
    askSize: size,
    bids: [{ price: bidPrice, size }],
    asks: [{ price: askPrice, size }],
    timestampMs: null,
    receivedAtMs: null,
  };
}

function observation(
  index: number,
  overrides: {
    fundingRate?: number;
    perpBid?: number;
    perpAsk?: number;
    settled?: boolean;
    settledAtMs?: number;
  } = {},
): unknown {
  const capturedAtMs = Date.parse("2026-05-13T00:00:00Z") + index * 4 * 60 * 60 * 1000;
  const fundingRate = overrides.fundingRate ?? 0.001;
  return {
    capturedAt: new Date(capturedAtMs).toISOString(),
    market: "KRW-BTC",
    symbol: "BTCUSDT",
    spot: book("bithumb", "KRW-BTC", 99_950, 100_000, 10),
    perp: book("binance", "BTCUSDT", overrides.perpBid ?? 101, overrides.perpAsk ?? 101.02, 10),
    usdtKrw: book("bithumb", "KRW-USDT", 1000, 1001, 10_000),
    funding: {
      symbol: "BTCUSDT",
      lastFundingRate: fundingRate,
      nextFundingTimeMs: capturedAtMs + 8 * 60 * 60 * 1000,
      settledAtMs: overrides.settled === false ? null : (overrides.settledAtMs ?? capturedAtMs),
      markPrice: 101,
      indexPrice: 100.8,
    },
  };
}

test("spot-perp carry promotes only repeated completed fee-stressed carry observations", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-promote-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, Array.from({ length: 19 }, (_, index) => observation(index)));

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-16T00:00:00Z",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      promotionEligible: boolean;
      blockers: string[];
      checklist: Record<string, boolean>;
      summary: { completedFundingCount: number; positiveCount: number; medianNetCarryBps: number };
      measurementScope: { liveReady: string };
    };
    assert.equal(report.status, "promotion_candidate");
    assert.equal(report.promotionEligible, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(report.summary.completedFundingCount, 19);
    assert.equal(report.summary.positiveCount, 19);
    assert.ok(report.summary.medianNetCarryBps > 10);
    assert.equal(report.measurementScope.liveReady, "not_assessed_by_this_measurement_cli");
    assert.ok(Object.values(report.checklist).every(Boolean));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry counts unique settled funding events instead of repeated snapshots", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-unique-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const settledAtMs = Date.parse("2026-05-13T00:00:00Z");
    writeJson(
      observationsPath,
      Array.from({ length: 19 }, (_, index) => {
        const row = observation(index, { settledAtMs }) as Record<string, unknown>;
        row.symbol = `COIN${index % 6}USDT`;
        return row;
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-16T00:00:00Z",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      blockers: string[];
      summary: { completedFundingCount: number; positiveCount: number };
    };
    assert.equal(report.summary.completedFundingCount, 1);
    assert.equal(report.summary.positiveCount, 19);
    assert.ok(report.blockers.includes("insufficientCompletedFundingEvents"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry summarizes all executable rows by funding window before top-carry slicing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-window-summary-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const firstSettledAtMs = Date.parse("2026-05-13T00:00:00Z");
    const secondSettledAtMs = Date.parse("2026-05-13T08:00:00Z");
    writeJson(
      observationsPath,
      Array.from({ length: 22 }, (_, index) =>
        observation(index, {
          settledAtMs: index < 11 ? firstSettledAtMs : secondSettledAtMs,
          perpBid: 101 + index / 100,
          perpAsk: 101.02 + index / 100,
        }),
      ),
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-16T00:00:00Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      topExecutableCarry: Array<unknown>;
      rankedCarryViews: {
        topExecutableCarry: {
          sourcePopulation: string;
          sourceCount: number;
          resultLimit: number;
          isTruncatedTopN: boolean;
          promotionUsable: boolean;
          promotionReplacement: string;
        };
      };
      fundingWindowSummary: {
        source: string;
        completedFundingWindowCount: number;
        executableSampleCount: number;
        isDeduplicatedByFundingWindow: boolean;
        isNotRealizedReturn: boolean;
        medianWindowNetCarryBps: number;
        medianWindowCarryPct: number;
        windows: Array<{
          fundingSettledAt: string;
          sampleCount: number;
          medianNetCarryBps: number;
          bestNetCarryBps: number;
          worstNetCarryBps: number;
        }>;
      };
    };

    assert.equal(report.topExecutableCarry.length, 20);
    assert.equal(
      report.rankedCarryViews.topExecutableCarry.sourcePopulation,
      "execution_eligible_rows_sorted_by_netCarryBps",
    );
    assert.equal(report.rankedCarryViews.topExecutableCarry.sourceCount, 22);
    assert.equal(report.rankedCarryViews.topExecutableCarry.resultLimit, 20);
    assert.equal(report.rankedCarryViews.topExecutableCarry.isTruncatedTopN, true);
    assert.equal(report.rankedCarryViews.topExecutableCarry.promotionUsable, false);
    assert.equal(report.rankedCarryViews.topExecutableCarry.promotionReplacement, "fundingWindowSummary");
    assert.equal(
      report.fundingWindowSummary.source,
      "all_execution_eligible_rows_grouped_by_market_symbol_fundingSettledAt",
    );
    assert.equal(report.fundingWindowSummary.completedFundingWindowCount, 2);
    assert.equal(report.fundingWindowSummary.executableSampleCount, 22);
    assert.equal(report.fundingWindowSummary.isDeduplicatedByFundingWindow, true);
    assert.equal(report.fundingWindowSummary.isNotRealizedReturn, true);
    assert.equal(report.fundingWindowSummary.windows[0]?.sampleCount, 11);
    assert.equal(report.fundingWindowSummary.windows[1]?.sampleCount, 11);
    assert.ok(report.fundingWindowSummary.windows[1]!.medianNetCarryBps > report.fundingWindowSummary.windows[0]!.medianNetCarryBps);
    assert.ok(report.fundingWindowSummary.medianWindowNetCarryBps > 0);
    assert.ok(report.fundingWindowSummary.medianWindowCarryPct > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry promotion uses funding-window quality instead of repeated row counts", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-window-quality-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const startMs = Date.parse("2026-05-13T00:00:00Z");
    const strongWindow = Array.from({ length: 50 }, (_, index) =>
      observation(index, { settledAtMs: startMs }),
    );
    const weakWindows = Array.from({ length: 5 }, (_, index) =>
      observation(50 + index, {
        settledAtMs: startMs + (index + 1) * 4 * 60 * 60 * 1000,
        fundingRate: 0.001,
        perpBid: 99.5,
        perpAsk: 99.52,
      }),
    );
    writeJson(observationsPath, [...strongWindow, ...weakWindows]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--min-observations",
        "1",
        "--min-observation-span-minutes",
        "0",
        "--min-completed-funding-events",
        "6",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      blockers: string[];
      checklist: { positiveMedianNetCarry: boolean; positiveCarryRate: boolean };
      summary: { executionEligiblePositiveRate: number };
      fundingWindowSummary: {
        completedFundingWindowCount: number;
        positiveWindowCount: number;
        positiveWindowRate: number;
        medianWindowNetCarryBps: number;
      };
    };
    assert.ok(report.summary.executionEligiblePositiveRate > 0.67);
    assert.equal(report.fundingWindowSummary.completedFundingWindowCount, 6);
    assert.equal(report.fundingWindowSummary.positiveWindowCount, 1);
    assert.equal(report.fundingWindowSummary.positiveWindowRate, 0.166667);
    assert.ok(report.fundingWindowSummary.medianWindowNetCarryBps < 10);
    assert.equal(report.checklist.positiveMedianNetCarry, false);
    assert.equal(report.checklist.positiveCarryRate, false);
    assert.ok(report.blockers.includes("weakMedianNetCarry"));
    assert.ok(report.blockers.includes("lowPositiveCarryRate"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry can append new observations to an existing output report", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-append-"));
  try {
    const outputPath = join(directory, "carry-latest.json");
    const inputPath = join(directory, "new-observations.json");
    writeJson(outputPath, { observations: [observation(0)] });
    writeJson(inputPath, [observation(1)]);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        inputPath,
        "--output",
        outputPath,
        "--append-existing-output",
        "--now",
        "2026-05-13T04:00:00Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      observationCount: number;
      assumptions: { appendExistingOutput: boolean };
      observations: Array<{ capturedAt: string }>;
    };
    assert.equal(report.assumptions.appendExistingOutput, true);
    assert.equal(report.observationCount, 2);
    assert.deepEqual(report.observations.map((row) => row.capturedAt), [
      "2026-05-13T00:00:00.000Z",
      "2026-05-13T04:00:00.000Z",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry deduplicates appended observations by market symbol time and funding window", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-dedupe-"));
  try {
    const outputPath = join(directory, "carry-latest.json");
    const inputPath = join(directory, "new-observations.json");
    writeJson(outputPath, { observations: [observation(0)] });
    writeJson(inputPath, [observation(0), observation(1)]);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        inputPath,
        "--output",
        outputPath,
        "--append-existing-output",
        "--now",
        "2026-05-13T04:00:00Z",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      observationCount: number;
      observationMerge: {
        existingOutputObservationCount: number;
        newObservationCount: number;
        filteredOutObservationCount: number;
        duplicateObservationCount: number;
        finalObservationCount: number;
        dedupeKey: string;
        filteredToRequestedMarkets: boolean;
      };
      observations: Array<{ capturedAt: string }>;
    };
    assert.equal(report.observationCount, 2);
    assert.deepEqual(report.observations.map((row) => row.capturedAt), [
      "2026-05-13T00:00:00.000Z",
      "2026-05-13T04:00:00.000Z",
    ]);
    assert.deepEqual(report.observationMerge, {
      existingOutputObservationCount: 1,
      newObservationCount: 2,
      filteredOutObservationCount: 0,
      duplicateObservationCount: 1,
      finalObservationCount: 2,
      dedupeKey: "market|symbol|capturedAt|funding.settledAtMs",
      filteredToRequestedMarkets: false,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry quiet output keeps full report artifact", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-quiet-"));
  try {
    const outputPath = join(directory, "carry-latest.json");
    const inputPath = join(directory, "new-observations.json");
    writeJson(inputPath, [observation(0), observation(1)]);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        inputPath,
        "--output",
        outputPath,
        "--now",
        "2026-05-13T08:00:00Z",
        "--quiet",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const stdoutReport = JSON.parse(output) as {
      observationCount: number;
      observations?: unknown[];
      perMarketSummary: unknown[];
    };
    const artifactReport = JSON.parse(readFileSync(outputPath, "utf8")) as {
      observationCount: number;
      observations: unknown[];
    };
    assert.equal(stdoutReport.observationCount, 2);
    assert.equal(stdoutReport.observations, undefined);
    assert.equal(stdoutReport.perMarketSummary.length, 1);
    assert.equal(artifactReport.observationCount, 2);
    assert.equal(artifactReport.observations.length, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry blocks unsettled single-snapshot funding evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-unsettled-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, [observation(0, { settled: false })]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T00:00:00Z",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as { blockers: string[]; summary: { completedFundingCount: number } };
    assert.equal(report.summary.completedFundingCount, 0);
    assert.ok(report.blockers.includes("insufficientObservations"));
    assert.ok(report.blockers.includes("insufficientCompletedFundingEvents"));
    assert.ok(report.blockers.includes("feeScheduleUnconfirmed"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry blocks positive funding when basis and costs erase carry", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-weak-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(
      observationsPath,
      Array.from({ length: 19 }, (_, index) =>
        observation(index, { fundingRate: 0.001, perpBid: 99.5, perpAsk: 99.52 }),
      ),
    );

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-16T00:00:00Z",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      blockers: string[];
      summary: { medianNetCarryBps: number; positiveCount: number };
    };
    assert.ok(report.summary.medianNetCarryBps < 10);
    assert.equal(report.summary.positiveCount, 0);
    assert.ok(report.blockers.includes("weakMedianNetCarry"));
    assert.ok(report.blockers.includes("lowPositiveCarryRate"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry excludes wide-spread pricing artifacts from executable promotion stats", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-artifact-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const row = observation(0, { fundingRate: 0.001, perpBid: 2_000, perpAsk: 2_001 }) as Record<
      string,
      unknown
    >;
    row.spot = book("bithumb", "KRW-BTC", 90_000, 100_000, 10);
    writeJson(observationsPath, [row]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--min-observations",
        "1",
        "--min-completed-funding-events",
        "1",
        "--min-observation-span-minutes",
        "0",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      blockers: string[];
      summary: {
        positiveCount: number;
        executionEligibleCount: number;
        executionRejectedCount: number;
        executionRejectionReasons: Record<string, number>;
        spreadControl: {
          passed: boolean;
          required: boolean;
          spreadRejectedCount: number;
          spreadRejectedRate: number;
          rejectionReasons: Record<string, number>;
          spreadStats: { spot: { medianBps: number | null; p90Bps: number | null } };
          fundingWindows: Array<{
            sampleCount: number;
            spreadRejectedCount: number;
            spreadRejectedRate: number | null;
            rejectionReasons: Record<string, number>;
          }>;
        };
        executionEligibleMedianNetCarryBps: number | null;
        rawPricingArtifactCount: number;
        artifactExcludedCount: number;
        artifactExcludedMedianNetCarryBps: number | null;
        artifactExcludedTotalEstimatedNetPnlKrw: number;
      };
      measurementScope: { artifactExcludedSummary: string; spreadControl: string };
      topCarry: Array<{ netCarryBps: number; spotSpreadBps: number }>;
      topExecutableCarry: Array<{ netCarryBps: number }>;
      topRejectedCarry: Array<{ netCarryBps: number; executionRejectionReasons: string[] }>;
    };
    assert.ok(report.topCarry[0]?.netCarryBps > 10);
    assert.ok(report.topCarry[0]?.spotSpreadBps > 30);
    assert.equal(report.summary.positiveCount, 0);
    assert.equal(report.summary.executionEligibleCount, 0);
    assert.equal(report.summary.executionRejectedCount, 1);
    assert.equal(report.summary.executionRejectionReasons.spotSpreadTooWide, 1);
    assert.equal(report.summary.spreadControl.passed, false);
    assert.equal(report.summary.spreadControl.required, true);
    assert.equal(report.summary.spreadControl.spreadRejectedCount, 1);
    assert.equal(report.summary.spreadControl.spreadRejectedRate, 1);
    assert.equal(report.summary.spreadControl.rejectionReasons.spotSpreadTooWide, 1);
    assert.ok((report.summary.spreadControl.spreadStats.spot.medianBps ?? 0) > 30);
    assert.ok((report.summary.spreadControl.spreadStats.spot.p90Bps ?? 0) > 30);
    assert.equal(report.summary.spreadControl.fundingWindows.length, 1);
    assert.equal(report.summary.spreadControl.fundingWindows[0]?.sampleCount, 1);
    assert.equal(report.summary.spreadControl.fundingWindows[0]?.spreadRejectedCount, 1);
    assert.equal(report.summary.spreadControl.fundingWindows[0]?.spreadRejectedRate, 1);
    assert.equal(
      report.summary.spreadControl.fundingWindows[0]?.rejectionReasons.spotSpreadTooWide,
      1,
    );
    assert.equal(report.summary.executionEligibleMedianNetCarryBps, null);
    assert.equal(report.summary.rawPricingArtifactCount, 1);
    assert.equal(report.summary.artifactExcludedCount, 0);
    assert.equal(report.summary.artifactExcludedMedianNetCarryBps, null);
    assert.equal(report.summary.artifactExcludedTotalEstimatedNetPnlKrw, 0);
    assert.match(report.measurementScope.artifactExcludedSummary, /raw pricing artifacts/);
    assert.match(report.measurementScope.spreadControl, /execution-quality blockers/);
    assert.deepEqual(report.topExecutableCarry, []);
    assert.ok(report.topRejectedCarry[0]?.executionRejectionReasons.includes("spotSpreadTooWide"));
    assert.ok(
      report.topRejectedCarry[0]?.executionRejectionReasons.includes("rawNetCarryOutsideSanityBand"),
    );
    assert.ok(report.blockers.includes("wideDisplayedSpread"));
    assert.ok(report.blockers.includes("weakMedianNetCarry"));
    assert.ok(report.blockers.includes("lowPositiveCarryRate"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry allows rare filtered spread rejections when executable evidence is strong", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-filtered-spread-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const rows = Array.from({ length: 20 }, (_, index) => {
      const row = observation(index, { fundingRate: 0.001 }) as Record<string, unknown>;
      if (index === 0) {
        row.spot = book("bithumb", "KRW-BTC", 99_690, 100_000, 10);
      }
      return row;
    });
    writeJson(observationsPath, rows);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-16T04:30:00Z",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      status: string;
      promotionEligible: boolean;
      blockers: string[];
      summary: {
        executionEligibleRate: number;
        executionRejectedCount: number;
        executionRejectionReasons: Record<string, number>;
        spreadControl: {
          passed: boolean;
          required: boolean;
          spreadRejectedCount: number;
          spreadRejectedRate: number;
          fundingWindows: Array<{ spreadRejectedRate: number | null }>;
        };
      };
      perMarketSummary: Array<{
        spreadControl: {
          passed: boolean;
          required: boolean;
          spreadRejectedRate: number;
          fundingWindows: Array<{ spreadRejectedRate: number | null }>;
        };
        watchDecision: { requiredBeforeMetricCandidate: string[] };
      }>;
    };
    assert.equal(report.status, "promotion_candidate");
    assert.equal(report.promotionEligible, true);
    assert.ok(!report.blockers.includes("wideDisplayedSpread"));
    assert.equal(report.summary.executionEligibleRate, 0.95);
    assert.equal(report.summary.executionRejectedCount, 1);
    assert.equal(report.summary.executionRejectionReasons.spotSpreadTooWide, 1);
    assert.equal(report.summary.spreadControl.passed, true);
    assert.equal(report.summary.spreadControl.required, false);
    assert.equal(report.summary.spreadControl.spreadRejectedCount, 1);
    assert.equal(report.summary.spreadControl.spreadRejectedRate, 0.05);
    assert.equal(
      report.summary.spreadControl.fundingWindows.filter((window) => window.spreadRejectedRate === 1)
        .length,
      1,
    );
    assert.equal(report.perMarketSummary[0]?.spreadControl.passed, true);
    assert.equal(report.perMarketSummary[0]?.spreadControl.required, false);
    assert.equal(report.perMarketSummary[0]?.spreadControl.spreadRejectedRate, 0.05);
    assert.equal(
      report.perMarketSummary[0]?.spreadControl.fundingWindows.filter(
        (window) => window.spreadRejectedRate === 1,
      ).length,
      1,
    );
    assert.ok(
      !report.perMarketSummary[0]?.watchDecision.requiredBeforeMetricCandidate.includes(
        "spreadControl",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry reports spot-spread sensitivity without changing promotion policy", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-spread-sensitivity-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const spotBids = [99_950, 99_850, 99_750, 99_650];
    const rows = spotBids.map((bid, index) => {
      const row = observation(index, { fundingRate: 0.001 }) as Record<string, unknown>;
      row.spot = book("bithumb", "KRW-BTC", bid, 100_000, 10);
      return row;
    });
    writeJson(observationsPath, rows);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--min-observations",
        "1",
        "--min-completed-funding-events",
        "1",
        "--min-observation-span-minutes",
        "0",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      summary: {
        spreadControl: { thresholds: { maxSpotSpreadBps: number } };
        spreadSensitivity: Array<{
          maxSpotSpreadBps: number;
          executionEligibleCount: number;
          spreadRejectedCount: number;
          completedFundingWindowCount: number;
          medianWindowNetCarryBps: number | null;
          interpretation: string;
        }>;
      };
    };
    const byThreshold = new Map(
      report.summary.spreadSensitivity.map((row) => [row.maxSpotSpreadBps, row]),
    );
    assert.equal(report.summary.spreadControl.thresholds.maxSpotSpreadBps, 30);
    assert.equal(byThreshold.get(10)?.executionEligibleCount, 1);
    assert.equal(byThreshold.get(20)?.executionEligibleCount, 2);
    assert.equal(byThreshold.get(30)?.executionEligibleCount, 3);
    assert.equal(byThreshold.get(40)?.executionEligibleCount, 4);
    assert.equal(byThreshold.get(10)?.spreadRejectedCount, 3);
    assert.equal(byThreshold.get(30)?.completedFundingWindowCount, 3);
    assert.ok((byThreshold.get(30)?.medianWindowNetCarryBps ?? 0) > 10);
    assert.match(byThreshold.get(30)?.interpretation ?? "", /Diagnostic only/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry reports executable evidence per market", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-per-market-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const rows = Array.from({ length: 4 }, (_, index) => {
      const row = observation(index, {
        fundingRate: 0.001,
        perpBid: index % 2 === 0 ? 101.5 : 101,
        perpAsk: index % 2 === 0 ? 101.52 : 101.02,
      }) as Record<string, unknown>;
      if (index % 2 === 0) {
        row.market = "KRW-PIEVERSE";
        row.symbol = "PIEVERSEUSDT";
        row.spot = book("bithumb", "KRW-PIEVERSE", 99_950, 100_000, 10);
        row.perp = book("binance", "PIEVERSEUSDT", 101.5, 101.52, 10);
        row.funding = {
          ...(row.funding as Record<string, unknown>),
          symbol: "PIEVERSEUSDT",
        };
      } else {
        row.market = "KRW-EDU";
        row.symbol = "EDUUSDT";
        row.spot = book("bithumb", "KRW-EDU", 99_950, 100_000, 10);
        row.perp = book("binance", "EDUUSDT", 101, 101.02, 10);
        row.funding = {
          ...(row.funding as Record<string, unknown>),
          symbol: "EDUUSDT",
        };
      }
      return row;
    });
    writeJson(observationsPath, rows);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--min-observations",
        "1",
        "--min-completed-funding-events",
        "1",
        "--min-observation-span-minutes",
        "0",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      perMarketSummary: Array<{
        market: string;
        symbol: string;
        count: number;
        completedFundingCount: number;
        executionEligibleCount: number;
        executionEligiblePositiveRate: number;
        executionEligibleMedianNetCarryBps: number;
        fundingWindowSummary: {
          completedFundingWindowCount: number;
          executableSampleCount: number;
          isDeduplicatedByFundingWindow: boolean;
        };
        watchDecision: {
          status: string;
          reasons: string[];
          requiredBeforeMetricCandidate: string[];
          killPolicy: {
            minCompletedFundingEventsBeforeKill: number;
            minMedianNetCarryBps: number;
          };
        };
      }>;
    };
    assert.equal(report.perMarketSummary.length, 2);
    assert.equal(report.perMarketSummary[0]?.market, "KRW-PIEVERSE");
    assert.equal(report.perMarketSummary[0]?.symbol, "PIEVERSEUSDT");
    assert.equal(report.perMarketSummary[0]?.count, 2);
    assert.equal(report.perMarketSummary[0]?.completedFundingCount, 2);
    assert.equal(report.perMarketSummary[0]?.executionEligibleCount, 2);
    assert.equal(report.perMarketSummary[0]?.executionEligiblePositiveRate, 1);
    assert.equal(report.perMarketSummary[0]?.fundingWindowSummary.completedFundingWindowCount, 2);
    assert.equal(report.perMarketSummary[0]?.fundingWindowSummary.executableSampleCount, 2);
    assert.equal(report.perMarketSummary[0]?.fundingWindowSummary.isDeduplicatedByFundingWindow, true);
    assert.equal(report.perMarketSummary[0]?.watchDecision.status, "metric_candidate");
    assert.deepEqual(report.perMarketSummary[0]?.watchDecision.reasons, []);
    assert.equal(
      report.perMarketSummary[0]?.watchDecision.killPolicy.minCompletedFundingEventsBeforeKill,
      2,
    );
    assert.equal(report.perMarketSummary[0]?.watchDecision.killPolicy.minMedianNetCarryBps, 20);
    assert.ok(
      report.perMarketSummary[0]?.executionEligibleMedianNetCarryBps >
        (report.perMarketSummary[1]?.executionEligibleMedianNetCarryBps ?? 0),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry can derive a focused market report from mixed observations", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-filter-market-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const outputPath = join(directory, "pieverse-only.json");
    const rows = Array.from({ length: 4 }, (_, index) => {
      const row = observation(index, { fundingRate: 0.001 }) as Record<string, unknown>;
      if (index % 2 === 0) {
        row.market = "KRW-PIEVERSE";
        row.symbol = "PIEVERSEUSDT";
        row.spot = book("bithumb", "KRW-PIEVERSE", 99_950, 100_000, 10);
        row.perp = book("binance", "PIEVERSEUSDT", 101.5, 101.52, 10);
        row.funding = {
          ...(row.funding as Record<string, unknown>),
          symbol: "PIEVERSEUSDT",
        };
      } else {
        row.market = "KRW-EDU";
        row.symbol = "EDUUSDT";
        row.spot = book("bithumb", "KRW-EDU", 99_950, 100_000, 10);
        row.perp = book("binance", "EDUUSDT", 101, 101.02, 10);
        row.funding = {
          ...(row.funding as Record<string, unknown>),
          symbol: "EDUUSDT",
        };
      }
      return row;
    });
    writeJson(observationsPath, { observations: rows });

    execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--markets",
        "KRW-PIEVERSE:PIEVERSEUSDT",
        "--filter-input-to-markets",
        "--output",
        outputPath,
        "--min-observations",
        "1",
        "--min-completed-funding-events",
        "1",
        "--min-observation-span-minutes",
        "0",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(readFileSync(outputPath, "utf8")) as {
      observationCount: number;
      observations: Array<{ market: string; symbol: string }>;
      perMarketSummary: Array<{
        market: string;
        symbol: string;
        count: number;
        completedFundingCount: number;
      }>;
    };
    assert.equal(report.observationCount, 2);
    assert.deepEqual(
      report.observations.map((row) => `${row.market}:${row.symbol}`),
      ["KRW-PIEVERSE:PIEVERSEUSDT", "KRW-PIEVERSE:PIEVERSEUSDT"],
    );
    assert.equal(report.perMarketSummary.length, 1);
    assert.equal(report.perMarketSummary[0]?.market, "KRW-PIEVERSE");
    assert.equal(report.perMarketSummary[0]?.symbol, "PIEVERSEUSDT");
    assert.equal(report.perMarketSummary[0]?.count, 2);
    assert.equal(report.perMarketSummary[0]?.completedFundingCount, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry marks weak per-market evidence as a kill candidate after two funding windows", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-per-market-kill-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(
      observationsPath,
      Array.from({ length: 2 }, (_, index) =>
        observation(index, { fundingRate: 0.000001, perpBid: 100, perpAsk: 100.02 }),
      ),
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--min-observations",
        "1",
        "--min-completed-funding-events",
        "1",
        "--min-observation-span-minutes",
        "0",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      perMarketSummary: Array<{
        watchDecision: {
          status: string;
          reasons: string[];
        };
      }>;
    };
    assert.equal(report.perMarketSummary[0]?.watchDecision.status, "kill_candidate");
    assert.ok(
      report.perMarketSummary[0]?.watchDecision.reasons.includes(
        "medianNetCarryBelowKillThresholdAfterTwoFundingWindows",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry blocks unsupported negative funding direction", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-negative-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(
      observationsPath,
      Array.from({ length: 19 }, (_, index) => observation(index, { fundingRate: -0.001 })),
    );

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-16T00:00:00Z",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      blockers: string[];
      summary: { supportedFundingCount: number };
      topCarry: Array<{ direction: string }>;
    };
    assert.equal(report.summary.supportedFundingCount, 0);
    assert.equal(report.topCarry[0]?.direction, "unsupported_negative_funding");
    assert.ok(report.blockers.includes("unsupportedFundingDirection"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry auto funding discovery is live-data only and mutually exclusive", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-auto-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, [observation(0)]);

    const inputConflict = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--auto-top-funding-markets",
        "5",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(inputConflict.status, 1);
    assert.match(
      inputConflict.stderr.toString(),
      /--auto-top-funding-markets cannot be combined with --input-observations/,
    );

    const marketConflict = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--markets",
        "KRW-EDU:EDUUSDT",
        "--auto-top-funding-markets",
        "5",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(marketConflict.status, 1);
    assert.match(
      marketConflict.stderr.toString(),
      /--auto-top-funding-markets cannot be combined with --markets/,
    );

    const currentCarryInputConflict = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--input-observations",
        observationsPath,
        "--auto-top-current-carry-markets",
        "5",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(currentCarryInputConflict.status, 1);
    assert.match(
      currentCarryInputConflict.stderr.toString(),
      /--auto-top-current-carry-markets cannot be combined with --input-observations/,
    );

    const currentCarryMarketConflict = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--markets",
        "KRW-EDU:EDUUSDT",
        "--auto-top-current-carry-markets",
        "5",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(currentCarryMarketConflict.status, 1);
    assert.match(
      currentCarryMarketConflict.stderr.toString(),
      /--auto-top-current-carry-markets cannot be combined with --markets/,
    );

    const autoModeConflict = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--auto-top-funding-markets",
        "5",
        "--auto-top-current-carry-markets",
        "5",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(autoModeConflict.status, 1);
    assert.match(
      autoModeConflict.stderr.toString(),
      /--auto-top-funding-markets cannot be combined with --auto-top-current-carry-markets/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry auto funding discovery excludes non-crypto Binance contracts", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-carry-auto-contract-filter-"));
  try {
    const mockFetchPath = join(directory, "mock-fetch.mjs");
    writeFileSync(
      mockFetchPath,
      `
const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname === "api.bithumb.com" && url.pathname === "/v1/market/all") {
    return jsonResponse([
      { market: "KRW-META" },
      { market: "KRW-SOON" },
      { market: "KRW-USDT" },
    ]);
  }
  if (url.hostname === "fapi.binance.com" && url.pathname === "/fapi/v1/exchangeInfo") {
    return jsonResponse({
      symbols: [
        { symbol: "METAUSDT", status: "TRADING", contractType: "TRADIFI_PERPETUAL" },
        { symbol: "SOONUSDT", status: "TRADING", contractType: "PERPETUAL" },
      ],
    });
  }
  if (url.hostname === "fapi.binance.com" && url.pathname === "/fapi/v1/premiumIndex") {
    const symbol = url.searchParams.get("symbol");
    if (symbol === "SOONUSDT") {
      return jsonResponse({
        symbol: "SOONUSDT",
        lastFundingRate: "0.0001",
        nextFundingTime: ${Date.parse("2026-05-14T16:00:00Z")},
        markPrice: "0.2",
        indexPrice: "0.2",
      });
    }
    return jsonResponse([
      {
        symbol: "METAUSDT",
        lastFundingRate: "0.001",
        nextFundingTime: ${Date.parse("2026-05-14T16:00:00Z")},
      },
      {
        symbol: "SOONUSDT",
        lastFundingRate: "0.0001",
        nextFundingTime: ${Date.parse("2026-05-14T16:00:00Z")},
      },
    ]);
  }
  if (url.hostname === "api.bithumb.com" && url.pathname === "/v1/orderbook") {
    const market = url.searchParams.get("markets");
    if (market === "KRW-USDT") {
      return jsonResponse([{ market, orderbook_units: [{ bid_price: 1400, ask_price: 1401, bid_size: 10000, ask_size: 10000 }] }]);
    }
    return jsonResponse([{ market, orderbook_units: [{ bid_price: 280, ask_price: 281, bid_size: 10000, ask_size: 10000 }] }]);
  }
  if (url.hostname === "fapi.binance.com" && url.pathname === "/fapi/v1/depth") {
    return jsonResponse({ bids: [["0.21", "10000"]], asks: [["0.211", "10000"]] });
  }
  if (url.hostname === "fapi.binance.com" && url.pathname === "/fapi/v1/fundingRate") {
    return jsonResponse([{ fundingRate: "0.0001", fundingTime: ${Date.parse("2026-05-14T08:00:00Z")} }]);
  }
  throw new Error("unexpected fetch " + url.toString());
};
`,
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        mockFetchPath,
        "dist/src/cli/analyze-spot-perp-carry.js",
        "--auto-top-funding-markets",
        "1",
        "--now",
        "2026-05-14T08:10:00Z",
        "--min-observations",
        "1",
        "--min-completed-funding-events",
        "1",
        "--min-observation-span-minutes",
        "0",
        "--quiet",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      perMarketSummary: Array<{ market: string; symbol: string }>;
    };
    assert.deepEqual(report.perMarketSummary.map((market) => `${market.market}:${market.symbol}`), [
      "KRW-SOON:SOONUSDT",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
