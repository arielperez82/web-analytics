import { describe, expect, it } from 'vitest';

import { ingestEvents, queryPipe } from './tinybird-client';

const env = { host: 'http://tb.example:7181', token: 'p.token' };

const respondWith = (response: Response) => (): Promise<Response> =>
  Promise.resolve(response);

describe('ingestEvents', () => {
  it('reports the status and body when ingestion fails', async () => {
    const fetchImpl = respondWith(new Response('bad schema', { status: 400 }));

    await expect(ingestEvents(env, [{ a: 1 }], fetchImpl)).rejects.toThrow(
      /400.*bad schema/
    );
  });
});

describe('queryPipe', () => {
  it('returns the rows the pipe answered with', async () => {
    const fetchImpl = respondWith(
      new Response(JSON.stringify({ data: [{ n: 1 }] }), { status: 200 })
    );

    const result = await queryPipe<{ n: number }>(
      env,
      'any_pipe',
      {},
      fetchImpl
    );

    expect(result.data).toEqual([{ n: 1 }]);
  });

  it('reports the status and body when the query fails', async () => {
    const fetchImpl = respondWith(
      new Response('no such pipe', { status: 404 })
    );

    await expect(queryPipe(env, 'missing', {}, fetchImpl)).rejects.toThrow(
      /404.*no such pipe/
    );
  });
});
