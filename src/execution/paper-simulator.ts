import { randomUUID } from "node:crypto";

import type {
  ExecutionResult,
  ExecutionVenue,
  OrderIntent,
  OrderRecord,
} from "./types.js";

interface PaperExecutionVenueOptions {
  feeRate?: number;
  liquidityMultiple?: number;
}

export class DryRunVenue implements ExecutionVenue {
  private readonly orders = new Map<string, OrderRecord>();

  async submit(orderIntent: OrderIntent): Promise<ExecutionResult> {
    const fillPrice = orderIntent.referencePrice;
    const quoteNotional = fillPrice * orderIntent.requestedQuantity;
    const order: OrderRecord = {
      orderId: orderIntent.orderId,
      signalId: orderIntent.signalId,
      market: orderIntent.market,
      side: orderIntent.side,
      mode: orderIntent.mode,
      status: "filled",
      requestedQuantity: orderIntent.requestedQuantity,
      executedQuantity: orderIntent.requestedQuantity,
      requestedQuoteNotional: orderIntent.requestedQuoteNotional,
      executedQuoteNotional: quoteNotional,
      limitPrice: orderIntent.limitPrice,
      averageFillPrice: fillPrice,
      feesPaid: 0,
      createdAt: orderIntent.createdAt,
      updatedAt: orderIntent.createdAt,
      reduceOnly: orderIntent.reduceOnly,
      simulated: true,
    };

    this.orders.set(order.orderId, order);

    return {
      order,
      fills: [
        {
          fillId: randomUUID(),
          orderId: order.orderId,
          signalId: order.signalId,
          market: order.market,
          side: order.side,
          quantity: orderIntent.requestedQuantity,
          price: fillPrice,
          quoteNotional,
          feesPaid: 0,
          occurredAt: orderIntent.createdAt,
          simulated: true,
        },
      ],
      warnings: ["dry_run filled at reference price without fee or liquidity impact"],
    };
  }

  async cancel(
    orderId: string,
    _reason: string,
    cancelledAt: string,
  ): Promise<OrderRecord | null> {
    const existing = this.orders.get(orderId);
    if (!existing) {
      return null;
    }

    const updated: OrderRecord = {
      ...existing,
      status: "cancelled",
      updatedAt: cancelledAt,
    };

    this.orders.set(orderId, updated);
    return updated;
  }
}

export class PaperExecutionVenue implements ExecutionVenue {
  private readonly feeRate: number;
  private readonly liquidityMultiple: number;
  private readonly orders = new Map<string, OrderRecord>();

  constructor(options: PaperExecutionVenueOptions = {}) {
    this.feeRate = options.feeRate ?? 0.0004;
    this.liquidityMultiple = options.liquidityMultiple ?? 2.5;
  }

  async submit(orderIntent: OrderIntent): Promise<ExecutionResult> {
    const snapshot = orderIntent.marketSnapshot;
    const referencePrice = orderIntent.referencePrice;
    const topOfBookLiquidity =
      orderIntent.side === "buy"
        ? snapshot.bestAskSize
        : snapshot.bestBidSize;
    const accessibleLiquidity = topOfBookLiquidity * this.liquidityMultiple;
    const fillQuantity = Math.min(orderIntent.requestedQuantity, accessibleLiquidity);
    const liquidityPressure =
      accessibleLiquidity === 0
        ? 1
        : orderIntent.requestedQuantity / accessibleLiquidity;
    const impactBps = Math.min(
      orderIntent.maxSlippageBps,
      snapshot.spreadBps / 2 + Math.max(liquidityPressure, 0.1) * 4,
    );
    const fillPrice =
      orderIntent.side === "buy"
        ? referencePrice * (1 + impactBps / 10_000)
        : referencePrice * (1 - impactBps / 10_000);
    const quoteNotional = fillPrice * fillQuantity;
    const feesPaid = quoteNotional * this.feeRate;
    const status =
      fillQuantity >= orderIntent.requestedQuantity
        ? "filled"
        : "partially_filled";
    const now = orderIntent.createdAt;

    const order: OrderRecord = {
      orderId: orderIntent.orderId,
      signalId: orderIntent.signalId,
      market: orderIntent.market,
      side: orderIntent.side,
      mode: orderIntent.mode,
      status,
      requestedQuantity: orderIntent.requestedQuantity,
      executedQuantity: fillQuantity,
      requestedQuoteNotional: orderIntent.requestedQuoteNotional,
      executedQuoteNotional: quoteNotional,
      limitPrice: orderIntent.limitPrice,
      averageFillPrice: fillQuantity > 0 ? fillPrice : null,
      feesPaid,
      createdAt: now,
      updatedAt: now,
      reduceOnly: orderIntent.reduceOnly,
      simulated: true,
    };

    this.orders.set(order.orderId, order);

    const fills =
      fillQuantity > 0
        ? [
            {
              fillId: randomUUID(),
              orderId: order.orderId,
              signalId: order.signalId,
              market: order.market,
              side: order.side,
              quantity: fillQuantity,
              price: fillPrice,
              quoteNotional,
              feesPaid,
              occurredAt: now,
              simulated: true,
            },
          ]
        : [];

    const warnings =
      status === "partially_filled"
        ? ["paper liquidity exhausted; remaining quantity stayed open"]
        : [];

    return { order, fills, warnings };
  }

  async cancel(
    orderId: string,
    _reason: string,
    cancelledAt: string,
  ): Promise<OrderRecord | null> {
    const existing = this.orders.get(orderId);
    if (!existing) {
      return null;
    }

    const updated: OrderRecord = {
      ...existing,
      status:
        existing.status === "filled" ? existing.status : "cancelled",
      updatedAt: cancelledAt,
    };

    this.orders.set(orderId, updated);
    return updated;
  }
}
