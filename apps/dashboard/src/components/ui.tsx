import type { ReactNode } from "react";

import { formatNumber } from "@/lib/format";

export type Row = Record<string, string | number | null>;

export const fmt = (value: string | number | null | undefined): string =>
  typeof value === "number" ? formatNumber(value) : (value ?? "—");

export const Panel = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <section className="panel">
    <h2>{title}</h2>
    {children}
  </section>
);

export const Status = ({ loading, error, empty }: { loading: boolean; error?: string; empty: boolean }) =>
  error ? <p className="error">{error}</p> : loading ? <p className="muted">Loading…</p> : empty ? <p className="muted">No data</p> : null;
