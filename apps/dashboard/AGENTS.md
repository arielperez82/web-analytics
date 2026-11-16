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
- Not allowed: adding, averaging, dividing or comparing values from the API, including across rows. A range total comes
  from one call over the whole range, never from summing per-day rows.
- If a screen needs a figure no endpoint returns, add or extend an endpoint (with an acceptance test) before writing
  the screen.
- Enforced by `pnpm lint:ui-arithmetic` (`eslint.ui-arithmetic.config.js`) in `components/` and `app/`: no arithmetic
  operators, `reduce` or `Math` there. `lib/` is not policed; keep it to formatting, ranges and ordering.
