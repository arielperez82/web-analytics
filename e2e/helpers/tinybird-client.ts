import type { TinybirdEnv } from './tinybird-env';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type PipeParams = Readonly<Record<string, string | number | boolean>>;

const DATASOURCE = 'analytics_events';

const authHeaders = (env: TinybirdEnv): Record<string, string> => ({
  Authorization: `Bearer ${env.token}`,
});

const assertOk = async (response: Response, action: string): Promise<void> => {
  if (response.ok) return;
  throw new Error(
    `${action} failed with ${String(response.status)}: ${await response.text()}`
  );
};

export const ingestEvents = async (
  env: TinybirdEnv,
  rows: readonly object[],
  fetchImpl: FetchLike = fetch
): Promise<void> => {
  const response = await fetchImpl(
    `${env.host}/v0/events?name=${DATASOURCE}&wait=true`,
    {
      method: 'POST',
      headers: authHeaders(env),
      body: rows.map(row => JSON.stringify(row)).join('\n'),
    }
  );
  await assertOk(response, 'ingest');
};

export const queryPipe = async <T>(
  env: TinybirdEnv,
  pipe: string,
  params: PipeParams,
  fetchImpl: FetchLike = fetch
): Promise<{ readonly data: readonly T[] }> => {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]): [string, string] => [
      key,
      String(value),
    ])
  );
  const response = await fetchImpl(
    `${env.host}/v0/pipes/${pipe}.json?${query.toString()}`,
    {
      headers: authHeaders(env),
    }
  );
  await assertOk(response, `query ${pipe}`);
  return (await response.json()) as { readonly data: readonly T[] };
};
