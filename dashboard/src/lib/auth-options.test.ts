import { describe, expect, it } from "vitest";

import { buildAuthOptions } from "./auth-options";

const providerIds = (env: Record<string, string | undefined>) =>
  buildAuthOptions(env).providers.map(
    (provider) =>
      (provider as { options?: { id?: string } }).options?.id ?? provider.id,
  );

const baseEnv = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  NEXTAUTH_SECRET: "s",
  ALLOWED_EMAIL_DOMAINS: "splicelabs.xyz",
};

const signIn = async (
  env: Record<string, string | undefined>,
  args: { email: string; verified?: boolean; provider?: string },
) => {
  const callback = buildAuthOptions(env).callbacks?.signIn;
  return callback?.({
    user: { id: "1", email: args.email },
    account: { provider: args.provider ?? "google", type: "oauth", providerAccountId: "1" },
    profile: { email: args.email, email_verified: args.verified ?? true },
  } as never);
};

describe("buildAuthOptions providers", () => {
  it("offers only Google by default", () => {
    expect(providerIds(baseEnv)).toEqual(["google"]);
  });

  it("adds the dev login only when explicitly enabled", () => {
    expect(providerIds({ ...baseEnv, DASHBOARD_DEV_LOGIN: "1" })).toEqual([
      "google",
      "dev-login",
    ]);
  });

  it("never offers the dev login in production", () => {
    expect(
      providerIds({ ...baseEnv, DASHBOARD_DEV_LOGIN: "1", NODE_ENV: "production" }),
    ).toEqual(["google"]);
  });

  it("omits Google when its credentials are missing (dev login only)", () => {
    expect(providerIds({ DASHBOARD_DEV_LOGIN: "1" })).toEqual(["dev-login"]);
  });
});

describe("signIn callback", () => {
  it("allows a verified address on an allowed domain", async () => {
    expect(await signIn(baseEnv, { email: "a@splicelabs.xyz" })).toBe(true);
  });

  it("rejects other domains and unverified emails", async () => {
    expect(await signIn(baseEnv, { email: "a@gmail.com" })).toBe(false);
    expect(await signIn(baseEnv, { email: "a@splicelabs.xyz", verified: false })).toBe(false);
  });

  it("applies the email allowlist for local testing", async () => {
    const env = { ...baseEnv, ALLOWED_EMAIL_DOMAINS: undefined, ALLOWED_EMAILS: "me@gmail.com" };
    expect(await signIn(env, { email: "me@gmail.com" })).toBe(true);
    expect(await signIn(env, { email: "you@gmail.com" })).toBe(false);
  });

  it("applies the policy to the dev login too", async () => {
    const env = { DASHBOARD_DEV_LOGIN: "1", ALLOWED_EMAILS: "me@gmail.com" };
    expect(await signIn(env, { email: "me@gmail.com", provider: "dev-login" })).toBe(true);
    expect(await signIn(env, { email: "you@gmail.com", provider: "dev-login" })).toBe(false);
  });
});

describe("pages", () => {
  it("sends unauthenticated users to the custom login page", () => {
    expect(buildAuthOptions(baseEnv).pages?.signIn).toBe("/login");
  });
});
