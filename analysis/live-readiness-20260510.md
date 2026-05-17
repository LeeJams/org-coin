# Live Readiness Audit - 2026-05-10

## Objective

User objective: use subagent and current analysis evidence to improve toward a live-ready strategy.

Concrete success criteria:

- At least one candidate passes the live promotion gate.
- If live is not ready, identify the measured blocker without adding speculative knobs.
- Any proposed entry or exit change must be compared against a clear baseline.
- Reduced trading activity alone must not be treated as profitability evidence.

## Current Promotion State

Latest full audit artifacts:

- `var/reports/current-live-audit.json`
- generated at `2026-05-10T12:14:55.395Z`
- `var/reports/current-live-audit-20260510-1237.json`
- generated at `2026-05-10T12:38:07.120Z`
- `var/reports/current-live-audit-all-running-latest.json`
- generated at `2026-05-10T13:11:35.617Z`

Latest gate results:

- `liveReady`: failed
- `paperCandidate`: failed
- `observationReady`: passed for the currently running PM2 roots. Historical cycle failures remain visible for `confirm3`, `trend`, `hold`, and `guarded`, but no candidate is still in recovery.
- A profitable paper candidate now requires positive traded PnL, positive closed PnL, no open-position carry dependency, and at least 30 closed trades. Smaller positive samples remain `observation_only`.

Latest candidates:

| Candidate | Sessions | Traded sessions | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Live ready |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `confirm3` | 671 | 38 | 14 | -8874.850249 | -1273.811602 | false |
| `trend` | 723 | 69 | 26 | -9129.613513 | -3861.447755 | false |
| `hold` | 521 | 40 | 13 | -3443.574247 | -1073.210277 | false |
| `guarded` | 476 | 28 | 10 | -4700.325317 | -1082.690108 | false |
| `ret1-turnover-cap` | 2 | 0 | 0 | 0.000000 | 0.000000 | false |

Primary blockers:

- No live-ready candidate.
- No profitable paper candidate.
- Insufficient closed trades for all candidates.
- Negative traded PnL for all candidates.
- Negative closed-trade PnL for all candidates.
- Material losing exit reasons, led by `EXIT_TIME_STOP_15M`.
- No positive suppressed-entry expectancy.

Latest PM2 check:

- `dry-run-manager`, `dry-run-btc-trend-manager`, `dry-run-btc-trend-hold-manager`, `dry-run-btc-trend-hold-guarded-manager`, and `dry-run-btc-trend-ret1-turnover-cap-manager` are online.
- Recent BTC trend/hold/guarded cycles completed normally but mostly produced no fills.
- Recent no-fill cycles are dominated by `SUPPRESS_DATA_STALE` and `SUPPRESS_WEAK_CONFLUENCE`, not by a profitable missed-entry signal.
- Historical operational errors remain in the logs: websocket opening-handshake timeouts on 2026-05-08 and one guarded scenario failure for missing enriched market points on 2026-05-08. These are not the main PnL blocker, but they keep operational health from being clean.

Subagent alignment:

- Both subagents recommended measuring suppressed opportunity quality before changing entry gates.
- Both explicitly warned that guarded/low-activity behavior is not proof of profitability.
- The latest audit agrees: `entryGateChange` is `blocked_no_positive_suppressed_expectancy`, and no candidate supports loosening entry.

## Repaired Exit Attribution

The original `trend` audit had 14 sell-fill sessions without exit reason attribution. Standalone replay did not reconstruct them because those sells depended on carried positions. A carry-forward replay over 159 source runs recovered the missing sell contexts.

Artifacts:

- `var/reports/trend-attribution-carry-forward-run-ids.txt`
- `var/paper-sessions-btc-trend-attribution-carry-forward`
- `var/reports/trend-attribution-recovery-summary.json`

Recovered attribution:

| Exit reason | Sessions | Total PnL KRW | Losing sessions | Profitable sessions |
| --- | ---: | ---: | ---: | ---: |
| `EXIT_TIME_STOP_15M` | 12 | -2930.244859 | 11 | 1 |
| `EXIT_RET_1M_NEG` | 1 | -53.640448 | 1 | 0 |
| `EXIT_BOOK_IMBALANCE_FAIL` | 1 | -14.098707 | 1 | 0 |

This resolves the attribution uncertainty. It does not improve readiness; it confirms that time-stop exits account for most recovered sell losses.

## Latest 250-Run Entry Profile Check

Run-id file:

- `var/reports/trend-latest250-run-ids.txt`
- window: `2026-05-09T02:46:48Z` through `2026-05-10T12:10:24Z`

Replay artifacts:

- `var/paper-sessions-btc-trend-v1-latest250`
- `var/paper-sessions-btc-trend-flow-confirm-latest250`
- `var/paper-sessions-btc-trend-low-buffer-latest250`

All replays used:

- `--limit 250`
- `--carry-forward`
- exit profile `balanced_v1_book_confirm3`
- synthetic exit policy `carry_open`

Results:

| Profile | Sessions | Traded sessions | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Observation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `btc_trend_v1` | 250 | 3 | 1 | -342.961190 | -180.261183 | Baseline sidecar |
| `btc_trend_flow_confirm_v1` | 250 | 3 | 1 | -342.961190 | -180.261183 | Same trades as baseline |
| `btc_trend_low_buffer_v1` | 250 | 6 | 2 | -409.137913 | -292.635722 | More trades, worse net and closed PnL |

Interpretation:

- `flow_confirm` is not an improvement on this window because it selected the same realized trade path.
- `low_buffer` increased activity but worsened results, matching the suppressed-opportunity audit's warning against entry loosening.
- None of these sidecar profiles has enough closed trades or positive PnL to support paper or live promotion.

## Ret1 Confirmation Experiment

Implemented explicit experiment profile:

- `btc_trend_ret1_confirm_v1`
- single added entry condition: `ret_1m_bps >= 4.6`
- baseline gates otherwise match `btc_trend_v1`
- no running PM2 defaults were changed

Code touched:

- `org_coin_data/eligibility.py`
- `src/runtime/dry-run-service-config.ts`
- `tests/test_eligibility.py`
- `test/dry-run-service-config.test.ts`

Verification:

- `python3 -m unittest tests.test_eligibility`: passed, 11 tests.
- `npm test`: passed, 89 tests.

Latest 250-run sidecar result:

| Profile | Sessions | Traded sessions | Closed trades | Total PnL KRW | Closed-trade PnL KRW |
| --- | ---: | ---: | ---: | ---: | ---: |
| `btc_trend_v1` | 250 | 3 | 1 | -342.961190 | -180.261183 |
| `btc_trend_ret1_confirm_v1` | 250 | 3 | 1 | -342.961190 | -180.261183 |

The latest window selected the same realized trade path as baseline, so it is not evidence of improvement.

Full `trend` run-id replay:

- run-id file: `var/reports/trend-all-run-ids.txt`
- reports root: `var/paper-sessions-btc-trend-ret1-confirm-all`
- sessions: 718
- completed: 718
- failed: 0
- fill sessions: 19
- open-position sessions: 22
- cumulative PnL: -3094.962743 KRW

Audit comparison:

| Candidate | Sessions | Traded sessions | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Missing exit attribution |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `trend-current` | 718 | 69 | 26 | -9129.613513 | -3861.447755 | 14 |
| `ret1-confirm-all` | 718 | 30 | 11 | -3094.962743 | -884.428399 | 0 |

Interpretation:

- The ret1 filter reduced loss and removed the attribution gap in the sidecar replay.
- It still has negative traded PnL, negative closed-trade PnL, material `EXIT_TIME_STOP_15M` losses, and only 11 closed trades.
- It is therefore not live-ready and not a paper candidate.
- This profile is only worth continued observation or a broader controlled backfill; it should not be promoted.

Ret1 trade-path diagnostic:

- Command: `npm run dry-run:analyze-trade-paths -- --reports-root var/paper-sessions-btc-trend-ret1-confirm-all`
- Closed trades: 11
- Winners / losers: 3 / 8
- Total PnL: -3094.962743 KRW
- Average PnL: -281.360249 KRW
- Immediate-adverse closed trades: 7
- Losing trades total PnL: -3974.322156 KRW
- Losing trades average MFE: -26.344097 KRW

The diagnostic still points to entry quality, not late exit only. Most losing `ret1_confirm` trades never had useful positive MFE. The strongest retrospective candidate was a turnover cap around `turnover_24h_krw <= 89626887120.96246`, selecting 5 closed trades with total PnL `388.640868` KRW while skipping 6 closed trades with total PnL `-3483.603611` KRW.

This is not live evidence:

- The selected sample is only 5 closed trades.
- The threshold is from retrospective closed-trade scanning.
- It must be tested as an explicit sidecar profile or experiment matrix before any promotion decision.

Latest combined audit added the same ret1 sidecar:

| Candidate | Sessions | Traded sessions | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Additional closed trades needed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `trend` | 719 | 69 | 26 | -9129.613513 | -3861.447755 | 4 |
| `ret1-confirm-all` | 718 | 30 | 11 | -3094.962743 | -884.428399 | 19 |

Ret1 reduces loss magnitude versus `trend`, but it does so by filtering out many trades and still remains negative, under-sampled, and blocked by material `EXIT_TIME_STOP_15M` loss. That is not enough to call it profitable.

## Suppressed Opportunity Recheck

Direct suppressed-opportunity pricing was rerun for the three running BTC roots.

| Candidate | Suppressed samples | 5m shadow PnL KRW | 15m shadow PnL KRW | Assessment |
| --- | ---: | ---: | ---: | --- |
| `trend` | 5725 | -2355710.717490 | -2297787.159701 | protective inactivity |
| `hold` | 5693 | -2379220.486518 | -2311294.728573 | protective inactivity |
| `guarded` | 5657 | -2362277.027553 | -2266207.706564 | protective inactivity |

`latest` mark values were positive for all three roots, but that is not entry-quality evidence. It is a carry-open/latest-mark view during a BTC-positive background move, while the fixed 5m and 15m horizons are decisively negative. This means entry loosening would likely add losing trades, not unlock expectancy.

Next measured experiment candidate, if continuing:

- Add one explicit profile combining `ret_1m_bps >= 4.6` with a turnover cap near 90B KRW.
- Replay against the same 718 run ids before starting any new PM2 manager.
- Promotion remains blocked unless traded PnL, closed PnL, exit-risk, and closed-trade count all pass audit gates.

## Ret1 Turnover-Cap Experiment

Implemented explicit sidecar profile:

- `btc_trend_ret1_turnover_cap_v1`
- baseline gates otherwise match `btc_trend_v1`
- additional entry conditions:
  - `ret_1m_bps >= 4.6`
  - `turnover_24h_krw <= 90_000_000_000`
- no PM2 defaults or running managers were changed

Code touched:

- `org_coin_data/eligibility.py`
- `src/runtime/dry-run-service-config.ts`
- `tests/test_eligibility.py`
- `test/dry-run-service-config.test.ts`

Verification:

- `python3 -m unittest tests.test_eligibility`: passed, 12 tests.
- `npm test`: passed, 89 tests.

Full `trend` run-id replay:

- run-id file: `var/reports/trend-all-run-ids.txt`
- reports root: `var/paper-sessions-btc-trend-ret1-turnover-cap-all`
- generated at `2026-05-10T12:45:28.808Z`
- sessions: 718
- completed: 718
- failed: 0
- fill sessions: 12
- open-position sessions: 12
- cumulative PnL: -454.852496 KRW

Audit artifact:

- `var/reports/ret1-turnover-cap-audit-20260510.json`
- generated at `2026-05-10T12:45:39.311Z`

Audit comparison:

| Candidate | Sessions | Traded sessions | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Additional closed trades needed | Live ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `trend-current` | 720 | 69 | 26 | -9129.613513 | -3861.447755 | 4 | false |
| `ret1-confirm-all` | 718 | 30 | 11 | -3094.962743 | -884.428399 | 19 | false |
| `ret1-turnover-cap-all` | 718 | 18 | 6 | -454.852496 | 580.225298 | 24 | false |

Interpretation:

- The turnover-cap sidecar is the best loss-reduction result so far.
- It is still not profitable on total traded PnL.
- It has only 6 closed trades, far below the 30-trade promotion floor.
- It still has material `EXIT_TIME_STOP_15M` loss: 5 sessions, -680.964855 KRW.
- It has no exit attribution gap.
- It should be treated as a promising observation candidate only, not a live or paper promotion candidate.

Trade-path diagnostic:

- Command: `npm run dry-run:analyze-trade-paths -- --reports-root var/paper-sessions-btc-trend-ret1-turnover-cap-all`
- Closed trades reconstructed by the path diagnostic: 6
- Winners / losers: 3 / 3
- Diagnostic total PnL: -454.852496 KRW
- Average PnL: -75.808749 KRW
- Immediate-adverse closed trades: 2
- Losing trades average MFE: -12.437100 KRW

The path diagnostic still warns against adding another retrospective filter immediately. The strongest next thresholds are based on one to five selected trades, which is too small to justify another strategy dimension without fresh observation.

## Ret1 Turnover-Cap Observation PM2

Started a paper-only observation manager after the sidecar replay:

- PM2 app: `dry-run-btc-trend-ret1-turnover-cap-manager`
- start command: `npm run pm2:start:dry-run:btc-trend-ret1-turnover-cap`
- execution mode: `paper`
- `ENABLE_LIVE_EXECUTION=false`
- entry profile: `btc_trend_ret1_turnover_cap_v1`
- exit profile: `balanced_v1_book_confirm3`
- synthetic exit policy: `carry_open`
- session root: `var/paper-sessions-btc-trend-ret1-turnover-cap`
- cycle log: `var/log/dry-run-btc-trend-ret1-turnover-cap-service/cycles.ndjson`

First observed cycle:

- cycle: 1
- started at `2026-05-10T12:58:13.896Z`
- completed at `2026-05-10T13:01:16.603Z`
- duration: 182.707 seconds
- run id: `8987960b1ffd434bbf33283961fbfe07`
- session id: `paper-20260510-130114Z-a1159403`
- fill count: 0
- order count: 0
- reconciliation: ok
- suppressions: `SUPPRESS_DATA_STALE=9`, `SUPPRESS_WEAK_CONFLUENCE=4`

Latest observation refresh:

- artifact: `var/reports/ret1-turnover-cap-observation-audit-latest.json`
- generated at `2026-05-10T13:10:19.235Z`
- completed cycles: 2
- failed cycles: 0
- observed sessions: 2
- traded sessions: 0
- closed trades: 0
- total strategy PnL: 0.000000 KRW
- BTC excess PnL: 612.752016 KRW, caused by inactivity during two BTC-negative windows
- audit disposition: `observation_only`
- live gate: blocked
- paper gate: blocked
- additional closed trades needed: 30

The positive BTC excess in the two managed observation sessions is not a
tradable profitability signal. It came from holding cash while BTC fell. The
candidate still has zero entries, zero exits, and zero closed-trade expectancy
evidence.

Operational check:

- `npm run dry-run:returns:btc-trend-ret1-turnover-cap` works and attaches cycle evidence.
- `npm run dry-run:audit-ret1-turnover-cap -- --summary-only --output var/reports/ret1-turnover-cap-observation-audit-20260510.json` works.
- The first observation audit reports `observationReady` passed, but live and paper gates remain blocked because there are zero closed trades in the managed observation root.

The PM2 observation run is only evidence collection. It does not change live defaults and does not authorize live trading.

## 2026-05-11 Recheck

The ret1 turnover-cap observation manager has now accumulated enough data to
judge whether the sidecar improved expectancy. It did not.

Latest all-running audit:

- command: `npm run dry-run:audit-all-running-candidates -- --summary-only --output var/reports/current-live-audit-all-running-latest.json`
- generated at `2026-05-11T12:30:55.104Z`

Latest gate recheck:

| Command | Generated at | Exit code | Result |
| --- | --- | ---: | --- |
| `npm run dry-run:gate-all-running-live-ready` | `2026-05-11T12:32:07.539Z` | 2 | `no live-ready candidate found` |
| `npm run dry-run:gate-all-running-paper-candidate` | `2026-05-11T12:32:07.539Z` | 3 | `no profitable paper candidate found` |
| `npm run dry-run:gate-all-running-observation-ready` | `2026-05-11T12:32:07.539Z` | 0 | Observation gate passed only |

Current candidate state:

| Candidate | Sessions | Traded sessions | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Live ready |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `confirm3` | 844 | 49 | 18 | -8131.623941 | 286.072049 | false |
| `trend` | 895 | 88 | 33 | -9951.423834 | -5844.554569 | false |
| `hold` | 693 | 57 | 19 | -2458.665354 | -149.465794 | false |
| `guarded` | 650 | 57 | 19 | -10221.290506 | -5193.888578 | false |
| `ret1-turnover-cap` | 175 | 22 | 8 | -6723.326860 | -3358.310134 | false |

Ret1 turnover-cap observation details:

- audit artifact: `var/reports/ret1-turnover-cap-observation-audit-latest.json`
- generated at `2026-05-11T12:30:26.957Z`
- audit disposition: `observation_only`
- sessions: 175
- traded sessions: 22
- closed trades: 8
- total and traded PnL: -6723.326860 KRW
- closed-trade PnL: -3358.310134 KRW
- BTC excess PnL: 30760.066416 KRW
- failed checks: `minimumClosedTrades`, `noMaterialLosingExitReasons`, `positiveAverageTradedPnl`, `positiveClosedTradePnl`, `positiveTradedPnl`
- additional closed trades needed: 22

The positive BTC excess is not promotion evidence because the strategy itself
lost money; BTC buy-and-hold was simply worse over the sampled windows. The
time-stop exit cohort is also materially negative: 8 `EXIT_TIME_STOP_15M`
sessions, -3358.310134 KRW total, average -419.788767 KRW, with 8 losing
sessions and 0 profitable sessions.

Entry-opportunity state is unchanged from the subagent recommendation and the
suppressed-opportunity audit: all running labels classify as
`protective_inactivity`, no label supports entry loosening, and the audit's
entry gate remains `blocked_no_positive_suppressed_expectancy`.

## Exit Attribution Repair

The audit CLI now supports an explicit attribution supplement:

```bash
npm run dry-run:audit-all-running-attribution-repaired -- \
  --summary-only \
  --output var/reports/current-live-audit-all-running-attribution-repaired-latest.json
```

This option does not alter PnL. It only matches recovered carry-forward exit
reasons by `sourceRunId` against sell-fill sessions that were already present
but missing reason codes.

Latest repaired audit:

- generated at `2026-05-11T12:45:23.566Z`
- `trend` matched missing sessions: 14
- `trend` unmatched recovered sessions: 0
- `trend` remaining missing exit-reason sessions: 0
- `trend` matched PnL: -2997.984015 KRW
- repaired `trend` time-stop cohort: 30 `EXIT_TIME_STOP_15M` sessions,
  -7476.178709 KRW total, average -249.205957 KRW, 26 losing sessions and 4
  profitable sessions

Repaired gate results:

| Command | Generated at | Exit code | Result |
| --- | --- | ---: | --- |
| `npm run dry-run:audit-all-running-attribution-repaired -- --require-live-ready --summary-only` | `2026-05-11T12:43:21.824Z` | 2 | `no live-ready candidate found` |
| `npm run dry-run:audit-all-running-attribution-repaired -- --require-paper-candidate --summary-only` | `2026-05-11T12:43:21.824Z` | 3 | `no profitable paper candidate found` |
| `npm run dry-run:audit-all-running-attribution-repaired -- --require-observation-ready --summary-only` | `2026-05-11T12:43:21.812Z` | 0 | Observation gate passed only |

The repair removes `exit_reason_attribution_gap` from the primary blockers, but
it strengthens the measured loss attribution to `EXIT_TIME_STOP_15M`. Promotion
remains blocked by negative traded PnL, negative closed-trade PnL, material
losing exit reasons, open risk, and no entry-loosening evidence. Historical
cycle failures remain visible in `blockerSummary` and `observationHealth`, but
they are no longer primary blockers once the recovery window has completed.

Latest repaired primary blockers:

- `no_live_ready_candidate`
- `no_profitable_paper_candidate`
- `insufficient_closed_trades`
- `negative_traded_pnl`
- `negative_closed_trade_pnl`
- `material_losing_exit_reasons`
- `open_risk_or_mark_dependency`
- `no_entry_loosening_evidence`

## Ret1 Time-Stop Cohort Diagnostic

The trade-path diagnostic now emits `exitReasonCohorts`, so losing exits can be
analyzed without relying only on the promotion audit aggregate.

Command:

```bash
npm run dry-run:analyze-trade-paths -- --reports-root var/paper-sessions-btc-trend-ret1-turnover-cap
```

Latest ret1 turnover-cap path result:

- report count: 178
- closed trades reconstructed by the path diagnostic: 8
- all reconstructed closed-trade PnL: -6723.326860 KRW
- `EXIT_TIME_STOP_15M` cohort: 8 trades, -6723.326860 KRW
- winners / losers: 2 / 6
- average MFE: 110.765927 KRW
- average MAE: -861.153548 KRW
- immediate-adverse count: 5
- gave-back-positive-MFE count: 1
- `exitReasonPathDiagnostics.EXIT_TIME_STOP_15M.dominantLosingPath`:
  `immediate_adverse`
- `EXIT_TIME_STOP_15M` immediate-adverse losing trades: 5, -5593.177929 KRW
- `EXIT_TIME_STOP_15M` gave-back-positive-MFE losing trades: 1,
  -1413.586664 KRW

Interpretation:

- The time-stop cohort is mostly entry-quality failure, not merely late exit.
- Five of six losing closed trades never had positive MFE.
- Only one loser meaningfully gave back positive MFE.
- Retrospective thresholds still select negative PnL cohorts and remain too
  sample-small for another strategy dimension.

## Completion Audit

Prompt-to-artifact checklist:

| Requirement | Evidence artifact or command | Current result | Completion status |
| --- | --- | --- | --- |
| Use subagent analysis | Herschel and Gibbs both recommended suppressed-opportunity / entry-opportunity measurement before entry loosening | Both aligned with no-live and no-entry-loosening | Covered |
| Compare against a clear baseline | `var/reports/current-live-audit-all-running-latest.json` and paired carry-forward replay roots | Baselines remain negative; ret1 variants reduce loss but do not clear gates | Covered |
| Do not treat reduced activity as profitability | `src/cli/audit-live-candidates.ts`, `test/audit-live-candidates.test.ts`, `docs/pm2-dry-run.md` | Profitable paper candidate now requires positive traded/closed PnL, no open carry, and at least 30 closed trades | Covered |
| Live-ready candidate exists | `recommendation.liveReadyLabels` in `var/reports/current-live-audit-all-running-latest.json` | Empty | Missing |
| Paper-candidate promotion exists | `recommendation.profitablePaperLabels` and `nextPaperCandidate` in latest audit | Empty / `null` | Missing |
| Observation process running | `pm2 list`; `var/log/dry-run-btc-trend-ret1-turnover-cap-service/cycles.ndjson` | 5 managers online; ret1 turnover-cap observation root has 178 completed sessions and recovered from one historical `no_enriched_market_points` failure | Covered |
| Ret1 turnover-cap has live-trade expectancy evidence | `var/reports/current-live-audit-all-running-attribution-repaired-recheck.json` | 178 sessions, 22 traded sessions, 8 closed trades, total PnL -6723.326860 KRW, closed PnL -3358.310134 KRW | Missing |
| Missing exit attribution understood | `var/reports/trend-attribution-recovery-summary.json`; `var/reports/current-live-audit-all-running-attribution-repaired-latest.json` | Explicit supplement matches all 14 missing `trend` sell-fill sessions and leaves 0 missing exit-reason sessions | Covered |
| Entry loosening has measured support | suppressed-opportunity recheck and latest audit `entryGateChange` | Fixed 5m/15m shadow PnL negative; `blocked_no_positive_suppressed_expectancy` | Missing |
| Time-stop loss path is separated from exit-only failure | `npm run dry-run:analyze-trade-paths -- --reports-root var/paper-sessions-btc-trend-ret1-turnover-cap`; `src/cli/analyze-trade-paths.ts`; `src/cli/audit-live-candidates.ts` | `exitReasonPathDiagnostics` is now embedded in the repaired audit and shows dominant `EXIT_TIME_STOP_15M` losing path is `immediate_adverse`, 5 losses / -5593.177929 KRW | Covered |
| Live startup cannot use aggregate audit output as approval | `test/dry-run-service-config.test.ts`; `docs/runtime-contract.md` | Added regression coverage and runtime-contract note that only a single-candidate `summarize-dry-run-returns` output can be `LIVE_READINESS_SUMMARY_PATH`; aggregate `audit-live-candidates` output remains review evidence only | Covered |
| Automated verification for changed gates | `npm test`; `git diff --check` | `npm test` 92/92, diff check clean | Covered |

Latest explicit gate command results:

| Command | Generated at | Exit code | Result |
| --- | --- | ---: | --- |
| `npm run dry-run:audit-all-running-attribution-repaired -- --summary-only --output var/reports/current-live-audit-all-running-attribution-repaired-recheck.json` | `2026-05-11T12:55:43.074Z` | 0 | Full repaired audit written with `tradePathDiagnostics` |
| `npm run dry-run:audit-all-running-attribution-repaired -- --require-live-ready --summary-only` | `2026-05-11T12:48:45.181Z` | 2 | `no live-ready candidate found` |
| `npm run dry-run:audit-all-running-attribution-repaired -- --require-paper-candidate --summary-only` | `2026-05-11T12:48:45.181Z` | 3 | `no profitable paper candidate found` |
| `npm run dry-run:audit-all-running-attribution-repaired -- --require-observation-ready --summary-only` | `2026-05-11T12:48:45.181Z` | 0 | Observation gate passed only |

Conclusion: the active goal is correctly framed but not complete. The current evidence does not support live deployment or paper promotion. The next useful work is not to start live trading; it is a measured strategy-quality experiment or report improvement focused on avoiding immediate adverse/time-stop trades, using a clear baseline and no hidden optimistic pricing assumptions.

## Trade-Path Diagnostic Caveat

Additional diagnostic commands were run:

- `npm run dry-run:analyze-trade-paths -- --reports-root var/paper-sessions-btc-trend`
- `npm run dry-run:analyze-trade-paths -- --reports-root var/paper-sessions-btc-trend-hold`
- `npm run dry-run:analyze-trade-paths -- --reports-root var/paper-sessions-btc-trend-hold-guarded`

These diagnostics are useful for entry-feature pattern search, but they are not promotion PnL authority. The full `trend` root trade-path reconstruction can diverge from audit PnL because it reconstructs paths across carried sessions and historical report state. Promotion should continue to use `audit-live-candidates`.

Still, the trade-path pattern is consistent with the audit blockers:

- `hold`: 13 closed trades, 4 winners, 9 losers, 8 immediate-adverse losing trades.
- `guarded`: 10 closed trades, 3 winners, 7 losers, 3 immediate-adverse losing trades and 4 losing trades that gave back positive MFE.
- The strongest retrospective filters remain sample-small diagnostics, not live evidence.

This supports the same operational conclusion: do not loosen entries, do not promote live, and do not treat lower activity as profitability. The next experiment should be a single measured entry-quality filter replay, not a live run.

## Recheck After Additional Data

Command:

```bash
npm run dry-run:audit-all-running-attribution-repaired -- --summary-only --output var/reports/current-live-audit-all-running-attribution-repaired-rerun.json
```

Generated at `2026-05-11T13:00:52.990Z`.

Latest candidate state:

| Candidate | Sessions | Traded | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Live | Paper-profit candidate |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `confirm3` | 848 | 53 | 20 | -9081.159617 | -800.439354 | No | No |
| `trend` | 899 | 90 | 34 | -10358.879024 | -6061.730612 | No | No |
| `hold` | 697 | 61 | 21 | -3648.672545 | -1176.450643 | No | No |
| `guarded` | 653 | 57 | 19 | -10221.290506 | -5193.888578 | No | No |
| `ret1-turnover-cap` | 178 | 22 | 8 | -6723.326860 | -3358.310134 | No | No |

Promotion state:

- `recommendation.liveReadyLabels`: empty.
- `recommendation.profitablePaperLabels`: empty.
- `recommendation.nextPaperCandidate`: `null`.
- `promotionGates.liveReady.passed`: `false`.
- `promotionGates.paperCandidate.passed`: `false`.
- `promotionGates.observationReady.passed`: `true`.
- `decisionSummary.live`: `blocked`.
- `decisionSummary.paper`: `blocked`.
- `decisionSummary.entryGateChange`: `blocked_no_positive_suppressed_expectancy`.

Entry evidence:

- All candidates are still classified as `protective_inactivity` by suppressed-opportunity analysis.
- `supportsLooseningEntryLabels` is empty.
- Fixed-horizon suppressed shadows remain negative, so latest-mark/carry-open improvement is not promotion evidence.
- `entryFilterReplayCandidateLabels` contains only `trend`; this means "eligible for explicit replay validation", not paper or live promotion.

Trade-path replay readiness:

- `trend`: `candidate_ready_for_explicit_replay`, with a retrospective `turnover_24h_krw <= 90199374711.13681` candidate selecting 36 reconstructed trades with +3611.941803 KRW, while skipping one large losing reconstructed trade. This is diagnostic and must be validated by explicit replay before any strategy change.
- `confirm3`, `hold`, `guarded`, and `ret1-turnover-cap`: `insufficient_closed_trade_sample`.
- `ret1-turnover-cap` still has 8 closed trades only, no positive threshold candidate, and best threshold candidates reduce losses but remain net negative.

Verification after this recheck:

- `git diff --check`: passed.
- `npm test`: 92/92 passed.

Updated conclusion: the active goal remains correctly defined but not achieved. The strategy can continue observation, but there is still no live-ready candidate and no profitable paper candidate. The next measured action should be an explicit replay of the single `trend` entry-quality threshold hypothesis, with audit PnL remaining the promotion authority.

## Explicit Trend Turnover-Cap Replay

The repaired audit exposed one retrospective `trend` threshold candidate:
`turnover_24h_krw <= 90199374711.13681`. To test it without changing live or
PM2 runtime settings, a replay-only entry profile was added:
`btc_trend_turnover_cap_replay_v1`.

This profile keeps `btc_trend_v1` unchanged except for the turnover ceiling. It
does not add the `ret_1m_bps >= 4.6` gate used by
`btc_trend_ret1_turnover_cap_v1`, so it isolates the variable suggested by the
trade-path diagnostic.

Commands:

```bash
npm run dry-run:replay-existing:btc-trend-turnover-cap -- --reports-dir var/paper-sessions-btc-trend-turnover-cap-replay-all --run-ids-file var/reports/trend-all-run-ids.txt --limit 718 --carry-forward --output var/reports/btc-trend-turnover-cap-replay-all.json

npm run dry-run:audit-candidates -- --candidate ret1-confirm-all=var/paper-sessions-btc-trend-ret1-confirm-all --candidate ret1-turnover-cap-all=var/paper-sessions-btc-trend-ret1-turnover-cap-all --candidate trend-turnover-cap-replay=var/paper-sessions-btc-trend-turnover-cap-replay-all --summary-only --output var/reports/btc-trend-entry-quality-replay-comparison.json

npm run dry-run:returns -- --reports-root var/paper-sessions-btc-trend-turnover-cap-replay-all --output var/reports/btc-trend-turnover-cap-replay-all-returns.json

npm run dry-run:audit-all-running-candidates -- --exit-attribution-supplement trend=var/reports/trend-attribution-recovery-summary.json --entry-filter-replay-supplement trend=var/reports/btc-trend-turnover-cap-replay-all-audit.json --summary-only --output var/reports/current-live-audit-all-running-attribution-repaired-with-replay-supplement.json
```

Replay execution result:

- run IDs: 718
- completed: 718
- failed: 0
- fill sessions: 40
- final equity: 991749.559724 KRW
- cumulative PnL: -8250.440276 KRW

Audit comparison on the 718-run sidecar set:

| Candidate | Sessions | Traded | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Main blocker |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `ret1-confirm-all` | 718 | 30 | 11 | -3094.962743 | -884.428399 | negative PnL, 19 more closed trades needed |
| `ret1-turnover-cap-all` | 718 | 18 | 6 | -454.852496 | 580.225298 | negative traded PnL, 24 more closed trades needed |
| `trend-turnover-cap-replay` | 718 | 63 | 23 | -8250.440276 | -2835.265704 | negative PnL, material time-stop losses |

Interpretation:

- The retrospective `trend` turnover threshold did not survive explicit
  carry-forward replay as a profitable paper candidate.
- It increased trading relative to the ret1+turnover observation candidate and
  produced a materially larger loss.
- `trend-turnover-cap-replay` still loses before fees, has negative closed-trade
  PnL, and remains below the 30 closed-trade floor.
- Its dominant losing path remains `EXIT_TIME_STOP_15M` immediate adverse: 12
  immediate-adverse losing trades and -7751.524569 KRW.
- The best current 718-run sidecar remains `ret1-turnover-cap-all` by loss
  reduction, but it is still not profitable on traded PnL and is heavily
  under-sampled.
- `var/reports/btc-trend-turnover-cap-replay-all-returns.json` confirms the
  replay root has 718 sessions, 63 traded sessions, strategy PnL
  -8250.440276 KRW, and positive BTC excess only because BTC buy-and-hold lost
  more over the same windows. Positive excess is not enough for promotion when
  traded and closed-trade PnL are negative.
- `var/reports/current-live-audit-all-running-attribution-repaired-with-replay-supplement.json`
  attaches the failed `trend` turnover replay as explicit evidence. The aggregate
  audit now leaves `entryFilterReplayCandidateLabels` empty, sets
  `invalidatedEntryFilterReplayLabels` to [`trend`], adds
  `entry_filter_replay_failed` to the primary blockers, and changes the next
  operational step to reject the failed replay and continue observation.

Reporting follow-up:

- `summarize-dry-run-returns` now supports `--output`, so return summaries can
  be persisted as promotion-review artifacts instead of relying on stdout.
- Regression coverage was added for writing the JSON summary to an artifact
  path.
- Runtime safety coverage now explicitly rejects the replay-only
  `btc_trend_turnover_cap_replay_v1` profile in `loadDryRunServiceConfig`, so
  the diagnostic replay profile cannot be used as a managed dry-run/live
  service entry profile by accident.
- Verification after the change: `npm test` 93/93 passed,
  `.venv/bin/python -m unittest tests.test_eligibility` 13/13 passed, and
  `git diff --check` passed.

Latest verification after the replay-supplement and runtime-safety follow-up:
`npm test` 94/94 passed, `.venv/bin/python -m unittest tests.test_eligibility`
13/13 passed, and `git diff --check` passed.

Updated operational conclusion: reject the isolated turnover-cap replay as a
promotion candidate. Keep `ret1-turnover-cap` as observation-only if collecting
more evidence is desired, but do not loosen `trend` entries and do not promote
live.

## 2026-05-11 13:24Z Recheck

Enough additional PM2 cycles accumulated to rerun the repaired audit with the
failed replay supplement. The result is unchanged: live and paper promotion are
still blocked, while observation remains allowed.

PM2 state:

- `dry-run-manager`: online
- `dry-run-btc-trend-manager`: online
- `dry-run-btc-trend-hold-manager`: online
- `dry-run-btc-trend-hold-guarded-manager`: online
- `dry-run-btc-trend-ret1-turnover-cap-manager`: online

Command:

```bash
npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --summary-only
```

Generated at `2026-05-11T13:24:40.182Z`.

Latest candidate state:

| Candidate | Sessions | Traded | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Live | Paper-profit candidate |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `confirm3` | 851 | 53 | 20 | -9081.159617 | -800.439354 | No | No |
| `trend` | 902 | 90 | 34 | -10358.879024 | -6061.730612 | No | No |
| `hold` | 700 | 63 | 22 | -3621.272680 | -1182.867804 | No | No |
| `guarded` | 656 | 57 | 19 | -10221.290506 | -5193.888578 | No | No |
| `ret1-turnover-cap` | 181 | 22 | 8 | -6723.326860 | -3358.310134 | No | No |

Latest explicit gate command results:

| Command | Generated at | Exit code | Result |
| --- | --- | ---: | --- |
| `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --require-live-ready --summary-only` | `2026-05-11T13:24:40.182Z` | 2 | `no live-ready candidate found` |
| `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --require-paper-candidate --summary-only` | `2026-05-11T13:24:40.182Z` | 3 | `no profitable paper candidate found` |
| `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --require-observation-ready --summary-only` | `2026-05-11T13:24:40.182Z` | 0 | Observation gate passed only |

Current recommendation:

- `recommendation.liveReadyLabels`: empty
- `recommendation.profitablePaperLabels`: empty
- `recommendation.nextPaperCandidate`: `null`
- `entryGateSummary.supportsLooseningEntryLabels`: empty
- `entryGateSummary.entryFilterReplayCandidateLabels`: empty
- `entryGateSummary.invalidatedEntryFilterReplayLabels`: [`trend`]
- `entryGateSummary.protectiveInactivityLabels`: all five running candidates
- `decisionSummary.live`: `blocked`
- `decisionSummary.paper`: `blocked`
- `decisionSummary.entryGateChange`:
  `blocked_no_positive_suppressed_expectancy`
- `decisionSummary.nextOperationalStep`: reject the failed entry-filter replay
  and continue observation; do not promote live or loosen entry gates

Subagent alignment remains unchanged:

- Herschel recommended a paired entry-opportunity audit to separate missed
  entry opportunity from bad exit quality.
- Gibbs recommended suppressed-candidate shadow pricing before any entry-gate
  change.
- The current audit supports the conservative interpretation: inactivity is
  protective, not proven missed profit.

Goal status: the active goal is correctly set, but it is not complete. There is
no live-ready or profitable paper candidate in the current evidence. The next
engineering step should remain measurement-focused, not live deployment.

## Negative BTC Window Exposure Follow-up

The return summary now reports BTC-negative window exposure with the same
suppression/gate-failure breakdown used for BTC-positive windows. This closes
the subagent-requested measurement gap: inactivity can now be separated into
missed upside versus downside risk control instead of being interpreted only
from aggregate BTC excess PnL.

Code and docs touched:

- `src/cli/summarize-dry-run-returns.ts`
- `test/summarize-dry-run-returns.test.ts`
- `docs/pm2-dry-run.md`

New artifact:

- `var/reports/ret1-turnover-cap-returns-with-negative-window-exposure.json`
- `var/reports/current-live-audit-all-running-with-negative-window-exposure.json`

Latest `ret1-turnover-cap` exposure summary:

- sessions: 182
- traded sessions: 22
- strategy PnL: -6723.326860 KRW
- BTC benchmark PnL: -38877.960463 KRW
- BTC-positive windows: 59
- BTC-positive no-fill windows: 52
- BTC-positive capture ratio: -0.073900
- BTC-positive suppressions:
  `SUPPRESS_WEAK_CONFLUENCE=377`, `SUPPRESS_DATA_STALE=269`
- BTC-negative windows: 123
- BTC-negative no-fill windows: 116
- BTC-negative avoided loss: 56787.085409 KRW
- BTC-negative avoided-loss ratio: 0.918657
- BTC-negative suppressions:
  `SUPPRESS_WEAK_CONFLUENCE=853`, `SUPPRESS_DATA_STALE=614`

Interpretation:

- The positive BTC excess remains mostly a cash/inactivity effect during
  BTC-negative windows.
- The strategy still loses money on its own trades and has negative
  BTC-positive capture.
- This supports continued observation and measurement, not live promotion or
  entry loosening.

Verification:

- `npm run build`: passed
- `node --test dist/test/summarize-dry-run-returns.test.js`: 14/14 passed
- `node --test dist/test/audit-live-candidates.test.js`: 9/9 passed
- `npm test`: 94/94 passed
- `git diff --check`: passed

Latest aggregate audit with these fields:

- generated at `2026-05-11T13:30:46.223Z`
- `decisionSummary.live`: `blocked`
- `decisionSummary.paper`: `blocked`
- `liveReadyLabels`: empty
- `profitablePaperLabels`: empty
- `ret1-turnover-cap`: 182 sessions, 22 traded sessions, 8 closed trades,
  -6723.326860 KRW total PnL, -3358.310134 KRW closed-trade PnL

## Path-Cohort Turnover Replay

The trade-path diagnostic now reports losing-path entry feature diagnostics
under `pathCohortEntryFeatureDiagnostics`. This is a measurement-only extension
to identify explicit replay candidates for dominant losing paths such as
`EXIT_TIME_STOP_15M` immediate adverse. It is not live-readiness evidence by
itself.

Artifacts:

- `var/reports/ret1-turnover-cap-trade-paths-path-cohorts.json`
- `var/reports/trend-trade-paths-path-cohorts.json`
- `var/reports/btc-trend-turnover-cap-path-replay-all.json`
- `var/reports/btc-trend-turnover-cap-path-replay-all-audit.json`
- `var/reports/btc-trend-turnover-cap-path-replay-all-returns.json`
- `var/reports/btc-trend-turnover-cap-path-replay-all-trade-paths.json`

Diagnostic finding:

- `ret1-turnover-cap` is still too small and net negative: 8 closed trades, 5
  `EXIT_TIME_STOP_15M` immediate-adverse losers, no positive replay candidate.
- `trend` had 37 reconstructed closed trades. The path-cohort diagnostic found a
  stricter turnover candidate, `turnover_24h_krw <= 63092167042.41634`, which
  retrospectively skipped all 4 immediate-adverse `EXIT_TIME_STOP_15M` losers.

Explicit replay:

```bash
npm run dry-run:replay-existing:btc-trend-turnover-cap-path -- --reports-dir var/paper-sessions-btc-trend-turnover-cap-path-replay-all --run-ids-file var/reports/trend-all-run-ids.txt --limit 718 --carry-forward --output var/reports/btc-trend-turnover-cap-path-replay-all.json
```

Replay result:

- profile: `btc_trend_turnover_cap_path_replay_v1`
- run IDs: 718
- completed: 718
- failed: 0
- fill sessions: 22
- final equity: 996623.928375 KRW
- cumulative PnL: -3376.071625 KRW

Audit result:

- generated at `2026-05-11T13:41:13.118Z`
- sessions: 718
- traded sessions: 34
- closed trades: 12
- total/traded PnL: -3376.071625 KRW
- closed-trade PnL: -860.933298 KRW
- live: blocked
- paper: blocked
- additional closed trades needed: 18
- failed checks: cycle evidence unavailable, insufficient closed trades,
  negative traded PnL, negative closed-trade PnL, material losing exit reasons
- `EXIT_TIME_STOP_15M`: 11 sessions, -2119.292009 KRW
- path diagnostic after replay: 7 immediate-adverse `EXIT_TIME_STOP_15M`
  losers, -3874.744508 KRW

Interpretation:

- The stricter turnover cap reduced loss versus the original `trend` and the
  failed 90.199B turnover replay, but it still did not produce positive traded
  or closed-trade PnL.
- Positive BTC excess again comes mostly from BTC buy-and-hold losing more over
  the same windows, not from profitable strategy trades.
- The next retrospective candidate inside this failed replay is
  `ret_1m_bps >= 6.286209`, but it selects only 3 closed trades. That is too
  small to add another strategy dimension.
- Do not start a PM2 manager or live mode for this replay-only profile.

Combined replay supplement:

- artifact:
  `var/reports/btc-trend-turnover-replay-supplement-combined-audit.json`
- generated at `2026-05-11T13:42:52.668Z`
- candidates:
  `trend-turnover-cap-replay` and `trend-turnover-cap-path-replay`
- both explicit turnover replays fail live and profitable-paper promotion gates
- the aggregate repaired audit should attach this combined artifact as the
  `trend` entry-filter replay supplement so the same failed thresholds are not
  recommended again

Latest aggregate audit with the combined supplement:

- command:
  `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --summary-only --output var/reports/current-live-audit-all-running-with-combined-replay-supplement.json`
- generated at `2026-05-11T13:45:02.293Z`
- `recommendation.liveReadyLabels`: empty
- `recommendation.profitablePaperLabels`: empty
- `recommendation.nextPaperCandidate`: `null`
- `entryGateSummary.supportsLooseningEntryLabels`: empty
- `entryGateSummary.entryFilterReplayCandidateLabels`: empty
- `entryGateSummary.invalidatedEntryFilterReplayLabels`: [`trend`]
- `decisionSummary.live`: `blocked`
- `decisionSummary.paper`: `blocked`
- `decisionSummary.entryGateChange`:
  `blocked_no_positive_suppressed_expectancy`
- `decisionSummary.nextOperationalStep`: reject the failed entry-filter replay
  and continue observation; do not promote live or loosen entry gates

Latest candidate state:

| Candidate | Sessions | Traded | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Live | Paper-profit candidate |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `confirm3` | 853 | 53 | 20 | -9081.159617 | -800.439354 | No | No |
| `trend` | 904 | 90 | 34 | -10358.879024 | -6061.730612 | No | No |
| `hold` | 702 | 63 | 22 | -3621.272680 | -1182.867804 | No | No |
| `guarded` | 659 | 58 | 19 | -9966.067148 | -5193.888578 | No | No |
| `ret1-turnover-cap` | 184 | 22 | 8 | -6723.326860 | -3358.310134 | No | No |

The active goal is still correctly aimed at live readiness, but it remains
unachieved. The current evidence supports only continued observation and
measurement work, not live deployment or entry loosening.

Suppressed-entry shadow-pricing refresh:

- artifacts:
  - `var/reports/suppressed-opportunities-confirm3-latest.json`
  - `var/reports/suppressed-opportunities-trend-latest.json`
  - `var/reports/suppressed-opportunities-hold-latest.json`
  - `var/reports/suppressed-opportunities-guarded-latest.json`
  - `var/reports/suppressed-opportunities-ret1-turnover-cap-latest.json`
- all five candidates classify as `protective_inactivity`
- all five have `opportunityAssessment.supportsLooseningEntry=false`

| Candidate | Samples | 5m shadow PnL KRW | 15m shadow PnL KRW | Top failing gates |
| --- | ---: | ---: | ---: | --- |
| `confirm3` | 6681 | -2932432.438638 | -2922817.034408 | `ret_5m_bps`, `depth_ratio_l5`, `window_coverage_sec` |
| `trend` | 7878 | -3320750.648857 | -3276537.895256 | `ret_5m_bps`, `depth_ratio_l5`, `window_coverage_sec` |
| `hold` | 7833 | -3334630.788272 | -3284438.845396 | `ret_5m_bps`, `depth_ratio_l5`, `window_coverage_sec` |
| `guarded` | 7758 | -3305489.871271 | -3179922.178238 | `ret_5m_bps`, `depth_ratio_l5`, `window_coverage_sec` |
| `ret1-turnover-cap` | 2139 | -854514.021936 | -846486.484957 | `ret_5m_bps`, `ret_1m_bps`, `depth_ratio_l5` |

This directly answers the subagent concern about whether suppressed candidates
were missed profit. They were not: fixed-horizon shadow entries were strongly
negative. For these BTC-only samples, BTC excess is approximately zero because
the shadow candidate and benchmark are both `KRW-BTC`; the actionable signal is
the negative shadow PnL and loser-heavy distribution.

Reason/gate subgroup scan:

- scanned `bySuppressionReason` and `byFailingGate` for every current candidate
- required at least 30 marked samples, positive total fixed-horizon PnL, positive
  median return, and more winners than losers
- result: no robust positive 5m or 15m subgroup for `confirm3`, `trend`, `hold`,
  `guarded`, or `ret1-turnover-cap`

This means the current suppressed-entry evidence does not support a narrower
entry-gate relaxation or a new threshold replay inside the same BTC trend family.

## Completion Audit - 2026-05-11

Objective restated as concrete deliverables:

- identify at least one candidate that can proceed toward live trading
- use subagent guidance and current analysis evidence, not speculative knobs
- verify profitability with traded/closed PnL, exit-risk, BTC benchmark, and
  live/paper promotion gates
- if no candidate is ready, identify the measured blocker and avoid repeating
  failed experiments

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Subagent guidance incorporated | Herschel and Gibbs both recommended suppressed-entry/opportunity measurement before entry loosening | Done |
| Current PM2 candidates audited | `var/reports/current-live-audit-all-running-with-combined-replay-supplement.json` | Done |
| Live gate checked | `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --require-live-ready --summary-only` exited 2 with `no live-ready candidate found` | Failed |
| Paper-profit gate checked | `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --require-paper-candidate --summary-only` exited 3 with `no profitable paper candidate found` | Failed |
| Observation gate checked | `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --require-observation-ready --summary-only` exited 0 | Passed |
| Explicit replay supplement attached | `var/reports/btc-trend-turnover-replay-supplement-combined-audit.json` invalidates `trend` replay candidates | Done |
| Suppressed-entry opportunity checked | `var/reports/suppressed-opportunities-*-latest.json` artifacts classify all current candidates as `protective_inactivity` | Done |
| Entry loosening supported | `supportsLooseningEntryLabels` is empty, and no robust positive reason/gate subgroup exists | Failed |
| Candidate profitability supported | all current candidates have negative traded and closed PnL or insufficient closed trades | Failed |
| Live deployment safety | no candidate appears in `recommendation.liveReadyLabels` | Blocked |

Completion decision:

- Do not call the goal complete.
- Do not promote live.
- Do not loosen BTC trend entry gates.
- Do not add another BTC trend threshold replay without a new measured positive
  subgroup or a materially different strategy hypothesis.

The current blocker is not implementation. It is strategy evidence: there is no
live-ready candidate, no profitable paper candidate, and no suppressed-entry
subgroup that supports another threshold experiment inside the current BTC trend
family.

Legacy-root audit check:

- artifact: `var/reports/legacy-roots-live-audit-20260511.json`
- generated at `2026-05-11T13:53:49.356Z`
- candidates: `legacy-all`, `btc`, `btc-confirm2`, `btc-confirm3`
- `recommendation.liveReadyLabels`: empty
- `recommendation.profitablePaperLabels`: empty
- `recommendation.nextPaperCandidate`: `null`

| Candidate | Sessions | Traded | Closed trades | Total PnL KRW | Closed-trade PnL KRW | Disposition |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `legacy-all` | 2647 | 1337 | 100 | -32022.063614 | -6304.440198 | `discard` |
| `btc` | 359 | 46 | 32 | -8157.129163 | -8341.419912 | `observation_only` |
| `btc-confirm2` | 650 | 43 | 27 | -10522.218068 | -8157.011089 | `observation_only` |
| `btc-confirm3` | 854 | 53 | 20 | -9081.159617 | -800.439354 | `observation_only` |

This closes the main local-evidence gap outside the current running BTC trend
set. The older roots also do not contain a live-ready or profitable paper
candidate. `legacy-all` exposes one retrospective high-buy-flow diagnostic
(`buy_notional_share_60s >= 0.944165`), but it is not promotion evidence because
the root is net negative, lacks BTC benchmark/cycle evidence, has missing exit
attribution, and the selected diagnostic cohort has only 15 trades. It should be
treated only as a possible future strategy hypothesis if a new experiment track
is explicitly chosen.

## High Buy-Flow Replay

After the BTC trend family failed, a materially different entry hypothesis was
tested instead of continuing to tune the same losing strategy. The new
replay-only profile `high_buy_flow_replay_v1` keeps the `v1` microstructure gates
but requires the legacy diagnostic threshold
`buy_notional_share_60s >= 0.944165`.

Safety constraints:

- the profile is replay-only
- it is not accepted by `loadDryRunServiceConfig`
- no PM2/live manager uses it

Artifacts:

- run IDs: `var/reports/legacy-all-run-ids.txt`
- carry-forward replay: `var/reports/high-buy-flow-replay-all.json`
- carry-forward audit: `var/reports/high-buy-flow-replay-partial-audit.json`
- isolated replay: `var/reports/high-buy-flow-replay-isolated-all.json`
- isolated audit: `var/reports/high-buy-flow-replay-isolated-all-audit.json`

Carry-forward result:

- completed: 542
- failed: 1
- aborted: true, because a carried `KRW-ETH` position could not be marked in the
  next scenario
- fill sessions: 58
- cumulative PnL: -9092.119751 KRW
- audit disposition: `discard`
- closed-trade PnL: -4889.707321 KRW
- dominant blocker: negative traded/closed PnL and material `EXIT_TIME_STOP_15M`
  loss

Isolated result:

- completed: 4204
- failed: 3 `no_enriched_market_points`
- fill sessions: 171
- total PnL: -36805.651989 KRW
- approximate return on 1M KRW starting notional: -3.680565%
- closed trades: 2
- closed-trade PnL: 511.820016 KRW
- audit disposition: `discard`

Interpretation:

- The high-buy-flow idea did change the strategy family, but it did not produce
  a profitable candidate.
- The carry-forward replay failed early and was already negative.
- The isolated full replay also lost materially, so the issue is not only
  carry-forward state handling.
- This hypothesis should be rejected in its current form. The next profitable
  strategy search needs a genuinely new entry/exit hypothesis, not another minor
  threshold layered onto the current v1/BTC trend families.

Verification:

- `.venv/bin/python -m unittest tests.test_eligibility`: 14/14 passed
- `npm test`: 94/94 passed
- `git diff --check`: passed

## Experimental Decay Exit Replay

The next measured hypothesis after rejecting high buy-flow was an exit-only
change. Entry remained `btc_trend_v1`; only the exit profile changed from the
current balanced book-confirm family to the already-defined `experimental_decay`
profile. This tests whether faster decay/stop behavior can reduce the dominant
`immediate_adverse` and time-stop loss path without changing entry frequency.

Command:

```bash
npm run dry-run:replay-existing:btc-trend -- --exit-profile experimental_decay --reports-dir var/paper-sessions-btc-trend-experimental-decay-replay-all --run-ids-file var/reports/trend-all-run-ids.txt --limit 718 --carry-forward --output var/reports/btc-trend-experimental-decay-replay-all.json
npm run dry-run:audit-candidates -- --candidate trend-experimental-decay=var/paper-sessions-btc-trend-experimental-decay-replay-all --summary-only --output var/reports/btc-trend-experimental-decay-replay-all-audit.json
```

Artifacts:

- replay: `var/reports/btc-trend-experimental-decay-replay-all.json`
- audit: `var/reports/btc-trend-experimental-decay-replay-all-audit.json`

Result:

- completed: 718
- failed: 0
- fill sessions: 34
- open-position sessions: 16
- final equity: 990324.206257 KRW
- cumulative PnL: -9675.793743 KRW
- approximate return on 1M KRW starting capital: -0.967579%
- closed trades: 23
- closed-trade PnL: -5808.242897 KRW
- fee hurdle: would still lose without fees
- audit decision: live blocked, paper blocked

Interpretation:

- Faster exit did not repair expectancy.
- All reconstructed closed trades in the audit path diagnostic were losing:
  23 losers, 0 winners.
- The dominant loss path remained `immediate_adverse`: 19 losing trades,
  -9178.089333 KRW.
- This rejects the idea that the current problem is mainly a slow exit. The
  evidence points back to entry quality: the strategy is buying locations that
  often move against it before any profitable excursion develops.

## Strong Depth Replay

The latest actual buy-fill fixed-horizon diagnostic found no positive 5-minute
entry cohort across the running candidates. At 15 minutes, only small subgroups
were positive. The least-redundant candidate was the `guarded` subgroup with
`depth_ratio_l5 >= 22.307692`, which selected 7 buy fills with 15-minute shadow
PnL `1430.064952` KRW and 6 winners / 1 loser. This was not promotion evidence:
it was a small fixed-horizon diagnostic only.

To validate the idea explicitly, a replay-only profile
`btc_trend_strong_depth_replay_v1` was added. It keeps `btc_trend_v1` unchanged
except for `depth_ratio_l5 >= 22.307692`, is rejected by the managed PM2/live
config path, and is intended only for replay.

Artifacts:

- entry-quality diagnostic:
  `var/reports/actual-buy-entry-quality-fixed-horizon-20260512.json`
- replay: `var/reports/btc-trend-strong-depth-replay-all.json`
- audit: `var/reports/btc-trend-strong-depth-replay-all-audit.json`

Replay command:

```bash
npm run dry-run:replay-existing:btc-trend-strong-depth -- --reports-dir var/paper-sessions-btc-trend-strong-depth-replay-all --run-ids-file var/reports/trend-all-run-ids.txt --limit 718 --carry-forward --output var/reports/btc-trend-strong-depth-replay-all.json
npm run dry-run:audit-candidates -- --candidate trend-strong-depth=var/paper-sessions-btc-trend-strong-depth-replay-all --summary-only --output var/reports/btc-trend-strong-depth-replay-all-audit.json
```

Result:

- completed: 718
- failed: 0
- fill sessions: 19
- open-position sessions: 24
- final equity: 996157.059091 KRW
- cumulative PnL: -3842.940909 KRW
- approximate return on 1M KRW starting capital: -0.384294%
- closed trades: 12
- closed-trade PnL: -1067.218007 KRW
- fee hurdle: would still lose without fees
- audit decision: live blocked, paper blocked

Interpretation:

- Strong depth reduced the loss versus baseline trend, but it did not create
  positive expectancy.
- The positive 15-minute fixed-horizon subgroup did not survive explicit
  carry-forward replay.
- The dominant closed-trade loss path remained `immediate_adverse`: 9 losing
  time-stop trades, -4288.524467 KRW.
- This hypothesis should be rejected as a promotion candidate. It is useful
  only as evidence that simple liquidity/depth filtering is not enough.

## Passive Regime Fixed-Horizon Scan

After the BTC trend, turnover, high-flow, fast-exit, and strong-depth hypotheses
all failed explicit replay, the next question was whether a different short
horizon BTC regime exists in the raw local evidence. This scan joined
`passive_feature_snapshot` with `orderbook_snapshot` for the 718
`trend-all-run-ids` runs, downsampled to the same 15-second decision cadence,
and marked a 500000 KRW buy at best ask against future best bid with 4 bps fees
on both entry and exit.

Artifact:

- `var/reports/btc-passive-regime-scan-fixed-horizon-20260512.json`

Coverage:

- run ids: 718
- used runs: 718
- downsampled points: 9245

Results:

| Horizon | Marked samples | Total PnL KRW | Avg PnL KRW | Winners | Losers | Positive single-feature regimes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 30s | 7096 | -3340716.693303 | -470.788711 | 12 | 7084 | 0 |
| 60s | 5667 | -2665613.041647 | -470.374632 | 36 | 5631 | 0 |
| 120s | 2817 | -1315101.433673 | -466.844669 | 55 | 2762 | 0 |

Interpretation:

- There is no visible short-horizon BTC scalping edge after fees and spread in
  this local evidence.
- No single-feature threshold over `ret_5m_bps`, `buy_notional_share_60s`,
  `depth_ratio_l5`, `spread_bps`, `turnover_24h_krw`, `window_coverage_sec`,
  `trade_count_60s`, or `notional_60s` produced a positive fixed-horizon regime
  with at least 100 selected samples.
- A follow-up two-feature scan with the same horizons, same cost model, and at
  least 100 selected / 100 skipped samples also found zero positive regimes.
  Artifact: `var/reports/btc-passive-two-feature-regime-scan-20260512.json`.
- This blocks the obvious next fallback of replacing the 15-minute strategy with
  a 30/60/120-second BTC scalper. The current data does not support it.

## All-Market Passive Regime Fixed-Horizon Scan

To check whether the BTC-only constraint was hiding a short-horizon opportunity
in another stored market, the passive regime scan was expanded to all markets
with available local passive/orderbook evidence: `KRW-BTC`, `KRW-ETH`, and
`KRW-XRP`. The scan used the same assumptions as the BTC-only passive scan:
15-second cadence, 500000 KRW notional, best-ask entry, future best-bid mark,
and 4 bps fees on both entry and exit. Regime scans required at least 100
selected and 100 skipped samples.

Artifact:

- `var/reports/all-market-passive-regime-scan-fixed-horizon-20260512.json`

Coverage:

| Market | Runs | Downsampled points |
| --- | ---: | ---: |
| KRW-BTC | 8845 | 113040 |
| KRW-ETH | 2642 | 33787 |
| KRW-XRP | 2641 | 34103 |

Results:

| Market | Horizon | Marked samples | Total PnL KRW | Avg PnL KRW | Winners | Losers | Positive single-feature regimes | Positive two-feature regimes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| KRW-BTC | 30s | 86613 | -40751595.019228 | -470.502061 | 360 | 86253 | 0 | 0 |
| KRW-BTC | 60s | 69093 | -32473354.746126 | -469.994858 | 954 | 68139 | 0 | 0 |
| KRW-BTC | 120s | 34215 | -16058256.563015 | -469.333817 | 1145 | 33070 | 0 | 0 |
| KRW-ETH | 30s | 25919 | -15307522.825705 | -590.590795 | 260 | 25659 | 0 | 0 |
| KRW-ETH | 60s | 20729 | -12191839.035564 | -588.153748 | 574 | 20155 | 0 | 0 |
| KRW-ETH | 120s | 10279 | -6004747.933695 | -584.176275 | 655 | 9624 | 0 | 0 |
| KRW-XRP | 30s | 26221 | -17303343.368780 | -659.904022 | 147 | 26074 | 0 | 0 |
| KRW-XRP | 60s | 20974 | -13795478.716938 | -657.741905 | 375 | 20599 | 0 | 0 |
| KRW-XRP | 120s | 10438 | -6819692.844874 | -653.352447 | 463 | 9975 | 0 | 0 |

Interpretation:

- The local evidence does not show a cost-adjusted short-horizon passive edge in
  BTC, ETH, or XRP.
- No single-feature or two-feature regime met the positive-PnL threshold with
  the minimum sample requirement.
- This rules out the immediate fallback of switching the current BTC work to a
  simple ETH/XRP 30/60/120-second passive scalper.
- The live goal remains blocked. The current strategy family should not be
  promoted to live, and loosening entry gates is not supported by the data.

## Operational Disposition

The active PM2 dry-run candidates were stopped after the all-candidate audit,
suppressed-opportunity checks, and all-market passive scan all failed to produce
a live or paper candidate.

Stopped processes:

- `dry-run-manager`
- `dry-run-btc-trend-manager`
- `dry-run-btc-trend-hold-manager`
- `dry-run-btc-trend-hold-guarded-manager`
- `dry-run-btc-trend-ret1-turnover-cap-manager`

Reason:

- every current candidate had negative total PnL;
- no candidate passed the live or paper gate;
- suppressed candidates did not show positive fixed-horizon expectancy;
- BTC/ETH/XRP passive regime scans found zero positive single-feature or
  two-feature regimes at 30, 60, or 120 seconds;
- continuing these PM2 runs would collect more evidence for already rejected
  variants rather than move toward a live-ready profitable strategy.

Next strategy work must start from a new hypothesis rather than another
threshold adjustment within the rejected BTC trend/scalp family.

## Candle 1m Swing Sensitivity Scan

After the short-horizon orderbook/passive scans failed, a broader candle-based
check tested whether a longer spot-long holding period had any local evidence.
This was deliberately treated as a sensitivity scan, not a live-ready backtest:
it deduped `candle_1m` by market/minute using the latest ingested record, used
close-to-close entry/exit, assumed 500000 KRW notional, and charged 8 bps
round-trip cost. That is more optimistic than orderbook execution because it
does not model bid/ask spread or fill quality.

Artifacts:

- overlapping scan:
  `var/reports/all-market-candle1m-swing-regime-scan-20260512.json`
- non-overlapping validation:
  `var/reports/all-market-candle1m-swing-regime-nonoverlap-validation-20260512.json`

Coverage:

| Market | Unique minutes | From UTC | To UTC |
| --- | ---: | --- | --- |
| KRW-BTC | 39463 | 2026-04-13T11:08:00Z | 2026-05-11T21:30:00Z |
| KRW-ETH | 21419 | 2026-04-13T11:08:00Z | 2026-04-28T13:55:00Z |
| KRW-XRP | 21496 | 2026-04-13T11:08:00Z | 2026-04-28T13:55:00Z |

Baseline close-to-close results:

| Market | Horizon | Samples | Total PnL KRW | Avg PnL KRW | Winners | Losers | Positive single-feature regimes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| KRW-BTC | 15m | 39349 | -14896134.800652 | -378.564507 | 9350 | 29999 | 0 |
| KRW-BTC | 30m | 39303 | -14013681.262280 | -356.555002 | 12174 | 27129 | 0 |
| KRW-BTC | 60m | 39214 | -12270407.220682 | -312.908839 | 14443 | 24771 | 0 |
| KRW-BTC | 240m | 38691 | -2823737.572886 | -72.981768 | 17651 | 21040 | 3 |
| KRW-ETH | 15m | 21254 | -8261096.625599 | -388.684324 | 6828 | 14426 | 0 |
| KRW-ETH | 30m | 21228 | -8004269.610660 | -377.061881 | 7793 | 13435 | 0 |
| KRW-ETH | 60m | 21165 | -7538974.722758 | -356.200081 | 8552 | 12613 | 0 |
| KRW-ETH | 240m | 20799 | -5445951.007552 | -261.837156 | 9082 | 11717 | 9 |
| KRW-XRP | 15m | 21403 | -8273450.113805 | -386.555628 | 6686 | 14717 | 0 |
| KRW-XRP | 30m | 21373 | -7963246.977780 | -372.584428 | 7610 | 13763 | 0 |
| KRW-XRP | 60m | 21313 | -7402795.117594 | -347.337077 | 8433 | 12880 | 1 |
| KRW-XRP | 240m | 20953 | -4020746.923202 | -191.893615 | 9383 | 11570 | 10 |

Non-overlapping 240-minute validation of the top regimes:

| Label | Market | Signal | Trades | Total PnL KRW | Median PnL KRW | Test trades | Test PnL KRW | Test median PnL KRW |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| btc_low_vol15_240m | KRW-BTC | `vol_15m_krw <= 211374560.90359` | 117 | 9730.267332 | -57.860546 | 31 | 174.072048 | -185.694476 |
| eth_range5_240m | KRW-ETH | `range_5m_bps >= 17.559263` | 79 | -21160.226740 | -688.600289 | 19 | -21894.574420 | -689.771081 |
| eth_range15_240m | KRW-ETH | `range_15m_bps >= 54.849885` | 52 | -34538.126173 | -962.271577 | 11 | -18185.998791 | -1414.492754 |
| eth_ret1_drop_240m | KRW-ETH | `ret_1m_bps <= -5.839416` | 81 | -6463.112552 | -255.824683 | 21 | -27755.429485 | -690.191526 |
| xrp_ret1_drop_240m | KRW-XRP | `ret_1m_bps <= -4.725898` | 85 | -11753.514393 | -166.573296 | 24 | -26265.317529 | -400.000000 |
| xrp_ret60_drop_240m | KRW-XRP | `ret_60m_bps <= -23.969319` | 66 | 13450.130341 | 57.875458 | 16 | -15905.916997 | -400.000000 |
| xrp_range15_240m | KRW-XRP | `range_15m_bps >= 51.474029` | 48 | -9810.248958 | 77.099237 | 6 | -8715.123501 | -2261.330852 |

Interpretation:

- The 15/30/60-minute candle baselines were negative across BTC, ETH, and XRP.
- The apparent 240-minute ETH/XRP regimes did not survive non-overlapping
  validation or the final time split.
- `xrp_ret60_drop_240m` was positive in the full non-overlapping sample, but
  the held-out segment was negative by -15905.916997 KRW over 16 trades.
- `btc_low_vol15_240m` is the only non-overlapping candidate that stayed
  slightly positive in the held-out segment, but the effect is tiny: 174.072048
  KRW over 31 test trades, with a negative median trade. Because the scan is
  close-to-close and optimistic, this is not enough for paper or live promotion.
- This leaves no live-ready strategy. At most, BTC low-volume 240-minute holding
  can be kept as a future research hypothesis requiring explicit orderbook or
  paper replay evidence.

## Web-Informed Strategy Search And Maker Fill Audit

The user requested that the next strategy direction be chosen without waiting
for more user input. Current external and local constraints point to two
plausible directions:

- lower-turnover BTC time-series momentum with volatility/jump-risk filters;
- maker-first BTC execution, because Bithumb KRW spot fees and maker rewards
  materially change the cost hurdle if the order truly rests on the book.

External context checked on 2026-05-12:

- Bithumb customer support lists KRW market trading fees as 0.04% for maker and
  taker orders:
  `https://support.bithumb.com/hc/ko/articles/51131554420377`
- Bithumb's API order endpoint supports `limit`, market-buy `price`, and
  market-sell `market`, but the public order schema does not expose a
  post-only/maker-only flag:
  `https://apidocs.bithumb.com/reference/%EC%A3%BC%EB%AC%B8-%EC%9A%94%EC%B2%AD`
- Bithumb announced a 0.05% maker-order reward event for 100 KRW-market assets,
  subject to event registration and eligibility conditions:
  `https://feed.bithumb.com/notice/1652350`
- Academic and practitioner evidence remains more supportive of lower-turnover
  time-series momentum / risk-managed momentum than of ultra-short spot
  scalping after costs. Market making remains execution-sensitive because queue
  priority and adverse selection dominate the spread capture.

Local live-path constraints:

- live mode is still BTC-only (`DRY_RUN_MARKETS=KRW-BTC`);
- live venue submits ordinary limit orders, not maker-only orders;
- paper execution is not a maker queue simulator, so maker-first strategies need
  separate fill-quality measurement before any paper/live promotion.

To test whether the maker reward changes the local expectancy picture, a
conservative maker-buy fill audit was added.

Artifacts:

- script: `src/cli/analyze-maker-fill-quality.ts`
- test: `test/analyze-maker-fill-quality.test.ts`
- reports:
  - `var/reports/btc-maker-fill-quality-5k-20260512.json`
  - `var/reports/btc-maker-fill-quality-50k-20260512.json`
  - `var/reports/btc-maker-fill-quality-20260512.json`

Method:

- sample KRW-BTC orderbook level 0 every 15 seconds;
- assume a maker buy is posted at the current best bid;
- wait behind the displayed best-bid queue;
- count a fill only if subsequent sell-initiated trades (`ASK`) at or below the
  bid consume displayed queue plus the simulated order quantity before a
  60-second TTL;
- mark exit at future best bid after 30 and 60 seconds;
- report PnL both without maker reward and with the 0.05% maker reward.

Results:

| Notional KRW | Samples | Fill rate | Median fill delay | Horizon | Avg PnL no reward | Avg PnL with reward | Median PnL with reward | Winners/losers with reward |
| ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 5000 | 109610 | 0.567193 | 9.527s | 30s | -4.587584 | -2.087584 | -1.794669 | 2403 / 48882 |
| 5000 | 109610 | 0.567193 | 9.527s | 60s | -4.643198 | -2.143198 | -1.879627 | 3512 / 36562 |
| 50000 | 109610 | 0.552942 | 10.467s | 30s | -46.119419 | -21.119419 | -18.083472 | 2317 / 47682 |
| 50000 | 109610 | 0.552942 | 10.467s | 60s | -46.702845 | -21.702845 | -18.965128 | 3363 / 35646 |
| 500000 | 109610 | 0.504981 | 12.550s | 30s | -469.077065 | -219.077065 | -188.065499 | 2038 / 43505 |
| 500000 | 109610 | 0.504981 | 12.550s | 60s | -475.417840 | -225.417840 | -196.167024 | 2942 / 32479 |

Interpretation:

- The maker reward improves the cost hurdle but does not overcome adverse
  selection in local KRW-BTC orderbook/trade evidence.
- The negative median persists even at 5000 KRW notional, so the issue is not
  only order size or queue depth.
- Because Bithumb's order API does not expose a post-only flag, live code cannot
  guarantee maker execution anyway. A crossing limit order could become a taker
  order.
- Maker-first BTC execution is therefore rejected as a live candidate for now.
- The best remaining research direction is lower-turnover BTC time-series
  momentum with volatility/jump-risk filters, but it needs more history than the
  current local candle sample before it can become a paper/live candidate.

## Public Bithumb 60m Momentum Scan

To avoid relying only on the short local `candle_1m` sample, a public Bithumb
60-minute candle momentum scan was added. This fetches public KRW-BTC candles
from Bithumb, evaluates non-overlapping long-only time-series momentum trades,
uses close-to-close pricing, charges 8 bps round-trip cost, and splits the
sample into the first 70% train and last 30% test.
The scan now also reports five chronological walk-forward folds using the same
fixed candidate parameters; promotion requires at least four folds with
positive total and median PnL.
The scanner can also evaluate either explicit `--markets` or the top KRW
markets by 24-hour ticker volume with `--top-markets`.

Artifacts:

- script: `src/cli/analyze-bithumb-momentum.ts`
- test: `test/analyze-bithumb-momentum.test.ts`
- report: `var/reports/btc-public-60m-momentum-scan-20260512.json`

Coverage:

- market: `KRW-BTC`
- unit: 60-minute candles
- candle count: 5000
- from: `2025-10-15T14:00:00Z`
- to: `2026-05-12T10:00:00Z`
- candidate count: 272
- promotion candidate count: 0

Result:

- No candidate was positive in both train and test with positive held-out median
  PnL and sufficient walk-forward stability.
- The highest held-out results were positive in the latest 30% of the sample,
  but all corresponding train results were negative and unstable across
  chronological folds. For example:
  - `lookback=24h`, `hold=24h`, `minReturn=0bps`,
    `riskFilter=range24_below_p70`
  - train: 90 trades, -146986.385623 KRW total, -2660.589655 KRW median
  - test: 48 trades, +85564.618608 KRW total, +914.128612 KRW median
  - walk-forward: 2/5 folds had positive total and median PnL; total
    -43550.555226 KRW; worst fold -120369.805722 KRW

Interpretation:

- The public 60m scan supports the idea that recent BTC momentum was favorable,
  but it does not prove a stable rule because the same rules were negative in
  the train period and failed walk-forward stability.
- This blocks immediate paper/live promotion of a 1h-4h momentum strategy.
- The right operational next step is a longer observation/research track for
  risk-managed BTC momentum, not live execution.

## Public Bithumb KRW Top-20 Momentum Scan

The same public 60-minute momentum scan was expanded from BTC-only research to
the top 20 KRW spot markets by 24-hour Bithumb ticker volume.

Artifact:

- report: `var/reports/krw-top20-public-60m-momentum-scan-20260512.json`

Coverage:

- market count: 20
- candidate count: 5440
- failures: 0
- strict promotion candidate count: 0
- generated at: `2026-05-12T11:06:03.843Z`

Strict promotion minimums:

- at least 3000 candles;
- at least 30 train trades;
- at least 15 test trades;
- at least 60 train+test trades;
- positive train and test median PnL;
- positive walk-forward total PnL;
- non-negative worst fold PnL.

Result:

- No top-20 KRW market produced a strict promotion candidate.
- Looser candidates appeared in `KRW-VVV`, `KRW-H`, and `KRW-KITE`, but they
  were rejected after stricter checks:
  - `KRW-VVV` had only 972 candles, so it is a short listing/regime artifact.
  - `KRW-H` had only 19 train trades and a negative worst walk-forward fold.
  - `KRW-KITE` had only 13 test trades and a negative worst walk-forward fold.
- The largest recent held-out winners were mostly `KRW-OSMO`, but those rules
  had negative train medians, negative test medians, and failed walk-forward
  stability.

Live-path constraint:

- A subagent code audit confirmed that current managed live startup is still
  BTC-only: `DRY_RUN_EXECUTION_MODE=live` requires `DRY_RUN_MARKETS=KRW-BTC`,
  runtime live risk policy narrows allowed markets to `KRW-BTC`, and live
  account/position preflight reconstructs only KRW/BTC state.
- Therefore, even if an alt-market research candidate appears later, it cannot
  go live until the live state, risk, benchmark, and venue preflight paths are
  generalized and separately tested.

## Public Bithumb KRW Top-20 Cross-Sectional Momentum Scan

Because crypto momentum literature also supports testing cross-sectional
relative strength, a separate scanner was added for a simple rotation strategy:
at each rebalance point, rank eligible KRW markets by lookback return and hold
the single strongest market for the configured holding period. This directly
tests whether market selection across KRW spot assets is better than the
single-market time-series rules.

External research context checked on 2026-05-12:

- `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4675565`
- `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4322637`
- `https://www.sciencedirect.com/science/article/abs/pii/S1057521924001765`

Artifacts:

- script: `src/cli/analyze-bithumb-cross-sectional-momentum.ts`
- test: `test/analyze-bithumb-cross-sectional-momentum.test.ts`
- report:
  `var/reports/krw-top20-public-60m-cross-sectional-momentum-scan-20260512.json`

Coverage:

- selected markets: current Bithumb top 20 KRW markets by 24-hour ticker volume
- timestamp count: 5796
- from: `2025-09-12T06:00:00Z`
- to: `2026-05-12T11:00:00Z`
- candidate count: 96
- promotion candidate count: 0
- generated at: `2026-05-12T11:15:33.287Z`

Result:

- No cross-sectional rotation rule passed promotion criteria.
- The strongest held-out variants were all `lookback=24h`, `hold=24h`, but
  failed the same way:
  - train PnL was negative;
  - train median PnL was negative;
  - test median PnL was negative even when test total PnL was positive;
  - walk-forward stability failed with negative worst fold PnL.
- Example top held-out variant:
  - `lookback=24h`, `hold=24h`, `minReturn=50bps`,
    `minEligibleMarkets=3`
  - train: 146 trades, -580608.276044 KRW total,
    -10287.005650 KRW median
  - test: 69 trades, +1072667.043166 KRW total,
    -1954.225190 KRW median
  - walk-forward: 0/5 positive total+median folds, total
    -309611.488385 KRW, worst fold -705151.357592 KRW

Interpretation:

- The positive held-out total is not enough because it is driven by a small
  number of large winners while median trade quality is still negative.
- Cross-sectional KRW spot rotation is therefore not a paper/live candidate.
- This reinforces the current operational conclusion: do not restart live or
  paper execution for a strategy family until forward evidence produces
  positive median trade quality and stable walk-forward performance.

## Public Bithumb KRW Top-20 Reversal Scan

Momentum and cross-sectional rotation failed, so the public 60-minute scanner
was extended with `--signal-mode reversal` to test long-only mean reversion:
enter after a negative lookback return, hold for a fixed horizon, charge
round-trip costs, and require the same strict train/test and walk-forward
promotion criteria.

External research context checked on 2026-05-12:

- `https://www.sciencedirect.com/science/article/pii/S1057521921002349`
- `https://digitalcommons.fairfield.edu/business-facultypubs/246/`
- `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3913263`

Artifacts:

- updated script: `src/cli/analyze-bithumb-momentum.ts`
- updated test: `test/analyze-bithumb-momentum.test.ts`
- report: `var/reports/krw-top20-public-60m-reversal-scan-20260512.json`
- stress reports:
  - `var/reports/thq-public-60m-reversal-fee80-scan-20260512.json`
  - `var/reports/thq-public-60m-reversal-fee100-scan-20260512.json`

Initial 8 bps result:

- selected markets: current Bithumb top 20 KRW markets by 24-hour ticker volume
- candidate count: 5440
- strict promotion candidate count: 4
- all strict candidates were `KRW-THQ`
- top candidate:
  - `lookback=12h`, `hold=4h`, `dropThreshold=50bps`,
    `riskFilter=rv24_below_median`
  - train: 180 trades, +145937.444873 KRW total, +831.729348 KRW median
  - test: 95 trades, +251086.113099 KRW total, +2600.300030 KRW median
  - walk-forward: 5/5 positive total+median folds, +387373.276046 KRW total,
    worst fold +12172.380342 KRW

Cost and execution stress:

- A current public orderbook check for `KRW-THQ` showed best ask 39.91 and
  best bid 39.58, an immediate spread of roughly 83 bps before ordinary trading
  fees.
- The scanner was extended with `--fee-round-trip-bps` to stress realistic
  all-in execution costs.
- At 80 bps round-trip cost:
  - promotion candidate count: 0
  - best held-out rule had train -305264.940793 KRW, test +68966.273838 KRW,
    and walk-forward total -296235.251883 KRW.
- At 100 bps round-trip cost:
  - promotion candidate count: 0
  - best held-out rule had train -332264.940793 KRW, test +57966.273838 KRW,
    and walk-forward total -335235.251883 KRW.

Interpretation:

- `KRW-THQ` reversal is the first rule family to pass the strict statistical
  gate under low-cost close-to-close assumptions.
- It is not live-ready because realistic current spread/slippage stress removes
  the edge.
- It is also not directly live-runnable because the managed live path is still
  BTC-only.
- The defensible next step is not live execution; it is a forward paper
  observation candidate only if execution can be modeled with orderbook-aware
  fills and spread/liquidity controls.

## THQ Reversal Forward Observation

To avoid promoting the low-cost `KRW-THQ` reversal backtest on synthetic
close-to-close prices, a public forward observation CLI was added. It does not
place orders. It checks whether the exact reversal candidate is currently
active and whether the live public orderbook spread/depth is compatible with
the historical median edge.

Artifacts:

- script: `src/cli/observe-bithumb-reversal-candidate.ts`
- report: `var/reports/thq-reversal-forward-observation-20260512.json`

Observation generated at `2026-05-12T11:29:56.146Z`:

- candidate: `KRW-THQ`, `lookback=12h`, `hold=4h`,
  `dropThreshold=50bps`, `riskFilter=rv24_below_median`,
  `riskThreshold=568.5299870739053`
- expected median edge from low-cost held-out scan: about 52.006 bps
- 12-hour return: -1327.241079 bps
- risk value: 2670.068390, so the volatility/risk filter failed
- best ask / bid: 39.88 / 39.58
- spread: 75.795856 bps
- spread minus expected median edge: +23.789856 bps
- 500000 KRW top-book depth was available on both sides, but spread and risk
  filter blocked observation.

Decision:

- `executionViability = blocked_by_signal_or_execution_cost`
- reasons:
  - `reversal_signal_inactive`
  - `spread_exceeds_expected_median_edge`

Interpretation:

- The candidate should not be run live now.
- It should also not be converted into a normal paper PM2 candidate yet,
  because paper fills would not model the dominant observed cost problem.
- The only acceptable forward path is repeated public observation of signal,
  spread, and depth until there is evidence that the edge survives realistic
  execution conditions.

## THQ Canonical Collector Smoke Run

A subagent code audit confirmed that the existing Python data collector already
captures the data needed for forward observation: REST candles/trades/ticker/
orderbook plus websocket ticker/trade/orderbook, written to raw and canonical
NDJSON partitions. It also warned that PM2 paper expansion would mix observation
with execution, carry-forward state, risk allowlists, and BTC-oriented entry
profiles.

Following that recommendation, a short THQ-only collector run was executed
without changing the PM2 paper path:

```sh
.venv/bin/python -m org_coin_data bootstrap \
  --base-dir var/thq-observation-data \
  --markets KRW-THQ \
  --candle-count 200 \
  --trade-count 200 \
  --ws-seconds 60 \
  --trade-warmup-seconds 5 \
  --iterations 1 \
  --interval-seconds 0 \
  --ws-channels ticker,trade,orderbook
```

Artifacts:

- manifest:
  `var/thq-observation-data/replay/manifests/manifest-a531117b73db4722a16e787399a8081d.json`
- quality report:
  `var/thq-observation-data/replay/reports/quality-a531117b73db4722a16e787399a8081d.md`
- passive feature report:
  `var/thq-observation-data/replay/reports/passive-features-a531117b73db4722a16e787399a8081d.md`
- preflight report:
  `var/thq-observation-data/replay/reports/preflight-a531117b73db4722a16e787399a8081d.md`

Collector results:

- total canonical records: 6632
- `candle_1m`: 200 records
- `trade_tick`: 375 records
- `orderbook_snapshot`: 337 records
- `orderbook_level`: 5070 records
- `passive_feature_snapshot`: 175 records

Execution-quality evidence from the passive/preflight reports:

- only 1 KST day was captured, so threshold tuning is not ready;
- median spread was 100.984600 bps;
- p05/p95 spread range was 70.814365 to 128.771620 bps;
- median 60-second trade count was 2;
- median 60-second notional was 480552.260932 KRW;
- default preflight eligible snapshots: 0 / 175;
- latest failures included stale/insufficient coverage, weak 5-minute return,
  depth ratio failure, `spread_bps <= 8` failure, and 24-hour turnover below the
  default 30B KRW gate.

The same canonical snapshots were then checked with the TypeScript reversal
observation audit:

```sh
npm run dry-run:analyze-reversal-observation-data -- \
  --base-dir var/thq-observation-data \
  --market KRW-THQ \
  --expected-median-edge-bps 52.006 \
  --output var/reports/thq-reversal-canonical-observation-20260512.json
```

Result:

- snapshot count: 175;
- edge-compatible spread snapshots: 0 / 175 at `spread_bps <= 52.006`;
- live-spread-compatible snapshots: 0 / 175 at `spread_bps <= 8`;
- execution-environment pass snapshots: 0 / 175;
- decision: `paperObservationCandidate = false`, `liveCandidate = false`;
- reasons:
  - `spread_never_below_expected_median_edge`
  - `spread_never_below_live_gate`
  - `no_snapshot_passed_execution_environment_gates`

Interpretation:

- The collector path is usable for THQ observation.
- The observed execution environment remains incompatible with immediate
  paper/live promotion.
- PM2 paper should not be started for THQ until repeated canonical observation
  shows spread/liquidity conditions that can support the reversal edge.

## Current Bithumb Execution Universe Screen

Bithumb's public API documentation lists public market, ticker, and orderbook
endpoints for unauthenticated market-data access. A public REST execution
universe screen was added so strategy research can first reject markets whose
current spread, depth, or turnover cannot support realistic execution.

Command:

```sh
npm run dry-run:analyze-bithumb-execution-universe -- \
  --top-markets 50 \
  --notional-krw 500000 \
  --max-spread-bps 20 \
  --min-turnover-24h-krw 30000000000 \
  --output var/reports/bithumb-top50-execution-universe-20260512.json
```

Result generated at `2026-05-12T11:50:02.385Z`:

- observed market count: 50;
- execution candidates: 4 / 50;
- live-compatible execution candidates under the current BTC-only live path:
  1 / 50;
- execution candidates:
  - `KRW-BTC`: spread 2.007495 bps, 24h turnover
    60582853723.078960 KRW, live-compatible;
  - `KRW-XRP`: spread 4.662005 bps, 24h turnover
    77185331402.221650 KRW, not live-compatible with current infrastructure;
  - `KRW-ETH`: spread 5.904931 bps, 24h turnover
    45986851112.759550 KRW, not live-compatible with current infrastructure;
  - `KRW-USDT`: spread 6.756757 bps, 24h turnover
    131446876616.773960 KRW, not live-compatible with current infrastructure.

Interpretation:

- This is an execution screen only, not profitability evidence.
- The current live path still points back to `KRW-BTC` as the only market that
  is both execution-clean and infrastructure-compatible.
- XRP, ETH, and USDT can be kept as research/observation markets, but using
  them for live would require live-path generalization and separate risk/account
  reconciliation work.
- Most top-50 KRW markets should not be used for near-term strategy promotion
  until repeated observation shows lower spread and/or higher turnover.

## Execution-Filtered Public Strategy Rescan

The four markets that passed the current execution screen were rescanned with
the same public 60-minute time-series framework:

```sh
npm run dry-run:analyze-bithumb-momentum -- \
  --markets KRW-BTC,KRW-XRP,KRW-ETH,KRW-USDT \
  --signal-mode momentum \
  --unit-minutes 60 \
  --max-candles 5000 \
  --output var/reports/execution-candidates-public-60m-momentum-scan-20260512.json

npm run dry-run:analyze-bithumb-momentum -- \
  --markets KRW-BTC,KRW-XRP,KRW-ETH,KRW-USDT \
  --signal-mode reversal \
  --unit-minutes 60 \
  --max-candles 5000 \
  --output var/reports/execution-candidates-public-60m-reversal-scan-20260512.json
```

Momentum result generated at `2026-05-12T11:52:12.286Z`:

- markets: 4;
- candidates: 1088;
- promotion candidates: 0;
- `KRW-BTC` top held-out rule had train total -146986.385623 KRW,
  train median -2660.589655 KRW, walk-forward total -43321.660663 KRW,
  and worst fold -120369.805722 KRW;
- `KRW-XRP`, `KRW-ETH`, and `KRW-USDT` also had zero promotion candidates.

Reversal result generated at `2026-05-12T11:52:32.538Z`:

- markets: 4;
- candidates: 1088;
- promotion candidates: 0;
- `KRW-BTC` top held-out rule had train total -107518.282195 KRW,
  train median -1951.626189 KRW, only 2/5 all-positive folds, and worst
  fold -42245.389896 KRW;
- `KRW-XRP`, `KRW-ETH`, and `KRW-USDT` also had zero promotion candidates.

Interpretation:

- Filtering by current execution quality did not reveal a strategy candidate.
- The only live-compatible market, `KRW-BTC`, still lacks a robust public
  60-minute momentum or reversal rule.
- Non-BTC live-path generalization is not justified by this evidence yet,
  because the execution-clean non-BTC markets also failed promotion.

## BTC Public 240m Momentum Candidate

Because the current execution screen points back to `KRW-BTC` as the only
live-compatible market, the public scan was extended from 60-minute candles to
240-minute candles for BTC only.

Commands:

```sh
npm run dry-run:analyze-bithumb-momentum -- \
  --market KRW-BTC \
  --signal-mode momentum \
  --unit-minutes 240 \
  --max-candles 5000 \
  --output var/reports/btc-public-240m-momentum-scan-20260512.json

npm run dry-run:analyze-bithumb-momentum -- \
  --market KRW-BTC \
  --signal-mode reversal \
  --unit-minutes 240 \
  --max-candles 5000 \
  --output var/reports/btc-public-240m-reversal-scan-20260512.json
```

Result:

- BTC 240m momentum, generated `2026-05-12T11:55:15.347Z`:
  272 candidates, 6 promotion candidates at 8 bps round-trip cost.
- Top 8 bps candidate:
  - lookback 8 bars, hold 8 bars, min return 50 bps,
    `range24_below_p70`;
  - train: 188 trades, total +353009.355000 KRW, median
    +433.686047 KRW;
  - test: 87 trades, total +102509.971947 KRW, median
    +1234.831802 KRW;
  - walk-forward: 5/5 all-positive folds, total +499673.583690 KRW,
    worst fold +13619.402881 KRW.
- BTC 240m reversal, generated `2026-05-12T11:55:15.345Z`:
  272 candidates, 0 promotion candidates.

Cost stress:

```sh
npm run dry-run:analyze-bithumb-momentum -- \
  --market KRW-BTC \
  --signal-mode momentum \
  --unit-minutes 240 \
  --max-candles 5000 \
  --fee-round-trip-bps 20 \
  --output var/reports/btc-public-240m-momentum-fee20-scan-20260512.json

npm run dry-run:analyze-bithumb-momentum -- \
  --market KRW-BTC \
  --signal-mode momentum \
  --unit-minutes 240 \
  --max-candles 5000 \
  --fee-round-trip-bps 40 \
  --output var/reports/btc-public-240m-momentum-fee40-scan-20260512.json
```

- At 20 bps, 1 promotion candidate remained:
  - lookback 24 bars, hold 24 bars, min return 25 bps,
    `rv24_below_p70`, risk threshold 435.9906664851208;
  - train: 89 trades, total +534787.963262 KRW, median
    +1538.139872 KRW;
  - test: 37 trades, total +6072.591529 KRW, median +184.523884 KRW;
  - walk-forward: 4/5 all-positive folds, total +580428.714333 KRW,
    worst fold +157.464062 KRW.
- At 40 bps, 0 promotion candidates remained.

Single-candidate buy-and-hold benchmark for the 20 bps survivor:

```sh
npm run dry-run:analyze-bithumb-candidate-benchmark -- \
  --market KRW-BTC \
  --signal-mode momentum \
  --unit-minutes 240 \
  --max-candles 5000 \
  --lookback-bars 24 \
  --hold-bars 24 \
  --min-return-bps 25 \
  --risk-filter rv24_below_p70 \
  --risk-threshold 435.9906664851208 \
  --fee-round-trip-bps 20 \
  --output var/reports/btc-240m-momentum-benchmark-fee20-20260512.json
```

Result generated `2026-05-12T12:10:58.605Z`:

- source: 5000 BTC 240m candles from `2024-01-29T23:00:00.000Z` to
  `2026-05-12T11:00:00.000Z`;
- strategy: 125 non-overlapping compounded trades, 69 winners, 56 losers;
- final capital from 500000 KRW: 1325618.538417 KRW;
- strategy return: +165.123708%;
- annualized strategy return: +53.306438%;
- max drawdown: -18.729571%;
- exposure: 60%;
- full-period BTC buy-and-hold return: +101.075450%;
- excess return versus BTC buy-and-hold: +64.048258 percentage points.

Forward observation for the 20 bps survivor:

```sh
npm run dry-run:observe-bithumb-reversal-candidate -- \
  --market KRW-BTC \
  --signal-mode momentum \
  --unit-minutes 240 \
  --max-candles 200 \
  --lookback-bars 24 \
  --hold-bars 24 \
  --min-return-bps 25 \
  --risk-filter rv24_below_p70 \
  --risk-threshold 435.9906664851208 \
  --notional-krw 500000 \
  --expected-median-edge-bps 15.690478 \
  --output var/reports/btc-240m-momentum-forward-observation-20260512.json
```

Result generated `2026-05-12T11:57:48.043Z`:

- signal active: true;
- latest 240m candle: `2026-05-12T11:00:00.000Z`;
- lookback return: +98.648649 bps versus a +25 bps threshold;
- risk value: 164.073982, below the 435.990666 threshold;
- orderbook spread: 0.669075 bps;
- 500000 KRW buy and sell depth: covered;
- decision: `paperObservationOnly = true`,
  `executionViability = watch_candidate`.

Latest forward observation after adding top-of-book size fields:

- artifact: `var/reports/btc-240m-momentum-forward-observation-20260512-latest.json`;
- generated: `2026-05-12T12:19:53.794Z`;
- signal active: true;
- latest 240m candle: `2026-05-12T11:00:00.000Z`;
- lookback return: +105.912162 bps versus a +25 bps threshold;
- risk value: 164.517584, below the 435.990666 threshold;
- orderbook spread: 0.167151 bps;
- best ask size: 0.0328 BTC, best bid size: 0.0757 BTC;
- 500000 KRW buy and sell depth: covered at level 1;
- execution viability: `watch_candidate`.

Paper observation replay:

```sh
npm run dry-run:run-bithumb-time-series-paper-observation -- \
  --input-observation var/reports/btc-240m-momentum-forward-observation-20260512-latest.json \
  --reports-dir var/paper-sessions-btc-240m-momentum-observation \
  --output var/reports/btc-240m-momentum-paper-observation-20260512.json
```

Result generated `2026-05-12T12:20:07.954Z`:

- attempted signal: true;
- accepted paper signals: 1;
- paper order status: filled;
- requested quote notional: 500000 KRW;
- executed quote notional: 500024.178775 KRW;
- average fill price: 119659786.174288 KRW;
- fees paid: 200.009672 KRW;
- reconciliation: OK;
- open position count: 1, explicitly carried because the 24-bar hold window has
  not elapsed;
- artifact root:
  `var/paper-sessions-btc-240m-momentum-observation/date=2026-05-12/session=paper-btc_240m_momentum_public_v1-2026-05-12T110000000Z`.

Open paper position audit:

```sh
npm run dry-run:audit-bithumb-time-series-paper-position -- \
  --input-paper-report var/paper-sessions-btc-240m-momentum-observation/date=2026-05-12/session=paper-btc_240m_momentum_public_v1-2026-05-12T110000000Z/report.json \
  --input-observation var/reports/btc-240m-momentum-forward-observation-20260512-latest.json \
  --output var/reports/btc-240m-momentum-paper-position-audit-20260512.json
```

Result generated `2026-05-12T12:27:06.276Z`:

- entry candle: `2026-05-12T11:00:00.000Z`;
- observed at: `2026-05-12T12:19:53.794Z`;
- configured hold exit due: `2026-05-16T11:00:00.000Z`;
- hold elapsed: false;
- minutes until configured hold exit: 5680.103433;
- current diagnostic mark bid: 119652000 KRW;
- entry cost including entry fee: 500224.188447 KRW;
- estimated immediate exit fee: 199.996657 KRW;
- estimated immediate exit net PnL: -432.542534 KRW;
- estimated immediate exit return: -0.086470%;
- exit attempted: false, reason `hold_window_not_elapsed`.

The mark is diagnostic only. It must not be treated as a failed strategy result
because the configured 24-bar hold window has not elapsed.

Combined time-series readiness gate:

```sh
npm run dry-run:audit-bithumb-time-series-readiness -- \
  --benchmark var/reports/btc-240m-momentum-benchmark-fee20-20260512.json \
  --observation var/reports/btc-240m-momentum-forward-observation-20260512-latest.json \
  --paper-observation var/reports/btc-240m-momentum-paper-observation-20260512.json \
  --position-audit var/reports/btc-240m-momentum-paper-position-audit-20260512.json \
  --output var/reports/btc-240m-momentum-readiness-20260512.json
```

Result generated `2026-05-12T12:32:28.861Z`:

- classification: `paper_candidate`;
- paper readiness: true;
- live readiness: false;
- benchmark checks: pass, including +64.048258 percentage points excess versus
  BTC buy-and-hold and -18.729571% max drawdown under the 25% gate;
- observation checks: pass;
- paper entry checks: pass;
- live blockers:
  - `realizedExitAvailable`;
  - `noOpenPaperPositionAfterExit`.

Interpretation:

- This is the first BTC-only candidate in this cycle with positive train,
  held-out, walk-forward, and BTC buy-and-hold benchmark evidence under
  realistic base costs.
- It has now passed one paper observation entry through the paper risk/fill
  path using current top-of-book data.
- It is not live-ready yet. The 20 bps stress survivor is thin in held-out
  total PnL, the whole family fails at 40 bps, and the paper observation has no
  realized exit yet.
- The open paper position audit now records the exact hold due time and blocks
  premature exits by default; reduce-only paper exit is available only after
  the hold window has elapsed.
- The combined readiness gate now prevents a paper entry from being mistaken
  for live approval. It classifies the candidate as `paper_candidate` until the
  24-bar reduce-only exit is realized and reconciled.

Operational refresh wrapper:

```sh
npm run dry-run:refresh-btc-240m-momentum-readiness
```

Latest gate refresh generated `2026-05-12T13:33:15.569Z` with
`--live-execution-path-ready --execute-exit-when-due --require-live-ready`
after aligning readiness checks with live startup validation:

- observation artifact:
  `var/reports/btc-240m-momentum-forward-observation-20260512-refresh.json`;
- position audit artifact:
  `var/reports/btc-240m-momentum-paper-position-audit-20260512-refresh.json`;
- readiness artifact:
  `var/reports/btc-240m-momentum-readiness-20260512-refresh.json`;
- stable readiness artifact used by the live PM2 guard:
  `var/reports/btc-240m-momentum-readiness-latest-refresh.json`;
- classification: `paper_candidate`;
- paper ready: true;
- live ready: false;
- live blockers: `realizedExitAvailable`, `noOpenPaperPositionAfterExit`;
- hold exit due: `2026-05-16T11:00:00.000Z`;
- refreshed diagnostic mark PnL: -1330.606953 KRW, still not realized because
  the hold window has not elapsed.
- exit attempted: false, `hold_window_not_elapsed`;
- current exit registry count: 0, as expected before the hold window elapses.

The refresh wrapper is the current operational command for this candidate. It
does not change strategy parameters. It refreshes public observation, audits
the existing paper position, and reruns readiness. When the hold window has
elapsed, it can be run with `--execute-exit-when-due`; live still remains
blocked unless the realized reduce-only exit reconciles cleanly and a 240m
live execution path is explicitly ready.

Managed live startup guard update:

- `src/runtime/dry-run-service-config.ts` now requires
  `liveReadiness.checks.liveExecutionPathReady === true` for every managed live
  startup, not only for this BTC 240m refresh gate.
- The live startup validator also accepts the BTC 240m readiness artifact shape
  when it is truly `live_candidate`, all BTC time-series readiness checks are
  true, benchmark excess return is positive, and the benchmark used at least
  20 bps round-trip cost.
- This prevents any readiness artifact from enabling live solely on PnL or
  benchmark evidence when the actual signal generation/execution path is not
  ready.

BTC 240m live execution path audit:

```sh
npm run dry-run:audit-btc-240m-live-execution-path -- \
  --output var/reports/btc-240m-live-execution-path-audit-20260512.json
```

Result generated `2026-05-12T13:08:45.044Z`:

- ready: true;
- all execution-path components pass:
  - refresh command;
  - paper observation command;
  - reduce-only exit audit;
  - readiness command;
  - PM2 paper observer wiring for repeated refreshes;
  - readiness gate requiring `liveExecutionPathReady`;
  - live startup validation for BTC 240m readiness artifacts;
  - managed service generation of the BTC 240m signal;
  - `live-btc-manager` wiring to the BTC 240m profile.

Managed service smoke check:

```sh
env TRADING_MODE=paper ENABLE_LIVE_EXECUTION=false \
  DRY_RUN_EXECUTION_MODE=paper DRY_RUN_MARKETS=KRW-BTC \
  DRY_RUN_ENTRY_PROFILE=btc_240m_momentum_public_v1 \
  DRY_RUN_LOG_DIR=var/log/dry-run-btc-240m-momentum-managed-paper-test \
  PAPER_SESSION_ARTIFACTS_DIR=var/paper-sessions-btc-240m-momentum-managed-test \
  npm run dry-run:service -- --once
```

Result generated `2026-05-12T13:09:22.015Z`:

- paper managed cycle completed with `signalAction = buy`;
- 1 order, 1 fill, 1 decision;
- reconciliation OK;
- immediate mark PnL -451.797490 KRW, diagnostic only because the 24-bar hold
  window has not elapsed.

This removes the execution-path blocker and wires the observer to execute the
reduce-only paper exit when the hold window is due. It does not make the
candidate live-ready today. Live remains blocked by missing realized reduce-only
paper exit evidence for the current 24-bar hold window and the still-open paper
position.

`live-btc-manager` is wired to the stable readiness artifact, but
`LIVE_READINESS_APPROVED=false` remains in PM2 config. The live app therefore
has a deterministic readiness input path without allowing live startup before
the final manual approval gate is changed.

Live startup guard smoke checks:

- with `LIVE_READINESS_APPROVED=false`, `loadDryRunServiceConfig` rejects live
  mode before using the readiness artifact;
- even if `LIVE_READINESS_APPROVED=true` is forced locally, the current stable
  readiness artifact is still rejected because it is `paper_candidate`, not
  `live_candidate`.
- `pm2:start:live-btc` and `pm2:restart:live-btc` now run
  `dry-run:gate-btc-240m-live-ready` before touching PM2. The gate refreshes
  latest readiness with `--execute-exit-when-due --require-live-ready`, so the
  current state exits nonzero before any live PM2 process can be started.
- This was verified by running `npm run pm2:start:live-btc`; it exited nonzero
  at the live gate and `pm2 list` showed no `live-btc-manager` process.
- The paper position audit now writes an exit registry when a reduce-only exit
  is first realized. Repeated refreshes for the same entry signal reuse that
  registry instead of generating duplicate paper exit sessions.
- Time-series live readiness now separates a currently inactive entry signal
  from execution-cost failures. After a realized exit, an inactive signal can
  allow live service startup in wait mode, but spread/depth/cost reasons still
  block live readiness through `noExecutionCostReasons`.
- The benchmark improves confidence that the rule is not merely reporting
  positive PnL during a BTC bull window, but it is still research evidence
  until repeated paper observations and the first hold-window exit are measured.
- The next defensible step is to keep the BTC 240m paper observation path
  running at each 240m candle boundary and add/record the reduce-only exit when
  the configured 24-bar hold window elapses.
