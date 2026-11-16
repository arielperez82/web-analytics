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

describe('the UI does not combine API results into figures', () => {
  it.each([
    [
      'subtracting two API values',
      'export const a = (r: Row) => Number(r.a) - Number(r.b);',
    ],
    [
      'a ratio of API values',
      'export const a = (r: Row) => Number(r.a) / Number(r.b);',
    ],
    [
      'a percentage from an API value',
      'export const a = (r: Row) => Number(r.a) * 100;',
    ],
    [
      'a sum of an API value and a constant',
      'export const a = (r: Row) => 1 + Number(r.a);',
    ],
    [
      'a compound assignment from an API value',
      'export const a = (r: Row) => { let t = 0; t += Number(r.a); return t; };',
    ],
    ['negating an API value', 'export const a = (r: Row) => -Number(r.a);'],
    [
      'rounding an API value',
      'export const a = (r: Row) => Math.round(Number(r.a));',
    ],
    [
      'reducing rows',
      'export const a = (rows: Row[]) => rows.reduce((n, r) => n, 0);',
    ],
  ])('rejects %s in a component', async (_name, code) => {
    expect(
      await lint(
        component,
        `type Row = Record<string, string | number | null>;\n${code}`
      )
    ).toEqual([expect.stringContaining('combine')]);
  });

  it('rejects it under app/ too', async () => {
    const messages = await lint(
      'apps/dashboard/src/app/(dash)/Example.tsx',
      'export const a = (r: Record<string, number>) => Number(r.a) - Number(r.b);'
    );
    expect(messages).toHaveLength(1);
  });

  it.each([
    ['paging a request', 'export const a = (limit: number) => limit + 100;'],
    ['a date range', 'export const a = (t: Date) => t.getTime() - 86_400_000;'],
    [
      'clamping a request size',
      'export const a = (n: number) => Math.min(n, 1000);',
    ],
    ['a counter', 'export const a = (n: number) => n++;'],
    [
      'coercing for display',
      'export const a = (v: string | number | null) => String(Number(v));',
    ],
    [
      'comparing and formatting',
      'export const a = (x: number, y: string) => (x > 3 ? `${y}%` : String(x));',
    ],
  ])('allows %s, which prepares a request or formats', async (_name, code) => {
    expect(await lint(component, code)).toEqual([]);
  });

  it('does not police lib, where ranges and formatting are built', async () => {
    const messages = await lint(
      'apps/dashboard/src/lib/time-range.ts',
      'export const a = (r: Record<string, number>) => Number(r.a) - Number(r.b);'
    );
    expect(messages).toEqual([]);
  });
});
