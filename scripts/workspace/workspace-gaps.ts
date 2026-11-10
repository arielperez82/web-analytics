export type WorkspacePackage = {
  readonly dir: string;
  readonly name: string;
  readonly dependencies: readonly string[];
};

const isApp = ({ dir }: WorkspacePackage): boolean => dir.startsWith('apps/');

const isPackage = ({ dir }: WorkspacePackage): boolean =>
  dir.startsWith('packages/');

const placementGaps = (pkg: WorkspacePackage): readonly string[] =>
  isApp(pkg) || isPackage(pkg)
    ? []
    : [`${pkg.dir}: move it under apps/ (deployed) or packages/ (imported)`];

const appDependencyGaps = (
  { dir, dependencies }: WorkspacePackage,
  appNames: ReadonlySet<string>
): readonly string[] =>
  dependencies
    .filter(dependency => appNames.has(dependency))
    .map(
      dependency =>
        `${dir}: depends on the app ${dependency}; move the shared code into a package`
    );

export const workspaceGaps = (
  packages: readonly WorkspacePackage[]
): readonly string[] => {
  const appNames = new Set(packages.filter(isApp).map(({ name }) => name));
  return packages.flatMap(pkg => [
    ...placementGaps(pkg),
    ...appDependencyGaps(pkg, appNames),
  ]);
};
