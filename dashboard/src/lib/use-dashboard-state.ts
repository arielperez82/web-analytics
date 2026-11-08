"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { hrefFor, parseState, type DashboardState } from "./dashboard-state";
import { rangeToParams } from "./time-range";

export type QueryParams = Readonly<Record<string, string | undefined>>;

export const useDashboardState = () => {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const key = search.toString();
  const state = useMemo(() => parseState(new URLSearchParams(key)), [key]);
  const update = useCallback(
    (next: DashboardState) => router.replace(hrefFor(pathname, next), { scroll: false }),
    [pathname, router],
  );
  const params = useMemo<QueryParams>(
    () => ({
      ...rangeToParams(state.range, new Date()),
      tenant_id: state.tenant,
      domain: state.domain,
      ...state.filters,
    }),
    [state],
  );
  return { state, update, params };
};
