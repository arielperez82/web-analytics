# Handoff: dashboard-review-fixes

## Objective

Work through user's first dashboard review (8 points + naming). Standing rules: UI does not combine API results
into figures (display scaling like axis ticks is allowed); merge only when asked; never `--no-verify`.

## Progress

- Merged: #58-#61 (earlier), #62 Sessions/Anonymous rename, #63 quick fixes, #64 axes.
- In-flight: PR #65 `feat/chart-controls` OPEN, unmerged, GitHub checks not yet viewed. Has layout (one
  Breakdowns section), Day/Hour toggle (right) + metric keys (left), `grain=` URL state, plain names (Pages,
  Sources), per-panel "Click a row to filter" hint. Local: unit 180, Playwright 24 green.
- Not done: point 5, one conversions panel per goal. User has NOT answered where it goes (I propose just under
  the chart; panel says it ignores device/location/browser filters).
- Blocked: none.

## Key Anchors

- `apps/dashboard/src/components/Kpis.tsx` :: chart controls, axes, cards
- `apps/dashboard/src/lib/grain.ts` :: effectiveGrain, hourAvailable (hour max 7 days, API limit)
- `apps/dashboard/src/lib/chart-axis.ts` :: yTicks, xLabels (UI display logic)
- `apps/dashboard/src/app/(dash)/OverviewView.tsx` :: overview layout; goals from `DASHBOARD_GOALS` (max 10)
- `scripts/ci/with-tinybird-local.sh` :: run Tinybird suites locally (act cannot: it sets service cwd to host path)

## Decision Rationale

- Sessions + Anonymous visitors: visits/visitors collided; stored MV column `visits` and
  `visitor_class='daily'` kept (no migration).
- Show Known and Anonymous side by side, never one toggle or a sum: units differ (distinct vs
  person-days).
- Ticks in UI: user ruled display concern; bar heights still from API `bar_percent`.

## Next Steps

1. Check #65 checks; merge only if user says so.
2. Point 5: per-goal conversions panels (confirm placement first). Goals that are events, not just
   paths, need an API change; keep that separate.
3. Seed script is not in the repo: scratchpad `seed-demo.mts` under
   `/private/tmp/claude-501/-Users-ariel-projects-web-analytics/6868cc6b-abaf-4c74-92e2-f0ea28212c27/scratchpad/`
   (may be gone). Commit as `scripts/dev/seed-demo.ts` plus a launcher. The tb-demo container and next dev on :3100
   may still run (`docker rm -f tb-demo; pkill -f "next dev --port 3100"`).
4. Tinybird suites: wrap `pnpm run test:acceptance:tinybird` in the helper. Dashboard:
   `pnpm run test:acceptance:dashboard`.

## Open Questions

- Conversions placement (above or below breakdowns)? Unanswered.
- TDD write-hook: new files are blocked until a RED test run refreshes its cache (passing runs do not).
  Do not edit hook or cache.
- Flaky first Tinybird Local build: unreproduced; `setup` exits 1 once then respawns (suspect).
