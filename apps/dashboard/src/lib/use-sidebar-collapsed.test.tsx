// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSidebarCollapsed } from "./use-sidebar-collapsed";

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  window.localStorage.clear();
});

describe("useSidebarCollapsed", () => {
  it("starts open", () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
  });

  it("remembers the choice for the next visit", () => {
    const first = renderHook(() => useSidebarCollapsed());
    act(() => first.result.current.toggle());
    expect(first.result.current.collapsed).toBe(true);
    first.unmount();

    const second = renderHook(() => useSidebarCollapsed());

    expect(second.result.current.collapsed).toBe(true);
  });

  it("opens again when toggled back", () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => result.current.toggle());
    act(() => result.current.toggle());

    expect(result.current.collapsed).toBe(false);
  });

  it("shows the open sidebar on the first render and the saved one straight after", () => {
    window.localStorage.setItem("sidebar-collapsed", "true");
    const seen: boolean[] = [];
    renderHook(() => {
      const { collapsed } = useSidebarCollapsed();
      seen.push(collapsed);
      return collapsed;
    });

    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);
  });

  it("still toggles, both ways, when the browser refuses storage", () => {
    const refuse = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggle());

    expect(result.current.collapsed).toBe(false);
  });
});
