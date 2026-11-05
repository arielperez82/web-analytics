import { describe, expect, it } from 'vitest';

import { ingestEvents, queryPipe } from './tinybird-client';

type RecordedRequest = { readonly url: string; readonly init?: RequestInit };

const recordingFetch = (response: Response) => {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> => {
    requests.push({ url, init });
    return Promise.resolve(response);
  };
  return { fetchImpl, requests };
};

const env = { host: 'http://tb.example:7181', token: 'p.token' };

describe('ingestEvents', () => {
  it('posts newline-delimited JSON to the analytics_events datasource and waits for ingestion', async () => {
    const { fetchImpl, requests } = recordingFetch(
      new Response('{}', { status: 200 })
    );

    await ingestEvents(env, [{ a: 1 }, { a: 2 }], fetchImpl);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      'http://tb.example:7181/v0/events?name=analytics_events&wait=true'
    );
    expect(requests[0]?.init?.method).toBe('POST');
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: 'Bearer p.token',
    });
    expect(requests[0]?.init?.body).toBe('{"a":1}\n{"a":2}');
  });

  it('reports the response body when ingestion fails', async () => {
    const { fetchImpl } = recordingFetch(
      new Response('bad schema', { status: 400 })
    );

    await expect(ingestEvents(env, [{ a: 1 }], fetchImpl)).rejects.toThrow(
      /400.*bad schema/
    );
  });
});

describe('queryPipe', () => {
  it('requests the pipe as JSON with the given parameters and returns the parsed body', async () => {
    const { fetchImpl, requests } = recordingFetch(
      new Response(JSON.stringify({ data: [{ n: 1 }] }), { status: 200 })
    );

    const result = await queryPipe<{ n: number }>(
      env,
      'web_vitals_current',
      { days: 1, domain: 'a.example.com' },
      fetchImpl
    );

    expect(result).toEqual({ data: [{ n: 1 }] });
    expect(requests[0]?.url).toBe(
      'http://tb.example:7181/v0/pipes/web_vitals_current.json?days=1&domain=a.example.com'
    );
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: 'Bearer p.token',
    });
  });

  it('reports the response body when the query fails', async () => {
    const { fetchImpl } = recordingFetch(
      new Response('no such pipe', { status: 404 })
    );

    await expect(queryPipe(env, 'missing', {}, fetchImpl)).rejects.toThrow(
      /404.*no such pipe/
    );
  });
});
