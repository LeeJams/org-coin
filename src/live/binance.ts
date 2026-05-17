import { createHmac } from "node:crypto";

import type {
  HedgedRelativeValueLeg,
  RelativeValueExecutionVenue,
  SubmittedRelativeValueOrder,
} from "../execution/cross-exchange-relative-value-live.js";
import type {
  SpotPerpCarryExecutionVenue,
  SpotPerpCarryLeg,
  SubmittedSpotPerpCarryOrder,
} from "../execution/spot-perp-carry-live.js";

type Primitive = string | number | boolean;

interface SignedRequestInput {
  method: "GET" | "POST" | "DELETE";
  path: string;
  params?: Record<string, Primitive>;
}

interface SignedJsonRequestInput extends SignedRequestInput {
  requestTimeoutMs: number;
}

export interface BinanceRequestSigner {
  signRestRequest(input: SignedRequestInput): {
    queryString: string;
    signature: string;
    timestamp: number;
  };
}

export interface BinancePrivateClient {
  getAccount(): Promise<unknown>;
  getCommission(symbol: string): Promise<unknown>;
  submitOrder(input: Record<string, Primitive>): Promise<unknown>;
  getOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }): Promise<unknown>;
  cancelOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }): Promise<unknown>;
}

export interface BinanceUsdMFuturesPrivateClient {
  getAccount(): Promise<unknown>;
  getCommissionRate(symbol: string): Promise<unknown>;
  submitOrder(input: Record<string, Primitive>): Promise<unknown>;
  getOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }): Promise<unknown>;
  cancelOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }): Promise<unknown>;
}

export interface CreateBinanceRequestSignerOptions {
  secretKey: string;
  now?: () => number;
  recvWindowMs?: number;
}

export interface CreateBinancePrivateClientOptions extends CreateBinanceRequestSignerOptions {
  apiKey: string;
  restBaseUrl: string;
  requestTimeoutMs?: number;
}

export interface CreateBinanceUsdMFuturesPrivateClientOptions
  extends CreateBinanceRequestSignerOptions {
  apiKey: string;
  restBaseUrl: string;
  requestTimeoutMs?: number;
}

export interface CreateBinanceRelativeValueVenueOptions {
  client: BinancePrivateClient;
  quoteToKrw: number;
  quantityDecimals?: number;
  priceDecimals?: number;
  clientOrderIdFactory?: (leg: HedgedRelativeValueLeg) => string;
}

export interface CreateBinanceUsdMFuturesSpotPerpCarryVenueOptions {
  client: BinanceUsdMFuturesPrivateClient;
  quoteToKrw: number;
  quantityDecimals?: number;
  priceDecimals?: number;
  clientOrderIdFactory?: (leg: SpotPerpCarryLeg) => string;
}

export function buildBinanceCanonicalQuery(
  input: Record<string, Primitive> | undefined,
): string {
  const params = new URLSearchParams();
  if (!input) return params.toString();

  for (const [key, value] of Object.entries(input)) {
    params.append(key, String(value));
  }
  return params.toString();
}

export function createBinanceRequestSigner(
  options: CreateBinanceRequestSignerOptions,
): BinanceRequestSigner {
  const now = options.now ?? (() => Date.now());
  const recvWindowMs = options.recvWindowMs ?? 5000;

  return {
    signRestRequest(input) {
      const timestamp = now();
      const queryString = buildBinanceCanonicalQuery({
        ...(input.params ?? {}),
        recvWindow: recvWindowMs,
        timestamp,
      });
      const signature = createHmac("sha256", options.secretKey)
        .update(queryString)
        .digest("hex");

      return { queryString, signature, timestamp };
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function errorMessage(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const record = payload as Record<string, unknown>;
  return typeof record.msg === "string" && record.msg.trim().length > 0
    ? record.msg
    : undefined;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function performSignedRequest(
  baseUrl: string,
  apiKey: string,
  signer: BinanceRequestSigner,
  input: SignedJsonRequestInput,
): Promise<unknown> {
  const signed = signer.signRestRequest(input);
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${input.path}`);
  url.search = `${signed.queryString}&signature=${signed.signature}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        "X-MBX-APIKEY": apiKey,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `binance ${input.method} ${input.path} timed out after ${input.requestTimeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `binance ${input.method} ${input.path} failed (${response.status}): ${
        errorMessage(payload) ?? response.statusText
      }`,
    );
  }

  return payload;
}

export function createBinancePrivateClient(
  options: CreateBinancePrivateClientOptions,
): BinancePrivateClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const signer = createBinanceRequestSigner({
    secretKey: options.secretKey,
    now: options.now,
    recvWindowMs: options.recvWindowMs,
  });

  return {
    getAccount() {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "GET",
        path: "/api/v3/account",
        requestTimeoutMs,
      });
    },
    getCommission(symbol: string) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "GET",
        path: "/api/v3/account/commission",
        params: { symbol },
        requestTimeoutMs,
      });
    },
    submitOrder(input: Record<string, Primitive>) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "POST",
        path: "/api/v3/order",
        params: input,
        requestTimeoutMs,
      });
    },
    getOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "GET",
        path: "/api/v3/order",
        params: compactOrderReference(input),
        requestTimeoutMs,
      });
    },
    cancelOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "DELETE",
        path: "/api/v3/order",
        params: compactOrderReference(input),
        requestTimeoutMs,
      });
    },
  };
}

export function createBinanceUsdMFuturesPrivateClient(
  options: CreateBinanceUsdMFuturesPrivateClientOptions,
): BinanceUsdMFuturesPrivateClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const signer = createBinanceRequestSigner({
    secretKey: options.secretKey,
    now: options.now,
    recvWindowMs: options.recvWindowMs,
  });

  return {
    getAccount() {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "GET",
        path: "/fapi/v2/account",
        requestTimeoutMs,
      });
    },
    getCommissionRate(symbol: string) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "GET",
        path: "/fapi/v1/commissionRate",
        params: { symbol },
        requestTimeoutMs,
      });
    },
    submitOrder(input: Record<string, Primitive>) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "POST",
        path: "/fapi/v1/order",
        params: input,
        requestTimeoutMs,
      });
    },
    getOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "GET",
        path: "/fapi/v1/order",
        params: compactOrderReference(input),
        requestTimeoutMs,
      });
    },
    cancelOrder(input: { symbol: string; orderId?: string; origClientOrderId?: string }) {
      return performSignedRequest(options.restBaseUrl, options.apiKey, signer, {
        method: "DELETE",
        path: "/fapi/v1/order",
        params: compactOrderReference(input),
        requestTimeoutMs,
      });
    },
  };
}

function compactOrderReference(input: {
  symbol: string;
  orderId?: string;
  origClientOrderId?: string;
}): Record<string, Primitive> {
  if (!input.orderId && !input.origClientOrderId) {
    throw new Error("binance order reference requires orderId or origClientOrderId");
  }

  return {
    symbol: input.symbol,
    ...(input.orderId ? { orderId: input.orderId } : {}),
    ...(input.origClientOrderId ? { origClientOrderId: input.origClientOrderId } : {}),
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function formatDecimal(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("binance order quantity and price must be positive finite numbers");
  }
  return value.toFixed(decimals);
}

function assertBinanceNativeQuote(leg: HedgedRelativeValueLeg, quoteToKrw: number): void {
  if (leg.limitPriceCurrency !== "USDT") {
    throw new Error("binance relative-value leg limitPriceCurrency must be USDT");
  }
  if (leg.market.endsWith("USDT") && leg.limitPrice >= 1_000_000) {
    throw new Error("binance relative-value leg price is not in the native quote currency");
  }
  if (!Number.isFinite(leg.quoteToKrw) || leg.quoteToKrw <= 0) {
    throw new Error("binance relative-value leg requires quoteToKrw");
  }
  const quoteMismatch = Math.abs(leg.quoteToKrw - quoteToKrw) / quoteToKrw;
  if (quoteMismatch > 0.001) {
    throw new Error("binance relative-value leg quoteToKrw does not match the venue conversion rate");
  }

  const nativeNotionalKrw = leg.limitPrice * leg.quantity * quoteToKrw;
  const notionalMismatch = Math.abs(nativeNotionalKrw - leg.notionalKrw) / leg.notionalKrw;
  if (!Number.isFinite(notionalMismatch) || notionalMismatch > 0.01) {
    throw new Error("binance relative-value leg price is not in the native quote currency");
  }
}

function mapBinanceOrderStatus(status: string | undefined): SubmittedRelativeValueOrder["status"] {
  if (status === "FILLED") return "filled";
  if (status === "PARTIALLY_FILLED") return "partially_filled";
  if (status === "NEW") return "open";
  if (status === "CANCELED" || status === "EXPIRED") return "cancelled";
  if (status === "REJECTED") return "rejected";
  return "accepted";
}

function normalizeBinanceOrder(
  raw: unknown,
  symbol: string,
  quoteToKrw: number,
): SubmittedRelativeValueOrder {
  const order = asRecord(raw, "binance order response");
  const orderId = String(order.orderId ?? order.clientOrderId ?? "");
  if (!orderId) throw new Error("binance order response did not include an order id");

  const executedQuantity = asNumber(order.executedQty);
  const quoteQuantity = asNumber(
    order.cummulativeQuoteQty ?? order.cumulativeQuoteQty,
    asNumber(order.price) * executedQuantity,
  );

  return {
    orderId: `${symbol}:${orderId}`,
    status: mapBinanceOrderStatus(asString(order.status)),
    executedQuantity,
    executedNotionalKrw: quoteQuantity * quoteToKrw,
  };
}

function splitBinanceOrderId(orderId: string): { symbol: string; orderId: string } {
  const separator = orderId.indexOf(":");
  if (separator <= 0 || separator === orderId.length - 1) {
    throw new Error("binance relative-value order id must be formatted as SYMBOL:ORDER_ID");
  }

  return {
    symbol: orderId.slice(0, separator),
    orderId: orderId.slice(separator + 1),
  };
}

export function createBinanceRelativeValueVenue(
  options: CreateBinanceRelativeValueVenueOptions,
): RelativeValueExecutionVenue {
  const quantityDecimals = options.quantityDecimals ?? 6;
  const priceDecimals = options.priceDecimals ?? 2;
  const clientOrderIdFactory =
    options.clientOrderIdFactory ??
    ((leg: HedgedRelativeValueLeg) => `rv-${leg.side}-${Date.now()}`);

  if (!Number.isFinite(options.quoteToKrw) || options.quoteToKrw <= 0) {
    throw new Error("quoteToKrw must be a positive finite number");
  }

  return {
    async submitLimitOrder(leg) {
      assertBinanceNativeQuote(leg, options.quoteToKrw);
      const response = await options.client.submitOrder({
        symbol: leg.market,
        side: leg.side.toUpperCase(),
        type: "LIMIT",
        timeInForce: "IOC",
        quantity: formatDecimal(leg.quantity, quantityDecimals),
        price: formatDecimal(leg.limitPrice, priceDecimals),
        newClientOrderId: clientOrderIdFactory(leg),
        newOrderRespType: "RESULT",
      });

      return normalizeBinanceOrder(response, leg.market, options.quoteToKrw);
    },
    async cancelOrder(orderId) {
      const parsed = splitBinanceOrderId(orderId);
      await options.client.cancelOrder(parsed);
    },
  };
}

function assertBinanceUsdMFuturesCarryLeg(leg: SpotPerpCarryLeg, quoteToKrw: number): void {
  if (leg.venue !== "binance_usdm") {
    throw new Error("Binance USD-M carry venue can only execute binance_usdm legs");
  }
  if (leg.side !== "sell") {
    throw new Error("spot-perp carry Binance USD-M leg must be a sell/short leg");
  }
  if (leg.limitPriceCurrency !== "USDT") {
    throw new Error("spot-perp carry Binance USD-M leg limitPriceCurrency must be USDT");
  }
  if (leg.market.endsWith("USDT") && leg.limitPrice >= 1_000_000) {
    throw new Error("spot-perp carry Binance USD-M leg price is not in the native quote currency");
  }
  if (!Number.isFinite(leg.quoteToKrw) || leg.quoteToKrw <= 0) {
    throw new Error("spot-perp carry Binance USD-M leg requires quoteToKrw");
  }
  const quoteMismatch = Math.abs(leg.quoteToKrw - quoteToKrw) / quoteToKrw;
  if (quoteMismatch > 0.001) {
    throw new Error("spot-perp carry Binance USD-M leg quoteToKrw does not match the venue conversion rate");
  }
}

function normalizeBinanceFuturesOrder(
  raw: unknown,
  symbol: string,
  quoteToKrw: number,
): SubmittedSpotPerpCarryOrder {
  const order = asRecord(raw, "binance futures order response");
  const orderId = String(order.orderId ?? order.clientOrderId ?? "");
  if (!orderId) throw new Error("binance futures order response did not include an order id");

  const executedQuantity = asNumber(order.executedQty);
  const averagePrice = asNumber(order.avgPrice, asNumber(order.price));
  const quoteQuantity = asNumber(
    order.cumQuote ?? order.cummulativeQuoteQty ?? order.cumulativeQuoteQty,
    averagePrice * executedQuantity,
  );

  return {
    orderId: `${symbol}:${orderId}`,
    status: mapBinanceOrderStatus(asString(order.status)),
    executedQuantity,
    executedNotionalKrw: quoteQuantity * quoteToKrw,
  };
}

export function createBinanceUsdMFuturesSpotPerpCarryVenue(
  options: CreateBinanceUsdMFuturesSpotPerpCarryVenueOptions,
): SpotPerpCarryExecutionVenue {
  const quantityDecimals = options.quantityDecimals ?? 6;
  const priceDecimals = options.priceDecimals ?? 6;
  const clientOrderIdFactory =
    options.clientOrderIdFactory ??
    ((leg: SpotPerpCarryLeg) => `spc-${leg.side}-${Date.now()}`);

  if (!Number.isFinite(options.quoteToKrw) || options.quoteToKrw <= 0) {
    throw new Error("quoteToKrw must be a positive finite number");
  }

  return {
    async submitLimitOrder(leg) {
      assertBinanceUsdMFuturesCarryLeg(leg, options.quoteToKrw);
      const response = await options.client.submitOrder({
        symbol: leg.market,
        side: "SELL",
        type: "LIMIT",
        timeInForce: "IOC",
        quantity: formatDecimal(leg.quantity, quantityDecimals),
        price: formatDecimal(leg.limitPrice, priceDecimals),
        newClientOrderId: clientOrderIdFactory(leg),
        newOrderRespType: "RESULT",
      });

      return normalizeBinanceFuturesOrder(response, leg.market, options.quoteToKrw);
    },
    async cancelOrder(orderId) {
      const parsed = splitBinanceOrderId(orderId);
      await options.client.cancelOrder(parsed);
    },
  };
}
