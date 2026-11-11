import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { Shell } from "@/components/Shell";
import { buildAuthOptions } from "@/lib/auth-options";

const Layout = async ({ children }: { children: ReactNode }) => {
  const session = await getServerSession(buildAuthOptions(process.env));
  if (!session?.user?.email) redirect("/login");
  return (
    <Suspense>
      <Shell email={session.user.email}>{children}</Shell>
    </Suspense>
  );
};

export default Layout;
