import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function observation(index: number): unknown {
  const capturedAt = new Date(Date.parse("2026-05-13T00:00:00Z") + index * 60_000).toISOString();
  const timestampMs = Date.parse(capturedAt);
  return {
    capturedAt,
    market: "KRW-BTC",
    bithumb: {
      venue: "bithumb",
      market: "KRW-BTC",
      bidPrice: 101_000,
      bidSize: 10,
      askPrice: 101_100,
      askSize: 10,
      timestampMs,
      receivedAtMs: timestampMs + 10,
    },
    upbit: {
      venue: "upbit",
      market: "KRW-BTC",
      bidPrice: 99_900,
      bidSize: 10,
      askPrice: 100_000,
      askSize: 10,
      timestampMs,
      receivedAtMs: timestampMs + 20,
    },
  };
}

function globalObservation(index: number): unknown {
  const capturedAt = new Date(Date.parse("2026-05-13T00:00:00Z") + index * 60_000).toISOString();
  const timestampMs = Date.parse(capturedAt);
  return {
    capturedAt,
    market: "KRW-BTC",
    usdKrw: 1000,
    bithumb: {
      venue: "bithumb",
      market: "KRW-BTC",
      bidPrice: 103_000,
      bidSize: 10,
      askPrice: 103_100,
      askSize: 10,
      timestampMs,
      receivedAtMs: timestampMs + 10,
    },
    upbit: {
      venue: "upbit",
      market: "KRW-BTC",
      bidPrice: 102_800,
      bidSize: 10,
      askPrice: 103_100,
      askSize: 10,
      timestampMs,
      receivedAtMs: timestampMs + 20,
    },
    binance: {
      venue: "binance",
      market: "BTCUSDT",
      bidPrice: 99.9,
      bidSize: 10,
      askPrice: 100,
      askSize: 10,
      timestampMs: null,
      receivedAtMs: timestampMs + 30,
    },
  };
}

function globalObservationWithUsdtKrw(index: number): unknown {
  const row = globalObservation(index) as Record<string, unknown>;
  delete row.usdKrw;
  const capturedAt = row.capturedAt as string;
  const timestampMs = Date.parse(capturedAt);
  return {
    ...row,
    usdtKrw: {
      venue: "bithumb",
      market: "KRW-USDT",
      bidPrice: 1029,
      bidSize: 10_000,
      askPrice: 1030,
      askSize: 10_000,
      timestampMs,
      receivedAtMs: timestampMs + 25,
    },
  };
}

test("cross-exchange relative value can promote repeated fee-stressed premium observations", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-promote-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, Array.from({ length: 120 }, (_, index) => observation(index)));

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T02:00:00Z",
        "--min-observations",
        "100",
        "--min-net-edge-bps",
        "20",
        "--min-edge-observation-rate",
        "0.9",
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
      summary: { positiveCount: number; medianNetEdgeBps: number };
      topEdges: Array<{ direction: string; referenceVenue: string; netEdgeBps: number }>;
    };
    assert.equal(report.status, "promotion_candidate");
    assert.equal(report.promotionEligible, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(report.summary.positiveCount, 120);
    assert.ok(report.summary.medianNetEdgeBps > 20);
    assert.equal(report.topEdges[0]?.direction, "sell_bithumb_buy_reference");
    assert.equal(report.topEdges[0]?.referenceVenue, "upbit");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange relative value blocks undersampled observations without hedge readiness", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-blocked-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, [observation(0)]);

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T02:00:00Z",
        "--min-observations",
        "100",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      status: string;
      promotionEligible: boolean;
      blockers: string[];
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.promotionEligible, false);
    assert.ok(report.blockers.includes("insufficientObservations"));
    assert.ok(report.blockers.includes("feeScheduleUnconfirmed"));
    assert.ok(report.blockers.includes("inventoryNotReady"));
    assert.ok(report.blockers.includes("hedgeVenueNotReady"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange relative value blocks short-lived observation clusters", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-short-span-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(
      observationsPath,
      Array.from({ length: 120 }, (_, index) => {
        const capturedAt = new Date(Date.parse("2026-05-13T00:00:00Z") + index * 1000).toISOString();
        return {
          ...(observation(0) as Record<string, unknown>),
          capturedAt,
          bithumb: {
            ...((observation(0) as { bithumb: Record<string, unknown> }).bithumb),
            timestampMs: Date.parse(capturedAt),
            receivedAtMs: Date.parse(capturedAt) + 10,
          },
          upbit: {
            ...((observation(0) as { upbit: Record<string, unknown> }).upbit),
            timestampMs: Date.parse(capturedAt),
            receivedAtMs: Date.parse(capturedAt) + 20,
          },
        };
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T00:03:00Z",
        "--min-observations",
        "100",
        "--min-observation-span-minutes",
        "60",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      promotionEligible: boolean;
      observationSpanMinutes: number;
      blockers: string[];
    };
    assert.equal(report.promotionEligible, false);
    assert.ok(report.observationSpanMinutes < 60);
    assert.ok(report.blockers.includes("insufficientObservationSpan"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange relative value can use multi-level depth for executable pricing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-depth-"));
  try {
    const observationsPath = join(directory, "observations.json");
    const observations = Array.from({ length: 120 }, (_, index) => {
      const capturedAt = new Date(Date.parse("2026-05-13T00:00:00Z") + index * 60_000).toISOString();
      const timestampMs = Date.parse(capturedAt);
      return {
        capturedAt,
        market: "KRW-BTC",
        usdKrw: 1000,
        bithumb: {
          venue: "bithumb",
          market: "KRW-BTC",
          bidPrice: 103_000,
          bidSize: 0.01,
          askPrice: 103_100,
          askSize: 0.01,
          bids: [
            { price: 103_000, size: 0.01 },
            { price: 102_990, size: 1 },
          ],
          asks: [
            { price: 103_100, size: 0.01 },
            { price: 103_110, size: 1 },
          ],
          timestampMs,
          receivedAtMs: timestampMs + 10,
        },
        upbit: {
          venue: "upbit",
          market: "KRW-BTC",
          bidPrice: 102_800,
          bidSize: 0.01,
          askPrice: 103_100,
          askSize: 0.01,
          bids: [{ price: 102_800, size: 1 }],
          asks: [{ price: 103_100, size: 1 }],
          timestampMs,
          receivedAtMs: timestampMs + 20,
        },
        binance: {
          venue: "binance",
          market: "BTCUSDT",
          bidPrice: 99.9,
          bidSize: 0.01,
          askPrice: 100,
          askSize: 0.01,
          bids: [{ price: 99.9, size: 1 }],
          asks: [
            { price: 100, size: 0.01 },
            { price: 100.01, size: 1 },
          ],
          timestampMs: null,
          receivedAtMs: timestampMs + 30,
        },
      };
    });
    writeJson(observationsPath, observations);

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T02:00:00Z",
        "--usd-krw",
        "1000",
        "--usd-krw-updated-at",
        "2026-05-13T01:30:00Z",
        "--notional-krw",
        "50000",
        "--allow-receive-time-skew",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      promotionEligible: boolean;
      summary: { depthCoverageRate: number; medianNetEdgeBps: number };
      topEdges: Array<{
        bithumbTopNotionalKrw: number;
        bithumbDepthNotionalKrw: number;
        referenceTopNotionalKrw: number;
        referenceDepthNotionalKrw: number;
      }>;
    };
    assert.equal(report.promotionEligible, true);
    assert.equal(report.summary.depthCoverageRate, 1);
    assert.ok(report.summary.medianNetEdgeBps > 20);
    assert.ok(report.topEdges[0]!.bithumbTopNotionalKrw < 50_000);
    assert.ok(report.topEdges[0]!.bithumbDepthNotionalKrw >= 50_000);
    assert.ok(report.topEdges[0]!.referenceTopNotionalKrw < 50_000);
    assert.ok(report.topEdges[0]!.referenceDepthNotionalKrw >= 50_000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange relative value blocks global observations without FX and skew evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-global-blocked-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, Array.from({ length: 120 }, (_, index) => globalObservation(index)));

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T02:00:00Z",
        "--usd-krw",
        "1000",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
        "--require-promotion",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout) as {
      status: string;
      promotionEligible: boolean;
      blockers: string[];
    };
    assert.equal(report.status, "blocked");
    assert.equal(report.promotionEligible, false);
    assert.ok(report.blockers.includes("missingFxTimestamp"));
    assert.ok(report.blockers.includes("missingSnapshotSkew"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange relative value can use explicit FX freshness and receive-time skew fallback", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-global-promote-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, Array.from({ length: 120 }, (_, index) => globalObservation(index)));

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T02:00:00Z",
        "--usd-krw",
        "1000",
        "--usd-krw-updated-at",
        "2026-05-13T01:30:00Z",
        "--allow-receive-time-skew",
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
      fxAgeHours: number;
      topEdges: Array<{ referenceVenue: string; snapshotSkewSource: string; snapshotSkewMs: number }>;
    };
    assert.equal(report.status, "promotion_candidate");
    assert.equal(report.promotionEligible, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(report.fxAgeHours, 0.5);
    assert.equal(report.topEdges[0]?.referenceVenue, "binance");
    assert.equal(report.topEdges[0]?.snapshotSkewSource, "receive");
    assert.equal(report.topEdges[0]?.snapshotSkewMs, 20);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange relative value can explicitly override stored input FX for sensitivity", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-fx-override-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, Array.from({ length: 120 }, (_, index) => globalObservation(index)));

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T02:00:00Z",
        "--usd-krw",
        "1030",
        "--usd-krw-updated-at",
        "2026-05-13T01:30:00Z",
        "--override-input-usd-krw",
        "--reference-venue",
        "binance",
        "--allow-receive-time-skew",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      promotionEligible: boolean;
      blockers: string[];
      assumptions: { usdKrw: number; overrideInputUsdKrw: boolean; referenceVenue: string };
      summary: { medianNetEdgeBps: number };
      topEdges: Array<{ referenceVenue: string }>;
      observations: Array<{ usdKrw: number }>;
    };
    assert.equal(report.assumptions.usdKrw, 1030);
    assert.equal(report.assumptions.overrideInputUsdKrw, true);
    assert.equal(report.assumptions.referenceVenue, "binance");
    assert.equal(report.topEdges[0]?.referenceVenue, "binance");
    assert.equal(report.observations[0]?.usdKrw, 1030);
    assert.equal(report.promotionEligible, false);
    assert.ok(report.blockers.includes("weakMedianNetEdge"));
    assert.ok(report.blockers.includes("lowEdgeObservationRate"));
    assert.ok(report.summary.medianNetEdgeBps < 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-exchange relative value can use observed USDT/KRW books without an external FX timestamp", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-relative-value-usdt-book-"));
  try {
    const observationsPath = join(directory, "observations.json");
    writeJson(observationsPath, Array.from({ length: 120 }, (_, index) => globalObservationWithUsdtKrw(index)));

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-cross-exchange-relative-value.js",
        "--input-observations",
        observationsPath,
        "--now",
        "2026-05-13T02:00:00Z",
        "--reference-venue",
        "binance",
        "--allow-receive-time-skew",
        "--account-fees-confirmed",
        "--inventory-ready",
        "--hedge-venue-ready",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const report = JSON.parse(output) as {
      promotionEligible: boolean;
      blockers: string[];
      summary: { medianNetEdgeBps: number };
      topEdges: Array<{ referenceVenue: string }>;
      observations: Array<{ usdtKrw: { market: string } }>;
    };
    assert.equal(report.promotionEligible, false);
    assert.equal(report.blockers.includes("missingFxTimestamp"), false);
    assert.equal(report.blockers.includes("staleFxRate"), false);
    assert.equal(report.topEdges[0]?.referenceVenue, "binance");
    assert.equal(report.observations[0]?.usdtKrw.market, "KRW-USDT");
    assert.ok(report.summary.medianNetEdgeBps < 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
