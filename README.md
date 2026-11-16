# web-analytics

Web Analytics Repo

## Test layers

| Layer      | Scope                                                                  | Lives in                                                           | Run                                                                                              |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Unit       | Functions and modules, no I/O                                          | `packages/client/src`, `apps/dashboard/src`, `testing/**/helpers`  | `pnpm test`                                                                                      |
| Acceptance | One package or app through its public interface, behaviour a user sees | `acceptance/tinybird`, `acceptance/client`, `acceptance/dashboard` | `pnpm test:acceptance:tinybird`, `pnpm test:acceptance:client`, `pnpm test:acceptance:dashboard` |
| E2E        | A flow across packages: capture (page to storage), then read           | `e2e`, `e2e/browser`                                               | `pnpm test:e2e`, `pnpm test:e2e:browser`                                                         |

Tinybird acceptance and E2E run against Tinybird Local; `testing/tinybird`
holds the shared helpers and global setup. Client acceptance and the browser
E2E use Playwright with a fixture page in `testing/browser`.

To run a Tinybird-backed suite the way CI does, locally, wrap it in
`scripts/ci/with-tinybird-local.sh` (for example
`scripts/ci/with-tinybird-local.sh pnpm run test:acceptance:tinybird`). Do not use
`act` for those jobs: it starts the service container in the host checkout path,
the image's healthcheck only works from `/app`, and the job aborts with "service
container failed to start". `act` is fine for the jobs without a Tinybird service.

## Operations

Deploying and configuring a real environment: see [ops/runbook.md](ops/runbook.md).
