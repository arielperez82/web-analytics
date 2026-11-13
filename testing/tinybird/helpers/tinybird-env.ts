export type TinybirdEnv = {
  readonly host: string;
  readonly token: string;
};

type Workspace = { readonly name: string; readonly token: string };

type ResolveOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly buildLocal: (localAdminToken: string) => string;
  readonly fetchLocal: (path: string, bearer?: string) => Promise<unknown>;
};

const DEFAULT_LOCAL_URL = 'http://localhost:7181';

const parseWorkspaceName = (buildOutput: string): string => {
  const match = /Tinybird Local branch:\s+(\S+)/.exec(buildOutput);
  if (!match?.[1])
    throw new Error('build output named no local workspace to resolve');
  return match[1];
};

const tokenOf = (name: string, workspaces: readonly Workspace[]): string => {
  const found = workspaces.find(workspace => workspace.name === name);
  if (!found) throw new Error(`built workspace ${name} is not listed`);
  return found.token;
};

export const resolveTinybirdEnv = async ({
  env = process.env,
  buildLocal,
  fetchLocal,
}: ResolveOptions): Promise<TinybirdEnv> => {
  if (env.TB_HOST && env.TB_TOKEN)
    return { host: env.TB_HOST, token: env.TB_TOKEN };
  const { user_token: userToken, workspace_admin_token: adminToken } =
    (await fetchLocal('/tokens')) as {
      user_token: string;
      workspace_admin_token: string;
    };
  const name = parseWorkspaceName(buildLocal(adminToken));
  const { workspaces } = (await fetchLocal(
    '/v1/user/workspaces?with_organization=false',
    userToken
  )) as { workspaces: readonly Workspace[] };
  return {
    host: env.TB_LOCAL_URL ?? DEFAULT_LOCAL_URL,
    token: tokenOf(name, workspaces),
  };
};
