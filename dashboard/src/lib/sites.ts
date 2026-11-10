export type Site = { readonly origin: string; readonly tenantId: string };

export const parseSites = (raw: string | undefined): readonly Site[] =>
  (raw ?? "").split(",").map((entry) => {
    const [origin = "", tenantId = ""] = entry.split("=").map((part) => part.trim());
    return { origin, tenantId };
  });
