import type { BithumbPrivateClient } from "../live/contracts.js";
import type {
  ExecutionResult,
  ExecutionVenue,
  FillRecord,
  OrderIntent,
  OrderRecord,
  OrderStatus,
} from "./types.js";

interface CreateBithumbLiveVenueOptions {
  client: BithumbPrivateClient;
  clock?: () => Date;
  pollAttempts?: number;
  pollIntervalMs?: number;
}

interface NormalizedTrade {
  id: string;
  price: number;
  quantity: number;
  quoteNotional: number;
  fee: number;
  occurredAt: string;
}

interface NormalizedExchangeOrder {
  clientOrderId: string;
  status: OrderStatus;
  requestedQuantity: number;
  executedQuantity: number;
  requestedQuoteNotional: number;
  executedQuoteNotional: number;
  averageFillPrice: number | null;
  feesPaid: number;
  createdAt: string;
  updatedAt: string;
  trades: NormalizedTrade[];
  exchangeOrderId?: string;
}

const LIVE_BUY_FEE_RESERVE_RATE = 0.001;

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function mapOrderStatus(state: string | undefined, executedQuantity: number, requestedQuantity: number): OrderStatus {
  if (state === "done" || state === "filled") {
    return "filled";
  }

  if (state === "cancel" || state === "cancelled") {
    return "cancelled";
  }

  if (
    executedQuantity > 0 &&
    requestedQuantity > 0 &&
    executedQuantity < requestedQuantity
  ) {
    return "partially_filled";
  }

  if (state === "wait" || state === "watch" || state === "open") {
    return "open";
  }

  if (executedQuantity >= requestedQuantity && requestedQuantity > 0) {
    return "filled";
  }

  return "accepted";
}

function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === "filled" || status === "cancelled" || status === "rejected";
}

function normalizeTrades(
  tradesRaw: unknown,
  fallbackOccurredAt: string,
): NormalizedTrade[] {
  if (!Array.isArray(tradesRaw)) {
    return [];
  }

  return tradesRaw
    .map((tradeRaw, index) => {
      const trade = asRecord(tradeRaw, "trade");
      const price = asNumber(trade.price ?? trade.trade_price);
      const quantity = asNumber(trade.volume ?? trade.executed_volume);
      const quoteNotional = asNumber(
        trade.funds,
        price > 0 && quantity > 0 ? price * quantity : 0,
      );
      const fee = asNumber(trade.fee ?? trade.paid_fee);
      const occurredAt =
        asString(trade.created_at ?? trade.traded_at ?? trade.updated_at) ??
        fallbackOccurredAt;

      return {
        id: asString(trade.uuid ?? trade.trade_id ?? trade.sequential_id) ?? `trade-${index}`,
        price,
        quantity,
        quoteNotional,
        fee,
        occurredAt,
      };
    })
    .filter((trade) => trade.quantity > 0 && trade.price > 0);
}

function normalizeOrderResponse(
  raw: unknown,
  fallbackClientOrderId: string,
  fallbackCreatedAt: string,
): NormalizedExchangeOrder {
  const order = asRecord(raw, "order response");
  const clientOrderId =
    asString(order.client_order_id) ??
    asString(order.order_id) ??
    fallbackClientOrderId;
  const requestedQuantity = asNumber(order.volume);
  const executedQuantity = asNumber(order.executed_volume);
  const remainingQuantity = asNumber(order.remaining_volume);
  const orderPrice = asNumber(order.price);
  const paidFee = asNumber(order.paid_fee);
  const trades = normalizeTrades(
    order.trades,
    asString(order.updated_at ?? order.created_at) ?? fallbackCreatedAt,
  );
  const executedQuoteNotional =
    trades.length > 0
      ? trades.reduce((sum, trade) => sum + trade.quoteNotional, 0)
      : asNumber(order.executed_funds, executedQuantity * orderPrice);
  const requestedQuoteNotional =
    requestedQuantity > 0 && orderPrice > 0 ? requestedQuantity * orderPrice : executedQuoteNotional;
  const averageFillPrice =
    executedQuantity > 0
      ? trades.length > 0
        ? executedQuoteNotional / executedQuantity
        : asNumber(order.avg_price, executedQuoteNotional / executedQuantity)
      : null;

  return {
    clientOrderId,
    status: mapOrderStatus(
      asString(order.state),
      executedQuantity,
      requestedQuantity || executedQuantity + remainingQuantity,
    ),
    requestedQuantity:
      requestedQuantity || executedQuantity + remainingQuantity,
    executedQuantity,
    requestedQuoteNotional,
    executedQuoteNotional,
    averageFillPrice,
    feesPaid:
      trades.length > 0
        ? trades.reduce((sum, trade) => sum + trade.fee, 0)
        : paidFee,
    createdAt: asString(order.created_at) ?? fallbackCreatedAt,
    updatedAt:
      asString(order.updated_at ?? order.created_at) ?? fallbackCreatedAt,
    trades,
    exchangeOrderId: asString(order.order_id ?? order.uuid),
  };
}

function buildOrderRecord(
  intent: OrderIntent,
  exchangeOrder: NormalizedExchangeOrder,
): OrderRecord {
  return {
    orderId: exchangeOrder.clientOrderId,
    signalId: intent.signalId,
    market: intent.market,
    side: intent.side,
    mode: "live",
    status: exchangeOrder.status,
    requestedQuantity:
      exchangeOrder.requestedQuantity > 0
        ? exchangeOrder.requestedQuantity
        : intent.requestedQuantity,
    executedQuantity: exchangeOrder.executedQuantity,
    requestedQuoteNotional:
      exchangeOrder.requestedQuoteNotional > 0
        ? exchangeOrder.requestedQuoteNotional
        : intent.requestedQuoteNotional,
    executedQuoteNotional: exchangeOrder.executedQuoteNotional,
    limitPrice: intent.limitPrice,
    averageFillPrice: exchangeOrder.averageFillPrice,
    feesPaid: exchangeOrder.feesPaid,
    createdAt: exchangeOrder.createdAt,
    updatedAt: exchangeOrder.updatedAt,
    reduceOnly: intent.reduceOnly,
    simulated: false,
  };
}

function buildFillRecords(
  intent: OrderIntent,
  exchangeOrder: NormalizedExchangeOrder,
): FillRecord[] {
  if (exchangeOrder.trades.length > 0) {
    return exchangeOrder.trades.map((trade) => ({
      fillId: trade.id,
      orderId: exchangeOrder.clientOrderId,
      signalId: intent.signalId,
      market: intent.market,
      side: intent.side,
      quantity: trade.quantity,
      price: trade.price,
      quoteNotional: trade.quoteNotional,
      feesPaid: trade.fee,
      occurredAt: trade.occurredAt,
      simulated: false,
    }));
  }

  if (
    exchangeOrder.executedQuantity <= 0 ||
    exchangeOrder.averageFillPrice === null
  ) {
    return [];
  }

  return [
    {
      fillId: `${exchangeOrder.clientOrderId}-synthetic-fill`,
      orderId: exchangeOrder.clientOrderId,
      signalId: intent.signalId,
      market: intent.market,
      side: intent.side,
      quantity: exchangeOrder.executedQuantity,
      price: exchangeOrder.averageFillPrice,
      quoteNotional: exchangeOrder.executedQuoteNotional,
      feesPaid: exchangeOrder.feesPaid,
      occurredAt: exchangeOrder.updatedAt,
      simulated: false,
    },
  ];
}

function normalizeAccountsResponse(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw.map((entry) => asRecord(entry, "account"));
  }

  const record = asRecord(raw, "accounts response");
  if (Array.isArray(record.data)) {
    return record.data.map((entry) => asRecord(entry, "account"));
  }

  throw new Error("unexpected accounts response shape");
}

function ensureSufficientAccountState(
  intent: OrderIntent,
  accountsRaw: unknown,
): void {
  const accounts = normalizeAccountsResponse(accountsRaw);
  const [, baseCurrencyRaw] = intent.market.split("-");
  const baseCurrency = baseCurrencyRaw?.toUpperCase();
  if (!baseCurrency) {
    throw new Error(`live preflight failed: invalid market ${intent.market}`);
  }

  let krwAvailable = 0;
  let baseAvailable = 0;

  for (const account of accounts) {
    const currency = asString(account.currency)?.toUpperCase();
    if (!currency) {
      continue;
    }

    if (currency === "KRW") {
      krwAvailable = asNumber(account.balance);
    }

    if (currency === baseCurrency) {
      baseAvailable = asNumber(account.balance);
    }
  }

  const requiredKrw =
    intent.side === "buy"
      ? Number(formatLimitPrice(intent)) *
        intent.requestedQuantity *
        (1 + LIVE_BUY_FEE_RESERVE_RATE)
      : 0;

  if (intent.side === "buy" && krwAvailable + 1 < requiredKrw) {
    throw new Error("live preflight failed: KRW balance is below fee-reserved order cost");
  }

  if (intent.side === "sell" && baseAvailable + 1e-10 < intent.requestedQuantity) {
    throw new Error(
      `live preflight failed: ${baseCurrency} balance is below requested sell quantity`,
    );
  }
}

function ensureChanceResponse(intent: OrderIntent, raw: unknown): void {
  const chance = asRecord(raw, "order chance response");
  const market =
    asString(chance.market_id) ??
    asString(chance.market);

  if (market && market !== intent.market) {
    throw new Error(
      `live preflight failed: order chance market mismatch (${market} !== ${intent.market})`,
    );
  }
}

function krwTickSize(price: number): number {
  if (price < 1) {
    return 0.0001;
  }
  if (price < 10) {
    return 0.001;
  }
  if (price < 100) {
    return 0.01;
  }
  if (price < 5_000) {
    return 1;
  }
  if (price < 10_000) {
    return 5;
  }
  if (price < 50_000) {
    return 10;
  }
  if (price < 100_000) {
    return 50;
  }
  if (price < 500_000) {
    return 100;
  }
  if (price < 1_000_000) {
    return 500;
  }
  return 1_000;
}

function formatLimitPrice(intent: OrderIntent): string {
  if (!Number.isFinite(intent.limitPrice) || intent.limitPrice <= 0) {
    throw new Error("live preflight failed: limit price must be a positive finite number");
  }

  const [quoteCurrency] = intent.market.split("-");
  if (quoteCurrency !== "KRW") {
    return Math.round(intent.limitPrice).toString();
  }

  const tick = krwTickSize(intent.limitPrice);
  const scaled = intent.limitPrice / tick;
  const normalized =
    intent.side === "buy"
      ? Math.ceil(scaled - 1e-12) * tick
      : Math.floor(scaled + 1e-12) * tick;

  const decimals = tick >= 1 ? 0 : tick.toString().split(".")[1]?.length ?? 0;
  return normalized.toFixed(decimals);
}

export class BithumbLiveVenue implements ExecutionVenue {
  private readonly clock: () => Date;
  private readonly pollAttempts: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly options: CreateBithumbLiveVenueOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.pollAttempts = options.pollAttempts ?? 6;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_500;
  }

  private async getLatestOrder(
    orderId: string,
    fallbackCreatedAt: string,
  ): Promise<NormalizedExchangeOrder> {
    return normalizeOrderResponse(
      await this.options.client.getOrder(orderId),
      orderId,
      fallbackCreatedAt,
    );
  }

  private async pollUntilTerminal(
    orderId: string,
    fallbackCreatedAt: string,
    initial?: NormalizedExchangeOrder,
  ): Promise<NormalizedExchangeOrder> {
    let latest =
      initial ?? (await this.getLatestOrder(orderId, fallbackCreatedAt));

    for (let attempt = initial ? 1 : 0; attempt < this.pollAttempts; attempt += 1) {
      if (isTerminalOrderStatus(latest.status)) {
        break;
      }

      await sleep(this.pollIntervalMs);
      latest = await this.getLatestOrder(orderId, fallbackCreatedAt);
    }

    return latest;
  }

  async submit(orderIntent: OrderIntent): Promise<ExecutionResult> {
    const createdAt = this.clock().toISOString();
    ensureSufficientAccountState(orderIntent, await this.options.client.getAccounts());
    ensureChanceResponse(orderIntent, await this.options.client.getOrderChance(orderIntent.market));

    await this.options.client.submitOrder({
      market: orderIntent.market,
      side: orderIntent.side === "buy" ? "bid" : "ask",
      price: formatLimitPrice(orderIntent),
      volume: orderIntent.requestedQuantity.toFixed(8),
      order_type: "limit",
      client_order_id: orderIntent.orderId,
    });

    const latest = await this.pollUntilTerminal(orderIntent.orderId, createdAt);

    return {
      order: buildOrderRecord(orderIntent, latest),
      fills: buildFillRecords(orderIntent, latest),
      warnings: latest.exchangeOrderId
        ? [`exchange_order_id:${latest.exchangeOrderId}`]
        : [],
    };
  }

  async cancel(
    orderId: string,
    _reason: string,
    cancelledAt: string,
  ): Promise<OrderRecord | null> {
    let cancelled;
    try {
      const cancelledRaw = await this.options.client.cancelOrder(orderId);
      cancelled = normalizeOrderResponse(cancelledRaw, orderId, cancelledAt);
      if (!isTerminalOrderStatus(cancelled.status)) {
        cancelled = await this.pollUntilTerminal(
          orderId,
          cancelled.createdAt,
          cancelled,
        );
      }
    } catch (error: unknown) {
      const recovered = await this.getLatestOrder(orderId, cancelledAt);
      if (!isTerminalOrderStatus(recovered.status)) {
        throw error;
      }
      cancelled = recovered;
    }

    return {
      orderId: cancelled.clientOrderId,
      signalId: "",
      market: "",
      side: "buy",
      mode: "live",
      status: cancelled.status,
      requestedQuantity: cancelled.requestedQuantity,
      executedQuantity: cancelled.executedQuantity,
      requestedQuoteNotional: cancelled.requestedQuoteNotional,
      executedQuoteNotional: cancelled.executedQuoteNotional,
      limitPrice: cancelled.averageFillPrice ?? 0,
      averageFillPrice: cancelled.averageFillPrice,
      feesPaid: cancelled.feesPaid,
      createdAt: cancelled.createdAt,
      updatedAt: cancelled.updatedAt,
      reduceOnly: false,
      simulated: false,
    };
  }
}
