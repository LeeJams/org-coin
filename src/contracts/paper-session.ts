import type { PortfolioState } from "../execution/types.js";
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

export type PaperSessionEvent =
  | PaperSessionSnapshotEvent
  | PaperSessionSignalEvent
  | PaperSessionCancelEvent;

export interface PaperSessionScenario {
  schemaVersion: "1.0.0";
  initialPortfolio?: PortfolioState;
  clockAt?: string;
  reconcileAt?: string;
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
      events: normalizedEvents,
    },
  };
}
