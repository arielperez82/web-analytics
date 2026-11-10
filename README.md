# web-analytics

Web Analytics Repo

## Test layers

| Layer      | Scope                                                           | Lives in                                            | Run                                                            |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Unit       | Functions and modules, no I/O                                   | `client/src`, `dashboard/src`, `testing/**/helpers` | `pnpm test`                                                    |
| Acceptance | One package through its public interface, behaviour a user sees | `acceptance/tinybird`, `acceptance/client`          | `pnpm test:acceptance:tinybird`, `pnpm test:acceptance:client` |
| E2E        | A flow across packages: capture (page to storage), then read    | `e2e`, `e2e/browser`                                | `pnpm test:e2e`, `pnpm test:e2e:browser`                       |

Tinybird acceptance and E2E run against Tinybird Local; `testing/tinybird`
holds the shared helpers and global setup. Client acceptance and the browser
E2E use Playwright with a fixture page in `testing/browser`.

## Operations

Deploying and configuring a real environment: see [ops/runbook.md](ops/runbook.md).
