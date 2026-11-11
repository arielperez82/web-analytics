import { describe, expect, it } from "vitest";

import { isAllowedEmail, loadAccessPolicy } from "./access";

const prod = { domains: ["splicelabs.xyz"], emails: [] };

describe("isAllowedEmail with a domain policy", () => {
  it("allows a verified address on the domain", () => {
    expect(
      isAllowedEmail({ email: "ariel@splicelabs.xyz", emailVerified: true }, prod),
    ).toBe(true);
  });

  it("rejects other domains, lookalikes and subdomains", () => {
    for (const email of [
      "a@gmail.com",
      "a@evil-splicelabs.xyz",
      "a@splicelabs.xyz.evil.com",
      "a@sub.splicelabs.xyz",
    ]) {
      expect(isAllowedEmail({ email, emailVerified: true }, prod)).toBe(false);
    }
  });

  it("rejects unverified emails", () => {
    expect(
      isAllowedEmail({ email: "a@splicelabs.xyz", emailVerified: false }, prod),
    ).toBe(false);
  });

  it("fails closed on missing input", () => {
    expect(isAllowedEmail({ email: undefined, emailVerified: true }, prod)).toBe(false);
    expect(isAllowedEmail({ email: "a@splicelabs.xyz" }, prod)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(
      isAllowedEmail({ email: "A@SpliceLabs.XYZ", emailVerified: true }, prod),
    ).toBe(true);
  });
});

describe("isAllowedEmail with an email allowlist", () => {
  const local = { domains: [], emails: ["me@gmail.com"] };

  it("allows only the listed address, case-insensitively", () => {
    expect(isAllowedEmail({ email: "ME@gmail.com", emailVerified: true }, local)).toBe(true);
    expect(isAllowedEmail({ email: "other@gmail.com", emailVerified: true }, local)).toBe(false);
  });

  it("still requires a verified email", () => {
    expect(isAllowedEmail({ email: "me@gmail.com", emailVerified: false }, local)).toBe(false);
  });

  it("denies everyone when the policy is empty", () => {
    expect(
      isAllowedEmail({ email: "a@splicelabs.xyz", emailVerified: true }, { domains: [], emails: [] }),
    ).toBe(false);
  });
});

describe("loadAccessPolicy", () => {
  it("parses comma-separated env lists, trimming and lowercasing", () => {
    expect(
      loadAccessPolicy({
        ALLOWED_EMAIL_DOMAINS: " SpliceLabs.xyz ,example.com",
        ALLOWED_EMAILS: "A@b.com, c@d.com ",
      }),
    ).toEqual({
      domains: ["splicelabs.xyz", "example.com"],
      emails: ["a@b.com", "c@d.com"],
    });
  });

  it("is empty (deny all) when nothing is configured", () => {
    expect(loadAccessPolicy({})).toEqual({ domains: [], emails: [] });
  });
});
