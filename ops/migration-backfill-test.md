# Migration backfill test (local)

Checks that deploying a changed schema over a populated `analytics_events`
works, using the SDK's own `tinybird deploy`. This is a manual procedure,
not a CI test. If it is needed often, script it.

## Safety

- Run only against Tinybird Local (`http://localhost:7181`).
- Never set `TINYBIRD_HOST` to anything else. `tinybird deploy` targets the
  main workspace of whatever host it is given, so a cloud host would
  deploy to production or Trival.
- Use a dedicated throwaway workspace, never one a branch build uses.

## Prerequisites

- Docker (OrbStack) running, `tb` installed, `pnpm install` done.
- Run from the repo root.

## Procedure

1. Start Tinybird Local: `tb local start`. It can take several minutes.
   Run it in the background and wait until
   `curl -s -o /dev/null -w '%{http_code}' localhost:7181/tokens` prints
   `200`.
2. Create a throwaway workspace and fetch its admin token. If
   `sdk_deploy_probe` already exists from an earlier run, delete it first
   (step 8) or stop and ask:

   ```bash
   U=$(curl -s localhost:7181/tokens | jq -r .user_token)
   curl -s -X POST localhost:7181/v1/workspaces \
     -H "Authorization: Bearer $U" -d name=sdk_deploy_probe
   TOK=$(curl -s localhost:7181/v1/user/workspaces -H "Authorization: Bearer $U" \
     | jq -r '.workspaces[] | select(.name=="sdk_deploy_probe") | .token')
   ```

3. Make a scratch SDK project (outside the repo, in the scratchpad):
   `tinybird.json` with `include: ["src/datasources.ts"]`, `token`
   `${TINYBIRD_TOKEN}`, `baseUrl` `${TINYBIRD_HOST}`;
   `node_modules` symlinked to `apps/tinybird/node_modules`;
   `src/datasources.ts` defining only the OLD `analytics_events` schema
   (take it from `git show <commit before the change>:apps/tinybird/src/datasources.ts`).
4. Deploy the old schema:
   `TINYBIRD_HOST=http://localhost:7181 TINYBIRD_TOKEN=$TOK pnpm exec tinybird deploy`
   from the scratch project. Expect `Deployment #1 is live!`.
5. Seed rows through the Events API:
   `POST localhost:7181/v0/events?name=analytics_events&wait=true` with
   `Authorization: Bearer $TOK`. Expect `quarantined_rows: 0`.
6. Deploy the current schema from `apps/tinybird` with the same two
   variables. Expect `Deployment #2 is live!` (about one minute).
7. Check (required, it is the point of the test):

   ```sql
   SELECT timestamp, reception_timestamp FROM analytics_events
   ```

   Each old row has `reception_timestamp = timestamp`.

8. Clean up: `tb local stop`. Delete the probe workspace if the local
   instance is kept: `DELETE /v1/workspaces/<id>?confirmation=sdk_deploy_probe`
   with the user token. It returned HTTP 500 here although the
   workspace was removed, so confirm by listing workspaces.

## Failure modes seen

- `tb --local deploy` is not equivalent. It builds in a temporary
  workspace tied to the current directory, with its own token. The
  `workspace_admin_token` from `/tokens` belongs to another workspace, so
  the Events API reports the datasource as not found.
- Tinybird warns that a datasource with an explicit `FORWARD_QUERY` is
  backfilled by copying all data. On a large table this is a full copy
  at promotion time.
- `tb local start` can exceed a two-minute tool timeout; poll the
  `/tokens` endpoint instead of waiting on the command.

## Evidence

Run on 2026-11-14 with SDK 0.0.84 and `tb` 5.0.3: both SDK deploys
succeeded and the seeded row got `reception_timestamp = timestamp`.
Result is a single row, so it shows the mechanism, not scale.
