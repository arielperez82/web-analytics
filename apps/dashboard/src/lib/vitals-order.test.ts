import { describe, expect, it } from "vitest";

import { orderVitals } from "./vitals-order";

const row = (domain: string, metric_name: string) => ({ domain, metric_name });

describe("orderVitals", () => {
  it("groups by domain, then follows the vitals order", () => {
    const ordered = orderVitals([
      row("b.example", "LCP"),
      row("a.example", "TTFB"),
      row("a.example", "LCP"),
      row("a.example", "CLS"),
    ]);

    expect(ordered).toEqual([
      row("a.example", "LCP"),
      row("a.example", "CLS"),
      row("a.example", "TTFB"),
      row("b.example", "LCP"),
    ]);
  });

  it("puts a metric it does not know before the known ones", () => {
    const ordered = orderVitals([row("a.example", "LCP"), row("a.example", "FID")]);

    expect(ordered.map((r) => r.metric_name)).toEqual(["FID", "LCP"]);
  });

  it("does not change the rows it is given", () => {
    const rows = [row("b.example", "LCP"), row("a.example", "LCP")];

    orderVitals(rows);

    expect(rows.map((r) => r.domain)).toEqual(["b.example", "a.example"]);
  });
});
