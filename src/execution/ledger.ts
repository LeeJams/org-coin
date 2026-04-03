import type {
  DecisionRecord,
  FillRecord,
  OrderRecord,
} from "./types.js";

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
