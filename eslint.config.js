import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import { configs as sonarConfigs } from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['client/**', 'tinybird/**', '**/node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: [
      'acceptance/**/*.ts',
      'e2e/**/*.ts',
      'testing/**/*.ts',
      'scripts/**/*.ts',
      'vitest.acceptance.config.ts',
      'vitest.e2e.config.ts',
    ],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.tests.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/sort-type-constituents': 'error',
    },
  },
  {
    ...security.configs.recommended,
    rules: {
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
    },
  },
  sonarConfigs.recommended,
  {
    files: [
      'acceptance/**/*.test.ts',
      'e2e/**/*.test.ts',
      'testing/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
  prettier
);
