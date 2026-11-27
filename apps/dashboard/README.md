# Web Analytics dashboard

Next.js dashboard over this repo's Tinybird endpoints.
Self-hosted (for example on Vercel); nothing in the code is specific to one organisation.

## Configure a deployment

| Variable                                   | Purpose                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `TINYBIRD_HOST`, `TINYBIRD_TOKEN`          | Tinybird workspace and a read token. Server-side only.                                                           |
| `DASHBOARD_TENANT_ID`                      | Pins every query to one tenant; the browser cannot override it.                                                  |
| `DASHBOARD_GOALS`                          | JSON array of goals: one conversions panel per goal (max 10). See [Conversion goals](#conversion-goals).         |
| `ALLOWED_EMAIL_DOMAINS`                    | Comma-separated domains allowed to sign in, for example `example.com`. Exact match, subdomains are not admitted. |
| `ALLOWED_EMAILS`                           | Comma-separated individual addresses allowed in addition to the domains.                                         |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client for the deployment.                                                                          |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET`          | next-auth base URL and signing secret.                                                                           |

Access is deny-all unless a domain or address is listed, and the Google email must be verified.

The Channels report and the conversions panels do not apply the device, location or browser filters; the
overview says so. One panel is shown per goal; a malformed goal is dropped and its error is shown on the page.

## Conversion goals

Each entry of `DASHBOARD_GOALS` has a `name` and exactly one way to recognise the conversion:

| Key            | Matches                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `path`         | A page: starts with `/`, no `%`, `?` or `#`. A trailing slash is ignored.                                      |
| `event`        | A tracked event by exact name (letters, digits, `_` `.` `:` `-`, at most 100). This is the default for events. |
| `eventPattern` | A tracked event by pattern. Opt in only when one exact name is not enough, for example `signup_.*`.            |

```json
[
  { "name": "Booked", "path": "/book/confirmed" },
  { "name": "Signed up", "event": "signup_completed" },
  { "name": "Any signup", "eventPattern": "(?:signup|register)_[a-z]+" }
]
```

### Event patterns

A pattern is matched by ClickHouse `match()`, which uses RE2: it has no backtracking, so a pattern cannot make a
query slow. Patterns are also limited to a safe subset and checked when the dashboard reads its configuration and
again before every request. An unsafe pattern is refused with the reason shown on the page, never run.

- The pattern must match the whole event name. `signup` does not match `signup_done`; write `signup_.*`.
- Matching is case sensitive, like an exact event name. `signup_.*` does not match `Signup_done`.
- Allowed: literal characters, `.`, `\d \w \s`, escaped punctuation such as `\.`, character classes such as `[a-z]`
  and `[^_]`, groups `( )` and `(?: )`, alternation `|`, `?` `*` `+`, bounded repeats `{n}` and `{m,n}` (at most 20),
  and the anchors `^` and `$`.
- Refused: backreferences (`\1`), lookaround and every other `(?` form (named groups, flags), a quantifier on a group
  that already contains a quantifier (`(a+)+`), stacked, lazy or possessive quantifiers (`a**`, `a+?`, `a++`),
  unbounded counted repeats (`{2,}`), POSIX classes, spaces and non-ASCII characters, and patterns over 100
  characters.
- The pattern reaches Tinybird only as a bound query parameter, never as SQL text.

## Identity proxy (`POST /api/tracking`)

Tracked sites that set the client to `anonymousIdentity: 'proxy'` post events here without ids while consent is
not granted. The proxy mints `visitor_id` (HMAC of IP, user agent and domain under a salt that rotates daily; the
IP is never stored or forwarded) and `session_id` (reused until 30 minutes of inactivity), sets
`id_mode: daily_proxy`, and forwards to Tinybird with a write token the browser never sees. Events that already
carry client ids (consented `persistent` mode) pass through unchanged. It fails closed: missing config,
a disallowed origin or a session-store error means the event is dropped, never forwarded unidentified.

| Variable                                             | Purpose                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRACKING_TINYBIRD_TOKEN`                            | Tinybird tracker (append-only) token. Not the read token. Server-side only.                                                                                                                                             |
| `IDENTITY_SALT_SECRET`                               | Secret keying the daily salt. Rotating it resets every visitor id.                                                                                                                                                      |
| `TRACKING_ALLOWED_ORIGINS`                           | Comma-separated `origin=tenant` pairs, e.g. `https://spliceops.ai=splice,https://splicelabs.ai=splice`. The proxy stamps `tenant_id` and `domain` from the matching pair; malformed pairs are dropped; empty drops all. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Session cache (Vercel Marketplace Upstash Redis). Keys expire after a day.                                                                                                                                              |
| `TRACKING_DATASOURCE`                                | Optional. Defaults to `analytics_events_landing`.                                                                                                                                                                       |

Several domains can share one tenant (for example `spliceops.ai` and `splicelabs.ai` under `splice`); set
`DASHBOARD_TENANT_ID=splice` and the domain dropdown still separates them. The map fails closed: a pair with
extra `=`, a pair without a tenant, a non-bare origin (path, trailing slash) and an origin listed twice are all
dropped. The value used to be a plain origin list; an old value now drops every entry, so every request is
refused with 403 until it is rewritten as `origin=tenant` pairs.

Point the client at it with `proxy: 'https://<dashboard-host>'` (the client appends `/api/tracking`).

## Local development

1. Start Tinybird Local and build the project in `../tinybird`.
2. Copy `.env.example` to `.env.local`. Use the local workspace token, `DASHBOARD_DEV_LOGIN=1` for a stub login
   (ignored in production), and `ALLOWED_EMAILS` for the address you sign in with.
3. `pnpm --filter @web-analytics/dashboard dev`

## URL state

Range, domain and filters live in the query string (`?days=30&domain=…&device=mobile-ios`, or
`?from=2026-11-05&to=2026-11-05` for a single day), so any view can be shared or bookmarked.
