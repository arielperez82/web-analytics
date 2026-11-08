# Web Analytics dashboard

Next.js dashboard over this repo's Tinybird endpoints.
Self-hosted (for example on Vercel); nothing in the code is specific to one organisation.

## Configure a deployment

| Variable                                   | Purpose                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `TINYBIRD_HOST`, `TINYBIRD_TOKEN`          | Tinybird workspace and a read token. Server-side only.                                                           |
| `DASHBOARD_TENANT_ID`                      | Pins every query to one tenant; the browser cannot override it.                                                  |
| `ALLOWED_EMAIL_DOMAINS`                    | Comma-separated domains allowed to sign in, for example `example.com`. Exact match, subdomains are not admitted. |
| `ALLOWED_EMAILS`                           | Comma-separated individual addresses allowed in addition to the domains.                                         |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client for the deployment.                                                                          |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET`          | next-auth base URL and signing secret.                                                                           |

Access is deny-all unless a domain or address is listed, and the Google email must be verified.

## Local development

1. Start Tinybird Local and build the project in `../tinybird`.
2. Copy `.env.example` to `.env.local`. Use the local workspace token, `DASHBOARD_DEV_LOGIN=1` for a stub login
   (ignored in production), and `ALLOWED_EMAILS` for the address you sign in with.
3. `pnpm --filter @web-analytics/dashboard dev`

## URL state

Range, domain and filters live in the query string (`?days=30&domain=…&device=mobile-ios`, or
`?from=2026-11-05&to=2026-11-05` for a single day), so any view can be shared or bookmarked.
