# PM2 Managed Dry Run

This repo now includes a managed `dry_run` service for collecting repeatable public-market evidence without enabling live execution.

## What the service does

Each cycle runs:

1. `python -m org_coin_data bootstrap`
2. `python -m org_coin_data build-session-scenario`
3. `dry_run` execution through `dist/src/cli/run-paper-session.js`

The result is three layers of evidence:

- PM2 stdout/stderr under `var/log/pm2/`
- One structured NDJSON summary per completed or failed cycle at `var/log/dry-run-service/cycles.ndjson`
- Normal replay/session artifacts under `var/data/replay/` and `var/paper-sessions/`

## Commands

Run one cycle locally:

```bash
npm run dry-run:service -- --once
```

Start the continuous PM2-managed loop:

```bash
npm run pm2:start:dry-run
```

Inspect status:

```bash
npm run pm2:status:dry-run
```

Tail logs:

```bash
npm run pm2:logs:dry-run
```

Stop the loop:

```bash
npm run pm2:stop:dry-run
```

Clean generated local build and runtime logs:

```bash
npm run clean:artifacts
```

If you also want to wipe generated paper-session outputs, run:

```bash
npm run clean:paper-sessions
```

Both commands intentionally leave `var/data/` intact so replay and strategy datasets are not deleted by routine cleanup.

## Configuration

The service reads `.env` plus process env. If `.env` is missing, run `npm run env:init` once or just use the PM2 start/restart commands, which now create the local file from `.env.example` automatically when needed.

The main knobs are:

- `DRY_RUN_ENTRY_PROFILE`
- `DRY_RUN_LOOP_INTERVAL_SECONDS`
- `DRY_RUN_INITIAL_CASH_KRW`
- `DRY_RUN_LOG_DIR`
- `DRY_RUN_PYTHON_BIN`
- `DRY_RUN_MARKETS`
- `DRY_RUN_WS_SECONDS`
- `DRY_RUN_TRADE_WARMUP_SECONDS`

`TRADING_MODE=paper` can remain the repo default. The managed service forces `dry_run` for its own session execution path.
