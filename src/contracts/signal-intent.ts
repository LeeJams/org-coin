export type SignalSide = "buy" | "sell";
export type SignalSizingBasis =
  | "quote_notional"
  | "base_quantity"
  | "position_fraction";

export interface SignalSizing {
  basis: SignalSizingBasis;
  value: number;
}

export interface SignalIntent {
  schemaVersion: "1.0.0";
  signalId: string;
  strategyId: string;
  market: string;
  side: SignalSide;
  sizing: SignalSizing;
  confidence: number;
  generatedAt: string;
  expiresAt: string;
  maxSlippageBps: number;
  reasonCodes: string[];
  reduceOnly?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type SignalIntentValidationResult =
  | { ok: true; value: SignalIntent }
  | { ok: false; issues: ValidationIssue[] };

const MARKET_PATTERN = /^[A-Z]{3,10}-[A-Z0-9]{2,20}$/;

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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}

export function validateSignalIntent(input: unknown): SignalIntentValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "SignalIntent must be an object" }],
    };
  }

  const issues: ValidationIssue[] = [];
  const schemaVersion = input.schemaVersion;
  const signalId = asNonEmptyString(input.signalId);
  const strategyId = asNonEmptyString(input.strategyId);
  const market = asNonEmptyString(input.market);
  const side = input.side;
  const sizing = input.sizing;
  const confidence = asFiniteNumber(input.confidence);
  const generatedAt = input.generatedAt;
  const expiresAt = input.expiresAt;
  const maxSlippageBps = asFiniteNumber(input.maxSlippageBps);
  const reasonCodes = input.reasonCodes;

  if (schemaVersion !== "1.0.0") {
    issues.push({
      path: "schemaVersion",
      message: "schemaVersion must be '1.0.0'",
    });
  }

  if (!signalId) {
    issues.push({ path: "signalId", message: "signalId is required" });
  }

  if (!strategyId) {
    issues.push({ path: "strategyId", message: "strategyId is required" });
  }

  if (!market || !MARKET_PATTERN.test(market)) {
    issues.push({
      path: "market",
      message: "market must look like KRW-BTC",
    });
  }

  if (side !== "buy" && side !== "sell") {
    issues.push({ path: "side", message: "side must be 'buy' or 'sell'" });
  }

  if (!isRecord(sizing)) {
    issues.push({ path: "sizing", message: "sizing must be an object" });
  } else {
    const sizingRecord = sizing as Record<string, unknown>;
    if (
      sizingRecord.basis !== "quote_notional" &&
      sizingRecord.basis !== "base_quantity" &&
      sizingRecord.basis !== "position_fraction"
    ) {
      issues.push({
        path: "sizing.basis",
        message:
          "sizing.basis must be 'quote_notional', 'base_quantity', or 'position_fraction'",
      });
    }

    const sizingValue = asFiniteNumber(sizingRecord.value);
    if (!sizingValue || sizingValue <= 0) {
      issues.push({
        path: "sizing.value",
        message: "sizing.value must be a positive number",
      });
    }

    if (
      sizingRecord.basis === "position_fraction" &&
      sizingValue &&
      sizingValue > 1
    ) {
      issues.push({
        path: "sizing.value",
        message: "position_fraction must be less than or equal to 1",
      });
    }
  }

  if (confidence === undefined || confidence < 0 || confidence > 1) {
    issues.push({
      path: "confidence",
      message: "confidence must be between 0 and 1",
    });
  }

  if (!isIsoTimestamp(generatedAt)) {
    issues.push({
      path: "generatedAt",
      message: "generatedAt must be an ISO timestamp",
    });
  }

  if (!isIsoTimestamp(expiresAt)) {
    issues.push({
      path: "expiresAt",
      message: "expiresAt must be an ISO timestamp",
    });
  }

  if (
    isIsoTimestamp(generatedAt) &&
    isIsoTimestamp(expiresAt) &&
    Date.parse(expiresAt) <= Date.parse(generatedAt)
  ) {
    issues.push({
      path: "expiresAt",
      message: "expiresAt must be after generatedAt",
    });
  }

  if (maxSlippageBps === undefined || maxSlippageBps <= 0) {
    issues.push({
      path: "maxSlippageBps",
      message: "maxSlippageBps must be a positive number",
    });
  }

  if (!isStringArray(reasonCodes)) {
    issues.push({
      path: "reasonCodes",
      message: "reasonCodes must be a non-empty string array",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      schemaVersion: "1.0.0",
      signalId: signalId!,
      strategyId: strategyId!,
      market: market!,
      side: side as SignalSide,
      sizing: {
        basis: (sizing as Record<string, unknown>).basis as SignalSizingBasis,
        value: (sizing as Record<string, unknown>).value as number,
      },
      confidence: confidence!,
      generatedAt: generatedAt as string,
      expiresAt: expiresAt as string,
      maxSlippageBps: maxSlippageBps!,
      reasonCodes: [...(reasonCodes as string[])],
      reduceOnly:
        typeof input.reduceOnly === "boolean" ? input.reduceOnly : undefined,
      metadata: isRecord(input.metadata) ? { ...input.metadata } : undefined,
    },
  };
}
