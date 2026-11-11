import { describe, expect, it } from "vitest";

import { parseWebVitalPayload } from "./web-vital-payload";

const valid = { name: "LCP", value: 1500, pathname: "/page" };

describe("parseWebVitalPayload", () => {
  it("accepts a complete payload and returns it typed", () => {
    expect(parseWebVitalPayload(valid)).toEqual({
      ok: true,
      payload: { name: "LCP", value: 1500, delta: 0, pathname: "/page" },
    });
  });

  it("reads a numeric string value as a number", () => {
    expect(parseWebVitalPayload({ ...valid, value: "3000" })).toEqual({
      ok: true,
      payload: expect.objectContaining({ value: 3000 }),
    });
  });

  it.each([
    ["a name that is not a metric", { ...valid, name: "BOGUS" }],
    ["a name that is a number", { ...valid, name: 123 }],
    ["a missing value", { name: "LCP", pathname: "/page" }],
    ["a null value", { ...valid, value: null }],
    ["a non-numeric value", { ...valid, value: "abc" }],
    ["a missing pathname", { name: "LCP", value: 1 }],
    ["an empty pathname", { ...valid, pathname: "" }],
    ["a zero timing", { ...valid, value: 0 }],
    ["a timing above its ceiling", { ...valid, value: 30000 }],
  ])("rejects %s", (_case, payload) => {
    expect(parseWebVitalPayload(payload).ok).toBe(false);
  });

  it("keeps a CLS of exactly 0 but drops a CLS of 1 or more", () => {
    const cls = { name: "CLS", pathname: "/page" };
    expect(parseWebVitalPayload({ ...cls, value: 0 }).ok).toBe(true);
    expect(parseWebVitalPayload({ ...cls, value: 1 }).ok).toBe(false);
  });

  it("rejects a payload that is not an object", () => {
    expect(parseWebVitalPayload("not json").ok).toBe(false);
    expect(parseWebVitalPayload(null).ok).toBe(false);
  });
});
