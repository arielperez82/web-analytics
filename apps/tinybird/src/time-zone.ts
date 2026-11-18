import { p } from "@tinybirdco/sdk";

/**
 * The time zone a request reads its days in. The date range is whole days in this zone, so a range
 * starts at the zone's midnight and ends at the next one; the instants are what the queries compare
 * against. An unknown zone makes the query fail rather than fall back to UTC.
 */
export const tzSql = `{{ String(tz, 'UTC', description="IANA time zone the days are read in, e.g. Europe/Madrid. Defaults to UTC") }}`;

export const tzParam = {
  tz: p.string().optional("UTC").describe("IANA time zone the days are read in, e.g. Europe/Madrid. Defaults to UTC"),
};
