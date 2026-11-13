import type { SubmittedEvent } from "@web-analytics/tracking-event-schema";
import { describe, expect, it } from "vitest";

import type { ForwardedEvent } from "./forwarded-event";

const submitted: SubmittedEvent = {
  timestamp: "2026-11-13T10:00:00.000Z",
  action: "page_hit",
  version: "1",
  payload: "{}",
};

describe("ForwardedEvent", () => {
  it("is a submitted event once the proxy has stamped it", () => {
    const forwarded: ForwardedEvent = {
      ...submitted,
      reception_timestamp: "2026-11-13T10:00:01.000Z",
      tenant_id: "the-tenant",
      domain: "example.com",
    };

    expect(forwarded.reception_timestamp).toBe("2026-11-13T10:00:01.000Z");
  });

  it("cannot be built from a submitted event without the proxy's stamps", () => {
    // @ts-expect-error a submitted event has no reception time, tenant or domain yet
    const forwarded: ForwardedEvent = submitted;

    expect(forwarded.action).toBe("page_hit");
  });
});
