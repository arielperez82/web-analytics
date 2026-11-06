import type { TestProject } from 'vitest/node';

import { buildSdkLocal, runTb } from './helpers/tb-cli';
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

const fetchLocalJson = async (
  path: string,
  bearer?: string
): Promise<unknown> => {
  const response = await fetch(`${LOCAL_URL}${path}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
};

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
    const env = await resolveTinybirdEnv({
      buildLocal: buildSdkLocal,
      fetchLocal: fetchLocalJson,
    });
    await waitForTinybird(env);
    project.provide('tinybird', env);
  } catch (error) {
    teardown();
    throw error;
  }
  return teardown;
}
