import type { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { isAllowedEmail, loadAccessPolicy } from "./access";

type Env = Readonly<Record<string, string | undefined>>;

const googleProviders = (env: Env): readonly Provider[] =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [
        GoogleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : [];

const devLoginProviders = (env: Env): readonly Provider[] =>
  env.DASHBOARD_DEV_LOGIN === "1" && env.NODE_ENV !== "production"
    ? [
        CredentialsProvider({
          id: "dev-login",
          name: "Dev login",
          credentials: { email: { label: "Email", type: "email" } },
          authorize: async (credentials) =>
            credentials?.email
              ? { id: credentials.email, email: credentials.email }
              : null,
        }),
      ]
    : [];

export const buildAuthOptions = (env: Env): NextAuthOptions => {
  const policy = loadAccessPolicy(env);
  return {
    secret: env.NEXTAUTH_SECRET,
    session: { strategy: "jwt" },
    pages: { signIn: "/login" },
    providers: [...googleProviders(env), ...devLoginProviders(env)] as Provider[],
    callbacks: {
      signIn: async ({ user, account, profile }) =>
        isAllowedEmail(
          {
            email: user.email,
            emailVerified:
              account?.provider === "dev-login"
                ? true
                : (profile as { email_verified?: boolean } | undefined)
                    ?.email_verified,
          },
          policy,
        ),
    },
  };
};
