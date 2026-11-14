---
name: tinybird-migration-test
description: Test deploying a changed Tinybird schema over a populated analytics_events on Tinybird Local using the SDK's tinybird deploy. Use when checking a forwardQuery or backfill, a schema migration, or that a deploy over existing data works. Trigger patterns include forwardQuery backfill, migration test, deploy over populated table, tinybird deploy local.
---

# Tinybird migration test (local)

Use for: a `forwardQuery`, backfill or schema change deployed over a
populated `analytics_events`. Not for cloud or production deploys, and not
for CI. Prerequisites: Docker (OrbStack) running, `tb` installed,
`pnpm install` done, repo root as working directory.

Follow `ops/migration-backfill-test.md` step by step. This skill adds the
rules an agent must not skip.

## Rules

1. Only Tinybird Local. `TINYBIRD_HOST` must be `http://localhost:7181`.
   `tinybird deploy` deploys to the main workspace of the given host, so
   any other host is a production deploy. Refuse and stop if unsure.
2. Never deploy from this template repo to Trival or production Tinybird.
3. Use a new workspace named `sdk_deploy_probe`. Do not reuse a branch
   workspace, and do not use `tb --local deploy`: it uses a temporary
   workspace and token, which is not the SDK path.
4. Keep scratch files in the session scratchpad, not in the repo.
5. Report what was observed: deployment numbers, quarantined rows, the
   backfilled values. State the scale (row count) tested.

## Steps

1. Start Tinybird Local and wait for `/tokens` to return 200.
2. Create the probe workspace and read its admin token.
3. Deploy the old schema from a scratch SDK project, seed rows, then
   deploy the current `apps/tinybird` project over it.
4. Check `reception_timestamp = timestamp` on the old rows (required).
5. `tb local stop`. If the instance is kept, delete the probe workspace and
   confirm by listing workspaces: DELETE may return 500 although it worked.

Before deploying, echo `TINYBIRD_HOST` and confirm it is exactly
`http://localhost:7181`. Read "Failure modes seen" in the runbook first.

## Pass criteria

`Deployment #1 is live!`, `quarantined_rows: 0`, `Deployment #2 is live!`,
and every seeded row backfilled. Anything else is a failure: report it.

## Report

`deployments: #1,#2 | quarantined_rows: N | backfill check: pass/fail |
scale: N rows`
