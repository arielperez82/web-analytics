// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTheme } from "./use-theme";

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

const attribute = () => document.documentElement.getAttribute("data-theme");

describe("useTheme", () => {
  it("starts on the system theme and leaves the page to the media queries", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.choice).toBe("system");
    expect(attribute()).toBeNull();
  });

  it("applies a chosen theme to the page", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.choose("dark"));

    expect(result.current.choice).toBe("dark");
    expect(attribute()).toBe("dark");
  });

  it("lets light override a dark system preference by setting it explicitly", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.choose("light"));

    expect(attribute()).toBe("light");
  });

  it("hands the page back to the media queries when system is chosen again", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.choose("contrast"));

    act(() => result.current.choose("system"));

    expect(attribute()).toBeNull();
  });

  it("remembers the choice for the next visit", () => {
    const first = renderHook(() => useTheme());
    act(() => first.result.current.choose("contrast"));
    first.unmount();

    const second = renderHook(() => useTheme());

    expect(second.result.current.choice).toBe("contrast");
  });

  it("shows system on the first render and the saved choice straight after", () => {
    window.localStorage.setItem("theme", "dark");
    const seen: string[] = [];
    renderHook(() => {
      const { choice } = useTheme();
      seen.push(choice);
      return choice;
    });

    expect(seen[0]).toBe("system");
    expect(seen.at(-1)).toBe("dark");
  });

  it("does not touch the theme the page script already set when it mounts", () => {
    window.localStorage.setItem("theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");

    renderHook(() => useTheme());

    expect(attribute()).toBe("dark");
  });

  it("ignores a saved value it does not know", () => {
    window.localStorage.setItem("theme", "sepia");

    const { result } = renderHook(() => useTheme());

    expect(result.current.choice).toBe("system");
  });

  it("still switches the theme when the browser refuses storage", () => {
    const refuse = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.choose("dark"));

    expect(result.current.choice).toBe("dark");
    expect(attribute()).toBe("dark");
  });
});
