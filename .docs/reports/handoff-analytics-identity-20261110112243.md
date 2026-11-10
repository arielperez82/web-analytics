# Handoff: analytics-identity

## Objective

Splice analytics dashboard (Tinybird): identity modes, Tier 0. No charter or beads DB here.

## Progress

- Merged: #21-#24 (channels, regression tests, entry/exit pages, bounce, client identity modes). Cloud
  deployed through #22 (deployment 9).
- In-flight: PR #26 (`feat/identity-backend`, CI not checked, not merged, not deployed): hits expose
  `visitor_id`/`id_mode`; `channels` carries a daily visitor's first campaign to later visits.
- Blocked: `book_session` goal waits on the user's confirmation page.

## Key Anchors

- `client/src/identity.ts` :: resolveIdMode, dailyIdentity
- `client/src/tinybird-analytics.ts` :: idMode, resolveIdentity, applyConsent
- `tinybird/src/endpoints.ts` :: channels (visits, visitor_campaigns, first_touch)
- `e2e/channels.e2e.test.ts` :: carry-forward describe
- `client/README.md` :: Identity modes and consent

## Decision Rationale

- Modes persistent / daily_direct / daily_proxy: consent via `consent.getState`, fail closed;
  `anonymousIdentity` client|proxy says who mints ids (alt: infer from `proxy` option, rejected).
- Sessions view for channels deferred: 28k events, 0.19s warm (issue #23).
- Marketing site consent = localStorage `so-consent`; glue lives in spliceworks-marketing, untouched.

## Next Steps

1. Check CI, merge #26, `tinybird deploy --check`, deploy from main (never from a branch behind main).
2. Identity proxy: IP + secret daily salt hash, 30-min inactivity session cache, sets `daily_proxy`; Vercel fn
   (user's fallback).
3. Unique visitors KPI from `visitor_id`; client CI job (#25); like_filter fix (#20).
4. `book_session` goal once the confirmation page exists.

## Open Questions

- Proxy host and session-cache store: UNKNOWN.
- Cloud tokens printed twice in session: rotate (`tinybird/.tinyb`).
- TDD guard still bypassed; user must run `/guard:config`.
