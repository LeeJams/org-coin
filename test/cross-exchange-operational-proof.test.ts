import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCrossExchangeOperationalProof } from "../src/index.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertAlmostEqual(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("cross-exchange operational proof confirms fees and required inventory", () => {
  const proof = buildCrossExchangeOperationalProof(
    {
      notionalKrw: 50_000,
      direction: "sell_bithumb_buy_reference",
      bithumbPriceKrw: 120_000_000,
      referenceQuoteToKrw: 1473,
      maxBithumbFeeBps: 4,
      maxReferenceFeeBps: 10,
      bithumbAccounts: [
        { currency: "BTC", balance: "0.001", locked: "0" },
        { currency: "KRW", balance: "100000", locked: "0" },
      ],
      bithumbOrderChance: {
        ask_fee: "0.0004",
        bid_fee: "0.0004",
      },
      referenceAccount: {
        balances: [
          { asset: "BTC", free: "0", locked: "0" },
          { asset: "USDT", free: "100", locked: "0" },
        ],
      },
      referenceCommission: {
        standardCommission: {
          taker: "0.001",
        },
      },
    },
    () => new Date("2026-05-13T00:00:00.000Z"),
  );

  assert.equal(proof.generatedAt, "2026-05-13T00:00:00.000Z");
  assert.equal(proof.accountFeesConfirmed, true);
  assert.equal(proof.hedgeVenueReady, true);
  assert.equal(proof.requirements.bithumbBaseRequiredKrw, 50_000);
  assertAlmostEqual(proof.requirements.referenceQuoteRequiredKrw, 50_050);
  assert.equal(proof.inventory.bithumbBaseInventoryKrw, 120_000);
  assert.equal(proof.inventory.referenceQuoteInventoryKrw, 147_300);
  assert.deepEqual(proof.deficits, {
    bithumbBaseDeficitKrw: 0,
    bithumbQuoteDeficitKrw: 0,
    referenceBaseDeficitKrw: 0,
    referenceQuoteDeficitKrw: 0,
  });
  assert.equal(proof.details.bithumbBaseRequired, 50_000 / 120_000_000);
  assertAlmostEqual(proof.details.referenceQuoteRequired, 50_050 / 1473);
  assert.deepEqual(proof.reasons, []);
});

test("cross-exchange operational proof blocks high fees and missing hedge inventory", () => {
  const proof = buildCrossExchangeOperationalProof({
    notionalKrw: 50_000,
    direction: "sell_bithumb_buy_reference",
    bithumbPriceKrw: 120_000_000,
    referenceQuoteToKrw: 1473,
    maxBithumbFeeBps: 4,
    maxReferenceFeeBps: 10,
    bithumbAccounts: [{ currency: "BTC", balance: "0.0001" }],
    bithumbOrderChance: { ask_fee: "0.0025" },
    referenceAccount: { balances: [{ asset: "USDT", free: "1" }] },
    referenceCommission: { standardCommission: { taker: "0.0015" } },
  });

  assert.equal(proof.accountFeesConfirmed, false);
  assert.equal(proof.hedgeVenueReady, false);
  assert.equal(proof.requirements.bithumbBaseRequiredKrw, 50_000);
  assert.equal(proof.requirements.referenceQuoteRequiredKrw, 50_075);
  assert.equal(proof.deficits.bithumbBaseDeficitKrw, 38_000);
  assert.equal(proof.deficits.referenceQuoteDeficitKrw, 48_602);
  assert.deepEqual(proof.reasons, [
    "bithumbFeeTooHigh",
    "referenceFeeTooHigh",
    "bithumbBaseInventoryInsufficient",
    "referenceQuoteInventoryInsufficient",
  ]);
});

test("cross-exchange operational proof CLI reports missing credentials without network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-cross-proof-"));
  try {
    const reportPath = join(directory, "relative-value.json");
    writeJson(reportPath, {
      assumptions: {
        notionalKrw: 50_000,
        bithumbFeeBps: 4,
        globalFeeBps: 10,
        usdKrw: 1473,
      },
      topEdges: [{ direction: "sell_bithumb_buy_reference" }],
      observations: [
        {
          bithumb: {
            bidPrice: 120_000_000,
            askPrice: 120_001_000,
          },
        },
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-cross-exchange-operational-proof.js",
        "--relative-value-report",
        reportPath,
        "--dotenv",
        "none",
        "--require-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
        },
      },
    );

    assert.equal(result.status, 2);
    const proof = JSON.parse(result.stdout) as {
      accountFeesConfirmed: boolean;
      hedgeVenueReady: boolean;
      requirements: {
        bithumbBaseRequiredKrw: number;
        referenceQuoteRequiredKrw: number;
      };
      deficits: {
        bithumbBaseDeficitKrw: number;
        referenceQuoteDeficitKrw: number;
      };
      details: {
        bithumbBaseRequired: number;
        referenceQuoteRequired: number;
      };
      reasons: string[];
    };
    assert.equal(proof.accountFeesConfirmed, false);
    assert.equal(proof.hedgeVenueReady, false);
    assert.equal(proof.requirements.bithumbBaseRequiredKrw, 50_000);
    assertAlmostEqual(proof.requirements.referenceQuoteRequiredKrw, 50_050);
    assert.equal(proof.deficits.bithumbBaseDeficitKrw, 50_000);
    assertAlmostEqual(proof.deficits.referenceQuoteDeficitKrw, 50_050);
    assert.equal(proof.details.bithumbBaseRequired, 50_000 / 120_000_500);
    assertAlmostEqual(proof.details.referenceQuoteRequired, 50_050 / 1473);
    assert.deepEqual(proof.reasons, ["credentialsMissing"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
