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
});
