// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { browserTimeZone } from "./time-zone";
import { useDashboardState } from "./use-dashboard-state";

let search = "";
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

afterEach(() => {
  search = "";
  replace.mockClear();
});

describe("useDashboardState", () => {
  it("sends the time zone chosen in the URL with every request", () => {
    search = "tz=Asia%2FTokyo";
    const { result } = renderHook(() => useDashboardState());

    expect(result.current.params.tz).toBe("Asia/Tokyo");
  });

  it("falls back to the time zone of the browser", () => {
    const { result } = renderHook(() => useDashboardState());

    expect(result.current.params.tz).toBe(browserTimeZone());
  });

  it("counts the preset range on the calendar of that zone", () => {
    vi.useFakeTimers({ now: new Date("2026-11-08T02:00:00Z") });
    search = "days=1&tz=America%2FNew_York";
    const { result } = renderHook(() => useDashboardState());
    vi.useRealTimers();

    expect(result.current.params.date_from).toBe("2026-11-07");
    expect(result.current.params.date_to).toBe("2026-11-07");
  });

  describe("the range the chart is compared with", () => {
    const comparisonOf = (query: string, now = "2026-11-18T12:00:00Z") => {
      vi.useFakeTimers({ now: new Date(now) });
      search = `${query}&tz=UTC`;
      const { result } = renderHook(() => useDashboardState());
      vi.useRealTimers();
      return result.current.comparison;
    };

    it("is the range just before it by default", () => {
      expect(comparisonOf("days=7")).toEqual({ compare_from: "2026-11-05", compare_to: "2026-11-11" });
    });

    it("is the same days a week earlier when asked", () => {
      expect(comparisonOf("days=1&compare=last_week")).toEqual({ compare_from: "2026-11-11", compare_to: "2026-11-11" });
    });

    it("starts at an exact hour for the last 24 hours", () => {
      expect(comparisonOf("range=last_24_hours", "2026-11-18T12:30:00Z")).toEqual({
        compare_from: "2026-11-16",
        compare_to: "2026-11-17",
        compare_from_at: "2026-11-16T13:00:00Z",
      });
    });

    it("is nothing when switched off", () => {
      expect(comparisonOf("days=7&compare=off")).toBeUndefined();
    });

    it("is nothing for all time", () => {
      expect(comparisonOf("range=all_time")).toBeUndefined();
    });

    it("counts days on the calendar of the zone", () => {
      vi.useFakeTimers({ now: new Date("2026-11-18T02:00:00Z") });
      search = "days=1&tz=America%2FNew_York";
      const { result } = renderHook(() => useDashboardState());
      vi.useRealTimers();

      expect(result.current.comparison).toEqual({ compare_from: "2026-11-16", compare_to: "2026-11-16" });
    });
  });

  it("writes the browser time zone into a URL that has none, so a shared link reads the same everywhere", () => {
    search = "days=30&domain=a.example";
    renderHook(() => useDashboardState());

    expect(replace).toHaveBeenCalledTimes(1);
    const href = String(replace.mock.calls[0]?.[0]);
    expect(new URLSearchParams(href.split("?")[1]).get("tz")).toBe(browserTimeZone());
    expect(href).toContain("days=30");
    expect(href).toContain("domain=a.example");
  });

  it("leaves a URL that already names a time zone alone", () => {
    search = "tz=Asia%2FTokyo";
    renderHook(() => useDashboardState());

    expect(replace).not.toHaveBeenCalled();
  });
});
