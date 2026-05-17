# Agents Guidance

This repository prioritizes analysis quality over code volume.

## Core Rules

- Do not add code unless it directly improves measurement, strategy evaluation, or operational safety.
- Prefer analysis-first changes over speculative feature work.
- Minimize moving parts. If a simpler change can answer the same trading question, choose the simpler change.
- Avoid changing multiple strategy dimensions at once unless the goal is an explicit experiment matrix.

## Profitability Work

- Focus on whether a change can improve expectancy, not whether it merely changes reported PnL.
- Separate these concerns when analyzing results:
  - entry frequency
  - natural exit quality
  - synthetic pricing artifacts
  - risk and reconciliation failures
- Always compare against a clear baseline and state what variable changed.
- Do not treat reduced trading activity as proof of improved profitability.

## Strategy Research Memory

- As of 2026-05-17, the project is no longer locked to a BTC-only uptrend capture objective. New live candidates may come from BTC time-series momentum, KRW replacement momentum/reversal, cross-market signals, spot-perp carry, or another explicitly measured strategy family.
- Do not keep treating the legacy BTC `confirm3` / 15-second micro-momentum path as the default live candidate. Existing audits and stale validation artifacts show negative or insufficient traded PnL, 15-minute time-stop losses, and no reliable evidence that suppressed entries had positive expectancy. Positive BTC-excess readings can come from inactivity, open-position mark dependency, or carry-open artifacts; they are not tradable edge by themselves.
- Before starting new PM2 collection, replay or scan existing local/public evidence against a named baseline and document the one variable that changed. Reduced trade count is not a profitability improvement unless expectancy, drawdown, and benchmark-relative return also improve after realistic fees.
- A new strategy direction is acceptable only if the evidence separates entry frequency, natural exit quality, synthetic pricing artifacts, fees/spread/slippage, and operational reconciliation risk. If artifacts were deleted, state that readiness cannot be inferred and regenerate evidence rather than relying on memory.
- Durable handoff belongs in this file and `README.md` whenever the research objective changes, so future agents do not resume obsolete BTC/confirm3 assumptions.

## Code Quality

- Do not generate experimental knobs that are not being measured or actively used.
- Remove or avoid code paths that create optimistic pricing artifacts unless they are clearly labeled as sensitivity tests.
- Keep defaults realistic. Experimental behavior should be explicit, not hidden in the main path.
- Prefer reusable small modules only when they reduce complexity; do not modularize for its own sake.

## Verification

- Validate strategy changes on existing local evidence before starting a new data collection run.
- If a change affects reporting, verify that the reporting still measures the intended population.
- If a change can cause reconciliation mismatches, either make that explicit in the result or fail the run.
- Run available automated tests plus targeted scenario checks for affected trading paths.

## Operating Principle

The goal is not to produce more code. The goal is to find trustworthy ways to improve risk-adjusted returns and to keep the dry-run evidence honest enough that live-trading decisions are based on signal rather than artifacts.
