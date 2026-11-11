/* eslint-disable security/detect-non-literal-fs-filename -- paths are workspace directories under the repo root */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ratchet } from './ratchet.ts';
import { workspaceGaps, type WorkspacePackage } from './workspace-gaps.ts';

const repoRoot = process.cwd();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const workspaceGlobs = (): readonly string[] =>
  readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')
    .split('\n')
    .flatMap(line => /^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/.exec(line)?.[1] ?? []);

const expand = (glob: string): readonly string[] =>
  glob.endsWith('/*')
    ? readdirSync(join(repoRoot, glob.slice(0, -2)), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => `${glob.slice(0, -2)}/${entry.name}`)
    : [glob];

const keysOf = (value: unknown): readonly string[] =>
  isRecord(value) ? Object.keys(value) : [];

const describePackage = (dir: string): WorkspacePackage => {
  const manifest: unknown = JSON.parse(
    readFileSync(join(repoRoot, dir, 'package.json'), 'utf8')
  );
  const fields = isRecord(manifest) ? manifest : {};
  return {
    dir: relative(repoRoot, join(repoRoot, dir)),
    name: typeof fields.name === 'string' ? fields.name : '',
    dependencies: [
      ...new Set(
        [
          fields.dependencies,
          fields.devDependencies,
          fields.peerDependencies,
        ].flatMap(keysOf)
      ),
    ],
  };
};

const readBaseline = (): readonly string[] => {
  const path = join(repoRoot, 'scripts/workspace/known-gaps.json');
  const parsed: unknown = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : [];
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === 'string')
    : [];
};

const packages = workspaceGlobs()
  .flatMap(expand)
  .filter(dir => existsSync(join(repoRoot, dir, 'package.json')))
  .map(describePackage);

if (packages.length === 0) {
  process.stderr.write(
    'No workspace packages found; run from the repo root.\n'
  );
  process.exit(1);
}

const gaps = workspaceGaps(packages);
const { newGaps, staleBaseline } = ratchet({ gaps, baseline: readBaseline() });

const indented = (entry: string): string => `  ${entry}`;

const list = (title: string, entries: readonly string[]): string =>
  entries.length === 0 ? '' : [title, ...entries.map(indented), ''].join('\n');

if (newGaps.length > 0 || staleBaseline.length > 0) {
  process.stderr.write(
    list('New workspace gaps:', newGaps) +
      list(
        'Fixed; remove from scripts/workspace/known-gaps.json:',
        staleBaseline
      )
  );
  process.exit(1);
}

process.stdout.write(
  `Workspace check: ${String(packages.length)} package(s), ${String(gaps.length)} known gap(s) left to fix.\n`
);
