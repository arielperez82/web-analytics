import { describe, expect, it } from "vitest";

import { analyticsEventsColumns } from "./analytics-events-columns";

describe("analyticsEventsColumns", () => {
  it("describes the columns of the landing datasource, in storage order", () => {
    expect(Object.keys(analyticsEventsColumns)).toEqual([
      "timestamp",
      "session_id",
      "action",
      "version",
      "payload",
      "tenant_id",
      "domain",
    ]);
  });
});
