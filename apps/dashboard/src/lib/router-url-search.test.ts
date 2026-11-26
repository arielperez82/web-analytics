// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { type ReplacingRouter, routerUrlSearch } from "./router-url-search";

const routerLandingAtOnce = (): ReplacingRouter => ({
  replace: (href, options) => window.history.replaceState(options ?? null, "", href),
});

afterEach(() => window.history.replaceState(null, "", "/"));

describe("routerUrlSearch", () => {
  it("reads the search string of the address bar", () => {
    window.history.replaceState(null, "", "/reports/pages?days=30&tz=UTC");

    expect(routerUrlSearch(routerLandingAtOnce()).read()).toBe("days=30&tz=UTC");
  });

  it("reads nothing when the address bar has no search string", () => {
    expect(routerUrlSearch(routerLandingAtOnce()).read()).toBe("");
  });

  it("asks the router to replace the search string on the same page", () => {
    window.history.replaceState(null, "", "/reports/pages?days=30");

    routerUrlSearch(routerLandingAtOnce()).replace("range=last_24_hours&tz=UTC");

    expect(window.location.pathname).toBe("/reports/pages");
    expect(window.location.search).toBe("?range=last_24_hours&tz=UTC");
  });

  it("asks for a bare path when the search string is emptied", () => {
    window.history.replaceState(null, "", "/reports/pages?days=30");

    routerUrlSearch(routerLandingAtOnce()).replace("");

    expect(window.location.href.endsWith("/reports/pages")).toBe(true);
  });

  it("asks the router not to scroll", () => {
    routerUrlSearch(routerLandingAtOnce()).replace("days=30");

    expect(window.history.state).toEqual({ scroll: false });
  });
});
