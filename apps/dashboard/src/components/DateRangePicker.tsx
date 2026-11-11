"use client";

import { useState } from "react";

import { RANGE_OPTIONS, type DashboardState } from "@/lib/dashboard-state";
import { normalizeRange } from "@/lib/date-range";
import { rangeToParams } from "@/lib/time-range";

const presetLabel = (days: number): string => (days === 1 ? "Today" : `Last ${days} days`);

const describe = (range: DashboardState["range"]): string =>
  "from" in range
    ? range.from === range.to
      ? range.from
      : `${range.from} → ${range.to}`
    : presetLabel(range.days);

export const DateRangePicker = ({
  range,
  onChange,
}: {
  range: DashboardState["range"];
  onChange: (range: DashboardState["range"]) => void;
}) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const current = rangeToParams(range, now);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: current.date_from, to: current.date_to });
  const normalized = normalizeRange(draft.from, draft.to, today);
  const choose = (next: DashboardState["range"]) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <div className="range">
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraft({ from: current.date_from, to: current.date_to });
          setOpen(!open);
        }}
      >
        {describe(range)} ▾
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Date range">
          <div className="presets">
            {RANGE_OPTIONS.map((days) => (
              <button
                key={days}
                aria-pressed={"days" in range && range.days === days}
                onClick={() => choose({ days })}
              >
                {presetLabel(days)}
              </button>
            ))}
          </div>
          <div className="custom">
            <label>
              From
              <input
                type="date"
                max={today}
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                max={today}
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
            <button disabled={!normalized} onClick={() => normalized && choose(normalized)}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
