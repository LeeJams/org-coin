# org-coin 한국어 안내

빗썸 1차 마일스톤을 위한 공개 시세 수집과 페이퍼 트레이딩 실행 기초 저장소입니다.

영문 기준 문서는 [`README.md`](README.md)이며, 이 문서는 빠른 이해와 설정을 위한 한국어 안내입니다.

## 현재 범위

이 저장소는 의도적으로 범위를 좁게 유지합니다.

- 빗썸 공개 REST API와 공개 WebSocket만 사용
- 전략 리플레이와 실행 시뮬레이션을 위한 표준 데이터셋 생성
- 페이퍼 실행과 드라이런 계약만 제공
- 원본 수집, 정규화 데이터, 리플레이 매니페스트, 관측성 로그를 파일 기반으로 저장
- 실거래 실행과 거래소 자격 증명 커밋은 금지

실거래는 별도 롤아웃이 승인되기 전까지 범위 밖입니다.

## 데이터셋

- `market_catalog`
- `candle_1m`
- `trade_tick`
- `ticker_event`
- `orderbook_snapshot`
- `orderbook_level`
- `passive_feature_snapshot`

## 저장소 구조

```text
contracts/      Python 데이터 파이프라인용 JSON 스키마
docs/           런타임 제약과 운영 규칙
org_coin_data/  Python 수집 파이프라인과 CLI
plans/          공유 계획 문서
schemas/        TypeScript 측 스키마
src/            TypeScript 실행 및 검증 기본 모듈
test/           TypeScript 테스트
tests/          Python 테스트
```

## 저장 구조

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
```

`market_catalog`는 `date` 기준으로만 파티셔닝합니다.

## 빠른 시작

Python 런타임 의존성을 설치합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

TypeScript 도구 체인을 설치합니다.

```bash
npm install
```

기본 페이퍼 유니버스 기준으로 초기 데이터셋을 부트스트랩합니다.

```bash
python -m org_coin_data bootstrap --ws-seconds 15
```

하나의 run id로 더 긴 반복 캡처를 수행합니다.

```bash
python -m org_coin_data bootstrap \
  --ws-seconds 20 \
  --iterations 6 \
  --interval-seconds 5
```

`bootstrap` 명령은 기본적으로 60초 동안 websocket trade를 예열하고, 리플레이용 최근 체결 백필 수를 충분히 확보한 뒤 같은 run 기준의 리플레이 매니페스트 경로, 사람이 읽기 쉬운 품질 요약 경로, passive feature 분포 요약 경로, preflight gate 요약 경로를 순서대로 출력합니다.

정규화 저장소에서 특정 run 기준 리플레이 매니페스트를 다시 생성합니다.

```bash
python -m org_coin_data build-manifest --run-id <run-id>
```

기존 run 기준 품질 요약을 다시 생성합니다.

```bash
python -m org_coin_data build-quality-report --run-id <run-id>
```

기존 run 기준 passive feature 파생 데이터셋과 분포 리포트를 다시 생성합니다.

```bash
python -m org_coin_data build-passive-feature-report --run-id <run-id>
```

기존 run 기준 eligibility/freshness preflight gate 요약을 다시 생성합니다.

```bash
python -m org_coin_data build-preflight-report --run-id <run-id>
```

캡처된 run 하나를 기준으로 시작 자금 100만원의 리플레이 세션 시나리오를 생성합니다.

```bash
python -m org_coin_data build-session-scenario \
  --run-id <run-id> \
  --initial-cash-krw 1000000
```

수동 갭 리페어 기록을 남깁니다.

```bash
python -m org_coin_data repair-gap \
  --dataset trade_tick \
  --market KRW-BTC \
  --start 2026-04-02T12:30:00Z \
  --end 2026-04-02T12:35:00Z
```

테스트를 실행합니다.

```bash
npm test
python -m unittest discover -s tests -v
```

생성된 리플레이 시나리오를 낙관적 `dry_run` 모드로 실행합니다.

```bash
TRADING_MODE=dry_run npm run paper:session -- var/data/replay/scenarios/session-<run-id>.json
```

## 런타임과 비밀값 처리

현재의 페이퍼 우선 범위에서는 거래소 API 자격 증명이 필요하지 않습니다.

- 향후 런타임 입력은 [`docs/runtime-contract.md`](docs/runtime-contract.md)에 정리되어 있습니다.
- passive feature 수집 운영 가이드는 [`docs/passive-feature-collection.md`](docs/passive-feature-collection.md)에 정리되어 있습니다.
- `dry_run`은 기준 호가로 즉시 체결되는 낙관적 검증 모드이고, `paper`는 슬리피지와 수수료를 반영한 보수적 시뮬레이터입니다.
- 예시 환경 변수 템플릿은 [`.env.example`](.env.example)에 있습니다.
- 저장소가 페이퍼 전용으로 유지되는 동안 로컬 `.env`의 `BITHUMB_ACCESS_KEY`, `BITHUMB_SECRET_KEY`는 비워 두어야 합니다.
- 실제 `.env` 파일과 채워진 비밀값은 절대 커밋하면 안 됩니다.
