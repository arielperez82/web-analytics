import { describe, expect, it } from 'vitest';

import { ingestEvents, queryPipe, querySql } from './tinybird-client';

const env = { host: 'http://tb.example:7181', token: 'p.token' };

const respondWith = (response: Response) => (): Promise<Response> =>
  Promise.resolve(response);

describe('ingestEvents', () => {
  it('reports the status and body when ingestion fails', async () => {
    const fetchImpl = respondWith(new Response('bad schema', { status: 400 }));

    await expect(ingestEvents(env, [{ a: 1 }], { fetchImpl })).rejects.toThrow(
      /400.*bad schema/
    );
  });
});

describe('ingestEvents datasource', () => {
  it('posts to the named datasource', async () => {
    const urls: string[] = [];
    const fetchImpl = (url: string): Promise<Response> => {
      urls.push(url);
      return Promise.resolve(new Response('{}', { status: 202 }));
    };

    await ingestEvents(env, [{ a: 1 }], {
      datasource: 'analytics_events_landing',
      fetchImpl,
    });

    expect(urls[0]).toContain('name=analytics_events_landing');
  });
});

describe('querySql', () => {
  it('sends the statement and returns the rows', async () => {
    const urls: string[] = [];
    const fetchImpl = (url: string): Promise<Response> => {
      urls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [{ n: 1 }] }), { status: 200 })
      );
    };

    const rows = await querySql<{ n: number }>(env, 'SELECT 1 AS n', fetchImpl);

    expect(rows).toEqual([{ n: 1 }]);
    expect(decodeURIComponent(urls[0] ?? '')).toContain(
      'SELECT 1 AS n FORMAT JSON'
    );
  });

  it('reports the status and body when the statement fails', async () => {
    const fetchImpl = respondWith(new Response('syntax', { status: 400 }));

    await expect(querySql(env, 'bad', fetchImpl)).rejects.toThrow(
      /400.*syntax/
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
