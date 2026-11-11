import { describe, expect, it } from "vitest";

import { FILTER_LABEL_KEYS, activeFilters, toggleFilter } from "./filters";

describe("toggleFilter", () => {
  it("sets a filter that is not active", () => {
    expect(toggleFilter({}, "location", "US")).toEqual({ location: "US" });
  });

  it("clears the filter when the same value is picked again", () => {
    expect(toggleFilter({ location: "US" }, "location", "US")).toEqual({});
  });

  it("replaces a different value for the same dimension", () => {
    expect(toggleFilter({ location: "US" }, "location", "DE")).toEqual({
      location: "DE",
    });
  });

  it("keeps filters on other dimensions", () => {
    expect(toggleFilter({ device: "desktop" }, "location", "US")).toEqual({
      device: "desktop",
      location: "US",
    });
  });

  it("does not mutate its input", () => {
    const input = Object.freeze({ location: "US" });
    expect(() => toggleFilter(input, "device", "desktop")).not.toThrow();
  });
});

describe("activeFilters", () => {
  it("lists set filters in a stable order", () => {
    expect(activeFilters({ browser: "chrome", location: "US" })).toEqual([
      { key: "location", value: "US" },
      { key: "browser", value: "chrome" },
    ]);
  });
});

describe("FILTER_LABEL_KEYS", () => {
  it("maps the table label columns that can be sliced", () => {
    expect(FILTER_LABEL_KEYS).toEqual({
      location: "location",
      device: "device",
      browser: "browser",
    });
  });
});
