export type PlaywrightImageInput = {
  readonly lockfile: string;
  readonly workflows: Readonly<Record<string, string>>;
};

const REFERENCE = /mcr\.microsoft\.com\/playwright\S*/g;

export const playwrightVersion = (lockfile: string): string | undefined =>
  /'@playwright\/test@(\d+\.\d+\.\d+)'/.exec(lockfile)?.[1];

const referencesIn = (workflow: string): readonly string[] =>
  workflow.match(REFERENCE) ?? [];

const problemsFor = (
  name: string,
  reference: string,
  locked: string | undefined
): readonly string[] => {
  const version = /:v(\d+\.\d+\.\d+)/.exec(reference)?.[1];
  const pinned = /@sha256:[a-f0-9]{64}$/.test(reference);
  return [
    ...(pinned ? [] : [`${name}: ${reference} is not pinned by digest`]),
    ...(version !== undefined && version === locked
      ? []
      : [
          `${name}: ${reference} does not match the locked @playwright/test ${locked}`,
        ]),
  ];
};

export const playwrightImageProblems = ({
  lockfile,
  workflows,
}: PlaywrightImageInput): readonly string[] => {
  const locked = playwrightVersion(lockfile);
  const references = Object.entries(workflows).flatMap(([name, workflow]) =>
    referencesIn(workflow).map(reference => ({ name, reference }))
  );
  return references.length > 0 && locked === undefined
    ? ['lockfile does not lock @playwright/test']
    : references.flatMap(({ name, reference }) =>
        problemsFor(name, reference, locked)
      );
};
