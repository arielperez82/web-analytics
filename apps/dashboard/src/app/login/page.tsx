import { returnPath } from "@/lib/return-path";

import { LoginButtons } from "./LoginButtons";

type Props = { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> };

const LoginPage = async ({ searchParams }: Props) => {
  const { callbackUrl } = await searchParams;
  return (
    <main className="login">
      <h1>Web Analytics</h1>
      <LoginButtons
        google={Boolean(process.env.GOOGLE_CLIENT_ID)}
        dev={
          process.env.DASHBOARD_DEV_LOGIN === "1" &&
          process.env.NODE_ENV !== "production"
        }
        callbackUrl={returnPath(typeof callbackUrl === "string" ? callbackUrl : undefined)}
      />
    </main>
  );
};

export default LoginPage;
