# Handoff: dashboard-channels-conversions

## Objective

Splice dashboard (Tinybird): show channels + conversions in the dashboard. No charter or beads DB here.

## Progress

- Merged: #27 proxy+CI, #28 client goals, #29 test layers, #30 conversions endpoint. Cloud deployment 10 lacks #30
  (`tinybird deploy --check` passed; not deployed).
- In-flight: `feat/dashboard-channels-conversions` (pushed, no PR). Done: `goals.ts`. Left: proxy, reports, UI, wiring.
- Blocked: none.

## Key Anchors

- `dashboard/src/lib/goals.ts` :: parseGoals, isValidGoalPath (shared by config + proxy)
- `dashboard/src/lib/endpoint-proxy.ts` :: ALLOWED_ENDPOINTS, FORWARDED_PARAMS
- `dashboard/src/lib/reports.ts` :: REPORTS (add channels)
- `dashboard/src/components/RankedTable.tsx` :: detail "vs previous" column
- `dashboard/src/app/(dash)/OverviewView.tsx` :: panels; `page.tsx` is where env goals load

## Decision Rationale

- Goals = `DASHBOARD_GOALS` JSON `[{name,path}]`; bad entries dropped, errors shown (alt: fail whole config, rejected).
- `goal_path` bans `%`, `?`, `#`: Tinybird mangles `%` in params; pathnames are compared decoded.
- Channels/conversions ignore device/location/browser filters: show a note, not silent.

## Next Steps

1. Proxy: allow `channels`, `conversions`; forward `goal_path`; 400 if `isValidGoalPath` fails; test that a pinned
   tenant ignores a caller `tenant_id` for conversions (review S1).
2. `reports.ts`: channels report with `previousPeriod: false` so detail hides "vs previous".
3. One conversions panel per goal (hook per component), pure summarize fn tested; `page.tsx` reads goals and
   shows errors; README + `.env.example`.
4. Deploy #30 first: `tinybird deploy --check`, then deploy from main (never behind main).
5. Then Playwright: client acceptance + e2e browser front, one fixture page, dashboard via `next dev`.

## Open Questions

- Vercel setup for the proxy: Upstash provisioned, tracker token minted, env vars set? UNKNOWN.
- Rotate `tinybird/.tinyb` tokens and the tokens that appeared in `ps` output (Tinybird MCP, Isy).
- Still open: `like_filter` (#20), client CI job (#25), unique visitors KPI, TDD guard needs `/guard:config`.
