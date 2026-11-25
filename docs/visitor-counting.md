# How we count visitors

Status: draft for review. Business definitions and decisions first; implementation (pipes vs materialized views,
`-State`/`-Merge`) is deliberately deferred to the last section.

Facts below come from the code as of 2026-11-12 and cite where they live. Anything marked **unverified** is an
assumption to check before it drives a decision. Nothing here is legal advice; consent and region rules need counsel.
Prior-art claims come from `visitor-research` (official docs and source of Plausible, Umami, Matomo and Simple
Analytics, accessed 2026-11-12) and are summarised in section 10.

## 1. What the numbers are for

A B2B landing page owner asks three things:

1. How many **people** reached the site in this period? (reach)
2. How many **sessions** did they make? (activity)
3. Did the people we want (a channel, a country, a campaign) come, and did they convert? (quality)

"Unique visitors" answers 1. It is the most misread number in analytics, so we say exactly what ours means and where
it is only approximate. Our answer: we never publish one blended "unique visitors" number.

## 2. Decisions

1. **Headline:** Sessions is the headline and the consent-invariant trend metric. Visitors are two separate cards.
2. **Split:** Show Known visitors (consented) and Anonymous visitors as separate numbers. Never blend or add them.
3. **Bots:** Excluded from every count by default. A toggle includes them so the owner can see the scale of the
   impact.
4. **Legacy events:** Events with no `visitor_id` fall back to `session_id`, namespaced `legacy:` and reported
   separately.
5. **`current_visitors`:** Renamed to **active sessions** (it counts sessions).
6. **Time zone:** the viewer's. The dashboard asks for days and ranges in a zone (`tz`, default the browser's, in the
   URL once chosen) and every figure is cut at local midnight in that zone. Daily anonymous ids roll at the visitor's
   own local midnight, so the anonymous numbers are caveated (section 6).
7. **Consent marker:** None. Nothing is live, so there is no history to mark.
8. **Distinct counting:** `uniqCombined64`; `uniqExact` is never used (section 9).
9. **Local-zone view:** Built for every number, not only consented traffic. Visitor state is kept per UTC hour, so a
   range can start and end on any whole-hour boundary. Half-hour zones (India, Nepal) are approximate at the two edge
   hours; that gap can be filled later from the raw table (section 6).

## 3. Vocabulary

| Term                  | Meaning here                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pageview**          | One `page_hit` event.                                                                                                                        |
| **Session**           | A run of activity from one browser with no gap over 30 minutes. Counted by distinct `session_id`.                                            |
| **Known visitor**     | A `persistent` visitor id: consented, stable across days.                                                                                    |
| **Anonymous visitor** | A `daily_direct` or `daily_proxy` id: lasts one local day of the visitor. Distinct ids are counted, so a return on another day counts again. |
| **Legacy visitor**    | An older event with no `visitor_id`, keyed by `legacy:` plus `session_id`. Reported on its own.                                              |

A visitor is a browser, not a person.

## 4. The identifiers, and what each one can honestly claim

Where they come from: `packages/client/src/identity.ts` (`resolveIdMode`, `dailyIdentity`),
`packages/client/src/visitor-manager.ts`, `packages/ingest/src/proxy-identity.ts`. Every event carries `id_mode`.

| `id_mode`           | How it is made                                                                                   | Lifetime                                                                  | Links one browser across days?                 | Known error                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persistent`        | Random UUID in browser storage, only after consent                                               | 395 days (`RETENTION_SECONDS`)                                            | Yes                                            | One person with two browsers or cleared storage counts as several. Covers only visitors who consented.                                                               |
| `daily_direct`      | Client-side hash of the local day, domain, user agent, screen, language, time zone               | One local day on the visitor's clock                                      | No, by design                                  | Identical settings merge people (undercount). Same person on two days counts twice. See the clock caveat below.                                                      |
| `daily_proxy`       | Server HMAC of IP, user agent, domain with a salt derived from a server secret and the local day | One local day in the zone the client reports (`time_zone`, UTC if absent) | No, by design; the salt is derived, not stored | As above, plus shared IPs (office, carrier NAT) merge people. Anyone holding the secret can recompute a day's salt, so the privacy claim rests on never storing IPs. |
| none (older events) | Only a random `session_id` in storage; no `visitor_id`                                           | 30 minutes per session                                                    | No                                             | A returning person is a new "visitor" every visit.                                                                                                                   |

What follows from this:

- **Across several days, only `persistent` ids deduplicate.** For daily modes the system cannot know that Monday's
  visitor and Tuesday's visitor are the same browser, and we have chosen not to make that possible. So an
  anonymous-visitor
  total over several days is a count of **person-days**, not people, and the UI says so.
- **Anonymous visitors is not a pure upper bound on people.** B2B offices run standard machine images with the same user
  agent, screen, language and time zone. Those merge under `daily_direct`, and under `daily_proxy` they also share an
  IP. So anonymous visitors can undercount as well as overcount. State both.
- **The consent mix biases visitor totals.** A site with a high consent rate has more known visitors and fewer daily
  visitors for the same traffic. This is why the two are never added and why a consented share is shown beside them.
- **Daily ids rotate at the visitor's local midnight.** `daily_direct` hashes the day on the visitor's own clock and
  zone. `daily_proxy` uses the zone the client passes (`time_zone`, sent only when the client asks the proxy to mint the
  id). A viewer looking at the dashboard in another zone can therefore see one person on both sides of a dashboard day
  edge, with two ids. This is the price of letting ids expire continuously instead of all at once at UTC midnight
  (section 6).
- **The client clock, bounded.** `daily_direct` takes its day from the client while events are bucketed by `timestamp`,
  which is also the client's clock. An event is stored only when its `timestamp` is within 24 hours of its
  `reception_timestamp` (section 6), so a badly skewed clock is rejected rather than counted. `daily_proxy` takes its
  instant from the server clock and only its zone from the client.
- **Sessions on the client** are `hash(visitor id, floor(now / 30 minutes))`: fixed 30-minute clock buckets. The proxy
  keeps a sliding 30-minute window in a store instead, so the two modes cut sessions slightly differently.
- **A consent change mid-day counts that person twice** (one `daily_*` key, one `persistent` key). The privacy design
  prevents joining them. Accept; it is one visitor per consent decision.
- **Visitor ids are never shown or exported.** Only counts leave the system.

## 5. Definitions

**D1. Known visitors.** Distinct `visitor_id` with `id_mode = persistent` and at least one qualifying event in the
range. A true distinct count across the range, never a sum of daily counts.

**D2. Anonymous visitors.** Distinct `visitor_id` with `id_mode` in (`daily_direct`, `daily_proxy`) across the range: one
distinct count, not a sum of daily counts. Because each id lasts one visitor-local day, a person who returns on another
day has another id, so the number is person-days. Two ids can also belong to one person within a single dashboard day
when the visitor's zone differs from the one being viewed and they visit on both sides of its midnight. Both caveats are
stated on the card.

**D3. Sessions.** Distinct `session_id` in the range, computed over the range. Sessions exist in every identity mode, so
they are the consent-invariant measure, the weekly headline, and the denominator for conversion rate.

**D4. Active sessions now.** Distinct `session_id` with an event in the last 5 minutes. This is the renamed
`current_visitors` (`endpoints.ts`, `currentVisitors`). Unfiltered, like Plausible's equivalent.

**D5. Returning known visitors** (optional, behind a drill-down). Known visitors in the range who were also seen before
the range started. Defined for `persistent` only; undefined until history accumulates.

**D6. Legacy visitors.** Events with no `visitor_id`, keyed `legacy:` plus `session_id`. Reported on their own and never
merged with real visitor ids. Each return visit counts as a new legacy visitor.

**D7. Range totals are computed over the range, never summed from buckets.** A persistent visitor active on
three days appears in three daily bars and counts once in D1. Today the "Sessions" card sums per-day distinct sessions
(`Kpis.tsx`, `sum("sessions")`; the `kpis` pipe grouped by `date, session_id`), so a session that crossed UTC midnight
counted twice. D7 fixed that: the `kpis` pipe is gone and the cards come from `visitor_counts` and `engagement`.
**The chart bars can add up to more than the headline, and the UI says so.**

## 6. Date filters and time zone

- The range is inclusive whole days, `date_from` to `date_to`, in the zone given by `tz` (an IANA name, default `UTC`;
  an
  unknown name makes the query fail instead of falling back). The query reads the instants from local midnight of the
  first day to local midnight after the last. A single-day range switches the chart to hourly buckets; the headline is
  still one distinct count for the whole day, not the sum of hours.
- **Only endpoints that cut whole days or more take `tz`.** Below a day the client sends ISO 8601 instants
  (`hourly_series` takes `from_at`, `to_at` and `bucket_hours`, at most 744 buckets) and converts the UTC hours it gets
  back to the viewer's zone for labels. Buckets start at `from_at`, so they follow the viewer's local day, and each
  session or visitor counts once per bucket. The dashboard keeps the chart to 200 bars: one-hour buckets up to 8 days,
  four-hour buckets up to 33 days, and the hour grain is not offered beyond that. Around a clock change a day holds 23
  or 25 hours, so the four-hour bars shift by an hour against the wall clock for that day, and the last bar of a range
  may be shorter.
- **The zone the dashboard uses:** the one in the URL (`tz=`), else the browser's. The header has a picker. The same
  zone shapes the preset ranges ("Today", "Last 7 days") and the date picker's "today".
- **Why local time.** Viewers read their dashboards in their own day; ids that expire at each visitor's midnight need no
  global cutoff, and any range or granularity can be sliced. The cost is the caveat on anonymous numbers, which is
  stated on the card:
  - Anonymous ids are person-days, and a person whose zone differs from the viewed zone can count twice around a day
    edge. How large the overcount is has not been measured; it depends on the audience mix of visitor zones.
  - It matters most on single-day and hourly views and fades beyond about two weeks.
- **How the state is kept.** Visitor and session state is kept per UTC hour (`visitor_state_hourly_mv`), so a range can
  start and end on any whole-hour offset and still be a true distinct count (`uniqCombined64Merge` over the hours).
  Half-hour zones (India, Nepal) cut inside an hour, so their two edge hours are approximate. If that ever matters,
  build a state for the edge hours from `analytics_hits` and merge it with the hourly ones.
- **Which timestamp.** Every event carries two. `timestamp` is generated by the sender and never overwritten; it is the
  partition and sort key, and all bucketing uses it. `reception_timestamp` is the first time any server of ours
  received the event, not the time Tinybird did. The proxy stamps it from its own clock and ignores any client value.
  Direct senders cannot be trusted, so the landing keeps a supplied value only from 6 hours before to 5 minutes after
  the landing time and otherwise uses the landing time. The past bound is wide because Tinybird can delay or retry
  inserts; a direct client can still backdate by about 30 hours in the worst case.
- **Trust window: 24 hours.** An event whose `timestamp` is more than 24 hours from its `reception_timestamp` is not
  counted; it goes to `analytics_events_rejected` with a reason, for diagnosis. 24 hours because DAY is the smallest
  materialized granularity; revisit if a finer one is added. History older than the window cannot come through the
  landing and has to be seeded into the stored table directly.
- **Ingestion lag** is read from Tinybird's ingestion log (`organization.datasource_ops_log`), not from a column.
- **Previous-period comparison** uses the same number of days immediately before (`date_calculations` in
  `visitor_counts` and `engagement`), per metric. Each returns the absolute change (`*_change`: counts as a signed
  number, bounce rate in percentage points, session length in seconds) beside the growth percent. Show "n/a" when
  the previous period starts before identity rollout.
  Normalise per day when window lengths differ (28 vs 31 days).
- **Longer ranges lose accuracy for daily traffic.** A returning non-consenting browser counts up to N times in an
  N-day range; a consenting one counts once. Hence the consented share beside the cards.
- **Small numbers:** show absolute change ("+3") instead of percent when either period is under about 20. Poisson noise
  at these volumes makes 9 vs 12 meaningless.

## 7. Cross-filters

Filters are hit-level attributes: location, device, browser (`crossFilters` in `endpoints.ts`), plus page and channel in
the top lists.

- A filtered count means "visitors with at least one event matching the filter in the range".
- **Counts are not additive across a dimension.** One browser can appear as both `desktop` and `mobile-ios`, or view
  two pages. So per-device, per-browser, per-page and per-channel visitor counts exceed the headline. No total row, a
  footer on each list ("A visitor can appear in more than one row"), and bars scaled to the largest row rather than
  percentages that look like they sum to 100.
- **Location, device and browser are properties of a hit, not of a visitor** (travel, VPNs, browser changes).
- Conversions keep ignoring device, location and browser filters, as today, and the UI says so.
- **Conversion rate by channel uses sessions as the denominator**, with the consented share beside each channel row.
  Channels under about 30 sessions are greyed out and not ranked.

## 8. Bots

- **Default: excluded** from Sessions, Known visitors and Anonymous visitors, as in all four tools surveyed.
- **Opt-in toggle** ("Include bot traffic", a switch, default off, in the URL so shared links reproduce the view).
  - Impact shown as a quiet line: "412 bot sessions hidden. Show". Hidden when zero.
  - When on, an amber "Including bots" chip and an "incl. bots" suffix on affected cards.
  - Show counts and share, by channel and by landing page, in sessions. Bots almost never consent, so the effect lands
    on
    anonymous visitors, not known visitors.
- **Classifier limits** (the current rule is a user-agent regex, `pipes.ts`):
  - False positives: the substring "bot" also matches some Android devices.
  - False negatives, the larger B2B risk: email security scanners (link prefetchers) use ordinary browser user agents
    and show up as sessions right after a campaign send. Headless browsers, spoofed agents and datacenter IPs are also
    missed.
  - Store `is_bot` and a `classifier_version` at ingest instead of recomputing at query time, so history never shifts
    silently. Hand-audit 100 flagged and 100 unflagged events before trusting it.

## 9. Exactness: `uniqCombined64`

- **Decision:** `uniqCombined64` for visitor and visit counts. It hashes every type with 64 bits (plain `uniqCombined`
  uses 32 bits for non-strings and is badly wrong at high cardinality). `uniqExact` is not used anywhere, not even as
  an audit path: its state grows with the number of distinct values, so it can exhaust memory as counts rise.
- **What the ClickHouse docs say:** `uniqCombined` uses an array, then a hash set, then HyperLogLog with an error
  correction table; default `HLL_precision` 17 is about 96 KiB per state. The docs give no numeric thresholds. Sources:
  the ClickHouse reference pages for `uniq`, `uniqCombined` and `uniqExact`.
- **Measured on Tinybird Local, 2026-11-14:** ids are 128-bit hex strings built to be distinct (`hex(sipHash128(number,
seed))`), so the true count is known without `uniqExact`.
  - **Exact up to 4,096 distinct ids.** Zero error at n = 1 to 50 (every value), 100, 500 and 1,000 to 4,000 with 100
    seeds each, and at 4,096 with 200 seeds. At 4,097 the estimate is off in 191 of 200 seeds (largest error 26,
    0.6%). So the step is sharp, at 2^12.
  - **Above 4,096 it is an estimate.** Largest relative error seen: 0.70% across n = 5,000 to 10,000,000 (20 seeds up
    to 200k, 5 at 500k and 1M, 3 at 10M). The 0.29% figure derived from the HyperLogLog formula was too optimistic at
    these sizes. Plan for 1%.
  - **Merged daily states behave the same.** 90 per-day `uniqCombined64State` merged with `uniqCombined64Merge`, with
    overlapping ids: union of 2,890 ids exact; 109,000, 495,000 and 1,980,000 off by 0.28%, 0.26% and 0.20%.
  - Not measured: memory per state, and behaviour on real traffic, since ids there repeat in skewed ways. The error
    figures come from uniformly distinct ids.
- **UI wording:** no number in the UI. Show an asterisk on distinct counts, with a hover that says "Exact for small
  counts, within 1% for large ones." The 4,096 and 1% figures stay in this document.
- **Test to keep** (first TDD cycle of the implementation): the sweep above as an acceptance test with the same
  construction. Zero difference up to 4,096 distinct ids (many seeds), relative error at most 1% above, and the same
  for merged daily states. It never needs `uniqExact` because the truth is built in.

## 10. How other tools handle it

Sourced from official docs and source, accessed 2026-11-12. Items marked unverified were not confirmed.

- **Plausible:** hash of daily salt, domain, IP and user agent; salt deleted daily (UTC in code; docs silent). Multi-day
  uniques are effectively a sum of dailies, and maintainers say a visitor on 5 days counts 5. Reports use the
  site-configured zone, which is not reconciled with the UTC salt (unverified). Bots are always excluded with no way to
  view them. No consent split (no cookie mode). Engine is `uniq` on ClickHouse.
- **Umami:** hash of site, IP, user agent and a salt that rotates monthly by default (configurable). Visitors is a
  distinct count of the session id within a salt period. Bots excluded by default; an environment variable disables the
  check. No consent split. SQL `count(distinct)` or `uniq`.
- **Matomo:** cookie visitor id, or a cookieless `config_id` seeded and discarded daily. Multi-day uniques are real
  distinct counts, but Matomo warns never to sum daily uniques, and range archiving is off by default. Bots excluded by
  default. Cookie and cookieless counts are blended in one number; no split is documented.
- **Simple Analytics:** no visitor identity at all; a visit is a unique pageview, so there is no cross-visit dedupe.
  Bots hidden by default and retrievable via export. Reports follow the site zone; exports use UTC.
- The distinct engine for Simple Analytics is unverified.

What this means for us:

- Our daily-id behaviour matches Plausible's. Plausible's maintainers acknowledge the "visitors" label can mislead, so
  we label anonymous visitors as person-days.
- No surveyed tool shows a consented-versus-cookieless split; Matomo blends them. Keeping the split is ours to design.
- No surveyed tool lets you toggle bots back in the way we plan; only Simple Analytics offers the hidden sessions, via
  export.
- No surveyed tool documents how to compare periods across a tracking-method change. Unverified for all four.
- Plausible's salt rotates on UTC while its reports use the site zone, and no doc reconciles the two. We pass the
  zone through instead: ids roll at the local midnight of the zone the visitor reports, and the dashboard is read in the
  viewer's zone. The gap between the two is the caveat on the anonymous numbers.

## 11. Interface rules

Layout (separate cards grouped by what they measure; one chart series at a time, so nothing invites adding them):

```text
 PEOPLE (browsers)                         ACTIVITY
 [Known visitors] [Anonymous visitors]         [Sessions]
 Not additive: known and anonymous are different people; sessions are a different unit.
 Chart: [Sessions | Known | Anonymous] selector, one series at a time   (Times in the viewer's zone)
```

- Labels and one-line caveats:
  - Known visitors: "Counted once per browser across the whole range. Only people who accepted tracking."
  - Anonymous visitors: "Counted per visitor day, which ends at each visitor\u2019s own midnight: a returning person
    counts again each day."
  - Sessions: "Browsing sessions; one person can make several."
  - Active sessions now: "Sessions with activity in the last 5 minutes."
- Show the consented share (known sessions over all sessions) beside the visitor cards and channel rows.
- The UI never calculates. Totals, rates, growth, shares and bar ratios all come from the API (see
  `apps/dashboard/AGENTS.md`), which is also how the card totals and the exports stay identical.
- Every explanation has three layers: a one-line caption, a keyboard-focusable popover, and a "How we count" link.
- Chart caption: bars are per-day counts and can add up to more than the card.
- Legacy periods: a chart band reading "Earlier data: visitors counted per session", and a card footnote only when the
  range overlaps it.
- No consented visitors yet: show "0 (no consent yet)" muted, keep the card in place.
- Exports include the dashboard's settings (time zone, bot toggle, date range, consented share), so they survive being
  pasted into a slide, and totals match the dashboard.
- Year-over-year is acceptable for sessions and conversions. Refuse it for visitor metrics from before identity rollout.

## 12. What the definitions imply technically (not decided)

Constraints that come straight from the definitions:

- D1 and D3 need a **distinct count across days**, so any pre-aggregation must store something mergeable
  (`uniqCombined64State` read with `uniqCombined64Merge`), not per-day counts that get added. D2 is the exception.
- A pre-aggregated state answers only the filter combinations it keeps as dimensions, cannot be subtracted, and freezes
  the visitor key at write time. The existing `analytics_sessions_mv` is keyed by `session_id` with
  `device`/`browser`/`location` as `any(...)`, so it already loses multi-valued hits.
- States kept per UTC hour can be re-cut at any whole-hour zone offset, which is why the state is hourly (section 6).
- State size is up to about 96 KiB per group at high cardinality, so a wide dimension cross-product bloats storage.
- **Decided: both.** The unfiltered headline counts (D1 to D3) read `visitor_state_hourly_mv`, which holds mergeable
  `uniqCombined64State` states per UTC hour, tenant, domain, bot flag and visitor class (`known`, `daily`, `legacy`).
  Cross-filtered queries (section 7) read `analytics_hits` directly, because a state answers only the dimensions it
  keeps. Whether the volume needs the state at all is still **unverified**; it is cheap to keep and a deploy
  populates it from existing history (checked locally on 3 rows).
- Ingest-time logic lives in the Null-engine landing and its views (`apps/tinybird/README.md`), including the
  reception-time bounds and the trust window, so aggregates only ever see trusted events.
- `visitor_id` and `id_mode` are already columns of `analytics_hits`. **Built:** `is_bot` and `classifier_version`
  (`ua-regex-v1`) are stamped at ingest and stored; `analytics_hits` exposes `is_bot` and `visitor_key` (the
  `visitor_id`, else `legacy:` plus `session_id`, D6) and derives `device = 'bot'` from the stored flag. A sender cannot
  set `is_bot`: the landing has no such column. **Built:** `visitor_state_hourly_mv` with bots as separate rows, and the
  `visitor_counts` endpoint that reads it (known, anonymous as a distinct count of daily ids, legacy, sessions; bots out
  unless
  `include_bots=1`; with a location, device or browser filter the same hourly states are built from `analytics_hits`,
  so both paths share one merge and agree). `current_visitors` and `trend` also leave bots out unless
  `include_bots=1`. **Built:** `engagement` (page views, pages per session, bounce rate and average session length,
  weighted by session over the whole range, with the previous period, the change from it and growth) and
  `daily_series` (one metric per day
  with the bar size as a percentage, zero for quiet days). The dashboard overview reads these endpoints. **Built:**
  `hourly_series`, the same metrics per bucket of `bucket_hours` between two ISO 8601 instants (at most 744 buckets), shown
  for single-day ranges and, when the viewer chooses Hour, for ranges up to 33 days (one-hour buckets to 8 days, then
  four-hour buckets). It rolls
  the hours up from `analytics_hits` at read time and has no materialization: a day for one tenant and domain is a range
  read on `analytics_events` (sorted by tenant, domain, timestamp), and the filtered `visitor_counts` path already scans
  `analytics_hits` over longer ranges. Add an hourly materialization only if measured latency for a busy tenant
  justifies
  it; each hour counts its own distinct ids, so the hours can add up to more than the day.

## 13. Open items

- **Unverified:** estimator error on real, skewed traffic (section 9 measures uniformly distinct ids).
- **Unverified:** the production rollout date of `visitor_id` and how much existing traffic predates it.
