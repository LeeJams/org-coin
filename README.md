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

## Repository layout

```text
contracts/      JSON schemas for the Python data plane
docs/           runtime and operating constraints
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
  observability/
    freshness_alert.ndjson
    gap_repair.ndjson
    schema_validation_counter.ndjson
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

Build a replay manifest from the canonical store:

```bash
python -m org_coin_data build-manifest
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

## Runtime and secret handling

This repository does not require exchange API credentials for the current paper-first scope.

- Future runtime inputs are documented in [`docs/runtime-contract.md`](docs/runtime-contract.md)
- A checked-in placeholder template lives in [`.env.example`](.env.example)
- Real `.env` files and any populated secret values must never be committed
