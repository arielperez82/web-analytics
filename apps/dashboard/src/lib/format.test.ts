import { describe, expect, it } from "vitest";

import {
  APPROXIMATE_COUNT_NOTE,
  formatNumber,
  formatPercent,
  formatSeconds,
  formatSignedNumber,
  formatSignedPercent,
  formatSignedPoints,
  formatSignedSeconds,
  spokenSignedPoints,
  spokenSignedSeconds,
} from "./format";

describe("format", () => {
  it("groups thousands and keeps at most two decimals", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(2.456)).toBe("2.46");
    expect(formatNumber(0)).toBe("0");
  });

  it("writes a percentage the API already computed", () => {
    expect(formatPercent(75)).toBe("75%");
    expect(formatPercent(33.33)).toBe("33.33%");
  });

  it("signs growth, leaving zero unsigned", () => {
    expect(formatSignedPercent(50)).toBe("+50%");
    expect(formatSignedPercent(-12.5)).toBe("-12.5%");
    expect(formatSignedPercent(0)).toBe("0%");
  });

  it("signs a change in the figure's own unit, leaving zero unsigned", () => {
    expect(formatSignedNumber(1234)).toBe("+1,234");
    expect(formatSignedNumber(-4)).toBe("-4");
    expect(formatSignedNumber(0)).toBe("0");
    expect(formatSignedPoints(-1.5)).toBe("-1.5 pp");
    expect(formatSignedPoints(100)).toBe("+100 pp");
    expect(formatSignedPoints(0)).toBe("0 pp");
    expect(formatSignedSeconds(12.25)).toBe("+12.25s");
    expect(formatSignedSeconds(-45)).toBe("-45s");
    expect(formatSignedSeconds(0)).toBe("0s");
  });

  describe("a change that is also read aloud", () => {
    it("keeps the short percentage-point text and spells the unit and the sign out for speech", () => {
      expect(spokenSignedPoints(-1.5)).toEqual({ text: "-1.5 pp", spoken: "minus 1.5 percentage points" });
      expect(spokenSignedPoints(100)).toEqual({ text: "+100 pp", spoken: "plus 100 percentage points" });
      expect(spokenSignedPoints(0)).toEqual({ text: "0 pp", spoken: "0 percentage points" });
    });

    it("says one percentage point in the singular, judged on the figure as it is shown", () => {
      expect(spokenSignedPoints(1).spoken).toBe("plus 1 percentage point");
      expect(spokenSignedPoints(-1).spoken).toBe("minus 1 percentage point");
      expect(spokenSignedPoints(1.001)).toEqual({ text: "+1 pp", spoken: "plus 1 percentage point" });
      expect(spokenSignedPoints(1.5).spoken).toBe("plus 1.5 percentage points");
    });

    it("keeps the short seconds text and says the word, singular for exactly one", () => {
      expect(spokenSignedSeconds(5)).toEqual({ text: "+5s", spoken: "plus 5 seconds" });
      expect(spokenSignedSeconds(-45)).toEqual({ text: "-45s", spoken: "minus 45 seconds" });
      expect(spokenSignedSeconds(12.25)).toEqual({ text: "+12.25s", spoken: "plus 12.25 seconds" });
      expect(spokenSignedSeconds(1)).toEqual({ text: "+1s", spoken: "plus 1 second" });
      expect(spokenSignedSeconds(-1)).toEqual({ text: "-1s", spoken: "minus 1 second" });
      expect(spokenSignedSeconds(0)).toEqual({ text: "0s", spoken: "0 seconds" });
    });
  });

  it("writes seconds with a short unit", () => {
    expect(formatSeconds(60)).toBe("60s");
  });

  it("explains that large counts are approximate", () => {
    expect(APPROXIMATE_COUNT_NOTE).toBe("Exact for small counts, within 1% for large ones.");
  });
});
