type LifecycleOptions = {
  readonly enabled: boolean;
  readonly isRunning: () => Promise<boolean>;
  readonly start: () => void;
  readonly stop: () => void;
  readonly waitUntilReady: () => Promise<void>;
};

const noop = (): void => undefined;

export const manageTinybirdLocal = async ({
  enabled,
  isRunning,
  start,
  stop,
  waitUntilReady,
}: LifecycleOptions): Promise<() => void> => {
  if (!enabled || (await isRunning())) return noop;
  start();
  try {
    await waitUntilReady();
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
};
