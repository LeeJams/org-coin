import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  depthNotional,
  normalizeBithumbTickerTimestampMs,
  signalBlockReasons,
} from "../src/cli/observe-bithumb-reversal-candidate.js";

test("time-series forward observer accepts a zero minimum momentum threshold", () => {
  const result = spawnSync(
    process.execPath,
    [
      "dist/src/cli/observe-bithumb-reversal-candidate.js",
      "--market",
      "KRW-H",
      "--signal-mode",
      "momentum",
      "--min-return-bps",
      "0",
      "--unsupported-after-parse",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported argument: --unsupported-after-parse/);
  assert.doesNotMatch(result.stderr, /--min-return-bps must be a positive finite number/);
});

test("time-series forward observer measures executable VWAP depth", () => {
  const buyDepth = depthNotional(
    [
      { ask_price: 100, ask_size: 100, bid_price: 99, bid_size: 100 },
      { ask_price: 110, ask_size: 100, bid_price: 90, bid_size: 100 },
    ],
    "ask",
    15_500,
  );
  const sellDepth = depthNotional(
    [
      { ask_price: 100, ask_size: 100, bid_price: 99, bid_size: 100 },
      { ask_price: 110, ask_size: 100, bid_price: 90, bid_size: 100 },
    ],
    "bid",
    14_400,
  );

  assert.equal(buyDepth.coversRequestedNotional, true);
  assert.equal(buyDepth.levels, 2);
  assert.equal(buyDepth.worstPrice, 110);
  assert.equal(buyDepth.vwapPrice, 103.333333);
  assert.equal(buyDepth.slippageBps, 333.333333);

  assert.equal(sellDepth.coversRequestedNotional, true);
  assert.equal(sellDepth.levels, 2);
  assert.equal(sellDepth.worstPrice, 90);
  assert.equal(sellDepth.vwapPrice, 96);
  assert.equal(sellDepth.slippageBps, 312.5);
});

test("time-series forward observer normalizes Bithumb KST-shifted ticker timestamps", () => {
  const observedAt = Date.parse("2026-05-13T01:30:00.000Z");
  const rawKstShifted = observedAt + 9 * 60 * 60 * 1000 - 1_000;
  const normalized = normalizeBithumbTickerTimestampMs(rawKstShifted, observedAt);
  const alreadyUtc = normalizeBithumbTickerTimestampMs(observedAt - 2_000, observedAt);

  assert.equal(normalized.adjustedFromKstEpoch, true);
  assert.equal(normalized.timestampMs, observedAt - 1_000);
  assert.equal(alreadyUtc.adjustedFromKstEpoch, false);
  assert.equal(alreadyUtc.timestampMs, observedAt - 2_000);
});

test("time-series forward observer separates directional and risk-filter blockers", () => {
  assert.deepEqual(signalBlockReasons("momentum", true, false), ["risk_filter_failed"]);
  assert.deepEqual(signalBlockReasons("momentum", false, true), ["momentum_signal_inactive"]);
  assert.deepEqual(signalBlockReasons("reversal", false, false), [
    "reversal_signal_inactive",
    "risk_filter_failed",
  ]);
});
