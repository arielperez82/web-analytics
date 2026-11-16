"use client";

import Link from "next/link";
import { useState } from "react";

import { RankedTable } from "@/components/RankedTable";
import { hrefFor } from "@/lib/dashboard-state";
import { toggleFilter, type FilterKey } from "@/lib/filters";
import type { Report } from "@/lib/reports";
import { useDashboardState } from "@/lib/use-dashboard-state";

const LIMITS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

export const ReportView = ({ report }: { report: Report }) => {
  const { state, update, params } = useDashboardState();
  const [limit, setLimit] = useState(LIMITS[0] ?? 100);
  const pick = (key: FilterKey, value: string) => update({ ...state, filters: toggleFilter(state.filters, key, value) });
  const nextLimit = LIMITS.find((candidate) => candidate > limit);
  return (
    <>
      <p><Link href={hrefFor("/", state)}>← Overview</Link></p>
      <RankedTable report={report} state={state} params={params} onPick={pick} limit={limit}
        detail
        onMore={nextLimit !== undefined ? () => setLimit(nextLimit) : undefined}
      />
    </>
  );
};
