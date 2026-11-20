<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Standing rule: the UI does not calculate

Every number the dashboard shows, and every figure derived from other figures, comes from the API: totals, averages,
rates, percentages, growth against a previous period, shares, ranks, and the ratios used to size bars. The UI renders
what it receives.

- Allowed: formatting (locale, units, display precision through `Intl`), layout, sorting rows the API already ranked
  only when the API gives no order, and choosing which endpoint to call for which range.
- Also allowed: display scaling. Chart axis ticks and label spacing are chosen in the UI (`src/lib/chart-axis.ts`) from
  the range of the rows the API returned. Ticks are labels, not figures: bar heights still come from the API's
  `bar_percent`, and no tick is ever shown as a measurement.
- Also allowed on the dashboard server, never in the client: arranging what several endpoint calls return into one
  shape for the screen. `GET /api/series` fetches a series and its comparison range, aligns them by position and
  leaves a missing counterpart empty (`src/lib/series-loader.ts`, `src/lib/series-comparison.ts`). It does not sum,
  average or derive a figure; the client only renders what it receives, scaling the line chart to the values it was
  given the way it scales axis ticks.
- Not allowed: adding, averaging, dividing or comparing values from the API, including across rows. A range total comes
  from one call over the whole range, never from summing per-day rows.
- If a screen needs a figure no endpoint returns, add or extend an endpoint (with an acceptance test) before writing
  the screen.
- The line is between preparing a request and building a figure. Arithmetic for request parameters (date ranges,
  paging, clamping a limit) is fine. Combining API results into something shown to the user is not, because two clients
  could then show conflicting numbers.
- `pnpm lint:ui-arithmetic` (`eslint.ui-arithmetic.config.js`) catches the common shapes in `components/` and `app/`:
  arithmetic or `Math` around `Number(...)` of an API value, and `reduce`. It cannot see intent, so review still applies.
