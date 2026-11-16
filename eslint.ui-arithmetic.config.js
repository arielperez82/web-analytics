import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const message =
  'The UI does not calculate: render the figure the API returns (apps/dashboard/AGENTS.md).';

const OPERATORS = ['+', '-', '*', '/', '%', '**'];

const selectors = [
  ...OPERATORS.map(operator => `BinaryExpression[operator="${operator}"]`),
  ...OPERATORS.map(operator => `AssignmentExpression[operator="${operator}="]`),
  'UpdateExpression',
  'UnaryExpression[operator="-"]',
  'CallExpression[callee.property.name="reduce"]',
  'MemberExpression[object.name="Math"]',
];

export default defineConfig({
  files: [
    'apps/dashboard/src/components/**/*.{ts,tsx}',
    'apps/dashboard/src/app/**/*.{ts,tsx}',
  ],
  ignores: ['**/*.test.{ts,tsx}'],
  languageOptions: { parser: tseslint.parser },
  rules: {
    'no-restricted-syntax': [
      'error',
      ...selectors.map(selector => ({ selector, message })),
    ],
  },
});
