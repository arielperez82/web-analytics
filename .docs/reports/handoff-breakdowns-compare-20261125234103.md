# Handoff: breakdowns-compare

## Objective

See GH issue #113 (breakdowns show previous period; compare is global). Branch `feat/breakdowns-compare`.

## Progress

- Done: `9351ad1` refactor, five `top_*` pipes into one `rankedEndpoint` generator (SQL byte-identical).
- In-flight: `c7bccdd` RED acceptance tests in `acceptance/tinybird/top-lists.acceptance.test.ts`. Not run yet; they
  should fail.
- Next GREEN in `rankedEndpoint`:
  - compare params;
  - UNION ALL + GROUP BY for both periods;
  - `status` (`new`/`gone`/`''`), `sessions_change` (Int64), `previous_bar_percent`;
  - common bar scale;
  - order `sessions DESC, previous_sessions DESC, label ASC`.

## Key Anchors

- `apps/tinybird/src/endpoints.ts` :: `rankedEndpoint`, `periodDataSql`, `barPercentNode`
- `apps/tinybird/src/window.ts` :: add a NEW `comparedWindowSql`. Do NOT change `previousWindowSql`, which
  `visitor_counts` and `engagement` share.
- `apps/dashboard/src/components/RankedTable.tsx`: delta column + ghost bar
- `apps/dashboard/src/lib/endpoint-proxy.ts`: forward `compare_from`, `compare_to`, `compare_from_at`
- `apps/dashboard/src/components/Shell.tsx`: CompareControl, gated to overview, must also show on reports

## Decision Rationale

- **User chose the row design:** delta column ("+12 (+8%)", KPI style) plus a ghost bar for the previous period. Rows
  only in the current period say "New". Rows only in the previous period are listed last as "Gone (was N)".
- **UNION, not FULL JOIN:** ClickHouse defaults collide with the `''` (direct) label. The sources test pins this.
- **Compare window separate from `previousWindowSql`:** `visitor_counts` tags rows by `current_start_at`, so a
  non-adjacent window would break the KPIs.

## Next Steps

1. GREEN the API. Run `pnpm test:acceptance:tinybird` against the local tb-demo only; never deploy. Commit.
2. Check how SDK `output` handles columns that only exist in the compare branch.
3. Proxy params plus a proxy acceptance case.
4. UI, TDD:
   - `RankedTable` takes `comparison` (overview and detail; none when compare is off);
   - reuse `formatSignedNumber`, `deltaOf`, Badge;
   - ghost bar `aria-hidden`, previous value in screen-reader text.
5. Show CompareControl on reports. Update the "a report offers no comparison choice" acceptance test, and note in the
   PR that this reverses the earlier gate.
6. Playwright: delta on/off, last week sends compare params, 375px no sideways scroll.
7. Review gate (diff mode), PR, CI. Ask the user before merging.

## Open Questions

- File a GH issue: KPI cards ignore the compare choice and need `visitor_counts` tagging reworked. Not filed yet.
- Channels has `previousPeriod: false`, so it stays without a comparison. Tell the user.
