import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const TINYBIRD_DIR = resolve(import.meta.dirname, '../../tinybird');

export const runTb = (args: readonly string[]): string =>
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the Tinybird CLI is a user-installed tool resolved from PATH
  execFileSync('tb', [...args], {
    cwd: TINYBIRD_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
