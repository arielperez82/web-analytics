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

  it("writes seconds with a short unit", () => {
    expect(formatSeconds(60)).toBe("60s");
  });

  it("explains that large counts are approximate", () => {
    expect(APPROXIMATE_COUNT_NOTE).toBe("Exact for small counts, within 1% for large ones.");
  });
});
