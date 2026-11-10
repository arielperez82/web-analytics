import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { buildSdkLocal } from '../tinybird/helpers/tb-cli';
import { resolveTinybirdEnv } from '../tinybird/helpers/tinybird-env';
import { waitForTinybird } from '../tinybird/helpers/wait-for-tinybird';
import { startFakeUpstash } from './fake-upstash';

const LOCAL_URL = process.env.TB_LOCAL_URL ?? 'http://localhost:7181';
const DASHBOARD_PORT = 3100;
const UPSTASH_PORT = 4180;
const FIXTURE_ORIGIN = 'http://localhost:4173';

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

const waitForUrl = async (url: string, attempts = 120): Promise<void> => {
  const ready = await fetch(url).then(
    response => response.status < 500,
    () => false
  );
  if (ready) return;
  if (attempts === 0) throw new Error(`${url} never became ready`);
  await new Promise(done => setTimeout(done, 1000));
  return waitForUrl(url, attempts - 1);
};

const startDashboard = (env: NodeJS.ProcessEnv): ChildProcess => {
  const args = [
    '--filter',
    '@web-analytics/dashboard',
    'exec',
    'next',
    'dev',
    '--port',
    String(DASHBOARD_PORT),
  ];
  const options = {
    cwd: resolve(import.meta.dirname, '../..'),
    env: { ...process.env, ...env },
    stdio: 'ignore' as const,
  };
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- pnpm is the repo's package manager, resolved from PATH
  return spawn('pnpm', args, options);
};

export default async function globalSetup(): Promise<() => Promise<void>> {
  const tinybird = await resolveTinybirdEnv({
    buildLocal: buildSdkLocal,
    fetchLocal: fetchLocalJson,
  });
  await waitForTinybird(tinybird);
  const upstash = await startFakeUpstash(UPSTASH_PORT);
  const tenant = `e2e-${randomUUID()}`;
  const dashboardUrl = `http://localhost:${DASHBOARD_PORT}`;
  const dashboard = startDashboard({
    TINYBIRD_HOST: tinybird.host,
    TINYBIRD_TOKEN: tinybird.token,
    TRACKING_TINYBIRD_TOKEN: tinybird.token,
    DASHBOARD_TENANT_ID: tenant,
    DASHBOARD_GOALS: JSON.stringify([
      { name: 'Signed up', path: '/welcome/done' },
    ]),
    IDENTITY_SALT_SECRET: 'e2e-salt-secret',
    TRACKING_ALLOWED_ORIGINS: `${FIXTURE_ORIGIN}=${tenant}`,
    UPSTASH_REDIS_REST_URL: upstash.url,
    UPSTASH_REDIS_REST_TOKEN: 'e2e',
    NEXTAUTH_URL: dashboardUrl,
    NEXTAUTH_SECRET: 'e2e-nextauth-secret',
    ALLOWED_EMAILS: 'e2e@example.com',
    DASHBOARD_DEV_LOGIN: '1',
    NEXT_DIST_DIR: '.next-e2e',
    NODE_ENV: 'development',
  });
  process.env.E2E_DASHBOARD_URL = dashboardUrl;
  process.env.E2E_TENANT = tenant;
  await waitForUrl(`${dashboardUrl}/login`);
  return async () => {
    dashboard.kill();
    await upstash.stop();
  };
}
