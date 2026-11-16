import { describe, expect, it } from "vitest";

import {
  APPROXIMATE_COUNT_NOTE,
  formatNumber,
  formatPercent,
  formatSeconds,
  formatSignedPercent,
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

  it("writes seconds with a short unit", () => {
    expect(formatSeconds(60)).toBe("60s");
  });

  it("explains that large counts are approximate", () => {
    expect(APPROXIMATE_COUNT_NOTE).toBe("Exact for small counts, within 1% for large ones.");
  });
});
