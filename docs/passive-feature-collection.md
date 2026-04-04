# Passive Feature Collection

## Scope

The first milestone keeps passive feature collection narrow and replayable:

- source of truth is the run-scoped canonical store under `var/data/canonical/`
- passive features are derived into `passive_feature_snapshot`
- the marketwise distribution report is rebuilt from the same run id

## Recommended 7-day run

Use the default paper universe and keep websocket capture continuous enough to support the 60-second flow window:

```bash
python -m org_coin_data bootstrap \
  --markets KRW-BTC,KRW-ETH,KRW-XRP \
  --ws-seconds 60 \
  --iterations 10080 \
  --interval-seconds 0
```

Operational notes:

- Treat KST dates as the reporting boundary. Start shortly before a KST day boundary when you need a clean 7-day window.
- Rebuild the derived artifact at any time with `python -m org_coin_data build-passive-feature-report --run-id <run-id>`.
- The derived report exposes `threshold_tuning_ready`. It stays `false` until each market covers at least 7 distinct KST dates.

## Threshold policy

Smoke-test or partial-window output is for pipeline validation only.

- Do not adjust entry or exit thresholds from a smoke test.
- Do not adjust thresholds from any run where `threshold_tuning_ready=false`.
- Use the report only after the full 7-day KST window is present for every market in scope.
