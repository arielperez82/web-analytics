export type TinybirdEnv = {
  readonly host: string;
  readonly token: string;
};

type ResolveOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: (url: string) => Promise<Response>;
};

type TokensResponse = { readonly workspace_admin_token?: string };

const DEFAULT_LOCAL_HOST = 'http://localhost:7181';

const fetchLocalAdminToken = async (
  host: string,
  fetchImpl: (url: string) => Promise<Response>
): Promise<string> => {
  const response = await fetchImpl(`${host}/tokens`);
  if (!response.ok) {
    throw new Error(`Tinybird Local /tokens responded ${String(response.status)}`);
  }
  const { workspace_admin_token: token } = (await response.json()) as TokensResponse;
  if (!token) throw new Error('Tinybird Local /tokens returned no workspace_admin_token');
  return token;
};

export const resolveTinybirdEnv = async ({
  env = process.env,
  fetchImpl = fetch,
}: ResolveOptions = {}): Promise<TinybirdEnv> => {
  const host = env.TB_HOST ?? DEFAULT_LOCAL_HOST;
  const token = env.TB_TOKEN ?? (await fetchLocalAdminToken(host, fetchImpl));
  return { host, token };
};
