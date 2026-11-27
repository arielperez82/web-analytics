import { describe, expect, it } from "vitest";

import { resolveTenantScope } from "./tenant-scope";

const loaded = (ids: readonly string[]) => ({
  loading: false,
  data: ids.map((tenant_id) => ({ tenant_id })),
});

describe("resolveTenantScope", () => {
  it("holds while the tenants load and none was chosen", () => {
    expect(resolveTenantScope({ chosen: undefined, tenants: { loading: true } })).toEqual({ kind: "loading" });
  });

  it("takes the first tenant when none was chosen", () => {
    expect(resolveTenantScope({ chosen: undefined, tenants: loaded(["acme", "globex"]) })).toEqual({
      kind: "ready",
      tenant: "acme",
      tenants: ["acme", "globex"],
    });
  });

  it("keeps the chosen tenant", () => {
    expect(resolveTenantScope({ chosen: "globex", tenants: loaded(["acme", "globex"]) })).toMatchObject({
      kind: "ready",
      tenant: "globex",
    });
  });

  it("does not wait for the list when a tenant was chosen", () => {
    expect(resolveTenantScope({ chosen: "globex", tenants: { loading: true } })).toMatchObject({
      kind: "ready",
      tenant: "globex",
    });
  });

  it("never picks or keeps a blank tenant", () => {
    expect(resolveTenantScope({ chosen: "", tenants: loaded(["", "acme"]) })).toMatchObject({
      kind: "ready",
      tenant: "acme",
      tenants: ["acme"],
    });
    expect(resolveTenantScope({ chosen: " ", tenants: loaded([""]) })).toMatchObject({ kind: "unavailable" });
  });

  it("leaves the tenant to the server when the deployment is pinned", () => {
    expect(resolveTenantScope({ chosen: undefined, tenants: { loading: false, status: 404, error: "Not found" } })).toEqual({
      kind: "pinned",
    });
  });

  it("says so when there are no tenants", () => {
    expect(resolveTenantScope({ chosen: undefined, tenants: loaded([]) })).toEqual({
      kind: "unavailable",
      message: "No tenants have sent data yet.",
    });
  });

  it("says so when the tenants cannot be read", () => {
    expect(resolveTenantScope({ chosen: undefined, tenants: { loading: false, status: 502, error: "Upstream error" } })).toEqual({
      kind: "unavailable",
      message: "The tenants could not be loaded: Upstream error",
    });
  });
});
