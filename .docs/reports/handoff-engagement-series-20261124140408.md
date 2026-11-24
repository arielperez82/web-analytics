# Handoff: engagement-series

## Objective

Bounce rate + Avg session sparklines from new raw-table pipes (MV later). Branch feat/engagement-series, worktree
web-analytics-ds. Tracked via GH issues, not Beads.

## Progress

- Done+pushed: Tinybird daily/hourly_engagement_series (13 acceptance tests + card-agreement test, local TB), proxy
  allowlist + all-time clamp, loader returns series.bounce_rate / avg_session (engagement failure drops only those).
  486 unit tests pass.
- In-flight: client. Trend type in lib/metrics.ts not yet used by use-series.ts / Kpis.tsx.
- Open PRs: #100 (focus restore, abort-race fix, SpeedInsights retry test) unreviewed, CI unchecked, unmerged.
- No PR yet for feat/engagement-series. tdd.bypass still 1 (user: /guard:config tdd.bypass 0, tdd on).

## Key Anchors

- `apps/tinybird/src/endpoints.ts` :: dailyEngagementSeries, hourlyEngagementSeries
- `apps/dashboard/src/lib/series-loader.ts` :: trendsOf, ENGAGEMENT
- `apps/dashboard/src/lib/metrics.ts` :: TRENDS, Trend
- `apps/dashboard/src/components/Kpis.tsx` :: pick(), StaticCard (Bounce/Avg cards)
- `apps/dashboard/src/lib/use-series.ts` :: MetricSeries (Metric-keyed; needs Trend)

## Decision Rationale

- Separate pipes, not columns on *_series: different source (raw scans) and failure isolation; user agreed.
- Sessions dated by first page view, 1-day lookback, earlier-start sessions excluded.

## Next Steps

1. TDD: MetricSeries keyed by Trend; Bounce/Avg cards get sparklines (Sparkline needs no change); acceptance stub in
   acceptance/dashboard/support.ts adds the two trends.
2. Run MANAGE_TB_LOCAL=1 vitest on acceptance/tinybird/series-loader.acceptance.test.ts (loader now calls engagement
   pipes; NOT yet run).
3. Open PR, CI, /review:review-changes --mode diff; ask user before merging.
4. Check CI + review + merge decision for #100.

## Open Questions

- Keep stale sparklines on failed refresh? (kept so far)
- Never run check:tinybird (hits main workspace); local build: TINYBIRD_TOKEN from localhost:7181/tokens + tinybird
  build --local.
