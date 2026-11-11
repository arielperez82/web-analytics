import { describe, expect, it } from "vitest";

import { parseSites } from "./sites";

describe("parseSites", () => {
  it("maps each origin to its tenant, so several domains can share one tenant", () => {
    expect(
      parseSites("https://spliceops.ai=splice, https://splicelabs.ai=splice"),
    ).toEqual([
      { origin: "https://spliceops.ai", tenantId: "splice" },
      { origin: "https://splicelabs.ai", tenantId: "splice" },
    ]);
  });

  it("drops an entry with extra separators instead of truncating its tenant", () => {
    expect(
      parseSites("https://a.example=acme=oops,https://b.example=beta"),
    ).toEqual([{ origin: "https://b.example", tenantId: "beta" }]);
  });

  it("drops every entry of an origin configured twice, since its tenant is ambiguous", () => {
    expect(
      parseSites(
        "https://a.example=acme,https://a.example=other,https://b.example=beta",
      ),
    ).toEqual([{ origin: "https://b.example", tenantId: "beta" }]);
  });

  it("drops entries without a tenant or with something other than a bare origin", () => {
    expect(
      parseSites(
        [
          "https://nope.example",
          "https://notenant.example=",
          "=lonely",
          "not a url=acme",
          "https://path.example/x=acme",
          "https://ok.example=acme",
          "",
        ].join(","),
      ),
    ).toEqual([{ origin: "https://ok.example", tenantId: "acme" }]);
  });

  it.each([
    ["whitespace inside", "acme corp"],
    ["a slash", "acme/prod"],
    ["a quote", "acme'"],
    ["a non-ascii character", "açme"],
    ["a leading hyphen", "-acme"],
    ["more than 64 characters", "a".repeat(65)],
  ])("drops an entry whose tenant has %s", (_case, tenantId) => {
    expect(
      parseSites(`https://bad.example=${tenantId},https://ok.example=acme_1-b`),
    ).toEqual([{ origin: "https://ok.example", tenantId: "acme_1-b" }]);
  });
});
