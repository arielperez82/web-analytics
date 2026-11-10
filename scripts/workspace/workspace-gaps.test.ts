import { describe, expect, it } from 'vitest';

import { workspaceGaps, type WorkspacePackage } from './workspace-gaps';

const pkg = (overrides: Partial<WorkspacePackage>): WorkspacePackage => ({
  dir: 'packages/lib',
  name: '@web-analytics/lib',
  dependencies: [],
  ...overrides,
});

describe('workspaceGaps', () => {
  it('flags a package that depends on an app, since apps are composition roots', () => {
    const app = pkg({
      dir: 'apps/dashboard',
      name: '@web-analytics/dashboard',
    });
    const lib = pkg({ dependencies: ['@web-analytics/dashboard'] });

    expect(workspaceGaps([app, lib])).toEqual([
      'packages/lib: depends on the app @web-analytics/dashboard; move the shared code into a package',
    ]);
  });

  it('flags a package that sits outside apps/ and packages/', () => {
    const stray = pkg({ dir: 'dashboard', name: '@web-analytics/dashboard' });

    expect(workspaceGaps([stray])).toEqual([
      'dashboard: move it under apps/ (deployed) or packages/ (imported)',
    ]);
  });
});
