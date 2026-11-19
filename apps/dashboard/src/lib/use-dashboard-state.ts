"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { hrefFor, parseState, type DashboardState } from "./dashboard-state";
import { rangeToParams } from "./time-range";
import { browserTimeZone } from "./time-zone";

const noSubscription = () => () => undefined;
const serverZone = () => "UTC";

export type QueryParams = Readonly<Record<string, string | undefined>>;

export const useDashboardState = () => {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const key = search.toString();
  const state = useMemo(() => parseState(new URLSearchParams(key)), [key]);
  const browserZone = useSyncExternalStore(noSubscription, browserTimeZone, serverZone);
  const zone = state.tz ?? browserZone;
  const update = useCallback(
    (next: DashboardState) => router.replace(hrefFor(pathname, next), { scroll: false }),
    [pathname, router],
  );
  useEffect(() => {
    if (state.tz === undefined) update({ ...state, tz: browserTimeZone() });
  }, [state, update]);
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
  return { state, update, params, zone };
};
