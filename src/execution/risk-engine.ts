import { referencePriceForSide, snapshotAgeMs } from "../contracts/market-snapshot.js";
import type { SignalIntent } from "../contracts/signal-intent.js";
import { rejectReason, type RejectReason } from "./reject-reason.js";
import type {
  OrderIntent,
  PortfolioPosition,
  RiskApproval,
  RiskEvaluationInput,
} from "./types.js";

function positionForMarket(
  positions: Record<string, PortfolioPosition>,
  market: string,
): PortfolioPosition | undefined {
  return positions[market];
}

export function evaluateRisk(input: RiskEvaluationInput): RiskApproval | RejectReason[] {
  const {
    signal,
    snapshot,
    portfolio,
    policy,
    openOrdersForMarket,
    now,
    mode,
    orderId,
  } = input;

  const reasons: RejectReason[] = [];

  if (!policy.allowedMarkets.includes(signal.market)) {
    reasons.push(
      rejectReason(
        "unsupported_market",
        "signal market is not in the approved paper universe",
        { market: signal.market },
      ),
    );
  }

  if (Date.parse(signal.expiresAt) <= now.getTime()) {
    reasons.push(
      rejectReason("expired_signal", "signal has expired before submission"),
    );
  }

  if (signal.confidence < policy.minConfidence) {
    reasons.push(
      rejectReason(
        "confidence_below_threshold",
        "signal confidence is below the configured threshold",
        {
          confidence: signal.confidence,
          minConfidence: policy.minConfidence,
        },
      ),
    );
  }

  if (signal.market !== snapshot.market) {
    reasons.push(
      rejectReason(
        "unsupported_market",
        "signal market does not match the provided market snapshot",
        { signalMarket: signal.market, snapshotMarket: snapshot.market },
      ),
    );
  }

  const ageMs = snapshotAgeMs(snapshot, now);
  if (ageMs > policy.dataStaleAfterMs) {
    reasons.push(
      rejectReason("stale_market_data", "market snapshot is too old", {
        ageMs,
        maxAgeMs: policy.dataStaleAfterMs,
      }),
    );
  }

  if (portfolio.dailyRealizedPnl <= -policy.maxDailyLoss) {
    reasons.push(
      rejectReason(
        "daily_loss_limit_exceeded",
        "daily loss limit is already breached",
        {
          dailyRealizedPnl: portfolio.dailyRealizedPnl,
          maxDailyLoss: policy.maxDailyLoss,
        },
      ),
    );
  }

  if (openOrdersForMarket >= policy.maxOpenOrdersPerMarket) {
    reasons.push(
      rejectReason(
        "too_many_open_orders",
        "too many open orders already exist for this market",
        {
          openOrdersForMarket,
          maxOpenOrdersPerMarket: policy.maxOpenOrdersPerMarket,
        },
      ),
    );
  }

  const referencePrice = referencePriceForSide(snapshot, signal.side);
  const position = positionForMarket(portfolio.positions, signal.market);
  const currentExposure = (position?.baseQuantity ?? 0) * snapshot.lastTradePrice;

  const sizingOutcome = resolveSizing(signal, position, referencePrice);
  if (!sizingOutcome.ok) {
    reasons.push(...sizingOutcome.reasons);
  }

  if (reasons.length > 0 || !sizingOutcome.ok) {
    return reasons;
  }

  const { requestedQuantity, requestedQuoteNotional, reduceOnly } = sizingOutcome;
  const limitPrice =
    signal.side === "buy"
      ? referencePrice * (1 + signal.maxSlippageBps / 10_000)
      : referencePrice * (1 - signal.maxSlippageBps / 10_000);
  const worstCaseQuoteNotional =
    signal.side === "buy" ? requestedQuantity * limitPrice : requestedQuoteNotional;
  const feeReservedWorstCaseQuoteNotional =
    signal.side === "buy"
      ? worstCaseQuoteNotional * (1 + policy.buyFeeReserveRate)
      : worstCaseQuoteNotional;
  const enforceEntrySpreadChecks = !(signal.side === "sell" && reduceOnly);
  const enforceEntryLiquidityChecks = !(signal.side === "sell" && reduceOnly);
  const enforceEntryNotionalCaps = !(signal.side === "sell" && reduceOnly);

  if (enforceEntrySpreadChecks && snapshot.spreadBps > policy.maxSpreadBps) {
    reasons.push(
      rejectReason(
        "spread_guard_triggered",
        "spread guard blocked the order",
        {
          spreadBps: snapshot.spreadBps,
          maxSpreadBps: policy.maxSpreadBps,
        },
      ),
    );
  }

  if (
    enforceEntryLiquidityChecks &&
    (snapshot.depthRatio < policy.minDepthRatio ||
      snapshot.rolling24hNotional < policy.min24hNotional)
  ) {
    reasons.push(
      rejectReason(
        "liquidity_guard_triggered",
        "market liquidity checks failed",
        {
          depthRatio: snapshot.depthRatio,
          minDepthRatio: policy.minDepthRatio,
          rolling24hNotional: snapshot.rolling24hNotional,
          min24hNotional: policy.min24hNotional,
        },
      ),
    );
  }

  if (reasons.length > 0) {
    return reasons;
  }

  const marketExposureCap =
    policy.maxPositionNotionalByMarket[signal.market] ?? policy.maxOrderNotional;

  if (
    enforceEntryNotionalCaps &&
    feeReservedWorstCaseQuoteNotional > policy.maxOrderNotional
  ) {
    reasons.push(
      rejectReason(
        "max_order_notional_exceeded",
        "order notional exceeds the configured cap",
        {
          requestedQuoteNotional: feeReservedWorstCaseQuoteNotional,
          maxOrderNotional: policy.maxOrderNotional,
        },
      ),
    );
  }

  if (
    signal.side === "buy" &&
    currentExposure + feeReservedWorstCaseQuoteNotional > marketExposureCap
  ) {
    reasons.push(
      rejectReason(
        "max_position_notional_exceeded",
        "position cap would be exceeded by this order",
        {
          currentExposure,
          requestedQuoteNotional: feeReservedWorstCaseQuoteNotional,
          marketExposureCap,
        },
      ),
    );
  }

  if (
    signal.side === "buy" &&
    feeReservedWorstCaseQuoteNotional > portfolio.cashAvailable
  ) {
    reasons.push(
      rejectReason("insufficient_cash", "cash balance is insufficient", {
        cashAvailable: portfolio.cashAvailable,
        requestedQuoteNotional: feeReservedWorstCaseQuoteNotional,
      }),
    );
  }

  if (
    signal.side === "sell" &&
    requestedQuantity > (position?.baseQuantity ?? 0)
  ) {
    reasons.push(
      rejectReason(
        "insufficient_position",
        "sell quantity exceeds the simulated position",
        {
          availableQuantity: position?.baseQuantity ?? 0,
          requestedQuantity,
        },
      ),
    );
  }

  if (reasons.length > 0) {
    return reasons;
  }

  const orderIntent: OrderIntent = {
    orderId,
    signalId: signal.signalId,
    strategyId: signal.strategyId,
    market: signal.market,
    side: signal.side,
    mode,
    requestedQuantity,
    requestedQuoteNotional,
    referencePrice,
    limitPrice,
    maxSlippageBps: signal.maxSlippageBps,
    reduceOnly,
    createdAt: now.toISOString(),
    expiresAt: signal.expiresAt,
    confidence: signal.confidence,
    reasonCodes: [...signal.reasonCodes],
    marketSnapshot: snapshot,
  };

  return { orderIntent };
}

function resolveSizing(
  signal: SignalIntent,
  position: PortfolioPosition | undefined,
  referencePrice: number,
):
  | {
      ok: true;
      requestedQuantity: number;
      requestedQuoteNotional: number;
      reduceOnly: boolean;
    }
  | { ok: false; reasons: RejectReason[] } {
  const { basis, value } = signal.sizing;

  if (signal.side === "buy" && basis === "position_fraction") {
    return {
      ok: false,
      reasons: [
        rejectReason(
          "malformed_signal",
          "buy signals cannot use position_fraction sizing",
        ),
      ],
    };
  }

  if (signal.side === "sell" && basis === "quote_notional") {
    return {
      ok: false,
      reasons: [
        rejectReason(
          "malformed_signal",
          "sell signals must use base_quantity or position_fraction sizing",
        ),
      ],
    };
  }

  if (basis === "quote_notional") {
    return {
      ok: true,
      requestedQuantity: value / referencePrice,
      requestedQuoteNotional: value,
      reduceOnly: false,
    };
  }

  if (basis === "base_quantity") {
    return {
      ok: true,
      requestedQuantity: value,
      requestedQuoteNotional: value * referencePrice,
      reduceOnly: signal.side === "sell" || signal.reduceOnly === true,
    };
  }

  const positionQuantity = position?.baseQuantity ?? 0;
  return {
    ok: true,
    requestedQuantity: positionQuantity * value,
    requestedQuoteNotional: positionQuantity * value * referencePrice,
    reduceOnly: true,
  };
}
