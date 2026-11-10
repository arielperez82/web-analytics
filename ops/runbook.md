# Runbook

Operational notes for deploying and running web-analytics. Nothing is deployed to Vercel yet; this is the
checklist for the first deployment. Variable reference: [dashboard README](../dashboard/README.md).

## First deployment checklist

1. **Tinybird first.** From an up-to-date `main`: `pnpm run check:tinybird`, then deploy (see
   [tinybird/README.md](../tinybird/README.md)). Cloud deployment 10 lacks the `conversions` endpoint (#30).
2. **Tracker token.** Mint an append-only Tinybird token for `analytics_events`; set it as
   `TRACKING_TINYBIRD_TOKEN`. Keep it separate from the read token (`TINYBIRD_TOKEN`).
3. **Upstash Redis** (Vercel Marketplace): set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. **Salt.** Set `IDENTITY_SALT_SECRET`. Rotating it resets every visitor id.
5. **Sites and tenant** (Splice):
   - `TRACKING_ALLOWED_ORIGINS=https://spliceops.ai=splice,https://splicelabs.ai=splice`
   - `DASHBOARD_TENANT_ID=splice`
6. **Goals:** `DASHBOARD_GOALS`, for example `[{"name":"Signed up","path":"/welcome/done"}]`.
7. **Auth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and
   `ALLOWED_EMAIL_DOMAINS` and/or `ALLOWED_EMAILS`. Do not set `DASHBOARD_DEV_LOGIN` (it is ignored in production).
8. **Client:** embed with `proxy: 'https://<dashboard-host>'`; `initTinybirdAnalytics` still requires `token`
   and `host` even when `proxyUrl` is used (known client limitation).

## Gotchas

- `TRACKING_ALLOWED_ORIGINS` is `origin=tenant` pairs. The old plain-origin list drops every entry, so every
  tracking request gets 403. Duplicate origins, extra `=`, missing tenants and non-bare origins are dropped
  silently; if events stop arriving, check this value first.
- Conversions and Channels ignore the device, location and browser filters.
- The tracking proxy trusts the client for `session_id` and `payload` (including `visitor_id`) on events that
  carry client ids; it only overrides `tenant_id` and `domain`. A tracked site can forge sessions within its own
  tenant, not another's.

## Open items

- **Rotate tokens:** the `tinybird/.tinyb` tokens, and the tokens that appeared in `ps` output (Tinybird MCP,
  Isy). Do this before the first deployment.
- Not yet verified for production: Vercel project, Upstash instance, tracker token. Treat as unknown.
- Follow-ups from the PR #31 review: tenant id character validation, preflight check for missing proxy
  configuration, component tests for the conversions panel, `like_filter` (#20), client CI job (#25), unique
  visitors KPI, TDD guard config (`/guard:config`).
