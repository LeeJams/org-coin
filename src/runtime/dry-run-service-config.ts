import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseDotenv } from "./config.js";

export type DryRunEntryProfile = "v1" | "exploratory_smoke";

export interface DryRunServiceBootstrapConfig {
  markets: string;
  freshnessSlaMs: number;
  candleCount: number;
  tradeCount: number;
  wsSeconds: number;
  tradeWarmupSeconds: number;
  iterations: number;
  intervalSeconds: number;
  wsChannels: string;
}

export interface DryRunServiceConfig {
  baseDir: string;
  entryProfile: DryRunEntryProfile;
  initialCashKrw: number;
  loopIntervalSeconds: number;
  logDir: string;
  cycleLogPath: string;
  pythonBin: string;
  envFilePath?: string;
  bootstrap: DryRunServiceBootstrapConfig;
}

export interface LoadDryRunServiceConfigOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  envFilePath?: string | null;
}

const DEFAULT_ENV_FILE = ".env";

function asNonEmptyString(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
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
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive finite number`);
  }

  return parsed;
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

function parseNonNegativeIntegerOrDefault(
  value: string | undefined,
  key: string,
  fallback: number,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`${key} must be a non-negative integer`);
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

  return {
    env: parseDotenv(readFileSync(resolvedPath, "utf8")),
    resolvedPath,
  };
}

function resolvePythonBin(cwd: string, envValue: string | undefined): string {
  const configured = asNonEmptyString(envValue);
  if (configured) {
    return configured;
  }

  const venvPython = resolve(cwd, ".venv/bin/python");
  return existsSync(venvPython) ? venvPython : "python3";
}

export function loadDryRunServiceConfig(
  options: LoadDryRunServiceConfigOptions = {},
): DryRunServiceConfig {
  const cwd = options.cwd ?? process.cwd();
  const fileEnv = loadDotenvFile(options.envFilePath, cwd);
  const env = {
    ...fileEnv.env,
    ...(options.env ?? process.env),
  };
  const entryProfileRaw = asNonEmptyString(env.DRY_RUN_ENTRY_PROFILE) ?? "v1";

  if (
    entryProfileRaw !== "v1" &&
    entryProfileRaw !== "exploratory_smoke"
  ) {
    throw new Error(
      "DRY_RUN_ENTRY_PROFILE must be one of 'v1' or 'exploratory_smoke'",
    );
  }

  const logDir = resolve(
    cwd,
    asNonEmptyString(env.DRY_RUN_LOG_DIR) ?? "var/log/dry-run-service",
  );

  return {
    baseDir: resolve(cwd, asNonEmptyString(env.DRY_RUN_BASE_DIR) ?? "var/data"),
    entryProfile: entryProfileRaw,
    initialCashKrw: parsePositiveNumberOrDefault(
      env.DRY_RUN_INITIAL_CASH_KRW,
      "DRY_RUN_INITIAL_CASH_KRW",
      1_000_000,
    ),
    loopIntervalSeconds: parsePositiveIntegerOrDefault(
      env.DRY_RUN_LOOP_INTERVAL_SECONDS,
      "DRY_RUN_LOOP_INTERVAL_SECONDS",
      300,
    ),
    logDir,
    cycleLogPath: resolve(
      logDir,
      asNonEmptyString(env.DRY_RUN_CYCLE_LOG_FILE) ?? "cycles.ndjson",
    ),
    pythonBin: resolvePythonBin(cwd, env.DRY_RUN_PYTHON_BIN),
    envFilePath: fileEnv.resolvedPath,
    bootstrap: {
      markets:
        asNonEmptyString(env.DRY_RUN_MARKETS) ?? "KRW-BTC,KRW-ETH,KRW-XRP",
      freshnessSlaMs: parsePositiveIntegerOrDefault(
        env.DRY_RUN_FRESHNESS_SLA_MS,
        "DRY_RUN_FRESHNESS_SLA_MS",
        10_000,
      ),
      candleCount: parsePositiveIntegerOrDefault(
        env.DRY_RUN_CANDLE_COUNT,
        "DRY_RUN_CANDLE_COUNT",
        180,
      ),
      tradeCount: parsePositiveIntegerOrDefault(
        env.DRY_RUN_TRADE_COUNT,
        "DRY_RUN_TRADE_COUNT",
        200,
      ),
      wsSeconds: parsePositiveIntegerOrDefault(
        env.DRY_RUN_WS_SECONDS,
        "DRY_RUN_WS_SECONDS",
        15,
      ),
      tradeWarmupSeconds: parseNonNegativeIntegerOrDefault(
        env.DRY_RUN_TRADE_WARMUP_SECONDS,
        "DRY_RUN_TRADE_WARMUP_SECONDS",
        60,
      ),
      iterations: parsePositiveIntegerOrDefault(
        env.DRY_RUN_BOOTSTRAP_ITERATIONS,
        "DRY_RUN_BOOTSTRAP_ITERATIONS",
        1,
      ),
      intervalSeconds: parseNonNegativeIntegerOrDefault(
        env.DRY_RUN_BOOTSTRAP_INTERVAL_SECONDS,
        "DRY_RUN_BOOTSTRAP_INTERVAL_SECONDS",
        0,
      ),
      wsChannels:
        asNonEmptyString(env.DRY_RUN_WS_CHANNELS) ??
        "ticker,trade,orderbook",
    },
  };
}
