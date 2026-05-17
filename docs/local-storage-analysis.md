# Local Storage And Analysis Guide

## What the repo already does well

The current layout is already close to a small local data lake:

- `var/data/raw/` keeps append-only REST and websocket payload envelopes
- `var/data/canonical/` keeps validated, dataset-specific NDJSON partitions
- `var/data/replay/` keeps manifests and derived reports for each run
- `var/data/observability/` keeps freshness alerts, repair records, and schema validation counters
- `var/log/dry-run-service/cycles.ndjson` keeps one structured row per managed dry-run cycle
- `var/paper-sessions/` keeps per-session JSON, Markdown, reject ledgers, and NDJSON ledger events

That split is a good foundation because raw capture, canonical facts, operational logs, and replay artifacts are already separated.

## Recommended local strategy

Use two storage layers instead of forcing one format to do everything:

1. Keep the current NDJSON files as the source of truth.
2. Add one local analytical database file for fast joins and aggregations.

Recommended analytical database:

- First choice: DuckDB at `var/analytics/org-coin.duckdb`
- Fallback: SQLite when you want zero extra dependencies and mainly summarize service/session metadata

Why this fits the current repo:

- NDJSON is easy to append from Python and Node
- partitioned paths by `date=` and `market=` are already query-friendly
- DuckDB can query NDJSON files directly without changing the capture path
- you can materialize only the hot summaries you care about, while cold raw data stays in files

## Suggested storage contract

Keep these directories and add one more:

```text
var/
  data/          append-only source of truth
  log/           service and PM2 logs
  paper-sessions/session evidence
  analytics/     local query engine files and derived marts
```

Suggested contents for `var/analytics/`:

```text
var/analytics/
  org-coin.duckdb
  marts/
    cycle_summary_daily.parquet
    market_quality_daily.parquet
    session_rejects.parquet
```

Use the analytical DB for:

- multi-run comparisons
- correlating freshness alerts with reject reasons
- daily and market-level summaries
- debugging which capture run produced a weak paper session

Keep raw/canonical NDJSON for:

- replay fidelity
- auditability
- schema evolution
- quick append-only writes from collectors

## What to analyze first

The highest-value joins in this repo are:

1. `canonical trade/ticker/orderbook` + `observability/freshness_alert`
2. `replay quality/preflight reports` + `dry-run-service cycles`
3. `dry-run-service cycles` + `paper session reject ledgers`

That gives you answers to questions like:

- which market produced the most stale-data alerts
- whether stale data correlates with reject streaks or suppressions
- which bootstrap runs led to good reconciliation and low reject counts
- whether a specific date partition or market partition is missing or too sparse

## DuckDB workflow

DuckDB is the most efficient local option here because it reads the existing files in place.

Example setup:

```sql
CREATE SCHEMA IF NOT EXISTS raw_files;
CREATE SCHEMA IF NOT EXISTS marts;

CREATE OR REPLACE VIEW raw_files.cycle_logs AS
SELECT *
FROM read_ndjson_auto('var/log/dry-run-service/*.ndjson');

CREATE OR REPLACE VIEW raw_files.freshness_alert AS
SELECT *
FROM read_ndjson_auto('var/data/observability/freshness_alert.ndjson');

CREATE OR REPLACE VIEW raw_files.schema_validation AS
SELECT *
FROM read_ndjson_auto('var/data/observability/schema_validation_counter.ndjson');

CREATE OR REPLACE VIEW raw_files.trade_tick AS
SELECT *
FROM read_ndjson_auto('var/data/canonical/trade_tick/date=*/market=*/part-*.ndjson');

CREATE OR REPLACE VIEW raw_files.ticker_event AS
SELECT *
FROM read_ndjson_auto('var/data/canonical/ticker_event/date=*/market=*/part-*.ndjson');

CREATE OR REPLACE VIEW raw_files.orderbook_snapshot AS
SELECT *
FROM read_ndjson_auto('var/data/canonical/orderbook_snapshot/date=*/market=*/part-*.ndjson');
```

Example materialized daily mart:

```sql
CREATE OR REPLACE TABLE marts.market_quality_daily AS
SELECT
  market,
  DATE(to_timestamp(event_timestamp_ms / 1000.0)) AS event_date,
  COUNT(*) AS trade_count,
  MIN(event_timestamp_ms) AS min_event_timestamp_ms,
  MAX(event_timestamp_ms) AS max_event_timestamp_ms
FROM raw_files.trade_tick
GROUP BY 1, 2;
```

Example correlation query:

```sql
SELECT
  f.market,
  f.dataset,
  COUNT(*) AS alert_count,
  MAX(f.gap_ms) AS max_gap_ms,
  AVG(c.session.rejectDecisions) AS avg_reject_decisions
FROM raw_files.freshness_alert AS f
LEFT JOIN raw_files.cycle_logs AS c
  ON f.run_id = c.runId
GROUP BY 1, 2
ORDER BY alert_count DESC, max_gap_ms DESC;
```

## SQLite workflow

SQLite is still useful when you only need a compact local operational index.

Best SQLite targets:

- `cycles.ndjson`
- session `report.json`
- session `reject-ledger.json`
- observability counters

Use SQLite for:

- dashboards over small summary tables
- indexed lookup by `run_id`, `session_id`, `market`, `date`
- CLI tools that should not require extra packages

Do not use SQLite as the only raw tick store unless you decide to stop writing NDJSON entirely. The current append-only file flow is simpler and safer for capture durability.

## Retention and compaction

Once data starts accumulating, use this policy:

- keep the newest 3 to 7 days in plain NDJSON
- gzip older raw partitions
- keep canonical partitions longer than raw websocket payloads
- keep replay reports and session artifacts much longer than PM2 stdout/stderr
- rebuild marts from files instead of treating marts as the only truth

Practical priority:

- highest retention: `canonical/`, `replay/`, `paper-sessions/`
- medium retention: `observability/`, `cycles.ndjson`
- lowest retention: raw websocket payloads and PM2 stdout/stderr

## Low-risk improvements worth doing next

1. Add a small local analytics bootstrap command that creates DuckDB views over the existing partitions.
2. Add a derived session summary table keyed by `run_id` and `session_id`.
3. Add a daily retention/compaction script for `raw/ws/` and PM2 logs.
4. Add one or two canned queries for stale-data, reject reasons, and run-to-session correlation.

## Recommendation for this repo

For the current codebase, the most efficient path is:

- keep all capture and replay writes exactly as they are
- introduce `var/analytics/org-coin.duckdb` as a read-mostly analysis layer
- materialize only a handful of mart tables from NDJSON
- treat SQLite as an optional lightweight operational cache, not the main analysis engine

That preserves the repo's replay-first design while giving you much faster local analysis once runs start accumulating.
