import { describe, expect, it } from "vitest";

import { REPORTS, reportBySlug } from "./reports";

describe("reportBySlug", () => {
  it("finds a report by its slug", () => {
    expect(reportBySlug("sources")).toMatchObject({ endpoint: "top_sources", labelKey: "referrer" });
  });

  it("returns undefined for an unknown slug", () => {
    expect(reportBySlug("nope")).toBeUndefined();
  });

  it("offers the filter key only for dimensions that can be filtered", () => {
    expect(reportBySlug("locations")?.filterKey).toBe("location");
    expect(reportBySlug("pages")?.filterKey).toBeUndefined();
  });

  it("has unique slugs", () => {
    const slugs = REPORTS.map((report) => report.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
