# Runtime Contract

Live trading is intentionally disabled in this repo. Any future live execution work should supply secrets through environment variables or a secret store only.

`src/runtime/config.ts` is the code entrypoint for this contract. It merges `.env` and `process.env`, keeps paper-safe defaults when optional safety values are unset, and fails fast if live execution is enabled.

## Required mode flags

- `TRADING_MODE`: `dry_run`, `paper`, or `live`
- `ENABLE_LIVE_EXECUTION`: must remain `false` until a dedicated live rollout issue enables it

Current enforced behavior:

- `TRADING_MODE=live` throws at startup
- `ENABLE_LIVE_EXECUTION=true` throws at startup
- Configured `BITHUMB_ACCESS_KEY` and `BITHUMB_SECRET_KEY` are ignored while live execution stays disabled
- `TRADING_MODE=dry_run` uses optimistic internal fills at the reference price with zero fee or liquidity impact
- `TRADING_MODE=paper` uses the slippage- and fee-aware simulator for more conservative replay estimates

## Future live-secret contract

- `BITHUMB_ACCESS_KEY`
- `BITHUMB_SECRET_KEY`
- `BITHUMB_REST_BASE_URL`
- `BITHUMB_WS_BASE_URL`

## Operational safety inputs

- `MAX_DAILY_LOSS_KRW`
- `MAX_ORDER_NOTIONAL_KRW`
- `MAX_POSITION_NOTIONAL_KRW`
- `MAX_POSITION_NOTIONAL_BY_MARKET_JSON`
- `DATA_STALE_AFTER_MS`
- `KILL_SWITCH_REJECT_STREAK`
- `PAPER_SESSION_ARTIFACTS_DIR`

Current paper-runner semantics:

- `MAX_DAILY_LOSS_KRW`, `MAX_ORDER_NOTIONAL_KRW`, `DATA_STALE_AFTER_MS`, and `KILL_SWITCH_REJECT_STREAK` fall back to built-in paper defaults when unset
- `MAX_POSITION_NOTIONAL_KRW=0` keeps the built-in per-market paper caps; any positive value overrides all market caps uniformly
- `MAX_POSITION_NOTIONAL_BY_MARKET_JSON` merges market-specific cap overrides on top of the default or global cap baseline
- `PAPER_SESSION_ARTIFACTS_DIR` controls where persisted session reports, reject ledgers, and NDJSON ledger evidence are written

## Managed dry_run service inputs

These values drive the `pm2`-managed `dry_run` loop in `dist/src/cli/run-dry-run-service.js`.

- `DRY_RUN_BASE_DIR`
- `DRY_RUN_ENTRY_PROFILE`
- `DRY_RUN_INITIAL_CASH_KRW`
- `DRY_RUN_LOOP_INTERVAL_SECONDS`
- `DRY_RUN_LOG_DIR`
- `DRY_RUN_CYCLE_LOG_FILE`
- `DRY_RUN_PYTHON_BIN`
- `DRY_RUN_MARKETS`
- `DRY_RUN_FRESHNESS_SLA_MS`
- `DRY_RUN_CANDLE_COUNT`
- `DRY_RUN_TRADE_COUNT`
- `DRY_RUN_WS_SECONDS`
- `DRY_RUN_TRADE_WARMUP_SECONDS`
- `DRY_RUN_BOOTSTRAP_ITERATIONS`
- `DRY_RUN_BOOTSTRAP_INTERVAL_SECONDS`
- `DRY_RUN_WS_CHANNELS`

Current managed-service semantics:

- The service captures public market data, builds a replay scenario, executes it in `dry_run`, and appends one structured summary line per cycle to `DRY_RUN_LOG_DIR/DRY_RUN_CYCLE_LOG_FILE`
- The PM2 ecosystem file also keeps stdout/stderr under `var/log/pm2/`
- `TRADING_MODE=paper` can remain the repo default in `.env`; the managed service forces `dry_run` for its own execution path
- Exchange secrets remain ignored because live execution is still disabled

For the current paper-only repo state, leave `BITHUMB_ACCESS_KEY` and `BITHUMB_SECRET_KEY` blank in the local `.env` file.

None of these secrets or runtime values should be stored in source, Paperclip issue bodies, or plan documents.
