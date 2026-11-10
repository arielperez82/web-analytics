# Web Analytics dashboard

Next.js dashboard over this repo's Tinybird endpoints.
Self-hosted (for example on Vercel); nothing in the code is specific to one organisation.

## Configure a deployment

| Variable                                   | Purpose                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `TINYBIRD_HOST`, `TINYBIRD_TOKEN`          | Tinybird workspace and a read token. Server-side only.                                                           |
| `DASHBOARD_TENANT_ID`                      | Pins every query to one tenant; the browser cannot override it.                                                  |
| `DASHBOARD_GOALS`                          | JSON `[{"name","path"}]`: one conversions panel per goal (max 10). Paths start with `/`, no `%`, `?` or `#`.     |
| `ALLOWED_EMAIL_DOMAINS`                    | Comma-separated domains allowed to sign in, for example `example.com`. Exact match, subdomains are not admitted. |
| `ALLOWED_EMAILS`                           | Comma-separated individual addresses allowed in addition to the domains.                                         |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client for the deployment.                                                                          |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET`          | next-auth base URL and signing secret.                                                                           |

Access is deny-all unless a domain or address is listed, and the Google email must be verified.

## Identity proxy (`POST /api/tracking`)

Tracked sites that set the client to `anonymousIdentity: 'proxy'` post events here without ids while consent is
not granted. The proxy mints `visitor_id` (HMAC of IP, user agent and domain under a salt that rotates daily; the
IP is never stored or forwarded) and `session_id` (reused until 30 minutes of inactivity), sets
`id_mode: daily_proxy`, and forwards to Tinybird with a write token the browser never sees. Events that already
carry client ids (consented `persistent` mode) pass through unchanged. It fails closed: missing config,
a disallowed origin or a session-store error means the event is dropped, never forwarded unidentified.

| Variable                                             | Purpose                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `TRACKING_TINYBIRD_TOKEN`                            | Tinybird tracker (append-only) token. Not the read token. Server-side only. |
| `IDENTITY_SALT_SECRET`                               | Secret keying the daily salt. Rotating it resets every visitor id.          |
| `TRACKING_ALLOWED_ORIGINS`                           | Comma-separated exact origins, e.g. `https://example.com`. Empty drops all. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Session cache (Vercel Marketplace Upstash Redis). Keys expire after a day.  |
| `TRACKING_DATASOURCE`                                | Optional. Defaults to `analytics_events`.                                   |

Point the client at it with `proxy: 'https://<dashboard-host>'` (the client appends `/api/tracking`).

## Local development

1. Start Tinybird Local and build the project in `../tinybird`.
2. Copy `.env.example` to `.env.local`. Use the local workspace token, `DASHBOARD_DEV_LOGIN=1` for a stub login
   (ignored in production), and `ALLOWED_EMAILS` for the address you sign in with.
3. `pnpm --filter @web-analytics/dashboard dev`

## URL state

Range, domain and filters live in the query string (`?days=30&domain=…&device=mobile-ios`, or
`?from=2026-11-05&to=2026-11-05` for a single day), so any view can be shared or bookmarked.
