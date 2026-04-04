import type {
  DecisionRecord,
  FillRecord,
  LedgerSnapshot,
  OrderLedgerEvent,
  OrderRecord,
  RejectLedgerEntry,
  RejectLedgerSummary,
} from "./types.js";

const UNKNOWN_MARKET = "_unknown";

export class ReconciliationLedger {
  private readonly decisions: DecisionRecord[] = [];
  private readonly fills: FillRecord[] = [];
  private readonly orders = new Map<string, OrderRecord>();
  private readonly processedSignalIds = new Set<string>();

  hasProcessedSignal(signalId: string): boolean {
    return this.processedSignalIds.has(signalId);
  }

  recordDecision(decision: DecisionRecord): void {
    this.decisions.push(decision);
    if (decision.signalId) {
      this.processedSignalIds.add(decision.signalId);
    }
  }

  recordOrder(order: OrderRecord): void {
    this.orders.set(order.orderId, { ...order });
  }

  recordFills(fills: FillRecord[]): void {
    for (const fill of fills) {
      this.fills.push({ ...fill });
    }
  }

  getOpenOrders(): OrderRecord[] {
    return this.getOrders().filter((order) =>
      ["accepted", "open", "partially_filled"].includes(order.status),
    );
  }

  getOpenOrderCountForMarket(market: string): number {
    return this.getOpenOrders().filter((order) => order.market === market).length;
  }

  getOrders(): OrderRecord[] {
    return [...this.orders.values()].map((order) => ({ ...order }));
  }

  getFills(): FillRecord[] {
    return [...this.fills].map((fill) => ({ ...fill }));
  }

  getDecisions(): DecisionRecord[] {
    return [...this.decisions].map((decision) => ({
      ...decision,
      reasons: decision.reasons.map((reason) => ({ ...reason })),
    }));
  }
}

export function buildRejectLedgerSummary(
  decisions: DecisionRecord[],
): RejectLedgerSummary {
  const summary: RejectLedgerSummary = {
    totalRejectedDecisions: 0,
    byMarket: {},
    byReason: {},
    entries: [],
  };

  for (const decision of decisions) {
    if (decision.accepted) {
      continue;
    }

    const entry: RejectLedgerEntry = {
      decisionId: decision.decisionId,
      signalId: decision.signalId,
      market: decision.market,
      createdAt: decision.createdAt,
      reasonCodes: decision.reasons.map((reason) => reason.code),
      reasons: decision.reasons.map((reason) => ({ ...reason })),
    };
    const marketKey = decision.market ?? UNKNOWN_MARKET;
    const marketSummary = summary.byMarket[marketKey] ?? {
      total: 0,
      reasons: {},
    };

    marketSummary.total += 1;
    summary.byMarket[marketKey] = marketSummary;
    summary.totalRejectedDecisions += 1;
    summary.entries.push(entry);

    for (const reason of decision.reasons) {
      marketSummary.reasons[reason.code] =
        (marketSummary.reasons[reason.code] ?? 0) + 1;

      const reasonSummary = summary.byReason[reason.code] ?? {
        total: 0,
        markets: {},
      };
      reasonSummary.total += 1;
      reasonSummary.markets[marketKey] =
        (reasonSummary.markets[marketKey] ?? 0) + 1;
      summary.byReason[reason.code] = reasonSummary;
    }
  }

  return summary;
}

export function buildOrderLedgerEvents(
  snapshot: LedgerSnapshot,
): OrderLedgerEvent[] {
  const events: OrderLedgerEvent[] = [];
  const modeByOrderId = new Map<string, OrderRecord["mode"]>();

  for (const order of snapshot.orders) {
    modeByOrderId.set(order.orderId, order.mode);
  }

  for (const decision of snapshot.decisions) {
    if (decision.orderId) {
      modeByOrderId.set(decision.orderId, decision.mode);
    }

    events.push({
      type: "decision",
      occurredAt: decision.createdAt,
      mode: decision.mode,
      market: decision.market,
      orderId: decision.orderId,
      signalId: decision.signalId,
      status: decision.accepted ? "accepted" : "rejected",
      payload: {
        accepted: decision.accepted,
        reasons: decision.reasons.map((reason) => ({ ...reason })),
      },
    });
  }

  for (const order of snapshot.orders) {
    events.push({
      type: "order",
      occurredAt: order.updatedAt,
      mode: order.mode,
      market: order.market,
      orderId: order.orderId,
      signalId: order.signalId,
      status: order.status,
      payload: { ...order },
    });
  }

  for (const fill of snapshot.fills) {
    events.push({
      type: "fill",
      occurredAt: fill.occurredAt,
      mode: modeByOrderId.get(fill.orderId) ?? "paper",
      market: fill.market,
      orderId: fill.orderId,
      signalId: fill.signalId,
      payload: { ...fill },
    });
  }

  return events.sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
}
