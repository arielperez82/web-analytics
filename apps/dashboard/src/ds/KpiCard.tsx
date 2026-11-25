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
  const [pointerInside, setPointerInside] = useState(false);
  const [rested, setRested] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const byPointer = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => cancel, []);
  const engaged = pointerInside || focused;
  useEffect(() => {
    if (!engaged) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancel();
      setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [engaged]);
  return {
    open: !dismissed && (rested || focused),
    handlers: {
      onMouseEnter: () => {
        cancel();
        setPointerInside(true);
        setDismissed(false);
        timer.current = setTimeout(() => setRested(true), TIP_DELAY_MS);
      },
      onMouseLeave: () => {
        cancel();
        byPointer.current = false;
        setPointerInside(false);
        setRested(false);
      },
      onPointerDown: () => {
        byPointer.current = true;
      },
      onFocus: () => {
        const clicked = byPointer.current;
        byPointer.current = false;
        if (clicked) return;
        setDismissed(false);
        setFocused(true);
      },
      onBlur: () => setFocused(false),
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
          {tips.map((tip, index) => (
            <small key={`${String(index)}-${tip}`}>{tip}</small>
          ))}
        </span>
      ) : null}
      {trend === undefined ? null : <span className="spark-slot">{trend}</span>}
    </>
  );
  if (onSelect === undefined)
    return (
      <div
        role="group"
        className="card kpi"
        tabIndex={hasTip ? 0 : undefined}
        aria-labelledby={ids.label}
        aria-describedby={hasTip ? ids.tip : undefined}
        {...handlers}
      >
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
