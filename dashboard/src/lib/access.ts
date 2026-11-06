const ALLOWED_DOMAIN = "splicelabs.xyz";

type Candidate = {
  readonly email?: string | null;
  readonly emailVerified?: boolean | null;
};

export const isAllowedEmail = ({ email, emailVerified }: Candidate): boolean =>
  emailVerified === true &&
  typeof email === "string" &&
  email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`) &&
  email.split("@").length === 2;
