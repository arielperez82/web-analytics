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

### Denominator

Every goal can add `"denominator"`, which sets what the conversion rate divides by. The API computes the rate; the
dashboard only shows it. The panel states which denominator it uses.

| Value               | Rate is                                                 | Conversions counts                                     |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `session` (default) | Sessions that converted, per session in range           | Sessions that reached the goal, once each              |
| `visitor`           | Visitors that converted, per visitor in range           | Distinct visitors with at least one converting session |
| `page_view`         | Sessions that converted, per page view in range         | Sessions that reached the goal, once each              |
| `none`              | None: the panel shows the count only and no rate column | Sessions that reached the goal, once each              |

- **The default is `session`.** A goal that names no denominator uses it, and its panel says "Rate per session
  (default)".
- A session is any session in the range that sent a page view or an event, so a session that only sent events is a
  session. It converts on an event goal. It can never reach a path goal, but it still counts in the denominator.
  Sessions that only sent web vitals are not sessions here.
- A visitor without a stored id counts as one visitor per session. In a per-channel table the same visitor is counted
  in each channel they arrived through, so channel rows can add up to more than the headline.
- Under `page_view` a session with events and no page view adds conversions but no page views; a channel made only of
  such sessions shows a rate of 0%.
- **This changes historical rates.** The denominator used to be only the sessions that had a page view. The default
  now also counts sessions with events only, so the same range can show a lower rate than before, most visibly for
  event goals. Nothing is recomputed in storage: the new definition applies to every range you open.

```json
[
  { "name": "Booked", "path": "/book/confirmed", "denominator": "visitor" },
  {
    "name": "Newsletter signups",
    "event": "newsletter_signup",
    "denominator": "none"
  }
]
```

### One action, two goals

Each goal is independent. If one action is configured both as a path goal and as an event goal, it is counted once in
each panel, and the panels do not know they describe the same action. For example, with
`{ "name": "Booked (page)", "path": "/book/confirmed" }` and `{ "name": "Booked (event)", "event": "booking_confirmed" }`,
one visitor who lands on `/book/confirmed` and sends `booking_confirmed` is one conversion in "Booked (page)" and one
conversion in "Booked (event)". Do not add the two panels together.

### Event patterns

A pattern is matched by ClickHouse `match()`, which uses RE2: it has no catastrophic backtracking. Patterns are
also limited to a safe subset. The dashboard checks them when it reads its configuration and again in the proxy
before every request, and the Tinybird pipe checks the parts that protect the whole-name match (balanced parentheses,
no `(?` forms other than `(?:`, not empty, at most 100 characters) so a direct call with a read token cannot bypass
them. An unsafe pattern is refused with the reason shown on the page, never run.

- The pattern must match the whole event name. `signup` does not match `signup_done`; write `signup_.*`.
- Matching is case sensitive, like an exact event name. `signup_.*` does not match `Signup_done`.
- Allowed: literal characters, `.`, `\d \w \s \D \W \S`, escaped punctuation such as `\.`, `\/` and `\:`, character
  classes such as `[a-z]` and `[^_]` (ranges must run low to high between plain characters), groups `( )` and
  `(?: )`, alternation `|`, `?` `*` `+`, bounded repeats `{n}` and `{m,n}` (at most 20), and the anchors `^` and `$`.
- Refused: backreferences (`\1`), lookaround and every other `(?` form (named groups, flags), a quantifier on a group
  that already contains a quantifier (`(a+)+`), stacked, lazy or possessive quantifiers (`a**`, `a+?`, `a++`),
  unbounded counted repeats (`{2,}`), POSIX classes, impossible class ranges (`[z-a]`, `[\w-z]`), spaces and
  non-ASCII characters, and patterns over 100 characters.
- The pattern is passed to Tinybird as a template parameter. Tinybird's `String()` substitutes it as an escaped
  literal, not as a true bound query parameter, so its safety rests on that escaping plus the checks above.

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
