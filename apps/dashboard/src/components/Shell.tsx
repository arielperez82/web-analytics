"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

import { PageHeader } from "@/ds/PageHeader";
import { SidebarNav, type SidebarNavProps } from "@/ds/SidebarNav";
import { DEFAULT_DAYS, hrefFor } from "@/lib/dashboard-state";
import { activeFilters, toggleFilter } from "@/lib/filters";
import { resolveTenantScope, type TenantScope } from "@/lib/tenant-scope";
import { TenantScopeContext, useDashboardState } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";
import { rangeLabel } from "@/lib/range-label";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

import { CompareControl } from "./CompareControl";
import { DateRangePicker } from "./DateRangePicker";
import { FilterMenu } from "./FilterMenu";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { fmt, type Row } from "./ui";

type TenantsLoad = ReturnType<typeof useEndpoint<Row>>;

export const Shell = ({ email, children }: { email: string; children: ReactNode }) => {
  const { state } = useDashboardState();
  const tenants = useEndpoint<Row>("tenants", {});
  const scope = resolveTenantScope({ chosen: state.tenant, tenants });
  return (
    <TenantScopeContext.Provider value={scope.kind === "ready" ? scope.tenant : undefined}>
      <ShellFrame email={email} scope={scope} tenants={tenants}>
        {children}
      </ShellFrame>
    </TenantScopeContext.Provider>
  );
};

const ShellFrame = ({
  email,
  scope,
  tenants,
  children,
}: {
  email: string;
  scope: TenantScope;
  tenants: TenantsLoad;
  children: ReactNode;
}) => {
  const { state, update, zone, params } = useDashboardState();
  const tenant = scope.kind === "ready" ? scope.tenant : undefined;
  const settled = scope.kind === "ready" || scope.kind === "pinned";
  const sidebar = useSidebarCollapsed();
  const pathname = usePathname();
  const onSpeed = pathname === "/speed";
  const onOverview = pathname === "/";
  const comparable = onOverview || onSpeed || pathname.startsWith("/reports/");
  const domains = useEndpoint<Row>("domains", { tenant_id: tenant }, settled);
  const online = useEndpoint<Row>("current_visitors", { tenant_id: tenant, domain: state.domain }, settled);
  const showTenants = scope.kind === "ready" && scope.tenants.length > 0;
  const filters = activeFilters(state.filters);
  const custom = "from" in state.range ? state.range : undefined;
  const nav: SidebarNavProps["items"] = [
    { href: hrefFor("/", state), label: "Overview", icon: "chart", active: pathname === "/" || pathname.startsWith("/reports") },
    { href: hrefFor("/speed", state), label: "Speed Insights", icon: "gauge", active: onSpeed },
  ];
  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SidebarNav
        items={nav}
        collapsed={sidebar.collapsed}
        onToggle={sidebar.toggle}
        brand="Analytics"
        site={
          <>
          {showTenants && (
            <select
              aria-label="Tenant"
              value={tenant}
              onChange={(e) => update({ ...state, tenant: e.target.value, domain: undefined })}
            >
              {(scope.kind === "ready" && scope.tenants.includes(scope.tenant) ? scope.tenants : [tenant ?? ""]).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Domain"
            value={state.domain ?? ""}
            onChange={(e) => update({ ...state, domain: e.target.value || undefined })}
          >
            <option value="">All domains</option>
            {(domains.data ?? []).map((row) => (
              <option key={String(row.domain)} value={String(row.domain)}>{String(row.domain)}</option>
            ))}
          </select>
          </>
        }
        account={
          <>
            <ThemeSwitcher />
            <span>{email}</span>
            <button type="button" onClick={() => void signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </>
        }
      />
      <div className="app">
        <PageHeader
          title={onSpeed ? "Speed Insights" : "Overview"}
          subtitle={`${rangeLabel(state.range)} · ${zone} · ${fmt(online.data?.[0]?.sessions ?? 0)} online now`}
        >
          <FilterMenu
            filters={state.filters}
            params={params}
            onChange={(next) => update({ ...state, filters: next })}
            includeBots={state.includeBots === true}
            onIncludeBotsChange={(include) => update({ ...state, includeBots: include || undefined })}
          />
          {comparable && <CompareControl state={state} onChange={update} />}
          <DateRangePicker
            range={state.range}
            zone={zone}
            onChange={(range) => update({ ...state, range })}
            onZoneChange={(tz) => update({ ...state, tz })}
          />
        </PageHeader>
        {(filters.length > 0 || custom || onOverview) && (
          <div className="chips">
            {custom && (
              <button onClick={() => update({ ...state, range: { days: DEFAULT_DAYS } })}>
                {custom.from === custom.to ? custom.from : `${custom.from} → ${custom.to}`} ×
              </button>
            )}
            {filters.map(({ key, value }) => (
              <button
                key={key}
                onClick={() => update({ ...state, filters: toggleFilter(state.filters, key, value) })}
              >
                {key}: {value} ×
              </button>
            ))}
            {filters.length === 0 && onOverview && (
              <span className="muted">Showing all traffic.</span>
            )}
            {filters.length > 0 && <button onClick={() => update({ ...state, filters: {} })}>Clear filters</button>}
          </div>
        )}
        <main id="main" tabIndex={-1}>
          {scope.kind === "loading" && <p role="status">Loading tenants…</p>}
          {scope.kind === "unavailable" && <p role="alert">{scope.message}</p>}
          {settled && children}
        </main>
      </div>
    </div>
  );
};
