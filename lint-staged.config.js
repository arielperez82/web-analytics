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
    "{e2e/**/*.ts,vitest.e2e.config.ts,eslint.config.js}": () => [
      "pnpm run lint:format:e2e:fix",
      "pnpm run lint:code:e2e:fix"
    ],
    "tinybird/src/**/*.ts": () => [
      "pnpm run typecheck:tinybird"
    ]
  }
