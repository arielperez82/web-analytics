import { describe, expect, it } from 'vitest';

import { playwrightImageProblems, playwrightVersion } from './playwright-image';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const lockfile = `packages:\n  '@playwright/test@1.65.0':\n    resolution: {}\n`;
const workflow = (image: string): string =>
  `jobs:\n  e2e:\n    container:\n      image: ${image}\n`;
const pinned = (tag: string): string =>
  `mcr.microsoft.com/playwright:${tag}@${DIGEST}`;

describe('playwrightVersion', () => {
  it('reads the locked @playwright/test version', () => {
    expect(playwrightVersion(lockfile)).toBe('1.65.0');
  });

  it('is undefined when the lockfile does not lock @playwright/test', () => {
    expect(playwrightVersion('packages: {}')).toBeUndefined();
  });
});

describe('playwrightImageProblems', () => {
  it('accepts an image whose tag matches the locked version and is pinned by digest', () => {
    expect(
      playwrightImageProblems({
        lockfile,
        workflows: { 'browser.yml': workflow(pinned('v1.65.0-noble')) },
      })
    ).toEqual([]);
  });

  it('reports an image whose version differs from the locked @playwright/test', () => {
    expect(
      playwrightImageProblems({
        lockfile,
        workflows: { 'browser.yml': workflow(pinned('v1.64.0-noble')) },
      })
    ).toEqual([expect.stringContaining('browser.yml')]);
  });

  it('reports an image that is not pinned by digest', () => {
    expect(
      playwrightImageProblems({
        lockfile,
        workflows: {
          'browser.yml': workflow('mcr.microsoft.com/playwright:v1.65.0-noble'),
        },
      })
    ).toEqual([expect.stringContaining('digest')]);
  });

  it('reports a lockfile that does not lock @playwright/test', () => {
    expect(
      playwrightImageProblems({
        lockfile: 'packages: {}',
        workflows: { 'browser.yml': workflow(pinned('v1.65.0-noble')) },
      })
    ).toEqual([expect.stringContaining('lockfile')]);
  });

  it('ignores workflows that use no Playwright image', () => {
    expect(
      playwrightImageProblems({
        lockfile,
        workflows: { 'client.yml': 'jobs: {}' },
      })
    ).toEqual([]);
  });
});
