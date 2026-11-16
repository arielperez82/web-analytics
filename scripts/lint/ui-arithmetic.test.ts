import { resolve } from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

const lint = async (file: string, code: string): Promise<readonly string[]> => {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: resolve(root, 'eslint.ui-arithmetic.config.js'),
  });
  const [result] = await eslint.lintText(code, {
    filePath: resolve(root, file),
  });
  return (result?.messages ?? [])
    .filter(message => message.ruleId !== null)
    .map(message => message.message);
};

const component = 'apps/dashboard/src/components/Example.tsx';

describe('the UI does not calculate', () => {
  it.each([
    ['subtraction', 'export const a = (x: number, y: number) => x - y;'],
    ['addition', 'export const a = (x: number, y: number) => x + y;'],
    ['division', 'export const a = (x: number, y: number) => x / y;'],
    ['multiplication', 'export const a = (x: number, y: number) => x * y;'],
    ['remainder', 'export const a = (x: number, y: number) => x % y;'],
    ['negation of a value', 'export const a = (x: number) => -x;'],
    ['increment', 'export const a = (x: number) => x++;'],
    ['compound assignment', 'export const a = (x: number) => (x += 2);'],
    ['reduce', 'export const a = (x: number[]) => x.reduce((n, v) => n, 0);'],
    ['Math', 'export const a = (x: number) => Math.round(x);'],
  ])('rejects %s in a component', async (_name, code) => {
    expect(await lint(component, code)).toEqual([
      expect.stringContaining('does not calculate'),
    ]);
  });

  it('rejects arithmetic under app/ too', async () => {
    const messages = await lint(
      'apps/dashboard/src/app/(dash)/Example.tsx',
      'export const a = (x: number, y: number) => x - y;'
    );
    expect(messages).toHaveLength(1);
  });

  it('allows formatting, comparison and template strings', async () => {
    const code =
      'export const a = (x: number, y: string) => (x > 3 ? `${y}%` : String(x));';
    expect(await lint(component, code)).toEqual([]);
  });

  it('does not police lib, where ranges and formatting are built', async () => {
    const messages = await lint(
      'apps/dashboard/src/lib/time-range.ts',
      'export const a = (x: number, y: number) => x - y;'
    );
    expect(messages).toEqual([]);
  });
});
