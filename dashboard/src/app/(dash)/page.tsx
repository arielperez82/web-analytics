import { parseGoals } from "@/lib/goals";

import { OverviewView } from "./OverviewView";

export const dynamic = "force-dynamic";

const Page = () => {
  const { goals, errors } = parseGoals(process.env.DASHBOARD_GOALS);
  return <OverviewView goals={goals} goalErrors={errors} />;
};

export default Page;
