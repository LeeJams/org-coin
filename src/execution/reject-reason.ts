export type RejectReasonCode =
  | "malformed_signal"
  | "missing_market_snapshot"
  | "expired_signal"
  | "duplicate_signal"
  | "unsupported_market"
  | "stale_market_data"
  | "spread_guard_triggered"
  | "liquidity_guard_triggered"
  | "confidence_below_threshold"
  | "max_order_notional_exceeded"
  | "max_position_notional_exceeded"
  | "insufficient_cash"
  | "insufficient_position"
  | "daily_loss_limit_exceeded"
  | "too_many_open_orders"
  | "kill_switch_active"
  | "live_trading_disabled"
  | "reconciliation_mismatch"
  | "manual_review_required";

export interface RejectReason {
  code: RejectReasonCode;
  message: string;
  detail?: Record<string, unknown>;
}

export function rejectReason(
  code: RejectReasonCode,
  message: string,
  detail?: Record<string, unknown>,
): RejectReason {
  return { code, message, detail };
}
