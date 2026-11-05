type WaitForRowOptions = {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const waitForRow = async <T>(
  query: () => Promise<readonly T[]>,
  predicate: (data: readonly T[]) => boolean,
  { maxAttempts = 20, delayMs = 500 }: WaitForRowOptions = {}
): Promise<readonly T[]> => {
  const attempt = async (n: number): Promise<readonly T[]> => {
    const data = await query();
    if (predicate(data)) return data;
    if (n >= maxAttempts) {
      throw new Error(`waitForRow: predicate not satisfied after ${String(maxAttempts)} attempts`);
    }
    await sleep(delayMs);
    return attempt(n + 1);
  };
  return attempt(1);
};
