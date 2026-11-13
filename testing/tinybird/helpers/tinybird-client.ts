import type { TinybirdEnv } from './tinybird-env';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type PipeParams = Readonly<Record<string, boolean | number | string>>;

const DEFAULT_DATASOURCE = 'analytics_events_landing';

const authHeaders = (env: TinybirdEnv): Record<string, string> => ({
  Authorization: `Bearer ${env.token}`,
});

const assertOk = async (response: Response, action: string): Promise<void> => {
  if (response.ok) return;
  throw new Error(
    `${action} failed with ${String(response.status)}: ${await response.text()}`
  );
};

type IngestOptions = {
  readonly datasource?: string;
  readonly fetchImpl?: FetchLike;
};

const STORED_DATASOURCE = 'analytics_events';
const HISTORY_AFTER_MS = 23 * 3_600_000;

const claimedTimestamp = (row: object): string | undefined =>
  'timestamp' in row && typeof row.timestamp === 'string'
    ? row.timestamp
    : undefined;

const isHistory = (row: object): boolean => {
  const claimed = claimedTimestamp(row);
  return (
    claimed !== undefined &&
    Math.abs(Date.now() - Date.parse(claimed.replace(' ', 'T') + 'Z')) >
      HISTORY_AFTER_MS
  );
};

const post = async (
  env: TinybirdEnv,
  datasource: string,
  rows: readonly object[],
  fetchImpl: FetchLike
): Promise<void> => {
  if (rows.length === 0) return;
  const response = await fetchImpl(
    `${env.host}/v0/events?name=${datasource}&wait=true`,
    {
      method: 'POST',
      headers: authHeaders(env),
      body: rows.map(row => JSON.stringify(row)).join('\n'),
    }
  );
  await assertOk(response, 'ingest');
};

/**
 * Without a datasource, events take the production path through the landing,
 * except history: the landing refuses a client timestamp more than a day from
 * its reception, so older events are seeded straight into the stored table with
 * reception_timestamp equal to their timestamp. A named datasource is used as is.
 */
export const ingestEvents = async (
  env: TinybirdEnv,
  rows: readonly object[],
  { datasource, fetchImpl = fetch }: IngestOptions = {}
): Promise<void> => {
  if (datasource !== undefined) return post(env, datasource, rows, fetchImpl);
  await post(
    env,
    DEFAULT_DATASOURCE,
    rows.filter(row => !isHistory(row)),
    fetchImpl
  );
  await post(
    env,
    STORED_DATASOURCE,
    rows
      .filter(isHistory)
      .map(row => ({ ...row, reception_timestamp: claimedTimestamp(row) })),
    fetchImpl
  );
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

export const querySql = async <T>(
  env: TinybirdEnv,
  statement: string,
  fetchImpl: FetchLike = fetch
): Promise<readonly T[]> => {
  const query = encodeURIComponent(statement + ' FORMAT JSON');
  const response = await fetchImpl(`${env.host}/v0/sql?q=${query}`, {
    headers: authHeaders(env),
  });
  await assertOk(response, 'sql');
  return ((await response.json()) as { readonly data: readonly T[] }).data;
};
