import { describe, expect, it } from "vitest";

import { parsePageHitPayload } from "./page-hit-payload";

const complete = {
  pathname: "/pricing",
  referrer: "https://google.com/",
  location: "DE",
  user_agent: "Mozilla/5.0 Chrome/120.0",
  utm_source: "news",
  utm_medium: "email",
};

describe("parsePageHitPayload", () => {
  it("accepts a complete payload and returns its fields as text", () => {
    expect(parsePageHitPayload(complete)).toEqual({
      ok: true,
      payload: expect.objectContaining(complete),
    });
  });

  it.each(["pathname", "referrer", "location", "user_agent", "utm_medium"])(
    "files a payload with no %s under a blank value instead of rejecting it",
    (key) => {
      const { [key]: _omitted, ...rest } = complete as Record<string, string>;
      expect(parsePageHitPayload(rest)).toEqual({
        ok: true,
        payload: expect.objectContaining({ [key]: "" }),
      });
    },
  );

  it("stores a numeric pathname as its text", () => {
    expect(parsePageHitPayload({ ...complete, pathname: 123 })).toEqual({
      ok: true,
      payload: expect.objectContaining({ pathname: "123" }),
    });
  });

  it("reads the legacy user-agent key when user_agent is absent or blank", () => {
    const { user_agent: _dropped, ...rest } = complete;
    expect(parsePageHitPayload({ ...rest, "user-agent": "Legacy/1" })).toEqual({
      ok: true,
      payload: expect.objectContaining({ user_agent: "Legacy/1" }),
    });
    expect(
      parsePageHitPayload({ ...rest, user_agent: "", "user-agent": "Legacy/1" }),
    ).toEqual({
      ok: true,
      payload: expect.objectContaining({ user_agent: "Legacy/1" }),
    });
  });

  it("prefers user_agent over the legacy key when both are present", () => {
    expect(
      parsePageHitPayload({ ...complete, "user-agent": "Legacy/1" }),
    ).toEqual({
      ok: true,
      payload: expect.objectContaining({ user_agent: complete.user_agent }),
    });
  });

  it.each([
    ["a string", "not json"],
    ["null", null],
    ["an array", []],
  ])("rejects a payload that is %s", (_case, payload) => {
    expect(parsePageHitPayload(payload).ok).toBe(false);
  });
});
