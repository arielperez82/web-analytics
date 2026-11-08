import { describe, expect, it } from "vitest";

import { drillDay, hrefFor, parseState, toSearch } from "./dashboard-state";

const parse = (search: string) => parseState(new URLSearchParams(search));

describe("parseState", () => {
  it("defaults to the last 7 days with no filters", () => {
    expect(parse("")).toEqual({ range: { days: 7 }, filters: {} });
  });

  it("reads days, domain and cross-filters", () => {
    expect(parse("days=30&domain=a.com&location=DE&device=mobile-ios&browser=safari")).toEqual({
      range: { days: 30 },
      domain: "a.com",
      filters: { location: "DE", device: "mobile-ios", browser: "safari" },
    });
  });

  it("reads a custom day range", () => {
    expect(parse("from=2026-11-01&to=2026-11-03").range).toEqual({ from: "2026-11-01", to: "2026-11-03" });
  });

  it("prefers a custom range over days", () => {
    expect(parse("days=30&from=2026-11-01&to=2026-11-03").range).toEqual({ from: "2026-11-01", to: "2026-11-03" });
  });

  it("ignores unsupported day counts", () => {
    expect(parse("days=45").range).toEqual({ days: 7 });
  });

  it.each(["from=2026-11-01", "from=nope&to=2026-11-03", "from=2026-11-05&to=2026-11-03", "from=2026-02-31&to=2026-03-02"])(
    "ignores an invalid custom range (%s)",
    (search) => {
      expect(parse(search).range).toEqual({ days: 7 });
    },
  );

  it("drops empty filter values", () => {
    expect(parse("location=&domain=")).toEqual({ range: { days: 7 }, filters: {} });
  });
});

describe("toSearch", () => {
  it("omits defaults", () => {
    expect(toSearch({ range: { days: 7 }, filters: {} })).toBe("");
  });

  it("round-trips every field", () => {
    const state = {
      range: { from: "2026-11-01", to: "2026-11-03" },
      domain: "a.com",
      filters: { location: "DE", browser: "safari" },
    };
    expect(parseState(new URLSearchParams(toSearch(state)))).toEqual(state);
  });

  it("writes days when not the default", () => {
    expect(toSearch({ range: { days: 30 }, filters: {} })).toBe("days=30");
  });
});

describe("drillDay", () => {
  it("narrows the range to the clicked day and keeps other state", () => {
    expect(
      drillDay({ range: { days: 30 }, domain: "a.com", filters: { device: "bot" } }, "2026-11-05"),
    ).toEqual({
      range: { from: "2026-11-05", to: "2026-11-05" },
      domain: "a.com",
      filters: { device: "bot" },
    });
  });

  it("clicking the selected day again returns to the default range", () => {
    const state = { range: { from: "2026-11-05", to: "2026-11-05" }, filters: {} };
    expect(drillDay(state, "2026-11-05").range).toEqual({ days: 7 });
  });
});

describe("hrefFor", () => {
  it("appends the state as a query string", () => {
    expect(hrefFor("/reports/pages", { range: { days: 30 }, filters: { location: "DE" } })).toBe(
      "/reports/pages?days=30&location=DE",
    );
  });

  it("omits the question mark for default state", () => {
    expect(hrefFor("/", { range: { days: 7 }, filters: {} })).toBe("/");
  });
});
