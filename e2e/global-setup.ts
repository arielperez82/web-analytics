import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { TestProject } from 'vitest/node';

import { resolveTinybirdEnv, type TinybirdEnv } from './helpers/tinybird-env';
import { waitForTinybird } from './helpers/wait-for-tinybird';

declare module 'vitest' {
  export interface ProvidedContext {
    tinybird: TinybirdEnv;
  }
}

const buildLocalSchema = (): void => {
  execFileSync('tb', ['build'], {
    cwd: resolve(import.meta.dirname, '../tinybird'),
    stdio: 'pipe',
  });
};

export default async function globalSetup(project: TestProject): Promise<void> {
  if (!process.env.TB_HOST) buildLocalSchema();
  const env = resolveTinybirdEnv();
  await waitForTinybird(env);
  project.provide('tinybird', env);
}
