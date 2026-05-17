import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildSpotPerpCarryOperationalProof,
  type SpotPerpCarryOperationalMarket,
} from "../execution/spot-perp-carry-operational-proof.js";
import { createBinanceUsdMFuturesPrivateClient } from "../live/binance.js";
import { createBithumbPrivateClient } from "../live/bithumb.js";
import { parseDotenv } from "../runtime/config.js";

interface Args {
  carryReportPath: string | null;
  feeBudgetReportPaths: string[];
  outputPath: string | null;
  envFilePath: string | null;
  requireReady: boolean;
  quiet: boolean;
}

interface CarryReport {
  assumptions?: {
    markets?: SpotPerpCarryOperationalMarket[];
    notionalKrw?: number;
    bithumbFeeBps?: number;
    binanceTakerFeeBps?: number;
  };
  perMarketSummary?: SpotPerpCarryOperationalMarket[];
  observations?: Array<{
    usdtKrw?: {
      bidPrice?: number;
      askPrice?: number;
    };
  }>;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    carryReportPath: null,
    feeBudgetReportPaths: [],
    outputPath: null,
    envFilePath: ".env",
    requireReady: false,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--carry-report") {
      if (!value) throw new Error("--carry-report requires a value");
      args.carryReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--fee-budget-report") {
      if (!value) throw new Error("--fee-budget-report requires a value");
      args.feeBudgetReportPaths.push(resolve(cwd, value));
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--dotenv") {
      if (!value) throw new Error("--dotenv requires a value");
      args.envFilePath = value === "none" ? null : resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--require-ready") {
      args.requireReady = true;
      continue;
    }
    if (arg === "--quiet") {
      args.quiet = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.carryReportPath === null) throw new Error("--carry-report is required");
  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function envWithDotenv(path: string | null): Record<string, string | undefined> {
  const fileEnv = path !== null && existsSync(path) ? parseDotenv(readFileSync(path, "utf8")) : {};
  return {
    ...fileEnv,
    ...process.env,
  };
}

function stdoutSummary(proof: Record<string, unknown>): Record<string, unknown> {
  const details =
    typeof proof.details === "object" && proof.details !== null && !Array.isArray(proof.details)
      ? (proof.details as Record<string, unknown>)
      : {};
  return {
    generatedAt: proof.generatedAt ?? null,
    accountFeesConfirmed: proof.accountFeesConfirmed ?? null,
    inventoryReady: proof.inventoryReady ?? null,
    hedgeVenueReady: proof.hedgeVenueReady ?? null,
    requirements: proof.requirements ?? null,
    deficits: proof.deficits ?? null,
    feeBudget: details.feeBudget ?? null,
    reasons: proof.reasons ?? [],
  };
}

function nonEmpty(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function maxPositiveNumber(values: unknown[], label: string): number {
  const positiveValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (positiveValues.length === 0) throw new Error(`${label} must be a positive finite number`);
  return Math.max(...positiveValues);
}

function marketsFromReport(report: CarryReport): SpotPerpCarryOperationalMarket[] {
  const raw = report.assumptions?.markets ?? report.perMarketSummary ?? [];
  const markets = raw.filter(
    (market): market is SpotPerpCarryOperationalMarket =>
      typeof market.market === "string" &&
      market.market.trim().length > 0 &&
      typeof market.symbol === "string" &&
      market.symbol.trim().length > 0,
  );
  if (markets.length === 0) {
    throw new Error("carry report is missing assumptions.markets or perMarketSummary markets");
  }
  return markets;
}

function latestUsdtKrw(report: CarryReport): number {
  for (const observation of [...(report.observations ?? [])].reverse()) {
    const bid = observation.usdtKrw?.bidPrice;
    const ask = observation.usdtKrw?.askPrice;
    if (
      typeof bid === "number" &&
      Number.isFinite(bid) &&
      bid > 0 &&
      typeof ask === "number" &&
      Number.isFinite(ask) &&
      ask > 0
    ) {
      return (bid + ask) / 2;
    }
  }
  throw new Error("carry report is missing a usable latest KRW-USDT orderbook");
}

function withFeeBudgetDetails(
  proof: unknown,
  feeBudget: {
    carryReportPath: string;
    feeBudgetReportPaths: string[];
    maxBithumbFeeBps: number;
    maxBinanceFuturesTakerFeeBps: number;
  },
): unknown {
  if (typeof proof !== "object" || proof === null || Array.isArray(proof)) return proof;
  const proofRecord = proof as Record<string, unknown>;
  const details =
    typeof proofRecord.details === "object" &&
    proofRecord.details !== null &&
    !Array.isArray(proofRecord.details)
      ? (proofRecord.details as Record<string, unknown>)
      : {};
  return {
    ...proofRecord,
    details: {
      ...details,
      feeBudget,
    },
  };
}

function buildMissingCredentialProof(input: {
  markets: SpotPerpCarryOperationalMarket[];
  notionalKrw: number;
  referenceQuoteToKrw: number;
  maxBithumbFeeBps: number;
  maxBinanceFuturesTakerFeeBps: number;
  missingSecrets: string[];
}): Record<string, unknown> {
  const marketCount = input.markets.length;
  const totalSpotQuoteRequiredKrw =
    input.notionalKrw * marketCount * (1 + input.maxBithumbFeeBps / 10_000);
  const totalFuturesMarginRequiredKrw =
    input.notionalKrw *
    marketCount *
    (1 + input.maxBinanceFuturesTakerFeeBps / 10_000);
  const totalFuturesMarginRequiredUsdt =
    totalFuturesMarginRequiredKrw / input.referenceQuoteToKrw;
  return {
    generatedAt: new Date().toISOString(),
    accountFeesConfirmed: false,
    inventoryReady: false,
    hedgeVenueReady: false,
    approvedMarkets: [],
    requirements: {
      marketCount,
      notionalKrwPerMarket: input.notionalKrw,
      totalSpotQuoteRequiredKrw,
      totalFuturesMarginRequiredKrw,
      totalFuturesMarginRequiredUsdt,
    },
    inventory: {
      bithumbQuoteFreeKrw: 0,
      binanceUsdtAvailable: 0,
      binanceUsdtAvailableKrw: 0,
    },
    deficits: {
      bithumbQuoteDeficitKrw: totalSpotQuoteRequiredKrw,
      binanceUsdtDeficit: totalFuturesMarginRequiredUsdt,
      binanceUsdtDeficitKrw: totalFuturesMarginRequiredKrw,
    },
    details: {
      bithumbBidFeeBpsByMarket: Object.fromEntries(
        input.markets.map((market) => [market.market, null]),
      ),
      binanceFuturesTakerFeeBpsBySymbol: Object.fromEntries(
        input.markets.map((market) => [market.symbol, null]),
      ),
      referenceQuoteToKrw: input.referenceQuoteToKrw,
      missingSecrets: input.missingSecrets,
    },
    reasons: ["credentialsMissing"],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const report = await readJson<CarryReport>(args.carryReportPath as string);
  const feeBudgetReports = await Promise.all(
    args.feeBudgetReportPaths.map((path) => readJson<CarryReport>(path)),
  );
  const markets = marketsFromReport(report);
  const notionalKrw = positiveNumber(report.assumptions?.notionalKrw, "assumptions.notionalKrw");
  const referenceQuoteToKrw = latestUsdtKrw(report);
  const maxBithumbFeeBps = maxPositiveNumber(
    [
      report.assumptions?.bithumbFeeBps,
      ...feeBudgetReports.map((feeBudgetReport) => feeBudgetReport.assumptions?.bithumbFeeBps),
    ],
    "assumptions.bithumbFeeBps",
  );
  const maxBinanceFuturesTakerFeeBps = maxPositiveNumber(
    [
      report.assumptions?.binanceTakerFeeBps,
      ...feeBudgetReports.map((feeBudgetReport) => feeBudgetReport.assumptions?.binanceTakerFeeBps),
    ],
    "assumptions.binanceTakerFeeBps",
  );
  const env = envWithDotenv(args.envFilePath);
  const bithumbAccessKey = nonEmpty(env.BITHUMB_ACCESS_KEY);
  const bithumbSecretKey = nonEmpty(env.BITHUMB_SECRET_KEY);
  const binanceApiKey = nonEmpty(env.BINANCE_API_KEY);
  const binanceSecretKey = nonEmpty(env.BINANCE_SECRET_KEY);
  const missingSecrets = [
    !bithumbAccessKey ? "BITHUMB_ACCESS_KEY" : null,
    !bithumbSecretKey ? "BITHUMB_SECRET_KEY" : null,
    !binanceApiKey ? "BINANCE_API_KEY" : null,
    !binanceSecretKey ? "BINANCE_SECRET_KEY" : null,
  ].filter((value): value is string => value !== null);
  const missingBithumbSecrets = !bithumbAccessKey || !bithumbSecretKey;
  const missingBinanceSecrets = !binanceApiKey || !binanceSecretKey;

  const proof =
    missingBithumbSecrets
      ? buildMissingCredentialProof({
          markets,
          notionalKrw,
          referenceQuoteToKrw,
          maxBithumbFeeBps,
          maxBinanceFuturesTakerFeeBps,
          missingSecrets,
        })
      : missingBinanceSecrets
        ? await buildProofWithBithumbClientOnly({
            env,
            markets,
            notionalKrw,
            referenceQuoteToKrw,
            maxBithumbFeeBps,
            maxBinanceFuturesTakerFeeBps,
            missingSecrets,
            bithumbAccessKey: bithumbAccessKey as string,
            bithumbSecretKey: bithumbSecretKey as string,
          })
      : await buildProofWithClients({
          env,
          markets,
          notionalKrw,
          referenceQuoteToKrw,
          maxBithumbFeeBps,
          maxBinanceFuturesTakerFeeBps,
          bithumbAccessKey: bithumbAccessKey as string,
          bithumbSecretKey: bithumbSecretKey as string,
          binanceApiKey: binanceApiKey as string,
          binanceSecretKey: binanceSecretKey as string,
        });
  const proofWithFeeBudget = withFeeBudgetDetails(proof, {
    carryReportPath: args.carryReportPath as string,
    feeBudgetReportPaths: args.feeBudgetReportPaths,
    maxBithumbFeeBps,
    maxBinanceFuturesTakerFeeBps,
  });

  const output = `${JSON.stringify(proofWithFeeBudget, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(
    args.quiet
      ? `${JSON.stringify(stdoutSummary(proofWithFeeBudget as Record<string, unknown>), null, 2)}\n`
      : output,
  );
  const proofStatus = proofWithFeeBudget as {
    accountFeesConfirmed?: boolean;
    inventoryReady?: boolean;
    hedgeVenueReady?: boolean;
  };
  if (
    args.requireReady &&
    !(
      proofStatus.accountFeesConfirmed === true &&
      proofStatus.inventoryReady === true &&
      proofStatus.hedgeVenueReady === true
    )
  ) {
    process.exitCode = 2;
  }
}

async function buildProofWithBithumbClientOnly(input: {
  env: Record<string, string | undefined>;
  markets: SpotPerpCarryOperationalMarket[];
  notionalKrw: number;
  referenceQuoteToKrw: number;
  maxBithumbFeeBps: number;
  maxBinanceFuturesTakerFeeBps: number;
  missingSecrets: string[];
  bithumbAccessKey: string;
  bithumbSecretKey: string;
}): Promise<unknown> {
  const bithumb = createBithumbPrivateClient({
    accessKey: input.bithumbAccessKey,
    secretKey: input.bithumbSecretKey,
    restBaseUrl: nonEmpty(input.env.BITHUMB_REST_BASE_URL) ?? "https://api.bithumb.com",
  });
  const [bithumbAccounts, orderChanceEntries] = await Promise.all([
    bithumb.getAccounts(),
    Promise.all(
      input.markets.map(async (market) => [
        market.market,
        await bithumb.getOrderChance(market.market),
      ] as const),
    ),
  ]);
  const proof = buildSpotPerpCarryOperationalProof({
    markets: input.markets,
    notionalKrw: input.notionalKrw,
    referenceQuoteToKrw: input.referenceQuoteToKrw,
    maxBithumbFeeBps: input.maxBithumbFeeBps,
    maxBinanceFuturesTakerFeeBps: input.maxBinanceFuturesTakerFeeBps,
    bithumbAccounts,
    bithumbOrderChances: Object.fromEntries(orderChanceEntries),
    binanceFuturesAccount: { assets: [] },
    binanceFuturesCommissions: {},
  });
  return {
    ...proof,
    details: {
      ...proof.details,
      missingSecrets: input.missingSecrets,
    },
    reasons: [...new Set(["credentialsMissing", ...proof.reasons])],
  };
}

async function buildProofWithClients(input: {
  env: Record<string, string | undefined>;
  markets: SpotPerpCarryOperationalMarket[];
  notionalKrw: number;
  referenceQuoteToKrw: number;
  maxBithumbFeeBps: number;
  maxBinanceFuturesTakerFeeBps: number;
  bithumbAccessKey: string;
  bithumbSecretKey: string;
  binanceApiKey: string;
  binanceSecretKey: string;
}): Promise<unknown> {
  const bithumb = createBithumbPrivateClient({
    accessKey: input.bithumbAccessKey,
    secretKey: input.bithumbSecretKey,
    restBaseUrl: nonEmpty(input.env.BITHUMB_REST_BASE_URL) ?? "https://api.bithumb.com",
  });
  const binanceFutures = createBinanceUsdMFuturesPrivateClient({
    apiKey: input.binanceApiKey,
    secretKey: input.binanceSecretKey,
    restBaseUrl:
      nonEmpty(input.env.BINANCE_FUTURES_REST_BASE_URL) ?? "https://fapi.binance.com",
  });
  const [bithumbAccounts, binanceFuturesAccount, orderChanceEntries, commissionEntries] =
    await Promise.all([
      bithumb.getAccounts(),
      binanceFutures.getAccount(),
      Promise.all(
        input.markets.map(async (market) => [
          market.market,
          await bithumb.getOrderChance(market.market),
        ] as const),
      ),
      Promise.all(
        input.markets.map(async (market) => [
          market.symbol,
          await binanceFutures.getCommissionRate(market.symbol),
        ] as const),
      ),
    ]);

  return buildSpotPerpCarryOperationalProof({
    markets: input.markets,
    notionalKrw: input.notionalKrw,
    referenceQuoteToKrw: input.referenceQuoteToKrw,
    maxBithumbFeeBps: input.maxBithumbFeeBps,
    maxBinanceFuturesTakerFeeBps: input.maxBinanceFuturesTakerFeeBps,
    bithumbAccounts,
    bithumbOrderChances: Object.fromEntries(orderChanceEntries),
    binanceFuturesAccount,
    binanceFuturesCommissions: Object.fromEntries(commissionEntries),
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
