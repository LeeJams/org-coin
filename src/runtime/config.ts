import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createDefaultRiskPolicy,
  createDryRunOrderManager,
  createLiveOrderManager,
  createPaperOrderManager,
  type CreateOrderManagerOptions,
} from "../execution/order-manager.js";
import type { ExecutionMode, OrderManager, RiskPolicy } from "../execution/types.js";
import { createBithumbPrivateClient } from "../live/bithumb.js";

export interface ExecutionRuntimeSecrets {
  bithumbAccessKey?: string;
  bithumbSecretKey?: string;
}

export interface ExecutionRuntimeEndpoints {
  bithumbRestBaseUrl: string;
  bithumbWsBaseUrl: string;
}

export interface ExecutionRuntimeConfig {
  tradingMode: ExecutionMode;
  enableLiveExecution: boolean;
  endpoints: ExecutionRuntimeEndpoints;
  secrets: ExecutionRuntimeSecrets;
  riskPolicy: RiskPolicy;
  paperSessionArtifactsDir: string;
  envFilePath?: string;
}

export interface LoadExecutionRuntimeConfigOptions {
  env?: Record<string, string | undefined>;
  envFilePath?: string | null;
  cwd?: string;
}

const DEFAULT_ENV_FILE = ".env";

function asNonEmptyString(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parseBoolean(value: string, key: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${key} must be 'true' or 'false'`);
}

function parsePositiveNumberOrDefault(
  value: string | undefined,
  key: string,
  fallback: number,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a finite number`);
  }

  return parsed > 0 ? parsed : fallback;
}

function parsePositiveIntegerOrDefault(
  value: string | undefined,
  key: string,
  fallback: number,
): number {
  const parsed = parsePositiveNumberOrDefault(value, key, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${key} must be an integer`);
  }

  return parsed;
}

function parsePositiveNumberRecord(
  value: string | undefined,
  key: string,
): Record<string, number> {
  if (value === undefined || value.trim().length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${key} must be a valid JSON object`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON object of positive numbers`);
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([market, rawValue]) => {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue <= 0) {
        throw new Error(`${key}.${market} must be a positive finite number`);
      }

      return [market, rawValue];
    }),
  );
}

function parseMarketListOrDefault(
  value: string | undefined,
  key: string,
  fallback: string[],
): string[] {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const markets = value
    .split(",")
    .map((market) => market.trim())
    .filter((market) => market.length > 0);

  if (markets.length === 0) {
    throw new Error(`${key} must contain at least one market`);
  }

  return [...new Set(markets)];
}

export function parseDotenv(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadDotenvFile(
  envFilePath: string | null | undefined,
  cwd: string,
): { env: Record<string, string>; resolvedPath?: string } {
  if (envFilePath === null) {
    return { env: {} };
  }

  const resolvedPath = resolve(cwd, envFilePath ?? DEFAULT_ENV_FILE);
  if (!existsSync(resolvedPath)) {
    return { env: {} };
  }

  const contents = readFileSync(resolvedPath, "utf8");
  return {
    env: parseDotenv(contents),
    resolvedPath,
  };
}

export function loadExecutionRuntimeConfig(
  options: LoadExecutionRuntimeConfigOptions = {},
): ExecutionRuntimeConfig {
  const cwd = options.cwd ?? process.cwd();
  const fileEnv = loadDotenvFile(options.envFilePath, cwd);
  const env = {
    ...fileEnv.env,
    ...(options.env ?? process.env),
  };
  const defaults = createDefaultRiskPolicy();
  const tradingModeRaw = asNonEmptyString(env.TRADING_MODE) ?? "paper";

  if (
    tradingModeRaw !== "dry_run" &&
    tradingModeRaw !== "paper" &&
    tradingModeRaw !== "live"
  ) {
    throw new Error("TRADING_MODE must be one of 'dry_run', 'paper', or 'live'");
  }

  const enableLiveExecution = parseBoolean(
    asNonEmptyString(env.ENABLE_LIVE_EXECUTION) ?? "false",
    "ENABLE_LIVE_EXECUTION",
  );

  if (tradingModeRaw === "live" && !enableLiveExecution) {
    throw new Error(
      "TRADING_MODE=live requires ENABLE_LIVE_EXECUTION=true",
    );
  }

  if (enableLiveExecution && tradingModeRaw !== "live") {
    throw new Error(
      "ENABLE_LIVE_EXECUTION=true requires TRADING_MODE=live",
    );
  }

  const accessKey = asNonEmptyString(env.BITHUMB_ACCESS_KEY);
  const secretKey = asNonEmptyString(env.BITHUMB_SECRET_KEY);

  if (tradingModeRaw === "live" && (!accessKey || !secretKey)) {
    throw new Error(
      "BITHUMB_ACCESS_KEY and BITHUMB_SECRET_KEY are required when TRADING_MODE=live",
    );
  }

  const globalPositionCap = parsePositiveNumberOrDefault(
    env.MAX_POSITION_NOTIONAL_KRW,
    "MAX_POSITION_NOTIONAL_KRW",
    0,
  );
  const marketPositionCapOverrides = parsePositiveNumberRecord(
    env.MAX_POSITION_NOTIONAL_BY_MARKET_JSON,
    "MAX_POSITION_NOTIONAL_BY_MARKET_JSON",
  );
  const paperAllowedMarkets = parseMarketListOrDefault(
    env.PAPER_ALLOWED_MARKETS ?? env.DRY_RUN_MARKETS,
    env.PAPER_ALLOWED_MARKETS !== undefined ? "PAPER_ALLOWED_MARKETS" : "DRY_RUN_MARKETS",
    defaults.allowedMarkets,
  );
  const basePositionCaps =
    globalPositionCap > 0
      ? Object.fromEntries(
          defaults.allowedMarkets.map((market) => [market, globalPositionCap]),
        )
      : defaults.maxPositionNotionalByMarket;

  return {
    tradingMode: tradingModeRaw,
    enableLiveExecution,
    endpoints: {
      bithumbRestBaseUrl:
        asNonEmptyString(env.BITHUMB_REST_BASE_URL) ??
        "https://api.bithumb.com",
      bithumbWsBaseUrl:
        asNonEmptyString(env.BITHUMB_WS_BASE_URL) ??
        "wss://ws-api.bithumb.com/websocket/v1",
    },
    secrets: {
      ...(tradingModeRaw === "live"
        ? {
            bithumbAccessKey: accessKey,
            bithumbSecretKey: secretKey,
          }
        : {}),
    },
    paperSessionArtifactsDir: resolve(
      cwd,
      asNonEmptyString(env.PAPER_SESSION_ARTIFACTS_DIR) ?? "var/paper-sessions",
    ),
    riskPolicy: {
      ...defaults,
      maxOrderNotional: parsePositiveNumberOrDefault(
        env.MAX_ORDER_NOTIONAL_KRW,
        "MAX_ORDER_NOTIONAL_KRW",
        defaults.maxOrderNotional,
      ),
      maxPositionNotionalByMarket: {
        ...basePositionCaps,
        ...marketPositionCapOverrides,
      },
      maxDailyLoss: parsePositiveNumberOrDefault(
        env.MAX_DAILY_LOSS_KRW,
        "MAX_DAILY_LOSS_KRW",
        defaults.maxDailyLoss,
      ),
      dataStaleAfterMs: parsePositiveNumberOrDefault(
        env.DATA_STALE_AFTER_MS,
        "DATA_STALE_AFTER_MS",
        defaults.dataStaleAfterMs,
      ),
      maxOperationalRejectStreak: parsePositiveIntegerOrDefault(
        env.KILL_SWITCH_REJECT_STREAK,
        "KILL_SWITCH_REJECT_STREAK",
        defaults.maxOperationalRejectStreak,
      ),
      allowedMarkets:
        tradingModeRaw === "live" ? ["KRW-BTC"] : paperAllowedMarkets,
    },
    envFilePath: fileEnv.resolvedPath,
  };
}

export function createOrderManagerFromRuntimeConfig(
  config: ExecutionRuntimeConfig,
  options: Omit<CreateOrderManagerOptions, "policy"> = {},
): OrderManager {
  if (config.tradingMode === "live") {
    if (!config.secrets.bithumbAccessKey || !config.secrets.bithumbSecretKey) {
      throw new Error("live runtime config is missing Bithumb credentials");
    }

    return createLiveOrderManager({
      ...options,
      policy: config.riskPolicy,
      client: createBithumbPrivateClient({
        accessKey: config.secrets.bithumbAccessKey,
        secretKey: config.secrets.bithumbSecretKey,
        restBaseUrl: config.endpoints.bithumbRestBaseUrl,
      }),
    });
  }

  if (config.tradingMode === "paper") {
    return createPaperOrderManager({
      ...options,
      policy: config.riskPolicy,
    });
  }

  return createDryRunOrderManager({
    ...options,
    policy: config.riskPolicy,
  });
}
