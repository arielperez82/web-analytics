import type { TestProject } from 'vitest/node';

import { runTb } from './helpers/tb-cli';
import { resolveTinybirdEnv, type TinybirdEnv } from './helpers/tinybird-env';
import { manageTinybirdLocal } from './helpers/tinybird-local-lifecycle';
import { waitForRow } from './helpers/wait-for-row';
import { waitForTinybird } from './helpers/wait-for-tinybird';

declare module 'vitest' {
  export interface ProvidedContext {
    tinybird: TinybirdEnv;
  }
}

const LOCAL_URL = process.env.TB_LOCAL_URL ?? 'http://localhost:7181';

const localAnswers = async (): Promise<boolean> =>
  fetch(`${LOCAL_URL}/tokens`).then(
    response => response.ok,
    () => false
  );

export default async function globalSetup(
  project: TestProject
): Promise<() => void> {
  const teardown = await manageTinybirdLocal({
    enabled: process.env.E2E_MANAGE_TB_LOCAL === '1' && !process.env.TB_HOST,
    isRunning: localAnswers,
    start: () => runTb(['local', 'start']),
    stop: () => runTb(['local', 'stop']),
    waitUntilReady: async () => {
      await waitForRow(
        async () => ((await localAnswers()) ? [true] : []),
        data => data.length > 0,
        { maxAttempts: 60, delayMs: 1000 }
      );
    },
  });
  try {
    if (!process.env.TB_HOST) runTb(['build']);
    const env = resolveTinybirdEnv();
    await waitForTinybird(env);
    project.provide('tinybird', env);
  } catch (error) {
    teardown();
    throw error;
  }
  return teardown;
}
