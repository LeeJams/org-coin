import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseDotenv } from "./config.js";
import { assertLiveGoalCompletionAuditAllowsStartup } from "./live-goal-completion-audit.js";

export type DryRunEntryProfile =
  | "v1"
  | "exploratory_smoke"
  | "btc_trend_v1"
  | "btc_trend_low_buffer_v1"
  | "btc_trend_flow_confirm_v1"
  | "btc_trend_ret1_confirm_v1"
  | "btc_trend_ret1_turnover_cap_v1"
  | "btc_240m_momentum_public_v1"
  | "btc_240m_momentum_min75_candidate_v1"
  | "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1"
  | "btc_240m_momentum_lb168_hold49_range_p70_candidate_v1"
  | "pieverse_60m_reversal_lb168_candidate_v1"
  | "stable_60m_reversal_candidate_v1"
  | "krw_h_60m_momentum_top_candidate_v1";
export type DryRunExitProfile =
  | "core_safe"
  | "balanced_v1"
  | "balanced_v1_book_confirm2"
  | "balanced_v1_book_confirm3"
  | "balanced_v1_book_confirm3_trend_hold"
  | "balanced_v1_book_confirm3_trend_hold_guarded"
  | "experimental_decay";
export type DryRunSyntheticExitPolicy =
  | "force_bid"
  | "mark_mid"
  | "carry_open";
export type DryRunExecutionMode = "dry_run" | "paper" | "live";

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
  executionMode: DryRunExecutionMode;
  liveReadinessApproved: boolean;
  liveReadinessSummaryPath?: string;
  liveGoalStatusPath?: string;
  liveReadinessMaxAgeMs: number;
  liveTradingFeeScheduleConfirmed: boolean;
  liveTradingFeeRoundTripBps?: number;
  entryProfile: DryRunEntryProfile;
  exitProfile: DryRunExitProfile;
  syntheticExitPolicy: DryRunSyntheticExitPolicy;
  initialCashKrw: number;
  loopIntervalSeconds: number;
  logDir: string;
  cycleLogPath: string;
  statePath: string;
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
const DEFAULT_LIVE_READINESS_MAX_AGE_MS = 15 * 60 * 1000;
const REQUIRED_LIVE_READINESS_CHECKS = [
  "minimumClosedTrades",
  "positiveTradedPnl",
  "positiveAverageTradedPnl",
  "positiveClosedTradePnl",
  "noOpenMarkProfitDependency",
  "noReconciliationFailures",
  "noRejectedDecisionSessions",
  "noSyntheticCloseSessions",
  "noOpenPosition",
  "cycleCompletionRateOk",
  "cycleRecoverySinceLatestFailureOk",
  "noMaterialLosingExitReasons",
  "btcBuyHoldBenchmarkAvailable",
  "beatsBtcBuyAndHold",
  "positiveAverageExcessReturn",
  "positiveRiskAdjustedExcessReturn",
  "drawdownNoWorseThanBtcBuyAndHold",
  "liveExecutionPathReady",
] as const;
const REQUIRED_TIME_SERIES_LIVE_READINESS_CHECKS = [
  "benchmarkAvailable",
  "marketIsBtc",
  "unitIs240m",
  "costAtLeast20Bps",
  "minimumHistoricalTrades",
  "positiveStrategyReturn",
  "beatsBtcBuyAndHold",
  "drawdownWithinLimit",
  "spreadMeasured",
  "buyDepthCoversNotional",
  "sellDepthCoversNotional",
  "noExecutionCostReasons",
  "paperSignalAttempted",
  "paperSignalAccepted",
  "paperEntryReconciliationOk",
  "paperEntryCreatedOpenPosition",
  "holdExitTimeKnown",
  "realizedExitAvailable",
  "noOpenPaperPositionAfterExit",
  "positiveRealizedPaperExitPnl",
  "liveExecutionPathReady",
] as const;
const REQUIRED_REPLACEMENT_TIME_SERIES_LIVE_READINESS_CHECKS = [
  "scanGeneratedAtValid",
  "observationGeneratedAtValid",
  "scanHasPromotionCandidate",
  "feeAtLeast20Bps",
  "candidateMatchesObservation",
  "minimumHistoricalTrades",
  "positiveTrainMedianPnl",
  "positiveTestMedianPnl",
  "positiveTrainAndTestTotalPnl",
  "walkForwardTotalPasses",
  "walkForwardMedianPasses",
  "walkForwardMinFoldNonNegative",
  "paperObservationGeneratedAtValid",
  "paperObservationAfterObservation",
  "paperObservationSourceMatches",
  "paperCandidateMatchesObservation",
  "signalActive",
  "directionalSignalPass",
  "riskPass",
  "executionViabilityWatchCandidate",
  "spreadMeasured",
  "executableCostMeasured",
  "executableCostWithinExpectedEdge",
  "tickerFresh",
  "latestCandleRecent",
  "snapshotSkewControlled",
  "buyDepthCoversNotional",
  "sellDepthCoversNotional",
  "noObservationReasons",
  "paperSignalAttempted",
  "paperSignalAccepted",
  "paperEntryReconciliationOk",
  "paperEntryCreatedOpenPosition",
  "holdExitTimeKnown",
  "realizedExitAvailable",
  "realizedExitReusePolicy",
  "noOpenPaperPositionAfterExit",
  "positiveRealizedPaperExitPnl",
  "liveExecutionPathReady",
] as const;

function assertSingleLiveMarketMatchesEvidence(
  liveMarkets: string,
  evidenceMarket: string | null | undefined,
): void {
  if (!evidenceMarket || liveMarkets !== evidenceMarket) {
    throw new Error(
      `DRY_RUN_EXECUTION_MODE=live requires DRY_RUN_MARKETS to match readiness candidate.market (${evidenceMarket ?? "missing"})`,
    );
  }
}

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

function parsePositiveNumberOptional(
  value: string | undefined,
  key: string,
): number | undefined {
  const normalized = asNonEmptyString(value);
  if (normalized === undefined) {
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive finite number`);
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

function parseBooleanOrDefault(
  value: string | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const normalized = asNonEmptyString(value);
  if (normalized === undefined) {
    return fallback;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`${key} must be 'true' or 'false'`);
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

function assertLiveReadinessSummary(
  path: string,
  entryProfile: DryRunEntryProfile,
  liveTradingFeeRoundTripBps: number,
  maxAgeMs: number,
  liveMarkets: string,
): number {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    generatedAt?: string;
    strategyAssessment?: {
      classification?: string;
    };
    liveReadiness?: {
      paperOnlyRecommended?: boolean;
      checks?: Record<string, unknown>;
    };
    candidate?: {
      market?: string | null;
      signalMode?: string | null;
      unitMinutes?: number | null;
      lookbackBars?: number | null;
      holdBars?: number | null;
      minReturnBps?: number | null;
      riskFilter?: string | null;
    };
    benchmarkSummary?: {
      strategyReturnPct?: number | null;
      excessReturnVsBuyHoldPct?: number | null;
      feeRoundTripBps?: number | null;
    };
    btcBuyHoldBenchmark?: {
      totalExcessPnlKrw?: number;
      excessReturnInformationRatio?: number | null;
    };
  };

  const generatedAtMs =
    typeof parsed.generatedAt === "string" ? Date.parse(parsed.generatedAt) : NaN;
  if (!Number.isFinite(generatedAtMs)) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_READINESS_SUMMARY_PATH with a valid generatedAt timestamp",
    );
  }
  if (Date.now() - generatedAtMs > maxAgeMs) {
    throw new Error(
      `DRY_RUN_EXECUTION_MODE=live requires fresh LIVE_READINESS_SUMMARY_PATH evidence no older than ${maxAgeMs} ms`,
    );
  }

  if (parsed.strategyAssessment?.classification !== "live_candidate") {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_READINESS_SUMMARY_PATH with strategyAssessment.classification='live_candidate'",
    );
  }

  if (parsed.liveReadiness?.paperOnlyRecommended !== false) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_READINESS_SUMMARY_PATH with liveReadiness.paperOnlyRecommended=false",
    );
  }

  if (parsed.benchmarkSummary !== undefined) {
    if (
      parsed.candidate?.market === "KRW-PIEVERSE" ||
      parsed.candidate?.market === "KRW-STABLE" ||
      parsed.candidate?.market === "KRW-H" ||
      entryProfile === "pieverse_60m_reversal_lb168_candidate_v1" ||
      entryProfile === "stable_60m_reversal_candidate_v1" ||
      entryProfile === "krw_h_60m_momentum_top_candidate_v1"
    ) {
      const failedReplacementChecks =
        REQUIRED_REPLACEMENT_TIME_SERIES_LIVE_READINESS_CHECKS.filter(
          (check) => parsed.liveReadiness?.checks?.[check] !== true,
        );
      if (failedReplacementChecks.length > 0) {
        throw new Error(
          `DRY_RUN_EXECUTION_MODE=live requires all replacement time-series readiness checks to be true; failed or missing: ${failedReplacementChecks.join(", ")}`,
        );
      }

      assertSingleLiveMarketMatchesEvidence(liveMarkets, parsed.candidate?.market);

      const isPieverseProfile =
        entryProfile === "pieverse_60m_reversal_lb168_candidate_v1";
      const isStableProfile =
        entryProfile === "stable_60m_reversal_candidate_v1";
      const isKrwHProfile =
        entryProfile === "krw_h_60m_momentum_top_candidate_v1";
      if (!isPieverseProfile && !isStableProfile && !isKrwHProfile) {
        throw new Error(
          "DRY_RUN_EXECUTION_MODE=live with replacement time-series readiness evidence requires a matching replacement entry profile",
        );
      }

      const pieverseEvidenceMatches =
        parsed.candidate?.market !== "KRW-PIEVERSE" ||
        parsed.candidate.signalMode !== "reversal" ||
        parsed.candidate.unitMinutes !== 60 ||
        parsed.candidate.lookbackBars !== 168 ||
        parsed.candidate.holdBars !== 24 ||
        parsed.candidate.minReturnBps !== 50 ||
        parsed.candidate.riskFilter !== "rv24_below_median";
      const stableEvidenceMatches =
        parsed.candidate?.market === "KRW-STABLE" &&
        parsed.candidate.signalMode === "reversal" &&
        parsed.candidate.unitMinutes === 60 &&
        parsed.candidate.lookbackBars === 24 &&
        parsed.candidate.holdBars === 24 &&
        parsed.candidate.minReturnBps === 50 &&
        parsed.candidate.riskFilter === "none";
      const krwHEvidenceMatches =
        parsed.candidate?.market === "KRW-H" &&
        parsed.candidate.signalMode === "momentum" &&
        parsed.candidate.unitMinutes === 60 &&
        parsed.candidate.lookbackBars === 168 &&
        parsed.candidate.holdBars === 24 &&
        parsed.candidate.minReturnBps === 0 &&
        parsed.candidate.riskFilter === "range24_below_p70";
      if (
        (isPieverseProfile && pieverseEvidenceMatches) ||
        (isStableProfile && !stableEvidenceMatches) ||
        (isKrwHProfile && !krwHEvidenceMatches)
      ) {
        throw new Error(
          "DRY_RUN_EXECUTION_MODE=live requires matching replacement time-series readiness evidence",
        );
      }

      if (
        typeof parsed.benchmarkSummary.strategyReturnPct !== "number" ||
        parsed.benchmarkSummary.strategyReturnPct <= 0
      ) {
        throw new Error(
          "DRY_RUN_EXECUTION_MODE=live requires positive replacement time-series benchmark return evidence",
        );
      }

      if (
        typeof parsed.benchmarkSummary.feeRoundTripBps !== "number" ||
        parsed.benchmarkSummary.feeRoundTripBps < 20
      ) {
        throw new Error(
          "DRY_RUN_EXECUTION_MODE=live requires replacement time-series benchmark evidence at 20 bps or higher round-trip cost",
        );
      }

      if (liveTradingFeeRoundTripBps > parsed.benchmarkSummary.feeRoundTripBps) {
        throw new Error(
          `DRY_RUN_EXECUTION_MODE=live requires LIVE_TRADING_FEE_ROUND_TRIP_BPS (${liveTradingFeeRoundTripBps}) to be covered by replacement time-series benchmark feeRoundTripBps (${parsed.benchmarkSummary.feeRoundTripBps})`,
        );
      }

      return generatedAtMs;
    }

    const failedTimeSeriesChecks = REQUIRED_TIME_SERIES_LIVE_READINESS_CHECKS.filter(
      (check) => parsed.liveReadiness?.checks?.[check] !== true,
    );
    if (failedTimeSeriesChecks.length > 0) {
      throw new Error(
        `DRY_RUN_EXECUTION_MODE=live requires all BTC time-series readiness checks to be true; failed or missing: ${failedTimeSeriesChecks.join(", ")}`,
      );
    }

    assertSingleLiveMarketMatchesEvidence(liveMarkets, parsed.candidate?.market);

    if (
      parsed.candidate?.market !== "KRW-BTC" ||
      parsed.candidate.signalMode !== "momentum" ||
      parsed.candidate.unitMinutes !== 240
    ) {
      throw new Error(
        "DRY_RUN_EXECUTION_MODE=live requires BTC 240m momentum readiness evidence",
      );
    }

    if (
      entryProfile !== "btc_240m_momentum_public_v1" &&
      entryProfile !== "btc_240m_momentum_min75_candidate_v1" &&
      entryProfile !== "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1"
    ) {
      throw new Error(
        "DRY_RUN_EXECUTION_MODE=live with BTC 240m readiness evidence requires a BTC 240m entry profile",
      );
    }

    const expectedMinReturnBps =
      entryProfile === "btc_240m_momentum_min75_candidate_v1"
        ? 75
        : entryProfile === "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1"
          ? 0
          : 25;
    if (
      typeof parsed.candidate.minReturnBps === "number" &&
      parsed.candidate.minReturnBps !== expectedMinReturnBps
    ) {
      throw new Error(
        `DRY_RUN_EXECUTION_MODE=live with ${entryProfile} requires BTC 240m readiness evidence with minReturnBps=${expectedMinReturnBps}`,
      );
    }

    if (
      typeof parsed.benchmarkSummary.excessReturnVsBuyHoldPct !== "number" ||
      parsed.benchmarkSummary.excessReturnVsBuyHoldPct <= 0 ||
      typeof parsed.benchmarkSummary.strategyReturnPct !== "number" ||
      parsed.benchmarkSummary.strategyReturnPct <= 0
    ) {
      throw new Error(
        "DRY_RUN_EXECUTION_MODE=live requires positive BTC time-series benchmark return evidence",
      );
    }

    if (
      typeof parsed.benchmarkSummary.feeRoundTripBps !== "number" ||
      parsed.benchmarkSummary.feeRoundTripBps < 20
    ) {
      throw new Error(
        "DRY_RUN_EXECUTION_MODE=live requires BTC time-series benchmark evidence at 20 bps or higher round-trip cost",
      );
    }

    if (liveTradingFeeRoundTripBps > parsed.benchmarkSummary.feeRoundTripBps) {
      throw new Error(
        `DRY_RUN_EXECUTION_MODE=live requires LIVE_TRADING_FEE_ROUND_TRIP_BPS (${liveTradingFeeRoundTripBps}) to be covered by BTC time-series benchmark feeRoundTripBps (${parsed.benchmarkSummary.feeRoundTripBps})`,
      );
    }

    return generatedAtMs;
  }

  const failedChecks = REQUIRED_LIVE_READINESS_CHECKS.filter(
    (check) => parsed.liveReadiness?.checks?.[check] !== true,
  );
  if (failedChecks.length > 0) {
    throw new Error(
      `DRY_RUN_EXECUTION_MODE=live requires all live readiness checks to be true; failed or missing: ${failedChecks.join(", ")}`,
    );
  }

  if (
    typeof parsed.btcBuyHoldBenchmark?.totalExcessPnlKrw !== "number" ||
    parsed.btcBuyHoldBenchmark.totalExcessPnlKrw <= 0
  ) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires positive BTC buy-and-hold excess PnL evidence",
    );
  }

  if (
    typeof parsed.btcBuyHoldBenchmark.excessReturnInformationRatio !== "number" ||
    parsed.btcBuyHoldBenchmark.excessReturnInformationRatio <= 0
  ) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires positive risk-adjusted BTC excess return evidence",
    );
  }

  return generatedAtMs;
}

function assertLiveGoalStatus(
  path: string,
  maxAgeMs: number,
  liveMarkets: string,
  readinessGeneratedAtMs: number,
  entryProfile: DryRunEntryProfile,
): void {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    generatedAt?: string;
    liveReady?: boolean;
    liveStartupAllowed?: boolean;
    completionAudit?: {
      achieved?: boolean;
      failedCompletionCriteria?: string[];
      missingRequirements?: string[];
      missingRequirementCount?: number;
      criteria?: Array<{ id?: string; passed?: boolean }>;
    };
    selectedLiveCandidate?: {
      type?: string;
      market?: string | null;
    } | null;
    blockers?: string[];
  };

  const generatedAtMs =
    typeof parsed.generatedAt === "string" ? Date.parse(parsed.generatedAt) : NaN;
  if (!Number.isFinite(generatedAtMs)) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_GOAL_STATUS_PATH with a valid generatedAt timestamp",
    );
  }
  if (Date.now() - generatedAtMs > maxAgeMs) {
    throw new Error(
      `DRY_RUN_EXECUTION_MODE=live requires fresh LIVE_GOAL_STATUS_PATH evidence no older than ${maxAgeMs} ms`,
    );
  }
  if (generatedAtMs < readinessGeneratedAtMs) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_GOAL_STATUS_PATH generated after LIVE_READINESS_SUMMARY_PATH evidence",
    );
  }
  if (parsed.liveReady !== true || parsed.liveStartupAllowed !== true) {
    throw new Error(
      `DRY_RUN_EXECUTION_MODE=live blocked by LIVE_GOAL_STATUS_PATH: ${(parsed.blockers ?? ["liveStartupAllowed"]).join(", ")}`,
    );
  }
  if (parsed.completionAudit === undefined) {
    assertLiveGoalCompletionAuditAllowsStartup(
      undefined,
      "LIVE_GOAL_STATUS_PATH live startup",
    );
  } else {
    assertLiveGoalCompletionAuditAllowsStartup(
      parsed.completionAudit,
      "LIVE_GOAL_STATUS_PATH live startup",
    );
  }
  if (parsed.selectedLiveCandidate === null || parsed.selectedLiveCandidate === undefined) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_GOAL_STATUS_PATH selectedLiveCandidate",
    );
  }
  const expectedSelectedLiveCandidateType =
    expectedLiveGoalSelectedCandidateType(entryProfile);
  if (expectedSelectedLiveCandidateType === undefined) {
    throw new Error(
      `DRY_RUN_EXECUTION_MODE=live does not have a live-goal selectedLiveCandidate.type mapping for DRY_RUN_ENTRY_PROFILE=${entryProfile}`,
    );
  }
  if (parsed.selectedLiveCandidate.type !== expectedSelectedLiveCandidateType) {
    throw new Error(
      `DRY_RUN_EXECUTION_MODE=live requires LIVE_GOAL_STATUS_PATH selectedLiveCandidate.type=${expectedSelectedLiveCandidateType} for DRY_RUN_ENTRY_PROFILE=${entryProfile}, got ${parsed.selectedLiveCandidate.type ?? "unknown"}`,
    );
  }
  assertSingleLiveMarketMatchesEvidence(liveMarkets, parsed.selectedLiveCandidate.market);
}

function expectedLiveGoalSelectedCandidateType(
  entryProfile: DryRunEntryProfile,
): string | undefined {
  if (entryProfile === "btc_240m_momentum_public_v1") {
    return "btc_240m_momentum";
  }
  if (entryProfile === "btc_240m_momentum_min75_candidate_v1") {
    return "btc_240m_momentum_min75";
  }
  return undefined;
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
  const executionModeRaw =
    asNonEmptyString(env.DRY_RUN_EXECUTION_MODE) ?? "paper";
  const exitProfileRaw =
    asNonEmptyString(env.DRY_RUN_EXIT_PROFILE) ?? "balanced_v1";
  const syntheticExitPolicyRaw =
    asNonEmptyString(env.DRY_RUN_SYNTHETIC_EXIT_POLICY) ?? "carry_open";
  const liveReadinessApproved = parseBooleanOrDefault(
    env.LIVE_READINESS_APPROVED,
    "LIVE_READINESS_APPROVED",
    false,
  );
  const liveTradingFeeScheduleConfirmed = parseBooleanOrDefault(
    env.LIVE_TRADING_FEE_SCHEDULE_CONFIRMED,
    "LIVE_TRADING_FEE_SCHEDULE_CONFIRMED",
    false,
  );
  const liveTradingFeeRoundTripBps = parsePositiveNumberOptional(
    env.LIVE_TRADING_FEE_ROUND_TRIP_BPS,
    "LIVE_TRADING_FEE_ROUND_TRIP_BPS",
  );
  const liveReadinessSummaryPathRaw = asNonEmptyString(
    env.LIVE_READINESS_SUMMARY_PATH,
  );
  const liveGoalStatusPathRaw = asNonEmptyString(env.LIVE_GOAL_STATUS_PATH);
  const liveReadinessMaxAgeMs = parsePositiveIntegerOrDefault(
    env.LIVE_READINESS_MAX_AGE_MS,
    "LIVE_READINESS_MAX_AGE_MS",
    DEFAULT_LIVE_READINESS_MAX_AGE_MS,
  );

  if (
    entryProfileRaw !== "v1" &&
    entryProfileRaw !== "exploratory_smoke" &&
    entryProfileRaw !== "btc_trend_v1" &&
    entryProfileRaw !== "btc_trend_low_buffer_v1" &&
    entryProfileRaw !== "btc_trend_flow_confirm_v1" &&
    entryProfileRaw !== "btc_trend_ret1_confirm_v1" &&
    entryProfileRaw !== "btc_trend_ret1_turnover_cap_v1" &&
    entryProfileRaw !== "btc_240m_momentum_public_v1" &&
    entryProfileRaw !== "btc_240m_momentum_min75_candidate_v1" &&
    entryProfileRaw !== "btc_240m_momentum_lb168_hold72_range_p70_candidate_v1" &&
    entryProfileRaw !== "btc_240m_momentum_lb168_hold49_range_p70_candidate_v1" &&
    entryProfileRaw !== "pieverse_60m_reversal_lb168_candidate_v1" &&
    entryProfileRaw !== "stable_60m_reversal_candidate_v1" &&
    entryProfileRaw !== "krw_h_60m_momentum_top_candidate_v1"
  ) {
    throw new Error(
      "DRY_RUN_ENTRY_PROFILE must be one of 'v1', 'exploratory_smoke', 'btc_trend_v1', 'btc_trend_low_buffer_v1', 'btc_trend_flow_confirm_v1', 'btc_trend_ret1_confirm_v1', 'btc_trend_ret1_turnover_cap_v1', 'btc_240m_momentum_public_v1', 'btc_240m_momentum_min75_candidate_v1', 'btc_240m_momentum_lb168_hold72_range_p70_candidate_v1', 'btc_240m_momentum_lb168_hold49_range_p70_candidate_v1', 'pieverse_60m_reversal_lb168_candidate_v1', 'stable_60m_reversal_candidate_v1', or 'krw_h_60m_momentum_top_candidate_v1'",
    );
  }

  if (
    executionModeRaw !== "dry_run" &&
    executionModeRaw !== "paper" &&
    executionModeRaw !== "live"
  ) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE must be one of 'dry_run', 'paper', or 'live'",
    );
  }

  if (
    exitProfileRaw !== "core_safe" &&
    exitProfileRaw !== "balanced_v1" &&
    exitProfileRaw !== "balanced_v1_book_confirm2" &&
    exitProfileRaw !== "balanced_v1_book_confirm3" &&
    exitProfileRaw !== "balanced_v1_book_confirm3_trend_hold" &&
    exitProfileRaw !== "balanced_v1_book_confirm3_trend_hold_guarded" &&
    exitProfileRaw !== "experimental_decay"
  ) {
    throw new Error(
      "DRY_RUN_EXIT_PROFILE must be one of 'core_safe', 'balanced_v1', 'balanced_v1_book_confirm2', 'balanced_v1_book_confirm3', 'balanced_v1_book_confirm3_trend_hold', 'balanced_v1_book_confirm3_trend_hold_guarded', or 'experimental_decay'",
    );
  }

  if (
    syntheticExitPolicyRaw !== "force_bid" &&
    syntheticExitPolicyRaw !== "mark_mid" &&
    syntheticExitPolicyRaw !== "carry_open"
  ) {
    throw new Error(
      "DRY_RUN_SYNTHETIC_EXIT_POLICY must be one of 'force_bid', 'mark_mid', or 'carry_open'",
    );
  }

  const markets = asNonEmptyString(env.DRY_RUN_MARKETS) ?? "KRW-BTC,KRW-ETH,KRW-XRP";
  if (executionModeRaw === "live" && markets !== "KRW-BTC") {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires DRY_RUN_MARKETS=KRW-BTC",
    );
  }
  if (executionModeRaw === "live" && !liveReadinessApproved) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_READINESS_APPROVED=true after paper readiness checks pass",
    );
  }
  if (executionModeRaw === "live" && !liveTradingFeeScheduleConfirmed) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_TRADING_FEE_SCHEDULE_CONFIRMED=true after confirming the active account fee schedule",
    );
  }
  if (executionModeRaw === "live" && liveTradingFeeRoundTripBps === undefined) {
    throw new Error(
      "DRY_RUN_EXECUTION_MODE=live requires LIVE_TRADING_FEE_ROUND_TRIP_BPS to match the active account fee schedule",
    );
  }
  const verifiedLiveTradingFeeRoundTripBps =
    liveTradingFeeRoundTripBps ?? 0;
  const liveReadinessSummaryPath =
    liveReadinessSummaryPathRaw === undefined
      ? undefined
      : resolve(cwd, liveReadinessSummaryPathRaw);
  const liveGoalStatusPath =
    liveGoalStatusPathRaw === undefined ? undefined : resolve(cwd, liveGoalStatusPathRaw);
  if (executionModeRaw === "live") {
    if (liveReadinessSummaryPath === undefined) {
      throw new Error(
        "DRY_RUN_EXECUTION_MODE=live requires LIVE_READINESS_SUMMARY_PATH from dry-run return summary",
      );
    }
    const liveReadinessGeneratedAtMs = assertLiveReadinessSummary(
      liveReadinessSummaryPath,
      entryProfileRaw,
      verifiedLiveTradingFeeRoundTripBps,
      liveReadinessMaxAgeMs,
      markets,
    );
    if (liveGoalStatusPath === undefined) {
      throw new Error(
        "DRY_RUN_EXECUTION_MODE=live requires LIVE_GOAL_STATUS_PATH from live-goal status",
      );
    }
    assertLiveGoalStatus(
      liveGoalStatusPath,
      liveReadinessMaxAgeMs,
      markets,
      liveReadinessGeneratedAtMs,
      entryProfileRaw,
    );
  }

  const logDir = resolve(
    cwd,
    asNonEmptyString(env.DRY_RUN_LOG_DIR) ?? "var/log/dry-run-service",
  );

  return {
    baseDir: resolve(cwd, asNonEmptyString(env.DRY_RUN_BASE_DIR) ?? "var/data"),
    executionMode: executionModeRaw,
    liveReadinessApproved,
    liveReadinessSummaryPath,
    liveGoalStatusPath,
    liveReadinessMaxAgeMs,
    liveTradingFeeScheduleConfirmed,
    liveTradingFeeRoundTripBps:
      executionModeRaw === "live" ? verifiedLiveTradingFeeRoundTripBps : undefined,
    entryProfile: entryProfileRaw,
    exitProfile: exitProfileRaw,
    syntheticExitPolicy: syntheticExitPolicyRaw,
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
    statePath: resolve(logDir, "portfolio-state.json"),
    pythonBin: resolvePythonBin(cwd, env.DRY_RUN_PYTHON_BIN),
    envFilePath: fileEnv.resolvedPath,
    bootstrap: {
      markets,
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
