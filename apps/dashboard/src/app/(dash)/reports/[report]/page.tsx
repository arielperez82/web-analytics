import { notFound } from "next/navigation";

import { reportBySlug } from "@/lib/reports";

import { ReportView } from "./ReportView";

const Page = async ({ params }: { params: Promise<{ report: string }> }) => {
  const report = reportBySlug((await params).report);
  if (!report) notFound();
  return <ReportView report={report} />;
};

export default Page;
