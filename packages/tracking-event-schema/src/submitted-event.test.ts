import { describe, expect, it } from "vitest";

import type { SubmittedEvent } from "./submitted-event";

const minimal: SubmittedEvent = {
  timestamp: "2026-11-13T10:00:00.000Z",
  action: "page_hit",
  version: "1",
  payload: "{}",
};

describe("SubmittedEvent", () => {
  it("accepts the fields a sender controls, including its tenant and domain", () => {
    const event: SubmittedEvent = {
      ...minimal,
      session_id: "s-1",
      tenant_id: "the-tenant",
      domain: "example.com",
    };

    expect(event.tenant_id).toBe("the-tenant");
  });

  it("does not let a sender set reception_timestamp", () => {
    const event: SubmittedEvent = {
      ...minimal,
      // @ts-expect-error only the proxy may stamp when an event was received
      reception_timestamp: "2026-11-13T10:00:00.000Z",
    };

    expect(event.action).toBe("page_hit");
  });
});
