export type Site = { readonly origin: string; readonly tenantId: string };

const TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const isBareOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

const parseEntries = (raw: string | undefined): readonly Site[] =>
  (raw ?? "")
    .split(",")
    .map((entry) => entry.split("=").map((part) => part.trim()))
    .flatMap((parts) => {
      const [origin = "", tenantId = ""] = parts;
      return parts.length === 2 && TENANT_ID.test(tenantId) && isBareOrigin(origin)
        ? [{ origin, tenantId }]
        : [];
    });

export const parseSites = (raw: string | undefined): readonly Site[] => {
  const entries = parseEntries(raw);
  return entries.filter(
    ({ origin }) => entries.filter((site) => site.origin === origin).length === 1,
  );
};
