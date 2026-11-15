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

3. Make the baseline project outside the repo, in the scratchpad: the
   whole previous `apps/tinybird`, not just its datasources, because
   production already holds the previous views and pipes.
   `git archive <commit before the change> apps/tinybird | tar -x -C <scratch>`,
   then symlink `node_modules` to this repo's `apps/tinybird/node_modules`.
4. Deploy the baseline:
   `TINYBIRD_HOST=http://localhost:7181 TINYBIRD_TOKEN=$TOK pnpm exec tinybird deploy`
   from `<scratch>/apps/tinybird`. Expect `Deployment #1 is live!`.
5. Seed rows through the Events API:
   `POST localhost:7181/v0/events?name=analytics_events&wait=true` with
   `Authorization: Bearer $TOK`. Expect `quarantined_rows: 0`. Include every
   column the stored table requires, `reception_timestamp` among them:
   a missing one quarantines the row.
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
- A failed deployment deletes itself and its error, and `--debug` shows
  only `status: deleting`. Read the cause by running
  `pnpm exec tinybird deploy --no-wait --no-auto`, then polling
  `GET /v1/deployments` with the probe token: its `errors` list holds the
  message for a few seconds. `deploy --check` validates only and can pass
  while the real deploy fails.
- A baseline holding only the datasources fails the deploy with
  `some referenced tables do not exist` on views that are new in the
  deploy. Use the full previous project (step 3).
- Re-running `tinybird build --local` after a column gains only a `DEFAULT`
  fails with `leftover forward query`. The local branch workspace already
  has the column, so delete that branch workspace and rebuild.
- Tinybird warns that a datasource with an explicit `FORWARD_QUERY` is
  backfilled by copying all data. On a large table this is a full copy
  at promotion time.
- `tb local start` can exceed a two-minute tool timeout; poll the
  `/tokens` endpoint instead of waiting on the command.

## Evidence

Run on 2026-11-14 with SDK 0.0.84 and `tb` 5.0.3: both SDK deploys
succeeded and the seeded row got `reception_timestamp = timestamp`.
Result is a single row, so it shows the mechanism, not scale.

Run on 2026-11-15 for typed payload columns: baseline is the full #53
project (`72aa52a`), 3 seeded rows, Deployment #2 live in 60.8 s, all
three rows came out with the new columns parsed from their payload and
`is_bot` unchanged. Three rows show the mechanism, not scale.

Run on 2026-11-15 for typed web vital columns: baseline is the typed
payload columns project, 3 seeded rows (LCP, a CLS of 0, a page hit),
Deployment #2 live in 55.9 s, all rows backfilled and `web_vitals_current`
counted the LCP and the zero CLS.

Run on 2026-11-15 for the daily visitor state: baseline is the typed web
vital columns project, 3 seeded rows (a known visitor over two days, one
legacy hit), Deployment #2 live in 45.7 s. The new view was populated from
the existing rows (known visitors 1 and visits 2 over the range), so a deploy
backfills a new materialized view.
