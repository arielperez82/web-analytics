"use client";

import { SpeedInsights } from "@/components/SpeedInsights";
import { useDashboardState } from "@/lib/use-dashboard-state";

const Page = () => {
  const { params, comparison } = useDashboardState();
  return <SpeedInsights params={params} comparison={comparison} />;
};

export default Page;
