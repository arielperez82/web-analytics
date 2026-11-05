# E2E tests (Tinybird Local)

These tests ingest events into a real Tinybird Local workspace and query the
deployed pipes over HTTP. They do not depend on fixture dates: every test
ingests its own events with timestamps relative to now, under a unique
`tenant_id` and `domain`, so tests never collide and never go stale.

## Prerequisites

- Docker
- Tinybird CLI (`tb`) v5 or later
- Tinybird Local running: `tb local start`

## Run

```bash
pnpm test:e2e
```

The global setup:

1. runs `tb build` in `tinybird/` to deploy the project to Tinybird Local
2. reads the API host from `tb --output json info`
3. reads the workspace admin token from `tb token ls`
4. waits until Tinybird answers `SELECT 1`

Tinybird Local scopes resources to a workspace per git branch, so the token
must come from `tb token ls` (the unauthenticated `/tokens` endpoint returns
the default workspace, which does not contain this project's datasources).

To target another instance, set both `TB_HOST` and `TB_TOKEN`. The setup then
skips `tb build` and the CLI lookups, so the project must already be deployed
there.

## Layout

- `helpers/factories.ts`: event row factories (relative timestamps, unique ids)
- `helpers/tinybird-client.ts`: ingest NDJSON with `wait=true`, query pipes
- `helpers/tinybird-env.ts`: host and token resolution
- `helpers/wait-for-row.ts`: polling helper for eventually-consistent reads
- `*.e2e.test.ts`: one file per pipe
- `helpers/*.test.ts`: unit tests for the helpers (use plain fakes)

## Not in the default `pnpm test`

E2E needs a running container and is slower than the unit tests, so it is a
separate command.
