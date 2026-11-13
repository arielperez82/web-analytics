import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const TINYBIRD_DIR = resolve(import.meta.dirname, '../../../apps/tinybird');

export const runTb = (args: readonly string[]): string =>
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the Tinybird CLI is a user-installed tool resolved from PATH
  execFileSync('tb', [...args], {
    cwd: TINYBIRD_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const LOCAL_URL = process.env.TB_LOCAL_URL ?? 'http://localhost:7181';

export const buildSdkLocal = (localAdminToken: string): string =>
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- pnpm is the repo's package manager, resolved from PATH
  execFileSync('pnpm', ['exec', 'tinybird', 'build', '--local'], {
    cwd: TINYBIRD_DIR,
    encoding: 'utf8',
    env: {
      ...process.env,
      TINYBIRD_HOST: LOCAL_URL,
      TINYBIRD_TOKEN: localAdminToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
