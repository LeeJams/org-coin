# Runtime Contract

Live trading is intentionally disabled in this repo. Any future live execution work should supply secrets through environment variables or a secret store only.

`src/runtime/config.ts` is the code entrypoint for this contract. It merges `.env` and `process.env`, keeps paper-safe defaults when optional safety values are unset, and fails fast if live execution is enabled.

## Required mode flags

- `TRADING_MODE`: `dry_run`, `paper`, or `live`
- `ENABLE_LIVE_EXECUTION`: must remain `false` until a dedicated live rollout issue enables it

Current enforced behavior:

- `TRADING_MODE=live` throws at startup
- `ENABLE_LIVE_EXECUTION=true` throws at startup

## Future live-secret contract

- `BITHUMB_ACCESS_KEY`
- `BITHUMB_SECRET_KEY`
- `BITHUMB_REST_BASE_URL`
- `BITHUMB_WS_BASE_URL`

## Operational safety inputs

- `MAX_DAILY_LOSS_KRW`
- `MAX_ORDER_NOTIONAL_KRW`
- `MAX_POSITION_NOTIONAL_KRW`
- `DATA_STALE_AFTER_MS`
- `KILL_SWITCH_REJECT_STREAK`

Current paper-runner semantics:

- `MAX_DAILY_LOSS_KRW`, `MAX_ORDER_NOTIONAL_KRW`, `DATA_STALE_AFTER_MS`, and `KILL_SWITCH_REJECT_STREAK` fall back to built-in paper defaults when unset
- `MAX_POSITION_NOTIONAL_KRW=0` keeps the built-in per-market paper caps; any positive value overrides all market caps uniformly

None of these secrets or runtime values should be stored in source, Paperclip issue bodies, or plan documents.
