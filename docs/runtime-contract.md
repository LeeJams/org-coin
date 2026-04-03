# Runtime Contract

Live trading is intentionally disabled in this repo. Any future live execution work should supply secrets through environment variables or a secret store only.

## Required mode flags

- `TRADING_MODE`: `dry_run`, `paper`, or `live`
- `ENABLE_LIVE_EXECUTION`: must remain `false` until a dedicated live rollout issue enables it

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

None of these secrets or runtime values should be stored in source, Paperclip issue bodies, or plan documents.
