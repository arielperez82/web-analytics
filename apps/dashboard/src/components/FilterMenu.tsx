"use client";

import { useState } from "react";

import { FILTER_TITLE, type FilterKey, type Filters } from "@/lib/filters";
import { REPORTS, type Report } from "@/lib/reports";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import type { Row } from "./ui";

const LIST_SIZE = "100";

const FILTER_REPORTS = REPORTS.flatMap((report) =>
  report.filterKey ? [{ ...report, filterKey: report.filterKey }] : [],
);

const FilterSelect = ({
  report,
  filters,
  params,
  onChange,
}: {
  report: Report & { readonly filterKey: FilterKey };
  filters: Filters;
  params: QueryParams;
  onChange: (filters: Filters) => void;
}) => {
  const { filterKey } = report;
  const { data } = useEndpoint<Row>(report.endpoint, {
    ...params,
    [filterKey]: undefined,
    limit: LIST_SIZE,
  });
  const current = filters[filterKey];
  const values = Array.from(
    new Set([
      ...(data ?? []).map((row) => String(row[report.labelKey] ?? "")).filter((value) => value !== ""),
      ...(current ? [current] : []),
    ]),
  );
  const choose = (value: string) => {
    const { [filterKey]: _dropped, ...others } = filters;
    onChange(value === "" ? others : { ...others, [filterKey]: value });
  };
  return (
    <label className="filter">
      {FILTER_TITLE[filterKey]}
      <select aria-label={FILTER_TITLE[filterKey]} value={current ?? ""} onChange={(e) => choose(e.target.value)}>
        <option value="">Any</option>
        {values.map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>
    </label>
  );
};

export const FilterMenu = ({
  filters,
  params,
  onChange,
  includeBots,
  onIncludeBotsChange,
}: {
  filters: Filters;
  params: QueryParams;
  onChange: (filters: Filters) => void;
  includeBots: boolean;
  onIncludeBotsChange: (include: boolean) => void;
}) => {
  const [open, setOpen] = useState(false);
  const count = Object.keys(filters).length + (includeBots ? 1 : 0);
  return (
    <div className="range">
      <button aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        Filters{count > 0 && <> <b>{count}</b></>} ▾
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Filters">
          {FILTER_REPORTS.map((report) => (
            <FilterSelect key={report.slug} report={report} filters={filters} params={params} onChange={onChange} />
          ))}
          <label>
            <input type="checkbox" checked={includeBots} onChange={(e) => onIncludeBotsChange(e.target.checked)} /> Include bots
          </label>
        </div>
      )}
    </div>
  );
};
