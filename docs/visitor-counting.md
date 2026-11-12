# How we count visitors

Status: draft for discussion. Business definitions first; implementation (pipes vs materialized views,
`-State`/`-Merge`) is deliberately deferred to the last section.

Facts below come from the code as of 2026-11-12 and cite where they live. Anything marked **unverified** is an
assumption to check before it drives a decision. Nothing here is legal advice; consent and region rules need counsel.

## 1. What the numbers are for

A B2B landing page owner asks three things:

1. How many **people** reached the site in this period? (reach)
2. How many **visits** did they make? (activity)
3. Did the people we want (a channel, a country, a campaign) come, and did they convert? (quality)

"Unique visitors" answers 1. It is the most misread number in analytics, so the first job is to say exactly what ours
means and where it is only approximate.

## 2. Vocabulary

| Term              | Meaning here                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| **Pageview**      | One `page_hit` event.                                                                                     |
| **Visit**         | A run of activity from one browser/visitor with no gap over 30 minutes. Counted by distinct `session_id`. |
| **Visitor**       | One identifier of a browser, as defined by its identity mode (section 3). Not a person.                   |
| **Daily visitor** | A visitor key that exists for one UTC day only.                                                           |
| **Known visitor** | A `persistent` visitor, stable across days.                                                               |

## 3. The identifiers, and what each one can honestly claim

Where they come from: `packages/client/src/identity.ts` (`resolveIdMode`, `dailyIdentity`),
`packages/client/src/visitor-manager.ts`, `packages/ingest/src/proxy-identity.ts`. Every event carries `id_mode`.

| `id_mode`           | How it is made                                                           | Lifetime                                 | Can link the same browser across days? | Known error                                                                                                     |
| ------------------- | ------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `persistent`        | Random UUID in browser storage, only after consent                       | 395 days (`RETENTION_SECONDS`)           | Yes                                    | One person with two browsers, devices or cleared storage counts as several. Covers only visitors who consented. |
| `daily_direct`      | Client-side hash of day, domain, user agent, screen, language, time zone | One UTC day (`Math.floor(now / DAY_MS)`) | No, by design                          | Different people with identical settings merge (undercount). Same person on two days counts twice.              |
| `daily_proxy`       | Server HMAC of IP, user agent, domain with a salt that changes daily     | One UTC day (`dailySalt`)                | No, by design; the salt is discarded   | Same as above, plus shared IPs (office, carrier NAT) merge people.                                              |
| none (older events) | Only a random `session_id` in storage; no `visitor_id`                   | 30 minutes per session                   | No                                     | A returning person is a new "visitor" every visit if sessions are used as the key.                              |

What follows from this:

- **Across several days, only `persistent` ids can be deduplicated.** For daily modes the system cannot know that
  Monday's visitor and Tuesday's visitor are the same browser, and we have chosen not to make that possible. A multi-day
  count that mixes modes is therefore a blend of "people" (persistent) and "person-days" (daily).
- **The blend is biased by consent.** Visitors who consent get cross-day deduplication; visitors who decline are counted
  once per day. A site with high consent rates will report lower visitor totals than the same traffic with low consent,
  with no change in real reach. This is a property of the data, not a bug.
- **Daily ids never straddle two dashboard days.** They rotate at UTC midnight and the dashboard buckets by UTC date
  (`toDate(timestamp)`, `rangeToParams`). Keep UTC as the day boundary; changing it to the viewer's time zone would
  split daily ids across two buckets.
- **A consent change mid-day double counts that person once.** A visitor who starts as `daily_*` and then consents has
  two keys that cannot be joined (joining them is the thing the privacy design prevents). Accept this; it is bounded to
  one visitor per consent decision.
- **Visitor ids are never shown or exported.** Only counts leave the system.

## 4. Proposed definitions

**D1. Visitors (headline).** The number of distinct visitor keys with at least one qualifying event in the selected date
range, where the key is `visitor_id` when present and `session_id` otherwise (older events). Labelled "Visitors" with a
one-line note that it counts browsers, not people, and that visitors who decline persistent ids are counted once per
day.

**D2. Visits.** Distinct `session_id` in the range. Unchanged in meaning, but see D5 on how it is totalled.

**D3. Returning visitors** (secondary, optional). Persistent visitors in the range who were also seen before the range
started. Only defined for `persistent`; never estimated for daily modes.

**D4. Visitors now.** Distinct visitor keys with an event in the last 5 minutes. Today `current_visitors` counts
`session_id` (`endpoints.ts`, `currentVisitors`), which is "active visits", not visitors; it should either be renamed or
moved to the visitor key.

**D5. Totals are computed over the range, never summed from the buckets.**
A persistent visitor active on three days appears in three daily buckets and must count once in the range total. Today
the "Visits" card sums per-day distinct sessions (`Kpis.tsx`, `sum("visits")`; the `kpis` pipe groups by `date,
session_id`), so a session that crosses UTC midnight counts twice. The same rule fixes both. **Consequence: the sum of
the chart bars can exceed the headline number, and the UI should say so.**

## 5. How date filters affect the counts

- The range is inclusive whole UTC days, `date_from` to `date_to` (`rangeToParams`). A single-day range switches the
  chart to hourly buckets; the headline is still one distinct count for the whole day, not the sum of hours.
- **Previous-period comparison** uses the same number of days immediately before (`date_calculations` in the `kpis`
  pipe). For D1 this compares like with like only if the consent mix is similar in both periods; a consent banner change
  between periods will move the comparison without any change in traffic. Show the comparison, but the doc should treat
  large swings right after a consent change as suspect.
- **Longer ranges lose accuracy for non-consenting traffic.** Over a 30-day range a returning non-consenting browser
  counts up to 30 times, a consenting one once. Option to expose the split (section 8, Q2).
- **Data older than the identity rollout** has no `visitor_id`. D1's fallback to `session_id` counts each return visit
  as a new visitor for that traffic. This fades as the range moves past the rollout date; it must not be hidden.
  **Unverified:** the exact rollout date in production and how much of The Adaptive Alchemist's traffic predates it.

## 6. How the cross-filters affect the counts

Filters are hit-level attributes: location, device, browser (`crossFilters` in `endpoints.ts`), plus page and channel in
the top lists.

- A filtered count means "visitors with at least one event matching the filter in the range". It is not "visitors whose
  only attribute is X".
- **Counts are not additive across a dimension.** One browser can show up as both `desktop` and `mobile-ios` (two
  devices on persistent), or view two pages. So the per-device, per-browser, per-page and per-channel visitor counts
  will sum to more than the headline. The UI must not show a total row for them and should note it.
- **Location, device, browser are properties of a hit, not of a visitor.** Travelling, VPNs, and changing browsers are
  why. Accept; document.
- Conversions keep ignoring device, location and browser filters, as today, and should say so.
- **Bots:** bot user agents are classified as `device = bot` but are still events. Decision needed on whether D1 and D2
  exclude them by default (section 8, Q3).

## 7. Expectations for exactness

- A low-traffic B2B site reads small numbers; "12 visitors" should be 12, not approximately 12. The current pipes use
  `uniq`, which ClickHouse documents as approximate; **unverified:** whether it is exact enough at our volumes. Treat
  "exact below some volume" as a requirement and verify it against `uniqExact` before choosing.
- Precision beyond the daily-id error in section 3 is false precision; do not show decimals or percentages of visitors.

## 8. Decisions needed from you

1. **Headline semantics.** Is D1 (distinct keys in range, mixed modes, labelled as browsers) acceptable as the single
   headline, or do you want it split by default?
2. **Show the split?** Option A: one "Visitors" number. Option B: also show "Known visitors (consented)" and "Daily
   visitors" beside it. Option C: only the split. My lean is B, because it explains the consent bias instead of hiding
   it.
3. **Bots.** Exclude `device = bot` from Visitors and Visits by default, or keep them and filter on demand?
4. **Legacy fallback.** For events with no `visitor_id`, use `session_id` (D1 as written), or exclude them from Visitors
   and show only Visits for that period?
5. **Visitors now.** Rename `current_visitors` to active visits, or move it to the visitor key?
6. **Time zone.** Stay on UTC days everywhere (recommended), or plan viewer-time-zone days knowing that daily ids will
   straddle buckets?
7. **Consent-change comparisons.** Add a visible marker on the chart where the consent setup changed, or just document
   it?

## 9. What the definitions imply technically (not decided)

Deferred until the decisions above are made, but these constraints come straight from the definitions:

- D5 means range totals need a **distinct count across days**, so any pre-aggregation must store something mergeable
  (ClickHouse `uniqState` read with `uniqMerge`), not per-day counts that get added.
- Non-additivity (section 6) means a pre-aggregated table can only answer the filter combinations it keeps as
  dimensions. The existing `analytics_sessions_mv` is keyed by `session_id` with `device`/`browser`/`location` as
  `any(...)`, which already loses multi-valued hits.
- Whether we need a materialized view at all depends on volume: **unverified.** Counting directly from `analytics_hits`
  for the current scale may be simpler and exact.
- `visitor_id` and `id_mode` are already columns of `analytics_hits`, so nothing needs to change at ingest for D1.
