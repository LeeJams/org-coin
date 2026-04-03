# Bithumb API Analysis and Design

## Objective

Turn the generic crypto trading bot effort into a Bithumb-specific architecture that can:

- ingest market metadata and live market data from Bithumb
- evaluate strategy signals against reproducible historical data
- check account and order constraints before submission
- submit, track, and cancel orders safely
- start in dry-run and paper-trading modes before any live-order rollout

## Primary References

- 거래 대상 목록 조회: `GET /v1/market/all`
- 분 캔들 조회: `GET /v1/candles/minutes/{unit}`
- 체결 내역 조회: `GET /v1/trades/ticks`
- 현재가 조회: `GET /v1/ticker`
- 호가 조회: `GET /v1/orderbook`
- 전체 계좌 조회: `GET /v1/accounts`
- 주문 가능 정보 조회: `GET /v1/orders/chance`
- 개별 주문 조회: `GET /v1/order`
- 주문 리스트 조회: `GET /v1/orders`
- 주문 요청: `POST /v2/orders`
- 주문 취소 접수: `DELETE /v2/order`
- WebSocket 기본 정보 / 요청 포맷 / 연결 관리

## Critical Constraints From Official Docs

- Private API uses JWT Bearer auth with `access_key`, `nonce`, and `timestamp`.
- Any request with parameters must include `query_hash` and `query_hash_alg=SHA512`.
- POST and DELETE body parameters must be transformed into query-string form before hashing.
- REST request limits are currently 150 req/s for public APIs and 140 req/s for private APIs.
- Order-related APIs have an additional soft ceiling of 10 req/s.
- WebSocket connect attempts are limited to 10 per second per IP.
- WebSocket connections idle out after about 120 seconds unless kept alive.

## Security Decision

- Do not keep exchange credentials in project descriptions, plans, source files, or comments.
- Move Bithumb credentials into runtime environment variables or a secrets manager before any implementation or testing.
- Treat live-order capability as a privileged mode behind an explicit runtime flag.

## Proposed Architecture

### 1. Bithumb Auth Signer

- Generates JWT tokens for private REST and private WebSocket access.
- Normalizes parameter serialization so `query_hash` is deterministic.
- Owns nonce creation, timestamping, and header injection.

### 2. Reference Data Service

- Pulls `GET /v1/market/all` on startup and on a schedule.
- Filters unsupported or warning markets before they enter strategy selection.
- Publishes canonical market metadata to the rest of the system.

### 3. Historical Data Ingestion

- Uses minute candles for baseline feature generation and backtests.
- Uses recent trade history to validate fill assumptions and short-horizon behavior.
- Stores normalized records keyed by market and timestamp for replayable research.

### 4. Live Market Data Adapter

- Uses REST snapshots for cold start (`ticker`, `orderbook`) and public WebSocket for streaming continuation.
- Maintains an in-memory market state cache with freshness timestamps.
- Degrades safely to stale-data mode instead of trading on partial state.

### 5. Portfolio and Constraint Service

- Uses `GET /v1/accounts` for balances and `GET /v1/orders/chance` for market-specific order constraints.
- Computes spendable balance, fee assumptions, supported order types, and max trade size.
- Rejects orders locally before they ever hit the exchange when constraints fail.

### 6. Order Manager

- Submits orders through `POST /v2/orders`.
- Requires client-generated `client_order_id` for idempotency and auditability.
- Reconciles order state using both `GET /v1/order` and `GET /v1/orders`.
- Cancels through `DELETE /v2/order`.

### 7. Execution State Tracker

- Consumes private WebSocket streams for `myOrder` and `myAsset` where available.
- Falls back to polling order/account endpoints when stream health is degraded.
- Maintains a local order ledger, fill ledger, and position snapshot.

### 8. Strategy Engine

- Reads normalized market state and emits `SignalIntent`.
- Runs in three modes: analysis-only, dry-run, and live-enabled.
- Must never call the exchange directly; it hands off to the order manager through a typed contract.

### 9. Risk Layer

- Enforces per-market exposure caps, daily loss limits, stale-data guards, and order-rate throttles.
- Blocks live execution when account sync, order constraint checks, or data freshness fail.
- Keeps a kill switch separate from strategy logic.

## Core Data Contracts

- `MarketDescriptor`: market id, warning state, order-type support, fee metadata
- `MarketSnapshot`: ticker, top-of-book, last trade, snapshot timestamp
- `CandleBar`: OHLCV plus exchange timestamp and unit
- `TradeTick`: trade price, size, side, timestamp, sequential id
- `AccountBalance`: currency, free balance, locked balance, average buy price
- `OrderCapability`: supported sides, supported order types, fee schedule, max total, market state
- `SignalIntent`: market, side, sizing basis, confidence, expiry
- `OrderIntent`: signal plus validated exchange-specific fields
- `OrderState`: local id, exchange id, client order id, state, remaining size, executed size, fees

## Bithumb-Specific Order Flow

1. Refresh market metadata and account state.
2. Call `orders/chance` for the target market before any submission.
3. Build an `OrderIntent` only if the market is tradable and the required order type is supported.
4. Submit the order with a unique `client_order_id`.
5. Track state through private WebSocket first, REST reconciliation second.
6. Cancel through `DELETE /v2/order` when risk or strategy requests exit before completion.

## Implementation Sequence

1. Credential hygiene and secrets handling
2. Auth signer and exchange client with deterministic `query_hash`
3. Reference data and historical ingestion
4. Live market-data adapter and cache
5. Portfolio/constraint service
6. Order manager and reconciliation loop
7. Strategy engine in dry-run mode
8. Live mode only after explicit operational review

## Role Mapping

### Trading Strategist

- Define the Bithumb market universe and which pairs are eligible for the first milestone.
- Specify which fields from candles, trades, ticker, and orderbook feed the first strategy.
- Define dry-run success metrics before live mode is even considered.

### Data Engineer

- Implement the market metadata pull, candle/trade ingestion, and live market-state cache.
- Define normalization for Bithumb REST plus WebSocket payloads into shared contracts.
- Build replayable datasets for backtests and diagnostics.

### Backend Engineer

- Implement the auth signer, exchange client, order manager, reconciliation loop, and kill switch.
- Enforce request throttling and connection health rules from Bithumb docs.
- Build dry-run/live mode separation so the exchange adapter can be exercised safely.

## Open Risks

- Credentials are currently stored in project metadata outside a secret store.
- The repo is effectively empty, so foundational client, schemas, and runtime scaffolding still need to be created.
- Bithumb limits can change without much notice, so throttle values must remain configuration-driven.
