"use client";

import { useState } from "react";

import { SegmentedControl } from "@/ds/SegmentedControl";
import { type DashboardState, SHORTCUTS } from "@/lib/dashboard-state";
import { normalizeRange } from "@/lib/date-range";
import { rangeToParams } from "@/lib/time-range";
import { localDay } from "@/lib/time-zone";
import { usePopover } from "@/lib/use-popover";

import { TimeZonePicker } from "./TimeZonePicker";

const sameRange = (a: DashboardState["range"], b: DashboardState["range"]): boolean =>
  "days" in a ? "days" in b && a.days === b.days : "preset" in a && "preset" in b && a.preset === b.preset;

const QUICK = ["Today", "Last 24 Hours", "Last 7 Days", "Last 30 Days"];

const quick = SHORTCUTS.filter(({ label }) => QUICK.includes(label));
const rest = SHORTCUTS.filter(({ label }) => !QUICK.includes(label));

const describe = (range: DashboardState["range"]): string => {
  if (!("from" in range)) return SHORTCUTS.find((shortcut) => sameRange(shortcut.range, range))?.label ?? "";
  return range.from === range.to ? range.from : `${range.from} → ${range.to}`;
};

const quickLabelOf = (range: DashboardState["range"]): string | undefined =>
  quick.find((shortcut) => sameRange(shortcut.range, range))?.label;

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
  const popover = usePopover();
  const [draft, setDraft] = useState({ from: current.date_from, to: current.date_to });
  const normalized = normalizeRange(draft.from, draft.to, today);
  const pickFromMenu = (next: DashboardState["range"]) => {
    onChange(next);
    popover.close();
  };
  const toggle = () => {
    setDraft({ from: current.date_from, to: current.date_to });
    popover.toggle();
  };
  const quickLabel = quickLabelOf(range);
  return (
    <div className="range" ref={popover.container}>
      <SegmentedControl
        label="Quick ranges"
        value={quickLabel ?? ""}
        options={quick.map(({ label }) => ({ value: label, label }))}
        onChange={(label) => {
          const next = quick.find((shortcut) => shortcut.label === label);
          if (next !== undefined) onChange(next.range);
        }}
      />
      <button
        ref={popover.trigger}
        type="button"
        className="ds-btn"
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        data-active={quickLabel === undefined}
        onClick={toggle}
      >
        {quickLabel === undefined ? describe(range) : "Other"} · {zone} ▾
      </button>
      {popover.open && (
        <div className="popover" role="dialog" aria-label="Date range">
          <div className="presets">
            {rest.map(({ label, range: shortcut }) => (
              <button key={label} type="button" aria-pressed={sameRange(shortcut, range)} onClick={() => pickFromMenu(shortcut)}>
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
            <button type="button" disabled={!normalized} onClick={() => normalized && pickFromMenu(normalized)}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
