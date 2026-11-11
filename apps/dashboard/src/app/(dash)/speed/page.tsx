"use client";

import { SpeedInsights } from "@/components/SpeedInsights";
import { useDashboardState } from "@/lib/use-dashboard-state";

const Page = () => <SpeedInsights params={useDashboardState().params} />;

export default Page;
