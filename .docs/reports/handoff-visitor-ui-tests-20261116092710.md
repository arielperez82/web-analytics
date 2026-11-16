# Handoff: visitor-ui-tests

## Objective

Visitor counting on new definitions; the dashboard UI must not calculate (`apps/dashboard/AGENTS.md`).
PR #58 (`feat/visitor-endpoints`) is open, CI green at 4df4d92, not merged.

## Progress

- In-flight: component tests (testing-library, fake fetch). Done: Kpis, 9 tests, mutation-checked, dba9f53, pushed.
  Not done: RankedTable and ConversionsPanel tests.
- Blocked: none.

## Key Anchors

- `apps/dashboard/src/components/Kpis.test.tsx` :: pattern to copy (card helper, fixtures unlike derivable values)
- `apps/dashboard/src/test/fake-api.ts` :: installFakeApi, removeFakeApi, requestsTo(endpoint)
- `apps/dashboard/src/components/RankedTable.tsx` :: bar_percent widths, signed growth, onPick, Show more
- `apps/dashboard/src/components/ConversionsPanel.tsx` :: conversion_summary headline, API row order
- `apps/dashboard/AGENTS.md` :: standing rule

## Decision Rationale

- Fake fetch via `vi.stubGlobal`, no module mocks (fakes over mocks).
- No expand-contract: nobody uses the dashboard, so `kpis` was deleted.
- Cards respond to location, device and browser: `visitor_counts` reads hits when filtered, state otherwise.

## Next Steps

1. RankedTable tests: bars from bar_percent, signed growth, row pick, (direct) label, Show more. Mutation-check.
2. ConversionsPanel tests: headline from summary not rows, rate, row order.
3. Then Playwright specs for the overview (user asked for these after component tests).
4. Then: ESLint ban on UI arithmetic; web-vitals `days` to date_from/date_to (`time-range.ts`);
   bot exclusion in top_*, channels, conversions and the pages, sessions, sources views; include_bots toggle; hourly chart.
5. Merge #58 only when the user asks.
6. Rules: Tinybird Local only (`tb local start`, then one manual `tinybird build --local`); never deploy to Trival or
   production; commits end with the Co-Authored-By and Claude-Session lines; never `--no-verify`.

## Open Questions

- Hourly view for single-day ranges: restore through the API? User undecided.
- First build on a fresh Tinybird Local often fails; cause UNKNOWN.
