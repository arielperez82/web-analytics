---
name: tinybird-migration-test
type: skill
description: Test deploying a changed Tinybird schema over a populated analytics_events on Tinybird Local using the SDK's tinybird deploy. Use when checking a forwardQuery or backfill, a schema migration, or that a deploy over existing data works. Trigger patterns include forwardQuery backfill, migration test, deploy over populated table, tinybird deploy local.
---

# Tinybird migration test (local)

Follow `ops/migration-backfill-test.md` step by step. This skill adds the
rules an agent must not skip.

## When to use

A `forwardQuery`, backfill or schema change deployed over a populated
`analytics_events`.

## When not to use

Cloud or production deploys, and CI.

## Preconditions

Docker (OrbStack) running, `tb` installed, `pnpm install` done, repo root
as working directory. Read "Failure modes seen" in the runbook first.

## Rules

1. Refuse any host other than Tinybird Local: `TINYBIRD_HOST` must be
   exactly `http://localhost:7181`. Stop if unsure. `tinybird deploy`
   deploys to the main workspace of the given host, so any other host is a
   production deploy. Echo `TINYBIRD_HOST` before every deploy.
2. Deploy only to Tinybird Local, never from this template repo to Trival
   or production Tinybird.
3. Use the SDK's `tinybird deploy` and a new workspace named
   `sdk_deploy_probe`. `tb --local deploy` builds in a temporary workspace
   with its own token, so a pass there would not exercise the SDK deploy
   path. Do not reuse a branch workspace.
4. Keep scratch files in the session scratchpad, not in the repo.
5. Report what was observed: deployment numbers, quarantined rows, the
   backfilled values. State the scale (row count) tested.

## Steps

1. Start Tinybird Local in the background and poll `/tokens` until it
   returns 200: `tb local start` can exceed a two-minute tool timeout.
2. Create the probe workspace and read its admin token. If
   `sdk_deploy_probe` already exists, delete it first (step 5) or stop and
   ask.
3. Deploy the old schema from a scratch SDK project, seed rows, then
   deploy the current `apps/tinybird` project over it.
4. Check `reception_timestamp = timestamp` on the old rows (required).
5. `tb local stop`. If the instance is kept, delete the probe workspace and
   confirm by listing workspaces: DELETE may return 500 although it worked.

## Verification criteria

`Deployment #1 is live!`, `quarantined_rows: 0`, `Deployment #2 is live!`,
and every seeded row backfilled. Anything else is a failure: report it.

## Output format

`deployments: #1,#2 | quarantined_rows: N | backfill check: pass/fail |
scale: N rows`

## Example

`deployments: #1,#2 | quarantined_rows: 0 | backfill check: pass |
scale: 1 row`

## Postconditions

Tinybird Local stopped or the probe workspace removed, no scratch files in
the repo, and the report above delivered.
