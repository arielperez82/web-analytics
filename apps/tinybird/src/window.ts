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

export const compareWindowParams = {
  compare_from: p.string().optional().describe("First day of the comparison period; give it with compare_to, as long as the current range"),
  compare_to: p.string().optional().describe("Last day of the comparison period, inclusive; give it with compare_from"),
  compare_from_at: p.string().optional().describe("First instant of the comparison window, ISO 8601; give it with compare_to_at, as long as the current window"),
  compare_to_at: p.string().optional().describe("Last instant of the comparison window, exclusive, ISO 8601; give it with compare_from_at"),
};

export const isComparingSql = `((defined(include_previous_period) and include_previous_period == 'true') or defined(compare_from) or defined(compare_to) or defined(compare_from_at) or defined(compare_to_at))`;

const compareError = (message: string): string => `{{ custom_error({'error': '${message}'}) }}`;

const requireHourlyCompareSql = `
            {% if defined(compare_from) or defined(compare_to) %} ${compareError("An exact window is compared with compare_from_at and compare_to_at, not days")} {% end %}
            {% if not (defined(compare_from_at) and defined(compare_to_at)) %} ${compareError("Comparing needs both compare_from_at and compare_to_at")} {% end %}`;

const requireDailyCompareSql = `
            {% if defined(compare_from_at) or defined(compare_to_at) %} ${compareError("A day range is compared with compare_from and compare_to, not instants")} {% end %}
            {% if not (defined(compare_from) and defined(compare_to)) %} ${compareError("Comparing needs both compare_from and compare_to")} {% end %}`;

const COMPARE_FROM_AT = `parseDateTimeBestEffort({{ String(compare_from_at) }}, 'UTC')`;
const COMPARE_TO_AT = `parseDateTimeBestEffort({{ String(compare_to_at) }}, 'UTC')`;
const COMPARE_FROM_DAY = `toDateTime(toDate({{ String(compare_from) }}), ${tzSql})`;
const COMPARE_TO_DAY = `toDateTime(toDate({{ String(compare_to) }}) + 1, ${tzSql})`;

const compareSpanSql = `
                + throwIf(dateDiff('second', ${COMPARE_FROM_AT}, ${COMPARE_TO_AT}) != dateDiff('second', current_start_at, current_end_at), 'The compared window must be as long as the current window')`;

const compareDaysSql = `
                + throwIf(dateDiff('day', ${COMPARE_FROM_DAY}, ${COMPARE_TO_DAY}, ${tzSql}) != dateDiff('day', current_start_at, current_end_at, ${tzSql}), 'The compared days must be as many as the current days')`;

export const comparedWindowSql = `${currentWindowSql},
            {% if ${isComparingSql} %}
                {% if defined(from_at) %} ${requireHourlyCompareSql}
                ${COMPARE_FROM_AT} ${compareSpanSql}
                {% else %} ${requireDailyCompareSql}
                ${COMPARE_FROM_DAY} ${compareDaysSql}
                {% end %}
            {% elif defined(from_at) %} subtractSeconds(current_start_at, dateDiff('second', current_start_at, current_end_at))
            {% else %} toDateTime(previous_start, ${tzSql}) {% end %} AS previous_start_at,
            {% if ${isComparingSql} %}
                {% if defined(from_at) %} ${COMPARE_TO_AT} {% else %} ${COMPARE_TO_DAY} {% end %}
            {% else %} current_start_at {% end %} AS previous_end_at`;

export const exactRangeSql = `timestamp >= parseDateTimeBestEffort(${FROM_AT}, 'UTC')
                AND timestamp < {% if defined(to_at) %} parseDateTimeBestEffort(${TO_AT}, 'UTC') {% else %} addHours(toStartOfHour(now('UTC')), 1) {% end %}`;
