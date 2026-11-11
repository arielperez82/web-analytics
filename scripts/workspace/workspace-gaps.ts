export type WorkspacePackage = {
  readonly dir: string;
  readonly name: string;
  readonly dependencies: readonly string[];
};

const ALLOWED_INTERNAL_DEPENDENCIES: Readonly<
  Record<string, readonly string[]>
> = {
  'tinybird-analytics': [],
  '@web-analytics/contracts': [],
  '@web-analytics/ingest': ['@web-analytics/contracts'],
  '@web-analytics/tinybird': ['@web-analytics/event-schema'],
};

const isApp = ({ dir }: WorkspacePackage): boolean => dir.startsWith('apps/');

const isPackage = ({ dir }: WorkspacePackage): boolean =>
  dir.startsWith('packages/');

const isConsumer = ({ dir }: WorkspacePackage): boolean => dir === 'e2e';

const placementGaps = (pkg: WorkspacePackage): readonly string[] =>
  isApp(pkg) || isPackage(pkg) || isConsumer(pkg)
    ? []
    : [`${pkg.dir}: move it under apps/ (deployed) or packages/ (imported)`];

const appDependencyGaps = (
  pkg: WorkspacePackage,
  appNames: ReadonlySet<string>
): readonly string[] =>
  isConsumer(pkg)
    ? []
    : pkg.dependencies
        .filter(dependency => appNames.has(dependency))
        .map(
          dependency =>
            `${pkg.dir}: depends on the app ${dependency}; move the shared code into a package`
        );

const allowedDependencyGaps = (
  { dir, name, dependencies }: WorkspacePackage,
  internalNames: ReadonlySet<string>
): readonly string[] => {
  const allowed = ALLOWED_INTERNAL_DEPENDENCIES[name];
  if (allowed === undefined) return [];
  return dependencies
    .filter(
      dependency =>
        internalNames.has(dependency) && !allowed.includes(dependency)
    )
    .map(
      dependency =>
        `${dir}: may not depend on ${dependency}; allowed internal dependencies: ${allowed.join(', ') || 'none'}`
    );
};

export const workspaceGaps = (
  packages: readonly WorkspacePackage[]
): readonly string[] => {
  const appNames = new Set(packages.filter(isApp).map(({ name }) => name));
  const internalNames = new Set(packages.map(({ name }) => name));
  return packages.flatMap(pkg => [
    ...placementGaps(pkg),
    ...appDependencyGaps(pkg, appNames),
    ...allowedDependencyGaps(pkg, internalNames),
  ]);
};
