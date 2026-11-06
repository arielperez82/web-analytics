import { getServerSession } from "next-auth";

import { buildAuthOptions } from "@/lib/auth-options";
import { proxyEndpoint } from "@/lib/endpoint-proxy";

export const dynamic = "force-dynamic";

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) => {
  const { name } = await params;
  const session = await getServerSession(buildAuthOptions(process.env));
  const result = await proxyEndpoint(
    {
      name,
      query: new URL(request.url).searchParams,
      authenticated: Boolean(session?.user?.email),
    },
    {
      tinybird: {
        host: process.env.TINYBIRD_HOST ?? "",
        token: process.env.TINYBIRD_TOKEN ?? "",
      },
      fetch,
    },
  );
  return Response.json(result.body, { status: result.status });
};
