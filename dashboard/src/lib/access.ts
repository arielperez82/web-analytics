export type AccessPolicy = {
  readonly domains: readonly string[];
  readonly emails: readonly string[];
};

type Candidate = {
  readonly email?: string | null;
  readonly emailVerified?: boolean | null;
};

const parseList = (value: string | undefined): readonly string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

export const loadAccessPolicy = (
  env: Readonly<Record<string, string | undefined>>,
): AccessPolicy => ({
  domains: parseList(env.ALLOWED_EMAIL_DOMAINS),
  emails: parseList(env.ALLOWED_EMAILS),
});

export const isAllowedEmail = (
  { email, emailVerified }: Candidate,
  policy: AccessPolicy,
): boolean => {
  if (emailVerified !== true || typeof email !== "string") return false;
  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const [, domain] = parts;
  return (
    policy.emails.includes(email.toLowerCase()) ||
    policy.domains.includes(domain)
  );
};
