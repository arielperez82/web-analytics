"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { comparisonRange } from "./comparison-range";
import { type DashboardState, parseState, toSearch } from "./dashboard-state";
import { rangeToParams } from "./time-range";
import { browserTimeZone } from "./time-zone";
import { useUrlSearch } from "./url-search-context";

const noSubscription = () => () => undefined;
const serverZone = () => "UTC";

export type QueryParams = Readonly<Record<string, string | undefined>>;

export type ComparisonParams = {
  readonly compare_from: string;
  readonly compare_to: string;
  readonly compare_from_at?: string;
};

export const useDashboardState = () => {
  const search = useSearchParams();
  const key = search.toString();
  const state = useMemo(() => parseState(new URLSearchParams(key)), [key]);
  const browserZone = useSyncExternalStore(noSubscription, browserTimeZone, serverZone);
  const zone = state.tz ?? browserZone;
  const urlSearch = useUrlSearch();
  const update = useCallback((next: DashboardState) => urlSearch.replace(toSearch(next)), [urlSearch]);
  useEffect(() => {
    const latest = parseState(new URLSearchParams(urlSearch.read()));
    if (latest.tz === undefined) update({ ...latest, tz: browserTimeZone() });
  }, [state, urlSearch, update]);
  const params = useMemo<QueryParams>(
    () => ({
      ...rangeToParams(state.range, new Date(), zone),
      tz: zone,
      tenant_id: state.tenant,
      domain: state.domain,
      include_bots: state.includeBots ? "1" : undefined,
      ...state.filters,
    }),
    [state, zone],
  );
  const comparison = useMemo(() => {
    if (state.compare === "off") return undefined;
    const range = comparisonRange({
      range: state.range,
      now: new Date(),
      zone,
      mode: state.compare ?? "previous",
    });
    return range === undefined
      ? undefined
      : {
          compare_from: range.date_from,
          compare_to: range.date_to,
          ...(range.from_at === undefined ? {} : { compare_from_at: range.from_at }),
        };
  }, [state, zone]);
  return { state, update, params, comparison, zone };
};
