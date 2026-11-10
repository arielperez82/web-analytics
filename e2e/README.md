# End-to-end tests

An end-to-end test follows one flow across package boundaries and asserts what
a user of the whole system would see. The flows here are the two halves of the
product, and a test may span both:

- **Capture**: a visitor's page view reaches the collector and is stored.
- **Read**: stored events come back out through the dashboard.

Today `identity-proxy.e2e.test.ts` covers the middle of the capture flow: the
dashboard's `/api/tracking` handler into Tinybird Local, read back through the
Tinybird pipes. It grows outwards: a real browser with the client embedded in a
test page in front, and the dashboard's own `/api/endpoints` on the read side.

Per-package behaviour (one package through its public interface) belongs in
`acceptance/`, not here. See the root README, "Test layers".

`e2e/browser/` is the browser front: a real page with the client embedded, the
dashboard's `/api/tracking` and `/api/endpoints`, and the dashboard UI, run by
Playwright against Tinybird Local (`pnpm test:e2e:browser`).

The browser run starts a fake Upstash on port 4180 and `next dev` on port 3100 (dist dir `.next-e2e`, so
it does not clash with your own `next dev`). The dashboard gets an allowlisted environment, a unique tenant per
run and dev login. Running it makes `next dev` add `.next-e2e` types to `dashboard/tsconfig.json`; that edit
is committed. Teardown kills the dashboard's process group, also when setup fails.

```bash
pnpm test:e2e:local   # starts Tinybird Local if needed
pnpm test:e2e         # with Tinybird Local already running
```
