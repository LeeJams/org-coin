# org-coin

Public-market data ingestion and paper-trading execution primitives for the first Bithumb milestone.

Korean guide: [`README.ko.md`](README.ko.md)

The current repository is intentionally narrow:

- Bithumb public REST and public WebSocket only
- canonical datasets for strategy replay and execution simulation
- paper and dry-run execution contracts only
- file-backed storage with raw capture, normalized datasets, replay manifests, and observability records
- no live exchange execution and no committed exchange credentials

Live trading remains out of scope until a separate rollout explicitly enables it.

## Datasets

- `market_catalog`
- `candle_1m`
- `trade_tick`
- `ticker_event`
- `orderbook_snapshot`
- `orderbook_level`
- `passive_feature_snapshot`

## Repository layout

```text
contracts/      JSON schemas for the Python data plane
docs/           runtime and operating constraints
examples/       runnable paper-session scenarios
org_coin_data/  Python ingestion pipeline and CLI
plans/          shared planning documents
schemas/        TypeScript-side schemas
src/            TypeScript execution and validation primitives
test/           TypeScript tests
tests/          Python tests
```

## Storage layout

```text
var/data/
  raw/
    rest/<dataset>/date=YYYY-MM-DD/run=<run-id>.ndjson
    ws/<channel>/date=YYYY-MM-DD/market=<market>/run=<run-id>.ndjson
  canonical/
    <dataset>/date=YYYY-MM-DD/market=<market>/part-<run-id>.ndjson
  replay/
    manifests/manifest-<run-id>.json
    reports/
      passive-features-<run-id>.json
      passive-features-<run-id>.md
      quality-<run-id>.json
      quality-<run-id>.md
  observability/
    freshness_alert.ndjson
    gap_repair.ndjson
    schema_validation_counter.ndjson
var/paper-sessions/
  date=YYYY-MM-DD/
    session=<session-id>/
      report.json
      report.md
      ledger.ndjson
      reject-ledger.json
```

`market_catalog` is partitioned by `date` only.

## Quick start

Install the Python runtime dependency:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Install the TypeScript toolchain:

```bash
npm install
```

Bootstrap a paper-trading dataset for the default paper universe:

```bash
python -m org_coin_data bootstrap --ws-seconds 15
```

Run a longer reproducible capture session under one run id:

```bash
python -m org_coin_data bootstrap \
  --ws-seconds 20 \
  --iterations 6 \
  --interval-seconds 5
```

`bootstrap` preloads websocket trades for 60 seconds, enforces a replay-focused recent trade backfill floor, and prints four paths: the run-scoped replay manifest, the human-readable quality summary, the passive-feature distribution summary, and the preflight gate summary for that same run.

Build a replay manifest from the canonical store for one run:

```bash
python -m org_coin_data build-manifest --run-id <run-id>
```

Build a quality report again for an existing run:

```bash
python -m org_coin_data build-quality-report --run-id <run-id>
```

Rebuild the derived passive-feature dataset and distribution report for an existing run:

```bash
python -m org_coin_data build-passive-feature-report --run-id <run-id>
```

Build the preflight eligibility and freshness gate summary for an existing run:

```bash
python -m org_coin_data build-preflight-report --run-id <run-id>
```

Build a replayable session scenario from one captured run with KRW 1,000,000 starting cash:

```bash
python -m org_coin_data build-session-scenario \
  --run-id <run-id> \
  --initial-cash-krw 1000000
```

Record a manual gap-repair attempt:

```bash
python -m org_coin_data repair-gap \
  --dataset trade_tick \
  --market KRW-BTC \
  --start 2026-04-02T12:30:00Z \
  --end 2026-04-02T12:35:00Z
```

Run tests:

```bash
npm test
python -m unittest discover -s tests -v
```

Run the sample signal-to-order paper session:

```bash
npm run paper:session -- examples/paper-session.sample.json
```

Run a captured replay scenario in optimistic `dry_run` mode:

```bash
TRADING_MODE=dry_run npm run paper:session -- var/data/replay/scenarios/session-<run-id>.json
```

The session runner auto-loads `.env` from the repo root when present, validates the scenario against the TypeScript-side paper-session contract, honors an optional deterministic `clockAt` replay timestamp, persists JSON/Markdown/NDJSON evidence under `var/paper-sessions/`, and exits with status `2` when reconciliation fails. `dry_run` now fills at the reference price with no fee or liquidity impact, while `paper` remains the slippage- and fee-aware simulator.

Run one managed `dry_run` capture-to-session cycle locally:

```bash
npm run dry-run:service -- --once
```

Start the continuous `pm2`-managed `dry_run` loop:

```bash
npm run pm2:start:dry-run
```

The managed service runs `bootstrap -> build-session-scenario -> dry_run paper-session` in one loop, appends a structured cycle summary to `var/log/dry-run-service/cycles.ndjson`, keeps PM2 stdout/stderr in `var/log/pm2/`, and still writes the normal session artifacts under `var/paper-sessions/`.

## Runtime and secret handling

This repository does not require exchange API credentials for the current paper-first scope.

- Future runtime inputs are documented in [`docs/runtime-contract.md`](docs/runtime-contract.md)
- PM2 dry-run service operations live in [`docs/pm2-dry-run.md`](docs/pm2-dry-run.md)
- Passive feature collection guidance lives in [`docs/passive-feature-collection.md`](docs/passive-feature-collection.md)
- Local storage and analysis guidance lives in [`docs/local-storage-analysis.md`](docs/local-storage-analysis.md)
- Strategy research handoff and live-candidate interpretation live in [`AGENTS.md`](AGENTS.md) and [`docs/pm2-dry-run.md`](docs/pm2-dry-run.md). As of 2026-05-17, research is no longer locked to BTC-only uptrend capture, and legacy BTC `confirm3` / micro-momentum must not be resumed as the default live path without fresh evidence.
- Runtime loading lives in [`src/runtime/config.ts`](src/runtime/config.ts)
- Session input shape is documented in [`schemas/paper-session-scenario.schema.json`](schemas/paper-session-scenario.schema.json)
- Reject-ledger summary shape is documented in [`schemas/reject-ledger.schema.json`](schemas/reject-ledger.schema.json)
- NDJSON ledger event shape is documented in [`schemas/order-ledger-event.schema.json`](schemas/order-ledger-event.schema.json)
- A checked-in placeholder template lives in [`.env.example`](.env.example)
- Keep `BITHUMB_ACCESS_KEY` and `BITHUMB_SECRET_KEY` blank in the local `.env` while the repo remains paper-only
- Real `.env` files and any populated secret values must never be committed

## Current Research State

As of 2026-05-17, deleted `var/` artifacts mean recent paper readiness cannot be inferred from local runtime logs. Regenerate evidence before any live decision.

Retired baseline:

- BTC `confirm3` / 15-second micro-momentum is observation-only. Prior audits showed negative or insufficient traded PnL, time-stop losses, and no reliable suppressed-entry expectancy.
- BTC 240m momentum remains a historical reference path, not an automatic live candidate. It requires fresh realized paper exits, benchmark comparison, and readiness gates.

Allowed next strategy paths:

- Execution-clean multi-market time-series scans: change the variable from BTC-only to an executable KRW market universe, then require positive train/test medians, walk-forward robustness, realistic fees, and paper reconciliation before PM2 observation.
- Volatility breakout scans: use public Bithumb candles to test volatility contraction plus breakout/volume confirmation with 35-50 bps round-trip cost. Treat scan output as research evidence only until orderbook/paper validation exists.
- Spot-perp carry watch: keep it as measurement only unless completed funding-window economics remain positive after spot fee, perp fee, USDT/KRW conversion, depth, spreads, and exit buffer.

Useful commands:

```bash
npm run dry-run:analyze-volatility-breakout -- --top-markets 40 --unit-minutes 60 --max-candles 5000 --fee-round-trip-bps 50 --notional-krw 500000 --output var/reports/current-top40-60m-volatility-breakout-fee50-YYYYMMDD.json
npm run dry-run:analyze-bithumb-execution-universe
npm run dry-run:analyze-bithumb-momentum
npm run dry-run:discover-spot-perp-carry-current-carry
npm run dry-run:gate-all-running-paper-candidate
npm run dry-run:gate-all-running-live-ready
```
