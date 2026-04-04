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
  syntheticCloseCount: number;
  marketsTraded: string[];
  suppressedByReason: Record<string, number>;
}

export interface PaperSessionScenarioMetadata {
  generatedAt?: string;
  sourceRunId?: string;
  strategyId?: string;
  modeIntent?: ExecutionMode;
  initialCashKrw?: number;
  aggressiveNotionalFraction?: number;
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
      "syntheticCloseCount",
      "marketsTraded",
      "suppressedByReason",
    ],
    "metadata.summary",
    issues,
  );

  const snapshotCount = asFiniteNumber(input.snapshotCount);
  const signalCount = asFiniteNumber(input.signalCount);
  const entrySignalCount = asFiniteNumber(input.entrySignalCount);
  const exitSignalCount = asFiniteNumber(input.exitSignalCount);
  const syntheticCloseCount = asFiniteNumber(input.syntheticCloseCount);
  const marketsTraded = input.marketsTraded;
  const suppressedByReason = input.suppressedByReason;

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
      syntheticCloseCount: syntheticCloseCount!,
      marketsTraded: [...(marketsTraded as string[])],
      suppressedByReason: normalizedSuppressedByReason,
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
      "aggressiveNotionalFraction",
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
  const aggressiveNotionalFraction = asFiniteNumber(input.aggressiveNotionalFraction);
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
      aggressiveNotionalFraction,
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
