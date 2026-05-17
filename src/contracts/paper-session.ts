import type { ExecutionMode, PortfolioState } from "../execution/types.js";
import {
  validateMarketSnapshot,
  type MarketSnapshot,
  type MarketSnapshotValidationIssue,
} from "./market-snapshot.js";
import {
  validateSignalIntent,
  type SignalIntent,
  type ValidationIssue,
} from "./signal-intent.js";

export interface PaperSessionSnapshotEvent {
  type: "snapshot";
  snapshot: MarketSnapshot;
}

export interface PaperSessionSignalEvent {
  type: "signal";
  signal: SignalIntent;
  receivedAt?: string;
}

export interface PaperSessionCancelEvent {
  type: "cancel";
  orderId: string;
  reason: string;
  cancelledAt?: string;
}

export interface PaperSessionScenarioSummary {
  snapshotCount: number;
  signalCount: number;
  entrySignalCount: number;
  exitSignalCount: number;
  entryEvaluationBucketCount?: number;
  entrySuppressedCandidateCount?: number;
  entryBlockedOpenPositionBucketCount?: number;
  entryBlockedAfterExitBucketCount?: number;
  entryBelowMinNotionalCount?: number;
  syntheticCloseCount: number;
  marketsTraded: string[];
  suppressedByReason: Record<string, number>;
  entrySuppressedByGateFailure?: Record<string, number>;
  entrySuppressedGateFailureCombinations?: Record<string, number>;
  entrySuppressedGateFailureStats?: Record<
    string,
    {
      count: number;
      avgActual: number;
      avgThreshold: number;
      avgDeficit: number;
      maxDeficit: number;
      nearMissCount?: number;
      nearMissRate?: number;
    }
  >;
  suppressedEntrySamples?: Array<{
    market: string;
    asOf: string;
    eventTimestampMs: number;
    suppressionReason: string;
    requestedQuoteNotionalKrw: number;
    bestAskPrice: number;
    bestBidPrice: number;
    lastTradePrice: number;
    featureSnapshot: Record<string, number | null>;
    failingGates: Array<{
      field: string;
      comparator: string;
      actual: number;
      threshold: number;
    }>;
  }>;
}

export interface PaperSessionScenarioMetadata {
  generatedAt?: string;
  sourceRunId?: string;
  strategyId?: string;
  modeIntent?: ExecutionMode;
  initialCashKrw?: number;
  initialEquityKrw?: number;
  aggressiveNotionalFraction?: number;
  entryProfile?: string;
  exitProfile?: string;
  syntheticExitPolicy?: string;
  carryOpenPositions?: boolean;
  openPositionState?: {
    market: string;
    enteredAtMs: number;
    entryPrice: number;
    quantity: number;
    quoteNotional: number;
    consecutiveNegativeRet1m: number;
    consecutiveBookFailures: number;
    peakBidPrice: number;
  } | null;
  eligibilityNote?: string;
  summary?: PaperSessionScenarioSummary;
}

export type PaperSessionEvent =
  | PaperSessionSnapshotEvent
  | PaperSessionSignalEvent
  | PaperSessionCancelEvent;

export interface PaperSessionScenario {
  schemaVersion: "1.0.0";
  initialPortfolio?: PortfolioState;
  clockAt?: string;
  reconcileAt?: string;
  metadata?: PaperSessionScenarioMetadata;
  events: PaperSessionEvent[];
}

export type PaperSessionScenarioValidationIssue =
  | ValidationIssue
  | MarketSnapshotValidationIssue;

export type PaperSessionScenarioValidationResult =
  | { ok: true; value: PaperSessionScenario }
  | { ok: false; issues: PaperSessionScenarioValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isExecutionMode(value: unknown): value is ExecutionMode {
  return value === "dry_run" || value === "paper" || value === "live";
}

function pushUnknownFieldIssues(
  input: Record<string, unknown>,
  allowedKeys: string[],
  path: string,
  issues: ValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(input)) {
    if (allowed.has(key)) {
      continue;
    }

    issues.push({
      path: path === "$" ? key : `${path}.${key}`,
      message: "field is not allowed",
    });
  }
}

function prefixIssues(
  issues: PaperSessionScenarioValidationIssue[],
  prefix: string,
): PaperSessionScenarioValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: issue.path === "$" ? prefix : `${prefix}.${issue.path}`,
  }));
}

function validateInitialPortfolio(
  input: unknown,
): { ok: true; value: PortfolioState } | { ok: false; issues: ValidationIssue[] } {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "initialPortfolio", message: "initialPortfolio must be an object" }],
    };
  }

  const issues: ValidationIssue[] = [];
  const cashAvailable = asFiniteNumber(input.cashAvailable);
  const dailyRealizedPnl = asFiniteNumber(input.dailyRealizedPnl);
  const positions = input.positions;

  if (cashAvailable === undefined) {
    issues.push({
      path: "initialPortfolio.cashAvailable",
      message: "cashAvailable must be a finite number",
    });
  }

  if (dailyRealizedPnl === undefined) {
    issues.push({
      path: "initialPortfolio.dailyRealizedPnl",
      message: "dailyRealizedPnl must be a finite number",
    });
  }

  if (!isRecord(positions)) {
    issues.push({
      path: "initialPortfolio.positions",
      message: "positions must be an object keyed by market",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const normalizedPositions: PortfolioState["positions"] = {};

  for (const [marketKey, position] of Object.entries(positions as Record<string, unknown>)) {
    if (!isRecord(position)) {
      issues.push({
        path: `initialPortfolio.positions.${marketKey}`,
        message: "position must be an object",
      });
      continue;
    }

    const market = asNonEmptyString(position.market);
    const baseQuantity = asFiniteNumber(position.baseQuantity);
    const avgEntryPrice = asFiniteNumber(position.avgEntryPrice);
    const realizedPnl = asFiniteNumber(position.realizedPnl);

    if (!market || market !== marketKey) {
      issues.push({
        path: `initialPortfolio.positions.${marketKey}.market`,
        message: "position.market must match the positions key",
      });
    }

    if (baseQuantity === undefined || baseQuantity < 0) {
      issues.push({
        path: `initialPortfolio.positions.${marketKey}.baseQuantity`,
        message: "baseQuantity must be a non-negative number",
      });
    }

    if (avgEntryPrice === undefined || avgEntryPrice < 0) {
      issues.push({
        path: `initialPortfolio.positions.${marketKey}.avgEntryPrice`,
        message: "avgEntryPrice must be a non-negative number",
      });
    }

    if (realizedPnl === undefined) {
      issues.push({
        path: `initialPortfolio.positions.${marketKey}.realizedPnl`,
        message: "realizedPnl must be a finite number",
      });
    }

    if (
      market &&
      baseQuantity !== undefined &&
      avgEntryPrice !== undefined &&
      realizedPnl !== undefined
    ) {
      normalizedPositions[marketKey] = {
        market,
        baseQuantity,
        avgEntryPrice,
        realizedPnl,
      };
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      cashAvailable: cashAvailable!,
      dailyRealizedPnl: dailyRealizedPnl!,
      positions: normalizedPositions,
    },
  };
}

function validateScenarioSummary(
  input: unknown,
): { ok: true; value: PaperSessionScenarioSummary } | { ok: false; issues: ValidationIssue[] } {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "metadata.summary", message: "metadata.summary must be an object" }],
    };
  }

  const issues: ValidationIssue[] = [];
  pushUnknownFieldIssues(
    input,
    [
      "snapshotCount",
        "signalCount",
        "entrySignalCount",
        "exitSignalCount",
        "entryEvaluationBucketCount",
        "entrySuppressedCandidateCount",
        "entryBlockedOpenPositionBucketCount",
        "entryBlockedAfterExitBucketCount",
        "entryBelowMinNotionalCount",
        "syntheticCloseCount",
        "marketsTraded",
        "suppressedByReason",
        "entrySuppressedByGateFailure",
        "entrySuppressedGateFailureCombinations",
        "entrySuppressedGateFailureStats",
        "suppressedEntrySamples",
    ],
    "metadata.summary",
    issues,
  );

  const snapshotCount = asFiniteNumber(input.snapshotCount);
  const signalCount = asFiniteNumber(input.signalCount);
  const entrySignalCount = asFiniteNumber(input.entrySignalCount);
  const exitSignalCount = asFiniteNumber(input.exitSignalCount);
  const entryEvaluationBucketCount = asFiniteNumber(input.entryEvaluationBucketCount);
  const entrySuppressedCandidateCount = asFiniteNumber(input.entrySuppressedCandidateCount);
  const entryBlockedOpenPositionBucketCount = asFiniteNumber(
    input.entryBlockedOpenPositionBucketCount,
  );
  const entryBlockedAfterExitBucketCount = asFiniteNumber(
    input.entryBlockedAfterExitBucketCount,
  );
  const entryBelowMinNotionalCount = asFiniteNumber(input.entryBelowMinNotionalCount);
  const syntheticCloseCount = asFiniteNumber(input.syntheticCloseCount);
  const marketsTraded = input.marketsTraded;
  const suppressedByReason = input.suppressedByReason;
  const entrySuppressedByGateFailure = input.entrySuppressedByGateFailure;
  const entrySuppressedGateFailureCombinations =
    input.entrySuppressedGateFailureCombinations;
  const entrySuppressedGateFailureStats = input.entrySuppressedGateFailureStats;
  const suppressedEntrySamples = input.suppressedEntrySamples;

  const countFields = [
    ["snapshotCount", snapshotCount],
    ["signalCount", signalCount],
    ["entrySignalCount", entrySignalCount],
    ["exitSignalCount", exitSignalCount],
    ["syntheticCloseCount", syntheticCloseCount],
  ] as const;

  for (const [field, value] of countFields) {
    if (value === undefined || !Number.isInteger(value) || value < 0) {
      issues.push({
        path: `metadata.summary.${field}`,
        message: `${field} must be a non-negative integer`,
      });
    }
  }

  const optionalCountFields = [
    ["entryEvaluationBucketCount", entryEvaluationBucketCount],
    ["entrySuppressedCandidateCount", entrySuppressedCandidateCount],
    ["entryBlockedOpenPositionBucketCount", entryBlockedOpenPositionBucketCount],
    ["entryBlockedAfterExitBucketCount", entryBlockedAfterExitBucketCount],
    ["entryBelowMinNotionalCount", entryBelowMinNotionalCount],
  ] as const;

  for (const [field, value] of optionalCountFields) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      issues.push({
        path: `metadata.summary.${field}`,
        message: `${field} must be a non-negative integer when provided`,
      });
    }
  }

  if (
    !Array.isArray(marketsTraded) ||
    !marketsTraded.every((market) => typeof market === "string" && market.trim().length > 0)
  ) {
    issues.push({
      path: "metadata.summary.marketsTraded",
      message: "marketsTraded must be a string array",
    });
  }

  if (!isRecord(suppressedByReason)) {
    issues.push({
      path: "metadata.summary.suppressedByReason",
      message: "suppressedByReason must be an object keyed by suppression code",
    });
  }

  const normalizedSuppressedByReason: Record<string, number> = {};
  if (isRecord(suppressedByReason)) {
    for (const [reason, value] of Object.entries(suppressedByReason)) {
      const count = asFiniteNumber(value);
      if (count === undefined || !Number.isInteger(count) || count < 0) {
        issues.push({
          path: `metadata.summary.suppressedByReason.${reason}`,
          message: "suppression counts must be non-negative integers",
        });
        continue;
      }

      normalizedSuppressedByReason[reason] = count;
    }
  }

  let normalizedEntrySuppressedByGateFailure: Record<string, number> | undefined;
  if (entrySuppressedByGateFailure !== undefined) {
    if (!isRecord(entrySuppressedByGateFailure)) {
      issues.push({
        path: "metadata.summary.entrySuppressedByGateFailure",
        message: "entrySuppressedByGateFailure must be an object keyed by gate field",
      });
    } else {
      normalizedEntrySuppressedByGateFailure = {};
      for (const [field, value] of Object.entries(entrySuppressedByGateFailure)) {
        const count = asFiniteNumber(value);
        if (count === undefined || !Number.isInteger(count) || count < 0) {
          issues.push({
            path: `metadata.summary.entrySuppressedByGateFailure.${field}`,
            message: "gate failure counts must be non-negative integers",
          });
          continue;
        }

        normalizedEntrySuppressedByGateFailure[field] = count;
      }
    }
  }

  let normalizedEntrySuppressedGateFailureCombinations: Record<string, number> | undefined;
  if (entrySuppressedGateFailureCombinations !== undefined) {
    if (!isRecord(entrySuppressedGateFailureCombinations)) {
      issues.push({
        path: "metadata.summary.entrySuppressedGateFailureCombinations",
        message: "entrySuppressedGateFailureCombinations must be an object keyed by gate set",
      });
    } else {
      normalizedEntrySuppressedGateFailureCombinations = {};
      for (const [fieldSet, value] of Object.entries(
        entrySuppressedGateFailureCombinations,
      )) {
        const count = asFiniteNumber(value);
        if (count === undefined || !Number.isInteger(count) || count < 0) {
          issues.push({
            path: `metadata.summary.entrySuppressedGateFailureCombinations.${fieldSet}`,
            message: "gate failure combination counts must be non-negative integers",
          });
          continue;
        }

        normalizedEntrySuppressedGateFailureCombinations[fieldSet] = count;
      }
    }
  }

  let normalizedEntrySuppressedGateFailureStats:
    | NonNullable<PaperSessionScenarioSummary["entrySuppressedGateFailureStats"]>
    | undefined;
  if (entrySuppressedGateFailureStats !== undefined) {
    if (!isRecord(entrySuppressedGateFailureStats)) {
      issues.push({
        path: "metadata.summary.entrySuppressedGateFailureStats",
        message: "entrySuppressedGateFailureStats must be an object keyed by gate field",
      });
    } else {
      normalizedEntrySuppressedGateFailureStats = {};
      for (const [field, value] of Object.entries(entrySuppressedGateFailureStats)) {
        if (!isRecord(value)) {
          issues.push({
            path: `metadata.summary.entrySuppressedGateFailureStats.${field}`,
            message: "gate failure stats must be an object",
          });
          continue;
        }

        const count = asFiniteNumber(value.count);
        const avgActual = asFiniteNumber(value.avgActual);
        const avgThreshold = asFiniteNumber(value.avgThreshold);
        const avgDeficit = asFiniteNumber(value.avgDeficit);
        const maxDeficit = asFiniteNumber(value.maxDeficit);
        const nearMissCount = asFiniteNumber(value.nearMissCount);
        const nearMissRate = asFiniteNumber(value.nearMissRate);
        if (
          count === undefined ||
          !Number.isInteger(count) ||
          count < 0 ||
          avgActual === undefined ||
          avgThreshold === undefined ||
          avgDeficit === undefined ||
          avgDeficit < 0 ||
          maxDeficit === undefined ||
          maxDeficit < 0 ||
          (nearMissCount !== undefined &&
            (!Number.isInteger(nearMissCount) ||
              nearMissCount < 0 ||
              nearMissCount > count)) ||
          (nearMissRate !== undefined && (nearMissRate < 0 || nearMissRate > 1))
        ) {
          issues.push({
            path: `metadata.summary.entrySuppressedGateFailureStats.${field}`,
            message:
              "gate failure stats require non-negative count/deficit, finite average values, and valid near-miss values",
          });
          continue;
        }

        normalizedEntrySuppressedGateFailureStats[field] = {
          count,
          avgActual,
          avgThreshold,
          avgDeficit,
          maxDeficit,
          ...(nearMissCount !== undefined ? { nearMissCount } : {}),
          ...(nearMissRate !== undefined ? { nearMissRate } : {}),
        };
      }
    }
  }

  let normalizedSuppressedEntrySamples:
    | NonNullable<PaperSessionScenarioSummary["suppressedEntrySamples"]>
    | undefined;
  if (suppressedEntrySamples !== undefined) {
    if (!Array.isArray(suppressedEntrySamples)) {
      issues.push({
        path: "metadata.summary.suppressedEntrySamples",
        message: "suppressedEntrySamples must be an array when provided",
      });
    } else {
      normalizedSuppressedEntrySamples = [];
      suppressedEntrySamples.forEach((sample, index) => {
        if (!isRecord(sample)) {
          issues.push({
            path: `metadata.summary.suppressedEntrySamples.${index}`,
            message: "suppressed entry samples must be objects",
          });
          return;
        }

        const market = asNonEmptyString(sample.market);
        const asOf = isIsoTimestamp(sample.asOf) ? sample.asOf : undefined;
        const eventTimestampMs = asFiniteNumber(sample.eventTimestampMs);
        const suppressionReason = asNonEmptyString(sample.suppressionReason);
        const requestedQuoteNotionalKrw = asFiniteNumber(
          sample.requestedQuoteNotionalKrw,
        );
        const bestAskPrice = asFiniteNumber(sample.bestAskPrice);
        const bestBidPrice = asFiniteNumber(sample.bestBidPrice);
        const lastTradePrice = asFiniteNumber(sample.lastTradePrice);
        if (
          market === undefined ||
          asOf === undefined ||
          eventTimestampMs === undefined ||
          !Number.isInteger(eventTimestampMs) ||
          eventTimestampMs < 0 ||
          suppressionReason === undefined ||
          requestedQuoteNotionalKrw === undefined ||
          requestedQuoteNotionalKrw < 0 ||
          bestAskPrice === undefined ||
          bestAskPrice <= 0 ||
          bestBidPrice === undefined ||
          bestBidPrice <= 0 ||
          lastTradePrice === undefined ||
          lastTradePrice <= 0
        ) {
          issues.push({
            path: `metadata.summary.suppressedEntrySamples.${index}`,
            message:
              "suppressed entry samples require market/asOf/reason, positive prices, non-negative notional, and non-negative integer eventTimestampMs",
          });
          return;
        }

        if (!isRecord(sample.featureSnapshot)) {
          issues.push({
            path: `metadata.summary.suppressedEntrySamples.${index}.featureSnapshot`,
            message: "featureSnapshot must be an object",
          });
          return;
        }
        const featureSnapshot: Record<string, number | null> = {};
        for (const [feature, value] of Object.entries(sample.featureSnapshot)) {
          const normalizedValue = value === null ? null : asFiniteNumber(value);
          if (normalizedValue === undefined) {
            issues.push({
              path: `metadata.summary.suppressedEntrySamples.${index}.featureSnapshot.${feature}`,
              message: "featureSnapshot values must be finite numbers or null",
            });
            continue;
          }
          featureSnapshot[feature] = normalizedValue;
        }

        if (!Array.isArray(sample.failingGates)) {
          issues.push({
            path: `metadata.summary.suppressedEntrySamples.${index}.failingGates`,
            message: "failingGates must be an array",
          });
          return;
        }
        const failingGates: NonNullable<
          PaperSessionScenarioSummary["suppressedEntrySamples"]
        >[number]["failingGates"] = [];
        sample.failingGates.forEach((gate, gateIndex) => {
          if (!isRecord(gate)) {
            issues.push({
              path: `metadata.summary.suppressedEntrySamples.${index}.failingGates.${gateIndex}`,
              message: "failing gate entries must be objects",
            });
            return;
          }
          const field = asNonEmptyString(gate.field);
          const comparator = asNonEmptyString(gate.comparator);
          const actual = asFiniteNumber(gate.actual);
          const threshold = asFiniteNumber(gate.threshold);
          if (
            field === undefined ||
            comparator === undefined ||
            actual === undefined ||
            threshold === undefined
          ) {
            issues.push({
              path: `metadata.summary.suppressedEntrySamples.${index}.failingGates.${gateIndex}`,
              message:
                "failing gate entries require field, comparator, actual, and threshold",
            });
            return;
          }
          failingGates.push({ field, comparator, actual, threshold });
        });

        normalizedSuppressedEntrySamples!.push({
          market,
          asOf,
          eventTimestampMs,
          suppressionReason,
          requestedQuoteNotionalKrw,
          bestAskPrice,
          bestBidPrice,
          lastTradePrice,
          featureSnapshot,
          failingGates,
        });
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      snapshotCount: snapshotCount!,
      signalCount: signalCount!,
      entrySignalCount: entrySignalCount!,
      exitSignalCount: exitSignalCount!,
      ...(entryEvaluationBucketCount !== undefined ? { entryEvaluationBucketCount } : {}),
      ...(entrySuppressedCandidateCount !== undefined ? { entrySuppressedCandidateCount } : {}),
      ...(entryBlockedOpenPositionBucketCount !== undefined
        ? { entryBlockedOpenPositionBucketCount }
        : {}),
      ...(entryBlockedAfterExitBucketCount !== undefined
        ? { entryBlockedAfterExitBucketCount }
        : {}),
      ...(entryBelowMinNotionalCount !== undefined ? { entryBelowMinNotionalCount } : {}),
      syntheticCloseCount: syntheticCloseCount!,
      marketsTraded: [...(marketsTraded as string[])],
      suppressedByReason: normalizedSuppressedByReason,
      ...(normalizedEntrySuppressedByGateFailure !== undefined
        ? { entrySuppressedByGateFailure: normalizedEntrySuppressedByGateFailure }
        : {}),
      ...(normalizedEntrySuppressedGateFailureCombinations !== undefined
        ? {
            entrySuppressedGateFailureCombinations:
              normalizedEntrySuppressedGateFailureCombinations,
          }
        : {}),
      ...(normalizedEntrySuppressedGateFailureStats !== undefined
        ? { entrySuppressedGateFailureStats: normalizedEntrySuppressedGateFailureStats }
        : {}),
      ...(normalizedSuppressedEntrySamples !== undefined
        ? { suppressedEntrySamples: normalizedSuppressedEntrySamples }
        : {}),
    },
  };
}

function validateScenarioMetadata(
  input: unknown,
): { ok: true; value: PaperSessionScenarioMetadata } | { ok: false; issues: ValidationIssue[] } {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "metadata", message: "metadata must be an object" }],
    };
  }

  const issues: ValidationIssue[] = [];
  pushUnknownFieldIssues(
    input,
    [
      "generatedAt",
      "sourceRunId",
      "strategyId",
      "modeIntent",
      "initialCashKrw",
      "initialEquityKrw",
      "aggressiveNotionalFraction",
      "entryProfile",
      "exitProfile",
      "syntheticExitPolicy",
      "carryOpenPositions",
      "openPositionState",
      "eligibilityNote",
      "summary",
    ],
    "metadata",
    issues,
  );

  const generatedAt = input.generatedAt;
  const sourceRunId = asNonEmptyString(input.sourceRunId);
  const strategyId = asNonEmptyString(input.strategyId);
  const modeIntent = input.modeIntent;
  const initialCashKrw = asFiniteNumber(input.initialCashKrw);
  const initialEquityKrw = asFiniteNumber(input.initialEquityKrw);
  const aggressiveNotionalFraction = asFiniteNumber(input.aggressiveNotionalFraction);
  const entryProfile = asNonEmptyString(input.entryProfile);
  const exitProfile = asNonEmptyString(input.exitProfile);
  const syntheticExitPolicy = asNonEmptyString(input.syntheticExitPolicy);
  const carryOpenPositions =
    input.carryOpenPositions === undefined
      ? undefined
      : input.carryOpenPositions === true;
  const eligibilityNote = asNonEmptyString(input.eligibilityNote);

  if (generatedAt !== undefined && !isIsoTimestamp(generatedAt)) {
    issues.push({
      path: "metadata.generatedAt",
      message: "generatedAt must be an ISO timestamp",
    });
  }

  if (input.sourceRunId !== undefined && !sourceRunId) {
    issues.push({
      path: "metadata.sourceRunId",
      message: "sourceRunId must be a non-empty string",
    });
  }

  if (input.strategyId !== undefined && !strategyId) {
    issues.push({
      path: "metadata.strategyId",
      message: "strategyId must be a non-empty string",
    });
  }

  if (modeIntent !== undefined && !isExecutionMode(modeIntent)) {
    issues.push({
      path: "metadata.modeIntent",
      message: "modeIntent must be 'dry_run', 'paper', or 'live'",
    });
  }

  if (input.initialCashKrw !== undefined && (initialCashKrw === undefined || initialCashKrw < 0)) {
    issues.push({
      path: "metadata.initialCashKrw",
      message: "initialCashKrw must be a non-negative number",
    });
  }

  if (
    input.initialEquityKrw !== undefined &&
    (initialEquityKrw === undefined || initialEquityKrw < 0)
  ) {
    issues.push({
      path: "metadata.initialEquityKrw",
      message: "initialEquityKrw must be a non-negative number",
    });
  }

  if (
    input.aggressiveNotionalFraction !== undefined &&
    (
      aggressiveNotionalFraction === undefined ||
      aggressiveNotionalFraction <= 0 ||
      aggressiveNotionalFraction > 1
    )
  ) {
    issues.push({
      path: "metadata.aggressiveNotionalFraction",
      message: "aggressiveNotionalFraction must be between 0 and 1",
    });
  }

  if (input.entryProfile !== undefined && !entryProfile) {
    issues.push({
      path: "metadata.entryProfile",
      message: "entryProfile must be a non-empty string",
    });
  }

  if (input.exitProfile !== undefined && !exitProfile) {
    issues.push({
      path: "metadata.exitProfile",
      message: "exitProfile must be a non-empty string",
    });
  }

  if (input.syntheticExitPolicy !== undefined && !syntheticExitPolicy) {
    issues.push({
      path: "metadata.syntheticExitPolicy",
      message: "syntheticExitPolicy must be a non-empty string",
    });
  }

  if (
    input.carryOpenPositions !== undefined &&
    typeof input.carryOpenPositions !== "boolean"
  ) {
    issues.push({
      path: "metadata.carryOpenPositions",
      message: "carryOpenPositions must be a boolean",
    });
  }

  let openPositionState: PaperSessionScenarioMetadata["openPositionState"];
  if (input.openPositionState !== undefined && input.openPositionState !== null) {
    if (!isRecord(input.openPositionState)) {
      issues.push({
        path: "metadata.openPositionState",
        message: "openPositionState must be an object",
      });
    } else {
      const market = asNonEmptyString(input.openPositionState.market);
      const enteredAtMs = asFiniteNumber(input.openPositionState.enteredAtMs);
      const entryPrice = asFiniteNumber(input.openPositionState.entryPrice);
      const quantity = asFiniteNumber(input.openPositionState.quantity);
      const quoteNotional = asFiniteNumber(input.openPositionState.quoteNotional);
      const consecutiveNegativeRet1m = asFiniteNumber(
        input.openPositionState.consecutiveNegativeRet1m,
      );
      const consecutiveBookFailures = asFiniteNumber(
        input.openPositionState.consecutiveBookFailures,
      );
      const peakBidPrice = asFiniteNumber(input.openPositionState.peakBidPrice);

      if (!market) {
        issues.push({
          path: "metadata.openPositionState.market",
          message: "market must be a non-empty string",
        });
      }

      if (enteredAtMs === undefined || enteredAtMs < 0) {
        issues.push({
          path: "metadata.openPositionState.enteredAtMs",
          message: "enteredAtMs must be a non-negative number",
        });
      }

      if (entryPrice === undefined || entryPrice <= 0) {
        issues.push({
          path: "metadata.openPositionState.entryPrice",
          message: "entryPrice must be a positive number",
        });
      }

      if (quantity === undefined || quantity <= 0) {
        issues.push({
          path: "metadata.openPositionState.quantity",
          message: "quantity must be a positive number",
        });
      }

      if (quoteNotional === undefined || quoteNotional < 0) {
        issues.push({
          path: "metadata.openPositionState.quoteNotional",
          message: "quoteNotional must be a non-negative number",
        });
      }

      if (
        consecutiveNegativeRet1m === undefined ||
        !Number.isInteger(consecutiveNegativeRet1m) ||
        consecutiveNegativeRet1m < 0
      ) {
        issues.push({
          path: "metadata.openPositionState.consecutiveNegativeRet1m",
          message: "consecutiveNegativeRet1m must be a non-negative integer",
        });
      }

      if (
        consecutiveBookFailures === undefined ||
        !Number.isInteger(consecutiveBookFailures) ||
        consecutiveBookFailures < 0
      ) {
        issues.push({
          path: "metadata.openPositionState.consecutiveBookFailures",
          message: "consecutiveBookFailures must be a non-negative integer",
        });
      }

      if (peakBidPrice === undefined || peakBidPrice <= 0) {
        issues.push({
          path: "metadata.openPositionState.peakBidPrice",
          message: "peakBidPrice must be a positive number",
        });
      }

      if (
        market &&
        enteredAtMs !== undefined &&
        entryPrice !== undefined &&
        quantity !== undefined &&
        quoteNotional !== undefined &&
        consecutiveNegativeRet1m !== undefined &&
        consecutiveBookFailures !== undefined &&
        peakBidPrice !== undefined
      ) {
        openPositionState = {
          market,
          enteredAtMs,
          entryPrice,
          quantity,
          quoteNotional,
          consecutiveNegativeRet1m,
          consecutiveBookFailures,
          peakBidPrice,
        };
      }
    }
  } else if (input.openPositionState === null) {
    openPositionState = null;
  }

  if (input.eligibilityNote !== undefined && !eligibilityNote) {
    issues.push({
      path: "metadata.eligibilityNote",
      message: "eligibilityNote must be a non-empty string",
    });
  }

  let summary: PaperSessionScenarioSummary | undefined;
  if (input.summary !== undefined) {
    const summaryResult = validateScenarioSummary(input.summary);
    if (!summaryResult.ok) {
      issues.push(...summaryResult.issues);
    } else {
      summary = summaryResult.value;
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      generatedAt: typeof generatedAt === "string" ? generatedAt : undefined,
      sourceRunId,
      strategyId,
      modeIntent: modeIntent as ExecutionMode | undefined,
      initialCashKrw,
      initialEquityKrw,
      aggressiveNotionalFraction,
      entryProfile,
      exitProfile,
      syntheticExitPolicy,
      carryOpenPositions,
      openPositionState,
      eligibilityNote,
      summary,
    },
  };
}

export function validatePaperSessionScenario(
  input: unknown,
): PaperSessionScenarioValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "PaperSessionScenario must be an object" }],
    };
  }

  const issues: PaperSessionScenarioValidationIssue[] = [];
  const schemaVersion = input.schemaVersion;
  const events = input.events;
  const clockAt = input.clockAt;
  const reconcileAt = input.reconcileAt;
  const initialPortfolio = input.initialPortfolio;
  const metadata = input.metadata;

  if (schemaVersion !== "1.0.0") {
    issues.push({
      path: "schemaVersion",
      message: "schemaVersion must be '1.0.0'",
    });
  }

  if (clockAt !== undefined && !isIsoTimestamp(clockAt)) {
    issues.push({
      path: "clockAt",
      message: "clockAt must be an ISO timestamp",
    });
  }

  if (reconcileAt !== undefined && !isIsoTimestamp(reconcileAt)) {
    issues.push({
      path: "reconcileAt",
      message: "reconcileAt must be an ISO timestamp",
    });
  }

  let validatedPortfolio: PortfolioState | undefined;
  if (initialPortfolio !== undefined) {
    const portfolioResult = validateInitialPortfolio(initialPortfolio);
    if (!portfolioResult.ok) {
      issues.push(...portfolioResult.issues);
    } else {
      validatedPortfolio = portfolioResult.value;
    }
  }

  let validatedMetadata: PaperSessionScenarioMetadata | undefined;
  if (metadata !== undefined) {
    const metadataResult = validateScenarioMetadata(metadata);
    if (!metadataResult.ok) {
      issues.push(...metadataResult.issues);
    } else {
      validatedMetadata = metadataResult.value;
    }
  }

  if (!Array.isArray(events) || events.length === 0) {
    issues.push({
      path: "events",
      message: "events must be a non-empty array",
    });
  }

  const normalizedEvents: PaperSessionEvent[] = [];

  for (const [index, event] of (Array.isArray(events) ? events : []).entries()) {
    const path = `events[${index}]`;
    if (!isRecord(event)) {
      issues.push({
        path,
        message: "event must be an object",
      });
      continue;
    }

    switch (event.type) {
      case "snapshot": {
        const snapshotResult = validateMarketSnapshot(event.snapshot);
        if (!snapshotResult.ok) {
          issues.push(...prefixIssues(snapshotResult.issues, `${path}.snapshot`));
          continue;
        }

        normalizedEvents.push({
          type: "snapshot",
          snapshot: snapshotResult.value,
        });
        break;
      }

      case "signal": {
        const signalResult = validateSignalIntent(event.signal);
        if (!signalResult.ok) {
          issues.push(...prefixIssues(signalResult.issues, `${path}.signal`));
          continue;
        }

        if (event.receivedAt !== undefined && !isIsoTimestamp(event.receivedAt)) {
          issues.push({
            path: `${path}.receivedAt`,
            message: "receivedAt must be an ISO timestamp",
          });
          continue;
        }

        normalizedEvents.push({
          type: "signal",
          signal: signalResult.value,
          receivedAt:
            typeof event.receivedAt === "string" ? event.receivedAt : undefined,
        });
        break;
      }

      case "cancel": {
        const orderId = asNonEmptyString(event.orderId);
        const reason = asNonEmptyString(event.reason);

        if (!orderId) {
          issues.push({
            path: `${path}.orderId`,
            message: "orderId is required",
          });
        }

        if (!reason) {
          issues.push({
            path: `${path}.reason`,
            message: "reason is required",
          });
        }

        if (event.cancelledAt !== undefined && !isIsoTimestamp(event.cancelledAt)) {
          issues.push({
            path: `${path}.cancelledAt`,
            message: "cancelledAt must be an ISO timestamp",
          });
        }

        if (orderId && reason) {
          normalizedEvents.push({
            type: "cancel",
            orderId,
            reason,
            cancelledAt:
              typeof event.cancelledAt === "string" ? event.cancelledAt : undefined,
          });
        }
        break;
      }

      default:
        issues.push({
          path: `${path}.type`,
          message: "type must be one of 'snapshot', 'signal', or 'cancel'",
        });
    }
  }

  if (validatedMetadata?.summary !== undefined) {
    const summary = validatedMetadata.summary;
    const actualSnapshotCount = normalizedEvents.filter(
      (event) => event.type === "snapshot",
    ).length;
    const signalEvents = normalizedEvents.filter(
      (event): event is PaperSessionSignalEvent => event.type === "signal",
    );
    const actualEntrySignalCount = signalEvents.filter(
      (event) => event.signal.side === "buy",
    ).length;
    const actualExitSignalCount = signalEvents.filter(
      (event) => event.signal.side === "sell",
    ).length;
    const actualSyntheticCloseCount = signalEvents.filter(
      (event) =>
        event.signal.side === "sell" &&
        event.signal.signalId.includes("synthetic-exit"),
    ).length;
    const summaryChecks = [
      ["snapshotCount", summary.snapshotCount, actualSnapshotCount],
      ["signalCount", summary.signalCount, signalEvents.length],
      ["entrySignalCount", summary.entrySignalCount, actualEntrySignalCount],
      ["exitSignalCount", summary.exitSignalCount, actualExitSignalCount],
      ["syntheticCloseCount", summary.syntheticCloseCount, actualSyntheticCloseCount],
    ] as const;

    for (const [field, reported, actual] of summaryChecks) {
      if (reported !== actual) {
        issues.push({
          path: `metadata.summary.${field}`,
          message: `${field} must match the scenario event stream; reported ${reported}, actual ${actual}`,
        });
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      schemaVersion: "1.0.0",
      initialPortfolio: validatedPortfolio,
      clockAt: typeof clockAt === "string" ? clockAt : undefined,
      reconcileAt: typeof reconcileAt === "string" ? reconcileAt : undefined,
      metadata: validatedMetadata,
      events: normalizedEvents,
    },
  };
}
