import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createDefaultRiskPolicy,
  createDryRunOrderManager,
  createPaperOrderManager,
  type CreateOrderManagerOptions,
} from "../execution/order-manager.js";
import type { ExecutionMode, OrderManager, RiskPolicy } from "../execution/types.js";

export interface ExecutionRuntimeSecrets {
  bithumbAccessKey?: string;
  bithumbSecretKey?: string;
}

export interface ExecutionRuntimeEndpoints {
  bithumbRestBaseUrl: string;
  bithumbWsBaseUrl: string;
}

export interface ExecutionRuntimeConfig {
  tradingMode: Exclude<ExecutionMode, "live">;
  enableLiveExecution: false;
  endpoints: ExecutionRuntimeEndpoints;
  secrets: ExecutionRuntimeSecrets;
  riskPolicy: RiskPolicy;
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

  if (enableLiveExecution) {
    throw new Error(
      "ENABLE_LIVE_EXECUTION=true is not supported in this repo until a dedicated live rollout issue lands",
    );
  }

  if (tradingModeRaw === "live") {
    throw new Error(
      "TRADING_MODE=live is intentionally blocked in this repo; keep paper or dry_run until live rollout is approved",
    );
  }

  const globalPositionCap = parsePositiveNumberOrDefault(
    env.MAX_POSITION_NOTIONAL_KRW,
    "MAX_POSITION_NOTIONAL_KRW",
    0,
  );

  return {
    tradingMode: tradingModeRaw,
    enableLiveExecution: false,
    endpoints: {
      bithumbRestBaseUrl:
        asNonEmptyString(env.BITHUMB_REST_BASE_URL) ??
        "https://api.bithumb.com/v1",
      bithumbWsBaseUrl:
        asNonEmptyString(env.BITHUMB_WS_BASE_URL) ??
        "wss://ws-api.bithumb.com/websocket/v1",
    },
    secrets: {
      bithumbAccessKey: asNonEmptyString(env.BITHUMB_ACCESS_KEY),
      bithumbSecretKey: asNonEmptyString(env.BITHUMB_SECRET_KEY),
    },
    riskPolicy: {
      ...defaults,
      maxOrderNotional: parsePositiveNumberOrDefault(
        env.MAX_ORDER_NOTIONAL_KRW,
        "MAX_ORDER_NOTIONAL_KRW",
        defaults.maxOrderNotional,
      ),
      maxPositionNotionalByMarket:
        globalPositionCap > 0
          ? Object.fromEntries(
              defaults.allowedMarkets.map((market) => [market, globalPositionCap]),
            )
          : defaults.maxPositionNotionalByMarket,
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
    },
    envFilePath: fileEnv.resolvedPath,
  };
}

export function createOrderManagerFromRuntimeConfig(
  config: ExecutionRuntimeConfig,
  options: Omit<CreateOrderManagerOptions, "policy"> = {},
): OrderManager {
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
