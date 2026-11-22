// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useSidebarCollapsed } from "./use-sidebar-collapsed";

afterEach(() => {
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

  it("still toggles when the browser refuses storage", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked");
      },
    });
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => result.current.toggle());

    expect(result.current.collapsed).toBe(true);
    if (original) Object.defineProperty(window, "localStorage", original);
  });
});
