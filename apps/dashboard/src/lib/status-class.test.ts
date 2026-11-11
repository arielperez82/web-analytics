import { describe, expect, it } from "vitest";

import { statusClass } from "./status-class";

describe("statusClass", () => {
  it("kebab-cases a pipe status into a css class", () => {
    expect(statusClass("Excellent")).toBe("status-excellent");
    expect(statusClass("Needs Improvement")).toBe("status-needs-improvement");
    expect(statusClass("poor")).toBe("status-poor");
  });

  it("falls back to unknown for missing or odd values", () => {
    expect(statusClass(null)).toBe("status-unknown");
    expect(statusClass(undefined)).toBe("status-unknown");
    expect(statusClass("")).toBe("status-unknown");
  });
});
