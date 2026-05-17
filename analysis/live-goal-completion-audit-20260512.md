# Live Goal Completion Audit - 2026-05-12

Objective:

> 서브에이전트랑 현 분석을 토대로 라이브를 진행할 수 있는 것을 goal로 잡고 개선 진행해

Concrete success criteria:

- at least one strategy candidate has positive traded PnL and positive closed
  trade PnL after realistic costs;
- the candidate passes the paper/live promotion gates or has a clearly defined
  next paper-candidate basis;
- entry loosening, exit changes, or market changes are supported by local
  evidence rather than optimistic marks;
- current operational processes do not continue running rejected loss-making
  candidates.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Result |
| --- | --- | --- |
| Use current analysis evidence, not speculation | `var/reports/current-live-audit-all-running-recheck-20260512.json`, generated `2026-05-11T15:31:22.623Z` | Completed |
| Check live/paper readiness | audit `recommendation.decisionSummary.live = blocked`, `paper = blocked`, `nextPaperCandidate = null` | Failed |
| Confirm actual candidate PnL | audit candidates: `confirm3` -9214.861756 KRW, `trend` -10630.176563 KRW, `hold` -3961.870220 KRW, `guarded` -10430.892349 KRW, `ret1-turnover-cap` -6757.944681 KRW | Failed |
| Separate closed-trade quality from open mark dependency | closed PnL: `trend` -6061.730612 KRW, `hold` -1182.867804 KRW, `guarded` -5573.105029 KRW, `ret1-turnover-cap` -3160.218593 KRW; only `confirm3` closed PnL was slightly positive at 58.230895 KRW while total PnL was still negative | Failed |
| Check whether suppressed entries justify loosening gates | suppressed opportunity reports showed zero positive fixed-horizon gate groups at `+5m` or `+15m`; summarized in `analysis/live-readiness-20260510.md` | Failed |
| Check whether short-horizon passive BTC/ETH/XRP regimes exist | `var/reports/all-market-passive-regime-scan-fixed-horizon-20260512.json`: zero positive single-feature and two-feature regimes for 30s, 60s, and 120s across BTC, ETH, and XRP | Failed |
| Check whether longer candle swing regimes produce a candidate | `var/reports/all-market-candle1m-swing-regime-scan-20260512.json` and `var/reports/all-market-candle1m-swing-regime-nonoverlap-validation-20260512.json` | Weak / failed |
| Validate overlapping candle positives with non-overlapping trades and time split | ETH/XRP apparent 240m positives failed held-out validation; `xrp_ret60_drop_240m` held-out PnL -15905.916997 KRW. `btc_low_vol15_240m` held-out PnL was only 174.072048 KRW over 31 trades with negative median PnL | Failed for promotion |
| Use web research and subagent analysis to choose the next strategy family | External evidence favored lower-turnover time-series/risk-managed momentum; Bithumb fee/reward docs justified testing maker-first execution; local live-path subagent confirmed BTC-only live and no post-only support | Completed |
| Test whether Bithumb maker rewards create a local BTC execution edge | `var/reports/btc-maker-fill-quality-5k-20260512.json`, `var/reports/btc-maker-fill-quality-50k-20260512.json`, `var/reports/btc-maker-fill-quality-20260512.json` | Failed |
| Verify maker-first strategy against adverse selection | Conservative best-bid maker fill audit stayed negative after the 0.05% maker reward at 5000, 50000, and 500000 KRW notionals | Failed |
| Test the selected research direction, lower-turnover BTC time-series momentum | `var/reports/btc-public-60m-momentum-scan-20260512.json` over 5000 public Bithumb 60m candles | Failed for promotion |
| Require train/test consistency for momentum candidates | public 60m scan found zero promotion candidates; top held-out winners had negative train PnL and negative train medians | Failed |
| Require walk-forward stability for momentum candidates | public 60m scan now checks five chronological folds; the top held-out candidate passed only 2/5 fold total+median checks and had -43550.555226 KRW fold-summed PnL | Failed |
| Expand research beyond BTC without changing live risk | `src/cli/analyze-bithumb-momentum.ts` now supports explicit `--markets` and volume-ranked `--top-markets` scans | Completed |
| Scan Bithumb top KRW spot markets for lower-turnover momentum | `var/reports/krw-top20-public-60m-momentum-scan-20260512.json`, generated `2026-05-12T11:06:03.843Z`, evaluated 20 markets and 5440 candidates | Failed for promotion |
| Reject undersampled/new-listing alt positives | strict promotion minimums require 3000 candles, 30 train trades, 15 test trades, 60 total train+test trades, positive medians, positive walk-forward total, and non-negative worst fold | Completed |
| Test cross-sectional KRW market rotation instead of single-market momentum only | `var/reports/krw-top20-public-60m-cross-sectional-momentum-scan-20260512.json`, generated `2026-05-12T11:15:33.287Z`, evaluated 96 rotation candidates | Failed for promotion |
| Verify cross-sectional positives are not driven by a few large held-out winners | top held-out rotation had test total +1072667.043166 KRW but train total -580608.276044 KRW, train median -10287.005650 KRW, test median -1954.225190 KRW, and 0/5 positive total+median walk-forward folds | Failed |
| Test long-only reversal / mean-reversion after momentum failed | `var/reports/krw-top20-public-60m-reversal-scan-20260512.json`, generated `2026-05-12T11:21:14.885Z`, evaluated 20 markets and 5440 candidates | Weak pass under low-cost assumption |
| Stress the only reversal candidate against realistic spread/slippage | `KRW-THQ` passed at 8 bps, but current orderbook spread was roughly 83 bps; `thq-public-60m-reversal-fee80-scan-20260512.json` and `thq-public-60m-reversal-fee100-scan-20260512.json` both had zero promotion candidates | Failed for live/paper promotion |
| Add forward observation instead of paper/live execution for THQ | `src/cli/observe-bithumb-reversal-candidate.ts` and `var/reports/thq-reversal-forward-observation-20260512.json` measure current signal, spread, and depth without placing orders | Completed |
| Check current THQ candidate state | forward observation generated `2026-05-12T11:29:56.146Z`: risk filter failed, spread 75.795856 bps exceeded expected median edge by 23.789856 bps, and decision was `blocked_by_signal_or_execution_cost` | Failed for execution |
| Use subagent/code audit to choose the smallest THQ forward path | subagent confirmed Python collector already captures THQ candles/trades/ticker/orderbook and warned PM2 paper expansion would mix observation with execution/risk/carry-forward state | Completed |
| Run THQ-only canonical collector smoke observation | `var/thq-observation-data/replay/manifests/manifest-a531117b73db4722a16e787399a8081d.json` contains 6632 canonical records including 200 candles, 375 trades, 337 orderbook snapshots, 5070 orderbook levels, and 175 passive feature snapshots | Completed |
| Verify THQ observation data supports execution promotion | passive/preflight reports show threshold tuning not ready, median spread 100.984600 bps, p05/p95 spread 70.814365/128.771620 bps, 0/175 eligible snapshots, and turnover below the default 30B KRW gate | Failed |
| Convert THQ canonical observation into a repeatable TS audit | `var/reports/thq-reversal-canonical-observation-20260512.json`, generated `2026-05-12T11:42:08.678Z`, checks observed spread/coverage/depth/turnover against the expected THQ reversal edge and operational gates | Completed |
| Check whether THQ canonical observation can support paper/live | audit found 0/175 snapshots with spread below the expected median edge of 52.006 bps, 0/175 below the 8 bps live spread gate, and 0/175 execution-environment passes | Failed |
| Screen current Bithumb KRW universe before further strategy work | `var/reports/bithumb-top50-execution-universe-20260512.json`, generated `2026-05-12T11:50:02.385Z`, ranks public top-50 KRW markets by observed spread, 500k KRW depth, and 24h turnover | Completed |
| Check whether the current universe contains live-compatible markets beyond BTC | execution screen found 4/50 execution candidates (`KRW-BTC`, `KRW-XRP`, `KRW-ETH`, `KRW-USDT`), but only `KRW-BTC` is live-compatible under the current BTC-only live infrastructure | Failed for non-BTC live |
| Rescan only execution-clean markets for public 60m momentum | `var/reports/execution-candidates-public-60m-momentum-scan-20260512.json`, generated `2026-05-12T11:52:12.286Z`, evaluated `KRW-BTC`, `KRW-XRP`, `KRW-ETH`, and `KRW-USDT` | Failed for promotion |
| Rescan only execution-clean markets for public 60m reversal | `var/reports/execution-candidates-public-60m-reversal-scan-20260512.json`, generated `2026-05-12T11:52:32.538Z`, evaluated the same four markets | Failed for promotion |
| Extend BTC-only research to lower-turnover 240m momentum | `var/reports/btc-public-240m-momentum-scan-20260512.json`, generated `2026-05-12T11:55:15.347Z`, evaluated 272 BTC 240m momentum candidates | Weak pass for paper observation |
| Check BTC 240m reversal as an alternative | `var/reports/btc-public-240m-reversal-scan-20260512.json`, generated `2026-05-12T11:55:15.345Z`, evaluated 272 reversal candidates | Failed for promotion |
| Stress the BTC 240m momentum family for execution costs | `var/reports/btc-public-240m-momentum-fee20-scan-20260512.json` retained 1 promotion candidate; `var/reports/btc-public-240m-momentum-fee40-scan-20260512.json` retained 0 | Weak / not live-ready |
| Benchmark the BTC 240m survivor against buy-and-hold | `var/reports/btc-240m-momentum-benchmark-fee20-20260512.json`, generated `2026-05-12T12:10:58.605Z`, produced +165.123708% compounded strategy return versus +101.075450% BTC buy-and-hold, +64.048258 percentage points excess, 125 trades, 60% exposure, and -18.729571% max drawdown | Supports paper observation |
| Check current BTC 240m momentum signal and orderbook | `var/reports/btc-240m-momentum-forward-observation-20260512.json`, generated `2026-05-12T11:57:48.043Z`, found active signal, 0.669075 bps spread, covered 500k KRW depth, and `executionViability = watch_candidate` | Paper observation candidate only |
| Recheck BTC 240m momentum with top-of-book size | `var/reports/btc-240m-momentum-forward-observation-20260512-latest.json`, generated `2026-05-12T12:19:53.794Z`, found active signal, +105.912162 bps lookback return, 164.517584 risk value, 0.167151 bps spread, 0.0328 BTC best ask size, 0.0757 BTC best bid size, and 500k KRW depth covered at level 1 | Supports paper observation |
| Run BTC 240m candidate through paper risk/fill/reconciliation | `var/reports/btc-240m-momentum-paper-observation-20260512.json`, generated `2026-05-12T12:20:07.954Z`, accepted 1 paper signal, filled 500000 KRW notional at avg 119659786.174288 KRW with 200.009672 KRW fee, reconciliation OK, 1 explicitly carried open position | First paper entry observation |
| Audit the open BTC 240m paper position without premature exit | `var/reports/btc-240m-momentum-paper-position-audit-20260512.json`, generated `2026-05-12T12:27:06.276Z`, found hold exit due `2026-05-16T11:00:00.000Z`, holdElapsed false, diagnostic immediate-exit mark PnL -432.542534 KRW, and exit blocked as `hold_window_not_elapsed` | In progress |
| Combine BTC 240m evidence into a repeatable readiness gate | `var/reports/btc-240m-momentum-readiness-20260512.json`, generated `2026-05-12T12:32:28.861Z`, classified the candidate as `paper_candidate`, paper readiness true, live readiness false, with live blockers `realizedExitAvailable` and `noOpenPaperPositionAfterExit` | Paper only |
| Add one-command BTC 240m readiness refresh | `npm run dry-run:gate-btc-240m-live-ready` refreshed `var/reports/btc-240m-momentum-readiness-latest-refresh.json` at `2026-05-12T13:33:15.539Z`; classification remained `paper_candidate`, paper ready true, live ready false, hold exit due `2026-05-16T11:00:00.000Z`, refreshed diagnostic mark PnL -1330.606953 KRW | Paper only |
| Prevent managed live startup without execution-path readiness | `src/runtime/dry-run-service-config.ts` now requires `liveReadiness.checks.liveExecutionPathReady === true`; `test/dry-run-service-config.test.ts` includes `loadDryRunServiceConfig blocks live mode without execution path readiness`, `accepts live-ready BTC time-series evidence`, and `blocks paper-only BTC time-series evidence` | Completed |
| Add PM2 paper observer for BTC 240m candidate | `ecosystem.config.cjs` now includes `dry-run-btc-240m-momentum-observer`; package scripts include start/restart/stop/status/logs for `pm2:*:dry-run:btc-240m-momentum-observer` | Completed |
| Audit whether BTC 240m managed live execution path exists | `npm run dry-run:audit-btc-240m-live-execution-path`, generated `2026-05-12T13:08:45.044Z`, found ready true with managed 240m signal generation and `live-btc-manager` PM2 wiring present | Completed |
| Provide stable readiness input for future live startup | `src/cli/refresh-btc-240m-momentum-readiness.ts` writes `btc-240m-momentum-readiness-latest-refresh.json`; `ecosystem.config.cjs` sets `LIVE_READINESS_SUMMARY_PATH` to that stable file while keeping `LIVE_READINESS_APPROVED=false` | Completed |
| Verify live startup remains blocked with the stable readiness file | `loadDryRunServiceConfig` rejects live startup with `LIVE_READINESS_APPROVED=false`; when forced to `true`, it still rejects the current latest readiness file because `strategyAssessment.classification='paper_candidate'` rather than `live_candidate` | Completed |
| Prevent PM2 live start before latest readiness passes | `package.json` adds `dry-run:gate-btc-240m-live-ready` and runs it before `pm2:start:live-btc` / `pm2:restart:live-btc`; actual `npm run pm2:start:live-btc` exited nonzero with blockers `realizedExitAvailable` and `noOpenPaperPositionAfterExit`, and `pm2 list` showed no `live-btc-manager` process afterward | Completed |
| Prevent duplicate paper exit evidence after hold expiry | `src/cli/audit-bithumb-time-series-paper-position.ts` writes an exit registry keyed by entry signal after the first successful reduce-only paper exit; repeated runs reuse the same exit report instead of generating duplicate exit sessions. Test `paper position audit reuses an existing reduce-only exit for the same entry` passes. Current real registry count is 0 before hold expiry, as expected | Completed |
| Separate inactive signal from execution-cost live blockers | `src/cli/audit-bithumb-time-series-readiness.ts` live checks now require spread/depth and `noExecutionCostReasons`, not current `signalActive`; tests cover waiting through `momentum_signal_inactive` after a completed exit and still blocking `spread_exceeds_expected_edge` | Completed |
| Smoke-test the managed BTC 240m path without live orders | `env ... DRY_RUN_ENTRY_PROFILE=btc_240m_momentum_public_v1 npm run dry-run:service -- --once` completed at `2026-05-12T13:09:22.015Z` in paper mode with 1 buy signal, 1 fill, reconciliation OK, and diagnostic immediate mark -451.797490 KRW | Completed |
| Keep BTC 240m observation running | PM2 `dry-run-btc-240m-momentum-observer` is configured with `--live-execution-path-ready --execute-exit-when-due`; `pm2 show` reports script args set and status `waiting restart` after a successful short refresh cycle | Completed |
| Check whether alt-market positives can currently go live | subagent code audit confirmed managed live startup, runtime allowed markets, live account sync, and live sell preflight are BTC-only | Blocked |
| Ensure rejected PM2 candidates are not still running | `pm2 list` shows `dry-run-manager`, `dry-run-btc-trend-manager`, `dry-run-btc-trend-hold-manager`, `dry-run-btc-trend-hold-guarded-manager`, and `dry-run-btc-trend-ret1-turnover-cap-manager` all `stopped` | Completed |
| Document operational disposition | `analysis/live-readiness-20260510.md` documents rejected strategy family, stopped PM2 processes, passive scan results, and candle swing sensitivity results | Completed |

## Completion Decision

The goal is not achieved.

No current strategy can be promoted to live yet. One BTC-only 240-minute
momentum candidate can be promoted to paper/forward observation, but not to live
execution:

- all running BTC strategy variants had negative total PnL;
- no candidate passed the live gate;
- suppressed entries did not show positive fixed-horizon expectancy;
- short-horizon BTC/ETH/XRP passive scans found no positive cost-adjusted
  regimes;
- candle-based 240-minute positives were either not robust or too small and
  optimistic to promote;
- maker-first BTC execution remained negative even after maker reward
  sensitivity, and live code cannot guarantee post-only execution;
- lower-turnover public 60m BTC momentum showed positive recent held-out
  results for some rules, but the same rules were negative in train, so they are
  regime-dependent research observations rather than promotion candidates;
- the strongest recent 60m momentum candidate also failed walk-forward
  stability, with only 2/5 positive total+median folds and -43550.555226 KRW
  fold-summed PnL;
- the Bithumb top-20 KRW universe scan found zero strict promotion candidates
  after excluding undersampled/new-listing and unstable alt-market positives;
- cross-sectional KRW market rotation also found zero strict promotion
  candidates; the best held-out total PnL still had negative train/test medians
  and failed walk-forward stability;
- long-only reversal found a low-cost `KRW-THQ` candidate, but the edge failed
  realistic spread/slippage stress at 80-100 bps and cannot be promoted to live
  or paper without orderbook-aware execution validation;
- the current THQ forward observation is also blocked because the risk filter
  is inactive and public spread exceeds the low-cost median edge;
- a THQ-only canonical collector smoke run confirmed data collection works, but
  observed spread/liquidity/preflight evidence still blocks execution;
- the repeatable THQ canonical observation audit found 0/175 snapshots below
  the expected median edge and 0/175 below the live spread gate, so there is no
  honest paper/live path for this candidate yet;
- the current Bithumb top-50 execution screen found only four markets that pass
  spread/depth/turnover gates, and only `KRW-BTC` is compatible with the current
  managed live path;
- execution-filtered public 60-minute momentum and reversal rescans of
  `KRW-BTC`, `KRW-XRP`, `KRW-ETH`, and `KRW-USDT` both found zero promotion
  candidates;
- BTC-only 240-minute momentum produced the first paper-observation candidate:
  6 promotion candidates at 8 bps and 1 at 20 bps, with current signal active
  and orderbook conditions acceptable for observation;
- the 20 bps BTC 240-minute survivor also beat BTC buy-and-hold in a
  single-candidate compounded benchmark, returning +165.123708% versus
  +101.075450% for BTC hold over 5000 candles, with +64.048258 percentage
  points excess return, 125 trades, 60% exposure, and -18.729571% maximum
  drawdown;
- the current BTC 240-minute signal also passed one paper observation entry
  through risk checks, paper fill simulation, and reconciliation using current
  top-of-book data;
- the open BTC 240-minute paper position has an explicit hold-window audit:
  exit is due on `2026-05-16T11:00:00.000Z`, not now, and the current
  -432.542534 KRW mark is diagnostic rather than realized strategy PnL;
- a combined readiness gate now classifies the BTC 240-minute candidate as
  `paper_candidate`, with paper readiness true and live readiness false until
  realized paper exit evidence exists and no open paper position remains;
- a one-command refresh wrapper now reruns current observation, open-position
  audit, and readiness without changing strategy parameters; the latest PM2
  observer refresh still blocks live and records only a diagnostic -1330.606953
  KRW mark;
- that BTC 240-minute momentum family is not live-ready because it fails at
  40 bps cost stress, still has only one paper entry observation, and has no
  realized paper exit for the 24-bar hold window;
- the 240-minute signal now has an explicit managed execution path and
  `live-btc-manager` PM2 wiring, verified by the execution-path audit and a
  paper-mode managed service smoke run;
- the future live app has a stable readiness artifact path, but startup remains
  blocked both by `LIVE_READINESS_APPROVED=false` and by the current latest
  readiness file still being `paper_candidate`;
- the PM2 live start/restart scripts now run the BTC 240m live gate first, so
  the present paper-only state fails before PM2 can launch the live app;
- the eventual paper exit evidence is now idempotent: once a successful
  reduce-only paper exit is recorded for the entry signal, later observer
  refreshes reuse that registry instead of producing duplicate realized exits;
- after a completed paper exit, current signal inactivity alone will no longer
  block live service startup; execution-cost issues still block promotion via
  `noExecutionCostReasons`;
- the managed live startup config now enforces the same execution-path
  readiness check, so this cannot be bypassed by pointing live mode at a
  PnL-positive readiness artifact;
- the managed live startup config can now consume the BTC 240m readiness
  artifact shape after all live checks pass, so the future promotion path is
  explicit rather than a manual bypass;
- a dedicated execution-path audit now passes, so the remaining live blockers
  are paper evidence blockers rather than infrastructure blockers:
  `realizedExitAvailable` and `noOpenPaperPositionAfterExit`;
- a PM2 paper observer is running in short-cycle refresh mode and can keep the
  BTC 240m candidate refreshed without starting live execution;
- current managed live infrastructure is BTC-only, so non-BTC research
  candidates would require separate live-path generalization before any live
  consideration.

The defensible next step is no longer another rejected BTC trend/scalp tweak.
It is a narrowly scoped BTC 240-minute momentum paper/forward observation run
that measures real signal timing, spread, fills, and reconciliation before any
live approval.

## 2026-05-12 22:44 KST Recheck

Objective restated as concrete live-readiness criteria:

- identify a strategy with positive cost-adjusted expectancy evidence;
- verify current paper/forward evidence is not merely a reporting artifact;
- block live startup when realized paper evidence is incomplete or negative;
- prefer modifying or replacing the strategy over defending a losing run;
- keep the eventual live path deterministic and BTC-only unless non-BTC
  execution infrastructure is explicitly generalized and audited.

Current evidence:

- PM2 has only `dry-run-btc-240m-momentum-observer` active in short refresh
  mode; rejected BTC trend/scalp candidates remain stopped.
- Latest BTC 240m readiness artifact is still `paper_candidate`, with
  `liveReady=false` and blockers `realizedExitAvailable` and
  `noOpenPaperPositionAfterExit`.
- Latest diagnostic mark for the open BTC 240m paper position is
  -386.595052 KRW, -0.077284%. This is not realized strategy PnL because the
  24-bar hold window has not elapsed.
- Hold-window exit remains due at `2026-05-16T11:00:00.000Z`
  (`2026-05-16 20:00 KST`).
- Latest forward observation remains executable for paper observation:
  signal active, lookback return 108.023649 bps, risk filter passing, spread
  1.337088 bps, and both 500k KRW buy/sell depth checks passing.
- BTC 240m managed execution-path audit passes, so the remaining blockers are
  paper evidence blockers, not infrastructure blockers.
- `npm run dry-run:gate-btc-240m-live-ready` still exits nonzero as intended,
  blocking live startup before PM2 can launch `live-btc-manager`.
- Current top-50 Bithumb execution screen with a strict 5 bps spread gate finds
  only `KRW-BTC` and `KRW-XRP` as 500k KRW execution candidates; only
  `KRW-BTC` is compatible with the current managed live path.

Single-variable strategy modification check:

- Current selected BTC 240m rule is `lookbackBars=24`, `holdBars=24`,
  `minReturnBps=25`, `riskFilter=rv24_below_p70`. At 20 bps round-trip cost
  it has train median +1538.139872 KRW, test median +184.523884 KRW, 5/5
  positive walk-forward total folds, 4/5 positive median folds, and minimum
  fold PnL +157.464062 KRW.
- Raising only `minReturnBps` from 25 to 50 improves held-out test PnL
  (+33182.875305 KRW vs +6072.591529 KRW), but introduces a negative
  walk-forward minimum fold (-9726.909390 KRW). It is therefore a research
  alternative, not a safer replacement.
- The currently open signal had lookback return above both 25 and 50 bps, so
  this single-variable change would not have avoided the current open paper
  loss.

Current decision:

The goal is still not achieved. The strategy is pointed in the right research
direction, but live execution remains blocked until the BTC 240m paper position
has a realized reduce-only exit and the readiness artifact upgrades from
`paper_candidate` to `live_candidate`. If that exit realizes a loss or fails
reconciliation, the BTC 240m rule must be modified or paused before any live
approval. The first modification candidate is not a blind switch; it is a
measured comparison of the same BTC 240m rule with a higher return threshold
(`minReturnBps=50`) against the current baseline.

## 2026-05-12 22:53 KST Safety Gate Update

The live gate has been tightened so a completed paper lifecycle is not enough
by itself. The reduce-only paper exit must now also have positive realized PnL.

- `audit-bithumb-time-series-paper-position` records
  `exit.realizedExitNetPnlKrw` in the exit registry and in the position audit
  output.
- `audit-bithumb-time-series-readiness` adds
  `positiveRealizedPaperExitPnl` to live readiness checks.
- `dry-run-service-config` requires `positiveRealizedPaperExitPnl=true` before
  accepting BTC 240m readiness evidence for live startup.
- A regression test verifies that a fully reconciled but losing paper exit
  still blocks live readiness.
- Latest refreshed readiness generated `2026-05-12T13:53:16.465Z` remains
  `paper_candidate`, `liveReady=false`, with blockers
  `realizedExitAvailable`, `noOpenPaperPositionAfterExit`, and
  `positiveRealizedPaperExitPnl`.
- Latest diagnostic mark is -937.964835 KRW, -0.187509%. It is still not
  realized because the hold window has not elapsed.

## 2026-05-13 14:31 KST Live-Goal Recheck

Objective restated as concrete deliverables:

- keep searching for a live path only when the evidence supports positive
  expectancy after realistic cost and execution gates;
- reject losing or unproven strategy paths instead of continuing them because
  they already exist;
- keep live startup mechanically blocked until a selected candidate has
  realized positive paper evidence or complete live operational proof;
- preserve an explicit path to live so that a later positive paper exit can be
  promoted without a manual bypass.

Current prompt-to-artifact checklist:

| Requirement | Evidence | Result |
| --- | --- | --- |
| Confirm the live goal gate state | `npm run dry-run:gate-live-goal-ready` exited `2`; `var/reports/live-goal-status-20260513-current.json` generated `2026-05-13T05:30:59.088Z` with `status=blocked`, `liveReady=false`, `completionAudit.achieved=false` | Not achieved |
| Check current BTC min75 profitability | `profitabilitySnapshot.leadingPaperMark` shows open paper mark +2347.861698 KRW, +0.469362%, hold exit due `2026-05-16T11:00:00.000Z` | Monitoring only |
| Require realized positive paper evidence before live | BTC min75 still lacks `realizedExitAvailable`, `realizedExitReusePolicy`, `noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl` | Blocked |
| Compare research replacement candidates | Latest goal report selects `replacement_time_series_research` with KRW-H as leading research: historical return +3.486549%, test return +2.659181%, test median +6250 KRW, walk-forward min fold +8113.658939 KRW | Research only |
| Verify KRW-H forward/paper state | `h-60m-momentum-replacement-readiness-latest.json` generated `2026-05-13T05:29:31.534Z`; direction passes, but `riskPass=false`, paper signal attempted false, open position count 0 | Blocked |
| Test whether loosening KRW-H risk improves expectancy | single-variable sensitivity of the KRW-H 168/24 momentum rule showed p85/p90/none allow current entry, but none pass promotion criteria; p70 remains the only promotion-pass rule and currently blocks risk | Do not loosen |
| Check STABLE replacement path | `stable-60m-reversal-replacement-readiness-latest.json` generated `2026-05-13T05:29:08.312Z`; `directionalSignalPass=false`, paper/live ready false | Blocked |
| Check PIEVERSE replacement path | `pieverse-60m-reversal-lb168-replacement-readiness-latest.json` generated `2026-05-13T05:29:18.138Z`; `directionalSignalPass=false`, `riskPass=false`, paper/live ready false | Blocked |
| Reject known losing paths | Latest goal report records legacy traded PnL -46432.235257 KRW, cross-exchange estimated net PnL -8914.091976 KRW, spot-perp carry estimated net PnL -13199.436772 KRW | Rejected |
| Ensure blocked research cannot override a later live-ready BTC path | `src/cli/audit-live-goal-status.ts` candidate selection now lets a fully live-ready BTC min75 path outrank blocked replacement research or blocked cross-exchange evidence; regression tests cover both cases | Completed |
| Keep replacement observers sequential and non-stale | `src/cli/refresh-bithumb-replacement-time-series-readiness.ts` refreshes observation, paper observation, position audit, and readiness in one process; PM2 STABLE/PIEVERSE/KRW-H refresh observers use the wrapper | Completed |
| Verify TypeScript behavior | `npm test` passed 233/233 tests | Completed |
| Verify Python ingestion/session tests | `.venv/bin/python -m unittest discover -s tests -v` passed 61/61 tests | Completed |
| Check PM2 observer health | `pm2 jlist` showed BTC min75, live-goal status, KRW-H, STABLE, and PIEVERSE refresh observers all `waiting restart` with `exit_code=0` | Completed |

Current decision:

The goal is still not achieved. No candidate has realized positive paper PnL or
complete operational live proof. The current strategy is not being held onto
despite losses: legacy, cross-exchange, and carry are explicitly rejected, and
the strongest replacement research path, KRW-H, remains paper-only because the
current forward signal fails its risk filter.

The next defensible live path is:

1. Keep BTC min75 observation running until the scheduled reduce-only paper
   exit at `2026-05-16T11:00:00.000Z`.
2. After that exit, rerun `npm run dry-run:gate-btc-240m-min75-live-ready` and
   `npm run dry-run:gate-live-goal-ready`.
3. Promote only if the exit is the first registered reduce-only exit for the
   entry, reconciliation leaves no open paper position, realized net PnL is
   positive, and the top-level goal gate reports `liveReady=true`.
4. If the BTC exit is negative or reconciliation fails, do not live-trade it;
   pause or modify the rule and compare against this baseline before starting
   another paper candidate.
5. Continue KRW-H paper-only observation with the p70 risk filter unchanged;
   current evidence does not support loosening the risk threshold just to force
   an entry.

This change directly addresses the requirement not to keep pushing a losing
strategy into live merely because the mechanics completed successfully.

## 2026-05-12 22:58 KST Observer Restart Check

The first attempt to run `pm2 restart dry-run-btc-240m-momentum-observer
--update-env` failed while the observer was in PM2 `waiting restart` state:
PM2 reported `Process 7 not found`.

Operational fix:

- `pm2:restart:dry-run:btc-240m-momentum-observer` now deletes the observer if
  present and starts it again from `ecosystem.config.cjs`.
- The updated script was executed successfully. PM2 deleted id 7 and launched a
  new observer as id 8.
- The new observer completed a refresh at `2026-05-12T13:58:23.041Z`.
- The refreshed summary remains `paper_candidate`, `paperReady=true`,
  `liveReady=false`, with blockers `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl`.
- PM2 still has no `live-btc-manager` process. Only the BTC 240m paper observer
  is active in short-cycle refresh mode; rejected BTC strategy variants remain
  stopped.

This keeps the paper observer operational without weakening the live gate.

## 2026-05-12 23:00 KST Live Start Gate Check

The actual live start command was re-run after the safety-gate and observer
restart updates:

```sh
npm run pm2:start:live-btc
```

Result:

- the command exited nonzero inside `dry-run:gate-btc-240m-live-ready`;
- PM2 never reached the `live-btc-manager` start step;
- `pm2 show live-btc-manager` reported that the process does not exist;
- latest readiness generated `2026-05-12T14:00:56.338Z` remains
  `paper_candidate`, `liveReady=false`;
- live blockers remain `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl`;
- latest diagnostic mark is -1869.445605 KRW, -0.373722%, still unrealized
  because the hold window has not elapsed.

This verifies that the current losing/open paper state cannot start live
execution through the operational PM2 entrypoint.

## 2026-05-12 23:03 KST Live Restart Gate Check

The live restart path was tightened after reviewing the PM2 scripts:

- `pm2:restart:live-btc` still runs `dry-run:gate-btc-240m-live-ready` before
  any PM2 live action.
- If the gate passes later, the script now attempts `pm2 restart
  live-btc-manager --update-env` and falls back to starting
  `live-btc-manager` from `ecosystem.config.cjs` if the process does not
  already exist.
- `audit-btc-240m-live-execution-path` now verifies the restart path also
  requires the latest live-readiness gate.

Verification:

- `npm run pm2:restart:live-btc` exited nonzero inside
  `dry-run:gate-btc-240m-live-ready`, before any PM2 live action.
- `pm2 show live-btc-manager` still reported that the process does not exist.
- Latest readiness generated `2026-05-12T14:03:26.161Z` remains
  `paper_candidate`, `liveReady=false`, with blockers
  `realizedExitAvailable`, `noOpenPaperPositionAfterExit`, and
  `positiveRealizedPaperExitPnl`.
- `audit-btc-240m-live-execution-path --require-ready` passed with
  `livePm2RestartRequiresLatestReadinessGate=true`.

The restart path is now operationally usable after future approval without
bypassing the current paper-only/live-blocked state.

## 2026-05-12 23:06 KST Documentation Alignment

Operational docs were aligned with the current BTC 240m live gate:

- `.env.example` now states that BTC 240m time-series readiness requires a
  realized, reconciled, positive-PnL reduce-only paper exit.
- `docs/runtime-contract.md` now documents that
  `LIVE_READINESS_SUMMARY_PATH` can point to either a single-candidate
  `summarize-dry-run-returns` output or the BTC 240m time-series readiness
  artifact, and that `positiveRealizedPaperExitPnl=true` is required.
- `docs/pm2-dry-run.md` now lists the BTC 240m observer/gate commands and
  states that `pm2:start:live-btc` and `pm2:restart:live-btc` run the live
  gate before any live PM2 process can start.

This prevents operator instructions from lagging behind the stricter live
startup code path.

## Completion Audit Snapshot

Objective: use subagent and local analysis to find or improve a strategy that
can defensibly proceed to live trading for profit, while modifying or blocking
strategies that continue to lose money.

Success criteria and evidence:

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Losing existing strategies are not kept running | PM2 shows the previous BTC trend/scalp managers stopped; their audits showed negative PnL | Met |
| A candidate with positive historical expectancy exists | BTC 240m momentum has positive 20 bps benchmark and beats BTC buy-and-hold | Partially met |
| Candidate is verified on current paper evidence | One paper entry exists and reconciles, but the position is still open | Not met |
| Current paper lifecycle has realized positive PnL | No reduce-only exit yet; latest marks are diagnostic and negative | Not met |
| Losing paper exit cannot promote live | `positiveRealizedPaperExitPnl` is now required in readiness and runtime config | Met |
| Live execution path can generate the same BTC 240m signal | `audit-btc-240m-live-execution-path --require-ready` passes | Met |
| Live start/restart cannot bypass readiness | `pm2:start:live-btc` and `pm2:restart:live-btc` both fail at the readiness gate while paper-only | Met |
| Live PM2 process is not running today | `pm2 show live-btc-manager` reports the process does not exist | Met |
| Observer keeps paper evidence fresh | `dry-run-btc-240m-momentum-observer` is active in PM2 short-cycle refresh mode | Met |
| Operator docs match the live gate | `.env.example`, `docs/runtime-contract.md`, and `docs/pm2-dry-run.md` describe positive realized paper exit gating | Met |

Completion decision:

The goal is not achieved. The live execution path and safety gates are ready,
but the strategy itself is not live-ready because the current BTC 240m paper
position has no realized reduce-only exit and no positive realized paper PnL.
The next required evidence is the configured hold-window exit after
`2026-05-16T11:00:00.000Z`. If that exit is negative or fails reconciliation,
the BTC 240m candidate remains blocked and must be modified or paused.

## 2026-05-12 23:09 KST Post-Exit Runbook Check

The post-exit decision command is now documented in `docs/pm2-dry-run.md`:

```sh
npm run dry-run:gate-btc-240m-live-ready
```

This is the same gate used by live PM2 start/restart, so the manual post-exit
decision cannot use a weaker readiness surface than live startup.

Verification:

- The command currently exits nonzero, as expected before the hold window
  elapses.
- Latest readiness generated `2026-05-12T14:09:29.933Z` remains
  `paper_candidate`, `liveReady=false`, with blockers
  `realizedExitAvailable`, `noOpenPaperPositionAfterExit`, and
  `positiveRealizedPaperExitPnl`.
- Latest diagnostic mark is -1389.085567 KRW, -0.277693%.
- Exit remains unattempted with `hold_window_not_elapsed`.

The runbook now explicitly routes a losing post-exit result back to parameter
comparison instead of live approval.

## 2026-05-12 23:12 KST Exit Registry Compatibility

The paper position audit now treats an existing exit registry without
`realizedExitNetPnlKrw` as incomplete evidence. Such a registry is not reused;
the reduce-only paper exit is regenerated when the hold window is due and
`--execute-exit-when-due` is set.

Verification:

- Added a regression test for a stale registry that has reconciliation success
  and zero open positions but no realized PnL.
- The audit regenerated the exit instead of reusing the stale registry and
  wrote `realizedExitNetPnlKrw`.
- Targeted `paper position audit` tests pass.

This keeps the new positive realized-PnL live gate from getting stuck behind
legacy incomplete registry evidence.

## 2026-05-12 23:13 KST Observer Freshness Check

PM2 observer freshness was verified after the exit-registry compatibility
change:

- `dry-run-btc-240m-momentum-observer` remains in PM2 short-cycle refresh mode.
- Latest artifacts were refreshed at `2026-05-12T14:13:32.440Z`.
- The PM2 log shows consecutive refreshes at approximately five-minute
  intervals after the observer restart.
- Latest readiness remains `paper_candidate`, `liveReady=false`, with blockers
  `realizedExitAvailable`, `noOpenPaperPositionAfterExit`, and
  `positiveRealizedPaperExitPnl`.
- Latest diagnostic mark is -775.060127 KRW, -0.154943%; still unrealized
  because `holdElapsed=false`.

The observer is current enough to capture the configured reduce-only paper exit
when the hold window elapses.

## 2026-05-12 23:14 KST Single-Variable Alternative Check

The first plausible modification candidate was tested as a forward observation
artifact:

```sh
npm run dry-run:observe-bithumb-time-series-candidate -- \
  --market KRW-BTC \
  --signal-mode momentum \
  --unit-minutes 240 \
  --lookback-bars 24 \
  --hold-bars 24 \
  --min-return-bps 50 \
  --risk-filter rv24_below_p70 \
  --notional-krw 500000 \
  --expected-median-edge-bps 15.690478 \
  --output var/reports/btc-240m-momentum-min50-forward-observation-20260512.json
```

Result:

- generated `2026-05-12T14:14:54.214Z`;
- signal remained active with lookback return 100.337838 bps versus the
  50 bps threshold;
- risk filter passed;
- spread was 0.919832 bps and both 500k KRW depth checks passed;
- decision remained `watch_candidate`.

Interpretation:

Raising `minReturnBps` from 25 to 50 would not have avoided the current open
paper position because the observed momentum is above both thresholds. If the
current paper exit realizes a loss, this single change is not sufficient as a
loss-avoidance fix; it should be treated only as one candidate in a broader
parameter comparison.

## 2026-05-12 23:21 KST High-Liquidity 240m Comparison

A fresh public-candle comparison was run for the currently executable,
high-liquidity KRW markets only: `KRW-BTC`, `KRW-ETH`, `KRW-XRP`, and
`KRW-USDT`.

Commands:

```sh
npm run dry-run:analyze-bithumb-momentum -- \
  --markets KRW-BTC,KRW-ETH,KRW-XRP,KRW-USDT \
  --signal-mode momentum \
  --unit-minutes 240 \
  --max-candles 5000 \
  --fee-round-trip-bps 20 \
  --output var/reports/high-liquidity-240m-momentum-scan-fee20-20260512.json

npm run dry-run:analyze-bithumb-momentum -- \
  --markets KRW-BTC,KRW-ETH,KRW-XRP,KRW-USDT \
  --signal-mode momentum \
  --unit-minutes 240 \
  --max-candles 5000 \
  --fee-round-trip-bps 40 \
  --output var/reports/high-liquidity-240m-momentum-scan-fee40-20260512.json
```

Result:

- 20 bps: one promotion candidate, and it is the existing `KRW-BTC`
  24-lookback/24-hold `rv24_below_p70` candidate.
- 20 bps BTC promotion evidence: train +534787.963262 KRW, test
  +6072.591529 KRW, test median +184.523884 KRW, walk-forward total
  +580428.714333 KRW, worst fold +157.464062 KRW.
- 20 bps ETH, XRP, and USDT had no promotion candidates. Their best test-PnL
  rows fail walk-forward robustness or median-trade quality.
- 40 bps: zero promotion candidates across BTC, ETH, XRP, and USDT.

Interpretation:

This check does not justify switching away from BTC. ETH had higher selected
test PnL in some rows, but its walk-forward worst fold remained deeply
negative, so it is a research target rather than a live candidate. BTC remains
the best local candidate, but the 40 bps failure and current negative paper
mark mean live must stay blocked until realized paper evidence is positive.

## 2026-05-12 23:29 KST BTC 240m Modification Matrix

The next comparison focused on one variable at a time against the BTC 240m
baseline. The goal was expectancy improvement, not merely fewer trades.

Baseline:

- `lookbackBars=24`, `holdBars=24`, `minReturnBps=25`,
  `riskFilter=rv24_below_p70`, `riskThreshold=435.9906664851208`.
- 20 bps: 125 trades, +165.123708%, max DD -18.729571%, excess vs BTC
  buy-and-hold +64.016331 pp.
- 40 bps: 125 trades, +106.784233%, max DD -19.894679%, excess +5.676856 pp.

Single-variable results:

| Change | 20 bps result | 40 bps result | Decision |
| --- | --- | --- | --- |
| `minReturnBps=50` | 120 trades, +168.405010%, excess +67.255623 pp | +111.456695%, excess +10.308989 pp | Improvement candidate |
| `minReturnBps=75` | 112 trades, +170.504416%, excess +69.356710 pp | +116.555162%, excess +15.407456 pp | Best measured candidate |
| `rv24` threshold tightened to p60 (`396.6632445069357`) | +134.276871%, excess +33.297204 pp | +87.122753%, excess -13.856914 pp | Reject |
| `minReturnBps=75` plus `rv24` p60 | +121.144427%, excess +20.164760 pp | +80.545987%, excess -20.433680 pp | Reject |
| `range24_below_p70` | +130.424600%, excess +29.633137 pp | +77.886053%, excess -22.905410 pp | Reject |
| `holdBars=8` | +4.809823%, excess -95.981641 pp | -41.705246%, excess -142.496710 pp | Reject |
| `lookbackBars=72` | +139.635755%, excess +38.844292 pp | +90.646037%, excess -10.145426 pp | Reject |

Interpretation:

The only measured modification that improves both the 20 bps and 40 bps
single-candidate benchmark is stricter momentum entry, especially
`minReturnBps=75` while keeping `rv24_below_p70`. This is not live approval:
the current open paper position would still have entered under the 75 bps
threshold because the latest lookback return is above 75 bps. If the current
paper exit realizes a loss, `minReturnBps=75` is the first replacement
candidate to forward-paper, but it still needs paper entry/exit reconciliation
and positive realized PnL before any live gate can pass.

## 2026-05-12 23:39 KST Min75 Forward Paper Path

The `minReturnBps=75` replacement candidate was moved from benchmark-only
evidence to a separate paper-readiness path:

- forward observation:
  `var/reports/btc-240m-momentum-min75-forward-observation-retry-20260512.json`;
- paper observation:
  `var/reports/btc-240m-momentum-min75-paper-observation-20260512.json`;
- paper position audit:
  `var/reports/btc-240m-momentum-min75-paper-position-audit-20260512.json`;
- readiness:
  `var/reports/btc-240m-momentum-min75-readiness-20260512.json`.

Result:

- The first min75 paper attempt was rejected because the orderbook snapshot had
  `bestBidSize=0`; this was treated as invalid paper-execution input rather
  than silently accepting the signal.
- A retry produced a valid orderbook snapshot. The min75 signal remained active
  with lookback return 80.743243 bps versus the 75 bps threshold.
- Paper entry was attempted, accepted, and reconciled with one open position.
- The min75 readiness artifact is `paper_candidate`, `paperReady=true`,
  `liveReady=false`.
- Latest min75 mark is -432.573631 KRW, -0.086476%; the reduce-only exit is
  still blocked by `hold_window_not_elapsed`.

Code path update:

- `DRY_RUN_ENTRY_PROFILE=btc_240m_momentum_min75_candidate_v1` is now accepted
  by the managed service config, but live mode requires matching BTC 240-minute
  readiness evidence with `candidate.minReturnBps=75`.
- The managed BTC 240-minute service can generate the same min75 observation
  parameters and emits the min75 strategy id in managed scenarios.
- The default PM2 live profile remains `btc_240m_momentum_public_v1`; min75 is
  a replacement candidate only after its own realized positive paper exit.

Verification:

- `npm test -- --test-name-pattern "DryRunServiceConfig|buildBtc240mManagedScenario|time-series readiness"`
  passed 126 JavaScript tests.
- `npm run dry-run:audit-btc-240m-live-execution-path -- --require-ready`
  passed after adding a min75 support check.
- `git diff --check` passed.
- full `npm test` passed `238/238`;
- `pm2:restart:dry-run:live-goal-status` was run so the observer now uses the
  41-scan input set;
- PM2 confirms no live process is running and all observer processes are in
  paper mode with `ENABLE_LIVE_EXECUTION=false`;
- observer-regenerated goal report at `2026-05-13T07:02:50.897Z` has
  `scanCount=41`, `liveReady=false`, `status=blocked`;
- latest BTC min75 open mark after observer refresh is `+1474.776493` KRW,
  `+0.294823%`, still monitoring-only until realized exit.

## 2026-05-12 23:46 KST Min75 Observer Wiring

The shared BTC 240m refresh wrapper now supports parameterized observation and
artifact paths:

- `--artifact-prefix` isolates baseline and replacement candidate artifacts;
- `--min-return-bps` and `--risk-threshold` control the observation signal;
- `--paper-reports-dir` keeps reduce-only exit registries in the matching paper
  evidence directory.

The min75 replacement candidate now has a PM2 observer:

```sh
npm run pm2:restart:dry-run:btc-240m-momentum-min75-observer
```

PM2 started `dry-run-btc-240m-momentum-min75-observer` and the first cycle
completed successfully. Latest min75 readiness is still `paper_candidate`,
`paperReady=true`, `liveReady=false`, with blockers `realizedExitAvailable`,
`noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl`.

Latest min75 diagnostic mark after observer start:

- estimated exit PnL +463.530526 KRW;
- estimated exit return +0.092665%;
- hold exit due `2026-05-16T11:00:00.000Z`.

This is still not live evidence because it is an unrealized mark. The observer
is now in place to capture the reduce-only paper exit when the hold window
elapses.

Verification:

- parameterized min75 refresh completed and wrote
  `var/reports/btc-240m-momentum-min75-readiness-latest-refresh.json`;
- `npm test` passed 127 JavaScript tests;
- `npm run dry-run:audit-btc-240m-live-execution-path -- --require-ready`
  passed with `min75PaperObserverPm2Available=true`;
- `git diff --check` passed before this documentation update.

## 2026-05-12 23:52 KST Min75 Live Start Path

The min75 replacement candidate now has its own live gate and PM2 live target:

```sh
npm run dry-run:gate-btc-240m-min75-live-ready
npm run pm2:start:live-btc-min75
npm run pm2:restart:live-btc-min75
```

The min75 live target uses:

- `LIVE_READINESS_SUMMARY_PATH=var/reports/btc-240m-momentum-min75-readiness-latest-refresh.json`;
- `DRY_RUN_ENTRY_PROFILE=btc_240m_momentum_min75_candidate_v1`;
- separate logs under `var/log/live-btc-240m-momentum-min75-service`;
- separate live artifacts under `var/live-sessions-btc-240m-momentum-min75`.

This path is intentionally separate from `live-btc-manager` so a future min75
promotion cannot accidentally use the baseline min25 readiness artifact. The
gate still runs before PM2 start/restart and still requires a realized,
reconciled, positive-PnL paper exit.

## 2026-05-13 00:06 KST Refresh And Fee Sensitivity Audit

Objective audit: the goal is not merely to start live mode. A candidate must
have a working live path, fresh paper evidence, a realized positive reduce-only
paper exit, no remaining open paper position after that exit, and profitability
that survives the actual fee schedule.

Current state after manual min75 refresh:

- `var/reports/btc-240m-momentum-min75-readiness-latest-refresh.json`
  generated at `2026-05-12T15:02:39.076Z`.
- Classification remains `paper_candidate`; `paperReady=true`;
  `liveReady=false`.
- Live blockers remain `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl`.
- Latest min75 signal is active: lookback return `117.991348` bps, threshold
  `75` bps, risk value `158.668776` below the `435.9906664851208` p70
  threshold.
- Latest min75 diagnostic mark is still unrealized and negative:
  estimated exit PnL `-750.816229` KRW, estimated return `-0.150096%`.
- Hold exit is still due at `2026-05-16T11:00:00.000Z`; no live process is
  running.

Fee sensitivity:

- Bithumb public fee evidence shows the relevant live assumption is account
  dependent: current KRW market trading can be `0.04%` with the fee coupon, but
  support pages also state the coupon is time-limited and otherwise fees can
  revert to `0.25%`. The strategy must therefore explicitly require confirming
  the account's active fee before promotion.
- At `50` bps round-trip, the current BTC candidates do not beat BTC buy-hold:
  - min25 p70: strategy `+82.587539%`, buy-hold `+102.040194%`, excess
    `-19.452655` pp;
  - min50 p70: strategy `+87.654694%`, buy-hold `+102.040194%`, excess
    `-14.3855` pp;
  - min75 p70: strategy `+93.728474%`, buy-hold `+102.023263%`, excess
    `-8.29479` pp;
  - lookback168/hold72/range p70: strategy `+92.568109%`, buy-hold
    `+102.043581%`, excess `-9.475471` pp;
  - lookback168/hold72/rv median: strategy `-6.465575%`, buy-hold
    `+102.043581%`, excess `-108.509156` pp.

Measurement update:

- `src/cli/analyze-bithumb-candidate-benchmark.ts` now accepts
  `--min-return-bps 0`, matching candidates emitted by the broader momentum
  scan instead of preventing exact single-candidate rechecks.
- `test/analyze-bithumb-candidate-benchmark.test.ts` covers the zero-threshold
  benchmark path.

Verification:

- `npm test -- --test-name-pattern "candidate benchmark"` ran the JavaScript
  test suite and passed 128 tests.
- `git diff --check` passed.

Conclusion: min75 remains the best paper-observed replacement under the
discounted-fee assumption, but it is not live-ready. At default/non-discounted
fee levels the tested BTC candidates underperform buy-and-hold, so live
promotion must require both a positive realized paper exit and confirmation
that the live account has the discounted fee schedule active.

## 2026-05-13 00:19 KST Fee-Gated Live Startup

Because 50 bps round-trip sensitivity underperformed BTC buy-and-hold, live
startup now has an explicit fee gate in addition to readiness approval:

- `LIVE_TRADING_FEE_SCHEDULE_CONFIRMED=true` is required in live mode.
- `LIVE_TRADING_FEE_ROUND_TRIP_BPS` is required in live mode.
- BTC 240-minute readiness evidence is rejected if
  `LIVE_TRADING_FEE_ROUND_TRIP_BPS` is higher than the readiness artifact's
  `benchmarkSummary.feeRoundTripBps`.
- During live account sync, the managed service calls private Bithumb
  `orders/chance` for `KRW-BTC` and rejects startup if `bid_fee + ask_fee`
  exceeds the configured round-trip bps or if fee evidence is unavailable.
- PM2 live targets default to
  `LIVE_TRADING_FEE_SCHEDULE_CONFIRMED=false` and
  `LIVE_TRADING_FEE_ROUND_TRIP_BPS=50`, so flipping only readiness approval is
  still insufficient to start live under the current fee20 benchmark.

Verification:

- `npm test -- --test-name-pattern "DryRunServiceConfig|syncLiveManagedStateWithClient|live execution path"`
  ran the JavaScript test suite and passed 132 tests.
- `npm run dry-run:audit-btc-240m-live-execution-path -- --require-ready`
  passed with `liveStartupRequiresFeeScheduleConfirmation=true`.
- `npm run pm2:start:live-btc-min75` still exited nonzero because min75 remains
  `paper_candidate`, and `pm2 show live-btc-min75-manager` confirmed no live
  process exists.
- `git diff --check` passed.

Latest min75 status after the live-start safety check:

- generated at `2026-05-12T15:18:56.582Z`;
- `paperReady=true`, `liveReady=false`;
- blockers: `realizedExitAvailable`, `noOpenPaperPositionAfterExit`,
  `positiveRealizedPaperExitPnl`;
- estimated exit PnL `-579.132722` KRW;
- estimated return `-0.115775%`;
- hold exit due `2026-05-16T11:00:00.000Z`.

## 2026-05-13 00:21 KST Legacy Candidate Refresh

The previously stale all-running legacy audit was regenerated at
`var/reports/current-live-audit-all-running-20260513-refresh.json`.

Result:

- recommendation `decisionSummary.live="blocked"`;
- recommendation `decisionSummary.paper="blocked"`;
- `nextPaperCandidate=null`;
- primary blockers include `no_live_ready_candidate`,
  `no_profitable_paper_candidate`, `negative_traded_pnl`,
  `negative_closed_trade_pnl`, `material_losing_exit_reasons`, and
  `exit_reason_attribution_gap`.

Current candidate PnL from the refreshed audit:

- `confirm3`: traded `-9779.532861` KRW, closed `-438.335594` KRW,
  26 closed trades;
- `trend`: traded `-13145.916396` KRW, closed `-8280.670445` KRW,
  41 closed trades;
- `hold`: traded `-3246.783847` KRW, closed `-2327.266820` KRW,
  27 closed trades;
- `guarded`: traded `-11728.027506` KRW, closed `-5579.256382` KRW,
  26 closed trades;
- `ret1-turnover-cap`: traded `-8531.974647` KRW, closed
  `-3938.574926` KRW, 12 closed trades.

Conclusion: the stale legacy audit did not hide a live candidate. Existing
short-horizon/trend variants remain blocked and should not be restarted for
profit exploration. The only active path worth keeping under observation is
the BTC 240-minute time-series candidate, especially min75, subject to realized
paper exit and fee confirmation gates.

## 2026-05-13 00:26 KST Stale Readiness Guard

Live startup now rejects stale readiness artifacts:

- `LIVE_READINESS_MAX_AGE_MS` defaults to `900000` (15 minutes);
- live readiness JSON must include a valid `generatedAt` timestamp;
- direct live startup rejects readiness evidence older than the configured
  maximum age;
- PM2 live targets set `LIVE_READINESS_MAX_AGE_MS=900000` and still run the
  refresh gate before starting.

Verification:

- `npm test -- --test-name-pattern "DryRunServiceConfig|live execution path"`
  ran the JavaScript test suite and passed 133 tests, including stale
  readiness rejection.
- `npm run dry-run:audit-btc-240m-live-execution-path -- --require-ready`
  passed with `liveStartupRejectsStaleReadiness=true`.
- `npm run pm2:start:live-btc-min75` still exited nonzero because min75 remains
  `paper_candidate`, and `pm2 show live-btc-min75-manager` confirmed no live
  process exists.
- `git diff --check` passed.

Latest min75 status after the guard check:

- generated at `2026-05-12T15:25:53.816Z`;
- `paperReady=true`, `liveReady=false`;
- blockers: `realizedExitAvailable`, `noOpenPaperPositionAfterExit`,
  `positiveRealizedPaperExitPnl`;
- estimated exit PnL `-1672.044802` KRW;
- estimated return `-0.334259%`;
- hold exit due `2026-05-16T11:00:00.000Z`.

## 2026-05-13 00:34 KST Live Goal Status Gate

A single goal-status audit command now combines the current min75 evidence and
the refreshed legacy-candidate audit:

- `npm run dry-run:audit-live-goal-status -- --output var/reports/live-goal-status-20260513.json`
- `npm run dry-run:audit-live-goal-status -- --require-live-ready`

Result:

- status `blocked`;
- `liveReady=false`;
- min75 readiness generated at `2026-05-12T15:32:23.555Z`;
- min75 classification `paper_candidate`;
- min75 estimated exit PnL `-1177.931294` KRW;
- min75 estimated return `-0.235481%`;
- blockers: `min75LiveReady`, `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, `positiveRealizedPaperExitPnl`;
- legacy candidates are all still blocked and negative.

The `--require-live-ready` gate intentionally exits with code `2` in this
state. That means the goal is configured correctly for live-profit
exploration, but the current evidence does not justify live execution. The
next valid decision point is the scheduled reduce-only paper exit at
`2026-05-16T11:00:00.000Z`, after which the strategy must show positive
realized paper exit PnL and zero open paper position before live can be
reconsidered.

Web fee check: Bithumb's 2026-02-05 notice described fee benefits as
conditional on maker/order event rules and explicitly referenced `0.04%` as
the coupon-applied 기준, with the specific event ending on
`2026-03-13 20:00`. This supports keeping the live startup fee gate in place
instead of assuming the benchmark fee applies to the account.

Verification:

- `npm test -- --test-name-pattern "live goal status|DryRunServiceConfig|live execution path"`
  ran the JavaScript test suite and passed 136 tests.
- `npm run dry-run:audit-live-goal-status -- --output var/reports/live-goal-status-20260513.json`
  wrote the current blocked goal report.
- `npm run dry-run:audit-live-goal-status -- --require-live-ready` exited
  nonzero with status `blocked`, as intended.

## 2026-05-13 00:40 KST Top-10 Fee50 Replacement Scan

To avoid forcing the currently losing paper position into live, the latest
high-liquidity public Bithumb markets were rescanned at a realistic 50 bps
round-trip fee assumption:

- command:
  `npm run dry-run:analyze-bithumb-momentum -- --top-markets 10 --unit-minutes 240 --max-candles 5000 --fee-round-trip-bps 50 --output var/reports/high-liquidity-240m-momentum-scan-fee50-20260513-refresh.json`
- selected markets by 24h KRW volume included `KRW-USDT`, `KRW-XRP`,
  `KRW-AVL`, `KRW-BTC`, `KRW-ETH`, `KRW-SD`, `KRW-GTC`, `KRW-SOLV`, and
  `KRW-H`;
- `KRW-VVV` was excluded because it had fewer than 500 usable candles;
- candidate count `2448`;
- promotion candidate count `0`.

The strongest recent-test rows were mostly `KRW-H` short-hold variants, but
they had short history (`1880` candles), negative train medians, and materially
negative walk-forward worst folds. Examples:

- `KRW-H` lookback `8`, hold `8`, min return `0`, range24 p70:
  test PnL `787765.832579` KRW, but train median `-9162.926077` KRW and
  worst walk-forward fold `-240022.756925` KRW;
- `KRW-H` lookback `24`, hold `8`, min return `50`, range24 p70:
  test PnL `767349.354796` KRW, but train median `-7005.954297` KRW and
  worst walk-forward fold `-171381.467807` KRW.

Conclusion: the latest web/API scan did not find a stronger live candidate.
Switching from BTC min75 to these recent-test alt rows would improve reported
recent PnL but would weaken expectancy evidence because train quality and
walk-forward stability fail the promotion gate.

The latest goal-status refresh after this scan wrote
`var/reports/live-goal-status-20260513-post-scan.json`:

- status `blocked`;
- `liveReady=false`;
- min75 readiness generated at `2026-05-12T15:37:26.696Z`;
- min75 estimated exit PnL `-1027.184801` KRW;
- min75 estimated return `-0.205345%`;
- blockers remain `min75LiveReady`, `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl`.

Operational decision: do not start live and do not replace BTC min75 with the
latest top-test alt rows. Keep BTC min75 as a paper-only candidate until the
scheduled reduce-only exit produces realized evidence, and keep the 50 bps scan
as a rejected replacement baseline.

Subagent cross-check:

- Alt/top-10 review agreed that `KRW-H` and other latest top-test rows are not
  replacement candidates because promotion count is zero, train medians are
  negative, and walk-forward worst folds are materially negative.
- BTC-only review agreed that min75 p70 remains the best BTC 240m paper-only
  candidate under fee20/40 evidence, but that fee50 makes every tested BTC 240m
  candidate underperform BTC buy-and-hold.

## 2026-05-13 00:47 KST Top-30 Fee50 Expansion

The fee50 public scan was expanded from top-10 to top-30 Bithumb KRW markets:

- command:
  `npm run dry-run:analyze-bithumb-momentum -- --top-markets 30 --unit-minutes 240 --max-candles 5000 --fee-round-trip-bps 50 --output var/reports/high-liquidity-top30-240m-momentum-scan-fee50-20260513.json`
- generated at `2026-05-12T15:46:51.117Z`;
- selected 30 high 24h KRW-volume markets;
- usable markets `29`;
- excluded `KRW-VVV` because it had fewer than 500 candles;
- candidate count `7888`;
- promotion candidate count `0`.

Top-by-test rows were dominated by `KRW-OSMO`, but these are not promotion
quality:

- top row `KRW-OSMO`, lookback `12`, hold `8`, min return `25`,
  `rv24_below_median`: train total `-480224.586032` KRW, train median
  `-3844.086022` KRW, test total `896266.372782` KRW, test median
  `-4664.502165` KRW, walk-forward positive-total folds `2/5`,
  positive-median folds `1/5`, worst fold `-385017.807198` KRW;
- second row `KRW-OSMO`, lookback `72`, hold `8`, min return `10`,
  `rv24_below_median`: train total `-356177.630852` KRW, train median
  `-1197.916667` KRW, test total `883172.105917` KRW, test median
  `-5388.384568` KRW, walk-forward positive-total folds `2/5`,
  positive-median folds `1/5`, worst fold `-177343.352482` KRW.

This confirms that expanding the latest scan universe does not produce a
live-ready or paper-ready replacement. The apparent opportunity is recent-test
regime exposure with negative train quality and weak walk-forward stability.

The goal-status refresh after the top-30 scan wrote
`var/reports/live-goal-status-20260513-after-top30-fee50.json` and remained:

- status `blocked`;
- `liveReady=false`;
- min75 estimated exit PnL `-1504.548697` KRW;
- min75 estimated return `-0.300775%`.

Current Bithumb fee-source check:

- Bithumb support says KRW market maker/taker fees are shown as `0.25%` to
  `0.04%`.
- Bithumb's 0.04% coupon support page says the coupon applies for 30 days from
  registration. Therefore the live account fee check remains required; public
  fee pages are not enough to assume the account is actually trading at the
  discounted schedule.

## 2026-05-13 00:52 KST Cross-Sectional Fee50 Check

The cross-sectional momentum analyzer no longer hardcodes the old 8 bps cost.
It now accepts `--fee-round-trip-bps` and records both
`assumptions.feeRoundTripRate` and `assumptions.feeRoundTripBps`. This prevents
cross-sectional research from looking artificially better than the live fee
assumption.

Verification:

- `npm test -- --test-name-pattern "cross-sectional momentum|live goal status"`
  ran the JavaScript test suite and passed 137 tests.

The latest high-liquidity cross-sectional scan was then run at 50 bps:

- command:
  `npm run dry-run:analyze-bithumb-cross-sectional-momentum -- --top-markets 30 --unit-minutes 240 --max-candles 5000 --fee-round-trip-bps 50 --output var/reports/krw-top30-public-240m-cross-sectional-momentum-scan-fee50-20260513.json`
- generated at `2026-05-12T15:52:02.863Z`;
- fee round-trip bps `50`;
- timestamp count `5022`;
- candidate count `96`;
- promotion candidate count `0`.

Top-by-test candidate:

- lookback `72`, hold `24`, min return `0`, min eligible markets `3`;
- train total `697758.701353` KRW but train median `-5324.858757` KRW;
- test total `740987.211973` KRW and test median `1647.083218` KRW;
- walk-forward positive-total folds `2/5`;
- walk-forward positive-median folds `2/5`;
- worst fold `-351688.111717` KRW.

Conclusion: market-rotation does not provide a live-ready replacement either.
The best recent-test cross-sectional row still fails median quality and
walk-forward stability, so it should not replace BTC min75 or start a new live
path.

The goal-status refresh after this cross-sectional scan wrote
`var/reports/live-goal-status-20260513-after-cross-sectional-fee50.json` and
remained:

- status `blocked`;
- `liveReady=false`;
- min75 estimated exit PnL `-1504.548697` KRW;
- min75 estimated return `-0.300775%`.

## 2026-05-13 00:56 KST Replacement Research In Goal Status

The live goal status audit now accepts repeated `--replacement-scan` arguments
so rejected replacement searches can be attached to the same status report as
the current min75 and legacy-candidate evidence.

Verification:

- `npm test -- --test-name-pattern "live goal status"` ran the JavaScript test
  suite and passed 138 tests.

Current integrated status command:

- `npm run dry-run:audit-live-goal-status -- --replacement-scan var/reports/high-liquidity-top30-240m-momentum-scan-fee50-20260513.json --replacement-scan var/reports/krw-top30-public-240m-cross-sectional-momentum-scan-fee50-20260513.json --output var/reports/live-goal-status-20260513-with-replacement-research.json`

Result:

- status `blocked`;
- `liveReady=false`;
- replacement scan count `2`;
- replacement scans have no promotion candidates `true`;
- single-market top30 fee50 scan: candidate count `7888`, promotion candidate
  count `0`, top test candidate `KRW-OSMO` still has train median
  `-3844.086022` KRW, test median `-4664.502165` KRW, and worst fold
  `-385017.807198` KRW;
- cross-sectional top30 fee50 scan: candidate count `96`, promotion candidate
  count `0`, top test candidate has train median `-5324.858757` KRW and worst
  fold `-351688.111717` KRW.

This makes the current operational decision auditable in one artifact:
`var/reports/live-goal-status-20260513-with-replacement-research.json`.
Live remains blocked, and replacement research does not justify switching away
from BTC min75 paper observation.

## 2026-05-13 01:03 KST Reversal And Execution Recheck

The goal was rechecked after the user explicitly challenged whether the current
strategy should be kept if it is losing. The current answer is no: it should not
be forced to live. The only defensible action is to keep live blocked and test
new hypotheses without weakening the promotion gates.

Current integrated status:

- latest goal status:
  `var/reports/live-goal-status-20260513-with-replacement-and-reversal-research.json`;
- generated at `2026-05-12T16:03:22.427Z`;
- status `blocked`;
- `liveReady=false`;
- min75 classification `paper_candidate`;
- min75 latest diagnostic mark `-1223.992723` KRW, `-0.244689%`;
- hold exit due `2026-05-16T11:00:00.000Z`;
- live blockers remain `min75LiveReady`, `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl`.

Subagent cross-check:

- local-evidence review concluded that min75 should not be defended as
  live-ready: at 50 bps it underperforms buy-and-hold, and the current paper
  position is still open and marked negative;
- web/research review narrowed the next independent strategy families to
  order-flow continuation on execution-clean markets and volatility-contraction
  breakout with volume/orderbook confirmation, both subject to explicit fee and
  slippage hurdles;
- both reviews agree that a positive recent test total is not enough when
  train medians and walk-forward folds fail.

Additional replacement scan:

- command:
  `npm run dry-run:analyze-bithumb-momentum -- --top-markets 30 --signal-mode reversal --unit-minutes 240 --max-candles 5000 --fee-round-trip-bps 50 --output var/reports/high-liquidity-top30-240m-reversal-scan-fee50-20260513.json`;
- generated at `2026-05-12T16:02:44.626Z`;
- usable markets `29`, candidate count `7888`;
- promotion candidate count `0`;
- top-by-test row: `KRW-SOLV`, lookback `72`, hold `24`,
  `rv24_below_median`;
- top row train total `-262302.831837` KRW and train median
  `-5748.418533` KRW;
- top row test total `1196775.083129` KRW but test median
  `-8515.625000` KRW;
- walk-forward positive-total folds `2/5`, positive-median folds `0/5`,
  worst fold `-211641.565444` KRW.

Execution-universe check:

- command:
  `npm run dry-run:analyze-bithumb-execution-universe -- --top-markets 30 --notional-krw 500000 --max-spread-bps 20 --min-turnover-24h-krw 30000000000 --live-allowed-markets KRW-BTC,KRW-ETH,KRW-XRP --output var/reports/bithumb-top30-execution-universe-20260513.json`;
- generated at `2026-05-12T16:03:23.129Z`;
- execution candidates: `KRW-BTC`, `KRW-ETH`, `KRW-XRP`, `KRW-USDT`,
  `KRW-SOLV`;
- live-compatible execution candidates under the allowed-market check:
  `KRW-BTC`, `KRW-ETH`, `KRW-XRP`;
- this is execution feasibility only, not profitability evidence.

Web/research interpretation:

- Bithumb fee pages still require account-level fee confirmation because the
  public fee schedule can be materially different depending on coupon status;
- recent cryptocurrency momentum literature is mixed under realistic
  transaction costs, so local fee-stressed walk-forward evidence must dominate
  generic strategy claims;
- order-book/order-flow strategies are plausible research directions, but they
  require locally observed short-horizon edge after spread, taker fees, fill
  delay, and adverse-selection checks. They are not a live shortcut.

Decision:

The goal is still not achieved. The current live-profit objective is set
correctly because the gate blocks live, rejected legacy strategies are stopped,
and replacement research is attached to the status artifact. But no strategy is
currently live-ready or profitable enough to promote. BTC min75 remains only a
paper observation candidate; if its scheduled reduce-only exit realizes a loss,
the candidate must stay blocked and the next work should move to measured
order-flow or volatility-contraction breakout experiments on
`KRW-BTC`/`KRW-ETH`/`KRW-XRP`, not to live execution.

## 2026-05-13 01:19 KST Order-Flow Continuation Measurement

The next subagent-recommended strategy family, short-horizon order-flow
continuation, was measured without placing orders. A new research-only CLI was
added:

```sh
npm run dry-run:analyze-order-flow-continuation
```

It scans local passive feature snapshots and future orderbook snapshots using
non-overlapping long-only trades: enter at best ask, exit at future best bid,
and subtract the configured round-trip fee. Candidate gates vary only
`ret_5m_bps`, 60-second buy-flow share, depth ratio, and max spread. Promotion
requires positive train/test totals, positive train/test medians, enough trades,
and stable walk-forward folds.

Verification:

- `npm test -- --test-name-pattern "order-flow continuation"` ran the
  JavaScript test suite and passed 139 tests.
- `git diff --check` passed before this documentation update.

Real-data scans:

- fee50 command:
  `npm run dry-run:analyze-order-flow-continuation -- --markets KRW-BTC,KRW-ETH,KRW-XRP --fee-round-trip-bps 50 --horizon-seconds 300 --min-snapshots 100 --output var/reports/order-flow-continuation-btc-eth-xrp-h300-fee50-20260513.json`;
- fee8 command:
  `npm run dry-run:analyze-order-flow-continuation -- --markets KRW-BTC,KRW-ETH,KRW-XRP --fee-round-trip-bps 8 --horizon-seconds 300 --min-snapshots 100 --output var/reports/order-flow-continuation-btc-eth-xrp-h300-fee8-20260513.json`;
- both evaluated `960` candidates across BTC/ETH/XRP.

Results:

- fee50 promotion candidates: `0`;
- fee8 promotion candidates: `0`;
- fee50 best BTC row: train total `-80918.799467` KRW, train median
  `-2396.105304` KRW, test total `-16818.672513` KRW, test median
  `-2996.147560` KRW, positive-total walk-forward folds `0/5`;
- fee8 best BTC row: train total `-11618.799467` KRW, train median
  `-296.105304` KRW, test total `-4218.672513` KRW, test median
  `-896.147560` KRW, positive-total walk-forward folds `0/5`;
- fee50 best ETH row: train median `-2791.970803` KRW, test median
  `-2646.886016` KRW, positive-total walk-forward folds `0/5`;
- fee8 best ETH row: train median `-691.970803` KRW, test median
  `-546.886016` KRW, positive-total walk-forward folds `1/5`;
- XRP had too few qualifying held-out trades in the best rows and still had
  negative train/test medians at both fee settings.

Integrated status:

- `var/reports/live-goal-status-20260513-with-all-replacement-research.json`;
- generated at `2026-05-12T16:19:17.059Z`;
- status `blocked`;
- `liveReady=false`;
- replacement scan count `5`;
- all replacement scans have promotion candidate count `0`;
- latest min75 mark in that integrated status is `-1575.734542` KRW,
  `-0.315006%`.

Conclusion:

Order-flow continuation is not a profitable replacement under the current local
evidence, even with the discounted 8 bps assumption. This removes the most
obvious microstructure alternative from the live-candidate set for now. The
remaining honest options are to keep min75 blocked until its scheduled realized
paper exit, or to measure a different family such as volatility-contraction
breakout with the same fee-stressed train/test/walk-forward discipline.

## 2026-05-13 01:35 KST Volatility-Breakout Measurement

The next measured family was volatility-contraction breakout on the
live-compatible KRW markets `KRW-BTC`, `KRW-ETH`, and `KRW-XRP`. A new
research-only CLI was added:

```sh
npm run dry-run:analyze-volatility-breakout
```

It uses public Bithumb candles only. Signals require a prior range below a
train-derived percentile, a close above the previous high by the configured
breakout threshold, and volume above the prior average. Trades are
non-overlapping long-only close-to-close holds with explicit round-trip fee
subtraction. Promotion requires enough train/test trades, positive train/test
totals, positive train/test medians, positive walk-forward total, and no
negative walk-forward fold.

Verification:

- `npm test -- --test-name-pattern "volatility breakout"` ran the JavaScript
  test suite and passed 140 tests.

Real-data scans:

- fee50 command:
  `npm run dry-run:analyze-volatility-breakout -- --markets KRW-BTC,KRW-ETH,KRW-XRP --unit-minutes 60 --max-candles 5000 --fee-round-trip-bps 50 --output var/reports/volatility-breakout-btc-eth-xrp-60m-fee50-20260513.json`;
- fee8 command:
  `npm run dry-run:analyze-volatility-breakout -- --markets KRW-BTC,KRW-ETH,KRW-XRP --unit-minutes 60 --max-candles 5000 --fee-round-trip-bps 8 --output var/reports/volatility-breakout-btc-eth-xrp-60m-fee8-20260513.json`;
- both evaluated `972` candidates across BTC/ETH/XRP.

Results:

- fee50 promotion candidates: `0`;
- fee8 promotion candidates: `0`;
- fee50 top-by-test row was `KRW-XRP`, hold `24`: train total
  `-1043.121325` KRW, train median `-8447.071067` KRW, test total
  `45572.396283` KRW, test median `3521.306160` KRW, positive-total
  walk-forward folds `3/5`, positive-median folds `1/5`, worst fold
  `-19503.432698` KRW;
- fee8 top-by-test row was `KRW-ETH`, hold `8`: train total
  `-8678.117538` KRW, train median `-730.833701` KRW, test total
  `67859.397107` KRW, test median `466.050808` KRW, positive-total
  walk-forward folds `4/5`, positive-median folds `1/5`, worst fold
  `-14126.598113` KRW.

Integrated status:

- `var/reports/live-goal-status-20260513-with-vol-breakout-research.json`;
- generated at `2026-05-12T16:35:38.020Z`;
- status `blocked`;
- `liveReady=false`;
- replacement scan count `7`;
- all replacement scans have promotion candidate count `0`;
- latest min75 open mark in that integrated status is `-1445.925061` KRW,
  `-0.289055%`.

Conclusion:

Volatility-contraction breakout does not currently provide a live-capable
replacement. The apparent test-period profits are not trustworthy because the
train side is negative and the walk-forward distribution still contains losing
folds. The live goal remains correctly blocked: no currently measured strategy
has positive realized paper evidence plus a passing replacement scan.

## 2026-05-13 01:54 KST Order-Flow Reversion And Absorption Measurement

The order-flow analyzer was extended with two additional signal modes so the
subagent-proposed microstructure alternatives could be measured without
introducing maker-fill optimism:

- `reversion`: `ret_5m_bps <= -minRet5mBps` and
  `buy_notional_share_60s <= 1 - minBuyNotionalShare60s`;
- `absorption`: `ret_5m_bps <= -minRet5mBps` and
  `buy_notional_share_60s >= minBuyNotionalShare60s`.

Both modes still enter at the observed best ask, exit at the future best bid,
and subtract the configured round-trip fee. No intra-candle best-case fill or
maker queue assumption is used.

Verification:

- `npm test -- --test-name-pattern "order-flow"` ran the JavaScript test suite
  and passed 142 tests.

Real-data scans:

- reversion fee50:
  `npm run dry-run:analyze-order-flow-continuation -- --markets KRW-BTC,KRW-ETH,KRW-XRP --signal-mode reversion --fee-round-trip-bps 50 --horizon-seconds 300 --min-snapshots 100 --output var/reports/order-flow-reversion-btc-eth-xrp-h300-fee50-20260513.json`;
- reversion fee8:
  `npm run dry-run:analyze-order-flow-continuation -- --markets KRW-BTC,KRW-ETH,KRW-XRP --signal-mode reversion --fee-round-trip-bps 8 --horizon-seconds 300 --min-snapshots 100 --output var/reports/order-flow-reversion-btc-eth-xrp-h300-fee8-20260513.json`;
- absorption fee50:
  `npm run dry-run:analyze-order-flow-continuation -- --markets KRW-BTC,KRW-ETH,KRW-XRP --signal-mode absorption --fee-round-trip-bps 50 --horizon-seconds 300 --min-snapshots 100 --output var/reports/order-flow-absorption-btc-eth-xrp-h300-fee50-20260513.json`;
- absorption fee8:
  `npm run dry-run:analyze-order-flow-continuation -- --markets KRW-BTC,KRW-ETH,KRW-XRP --signal-mode absorption --fee-round-trip-bps 8 --horizon-seconds 300 --min-snapshots 100 --output var/reports/order-flow-absorption-btc-eth-xrp-h300-fee8-20260513.json`;
- each scan evaluated `960` candidates across BTC/ETH/XRP.

Results:

- reversion fee50 promotion candidates: `0`;
- reversion fee8 promotion candidates: `0`;
- absorption fee50 promotion candidates: `0`;
- absorption fee8 promotion candidates: `0`;
- reversion fee50 top row was `KRW-BTC`: train total `-56409.123759`
  KRW, train median `-2875.402871` KRW, test total `-2466.350926`
  KRW, positive-total walk-forward folds `0/5`;
- reversion fee8 top row was `KRW-BTC`: train total `-15584.099096`
  KRW, train median `-775.402871` KRW, test total `565.222504`
  KRW, positive-total walk-forward folds `2/5`, worst fold
  `-7774.474525` KRW;
- absorption fee50 top row was `KRW-BTC`: train total `-1743.647489`
  KRW, test trade count `0`, positive-total walk-forward folds `0/5`;
- absorption fee8 top row was `KRW-BTC`: train total `-12711.220930`
  KRW, train median `-348.370220` KRW, test total `1713.559249`
  KRW, positive-total walk-forward folds `2/5`, worst fold
  `-7161.162190` KRW.

Integrated status:

- `var/reports/live-goal-status-20260513-with-absorption-reversion-research.json`;
- generated at `2026-05-12T16:54:15.238Z`;
- status `blocked`;
- `liveReady=false`;
- replacement scan count `11`;
- all replacement scans have promotion candidate count `0`;
- latest min75 open mark in that integrated status is `-3154.385323` KRW,
  `-0.630594%`;
- min75 classification regressed to `research_candidate`.

Conclusion:

The current local evidence does not support live execution. The microstructure
families now measured cover continuation, sell-pressure reversion, and
absorption-style dip buying; none survives even the 8 bps sensitivity case with
the required train/test/walk-forward gates. The live gate must remain blocked.

## 2026-05-13 02:46 KST Multi-Horizon And Recovery-Confirmed Order Flow

The order-flow analyzer was extended again to avoid anchoring on the original
300 second horizon. `--horizons-seconds` now evaluates multiple exit horizons in
one scan, and a new `recovery` signal mode measures the subagent-proposed
"shock then recovery confirmation" path:

- prior snapshot: `ret_5m_bps <= -minRet5mBps`;
- current snapshot: `ret_5m_bps` improves by `minRecoveryRetBps`;
- current buy notional share, spread, and depth must confirm recovery;
- execution remains best ask entry to future best bid exit with configured
  round-trip fees.

Verification:

- `npm test -- --test-name-pattern "order-flow"` ran the JavaScript test suite
  and passed 143 tests.

Real-data scans:

- multi-horizon continuation fee50:
  `var/reports/order-flow-continuation-btc-eth-xrp-h60-180-300-900-1800-fee50-20260513.json`;
- multi-horizon continuation fee8:
  `var/reports/order-flow-continuation-btc-eth-xrp-h60-180-300-900-1800-fee8-20260513.json`;
- recovery-confirmed fee8:
  `var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee8-20260513.json`.

Results:

- continuation fee50 evaluated `4800` candidates and found `0` promotion
  candidates;
- continuation fee8 evaluated `4800` candidates and found `0` promotion
  candidates;
- recovery fee8 evaluated `8748` candidates and found `0` promotion
  candidates;
- recovery fee8 top-by-test row was `KRW-XRP`, horizon `900`, but it had only
  `5` train trades and `1` test trade; train total was `-5376.333350` KRW,
  train median was `-878.468900` KRW, walk-forward positive-total folds were
  `1/5`, and worst fold was `-4740.038454` KRW.

Latest integrated status:

- `var/reports/live-goal-status-20260513-with-recovery-research.json`;
- generated at `2026-05-12T17:46:26.744Z`;
- status `blocked`;
- `liveReady=false`;
- replacement scan count `14`;
- all replacement scans have promotion candidate count `0`;
- refreshed min75 open mark is `-348.825579` KRW, `-0.069734%`;
- hold exit remains due at `2026-05-16T11:00:00.000Z`.

Conclusion:

The current strategy objective is correctly blocked. The open min75 candidate is
still not profitable on current mark and is not realized. The expanded
replacement research now covers high-liquidity momentum/reversal,
cross-sectional momentum, order-flow continuation, sell-pressure reversion,
absorption, recovery-confirmed dip buying, and volatility breakout. None has
promotion evidence under the required train/test/walk-forward gates, so live
startup must remain blocked.

## 2026-05-13 03:02 KST Cross-Market Lead/Lag Confirmation

The next subagent-proposed independent strategy family was measured as a new
research CLI:

- `src/cli/analyze-cross-market-lead-lag.ts`;
- npm script: `dry-run:analyze-cross-market-lead-lag`.

The analyzer uses local 1 minute candles for BTC/ETH/XRP only to form the
cross-market signal, then prices each candidate with target-market orderbook
execution:

- signal timestamps are restricted to the common BTC/ETH/XRP candle interval;
- candle timestamps are bucketed to the configured unit minute to avoid
  false non-overlap from sub-minute ingestion timestamps;
- entry uses the target market's next-period best ask;
- exit uses the target market's future best bid;
- trades are non-overlapping long-only and fee-stressed.

Verification:

- `npm test -- --test-name-pattern "cross-market"` ran the JavaScript test
  suite and passed 144 tests.

Real-data scans:

- fee50:
  `var/reports/cross-market-lead-lag-btc-eth-xrp-fee50-20260513.json`;
- fee8:
  `var/reports/cross-market-lead-lag-btc-eth-xrp-fee8-20260513.json`;
- both evaluated `1200` candidates over `21416` common signal timestamps.

Results:

- fee50 promotion candidates: `0`;
- fee8 promotion candidates: `0`;
- fee50 top-by-test row was `KRW-ETH`, lookback `15`, hold `240`,
  `minLeaderReturnBps=50`, `minConfirmingMarkets=2`, target confirmation
  required; train count was `18`, train total `-20128.264695` KRW, train
  median `-1634.448932` KRW, test count `1`, and walk-forward total
  `-18358.409870` KRW;
- fee8 top-by-test row used the same candidate; train total improved to
  `17671.735305` KRW, but test count was only `1`, worst fold was
  `-6141.543054` KRW, and positive-median folds were only `3/5`.

Latest integrated status:

- `var/reports/live-goal-status-20260513-with-cross-market-research.json`;
- generated at `2026-05-12T18:02:40.870Z`;
- status `blocked`;
- `liveReady=false`;
- replacement scan count `16`;
- all replacement scans have promotion candidate count `0`;
- refreshed min75 open mark is `-269.264929` KRW, `-0.053829%`;
- `--require-live-ready` exited with code `2`, as intended.

Conclusion:

Cross-market confirmation did not produce a live candidate. The discounted-fee
case has an undersampled, unstable top row, and the realistic fee50 case remains
negative. The live objective is therefore still not achieved; the correct
operational action is to keep live startup blocked.

## 2026-05-13 03:10 KST Maker Execution Feasibility

After alpha scans failed, the next operational question was whether maker
execution could realistically lower the cost barrier enough to justify a
different live path. This was checked against the existing conservative
maker-fill analyzer and current official Bithumb order semantics.

Implementation note:

- `src/cli/analyze-maker-fill-quality.ts` now labels `NoReward` as the live-fee
  baseline and `WithMakerReward` as a sensitivity case only.

Verification:

- `npm test -- --test-name-pattern "maker fill"` ran the JavaScript test suite
  and passed 144 tests.

Official API constraint:

- Bithumb's current order request API lists `order_type` values `limit`,
  `price`, and `market`; there is no documented `post_only` or
  `time_in_force` parameter in the current order request surface. Therefore a
  live maker strategy cannot assume the exchange will reject taker-crossing
  orders automatically.

Real-data maker fill-quality refreshes:

- `var/reports/maker-fill-quality-btc-500k-ttl60-20260513.json`;
- `var/reports/maker-fill-quality-eth-500k-ttl60-20260513.json`;
- `var/reports/maker-fill-quality-xrp-500k-ttl60-20260513.json`.

Results at 500k KRW notional, 60 second TTL, 15 second sample interval:

- BTC fill rate `0.504981`, median fill delay `12.55s`; 30s no-reward median
  PnL `-438.065499` KRW and 60s no-reward median PnL `-446.167024` KRW;
- ETH fill rate `0.402337`, median fill delay `15.732s`; 30s no-reward median
  PnL `-544.159215` KRW and 60s no-reward median PnL `-544.200808` KRW;
- XRP fill rate `0.348639`, median fill delay `16.953s`; 30s no-reward median
  PnL `-633.224452` KRW and 60s no-reward median PnL `-633.660589` KRW.

Conclusion:

Maker execution is not currently a reliable live escape hatch. Even under a
conservative queue-ahead model, filled maker bids have negative no-reward median
PnL across BTC/ETH/XRP, and the API surface does not provide a documented
post-only guarantee. A maker-based live strategy would require separate queue
evidence, cancel/replace safety tests, and account-specific fee/reward
confirmation before it could be considered.

## 2026-05-13 03:20 KST Intraday Session Edge

The next independent strategy family was KST time-of-day and weekday-hour
seasonality. A new research-only CLI was added:

- `src/cli/analyze-intraday-session-edge.ts`;
- npm script: `dry-run:analyze-intraday-session-edge`.

The analyzer uses local candles only for the time-window signal and prices each
candidate with orderbook execution:

- signal is KST hour or KST weekday-hour only;
- entry uses best ask at the signal timestamp;
- exit uses future best bid;
- trades are non-overlapping long-only and fee-stressed;
- promotion still requires positive train/test totals, positive train/test
  medians, adequate trade counts, positive walk-forward total, and no negative
  walk-forward fold.

Verification:

- `npm test -- --test-name-pattern "intraday session"` ran the JavaScript test
  suite and passed 145 tests.

Real-data scans:

- fee50:
  `var/reports/intraday-session-edge-btc-eth-xrp-fee50-20260513.json`;
- fee8:
  `var/reports/intraday-session-edge-btc-eth-xrp-fee8-20260513.json`;
- both evaluated `1728` candidates across BTC/ETH/XRP.

Results:

- fee50 promotion candidates: `0`;
- fee8 promotion candidates: `0`;
- fee50 top-by-test row was `KRW-BTC`, Tuesday 23:00 KST, hold `240`, but it
  had only `3` train trades and `2` test trades; train total was
  `-7394.308555` KRW and worst fold was `-7855.538664` KRW;
- fee8 top-by-test row used the same window; train count remained `3`, test
  count remained `2`, train total remained negative at `-1094.308555` KRW, and
  worst fold was `-5755.538664` KRW.

Latest integrated status:

- `var/reports/live-goal-status-20260513-with-intraday-session-research.json`;
- generated at `2026-05-12T18:20:15.449Z`;
- status `blocked`;
- `liveReady=false`;
- replacement scan count `18`;
- all replacement scans have promotion candidate count `0`;
- refreshed min75 open mark is `-273.452332` KRW, `-0.054666%`;
- `--require-live-ready` exited with code `2`, as intended.

Conclusion:

Intraday session timing does not provide a live-capable candidate. The apparent
best rows are undersampled and fail train/walk-forward requirements. The live
goal remains blocked.

## 2026-05-13 03:33 KST Data Coverage Gate

The latest independent review kept the same conclusion: the goal is still the
right one, but no local evidence supports live deployment. The work now blocks
promotion on data freshness as well as PnL/readiness:

- added `src/cli/audit-research-data-coverage.ts`;
- added npm script `dry-run:audit-research-data-coverage`;
- extended `src/cli/audit-live-goal-status.ts` with optional
  `--data-coverage`, which contributes `researchDataFresh` to the live gate.

Verification:

- `npm test -- --test-name-pattern "research data coverage|live goal status"`
  ran the JavaScript test suite and passed `148` tests.

Generated reports:

- `var/reports/research-data-coverage-btc-eth-xrp-20260513.json`;
- `var/reports/live-goal-status-20260513-with-data-coverage-gate.json`.

Data coverage result:

- BTC is fresh across `candle_1m`, `trade_tick`, `orderbook_snapshot`, and
  `passive_feature_snapshot`, with latest timestamps around
  `2026-05-11T21:29:09Z` to `2026-05-11T21:31:00Z`;
- ETH and XRP are stale across all four datasets, with latest timestamps around
  `2026-04-28T13:55Z` to `2026-04-28T13:58Z`;
- stale ETH/XRP evidence blocks cross-market, order-flow, and session promotion.

Latest integrated status:

- status `blocked`;
- `liveReady=false`;
- blockers are `min75LiveReady`, `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, `positiveRealizedPaperExitPnl`, and
  `researchDataFresh`;
- min75 open mark is `-227.390903` KRW, `-0.045458%`;
- hold exit due remains `2026-05-16T11:00:00.000Z`;
- replacement research scan count is `13`;
- all attached replacement scans have promotion candidate count `0`;
- `--require-live-ready` exits with code `2`, as intended.

External strategy read:

- Bithumb official docs show KRW market fees at `0.04%` when the current fee
  policy/coupon conditions apply, while public market-liquidity research still
  models Bithumb KRW fees in a `0.04%-0.25%` range;
- Bithumb order docs list `limit`, `price`, and `market` order types, with no
  documented post-only flag in the order request surface checked here;
- Korean crypto liquidity research points to exchange-level relative value and
  Kimchi-premium convergence as the remaining plausible axis, but that requires
  fresh Bithumb/Upbit/global reference data and total-cost hedging evaluation.

Conclusion:

Do not live-trade the current candidates. Do not keep adding filters to the
failed Bithumb-only direction strategies. The current min75 paper position should
only be monitored until its reduce-only due exit; if the realized exit is not net
positive, min75 should be rejected. The next viable research direction is a new
cross-exchange relative-value dataset and gate, not another threshold scan on the
stale local BTC/ETH/XRP evidence.

## 2026-05-13 03:48 KST Cross-Exchange Relative Value Scaffold

The next non-overlapping strategy family is cross-exchange relative value rather
than another Bithumb-only directional threshold scan. A research-only CLI was
added:

- `src/cli/analyze-cross-exchange-relative-value.ts`;
- npm script: `dry-run:analyze-cross-exchange-relative-value`.

The analyzer can read stored observations or collect fresh public orderbook
snapshots. Current implemented references:

- Bithumb `KRW-BTC` orderbook;
- Upbit `KRW-BTC` orderbook;
- Binance `BTCUSDT` bookTicker when an explicit `--usd-krw` value is supplied.

The report prices only executable directions:

- sell Bithumb bid and buy reference ask;
- buy Bithumb ask and sell reference bid;
- no mid-price synthetic edge;
- fee-stressed net edge;
- top-of-book depth coverage for the configured notional;
- snapshot timestamp skew;
- repeated-observation promotion gates.

Promotion blockers include:

- insufficient observation count;
- account fee schedule not confirmed;
- inventory/funding not ready;
- hedge venue not ready;
- weak median net edge;
- low positive edge rate;
- wide displayed spread;
- insufficient top-of-book depth;
- stale latest observation;
- missing or excessive snapshot skew.

Verification:

- `npm test -- --test-name-pattern "cross-exchange relative value"` ran the
  JavaScript test suite and passed `150` tests.

Live public observation:

- `var/reports/cross-exchange-relative-value-btc-upbit-15s-20260513.json`;
- 15 second run, 5 second interval, `4` observations;
- status `blocked`;
- promotion eligible `false`;
- positive edge observations `0`;
- median net edge `-8.118494` bps;
- best observed net edge `-5.31709` bps;
- total estimated net PnL over the 4 best-direction observations
  `-1489.905664` KRW for 500k KRW notional;
- depth was insufficient in the best-direction top-of-book for this notional.

Conclusion:

The relative-value path now has a measurement scaffold, but the current
Bithumb-Upbit BTC snapshot distribution is not profitable after taker fees and
is not live-promotable. This remains an observation path only. A live candidate
would require at least 100 fresh observations, confirmed account fees, pre-funded
inventory on both venues, executable hedge path, positive median net edge, and a
positive edge rate above the configured gate.

## 2026-05-13 04:13 KST 100-Observation Follow-Up

The Bithumb-Upbit BTC relative-value path was extended from a short smoke run to
`101` fresh public observations:

- `var/reports/cross-exchange-relative-value-btc-upbit-100s-20260513.json`;
- `100` second run, `1` second interval;
- status `blocked`;
- promotion eligible `false`;
- positive edge observations `0 / 101`;
- positive edge rate `0`;
- average net edge `-9.002653` bps;
- median net edge `-9.832189` bps;
- best observed net edge `-5.736067` bps;
- worst observed net edge `-11.085146` bps;
- total estimated net PnL over best-direction observations
  `-45463.397543` KRW for 500k KRW notional.

Remaining blockers:

- account fee schedule not confirmed against authenticated account terms;
- inventory not ready on both venues;
- hedge venue not ready;
- weak median net edge;
- low positive edge rate;
- insufficient executable depth for the configured notional;
- snapshot skew too wide.

Conclusion:

The direct Bithumb-Upbit BTC taker relative-value candidate is rejected for live
promotion. It is not merely under-sampled anymore; after `101` observations it
has no positive executable edge and a negative median edge after fees. The next
research step should not keep this candidate alive by relaxing gates. It should
either collect a broader cross-exchange universe with the same conservative
bid/ask fee-stressed math, or shift to a different strategy family with closed
trade evidence.

## 2026-05-13 04:59 KST Global Relative-Value Follow-Up

The same analyzer was run with Binance `BTCUSDT` included and an explicit
USD/KRW input of `1473.051627` from a public FX API snapshot:

- `var/reports/cross-exchange-relative-value-btc-upbit-binance-100s-20260513.json`;
- `100` second run, `1` second interval;
- `101` observations;
- status `blocked`;
- promotion eligible `false`;
- positive edge observations `101 / 101`;
- positive edge rate `1`;
- average net edge `44.429428` bps;
- median net edge `44.086967` bps;
- best observed net edge `46.133746` bps;
- worst observed net edge `43.473435` bps;
- total estimated net PnL over best-direction observations
  `224368.609594` KRW for 500k KRW notional.

The best direction was consistently:

- sell BTC on Bithumb bid;
- buy BTC on Binance ask;
- fees included: Bithumb `4` bps, Binance/global `10` bps;
- no synthetic mid-price edge.

Remaining blockers:

- account fee schedule not confirmed against authenticated account terms;
- Bithumb BTC inventory and Binance USDT inventory not confirmed;
- hedge venue execution path not live-ready;
- Binance bookTicker does not provide a source timestamp in the current report,
  so cross-venue snapshot skew remains unverified.

Conclusion:

This is the first observed path with a positive fee-stressed edge distribution,
but it is not live-ready. It should become the next promotion candidate only
after the live path proves prefunded inventory on both venues, authenticated
fees, source-timestamp or receive-time skew control, FX freshness, and a
closed-loop reconciliation model for KRW/USDT capital drift. Until those gates
are explicit, this remains a research candidate, not an executable live strategy.

## 2026-05-13 05:08 KST FX/Skew/Depth Gate Update

The global relative-value analyzer was tightened so the profitable-looking
Bithumb-Binance path cannot be promoted on price edge alone:

- explicit `--usd-krw-updated-at` FX freshness input;
- `maxFxAgeHours` gate;
- receive-time skew fallback via explicit `--allow-receive-time-skew`;
- per-edge `snapshotSkewSource`;
- depth coverage count/rate with `minDepthCoverageRate` defaulting to `0.95`.

Latest gated report:

- `var/reports/cross-exchange-relative-value-btc-binance-live-gates-20260513.json`;
- `101` observations;
- status `blocked`;
- promotion eligible `false`;
- positive edge observations `101 / 101`;
- positive edge rate `1`;
- average net edge `42.860256` bps;
- median net edge `42.739405` bps;
- best observed net edge `46.657725` bps;
- worst observed net edge `40.304222` bps;
- total estimated net PnL over best-direction observations
  `216444.292383` KRW for 500k KRW notional;
- FX age `19.091667` hours, within the configured `24` hour gate;
- receive-time skew was controlled in the report, but Binance source timestamps
  remain unavailable from the current public endpoint;
- depth coverage was only `81 / 101`, or `0.80198`, below the configured `0.95`
  gate.

Remaining blockers:

- account fee schedule not confirmed against authenticated account terms;
- Bithumb/Binance inventory not ready;
- hedge venue execution path not ready;
- depth coverage below the live threshold.

Conclusion:

The current best path is still Bithumb-Binance BTC relative value, not
Bithumb-Upbit and not the prior Bithumb-only directional strategy. It has a
repeatable positive fee-stressed edge in the latest sample, but it is not live
ready because the executable depth coverage is too low and the operational
preconditions are not proven.

## 2026-05-13 05:11 KST Notional Sensitivity

The same `101` observations were replayed across notional sizes to isolate
entry size from edge quality:

- 50k KRW: depth coverage `0.980198`, median edge `42.739405` bps, estimated
  replay PnL `21644.429254` KRW, blockers limited to fee/inventory/hedge;
- 100k KRW: depth coverage `0.841584`, median edge `42.739405` bps, estimated
  replay PnL `43288.858486` KRW, depth blocker active;
- 250k KRW: depth coverage `0.831683`, median edge `42.739405` bps, estimated
  replay PnL `108222.146189` KRW, depth blocker active;
- 500k KRW: depth coverage `0.80198`, median edge `42.739405` bps, estimated
  replay PnL `216444.292383` KRW, depth blocker active.

Conclusion:

If this path is promoted later, the initial live notional should be no larger
than 50k KRW until deeper-book VWAP evidence or better Bithumb bid depth is
measured. This is not proof of live profitability; it only identifies the first
size where the current top-of-book depth gate stops blocking.

## 2026-05-13 05:17 KST Live Readiness Audit

A separate live-readiness audit was added so a positive relative-value edge
cannot be confused with permission to execute:

- `src/cli/audit-cross-exchange-live-readiness.ts`;
- npm script: `dry-run:audit-cross-exchange-live-readiness`;
- test coverage: `test/audit-cross-exchange-live-readiness.test.ts`.

The audit maps the best measured direction to required inventory:

- `sell_bithumb_buy_reference` requires Bithumb base inventory and reference
  quote inventory;
- `buy_bithumb_sell_reference` requires Bithumb quote inventory and reference
  base inventory.

It also requires:

- sufficient observations;
- positive edge rate;
- positive median net edge;
- positive estimated net PnL;
- depth coverage;
- fresh latest observation;
- fresh FX;
- controlled snapshot skew;
- account fee confirmation;
- inventory proof;
- hedge venue readiness.

Current 50k audit artifact:

- `var/reports/cross-exchange-live-readiness-btc-binance-50k-20260513.json`;
- live ready `false`;
- blockers: `executionPathReady`, `accountFeesConfirmed`, `inventoryReady`,
  `hedgeVenueReady`;
- strategy evidence checks all pass at 50k KRW notional;
- operational proof is still missing.

Conclusion:

The next concrete path to live is not another strategy scan. It is to provide
fresh operational proof for the 50k Bithumb-Binance relative-value candidate:
an implemented cross-exchange live execution path, authenticated account fees,
Bithumb BTC inventory, Binance quote inventory, and a ready hedge execution
venue. Until those pieces exist, the repository now has a machine-readable gate
that blocks live promotion even though the measured edge is positive.

## 2026-05-13 05:20 KST Execution Path Blocker

The readiness audit now statically checks for a cross-exchange live execution
path, not just strategy and account evidence. The current repository has a
Bithumb live venue, but no Binance live venue or hedged two-leg relative-value
executor. Therefore the 50k candidate is still blocked even though strategy
evidence passes.

Required implementation evidence for this blocker to clear:

- `src/live/binance.ts` with `createBinancePrivateClient`;
- `src/execution/cross-exchange-relative-value-live.ts` with
  `submitHedgedRelativeValueOrder`;
- PM2/package wiring for `live-cross-exchange-relative-value`.

Conclusion:

Do not attempt live execution by adapting the single-venue Bithumb manager. The
profitable candidate is explicitly a two-venue hedge. A live path must be built
as an atomic or fail-closed two-leg workflow before any real order is submitted.

## 2026-05-13 05:35 KST Binance Hedge Client Step

The first execution-path gap was narrowed without changing strategy
profitability assumptions:

- `src/live/binance.ts` now implements Binance HMAC REST signing using the
  official `timestamp`/`recvWindow`/`signature` query flow and `X-MBX-APIKEY`
  header.
- The Binance client exposes account, commission, order submit, order query,
  and cancel endpoints needed for fee and hedge proof.
- `createBinanceRelativeValueVenue` maps a relative-value hedge leg to a
  Binance `LIMIT` `IOC` order with `newOrderRespType=RESULT`.
- The venue normalizes only returned executed quantity and quote notional; it
  does not assume a fill when Binance reports no fill.
- The existing hedged executor still fails closed if either leg is rejected or
  does not fully fill, and it cancels any accepted non-terminal paired leg.

Verification:

- `npm test -- --test-name-pattern "Binance|hedged relative-value|cross-exchange live readiness"`
  ran the JavaScript suite and passed `164` tests.
- The Binance signer test matches the official HMAC example signature for
  `POST /api/v3/order`.
- A refreshed readiness artifact was written to
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-20260513-after-binance-client.json`.

Current status after this step:

- the 50k Bithumb-Binance strategy evidence still passes;
- live readiness is still `false`;
- blockers remain `executionPathReady`, `accountFeesConfirmed`,
  `inventoryReady`, and `hedgeVenueReady`.

Interpretation:

This is progress toward the live path, not live approval. The repository now
has a Binance private client and hedge-leg adapter, but the full
`executionPathReady` gate remains blocked until a managed
`live-cross-exchange-relative-value` entrypoint exists and authenticated
account fee, inventory, and hedge venue proof are supplied. Subagent recheck
agreed that 50k Bithumb-Binance relative value is the only candidate worth
continuing, while Bithumb-only, Upbit-direct, and larger-notional variants
should remain rejected.

## 2026-05-13 05:43 KST Cross-Exchange Live Entrypoint Gate

The cross-exchange path now has a PM2-managed live entrypoint, but it is wired
to fail before PM2 can start unless the 50k readiness audit passes:

- `src/cli/run-cross-exchange-relative-value-live.ts` reads a readiness report
  and refuses to continue unless `liveReady=true`;
- the runner also requires `ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=true`,
  `ENABLE_LIVE_EXECUTION=true`, and both Bithumb and Binance API secrets;
- `package.json` adds `dry-run:run-cross-exchange-relative-value-live` and
  PM2 start/restart/status/log scripts for
  `live-cross-exchange-relative-value`;
- `ecosystem.config.cjs` adds the `live-cross-exchange-relative-value` target
  with `ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION=false` by default;
- `audit-cross-exchange-live-readiness` now treats a missing operational proof
  path as blocked evidence instead of crashing with `ENOENT`.

Current readiness after adding the entrypoint:

- artifact:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-latest.json`;
- `executionPathReady=true`;
- `liveReady=false`;
- remaining blockers: `accountFeesConfirmed`, `inventoryReady`,
  `hedgeVenueReady`.

Operational start check:

- `npm run pm2:start:live-cross-exchange-relative-value` exited nonzero inside
  the readiness gate;
- `pm2 show live-cross-exchange-relative-value` confirmed that no live process
  exists.

Verification:

- `npm test -- --test-name-pattern "cross-exchange live readiness|cross-exchange live runner"`
  ran the JavaScript suite and passed `167` tests.
- `git diff --check` passed.

Conclusion:

The codebase now has a gated route to live for the only positive candidate, but
the strategy is still not live-ready. The remaining work is operational proof,
not further strategy fitting: authenticated account fee confirmation, Bithumb
BTC inventory sufficient for the sell leg, Binance quote inventory sufficient
for the buy hedge leg, and a hedge venue proof artifact. Until those are
present, the PM2 live command fails before a process can start.

## 2026-05-13 05:50 KST Operational Proof Generator

The remaining cross-exchange blockers are now backed by a read-only proof
generator instead of a hand-written JSON assumption:

- `src/execution/cross-exchange-operational-proof.ts` builds the proof from
  account fee and balance data;
- `src/cli/audit-cross-exchange-operational-proof.ts` reads the latest
  relative-value report, Bithumb account/chance data, Binance account data,
  and Binance commission data, then writes the operational proof expected by
  `audit-cross-exchange-live-readiness`;
- `package.json` adds
  `dry-run:audit-cross-exchange-operational-proof`;
- `pm2:start:live-cross-exchange-relative-value` and restart now run the
  operational proof generator before the live-readiness gate.

The proof generator is read-only. It does not place orders.

Current local proof status:

- artifact:
  `var/reports/cross-exchange-operational-proof-btc-binance-50k-latest.json`;
- `accountFeesConfirmed=false`;
- `hedgeVenueReady=false`;
- inventory values are zero in the generated proof because the required
  authenticated Binance secrets are not available in the current environment;
- readiness remains `liveReady=false` with blockers
  `accountFeesConfirmed`, `inventoryReady`, and `hedgeVenueReady`.

Operational start check:

- `npm run pm2:start:live-cross-exchange-relative-value` exited nonzero in the
  operational proof stage;
- `pm2 show live-cross-exchange-relative-value` confirmed that no live process
  exists.

Verification:

- `npm test -- --test-name-pattern "cross-exchange operational proof|cross-exchange live readiness|cross-exchange live runner|Binance|hedged relative-value"`
  ran the JavaScript suite and passed `170` tests.
- `git diff --check` passed.

Conclusion:

The live route is now deterministic: proof generation -> readiness audit ->
PM2 start -> fail-closed live preflight. It still does not satisfy the goal
because live cannot be justified without authenticated fee and inventory proof.
The next blocker is no longer strategy selection or code wiring; it is proving
that the live account has the required Bithumb BTC inventory, Binance quote
inventory, and fee schedule for the measured 50k relative-value edge.

## 2026-05-13 05:55 KST Operational Proof Hardening

The cross-exchange readiness audit was tightened so live promotion cannot be
unlocked by optimistic assumptions embedded in the strategy report or by a
stale hand-written proof file.

Changes:

- `audit-cross-exchange-live-readiness` no longer accepts
  `assumptions.accountFeesConfirmed`, `assumptions.inventoryReady`, or
  `assumptions.hedgeVenueReady` as live proof;
- live readiness now requires an operational proof object to be present;
- the proof must include a fresh `generatedAt` timestamp;
- the proof must include `reasons: []`;
- stale proof or dirty proof creates explicit blockers
  `operationalProofFresh` and `operationalProofClean`.

Current status after hardening:

- latest readiness artifact:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-latest.json`;
- `executionPathReady=true`;
- `operationalProofPresent=true`;
- `operationalProofFresh=true`;
- `operationalProofClean=false` because the generated proof records
  `credentialsMissing`;
- `liveReady=false`;
- blockers: `operationalProofClean`, `accountFeesConfirmed`,
  `inventoryReady`, and `hedgeVenueReady`.

Verification:

- `npm test -- --test-name-pattern "cross-exchange live readiness|cross-exchange operational proof|cross-exchange live runner"`
  ran the JavaScript suite and passed `171` tests.
- `npm run pm2:start:live-cross-exchange-relative-value` exited nonzero in the
  operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirmed that no live process
  exists.
- `git diff --check` passed.

Conclusion:

The live gate is now stricter than before: the only remaining way forward is a
fresh read-only account proof showing actual fees and sufficient two-venue
inventory. Strategy report assumptions cannot bypass that requirement.

## 2026-05-13 05:56 KST Bithumb Hedge Adapter

The two-leg executor now has adapters for both venues:

- `src/live/binance.ts` provides the Binance IOC limit hedge leg;
- `src/live/bithumb.ts` now provides `createBithumbRelativeValueVenue` for the
  Bithumb limit leg;
- `audit-cross-exchange-live-readiness` includes the Bithumb relative-value
  adapter in its static `executionPathReady` check.

The Bithumb adapter submits a limit order with `client_order_id`, reads the
resulting order back, and normalizes only the executed quantity and executed
KRW notional reported by the exchange. It does not assume a fill.

Verification:

- `npm test -- --test-name-pattern "BithumbRelativeValue|createBithumbRelativeValueVenue|cross-exchange live readiness|cross-exchange operational proof|cross-exchange live runner"`
  ran the JavaScript suite and passed `173` tests.
- The refreshed readiness artifact still has `executionPathReady=true` and
  `liveReady=false`.
- `git diff --check` passed.

Conclusion:

The execution-path blocker is now represented by concrete Bithumb and Binance
venue adapters plus the fail-closed two-leg executor. The live blocker has
correctly moved to account proof: fee confirmation, clean operational proof,
and sufficient Bithumb/Binance inventory.

## 2026-05-13 05:01 KST Integrated Goal Status

The top-level live-goal audit now accepts the cross-exchange readiness artifact
and can select Bithumb-Binance BTC relative value as the leading candidate when
its strategy evidence passes.

Changes:

- `audit-live-goal-status` accepts `--cross-exchange-readiness`;
- when cross-exchange strategy evidence is ready, the top-level blockers are
  based on the cross-exchange live gate rather than the blocked min75 paper
  position;
- stale legacy BTC/ETH/XRP research coverage no longer blocks a cross-exchange
  candidate whose own readiness report has fresh edge, FX, skew, and execution
  evidence;
- the report now includes `selectedCandidate` and a `crossExchange` section.

Current status:

- latest integrated artifact:
  `var/reports/live-goal-status-20260513-cross-exchange-rv-50k.json`;
- `selectedCandidate.type=cross_exchange_relative_value`;
- `crossExchange.strategyEvidenceReady=true`;
- `crossExchange.candidate.notionalKrw=50000`;
- `crossExchange.candidate.medianNetEdgeBps=42.739405`;
- `crossExchange.candidate.positiveRate=1`;
- `crossExchange.candidate.depthCoverageRate=0.980198`;
- `liveReady=false`;
- blockers: `crossExchangeLiveReady`, `crossExchange:operationalProofClean`,
  `crossExchange:accountFeesConfirmed`, `crossExchange:inventoryReady`, and
  `crossExchange:hedgeVenueReady`.

Verification:

- `npm test -- --test-name-pattern "live goal status|cross-exchange live readiness|cross-exchange operational proof|BithumbRelativeValue|createBithumbRelativeValueVenue|cross-exchange live runner"`
  ran the JavaScript suite and passed `175` tests.
- Refreshed operational proof still reports missing Binance credentials and no
  verified inventory.
- Refreshed cross-exchange readiness still blocks live execution for account
  proof only.

Conclusion:

The goal is now pointed at the only positive-edge path instead of continuing to
promote losing Bithumb-only candidates. The strategy is not live-ready yet; the
remaining work is authenticated operational proof and two-venue inventory, not
another speculative entry rule change.

## 2026-05-13 05:07 KST Inventory Requirement Proof

The operational proof now reports the exact inventory requirements and deficits
for the selected cross-exchange direction, even when credentials are missing and
the CLI cannot query live account balances.

Changes:

- `buildCrossExchangeOperationalProof` includes `requirements` and `deficits`;
- the requirements include fee buffers on the quote-funded buy leg;
- the missing-credentials path now still computes the required Bithumb and
  Binance balances from the measured report;
- KRW requirement and deficit values are rounded for operator-readable reports.

Current 50k direction:

- direction: `sell_bithumb_buy_reference`;
- required Bithumb BTC inventory: `0.00041794138789976094 BTC`, worth
  `50000 KRW` at the latest measured Bithumb mid;
- required Binance/reference quote inventory: `33.97708476920884 USDT`, worth
  `50050 KRW` including the 10 bps reference buy fee buffer;
- current unauthenticated proof deficits: `50000 KRW` Bithumb BTC inventory and
  `50050 KRW` Binance quote inventory;
- missing secrets remain `BINANCE_API_KEY` and `BINANCE_SECRET_KEY`;
- `liveReady=false`.

Verification:

- `npm run build && node --test dist/test/cross-exchange-operational-proof.test.js dist/test/audit-cross-exchange-live-readiness.test.js dist/test/audit-live-goal-status.test.js`
  passed `17` targeted tests.
- `npm run pm2:start:live-cross-exchange-relative-value` still exits `2` in
  the operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process exists.

Conclusion:

The next live step is now numerically explicit: prove actual account fees and
show at least the required Bithumb BTC plus Binance quote inventory. The gate
still fails closed until that proof is present.

## 2026-05-13 05:10 KST Fee-Buffered Readiness Gate

The cross-exchange readiness audit now consumes the inventory requirements from
the operational proof instead of recomputing a bare notional-only requirement.
This matters because the Binance/reference buy leg needs quote inventory for
notional plus fee buffer.

Changes:

- `audit-cross-exchange-live-readiness` uses `proof.requirements` for
  `inventoryReady` when present;
- readiness output includes `operationalProofSummary`;
- the top-level live-goal status carries that summary through in its
  `crossExchange` section;
- a targeted test proves that `50000 KRW` of Binance quote inventory is not
  enough when the proof requires `50050 KRW`.

Current propagated status:

- readiness artifact:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-latest.json`;
- goal artifact:
  `var/reports/live-goal-status-20260513-cross-exchange-rv-50k.json`;
- top-level selected candidate remains `cross_exchange_relative_value`;
- requirements now visible at the goal level:
  `50000 KRW` Bithumb BTC inventory and `50050 KRW` Binance/reference quote
  inventory;
- current deficits remain `50000 KRW` and `50050 KRW`;
- `liveReady=false`.

Verification:

- `npm run build && node --test dist/test/audit-cross-exchange-live-readiness.test.js dist/test/audit-live-goal-status.test.js dist/test/cross-exchange-operational-proof.test.js`
  passed `18` targeted tests.
- `npm run pm2:start:live-cross-exchange-relative-value` still exits `2` in
  the operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process exists.
- `git diff --check` passed.

Conclusion:

The live gate is stricter and more transparent: it no longer allows a
fee-underfunded hedge account to pass inventory readiness. The remaining
blockers are still authenticated Binance credentials, actual fee confirmation,
and sufficient two-venue inventory.

## 2026-05-13 05:12 KST Wall-Clock Freshness Gate

The cross-exchange readiness audit now recomputes market-data and FX freshness
from timestamps in the report instead of trusting embedded age fields.

Reason:

The previous audit used `latestObservationAgeHours` and `fxAgeHours` from the
relative-value report. Those values are correct at report generation time, but
they can become stale if the same report is reused later. Live promotion must
use wall-clock freshness at the time of the gate.

Changes:

- `audit-cross-exchange-live-readiness` reads the latest observation
  `capturedAt` from `observations` or `topEdges`;
- FX freshness is recomputed from `assumptions.usdKrwUpdatedAt`;
- embedded age fields are only accepted as secondary constraints and no longer
  make stale evidence fresh;
- a targeted test proves that a 30-hour-old report with embedded
  `latestObservationAgeHours=0.1` and `fxAgeHours=1` is still blocked.

Current status:

- refreshed readiness artifact:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-latest.json`;
- `latestObservationFresh=true` for the current local report;
- `fxFresh=true` for the current local FX timestamp;
- `liveReady=false` because the operational proof is still not clean.

Verification:

- `npm run build && node --test dist/test/audit-cross-exchange-live-readiness.test.js dist/test/audit-live-goal-status.test.js dist/test/cross-exchange-operational-proof.test.js`
  passed `19` targeted tests.
- `npm run pm2:start:live-cross-exchange-relative-value` still exits `2` in
  the operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process exists.
- `git diff --check` passed.

Conclusion:

The live gate now fails closed if the strategy report or FX quote becomes stale
before startup. The only remaining blockers are account proof and inventory,
not stale-market-data handling.

## 2026-05-13 05:14 KST Runner Hardening

The cross-exchange live runner now revalidates the readiness artifact instead
of trusting a top-level `liveReady=true` field by itself.

Changes:

- `run-cross-exchange-relative-value-live` requires a complete readiness
  checklist and rejects any failed checklist item;
- it requires a supported candidate with positive notional and positive median
  net edge;
- it requires `operationalProofSummary`;
- it rejects non-clean proof reasons, unconfirmed account fees, missing hedge
  venue readiness, and any nonzero inventory deficit;
- a targeted test proves that a hand-written `liveReady=true` readiness file
  without checklist/proof details is rejected even when live flags and
  credentials are present.

Verification:

- `npm run build && node --test dist/test/audit-cross-exchange-live-readiness.test.js dist/test/audit-live-goal-status.test.js dist/test/cross-exchange-operational-proof.test.js`
  passed `20` targeted tests.
- `npm run pm2:start:live-cross-exchange-relative-value` still exits `2` in
  the operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process exists.
- `git diff --check` passed.

Conclusion:

The PM2 live path now has two layers of evidence checking: the readiness audit
and the runner itself. A manually forged or incomplete readiness artifact can no
longer reach the live preflight.

## 2026-05-13 05:20 KST Execution-Path Honesty Gate

The cross-exchange readiness audit now treats the live PM2 runner itself as part
of the execution path.

Reason:

The previous `executionPathReady` check only proved that executor and venue
modules existed. It did not prove that the PM2 target running
`run-cross-exchange-relative-value-live` was wired to the hedged executor or
the Bithumb/Binance venue adapters. That could make a preflight-only runner look
like an executable live path.

Changes:

- `audit-cross-exchange-live-readiness` now requires the runner to reference
  `buildHedgedRelativeValuePlan`, `submitHedgedRelativeValueOrder`,
  `createBithumbRelativeValueVenue`, and `createBinanceRelativeValueVenue`;
- the Binance venue module must expose both the private client and
  relative-value venue adapter;
- `audit-live-goal-status` separates strategy evidence from operational
  execution readiness, so the profitable cross-exchange candidate remains the
  selected goal candidate even when execution wiring is blocked;
- targeted tests prove that a preflight-only PM2 runner blocks
  `executionPathReady`, and that the goal status still keeps the cross-exchange
  candidate selected while reporting the execution blocker.

Current status:

- selected candidate:
  `cross_exchange_relative_value`;
- current measured candidate: Bithumb-Binance BTC RV, 50k KRW notional,
  `sell_bithumb_buy_reference`;
- measured edge: `101/101` positive observations, `42.739405` median net edge
  bps, `0.980198` depth coverage, `21644.429254` estimated net PnL KRW;
- refreshed readiness artifact:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-latest.json`;
- refreshed goal artifact:
  `var/reports/live-goal-status-20260513-cross-exchange-rv-50k.json`;
- `liveReady=false`.

Current blockers:

- `executionPathReady`;
- `operationalProofClean`;
- `accountFeesConfirmed`;
- `inventoryReady`;
- `hedgeVenueReady`.

Verification:

- `npm run build && node --test dist/test/audit-cross-exchange-live-readiness.test.js dist/test/audit-live-goal-status.test.js dist/test/cross-exchange-operational-proof.test.js dist/test/cross-exchange-relative-value-live.test.js dist/test/live-binance.test.js dist/test/live-bithumb.test.js`
  passed `46` targeted tests.
- `npm run pm2:start:live-cross-exchange-relative-value` exits `2` in the
  operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process exists.
- `git diff --check` passed.

Conclusion:

The goal is still active and not live-ready. The strategy selection is now
honest: keep the only positive-edge candidate, but block live until the actual
dual-venue execution path, account fees, inventory, and hedge venue proof are
clean.

## 2026-05-13 05:26 KST Dual-Currency Execution Guard

The cross-exchange hedged plan now separates exchange-native order prices from
KRW risk and PnL accounting.

Reason:

The profitable candidate is Bithumb KRW against Binance `BTCUSDT`. Analysis
correctly computes edge in KRW, but live orders on Binance must use USDT native
prices. A live path that can pass a KRW-translated Binance price as the Binance
limit price is unsafe.

Changes:

- `buildHedgedRelativeValuePlan` now requires `referenceQuoteToKrw` for
  non-KRW reference markets;
- Binance reference book prices are treated as native quote prices, and KRW
  depth/quantity calculations multiply by `referenceQuoteToKrw`;
- each hedged leg now carries `limitPriceCurrency` and `quoteToKrw`;
- Binance relative-value venue rejects non-`USDT` Binance legs, implausible
  KRW-translated `BTCUSDT` prices, and notional/FX mismatches before order
  submission;
- Bithumb relative-value venue rejects non-`KRW` legs;
- tests now cover native Binance pricing, missing FX conversion, explicit
  rejection of KRW-translated Binance prices, and normalized Binance fills.

Verification:

- `npm run build && node --test dist/test/cross-exchange-relative-value-live.test.js dist/test/live-binance.test.js dist/test/live-bithumb.test.js`
  passed `27` targeted tests.
- `npm test` passed `183` JavaScript tests.
- refreshed operational proof, cross-exchange readiness, and live-goal status
  artifacts remain blocked with the same selected candidate.
- `git diff --check` passed.

Current status:

- selected candidate remains `cross_exchange_relative_value`;
- `crossExchangeStrategyEvidenceReady=true`;
- `liveReady=false`;
- blockers remain `executionPathReady`, `operationalProofClean`,
  `accountFeesConfirmed`, `inventoryReady`, and `hedgeVenueReady`.

Conclusion:

One major live-safety gap is closed: the executor and venue adapters can no
longer silently submit KRW-translated Binance prices. The remaining execution
work is wiring the PM2 runner to fetch fresh native books, rebuild the plan at
execution time, and call the hedged executor only behind explicit order
submission gates.

## 2026-05-13 05:33 KST Fresh-Book Runner Wiring

The cross-exchange PM2 runner now rebuilds a live plan from fresh public books
instead of stopping at readiness-file preflight.

Reason:

Live promotion cannot rely on stale report snapshots. Even with a positive
historical edge, the order path must fetch current Bithumb and Binance books,
recompute the executable edge with account fee assumptions, and build a native
Binance-price plan immediately before any possible submission.

Changes:

- `audit-cross-exchange-live-readiness` now carries the execution inputs needed
  by the runner in the candidate block: `market`, `referenceMarket`,
  `referenceQuoteToKrw`, `minNetEdgeBps`, `bithumbFeeBps`, and
  `referenceFeeBps`;
- `run-cross-exchange-relative-value-live` imports and wires
  `buildHedgedRelativeValuePlan`, `submitHedgedRelativeValueOrder`,
  `createBithumbRelativeValueVenue`, and `createBinanceRelativeValueVenue`;
- the runner fetches fresh Bithumb orderbook and Binance bookTicker data,
  recomputes the current net edge, and fails before submission if the fresh
  edge is below the live threshold;
- default mode is still plan-only. Actual order submission requires both
  `--submit-once` and `ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION=true` in addition
  to the existing live flags and credentials;
- tests use a local HTTP market-data server to prove the runner creates a
  native `BTCUSDT` plan and blocks weak fresh-book edge.

Verification:

- `npm run build && node --test dist/test/audit-cross-exchange-live-readiness.test.js dist/test/cross-exchange-relative-value-live.test.js dist/test/live-binance.test.js dist/test/live-bithumb.test.js`
  passed `39` targeted tests.
- `npm test` passed `184` JavaScript tests.
- refreshed readiness now has `executionPathReady=true`.
- refreshed goal remains blocked only on operational proof, account fees,
  inventory, and hedge venue readiness.
- `npm run pm2:start:live-cross-exchange-relative-value` exits `2` in the
  operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process exists.
- `git diff --check` passed.

Conclusion:

The live execution path is now materially wired through fresh market data and
native Binance pricing. The goal is still not complete because authenticated
fees, two-venue inventory, and hedge venue readiness are not proven.

## 2026-05-13 05:41 KST PM2 Submission Gate And PnL Scope

The cross-exchange live target now has an explicit PM2 submission gate and the
runner output separates estimated edge from realized live PnL.

Reason:

The strategy evidence is still only an executable-price observation estimate.
It must not be read as realized live profit, and PM2 must not be able to submit
orders unless submission is explicitly enabled in the environment and the
runner receives `--submit-once`.

Changes:

- `ecosystem.config.cjs` keeps the cross-exchange PM2 target plan-only by
  default and appends `--submit-once` only when
  `ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION=true`;
- PM2 env values for `ENABLE_CROSS_EXCHANGE_LIVE_EXECUTION` and
  `ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION` now come from process env with
  fail-closed defaults;
- `.env.example` documents both cross-exchange live flags;
- the live runner now rejects stale readiness and stale operational-proof
  artifacts even when called directly outside the PM2 script;
- runner output now includes `freshObservedNetEdgeBps`,
  `estimatedFreshEdgePnlKrw`, `submitted`, and `realizedPnlKrw=null`;
- readiness output now marks `medianNetEdgeBps` and
  `totalEstimatedNetPnlKrw` as observation estimates, not realized live PnL;
- execution-path readiness now checks for native quote guards, proof-fee
  override markers, and the explicit PM2 submission gate.

Verification:

- `node --test dist/test/audit-cross-exchange-live-readiness.test.js` passed
  `13` targeted tests.
- `npm test` passed `185` JavaScript tests.
- refreshed operational proof remains blocked by missing Binance secrets,
  unconfirmed account fees, and missing inventory.
- refreshed readiness remains `liveReady=false` with blockers
  `operationalProofClean`, `accountFeesConfirmed`, `inventoryReady`, and
  `hedgeVenueReady`.
- refreshed goal status still selects `cross_exchange_relative_value` but keeps
  live blocked.
- `npm run pm2:start:live-cross-exchange-relative-value` exits `2` in the
  operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process
  exists.
- PM2 config inspection confirms default args have no `--submit-once`, while
  `ENABLE_CROSS_EXCHANGE_ORDER_SUBMISSION=true` adds `--submit-once`.
- `git diff --check` passed.

Conclusion:

The current best strategy remains Bithumb-Binance BTC relative value at 50,000
KRW notional. Its observed edge is positive, but there is still no realized
live PnL. Live execution remains correctly blocked until authenticated fees,
two-venue inventory, and hedge venue readiness are proven.

## 2026-05-13 05:45 KST Filled-Leg Reconciliation Gate

The cross-exchange executor now reconciles filled hedge legs before treating a
submitted pair as a completed execution result.

Reason:

Requiring both venues to return `filled` is not enough for live promotion. The
filled quantities and KRW notionals also need to be plausible and balanced
against the intended hedge size; otherwise the system could report a successful
pair while leaving meaningful basis, inventory, or notional imbalance risk.

Changes:

- `submitHedgedRelativeValueOrder` now computes a reconciliation block for
  filled pairs;
- each filled leg must have positive executed quantity and KRW notional;
- each leg's executed notional must stay within the configured mismatch
  tolerance against the planned leg notional;
- the two filled legs' KRW notional imbalance must stay within the configured
  pair tolerance;
- execution results now include `plannedNotionalKrw`,
  `legNotionalMismatchBps`, `pairNotionalImbalanceKrw`,
  `pairNotionalImbalanceBps`, `realizedGrossPnlKrw`, and
  `realizedGrossEdgeBps`;
- runner output exposes `realizedGrossPnlKrw` and `realizedGrossEdgeBps` while
  keeping net `realizedPnlKrw=null` until fee-aware reconciliation exists;
- readiness execution-path checks now require the reconciliation markers in
  addition to the native quote and PM2 submission gates.

Verification:

- `npm run build && node --test dist/test/cross-exchange-relative-value-live.test.js dist/test/audit-cross-exchange-live-readiness.test.js`
  passed `21` targeted tests.
- `npm test` passed `187` JavaScript tests.
- refreshed operational proof, readiness, and goal reports remain blocked with
  `cross_exchange_relative_value` selected and `executionPathReady=true`.
- `npm run pm2:start:live-cross-exchange-relative-value` exits `2` in the
  operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process
  exists.
- `git diff --check` passed.

Conclusion:

The execution path is safer, but the goal is still not complete. The strategy
candidate has positive observation edge, not realized live PnL, and live remains
blocked until account fees, Binance credentials, two-venue inventory, and hedge
venue readiness are proven.

## 2026-05-13 05:48 KST Fee-Aware Realized PnL Reconciliation

The cross-exchange execution result now calculates fee-adjusted realized PnL
after both hedge legs are filled and reconciled.

Reason:

Gross pair edge is not enough to decide whether the live strategy is actually
profitable. The answer to “what is the current return” must be based on
fee-adjusted fills when live execution exists, while still keeping plan-only
estimates clearly separate from realized PnL.

Changes:

- hedged plan legs now carry the fee bps used for execution accounting;
- `buildHedgedRelativeValuePlan` accepts Bithumb and reference fee bps and
  validates them as non-negative;
- the live runner passes operational-proof account fees into the fresh plan;
- reconciliation now reports `realizedFeeKrw`, `realizedNetPnlKrw`, and
  `realizedNetEdgeBps` in addition to gross PnL and notional imbalance;
- runner output sets `realizedPnlKrw` to the fee-adjusted net realized value
  after submitted fills reconcile, and keeps it `null` in plan-only mode;
- readiness execution-path checks now require fee-aware net PnL markers.

Verification:

- `npm run build && node --test dist/test/cross-exchange-relative-value-live.test.js dist/test/audit-cross-exchange-live-readiness.test.js dist/test/live-binance.test.js dist/test/live-bithumb.test.js`
  passed `42` targeted tests.
- `npm test` passed `187` JavaScript tests.
- refreshed operational proof, readiness, and goal reports remain blocked with
  `cross_exchange_relative_value` selected and `executionPathReady=true`.
- `npm run pm2:start:live-cross-exchange-relative-value` exits `2` in the
  operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process
  exists.
- `git diff --check` passed.

Conclusion:

Live PnL reporting is now fee-aware once actual fills exist. There is still no
realized live PnL because no live orders have been allowed through the proof
gate. The goal remains active and blocked on external operational proof:
Binance credentials, authenticated fees, sufficient two-venue inventory, and
hedge venue readiness.

## 2026-05-13 05:51 KST Durable Live Execution Artifact

The cross-exchange runner now writes a durable execution artifact instead of
leaving the live plan or submitted result only in stdout/PM2 logs.

Reason:

If a live run is eventually allowed, the fee-adjusted realized PnL,
reconciliation fields, fresh-book plan, and submission mode need to be captured
in a normal report path for audit. Logs alone are too weak for deciding whether
the strategy is genuinely profitable after execution.

Changes:

- `run-cross-exchange-relative-value-live` accepts `--output` and writes the
  exact JSON report emitted to stdout;
- the PM2 `live-cross-exchange-relative-value` target now includes
  `--output var/reports/cross-exchange-live-execution-latest.json`;
- execution-path readiness now requires the runner output writer and PM2
  execution artifact path markers;
- tests verify the runner writes the artifact and that its contents match the
  stdout report.

Verification:

- `npm run build && node --test dist/test/audit-cross-exchange-live-readiness.test.js`
  passed `13` targeted tests.
- `npm test` passed `187` JavaScript tests.
- refreshed operational proof, readiness, and goal reports remain blocked with
  `cross_exchange_relative_value` selected and `executionPathReady=true`.
- `npm run pm2:start:live-cross-exchange-relative-value` exits `2` in the
  operational proof stage.
- `pm2 show live-cross-exchange-relative-value` confirms no live process
  exists.
- PM2 config inspection confirms the live target includes
  `--output var/reports/cross-exchange-live-execution-latest.json`.
- `git diff --check` passed.

Conclusion:

The future live execution evidence is now persisted as an artifact. The goal is
still not complete because no authenticated account fees, Binance credentials,
two-venue inventory, or hedge venue proof exist, so no live run has been
allowed and `realizedLivePnlKrw` remains `null`.

## 2026-05-13 05:55 KST Submit-Once Output Requirement

Direct manual use of the cross-exchange live runner now also requires a durable
output artifact when order submission is requested.

Reason:

PM2 already passes an execution artifact path, but the CLI itself previously
allowed `--submit-once` without `--output`. That left a gap where live fills
could exist only in stdout and not in a report file. A live-profit goal needs
auditable realized PnL evidence, not transient console output.

Changes:

- `run-cross-exchange-relative-value-live --submit-once` now fails unless
  `--output` is provided;
- the targeted readiness/runner test suite covers this failure path before any
  readiness report is read.

Verification:

- `npm run build && node --test dist/test/audit-cross-exchange-live-readiness.test.js`
  passed `14` targeted tests.
- `npm test` passed `188` JavaScript tests.
- refreshed operational proof, readiness, and goal reports remain blocked with
  `cross_exchange_relative_value` selected and `executionPathReady=true`.
- `npm run pm2:start:live-cross-exchange-relative-value` exits `2` in the
  operational proof stage with missing Binance credentials and inventory
  deficits.
- `pm2 show live-cross-exchange-relative-value` confirms no live process
  exists.
- `git diff --check` passed.

Conclusion:

The candidate remains the only current positive-expectancy path, but the goal
is still not complete. Live execution is still blocked until authenticated
fees, Binance credentials, hedge venue readiness, and two-venue inventory are
confirmed. There is still no realized live PnL.

## 2026-05-13 06:01 KST Observation Span Promotion Gate

The cross-exchange relative-value evidence now requires a minimum observation
time span in addition to a raw observation count.

Reason:

The current Bithumb-Binance BTC evidence has `101` positive observations, but
they cover only about `1.75` minutes. That is enough to identify a candidate
worth continuing, but too little to justify live promotion. A profitable live
goal should not treat a dense short burst as equivalent to evidence across a
longer market window.

Changes:

- `analyze-cross-exchange-relative-value` now accepts and reports
  `--min-observation-span-minutes`;
- analyzer promotion adds `insufficientObservationSpan` when the observed
  window is too short;
- live readiness adds `observationSpanSufficient` to the checklist and reports
  both observed and required span minutes;
- live goal status keeps the cross-exchange candidate selected when the
  directional evidence is positive, but blocks strategy readiness when the span
  gate fails.

Current refreshed state:

- latest readiness remains `liveReady=false`;
- `observationSpanSufficient=false`;
- observed span is about `1.7495` minutes against a `60` minute minimum;
- blockers are now `observationSpanSufficient`, `operationalProofClean`,
  `accountFeesConfirmed`, `inventoryReady`, and `hedgeVenueReady`;
- goal status remains `blocked` with `cross_exchange_relative_value` selected,
  `crossExchangeCandidateEvidenceReady=true`, and
  `crossExchangeStrategyEvidenceReady=false`.

Verification:

- `npm run build && node --test dist/test/analyze-cross-exchange-relative-value.test.js dist/test/audit-cross-exchange-live-readiness.test.js dist/test/audit-live-goal-status.test.js`
  passed `29` targeted tests.
- `npm test` passed `191` JavaScript tests.

Conclusion:

This does not make the strategy more profitable by itself. It prevents a false
live promotion from a short-lived positive burst and makes the next required
work explicit: collect at least a 60 minute cross-exchange window, then compare
the same Bithumb-Binance BTC RV candidate against the current baseline while
keeping live orders blocked until operational proof is also clean.

## 2026-05-13 07:04 KST 60-Minute Cross-Exchange Observation

A fresh 60 minute public-orderbook observation was collected for the
Bithumb-Binance BTC relative-value candidate.

Artifact:

- `var/reports/cross-exchange-relative-value-btc-binance-notional-50k-60m-20260513.json`

Result:

- `observationCount=121`;
- `observationSpanMinutes=60.148017`;
- `positiveRate=1`;
- `medianNetEdgeBps=50.245016`;
- `totalEstimatedNetPnlKrw=30030.344731`;
- `depthCoverageRate=0.818182`;
- `promotionEligible=false`;
- blockers are `feeScheduleUnconfirmed`, `inventoryNotReady`,
  `hedgeVenueNotReady`, and `depthInsufficient`.

Notional sensitivity on the same 60 minute observations:

- `50,000 KRW`: depth coverage `0.818182`, estimated observation PnL
  `30030.344731 KRW`;
- `25,000 KRW`: depth coverage `0.834711`, estimated observation PnL
  `15015.172363 KRW`;
- `10,000 KRW`: depth coverage `0.933884`, estimated observation PnL
  `6006.068946 KRW`;
- `5,000 KRW`: depth coverage `0.933884`, estimated observation PnL
  `3003.034477 KRW`.

Updated readiness:

- `var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-latest.json`
  remains `liveReady=false`;
- `observationSpanSufficient=true`;
- `depthCoverageReady=false`;
- operational blockers remain: `operationalProofClean`,
  `accountFeesConfirmed`, `inventoryReady`, and `hedgeVenueReady`.

Updated goal status:

- `var/reports/live-goal-status-20260513-cross-exchange-rv-50k-60m.json`
  remains `status=blocked`;
- cross-exchange `candidateEvidenceReady=false` and
  `strategyEvidenceReady=false` because depth coverage failed;
- no realized live PnL exists.

Conclusion:

The 60 minute data strengthens the edge observation but weakens the live case:
the top-of-book depth evidence is not good enough even after reducing notional
to `5,000 KRW`. The next analysis-first improvement is not to force live or
lower standards, but to measure executable multi-level orderbook depth/VWAP so
the depth blocker can distinguish true liquidity failure from a top-of-book
measurement limitation.

## 2026-05-13 07:08 KST Multi-Level Depth Measurement

The cross-exchange analyzer now stores multi-level orderbook depth and computes
edge using executable VWAP for the configured KRW notional.

Reason:

The 60 minute run failed the depth gate using only top-of-book size. That is a
valid conservative blocker, but it cannot distinguish true liquidity failure
from top-level fragmentation when deeper displayed levels are available.

Changes:

- Bithumb and Upbit observations now keep all returned `orderbook_units` as
  bid/ask levels;
- Binance observations now use the Spot depth endpoint instead of only
  `bookTicker`;
- old observations without `bids`/`asks` still load by falling back to their
  top bid/ask fields;
- edge and depth coverage now use executable notional VWAP across levels;
- edge rows expose `bithumbDepthNotionalKrw` and
  `referenceDepthNotionalKrw` alongside top-of-book notional.

Verification:

- added a scenario where top-of-book depth is insufficient but multi-level
  depth covers the order and the analyzer can promote the candidate;
- a live public-data smoke snapshot wrote
  `var/reports/cross-exchange-relative-value-btc-binance-notional-50k-depth-smoke-20260513.json`
  with `depthCoverageRate=1` and `medianNetEdgeBps=43.04169`;
- `npm run build && node --test dist/test/analyze-cross-exchange-relative-value.test.js dist/test/audit-cross-exchange-live-readiness.test.js dist/test/audit-live-goal-status.test.js`
  passed `30` targeted tests.

Conclusion:

This improves measurement quality, but it does not make the goal complete. The
current 60 minute report was collected before multi-level depth was stored, so
it still cannot prove live readiness. The next required evidence is another
60 minute observation using the new executable-depth analyzer, followed by the
same readiness and operational proof gates.

## 2026-05-13 08:11 KST 60-Minute Multi-Level Depth Observation

The new executable-depth observation finished and materially changes the
strategy evidence:

- report:
  `var/reports/cross-exchange-relative-value-btc-binance-notional-50k-60m-depth-20260513.json`;
- `observationCount=121`;
- `observationSpanMinutes=60.1483`;
- `positiveRate=1`;
- `depthCoverageRate=1`;
- `medianNetEdgeBps=48.77013`;
- `totalEstimatedNetPnlKrw=29675.97396`;
- best direction remains `sell_bithumb_buy_reference` against Binance.

The depth blocker is now cleared for `50,000 KRW` notional when measured with
multi-level executable depth rather than top-of-book size.

Updated operational proof:

- report:
  `var/reports/cross-exchange-operational-proof-btc-binance-50k-60m-depth-latest.json`;
- `accountFeesConfirmed=false`;
- `hedgeVenueReady=false`;
- required inventory is Bithumb base `50,000 KRW` equivalent and Binance quote
  `50,050 KRW` equivalent;
- observed inventory is zero on both required sides;
- missing secrets are `BINANCE_API_KEY` and `BINANCE_SECRET_KEY`.

Updated readiness:

- report:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-depth-latest.json`;
- `liveReady=false`;
- strategy evidence checks are true, including observations, 60 minute span,
  positive median edge, positive estimated observation PnL, depth coverage,
  freshness, skew control, and execution path;
- remaining blockers are `operationalProofClean`, `accountFeesConfirmed`,
  `inventoryReady`, and `hedgeVenueReady`;
- `realizedLivePnlKrw=null`, because no live fills have been submitted and
  reconciled.

Updated goal status:

- report:
  `var/reports/live-goal-status-20260513-cross-exchange-rv-50k-60m-depth.json`;
- `status=blocked`;
- selected candidate is now `cross_exchange_relative_value`;
- `crossExchangeCandidateEvidenceReady=true`;
- `crossExchangeStrategyEvidenceReady=true`;
- `crossExchangeLiveReady=false`.

Conclusion:

The goal is pointed at the right strategy candidate now: Bithumb-Binance BTC
relative value is the only current candidate with positive executable edge
evidence. The current observed return estimate is about `48.77013 bps` per
`50,000 KRW` cycle before any live-fill reconciliation. This is not realized
profit. Live execution must stay blocked until authenticated fees, Binance
credentials, required two-venue inventory, and hedge venue readiness are proven
with fresh operational evidence.

## 2026-05-13 08:16 KST Live Fresh-Depth Alignment

The live runner was still validating fresh books with top-of-book depth while
the promoted evidence now uses multi-level executable depth. That made the
analysis gate and live preflight gate measure different liquidity populations.

Change:

- `src/execution/cross-exchange-relative-value-live.ts` now accepts optional
  multi-level bid/ask books and builds legs from executable depth;
- `src/cli/run-cross-exchange-relative-value-live.ts` now reads Bithumb
  `orderbook_units` and Binance `/api/v3/depth`;
- fresh observed edge is recomputed from executable VWAP instead of only best
  bid/ask;
- the readiness audit now requires the live path to contain the depth endpoint,
  Bithumb level parsing, and executable VWAP logic.

Verification:

- targeted JS tests passed `33/33`;
- full `npm test` passed `193/193`;
- regenerated readiness still has `executionPathReady=true`;
- regenerated goal status remains `status=blocked` with
  `crossExchangeStrategyEvidenceReady=true` and `crossExchangeLiveReady=false`.

Conclusion:

This removes a measurement mismatch between strategy evidence and live preflight
without loosening any live gate. The only remaining blockers are operational:
authenticated fees, required inventory, hedge venue readiness, and clean
operational proof.

## 2026-05-13 08:20 KST PM2 Evidence Path Alignment

Subagent review found that the live runner code had been updated, but the PM2
startup path still referenced the older short `50k-latest` readiness artifacts.

Change:

- `package.json` live cross-exchange start/restart scripts now regenerate
  operational proof and readiness from
  `var/reports/cross-exchange-relative-value-btc-binance-notional-50k-60m-depth-20260513.json`;
- `ecosystem.config.cjs` now points the live runner at
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-depth-latest.json`.

Verification:

- targeted JS tests passed `33/33`;
- full `npm test` passed `193/193`;
- PM2 still has no `live-cross-exchange-relative-value` process running.
- direct operational proof with `--require-ready` exits nonzero before PM2 can
  start because fees, inventory, and hedge venue readiness are not proven.

Conclusion:

The managed live startup path now uses the same current evidence artifact as
the goal audit. This still does not make live ready because the managed startup
commands require `--require-ready` and `--require-live-ready`, which currently
fail on the operational blockers.

## 2026-05-13 08:25 KST USDT/KRW Sensitivity Reversal

The previous Bithumb-Binance evidence used `USD/KRW=1473.051627` to translate
Binance `BTCUSDT` into KRW. That is not the same as executable USDT/KRW
funding or liquidation cost. Current public KRW-USDT orderbooks showed USDT
offered around `1482-1483 KRW`, so the prior edge needed a synthetic-pricing
artifact check.

Measurement changes:

- `src/cli/analyze-cross-exchange-relative-value.ts` now supports
  `--override-input-usd-krw` for explicit input-observation FX sensitivity;
- it also supports `--reference-venue binance` so Bithumb-Binance can be
  evaluated without falling back to Upbit when Binance edge disappears.

Sensitivity result:

- report:
  `var/reports/cross-exchange-relative-value-btc-binance-notional-50k-60m-depth-binance-usdtkrw1483-sensitivity-20260513.json`;
- reference venue: `binance`;
- override quote conversion: `1483 KRW/USDT`;
- `observationCount=121`;
- `observationSpanMinutes=60.1483`;
- `positiveRate=0`;
- `depthCoverageRate=1`;
- `medianNetEdgeBps=-10.778541`;
- `totalEstimatedNetPnlKrw=-6576.135725`.

Updated readiness and goal:

- readiness report:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-depth-binance-usdtkrw1483-sensitivity-latest.json`;
- readiness blockers now include `positiveEdgeRate`,
  `positiveMedianNetEdge`, and `positiveEstimatedNetPnl`;
- `crossExchangeCandidateEvidenceReady=false`;
- `crossExchangeStrategyEvidenceReady=false`;
- goal status report:
  `var/reports/live-goal-status-20260513-cross-exchange-rv-50k-60m-depth-binance-usdtkrw1483-sensitivity.json`;
- selected candidate falls back to `btc_240m_momentum_min75`, still blocked as
  paper-only.

Operational safety update:

- PM2 live cross-exchange start/restart now points at the USDT/KRW sensitivity
  readiness artifact instead of the optimistic USD/KRW artifact;
- this prevents a future credentials/inventory fix from accidentally promoting
  the synthetic edge.

Verification:

- targeted JS tests passed `31/31`.
- full `npm test` passed `194/194`.

Conclusion:

The Bithumb-Binance cross-exchange candidate is not currently a profitable live
candidate when Binance `BTCUSDT` is valued with executable USDT/KRW rather than
plain USD/KRW. The correct live strategy status is therefore back to blocked
research, not cross-exchange promotion. A future cross-exchange candidate must
collect or replay evidence with real USDT/KRW funding/liquidation prices, not
just fiat USD/KRW.

## 2026-05-13 09:30 KST 60-Minute Automatic USDT/KRW Observation

The analyzer now collects KRW-USDT orderbook data directly when
`--usdt-krw-venue` is set. Binance `BTCUSDT` bid-side KRW value uses executable
USDT/KRW bid, and ask-side KRW cost uses executable USDT/KRW ask.

Code changes:

- `src/cli/analyze-cross-exchange-relative-value.ts` can fetch
  `KRW-USDT` from Bithumb or Upbit with `--usdt-krw-venue`;
- input observations with embedded `usdtKrw` books no longer require an
  external `--usd-krw-updated-at` timestamp;
- the PM2 cross-exchange live startup path now gates on the automatic
  USDT/KRW orderbook readiness artifact, not the optimistic USD/KRW artifact.

Fresh 60 minute result:

- report:
  `var/reports/cross-exchange-relative-value-btc-binance-notional-50k-60m-usdtkrw-orderbook-20260513.json`;
- `referenceVenue=binance`;
- `usdtKrwVenue=bithumb`;
- `observationCount=121`;
- `observationSpanMinutes=60.1599`;
- `positiveRate=0`;
- `depthCoverageRate=1`;
- `medianNetEdgeBps=-15.168606`;
- `maxNetEdgeBps=-8.820153`;
- `minNetEdgeBps=-18.678563`;
- `totalEstimatedNetPnlKrw=-8914.091976`;
- first and last sampled KRW-USDT top of book were `bid=1482`,
  `ask=1483`.

Updated readiness and goal:

- readiness report:
  `var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-usdtkrw-orderbook-latest.json`;
- readiness blocks on `positiveEdgeRate`, `positiveMedianNetEdge`, and
  `positiveEstimatedNetPnl`;
- `crossExchangeCandidateEvidenceReady=false`;
- `crossExchangeStrategyEvidenceReady=false`;
- goal status report:
  `var/reports/live-goal-status-20260513-cross-exchange-rv-50k-60m-usdtkrw-orderbook.json`;
- selected candidate is back to `btc_240m_momentum_min75`, still paper-only and
  blocked until a realized positive exit exists.
- `npm run pm2:start:live-cross-exchange-relative-value` exits nonzero before
  PM2 starts because `--require-live-ready` fails on the negative edge and
  missing operational proof.

Verification:

- targeted JS tests passed `32/32`;
- full `npm test` passed `195/195`.

Conclusion:

The Bithumb-Binance cross-exchange BTC relative-value idea is rejected under
current executable USDT/KRW funding/liquidation costs. The previous positive
USD/KRW edge was not live-tradable expectancy. Do not continue trying to force
this cross-exchange candidate live unless a new observation run with embedded
USDT/KRW books restores positive median edge and positive estimated PnL.

## 2026-05-13 09:33 KST Bithumb Internal Triangular Basis Check

Subagent review suggested checking whether a same-venue Bithumb triangular basis
could avoid the cross-exchange USDT funding artifact.

Public Bithumb market discovery:

- endpoint: `https://api.bithumb.com/v1/market/all?isDetails=true`;
- USDT-related markets found: only `KRW-USDT`;
- no `BTC-USDT` or `USDT-BTC` market is listed.

Conclusion:

A Bithumb-only `KRW -> USDT -> BTC` versus `KRW -> BTC` triangular basis cannot
currently be measured or executed from public Bithumb spot markets because the
required BTC/USDT leg is absent. This path is rejected before implementation.

## 2026-05-13 09:45 KST KRW-Market Replacement Scan Refresh

The live objective was widened from BTC-only wording to the actual operating
scope: find a profitable KRW-market strategy candidate while keeping live
startup blocked until evidence is live-ready.

Fresh public Bithumb top-20 scans were run with 20 bps round-trip cost:

- 60m reversal:
  `var/reports/krw-top20-public-60m-reversal-scan-fee20-20260513-refresh.json`;
  `promotionCandidateCount=0`.
- 60m momentum:
  `var/reports/krw-top20-public-60m-momentum-scan-fee20-20260513-refresh.json`;
  `promotionCandidateCount=3`.

The surviving replacement research candidates are all `KRW-H` 60m momentum:

- best promotion candidate:
  `lookbackBars=168`, `holdBars=24`, `minReturnBps=0`,
  `riskFilter=range24_below_p70`;
- train: `count=57`, `medianPnlKrw=1173.913043`;
- test: `count=38`, `medianPnlKrw=6936.507937`,
  `totalPnlKrw=516040.383098`;
- walk-forward: `positiveTotalFoldCount=5`,
  `positiveMedianFoldCount=4`, `minFoldPnlKrw=30740.250336`.

Forward execution observation was checked for the executable variant that the
current observation CLI can represent (`minReturnBps=10`):

- report:
  `var/reports/h-60m-momentum-min10-forward-observation-20260513.json`;
- `signal.active=false`;
- `lookbackReturnBps=2328.767123`;
- `riskValue=2543.352601`, above the candidate threshold
  `2071.713147410359`;
- orderbook depth covered 500,000 KRW on both sides;
- `spreadBps=55.710306`, below the expected median edge `58.125`;
- blocker: `momentum_signal_inactive` due to risk-filter failure.

The goal status report now surfaces the next replacement research candidate
instead of hiding it behind the legacy min75 gate:

- report:
  `var/reports/live-goal-status-20260513-refresh-after-web-market-scan.json`;
- `liveReady=false`;
- `replacementResearch.nextCandidate.candidate.market=KRW-H`;
- current live blockers remain the min75 realized-exit blockers because no
  replacement candidate has paper entry, realized exit, or live execution proof.

Additional spot relative-value smoke checks were run for Bithumb-Upbit KRW
markets using executable orderbooks:

- BTC: `medianNetEdgeBps=-2.058554`;
- ETH: `medianNetEdgeBps=-6.045693`;
- XRP: `medianNetEdgeBps=-8.425983`.

Conclusion:

`KRW-H` 60m momentum is the current best replacement research candidate, but it
is not live-ready and not even a current paper-entry candidate while its risk
filter is failing. Live remains blocked. The next useful action is continued
forward observation of `KRW-H` until the signal and risk filter both pass, then
paper entry, hold-window exit, and positive realized paper PnL verification.

Follow-up action:

- `observe-bithumb-reversal-candidate` now accepts `--min-return-bps 0` so
  the exact best promotion candidate can be observed instead of the nearby
  `minReturnBps=10` variant;
- started PM2 observer `dry-run-krw-h-60m-momentum-observer` with the exact
  top candidate parameters;
- command writes the latest observation to
  `var/reports/h-60m-momentum-top-forward-observation-latest.json`;
- PM2 status after first exact-candidate run: `waiting restart`;
- first exact-candidate PM2 observation still blocked with
  `momentum_signal_inactive`;
- first exact-candidate observation values: `minReturnBps=0`,
  `directionalSignalPass=true`, `riskPass=false`,
  `riskValue=2543.352601`, `riskThreshold=2071.713147410359`,
  `spreadBps=27.932961`, `spreadVsExpectedEdgeBps=-110.797198`, buy/sell
  depth both covered.

Paper observation wiring was added for the same `KRW-H` replacement candidate:

- PM2 observer: `dry-run-krw-h-60m-momentum-paper-observer`;
- source observation:
  `var/reports/h-60m-momentum-top-forward-observation-latest.json`;
- output:
  `var/reports/h-60m-momentum-paper-observation-latest.json`;
- latest result: `attemptedSignal=false`, `acceptedSignals=0`,
  `openPositionCount=0`, `reconciliationOk=true`;
- skipped reasons: `signal_inactive`, `observation_not_execution_viable`.

This keeps the replacement path ready without creating a paper position while
the live observation is blocked. The goal status recommendation now points to
the surfaced replacement candidate when one exists, while keeping live startup
blocked until signal, execution, paper entry, realized exit, and positive paper
PnL all pass.

## 2026-05-13 09:53 KST Replacement Goal And Web/API Recheck

The goal remains active and incomplete. `var/reports/live-goal-status-20260513-current.json`
now reports:

- `status=blocked`;
- `liveReady=false`;
- `replacementResearch.nextCandidate.candidate.market=KRW-H`;
- `recommendedAction=Keep live blocked; observe replacement candidate KRW-H
  until signal, execution, paper entry, realized exit, and positive paper PnL
  all pass.`

Latest `KRW-H` exact-candidate observation:

- report:
  `var/reports/h-60m-momentum-top-forward-observation-latest.json`;
- `generatedAt=2026-05-13T00:53:02.813Z`;
- `directionalSignalPass=true`;
- `riskPass=false`;
- `riskValue=2543.352601`, above threshold `2071.713147410359`;
- decision remains `blocked_by_signal_or_execution_cost` with
  `momentum_signal_inactive`.

Latest paper observation was refreshed from that observation:

- report: `var/reports/h-60m-momentum-paper-observation-latest.json`;
- `generatedAt=2026-05-13T00:53:16.127Z`;
- `attemptedSignal=false`;
- `acceptedSignals=0`;
- `openPositionCount=0`;
- `reconciliationOk=true`;
- skipped reasons: `signal_inactive`, `observation_not_execution_viable`.

Public web/API triage also does not produce an immediate replacement live
candidate:

- Bithumb-Upbit same-asset 500k KRW executable smoke checks were negative after
  taker fees: BTC `-5.401225` bps, ETH `-8.995502` bps, XRP `-8.995502` bps,
  SOL `-8.996401` bps, ADA `-33.787077` bps, DOGE `-69.916261` bps, LINK
  `-17.676438` bps, AVAX `-20.158222` bps, DOT `-8.995502` bps, SHIB
  `-61.304426` bps.
- Binance funding snapshot showed positive rates for several symbols, including
  SOL/DOGE/LINK at `0.0001`, but this is not enough to promote a carry trade
  without a dedicated fee, slippage, basis, inventory, and liquidation-risk
  replay.
- `KRW-USDT` top book remains deep enough to measure basis, but no basis
  strategy is promoted from top-of-book alone.

Decision:

Do not live-trade. The current best route is `KRW-H` 60m momentum replacement
observation, not the rejected cross-exchange BTC path. Same-asset RV and
funding/basis carry remain research branches only if they pass a measured
multi-observation expectancy gate.

## 2026-05-13 10:01 KST Spot-Perp Carry Measurement Gate

Subagent review recommended treating funding/basis carry as a measurement gate,
not a live gate. The implementation follows that: funding is counted for
promotion only when an observation includes a completed settled funding
timestamp, and public snapshots alone cannot become live-ready evidence.

New measurement artifact:

- CLI: `src/cli/analyze-spot-perp-carry.ts`;
- npm script: `dry-run:analyze-spot-perp-carry`;
- tests: `test/analyze-spot-perp-carry.test.ts`;
- current public snapshot report:
  `var/reports/spot-perp-carry-public-snapshot-20260513.json`.

The current public snapshot checks Bithumb spot against Binance USD-M perps for
BTC, ETH, XRP, SOL, DOGE, and LINK using executable Bithumb `KRW-USDT`
conversion, spot/perp/orderbook depth, taker fees, and a 20 bps exit buffer.

Current result:

- `status=blocked`;
- `promotionEligible=false`;
- blockers: `insufficientObservations`, `insufficientObservationSpan`,
  `insufficientCompletedFundingEvents`, `feeScheduleUnconfirmed`,
  `inventoryNotReady`, `hedgeVenueNotReady`, `weakMedianNetCarry`,
  `lowPositiveCarryRate`, `wideDisplayedSpread`;
- `completedFundingCount=0`;
- `depthCoverageRate=1`;
- `medianNetCarryBps=-37.256622`;
- `totalEstimatedNetPnlKrw=-13199.436772`.

Top current rows are still negative after basis, funding, and the exit buffer:

- BTC: `fundingBps=0.5116`, `basisEntryEdgeBps=-12.283675`,
  `netCarryBps=-31.772075`;
- XRP: `fundingBps=0.4725`, `basisEntryEdgeBps=-13.502882`,
  `netCarryBps=-33.030382`;
- SOL: `fundingBps=1`, `basisEntryEdgeBps=-17.026323`,
  `netCarryBps=-36.026323`;
- ETH: `fundingBps=0.1351`, `basisEntryEdgeBps=-18.622022`,
  `netCarryBps=-38.486922`;
- LINK: `fundingBps=1`, `basisEntryEdgeBps=-24.60987`,
  `netCarryBps=-43.60987`;
- DOGE: `fundingBps=1`, `basisEntryEdgeBps=-62.063163`,
  `netCarryBps=-81.063163`.

Decision:

Spot-perp carry is not a live candidate. It is now measurable without optimistic
funding artifacts, but the current snapshot is negative even before the
multi-day completed-funding requirement is met. The live goal therefore remains
blocked, with `KRW-H` 60m momentum still the only active replacement observer.

## 2026-05-13 10:04 KST Integrated Goal Status With Carry Branch

The live goal status report now includes the carry research branch so rejected
funding/basis evidence is visible in the same gate as min75, cross-exchange RV,
legacy candidates, and `KRW-H` replacement research.

Current integrated report:

- `var/reports/live-goal-status-20260513-current.json`;
- `status=blocked`;
- `liveReady=false`;
- `replacementResearch.nextCandidate.candidate.market=KRW-H`;
- `carryResearch.status=blocked`;
- `carryResearch.promotionEligible=false`;
- `carryResearch.summary.medianNetCarryBps=-37.256622`;
- `carryResearch.summary.totalEstimatedNetPnlKrw=-13199.436772`;
- `recommendedAction=Keep live blocked; observe replacement candidate KRW-H
  until signal, execution, paper entry, realized exit, and positive paper PnL
  all pass.`

The `--require-live-ready` gate was run against the integrated report inputs and
exited `2`, confirming live startup remains blocked.

Latest `KRW-H` observer state:

- observation:
  `var/reports/h-60m-momentum-top-forward-observation-latest.json`;
- `generatedAt=2026-05-13T01:03:09.106Z`;
- `directionalSignalPass=true`;
- `riskPass=false`;
- blocker remains `momentum_signal_inactive`.

Latest `KRW-H` paper observation was refreshed from that observation:

- `var/reports/h-60m-momentum-paper-observation-latest.json`;
- `generatedAt=2026-05-13T01:04:01.060Z`;
- `attemptedSignal=false`;
- `acceptedSignals=0`;
- `openPositionCount=0`;
- `reconciliationOk=true`.

Decision:

No goal completion. There is still no live-ready strategy. The current strategy
process is now explicitly: keep rejected branches visible, continue exact
`KRW-H` observation, and only progress after signal/risk, paper entry, realized
exit, and positive paper PnL all pass.

## 2026-05-13 10:06 KST Replacement Readiness Path

The goal status gate now accepts explicit replacement readiness reports through
`--replacement-readiness`. This prevents future `KRW-H` evidence from being
hidden behind the legacy min75 gate once it has its own readiness artifact.

Implementation:

- `src/cli/audit-live-goal-status.ts` now reads zero or more
  replacement readiness reports;
- `replacementResearch.readinessReports` lists those reports;
- `replacementResearch.liveCandidate` is set only when a report is fresh,
  `liveReadiness.ready=true`, and
  `strategyAssessment.classification=live_candidate`;
- a replacement live candidate can become the selected candidate, but only from
  that explicit readiness evidence.

Verification:

- `test/audit-live-goal-status.test.ts` now covers selecting a fresh live-ready
  replacement readiness report;
- the same test suite still proves rejected carry research does not make the
  goal live-ready;
- targeted run passed 19 tests across goal status, carry, forward observation,
  and paper observation;
- current integrated `--require-live-ready` still exits `2`;
- current report has `replacementResearch.readinessReports=[]` and
  `replacementResearch.liveCandidate=null`.

Decision:

The live path is structurally ready to accept a future `KRW-H` readiness report,
but no such live-ready report exists yet. Live remains blocked.

## 2026-05-13 10:10 KST KRW-H Replacement Readiness Artifact

The replacement path now has its own readiness artifact generator instead of
only a goal-status input slot.

Implementation:

- CLI: `src/cli/audit-bithumb-replacement-time-series-readiness.ts`;
- npm script: `dry-run:audit-bithumb-replacement-time-series-readiness`;
- tests: `test/audit-bithumb-replacement-time-series-readiness.test.ts`.

The new gate reads:

- a replacement scan report;
- the current forward observation;
- the current paper observation;
- an optional paper position/exit audit.

It emits the same readiness shape expected by `audit-live-goal-status`:
`strategyAssessment.classification`, `candidate`, `benchmarkSummary`,
`paperReadiness`, `liveReadiness`, and `openPosition`.

Current `KRW-H` readiness:

- report: `var/reports/h-60m-momentum-replacement-readiness-latest.json`;
- `strategyAssessment.classification=research_candidate`;
- `paperReadiness.ready=false`;
- `liveReadiness.ready=false`;
- historical checks pass, but live observation/paper blockers remain:
  `signalActive`, `riskPass`, `executionViabilityWatchCandidate`,
  `noObservationReasons`, `paperSignalAttempted`, `paperSignalAccepted`,
  `paperEntryCreatedOpenPosition`, `holdExitTimeKnown`,
  `realizedExitAvailable`, `noOpenPaperPositionAfterExit`,
  `positiveRealizedPaperExitPnl`, `liveExecutionPathReady`.

Integrated goal status now includes that readiness report:

- `replacementResearch.readinessReports.length=1`;
- first readiness classification is `research_candidate`;
- `replacementResearch.liveCandidate=null`;
- `--require-live-ready` still exits `2`.

Verification:

- targeted run passed 21 tests across replacement readiness, goal status,
  carry, forward observation, and paper observation;
- `git diff --check` passed.

Decision:

This closes the structural gap for `KRW-H`: if it later passes signal/risk,
paper entry, hold-window exit, and positive realized paper PnL, the goal gate
can consume the readiness artifact directly. It does not make the current
strategy live-ready.

## 2026-05-13 10:14 KST KRW-H PM2 Chain Verification

The `KRW-H` 60-minute replacement observer group is now started in dependency
order instead of all at once:

1. forward observation;
2. paper observation;
3. replacement readiness audit;
4. integrated live-goal status audit.

This avoids the previous race where paper/readiness/goal artifacts could read a
slightly older forward observation.

Validated command:

```bash
npm run pm2:restart:dry-run:krw-h-60m-momentum
```

Latest artifact order after the staggered restart:

- forward observation: `2026-05-13T01:14:23.347Z`;
- paper observation: `2026-05-13T01:14:28.475Z`;
- replacement readiness: `2026-05-13T01:14:30.668Z`;
- integrated goal status: `2026-05-13T01:14:32.880Z`.

Current `KRW-H` signal state:

- `signal.active=false`;
- `directionalSignalPass=true`;
- `riskPass=false`;
- no paper signal was attempted or accepted;
- no paper position is open.

Current goal state:

- report: `var/reports/live-goal-status-20260513-current.json`;
- `status=blocked`;
- `liveReady=false`;
- `replacementResearch.liveCandidate=null`;
- recommended action remains: keep live blocked and observe `KRW-H` until
  signal, execution, paper entry, realized exit, and positive paper PnL all
  pass.

Verification:

- `npm run build` passed;
- targeted strategy/readiness test run passed 21 tests;
- `git diff --check` passed;
- PM2 reports the `KRW-H` observer chain in `waiting restart`, which is the
  expected state for the one-shot scheduled observer apps after a completed
  cycle.

Decision:

The operational chain now supports continued autonomous evidence collection, but
the live goal is still incomplete. The current observed return is not a realized
profitable return; it is a blocked research candidate with no accepted paper
entry in the latest cycle.

## 2026-05-13 10:18 KST Replacement Readiness Integrity Gate

Subagent review flagged that staggered PM2 starts reduce, but do not fully
eliminate, stale artifact risk. The replacement readiness audit now blocks
promotion unless the paper observation is proven to belong to the same forward
observation:

- scan, forward observation, and paper observation `generatedAt` values must be
  parseable;
- paper observation must be generated after the forward observation;
- paper observation `sourceObservationPath` must match the input observation;
- paper candidate fields must match the observed candidate.

Current refreshed `KRW-H` artifact:

- forward observation: `2026-05-13T01:18:39.836Z`;
- paper observation: `2026-05-13T01:18:44.962Z`;
- replacement readiness: `2026-05-13T01:18:47.153Z`;
- integrated goal status: `2026-05-13T01:18:49.368Z`;
- all artifact-integrity checks pass;
- `strategyAssessment.classification=research_candidate`;
- `paperReadiness.ready=false`;
- `liveReadiness.ready=false`.

The active blockers remain strategy/market blockers, not artifact-order
blockers:

- `signalActive`;
- `riskPass`;
- `executionViabilityWatchCandidate`;
- `paperSignalAttempted`;
- `paperSignalAccepted`;
- `paperEntryCreatedOpenPosition`;
- `realizedExitAvailable`;
- `positiveRealizedPaperExitPnl`;
- `liveExecutionPathReady`.

Verification:

- `npm run build` passed;
- targeted strategy/readiness test run passed 22 tests, including stale and
  mismatched paper evidence rejection;
- `git diff --check` passed;
- integrated `--require-live-ready` gate exits `2`;
- the refreshed PM2 chain again reached the expected `waiting restart` state.

Decision:

The latest loss/profitability answer is unchanged: no current strategy is
live-ready or currently realizing positive paper PnL. The best research path is
still `KRW-H` 60-minute momentum, but only as a paper-only candidate until the
signal/risk gate produces an accepted paper entry and a positive realized exit.

## 2026-05-13 10:21 KST Goal Status Research-Focus Correction

Subagent review found that the integrated goal report could still look
BTC-min75-centered even though the current leading replacement research path is
`KRW-H` 60-minute momentum. The goal-status audit now distinguishes the live
gate from the current research focus:

- a fresh live-ready replacement readiness report still wins as
  `replacement_time_series`;
- positive cross-exchange executable evidence still wins as
  `cross_exchange_relative_value`;
- otherwise, a fresh replacement readiness report or replacement scan is shown
  as `replacement_time_series_research`;
- only when no replacement research focus exists does the report fall back to
  `btc_240m_momentum_min75`.

Current integrated goal status:

- report: `var/reports/live-goal-status-20260513-current.json`;
- generated at `2026-05-13T01:21:55.417Z`;
- `status=blocked`;
- `liveReady=false`;
- `selectedCandidate.type=replacement_time_series_research`;
- `replacementResearch.liveCandidate=null`.

Top-level blockers now expose the active `KRW-H` blockers directly:

- `replacementPaperReady`;
- `replacementLiveReady`;
- `replacement:signalActive`;
- `replacement:riskPass`;
- `replacement:executionViabilityWatchCandidate`;
- `replacement:paperSignalAttempted`;
- `replacement:paperSignalAccepted`;
- `replacement:paperEntryCreatedOpenPosition`;
- `replacement:realizedExitAvailable`;
- `replacement:positiveRealizedPaperExitPnl`;
- `replacement:liveExecutionPathReady`.

The replacement readiness benchmark summary was also relabeled to avoid a
population mismatch. It now records historical train/test returns as historical
candidate evidence and leaves `buyHoldReturnPct` and
`excessReturnVsBuyHoldPct` as `null` because this readiness audit does not
measure buy-and-hold excess return.

Verification:

- `npm run build` passed;
- targeted strategy/readiness test run passed 23 tests;
- `git diff --check` passed;
- direct integrated `--require-live-ready` gate exits `2`.

Decision:

This improves the operational answer to "what are we trying to make live?".
The answer is now explicit: `KRW-H` is the leading research focus, but it is not
paper-ready or live-ready. Live remains blocked.

Follow-up subagent review found one edge case in the first correction: when a
replacement research focus was selected, `liveReady` could still fall through to
the min75 result. This is now fixed so `replacement_time_series_research` is
always blocked unless a fresh replacement readiness report is explicitly
`live_candidate`.

Additional verification:

- `test/audit-live-goal-status.test.ts` now covers the case where min75 is
  live-ready but replacement research is not; the integrated report must remain
  blocked;
- current goal report was refreshed at `2026-05-13T01:24:06.645Z`;
- direct integrated `--require-live-ready` gate still exits `2`.

## 2026-05-13 10:27 KST Executable VWAP Observation Gate

The `KRW-H` forward observer now measures executable depth instead of relying
only on top-of-book spread:

- `buyDepth` and `sellDepth` use partial level fills up to the requested
  notional;
- each side records `vwapPrice` and `slippageBps`;
- the observation records `executableRoundTripCostBps`;
- the execution gate compares `executableCostVsExpectedEdgeBps` against zero;
- replacement readiness requires `executableCostMeasured` and
  `executableCostWithinExpectedEdge`.

This closes the optimistic artifact where depth coverage could pass while the
actual notional-sized fill cost was not explicitly measured.

Implementation notes:

- `src/cli/observe-bithumb-reversal-candidate.ts` exports the VWAP depth helper
  for unit testing;
- the CLI still runs normally under direct `node` execution and PM2. A first
  guard version did not run under PM2 because PM2's argv shape differs from
  direct node; this was fixed by allowing `process.env.pm_id` execution.

Latest refreshed `KRW-H` observation:

- forward observation: `2026-05-13T01:27:30.467Z`;
- paper observation: `2026-05-13T01:27:35.620Z`;
- replacement readiness: `2026-05-13T01:27:37.801Z`;
- integrated goal status: `2026-05-13T01:27:40.016Z`;
- `executableRoundTripCostBps=28.248588`;
- `executableCostVsExpectedEdgeBps=-110.481571`;
- `executableCostMeasured=true`;
- `executableCostWithinExpectedEdge=true`.

Current blocking reason is therefore not execution cost. The remaining blockers
are still the signal/risk and paper lifecycle gates:

- `signalActive`;
- `riskPass`;
- `executionViabilityWatchCandidate`;
- `paperSignalAttempted`;
- `paperSignalAccepted`;
- `paperEntryCreatedOpenPosition`;
- `holdExitTimeKnown`;
- `realizedExitAvailable`;
- `positiveRealizedPaperExitPnl`;
- `liveExecutionPathReady`.

Verification:

- `npm run build` passed;
- targeted strategy/readiness test run passed 24 tests, including executable
  VWAP depth calculation;
- PM2 chain refreshed with the new observation schema;
- direct integrated `--require-live-ready` gate exits `2`;
- `git diff --check` passed.

Decision:

The best current path remains `KRW-H` 60-minute momentum as a research focus
only. Its current executable cost is acceptable relative to historical median
edge, but signal/risk and paper lifecycle evidence are still missing, so live
remains blocked.

## 2026-05-13 10:30 KST Snapshot Freshness Gate

The `KRW-H` observer now records and gates snapshot freshness:

- `tickerAgeMs`;
- `latestCandleAgeMs`;
- `tickerFresh`;
- `latestCandleRecent`;
- `snapshotSkewControlled`.

Replacement readiness now requires all three freshness checks before paper or
live readiness can pass.

During validation, Bithumb ticker timestamps appeared about nine hours ahead of
the local UTC observation clock. The observer now preserves the raw timestamp
and uses a normalized timestamp when subtracting the KST offset produces a
plausible observation-time timestamp.

Latest refreshed `KRW-H` observation:

- forward observation: `2026-05-13T01:30:29.088Z`;
- replacement readiness: `2026-05-13T01:30:36.443Z`;
- integrated goal status: `2026-05-13T01:30:38.679Z`;
- raw ticker timestamp: `1778668223476`;
- normalized ticker timestamp: `1778635823476`;
- `timestampAdjustedFromKstEpoch=true`;
- `tickerAgeMs=5612`;
- `tickerFresh=true`;
- `latestCandleRecent=true`;
- `snapshotSkewControlled=true`.

Current blocking reason is not snapshot skew. The active blockers remain:

- `signalActive`;
- `riskPass`;
- `executionViabilityWatchCandidate`;
- `paperSignalAttempted`;
- `paperSignalAccepted`;
- `paperEntryCreatedOpenPosition`;
- `holdExitTimeKnown`;
- `realizedExitAvailable`;
- `positiveRealizedPaperExitPnl`;
- `liveExecutionPathReady`.

Verification:

- `npm run build` passed;
- targeted strategy/readiness test run passed 25 tests, including Bithumb
  KST-shifted timestamp normalization;
- PM2 chain refreshed with freshness checks passing;
- direct integrated `--require-live-ready` gate exits `2`;
- `git diff --check` passed.

Decision:

The evidence is cleaner, but the conclusion is unchanged: `KRW-H` remains the
leading research focus, not a live candidate.

## 2026-05-13 10:40 KST Broader Scan Supersession Gate

The replacement search was widened from the older top-20 KRW 60-minute momentum
scan to a top-50 scan using 5000 candles and the same 20 bps round-trip fee
assumption.

Latest broader scan:

- report:
  `var/reports/krw-top50-public-60m-momentum-scan-fee20-5000-20260513.json`;
- generated: `2026-05-13T01:36:34.371Z`;
- evaluated markets: `49`;
- candidates: `13328`;
- promotion candidates: `0`.

The best test-PnL row in the broader scan was not promotable:

- market: `KRW-PEAQ`;
- train median PnL: `-2813.784764` KRW;
- test median PnL: `-1210.526316` KRW;
- walk-forward positive-total folds: `2`;
- minimum walk-forward fold PnL: `-505645.970976` KRW.

The goal-status audit now chooses the latest replacement scan when setting
`replacementResearch.nextCandidate`. This prevents an older narrower scan from
keeping `KRW-H` as the next promotion candidate after a fresher broader scan has
no promotion candidates.

Current integrated goal report:

- report: `var/reports/live-goal-status-20260513-current.json`;
- generated: `2026-05-13T01:40:07.369Z`;
- status: `blocked`;
- liveReady: `false`;
- selected candidate type: `replacement_time_series_research`;
- recommended action:
  `Keep live blocked; current replacement research KRW-H is observation-only, and the latest replacement scan has no promotion candidate.`

Verification:

- `npm run build` passed;
- targeted strategy/readiness test run passed 26 tests;
- integrated goal-status refresh includes both top-20 and top-50 replacement
  scans;
- PM2 goal-status config now includes the top-50 replacement scan path.

Decision:

Do not live-trade. The local evidence no longer supports treating the older
`KRW-H` top-20 promotion as the next live path. It can remain as an
observation-only research thread, but the active search must continue until a
fresh broad scan or realized paper lifecycle produces positive evidence.

## 2026-05-13 10:46 KST Expanded Strategy Family Scan

External research still supports treating crypto momentum and funding/carry as
reasonable strategy families to test, but local executable evidence controls
promotion. I therefore expanded the local search beyond single-market
time-series momentum.

New scans:

- time-series momentum top-50:
  `var/reports/krw-top50-public-60m-momentum-scan-fee20-5000-20260513.json`;
- cross-sectional momentum top-50:
  `var/reports/krw-top50-public-60m-cross-sectional-momentum-scan-fee20-5000-20260513.json`;
- volatility-contraction breakout top-50:
  `var/reports/krw-top50-public-volatility-breakout-scan-fee20-5000-20260513.json`;
- order-flow continuation:
  `var/reports/order-flow-continuation-fee20-20260513.json`;
- intraday session edge:
  `var/reports/intraday-session-edge-fee20-20260513.json`.
- cross-market lead/lag:
  `var/reports/cross-market-lead-lag-btc-eth-xrp-fee20-20260513.json`.

Results:

| Strategy family | Candidate count | Promotion candidates | Main rejection signal |
| --- | ---: | ---: | --- |
| Time-series momentum top-50 | 13328 | 0 | best test row had negative train/test medians and negative walk-forward fold |
| Cross-sectional momentum top-50 | 96 | 0 | best test row had train median `-13847.222222` KRW, test median `-27006.27287` KRW |
| Volatility breakout top-50 | 15876 | 0 | best test row had train median `-11000` KRW, test median `-1532.367973` KRW |
| Order-flow continuation | 960 | 0 | best row had negative train/test medians and zero positive walk-forward folds |
| Intraday session edge | 1728 | 0 | best row had tiny sample and negative walk-forward minimum fold |
| Cross-market lead/lag | 1200 | 0 | best row had train median `-134.448932` KRW, one test trade, and negative walk-forward minimum fold |

Decision:

No newly scanned strategy family is live-ready or paper-promotable. The live
goal remains active and blocked. The correct behavior is to keep refusing live
startup until a fresh scan plus executable forward observation plus realized
paper exit proves positive expectancy.

## 2026-05-13 10:47 KST Expanded Scans Added To Goal Status

The integrated goal-status report now attaches all current broad strategy-family
screens, not only the KRW-H/top-50 momentum scans.

Added goal-status inputs:

- `var/reports/krw-top50-public-60m-cross-sectional-momentum-scan-fee20-5000-20260513.json`;
- `var/reports/krw-top50-public-volatility-breakout-scan-fee20-5000-20260513.json`;
- `var/reports/order-flow-continuation-fee20-20260513.json`;
- `var/reports/intraday-session-edge-fee20-20260513.json`;
- `var/reports/cross-market-lead-lag-btc-eth-xrp-fee20-20260513.json`.

Current integrated report:

- report: `var/reports/live-goal-status-20260513-current.json`;
- generated: `2026-05-13T01:47:53.065Z`;
- status: `blocked`;
- liveReady: `false`;
- replacement scan count: `6`;
- latest scan:
  `var/reports/krw-top50-public-volatility-breakout-scan-fee20-5000-20260513.json`;
- latest scan promotion candidates: `0`;
- next replacement candidate: `null`.

Decision:

The goal-status automation now reflects the wider search result. The live goal
remains incomplete because no scanned candidate has positive, executable, and
realized paper evidence.

## 2026-05-13 10:53 KST KRW-H Promotion Sensitivity Check

The older top-20 scan and the newer top-50 scan disagreed on `KRW-H`.

Findings:

- older top-20 scan source for `KRW-H`: 5000 candles through
  `2026-05-13T00:00:00.000Z`;
- newer top-50/single-market scan source for `KRW-H`: 5000 candles through
  `2026-05-13T01:00:00.000Z`;
- adding one more hourly candle removed all `KRW-H` promotion candidates.

The exact older candidate was rechecked as a single-candidate benchmark:

- report:
  `var/reports/krw-h-60m-momentum-lb168-hold24-fee20-benchmark-20260513-latest.json`;
- strategy return: `203.94286%`;
- buy-hold return: `88.297872%`;
- max drawdown: `-43.532283%`;
- trade count: `94`.

That benchmark is not sufficient for live promotion because the current
train/test/walk-forward promotion scan no longer contains the candidate:

- report:
  `var/reports/krw-h-public-60m-momentum-scan-fee20-5000-20260513.json`;
- generated: `2026-05-13T01:52:21.667Z`;
- promotion candidates: `0`.

The KRW-H replacement readiness artifact was regenerated from the latest
single-market scan and now classifies the candidate as `discard_candidate`.
The PM2 readiness observer was updated to use that latest single-market scan
instead of the stale top-20 promotion scan.

Decision:

Do not keep treating `KRW-H` as the leading replacement candidate. It remains a
useful example of why benchmark return alone is not enough: a one-hour window
shift removed promotion status, so live startup must stay blocked.

## 2026-05-13 11:08 KST 240m Momentum Expansion

The next non-redundant check was to test the web-supported, longer-horizon
momentum family without adding new strategy code. Two existing scanners were
run on top-50 KRW markets with 240-minute public candles, 20 bps round-trip
cost, and 5,000 KRW notional:

- `var/reports/krw-top50-public-240m-momentum-scan-fee20-5000-20260513.json`;
- `var/reports/krw-top50-public-240m-cross-sectional-momentum-scan-fee20-5000-20260513.json`.

Results:

- 240m time-series momentum: `candidateCount=12784`,
  `promotionCandidateCount=0`;
- 240m cross-sectional momentum: `candidateCount=96`,
  `promotionCandidateCount=0`;
- the best 240m time-series result had positive test total PnL but negative
  train median, negative test median, and negative walk-forward minimum fold;
- the best 240m cross-sectional result had positive test total and median, but
  train median was negative and walk-forward minimum fold was negative.

The goal-status observer and live-goal gate now include both 240m scans. The
current integrated report is:

- report: `var/reports/live-goal-status-20260513-current.json`;
- generated: `2026-05-13T02:08:20.572Z`;
- status: `blocked`;
- liveReady: `false`;
- replacement scan count: `10`;
- latest scan:
  `var/reports/krw-top50-public-240m-cross-sectional-momentum-scan-fee20-5000-20260513.json`;
- latest scan promotion candidates: `0`;
- latest scan has no promotion candidate: `true`;
- superseded promotion candidates from older scans: `3`;
- next replacement candidate: `null`.

Decision:

Do not promote the 240m momentum expansion. It adds coverage, but it does not
produce a replacement candidate with stable train/test/walk-forward expectancy.
The only remaining paper candidate is still BTC min75, and it remains blocked
until the scheduled fixed-hold exit has realized positive paper PnL.

The goal-status report now separates current candidate absence from stale
historical promotions. `noPromotionCandidates=false` can still be true at the
all-scans history level when an older scan had a candidate, but
`latestScanHasNoPromotionCandidate=true` and `nextCandidate=null` are the
operative current-decision fields.

## 2026-05-13 11:32 KST Order-Flow Fee20 Stress Update

The order-flow family was rechecked at the same 20 bps round-trip cost used by
the live-goal gate, rather than mixing older 8 bps optimistic or 50 bps stress
artifacts into the current decision surface.

Completed reports:

- `var/reports/order-flow-absorption-btc-eth-xrp-h300-fee20-20260513.json`;
- `var/reports/order-flow-reversion-btc-eth-xrp-h300-fee20-20260513.json`;
- `var/reports/order-flow-continuation-btc-eth-xrp-h60-180-300-900-1800-fee20-20260513.json`.

Results:

- absorption: `candidateCount=960`, `promotionCandidateCount=0`; the top test
  row had no test trades and negative train PnL;
- reversion: `candidateCount=960`, `promotionCandidateCount=0`; the top test
  row had negative train median, negative test median, and negative
  walk-forward minimum fold;
- multihorizon continuation: `candidateCount=4800`,
  `promotionCandidateCount=0`; the top test row had negative train median,
  negative test median, and negative walk-forward minimum fold.

The live-goal gate and PM2 goal-status observer now include these completed
20 bps order-flow scans as replacement research evidence. They are not live or
paper candidates; they are explicit rejection evidence so the strategy search
does not keep reusing a losing order-flow direction.

Decision:

Do not promote order-flow continuation, reversion, or absorption. The current
goal remains blocked, with BTC min75 still paper-only until its scheduled
realized exit and all other tested families either discarded or blocked.

## 2026-05-13 11:37 KST 240m Reversal Expansion

The remaining non-duplicative public-candle check was to test the same top-50,
240-minute, 20 bps, 5,000 KRW surface with the existing reversal signal mode.
This reuses the same scanner and promotion gates as the momentum scans, changing
only the signal direction.

- report:
  `var/reports/krw-top50-public-240m-reversal-scan-fee20-5000-20260513.json`;
- generated: `2026-05-13T02:37:17.664Z`;
- market count: `47`;
- failure count: `3`;
- candidate count: `12784`;
- promotion candidates: `0`.

The top test row was `KRW-SOLV` with `lookbackBars=72`, `holdBars=24`,
`minReturnBps=0`, and `riskFilter=rv24_below_median`. Its test total PnL was
positive, but train total PnL, train median, test median, and walk-forward
minimum fold were all negative:

- train total PnL: `-2038.028318`;
- train median PnL: `-42.484185`;
- test total PnL: `12053.97276`;
- test median PnL: `-70.15625`;
- positive walk-forward total folds: `2`;
- positive walk-forward median folds: `1`;
- minimum walk-forward fold PnL: `-1846.415654`.

The live-goal gate and PM2 goal-status observer now include this reversal scan
as replacement research evidence.

Decision:

Do not promote 240-minute reversal. Like the other public-candle expansions, it
changes reported PnL in the test segment but does not improve expectancy enough
to clear train/test median and walk-forward stability gates.

## 2026-05-13 11:45 KST 60m Reversal Replacement Candidate

The 60-minute reversal family was expanded from the older top-20 scan to the
same current top-50, 20 bps, 5,000 KRW surface used by the live-goal research
gate:

- report:
  `var/reports/krw-top50-public-60m-reversal-scan-fee20-5000-20260513.json`;
- generated: `2026-05-13T02:41:36.994Z`;
- market count: `49`;
- failure count: `1`;
- candidate count: `13328`;
- promotion candidates: `10`.

The top score was `KRW-PIEVERSE`, but its forward observation is not executable
enough for the historical edge:

- observation:
  `var/reports/pieverse-60m-reversal-top-forward-observation-latest.json`;
- signal active: `false`;
- lookback return: `760.330579` bps, so the reversal drop condition is not met;
- executable round-trip cost: `24.057092` bps;
- expected test-median edge: `5.38071` bps;
- readiness:
  `var/reports/pieverse-60m-reversal-replacement-readiness-latest.json`;
- classification: `research_candidate`, not paper/live.

The better executable candidate is `KRW-STABLE`:

- single-market scan:
  `var/reports/krw-stable-public-60m-reversal-scan-fee20-5000-20260513.json`;
- generated: `2026-05-13T02:43:25.533Z`;
- promotion candidates: `1`;
- train count: `77`;
- train total PnL: `3279.965989`;
- train median PnL: `34.887781`;
- test count: `35`;
- test total PnL: `2349.798696`;
- test median PnL: `19.68508`;
- walk-forward total folds positive: `5`;
- walk-forward median folds positive: `5`;
- minimum walk-forward fold PnL: `18.727564`.

Forward observation for `KRW-STABLE`:

- observation:
  `var/reports/stable-60m-reversal-top-forward-observation-latest.json`;
- signal active: `false`;
- lookback return: `806.262231` bps, so the reversal drop condition is not met;
- executable round-trip cost: `21.546414` bps;
- expected test-median edge: `39.37016` bps;
- cost is currently within expected edge, but no paper entry is allowed while
  signal is inactive.

Paper/readiness artifacts:

- `var/reports/stable-60m-reversal-paper-observation-latest.json`;
- `var/reports/stable-60m-reversal-position-audit-latest.json`;
- `var/reports/stable-60m-reversal-replacement-readiness-latest.json`;
- classification: `research_candidate`;
- paperReady: `false`;
- liveReady: `false`;
- blockers: inactive signal, no paper signal attempt/acceptance, no open paper
  position, no hold exit, no realized positive paper PnL.

The single-market readiness audit was fixed so candidates from single-market
scans can match the market in `assumptions.market` when individual promotion
candidate rows omit `market`.

The replacement paper position audit now accepts the paper-observation artifact
directly and treats a missing open position as a normal `no_open_position`
state. This lets the PM2 chain stay running before a signal appears, while still
feeding the eventual open-position/hold-exit/realized-PnL evidence into
replacement readiness once a paper entry exists.

## 2026-05-13 PİEVERSE high-edge reversal watch

The initial `KRW-PIEVERSE` forward observation above used the top scan row,
whose test median edge was too small for the live orderbook. A later inspection
of the same top-50 reversal scan found a stronger `KRW-PIEVERSE` variant:

- market: `KRW-PIEVERSE`;
- unit: `60m`;
- lookback bars: `168`;
- hold bars: `24`;
- risk filter: `rv24_below_median`;
- test median PnL: `64.97657` KRW per 5000 KRW notional;
- expected median edge: `129.95314` bps;
- walk-forward minimum fold PnL: `612.216876` KRW.

Forward/paper/readiness artifacts:

- `var/reports/pieverse-60m-reversal-lb168-rvmedian-forward-observation-latest.json`;
- `var/reports/pieverse-60m-reversal-lb168-paper-observation-latest.json`;
- `var/reports/pieverse-60m-reversal-lb168-position-audit-latest.json`;
- `var/reports/pieverse-60m-reversal-lb168-replacement-readiness-latest.json`.

Latest forward observation generated `2026-05-13T03:00:45.918Z`:

- signal active: `false`;
- lookback return: `2323.612418` bps, so this is not a reversal entry;
- risk pass: `false`;
- executable round-trip cost: `22.953328` bps;
- executable cost is within the expected median edge.

The goal-status audit now ranks fresh replacement readiness reports by
historical edge evidence instead of input order, so this stronger `KRW-PIEVERSE`
research path can supersede `KRW-STABLE` while both remain blocked. It is still
not a live candidate; it needs a fresh reversal signal, risk pass, accepted
paper entry, hold-window exit, and positive realized paper PnL.

Decision:

`KRW-PIEVERSE` 60-minute reversal lb168 is the current stronger replacement
research focus. `KRW-STABLE` remains useful as a secondary watch candidate, but
neither is live-ready.

## 2026-05-13 14:31 KST Latest Integrated Decision

This section supersedes the earlier 2026-05-13 intraday replacement rankings
above. The current integrated goal report ranks KRW-H ahead of STABLE and
PIEVERSE because its fresh readiness evidence has the strongest promotion-grade
historical and walk-forward support, even though it is still blocked for live.

Latest goal gate:

- command: `npm run dry-run:gate-live-goal-ready`;
- exit code: `2`;
- report: `var/reports/live-goal-status-20260513-current.json`;
- generated: `2026-05-13T05:30:59.088Z`;
- status: `blocked`;
- liveReady: `false`;
- completion audit: `achieved=false`.

Current candidate ordering:

1. `KRW-H` 60m momentum is the leading replacement research path:
   - historical return: `3.4865489999999997%`;
   - test return: `2.659181%`;
   - test median PnL: `6250` KRW;
   - walk-forward minimum fold PnL: `8113.658939` KRW;
   - latest forward direction passes, but `riskPass=false`;
   - paper signal attempted: `false`;
   - accepted paper signals: `0`;
   - open paper positions: `0`.
2. `KRW-STABLE` 60m reversal remains blocked because the reversal direction
   signal is inactive.
3. `KRW-PIEVERSE` 60m reversal lb168 remains blocked because both the reversal
   direction and risk checks fail.
4. BTC min75 remains the closest paper lifecycle path, not because it outranks
   KRW-H research on expected edge, but because it already has an open paper
   position awaiting the scheduled reduce-only exit.

Latest BTC min75 paper mark:

- estimated open net PnL: `2347.861698` KRW;
- estimated open return: `0.469362%`;
- hold exit due: `2026-05-16T11:00:00.000Z`;
- usable for live promotion: `false`.

Risk-filter sensitivity:

- For the KRW-H 168/24 momentum rule, the current p70 risk filter is the only
  tested setting that still passes promotion criteria.
- p85, p90, and no-risk-filter variants can allow the current entry, but they
  fail promotion checks. They would increase activity without a verified
  expectancy improvement.
- Therefore the current decision is to keep the p70 risk filter and wait for a
  valid forward paper entry instead of forcing a trade.

Rejected paths:

- legacy: traded PnL `-46432.23525699999` KRW and closed-trade PnL
  `-20564.104167` KRW;
- cross-exchange relative value: estimated net PnL `-8914.091976` KRW, median
  net edge `-15.168606` bps, positive rate `0`;
- spot-perp carry: estimated net PnL `-13199.436772` KRW, median net carry
  `-37.256622` bps, positive rate `0`, completed funding count `0`.

Verification:

- `npm test` passed `234/234`;
- `.venv/bin/python -m unittest discover -s tests -v` passed `61/61`;
- the BTC min75, live-goal status, KRW-H, STABLE, and PIEVERSE PM2 observers
  were all `waiting restart` after successful cycles with `exit_code=0`;
- `npm run dry-run:gate-btc-240m-min75-live-ready` exited `1`; the refreshed
  BTC min75 readiness artifact generated `2026-05-13T05:33:59.936Z` remains
  `paper_candidate`, with `paperReady=true`, `liveReady=false`, and blockers
  `realizedExitAvailable`, `realizedExitReusePolicy`,
  `noOpenPaperPositionAfterExit`, and `positiveRealizedPaperExitPnl`;
- `npm run dry-run:audit-btc-240m-live-execution-path -- --output
  var/reports/btc-240m-live-execution-path-audit-20260513-latest.json
  --require-ready` passed; the generated report at `2026-05-13T05:37:49.275Z`
  has `ready=true` and no reasons, so the remaining BTC min75 blocker is paper
  profitability evidence rather than missing live-path wiring;
- regression test
  `live BTC PM2 start scripts run goal gates before live PM2 startup` now
  verifies both live BTC PM2 start/restart paths run `dry-run:gate-live-goal-ready`
  before their strategy-specific BTC readiness gate and before PM2 startup;
- targeted live gate tests passed `29/29` with
  `node --test dist/test/live-goal-operational-config.test.js
  dist/test/audit-btc-240m-live-execution-path.test.js
  dist/test/audit-live-goal-status.test.js`;
- the same BTC min75 refresh showed current forward signal still executable for
  paper observation only: signal active, lookback return `144.216951` bps,
  risk pass true, executable round-trip cost `3.917773` bps, and
  `executionViability=watch_candidate`;
- `npm run pm2:start:live-btc-min75` exited `2` before starting a live process;
- `npm run pm2:start:live-btc` exited `2` before starting a live process;
- `pm2 jlist` showed no live trading process after those blocked start
  attempts, only the dry-run live-goal status observer matched `live`;
- `git diff --check` passed after the latest audit update.

Completion decision:

The goal is still not achieved. Live startup must remain blocked until a
candidate has realized positive paper PnL or complete live operational proof.
The next concrete review point is BTC min75 after
`2026-05-16T11:00:00.000Z`. If its first reduce-only paper exit realizes a
positive net PnL, leaves no open paper position, and passes both
`npm run dry-run:gate-btc-240m-min75-live-ready` and
`npm run dry-run:gate-live-goal-ready`, then the BTC min75 live path can be
reviewed for a small gated start. If it fails, the rule must be paused or
modified before any live attempt.

## 2026-05-13 14:41 KST Subagent And Current Gate Recheck

The goal remains active and incomplete. A fresh top-level gate was run after
PM2/log inspection and two independent subagent checks.

Latest gate:

- command: `npm run dry-run:gate-live-goal-ready`;
- exit code: `2`;
- report: `var/reports/live-goal-status-20260513-current.json`;
- generated: `2026-05-13T05:40:54.781Z`;
- status: `blocked`;
- liveReady: `false`;
- completion audit: `achieved=false`.

Current PnL and promotion evidence:

- `BTC min75`: no realized PnL yet; open paper mark is `+2266.023109` KRW,
  `+0.453001%`; hold exit due remains `2026-05-16T11:00:00.000Z`; this mark is
  not usable for live promotion.
- `KRW-H` 60m momentum: no open or realized paper position; historical return
  `+3.4865489999999997%`, test return `+2.659181%`, test median PnL `6250` KRW,
  and walk-forward minimum fold PnL `8113.658939` KRW; latest forward
  observation remains blocked by `risk_filter_failed`.
- legacy candidates remain rejected: traded PnL `-46432.23525699999` KRW and
  closed-trade PnL `-20564.104167` KRW.
- cross-exchange relative value remains rejected or remeasure-only: estimated
  net PnL `-8914.091976` KRW, median edge `-15.168606` bps, positive rate `0`.
- spot-perp carry remains rejected or remeasure-only: estimated net PnL
  `-13199.436772` KRW, median carry `-37.256622` bps, positive rate `0`, and
  completed funding count `0`.

KRW-H current forward state:

- latest forward observation generated `2026-05-13T05:39:37.562Z`;
- latest candle: `2026-05-13T05:00:00.000Z`;
- lookback return: `2006.802721` bps;
- risk value: `2543.352601`;
- risk threshold: `2071.713147410359`;
- risk excess: `471.639454` bps;
- executable cost versus expected edge: `-110.321068` bps;
- execution viability: `blocked_by_signal_or_execution_cost`;
- paper observation skipped because `risk_filter_failed` and
  `observation_not_execution_viable`.

Subagent findings:

- Hubble and Sagan both concluded there is no live-ready strategy now.
- Both identified `BTC min75` as the closest lifecycle candidate because it has
  an open paper position, but both treated the positive mark as unrealized and
  insufficient for live.
- Both rejected legacy, cross-exchange relative value, and spot-perp carry as
  current live paths because the latest evidence is negative.
- Both kept `KRW-H` only as a research/paper-observation candidate; neither
  recommended loosening risk filters to force an entry.

External research check:

Recent crypto strategy literature still supports the local direction: lower
turnover, risk-managed momentum/trend-following with explicit transaction-cost,
liquidity, and regime controls. It does not support overriding risk filters to
increase entries when forward evidence is blocked.

Operational state:

- relevant PM2 dry-run observers have empty recent err logs and successful
  cycles with `exit_code=0`;
- no live trading process is running;
- BTC min75 execution-path audit remains `ready=true`, so the BTC blocker is
  realized positive paper evidence, not wiring.

Decision:

Do not mark the goal complete. Do not start live. Do not keep pursuing
loss-making legacy, cross-exchange, or carry paths as if they were candidates.
Maintain BTC min75 until the scheduled reduce-only paper exit, and maintain
KRW-H observation only under the existing p70 risk gate. If BTC min75 exits
negative on or after `2026-05-16T11:00:00.000Z`, pause or revise the rule
before any live attempt.

## 2026-05-13 14:45 KST KRW-H Single-Variable Risk Check

To test whether the strategy should be modified instead of waiting, the KRW-H
168/24 60m momentum candidate was rebenchmarked with only the risk threshold
changed. The market, signal mode, lookback, hold, notional, and 35 bps
round-trip cost were held constant.

Artifacts:

- `var/reports/krw-h-60m-momentum-risk-threshold-p70-benchmark-fee35-500k-20260513-refresh.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-p75-benchmark-fee35-500k-20260513.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-p80-benchmark-fee35-500k-20260513.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-currentpass-benchmark-fee35-500k-20260513-refresh.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-p85-benchmark-fee35-500k-20260513.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-p90-benchmark-fee35-500k-20260513.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-none-benchmark-fee35-500k-20260513.json`.

Whole-period benchmark summary:

| Risk threshold | Current signal pass | Trades | Return | Excess vs buy-hold | Max drawdown | Interpretation |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| p70 `2071.713147` | no | 94 | `187.052034%` | `93.09599%` | `-44.429681%` | current baseline |
| p75 `2212.389381` | no | 98 | `271.557283%` | `177.601239%` | `-44.429681%` | better benchmark, but does not allow current entry |
| p80 `2528.735632` | no | 103 | `172.179161%` | `78.223117%` | `-78.915918%` | worse drawdown and still blocks current entry |
| current-pass `2543.352601` | yes | 103 | `172.179161%` | `78.223117%` | `-78.915918%` | allows current entry but worsens return/drawdown vs p70 |
| p85 `2986.111111` | yes | 106 | `249.603762%` | `155.647719%` | `-78.915918%` | allows current entry with severe drawdown |
| p90 `3976.377953` | yes | 108 | `291.775876%` | `197.819832%` | `-76.310334%` | highest whole-period return, but severe drawdown |
| none | yes | 113 | `71.011601%` | `-22.944443%` | `-82.561368%` | clear rejection |

This benchmark is not a live-promotion gate. The stricter promotion scan still
requires train/test medians and walk-forward stability, and the prior
sensitivity check found that p85, p90, and no-filter variants do not clear that
standard. The important live decision is narrower: relaxing just enough to pass
the current entry worsens both return and drawdown relative to p70. Therefore
there is no evidence-based reason to force the current KRW-H entry.

## 2026-05-13 14:48 KST Candidate Benchmark Validation Upgrade

The single-candidate benchmark CLI now reports the same fixed-parameter
train/test and walk-forward validation fields used to judge replacement
candidates. This reduces the risk that a whole-period compounded return makes a
relaxed risk threshold look better than it is.

Code and test:

- `src/cli/analyze-bithumb-candidate-benchmark.ts` now writes
  `validation.train`, `validation.test`, `validation.walkForwardSummary`, and
  boolean `validation.checks`;
- `test/analyze-bithumb-candidate-benchmark.test.ts` verifies that the new
  validation section is present;
- targeted verification:
  `npm run build && node --test dist/test/analyze-bithumb-candidate-benchmark.test.js`
  passed `2/2`.

Validated KRW-H risk-threshold artifacts:

- `var/reports/krw-h-60m-momentum-risk-threshold-p70-benchmark-fee35-500k-20260513-validation.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-p75-benchmark-fee35-500k-20260513-validation.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-currentpass-benchmark-fee35-500k-20260513-validation.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-p90-benchmark-fee35-500k-20260513-validation.json`;
- `var/reports/krw-h-60m-momentum-risk-threshold-none-benchmark-fee35-500k-20260513-validation.json`.

Validation result:

| Risk threshold | Whole-period return | Max drawdown | Train median | Test median | WF total folds | WF median folds | Min fold | Validation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| p70 `2071.713147` | `187.052034%` | `-44.429681%` | `423.913043` | `6250` | `5/5` | `4/5` | `8113.658939` | pass |
| p75 `2212.389381` | `271.557283%` | `-44.429681%` | `502.252252` | `6186.507937` | `4/5` | `4/5` | `-8751.224859` | fail min fold |
| current-pass `2543.352601` | `172.179161%` | `-78.915918%` | `-1750` | `6250` | `4/5` | `3/5` | `-20904.337119` | fail train median, WF median, min fold |
| p90 `3976.377953` | `291.775876%` | `-76.310334%` | `2315.04065` | `6186.507937` | `3/5` | `4/5` | `-51506.459293` | fail WF total and min fold |
| none | `71.011601%` | `-82.561368%` | `-1750` | `6186.507937` | `3/5` | `2/5` | `-51506.459293` | reject |

This confirms the operational decision: p70 is the only tested KRW-H threshold
that both keeps drawdown materially lower and clears the fixed-parameter
validation checks. The current-pass threshold would create an entry now, but it
does so by accepting a worse train median, weaker walk-forward evidence, and a
much deeper drawdown.

## 2026-05-13 14:50 KST Current Gate After Validation Change

The top-level live goal gate was rerun after the benchmark validation change:

- command: `npm run dry-run:gate-live-goal-ready`;
- exit code: `2`;
- report: `var/reports/live-goal-status-20260513-current.json`;
- generated: `2026-05-13T05:50:14.303Z`;
- status: `blocked`;
- liveReady: `false`;
- completion audit: `achieved=false`.

Latest PnL state:

- `BTC min75` remains an open paper hold with estimated mark
  `+2276.675854` KRW, `+0.455131%`;
- hold exit due remains `2026-05-16T11:00:00.000Z`;
- the mark is still not usable for live promotion because realized paper exit
  evidence is missing.

Latest KRW-H state:

- leading replacement research remains `KRW-H`;
- latest forward observation generated `2026-05-13T05:49:43.783Z`;
- directional signal passes, but `riskPass=false`;
- blockers now include `risk_filter_failed` and `snapshot_skew_uncontrolled`;
- paper observation attempted no entry and open position count remains `0`.

Completion decision remains unchanged: no live process should be started, and
the goal is not complete.

## 2026-05-13 14:54 KST Min75 Review-Only Live Gate

An explicit review-only command was added for the closest live lifecycle path:

- script: `dry-run:review-btc-240m-min75-live-ready`;
- command: runs `npm run dry-run:gate-btc-240m-min75-live-ready`, stores its
  exit status, then runs `npm run dry-run:gate-live-goal-ready`, and exits
  nonzero if either gate fails;
- purpose: verify both the min75 strategy gate and the top-level live-goal gate
  after the scheduled paper exit without starting a live PM2 process.

The live start scripts still exist separately:

- `pm2:start:live-btc-min75`;
- `pm2:restart:live-btc-min75`;
- `pm2:status:live-btc-min75`;
- `pm2:logs:live-btc-min75`.

Documentation in `docs/pm2-dry-run.md` now says to use the review command
first after the reduce-only paper exit and to avoid the baseline
`pm2:start:live-btc` / `pm2:status:live-btc` commands when reviewing min75.

Verification:

- targeted: `npm run build && node --test
  dist/test/live-goal-operational-config.test.js` passed `6/6`;
- full Node suite: `npm test` passed `234/234`;
- the operational-config test asserts that the review command includes both
  gates and does not include `pm2`.

## 2026-05-13 14:59 KST Review-Only Runtime Check

The review-only command was executed again in the current pre-exit state:

- command: `npm run dry-run:review-btc-240m-min75-live-ready`;
- exit code: `1`;
- behavior: the command ran both the min75 strategy gate and the top-level
  live-goal gate, then failed closed because both gates still require
  live-ready evidence;
- generated min75 readiness:
  `var/reports/btc-240m-momentum-min75-readiness-latest-refresh.json`;
- generated at: `2026-05-13T05:59:24.441Z`;
- classification: `paper_candidate`;
- paperReady: `true`;
- liveReady: `false`;
- live blockers: `realizedExitAvailable`, `realizedExitReusePolicy`,
  `noOpenPaperPositionAfterExit`, `positiveRealizedPaperExitPnl`;
- open paper mark: `+2087.169665` KRW, `+0.417247%`;
- hold exit due: `2026-05-16T11:00:00.000Z`.

The top-level live-goal report was also regenerated:

- report: `var/reports/live-goal-status-20260513-current.json`;
- generated at: `2026-05-13T05:59:26.684Z`;
- status: `blocked`;
- liveReady: `false`;
- selected candidate: `replacement_time_series_research`;
- completion audit: `achieved=false`.

PM2 was checked immediately after the review command. No `live-btc-manager` or
`live-btc-min75-manager` process was created. The matching processes were only
dry-run observers. This confirms the review command is safe to use before the
scheduled exit because it refreshes evidence, rechecks the top-level goal, and
fails closed without starting live execution.

## 2026-05-13 15:03 KST Positive Min75 Paper Candidate Reporting

The top-level live-goal report was refined so a positive BTC min75 open paper
mark is surfaced as the closest live lifecycle path instead of being hidden
behind blocked replacement research. This does not promote the strategy to
live; it only makes the blocked status explain the current strategy more
accurately.

Code change:

- `src/cli/audit-live-goal-status.ts` now selects
  `btc_240m_momentum_min75_paper_candidate` when BTC min75 is paper-ready, has
  a positive open paper mark, and no strategy is live-ready.

Regression coverage:

- `test/audit-live-goal-status.test.ts` adds a case where BTC min75 has
  `+2087.169665` KRW / `+0.417247%` open paper PnL while KRW-H remains blocked
  research. The expected selected candidate is the BTC min75 paper candidate,
  and the mark remains unusable for live promotion.

Verification:

- targeted: `npm run build && node --test
  dist/test/audit-live-goal-status.test.js` passed `22/22`;
- full Node suite: `npm test` passed `235/235`;
- latest top-level gate: `npm run dry-run:gate-live-goal-ready` exited `2`,
  generated `var/reports/live-goal-status-20260513-current.json` at
  `2026-05-13T06:03:05.667Z`, and kept `liveReady=false`.

Latest top-level status after the reporting fix:

- selected candidate: `btc_240m_momentum_min75_paper_candidate`;
- recommended action: wait for BTC min75 reduce-only paper exit and promote
  only if realized exit PnL is positive;
- BTC min75 open paper mark: `+1961.717443` KRW, `+0.392168%`;
- missing requirements: `min75LiveReady`, `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, `positiveRealizedPaperExitPnl`.

Completion decision remains unchanged: the goal is not complete and no live
process should be started.

## 2026-05-13 15:05 KST Min75 Live Startup Gate Ordering

The min75 live PM2 start/restart scripts were tightened so they use the
review-only min75 gate instead of running the top-level goal gate before the
min75 refresh. This matters after the scheduled reduce-only exit: the min75
readiness must refresh and execute/reuse the paper exit before the top-level
goal report is regenerated.

Code and docs:

- `package.json` now has `pm2:start:live-btc-min75` and
  `pm2:restart:live-btc-min75` run
  `npm run dry-run:review-btc-240m-min75-live-ready` before any PM2 startup;
- `test/live-goal-operational-config.test.ts` asserts that min75 live scripts
  use the review command before PM2 startup;
- `docs/pm2-dry-run.md` and `docs/runtime-contract.md` document that min75
  live start/restart scripts embed the review command.

Verification:

- targeted: `npm run build && node --test
  dist/test/live-goal-operational-config.test.js` passed `6/6`;
- full Node suite: `npm test` passed `235/235`;
- runtime fail-closed check: `npm run pm2:start:live-btc-min75` exited `1`
  before starting PM2 because min75 is still not live-ready;
- PM2 after the runtime check showed no `live-btc-manager` or
  `live-btc-min75-manager`, only dry-run observers.

Latest evidence from the runtime check:

- top-level report generated: `2026-05-13T06:05:44.424Z`;
- selected candidate: `btc_240m_momentum_min75_paper_candidate`;
- liveReady: `false`;
- BTC min75 open paper mark: `+1887.247412` KRW, `+0.37728%`;
- missing requirements: `min75LiveReady`, `realizedExitAvailable`,
  `noOpenPaperPositionAfterExit`, `positiveRealizedPaperExitPnl`.

## 2026-05-13 15:13 KST Live-Compatible Research Priority Check

Subagent and local evidence were reconciled after the user asked whether the
current goal was still aimed at profitability rather than persisting with
losing paths. The decision is unchanged on live readiness, but the replacement
research priority was corrected.

Current status:

- no strategy is live-ready;
- BTC min75 remains the closest live lifecycle path because it has an open paper
  position with a positive mark, but that mark is not usable for live promotion;
- KRW-PIEVERSE 60m reversal lb168 is now the leading research path because it is
  the active live-compatible promotion candidate under the 35 bps / 500k KRW
  scan, even though its current forward signal is blocked.

Code change:

- `src/cli/audit-live-goal-status.ts` now prefers an active strongest
  live-compatible promotion readiness report over a higher raw-PnL replacement
  readiness report when choosing `strategyDecision.leadingResearch`;
- replacement verification commands are now market-specific, so PIEVERSE points
  to `npm run pm2:restart:dry-run:pieverse-60m-reversal-lb168 && npm run
  dry-run:gate-live-goal-ready` instead of the KRW-H observer.

Regression coverage:

- `test/audit-live-goal-status.test.ts` adds coverage that active
  live-compatible PIEVERSE research outranks a higher raw-PnL KRW-H research
  report, and that the emitted verification command restarts the PIEVERSE
  observer.

Latest top-level report:

- generated: `2026-05-13T06:13:50.415Z`;
- status: `blocked`;
- liveReady: `false`;
- selected candidate: `btc_240m_momentum_min75_paper_candidate`;
- BTC min75 open paper mark: `+1965.031167` KRW, `+0.39283%`;
- BTC min75 exit review time: `2026-05-16T11:00:00.000Z`;
- leading research: `KRW-PIEVERSE`, historical return `+2.258377%`, test return
  `+0.634149%`, test median `+5747.656982` KRW, walk-forward min fold
  `+46971.68758` KRW;
- PIEVERSE current blocker: `reversal_signal_inactive`,
  `risk_filter_failed`, no paper entry, no realized exit;
- rejected evidence remains negative: legacy traded PnL `-46432.23525699999`
  KRW, cross-exchange estimated PnL `-8914.091976` KRW, carry estimated PnL
  `-13199.436772` KRW.

Verification:

- targeted: `npm run build && node --test
  dist/test/audit-live-goal-status.test.js` passed `23/23`;
- full Node suite: `npm test` passed `236/236`;
- `git diff --check` passed;
- `npm run dry-run:gate-live-goal-ready` exited `2`, as expected, because no
  candidate has realized positive paper exit evidence or clean live readiness;
- PM2 shows no live process, only dry-run observers with `exit_code=0`.

## 2026-05-13 15:19 KST PIEVERSE Review Gate Fail-Closed Path

The leading replacement research path now has a dedicated review-only command
so it can be checked without relying on PM2 timing or accidentally treating a
paper-only observer as live preparation.

Code and docs:

- `package.json` adds
  `dry-run:refresh-pieverse-60m-reversal-lb168-readiness`, which runs the
  sequential replacement refresh CLI directly for the exact PIEVERSE candidate;
- `package.json` adds
  `dry-run:gate-pieverse-60m-reversal-lb168-live-ready`, which audits the
  PIEVERSE readiness artifact with `--require-live-ready`;
- `package.json` adds
  `dry-run:review-pieverse-60m-reversal-lb168-live-ready`, which runs the
  direct refresh, the PIEVERSE live gate, and the top-level live-goal gate. It
  does not start a live PM2 target;
- `src/cli/audit-live-goal-status.ts` now emits the PIEVERSE review command as
  the verification command for the PIEVERSE replacement research track;
- `docs/pm2-dry-run.md` and `docs/runtime-contract.md` document that the
  PIEVERSE review path is fail-closed and does not set
  `--live-execution-path-ready`.

An earlier attempt used PM2 restart inside the review command. Runtime testing
showed that this could gate before the PM2 refresh finished, producing a stale
`paperObservationAfterObservation=false` artifact. The review command was
therefore changed to run the sequential refresh CLI directly before gating.

Latest runtime review:

- command: `npm run dry-run:review-pieverse-60m-reversal-lb168-live-ready`;
- exit: `1`, expected fail-closed;
- stale ordering issue: cleared (`paperObservationAfterObservation=true`);
- PIEVERSE classification: `research_candidate`;
- paperReady/liveReady: `false` / `false`;
- current forward blockers: `reversal_signal_inactive`,
  `risk_filter_failed`, `observation_not_execution_viable`;
- live blockers also include `realizedExitAvailable`,
  `realizedExitReusePolicy`, `positiveRealizedPaperExitPnl`, and
  `liveExecutionPathReady`.

Latest top-level report after the review:

- generated: `2026-05-13T06:19:44.253Z`;
- status: `blocked`;
- liveReady: `false`;
- selected candidate: `btc_240m_momentum_min75_paper_candidate`;
- BTC min75 open paper mark: `+2138.491568` KRW, `+0.427507%`;
- leading research: `KRW-PIEVERSE`;
- PIEVERSE verification command:
  `npm run dry-run:review-pieverse-60m-reversal-lb168-live-ready`.

Verification:

- targeted: `npm run build && node --test
  dist/test/live-goal-operational-config.test.js
  dist/test/audit-live-goal-status.test.js` passed `29/29`;
- full Node suite: `npm test` passed `236/236`;
- `git diff --check` passed.

## 2026-05-13 15:26 KST Review Recheck After Observer Pause/Restart

The PIEVERSE review command now pauses the dry-run observer before the direct
sequential refresh, runs both gates, and restarts only the dry-run observer
afterward. This avoids concurrent writes to the same latest artifacts while
still keeping the forward paper-only observation loop alive.

Latest review command:

- command: `npm run dry-run:review-pieverse-60m-reversal-lb168-live-ready`;
- exit: `1`, expected fail-closed;
- direct refresh generated at: `2026-05-13T06:25:50.395Z`;
- PIEVERSE readiness generated at: `2026-05-13T06:25:57.687Z`;
- stale ordering check: `paperObservationAfterObservation=true`;
- paperReady/liveReady: `false` / `false`;
- current PIEVERSE blockers: `signalActive`, `directionalSignalPass`,
  `riskPass`, `executionViabilityWatchCandidate`, no paper signal accepted,
  no open paper position, no hold exit time, no realized exit, and
  `liveExecutionPathReady=false`;
- current forward reasons: `reversal_signal_inactive`, `risk_filter_failed`;
- current forward values: lookback return `+2071.901608` bps, risk value
  `1500.278231` vs threshold `751.7214747340527`, executable round-trip cost
  `31.323414` bps vs expected median edge `129.95314` bps.

Latest top-level goal report after the review:

- generated: `2026-05-13T06:25:56.303Z`;
- status: `blocked`;
- liveReady: `false`;
- selected candidate: `btc_240m_momentum_min75_paper_candidate`;
- current BTC min75 open paper mark: `+1912.371827` KRW, `+0.382303%`;
- BTC min75 hold exit due: `2026-05-16T11:00:00.000Z`;
- rejected evidence unchanged: legacy traded PnL `-46432.23525699999` KRW,
  legacy closed PnL `-20564.104167` KRW, cross-exchange estimated PnL
  `-8914.091976` KRW, carry estimated PnL `-13199.436772` KRW.

PM2/log check:

- no live PM2 process is running;
- `dry-run-pieverse-60m-reversal-lb168-refresh-observer` restarted after the
  review and is in normal wait/restart lifecycle with `exit_code=0`;
- an older PIEVERSE observer error remains in the error log at 15:18 KST
  (`bestAskSize`/`bestBidSize` missing), but the 15:25 KST direct sequential
  refresh completed and emitted the expected blocked readiness summary.

Verification:

- `npm test` passed `236/236`;
- `git diff --check` passed.

## 2026-05-13 15:30 KST Exact5 Cross-Sectional Momentum Check

A remaining measurement gap was whether a rank/rotation strategy across the
currently live-compatible exact5 markets (`KRW-BTC`, `KRW-ETH`, `KRW-SOL`,
`KRW-XRP`, `KRW-PIEVERSE`) could beat the single-market candidates after
realistic cost and 500k KRW notional assumptions. Existing cross-sectional
scans covered broader top50 universes at lower research cost, but not this exact
live-compatible market set.

New scan artifacts:

- `var/reports/live-compatible-exact5-60m-cross-sectional-momentum-scan-fee35-500k-20260513.json`;
- `var/reports/live-compatible-exact5-60m-cross-sectional-momentum-scan-fee50-500k-20260513.json`;
- `var/reports/live-compatible-exact5-240m-cross-sectional-momentum-scan-fee35-500k-20260513.json`;
- `var/reports/live-compatible-exact5-240m-cross-sectional-momentum-scan-fee50-500k-20260513.json`.

Results:

- all four scans produced `promotionCandidateCount=0`;
- 60m fee35 top-by-test candidate: train median `-15671.502851` KRW,
  test median `-9079.69244` KRW, walk-forward min fold
  `-251735.193818` KRW;
- 60m fee50 top-by-test candidate: train median `-16421.502851` KRW,
  test median `-9829.69244` KRW, walk-forward min fold
  `-261485.193818` KRW;
- 240m fee35 had one near candidate with adequate train/test counts and
  positive train/test medians (`+1589.797457` / `+2942.703603` KRW), but
  walk-forward min fold was `-62696.401527` KRW, so it fails promotion;
- 240m fee50 weakens that same near candidate to train/test medians
  `+839.797457` / `+2192.703603` KRW and walk-forward min fold
  `-89696.401527` KRW.

Decision:

- exact5 cross-sectional momentum is not a live or paper promotion candidate;
- do not replace PIEVERSE lb168 or BTC min75 with this path;
- the only useful information is negative: recent 240m rotation performance is
  not enough because one walk-forward fold remains materially negative.

## 2026-05-13 15:37 KST Exact5 Cross-Sectional Gate Integration

The exact5 cross-sectional scans are now part of the top-level live-goal gate
and the PM2 live-goal observer input set, so future readiness checks will not
omit this rejected path.

Code/config changes:

- `package.json` adds the four exact5 cross-sectional scan artifacts to
  `dry-run:gate-live-goal-ready`;
- `ecosystem.config.cjs` adds the same four artifacts to
  `dry-run-live-goal-status-observer`;
- `test/live-goal-operational-config.test.ts` now requires those paths and
  expects `37` replacement scans.

Verification:

- targeted config test: `npm run build && node --test
  dist/test/live-goal-operational-config.test.js` passed `6/6`;
- `npm run dry-run:gate-live-goal-ready` exited `2`, expected fail-closed;
- the top-level gate report generated at `2026-05-13T06:37:14.204Z` includes
  all four exact5 cross-sectional scan files with `promotionCandidateCount=0`;
- the goal remains `blocked`, `liveReady=false`;
- latest BTC min75 open paper mark in the gate report: `+2012.86949` KRW,
  `+0.402393%`, still not usable for live promotion;
- latest PIEVERSE forward blocker remains `reversal_signal_inactive` and
  `risk_filter_failed`; paper attempted `false`, accepted `0`, open position
  `0`.

## 2026-05-13 15:45 KST Replacement Live Execution Path Check

After re-checking the PM2 state, latest readiness artifacts, and a read-only
subagent inspection, the replacement path is still blocked for two separate
reasons:

- profitability evidence is incomplete: PIEVERSE lb168 has no forward paper
  entry yet because the latest observation is blocked by
  `reversal_signal_inactive` and `risk_filter_failed`;
- operational evidence is incomplete: the managed live execution service is
  still BTC 240m specific, not a generic KRW-market replacement runner.

Current PnL/readiness snapshot:

- top-level goal report generated at `2026-05-13T06:41:05.633Z`:
  `liveReady=false`, `status=blocked`;
- BTC min75 readiness generated at `2026-05-13T06:41:18.779Z`: historical
  benchmark return `+170.504416%`, BTC buy-and-hold return `+101.147706%`,
  excess `+69.35671%p`, but live readiness remains false because realized
  reduce-only paper exit checks are still missing;
- BTC min75 is the closest lifecycle path, but its positive open mark is not
  live promotion evidence until the hold exit realizes;
- PIEVERSE lb168 readiness has `paperEntryCreatedOpenPosition=false`,
  `realizedExitAvailable=false`, and `liveExecutionPathReady=false`.

Code/config changes:

- added `src/cli/audit-bithumb-replacement-live-execution-path.ts`, a fail-closed
  static audit for generic Bithumb KRW replacement live wiring;
- added `test/audit-bithumb-replacement-live-execution-path.test.ts`;
- added `dry-run:audit-bithumb-replacement-live-execution-path` and
  `dry-run:gate-pieverse-60m-reversal-lb168-live-path-ready`;
- wired the PIEVERSE live-ready review script to require the new execution-path
  gate before a future live promotion can pass.

New audit artifact:

- `var/reports/pieverse-60m-reversal-lb168-live-execution-path-readiness-latest.json`
  generated at `2026-05-13T06:45:11.079Z`;
- `ready=false`;
- missing checks: requested-market live allowlist, dry-run live market config,
  replacement readiness acceptance in live startup, managed scenario generator,
  generic account sync, market-specific fee check, generic sell preflight,
  PIEVERSE live PM2 target, and gated live start/restart scripts.

Verification:

- replacement live-path targeted test passed `2/2`;
- combined targeted tests passed `10/10`;
- the new PIEVERSE live-path gate exits `1`, expected fail-closed.
- full `npm test` passed `238/238`;
- `git diff --check` passed;
- latest top-level live-goal gate generated at `2026-05-13T06:46:08.189Z`
  and exited `2`, expected fail-closed, with `liveReady=false`,
  `status=blocked`;
- latest gate BTC min75 open mark is `+1908.184425` KRW,
  `+0.381466%`, still monitoring-only until realized exit.

## 2026-05-13 16:00 KST Lead-Lag and Volatility Breakout Gap Check

Two remaining research gaps were checked without changing strategy dimensions
inside the live path:

- live-compatible exact5 cross-market lead-lag at 35/50 bps and 500k KRW;
- broad top50 volatility-contraction breakout at 35 bps and 500k KRW.

New artifacts:

- `var/reports/live-compatible-exact5-cross-market-lead-lag-fee35-500k-20260513.json`;
- `var/reports/live-compatible-exact5-cross-market-lead-lag-fee50-500k-20260513.json`;
- `var/reports/cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json`;
- `var/reports/krw-top50-public-volatility-breakout-scan-fee35-500k-20260513.json`.

Results:

- exact5 lead-lag is not usable evidence: `sourceReady=false` because local
  1m/orderbook data is missing for `KRW-SOL` and `KRW-PIEVERSE`; both fee35 and
  fee50 runs produced `signalTimestampCount=0` and `promotionCandidateCount=0`;
- BTC/ETH/XRP lead-lag at fee35 had `sourceReady=true`,
  `candidateCount=1200`, `promotionCandidateCount=0`; top-by-test was
  `KRW-ETH` lookback 15 / hold 240 with train median `-884.448932` KRW,
  only one test trade, walk-forward total `-4108.40987` KRW, and min fold
  `-12891.543054` KRW;
- top50 volatility breakout at fee35 had `candidateCount=15552`,
  `promotionCandidateCount=0`; top-by-test was `KRW-OSMO`, but train median was
  `-11750` KRW, test median `-2282.367973` KRW, and walk-forward min fold
  `-66173.028811` KRW.

Decision:

- do not promote lead-lag or volatility breakout;
- do not run the fee50 volatility breakout stress because the 35 bps run has no
  near/pass candidate;
- keep BTC min75 as the closest paper lifecycle path pending realized exit;
- keep PIEVERSE lb168 as paper-only research until signal/risk/paper-exit and
  replacement live execution path are all proven.

Gate integration:

- the four new lead-lag/breakout artifacts are now included in
  `dry-run:gate-live-goal-ready` and the PM2 live-goal observer args;
- `test/live-goal-operational-config.test.ts` now expects `41` replacement
  scan inputs.

Verification:

- targeted operational config test passed `6/6`;
- `npm run dry-run:gate-live-goal-ready` exited `2`, expected fail-closed;
- latest top-level live-goal gate generated at `2026-05-13T07:00:29.436Z`
  with `liveReady=false`, `status=blocked`;
- latest gate BTC min75 open mark is `+1464.319749` KRW,
  `+0.292733%`, still monitoring-only until realized exit;
- `git diff --check` passed.

## 2026-05-13 16:15 KST BTC Leader Alt Lead-Lag Check

The remaining lead-lag gap was a strict BTC-leader variant: enter only
`KRW-ETH` or `KRW-XRP` when `KRW-BTC` leads. This was measured as a separate
variable from the earlier multi-market confirmation scan.

New artifacts:

- `var/reports/btc-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json`;
- `var/reports/btc-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json`.

Results:

- fee35 source data was ready, with `candidateCount=400` and
  `promotionCandidateCount=0`; top-by-test was `KRW-ETH`, lookback 5 /
  hold 240, but train median was `-2039.519398` KRW, walk-forward total was
  `-3014.834672` KRW, and min fold was `-11396.477215` KRW;
- fee50 source data was ready, with `candidateCount=400` and
  `promotionCandidateCount=0`; the same top-by-test shape had train median
  `-2789.519398` KRW, walk-forward total `-12764.834672` KRW, and min fold
  `-12896.477215` KRW.

Decision:

- do not promote BTC-leader alt lead-lag;
- keep this failed variant in the live-goal gate so the live-readiness report
  does not omit the strategy idea that was explicitly checked;
- keep live startup blocked because no candidate has positive realized paper
  exit evidence.

Gate integration:

- both BTC-leader artifacts are now included in `dry-run:gate-live-goal-ready`
  and the PM2 live-goal observer args;
- `test/live-goal-operational-config.test.ts` now expects `43` replacement
  scan inputs.

Verification:

- targeted cross-market lead-lag test passed `2/2`;
- targeted operational config test passed `6/6`;
- `npm run dry-run:gate-live-goal-ready` exited `2`, expected fail-closed;
- PM2 live-goal observer regenerated the status report at
  `2026-05-13T07:14:10.559Z` with `inputCount=43`, `liveReady=false`,
  `status=blocked`;
- latest gate BTC min75 open mark is `+1405.696112` KRW,
  `+0.281013%`, still monitoring-only until realized exit at
  `2026-05-16T11:00:00Z`.

## 2026-05-13 16:25 KST Paper Report Scenario Safety Check

The BTC min75 live-readiness path already validated that the paper observation
points at the configured paper report and that the paper observation source
matches the paper report scenario.

Finding:

- do not compare a paper report `scenarioPath` to the later mark/exit
  observation path in `audit-bithumb-time-series-paper-position`; for the BTC
  min75 lifecycle, the paper report scenario is the original entry observation,
  while the position audit is intentionally run against a later mark/exit
  observation;
- the correct fail-closed check remains in
  `refresh-btc-240m-momentum-readiness`: before invoking the position audit, it
  verifies that the paper observation points to the configured paper report and
  that the paper observation source matches the paper report scenario.

Reason:

- entry evidence and exit/mark evidence are different artifacts by design;
- treating the paper report scenario as the current exit observation would block
  the valid reduce-only lifecycle path rather than improving measurement
  integrity.

Verification:

- targeted paper-position / BTC refresh / time-series readiness tests passed
  `21/21`;
- an attempted stricter direct `scenarioPath` comparison was rejected because it
  broke the real PM2 BTC min75 refresh path; the code was left on the established
  refresh-wrapper validation model.

## 2026-05-13 16:36 KST KRW-H Forward and Live Path Check

`KRW-H` remains a historically strong replacement research candidate, but the
latest forward observation did not create a paper entry:

- latest observation generated at `2026-05-13T07:30:46.129Z`;
- directional momentum passed, with lookback return `1979.522184` bps;
- risk failed narrowly: `riskValue=2080.924855` versus the fixed p70
  threshold `2071.713147410359`;
- signal was inactive, paper signal was not attempted, accepted signals were
  `0`, and open position count was `0`.

Decision:

- do not relax the H risk threshold to force an entry; prior threshold
  sensitivity showed the current-pass relaxation worsened validation quality and
  drawdown;
- keep H as paper-only research until a natural risk-passing forward entry and
  realized positive exit exist.

Live execution path check:

- new artifact:
  `var/reports/h-60m-momentum-live-execution-path-readiness-latest.json`;
- generated at `2026-05-13T07:36:32.837Z`;
- `ready=false`;
- missing: H-specific refresh/gate command, live runtime allowlist, dry-run live
  market config, readiness acceptance, managed strategy generator, account sync,
  fee check, sell preflight, live PM2 target, and gated start/restart scripts.

Audit correction:

- `audit-bithumb-replacement-live-execution-path` now accepts explicit
  `--refresh-command-name` and `--gate-command-name` so non-PIEVERSE candidates
  are not incorrectly credited with PIEVERSE-only command wiring.

Verification:

- replacement live-path targeted tests passed `3/3`;
- H live-path audit exits `1`, expected fail-closed.

## 2026-05-13 17:19 KST Fee-Stressed BTC Live Goal Recheck

Objective restated:

- find a profitable KRW-market strategy that can be promoted to live;
- do not rely on open marks, stale research, or reduced activity as proof of
  expectancy;
- keep live startup blocked unless the selected path passes cost, paper exit,
  reconciliation, and operational gates.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Check current profitability, not just strategy labels | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T08:19:26.837Z`, reports BTC min75 open mark `+1468.507151` KRW / `+0.29357%` | Monitoring only |
| Block live if open mark is not realized exit PnL | same report blockers include `realizedExitAvailable`, `realizedExitReusePolicy`, `noOpenPaperPositionAfterExit`, `positiveRealizedPaperExitPnl` | Blocked |
| Do not promote min75 if realistic fee stress fails | `btc-240m-momentum-min75-readiness-latest-refresh.json` now includes `stressBenchmarkSummary` from fee50 benchmark: strategy `+93.728474%`, BTC hold `+102.023263%`, excess `-8.29479pp`; blocker `stressBeatsBtcBuyAndHold` | Blocked |
| Verify a fresh BTC 240m fee50 alternative scan | `var/reports/btc-public-240m-momentum-fee50-refresh-20260513.json`, generated `2026-05-13T08:14:07.642Z`, has `promotionCandidateCount=0` over 5000 public candles through `2026-05-13T07:00:00Z` | No replacement |
| Keep the goal gate aware of the fresh BTC fee50 scan | `dry-run:gate-live-goal-ready` and PM2 `dry-run-live-goal-status-observer` now include 44 replacement scan inputs including `btc-public-240m-momentum-fee50-refresh-20260513.json` | Completed |
| Verify PM2 observers are still paper-only | `pm2 jlist` showed observer env `TRADING_MODE=paper`, `ENABLE_LIVE_EXECUTION=false`; no live manager process was running | Completed |
| Verify tests and formatting | `npm test` passed `241/241`; `git diff --check` passed | Completed |

Decision:

- BTC min75 remains the closest lifecycle candidate, but it is not live-ready:
  it has a positive open mark, no realized reduce-only exit, and fails the fee50
  buy-and-hold stress check.
- A fresh BTC 240m fee50 scan did not find a replacement promotion candidate.
  The top fee50 alternative (`lookback=168`, `hold=72`,
  `range24_below_p70`) had positive test median but only 12 test trades and
  only 3/5 positive median folds, so it cannot replace min75.
- The goal is still not complete. Continue paper observation and strategy
  search; do not start live.

## 2026-05-13 17:43 KST Extended BTC Threshold And Replacement Recheck

Objective restated:

- autonomously keep searching for a profitable live-bound strategy;
- do not keep defending a losing path if better evidence appears;
- require fee-adjusted expectancy, paper lifecycle evidence, and operational
  gates before live.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Recheck whether BTC can be improved instead of blindly keeping min75 | `var/reports/btc-240m-momentum-extended-threshold-fee50-official-rules-20260513.json`, generated `2026-05-13T08:39:51.963Z`, scanned 1036 BTC 240m variants at 50 bps | Completed |
| Require official promotion rules, not an optimistic ad hoc matrix | official-rule matrix found `promotionCandidateCount=0`; exact benchmark `var/reports/btc-240m-momentum-lb48-hold36-min300-p70-benchmark-fee50-20260513.json` confirmed walk-forward median only `3/5` | Blocked |
| Identify useful near-miss without promoting it | `lb48/hold36/min300/rv24_below_p70` has 63 trades, return `145.196727%`, BTC hold `101.770165%`, excess `+43.426562pp`, max drawdown `-12.871122%`, but fails `walkForwardMedianPasses` | Research only |
| Check whether the near-miss can enter now | `var/reports/btc-240m-momentum-lb48-hold36-min300-p70-forward-observation-20260513.json`, generated `2026-05-13T08:41:44.083Z`, has `momentum_signal_inactive` with lookback return `24.830285 bps` vs required `300 bps` | No paper entry |
| Recheck the next replacement track | `var/reports/h-60m-momentum-replacement-readiness-latest.json`, generated `2026-05-13T08:41:29.977Z`, remains `paperReady=false`, `liveReady=false`; forward signal direction passes but risk filter fails by `9.211708 bps` | No paper entry |
| Keep the integrated goal gate current | `dry-run:gate-live-goal-ready -- --replacement-scan var/reports/btc-240m-momentum-extended-threshold-fee50-official-rules-20260513.json` wrote `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T08:43:04.492Z`, with 45 replacement scan inputs and `liveReady=false` | Blocked |

Decision:

- No live-ready strategy exists yet.
- The best new BTC modification is a research near-miss, not a promotion:
  it beats BTC buy-and-hold under 50 bps but fails official walk-forward median
  stability.
- Do not relax the H risk threshold by 9 bps just to force an entry; that would
  change the tested strategy after seeing the latest candle.
- Keep live blocked. Continue paper observation on BTC min75, H momentum, and
  PIEVERSE reversal only under their existing gates.

Follow-up reporting fix:

- `src/cli/audit-live-goal-status.ts` now reads extended scan `nearMiss` and
  `topByExcess` arrays and exposes `topNearMiss` in
  `replacementResearch.scans[]`.
- `test/audit-live-goal-status.test.ts` covers this with the extended BTC
  threshold fixture.
- After rerunning `dry-run:gate-live-goal-ready`, the current report was
  regenerated at `2026-05-13T08:51:41.252Z` and still has
  `liveReady=false`.
- The surfaced top near-miss is `KRW-BTC`, lookback `48`, hold `72`,
  min return `150`, `range24_below_p70`, with 49 trades, return
  `149.205465%`, BTC hold `101.80385%`, excess `+47.401615pp`, but
  worst walk-forward fold `-49417.425963` KRW. This is explicitly research-only
  because it fails promotion stability.
- Targeted verification passed:
  `npm run build && node --test dist/test/audit-live-goal-status.test.js dist/test/live-goal-operational-config.test.js`
  (`30/30`), and `git diff --check` passed.

Near-miss direct recheck:

- Command:
  `npm run dry-run:analyze-bithumb-candidate-benchmark -- --market KRW-BTC --signal-mode momentum --unit-minutes 240 --max-candles 5000 --lookback-bars 48 --hold-bars 72 --min-return-bps 150 --risk-filter range24_below_p70 --risk-threshold 783.9218739484954 --notional-krw 500000 --fee-round-trip-bps 50 --output var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-benchmark-fee50-20260513.json`
- Generated `2026-05-13T08:54:25.586Z`.
- Result: 49 trades, strategy return `149.205465%`, BTC hold
  `102.061543%`, excess `+47.143922pp`, max drawdown `-29.333169%`.
- Promotion still fails: total trades are below 60 and worst walk-forward fold
  is `-49417.425963` KRW.
- Forward observation:
  `var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-forward-observation-20260513.json`,
  generated `2026-05-13T08:54:22.894Z`, has `momentum_signal_inactive`;
  lookback return is `29.930107 bps` vs `150 bps` threshold.

Decision: track this as a BTC research near-miss only. Do not start paper entry
or live, and do not lower the threshold after seeing the current inactive
signal.

PM2 near-miss observer follow-up:

- Added and started
  `dry-run-btc-240m-momentum-lb48-hold72-min150-range-p70-refresh-observer`
  via
  `npm run pm2:restart:dry-run:btc-240m-momentum-lb48-hold72-min150-range-p70`.
- The process runs
  `dist/src/cli/refresh-bithumb-replacement-time-series-readiness.js` with
  `TRADING_MODE=paper` and `ENABLE_LIVE_EXECUTION=false`; it is an observer,
  not a live manager.
- Latest readiness artifact:
  `var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-replacement-readiness-latest.json`,
  generated `2026-05-13T09:03:50.693Z`.
- Classification is `discard_candidate`; `paperReady=false` and
  `liveReady=false`.
- Latest forward observation was generated `2026-05-13T09:03:50.470Z` and
  remains `paperObservationOnly=true`; lookback return is `35.197137 bps`
  against a `150 bps` threshold, so the reason is `momentum_signal_inactive`.
- PM2 logs show no stderr and the same live blockers:
  no promotion candidate, insufficient stable historical evidence, inactive
  signal, no paper entry, no realized exit, and no live execution path.

Decision: the new BTC near-miss is now monitored automatically, but it is not
usable for paper entry or live promotion. The goal remains active and blocked.

Integrated goal-gate follow-up:

- Added
  `var/reports/btc-240m-momentum-lb48-hold72-min150-range-p70-replacement-readiness-latest.json`
  to both `dry-run:gate-live-goal-ready` and the
  `dry-run-live-goal-status-observer` PM2 args.
- Added test coverage so the PM2 observer must use the same
  `--replacement-readiness` list as the gated script.
- Reran `npm run dry-run:gate-live-goal-ready`; it regenerated
  `var/reports/live-goal-status-20260513-current.json` at
  `2026-05-13T09:08:57.055Z` and exited nonzero as expected because
  `liveReady=false`.
- Restarted `dry-run-live-goal-status-observer`; latest report was regenerated
  at `2026-05-13T09:09:16.928Z`.
- PM2 now shows 45 replacement scans, 4 replacement readiness inputs,
  `TRADING_MODE=paper`, and `ENABLE_LIVE_EXECUTION=false`.
- The integrated report includes the BTC near-miss readiness as
  `classification=discard_candidate`, `paperReady=false`, and
  `liveReady=false`.
- BTC min75 remains the closest lifecycle path, with open mark
  `+2423.234945 KRW` / `+0.48443%`, but it is still not usable for live
  promotion before a realized positive reduce-only paper exit and the fee50
  stress blocker is resolved.

Decision: integration is now consistent. The goal remains active, correctly
blocked, and not live-ready.

## 2026-05-13 18:17 KST Fresh RV/Carry Recheck

Objective:

- avoid relying on stale cross-exchange and carry evidence;
- remeasure current executable edge before rejecting or promoting those paths;
- keep live blocked if current edge remains negative.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Refresh spot-perp carry evidence | `var/reports/spot-perp-carry-public-snapshot-20260513-refresh.json`, generated `2026-05-13T09:12:28.680Z` | Completed |
| Refresh cross-exchange BTC/Binance RV evidence | `var/reports/cross-exchange-relative-value-btc-binance-notional-50k-60m-usdtkrw-orderbook-20260513-refresh.json`, generated `2026-05-13T09:12:28.680Z` | Completed |
| Regenerate cross-exchange readiness from fresh RV evidence | `var/reports/cross-exchange-live-readiness-btc-binance-50k-60m-usdtkrw-orderbook-latest.json`, generated `2026-05-13T09:13:09.848Z` | Completed |
| Feed fresh carry into the integrated goal gate | `dry-run:gate-live-goal-ready` and `dry-run-live-goal-status-observer` now use `var/reports/spot-perp-carry-public-snapshot-20260513-refresh.json` | Completed |
| Verify PM2/gate config parity | `test/live-goal-operational-config.test.ts` now checks carry report parity between gate script and PM2 observer | Completed |
| Re-run the integrated gate | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T09:17:05.113Z`, exited nonzero as expected with `liveReady=false` | Blocked |
| Restart and verify PM2 goal observer | PM2 generated `var/reports/live-goal-status-20260513-current.json` at `2026-05-13T09:17:15.451Z`; args include 45 scans, 4 readiness reports, and the refreshed carry file | Completed |

Result:

- Fresh cross-exchange RV remains negative: median net edge
  `-17.502652 bps`, estimated net PnL `-87.513259 KRW`, positive rate `0`.
- Fresh spot-perp carry remains negative: median net carry `-43.924929 bps`,
  estimated net PnL `-14405.237439 KRW`, positive rate `0`, completed
  funding count `0`.
- BTC min75 remains the closest lifecycle path by open mark only:
  `+2289.238062 KRW` / `+0.457642%`, still not usable for live promotion.
- The goal remains active and blocked; no live process should be started.

Verification:

- `npm run build && node --test dist/test/live-goal-operational-config.test.js dist/test/audit-live-goal-status.test.js dist/test/analyze-spot-perp-carry.test.js dist/test/audit-cross-exchange-live-readiness.test.js`
  passed (`50/50`).
- `git diff --check` passed.

## 2026-05-13 18:29 KST Replacement Paper Universe Fix

Objective:

- keep replacement candidate paper evidence honest;
- prevent inactive or blocked observations from stalling readiness refreshes;
- allow non-BTC replacement candidates to be measured in paper while keeping
  live execution BTC-only.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Diagnose stale STABLE readiness | `dry-run-stable-60m-reversal-refresh-observer` stderr showed `observation.orderbook.bestAskSize and bestBidSize are required for paper execution`; STABLE readiness had been stuck at `2026-05-13T08:51:12.930Z` | Completed |
| Do not require top sizes when no paper execution can occur | `src/cli/run-bithumb-time-series-paper-observation.ts` now requires `bestAskSize`/`bestBidSize` only when the observation is an active `watch_candidate` | Completed |
| Allow replacement candidate markets in paper only | `src/runtime/config.ts` now reads `PAPER_ALLOWED_MARKETS` or `DRY_RUN_MARKETS` for non-live `allowedMarkets`; live mode still forces `["KRW-BTC"]` | Completed |
| Ensure the paper observation CLI uses the candidate market | `run-bithumb-time-series-paper-observation` passes `DRY_RUN_MARKETS=<candidate.market>` into the paper runtime config | Completed |
| Cover the behavior with tests | `test/run-bithumb-time-series-paper-observation.test.ts` covers inactive observations without top sizes and active `KRW-STABLE` paper universe acceptance; `test/runtime-config.test.ts` covers configured paper markets and BTC-only live mode | Completed |
| Refresh STABLE observer after the fix | `var/reports/stable-60m-reversal-replacement-readiness-latest.json`, generated `2026-05-13T09:28:29.165Z` | Completed |
| Re-run integrated live goal gate | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T09:29:35.227Z`, remains `liveReady=false` | Blocked |

Result:

- STABLE no longer fails from stale artifact ordering or unsupported paper
  market.
- The current STABLE signal is active and execution-viable at the observation
  layer, but paper entry is rejected by real risk controls:
  `liquidity_guard_triggered`, with 24h notional about `4.159B KRW` versus the
  `30B KRW` minimum.
- STABLE remains a research candidate only. Its historical scan is stable
  (`112` trades, all `5/5` positive folds), but current executable liquidity is
  insufficient for paper entry and live promotion.
- BTC min75 remains the closest lifecycle path by open mark only:
  `+1908.284851 KRW` / `+0.381486%`, still blocked until realized exit and
  fee50 stress requirements clear.

Verification:

- `npm run build && node --test dist/test/runtime-config.test.js dist/test/run-bithumb-time-series-paper-observation.test.js dist/test/order-manager.test.js dist/test/refresh-bithumb-replacement-time-series-readiness.test.js`
  passed (`23/23`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.

## 2026-05-13 18:39 KST Paper Reject Reason Surface

Objective:

- answer whether the current goal is still aligned with profit-seeking live
  startup;
- prevent historically attractive replacement candidates from hiding real paper
  execution rejection reasons;
- keep live blocked when the latest evidence is still unrealized, negative, or
  execution-rejected.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Surface paper signal rejection reasons in replacement observations | `var/reports/stable-60m-reversal-paper-observation-latest.json`, generated `2026-05-13T09:35:24.504Z`, now includes `paper.rejectedSignalReasons` | Completed |
| Carry paper rejection reasons into readiness | `var/reports/stable-60m-reversal-replacement-readiness-latest.json`, generated `2026-05-13T09:35:24.626Z`, now includes `paperExecution.rejectedSignalReasons` | Completed |
| Carry readiness paper execution details into the integrated goal report | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T09:38:58.770Z`, includes STABLE `paperExecution` reject details | Completed |
| Re-run the integrated live goal gate | `npm run dry-run:gate-live-goal-ready` generated `var/reports/live-goal-status-20260513-current.json` at `2026-05-13T09:38:41.553Z` and exited nonzero as expected | Blocked |
| Restart and verify PM2 goal observer | `dry-run-live-goal-status-observer` restarted as PM2 id `60`; latest report generated `2026-05-13T09:38:58.770Z` | Completed |

Result:

- The goal remains correctly defined as finding a profitable live candidate, not
  forcing a losing strategy live.
- No current candidate is live-ready.
- Current BTC min75 paper mark is positive but unrealized:
  `+2460.921568 KRW` / `+0.491964%`, with hold exit due
  `2026-05-16T11:00:00.000Z`; it is monitoring evidence only.
- Legacy traded evidence remains rejected: total traded PnL
  `-46432.23525699999 KRW`, closed trade PnL `-20564.104167 KRW`.
- Fresh cross-exchange RV remains rejected: median net edge
  `-17.502652 bps`, estimated net PnL `-87.513259 KRW`, positive rate `0`.
- Fresh spot-perp carry remains rejected: median net carry `-43.924929 bps`,
  estimated net PnL `-14405.237439 KRW`, positive rate `0`, completed funding
  count `0`.
- STABLE active signal did not become a paper candidate; paper execution was
  rejected by spread and liquidity controls:
  `spread_guard_triggered` at `16.304348 bps` versus an `8 bps` max, and
  `liquidity_guard_triggered` with 24h notional `4.152207952B KRW` versus the
  `30B KRW` minimum.
- Subagent review remained consistent: BTC min75 is the closest lifecycle path,
  PIEVERSE/STABLE are research-only until forward paper entry and realized exit
  evidence exists, and alt/carry/cross-exchange paths should not be promoted on
  stale, negative, or close-to-close-only evidence.

Verification:

- `npm run build && node --test dist/test/run-bithumb-time-series-paper-observation.test.js dist/test/audit-bithumb-replacement-time-series-readiness.test.js dist/test/audit-live-goal-status.test.js`
  passed (`34/34`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `npm run pm2:restart:dry-run:live-goal-status` completed and regenerated the
  integrated status report.
- `git diff --check` passed.

## 2026-05-13 19:08 KST Exact-Five 240m and Web/API Recheck

Objective:

- answer whether enough data has accumulated to change the live-goal strategy;
- close the previously noted exact-five 240m coverage question;
- verify current public market context without promoting a strategy from
  external narrative alone.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Confirm goal state | Active goal remains `서브에이전트랑 현 분석을 토대로 라이브를 진행할 수 있는 것을 goal로 잡고 개선 진행해`; status is still active, not complete | Completed |
| Check exact-five 240m live-compatible scans | Six explicit BTC/ETH/SOL/XRP/PIEVERSE scans are present: momentum 35/50 bps, reversal 35/50 bps, cross-sectional momentum 35/50 bps | Completed |
| Determine whether 240m coverage changes priority | All six exact-five 240m scans have `promotionCandidateCount=0` | Completed |
| Check current public Bithumb market state | Public Bithumb API snapshot at about `2026-05-13 19:04 KST` shows PIEVERSE down `-2.61%`, 24h notional about `6.30B KRW`, top spread about `23.631 bps` | Completed |
| Check external market regime | Web research shows Q1 2026 broad crypto weakness and reduced CEX spot volume, so current environment does not justify loosening execution/risk gates | Completed |

Exact-five 240m scan summary:

| Report | Generated | Fee bps | Candidate count | Promotion candidates | Interpretation |
| --- | --- | ---: | ---: | ---: | --- |
| `var/reports/live-compatible-exact5-240m-momentum-scan-fee35-500k-20260513.json` | `2026-05-13T04:41:31.778Z` | 35 | 1360 | 0 | No live candidate |
| `var/reports/live-compatible-exact5-240m-momentum-scan-fee50-500k-20260513.json` | `2026-05-13T04:41:31.764Z` | 50 | 1360 | 0 | No live candidate |
| `var/reports/live-compatible-exact5-240m-reversal-scan-fee35-500k-20260513.json` | `2026-05-13T04:41:31.764Z` | 35 | 1360 | 0 | No live candidate |
| `var/reports/live-compatible-exact5-240m-reversal-scan-fee50-500k-20260513.json` | `2026-05-13T04:41:31.765Z` | 50 | 1360 | 0 | No live candidate |
| `var/reports/live-compatible-exact5-240m-cross-sectional-momentum-scan-fee35-500k-20260513.json` | `2026-05-13T06:29:43.078Z` | 35 | 48 | 0 | No live candidate |
| `var/reports/live-compatible-exact5-240m-cross-sectional-momentum-scan-fee50-500k-20260513.json` | `2026-05-13T06:30:06.515Z` | 50 | 48 | 0 | No live candidate |

Current result:

- The goal is correctly configured as a live-readiness/profitability search, but
  it is not achieved.
- Current PnL evidence is still not live-promotable:
  - legacy traded PnL: `-46432.23525699999 KRW`;
  - legacy closed-trade PnL: `-20564.104167 KRW`;
  - cross-exchange estimated net PnL: `-87.513259 KRW`;
  - spot-perp carry estimated net PnL: `-14405.237439 KRW`;
  - BTC min75 open mark is positive but not sufficient:
    `+2298.150025 KRW` / `+0.459424%`, with fee50 stress excess versus BTC
    buy-and-hold still `-8.29479%`.
- The best current research candidate remains `KRW-PIEVERSE` 60m reversal
  `lb168`, because its historical train/test/walk-forward evidence is stronger
  than the alternatives; it is not live-ready because the current forward signal
  is inactive, the risk filter fails, there is no paper entry, no realized exit,
  and the live execution path has 10 operational blockers.
- Do not continue losing strategies by inertia: cross-exchange and carry are
  rejected/remeasure-only until their edge and operational blockers improve.

Next decision:

- Continue `KRW-PIEVERSE` as paper-only research, not live.
- Do not promote BTC min75 unless the realized paper exit is positive and the
  fee-stressed benchmark beats BTC buy-and-hold.
- Do not loosen risk/spread/liquidity gates just to create trades; the current
  public Bithumb PIEVERSE spread/liquidity snapshot argues against that.

Verification:

- `npm run dry-run:gate-live-goal-ready` rebuilt the project, regenerated
  `var/reports/live-goal-status-20260513-current.json` at
  `2026-05-13T10:05:11.389Z`, and exited nonzero as expected with
  `liveReady=false`.
- `git diff --check` passed before this audit-note update.

## 2026-05-13 19:09 KST PIEVERSE Live Path Safety Narrowing

Objective:

- reduce operational blockers for the current priority-1 `KRW-PIEVERSE`
  candidate without weakening profitability or live-start gates;
- keep live trading blocked until paper profitability and replacement strategy
  wiring are complete.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Do not promote unprofitable evidence | `npm run dry-run:gate-live-goal-ready` still exits nonzero with `liveReady=false` | Blocked |
| Make sell preflight asset-aware | `src/execution/live-venue.ts` now derives the base currency from `intent.market`; sell checks use `PIEVERSE` for `KRW-PIEVERSE` instead of hardcoded BTC | Completed |
| Make live fee preflight market-aware | `src/cli/run-dry-run-service.ts` now passes a `feeCheckMarket` into `syncLiveManagedStateWithClient`; `client.getOrderChance(feeCheckMarket)` replaces the hardcoded BTC fee check | Completed |
| Make live account sync asset-aware | `src/cli/run-dry-run-service.ts` now derives account sync position state from the requested `managedMarket` while still rejecting non-requested alt balances | Completed |
| Make replacement readiness evidence parseable | `src/runtime/dry-run-service-config.ts` now recognizes `pieverse_60m_reversal_lb168_candidate_v1` readiness evidence, while requiring all replacement checks, positive benchmark return, fee coverage, and matching live market | Completed |
| Reflect reduced live-path blockers | `var/reports/pieverse-60m-reversal-lb168-live-execution-path-readiness-latest.json`, generated `2026-05-13T10:16:17.119Z`, has `liveReadinessAcceptsReplacementEvidence=true`, `liveAccountSyncSupportsRequestedBase=true`, `liveFeeCheckUsesRequestedMarket=true`, and `sellPreflightUsesRequestedBaseBalance=true` | Completed |
| Preserve fail-closed live path | The same live-path report remains `ready=false`; reasons are reduced from 10 to 6 and still include runtime, dry-run-live, managed strategy generation, PM2, and start/restart gate wiring | Blocked |

Result:

- PIEVERSE live-path operational blockers are reduced from 10 to 6.
- The cleared blockers are:
  - `liveReadinessAcceptsReplacementEvidence`;
  - `liveAccountSyncSupportsRequestedBase`;
  - `liveFeeCheckUsesRequestedMarket`;
  - `sellPreflightUsesRequestedBaseBalance`.
- The remaining PIEVERSE live-path blockers are:
  - `liveRuntimeAllowsRequestedMarket`;
  - `dryRunLiveAllowsRequestedMarket`;
  - `managedServiceGeneratesRequestedStrategy`;
  - `livePm2TargetAvailable`;
  - `liveStartScriptRequiresReplacementGate`;
  - `liveRestartScriptRequiresReplacementGate`.
- The integrated live goal remains blocked. Latest
  `var/reports/live-goal-status-20260513-current.json` was generated at
  `2026-05-13T10:17:10.149Z` with `liveReady=false` after restarting the PM2
  observer.
- BTC min75 open mark drifted to `+2207.666274 KRW` / `+0.441335%`; it remains
  paper-only because fee50 stress still fails and the paper exit is not realized.

Verification:

- `npm run build && node --test dist/test/live-bithumb.test.js dist/test/dry-run-service-runtime.test.js dist/test/dry-run-service-config.test.js dist/test/audit-bithumb-replacement-live-execution-path.test.js`
  passed (`61/61`).
- `npm run dry-run:gate-pieverse-60m-reversal-lb168-live-path-ready` exited
  nonzero as expected with `ready=false`, but with four readiness/account/fee
  checks now passing.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `npm run pm2:restart:dry-run:live-goal-status` restarted the observer as PM2
  id `68`; it regenerated the integrated report and returned to waiting restart
  state.
- `git diff --check` passed before this audit-note update.

## 2026-05-13 18:48 KST BTC Paper Source Binding

Objective:

- close the remaining live-gate artifact risk where a BTC paper-position audit
  could be driven from a raw paper report path without carrying the entry paper
  observation path;
- preserve the correct lifecycle distinction between the entry observation and a
  later mark/exit observation;
- keep the goal blocked until realized and cost-stressed evidence exists.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| BTC refresh wrapper passes paper observation into the position audit | `src/cli/refresh-btc-240m-momentum-readiness.ts` now calls `audit-bithumb-time-series-paper-position` with `--input-paper-observation` | Completed |
| Paper position audit validates entry report/source binding | `src/cli/audit-bithumb-time-series-paper-position.ts` validates `paperObservation.paper.reportPath` and requires `paperReport.scenarioPath` to match `paperObservation.sourceObservationPath` | Completed |
| Paper position audit still allows later mark/exit observations | `test/audit-bithumb-time-series-paper-position.test.ts` covers a paper observation sourced from an entry observation while the audit uses a later observation for mark/exit | Completed |
| Reject mismatched entry report/source pairs | `test/audit-bithumb-time-series-paper-position.test.ts` now rejects when `paperObservation.sourceObservationPath` does not match `paperReport.scenarioPath` | Completed |
| Re-run BTC min75 live gate on real artifacts | `npm run dry-run:gate-btc-240m-min75-live-ready` generated `var/reports/btc-240m-momentum-min75-readiness-latest-refresh.json` at `2026-05-13T09:46:45.342Z` and exited nonzero as expected | Blocked |
| Re-run integrated live goal gate | `npm run dry-run:gate-live-goal-ready` generated `var/reports/live-goal-status-20260513-current.json` at `2026-05-13T09:46:57.416Z` and exited nonzero as expected | Blocked |
| Restart observers on the new code | `dry-run-btc-240m-momentum-min75-observer` restarted as PM2 id `61`; `dry-run-live-goal-status-observer` restarted as PM2 id `63` | Completed |

Result:

- BTC min75 remains `paper_candidate`, not live-ready.
- Latest integrated status remains `blocked`, generated
  `2026-05-13T09:48:01.355Z`.
- Current BTC min75 open mark is `+2456.734166 KRW` / `+0.491127%`, still
  monitoring-only and not live promotion evidence.
- The live blockers remain:
  `min75LiveReady`, `realizedExitAvailable`, `noOpenPaperPositionAfterExit`,
  `positiveRealizedPaperExitPnl`, `stressBeatsBtcBuyAndHold`, and
  `realizedExitReusePolicy`.
- The BTC position audit now records
  `sourcePaperObservationPath=var/reports/btc-240m-momentum-min75-paper-observation-20260512.json`,
  while continuing to use the latest observation for mark/exit pricing.

Verification:

- `npm run build && node --test dist/test/refresh-btc-240m-momentum-readiness.test.js dist/test/audit-bithumb-time-series-paper-position.test.js dist/test/audit-bithumb-time-series-readiness.test.js`
  passed (`21/21`).
- `npm run dry-run:gate-btc-240m-min75-live-ready` exited nonzero as expected
  with `liveReady=false`.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `git diff --check` passed.

## 2026-05-13 19:53 KST PIEVERSE Managed Benchmark Integrity

Objective:

- prevent the PIEVERSE managed paper path from becoming unpromotable because
  future traded sessions lack BTC buy-and-hold benchmark evidence;
- prevent PM2 restarts from overwriting `scenarioPath`/`observationPath`
  artifacts when cycle numbers restart;
- keep live blocked while improving measurement integrity only.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Attach BTC benchmark snapshots to PIEVERSE managed scenarios | `src/cli/run-dry-run-service.ts` fetches a Bithumb `KRW-BTC` public snapshot and passes it as `benchmarkSnapshots` to `buildPieverse60mReversalManagedScenario` | Completed |
| Keep scenario validation honest | `buildManagedTimeSeriesScenario` increments `summary.snapshotCount` for attached benchmark snapshots | Completed |
| Do not let old untraded no-benchmark sessions permanently block future traded evidence | `src/cli/summarize-dry-run-returns.ts` adds `promotionBtcBuyHoldBenchmark` over traded rows and uses that for live benchmark checks | Completed |
| Prevent artifact overwrite after PM2 restart | managed observation/scenario filenames now include `artifactTimestampSlug(startedAt)` | Completed |
| Cover behavior with tests | `test/dry-run-service-runtime.test.ts` covers attached BTC snapshot; `test/summarize-dry-run-returns.test.ts` covers untraded benchmark gaps not blocking promotion evidence | Completed |

Result:

- `npm run pm2:restart:dry-run:pieverse-60m-reversal-lb168-managed-paper`
  produced a fresh session with `processedEvents=2`, confirming PIEVERSE and
  BTC snapshots are both present.
- Latest generated scenario path uses a unique timestamped artifact:
  `pieverse-60m-reversal-lb168-scenario-cycle-1-20260513T105236068Z.json`.
- Latest managed return summary:
  `sessionCount=7`, `tradedSessionCount=0`, `allSessions.totalPnlKrw=0`,
  `allSessions.avgReturnPct=0`, `closedTradesOnly.sessionCount=0`.
- Latest integrated goal report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T10:52:57.582Z`, remains `status=blocked`,
  `liveReady=false`.

Interpretation:

- This change does not create a profitable strategy. It removes two evidence
  integrity hazards so that if PIEVERSE later creates real paper trades, the
  result can be compared against BTC buy-and-hold and traced to immutable
  scenario artifacts.
- PIEVERSE remains a paper-only research path because there are still zero
  traded sessions, zero closed trades, and zero realized positive PnL.

Verification:

- `npm run build && node --test dist/test/summarize-dry-run-returns.test.js dist/test/dry-run-service-runtime.test.js dist/test/audit-live-goal-status.test.js`
  passed (`65/65`).
- `npm run build && node --test dist/test/dry-run-service-runtime.test.js dist/test/summarize-dry-run-returns.test.js`
  passed (`40/40`) after the timestamped artifact change.
- `npm run dry-run:returns:pieverse-60m-reversal-lb168-managed-paper && npm run dry-run:gate-live-goal-ready`
  exited nonzero as expected with `liveReady=false`.
- `git diff --check` passed.

## 2026-05-13 18:53 KST Stress-Failed BTC Deprioritization

Objective:

- avoid continuing to present BTC min75 as the leading live-bound path when it
  has a positive open mark but fails the fee50 stress benchmark;
- make the strategy decision reflect the user's instruction not to cling to a
  path that cannot currently satisfy live profitability gates;
- keep BTC min75 under paper observation while moving replacement research to
  priority 1.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Do not prefer BTC min75 only because the open mark is positive | `src/cli/audit-live-goal-status.ts` now requires `min75StressBeatsBtcBuyAndHold` before selecting the min75 paper candidate | Completed |
| Surface the failed stress state in the integrated report | `strategyDecision.closestPaperPath` now includes `stressBeatsBtcBuyAndHold` and `stressExcessReturnVsBuyHoldPct` | Completed |
| Reorder the action plan when BTC stress fails | `nextActionPlan` is sorted by priority; replacement research becomes priority 1 when BTC min75 stress fails | Completed |
| Cover the behavior with a targeted test | `test/audit-live-goal-status.test.ts` added `live goal status does not prefer a positive min75 open mark when fee stress fails` | Completed |
| Re-run the integrated gate on real artifacts | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T09:53:01.270Z`, selected `replacement_time_series_research` and exited nonzero as expected | Blocked |
| Restart PM2 goal observer | `dry-run-live-goal-status-observer` restarted as PM2 id `64`; latest report generated `2026-05-13T09:53:11.414Z` | Completed |

Result:

- The goal remains active and blocked; no live process should be started.
- The selected current research path is now `KRW-PIEVERSE` replacement
  time-series research, not BTC min75.
- BTC min75 still has a positive open mark, `+2368.798711 KRW` /
  `+0.473547%`, but the report now marks it
  `paper_only_do_not_promote_until_stress_edge_improves`.
- BTC min75 fee50 stress remains failed:
  `stressExcessReturnVsBuyHoldPct=-8.29479`.
- Next action priority is now:
  1. continue `KRW-PIEVERSE` replacement observation until signal, execution,
     paper entry, realized exit, and positive paper PnL all pass;
  2. keep BTC min75 paper-only unless stress edge improves.

Verification:

- `npm run build && node --test dist/test/audit-live-goal-status.test.js`
  passed (`25/25`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `npm run pm2:restart:dry-run:live-goal-status` completed and regenerated the
  integrated status report.
- `git diff --check` passed.

## 2026-05-13 18:59 KST PIEVERSE Live Path Blockers

Objective:

- verify the new priority-1 `KRW-PIEVERSE` research path with its dedicated
  review command;
- surface the operational live-path blockers inside the integrated goal report,
  not just as a separate artifact;
- keep live startup blocked until both strategy evidence and live execution
  wiring are ready.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Run the dedicated PIEVERSE review command | `npm run dry-run:review-pieverse-60m-reversal-lb168-live-ready` refreshed observation/readiness, ran live path gate, ran integrated goal gate, restarted the observer, and exited nonzero as expected | Blocked |
| Capture PIEVERSE live-path blockers | `var/reports/pieverse-60m-reversal-lb168-live-execution-path-readiness-latest.json`, generated `2026-05-13T09:54:41.766Z`, has `ready=false` with 10 operational blockers | Completed |
| Feed live-path evidence into the integrated goal gate | `package.json` and `ecosystem.config.cjs` now pass `--replacement-live-path-readiness var/reports/pieverse-60m-reversal-lb168-live-execution-path-readiness-latest.json` into `audit-live-goal-status` | Completed |
| Surface live-path evidence in the integrated report | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T09:59:10.626Z`, includes `strategyDecision.leadingResearch.liveExecutionPath` and `replacementResearch.livePathReports` | Completed |
| Keep PM2 and gated script parity | `test/live-goal-operational-config.test.ts` checks replacement live-path readiness parity between the gate script and PM2 observer | Completed |

Result:

- The selected research path remains `KRW-PIEVERSE`, but it is not live-ready.
- Current PIEVERSE strategy blockers are still at the forward/paper layer:
  `reversal_signal_inactive`, `risk_filter_failed`, and no paper entry.
- Current PIEVERSE live-path blockers are now explicit:
  `liveRuntimeAllowsRequestedMarket`, `dryRunLiveAllowsRequestedMarket`,
  `liveReadinessAcceptsReplacementEvidence`,
  `managedServiceGeneratesRequestedStrategy`,
  `liveAccountSyncSupportsRequestedBase`, `liveFeeCheckUsesRequestedMarket`,
  `sellPreflightUsesRequestedBaseBalance`, `livePm2TargetAvailable`,
  `liveStartScriptRequiresReplacementGate`, and
  `liveRestartScriptRequiresReplacementGate`.
- BTC min75 remains paper-only despite a positive open mark:
  `+2412.683285 KRW` / `+0.48232%`, because fee50 stress still fails with
  `stressExcessReturnVsBuyHoldPct=-8.29479`.
- The goal remains active and blocked; no live process should be started.

Verification:

- `npm run build && node --test dist/test/audit-live-goal-status.test.js dist/test/live-goal-operational-config.test.js dist/test/audit-bithumb-replacement-live-execution-path.test.js`
  passed (`35/35`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `npm run pm2:restart:dry-run:live-goal-status` completed and regenerated the
  integrated status report.
- `git diff --check` passed.

## 2026-05-13 19:24 KST PIEVERSE Managed Paper Path Wiring

Objective:

- reduce only the operational blocker that prevents `KRW-PIEVERSE` from being
  measured by the managed paper service;
- keep live market allowance, live PM2 target, and live start/restart scripts
  blocked until paper entry, realized exit, and positive realized PnL exist;
- verify the current market state with the public Bithumb observation path.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Do not promote a losing or unproven strategy to live | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T10:26:35.427Z`, remains `liveReady=false` | Completed |
| Add PIEVERSE managed paper generation only | `src/cli/run-dry-run-service.ts` now supports `pieverse_60m_reversal_lb168_candidate_v1` with managed observation, scenario, carry-forward state, and reduce-only hold exit | Completed |
| Keep live blocked | `var/reports/pieverse-60m-reversal-lb168-live-execution-path-readiness-latest.json`, generated `2026-05-13T10:24:26.176Z`, remains `ready=false` | Completed |
| Reduce the specific operational blocker | `managedServiceGeneratesRequestedStrategy=true`; live-path blockers reduced from 6 to 5 | Completed |
| Prove the new managed path can run without placing live orders | `DRY_RUN_EXECUTION_MODE=paper DRY_RUN_ENTRY_PROFILE=pieverse_60m_reversal_lb168_candidate_v1 DRY_RUN_MARKETS=KRW-PIEVERSE DRY_RUN_LOG_DIR=var/log/dry-run-service-pieverse-managed-smoke node dist/src/cli/run-dry-run-service.js --once` completed | Completed |

Result:

- No candidate is live-ready.
- PIEVERSE remains the leading research path because historical evidence is the
  strongest local candidate, but the latest live observation, generated
  `2026-05-13T10:25:07.682Z`, is not an entry: `reversal_signal_inactive`,
  `risk_filter_failed`.
- The managed smoke cycle generated:
  - observation:
    `var/log/dry-run-service-pieverse-managed-smoke/pieverse-60m-reversal-lb168-observation-cycle-1.json`;
  - scenario:
    `var/log/dry-run-service-pieverse-managed-smoke/pieverse-60m-reversal-lb168-scenario-cycle-1.json`;
  - session report:
    `var/paper-sessions/date=2026-05-13/session=paper-20260513-102438Z-f5cd0752/report.json`.
- The smoke cycle ended `signalAction=hold`, `reconciliationOk=true`,
  `returnPct=0`, `openPositionCount=0`; this is expected because the current
  reversal/risk signal is not active.
- Live-path blockers now are:
  `liveRuntimeAllowsRequestedMarket`, `dryRunLiveAllowsRequestedMarket`,
  `livePm2TargetAvailable`, `liveStartScriptRequiresReplacementGate`, and
  `liveRestartScriptRequiresReplacementGate`.
- BTC min75 remains paper-only: latest integrated open mark is
  `+1690.439489 KRW` / `+0.337936%`, still un-realized, with hold exit due
  `2026-05-16T11:00:00.000Z` and fee50 stress excess
  `-8.29479 pp`.

Verification:

- `npm run build && node --test dist/test/live-bithumb.test.js dist/test/dry-run-service-runtime.test.js dist/test/dry-run-service-config.test.js dist/test/audit-bithumb-replacement-live-execution-path.test.js`
  passed (`64/64`).
- `npm run dry-run:gate-pieverse-60m-reversal-lb168-live-path-ready` exited
  nonzero as expected with 5 remaining live-path blockers.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `npm run pm2:restart:dry-run:live-goal-status` restarted the goal observer and
  regenerated the integrated status report at `2026-05-13T10:26:35.427Z`.

## 2026-05-13 19:30 KST PIEVERSE Managed Paper PM2 Collection

Objective:

- make the new PIEVERSE managed paper path persistent, not just a one-off smoke
  run;
- keep it strictly paper-only so the live decision still depends on realized
  profitable evidence and explicit live wiring;
- verify one PM2-managed cycle writes cycle and session artifacts.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Add persistent paper-only PIEVERSE manager | `ecosystem.config.cjs` now has `dry-run-pieverse-60m-reversal-lb168-managed-paper` using `dist/src/cli/run-dry-run-service.js` | Completed |
| Keep live disabled | PM2 env sets `TRADING_MODE=paper`, `ENABLE_LIVE_EXECUTION=false`, `DRY_RUN_EXECUTION_MODE=paper`, `DRY_RUN_MARKETS=KRW-PIEVERSE` | Completed |
| Add explicit lifecycle commands | `package.json` has `pm2:start/restart/stop/status/logs:dry-run:pieverse-60m-reversal-lb168-managed-paper` | Completed |
| Test paper-only operational wiring | `test/live-goal-operational-config.test.ts` asserts the managed paper app and scripts do not enable live execution | Completed |
| Start the PM2 collector | `npm run pm2:restart:dry-run:pieverse-60m-reversal-lb168-managed-paper` started PM2 id `71` | Completed |
| Verify first managed cycle | `var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper/cycles.ndjson` contains cycle 1 with `signalAction=hold`, `reconciliationOk=true`, `openPositionCount=0`, `returnPct=0` | Completed |
| Confirm live remains blocked | `var/reports/live-goal-status-20260513-current.json`, generated `2026-05-13T10:30:05.729Z`, remains `liveReady=false` | Completed |

Result:

- PIEVERSE is now collecting managed paper evidence every 300 seconds.
- The first PM2-managed cycle did not enter because the live observation still
  failed reversal and risk gates:
  `reversal_signal_inactive`, `risk_filter_failed`.
- The latest managed cycle used current orderbook data and still found depth
  sufficient for 500k KRW, with executable cost below expected historical edge,
  but signal/risk blocked execution.
- Live path remains blocked with:
  `liveRuntimeAllowsRequestedMarket`, `dryRunLiveAllowsRequestedMarket`,
  `livePm2TargetAvailable`, `liveStartScriptRequiresReplacementGate`, and
  `liveRestartScriptRequiresReplacementGate`.
- BTC min75 open mark declined to `+1204.700787 KRW` / `+0.240832%`; it remains
  paper-only and un-realized.

Verification:

- `npm run build && node --test dist/test/live-goal-operational-config.test.js dist/test/dry-run-service-runtime.test.js dist/test/audit-bithumb-replacement-live-execution-path.test.js dist/test/dry-run-service-config.test.js`
  passed (`55/55`).
- `npm run dry-run:gate-pieverse-60m-reversal-lb168-live-path-ready` exited
  nonzero as expected with `ready=false`.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `npm run pm2:restart:dry-run:live-goal-status` regenerated the integrated
  report at `2026-05-13T10:30:05.729Z`.

## 2026-05-13 19:32 KST PIEVERSE Managed Return Summary

Objective:

- make current managed PIEVERSE paper profitability answerable from a stable
  report, not ad hoc log inspection;
- keep the summary connected to the exact PM2 cycle log that is collecting
  evidence.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Infer PIEVERSE managed cycles from the report root | `src/cli/summarize-dry-run-returns.ts` maps `paper-sessions-pieverse-60m-reversal-lb168-managed` to `var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper/cycles.ndjson` | Completed |
| Add a repeatable profitability command | `package.json` has `dry-run:returns:pieverse-60m-reversal-lb168-managed-paper` writing `var/reports/pieverse-60m-reversal-lb168-managed-paper-return-summary-latest.json` | Completed |
| Cover the mapping and command wiring | `test/summarize-dry-run-returns.test.ts` and `test/live-goal-operational-config.test.ts` cover the new summary path | Completed |
| Generate the current return report | `npm run dry-run:returns:pieverse-60m-reversal-lb168-managed-paper` wrote `var/reports/pieverse-60m-reversal-lb168-managed-paper-return-summary-latest.json` | Completed |

Result:

- Current PIEVERSE managed paper return report:
  `sessionCount=1`, `tradedSessionCount=0`, `allSessions.totalPnlKrw=0`,
  `allSessions.avgReturnPct=0`, `closedTradesOnly.sessionCount=0`.
- This is not profitable evidence. It is a flat no-entry observation caused by
  signal/risk blocking.
- The summary classifies the managed paper path as `discard_candidate` for live
  purposes because there are zero closed trades and no BTC buy-and-hold
  benchmark evidence for the managed sample.

Verification:

- `npm run build && node --test dist/test/summarize-dry-run-returns.test.js dist/test/live-goal-operational-config.test.js`
  passed (`22/22`).

## 2026-05-13 19:37 KST Managed Return in Goal Gate

Objective:

- include the current PIEVERSE managed paper return summary in the integrated
  live-goal report;
- make the top-level answer to "current return" use the same artifact as the
  strategy gate;
- keep the managed return summary monitoring-only and not a live approval
  signal.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Add managed return input to the live-goal audit | `src/cli/audit-live-goal-status.ts` accepts `--replacement-managed-return-summary` | Completed |
| Surface managed paper returns in the strategy decision | `strategyDecision.leadingResearch.managedPaperReturn` now includes session count, traded count, PnL, return, cycle summary, latest session, and live reasons | Completed |
| Surface managed paper returns in profitability snapshot | `profitabilitySnapshot.replacementManagedPaper` now reports current managed PIEVERSE paper PnL and marks it unusable for live promotion | Completed |
| Feed the artifact through scripts and PM2 | `package.json` and `ecosystem.config.cjs` pass `var/reports/pieverse-60m-reversal-lb168-managed-paper-return-summary-latest.json` into the live-goal audit | Completed |
| Cover the new input and PM2/script parity | `test/audit-live-goal-status.test.ts` and `test/live-goal-operational-config.test.ts` cover the managed return summary path | Completed |

Result:

- Latest integrated goal report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T10:37:51.467Z`, remains `liveReady=false`.
- Current managed PIEVERSE paper return in the integrated report:
  `sessionCount=2`, `tradedSessionCount=0`, `totalPnlKrw=0`,
  `avgReturnPct=0`, `closedTradeCount=0`, `cycleCompleted=2`,
  `cycleFailed=0`.
- The report explicitly keeps this as monitoring-only:
  `usableForLivePromotion=false`.
- This confirms the strategy is not losing money in managed paper yet, but only
  because it has not entered. It is also not profitable evidence.

Verification:

- `npm run build` passed.
- `node --test dist/test/audit-live-goal-status.test.js dist/test/live-goal-operational-config.test.js dist/test/summarize-dry-run-returns.test.js`
  passed (`47/47`).
- `npm run dry-run:returns:pieverse-60m-reversal-lb168-managed-paper` refreshed
  the return summary.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false` and managed paper return attached.
- `npm run pm2:restart:dry-run:live-goal-status` regenerated the PM2-observed
  integrated report with managed paper return attached.

## 2026-05-13 19:43 KST Managed Return PM2 Observer

Objective:

- keep the PIEVERSE managed paper return summary fresh without manual refreshes;
- make the integrated live-goal answer use continuously updated managed paper
  profitability evidence;
- keep the result paper-only and fail-closed while profitability evidence is
  absent.

Prompt-to-artifact checklist:

| Requirement | Evidence | Status |
| --- | --- | --- |
| Add a PM2 observer for managed return summaries | `ecosystem.config.cjs` has `dry-run-pieverse-60m-reversal-lb168-managed-return-observer` running `dist/src/cli/summarize-dry-run-returns.js` | Completed |
| Wire lifecycle commands | `package.json` has `pm2:start/restart/stop/status/logs:dry-run:pieverse-60m-reversal-lb168-managed-return` | Completed |
| Verify operational config | `test/live-goal-operational-config.test.ts` asserts observer args, env, and lifecycle commands | Completed |
| Start the observer | `npm run pm2:restart:dry-run:pieverse-60m-reversal-lb168-managed-return` launched PM2 id `74` | Completed |
| Refresh integrated live-goal observer | `npm run pm2:restart:dry-run:live-goal-status` launched PM2 id `75` | Completed |

Result:

- Latest managed return summary:
  `sessionCount=3`, `tradedSessionCount=0`, `allSessions.totalPnlKrw=0`,
  `allSessions.avgReturnPct=0`, `closedTradesOnly.sessionCount=0`,
  `cycleSummary.completed=3`, `cycleSummary.failed=0`.
- Latest integrated goal report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T10:42:16.316Z`, remains `status=blocked`,
  `liveReady=false`.
- Current PIEVERSE managed paper interpretation:
  `usableForLivePromotion=false`; no entry, no closed trade, no realized
  positive PnL.
- Current Bithumb public snapshot for `KRW-PIEVERSE` at
  `2026-05-13T10:43:17.981Z` showed trade price `1280`, 24h notional about
  `6.298B KRW`, best ask/bid `1279/1276`, and spread about `0.235%`.
  Liquidity is not the immediate blocker; the managed observation blocks on
  `reversal_signal_inactive` and `risk_filter_failed`.

Verification:

- `npm run build && node --test dist/test/live-goal-operational-config.test.js dist/test/audit-live-goal-status.test.js dist/test/summarize-dry-run-returns.test.js`
  passed (`47/47`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected with
  `liveReady=false`.
- `git diff --check` passed.

## 2026-05-13 20:07 KST KRW-H Managed Paper Collection

Objective:

- stop relying only on the inactive PIEVERSE path;
- add managed paper measurement for the stronger local KRW-H 60m momentum research candidate;
- keep live blocked until there is realized positive paper PnL and clean operational evidence.

Result:

- Added `krw_h_60m_momentum_top_candidate_v1` as a managed paper entry profile.
- Added KRW-H managed paper and managed return PM2 processes:
  `dry-run-krw-h-60m-momentum-managed-paper` and
  `dry-run-krw-h-60m-momentum-managed-return-observer`.
- Added KRW-H managed return summary into the live-goal gate and PM2 observer.
- Fixed market validation to accept one-character Bithumb base symbols such as
  `KRW-H`; this was blocking real Bithumb markets from paper-session validation.
- Current KRW-H managed evidence is not profitable yet:
  `sessionCount=2`, `tradedSessionCount=0`, `totalPnlKrw=0`,
  `closedTradePnlKrw=0`, `classification=discard_candidate`.
- Current KRW-H blocker is signal/risk, not liquidity:
  `lookbackReturnBps=2346.938776`, `riskValue=2080.924855`,
  `riskThreshold=2071.713147410359`, `riskExcessBps=9.211708`,
  `riskPass=false`, suppressions `signal_inactive` and
  `observation_not_execution_viable`.
- Latest integrated goal report remains fail-closed:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:07:00.587Z`, `status=blocked`, `liveReady=false`.

Verification:

- `npm run build` passed.
- `node --test dist/test/validation.test.js dist/test/dry-run-service-runtime.test.js dist/test/live-goal-operational-config.test.js dist/test/summarize-dry-run-returns.test.js dist/test/audit-live-goal-status.test.js dist/test/dry-run-service-config.test.js`
  passed (`100/100`).
- One manual KRW-H managed paper cycle completed after validation fix.
- `npm run dry-run:returns:krw-h-60m-momentum-managed-paper` refreshed
  `var/reports/krw-h-60m-momentum-managed-paper-return-summary-latest.json`.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected.
- `npm run pm2:restart:dry-run:krw-h-60m-momentum-managed-paper`,
  `npm run pm2:restart:dry-run:krw-h-60m-momentum-managed-return`, and
  `npm run pm2:restart:dry-run:live-goal-status` completed.
- `git diff --check` passed.

## 2026-05-13 20:11 KST Live-Goal Focus Correction

Objective:

- make the live-goal report follow the current strategy decision instead of
  continuing to recommend an inactive managed-paper path;
- keep live blocked while moving the observation focus to the stronger KRW-H
  research candidate.

Result:

- `audit-live-goal-status` now stops giving first-priority focus to a
  live-compatible promotion candidate when that same market's managed paper
  return summary is already classified as `discard_candidate`.
- This preserves live-compatible preference when there is no managed-paper
  discard evidence, but falls back to the stronger fresh readiness candidate
  when managed evidence says the live-compatible path is not currently useful.
- Latest integrated goal report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:10:58.133Z`, remains `status=blocked`,
  `liveReady=false`.
- Current first action is now KRW-H:
  `replacement_time_series`, `market=KRW-H`,
  `action=continue_observation_until_forward_paper_entry_and_realized_exit`.
- Current KRW-H live blockers remain:
  `signalActive=false`, `riskPass=false`,
  `executionViabilityWatchCandidate=false`, no paper entry, no realized exit,
  and no positive paper PnL.

Verification:

- `npm run build && node --test dist/test/audit-live-goal-status.test.js dist/test/live-goal-operational-config.test.js dist/test/dry-run-service-runtime.test.js dist/test/summarize-dry-run-returns.test.js dist/test/validation.test.js`
  passed (`79/79`).
- `npm run dry-run:returns:krw-h-60m-momentum-managed-paper` refreshed the
  KRW-H managed return summary.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected.
- `npm run pm2:restart:dry-run:live-goal-status` regenerated the PM2-observed
  integrated report using the corrected focus logic.
- `git diff --check` passed.

## 2026-05-13 20:18 KST KRW-H Live Path Fail-Closed Audit

Objective:

- attach KRW-H live execution-path evidence to the integrated live-goal report;
- keep KRW-H paper-only until both profitability and operational live gates are
  proven;
- make the next verification command cover the full KRW-H gate chain.

Result:

- Added KRW-H replacement live-path audit wiring for
  `krw_h_60m_momentum_top_candidate_v1`.
- Latest KRW-H live-path report:
  `var/reports/h-60m-momentum-live-execution-path-readiness-latest.json`,
  generated `2026-05-13T11:17:15.926Z`, `ready=false`.
- Passing KRW-H live-path checks include replacement refresh command,
  replacement readiness command, managed service strategy generation, account
  base-balance sync support, fee check market selection, and sell preflight
  base-balance selection.
- Missing KRW-H live-path checks are:
  `liveRuntimeAllowsRequestedMarket`, `dryRunLiveAllowsRequestedMarket`,
  `livePm2TargetAvailable`, `liveStartScriptRequiresReplacementGate`, and
  `liveRestartScriptRequiresReplacementGate`.
- Latest integrated goal report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:18:35.116Z`, remains `status=blocked`,
  `liveReady=false`.
- Current KRW-H managed paper evidence is still not profitable:
  `sessionCount=4`, `tradedSessionCount=0`, `totalPnlKrw=0`,
  `closedTradePnlKrw=0`, `classification=discard_candidate`.
- The KRW-H next-action verification command now runs refresh, live-path gate,
  candidate live-readiness gate, and integrated live-goal gate in sequence.

Verification:

- `npm run build && node --test dist/test/audit-live-goal-status.test.js dist/test/audit-bithumb-replacement-live-execution-path.test.js dist/test/live-goal-operational-config.test.js dist/test/dry-run-service-runtime.test.js dist/test/summarize-dry-run-returns.test.js dist/test/validation.test.js`
  passed (`82/82`).
- `npm run dry-run:returns:krw-h-60m-momentum-managed-paper` refreshed the
  KRW-H managed paper return summary.
- `npm run dry-run:gate-h-60m-momentum-live-path-ready` exited nonzero as
  expected while writing the fail-closed KRW-H live-path report.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected while
  writing the integrated blocked report.

## 2026-05-13 20:25 KST STABLE Candidate Cost and Live-Path Audit

Objective:

- test whether the fresh `KRW-STABLE` reversal signal can replace inactive
  KRW-H/PIEVERSE evidence;
- wire STABLE into the same fail-closed live-path audit chain used by other
  replacement candidates.

Result:

- Refreshed STABLE readiness through the PM2 refresh observer.
- Latest STABLE forward observation generated `2026-05-13T11:21:22.346Z`:
  `signalActive=true`, `directionalSignalPass=true`, `riskPass=true`,
  `tickerFresh=true`, `snapshotSkewControlled=true`, and both buy/sell depth
  cover the requested notional.
- STABLE is still not executable because current cost exceeds edge:
  `executableCostVsExpectedEdgeBps=10.366288`, reason
  `executable_cost_exceeds_expected_median_edge`.
- Latest STABLE readiness generated `2026-05-13T11:24:44.099Z` remains
  `paperReady=false`, `liveReady=false`; no paper signal was attempted and no
  position was opened.
- Added STABLE refresh, candidate gate, live-path gate, and review scripts.
- Added STABLE live-path evidence to the integrated live-goal gate and PM2
  observer.
- Latest STABLE live-path report:
  `var/reports/stable-60m-reversal-live-execution-path-readiness-latest.json`,
  generated `2026-05-13T11:24:44.121Z`, `ready=false`.
- STABLE live-path blockers are:
  `liveRuntimeAllowsRequestedMarket`, `dryRunLiveAllowsRequestedMarket`,
  `liveReadinessAcceptsReplacementEvidence`,
  `managedServiceGeneratesRequestedStrategy`, `livePm2TargetAvailable`,
  `liveStartScriptRequiresReplacementGate`, and
  `liveRestartScriptRequiresReplacementGate`.
- Latest integrated report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:25:18.734Z`, remains `status=blocked`,
  `liveReady=false`. It now includes H, STABLE, and PIEVERSE live-path inputs.
- Leading research remains KRW-H because STABLE is cost-blocked and has much
  smaller historical expectancy.

Verification:

- `npm run build && node --test dist/test/audit-bithumb-replacement-live-execution-path.test.js dist/test/live-goal-operational-config.test.js dist/test/audit-live-goal-status.test.js dist/test/dry-run-service-runtime.test.js dist/test/summarize-dry-run-returns.test.js dist/test/validation.test.js`
  passed (`83/83`).
- `npm run dry-run:gate-stable-60m-reversal-live-path-ready` exited nonzero as
  expected while writing the STABLE live-path report.
- `npm run dry-run:gate-stable-60m-reversal-live-ready` exited nonzero as
  expected while writing the STABLE readiness report.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected while
  writing the integrated blocked report.
- `npm run pm2:restart:dry-run:live-goal-status` regenerated the PM2-observed
  integrated report with STABLE live-path evidence included.

## 2026-05-13 20:36 KST Current Executable Market Recheck

Objective:

- respond to the profitability concern by rechecking current public Bithumb
  execution conditions instead of continuing stale candidates;
- verify whether a currently executable KRW market displaces KRW-H as the
  leading paper-only research path;
- keep live blocked unless the candidate has realized positive paper evidence.

Result:

- Ran a fresh current execution-universe screen across the top 80 Bithumb KRW
  markets for 500k KRW notional, 40bps max spread, and 5B KRW minimum 24h
  turnover.
- Current execution-compatible markets among the configured live/replacement
  set were `KRW-BTC`, `KRW-PIEVERSE`, and `KRW-H`; `KRW-STABLE` failed the
  turnover threshold.
- Re-scanned the 27 currently executable markets at 60m/35bps/500k KRW for
  momentum and reversal:
  - momentum produced `4` promotion candidates, all `KRW-H`;
  - the strongest current-executable H candidate was lookback `168`, hold `24`,
    min return `0`, `range24_below_p70`, with train PnL `513,595.844618 KRW`,
    test PnL `481,465.759864 KRW`, test median `6,186.507937 KRW`, 5/5 positive
    walk-forward total folds, and walk-forward min fold `8,113.658939 KRW`;
  - reversal produced `0` promotion candidates; the top-by-test `KRW-SOLV`
    result had negative train PnL, negative test median, and negative
    walk-forward min fold.
- Integrated the current-executable 27-market momentum/reversal scans into the
  live-goal gate and PM2 observer inputs so the live-goal report now includes
  this current market recheck.
- Latest integrated report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:36:43.344Z`, remains `status=blocked`, `liveReady=false`.
- The goal remains correctly configured but not achieved: H is still the
  strongest research focus, while live requires signal/risk pass, executable
  observation, paper entry, realized exit, positive realized paper PnL, and a
  live execution path.

Verification:

- `npm run build && node --test dist/test/live-goal-operational-config.test.js dist/test/audit-live-goal-status.test.js`
  passed (`33/33`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected while
  writing the integrated blocked report with the current-executable scan inputs.
- `git diff --check -- package.json ecosystem.config.cjs test/live-goal-operational-config.test.ts`
  passed.

## 2026-05-13 20:42 KST KRW-H Current Scan Alignment

Objective:

- stop carrying stale KRW-H threshold evidence after the current execution
  universe recheck;
- align the KRW-H observer, gate, managed paper profile, and live-goal observer
  with the current-executable 27-market scan;
- keep the goal blocked until the best current candidate produces forward paper
  entry, natural exit, and positive realized paper PnL.

Result:

- Updated KRW-H refresh/gate defaults and PM2 observer args to use
  `var/reports/current-executable-27-60m-momentum-fee35-500k-20260513-autocheck.json`
  with `range24_below_p70` threshold `2065.7276995305174`.
- Restarted the KRW-H refresh observer, KRW-H managed paper service, KRW-H
  managed-return observer, and the integrated live-goal observer.
- PM2 verification shows a single KRW-H managed paper service online and the
  KRW-H/live-goal observers running with the current-executable scan args.
- Latest KRW-H readiness:
  `var/reports/h-60m-momentum-replacement-readiness-latest.json`, generated
  `2026-05-13T11:40:47.183Z`, remains `paperReady=false`,
  `liveReady=false`.
- Latest KRW-H forward state: directional momentum passes, but risk does not;
  `riskValue=2080.924855`, `riskThreshold=2065.7276995305174`, so the entry is
  blocked by `risk_filter_failed`.
- Latest integrated report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:44:12.538Z`, remains `status=blocked`,
  `liveReady=false`.
- Current profitability snapshot:
  - BTC min75 open mark remains negative at `-189.70428 KRW` / `-0.037924%`,
    and is not usable for live promotion before realized exit.
  - KRW-H managed paper has `9` sessions, `0` traded sessions, and `0 KRW`
    realized PnL, so it is still research-only.
  - legacy, cross-exchange, and spot-perp carry evidence remain rejected due to
    negative net results.

Verification:

- `npm run build && node --test dist/test/live-goal-operational-config.test.js dist/test/dry-run-service-runtime.test.js dist/test/refresh-bithumb-replacement-time-series-readiness.test.js`
  passed (`36/36`).
- `npm run dry-run:refresh-h-60m-momentum-readiness` wrote the current-scan
  KRW-H readiness report and kept live blocked.
- `npm run dry-run:gate-h-60m-momentum-live-ready` exited nonzero as expected
  while writing the blocked KRW-H live-readiness report.
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected while
  writing the integrated blocked report.
- `npm run pm2:restart:dry-run:live-goal-status` restarted the live-goal
  observer with the current-executable scan inputs.
- `npm run dry-run:returns:krw-h-60m-momentum-managed-paper` refreshed KRW-H
  managed returns through the latest observed cycle.

## 2026-05-13 20:50 KST Current Executable 240m Recheck

Objective:

- avoid waiting on only the inactive KRW-H 60m candidate if a cleaner 240m
  current-executable candidate exists;
- keep the changed variable isolated to timeframe/signal mode while preserving
  the current executable market universe, 500k KRW notional, and 35bps
  round-trip cost;
- integrate failed 240m evidence into the live-goal gate so it remains visible
  as rejected evidence rather than an untracked side scan.

Result:

- Ran current-executable 27-market `240m` momentum and reversal scans:
  - `var/reports/current-executable-27-240m-momentum-fee35-500k-20260513-autocheck.json`,
    generated `2026-05-13T11:47:05.192Z`;
  - `var/reports/current-executable-27-240m-reversal-fee35-500k-20260513-autocheck.json`,
    generated `2026-05-13T11:47:57.534Z`.
- Both scans had `promotionCandidateCount=0`.
- 240m momentum top-by-test was `KRW-OSMO`, but it failed promotion because
  train PnL was `-254,439.541971 KRW`, train median was `-1,750 KRW`,
  test median was `-4,638.384568 KRW`, and walk-forward min fold was
  `-227,541.584875 KRW`.
- 240m reversal top-by-test was `KRW-SOLV`, but it failed promotion because
  train PnL was `-249,629.474173 KRW`, train median was `-10,381.578947 KRW`,
  test median was `-10,917.842031 KRW`, and walk-forward min fold was
  `-198,141.565444 KRW`.
- Subagent review agreed that no 240m/high-liquidity alternative currently
  outranks KRW-H 60m; the 240m top-by-test candidates are recent-window
  artifacts rather than stable expectancy.
- Added both 240m current-executable scans to the live-goal gate and PM2
  observer inputs.
- Latest integrated report:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:50:19.437Z`, remains `status=blocked`,
  `liveReady=false`.
- Current profitability snapshot:
  - BTC min75 open mark remains negative at `-111.330356 KRW` / `-0.022256%`
    and is still unusable for live promotion before realized exit.
  - KRW-H managed paper has `10` sessions, `0` traded sessions, `0 KRW`
    realized PnL, and `0` closed trades.
  - legacy, cross-exchange, and spot-perp carry evidence remain rejected due to
    negative net results.

Decision:

- Do not promote any 240m candidate.
- Keep `KRW-H 60m momentum` as the only current research focus, but only as
  paper observation; do not relax its risk threshold and do not treat inactivity
  as improved profitability.
- Live remains blocked until forward paper produces accepted entry, natural
  hold exit, positive realized paper PnL, and the live execution path passes.

Verification:

- `npm run build && node --test dist/test/live-goal-operational-config.test.js dist/test/audit-live-goal-status.test.js`
  passed (`33/33`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected while
  writing the integrated blocked report with the new 240m current-executable
  scan inputs.
- `npm run pm2:restart:dry-run:live-goal-status` restarted the live-goal
  observer, and PM2 args include both new 240m current-executable scan paths.
- `git diff --check -- package.json ecosystem.config.cjs test/live-goal-operational-config.test.ts analysis/live-goal-completion-audit-20260512.md`
  passed.

## 2026-05-13 20:52 KST KRW-H Promotion Variant Check

Objective:

- ensure the system is not over-committed to only the top KRW-H promotion
  variant when other measured variants might enter sooner;
- compare only already-promoted current-executable variants, not new
  unmeasured knobs;
- keep the live decision based on forward signal/risk/execution evidence.

Result:

- The current-executable 60m momentum scan has four promotion candidates, all
  `KRW-H` with the same `lookbackBars=168`, `holdBars=24`,
  `riskFilter=range24_below_p70`, and `riskThreshold=2065.7276995305174`.
  They differ only by `minReturnBps` (`0`, `10`, `25`, `50`).
- The top `minReturnBps=0` variant remains the strongest research candidate
  because it has test median `6,186.507937 KRW` versus `2,156.25 KRW` for the
  stricter variants.
- Forward observations for the stricter variants were written to:
  - `var/reports/h-60m-momentum-promotion-min10-forward-observation-latest.json`;
  - `var/reports/h-60m-momentum-promotion-min25-forward-observation-latest.json`;
  - `var/reports/h-60m-momentum-promotion-min50-forward-observation-latest.json`.
- All three variants had `directionalSignalPass=true`, `riskPass=false`,
  `riskValue=2080.924855`, `riskThreshold=2065.7276995305174`, and
  `decision.reasons=["risk_filter_failed"]`.
- Their orderbook spread was `28.011204 bps`; using the stricter variants'
  measured test median edge (`43.125 bps`) leaves only `15.113796 bps` of
  spread-vs-edge cushion before additional slippage/fee-model error.

Decision:

- Do not rotate from `minReturnBps=0` to the stricter KRW-H variants.
- The stricter variants do not create a valid paper entry now and reduce
  expected edge, so switching would be a lower-expectancy change rather than an
  improvement.
- Keep KRW-H observation on the top measured candidate and wait for natural
  risk pass instead of relaxing or changing the signal threshold.

Verification:

- `npm run build && node dist/src/cli/observe-bithumb-reversal-candidate.js ...`
  completed for `minReturnBps` `10`, `25`, and `50`, writing the three forward
  observation reports above.

## 2026-05-13 20:55 KST Managed Paper Profitability Recheck

Objective:

- answer whether the current goal is moving toward a profitable live strategy
  rather than defending an unprofitable or unproven one;
- refresh the integrated live-goal gate after managed-paper evidence increased;
- keep 0-trade evidence classified as no profit evidence, not as improved
  profitability.

Result:

- Reran `npm run dry-run:gate-live-goal-ready`, writing the latest
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T11:57:11.688Z`.
- The integrated live-goal report remains `status=blocked`,
  `liveReady=false`, and `completionAudit.achieved=false`.
- Current BTC min75 open mark worsened to `-708.942203 KRW` /
  `-0.141725%`; it is still an open mark, not a realized exit, and
  `stressBeatsBtcBuyAndHold=false`.
- KRW-H managed paper now has `12` completed sessions, `0` traded sessions,
  `0 KRW` total PnL, `0` closed trades, `2` failed cycles, and classification
  `discard_candidate` until a real entry/exit exists.
- KRW-H forward observation remains directionally active enough
  (`lookbackReturnBps=2074.829932`) but execution is blocked because
  `riskValue=2080.924855` exceeds the current `riskThreshold=2065.7276995305174`
  by `15.197156 bps`; the paper decision reason is `risk_filter_failed`.
- The latest KRW-H forward report classifies execution viability as
  `blocked_by_signal_or_execution_cost`.
- PIEVERSE managed paper has `14` completed sessions, `0` traded sessions,
  `0 KRW` traded PnL, `0` closed trades, `5` failed cycles, completion rate
  `0.7368421052631579`, and classification `discard_candidate`.
- Legacy, cross-exchange, and carry paths remain rejected:
  - legacy traded PnL `-46,432.235257 KRW`, closed-trade PnL
    `-20,564.104167 KRW`;
  - cross-exchange estimated net PnL `-87.513259 KRW`, median net edge
    `-17.502652 bps`, positive rate `0`;
  - spot-perp carry estimated net PnL `-14,405.237439 KRW`, median net carry
    `-43.924929 bps`, positive rate `0`.

Decision:

- The current goal is correctly blocked, but it is not achieved.
- Do not start live trading and do not treat 0-trade managed paper as a
  profitable result.
- Keep KRW-H only as the leading research candidate because it is the only
  current-executable scan with stable historical train/test/walk-forward
  evidence; require natural risk pass, accepted paper entry, natural exit, and
  positive realized paper PnL before any live promotion.
- Discard PIEVERSE as a live candidate unless it first produces valid
  scenario cycles and positive closed-trade paper evidence.

Verification:

- `npm run dry-run:gate-live-goal-ready` completed the build and exited
  nonzero as expected under `--require-live-ready` while writing the blocked
  integrated report.

## 2026-05-13 21:02 KST Benchmark Snapshot Measurement Fix

Objective:

- reduce managed-paper cycle failures that were caused by invalid optional
  BTC benchmark snapshots rather than by the KRW-H or PIEVERSE strategy
  scenario itself;
- preserve measurement honesty by keeping bid/ask prices paired with positive
  sizes from the same executable orderbook level;
- keep live blocked unless actual paper trades and realized exits appear.

Result:

- Root cause confirmed with subagent review and local scenario files:
  failed `events[1]` snapshots were `KRW-BTC` benchmark snapshots with
  `bestBidSize=0`; the primary KRW-H/PIEVERSE snapshots were valid.
- Updated `src/cli/run-dry-run-service.ts` so Bithumb benchmark snapshots use
  the first orderbook level where price and size are both positive for each
  side, then validate the constructed `MarketSnapshot`.
- Added runtime tests in `test/dry-run-service-runtime.test.ts` covering:
  - executable orderbook level selection keeps price and size from the same
    live book level;
  - KRW-H and PIEVERSE managed scenarios skip invalid optional BTC benchmark
    snapshots instead of writing a mismatched `snapshotCount`.
- Restarted `dry-run-krw-h-60m-momentum-managed-paper` and
  `dry-run-pieverse-60m-reversal-lb168-managed-paper` so future cycles use the
  corrected benchmark snapshot logic.
- Verified the first new post-restart scenarios:
  - `var/log/dry-run-krw-h-60m-momentum-managed-paper/krw-h-60m-momentum-scenario-cycle-1-20260513T120217846Z.json`;
  - `var/log/dry-run-pieverse-60m-reversal-lb168-managed-paper/pieverse-60m-reversal-lb168-scenario-cycle-1-20260513T120217820Z.json`.
  Both have `metadata.summary.snapshotCount=2` and positive `KRW-BTC`
  benchmark bid/ask sizes.
- Refreshed managed return summaries and the integrated live-goal gate:
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T12:02:55.889Z`, remains `status=blocked`,
  `liveReady=false`, and `completionAudit.achieved=false`.
- Latest profitability status:
  - BTC min75 open mark worsened to `-826.189476 KRW` / `-0.165164%`;
  - KRW-H managed paper has `14` sessions, `0` traded sessions, `0 KRW`
    realized PnL, and `0` closed trades;
  - PIEVERSE managed paper has `16` sessions, `0` traded sessions, `0 KRW`
    realized PnL, and `0` closed trades.

Decision:

- This fixes a measurement-quality issue, not a profitability issue.
- Do not promote KRW-H or PIEVERSE. They remain unproven because neither has
  produced an accepted paper entry or positive realized paper PnL.
- Keep live blocked.

Verification:

- `npm run build && node --test dist/test/dry-run-service-runtime.test.js dist/test/summarize-dry-run-returns.test.js`
  passed (`47/47`).
- `npm run dry-run:gate-live-goal-ready` exited nonzero as expected under
  `--require-live-ready` while writing the blocked integrated report.

## 2026-05-13 21:07 KST Managed-Inactive Gate Recheck

Objective:

- verify the active goal after enough managed-paper data accumulated;
- avoid continuing to frame a 0-trade path as a live candidate;
- keep the next search focused on realizable expectancy, not on lower
  activity or avoided benchmark loss.

Result:

- Re-ran `npm run dry-run:gate-live-goal-ready` after the managed-paper
  reporting change. The integrated report
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T12:07:53.260Z`, remains `status=blocked`,
  `liveReady=false`, and `completionAudit.achieved=false`.
- The selected candidate is now explicitly
  `replacement_time_series_managed_inactive`, with rationale that the leading
  historical replacement has no accepted trades or positive realized PnL.
- KRW-H is demoted from live focus:
  - `action=demote_from_live_focus`;
  - `evidenceType=managed_paper_no_trade`;
  - `14` sessions, `0` traded sessions, `0 KRW` traded PnL,
    `0` closed trades;
  - latest forward observation still fails the risk gate by `15.197156 bps`.
- PIEVERSE managed paper remains non-promotable:
  - `17` sessions, `0` traded sessions, `0 KRW` traded PnL,
    `0` closed trades;
  - completion rate `0.772727`, only `6` completed cycles since latest
    failure.
- BTC min75 remains paper-only and currently has a negative open mark:
  `-675.442982 KRW` / `-0.135028%`, with hold exit due
  `2026-05-16T11:00:00.000Z`.
- Rejected paths are still negative:
  - legacy traded paper PnL `-46,432.235257 KRW`;
  - cross-exchange estimated net PnL `-87.513259 KRW`;
  - spot-perp carry estimated net PnL `-14,405.237439 KRW`.

External sanity check:

- Bithumb documentation confirms that the live venue exposes orderbook
  prices/sizes and per-market fees through APIs; live readiness should
  continue to use executable depth and actual fee assumptions, not close-only
  backtest marks.
- Recent crypto momentum literature also warns that many apparent momentum
  profits disappear after realistic transaction costs and liquidation/risk
  constraints. This supports keeping KRW-H/PIEVERSE blocked until accepted
  paper entries and positive realized exits exist.
- Cross-crypto lead-lag/LASSO research is the most plausible next research
  direction from the web review, but the current local cross-market scans are
  not promotable because current executable edge and operational proof are
  still negative/missing.

Decision:

- The goal is still correctly set, but not achieved.
- Do not start live trading.
- Do not relax KRW-H risk threshold to force a trade; that would change the
  validated variable and failed the local fixed-parameter validation.
- Continue searching, but promote only candidates with positive realized paper
  exits, clean reconciliation, sufficient closed trades, and live execution
  path readiness.

## 2026-05-13 21:17 KST BTC Negative Leader Lead-Lag Check

Objective:

- test the smallest non-duplicative lead-lag idea from the web/subagent review:
  long ETH/XRP after a negative BTC leader move;
- keep the experiment long-only and spot-compatible, using the same next-book
  ask / future-book bid execution marks and 500k KRW notional stress.

Change:

- Extended `src/cli/analyze-cross-market-lead-lag.ts` with
  `--signal-direction positive|negative`. The default remains `positive`.
- Added a targeted regression test proving `--signal-direction negative`
  can find a synthetic promotion candidate when BTC falls and the targets rise.
- Added the negative BTC-leader scan reports to the live-goal gate and PM2
  observer inputs so this research dimension remains part of the integrated
  audit instead of being rediscovered later.

Evidence:

- Ran:
  - `npm run dry-run:analyze-cross-market-lead-lag -- --markets KRW-BTC,KRW-ETH,KRW-XRP --leader-market KRW-BTC --signal-direction negative --fee-round-trip-bps 35 --notional-krw 500000 --min-candles 500 --output var/reports/btc-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json`;
  - `npm run dry-run:analyze-cross-market-lead-lag -- --markets KRW-BTC,KRW-ETH,KRW-XRP --leader-market KRW-BTC --signal-direction negative --fee-round-trip-bps 50 --notional-krw 500000 --min-candles 500 --output var/reports/btc-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json`.
- Both scans had `sourceReady=true`, `signalTimestampCount=21416`,
  `candidateCount=400`, and `promotionCandidateCount=0`.
- Fee35 top-by-test row:
  - target `KRW-ETH`, lookback `5`, hold `5`, min leader return `50 bps`;
  - train count `11`, train total `-21,154.232131 KRW`, train median
    `-1,603.587116 KRW`;
  - test count `0`;
  - walk-forward min fold `-8,075.169331 KRW`.
- Fee50 top-by-test row was worse:
  - train total `-29,404.232131 KRW`, train median `-2,353.587116 KRW`;
  - test count `0`;
  - walk-forward min fold `-11,075.169331 KRW`.
- Re-ran `npm run dry-run:gate-live-goal-ready` with the negative scans
  included. `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T12:16:59.805Z`, remains `status=blocked`,
  `liveReady=false`, `completionAudit.achieved=false`.

Decision:

- Reject BTC negative-leader spot lead-lag as a live candidate.
- It does not improve expectancy and does not create a paper/live path.
- The active goal remains open; no live-ready profitable candidate exists yet.

## 2026-05-13 21:45 KST Order-Flow Recovery Gate Coverage

Objective:

- close the remaining order-flow reporting gap before spending more time on
  new strategy variants;
- avoid rerunning expensive fee35 order-flow scans where a lower-fee scan
  already proves no promotion candidate exists.

Evidence:

- Existing order-flow continuation/absorption/reversion reports at fee20 and
  500k KRW all have `promotionCandidateCount=0`.
- Existing order-flow recovery report
  `var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee8-20260513.json`
  also has `promotionCandidateCount=0` despite only `8 bps` round-trip fee.
- Recovery top-by-test row:
  - `candidateCount=8748`;
  - train count `5`, train total `-5,376.333350 KRW`, train median
    `-878.468900 KRW`;
  - test count `1`, test total `+2,661.705134 KRW`;
  - walk-forward min fold `-4,740.038454 KRW`.
- Because the same trade set only becomes worse as fees increase, no
  fee35/500k recovery promotion can appear if fee8 already has zero promotion
  candidates.

Change:

- Added the fee8 recovery report to the live-goal gate and PM2 observer input
  lists so the integrated report carries this rejected order-flow dimension.
- Re-ran `npm run dry-run:gate-live-goal-ready`. The integrated report
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T12:45:19.128Z`, remains `status=blocked`,
  `liveReady=false`, and `completionAudit.achieved=false`.
- Latest live-goal status:
  - KRW-H managed paper: `21` sessions, `0` traded sessions, `0 KRW` traded
    PnL, `0` closed trades;
  - BTC min75 open mark: `-2,446.714283 KRW` / `-0.489124%`.

Decision:

- Reject order-flow recovery as a live candidate.
- Do not spend further runtime on fee35 reruns for order-flow modes where
  lower-fee reports already fail promotion.
- Goal remains open and live remains blocked.

## 2026-05-13 21:49 KST Managed-Inactive Next Action Fix

Objective:

- make sure the integrated live-goal gate does not keep recommending a
  KRW-H-specific refresh path after managed paper has shown no accepted trades.

Evidence:

- Re-ran `npm run dry-run:gate-live-goal-ready`.
- Latest integrated report
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T12:49:46.758Z`, remains `status=blocked`,
  `liveReady=false`, and `completionAudit.achieved=false`.
- KRW-H managed paper now has `22` sessions, `0` traded sessions,
  `0 KRW` traded PnL, `0` closed trades, and classification
  `discard_candidate`.
- BTC min75 remains paper-only with an open mark of `-1,424.988048 KRW`
  / `-0.284870%`; its reduce-only hold exit is still due
  `2026-05-16T11:00:00.000Z`.
- Existing maker-fill quality reports for BTC, ETH, and XRP at 500k KRW are
  negative after realistic no-reward fees, so passive maker fill quality is
  not a live candidate either.

Change:

- When the leading replacement research is managed-paper inactive, the next
  action now remains `demote_from_live_focus_search_for_better_executable_candidate`
  and its verification command is only `npm run dry-run:gate-live-goal-ready`.
- Added a regression assertion so the gate cannot silently reintroduce a
  KRW-H-specific refresh command for a discarded managed-paper candidate.

Decision:

- KRW-H is no longer a live-focus candidate. It is historical research only
  until it produces actual accepted paper entries and positive realized exits.
- The active goal remains open; no strategy is currently live-ready.

## 2026-05-13 22:07 KST Maker-Fill Microstructure Filter Check

Objective:

- test the remaining practical microstructure idea before considering any live
  start: maker bid fills conditioned on passive order-flow features.

Change:

- Added `src/cli/analyze-maker-fill-filter.ts`.
- The scan assumes a maker bid posted at best bid, waits behind displayed
  best-bid size, counts a fill only when sell-initiated trades consume queue
  plus order size, and exits at a future best bid with no maker reward.
- It scans feature-conditioned subsets using `ret_5m_bps`,
  `buy_notional_share_60s`, `depth_ratio_l5`, `spread_bps`, and fill delay.
- Added `dry-run:analyze-maker-fill-filter` and a regression test with a
  synthetic positive conditioned subset.
- Added the resulting report to the live-goal gate and PM2 observer scan list.

Evidence:

- Ran:
  - `npm run dry-run:analyze-maker-fill-filter -- --markets KRW-BTC,KRW-ETH,KRW-XRP --notional-krw 500000 --ttl-seconds 60 --sample-interval-seconds 60 --max-runs 1000 --output var/reports/maker-fill-filter-btc-eth-xrp-500k-ttl60-sample60-max1000-20260513.json`.
- The report generated `2026-05-13T13:05:26.290Z` with
  `candidateCount=1152` and `promotionCandidateCount=0`.
- Source coverage:
  - BTC: `1000` runs, `1557` feature-matched fills, `0` promotions;
  - ETH: `1000` runs, `1274` feature-matched fills, `0` promotions;
  - XRP: `1000` runs, `1124` feature-matched fills, `0` promotions.
- Best visible top-by-test rows still had no test trades and negative train
  PnL, so the result is not a hidden live candidate.
- Re-ran `npm run dry-run:gate-live-goal-ready` with the maker-filter report
  included. The integrated report
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T13:07:45.516Z`, remains `status=blocked`,
  `liveReady=false`, and `completionAudit.achieved=false`.

Decision:

- Reject maker-fill passive microstructure filtering as a live candidate.
- This does not close the active goal; it narrows the search by eliminating
  another realistic execution path under current evidence.

## 2026-05-13 22:11 KST Legacy Replay Supplement Refresh

Objective:

- make sure the legacy audit used by the live-goal gate includes the failed
  entry-filter replay supplement, so a losing turnover-cap replay is not left
  as a candidate.

Evidence:

- Re-ran
  `npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --output var/reports/current-live-audit-all-running-20260513-refresh.json`.
- The refreshed audit generated `2026-05-13T13:09:50.747Z`.
- It reports no live-ready labels, no profitable paper labels, and
  `discardLabels=["trend"]`.
- It also reports `entryFilterReplayCandidateLabels=[]` and
  `invalidatedEntryFilterReplayLabels=["trend"]`.
- Explicit replay evidence remains negative:
  - `var/reports/btc-trend-turnover-cap-replay-all-returns.json`:
    `63` traded sessions, `23` closed trades, traded PnL
    `-8250.440276 KRW`, closed PnL `-2835.265704 KRW`;
  - `var/reports/btc-trend-turnover-cap-path-replay-all-returns.json`:
    `34` traded sessions, `12` closed trades, traded PnL
    `-3376.071625 KRW`, closed PnL `-860.933298 KRW`.
- Re-ran `npm run dry-run:gate-live-goal-ready` after refreshing the legacy
  audit. The integrated report
  `var/reports/live-goal-status-20260513-current.json`, generated
  `2026-05-13T13:11:24.435Z`, remains `status=blocked`,
  `liveReady=false`, and `completionAudit.achieved=false`.

Decision:

- Reject trend turnover-cap replay and any live loosening based on it.
- The active goal remains correctly blocked: losing paths are being rejected,
  and the next action is to search for a better executable candidate rather
  than continue optimizing an invalidated replay.

## 2026-05-13 22:15 KST ETH Fixed-Leader Lead-Lag Check

Objective:

- verify the remaining non-duplicative cross-market lead-lag idea suggested by
  subagent review: ETH as a fixed leader for BTC/XRP targets under realistic
  fee stress.

Evidence:

- Existing lead-lag reports covered BTC fixed-leader and all-market
  confirmation scans, but not ETH fixed-leader scans.
- Ran positive ETH leader scans:
  - `var/reports/eth-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json`;
  - `var/reports/eth-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json`.
- Ran negative ETH leader scans:
  - `var/reports/eth-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee35-500k-20260513.json`;
  - `var/reports/eth-negative-leader-alt-cross-market-lead-lag-btc-eth-xrp-fee50-500k-20260513.json`.
- All four reports have `sourceReady=true`, `candidateCount=400`, and
  `promotionCandidateCount=0`.
- The best positive-fee35 top-by-test row had only `1` test trade, train PnL
  `-18973.718222 KRW`, and walk-forward PnL `-16808.479701 KRW`.
- The best negative-fee35 top-by-test row had `0` test trades, train PnL
  `-15380.215597 KRW`, and walk-forward PnL `-15380.215597 KRW`.

Change:

- Added the four ETH fixed-leader reports to the live-goal gate and PM2
  observer scan lists so future integrated status reports carry this rejected
  evidence instead of leaving the ETH lead-lag question open.

Decision:

- Reject ETH fixed-leader lead-lag as a live candidate under current data.
- Continue the active goal by searching for a better executable order-flow or
  microstructure candidate; do not promote lead-lag.

## 2026-05-13 22:33 KST Carry Economics Isolation

Objective:

- separate spot/perp carry economics from operational readiness blockers, so
  the live decision does not confuse missing hedge setup with a profitable
  carry opportunity.

Evidence:

- Rechecked existing order-flow and microstructure reports with subagent
  review. Continuation, reversion, absorption, recovery, maker-fill, lead-lag,
  and intraday edge reports still have no promotion candidates.
- Attempted fee-stressed recovery scans at 35 bps and 50 bps, but the full
  multi-horizon recovery scan was stopped after prolonged CPU and memory use.
  This did not remove a live candidate because the existing optimistic fee8
  recovery report already had `promotionCandidateCount=0`.
- Ran an economic-only carry diagnostic from the existing public observation
  report:
  `var/reports/spot-perp-carry-existing-observations-economic-only-20260513.json`.
- The diagnostic generated `2026-05-13T13:33:23.353Z` and remained
  `status=blocked`, `promotionEligible=false`.
- Even with fee/account/inventory/hedge readiness flags relaxed, economics were
  negative:
  - `completedFundingCount=0`;
  - `positiveCount=0`;
  - `positiveRate=0`;
  - `medianNetCarryBps=-43.924929`;
  - `averageNetCarryBps=-48.017458`;
  - `maxNetCarryBps=-33.846126`;
  - `totalEstimatedNetPnlKrw=-14405.237439`.

Decision:

- Reject carry as a current live candidate on economics, not merely operations.
- Do not spend the next iteration on carry live wiring; only revisit if fresh
  observations show positive net carry after entry, hedge, conversion, funding,
  and exit buffers.

## 2026-05-13 22:37 KST Order-Flow Recovery Fee Dominance

Objective:

- avoid repeating the expensive full recovery scan when fee monotonicity already
  answers the live-readiness question.

Change:

- Added `src/cli/audit-order-flow-fee-dominance.ts`.
- The audit reads a lower-fee order-flow report and certifies that a higher-fee
  report cannot create promotion candidates when the lower-fee report already
  had `promotionCandidateCount=0`.
- Added the dominance reports to the live-goal gate and PM2 observer scan list.

Evidence:

- Source report:
  `var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee8-20260513.json`.
- Source fee was `8` bps, `candidateCount=8748`, and
  `promotionCandidateCount=0`.
- Generated:
  - `var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee35-dominance-20260513.json`;
  - `var/reports/order-flow-recovery-btc-eth-xrp-h60-180-300-900-fee50-dominance-20260513.json`.
- Both dominance reports have `promotionCandidateCount=0` and
  `targetNoPromotionByDominance=true`.

Decision:

- Reject order-flow recovery at realistic 35/50 bps by dominance instead of
  spending more runtime on a full rescan.
- This is not a live candidate; it is a measurement safeguard that keeps the
  search focused on genuinely new executable evidence.
