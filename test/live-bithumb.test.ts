import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  BithumbLiveVenue,
  buildCanonicalQuery,
  createBithumbPrivateClient,
  createBithumbRelativeValueVenue,
  createBithumbRequestSigner,
  createBithumbSpotPerpCarryVenue,
} from "../src/index.js";

test("buildCanonicalQuery preserves input field order", () => {
  assert.equal(
    buildCanonicalQuery({
      market: "KRW-BTC",
      side: "bid",
      price: 100,
    }),
    "market=KRW-BTC&side=bid&price=100",
  );
});

test("createBithumbRequestSigner adds a SHA512 query hash for POST bodies", () => {
  const signer = createBithumbRequestSigner({
    accessKey: "access-key",
    secretKey: "secret-key",
    now: () => 1_775_000_000_000,
    nonceFactory: () => "nonce-1",
  });

  const signed = signer.signRestRequest({
    method: "POST",
    path: "/v2/orders",
    body: {
      market: "KRW-BTC",
      side: "bid",
      price: "100000000",
      volume: "0.00100000",
      order_type: "limit",
      client_order_id: "client-order-1",
    },
  });

  const expectedQuery = buildCanonicalQuery({
    market: "KRW-BTC",
    side: "bid",
    price: "100000000",
    volume: "0.00100000",
    order_type: "limit",
    client_order_id: "client-order-1",
  });

  assert.equal(
    signed.queryHash,
    createHash("sha512").update(expectedQuery, "utf8").digest("hex"),
  );
  assert.match(signed.authorizationHeader, /^Bearer /u);
});

test("createBithumbRequestSigner adds a SHA512 query hash for DELETE queries", () => {
  const signer = createBithumbRequestSigner({
    accessKey: "access-key",
    secretKey: "secret-key",
    now: () => 1_775_000_000_000,
    nonceFactory: () => "nonce-delete-1",
  });

  const signed = signer.signRestRequest({
    method: "DELETE",
    path: "/v2/order",
    query: {
      client_order_id: "client-order-cancel-1",
    },
  });

  const expectedQuery = buildCanonicalQuery({
    client_order_id: "client-order-cancel-1",
  });

  assert.equal(
    signed.queryHash,
    createHash("sha512").update(expectedQuery, "utf8").digest("hex"),
  );
  assert.match(signed.authorizationHeader, /^Bearer /u);
});

test("createBithumbPrivateClient cancels with DELETE /v2/order and client_order_id", async (t) => {
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

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = createBithumbPrivateClient({
    accessKey: "access-key",
    secretKey: "secret-key",
    restBaseUrl: "https://api.bithumb.com/v1",
    now: () => 1_775_000_000_000,
    nonceFactory: () => "nonce-cancel-1",
  });

  const response = await client.cancelOrder("client-order-cancel-1");
  const headers = new Headers(requestInit?.headers);

  assert.deepEqual(response, { status: "ok" });
  assert.equal(requestInit?.method, "DELETE");
  assert.equal(requestInit?.body, undefined);
  assert.equal(requestUrl?.origin, "https://api.bithumb.com");
  assert.equal(requestUrl?.pathname, "/v2/order");
  assert.deepEqual(Array.from(requestUrl?.searchParams.entries() ?? []), [
    ["client_order_id", "client-order-cancel-1"],
  ]);
  assert.match(headers.get("authorization") ?? "", /^Bearer /u);
  assert.equal(headers.get("content-type"), null);
});

test("createBithumbPrivateClient times out stalled private requests", async (t) => {
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

  const client = createBithumbPrivateClient({
    accessKey: "access-key",
    secretKey: "secret-key",
    restBaseUrl: "https://api.bithumb.com",
    requestTimeoutMs: 5,
  });

  await assert.rejects(
    () => client.getAccounts(),
    /bithumb GET \/v1\/accounts timed out after 5ms/u,
  );
});

test("BithumbLiveVenue maps exchange order status and fills from client_order_id flow", async () => {
  let submittedOrder: unknown;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    pollAttempts: 1,
    client: {
      async getAccounts() {
        return [
          { currency: "KRW", balance: "1000000", locked: "0" },
          { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
        ];
      },
      async getOrderChance() {
        return { market_id: "KRW-BTC" };
      },
      async submitOrder(input: unknown) {
        submittedOrder = input;
        return { ok: true };
      },
      async getOrder(orderId: string) {
        assert.equal(orderId, "client-order-1");
        return {
          client_order_id: "client-order-1",
          state: "done",
          price: "100000000",
          volume: "0.001",
          executed_volume: "0.001",
          paid_fee: "50",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:01.000Z",
          trades: [
            {
              trade_id: "trade-1",
              price: "100000000",
              volume: "0.001",
              funds: "100000",
              fee: "50",
              created_at: "2026-04-16T12:00:01.000Z",
            },
          ],
        };
      },
      async cancelOrder() {
        return null;
      },
    },
  });

  const result = await venue.submit({
    orderId: "client-order-1",
    signalId: "signal-1",
    strategyId: "strategy-1",
    market: "KRW-BTC",
    side: "buy",
    mode: "live",
    requestedQuantity: 0.001,
    requestedQuoteNotional: 100_000,
    referencePrice: 100_000_000,
    limitPrice: 100_000_000,
    maxSlippageBps: 5,
    reduceOnly: false,
    createdAt: "2026-04-16T12:00:00.000Z",
    expiresAt: "2026-04-16T12:01:00.000Z",
    confidence: 0.8,
    reasonCodes: ["test"],
    marketSnapshot: {
      market: "KRW-BTC",
      asOf: "2026-04-16T12:00:00.000Z",
      lastTradePrice: 100_000_000,
      bestBidPrice: 99_990_000,
      bestAskPrice: 100_010_000,
      bestBidSize: 1,
      bestAskSize: 1,
      spreadBps: 2,
      depthRatio: 1.2,
      rolling24hNotional: 500_000_000_000,
    },
  });

  assert.equal(result.order.orderId, "client-order-1");
  assert.equal(result.order.status, "filled");
  assert.equal(result.order.executedQuantity, 0.001);
  assert.equal(result.fills.length, 1);
  assert.equal(result.fills[0]?.quoteNotional, 100_000);
  assert.equal(result.order.simulated, false);
  assert.deepEqual(submittedOrder, {
    market: "KRW-BTC",
    side: "bid",
    price: "100000000",
    volume: "0.00100000",
    order_type: "limit",
    client_order_id: "client-order-1",
  });
});

test("createBithumbRelativeValueVenue submits limit orders and normalizes fills", async () => {
  let submittedOrder: unknown;
  const venue = createBithumbRelativeValueVenue({
    clientOrderIdFactory: () => "rv-bithumb-1",
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder(input: unknown) {
        submittedOrder = input;
        return { ok: true };
      },
      async getOrder(orderId: string) {
        assert.equal(orderId, "rv-bithumb-1");
        return {
          client_order_id: "rv-bithumb-1",
          state: "done",
          price: "120000000",
          volume: "0.00041667",
          executed_volume: "0.00041667",
          executed_funds: "50000.4",
        };
      },
      async cancelOrder() {
        return {};
      },
    },
  });

  const order = await venue.submitLimitOrder({
    venue: "bithumb",
    market: "KRW-BTC",
    side: "sell",
    limitPrice: 120_000_000,
    limitPriceCurrency: "KRW",
    quantity: 0.00041667,
    notionalKrw: 50_000,
    quoteToKrw: 1,
    feeBps: 4,
  });

  assert.deepEqual(submittedOrder, {
    market: "KRW-BTC",
    side: "ask",
    price: "120000000",
    volume: "0.00041667",
    order_type: "limit",
    client_order_id: "rv-bithumb-1",
  });
  assert.equal(order.orderId, "rv-bithumb-1");
  assert.equal(order.status, "filled");
  assert.equal(order.executedQuantity, 0.00041667);
  assert.equal(order.executedNotionalKrw, 50000.4);
});

test("createBithumbRelativeValueVenue forwards cancel requests", async () => {
  const cancelled: string[] = [];
  const venue = createBithumbRelativeValueVenue({
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder() {
        return {};
      },
      async cancelOrder(orderId: string) {
        cancelled.push(orderId);
        return {};
      },
    },
  });

  await venue.cancelOrder("rv-bithumb-1", "paired leg failed");

  assert.deepEqual(cancelled, ["rv-bithumb-1"]);
});

test("createBithumbSpotPerpCarryVenue submits spot buy and normalizes fills", async () => {
  let submittedOrder: unknown;
  const venue = createBithumbSpotPerpCarryVenue({
    clientOrderIdFactory: () => "spc-bithumb-1",
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder(input: unknown) {
        submittedOrder = input;
        return { ok: true };
      },
      async getOrder(orderId: string) {
        assert.equal(orderId, "spc-bithumb-1");
        return {
          client_order_id: "spc-bithumb-1",
          state: "done",
          price: "550",
          volume: "909.09090909",
          executed_volume: "909.09090909",
          executed_funds: "500000",
        };
      },
      async cancelOrder() {
        return {};
      },
    },
  });

  const order = await venue.submitLimitOrder({
    venue: "bithumb",
    market: "KRW-PIEVERSE",
    side: "buy",
    limitPrice: 550,
    limitPriceCurrency: "KRW",
    quantity: 909.09090909,
    notionalKrw: 500_000,
    quoteToKrw: 1,
    feeBps: 4,
  });

  assert.deepEqual(submittedOrder, {
    market: "KRW-PIEVERSE",
    side: "bid",
    price: "550",
    volume: "909.09090909",
    order_type: "limit",
    client_order_id: "spc-bithumb-1",
  });
  assert.equal(order.orderId, "spc-bithumb-1");
  assert.equal(order.status, "filled");
  assert.equal(order.executedQuantity, 909.09090909);
  assert.equal(order.executedNotionalKrw, 500_000);
});

test("BithumbLiveVenue aligns KRW buy prices to the next valid tick", async () => {
  let submittedOrder: unknown;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    pollAttempts: 1,
    client: {
      async getAccounts() {
        return [
          { currency: "KRW", balance: "1000000", locked: "0" },
          { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
        ];
      },
      async getOrderChance() {
        return { market_id: "KRW-BTC" };
      },
      async submitOrder(input: unknown) {
        submittedOrder = input;
        return { ok: true };
      },
      async getOrder() {
        return {
          client_order_id: "client-order-2",
          state: "done",
          price: "113253000",
          volume: "0.00053770",
          executed_volume: "0.00053770",
          paid_fee: "0",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:01.000Z",
        };
      },
      async cancelOrder() {
        return null;
      },
    },
  });

  await venue.submit({
    orderId: "client-order-2",
    signalId: "signal-2",
    strategyId: "strategy-1",
    market: "KRW-BTC",
    side: "buy",
    mode: "live",
    requestedQuantity: 0.0005377,
    requestedQuoteNotional: 60_896.491,
    referencePrice: 113_185_000,
    limitPrice: 113_252_911,
    maxSlippageBps: 6,
    reduceOnly: false,
    createdAt: "2026-04-16T12:00:00.000Z",
    expiresAt: "2026-04-16T12:01:00.000Z",
    confidence: 0.82,
    reasonCodes: ["test"],
    marketSnapshot: {
      market: "KRW-BTC",
      asOf: "2026-04-16T12:00:00.000Z",
      lastTradePrice: 113_169_000,
      bestBidPrice: 113_169_000,
      bestAskPrice: 113_185_000,
      bestBidSize: 1,
      bestAskSize: 1,
      spreadBps: 2,
      depthRatio: 1.2,
      rolling24hNotional: 500_000_000_000,
    },
  });

  assert.deepEqual(submittedOrder, {
    market: "KRW-BTC",
    side: "bid",
    price: "113253000",
    volume: "0.00053770",
    order_type: "limit",
    client_order_id: "client-order-2",
  });
});

test("BithumbLiveVenue reserves buy fee and tick-rounded cost before submitting", async () => {
  let submitted = false;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    client: {
      async getAccounts() {
        return [
          { currency: "KRW", balance: "100000", locked: "0" },
          { currency: "BTC", balance: "0", locked: "0", avg_buy_price: "0" },
        ];
      },
      async getOrderChance() {
        return { market_id: "KRW-BTC" };
      },
      async submitOrder() {
        submitted = true;
        return { ok: true };
      },
      async getOrder() {
        return {};
      },
      async cancelOrder() {
        return null;
      },
    },
  });

  await assert.rejects(
    venue.submit({
      orderId: "client-order-fee-buffer",
      signalId: "signal-fee-buffer",
      strategyId: "strategy-1",
      market: "KRW-BTC",
      side: "buy",
      mode: "live",
      requestedQuantity: 0.001,
      requestedQuoteNotional: 100_000,
      referencePrice: 100_000_000,
      limitPrice: 100_000_000,
      maxSlippageBps: 5,
      reduceOnly: false,
      createdAt: "2026-04-16T12:00:00.000Z",
      expiresAt: "2026-04-16T12:01:00.000Z",
      confidence: 0.8,
      reasonCodes: ["test"],
      marketSnapshot: {
        market: "KRW-BTC",
        asOf: "2026-04-16T12:00:00.000Z",
        lastTradePrice: 100_000_000,
        bestBidPrice: 99_990_000,
        bestAskPrice: 100_010_000,
        bestBidSize: 1,
        bestAskSize: 1,
        spreadBps: 2,
        depthRatio: 1.2,
        rolling24hNotional: 500_000_000_000,
      },
    }),
    /fee-reserved order cost/u,
  );
  assert.equal(submitted, false);
});

test("BithumbLiveVenue checks sell balance using the market base currency", async () => {
  let submitted = false;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    client: {
      async getAccounts() {
        return [
          { currency: "KRW", balance: "0", locked: "0" },
          { currency: "BTC", balance: "10", locked: "0", avg_buy_price: "100000000" },
          { currency: "PIEVERSE", balance: "1", locked: "0", avg_buy_price: "1200" },
        ];
      },
      async getOrderChance() {
        return { market_id: "KRW-PIEVERSE" };
      },
      async submitOrder() {
        submitted = true;
        return { ok: true };
      },
      async getOrder() {
        return {};
      },
      async cancelOrder() {
        return null;
      },
    },
  });

  await assert.rejects(
    venue.submit({
      orderId: "client-order-pieverse-sell",
      signalId: "signal-pieverse-sell",
      strategyId: "strategy-1",
      market: "KRW-PIEVERSE",
      side: "sell",
      mode: "live",
      requestedQuantity: 2,
      requestedQuoteNotional: 2_400,
      referencePrice: 1_200,
      limitPrice: 1_200,
      maxSlippageBps: 5,
      reduceOnly: true,
      createdAt: "2026-04-16T12:00:00.000Z",
      expiresAt: "2026-04-16T12:01:00.000Z",
      confidence: 0.8,
      reasonCodes: ["test"],
      marketSnapshot: {
        market: "KRW-PIEVERSE",
        asOf: "2026-04-16T12:00:00.000Z",
        lastTradePrice: 1_200,
        bestBidPrice: 1_199,
        bestAskPrice: 1_201,
        bestBidSize: 1_000,
        bestAskSize: 1_000,
        spreadBps: 16,
        depthRatio: 1.2,
        rolling24hNotional: 6_000_000_000,
      },
    }),
    /PIEVERSE balance is below requested sell quantity/u,
  );
  assert.equal(submitted, false);
});

test("BithumbLiveVenue aligns KRW sell prices to the previous valid tick", async () => {
  let submittedOrder: unknown;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    pollAttempts: 1,
    client: {
      async getAccounts() {
        return [
          { currency: "KRW", balance: "0", locked: "0" },
          { currency: "BTC", balance: "0.001", locked: "0", avg_buy_price: "113000000" },
        ];
      },
      async getOrderChance() {
        return { market_id: "KRW-BTC" };
      },
      async submitOrder(input: unknown) {
        submittedOrder = input;
        return { ok: true };
      },
      async getOrder() {
        return {
          client_order_id: "client-order-3",
          state: "done",
          price: "113101000",
          volume: "0.00050000",
          executed_volume: "0.00050000",
          paid_fee: "0",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:01.000Z",
        };
      },
      async cancelOrder() {
        return null;
      },
    },
  });

  await venue.submit({
    orderId: "client-order-3",
    signalId: "signal-3",
    strategyId: "strategy-1",
    market: "KRW-BTC",
    side: "sell",
    mode: "live",
    requestedQuantity: 0.0005,
    requestedQuoteNotional: 56_550.5,
    referencePrice: 113_169_000,
    limitPrice: 113_101_099,
    maxSlippageBps: 6,
    reduceOnly: true,
    createdAt: "2026-04-16T12:00:00.000Z",
    expiresAt: "2026-04-16T12:01:00.000Z",
    confidence: 0.82,
    reasonCodes: ["test"],
    marketSnapshot: {
      market: "KRW-BTC",
      asOf: "2026-04-16T12:00:00.000Z",
      lastTradePrice: 113_169_000,
      bestBidPrice: 113_169_000,
      bestAskPrice: 113_185_000,
      bestBidSize: 1,
      bestAskSize: 1,
      spreadBps: 2,
      depthRatio: 1.2,
      rolling24hNotional: 500_000_000_000,
    },
  });

  assert.deepEqual(submittedOrder, {
    market: "KRW-BTC",
    side: "ask",
    price: "113101000",
    volume: "0.00050000",
    order_type: "limit",
    client_order_id: "client-order-3",
  });
});

test("BithumbLiveVenue.cancel confirms terminal state after cancel ack", async () => {
  let cancelCalls = 0;
  let getOrderCalls = 0;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder(orderId: string) {
        getOrderCalls += 1;
        assert.equal(orderId, "client-order-4");
        return {
          client_order_id: "client-order-4",
          state: "cancel",
          price: "100000000",
          volume: "0.00100000",
          executed_volume: "0",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:01.000Z",
        };
      },
      async cancelOrder(orderId: string) {
        cancelCalls += 1;
        assert.equal(orderId, "client-order-4");
        return {
          client_order_id: "client-order-4",
          state: "accepted",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:00.500Z",
        };
      },
    },
  });

  const cancelled = await venue.cancel(
    "client-order-4",
    "test_cancel",
    "2026-04-16T12:00:02.000Z",
  );

  assert.equal(cancelCalls, 1);
  assert.equal(getOrderCalls, 1);
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(cancelled?.orderId, "client-order-4");
});

test("BithumbLiveVenue.cancel preserves executed quantity for partially filled cancelled orders", async () => {
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder(orderId: string) {
        assert.equal(orderId, "client-order-4b");
        return {
          client_order_id: "client-order-4b",
          state: "cancel",
          price: "100000000",
          volume: "0.00200000",
          executed_volume: "0.00070000",
          remaining_volume: "0.00130000",
          paid_fee: "35",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:01.000Z",
        };
      },
      async cancelOrder(orderId: string) {
        assert.equal(orderId, "client-order-4b");
        return {
          client_order_id: "client-order-4b",
          state: "accepted",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:00.500Z",
        };
      },
    },
  });

  const cancelled = await venue.cancel(
    "client-order-4b",
    "test_cancel",
    "2026-04-16T12:00:02.000Z",
  );

  assert.equal(cancelled?.status, "cancelled");
  assert.equal(cancelled?.requestedQuantity, 0.002);
  assert.equal(cancelled?.executedQuantity, 0.0007);
  assert.equal(cancelled?.feesPaid, 35);
});

test("BithumbLiveVenue.cancel polls until an accepted cancel reaches a terminal state", async () => {
  let getOrderCalls = 0;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    pollAttempts: 3,
    pollIntervalMs: 0,
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder(orderId: string) {
        getOrderCalls += 1;
        assert.equal(orderId, "client-order-4c");
        if (getOrderCalls === 1) {
          return {
            client_order_id: "client-order-4c",
            state: "wait",
            price: "100000000",
            volume: "0.00100000",
            executed_volume: "0",
            created_at: "2026-04-16T12:00:00.000Z",
            updated_at: "2026-04-16T12:00:01.000Z",
          };
        }

        return {
          client_order_id: "client-order-4c",
          state: "cancel",
          price: "100000000",
          volume: "0.00100000",
          executed_volume: "0",
          remaining_volume: "0.00100000",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:02.000Z",
        };
      },
      async cancelOrder(orderId: string) {
        assert.equal(orderId, "client-order-4c");
        return {
          client_order_id: "client-order-4c",
          state: "accepted",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:00.500Z",
        };
      },
    },
  });

  const cancelled = await venue.cancel(
    "client-order-4c",
    "test_cancel",
    "2026-04-16T12:00:02.000Z",
  );

  assert.equal(getOrderCalls, 2);
  assert.equal(cancelled?.status, "cancelled");
});

test("BithumbLiveVenue.cancel rethrows when cancel auth fails and follow-up lookup is still open", async () => {
  let getOrderCalls = 0;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder(orderId: string) {
        getOrderCalls += 1;
        assert.equal(orderId, "client-order-5");
        return {
          client_order_id: "client-order-5",
          state: "wait",
          price: "100000000",
          volume: "0.00100000",
          executed_volume: "0",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:01.000Z",
        };
      },
      async cancelOrder() {
        throw new Error(
          "bithumb DELETE /v2/order failed (401): Jwt의 query를 검증하는데 실패하였습니다.",
        );
      },
    },
  });

  await assert.rejects(
    venue.cancel(
      "client-order-5",
      "test_cancel",
      "2026-04-16T12:00:02.000Z",
    ),
    /DELETE \/v2\/order failed \(401\)/u,
  );
  assert.equal(getOrderCalls, 1);
});

test("BithumbLiveVenue.cancel recovers when auth fails but the order is already terminally cancelled", async () => {
  let getOrderCalls = 0;
  const venue = new BithumbLiveVenue({
    clock: () => new Date("2026-04-16T12:00:00.000Z"),
    client: {
      async getAccounts() {
        return [];
      },
      async getOrderChance() {
        return {};
      },
      async submitOrder() {
        return {};
      },
      async getOrder(orderId: string) {
        getOrderCalls += 1;
        assert.equal(orderId, "client-order-5b");
        return {
          client_order_id: "client-order-5b",
          state: "cancel",
          price: "100000000",
          volume: "0.00100000",
          executed_volume: "0.00040000",
          remaining_volume: "0.00060000",
          created_at: "2026-04-16T12:00:00.000Z",
          updated_at: "2026-04-16T12:00:01.000Z",
        };
      },
      async cancelOrder() {
        throw new Error(
          "bithumb DELETE /v2/order failed (401): Jwt의 query를 검증하는데 실패하였습니다.",
        );
      },
    },
  });

  const cancelled = await venue.cancel(
    "client-order-5b",
    "test_cancel",
    "2026-04-16T12:00:02.000Z",
  );

  assert.equal(getOrderCalls, 1);
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(cancelled?.executedQuantity, 0.0004);
});
