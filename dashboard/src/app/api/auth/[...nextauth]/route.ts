import NextAuth from "next-auth";

import { buildAuthOptions } from "@/lib/auth-options";

const handler = NextAuth(buildAuthOptions(process.env));

export { handler as GET, handler as POST };
