# Dashboard acceptance

The real dashboard in a real browser (Playwright, `next dev` on port 3101, dist dir `.next-acceptance`), with
`/api/endpoints/*` answered by the test. No Tinybird is needed: the tests pin what the UI does with the figures it is
given, so the numbers in a fixture are deliberately unlike anything derivable from each other.
A running `next dev` adds `.next-acceptance` types to `apps/dashboard/tsconfig.json`; that edit is committed.

```bash
pnpm test:acceptance:dashboard
```
