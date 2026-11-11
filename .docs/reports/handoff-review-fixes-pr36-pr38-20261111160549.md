# Handoff: review-fixes-pr36-pr38

## Objective

Review gate on stacked PRs #36 (feat/user-agent-key) and #38 (feat/payload-characterization). Fix findings, merge #36
then #38. Then continue the event-schema work (PR #39, feat/event-schema).

## Progress

- Worktree /Users/ariel/projects/web-analytics-moves, on feat/event-schema, tree clean. Nothing merged yet.
- Review DONE: code-reviewer, security-assessor and test-quality-reviewer all reported, and they agree.
- Blocked: nothing. GitHub API was flaky earlier, so verify PR state before retrying `gh pr merge`.

## Key Anchors

- `apps/tinybird/src/web-vitals.ts` :: lines 85-88, the CLS zero branch (MUST fix)
- `e2e/identity-proxy.e2e.test.ts` :: line 53 header, on branch feat/user-agent-key
- `acceptance/tinybird/payload-contract.acceptance.test.ts` :: exists only on branch feat/payload-characterization
- `apps/tinybird/src/pipes.ts` :: line 45, coalesce of user_agent and user-agent
- `packages/ingest/src/tracking-proxy.ts` :: line 82 reads the HTTP header user-agent

## Decision Rationale

- CLS-only zero, ceilings untouched, legacy user-agent fallback kept: user decisions. An existing test pins a zero
  timing as a measurement error.
- Two schema packages: event-schema is a leaf, tracking-event-schema may use only event-schema, apps/tinybird may
  use only event-schema.

## Next Steps

1. MUST on #38: a CLS event with a missing, null or non-numeric value is now kept as 0, because JSONExtractFloat
   returns 0. Write a RED test first (CLS variants of the missing, null and "abc" drop tests, which use LCP only).
   Fix by adding JSONHas plus a numeric JSONType check to the CLS=0 branch.
2. #36: revert e2e line 53 to the header name user-agent. A sed renamed an HTTP header, and the proxy reads it.
3. #36: add a test that user_agent wins when both keys are present and differ.
4. Both PRs: restore .docs/.cache/failing-tests.json to origin/main. Untrack it and add .docs/.cache/ to .gitignore
   (it holds absolute local paths).
5. On feat/user-agent-key: fix 2, 3 and 4, push, merge #36. Then merge main into feat/payload-characterization,
   fix 1 and 4, push, merge #38. Run acceptance locally (Tinybird Local on :7181), not in CI.
6. Then watch CI on PR #39, add payload rules to event-schema, create tracking-event-schema, add proxy rejections.

## Open Questions

- Optional suggestions: a zero twin for INP, LCP and FCP; move without/withValue into factories.ts; dedupe the
  /kept sentinel setup; the user_agent blank-bucket row also hits the legacy fallback.
- The client is public, so schema types must be bundled into it. Decide last.
- Issue #37 (routes) could take the CLS ceiling question.
