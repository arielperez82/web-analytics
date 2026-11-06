import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { buildAuthOptions } from "@/lib/auth-options";

import { Dashboard } from "./Dashboard";

const Page = async () => {
  const session = await getServerSession(buildAuthOptions(process.env));
  if (!session?.user?.email) redirect("/login");
  return <Dashboard email={session.user.email} />;
};

export default Page;
