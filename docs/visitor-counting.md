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
2. How many **visits** did they make? (activity)
3. Did the people we want (a channel, a country, a campaign) come, and did they convert? (quality)

"Unique visitors" answers 1. It is the most misread number in analytics, so we say exactly what ours means and where
it is only approximate. Our answer: we never publish one blended "unique visitors" number.

## 2. Decisions

1. **Headline:** Visits is the headline and the consent-invariant trend metric. Visitors are two separate cards.
2. **Split:** Show Known visitors (consented) and Daily visitors as separate numbers. Never blend or add them.
3. **Bots:** Excluded from every count by default. A toggle includes them so the owner can see the scale of the
   impact.
4. **Legacy events:** Events with no `visitor_id` fall back to `session_id`, namespaced `legacy:` and reported
   separately.
5. **`current_visitors`:** Renamed to **active visits** (it counts sessions).
6. **Time zone:** UTC for day and range boundaries everywhere. Local time is a display aid only (section 6).
7. **Consent marker:** None. Nothing is live, so there is no history to mark.
8. **Distinct counting:** `uniqCombined64`, with `uniqExact` kept as the audit path (section 9).
9. **Local-zone view:** Not built, including for consented-only traffic. Not needed (section 6).

## 3. Vocabulary

| Term               | Meaning here                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Pageview**       | One `page_hit` event.                                                                                    |
| **Visit**          | A run of activity from one browser with no gap over 30 minutes. Counted by distinct `session_id`.        |
| **Known visitor**  | A `persistent` visitor id: consented, stable across days.                                                |
| **Daily visitor**  | A `daily_direct` or `daily_proxy` id: exists for one UTC day only. Counted per day, so repeats re-count. |
| **Legacy visitor** | An older event with no `visitor_id`, keyed by `legacy:` plus `session_id`. Reported on its own.          |

A visitor is a browser, not a person.

## 4. The identifiers, and what each one can honestly claim

Where they come from: `packages/client/src/identity.ts` (`resolveIdMode`, `dailyIdentity`),
`packages/client/src/visitor-manager.ts`, `packages/ingest/src/proxy-identity.ts`. Every event carries `id_mode`.

| `id_mode`           | How it is made                                                           | Lifetime                       | Links one browser across days? | Known error                                                                                                     |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `persistent`        | Random UUID in browser storage, only after consent                       | 395 days (`RETENTION_SECONDS`) | Yes                            | One person with two browsers or cleared storage counts as several. Covers only visitors who consented.          |
| `daily_direct`      | Client-side hash of day, domain, user agent, screen, language, time zone | One UTC day                    | No, by design                  | Identical settings merge people (undercount). Same person on two days counts twice. See the clock caveat below. |
| `daily_proxy`       | Server HMAC of IP, user agent, domain with a salt that changes daily     | One UTC day (`dailySalt`)      | No, by design; salt discarded  | As above, plus shared IPs (office, carrier NAT) merge people.                                                   |
| none (older events) | Only a random `session_id` in storage; no `visitor_id`                   | 30 minutes per session         | No                             | A returning person is a new "visitor" every visit.                                                              |

What follows from this:

- **Across several days, only `persistent` ids deduplicate.** For daily modes the system cannot know that Monday's
  visitor and Tuesday's visitor are the same browser, and we have chosen not to make that possible. So a daily-visitor
  total over several days is a count of **person-days**, not people, and the UI says so.
- **Daily visitors is not a pure upper bound on people.** B2B offices run standard machine images with the same user
  agent, screen, language and time zone. Those merge under `daily_direct`, and under `daily_proxy` they also share an
  IP. So daily visitors can undercount as well as overcount. State both.
- **The consent mix biases visitor totals.** A site with a high consent rate has more known visitors and fewer daily
  visitors for the same traffic. This is why the two are never added and why a consented share is shown beside them.
- **Daily ids rotate at 00:00 UTC.** Keeping day boundaries on UTC means a daily id never straddles two dashboard days
  (section 6).
- **The client clock, bounded.** `daily_direct` takes its day from the client (`Math.floor(now / DAY_MS)`) while
  events are bucketed by `timestamp`, which is also the client's clock. An event is stored only when its `timestamp` is
  within 24 hours of its `reception_timestamp` (section 6), so a badly skewed clock is rejected rather than counted.
  Inside that window an id can still sit on a neighbouring UTC day, by at most one day boundary. Accepted: it is
  bounded, rare, and `daily_proxy` takes its day from the server clock.
- **A consent change mid-day counts that person twice** (one `daily_*` key, one `persistent` key). The privacy design
  prevents joining them. Accept; it is one visitor per consent decision.
- **Visitor ids are never shown or exported.** Only counts leave the system.

## 5. Definitions

**D1. Known visitors.** Distinct `visitor_id` with `id_mode = persistent` and at least one qualifying event in the
range. A true distinct count across the range, never a sum of daily counts.

**D2. Daily visitors.** For each UTC day, distinct `visitor_id` with `id_mode` in (`daily_direct`, `daily_proxy`); the
headline is the **sum of those per-day counts** (person-days), labelled as such. It is the one place where summing days
is correct, because ids cannot be linked across days.

**D3. Visits.** Distinct `session_id` in the range, computed over the range. Visits exist in every identity mode, so
they are the consent-invariant measure, the weekly headline, and the denominator for conversion rate.

**D4. Active visits now.** Distinct `session_id` with an event in the last 5 minutes. This is the renamed
`current_visitors` (`endpoints.ts`, `currentVisitors`). Unfiltered, like Plausible's equivalent.

**D5. Returning known visitors** (optional, behind a drill-down). Known visitors in the range who were also seen before
the range started. Defined for `persistent` only; undefined until history accumulates.

**D6. Legacy visitors.** Events with no `visitor_id`, keyed `legacy:` plus `session_id`. Reported on their own and never
merged with real visitor ids. Each return visit counts as a new legacy visitor.

**D7. Range totals are computed over the range, never summed from buckets, except D2.** A persistent visitor active on
three days appears in three daily bars and counts once in D1. Today the "Visits" card sums per-day distinct sessions
(`Kpis.tsx`, `sum("visits")`; the `kpis` pipe groups by `date, session_id`), so a session that crosses UTC midnight
counts twice. D7 fixes that. **The chart bars can add up to more than the headline, and the UI says so.**

## 6. Date filters and time zone

- The range is inclusive whole UTC days, `date_from` to `date_to` (`rangeToParams`). A single-day range switches the
  chart to hourly buckets; the headline is still one distinct count for the whole day, not the sum of hours.
- **Time zone: UTC for day and range boundaries everywhere.** Reasons, from the data-science review:
  - A local day always spans two UTC ids, so a person can count twice. Under assumed 5-10% same-day repeat rates and
    B2B working-hours traffic the overcount on a single local day is roughly 1-4% of daily visitors. These are derived
    figures from stated assumptions, not measurements.
  - It is worst on single-day and hourly views. On an N-day range only the two edge days differ, so it fades beyond
    about two weeks.
  - UTC buckets keep an exact invariant: the daily-visitor headline equals the sum of the daily bars. Keep this as a
    regression test.
- **Local time is a display aid only.** A permanent `UTC` badge sits beside the date picker; its popover shows the
  viewer's local equivalent (for example "days run midnight to midnight UTC, 4pm PT"). The hourly axis is relabelled in
  the viewer's local time, since hourly distinct counts are unaffected by id rotation. No count changes.
- **No time zone picker, and no local-zone view for consented-only traffic.** Persistent ids would permit it, but it
  creates two day boundaries in one UI, needs a zone parameter and DST handling in every pipe, and a pre-aggregated
  per-UTC-day state cannot be re-cut into local days. The hourly local axis covers the launch-monitoring case. Revisit
  only if owners ask.
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
- **Previous-period comparison** uses the same number of days immediately before (`date_calculations` in the `kpis`
  pipe), per metric. Show "n/a" when the previous period starts before identity rollout. Normalise per day when window
  lengths differ (28 vs 31 days).
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
- **Conversion rate by channel uses visits as the denominator**, with the consented share beside each channel row.
  Channels under about 30 visits are greyed out and not ranked.

## 8. Bots

- **Default: excluded** from Visits, Known visitors and Daily visitors, as in all four tools surveyed.
- **Opt-in toggle** ("Include bot traffic", a switch, default off, in the URL so shared links reproduce the view).
  - Impact shown as a quiet line: "412 bot visits hidden. Show". Hidden when zero.
  - When on, an amber "Including bots" chip and an "incl. bots" suffix on affected cards.
  - Show counts and share, by channel and by landing page, in visits. Bots almost never consent, so the effect lands on
    daily visitors, not known visitors.
- **Classifier limits** (the current rule is a user-agent regex, `pipes.ts`):
  - False positives: the substring "bot" also matches some Android devices.
  - False negatives, the larger B2B risk: email security scanners (link prefetchers) use ordinary browser user agents
    and show up as visits right after a campaign send. Headless browsers, spoofed agents and datacenter IPs are also
    missed.
  - Store `is_bot` and a `classifier_version` at ingest instead of recomputing at query time, so history never shifts
    silently. Hand-audit 100 flagged and 100 unflagged events before trusting it.

## 9. Exactness: `uniqCombined64`

- **Decision:** `uniqCombined64` for visitor and visit counts. It hashes every type with 64 bits (plain `uniqCombined`
  uses 32 bits for non-strings and is badly wrong at high cardinality). `uniqExact` stays as the audit path; its state
  is unbounded, but at our volume that is cheap.
- **What the ClickHouse docs say:** `uniqCombined` uses an array, then a hash set, then HyperLogLog with an error
  correction table; default `HLL_precision` 17 is about 96 KiB per state. The docs do **not** claim exact results at
  any cardinality and give no numeric thresholds. Sources: the ClickHouse reference pages for `uniq`, `uniqCombined`,
  `uniqExact`.
- **Derived, not measured:** with 64-bit hashes, collision probability at 10,000 ids is about n^2 / 2^65, roughly
  3e-12. HyperLogLog at precision 17 has standard error about 1.04 / sqrt(2^17), about 0.29% (about 290 at 100k).
- **Proposed UI wording until tested:** "exact under N, about 0.3% above", where N is found by the test below.
- **Test before shipping** (this is also the first TDD cycle of the implementation):
  - Synthetic UUID strings at n = 1 to 50 (every value), then 100, 1k, 5k, 10k, 100k and 1M, with many seeds at small n.
  - Per-day `uniqCombined64State` merged with `uniqCombined64Merge` over 90 days with overlapping ids, against
    `uniqExact`.
  - A shadow comparison against `uniqExact` on real hits after launch.
  - Tolerance: zero difference up to the empirical exact ceiling (require at least 5k); above it, relative error at
    most 1%.
- **Unverified:** the array and hash-set thresholds `uniqCombined` actually uses (they are template parameters in
  `CombinedCardinalityEstimator.h`; the concrete values were not confirmed).

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
- Report time zones for Umami and Matomo, and the distinct engine for Simple Analytics, are unverified.

What this means for us:

- Our daily-id behaviour matches Plausible's. Plausible's maintainers acknowledge the "visitors" label can mislead, so
  we label daily visitors as person-days.
- No surveyed tool shows a consented-versus-cookieless split; Matomo blends them. Keeping the split is ours to design.
- No surveyed tool lets you toggle bots back in the way we plan; only Simple Analytics offers the hidden visits, via
  export.
- No surveyed tool documents how to compare periods across a tracking-method change. Unverified for all four.
- Plausible's salt rotates on UTC while its reports use the site zone, and no doc reconciles the two. We avoid the
  problem by bucketing in UTC.

## 11. Interface rules

Layout (separate cards grouped by what they measure; one chart series at a time, so nothing invites adding them):

```text
 PEOPLE (browsers)                         ACTIVITY
 [Known visitors] [Daily visitors]         [Visits]
 Not additive: known and daily are different people; visits are a different unit.
 Chart: [Visits | Known | Daily] selector, one series at a time   (Times in UTC)
```

- Labels and one-line caveats:
  - Known visitors: "Counted once per browser across the whole range. Only people who accepted tracking."
  - Daily visitors: "Counted per day, so a returning person counts again each day. Anonymous."
  - Visits: "Browsing sessions; one person can make several."
  - Active visits now: "Sessions with activity in the last 5 minutes."
- Show the consented share (known visits over all visits) beside the visitor cards and channel rows.
- Every explanation has three layers: a one-line caption, a keyboard-focusable popover, and a "How we count" link.
- Chart caption: bars are per-day counts and can add up to more than the card.
- Legacy periods: a chart band reading "Earlier data: visitors counted per session", and a card footnote only when the
  range overlaps it.
- No consented visitors yet: show "0 (no consent yet)" muted, keep the card in place.
- Exports include the dashboard's settings (time zone, bot toggle, date range, consented share), so they survive being
  pasted into a slide, and totals match the dashboard.
- Year-over-year is acceptable for visits and conversions. Refuse it for visitor metrics from before identity rollout.

## 12. What the definitions imply technically (not decided)

Constraints that come straight from the definitions:

- D1 and D3 need a **distinct count across days**, so any pre-aggregation must store something mergeable
  (`uniqCombined64State` read with `uniqCombined64Merge`), not per-day counts that get added. D2 is the exception.
- A pre-aggregated state answers only the filter combinations it keeps as dimensions, cannot be subtracted, and freezes
  the visitor key at write time. The existing `analytics_sessions_mv` is keyed by `session_id` with
  `device`/`browser`/`location` as `any(...)`, so it already loses multi-valued hits.
- Per-UTC-day states cannot be re-cut into other zones. This is fine because the time zone decision is UTC.
- State size is up to about 96 KiB per group at high cardinality, so a wide dimension cross-product bloats storage.
- Whether we need a materialized view at all depends on volume: **unverified.** Counting directly from `analytics_hits`
  for the current scale may be simpler and exact.
- Ingest-time logic lives in the Null-engine landing and its views (`apps/tinybird/README.md`), including the
  reception-time bounds and the trust window, so aggregates only ever see trusted events.
- `visitor_id` and `id_mode` are already columns of `analytics_hits`. `is_bot` and `classifier_version` (section 8) and
  the `legacy:` key namespacing (D6) are the only ingest-adjacent additions.

## 13. Open items

- **Unverified:** `uniqCombined` array and hash-set thresholds; exactness at our volumes (section 9).
- **Unverified:** the production rollout date of `visitor_id` and how much existing traffic predates it.
- **Unverified:** Plausible's rotation time zone and the report time zones of Umami, Matomo and Simple Analytics.
- Decide pipes vs materialized views once the `uniqCombined64` test (section 9) is done.
