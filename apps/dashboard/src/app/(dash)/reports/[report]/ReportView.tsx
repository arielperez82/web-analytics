"use client";

import Link from "next/link";
import { useState } from "react";

import { RankedTable } from "@/components/RankedTable";
import { hrefFor } from "@/lib/dashboard-state";
import type { Report } from "@/lib/reports";
import { useDashboardState } from "@/lib/use-dashboard-state";

const PAGE_SIZE = 100;
const MAX_ROWS = 1000;

export const ReportView = ({ report }: { report: Report }) => {
  const { state, params } = useDashboardState();
  const [limit, setLimit] = useState(PAGE_SIZE);
  return (
    <>
      <p><Link href={hrefFor("/", state)}>← Overview</Link></p>
      <RankedTable report={report} state={state} params={params} limit={limit}
        detail
        onMore={limit < MAX_ROWS ? () => setLimit(limit + PAGE_SIZE) : undefined}
      />
    </>
  );
};
