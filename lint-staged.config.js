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
    "tinybird/**/*.{pipe,datasource,njjson,json,sql,yaml}":  () => [
      "pnpm run test:tinybird"
    ],
    "tinybird/**/*.{pipe,datasource}": () => [
      "pnpm run check:tinybird"
    ]
  }
