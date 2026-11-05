# Handoff: deps-e2e-eslint

## Objective

Upgrade web-analytics deps (done, on main) + root e2e suite + eslint coverage (on unmerged branches). No charter/epic/Beads.

## Progress

- main=origin/main=1b612d3: deps upgrade, tb 5.0.3, Local container, v0.1.1, .cursor removed.
- chore/eslint-alignment 6a058f4 (worktree .claude/worktrees/agent-a2db15c165950ebe5): unmerged.
- feat/e2e-tests 7f07f36 (worktree /Users/ariel/projects/web-analytics-e2e): eslint branch merged in,
  plus e2e suite and e2e lint.
- Verified at 7f07f36: lint/format/md, test:client, test:tinybird, e2e tsc pass; test:e2e 50/50 twice (~28s).
- Not pushed/merged: user has not approved.
- Blocked: none.

## Key Anchors

- `e2e/README.md` :: how setup works (tb build, tb info host, tb token ls admin token)
- `e2e/global-setup.ts` :: Tinybird Local bootstrap
- `e2e/helpers/tb-cli.ts` :: only place `tb` is spawned
- `eslint.config.js` :: root e2e eslint (client has own)
- `lint-staged.config.js` :: pipe changes now run test:e2e

## Decision Rationale

- Token via `tb token ls`, not /tokens: Local scopes resources per git branch (alternative: /tokens, wrong workspace).
- Tests concurrent per file: ingest wait=true blocks ~4s on async-insert flush; scopes unique (alternative: serial, 35s/file).
- prettier.e2e.config.js separate: client's import-order plugin fights simple-import-sort.

## Next Steps

1. Ask user, then merge via worktree (main guard blocks direct edits): eslint branch first, then feat/e2e-tests; push.
2. Remove worktrees agent-a78a36bd... (stale scaffold) and agent-a2db15c1... after merge.
3. Optional: mutation-check e2e (break a pipe, expect failures); tests for web_vitals_timeseries; e2e CI job.
4. Optional: gitignore `.docs/.cache/` (hook rewrites tracked failing-tests.json).

## Open Questions

- Pipe docs vs SQL: current.pipe says drop >60s/CLS>1; events SQL drops LCP>=30s, CLS>=1. Which is right?
- routes.pipe says asc=best; asc returns lowest score first. Fix docs or sort?
- OK that pre-commit runs test:e2e on tinybird changes?
