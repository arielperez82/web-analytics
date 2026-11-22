import type { ReactNode } from "react";

import { Button } from "@/ds/Button";
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

export const EMPTY_MESSAGE = "No data for this range. Try a wider range or fewer filters.";

export const Status = ({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error?: string;
  empty: boolean;
  onRetry?: () => void;
}) => {
  if (error !== undefined)
    return (
      <div className="state" role="alert">
        <p className="error">Could not load this: {error}</p>
        {onRetry === undefined ? null : <Button onClick={onRetry}>Retry</Button>}
      </div>
    );
  if (loading) return <div className="skeleton" role="status" aria-label="Loading" />;
  return empty ? <p className="muted">{EMPTY_MESSAGE}</p> : null;
};
