import { type PipeParams, queryPipe } from './tinybird-client';
import type { TinybirdEnv } from './tinybird-env';
import { waitForRow } from './wait-for-row';

export const pipeRows = async <T>(
  env: TinybirdEnv,
  pipe: string,
  params: PipeParams
): Promise<readonly T[]> => (await queryPipe<T>(env, pipe, params)).data;

export const waitForPipeRows = <T>(
  env: TinybirdEnv,
  pipe: string,
  params: PipeParams,
  minRows = 1
): Promise<readonly T[]> =>
  waitForRow(
    () => pipeRows<T>(env, pipe, params),
    rows => rows.length >= minRows
  );
