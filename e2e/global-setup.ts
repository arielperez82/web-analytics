import type { TestProject } from 'vitest/node';

import { runTb } from './helpers/tb-cli';
import { resolveTinybirdEnv, type TinybirdEnv } from './helpers/tinybird-env';
import { waitForTinybird } from './helpers/wait-for-tinybird';

declare module 'vitest' {
  export interface ProvidedContext {
    tinybird: TinybirdEnv;
  }
}

export default async function globalSetup(project: TestProject): Promise<void> {
  if (!process.env.TB_HOST) runTb(['build']);
  const env = resolveTinybirdEnv();
  await waitForTinybird(env);
  project.provide('tinybird', env);
}
