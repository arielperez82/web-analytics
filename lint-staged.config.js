export default {
    "*.md": [
      "pnpm run lint:format:md:fix",
      "pnpm run lint:md:fix"
    ],
    "packages/client/src/**/*.{js,ts,json,yaml}": () => [
      "pnpm run lint:format:code:fix",
      "pnpm run lint:code:fix",
      "pnpm run test:client"
    ],
    "{acceptance/**/*.ts,e2e/**/*.ts,testing/**/*.ts,scripts/**/*.ts,vitest.acceptance.config.ts,vitest.e2e.config.ts,eslint.config.js,tsconfig.tests.json}": () => [
      "pnpm run lint:format:tests:fix",
      "pnpm run lint:code:tests:fix"
    ],
    "scripts/**/*.ts": () => [
      "pnpm run test:scripts"
    ],
    "packages/event-schema/src/**/*.ts": () => [
      "pnpm run typecheck:event-schema",
      "pnpm run test:event-schema",
      "pnpm run typecheck:tinybird"
    ],
    "packages/tracking-event-schema/src/**/*.ts": () => [
      "pnpm run typecheck:tracking-event-schema",
      "pnpm run test:tracking-event-schema",
      "pnpm run typecheck:ingest",
      "pnpm run test:client"
    ],
    "packages/ingest/src/**/*.ts": () => [
      "pnpm run typecheck:ingest",
      "pnpm run test:ingest",
      "pnpm run typecheck:dashboard"
    ],
    "apps/dashboard/src/**/*.{ts,tsx}": () => [
      "pnpm run typecheck:dashboard",
      "pnpm run test:dashboard"
    ],
    "apps/tinybird/src/**/*.ts": () => [
      "pnpm run typecheck:tinybird"
    ]
  }
