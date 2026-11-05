import { describe, expect, it } from 'vitest';

import { resolveTinybirdEnv } from './tinybird-env';

const infoJson = (local: Readonly<Record<string, string>>): string =>
  JSON.stringify({ cloud: {}, local });

const tokensText = (entries: readonly (readonly [string, string])[]): string =>
  [
    '** Tokens:',
    ...entries.flatMap(([name, token]) => [
      '-'.repeat(20),
      `id: ${name}-id`,
      `name: ${name}`,
      `token: ${token}`,
    ]),
  ].join('\n');

const failingReader = (): string => {
  throw new Error('must not be read');
};

const localInfo = () =>
  infoJson({ api: 'http://localhost:7181', token: 'p.build-ws' });
const localTokens = () =>
  tokensText([
    ['tracker', 'p.tracker'],
    ['workspace admin token', 'p.branch-admin'],
  ]);

describe('resolveTinybirdEnv', () => {
  it('uses TB_HOST and TB_TOKEN from the environment without reading the CLI', () => {
    const env = resolveTinybirdEnv({
      env: { TB_HOST: 'http://tb.example:1234', TB_TOKEN: 'p.explicit' },
      readLocalInfo: failingReader,
      readTokens: failingReader,
    });

    expect(env).toEqual({
      host: 'http://tb.example:1234',
      token: 'p.explicit',
    });
  });

  it('resolves the host and the branch admin token from the local Tinybird CLI', () => {
    const env = resolveTinybirdEnv({
      env: {},
      readLocalInfo: localInfo,
      readTokens: localTokens,
    });

    expect(env).toEqual({
      host: 'http://localhost:7181',
      token: 'p.branch-admin',
    });
  });

  it('lets TB_HOST override the api reported by tb info', () => {
    const env = resolveTinybirdEnv({
      env: { TB_HOST: 'http://localhost:7999' },
      readLocalInfo: localInfo,
      readTokens: localTokens,
    });

    expect(env).toEqual({
      host: 'http://localhost:7999',
      token: 'p.branch-admin',
    });
  });

  it('fails when no workspace admin token is listed', () => {
    expect(() =>
      resolveTinybirdEnv({
        env: {},
        readLocalInfo: localInfo,
        readTokens: () => tokensText([['tracker', 'p.tracker']]),
      })
    ).toThrow();
  });

  it('fails when tb info reports no local api', () => {
    expect(() =>
      resolveTinybirdEnv({
        env: {},
        readLocalInfo: () => infoJson({ token: 'p.build-ws' }),
        readTokens: localTokens,
      })
    ).toThrow();
  });
});
