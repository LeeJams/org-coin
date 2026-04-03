# 빗썸 v1 신호 규칙 및 paper 승격 기준

## 1. 범위 고정

- 전략 ID는 `bithumb_v1_micro_momo`로 고정한다.
- v1 paper universe는 `KRW-BTC`, `KRW-ETH`, `KRW-XRP`만 사용한다.
- `KRW-SOL`은 `research_only`다. feature 계산과 가상 signal 기록은 허용하지만 주문 생성은 금지한다.
- 방향성은 `long-only`다.
- 보유 시간 목표는 1분 이상 15분 이하다.
- `live` 모드는 이번 문서 범위 밖이다. paper acceptance 통과 후에도 CEO 별도 승인 전에는 승격 금지다.

## 2. 진입 규칙

### 2.1 공통 선행 조건

- 대상 시장이 해당 KST 일자의 eligibility table에서 `eligible_for_entry=true`여야 한다.
- 같은 시장에 기존 포지션이 없어야 한다.
- 전체 전략 상태가 `risk_halted=false`여야 한다.
- 아래 freshness 조건을 모두 만족해야 한다.
  - `trade_tick` 최신 시각이 현재 시각 대비 2초 이내
  - `orderbook_snapshot` 최신 시각이 현재 시각 대비 2초 이내
  - `ticker_event` 최신 시각이 현재 시각 대비 5초 이내
  - `candle_1m` 최신 바 timestamp가 현재 분 기준 70초 이내

### 2.2 필수 진입 게이트

아래 다섯 조건을 모두 만족할 때만 진입 후보로 본다.

- `ret_5m_bps > 0`
- `buy_notional_share_60s >= 0.55`
- `depth_ratio_l5 >= 1.20`
- `spread_bps <= 8`
- `turnover_24h_krw >= 30_000_000_000`

### 2.3 confidence tier

`confidenceTier`는 아래 규칙으로 계산한다.

| Tier | 조건 | 주문 허용 |
| --- | --- | --- |
| `high` | `ret_5m_bps >= 25` and `buy_notional_share_60s >= 0.60` and `depth_ratio_l5 >= 1.35` and `spread_bps <= 5` | 예 |
| `medium` | 필수 진입 게이트를 만족하고 `ret_5m_bps >= 10` and `buy_notional_share_60s >= 0.57` and `depth_ratio_l5 >= 1.25` and `spread_bps <= 7` | 예 |
| `low` | 필수 진입 게이트만 만족하고 상위 tier 조건은 미충족 | 아니오 |

- `low`는 분석 로그에는 남기되 executable `SignalIntent`는 만들지 않는다.
- 결과적으로 주문 가능한 tier는 `high`, `medium` 두 단계만 남긴다.

## 3. 청산 규칙

기존 long 포지션이 있을 때 아래 조건 중 먼저 충족한 사유 하나로 청산 signal을 낸다.

1. `unrealized_pnl_pct <= -0.80%`
2. `unrealized_pnl_pct >= +1.20%`
3. `ret_1m_bps < 0`
4. `depth_ratio_l5 < 0.90`
5. `holding_seconds >= 900`

청산 우선순위는 아래와 같다.

1. `EXIT_STOP_LOSS`
2. `EXIT_TAKE_PROFIT`
3. `EXIT_TIME_STOP_15M`
4. `EXIT_RET_1M_NEG`
5. `EXIT_BOOK_IMBALANCE_FAIL`

## 4. 리스크 한도

- 동일 시장 동시 포지션 수: 최대 1
- 전체 동시 포지션 수: 최대 2
- 시장별 gross exposure cap: paper equity의 10%
- 전체 gross exposure cap: paper equity의 20%
- `high` 진입 size: paper equity의 10%
- `medium` 진입 size: paper equity의 5%
- 일일 신규 진입 중단 조건: 당일 누적 realized + unrealized PnL이 paper equity 대비 `-2.0%` 이하
- 신규 진입 거절 조건:
  - 데이터 freshness 위반
  - eligibility table상 비적격
  - `confidenceTier=low`
  - gross exposure cap 초과
  - 시장별 exposure cap 초과
  - 동일 시장 기존 포지션 존재
  - `KRW-SOL` 등 `research_only` 시장

## 5. `SignalIntent` 계약

### 5.1 필수 필드

```json
{
  "strategyId": "bithumb_v1_micro_momo",
  "mode": "dry_run | paper",
  "market": "KRW-BTC | KRW-ETH | KRW-XRP",
  "side": "buy | sell",
  "action": "enter_long | exit_long",
  "confidenceTier": "high | medium",
  "sizingFraction": 0.10,
  "maxHoldingSec": 900,
  "referencePrice": 0,
  "generatedAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "reasonCodes": [
    "ENTRY_RET_5M_POS",
    "ENTRY_FLOW_BUY_60S",
    "ENTRY_BOOK_IMBALANCE_L5",
    "ENTRY_SPREAD_OK",
    "ENTRY_TURNOVER_OK",
    "ENTRY_CONF_HIGH"
  ],
  "featureSnapshot": {
    "ret_5m_bps": 0,
    "ret_1m_bps": 0,
    "buy_notional_share_60s": 0,
    "depth_ratio_l5": 0,
    "spread_bps": 0,
    "turnover_24h_krw": 0
  },
  "eligibilityRef": {
    "tradeDateKst": "YYYY-MM-DD",
    "market": "KRW-BTC",
    "eligibleForEntry": true,
    "schemaVersion": "v1"
  }
}
```

### 5.2 계약 규칙

- `expiresAt - generatedAt`는 15초를 넘기지 않는다.
- `action=enter_long`이면 `reasonCodes`에 entry reason 5개와 confidence reason 1개가 모두 포함되어야 한다.
- `action=exit_long`이면 `reasonCodes`에는 가장 먼저 발동한 exit reason 하나만 남긴다.
- `KRW-SOL`은 어떤 경우에도 executable `SignalIntent.market`로 나오면 안 된다.

## 6. reason code 고정값

### 6.1 Entry

- `ENTRY_RET_5M_POS`
- `ENTRY_FLOW_BUY_60S`
- `ENTRY_BOOK_IMBALANCE_L5`
- `ENTRY_SPREAD_OK`
- `ENTRY_TURNOVER_OK`
- `ENTRY_CONF_HIGH`
- `ENTRY_CONF_MEDIUM`

### 6.2 Exit

- `EXIT_STOP_LOSS`
- `EXIT_TAKE_PROFIT`
- `EXIT_TIME_STOP_15M`
- `EXIT_RET_1M_NEG`
- `EXIT_BOOK_IMBALANCE_FAIL`

### 6.3 Suppress / Reject

- `SUPPRESS_RESEARCH_ONLY`
- `SUPPRESS_DAILY_INELIGIBLE`
- `SUPPRESS_DATA_STALE`
- `SUPPRESS_WEAK_CONFLUENCE`
- `SUPPRESS_RISK_HALTED`
- `SUPPRESS_POSITION_EXISTS`
- `SUPPRESS_EXPOSURE_LIMIT`

## 7. 일일 eligibility table 계약

### 7.1 테이블 목적

- 전략이 intraday 신호를 내기 전에 시장별 운영 가능 여부를 KST 일자 기준으로 고정한다.
- entry gate와 데이터 품질 gate를 한 테이블에서 재현 가능하게 남긴다.

### 7.2 필수 컬럼

| 컬럼 | 설명 |
| --- | --- |
| `trade_date_kst` | KST 기준 거래일 |
| `market` | `KRW-BTC`, `KRW-ETH`, `KRW-XRP`, `KRW-SOL` |
| `universe_role` | `tradable_v1`, `research_only`, `blocked` |
| `eligible_for_entry` | 당일 신규 진입 허용 여부 |
| `warning_flag` | 거래소 경고/주의 여부 |
| `listed_days` | 상장 후 경과 일수 |
| `turnover_24h_krw` | 직전 24시간 거래대금 |
| `spread_p95_bps` | 직전 24시간 top-of-book spread 95퍼센타일 |
| `trade_coverage_ratio` | 직전 24시간 trade 데이터 커버리지 |
| `orderbook_coverage_ratio` | 직전 24시간 orderbook 데이터 커버리지 |
| `max_stale_gap_sec` | 활성 시간대 최대 stale gap |
| `reason_codes` | 적격/부적격 사유 코드 배열 |
| `computed_at` | 계산 시각 |
| `schema_version` | `v1` |

### 7.3 적격 규칙

- `KRW-BTC`, `KRW-ETH`, `KRW-XRP`는 아래 조건을 모두 만족하면 `eligible_for_entry=true`다.
  - `warning_flag=false`
  - `listed_days >= 30`
  - `turnover_24h_krw >= 30_000_000_000`
  - `spread_p95_bps <= 10`
  - `trade_coverage_ratio >= 0.995`
  - `orderbook_coverage_ratio >= 0.995`
  - `max_stale_gap_sec <= 10`
- `KRW-SOL`은 수치와 무관하게 `universe_role=research_only`, `eligible_for_entry=false`로 고정한다.
- 위 조건 중 하나라도 실패하면 `eligible_for_entry=false`이며 실패 사유를 `reason_codes`에 남긴다.

## 8. Data/Backend handoff

### 8.1 Data Engineer에 필요한 산출물

- 아래 feature를 같은 시각 기준으로 재현 가능하게 공급해야 한다.
  - `ret_5m_bps`
  - `ret_1m_bps`
  - `buy_notional_share_60s`
  - `depth_ratio_l5`
  - `spread_bps`
  - `turnover_24h_krw`
  - `warning_flag`
  - `listed_days`
  - freshness metadata
- eligibility table은 KST 하루 1회 이상 계산하되 gap repair가 발생하면 같은 일자 재산출 이력을 남겨야 한다.

### 8.2 Backend Engineer에 필요한 구현 규칙

- `SignalIntent` schema validation 실패는 주문 이전에 반드시 reject한다.
- `confidenceTier=low` 또는 `eligible_for_entry=false`는 주문으로 넘기지 않는다.
- order simulator는 marketable limit 기준으로 fill을 추정한다.
- session 종료 시 미체결/미정산 상태가 남으면 acceptance는 자동 실패로 본다.

## 9. 21일 paper acceptance 리포트 포맷

### 9.1 보고서 헤더

- 전략 ID
- 리포트 기간
- 적용 universe
- strategy config version
- simulator version
- 시작 equity / 종료 equity

### 9.2 필수 섹션

1. Executive summary
2. Hard gate pass/fail 표
3. 일별 운영 품질 표
4. 시장별 성과 요약
5. 전체 trade / round-trip 통계
6. incident 및 reject ledger
7. 상위 5개 승리 거래, 하위 5개 손실 거래 복기
8. 최종 승격 권고

### 9.3 일별 운영 품질 표 컬럼

| 컬럼 | 설명 |
| --- | --- |
| `date_kst` | 거래일 |
| `eligible_markets` | 당일 적격 시장 목록 |
| `signals` | 생성 signal 수 |
| `orders` | paper 주문 수 |
| `round_trips` | 완료 round-trip 수 |
| `reject_rate` | signal-to-order reject rate |
| `max_stale_gap_sec` | 당일 최대 stale gap |
| `reconciliation_ok` | 세션 종료 정합 여부 |
| `day_pnl_bps` | 수수료/슬리피지 반영 일손익 |
| `equity_drawdown_bps` | 누적 최대낙폭 기준 당일 값 |
| `notes` | 특이사항 |

## 10. 승격 판정 절차

### 10.1 hard gate

아래 조건을 모두 만족해야 `paper pass`다.

- KST 기준 21일 연속 리포트 존재
- 총 round-trip 수 `>= 30`
- 최소 2개 이상 tradable 시장에서 각 `>= 5` round-trip 발생
- 수수료와 슬리피지를 반영한 총 expectancy가 양수
- max drawdown `<= 4.0%`
- 전체 signal-to-order reject rate `< 0.5%`
- session 종료 시 unreconciled position `0건`
- severity-1 데이터 freshness 위반 또는 simulator 정합성 위반 `0건`

### 10.2 판정 순서

1. Trading Strategist가 리포트 hard gate를 판정한다.
2. Data Engineer가 데이터 커버리지와 freshness 구간을 확인한다.
3. Backend Engineer가 reject ledger와 reconciliation 결과를 확인한다.
4. 세 역할 모두 이상이 없을 때만 CEO에 `paper pass` 권고를 올린다.
5. CEO 별도 리뷰가 끝나기 전까지는 `live` 관련 작업을 열지 않는다.
