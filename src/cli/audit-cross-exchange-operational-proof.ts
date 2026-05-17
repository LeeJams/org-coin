import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildCrossExchangeInventoryRequirements,
  buildCrossExchangeOperationalProof,
} from "../execution/cross-exchange-operational-proof.js";
import { createBinancePrivateClient } from "../live/binance.js";
import { createBithumbPrivateClient } from "../live/bithumb.js";
import { parseDotenv } from "../runtime/config.js";

interface Args {
  relativeValueReportPath: string | null;
  outputPath: string | null;
  envFilePath: string | null;
  requireReady: boolean;
}

interface RelativeValueReport {
  assumptions?: {
    notionalKrw?: number;
    bithumbFeeBps?: number;
    globalFeeBps?: number;
    usdKrw?: number;
  };
  topEdges?: Array<{
    direction?: "sell_bithumb_buy_reference" | "buy_bithumb_sell_reference";
  }>;
  observations?: Array<{
    bithumb?: {
      bidPrice?: number;
      askPrice?: number;
    };
  }>;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    relativeValueReportPath: null,
    outputPath: null,
    envFilePath: ".env",
    requireReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--relative-value-report") {
      if (!value) throw new Error("--relative-value-report requires a value");
      args.relativeValueReportPath = resolve(cwd, value);
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
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.relativeValueReportPath === null) {
    throw new Error("--relative-value-report is required");
  }

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

function nonEmpty(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function latestBithumbPrice(report: RelativeValueReport): number {
  const observation = report.observations?.at(-1);
  const bid = observation?.bithumb?.bidPrice;
  const ask = observation?.bithumb?.askPrice;
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
  throw new Error("relative-value report is missing a usable latest Bithumb BTC price");
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const report = await readJson<RelativeValueReport>(args.relativeValueReportPath!);
  const assumptions = report.assumptions ?? {};
  const edge = report.topEdges?.[0];
  const direction = edge?.direction;
  if (
    direction !== "sell_bithumb_buy_reference" &&
    direction !== "buy_bithumb_sell_reference"
  ) {
    throw new Error("relative-value report is missing a supported top-edge direction");
  }

  const env = envWithDotenv(args.envFilePath);
  const notionalKrw = requiredNumber(assumptions.notionalKrw, "assumptions.notionalKrw");
  const bithumbPriceKrw = latestBithumbPrice(report);
  const referenceQuoteToKrw = requiredNumber(assumptions.usdKrw, "assumptions.usdKrw");
  const maxBithumbFeeBps = requiredNumber(
    assumptions.bithumbFeeBps,
    "assumptions.bithumbFeeBps",
  );
  const maxReferenceFeeBps = requiredNumber(
    assumptions.globalFeeBps,
    "assumptions.globalFeeBps",
  );
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

  if (missingSecrets.length > 0) {
    const requirements = buildCrossExchangeInventoryRequirements({
      notionalKrw,
      direction,
      bithumbPriceKrw,
      referenceQuoteToKrw,
      bithumbFeeBps: null,
      referenceFeeBps: null,
      fallbackBithumbFeeBps: maxBithumbFeeBps,
      fallbackReferenceFeeBps: maxReferenceFeeBps,
    });
    const output = `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        accountFeesConfirmed: false,
        hedgeVenueReady: false,
        requirements,
        inventory: {
          bithumbBaseInventoryKrw: 0,
          bithumbQuoteInventoryKrw: 0,
          referenceBaseInventoryKrw: 0,
          referenceQuoteInventoryKrw: 0,
        },
        deficits: {
          bithumbBaseDeficitKrw: requirements.bithumbBaseRequiredKrw,
          bithumbQuoteDeficitKrw: requirements.bithumbQuoteRequiredKrw,
          referenceBaseDeficitKrw: requirements.referenceBaseRequiredKrw,
          referenceQuoteDeficitKrw: requirements.referenceQuoteRequiredKrw,
        },
        details: {
          bithumbFeeBps: null,
          referenceFeeBps: null,
          bithumbBaseRequired: requirements.bithumbBaseRequiredKrw / bithumbPriceKrw,
          bithumbQuoteRequired: requirements.bithumbQuoteRequiredKrw,
          referenceBaseRequired: requirements.referenceBaseRequiredKrw / bithumbPriceKrw,
          referenceQuoteRequired: requirements.referenceQuoteRequiredKrw / referenceQuoteToKrw,
          missingSecrets,
        },
        reasons: ["credentialsMissing"],
      },
      null,
      2,
    )}\n`;
    if (args.outputPath) {
      await mkdir(dirname(args.outputPath), { recursive: true });
      await writeFile(args.outputPath, output, "utf8");
    }
    process.stdout.write(output);
    if (args.requireReady) process.exitCode = 2;
    return;
  }

  const bithumb = createBithumbPrivateClient({
    accessKey: bithumbAccessKey!,
    secretKey: bithumbSecretKey!,
    restBaseUrl: nonEmpty(env.BITHUMB_REST_BASE_URL) ?? "https://api.bithumb.com",
  });
  const binance = createBinancePrivateClient({
    apiKey: binanceApiKey!,
    secretKey: binanceSecretKey!,
    restBaseUrl: nonEmpty(env.BINANCE_REST_BASE_URL) ?? "https://api.binance.com",
  });
  const [bithumbAccounts, bithumbOrderChance, referenceAccount, referenceCommission] =
    await Promise.all([
      bithumb.getAccounts(),
      bithumb.getOrderChance("KRW-BTC"),
      binance.getAccount(),
      binance.getCommission("BTCUSDT"),
    ]);

  const proof = buildCrossExchangeOperationalProof({
    notionalKrw,
    direction,
    bithumbPriceKrw,
    referenceQuoteToKrw,
    maxBithumbFeeBps,
    maxReferenceFeeBps,
    bithumbAccounts,
    bithumbOrderChance,
    referenceAccount,
    referenceCommission,
  });

  const output = `${JSON.stringify(proof, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);

  if (args.requireReady && (!proof.accountFeesConfirmed || !proof.hedgeVenueReady || proof.reasons.length > 0)) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
