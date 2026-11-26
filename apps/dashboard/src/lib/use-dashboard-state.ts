"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { comparisonRange } from "./comparison-range";
import { type DashboardState,hrefFor, parseState } from "./dashboard-state";
import { rangeToParams } from "./time-range";
import { browserTimeZone } from "./time-zone";

const noSubscription = () => () => undefined;
const serverZone = () => "UTC";

const addressBarState = (): DashboardState => parseState(new URLSearchParams(window.location.search));

const update = (next: DashboardState): void =>
  window.history.replaceState(null, "", hrefFor(window.location.pathname, next));

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
  useEffect(() => {
    const latest = addressBarState();
    if (latest.tz === undefined) update({ ...latest, tz: browserTimeZone() });
  }, [state]);
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
