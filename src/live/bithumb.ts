import { createHash, createHmac, randomUUID } from "node:crypto";

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
import type {
  BithumbPrivateClient,
  BithumbRequestSigner,
} from "./contracts.js";

type Primitive = string | number | boolean;

interface CreateBithumbRequestSignerOptions {
  accessKey: string;
  secretKey: string;
  now?: () => number;
  nonceFactory?: () => string;
}

interface JsonRequestOptions {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, Primitive>;
  body?: Record<string, Primitive>;
  requestTimeoutMs: number;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function buildCanonicalQuery(
  input: Record<string, Primitive> | undefined,
): string {
  const params = new URLSearchParams();
  if (!input) {
    return params.toString();
  }

  // Bithumb validates query_hash against the request parameter sequence.
  // Preserve caller-provided field order so POST body hashing matches the JSON body.
  for (const [key, value] of Object.entries(input)) {
    params.append(key, String(value));
  }
  return params.toString();
}

function buildJwtToken(
  payload: Record<string, string | number>,
  secretKey: string,
): string {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secretKey)
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function createBithumbRequestSigner(
  options: CreateBithumbRequestSignerOptions,
): BithumbRequestSigner {
  const now = options.now ?? (() => Date.now());
  const nonceFactory = options.nonceFactory ?? (() => randomUUID());

  return {
    signRestRequest(input) {
      const timestamp = now();
      const nonce = nonceFactory();
      const signedParams = input.body ?? input.query;
      const queryString = buildCanonicalQuery(signedParams);
      const payload: Record<string, string | number> = {
        access_key: options.accessKey,
        nonce,
        timestamp,
      };

      let queryHash: string | undefined;
      if (queryString.length > 0) {
        queryHash = createHash("sha512").update(queryString, "utf8").digest("hex");
        payload.query_hash = queryHash;
        payload.query_hash_alg = "SHA512";
      }

      return {
        authorizationHeader: `Bearer ${buildJwtToken(payload, options.secretKey)}`,
        nonce,
        timestamp,
        queryHash,
      };
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return trimmed.replace(/\/v[0-9]+(?:\.[0-9]+)?$/u, "");
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim().length > 0) {
    return record.message;
  }

  const error = record.error;
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const errorRecord = error as Record<string, unknown>;
  if (
    typeof errorRecord.message === "string" &&
    errorRecord.message.trim().length > 0
  ) {
    return errorRecord.message;
  }

  if (typeof errorRecord.name === "string" && errorRecord.name.trim().length > 0) {
    return errorRecord.name;
  }

  return undefined;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function performJsonRequest(
  baseUrl: string,
  signer: BithumbRequestSigner,
  input: JsonRequestOptions,
): Promise<unknown> {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${input.path}`);
  if (input.query) {
    url.search = buildCanonicalQuery(input.query);
  }

  const signed = signer.signRestRequest(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: signed.authorizationHeader,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `bithumb ${input.method} ${input.path} timed out after ${input.requestTimeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `bithumb ${input.method} ${input.path} failed (${response.status}): ${
        extractErrorMessage(payload) ?? response.statusText
      }`,
    );
  }

  const errorMessage = extractErrorMessage(payload);
  if (errorMessage) {
    throw new Error(`bithumb ${input.method} ${input.path} error: ${errorMessage}`);
  }

  return payload;
}

export interface CreateBithumbPrivateClientOptions {
  accessKey: string;
  secretKey: string;
  restBaseUrl: string;
  now?: () => number;
  nonceFactory?: () => string;
  requestTimeoutMs?: number;
}

export function createBithumbPrivateClient(
  options: CreateBithumbPrivateClientOptions,
): BithumbPrivateClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const signer = createBithumbRequestSigner({
    accessKey: options.accessKey,
    secretKey: options.secretKey,
    now: options.now,
    nonceFactory: options.nonceFactory,
  });

  return {
    getAccounts() {
      return performJsonRequest(options.restBaseUrl, signer, {
        method: "GET",
        path: "/v1/accounts",
        requestTimeoutMs,
      });
    },
    getOrderChance(market: string) {
      return performJsonRequest(options.restBaseUrl, signer, {
        method: "GET",
        path: "/v1/orders/chance",
        query: { market },
        requestTimeoutMs,
      });
    },
    submitOrder(input: unknown) {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new Error("submitOrder input must be a JSON object");
      }

      return performJsonRequest(options.restBaseUrl, signer, {
        method: "POST",
        path: "/v2/orders",
        body: input as Record<string, Primitive>,
        requestTimeoutMs,
      });
    },
    getOrder(orderId: string) {
      return performJsonRequest(options.restBaseUrl, signer, {
        method: "GET",
        path: "/v1/order",
        query: { client_order_id: orderId },
        requestTimeoutMs,
      });
    },
    cancelOrder(orderId: string) {
      return performJsonRequest(options.restBaseUrl, signer, {
        method: "DELETE",
        path: "/v2/order",
        query: { client_order_id: orderId },
        requestTimeoutMs,
      });
    },
  };
}

export interface CreateBithumbRelativeValueVenueOptions {
  client: BithumbPrivateClient;
  clientOrderIdFactory?: (leg: HedgedRelativeValueLeg) => string;
}

export interface CreateBithumbSpotPerpCarryVenueOptions {
  client: BithumbPrivateClient;
  clientOrderIdFactory?: (leg: SpotPerpCarryLeg) => string;
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

function mapBithumbRelativeValueOrderStatus(
  state: string | undefined,
  executedQuantity: number,
  requestedQuantity: number,
): SubmittedRelativeValueOrder["status"] {
  if (state === "done" || state === "filled") return "filled";
  if (state === "cancel" || state === "cancelled") return "cancelled";
  if (state === "rejected") return "rejected";
  if (executedQuantity > 0 && requestedQuantity > 0 && executedQuantity < requestedQuantity) {
    return "partially_filled";
  }
  if (state === "wait" || state === "watch" || state === "open") return "open";
  if (requestedQuantity > 0 && executedQuantity >= requestedQuantity) return "filled";
  return "accepted";
}

function normalizeRelativeValueOrder(
  raw: unknown,
  fallbackOrderId: string,
): SubmittedRelativeValueOrder {
  const order = asRecord(raw, "bithumb order response");
  const orderId =
    asString(order.client_order_id) ??
    asString(order.order_id) ??
    asString(order.uuid) ??
    fallbackOrderId;
  const requestedQuantity = asNumber(order.volume);
  const executedQuantity = asNumber(order.executed_volume);
  const price = asNumber(order.price);
  const executedNotionalKrw = asNumber(
    order.executed_funds,
    price > 0 && executedQuantity > 0 ? price * executedQuantity : 0,
  );

  return {
    orderId,
    status: mapBithumbRelativeValueOrderStatus(
      asString(order.state),
      executedQuantity,
      requestedQuantity,
    ),
    executedQuantity,
    executedNotionalKrw,
  };
}

function normalizeSpotPerpCarryOrder(
  raw: unknown,
  fallbackOrderId: string,
): SubmittedSpotPerpCarryOrder {
  return normalizeRelativeValueOrder(raw, fallbackOrderId);
}

function formatPositiveDecimal(value: number, decimals: number, label: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value.toFixed(decimals);
}

function assertKrwQuoteLeg(leg: {
  limitPriceCurrency: string;
  quoteToKrw: number;
}): void {
  if (leg.limitPriceCurrency !== "KRW") {
    throw new Error("bithumb relative-value leg limitPriceCurrency must be KRW");
  }
  if (!Number.isFinite(leg.quoteToKrw) || leg.quoteToKrw !== 1) {
    throw new Error("bithumb relative-value leg must use KRW quote pricing");
  }
}

export function createBithumbRelativeValueVenue(
  options: CreateBithumbRelativeValueVenueOptions,
): RelativeValueExecutionVenue {
  const clientOrderIdFactory =
    options.clientOrderIdFactory ??
    ((leg: HedgedRelativeValueLeg) => `rv-${leg.side}-${Date.now()}`);

  return {
    async submitLimitOrder(leg) {
      assertKrwQuoteLeg(leg);
      const orderId = clientOrderIdFactory(leg);
      await options.client.submitOrder({
        market: leg.market,
        side: leg.side === "buy" ? "bid" : "ask",
        price: formatPositiveDecimal(leg.limitPrice, 0, "bithumb limit price"),
        volume: formatPositiveDecimal(leg.quantity, 8, "bithumb quantity"),
        order_type: "limit",
        client_order_id: orderId,
      });

      return normalizeRelativeValueOrder(await options.client.getOrder(orderId), orderId);
    },
    async cancelOrder(orderId) {
      await options.client.cancelOrder(orderId);
    },
  };
}

export function createBithumbSpotPerpCarryVenue(
  options: CreateBithumbSpotPerpCarryVenueOptions,
): SpotPerpCarryExecutionVenue {
  const clientOrderIdFactory =
    options.clientOrderIdFactory ??
    ((leg: SpotPerpCarryLeg) => `spc-${leg.side}-${Date.now()}`);

  return {
    async submitLimitOrder(leg) {
      assertKrwQuoteLeg(leg);
      if (leg.side !== "buy") {
        throw new Error("spot-perp carry Bithumb leg must be a buy leg");
      }
      const orderId = clientOrderIdFactory(leg);
      await options.client.submitOrder({
        market: leg.market,
        side: "bid",
        price: formatPositiveDecimal(leg.limitPrice, 0, "bithumb limit price"),
        volume: formatPositiveDecimal(leg.quantity, 8, "bithumb quantity"),
        order_type: "limit",
        client_order_id: orderId,
      });

      return normalizeSpotPerpCarryOrder(await options.client.getOrder(orderId), orderId);
    },
    async cancelOrder(orderId) {
      await options.client.cancelOrder(orderId);
    },
  };
}
