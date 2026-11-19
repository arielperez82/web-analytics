// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { browserTimeZone } from "./time-zone";
import { useDashboardState } from "./use-dashboard-state";

let search = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(search),
}));

afterEach(() => {
  search = "";
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
});
