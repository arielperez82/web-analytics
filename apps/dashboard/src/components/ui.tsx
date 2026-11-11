import type { ReactNode } from "react";

export type Row = Record<string, string | number | null>;

const nf = new Intl.NumberFormat("en-US");

export const fmt = (value: string | number | null | undefined): string =>
  typeof value === "number" ? nf.format(Math.round(value * 100) / 100) : (value ?? "—");

export const Panel = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <section className="panel">
    <h2>{title}</h2>
    {children}
  </section>
);

export const Status = ({ loading, error, empty }: { loading: boolean; error?: string; empty: boolean }) =>
  error ? <p className="error">{error}</p> : loading ? <p className="muted">Loading…</p> : empty ? <p className="muted">No data</p> : null;
