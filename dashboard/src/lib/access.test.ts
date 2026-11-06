import { describe, expect, it } from "vitest";

import { isAllowedEmail } from "./access";

describe("isAllowedEmail", () => {
  it("allows a verified splicelabs.xyz address", () => {
    expect(
      isAllowedEmail({ email: "ariel@splicelabs.xyz", emailVerified: true }),
    ).toBe(true);
  });

  it("rejects other domains", () => {
    expect(
      isAllowedEmail({ email: "ariel@gmail.com", emailVerified: true }),
    ).toBe(false);
  });

  it("rejects lookalike domains and subdomains", () => {
    expect(
      isAllowedEmail({ email: "a@evil-splicelabs.xyz", emailVerified: true }),
    ).toBe(false);
    expect(
      isAllowedEmail({ email: "a@splicelabs.xyz.evil.com", emailVerified: true }),
    ).toBe(false);
    expect(
      isAllowedEmail({ email: "a@sub.splicelabs.xyz", emailVerified: true }),
    ).toBe(false);
  });

  it("rejects unverified emails", () => {
    expect(
      isAllowedEmail({ email: "a@splicelabs.xyz", emailVerified: false }),
    ).toBe(false);
  });

  it("fails closed on missing input", () => {
    expect(isAllowedEmail({ email: undefined, emailVerified: true })).toBe(false);
    expect(isAllowedEmail({ email: "a@splicelabs.xyz" })).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(
      isAllowedEmail({ email: "A@SpliceLabs.XYZ", emailVerified: true }),
    ).toBe(true);
  });
});
