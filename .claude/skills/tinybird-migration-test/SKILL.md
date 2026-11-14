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
rules to keep, a worked example of a passing run and the criteria for
calling a run a pass.

## When to use

Use this skill for a `forwardQuery`, backfill or schema change deployed
over a populated `analytics_events`.

## When not to use

Prefer another procedure for cloud or production deploys and for CI.

## Preconditions

Start with Docker (OrbStack) running, `tb` installed and `pnpm install`
done, from the repo root.

Read "Failure modes seen" in the runbook first.

## Rules

Use Tinybird Local only. Set `TINYBIRD_HOST` to exactly
`http://localhost:7181` and echo it before every deploy, because
`tinybird deploy` targets the main workspace of whatever host it gets and
any other host is a production deploy. Stop if unsure.

Keep every deploy inside Tinybird Local, since this template repo has no
sanctioned path to Trival or production Tinybird.

Use the SDK's `tinybird deploy` in a new workspace named
`sdk_deploy_probe`, because `tb --local deploy` builds in a temporary
workspace with its own token and a pass there skips the SDK deploy path.
Leave branch workspaces alone.

Put scratch files in the session scratchpad, outside the repo, so the repo
stays clean.

Provide the deployment numbers, quarantined rows, backfilled values and the
row count tested, so the reader knows the scale the result covers.

## Steps

1. Start Tinybird Local in the background and poll `/tokens` until it
   returns 200: `tb local start` can exceed a two-minute tool timeout.
2. Create the probe workspace (e.g. `sdk_deploy_probe`) and read its admin
   token. If it already exists, delete it first (step 5) or stop and ask.
3. Deploy the old schema from a scratch SDK project, seed rows, then
   deploy the current `apps/tinybird` project over it.
4. Check `reception_timestamp = timestamp` on the old rows (required).
5. Run `tb local stop`. If the instance is kept, delete the probe
   workspace and confirm by listing workspaces: DELETE may return 500
   although it worked.

## Worked example

Follow this passing run (SDK 0.0.84, `tb` 5.0.3, one seeded row) as the
example: the commands and the output each one produced.

```bash
tb local start        # ran past the tool timeout; polled until healthy
curl -s -o /dev/null -w '%{http_code}' localhost:7181/tokens   # 200
U=$(curl -s localhost:7181/tokens | jq -r .user_token)
curl -s -X POST localhost:7181/v1/workspaces \
  -H "Authorization: Bearer $U" -d name=sdk_deploy_probe
TOK=$(curl -s localhost:7181/v1/user/workspaces -H "Authorization: Bearer $U" \
  | jq -r '.workspaces[] | select(.name=="sdk_deploy_probe") | .token')
# scratch project: tinybird.json, node_modules symlink, old-schema datasources.ts
export TINYBIRD_HOST=http://localhost:7181 TINYBIRD_TOKEN=$TOK
pnpm exec tinybird deploy     # Deployment #1 is live!
curl -s -X POST "localhost:7181/v0/events?name=analytics_events&wait=true" \
  -H "Authorization: Bearer $TOK" --data-binary @row.ndjson
# {"successful_rows":1,"quarantined_rows":0}
cd apps/tinybird && pnpm exec tinybird deploy   # Deployment #2 is live! (55.6 s)
curl -s -G localhost:7181/v0/sql -H "Authorization: Bearer $TOK" \
  --data-urlencode "q=SELECT timestamp, reception_timestamp FROM analytics_events FORMAT JSON"
# 2025-01-15 10:00:00 | 2025-01-15 10:00:00.000
```

- The real run parsed JSON with `python3`; the `jq` lines above are the
  equivalent and were checked on sample JSON.
- The `workspace_admin_token` from `/tokens` belongs to another workspace,
  so read the probe token from `/v1/user/workspaces`.
- The probe workspace DELETE returned 500 and the workspace list no longer
  showed it.

Check for these failure signs: `quarantined_rows` above 0, no
`Deployment #2` line, or a `reception_timestamp` that differs from
`timestamp`.

## Verification criteria

Check for `Deployment #1 is live!`, `quarantined_rows: 0`,
`Deployment #2 is live!` and every seeded row backfilled. Treat anything
else as a failure and report it.

## Output format

Return one line:
`deployments: #1,#2 | quarantined_rows: N | backfill check: pass/fail |
scale: N rows`

Example: `deployments: #1,#2 | quarantined_rows: 0 | backfill check: pass |
scale: 1 row`

## Postconditions

Verify that Tinybird Local is stopped or the probe workspace removed, that
no scratch files sit in the repo and that the report is delivered.
