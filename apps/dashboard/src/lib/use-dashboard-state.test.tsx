// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { type ReactNode, useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { browserTimeZone } from "./time-zone";
import type { UrlSearch } from "./url-search";
import { UrlSearchProvider } from "./url-search-context";
import { useDashboardState } from "./use-dashboard-state";

const fakeUrlSearch = (initial: string): UrlSearch => {
  const held = { search: initial };
  return {
    read: () => held.search,
    replace: (search) => {
      held.search = search;
    },
  };
};

const visit = <Result,>(search: string, use: () => Result) => {
  const urlSearch = fakeUrlSearch(search);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UrlSearchProvider value={urlSearch}>
      <SearchParamsContext.Provider value={new URLSearchParams(search)}>{children}</SearchParamsContext.Provider>
    </UrlSearchProvider>
  );
  return { ...renderHook(use, { wrapper }), url: () => new URLSearchParams(urlSearch.read()) };
};

describe("useDashboardState", () => {
  it("sends the time zone chosen in the URL with every request", () => {
    const { result } = visit("tz=Asia%2FTokyo", () => useDashboardState());

    expect(result.current.params.tz).toBe("Asia/Tokyo");
  });

  it("falls back to the time zone of the browser", () => {
    const { result } = visit("", () => useDashboardState());

    expect(result.current.params.tz).toBe(browserTimeZone());
  });

  it("counts the preset range on the calendar of that zone", () => {
    vi.useFakeTimers({ now: new Date("2026-11-08T02:00:00Z") });
    const { result } = visit("days=1&tz=America%2FNew_York", () => useDashboardState());
    vi.useRealTimers();

    expect(result.current.params.date_from).toBe("2026-11-07");
    expect(result.current.params.date_to).toBe("2026-11-07");
  });

  describe("the compare choice sent with requests", () => {
    const comparisonOf = (query: string) => visit(`${query}&tz=UTC`, () => useDashboardState()).result.current.comparison;

    it("is the previous period by default", () => {
      expect(comparisonOf("days=7")).toEqual({ compare: "previous" });
    });

    it("is the same period last week when asked", () => {
      expect(comparisonOf("days=1&compare=last_week")).toEqual({ compare: "last_week" });
    });

    it("is the previous period for the last 24 hours, whose dates the proxy works out", () => {
      expect(comparisonOf("range=last_24_hours")).toEqual({ compare: "previous" });
    });

    it("is nothing when switched off", () => {
      expect(comparisonOf("days=7&compare=off")).toBeUndefined();
    });

    it("is nothing for all time", () => {
      expect(comparisonOf("range=all_time")).toBeUndefined();
    });

    it("never carries a date", () => {
      expect(Object.keys(comparisonOf("days=7&compare=last_week") ?? {})).toEqual(["compare"]);
    });
  });

  it("writes the browser time zone into a URL that has none, so a shared link reads the same everywhere", () => {
    const { url } = visit("days=30&domain=a.example", () => useDashboardState());

    expect(url().get("tz")).toBe(browserTimeZone());
    expect(url().get("days")).toBe("30");
    expect(url().get("domain")).toBe("a.example");
  });

  it("keeps a range picked before the time zone was written into the URL", () => {
    const { url } = visit("domain=a.example", () => {
      const { state, update } = useDashboardState();
      useLayoutEffect(() => update({ ...state, range: { preset: "last_24_hours" } }), []);
    });

    expect(url().get("range")).toBe("last_24_hours");
    expect(url().get("domain")).toBe("a.example");
    expect(url().get("tz")).toBe(browserTimeZone());
  });

  it("leaves a URL that already names a time zone alone", () => {
    const { url } = visit("tz=Asia%2FTokyo&utm_source=mail", () => useDashboardState());

    expect(url().toString()).toBe("tz=Asia%2FTokyo&utm_source=mail");
  });
});
