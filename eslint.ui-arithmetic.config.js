import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const message =
  'Do not combine API results into a figure in the UI: add or extend an endpoint (apps/dashboard/AGENTS.md).';

const OPERATORS = ['+', '-', '*', '/', '%', '**'];
const COERCED_API_VALUE = ':has(CallExpression[callee.name="Number"])';

const selectors = [
  ...OPERATORS.map(
    operator => `BinaryExpression[operator="${operator}"]${COERCED_API_VALUE}`
  ),
  ...OPERATORS.map(
    operator =>
      `AssignmentExpression[operator="${operator}="]${COERCED_API_VALUE}`
  ),
  `UnaryExpression[operator="-"]${COERCED_API_VALUE}`,
  `CallExpression[callee.object.name="Math"]${COERCED_API_VALUE}`,
  'CallExpression[callee.property.name="reduce"]',
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
