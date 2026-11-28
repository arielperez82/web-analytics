const ORIGIN = "http://return-path.invalid";

const FALLBACK = "/";

const CONTROL = /[\u0000-\u001f\u007f\\]/;

const ENCODED_SEPARATOR = /%2f|%5c|%00/i;

const BLOCKED_PREFIXES: readonly string[] = ["/login", "/api/auth"];

const isBlocked = (pathname: string): boolean =>
  BLOCKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const parsed = (raw: string): URL | undefined => {
  try {
    return new URL(raw, ORIGIN);
  } catch {
    return undefined;
  }
};

const isSafe = (url: URL): boolean =>
  url.origin === ORIGIN &&
  !url.pathname.startsWith("//") &&
  !ENCODED_SEPARATOR.test(url.pathname) &&
  !isBlocked(url.pathname);

export const returnPath = (raw: string | null | undefined): string => {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || CONTROL.test(raw)) return FALLBACK;
  const url = parsed(raw);
  return url !== undefined && isSafe(url) ? `${url.pathname}${url.search}` : FALLBACK;
};
