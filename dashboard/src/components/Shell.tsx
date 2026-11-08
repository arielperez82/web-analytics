"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { DEFAULT_DAYS, hrefFor } from "@/lib/dashboard-state";
import { activeFilters, toggleFilter } from "@/lib/filters";
import { useDashboardState } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { DateRangePicker } from "./DateRangePicker";
import { fmt, type Row } from "./ui";

export const Shell = ({ email, children }: { email: string; children: ReactNode }) => {
  const { state, update } = useDashboardState();
  const pathname = usePathname();
  const onSpeed = pathname === "/speed";
  const domains = useEndpoint<Row>("domains", {});
  const online = useEndpoint<Row>("current_visitors", { domain: state.domain });
  const filters = activeFilters(state.filters);
  const custom = "from" in state.range ? state.range : undefined;
  const nav = [
    { href: hrefFor("/", state), label: "Analytics", active: pathname === "/" || pathname.startsWith("/reports") },
    { href: hrefFor("/speed", state), label: "Speed Insights", active: onSpeed },
  ];
  return (
    <div className="app">
      <header>
        <h1>Web Analytics</h1>
        <span className="live">● {fmt(online.data?.[0]?.visits ?? 0)} online</span>
        <span className="spacer" />
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
        <DateRangePicker range={state.range} onChange={(range) => update({ ...state, range })} />
        <button onClick={() => void signOut({ callbackUrl: "/login" })}>{email} · Sign out</button>
      </header>
      <nav>
        {nav.map(({ href, label, active }) => (
          <Link key={label} href={href} aria-current={active ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      {(filters.length > 0 || custom) && (
        <div className="chips">
          {custom && (
            <button onClick={() => update({ ...state, range: { days: DEFAULT_DAYS } })}>
              {custom.from === custom.to ? custom.from : `${custom.from} → ${custom.to}`} ×
            </button>
          )}
          {filters.map(({ key, value }) => (
            <button
              key={key}
              className={onSpeed ? "inactive" : undefined}
              title={onSpeed ? "Not applied to Speed Insights" : undefined}
              onClick={() => update({ ...state, filters: toggleFilter(state.filters, key, value) })}
            >
              {key}: {value} ×
            </button>
          ))}
          {filters.length > 0 && <button onClick={() => update({ ...state, filters: {} })}>Clear filters</button>}
          {onSpeed && filters.length > 0 && <span className="muted">Location, device and browser filters don’t apply to Speed Insights.</span>}
        </div>
      )}
      <main>{children}</main>
    </div>
  );
};
