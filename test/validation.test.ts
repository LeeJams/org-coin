import test from "node:test";
import assert from "node:assert/strict";

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
