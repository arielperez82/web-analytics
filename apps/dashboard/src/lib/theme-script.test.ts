// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { THEME_CHOICES } from "./theme";
import { THEME_SCRIPT } from "./theme-script";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

const run = () => new Function(THEME_SCRIPT)();
const attribute = () => document.documentElement.getAttribute("data-theme");

describe("theme script", () => {
  it.each(THEME_CHOICES.filter((choice) => choice !== "system"))("applies the saved %s theme", (choice) => {
    window.localStorage.setItem("theme", choice);

    run();

    expect(attribute()).toBe(choice);
  });

  it("leaves the page to the media queries for system", () => {
    window.localStorage.setItem("theme", "system");

    run();

    expect(attribute()).toBeNull();
  });

  it("leaves the page alone when nothing is saved", () => {
    run();

    expect(attribute()).toBeNull();
  });

  it.each(["sepia", "Dark", "", "\"><script>"])("ignores the saved value %j", (raw) => {
    window.localStorage.setItem("theme", raw);

    run();

    expect(attribute()).toBeNull();
  });

  it("leaves the page alone when the browser refuses storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(run).not.toThrow();
    expect(attribute()).toBeNull();
  });
});
