export default {
    "*.md": [
      "pnpm run lint:format:md:fix",
      "pnpm run lint:md:fix"
    ],
    "client/src/**/*.{js,ts,json,yaml}": () => [
      "pnpm run lint:format:code:fix",
      "pnpm run lint:code:fix",
      "pnpm run test:client"
    ],
    "{acceptance/**/*.ts,e2e/**/*.ts,testing/**/*.ts,vitest.acceptance.config.ts,vitest.e2e.config.ts,eslint.config.js,tsconfig.tests.json}": () => [
      "pnpm run lint:format:tests:fix",
      "pnpm run lint:code:tests:fix"
    ],
    "dashboard/src/**/*.{ts,tsx}": () => [
      "pnpm run typecheck:dashboard",
      "pnpm run test:dashboard"
    ],
    "tinybird/src/**/*.ts": () => [
      "pnpm run typecheck:tinybird"
    ]
  }
