// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { historyUrlSearch } from "./history-url-search";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("historyUrlSearch", () => {
  it("reads the search string of the address bar", () => {
    window.history.replaceState(null, "", "/reports/pages?days=30&tz=UTC");

    expect(historyUrlSearch.read()).toBe("days=30&tz=UTC");
  });

  it("reads nothing when the address bar has no search string", () => {
    expect(historyUrlSearch.read()).toBe("");
  });

  it("replaces the search string at once and keeps the page", () => {
    window.history.replaceState(null, "", "/reports/pages?days=30");

    historyUrlSearch.replace("range=last_24_hours&tz=UTC");

    expect(window.location.pathname).toBe("/reports/pages");
    expect(historyUrlSearch.read()).toBe("range=last_24_hours&tz=UTC");
  });

  it("leaves a bare path when the search string is emptied", () => {
    window.history.replaceState(null, "", "/reports/pages?days=30");

    historyUrlSearch.replace("");

    expect(window.location.href.endsWith("/reports/pages")).toBe(true);
  });

  it("does not add an entry to the browser history", () => {
    const before = window.history.length;

    historyUrlSearch.replace("days=30");

    expect(window.history.length).toBe(before);
  });
});
