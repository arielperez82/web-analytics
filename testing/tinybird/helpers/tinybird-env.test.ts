import { describe, expect, it } from 'vitest';

import { resolveTinybirdEnv } from './tinybird-env';

const LOCAL = 'http://localhost:7181';

const buildOutput = (workspace: string): string =>
  [
    '» Git branch:      feat/tinybird-sdk',
    `» Local workspace: ${workspace} existing`,
    '  ↳ https://cloud.tinybird.co/local/7181/x',
    '✓ Build completed in 3.5s',
  ].join('\n');

const fakeLocal =
  (
    workspaces: readonly { name: string; token: string }[]
  ): ((path: string, bearer?: string) => Promise<unknown>) =>
  // eslint-disable-next-line @typescript-eslint/require-await -- fake of an async port
  async (path, bearer) => {
    if (path === '/tokens') return { user_token: 'p.user' };
    if (path.startsWith('/v1/user/workspaces') && bearer === 'p.user')
      return { workspaces };
    throw new Error(`unexpected request ${path}`);
  };

const failing = (): never => {
  throw new Error('must not be called');
};

describe('resolveTinybirdEnv', () => {
  it('uses TB_HOST and TB_TOKEN from the environment without building', async () => {
    const env = await resolveTinybirdEnv({
      env: { TB_HOST: 'http://tb.example:1234', TB_TOKEN: 'p.explicit' },
      buildLocal: failing,
      fetchLocal: failing,
    });

    expect(env).toEqual({
      host: 'http://tb.example:1234',
      token: 'p.explicit',
    });
  });

  it('builds locally and returns the token of the workspace the SDK built into', async () => {
    const env = await resolveTinybirdEnv({
      env: {},
      buildLocal: () => buildOutput('feat_tinybird_sdk'),
      fetchLocal: fakeLocal([
        { name: 'other', token: 'p.other' },
        { name: 'feat_tinybird_sdk', token: 'p.branch-admin' },
      ]),
    });

    expect(env).toEqual({ host: LOCAL, token: 'p.branch-admin' });
  });

  it('honours TB_LOCAL_URL for the host', async () => {
    const env = await resolveTinybirdEnv({
      env: { TB_LOCAL_URL: 'http://localhost:7999' },
      buildLocal: () => buildOutput('ws'),
      fetchLocal: fakeLocal([{ name: 'ws', token: 'p.ws' }]),
    });

    expect(env.host).toBe('http://localhost:7999');
  });

  it('fails when the build output names no local workspace', async () => {
    await expect(
      resolveTinybirdEnv({
        env: {},
        buildLocal: () => 'Build completed',
        fetchLocal: fakeLocal([]),
      })
    ).rejects.toThrow(/workspace/);
  });

  it('fails when the built workspace is not listed', async () => {
    await expect(
      resolveTinybirdEnv({
        env: {},
        buildLocal: () => buildOutput('missing'),
        fetchLocal: fakeLocal([{ name: 'other', token: 'p.other' }]),
      })
    ).rejects.toThrow(/missing/);
  });
});
