# PM2 Managed Dry Run

This repo now includes a managed `dry_run` service for collecting repeatable public-market evidence without enabling live execution.

## What the service does

Each cycle runs:

1. `python -m org_coin_data bootstrap`
2. `python -m org_coin_data build-session-scenario`
3. `dry_run` execution through `dist/src/cli/run-paper-session.js`

The result is three layers of evidence:

- PM2 stdout/stderr under `var/log/pm2/`
- One structured NDJSON summary per completed or failed cycle at `var/log/dry-run-service/cycles.ndjson`.
  Failed command cycles include the command label, exit status, recent stdout/stderr
  tail, and a `failureKind` when the failure is recognized, such as
  `no_enriched_market_points`.
- Normal replay/session artifacts under `var/data/replay/` and `var/paper-sessions/`

Return summaries must be compared against BTC buy-and-hold before any live
rollout decision:

```bash
npm run dry-run:returns:btc-confirm3
```

The summary includes `btcBuyHoldBenchmark`, `btcTrendExposure`,
`strategyAssessment`, and `liveReadiness`. A strategy that does not clear
positive risk-adjusted excess return versus BTC buy-and-hold remains paper-only.
`btcTrendExposure` is a retrospective opportunity diagnostic for BTC-positive
and BTC-negative windows. It breaks out no-signal/no-fill sessions and
suppression/gate-failure counts so inactivity can be separated from missed
upside and downside risk control. It is not treated as tradable PnL.

## Strategy Research Handoff

As of 2026-05-17, strategy research is no longer constrained to BTC-only
uptrend capture. The legacy BTC `confirm3` / 15-second micro-momentum path
should be treated as an observation-only baseline unless a fresh audit proves
otherwise. Prior evidence showed negative or insufficient traded PnL, repeated
15-minute time-stop losses, and no reliable suppressed-entry expectancy.
Positive BTC-excess readings from inactivity, latest-mark dependency, or
carry-open handling are not live-tradable edge.

New strategy work should start from a named baseline and change one measured
variable at a time. Current viable research families include execution-clean
KRW time-series momentum/reversal, BTC time-series momentum, cross-market
lead-lag, volatility breakout, cross-exchange relative value, and spot-perp
carry. Each candidate must separate entry frequency, natural exit quality,
synthetic pricing effects, fees/spread/slippage, and reconciliation risk before
any readiness gate can promote it.

Useful research commands:

```bash
npm run dry-run:analyze-volatility-breakout -- --top-markets 40 --unit-minutes 60 --max-candles 5000 --fee-round-trip-bps 50 --notional-krw 500000 --output var/reports/current-top40-60m-volatility-breakout-fee50-YYYYMMDD.json
npm run dry-run:analyze-bithumb-execution-universe
npm run dry-run:analyze-bithumb-momentum
npm run dry-run:analyze-cross-market-lead-lag
npm run dry-run:discover-spot-perp-carry-current-carry
npm run dry-run:discover-spot-perp-carry-top-funding-fee-stress
npm run dry-run:analyze-trade-paths -- --reports-root <candidate-root>
npm run dry-run:compare-paired
npm run dry-run:gate-all-running-paper-candidate
npm run dry-run:gate-all-running-live-ready
```

## Commands

Run one cycle locally:

```bash
npm run dry-run:service -- --once
```

Start the continuous PM2-managed loop:

```bash
npm run pm2:start:dry-run
```

Start the BTC trend-follow experiment loop in parallel with the baseline:

```bash
npm run pm2:start:dry-run:btc-trend
```

Start the ret1 plus turnover-cap observation loop:

```bash
npm run pm2:start:dry-run:btc-trend-ret1-turnover-cap
```

Inspect status:

```bash
npm run pm2:status:dry-run
```

Tail logs:

```bash
npm run pm2:logs:dry-run
```

Summarize the BTC trend experiment:

```bash
npm run dry-run:returns:btc-trend
```

Summarize the ret1 plus turnover-cap observation candidate:

```bash
npm run dry-run:returns:btc-trend-ret1-turnover-cap
```

Audit the current live-candidate set in one pass:

```bash
npm run dry-run:audit-current-candidates
```

Audit every currently running observation candidate, including the confirm3
baseline manager:

```bash
npm run dry-run:audit-all-running-candidates
```

Print only the promotion blockers and compact per-candidate metrics when the
full audit is too large for an operational check:

```bash
npm run dry-run:audit-all-running-summary
```

Compact rows include `auditDisposition`, which is the audit-level promotion
state (`live_ready`, `profitable_paper_candidate`, `observation_only`, or
`discard`). This is separate from the lower-level strategy classification.
The `recommendation.decisionSummary` block gives the same decision in compact
form: whether live is blocked, whether a profitable paper candidate exists,
whether observation evidence is healthy or still recovering from cycle
failures, whether entry-gate changes are supported, the next operational step,
the minimum additional closed-trade and recovery-cycle evidence targets, the
estimated recovery wait based on observed completed-cycle spacing when cycle
timestamps are available, and the primary blocker categories.

Write the same JSON to an artifact path when preserving a promotion decision:

```bash
npm run dry-run:audit-all-running-candidates -- --output var/reports/current-live-audit.json
```

`--summary-only` changes stdout only. When it is combined with `--output`, the
artifact file still contains the full audit, including suppressed-opportunity
BTC-window diagnostics, and retrospective trade-path loss diagnostics. The
trade-path diagnostics explain whether losing exit cohorts were mostly
immediate-adverse entries or gave-back-positive-MFE exits; they are diagnostic
evidence, not promotion PnL authority.

If a carry-forward replay has recovered exit reasons for legacy sell-fill
sessions, pass the recovery summary explicitly so the audit can repair the
attribution gap without changing strategy PnL:

```bash
npm run dry-run:audit-all-running-attribution-repaired -- \
  --output var/reports/current-live-audit-all-running-attribution-repaired-latest.json
```

The supplement is matched by `sourceRunId` against sessions that already have
sell fills but no exit reason. Unmatched recovered sessions are reported in the
audit, and the option is intentionally explicit so local recovery artifacts do
not silently change the default promotion path.

If an explicit entry-filter replay has already been run, attach its audit output
so the aggregate audit does not keep recommending the same already-failed replay:

```bash
npm run dry-run:audit-all-running-repaired-with-replay-supplement -- --summary-only
```

The current `trend` turnover-cap replay supplement used by the package script is
`var/reports/btc-trend-turnover-replay-supplement-combined-audit.json`. It
combines `var/reports/btc-trend-turnover-cap-replay-all-audit.json` and
`var/reports/btc-trend-turnover-cap-path-replay-all-audit.json`; both explicit
replays invalidate their retrospective `trend` turnover thresholds as promotion
candidates because neither produced a live-ready or profitable paper candidate.

Gate flags can be appended to the same script when the repaired attribution view
is the intended decision surface:

```bash
npm run dry-run:audit-all-running-attribution-repaired -- --require-live-ready --summary-only
```

Use the failing gate variant when a deployment or operations step must stop
unless at least one candidate is live-ready:

```bash
npm run dry-run:gate-all-running-live-ready
```

Use the observation-readiness gate when automation only needs to know whether
cycle evidence is attached and no candidate is still in recovery after a latest
failure:

```bash
npm run dry-run:gate-all-running-observation-ready
```

Use the paper-candidate gate before starting a longer paper observation run
based on a single selected candidate:

```bash
npm run dry-run:gate-all-running-paper-candidate
```

The BTC 240-minute momentum candidate uses a separate BTC-only readiness path
because it is based on public 240-minute candle evidence rather than the
legacy PM2 cycle return summary. Keep it in paper observation until the
fixed-hold reduce-only paper exit has actually occurred:

```bash
npm run pm2:start:dry-run:btc-240m-momentum-observer
npm run dry-run:gate-btc-240m-live-ready
```

The live gate intentionally fails while the candidate is still
`paper_candidate`. It must remain blocked until the readiness artifact reports
`liveReady=true`, including `realizedExitAvailable`,
`realizedExitReusePolicy`, `noOpenPaperPositionAfterExit`, and
`positiveRealizedPaperExitPnl`. The exit proof must be the first reduce-only
exit recorded for the entry signal; a reconciled but losing paper exit is not
live-ready.

The live PM2 entrypoints run this gate before any live process can be started:

```bash
npm run pm2:start:live-btc
npm run pm2:restart:live-btc
```

They also run the top-level live-goal gate:

```bash
npm run dry-run:gate-live-goal-ready
```

Immediately before `npm run build && pm2 ...`, live PM2 start/restart scripts
also run:

```bash
npm run dry-run:audit-live-goal-process-alignment
```

That process-alignment audit must pass with a completed live-goal
`completionAudit`, no stale or unapproved `live-*` PM2 apps, and a saved PM2
dump aligned with the approved live startup plan.
Blocked live-goal statuses are also schema-checked: if
`completionAudit.missingRequirementCount` is missing or disagrees with
`completionAudit.missingRequirements.length`, process alignment fails and the
live-goal status must be refreshed before relying on PM2 alignment.
`completionAudit.failedCompletionCriteria` uses stable completion-criterion IDs
from the audit's `criteria` list and must match the criteria whose `passed`
value is not true, so checkpoint logs and process checks do not depend on
human-readable sentence text. Process alignment also requires the live-goal
status audit to include the core completion IDs:
`candidate_selected_from_current_evidence`, `profitability_evidence_satisfied`,
`known_losing_paths_rejected`, `current_entry_sanity_clear`,
`no_current_focus_recompare_caution`, and `live_startup_gate_allowed`.
`candidate_selected_from_current_evidence` refers to the live-authorizing
`selectedLiveCandidate`, not to a research-only focus, and
`live_startup_gate_allowed` remains failed until the global gate explicitly
allows startup with no blockers.

This prevents a strategy-specific BTC readiness artifact from bypassing the
current goal-level blockers, including discarded replacement research,
cross-exchange rejection, and blocked carry evidence.

For routine status checks, use the compact checkpoint command instead of the
full live-goal gate:

```bash
npm run dry-run:checkpoint-live-goal-progress
```

The checkpoint command refreshes `var/reports/live-goal-progress-summary-latest.json`
from the latest goal-status and process-alignment artifacts, then prints only
the live block state, estimated carry view, next review time in UTC and KST,
whether a full live-goal refresh is due, failed completion criteria, and the
classified missing requirements. It intentionally does not run the heavy
`dry-run:gate-live-goal-ready` evidence refresh. If
`checkpointPlan.shouldRunHeavyRefreshNow=false`, wait until
`checkpointPlan.nextReviewAtKst` before running the full live-goal refresh
shown in `checkpointPlan.reviewCommand`.
Checkpoint blockers are split by ownership. `outstandingOperatorWork` is for
private account, credential, margin, inventory, fee, and process prerequisites
that an operator can actually repair. Market execution-quality blockers such as
`wideDisplayedSpread` stay in `outstandingMarketConditionWork` and
`nextMarketConditionWork`; they still block live startup, but they should be
resolved by fresh market evidence or continued observation rather than by
treating them as an operator task. The summary also emits
`marketConditionHandoff`, which carries the market-condition blocker list,
current-entry snapshot, spread-control diagnostics when available, and the
review/gate commands needed before live can be reconsidered.
Autonomous evidence blockers such as `insufficientObservationSpan` are emitted
in `autonomousEvidenceHandoff`, including readiness gaps, timeline, next review
time, and refresh command; these are observation requirements, not operator
tasks.
The same checkpoint report also emits `strategyResearchHandoff`. It summarizes
the current carry research focus, the best fee-stressed challenger, latest
funding-window comparison, missing switch evidence such as spread control or
latest-window sample quality, and the refresh commands needed for a keep/switch
review. It also exposes `emergingCleanOpportunities` for spread-clean,
fee-stressed positive markets that still lack enough completed funding-window
history. These are observation priorities only; the handoff never authorizes
live startup without the profitability, readiness, operational-proof,
market-condition, and goal gates.

The PM2 `dry-run-live-goal-status-observer` is checkpoint-aware. It runs
`dry-run:refresh-live-goal-status-if-due`, which first refreshes the lightweight
process-alignment artifact, updates the compact checkpoint, and only runs the
full live-goal refresh when
`checkpointPlan.shouldRunHeavyRefreshNow=true` or `nextReviewAt` has arrived.
The observer runs every 10 minutes; skipped cycles remain lightweight, while a
due checkpoint can be picked up without waiting for a one-hour loop. This keeps
the observer from repeatedly running the heavy gate before a new completed
funding-window sample can change the decision. When the full refresh is skipped, the due-check
JSON is still written to the PM2 log and
`var/reports/live-goal-refresh-due-latest.json` so operators can see
`refreshDue=false`, `decision=skip_full_refresh_until_next_review`,
`checkpointStatus`, `nextReviewTrigger`, `reason`, `nextReviewAtKst`, and the
remaining wait. It also carries through `outstandingAutonomousEvidence`,
`outstandingOperatorWork`, and `outstandingMarketConditionWork` from the
checkpoint so skipped refresh logs preserve blocker ownership. It also copies
`autonomousEvidenceHandoff` so observation-span blockers preserve their gap,
timeline, next review time, and refresh command. It also copies
`operatorLiveReadinessHandoff` from the checkpoint summary so skipped refresh
logs still show the private-account blockers, deficits, hard stops, and review
commands needed before live startup can be considered. It also copies
`marketConditionHandoff` so market execution-quality blockers preserve the
current-entry snapshot, spread-control evidence, and review/gate commands. It
also copies `strategyResearchHandoff` so skipped refresh logs retain the
current keep/switch research action without implying live permission. The report
also includes `failedCompletionCriteria` from the latest completion audit, so a
not-due checkpoint still shows which live success gates are failing, plus
`missingRequirementClassification` when the summary classified the remaining
requirements by autonomous evidence, operator prerequisites, market conditions,
and live-readiness gates. `missingRequirementClassificationCounts` gives the
same raw missing-requirement classification as compact bucket counts for quick
log scanning. `outstandingWorkCounts` is the de-duplicated next-work queue count
by autonomous evidence, operator work, and market-condition work; use it to see
how many actionable blocker groups remain, not how many raw requirement strings
were emitted. The due-check
report keeps the checkpoint-provided
`nextReviewDelayMinutes` and the current-time recomputed
`computedNextReviewDelayMinutes` separate. A due checkpoint reports
`decision=run_full_live_goal_refresh` and then executes the full refresh
command. The report includes the due-check `exitCode` (`2` for wait, `0` for
refresh due) and `refreshTrigger` (`not_due`, `checkpoint_flag`, or
`next_review_time`). The due-check also recomputes whether `nextReviewAt` has
arrived, so a just-expired checkpoint cannot keep skipping the full refresh. The
PM2 path also rejects stale checkpoint summaries before it can skip the full
refresh. `sourceCompletionAuditSummary` preserves the raw live-goal status
completion audit next to the checkpoint's broader `completionAuditSummary`; the
due-check fails if that copied source audit no longer matches its criteria IDs
or missing-requirement count. It also fails closed when the top-level
`achieved` flag contradicts
`completionAuditSummary.achieved`, or when an achieved summary still lists
failed completion criteria or checkpoint outstanding work. If both the compact completion audit summary and the
detailed `goalCompletionAuditView` are present, their failed completion criteria
must also agree. The compact classification and outstanding-work counts must
match their backing arrays, otherwise the due-check fails closed instead of
printing stale counts. If `no_missing_requirements` is failed, the due-check
also requires a non-empty `missingRequirementClassification`; an unclassified
missing-requirements failure is treated as an invalid checkpoint rather than a
skippable wait state. If `checkpointPlan.shouldStartLive=true`, the summary
must be achieved with no failed completion criteria and no outstanding
autonomous, operator, or market-condition work; otherwise the due-check fails
closed. If autonomous evidence work remains, the due-check
requires `autonomousEvidenceHandoff.requiredBeforeLiveReview` to match
`checkpointPlan.outstandingAutonomousEvidence`, rejects start-ready handoffs,
and requires the refresh command, next-review time, review trigger, and
recommended autonomous action to match `checkpointPlan`. When
`insufficientObservationSpan` remains, the
handoff must also carry
`readinessGap.observationSpanMinutes` with finite `current`, `required`, and
`remaining` minutes, `passed=false`, and positive remaining span; otherwise the
checkpoint is internally stale and the due-check fails closed. If operator work remains, the due-check also requires
`operatorLiveReadinessHandoff.status=operator_prerequisites_required` and
`operatorLiveReadinessHandoff.requiredBeforeLiveReview` to match
`checkpointPlan.outstandingOperatorWork`, so skipped logs cannot show a stale
operator handoff. It also rejects handoffs that claim
`canStartLiveWithoutOperatorInput=true` while operator work remains, and it
requires handoff `verificationCommands.reviewCommand`, `gateCommand`, and
`pm2StartCommandAfterAllGatesPass` so the skipped-refresh report remains
directly actionable. The operator handoff must also keep hard stops that forbid
running the PM2 live command while `liveReady=false` and forbid `--submit-once`
until the review command and live-goal gate pass. Credential blockers must
carry non-empty `missingSecrets`, and inventory or margin deficit blockers must
carry the corresponding positive deficit amount. Fee-schedule blockers must
carry the applied `feeBudget` bps assumptions. Top-level fee, spot-inventory,
and hedge-venue blockers must also carry their matching `operatorActions`
(`confirm_account_fee_schedule`, `fund_or_verify_spot_inventory`, and
`fund_or_verify_futures_hedge_venue`) so skipped refresh logs remain actionable. The
due-check also fails closed when market-condition work remains but
`marketConditionHandoff.requiredBeforeLiveReview` disagrees with
`checkpointPlan.outstandingMarketConditionWork`, claims market conditions are
start-ready, lacks review/gate commands, or omits spread-control evidence for
`wideDisplayedSpread`. A `wideDisplayedSpread` handoff must not claim
`spreadControl.passed=true`; the summary keeps the source value as `rawPassed`
and marks `blockerActive=true` while the market-condition blocker remains. If
`rawPassed=true` but the blocker remains, the latest funding window must show a
spread-rejection rate above the configured threshold so the exception is tied to
fresh market evidence rather than a stale blocker label. The
process-alignment gate also checks the saved PM2 dump at
`~/.pm2/dump.pm2`, so a stale saved observer command or restart delay blocks the
checkpoint path even when the currently running process is correct. After
changing or restarting this observer, run `npm run pm2:save` so the 10-minute
checkpoint-aware loop survives a PM2 daemon restart.

Spot-perp carry operational proof uses the canonical 72-hour carry report for
markets, notional, and inventory requirements, but live-readiness refresh and
review scripts also pass the matching `*-fee-stress-25bps-latest.json` artifact
as `--fee-budget-report`. This means a private Bithumb account fee of 25 bps is
judged against the same 25 bps fee-stress evidence instead of the optimistic
4 bps baseline report. The proof still blocks live if Binance futures fees are
unavailable, margin is insufficient, spot quote inventory is short, the
observation span is incomplete, or spread control fails. The applied fee budget
is copied into `operationalReadiness.operationalProof.feeBudget` in
`var/reports/live-goal-progress-summary-latest.json` so reviewers can audit
which report removed or retained a fee blocker. The same summary also emits
`operatorLiveReadinessHandoff`, which consolidates private-account blockers,
missing secrets, inventory and margin deficits, the applied fee budget, operator
actions, hard stops, and the review/gate commands that must pass before any PM2
live start can be considered.

The stricter replacement candidate `btc_240m_momentum_min75_candidate_v1` uses
the same managed BTC 240-minute path with `minReturnBps=75`. It is not the
default PM2 live profile. Use it only with a matching BTC 240-minute readiness
artifact that records `candidate.minReturnBps=75` and has completed the same
positive realized paper-exit gate.

The min75 replacement candidate has its own observer so its artifacts do not
overwrite the baseline BTC 240-minute evidence:

```bash
npm run pm2:start:dry-run:btc-240m-momentum-min75-observer
npm run pm2:logs:dry-run:btc-240m-momentum-min75-observer
```

If and only if the min75 readiness artifact later becomes `live_candidate`,
use the min75-specific live gate and PM2 target so the managed service cannot
accidentally start with the baseline min25 readiness:

```bash
npm run dry-run:review-btc-240m-min75-live-ready
npm run pm2:start:live-btc-min75
npm run pm2:status:live-btc-min75
npm run pm2:logs:live-btc-min75
```

The review command runs the min75 readiness gate and the top-level
`dry-run:gate-live-goal-ready` gate without starting PM2. Use it first after
the scheduled reduce-only paper exit. The min75 PM2 live start/restart scripts
also run the same review command and process-alignment audit before PM2
startup, so they refresh min75
readiness before the top-level goal gate. A positive min75 paper exit is
necessary but not sufficient if the current goal-level audit still blocks live.
Do not use the baseline `pm2:start:live-btc`/`pm2:status:live-btc` commands for
min75 review; those target `live-btc-manager`, while min75 must use
`live-btc-min75-manager`.

The `KRW-H` 60-minute momentum path is active again as paper-only research
after the broader 49-market, 35 bps, 500k KRW execution-candidate momentum scan
restored the promotion. It is not live-ready: `KRW-H` is still outside the
current live-allowed infrastructure list, and the candidate must pass forward
signal/risk, paper entry, hold-window exit, and positive realized paper PnL
before any live work.

```bash
npm run pm2:start:dry-run:krw-h-60m-momentum
npm run pm2:logs:dry-run:krw-h-60m-momentum
```

Start/restart now registers the `KRW-H` forward, paper, and
replacement-readiness observers against the execution-compatible momentum scan.
The current `KRW-H` artifacts are:

- `var/reports/h-60m-momentum-top-forward-observation-latest.json`
- `var/reports/h-60m-momentum-paper-observation-latest.json`
- `var/reports/h-60m-momentum-replacement-readiness-latest.json`
- `var/reports/live-goal-status-20260513-current.json`

Replacement readiness artifacts are intentionally separate from the BTC
240-minute readiness path. A replacement may only become a goal-level live
candidate after the exact candidate has passed forward signal/risk checks,
paper entry reconciliation, hold-window exit reconciliation, and positive
realized paper PnL. A historical promotion scan or inactive forward signal is
not enough.
The goal-status observer also reads the latest broader KRW top-50 momentum scan;
if that newer scan has no promotion candidates, it supersedes older narrower
replacement-scan promotions for the next-candidate decision.
The same goal-status observer also attaches the current broader strategy-family
screens: top-50 cross-sectional momentum, top-50 volatility breakout, local
order-flow continuation, 20 bps order-flow absorption/reversion/multihorizon
continuation stress scans, local intraday session edge, local cross-market
lead/lag, top-50 240-minute time-series/cross-sectional momentum, top-50
240-minute reversal, and the current `KRW-STABLE` 60-minute reversal replacement
candidate. These scans are research evidence only; a zero-promotion result keeps
live blocked, while any future promotion still needs executable forward
observation and realized paper exit proof before live.
The KRW-H readiness observer uses the 49-market 35 bps/500k momentum scan, not
the older top-20 promotion scan, so the readiness gate measures the same
execution-cost assumptions used by the current goal-level research scan.

The older non-BTC replacement research path is `KRW-STABLE` 60-minute reversal.
Its historical scan passed train/test/walk-forward promotion gates and initial
forward observation had executable cost below its test-median edge, but live
remains blocked whenever the fresh reversal signal is inactive or current
orderbook cost exceeds expected edge. Keep it as paper-only observation until
signal, paper entry, hold-window exit, and positive realized paper PnL all pass:

```bash
npm run pm2:start:dry-run:stable-60m-reversal
npm run pm2:logs:dry-run:stable-60m-reversal
```

That PM2 chain includes observation, paper session generation, paper position
audit, and replacement readiness. The position audit is expected to emit
`no_open_position` while the signal is inactive; that is a normal waiting state,
not proof of profitability.

The stronger `KRW-PIEVERSE` 60-minute reversal variant uses the same lifecycle
but observes the `lookbackBars=168`, `riskFilter=rv24_below_median` candidate
from the top-50 reversal scan. It has wider historical test-median edge than
`KRW-STABLE`, so goal status ranks it ahead when both readiness artifacts are
fresh, but live remains blocked until the reversal signal, risk filter, paper
entry, hold-window exit, and positive realized paper PnL all pass:

```bash
npm run pm2:start:dry-run:pieverse-60m-reversal-lb168
npm run pm2:logs:dry-run:pieverse-60m-reversal-lb168
npm run dry-run:review-pieverse-60m-reversal-lb168-live-ready
```

The PIEVERSE review command pauses the PIEVERSE dry-run observer so it cannot
write the same artifacts concurrently, runs the same sequential refresh CLI
used by the PM2 observer, waits for that refresh to finish, runs the PIEVERSE
replacement readiness gate with `--require-live-ready`, then runs the top-level
live-goal gate. It restarts only the PIEVERSE dry-run observer afterward. It is
intentionally fail-closed: the command does not set `--live-execution-path-ready`,
because no PIEVERSE live runner is approved yet. A positive realized paper exit
would still require a separately implemented and tested live execution path
before this review can pass.

For spot-perp carry, live-readiness audit treats the PIEVERSE-specific live path
as part of the execution-path proof. The generic carry runner is not enough: the
package scripts must include `pm2:start:live-spot-perp-carry-pieverse` and
`dry-run:review-spot-perp-carry-pieverse-live-ready`, and the PM2 ecosystem app
must reference the PIEVERSE readiness/carry artifacts and `KRW-PIEVERSE`.
Process-alignment checks also restrict live PM2 processes to the app named by
`liveStartupPlan.pm2StartCommand`; spot-perp live start/restart scripts run
that audit after the market-specific review and before PM2 startup. Even after
the goal gate passes, unrelated `live-*` apps remain blocked.

When the live-goal status reports
`processControlPlan.carryResearch.desiredState=recompare_challenger_before_live_review`,
the current carry focus remains blocked for live startup and PM2 alignment only
allows observation/recompare work. `liveStartupPlan.recompareChallengerPlan`
may name the challenger review, manual-validation, and PM2 commands, but those
commands are research-focus guidance only until the challenger independently
clears its live-readiness audit and the global live-goal gate.

The spot-perp live runner also requires a goal-status artifact with an explicit
`completionAudit` object. `completionAudit.achieved` must be true and
`completionAudit.failedCompletionCriteria` must be present as an empty array
before the runner will proceed to environment or network checks. The audit must
also include `missingRequirements: []`, `missingRequirementCount: 0`, and a
`criteria` list containing the core live-goal completion IDs and whose failed
IDs match `failedCompletionCriteria`; missing, positive, or inconsistent values
fail closed. The goal-status artifact must also be generated after the readiness
and carry reports it is authorizing; otherwise the runner fails closed before
environment or network checks.
The cross-exchange relative-value live runner applies the same completion-audit
checks and also requires the goal-status artifact to be generated after the
cross-exchange readiness and operational-proof evidence it authorizes.
The managed BTC live service enforces the same goal-status completion audit
during config loading through `LIVE_GOAL_STATUS_PATH`, and rejects a goal-status
artifact that predates the `LIVE_READINESS_SUMMARY_PATH` readiness summary. For
that reason, BTC live PM2 start/restart scripts refresh BTC readiness before
rerunning the live-goal gate.

After the BTC 240-minute hold window has elapsed, use the same gate as the
post-exit decision command:

```bash
npm run dry-run:gate-btc-240m-live-ready
```

For the stricter min75 path, use the min75-specific gate instead:

```bash
npm run dry-run:gate-btc-240m-min75-live-ready
```

Interpretation:

- exit code 0: the latest readiness artifact is `live_candidate`; only then is
  it valid to review whether to set `LIVE_READINESS_APPROVED=true`;
- live startup also rejects stale readiness artifacts; keep
  `LIVE_READINESS_MAX_AGE_MS` at the default 15 minutes unless the PM2 gate
  cadence is deliberately changed;
- live PM2 targets still require
  `LIVE_TRADING_FEE_SCHEDULE_CONFIRMED=true` and
  `LIVE_TRADING_FEE_ROUND_TRIP_BPS` matching the active Bithumb KRW-BTC account
  fee. BTC 240-minute live startup rejects a fee value above the readiness
  benchmark's `feeRoundTripBps`, and the live service checks private
  order-chance fee data before syncing account state;
- PM2 live targets default approval and fee-confirmation flags to `false`.
  After the gates pass, start live with explicit environment overrides for
  `LIVE_READINESS_APPROVED`, `LIVE_TRADING_FEE_SCHEDULE_CONFIRMED`, and the
  account-specific `LIVE_TRADING_FEE_ROUND_TRIP_BPS`;
- exit code nonzero with `positiveRealizedPaperExitPnl`: the paper lifecycle
  completed mechanically but realized PnL is not positive, so do not start live
  and move the BTC 240m rule back to parameter comparison;
- exit code nonzero with `realizedExitAvailable`, `realizedExitReusePolicy`, or
  `noOpenPaperPositionAfterExit`: the paper lifecycle is still incomplete or
  unreconciled, or the exit proof is not tied to the first reduce-only exit for
  that entry signal, so keep live blocked;
- any reconciliation, depth, spread, or execution-cost blocker means the
  current readiness artifact is not live evidence even if benchmark PnL remains
  positive.

Do not promote a candidate unless the audit reports it under
`recommendation.liveReadyLabels`. `paperOnlyLabels` means the process may
continue collecting evidence, not that it is suitable for live trading.
`observationOnlyLabels` means the candidate has not cleared the paper
profitability prerequisites. A profitable paper candidate must have positive
traded and closed PnL, no open-position carry dependency, and at least 30 closed
trades; smaller positive samples remain observation-only. `discardLabels` means
the candidate failed the BTC benchmark or risk-adjusted excess gates and should
not be used as the next paper focus. The `recommendation.blockerSummary` block aggregates the remaining
closed-trade, cycle-recovery, PnL, BTC-excess, open-risk, and cycle-failure
blockers by label. It also includes latest failed-cycle details by label, and
failure-kind counts when failures were logged by a build that emits structured
command diagnostics. Historical failures that have completed the recovery window
remain visible there and under `observationHealth.state =
recovered_with_historical_failures`, but they are not treated as primary
promotion blockers unless recovery is still incomplete.
The `recommendation.entryGateSummary` block aggregates whether suppressed-entry
evidence supports loosening, shows protective inactivity, or remains
inconclusive. The `recommendation.promotionGates` block repeats the live and
paper gate pass/fail state in JSON for automation that cannot rely only on
process exit codes. When `suppressedOpportunity` reports negative fixed-horizon
shadow PnL or non-positive BTC excess, entry gates should not be loosened based
on reduced inactivity alone.

Persist the same suppressed-entry shadow-pricing diagnostic as an artifact when
reviewing whether inactivity is missed opportunity or risk control:

```bash
npm run dry-run:analyze-suppressed-opportunities -- \
  --reports-root var/paper-sessions-btc-trend \
  --output var/reports/suppressed-opportunities-trend-latest.json
```

Replay the latest stored manifests through the BTC trend profile without
collecting new data:

```bash
npm run dry-run:replay-existing:btc-trend -- --limit 100
npm run dry-run:returns:btc-trend-backfill
```

For paired exit-profile comparisons, replay both profiles with the same
newline-delimited run-id list:

```bash
npm run dry-run:replay-existing:btc-trend -- --run-ids-file var/experiments/run-ids.txt
npm run dry-run:replay-existing:btc-trend-hold -- --run-ids-file var/experiments/run-ids.txt
```

Use `--carry-forward` for paired comparisons that need to match managed PM2
behavior. This passes each session's ending portfolio, open-position metadata,
and marked equity into the next run, so exit-profile changes are measured
against continuous paper exposure instead of isolated one-run scenarios:

```bash
npm run dry-run:replay-existing:btc-trend -- --run-ids-file var/experiments/run-ids.txt --carry-forward
npm run dry-run:replay-existing:btc-trend-hold -- --run-ids-file var/experiments/run-ids.txt --carry-forward
```

Stop the loop:

```bash
npm run pm2:stop:dry-run
```

## Configuration

The service reads `.env` plus process env. The main knobs are:

- `DRY_RUN_ENTRY_PROFILE`
- `DRY_RUN_EXIT_PROFILE`
- `DRY_RUN_SYNTHETIC_EXIT_POLICY`
- `DRY_RUN_LOOP_INTERVAL_SECONDS`
- `DRY_RUN_INITIAL_CASH_KRW`
- `DRY_RUN_LOG_DIR`
- `DRY_RUN_PYTHON_BIN`
- `DRY_RUN_MARKETS`
- `DRY_RUN_WS_SECONDS`
- `DRY_RUN_TRADE_WARMUP_SECONDS`
- `LIVE_READINESS_SUMMARY_PATH` for live mode only

`TRADING_MODE=paper` can remain the repo default. The managed service forces `dry_run` for its own session execution path.

Managed live startup requires the live-goal status file to select the same
strategy family as the PM2 app's `DRY_RUN_ENTRY_PROFILE`. The default BTC 240m
live app accepts only `selectedLiveCandidate.type=btc_240m_momentum`; the
min75 app accepts only `selectedLiveCandidate.type=btc_240m_momentum_min75`.
Paper-only selected-candidate labels remain review evidence and cannot start a
live process.

For the BTC min75 live target, keep approval variables unset until the review
gate passes. When it does pass and the account fee schedule has been checked,
use the same PM2 script with explicit one-shot overrides, for example:

```bash
LIVE_READINESS_APPROVED=true \
LIVE_TRADING_FEE_SCHEDULE_CONFIRMED=true \
LIVE_TRADING_FEE_ROUND_TRIP_BPS=20 \
npm run pm2:start:live-btc-min75
```

Entry profiles:

- `v1`: current microstructure momentum profile
- `exploratory_smoke`: looser paper-only smoke profile
- `btc_trend_v1`: explicit BTC-only trend-follow experiment that measures 5m
  trend exposure without requiring buy-notional-share confluence. Its depth gate
  is aligned with the runtime liquidity guard to avoid generating signals that
  the order manager will reject.
- `btc_trend_low_buffer_v1`: BTC-only ret-hurdle sensitivity profile. It keeps
  the same market and microstructure gates as `btc_trend_v1`, but lowers the
  entry cost buffer from 6 bps to 2 bps to test whether missed positive BTC
  windows are caused by an overly strict `ret_5m_bps` gate. Treat it as an
  experiment profile, not a live default.
- `btc_trend_flow_confirm_v1`: BTC-only entry-quality sensitivity profile. It
  changes only the BTC trend entry by requiring `buy_notional_share_60s >= 0.63`
  so paired replays can test whether restoring buy-flow confluence improves
  expectancy. Treat it as an experiment profile, not a live default.
  The 203-run paired carry-forward replay in
  `var/paper-sessions-btc-trend-flow-confirm-hold-carry-pm2` did not improve
  live readiness: traded PnL remained negative and closed trades fell from 11
  to 10, so this profile is measured evidence, not a live candidate.
- `btc_trend_ret1_confirm_v1`: BTC-only entry-quality experiment that keeps the
  BTC trend profile but requires `ret_1m_bps >= 4.6`. In the 718-run
  carry-forward sidecar replay it reduced loss versus `btc_trend_v1`, but still
  had negative traded and closed PnL with only 11 closed trades.
- `btc_trend_ret1_turnover_cap_v1`: BTC-only observation candidate that combines
  `ret_1m_bps >= 4.6` with `turnover_24h_krw <= 90B`. In the 718-run
  carry-forward sidecar replay it reduced total loss to near breakeven and
  produced positive closed-trade PnL, but still had negative traded PnL and only
  6 closed trades. Treat it as observation-only until audit gates pass.
- `btc_trend_turnover_cap_replay_v1`: BTC-only replay experiment from the
  repaired audit trade-path diagnostic. It keeps `btc_trend_v1` unchanged except
  for `turnover_24h_krw <= 90199374711.13681`. It is intentionally not a managed
  PM2/live profile; use it only with explicit replay and audit its output before
  considering any runtime candidate.
- `btc_trend_turnover_cap_path_replay_v1`: BTC-only replay experiment from the
  path-cohort diagnostic. It keeps `btc_trend_v1` unchanged except for
  `turnover_24h_krw <= 63092167042.41634`. Its 718-run carry-forward replay
  still had negative traded and closed PnL with only 12 closed trades, so it is
  also not a managed PM2/live profile.
- `btc_trend_strong_depth_replay_v1`: BTC-only replay experiment from the
  actual buy-fill fixed-horizon diagnostic. It keeps `btc_trend_v1` unchanged
  except for `depth_ratio_l5 >= 22.307692`. It is replay-only and rejected by
  the managed PM2/live config path.
- `high_buy_flow_replay_v1`: multi-market replay experiment from the legacy-root
  trade-path diagnostic. It keeps `v1` gates but requires
  `buy_notional_share_60s >= 0.944165`. It is replay-only and rejected by the
  managed PM2/live config path.

The `dry-run-btc-trend-manager` PM2 app writes to
`var/log/dry-run-btc-trend-service` and `var/paper-sessions-btc-trend`, so its
evidence can be compared against the `v1` confirm3 baseline without sharing
portfolio state.

The `dry-run-btc-trend-hold-manager` PM2 app is a paper-only hold candidate. It
uses `btc_trend_v1` entries with `balanced_v1_book_confirm3_trend_hold`, which
defers the 15-minute time stop while the current 5-minute BTC return is still
positive. It writes to `var/log/dry-run-btc-trend-hold-service` and
`var/paper-sessions-btc-trend-hold`.

The `dry-run-btc-trend-hold-guarded-manager` PM2 app uses the guarded hold
profile and writes to `var/log/dry-run-btc-trend-hold-guarded-service` and
`var/paper-sessions-btc-trend-hold-guarded`, keeping its evidence separate from
the unguarded hold run.

The `dry-run-btc-trend-ret1-turnover-cap-manager` PM2 app uses
`btc_trend_ret1_turnover_cap_v1` with `balanced_v1_book_confirm3`. It writes to
`var/log/dry-run-btc-trend-ret1-turnover-cap-service` and
`var/paper-sessions-btc-trend-ret1-turnover-cap`. This is a paper-only
observation candidate for collecting enough closed-trade evidence to decide
whether the sidecar improvement survives live data collection.

For paired replay experiments, `balanced_v1_book_confirm3_trend_hold_guarded`
keeps the same positive-trend time-stop deferral but caps that deferral at 30
minutes. This is an explicit paper experiment for measuring whether hold
improvements are real or just open-position risk migration.

The default dry-run flow now supports exit experimentation without touching the live-blocked runtime:

- `DRY_RUN_EXIT_PROFILE=core_safe|balanced_v1|balanced_v1_book_confirm2|balanced_v1_book_confirm3|balanced_v1_book_confirm3_trend_hold|balanced_v1_book_confirm3_trend_hold_guarded|experimental_decay`
- `DRY_RUN_SYNTHETIC_EXIT_POLICY=force_bid|mark_mid|carry_open`

`carry_open` is the realistic default for managed paper evidence. `force_bid`
and `mark_mid` are explicit synthetic-close sensitivity tests, not live-readiness
baselines.
