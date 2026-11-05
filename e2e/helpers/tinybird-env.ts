import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export type TinybirdEnv = {
  readonly host: string;
  readonly token: string;
};

type ResolveOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly readLocalInfo?: () => string;
  readonly readTokens?: () => string;
};

type LocalInfo = { readonly local?: { readonly api?: string } };

const TINYBIRD_DIR = resolve(import.meta.dirname, '../../tinybird');
const ADMIN_TOKEN_NAME = 'workspace admin token';

const runTb = (args: readonly string[]): string =>
  execFileSync('tb', [...args], {
    cwd: TINYBIRD_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

const parseApi = (raw: string): string => {
  const { local } = JSON.parse(raw) as LocalInfo;
  if (!local?.api) throw new Error('tb info reported no local api');
  return local.api;
};

const parseAdminToken = (raw: string): string => {
  const match = new RegExp(`name: ${ADMIN_TOKEN_NAME}\\s*\\ntoken: (\\S+)`).exec(raw);
  if (!match?.[1]) throw new Error(`tb token ls listed no ${ADMIN_TOKEN_NAME}`);
  return match[1];
};

export const resolveTinybirdEnv = ({
  env = process.env,
  readLocalInfo = () => runTb(['--output', 'json', 'info']),
  readTokens = () => runTb(['token', 'ls']),
}: ResolveOptions = {}): TinybirdEnv => {
  if (env.TB_HOST && env.TB_TOKEN) return { host: env.TB_HOST, token: env.TB_TOKEN };
  return {
    host: env.TB_HOST ?? parseApi(readLocalInfo()),
    token: env.TB_TOKEN ?? parseAdminToken(readTokens()),
  };
};
