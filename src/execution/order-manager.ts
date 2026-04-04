import { randomUUID } from "node:crypto";

import { validateSignalIntent } from "../contracts/signal-intent.js";
import { KillSwitch } from "./kill-switch.js";
import { ReconciliationLedger } from "./ledger.js";
import { rejectReason, type RejectReason } from "./reject-reason.js";
import { evaluateRisk } from "./risk-engine.js";
import { DryRunVenue, PaperExecutionVenue } from "./paper-simulator.js";
import type {
  ExecutionMode,
  OrderManager,
  OrderManagerDecision,
  PortfolioPosition,
  PortfolioState,
  ReconciliationReport,
  RiskPolicy,
  SubmitSignalContext,
  ExecutionVenue,
} from "./types.js";

interface ManagedOrderManagerOptions {
  mode: ExecutionMode;
  policy: RiskPolicy;
  venue: ExecutionVenue;
  portfolio?: PortfolioState;
  ledger?: ReconciliationLedger;
  killSwitch?: KillSwitch;
  clock?: () => Date;
}

export interface CreateOrderManagerOptions {
  policy?: Partial<RiskPolicy>;
  portfolio?: PortfolioState;
  ledger?: ReconciliationLedger;
  killSwitch?: KillSwitch;
  clock?: () => Date;
}

export function createDefaultRiskPolicy(): RiskPolicy {
  return {
    allowedMarkets: ["KRW-BTC", "KRW-ETH", "KRW-XRP"],
    minConfidence: 0.55,
    maxOrderNotional: 1_000_000,
    maxPositionNotionalByMarket: {
      "KRW-BTC": 2_500_000,
      "KRW-ETH": 2_000_000,
      "KRW-XRP": 1_500_000,
    },
    maxSpreadBps: 8,
    min24hNotional: 30_000_000_000,
    minDepthRatio: 0.9,
    dataStaleAfterMs: 5_000,
    maxDailyLoss: 500_000,
    maxOpenOrdersPerMarket: 2,
    maxOperationalRejectStreak: 3,
  };
}

function clonePosition(position: PortfolioPosition): PortfolioPosition {
  return { ...position };
}

function clonePortfolio(portfolio: PortfolioState): PortfolioState {
  return {
    cashAvailable: portfolio.cashAvailable,
    dailyRealizedPnl: portfolio.dailyRealizedPnl,
    positions: Object.fromEntries(
      Object.entries(portfolio.positions).map(([market, position]) => [
        market,
        clonePosition(position),
      ]),
    ),
  };
}

function mergePolicy(policy?: Partial<RiskPolicy>): RiskPolicy {
  const defaults = createDefaultRiskPolicy();
  return {
    ...defaults,
    ...policy,
    maxPositionNotionalByMarket: {
      ...defaults.maxPositionNotionalByMarket,
      ...(policy?.maxPositionNotionalByMarket ?? {}),
    },
  };
}

class ManagedOrderManager implements OrderManager {
  private readonly ledger: ReconciliationLedger;
  private readonly killSwitch: KillSwitch;
  private readonly portfolio: PortfolioState;
  private operationalRejectStreak = 0;

  constructor(private readonly options: ManagedOrderManagerOptions) {
    this.ledger = options.ledger ?? new ReconciliationLedger();
    this.killSwitch = options.killSwitch ?? new KillSwitch(options.clock);
    this.portfolio = clonePortfolio(
      options.portfolio ?? {
        cashAvailable: 10_000_000,
        dailyRealizedPnl: 0,
        positions: {},
      },
    );
  }

  async submitSignal(
    input: unknown,
    context: SubmitSignalContext,
  ): Promise<OrderManagerDecision> {
    const now = (this.options.clock ?? (() => new Date()))();
    const decisionId = randomUUID();
    const guardReason = this.killSwitch.guard();

    if (guardReason) {
      return this.reject(decisionId, undefined, undefined, [guardReason], now);
    }

    const validation = validateSignalIntent(input);
    if (!validation.ok) {
      return this.reject(decisionId, undefined, undefined, [
        rejectReason("malformed_signal", "signal failed schema validation", {
          issues: validation.issues,
        }),
      ], now);
    }

    const signal = validation.value;

    if (this.ledger.hasProcessedSignal(signal.signalId)) {
      return this.reject(
        decisionId,
        signal.signalId,
        signal.market,
        [
          rejectReason(
            "duplicate_signal",
            "signalId was already processed in this session",
            { signalId: signal.signalId },
          ),
        ],
        now,
      );
    }

    if (!context.marketSnapshot) {
      return this.reject(
        decisionId,
        signal.signalId,
        signal.market,
        [
          rejectReason(
            "missing_market_snapshot",
            "no market snapshot is loaded for this signal market",
            {
              market: signal.market,
              receivedAt: context.receivedAt,
            },
          ),
        ],
        now,
      );
    }

    const evaluation = evaluateRisk({
      signal,
      snapshot: context.marketSnapshot,
      portfolio: this.portfolio,
      policy: this.options.policy,
      openOrdersForMarket: this.ledger.getOpenOrderCountForMarket(signal.market),
      now,
      mode: this.options.mode,
      orderId: randomUUID(),
    });

    if (Array.isArray(evaluation)) {
      return this.reject(
        decisionId,
        signal.signalId,
        signal.market,
        evaluation,
        now,
      );
    }

    const result = await this.options.venue.submit(evaluation.orderIntent);
    this.ledger.recordDecision({
      decisionId,
      signalId: signal.signalId,
      market: signal.market,
      mode: this.options.mode,
      accepted: true,
      reasons: [],
      createdAt: now.toISOString(),
      orderId: result.order.orderId,
    });
    this.ledger.recordOrder(result.order);
    this.ledger.recordFills(result.fills);
    this.applyExecutionResult(result.order, result.fills);
    this.operationalRejectStreak = 0;

    return {
      accepted: true,
      decisionId,
      mode: this.options.mode,
      order: result.order,
      fills: result.fills,
      warnings: result.warnings,
    };
  }

  async cancelOrder(
    orderId: string,
    reason: string,
    cancelledAt?: string,
  ) {
    const timestamp = cancelledAt ?? (this.options.clock ?? (() => new Date()))().toISOString();
    const cancelled = await this.options.venue.cancel(orderId, reason, timestamp);
    if (cancelled) {
      this.ledger.recordOrder(cancelled);
    }
    return cancelled;
  }

  reconcileSession(at?: string): ReconciliationReport {
    const generatedAt =
      at ?? (this.options.clock ?? (() => new Date()))().toISOString();
    const openOrders = this.ledger.getOpenOrders();
    const openPositions = Object.values(this.portfolio.positions)
      .filter((position) => Math.abs(position.baseQuantity) > 1e-12)
      .map((position) => ({ ...position }));

    const reasons = [];

    if (openOrders.length > 0) {
      reasons.push(
        rejectReason(
          "reconciliation_mismatch",
          "session ended with open orders still in the ledger",
          { openOrderIds: openOrders.map((order) => order.orderId) },
        ),
      );
    }

    if (openPositions.length > 0) {
      reasons.push(
        rejectReason(
          "reconciliation_mismatch",
          "session ended with non-flat paper positions",
          {
            openPositions: openPositions.map((position) => ({
              market: position.market,
              baseQuantity: position.baseQuantity,
            })),
          },
        ),
      );
    }

    if (reasons.length > 0) {
      this.killSwitch.trip(
        "reconciliation_mismatch",
        "session reconciliation failed",
        { reasons },
      );
    }

    return {
      ok: reasons.length === 0,
      mode: this.options.mode,
      generatedAt,
      openOrders,
      openPositions,
      activeKillSwitch: this.killSwitch.isActive(),
      reasons,
    };
  }

  getLedgerSnapshot() {
    return {
      decisions: this.ledger.getDecisions(),
      orders: this.ledger.getOrders(),
      fills: this.ledger.getFills(),
    };
  }

  getPortfolioState(): PortfolioState {
    return clonePortfolio(this.portfolio);
  }

  private reject(
    decisionId: string,
    signalId: string | undefined,
    market: string | undefined,
    reasons: RejectReason[],
    now: Date,
  ): OrderManagerDecision {
    const normalizedReasons = this.normalizeReasons(reasons);
    this.ledger.recordDecision({
      decisionId,
      signalId,
      market,
      mode: this.options.mode,
      accepted: false,
      reasons: normalizedReasons,
      createdAt: now.toISOString(),
    });

    this.operationalRejectStreak += 1;

    if (normalizedReasons.some((reason) => reason.code === "stale_market_data")) {
      this.killSwitch.trip("stale_market_data", "stale data reject triggered safety stop", {
        reasons: normalizedReasons,
      });
    } else if (
      this.operationalRejectStreak >= this.options.policy.maxOperationalRejectStreak
    ) {
      this.killSwitch.trip(
        "reject_streak",
        "too many consecutive rejects triggered the kill switch",
        {
          rejectStreak: this.operationalRejectStreak,
          reasons: normalizedReasons,
        },
      );
    }

    return {
      accepted: false,
      decisionId,
      mode: this.options.mode,
      reasons: normalizedReasons,
    };
  }

  private normalizeReasons(
    reasons: RejectReason[],
  ): RejectReason[] {
    return reasons.map((reason) => ({ ...reason }));
  }

  private applyExecutionResult(
    order: { side: "buy" | "sell"; market: string },
    fills: Array<{ quantity: number; quoteNotional: number; feesPaid: number; price: number }>,
  ): void {
    for (const fill of fills) {
      if (fill.quantity <= 0) {
        continue;
      }

      const existing = this.portfolio.positions[order.market] ?? {
        market: order.market,
        baseQuantity: 0,
        avgEntryPrice: 0,
        realizedPnl: 0,
      };

      if (order.side === "buy") {
        const currentCost = existing.baseQuantity * existing.avgEntryPrice;
        const nextQuantity = existing.baseQuantity + fill.quantity;
        const nextCost = currentCost + fill.quoteNotional;

        existing.baseQuantity = nextQuantity;
        existing.avgEntryPrice = nextQuantity === 0 ? 0 : nextCost / nextQuantity;
        this.portfolio.cashAvailable -= fill.quoteNotional + fill.feesPaid;
      } else {
        const matchedCost = fill.quantity * existing.avgEntryPrice;
        const realizedPnl = fill.quoteNotional - matchedCost - fill.feesPaid;
        existing.baseQuantity = Math.max(existing.baseQuantity - fill.quantity, 0);
        existing.realizedPnl += realizedPnl;
        this.portfolio.cashAvailable += fill.quoteNotional - fill.feesPaid;
        this.portfolio.dailyRealizedPnl += realizedPnl;
      }

      this.portfolio.positions[order.market] = existing;
    }
  }
}

export function createDryRunOrderManager(
  options: CreateOrderManagerOptions = {},
): OrderManager {
  return new ManagedOrderManager({
    mode: "dry_run",
    policy: mergePolicy(options.policy),
    venue: new DryRunVenue(),
    portfolio: options.portfolio,
    ledger: options.ledger,
    killSwitch: options.killSwitch,
    clock: options.clock,
  });
}

export function createPaperOrderManager(
  options: CreateOrderManagerOptions = {},
): OrderManager {
  return new ManagedOrderManager({
    mode: "paper",
    policy: mergePolicy(options.policy),
    venue: new PaperExecutionVenue(),
    portfolio: options.portfolio,
    ledger: options.ledger,
    killSwitch: options.killSwitch,
    clock: options.clock,
  });
}
