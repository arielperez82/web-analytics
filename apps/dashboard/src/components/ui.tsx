import { type ReactNode, type Ref, useId } from "react";

import { Button } from "@/ds/Button";
import { formatNumber } from "@/lib/format";

export type Row = Record<string, string | number | null>;

export const fmt = (value: string | number | null | undefined): string =>
  typeof value === "number" ? formatNumber(value) : (value ?? "—");

export const Panel = ({
  title,
  children,
  ref,
  focusable = false,
}: {
  title: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
  focusable?: boolean;
}) => {
  const heading = useId();
  return (
    <section
      ref={ref}
      className="panel"
      {...(focusable ? { "aria-labelledby": heading, tabIndex: -1 } : {})}
    >
      <h2 id={heading}>{title}</h2>
      {children}
    </section>
  );
};

export const EMPTY_MESSAGE = "No data for this range. Try a wider range or fewer filters.";

export const Status = ({
  loading,
  error,
  empty,
  stale = false,
  refreshing = false,
  onRetry,
}: {
  loading: boolean;
  error?: string;
  empty: boolean;
  stale?: boolean;
  refreshing?: boolean;
  onRetry?: () => void;
}) => {
  if (error !== undefined)
    return (
      <div className="state" role="alert">
        <p className="error">
          Could not load this: {error}
          {stale ? " Showing the last figures that loaded." : ""}
        </p>
        {onRetry === undefined ? null : <Button onClick={onRetry}>Retry</Button>}
      </div>
    );
  if (loading)
    return (
      <>
        <div className="skeleton" aria-hidden="true" />
        <span className="ds-sr" role="status">
          Loading
        </span>
      </>
    );
  if (refreshing)
    return (
      <span className="ds-sr" role="status">
        Updating
      </span>
    );
  return empty ? <p className="muted">{EMPTY_MESSAGE}</p> : null;
};
