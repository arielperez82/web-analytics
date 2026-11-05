import { describe, expect, it } from 'vitest';

import { resolveTinybirdEnv } from './tinybird-env';

type FetchLike = (url: string) => Promise<Response>;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const failingFetch: FetchLike = () => Promise.reject(new Error('fetch must not be called'));

describe('resolveTinybirdEnv', () => {
  it('uses TB_HOST and TB_TOKEN from the environment without calling Tinybird', async () => {
    const env = await resolveTinybirdEnv({
      env: { TB_HOST: 'http://tb.example:1234', TB_TOKEN: 'p.explicit' },
      fetchImpl: failingFetch,
    });

    expect(env).toEqual({ host: 'http://tb.example:1234', token: 'p.explicit' });
  });

  it('fetches the workspace admin token from Tinybird Local when TB_TOKEN is unset', async () => {
    const requested: string[] = [];
    const fetchImpl: FetchLike = (url) => {
      requested.push(url);
      return Promise.resolve(jsonResponse({ workspace_admin_token: 'p.local-admin' }));
    };

    const env = await resolveTinybirdEnv({ env: {}, fetchImpl });

    expect(env).toEqual({ host: 'http://localhost:7181', token: 'p.local-admin' });
    expect(requested).toEqual(['http://localhost:7181/tokens']);
  });

  it('fails when Tinybird Local answers with an error status', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse({}, 503));

    await expect(resolveTinybirdEnv({ env: {}, fetchImpl })).rejects.toThrow(/503/);
  });

  it('fails when the response carries no workspace admin token', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse({}));

    await expect(resolveTinybirdEnv({ env: {}, fetchImpl })).rejects.toThrow(
      /workspace_admin_token/
    );
  });
});
