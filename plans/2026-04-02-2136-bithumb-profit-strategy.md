# 빗썸 수익화 전략

## 결론

- 당장의 수익 전략은 실거래 확대가 아니라 `KRW-BTC`, `KRW-ETH`, `KRW-XRP` 3개 시장에 한정한 종가 기준이 아닌 초단기 모멘텀 + 미시구조 확인 전략을 `dry_run`과 `paper` 모드에서 검증하는 것이다.
- 이유는 세 가지다. 첫째, 유동성이 충분한 KRW 메이저 시장에서만 슬리피지와 체결 리스크를 관리할 수 있다. 둘째, 현재 팀 산출물은 데이터/실행/리스크 계약까지는 준비됐지만 실거래 운영 통제는 아직 없다. 셋째, 실거래를 서두르면 전략 리스크보다 운영 리스크가 먼저 터질 가능성이 높다.
- 따라서 CEO 판단은 `paper trading에서 양의 기대값을 입증한 뒤 실거래 여부를 별도 심사`하는 것으로 고정한다.

## 왜 이 전략인가

### 전략 가설

- 자산군: 빗썸 현물, KRW 마켓만 사용
- 방향성: long-only
- 보유 시간: 1분~15분
- 진입 조건:
  - 5분 수익률 양수
  - 최근 60초 체결 기준 매수 우위 notional 55% 이상
  - 호가 상위 5레벨 bid/ask depth ratio 1.20 이상
  - 최우선 호가 스프레드 8bps 이하
  - 24시간 거래대금 300억 KRW 이상
- 청산 조건:
  - 1분 모멘텀 음전환
  - depth ratio 0.90 미만
  - 15분 time stop
  - 손절 -0.80%
  - 익절 +1.20%

### 경제성 판단

- 팀이 이미 확인한 기준상 `KRW-BTC`, `KRW-ETH`, `KRW-XRP`는 거래대금과 스프레드가 v1 운영 범위에 들어온다.
- 반대로 스프레드가 넓거나 상장 이력이 짧은 시장은 paper에서조차 체결모델 오차가 커진다. 이런 시장까지 초기에 넣으면 전략 품질보다 데이터 잡음이 커져 수익 검증이 왜곡된다.
- 즉 v1의 목표는 "많이 거래"가 아니라 "적은 종목에서 재현 가능한 기대값을 확보"하는 것이다.

## 팀 활용 방안

### Trading Strategist

- 최종 책임: 전략 규칙과 승격 기준 고정
- 이번 라운드 산출물:
  - 3개 시장 기준의 일일 eligibility 룰 확정
  - `SignalIntent`에 들어갈 reason code와 confidence scoring 규칙 확정
  - 21일 paper acceptance 리포트 포맷 확정
- KPI:
  - 전략 파라미터 동결
  - 백테스트/리플레이 평가 기준 문서화
  - 21일 paper 성과 판정 기준 승인

### Data Engineer

- 최종 책임: 전략 검증에 필요한 재현 가능한 데이터 평면 구축
- 이번 라운드 산출물:
  - `market_catalog`, `candle_1m`, `trade_tick`, `ticker_event`, `orderbook_snapshot`, `orderbook_level` 적재 파이프라인
  - freshness 경보와 gap repair 기록
  - replay manifest 생성기
- KPI:
  - 데이터 완전성 99.5% 이상
  - 활성 시간대 stale gap 10초 초과 0회
  - 계약 위반 0건

### Backend Engineer

- 최종 책임: paper-first 실행 경계와 리스크 통제 구축
- 이번 라운드 산출물:
  - `dry_run`/`paper` 공용 `OrderManager` 인터페이스
  - `SignalIntent` 검증, 리스크 체크, 거절 사유 구조화
  - paper simulator, reconciliation ledger, kill switch
  - 이후 live를 위한 signer/exchange client 인터페이스만 미리 분리
- KPI:
  - malformed signal reject 0건
  - session 종료 시 unreconciled position 0건
  - 내부 시스템 fault로 인한 kill switch 0건

## 실행 순서

### 1단계: 수익 검증 기반 만들기

- Data Engineer가 공용 데이터셋과 replay manifest를 먼저 구축한다.
- Backend Engineer는 같은 계약을 쓰는 `dry_run`/`paper` 실행 경계를 만든다.
- Trading Strategist는 시장 선정 룰과 승격 기준을 확정한다.

### 2단계: paper trading 운영

- 3개 시장만 대상으로 21일 연속 paper run을 수행한다.
- 모든 주문은 시장가 추정이 아니라 marketable limit 전제로 시뮬레이션한다.
- 데이터 freshness, reject rate, reconciliation failure를 수익률보다 먼저 본다.

### 3단계: 승격 판단

- 아래 조건을 모두 만족해야 live 검토로 넘긴다:
  - 21일 연속 paper trading
  - 최소 30회 round trip
  - 수수료/슬리피지 반영 후 기대값 양수
  - max drawdown 4% 이하
  - signal-to-order reject rate 0.5% 미만
  - session 종료 시 unreconciled position 0건
- 이 조건을 통과해도 즉시 실거래로 가지 않는다. 별도 CEO 리뷰에서 자본 한도, 비상정지, 운영자 개입 절차를 다시 승인한다.

## 리스크와 통제

- 현재 프로젝트 메타데이터에 거래소 자격증명이 남아 있으므로, 구현이나 테스트에 사용하지 말고 환경변수 또는 시크릿 저장소로 옮긴 뒤 회전을 검토해야 한다.
- `live` 모드는 이번 라운드 범위 밖이다.
- stale data, 잦은 order reject, reconciliation mismatch는 모두 자동 kill switch 입력으로 본다.
- 저유동성 알트 확장은 v1 수익 검증이 끝나기 전까지 금지한다.

## CEO 운영 지시

- 수익화의 정의를 "실거래 시작"이 아니라 "paper에서 재현 가능한 양의 기대값 입증"으로 둔다.
- 팀은 병렬로 일하되 계약은 하나로 고정한다:
  - 전략 출력은 `SignalIntent`
  - 데이터 출력은 canonical market datasets
  - 실행 출력은 order/fill/portfolio ledger
- 이번 라운드의 성공 조건은 코드량이 아니라 승격 심사에 바로 넣을 수 있는 paper 운영 체계를 만드는 것이다.
