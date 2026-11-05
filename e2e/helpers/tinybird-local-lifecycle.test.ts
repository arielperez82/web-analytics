import { describe, expect, it } from 'vitest';

import { manageTinybirdLocal } from './tinybird-local-lifecycle';

const createFakes = (running: boolean) => {
  const calls: string[] = [];
  return {
    calls,
    options: {
      enabled: true,
      isRunning: () => Promise.resolve(running),
      start: () => {
        calls.push('start');
      },
      stop: () => {
        calls.push('stop');
      },
      waitUntilReady: () => {
        calls.push('wait');
        return Promise.resolve();
      },
    },
  };
};

describe('manageTinybirdLocal', () => {
  it('starts Tinybird Local, waits for it, and stops it on teardown when it was not running', async () => {
    const { calls, options } = createFakes(false);

    const teardown = await manageTinybirdLocal(options);
    expect(calls).toEqual(['start', 'wait']);

    teardown();
    expect(calls).toEqual(['start', 'wait', 'stop']);
  });

  it('leaves an already running Tinybird Local untouched', async () => {
    const { calls, options } = createFakes(true);

    const teardown = await manageTinybirdLocal(options);
    teardown();

    expect(calls).toEqual([]);
  });

  it('does nothing when management is not enabled', async () => {
    const { calls, options } = createFakes(false);

    const teardown = await manageTinybirdLocal({ ...options, enabled: false });
    teardown();

    expect(calls).toEqual([]);
  });

  it('stops what it started when waiting for readiness fails', async () => {
    const { calls, options } = createFakes(false);

    await expect(
      manageTinybirdLocal({
        ...options,
        waitUntilReady: () => Promise.reject(new Error('never ready')),
      })
    ).rejects.toThrow('never ready');

    expect(calls).toEqual(['start', 'stop']);
  });
});
