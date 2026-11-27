import { p } from "@tinybirdco/sdk";

export const tenantScopeSql = `
            AND tenant_id = {{ String(tenant_id, description="Tenant ID; required", required=True) }}`;

export const tenantParam = p.string().describe("Tenant ID; required");
