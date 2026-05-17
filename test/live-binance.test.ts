import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBinanceCanonicalQuery,
  createBinancePrivateClient,
  createBinanceRelativeValueVenue,
  createBinanceRequestSigner,
  createBinanceUsdMFuturesPrivateClient,
  createBinanceUsdMFuturesSpotPerpCarryVenue,
} from "../src/index.js";

test("createBinanceRequestSigner matches the official HMAC example", () => {
  const signer = createBinanceRequestSigner({
    secretKey: "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j",
    now: () => 1_499_827_319_559,
    recvWindowMs: 5000,
  });

  const signed = signer.signRestRequest({
    method: "POST",
    path: "/api/v3/order",
    params: {
      symbol: "LTCBTC",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: 1,
      price: 0.1,
    },
  });

  assert.equal(
    signed.queryString,
    "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559",
  );
  assert.equal(
    signed.signature,
    "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71",
  );
});

test("createBinancePrivateClient signs order submission with the API key header", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestUrl: URL | undefined;
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input, init) => {
    requestUrl = new URL(
      input instanceof URL
        ? input.toString()
        : typeof input === "string"
          ? input
          : input.url,
    );
    requestInit = init;

    return new Response(
      JSON.stringify({
        symbol: "BTCUSDT",
        orderId: 123,
        status: "FILLED",
        executedQty: "0.00100000",
        cummulativeQuoteQty: "120.00",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = createBinancePrivateClient({
    apiKey: "api-key",
    secretKey: "secret-key",
    restBaseUrl: "https://api.binance.com",
    now: () => 1_775_000_000_000,
  });

  const response = await client.submitOrder({
    symbol: "BTCUSDT",
    side: "BUY",
    type: "LIMIT",
    timeInForce: "IOC",
    quantity: "0.001000",
    price: "120000.00",
    newOrderRespType: "RESULT",
  });
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestInit?.method, "POST");
  assert.equal(requestUrl?.origin, "https://api.binance.com");
  assert.equal(requestUrl?.pathname, "/api/v3/order");
  assert.equal(requestUrl?.searchParams.get("symbol"), "BTCUSDT");
  assert.equal(requestUrl?.searchParams.get("timeInForce"), "IOC");
  assert.equal(requestUrl?.searchParams.has("signature"), true);
  assert.equal(headers.get("x-mbx-apikey"), "api-key");
  assert.deepEqual(response, {
    symbol: "BTCUSDT",
    orderId: 123,
    status: "FILLED",
    executedQty: "0.00100000",
    cummulativeQuoteQty: "120.00",
  });
});

test("createBinanceUsdMFuturesPrivateClient signs USD-M futures order submission", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestUrl: URL | undefined;
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input, init) => {
    requestUrl = new URL(
      input instanceof URL
        ? input.toString()
        : typeof input === "string"
          ? input
          : input.url,
    );
    requestInit = init;

    return new Response(
      JSON.stringify({
        symbol: "PIEVERSEUSDT",
        orderId: 321,
        status: "FILLED",
        executedQty: "100.000000",
        cumQuote: "37.80",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = createBinanceUsdMFuturesPrivateClient({
    apiKey: "api-key",
    secretKey: "secret-key",
    restBaseUrl: "https://fapi.binance.com",
    now: () => 1_775_000_000_000,
  });

  await client.submitOrder({
    symbol: "PIEVERSEUSDT",
    side: "SELL",
    type: "LIMIT",
    timeInForce: "IOC",
    quantity: "100.000000",
    price: "0.378000",
    newOrderRespType: "RESULT",
  });
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestInit?.method, "POST");
  assert.equal(requestUrl?.origin, "https://fapi.binance.com");
  assert.equal(requestUrl?.pathname, "/fapi/v1/order");
  assert.equal(requestUrl?.searchParams.get("symbol"), "PIEVERSEUSDT");
  assert.equal(requestUrl?.searchParams.get("side"), "SELL");
  assert.equal(requestUrl?.searchParams.has("signature"), true);
  assert.equal(headers.get("x-mbx-apikey"), "api-key");
});

test("createBinanceUsdMFuturesPrivateClient times out stalled private requests", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const signal = init?.signal;
    assert.ok(signal instanceof AbortSignal);
    return await new Promise<Response>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        { once: true },
      );
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = createBinanceUsdMFuturesPrivateClient({
    apiKey: "api-key",
    secretKey: "secret-key",
    restBaseUrl: "https://fapi.binance.com",
    requestTimeoutMs: 5,
  });

  await assert.rejects(
    () => client.getAccount(),
    /binance GET \/fapi\/v2\/account timed out after 5ms/u,
  );
});

test("createBinanceRelativeValueVenue submits IOC limit orders and normalizes fills", async () => {
  let submitted: Record<string, string | number | boolean> | undefined;
  const venue = createBinanceRelativeValueVenue({
    quoteToKrw: 1473.05,
    clientOrderIdFactory: () => "client-1",
    client: {
      async getAccount() {
        return {};
      },
      async getCommission() {
        return {};
      },
      async submitOrder(input) {
        submitted = input;
        return {
          symbol: "BTCUSDT",
          orderId: 42,
          status: "FILLED",
          executedQty: "0.000283",
          cummulativeQuoteQty: "33.94317911815621",
        };
      },
      async getOrder() {
        return {};
      },
      async cancelOrder() {
        return {};
      },
    },
  });

  const order = await venue.submitLimitOrder({
    venue: "binance",
    market: "BTCUSDT",
    side: "buy",
    limitPrice: 120_000,
    limitPriceCurrency: "USDT",
    quantity: 50_000 / (120_000 * 1473.05),
    notionalKrw: 50_000,
    quoteToKrw: 1473.05,
    feeBps: 10,
  });

  assert.deepEqual(submitted, {
    symbol: "BTCUSDT",
    side: "BUY",
    type: "LIMIT",
    timeInForce: "IOC",
    quantity: "0.000283",
    price: "120000.00",
    newClientOrderId: "client-1",
    newOrderRespType: "RESULT",
  });
  assert.equal(order.orderId, "BTCUSDT:42");
  assert.equal(order.status, "filled");
  assert.equal(order.executedQuantity, 0.000283);
  assert.equal(order.executedNotionalKrw, 50_000);
});

test("createBinanceRelativeValueVenue rejects KRW-translated limit prices", async () => {
  const venue = createBinanceRelativeValueVenue({
    quoteToKrw: 1473.05,
    client: {
      async getAccount() {
        return {};
      },
      async getCommission() {
        return {};
      },
      async submitOrder() {
        throw new Error("should not submit");
      },
      async getOrder() {
        return {};
      },
      async cancelOrder() {
        return {};
      },
    },
  });

  await assert.rejects(
    () =>
      venue.submitLimitOrder({
        venue: "binance",
        market: "BTCUSDT",
        side: "buy",
        limitPrice: 119_100_000,
        limitPriceCurrency: "USDT",
        quantity: 50_000 / (119_100_000 * 1473.05),
        notionalKrw: 50_000,
        quoteToKrw: 1473.05,
        feeBps: 10,
      }),
    /native quote currency/,
  );
});

test("createBinanceRelativeValueVenue cancels by encoded symbol and order id", async () => {
  const cancelled: Array<{ symbol: string; orderId?: string }> = [];
  const venue = createBinanceRelativeValueVenue({
    quoteToKrw: 1473.05,
    client: {
      async getAccount() {
        return {};
      },
      async getCommission() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder() {
        return {};
      },
      async cancelOrder(input) {
        cancelled.push(input);
        return {};
      },
    },
  });

  await venue.cancelOrder("BTCUSDT:42", "paired leg failed");

  assert.deepEqual(cancelled, [{ symbol: "BTCUSDT", orderId: "42" }]);
});

test("createBinanceUsdMFuturesSpotPerpCarryVenue submits IOC short and normalizes cumQuote", async () => {
  let submitted: Record<string, string | number | boolean> | undefined;
  const venue = createBinanceUsdMFuturesSpotPerpCarryVenue({
    quoteToKrw: 1473.05,
    clientOrderIdFactory: () => "spc-binance-1",
    client: {
      async getAccount() {
        return {};
      },
      async getCommissionRate() {
        return {};
      },
      async submitOrder(input) {
        submitted = input;
        return {
          symbol: "PIEVERSEUSDT",
          orderId: 42,
          status: "FILLED",
          executedQty: "100.000000",
          cumQuote: "37.800000",
        };
      },
      async getOrder() {
        return {};
      },
      async cancelOrder() {
        return {};
      },
    },
  });

  const order = await venue.submitLimitOrder({
    venue: "binance_usdm",
    market: "PIEVERSEUSDT",
    side: "sell",
    limitPrice: 0.378,
    limitPriceCurrency: "USDT",
    quantity: 100,
    notionalKrw: 55_681.29,
    quoteToKrw: 1473.05,
    feeBps: 5,
  });

  assert.deepEqual(submitted, {
    symbol: "PIEVERSEUSDT",
    side: "SELL",
    type: "LIMIT",
    timeInForce: "IOC",
    quantity: "100.000000",
    price: "0.378000",
    newClientOrderId: "spc-binance-1",
    newOrderRespType: "RESULT",
  });
  assert.equal(order.orderId, "PIEVERSEUSDT:42");
  assert.equal(order.status, "filled");
  assert.equal(order.executedQuantity, 100);
  assert.equal(Number(order.executedNotionalKrw.toFixed(6)), 55_681.29);
});

test("createBinanceUsdMFuturesSpotPerpCarryVenue cancels by encoded symbol and order id", async () => {
  const cancelled: Array<{ symbol: string; orderId?: string }> = [];
  const venue = createBinanceUsdMFuturesSpotPerpCarryVenue({
    quoteToKrw: 1473.05,
    client: {
      async getAccount() {
        return {};
      },
      async getCommissionRate() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder() {
        return {};
      },
      async cancelOrder(input) {
        cancelled.push(input);
        return {};
      },
    },
  });

  await venue.cancelOrder("PIEVERSEUSDT:42", "paired leg failed");

  assert.deepEqual(cancelled, [{ symbol: "PIEVERSEUSDT", orderId: "42" }]);
});

test("buildBinanceCanonicalQuery preserves field order for signing", () => {
  assert.equal(
    buildBinanceCanonicalQuery({
      symbol: "BTCUSDT",
      side: "SELL",
      quantity: "0.001",
    }),
    "symbol=BTCUSDT&side=SELL&quantity=0.001",
  );
});
