"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import type { CompareChoice } from "./compare-window";
import { type DashboardState, parseState, toSearch } from "./dashboard-state";
import { rangeToParams } from "./time-range";
import { browserTimeZone } from "./time-zone";
import { useUrlSearch } from "./url-search-context";

export const TenantScopeContext = createContext<string | undefined>(undefined);

const noSubscription = () => () => undefined;
const serverZone = () => "UTC";

export type QueryParams = Readonly<Record<string, string | undefined>>;

export type ComparisonParams = { readonly compare: CompareChoice };

export const useDashboardState = () => {
  const scoped = useContext(TenantScopeContext);
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
      tenant_id: scoped ?? (state.tenant?.trim() ? state.tenant : undefined),
      domain: state.domain,
      include_bots: state.includeBots ? "1" : undefined,
      ...state.filters,
    }),
    [state, zone, scoped],
  );
  const comparison = useMemo<ComparisonParams | undefined>(
    () =>
      state.compare === "off" || ("preset" in state.range && state.range.preset === "all_time")
        ? undefined
        : { compare: state.compare ?? "previous_period" },
    [state],
  );
  return { state, update, params, comparison, zone };
};
