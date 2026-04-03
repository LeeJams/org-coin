import type { MarketSnapshot } from "../contracts/market-snapshot.js";
import type { SignalIntent, SignalSide } from "../contracts/signal-intent.js";
import type { RejectReason } from "./reject-reason.js";

export type ExecutionMode = "dry_run" | "paper" | "live";
export type OrderStatus =
  | "accepted"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected";

export interface RiskPolicy {
  allowedMarkets: string[];
  minConfidence: number;
  maxOrderNotional: number;
  maxPositionNotionalByMarket: Record<string, number>;
  maxSpreadBps: number;
  min24hNotional: number;
  minDepthRatio: number;
  dataStaleAfterMs: number;
  maxDailyLoss: number;
  maxOpenOrdersPerMarket: number;
  maxOperationalRejectStreak: number;
}

export interface PortfolioPosition {
  market: string;
  baseQuantity: number;
  avgEntryPrice: number;
  realizedPnl: number;
}

export interface PortfolioState {
  cashAvailable: number;
  dailyRealizedPnl: number;
  positions: Record<string, PortfolioPosition>;
}

export interface SubmitSignalContext {
  marketSnapshot: MarketSnapshot;
  receivedAt?: string;
}

export interface OrderIntent {
  orderId: string;
  signalId: string;
  strategyId: string;
  market: string;
  side: SignalSide;
  mode: ExecutionMode;
  requestedQuantity: number;
  requestedQuoteNotional: number;
  referencePrice: number;
  limitPrice: number;
  maxSlippageBps: number;
  reduceOnly: boolean;
  createdAt: string;
  expiresAt: string;
  confidence: number;
  reasonCodes: string[];
  marketSnapshot: MarketSnapshot;
}

export interface OrderRecord {
  orderId: string;
  signalId: string;
  market: string;
  side: SignalSide;
  mode: ExecutionMode;
  status: OrderStatus;
  requestedQuantity: number;
  executedQuantity: number;
  requestedQuoteNotional: number;
  executedQuoteNotional: number;
  limitPrice: number;
  averageFillPrice: number | null;
  feesPaid: number;
  createdAt: string;
  updatedAt: string;
  reduceOnly: boolean;
  simulated: boolean;
}

export interface FillRecord {
  fillId: string;
  orderId: string;
  signalId: string;
  market: string;
  side: SignalSide;
  quantity: number;
  price: number;
  quoteNotional: number;
  feesPaid: number;
  occurredAt: string;
  simulated: boolean;
}

export interface DecisionRecord {
  decisionId: string;
  signalId?: string;
  market?: string;
  mode: ExecutionMode;
  accepted: boolean;
  reasons: RejectReason[];
  createdAt: string;
  orderId?: string;
}

export interface ExecutionResult {
  order: OrderRecord;
  fills: FillRecord[];
  warnings: string[];
}

export type OrderManagerDecision =
  | {
      accepted: false;
      decisionId: string;
      mode: ExecutionMode;
      reasons: RejectReason[];
    }
  | {
      accepted: true;
      decisionId: string;
      mode: ExecutionMode;
      order: OrderRecord;
      fills: FillRecord[];
      warnings: string[];
    };

export interface ReconciliationReport {
  ok: boolean;
  mode: ExecutionMode;
  generatedAt: string;
  openOrders: OrderRecord[];
  openPositions: PortfolioPosition[];
  activeKillSwitch: boolean;
  reasons: RejectReason[];
}

export interface ExecutionVenue {
  submit(orderIntent: OrderIntent): Promise<ExecutionResult>;
  cancel(
    orderId: string,
    reason: string,
    cancelledAt: string,
  ): Promise<OrderRecord | null>;
}

export interface OrderManager {
  submitSignal(
    input: unknown,
    context: SubmitSignalContext,
  ): Promise<OrderManagerDecision>;
  cancelOrder(
    orderId: string,
    reason: string,
    cancelledAt?: string,
  ): Promise<OrderRecord | null>;
  reconcileSession(at?: string): ReconciliationReport;
  getLedgerSnapshot(): {
    decisions: DecisionRecord[];
    orders: OrderRecord[];
    fills: FillRecord[];
  };
  getPortfolioState(): PortfolioState;
}

export interface RiskApproval {
  orderIntent: OrderIntent;
}

export interface RiskEvaluationInput {
  signal: SignalIntent;
  snapshot: MarketSnapshot;
  portfolio: PortfolioState;
  policy: RiskPolicy;
  openOrdersForMarket: number;
  now: Date;
  mode: ExecutionMode;
  orderId: string;
}
