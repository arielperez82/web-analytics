# Tinybird acceptance tests (Tinybird Local)

These tests ingest events into a real Tinybird Local workspace and query the
deployed pipes over HTTP. They do not depend on fixture dates: every test
ingests its own events with timestamps relative to now, under a unique
`tenant_id` and `domain`, so tests never collide and never go stale.

## Prerequisites

- Docker
- Tinybird Local running (or let `pnpm test:acceptance:tinybird:local` start it with the
  Tinybird CLI `tb` v5 or later)

## Run

One command that starts Tinybird Local if needed, runs the suite, and stops
it again (an instance that was already running is left running):

```bash
pnpm test:acceptance:tinybird:local
```

Or, with Tinybird Local already running:

```bash
pnpm test:acceptance:tinybird
```

The global setup:

1. runs `tinybird build --local` (Tinybird TypeScript SDK) in `apps/tinybird/` to
   deploy the project to Tinybird Local
2. reads the workspace name the SDK built into from the build output
3. fetches that workspace's admin token from the Local API
4. waits until Tinybird answers `SELECT 1`

Tinybird Local scopes resources to a workspace per git branch, so the token
must belong to the workspace the SDK just built into (the default workspace
token from `/tokens` does not contain this project's datasources).

To target another instance, set both `TB_HOST` and `TB_TOKEN`. The setup then
skips the build and the lookups, so the project must already be deployed
there.

## Layout

- `helpers/factories.ts`: event row factories (relative timestamps, unique ids)
- `helpers/tinybird-client.ts`: ingest NDJSON with `wait=true`, query pipes
- `helpers/tinybird-env.ts`: host and token resolution
- `helpers/wait-for-row.ts`: polling helper for eventually-consistent reads
- `*.e2e.test.ts`: one file per pipe
- `helpers/*.test.ts`: unit tests for the helpers (use plain fakes)

## Writing tests

Test behavior, not implementation. Each test states one outcome a dashboard
user can see, and queries the endpoint only.

- Name a test by its outcome, for example "a visit counts once however many
  pages it viewed". Do not name columns, queries, or tables.
- Do not read internal tables or depend on how a result is computed.
- Mention an internal detail only for a corner case, and say why in the test
  name.
- Isolate each test with `createScope`. Never depend on fixture dates.

## Not in the default `pnpm test`

E2E needs a running container and is slower than the unit tests, so it is a
separate command. It does not run in pre-commit; run `pnpm test:e2e` manually
when changing pipes. CI runs it on every pull request and push to `main`
(`.github/workflows/e2e.yml`).
