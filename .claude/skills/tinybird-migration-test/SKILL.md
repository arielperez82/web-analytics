---
name: tinybird-migration-test
type: skill
description: Test deploying a changed Tinybird schema over a populated analytics_events on Tinybird Local using the SDK's tinybird deploy. Use when checking a forwardQuery or backfill, a schema migration, or that a deploy over existing data works. Trigger patterns include forwardQuery backfill, migration test, deploy over populated table, tinybird deploy local.
allowed-tools:
  - Read
  - Write
  - Bash(tb local start:*)
  - Bash(tb local stop:*)
  - Bash(pnpm exec tinybird deploy:*)
  - Bash(curl *localhost:7181*)
  - Bash(jq:*)
  - Bash(git show:*)
  - Bash(mkdir:*)
  - Bash(ln:*)
  - Bash(echo:*)
---

# Tinybird migration test (local)

Follow `ops/migration-backfill-test.md` step by step. This skill adds the
rules an agent must keep, a worked example of a passing run, and the
criteria for calling the run a pass.

## When to use

A `forwardQuery`, backfill or schema change deployed over a populated
`analytics_events`.

## When not to use

Cloud or production deploys, and CI.

## Preconditions

Docker (OrbStack) running, `tb` installed, `pnpm install` done, repo root
as working directory. Read "Failure modes seen" in the runbook first.

## Rules

1. Deploy only to Tinybird Local. Set `TINYBIRD_HOST` to exactly
   `http://localhost:7181` and echo it before every deploy. Stop if unsure:
   `tinybird deploy` targets the main workspace of whatever host it gets,
   so any other host is a production deploy.
2. Keep every deploy inside Tinybird Local. This template repo never
   deploys to Trival or production Tinybird.
3. Run the SDK's `tinybird deploy` in a new workspace named
   `sdk_deploy_probe`. `tb --local deploy` builds in a temporary
   workspace with its own token, so a pass there does not exercise the SDK
   deploy path. Leave branch workspaces alone.
4. Put scratch files in the session scratchpad, outside the repo, so the
   repo stays clean.
5. Report the deployment numbers, quarantined rows, backfilled values and
   the row count tested, so the reader knows the scale the result covers.

## Steps

1. Start Tinybird Local in the background and poll `/tokens` until it
   returns 200: `tb local start` can exceed a two-minute tool timeout.
2. Create the probe workspace and read its admin token. If
   `sdk_deploy_probe` already exists, delete it first (step 5) or stop and
   ask.
3. Deploy the old schema from a scratch SDK project, seed rows, then
   deploy the current `apps/tinybird` project over it.
4. Check `reception_timestamp = timestamp` on the old rows (required).
5. Run `tb local stop`. If the instance is kept, delete the probe
   workspace and confirm by listing workspaces: DELETE may return 500
   although it worked.

## Worked example (passing run)

Setup: SDK 0.0.84, `tb` 5.0.3, one seeded row.

1. `tb local start` ran past the tool timeout; polling `/tokens` returned
   200 once the container was healthy.
2. `POST /v1/workspaces` with `name=sdk_deploy_probe`; the admin token came
   from `GET /v1/user/workspaces`. The `workspace_admin_token` from
   `/tokens` belongs to another workspace and is the wrong token.
3. Scratch project (`tinybird.json`, `node_modules` symlinked to
   `apps/tinybird/node_modules`, `src/datasources.ts` with only the old
   `analytics_events`), then, with `TINYBIRD_HOST=http://localhost:7181`
   and `TINYBIRD_TOKEN` set to the probe token:
   `pnpm exec tinybird deploy` printed `Deployment #1 is live!`.
4. `POST /v0/events?name=analytics_events&wait=true` returned
   `{"successful_rows":1,"quarantined_rows":0}`.
5. The same `pnpm exec tinybird deploy` from `apps/tinybird` printed
   `Deployment #2 is live!` after 55.6 seconds.
6. `SELECT timestamp, reception_timestamp FROM analytics_events` returned
   `2025-01-15 10:00:00` and `2025-01-15 10:00:00.000`.
7. `tb local stop`; the DELETE of the probe workspace returned 500 and the
   workspace list no longer showed it.

Report: `deployments: #1,#2 | quarantined_rows: 0 | backfill check: pass |
scale: 1 row`.

A failing run looks like `quarantined_rows` above 0, no `Deployment #2`
line, or a `reception_timestamp` that differs from `timestamp`.

## Verification criteria

`Deployment #1 is live!`, `quarantined_rows: 0`, `Deployment #2 is live!`,
and every seeded row backfilled. Anything else is a failure: report it.

## Output format

`deployments: #1,#2 | quarantined_rows: N | backfill check: pass/fail |
scale: N rows`

## Postconditions

Tinybird Local stopped or the probe workspace removed, no scratch files in
the repo, and the report above delivered.
