import { describe, expect, it } from "vitest";

import { returnPath } from "./return-path";

describe("returnPath", () => {
  it("keeps a same-site path with its query", () => {
    expect(returnPath("/reports/pages?date_from=2026-01-01&compare=previous_period")).toBe(
      "/reports/pages?date_from=2026-01-01&compare=previous_period",
    );
  });

  it("keeps an encoded slash inside a query value", () => {
    expect(returnPath("/?route=%2Fpricing")).toBe("/?route=%2Fpricing");
  });

  it("keeps the root", () => {
    expect(returnPath("/")).toBe("/");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["absolute url", "https://evil.example/x"],
    ["protocol relative", "//evil.example/x"],
    ["backslash host", "/\\evil.example/x"],
    ["encoded slash host", "/%2F%2Fevil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["no leading slash", "reports"],
    ["control character", "/a\nb"],
    ["tab inside authority", "/\t/evil.example"],
    ["sign-in page itself", "/login?callbackUrl=%2F"],
    ["auth api", "/api/auth/signout"],
  ])("falls back to the root for %s", (_name, raw) => {
    expect(returnPath(raw)).toBe("/");
  });
});
