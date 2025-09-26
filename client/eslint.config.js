// eslint.config.js
import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier/flat'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  {
    // Simple import/export sorting
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error'
    }
  },
  // Type-aware rules only for TS/TSX in src/ folder
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked.rules,
      '@typescript-eslint/triple-slash-reference': 'off',
      '@typescript-eslint/sort-type-constituents': 'error'
    }
  },
  // Import resolver for TypeScript path aliases
  {
    settings: {
      'import/resolver': {
        typescript: {}
      }
    }
  },
  // Prettier
  prettier
]
