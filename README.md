# web-analytics

Web Analytics Repo

## Test layers

| Layer      | Scope                                                           | Lives in                                            | Run                             |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| Unit       | Functions and modules, no I/O                                   | `client/src`, `dashboard/src`, `testing/**/helpers` | `pnpm test`                     |
| Acceptance | One package through its public interface, behaviour a user sees | `acceptance/tinybird` (client: planned)             | `pnpm test:acceptance:tinybird` |
| E2E        | A flow across packages: capture (page to storage), then read    | `e2e`                                               | `pnpm test:e2e`                 |

Tinybird acceptance and E2E run against Tinybird Local; `testing/tinybird`
holds the shared helpers and global setup. Planned: client acceptance (the
client embedded in a test page, driven by Playwright) and a browser front for
the E2E capture flow.
