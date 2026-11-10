export type Site = { readonly origin: string; readonly tenantId: string };

const isBareOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

export const parseSites = (raw: string | undefined): readonly Site[] =>
  (raw ?? "")
    .split(",")
    .map((entry) => entry.split("=").map((part) => part.trim()))
    .flatMap((parts) => {
      const [origin = "", tenantId = ""] = parts;
      return parts.length === 2 && tenantId !== "" && isBareOrigin(origin)
        ? [{ origin, tenantId }]
        : [];
    });
