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
});
