# Tinybird Data Project

## Project structure

Resources are defined with the [Tinybird TypeScript SDK](https://github.com/tinybirdco/tinybird-sdk-typescript).
`tinybird.json` lists the files the SDK loads.

```txt
tinybird/
├── src
│   ├── tokens.ts           # tracker and dashboard tokens
│   ├── datasources.ts      # analytics_events and materialized view targets
│   ├── pipes.ts            # internal pipes (analytics_hits)
│   ├── materializations.ts # analytics_pages / sessions / sources, tenant_*
│   ├── endpoints.ts        # analytics API endpoints
│   ├── web-vitals.ts       # web vitals endpoints
│   ├── copies.ts           # copy pipes
│   └── client.ts           # typed client
├── tests                   # legacy `tb test` fixtures (not run by the SDK flow)
├── fixtures
├── tinybird.json
└── package.json
```

## Project description

The Tinybird data project for web analytics includes datasources, endpoints, and
materializations to power analytics dashboards and APIs. The main datasource
analytics_events`, collects events from the tracker script. Endpoints provide
parsed and aggregated analytics, and materializations enable efficient querying
for dashboards.

`web_vitals` metrics are stored in `analytics_events` with `action=web_vital`.
See `web_vitals` folder for example endpoints.

## Local development

```bash
tb local start        # or: docker run -d -p 7181:7181 tinybirdco/tinybird-local:latest
export TINYBIRD_HOST=http://localhost:7181 TINYBIRD_TOKEN=placeholder
pnpm run build:tinybird -- --local   # build into a per-branch Local workspace
pnpm run typecheck:tinybird
pnpm test:e2e                        # from the repo root
```

Use `http://localhost:7181` as NEXT_PUBLIC_TINYBIRD_HOST and the workspace
admin token in the [dashboard](../dashboard/README.md).

## Cloud deployment

Validate with `pnpm run check:tinybird` (`tinybird deploy --check`), then
deploy with `tinybird deploy` or the manual "Deploy to Tinybird" workflow.
Both read `TINYBIRD_HOST` and `TINYBIRD_TOKEN`.
