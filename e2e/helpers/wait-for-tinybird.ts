import type { TinybirdEnv } from './tinybird-env';

const probe = async ({ host, token }: TinybirdEnv): Promise<string | null> => {
  try {
    const response = await fetch(`${host}/v0/sql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: 'SELECT 1',
    });
    return response.ok ? null : `Tinybird responded ${String(response.status)}`;
  } catch {
    return `Connection refused at ${host}; is Tinybird Local running (tb local start)?`;
  }
};

export const waitForTinybird = async (
  env: TinybirdEnv,
  maxAttempts = 30,
  delayMs = 1000
): Promise<void> => {
  const attempt = async (n: number): Promise<void> => {
    const error = await probe(env);
    if (error === null) return;
    if (n >= maxAttempts) {
      throw new Error(
        `Tinybird not ready after ${String(maxAttempts)} attempts: ${error}`
      );
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return attempt(n + 1);
  };
  return attempt(1);
};
