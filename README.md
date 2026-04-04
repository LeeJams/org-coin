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

`bootstrap` prints three paths: the run-scoped replay manifest, the human-readable quality summary, and the passive-feature distribution summary for that same run.

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

The session runner auto-loads `.env` from the repo root when present, validates the scenario against the TypeScript-side paper-session contract, honors an optional deterministic `clockAt` replay timestamp, persists JSON/Markdown/NDJSON evidence under `var/paper-sessions/`, and exits with status `2` when reconciliation fails.

## Runtime and secret handling

This repository does not require exchange API credentials for the current paper-first scope.

- Future runtime inputs are documented in [`docs/runtime-contract.md`](docs/runtime-contract.md)
- Passive feature collection guidance lives in [`docs/passive-feature-collection.md`](docs/passive-feature-collection.md)
- Runtime loading lives in [`src/runtime/config.ts`](src/runtime/config.ts)
- Session input shape is documented in [`schemas/paper-session-scenario.schema.json`](schemas/paper-session-scenario.schema.json)
- Reject-ledger summary shape is documented in [`schemas/reject-ledger.schema.json`](schemas/reject-ledger.schema.json)
- NDJSON ledger event shape is documented in [`schemas/order-ledger-event.schema.json`](schemas/order-ledger-event.schema.json)
- A checked-in placeholder template lives in [`.env.example`](.env.example)
- Keep `BITHUMB_ACCESS_KEY` and `BITHUMB_SECRET_KEY` blank in the local `.env` while the repo remains paper-only
- Real `.env` files and any populated secret values must never be committed
