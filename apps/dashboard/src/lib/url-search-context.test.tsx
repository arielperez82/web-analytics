// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { type AppRouterInstance, AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { RouterUrlSearch, useUrlSearch } from "./url-search-context";

const nothing = () => undefined;

const routerLandingAtOnce: AppRouterInstance = {
  back: nothing,
  forward: nothing,
  refresh: nothing,
  push: nothing,
  prefetch: nothing,
  replace: (href, options) => window.history.replaceState(options ?? null, "", href),
  bfcacheId: "fake",
};

const underNextRouter = ({ children }: { children: ReactNode }) => (
  <AppRouterContext.Provider value={routerLandingAtOnce}>
    <RouterUrlSearch>{children}</RouterUrlSearch>
  </AppRouterContext.Provider>
);

afterEach(() => window.history.replaceState(null, "", "/"));

describe("the URL search the dashboard writes through", () => {
  it("is the browser history unless something else is provided", () => {
    const { result } = renderHook(() => useUrlSearch());

    result.current.replace("days=30");

    expect(window.location.search).toBe("?days=30");
    expect(window.history.state).toBeNull();
  });

  it("is the Next router inside RouterUrlSearch", () => {
    const { result } = renderHook(() => useUrlSearch(), { wrapper: underNextRouter });

    result.current.replace("days=30");

    expect(window.location.search).toBe("?days=30");
    expect(window.history.state).toEqual({ scroll: false });
  });

  it("stays the same object between renders, so effects depending on it do not rerun", () => {
    const { result, rerender } = renderHook(() => useUrlSearch(), { wrapper: underNextRouter });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
