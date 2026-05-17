export interface CrossExchangeProofReportInput {
  notionalKrw: number;
  direction: "sell_bithumb_buy_reference" | "buy_bithumb_sell_reference";
  bithumbPriceKrw: number;
  referenceQuoteToKrw: number;
  maxBithumbFeeBps: number;
  maxReferenceFeeBps: number;
  bithumbAccounts: unknown;
  bithumbOrderChance: unknown;
  referenceAccount: unknown;
  referenceCommission: unknown;
}

export interface CrossExchangeOperationalProof {
  generatedAt: string;
  accountFeesConfirmed: boolean;
  hedgeVenueReady: boolean;
  requirements: CrossExchangeInventoryRequirements;
  inventory: {
    bithumbBaseInventoryKrw: number;
    bithumbQuoteInventoryKrw: number;
    referenceBaseInventoryKrw: number;
    referenceQuoteInventoryKrw: number;
  };
  deficits: {
    bithumbBaseDeficitKrw: number;
    bithumbQuoteDeficitKrw: number;
    referenceBaseDeficitKrw: number;
    referenceQuoteDeficitKrw: number;
  };
  details: {
    bithumbFeeBps: number | null;
    referenceFeeBps: number | null;
    bithumbBaseFree: number;
    bithumbQuoteFree: number;
    referenceBaseFree: number;
    referenceQuoteFree: number;
    bithumbBaseRequired: number;
    bithumbQuoteRequired: number;
    referenceBaseRequired: number;
    referenceQuoteRequired: number;
  };
  reasons: string[];
}

export interface CrossExchangeInventoryRequirementInput {
  notionalKrw: number;
  direction: CrossExchangeProofReportInput["direction"];
  bithumbPriceKrw: number;
  referenceQuoteToKrw: number;
  bithumbFeeBps: number | null;
  referenceFeeBps: number | null;
  fallbackBithumbFeeBps: number;
  fallbackReferenceFeeBps: number;
}

export interface CrossExchangeInventoryRequirements {
  bithumbBaseRequiredKrw: number;
  bithumbQuoteRequiredKrw: number;
  referenceBaseRequiredKrw: number;
  referenceQuoteRequiredKrw: number;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function findBithumbCurrency(accounts: unknown, currency: string): number {
  const target = currency.toUpperCase();
  const account = asRecordArray(accounts).find(
    (row) => typeof row.currency === "string" && row.currency.toUpperCase() === target,
  );
  return asNumber(account?.balance) ?? 0;
}

function findReferenceAsset(account: unknown, asset: string): number {
  if (typeof account !== "object" || account === null || Array.isArray(account)) return 0;
  const balances = asRecordArray((account as Record<string, unknown>).balances);
  const target = asset.toUpperCase();
  const balance = balances.find(
    (row) => typeof row.asset === "string" && row.asset.toUpperCase() === target,
  );
  return asNumber(balance?.free) ?? 0;
}

function bithumbFeeBps(orderChance: unknown, direction: CrossExchangeProofReportInput["direction"]): number | null {
  if (typeof orderChance !== "object" || orderChance === null || Array.isArray(orderChance)) {
    return null;
  }
  const record = orderChance as Record<string, unknown>;
  const rawFee =
    direction === "sell_bithumb_buy_reference" ? record.ask_fee : record.bid_fee;
  const feeRate = asNumber(rawFee);
  return feeRate === null || feeRate < 0 ? null : feeRate * 10_000;
}

function referenceFeeBps(commission: unknown): number | null {
  if (typeof commission !== "object" || commission === null || Array.isArray(commission)) {
    return null;
  }
  const record = commission as Record<string, unknown>;
  const standard = record.standardCommission;
  if (typeof standard === "object" && standard !== null && !Array.isArray(standard)) {
    const taker = asNumber((standard as Record<string, unknown>).taker);
    if (taker !== null && taker >= 0) return taker * 10_000;
  }

  const taker = asNumber(record.takerCommission);
  if (taker !== null && taker >= 0) {
    return taker > 1 ? taker / 100 : taker * 10_000;
  }
  return null;
}

function feeMultiplier(feeBps: number | null, fallbackFeeBps: number): number {
  const effectiveFeeBps = feeBps ?? fallbackFeeBps;
  return 1 + effectiveFeeBps / 10_000;
}

function roundKrw(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function nonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

export function buildCrossExchangeInventoryRequirements(
  input: CrossExchangeInventoryRequirementInput,
): CrossExchangeInventoryRequirements {
  positive(input.notionalKrw, "notionalKrw");
  positive(input.bithumbPriceKrw, "bithumbPriceKrw");
  positive(input.referenceQuoteToKrw, "referenceQuoteToKrw");
  nonNegative(input.fallbackBithumbFeeBps, "fallbackBithumbFeeBps");
  nonNegative(input.fallbackReferenceFeeBps, "fallbackReferenceFeeBps");

  if (input.direction === "sell_bithumb_buy_reference") {
    return {
      bithumbBaseRequiredKrw: input.notionalKrw,
      bithumbQuoteRequiredKrw: 0,
      referenceBaseRequiredKrw: 0,
      referenceQuoteRequiredKrw:
        roundKrw(
          input.notionalKrw *
            feeMultiplier(input.referenceFeeBps, input.fallbackReferenceFeeBps),
        ),
    };
  }

  return {
    bithumbBaseRequiredKrw: 0,
    bithumbQuoteRequiredKrw:
      roundKrw(
        input.notionalKrw *
          feeMultiplier(input.bithumbFeeBps, input.fallbackBithumbFeeBps),
      ),
    referenceBaseRequiredKrw: input.notionalKrw,
    referenceQuoteRequiredKrw: 0,
  };
}

function deficit(actual: number, required: number): number {
  return roundKrw(Math.max(0, required - actual));
}

export function buildCrossExchangeOperationalProof(
  input: CrossExchangeProofReportInput,
  now: () => Date = () => new Date(),
): CrossExchangeOperationalProof {
  const bFee = bithumbFeeBps(input.bithumbOrderChance, input.direction);
  const rFee = referenceFeeBps(input.referenceCommission);
  const bithumbBaseFree = findBithumbCurrency(input.bithumbAccounts, "BTC");
  const bithumbQuoteFree = findBithumbCurrency(input.bithumbAccounts, "KRW");
  const referenceBaseFree = findReferenceAsset(input.referenceAccount, "BTC");
  const referenceQuoteFree =
    findReferenceAsset(input.referenceAccount, "USDT") ||
    findReferenceAsset(input.referenceAccount, "FDUSD") ||
    findReferenceAsset(input.referenceAccount, "USDC");
  const inventory = {
    bithumbBaseInventoryKrw: bithumbBaseFree * input.bithumbPriceKrw,
    bithumbQuoteInventoryKrw: bithumbQuoteFree,
    referenceBaseInventoryKrw: referenceBaseFree * input.bithumbPriceKrw,
    referenceQuoteInventoryKrw: referenceQuoteFree * input.referenceQuoteToKrw,
  };
  const requirements = buildCrossExchangeInventoryRequirements({
    notionalKrw: input.notionalKrw,
    direction: input.direction,
    bithumbPriceKrw: input.bithumbPriceKrw,
    referenceQuoteToKrw: input.referenceQuoteToKrw,
    bithumbFeeBps: bFee,
    referenceFeeBps: rFee,
    fallbackBithumbFeeBps: input.maxBithumbFeeBps,
    fallbackReferenceFeeBps: input.maxReferenceFeeBps,
  });
  const deficits = {
    bithumbBaseDeficitKrw: deficit(
      inventory.bithumbBaseInventoryKrw,
      requirements.bithumbBaseRequiredKrw,
    ),
    bithumbQuoteDeficitKrw: deficit(
      inventory.bithumbQuoteInventoryKrw,
      requirements.bithumbQuoteRequiredKrw,
    ),
    referenceBaseDeficitKrw: deficit(
      inventory.referenceBaseInventoryKrw,
      requirements.referenceBaseRequiredKrw,
    ),
    referenceQuoteDeficitKrw: deficit(
      inventory.referenceQuoteInventoryKrw,
      requirements.referenceQuoteRequiredKrw,
    ),
  };
  const reasons: string[] = [];

  if (bFee === null) reasons.push("bithumbFeeUnavailable");
  if (rFee === null) reasons.push("referenceFeeUnavailable");
  if (bFee !== null && bFee > input.maxBithumbFeeBps + 1e-9) {
    reasons.push("bithumbFeeTooHigh");
  }
  if (rFee !== null && rFee > input.maxReferenceFeeBps + 1e-9) {
    reasons.push("referenceFeeTooHigh");
  }

  if (input.direction === "sell_bithumb_buy_reference") {
    if (deficits.bithumbBaseDeficitKrw > 0) {
      reasons.push("bithumbBaseInventoryInsufficient");
    }
    if (deficits.referenceQuoteDeficitKrw > 0) {
      reasons.push("referenceQuoteInventoryInsufficient");
    }
  } else {
    if (deficits.bithumbQuoteDeficitKrw > 0) {
      reasons.push("bithumbQuoteInventoryInsufficient");
    }
    if (deficits.referenceBaseDeficitKrw > 0) {
      reasons.push("referenceBaseInventoryInsufficient");
    }
  }

  const accountFeesConfirmed =
    bFee !== null &&
    rFee !== null &&
    bFee <= input.maxBithumbFeeBps + 1e-9 &&
    rFee <= input.maxReferenceFeeBps + 1e-9;
  const hedgeVenueReady =
    rFee !== null &&
    (input.direction === "sell_bithumb_buy_reference"
      ? deficits.referenceQuoteDeficitKrw === 0
      : deficits.referenceBaseDeficitKrw === 0);

  return {
    generatedAt: now().toISOString(),
    accountFeesConfirmed,
    hedgeVenueReady,
    requirements,
    inventory,
    deficits,
    details: {
      bithumbFeeBps: bFee,
      referenceFeeBps: rFee,
      bithumbBaseFree,
      bithumbQuoteFree,
      referenceBaseFree,
      referenceQuoteFree,
      bithumbBaseRequired: requirements.bithumbBaseRequiredKrw / input.bithumbPriceKrw,
      bithumbQuoteRequired: requirements.bithumbQuoteRequiredKrw,
      referenceBaseRequired: requirements.referenceBaseRequiredKrw / input.bithumbPriceKrw,
      referenceQuoteRequired: requirements.referenceQuoteRequiredKrw / input.referenceQuoteToKrw,
    },
    reasons,
  };
}
