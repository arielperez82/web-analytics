"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

export const TIP_DELAY_MS = 400;

type KpiCardProps = {
  readonly label: string;
  readonly value: string;
  readonly delta?: ReactNode;
  readonly tips?: readonly string[];
  readonly trend?: ReactNode;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
};

const useDelayedTip = () => {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => clearTimeout(timer.current);
  const close = () => {
    cancel();
    setOpen(false);
  };
  useEffect(() => cancel, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return {
    open,
    handlers: {
      onMouseEnter: () => {
        cancel();
        timer.current = setTimeout(() => setOpen(true), TIP_DELAY_MS);
      },
      onMouseLeave: close,
      onFocus: () => {
        cancel();
        setOpen(true);
      },
      onBlur: close,
    },
  };
};

export const KpiCard = ({ label, value, delta, tips = [], trend, selected, onSelect }: KpiCardProps) => {
  const base = useId();
  const ids = { label: `${base}-label`, value: `${base}-value`, delta: `${base}-delta`, tip: `${base}-tip` };
  const { open, handlers } = useDelayedTip();
  const hasTip = tips.length > 0;
  const described = [ids.value, ...(delta === undefined ? [] : [ids.delta]), ...(hasTip ? [ids.tip] : [])].join(" ");
  const body = (
    <>
      <span id={ids.label} className="kpi-label">
        {label}
      </span>
      <strong id={ids.value}>{value}</strong>
      {delta === undefined ? null : (
        <span id={ids.delta} className="delta">
          {delta}
        </span>
      )}
      {hasTip ? (
        <span id={ids.tip} role="tooltip" className="kpi-tip" hidden={!open}>
          {tips.map((tip) => (
            <small key={tip}>{tip}</small>
          ))}
        </span>
      ) : null}
      {trend === undefined ? null : <span className="spark-slot">{trend}</span>}
    </>
  );
  if (onSelect === undefined)
    return (
      <div className="card kpi" tabIndex={hasTip ? 0 : undefined} aria-describedby={hasTip ? ids.tip : undefined} {...handlers}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      className="card kpi card-select"
      aria-pressed={selected}
      aria-labelledby={ids.label}
      aria-describedby={described}
      onClick={onSelect}
      {...handlers}
    >
      {body}
    </button>
  );
};
