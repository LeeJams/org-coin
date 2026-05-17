import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSpotPerpCarryOperationalProof } from "../src/index.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertAlmostEqual(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

async function spawnNode(args: string[], env: NodeJS.ProcessEnv): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { status, stdout, stderr };
}

test("spot-perp carry operational proof confirms fees and hedge inventory", () => {
  const proof = buildSpotPerpCarryOperationalProof(
    {
      markets: [
        { market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" },
        { market: "KRW-EDU", symbol: "EDUUSDT" },
      ],
      notionalKrw: 500_000,
      referenceQuoteToKrw: 1_485,
      maxBithumbFeeBps: 4,
      maxBinanceFuturesTakerFeeBps: 5,
      bithumbAccounts: [{ currency: "KRW", balance: "1100000" }],
      bithumbOrderChances: {
        "KRW-PIEVERSE": { bid_fee: "0.0004" },
        "KRW-EDU": { bid_fee: "0.0004" },
      },
      binanceFuturesAccount: {
        assets: [{ asset: "USDT", availableBalance: "800" }],
      },
      binanceFuturesCommissions: {
        PIEVERSEUSDT: { takerCommissionRate: "0.0005" },
        EDUUSDT: { takerCommissionRate: "0.0005" },
      },
    },
    () => new Date("2026-05-13T00:00:00.000Z"),
  );

  assert.equal(proof.generatedAt, "2026-05-13T00:00:00.000Z");
  assert.equal(proof.accountFeesConfirmed, true);
  assert.equal(proof.inventoryReady, true);
  assert.equal(proof.hedgeVenueReady, true);
  assert.deepEqual(proof.approvedMarkets, ["KRW-PIEVERSE", "KRW-EDU"]);
  assert.equal(proof.requirements.totalSpotQuoteRequiredKrw, 1_000_400);
  assert.equal(proof.requirements.totalFuturesMarginRequiredKrw, 1_000_500);
  assertAlmostEqual(proof.requirements.totalFuturesMarginRequiredUsdt, 673.737374);
  assert.deepEqual(proof.reasons, []);
});

test("spot-perp carry operational proof blocks high fees and missing futures margin", () => {
  const proof = buildSpotPerpCarryOperationalProof({
    markets: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
    notionalKrw: 500_000,
    referenceQuoteToKrw: 1_485,
    maxBithumbFeeBps: 4,
    maxBinanceFuturesTakerFeeBps: 5,
    bithumbAccounts: [{ currency: "KRW", balance: "100000" }],
    bithumbOrderChances: {
      "KRW-PIEVERSE": { bid_fee: "0.0008" },
    },
    binanceFuturesAccount: {
      assets: [{ asset: "USDT", availableBalance: "10" }],
    },
    binanceFuturesCommissions: {
      PIEVERSEUSDT: { takerCommissionRate: "0.001" },
    },
  });

  assert.equal(proof.accountFeesConfirmed, false);
  assert.equal(proof.inventoryReady, false);
  assert.equal(proof.hedgeVenueReady, false);
  assert.deepEqual(proof.approvedMarkets, []);
  assert.equal(proof.deficits.bithumbQuoteDeficitKrw, 400_400);
  assertAlmostEqual(proof.deficits.binanceUsdtDeficit, 327.037037);
  assert.deepEqual(proof.reasons, [
    "market:KRW-PIEVERSE:bithumbFeeTooHigh",
    "symbol:PIEVERSEUSDT:binanceFuturesFeeTooHigh",
    "bithumbQuoteInventoryInsufficient",
    "binanceUsdtMarginInsufficient",
  ]);
});

test("spot-perp carry operational proof CLI reports missing credentials without network calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-proof-"));
  try {
    const reportPath = join(directory, "carry.json");
    writeJson(reportPath, {
      assumptions: {
        markets: [
          { market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" },
          { market: "KRW-EDU", symbol: "EDUUSDT" },
        ],
        notionalKrw: 500_000,
        bithumbFeeBps: 4,
        binanceTakerFeeBps: 5,
      },
      observations: [
        {
          usdtKrw: {
            bidPrice: 1484,
            askPrice: 1486,
          },
        },
      ],
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-operational-proof.js",
        "--carry-report",
        reportPath,
        "--dotenv",
        "none",
        "--require-ready",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { PATH: process.env.PATH },
      },
    );

    assert.equal(result.status, 2);
    const proof = JSON.parse(result.stdout) as {
      accountFeesConfirmed: boolean;
      inventoryReady: boolean;
      hedgeVenueReady: boolean;
      requirements: {
        totalSpotQuoteRequiredKrw: number;
        totalFuturesMarginRequiredUsdt: number;
      };
      deficits: {
        bithumbQuoteDeficitKrw: number;
        binanceUsdtDeficit: number;
      };
      details: { missingSecrets: string[] };
      reasons: string[];
    };
    assert.equal(proof.accountFeesConfirmed, false);
    assert.equal(proof.inventoryReady, false);
    assert.equal(proof.hedgeVenueReady, false);
    assert.equal(proof.requirements.totalSpotQuoteRequiredKrw, 1_000_400);
    assertAlmostEqual(proof.requirements.totalFuturesMarginRequiredUsdt, 673.737374);
    assert.equal(proof.deficits.bithumbQuoteDeficitKrw, 1_000_400);
    assertAlmostEqual(proof.deficits.binanceUsdtDeficit, 673.737374);
    assert.deepEqual(proof.details.missingSecrets, [
      "BITHUMB_ACCESS_KEY",
      "BITHUMB_SECRET_KEY",
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.deepEqual(proof.reasons, ["credentialsMissing"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry operational proof CLI keeps Bithumb proof when only Binance credentials are missing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-proof-bithumb-only-"));
  const requests: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/accounts") {
      response.end(JSON.stringify([{ currency: "KRW", balance: "600000" }]));
      return;
    }
    if (request.url?.startsWith("/v1/orders/chance?")) {
      response.end(JSON.stringify({ bid_fee: "0.0004" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "unexpected request" }));
  });

  try {
    const reportPath = join(directory, "carry.json");
    writeJson(reportPath, {
      assumptions: {
        markets: [{ market: "KRW-AZTEC", symbol: "AZTECUSDT" }],
        notionalKrw: 500_000,
        bithumbFeeBps: 4,
        binanceTakerFeeBps: 5,
      },
      observations: [{ usdtKrw: { bidPrice: 1484, askPrice: 1486 } }],
    });
    await new Promise<void>((resolveListening) => {
      server.listen(0, "127.0.0.1", resolveListening);
    });
    const address = server.address();
    assert.ok(typeof address === "object" && address !== null);
    const { port } = address as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const result = await spawnNode(
      [
        "dist/src/cli/audit-spot-perp-carry-operational-proof.js",
        "--carry-report",
        reportPath,
        "--dotenv",
        "none",
        "--require-ready",
      ],
      {
        PATH: process.env.PATH,
        BITHUMB_ACCESS_KEY: "bithumb-access",
        BITHUMB_SECRET_KEY: "bithumb-secret",
        BITHUMB_REST_BASE_URL: baseUrl,
      },
    );

    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(requests.sort(), [
      "/v1/accounts",
      "/v1/orders/chance?market=KRW-AZTEC",
    ]);
    const proof = JSON.parse(result.stdout) as {
      accountFeesConfirmed: boolean;
      inventoryReady: boolean;
      hedgeVenueReady: boolean;
      approvedMarkets: string[];
      inventory: {
        bithumbQuoteFreeKrw: number;
        binanceUsdtAvailable: number;
      };
      deficits: {
        bithumbQuoteDeficitKrw: number;
        binanceUsdtDeficit: number;
      };
      details: {
        bithumbBidFeeBpsByMarket: Record<string, number | null>;
        binanceFuturesTakerFeeBpsBySymbol: Record<string, number | null>;
        missingSecrets: string[];
        feeBudget: {
          carryReportPath: string;
          feeBudgetReportPaths: string[];
          maxBithumbFeeBps: number;
          maxBinanceFuturesTakerFeeBps: number;
        };
      };
      reasons: string[];
    };
    assert.equal(proof.accountFeesConfirmed, false);
    assert.equal(proof.inventoryReady, false);
    assert.equal(proof.hedgeVenueReady, false);
    assert.deepEqual(proof.approvedMarkets, []);
    assert.equal(proof.inventory.bithumbQuoteFreeKrw, 600_000);
    assert.equal(proof.inventory.binanceUsdtAvailable, 0);
    assert.equal(proof.deficits.bithumbQuoteDeficitKrw, 0);
    assertAlmostEqual(proof.deficits.binanceUsdtDeficit, 336.868687);
    assert.deepEqual(proof.details.bithumbBidFeeBpsByMarket, { "KRW-AZTEC": 4 });
    assert.deepEqual(proof.details.binanceFuturesTakerFeeBpsBySymbol, { AZTECUSDT: null });
    assert.deepEqual(proof.details.missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(proof.details.feeBudget.carryReportPath, reportPath);
    assert.deepEqual(proof.details.feeBudget.feeBudgetReportPaths, []);
    assert.equal(proof.details.feeBudget.maxBithumbFeeBps, 4);
    assert.equal(proof.details.feeBudget.maxBinanceFuturesTakerFeeBps, 5);
    assert.deepEqual(proof.reasons, [
      "credentialsMissing",
      "symbol:AZTECUSDT:binanceFuturesFeeUnavailable",
      "binanceUsdtMarginInsufficient",
    ]);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.closeAllConnections();
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry operational proof CLI can use fee-stress report as fee budget", async () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-proof-fee-budget-"));
  const requests: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/accounts") {
      response.end(JSON.stringify([{ currency: "KRW", balance: "600000" }]));
      return;
    }
    if (request.url?.startsWith("/v1/orders/chance?")) {
      response.end(JSON.stringify({ bid_fee: "0.0025" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "unexpected request" }));
  });

  try {
    const reportPath = join(directory, "carry.json");
    const feeBudgetPath = join(directory, "fee-stress.json");
    const observations = [{ usdtKrw: { bidPrice: 1484, askPrice: 1486 } }];
    writeJson(reportPath, {
      assumptions: {
        markets: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
        notionalKrw: 500_000,
        bithumbFeeBps: 4,
        binanceTakerFeeBps: 5,
      },
      observations,
    });
    writeJson(feeBudgetPath, {
      assumptions: {
        markets: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
        notionalKrw: 500_000,
        bithumbFeeBps: 25,
        binanceTakerFeeBps: 5,
      },
      observations,
    });
    await new Promise<void>((resolveListening) => {
      server.listen(0, "127.0.0.1", resolveListening);
    });
    const address = server.address();
    assert.ok(typeof address === "object" && address !== null);
    const { port } = address as AddressInfo;

    const result = await spawnNode(
      [
        "dist/src/cli/audit-spot-perp-carry-operational-proof.js",
        "--carry-report",
        reportPath,
        "--fee-budget-report",
        feeBudgetPath,
        "--dotenv",
        "none",
        "--require-ready",
      ],
      {
        PATH: process.env.PATH,
        BITHUMB_ACCESS_KEY: "bithumb-access",
        BITHUMB_SECRET_KEY: "bithumb-secret",
        BITHUMB_REST_BASE_URL: `http://127.0.0.1:${port}`,
      },
    );

    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(requests.sort(), [
      "/v1/accounts",
      "/v1/orders/chance?market=KRW-PIEVERSE",
    ]);
    const proof = JSON.parse(result.stdout) as {
      accountFeesConfirmed: boolean;
      inventoryReady: boolean;
      details: {
        bithumbBidFeeBpsByMarket: Record<string, number | null>;
        missingSecrets: string[];
        feeBudget: {
          carryReportPath: string;
          feeBudgetReportPaths: string[];
          maxBithumbFeeBps: number;
          maxBinanceFuturesTakerFeeBps: number;
        };
      };
      deficits: {
        bithumbQuoteDeficitKrw: number;
        binanceUsdtDeficit: number;
      };
      reasons: string[];
    };
    assert.equal(proof.accountFeesConfirmed, false);
    assert.equal(proof.inventoryReady, false);
    assert.deepEqual(proof.details.bithumbBidFeeBpsByMarket, { "KRW-PIEVERSE": 25 });
    assert.deepEqual(proof.details.missingSecrets, [
      "BINANCE_API_KEY",
      "BINANCE_SECRET_KEY",
    ]);
    assert.equal(proof.details.feeBudget.carryReportPath, reportPath);
    assert.deepEqual(proof.details.feeBudget.feeBudgetReportPaths, [feeBudgetPath]);
    assert.equal(proof.details.feeBudget.maxBithumbFeeBps, 25);
    assert.equal(proof.details.feeBudget.maxBinanceFuturesTakerFeeBps, 5);
    assert.equal(proof.deficits.bithumbQuoteDeficitKrw, 0);
    assertAlmostEqual(proof.deficits.binanceUsdtDeficit, 336.868687);
    assert.deepEqual(proof.reasons, [
      "credentialsMissing",
      "symbol:PIEVERSEUSDT:binanceFuturesFeeUnavailable",
      "binanceUsdtMarginInsufficient",
    ]);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.closeAllConnections();
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
    rmSync(directory, { recursive: true, force: true });
  }
});

test("spot-perp carry operational proof CLI can print quiet operational summary", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-spot-perp-proof-quiet-"));
  try {
    const reportPath = join(directory, "carry.json");
    const feeBudgetPath = join(directory, "fee-stress.json");
    const observations = [{ usdtKrw: { bidPrice: 1484, askPrice: 1486 } }];
    writeJson(reportPath, {
      assumptions: {
        markets: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
        notionalKrw: 500_000,
        bithumbFeeBps: 4,
        binanceTakerFeeBps: 5,
      },
      observations,
    });
    writeJson(feeBudgetPath, {
      assumptions: {
        markets: [{ market: "KRW-PIEVERSE", symbol: "PIEVERSEUSDT" }],
        notionalKrw: 500_000,
        bithumbFeeBps: 25,
        binanceTakerFeeBps: 5,
      },
      observations,
    });

    const result = spawnSync(
      process.execPath,
      [
        "dist/src/cli/audit-spot-perp-carry-operational-proof.js",
        "--carry-report",
        reportPath,
        "--fee-budget-report",
        feeBudgetPath,
        "--dotenv",
        "none",
        "--quiet",
      ],
      { cwd: process.cwd(), encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    assert.equal(result.status, 0);
    const proof = JSON.parse(result.stdout) as {
      accountFeesConfirmed: boolean;
      requirements: { totalSpotQuoteRequiredKrw: number };
      feeBudget: {
        carryReportPath: string;
        feeBudgetReportPaths: string[];
        maxBithumbFeeBps: number;
        maxBinanceFuturesTakerFeeBps: number;
      };
      details?: unknown;
      reasons: string[];
    };
    assert.equal(proof.accountFeesConfirmed, false);
    assert.equal(proof.requirements.totalSpotQuoteRequiredKrw, 501_250);
    assert.equal(proof.feeBudget.carryReportPath, reportPath);
    assert.deepEqual(proof.feeBudget.feeBudgetReportPaths, [feeBudgetPath]);
    assert.equal(proof.feeBudget.maxBithumbFeeBps, 25);
    assert.equal(proof.feeBudget.maxBinanceFuturesTakerFeeBps, 5);
    assert.equal(proof.details, undefined);
    assert.deepEqual(proof.reasons, ["credentialsMissing"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
