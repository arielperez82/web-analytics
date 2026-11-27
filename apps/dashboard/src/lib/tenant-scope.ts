export type TenantsLoad = {
  readonly loading: boolean;
  readonly status?: number;
  readonly error?: string;
  readonly data?: readonly { readonly tenant_id?: unknown }[];
};

export type TenantScope =
  | { readonly kind: "loading" }
  | { readonly kind: "pinned" }
  | { readonly kind: "ready"; readonly tenant: string; readonly tenants: readonly string[] }
  | { readonly kind: "unavailable"; readonly message: string };

const present = (value: string | undefined): string | undefined => (value?.trim() ? value : undefined);

export const resolveTenantScope = ({
  chosen,
  tenants,
}: {
  readonly chosen: string | undefined;
  readonly tenants: TenantsLoad;
}): TenantScope => {
  const listed = (tenants.data ?? []).flatMap((row) => {
    const id = present(String(row.tenant_id ?? ""));
    return id === undefined ? [] : [id];
  });
  if (tenants.status === 404) return { kind: "pinned" };
  const tenant = present(chosen) ?? listed[0];
  if (tenant !== undefined) return { kind: "ready", tenant, tenants: listed };
  if (tenants.loading) return { kind: "loading" };
  return {
    kind: "unavailable",
    message: tenants.error
      ? `The tenants could not be loaded: ${tenants.error}`
      : "No tenants have sent data yet.",
  };
};
