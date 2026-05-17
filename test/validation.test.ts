import test from "node:test";
import assert from "node:assert/strict";

import { validateMarketSnapshot } from "../src/contracts/market-snapshot.js";
import { validateSignalIntent } from "../src/contracts/signal-intent.js";

test("validateSignalIntent rejects malformed payloads", () => {
  const result = validateSignalIntent({
    schemaVersion: "1.0.0",
    signalId: "",
    strategyId: "momentum-v1",
    market: "KRW-BTC",
    side: "buy",
    sizing: {
      basis: "quote_notional",
      value: -1,
    },
    confidence: 2,
    generatedAt: "invalid-date",
    expiresAt: "2026-04-02T12:00:00.000Z",
    maxSlippageBps: 0,
    reasonCodes: [],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.ok(result.issues.some((issue) => issue.path === "signalId"));
  assert.ok(result.issues.some((issue) => issue.path === "sizing.value"));
  assert.ok(result.issues.some((issue) => issue.path === "confidence"));
});

test("validators accept one-character Bithumb base symbols", () => {
  const signal = validateSignalIntent({
    schemaVersion: "1.0.0",
    signalId: "krw-h-signal",
    strategyId: "krw_h_60m_momentum_top_candidate_v1",
    market: "KRW-H",
    side: "buy",
    sizing: {
      basis: "quote_notional",
      value: 500_000,
    },
    confidence: 0.6,
    generatedAt: "2026-05-13T11:00:00.000Z",
    expiresAt: "2026-05-13T11:10:00.000Z",
    maxSlippageBps: 8,
    reasonCodes: ["SIGNAL_MOMENTUM"],
  });
  const snapshot = validateMarketSnapshot({
    market: "KRW-H",
    asOf: "2026-05-13T11:00:00.000Z",
    lastTradePrice: 363,
    bestBidPrice: 362,
    bestAskPrice: 363,
    bestBidSize: 1000,
    bestAskSize: 1000,
    spreadBps: 27.624309,
    depthRatio: 2,
    rolling24hNotional: 15_000_000_000,
  });

  assert.equal(signal.ok, true);
  assert.equal(snapshot.ok, true);
});
