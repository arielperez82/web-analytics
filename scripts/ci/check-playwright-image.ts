import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { playwrightImageProblems } from './playwright-image';

const WORKFLOWS_DIR = '.github/workflows';

const workflows = Object.fromEntries(
  readdirSync(WORKFLOWS_DIR)
    .filter(file => file.endsWith('.yml'))
    .map(file => [file, readFileSync(join(WORKFLOWS_DIR, file), 'utf8')])
);

const problems = playwrightImageProblems({
  lockfile: readFileSync('pnpm-lock.yaml', 'utf8'),
  workflows,
});

problems.forEach(problem => console.error(problem));
console.log(
  problems.length === 0
    ? 'Playwright image check: ok'
    : `Playwright image check: ${problems.length} problem(s)`
);
process.exit(problems.length === 0 ? 0 : 1);
