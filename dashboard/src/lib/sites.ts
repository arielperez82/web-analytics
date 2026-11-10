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
    .map((entry) => {
      const [origin = "", tenantId = ""] = entry.split("=").map((part) => part.trim());
      return { origin, tenantId };
    })
    .filter(({ origin, tenantId }) => tenantId !== "" && isBareOrigin(origin));
