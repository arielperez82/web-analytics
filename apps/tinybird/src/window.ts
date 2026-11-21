import { p } from "@tinybirdco/sdk";

import { tzSql } from "./time-zone";

const FROM_AT = `{{ String(from_at, description="First instant, inclusive, ISO 8601 such as 2026-11-10T05:00:00Z. Replaces the day range; on the hour so the hourly tables line up") }}`;
const TO_AT = `{{ String(to_at, description="Last instant, exclusive, ISO 8601; defaults to the end of the current hour when from_at is set") }}`;

/**
 * A request may give its range as exact instants instead of whole days. Then `from_at` starts the
 * range, `to_at` ends it (the end of the current hour when missing, so the length is whole hours) and the period before it is the same length, ending where
 * the range starts. Without `from_at` the days decide, as before.
 */
export const windowParams = {
  from_at: p.string().optional().describe("First instant, inclusive, ISO 8601; replaces date_from and date_to"),
  to_at: p.string().optional().describe("Last instant, exclusive, ISO 8601; the end of the current hour when missing"),
};

export const currentWindowSql = `
            {% if defined(from_at) %} parseDateTimeBestEffort(${FROM_AT}, 'UTC') {% else %} toDateTime(current_start, ${tzSql}) {% end %} AS current_start_at,
            {% if defined(from_at) %} {% if defined(to_at) %} parseDateTimeBestEffort(${TO_AT}, 'UTC') {% else %} addHours(toStartOfHour(now('UTC')), 1) {% end %} {% else %} toDateTime(current_end + 1, ${tzSql}) {% end %} AS current_end_at`;

export const previousWindowSql = `${currentWindowSql},
            {% if defined(from_at) %} subtractSeconds(current_start_at, dateDiff('second', current_start_at, current_end_at)) {% else %} toDateTime(previous_start, ${tzSql}) {% end %} AS previous_start_at,
            current_start_at AS previous_end_at`;

export const exactRangeSql = `timestamp >= parseDateTimeBestEffort(${FROM_AT}, 'UTC')
                AND timestamp < {% if defined(to_at) %} parseDateTimeBestEffort(${TO_AT}, 'UTC') {% else %} addHours(toStartOfHour(now('UTC')), 1) {% end %}`;
