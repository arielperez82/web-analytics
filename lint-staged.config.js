export default {
    "*.md": [
      "pnpm run lint:format:fix '*.md'",
      "pnpm run lint:md:fix"
    ],
    "client/src/**/*.{js,ts}": () => [
      "pnpm run lint:format:src:fix",
      "pnpm run lint:code:src:fix"
    ],
    "tinybird/**/*.{pipe,datasource,njjson,json,sql,yaml}":  () => [
      "pnpm run test:tinybird"
    ],
    "tinybird/**/*.{pipe,datasource}": () => [
      "pnpm run check:tinybird"
    ]
  }