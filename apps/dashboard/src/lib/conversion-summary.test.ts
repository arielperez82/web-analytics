import { describe, expect, it } from "vitest";

import { summarizeConversions } from "./conversion-summary";

describe("summarizeConversions", () => {
  it("totals visits and conversions and derives the overall rate", () => {
    const summary = summarizeConversions([
      { channel: "Paid", visits: "2", conversions: "1", conversion_rate: 0.5 },
      { channel: "Email", visits: 2, conversions: 0, conversion_rate: 0 },
    ]);
    expect(summary).toEqual({
      visits: 4,
      conversions: 1,
      rate: 0.25,
      channels: [
        { channel: "Paid", visits: 2, conversions: 1, rate: 0.5 },
        { channel: "Email", visits: 2, conversions: 0, rate: 0 },
      ],
    });
  });

  it("reports a zero rate when there are no visits", () => {
    expect(summarizeConversions([])).toEqual({ visits: 0, conversions: 0, rate: 0, channels: [] });
  });

  it("orders channels by conversions, then visits", () => {
    const { channels } = summarizeConversions([
      { channel: "Direct", visits: 9, conversions: 0, conversion_rate: 0 },
      { channel: "Paid", visits: 2, conversions: 2, conversion_rate: 1 },
      { channel: "Email", visits: 4, conversions: 2, conversion_rate: 0.5 },
    ]);
    expect(channels.map((c) => c.channel)).toEqual(["Email", "Paid", "Direct"]);
  });
});
