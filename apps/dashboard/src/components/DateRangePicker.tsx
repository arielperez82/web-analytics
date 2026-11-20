"use client";

import { useState } from "react";

import { type DashboardState, SHORTCUTS } from "@/lib/dashboard-state";
import { normalizeRange } from "@/lib/date-range";
import { rangeToParams } from "@/lib/time-range";
import { localDay } from "@/lib/time-zone";

import { TimeZonePicker } from "./TimeZonePicker";

const sameRange = (a: DashboardState["range"], b: DashboardState["range"]): boolean =>
  "days" in a ? "days" in b && a.days === b.days : "preset" in a && "preset" in b && a.preset === b.preset;

const describe = (range: DashboardState["range"]): string =>
  "from" in range
    ? range.from === range.to
      ? range.from
      : `${range.from} → ${range.to}`
    : (SHORTCUTS.find((shortcut) => sameRange(shortcut.range, range))?.label ?? "");

export const DateRangePicker = ({
  range,
  zone,
  onChange,
  onZoneChange,
}: {
  range: DashboardState["range"];
  zone: string;
  onChange: (range: DashboardState["range"]) => void;
  onZoneChange: (zone: string) => void;
}) => {
  const now = new Date();
  const today = localDay(now, zone);
  const current = rangeToParams(range, now, zone);
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
        {describe(range)} · {zone} ▾
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Date range">
          <div className="presets">
            {SHORTCUTS.map(({ label, range: shortcut }) => (
              <button key={label} aria-pressed={sameRange(shortcut, range)} onClick={() => choose(shortcut)}>
                {label}
              </button>
            ))}
          </div>
          <label className="zone">
            Time zone
            <TimeZonePicker zone={zone} onChange={onZoneChange} />
          </label>
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
