# Review: conversions endpoint (PR #30)

Mode: branch (merge-base main..HEAD), scope diff (risk low, no sensitive paths), Pass 1 only.
Range: 78181ce..HEAD, 3 files (endpoints.ts, client.ts, conversions.acceptance.test.ts).

| Seat                  | Backend | Result                                             |
| --------------------- | ------- | -------------------------------------------------- |
| security-assessor     | Claude  | Fix 0, Suggestions 2, semgrep p/default 0 findings |
| test-quality-reviewer | Codex   | Fix 2 (AUTO-FIX), none else                        |
| code-reviewer         | Codex   | Fix 0, Suggestions 0, 3 observations               |

Overlap between seats: none.
One earlier Codex dispatch produced empty output (shell mistake).
It was discarded and re-run, not read as clean.

## Findings and disposition

| ID  | Agent                              | Finding                                                                                                                  | Disposition                                                                                                                     |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| F1  | test-quality-reviewer              | Carry-forward test had one campaign, could not distinguish first-touch from later or last-touch                          | Fixed: competing earlier and later campaigns, asserts Email credited                                                            |
| F2  | test-quality-reviewer              | Zero conversion rate not asserted for non-converting channels                                                            | Fixed: rate asserted for Paid, Email, Direct                                                                                    |
| S1  | security-assessor                  | Before conversions is added to the dashboard proxy allowlist, add a test that a pinned tenant ignores a caller tenant_id | Open, carried to the dashboard wiring PR                                                                                        |
| S2  | security-assessor (low confidence) | decodeURLComponent computed twice per hit; date range unbounded                                                          | Rejected as false positive by review-finding-verifier: identical expressions are merged, date range is the shared channels node |

## Checks

- tinybird deploy --check from the branch: passed (not deployed).
- Acceptance: conversions 13 tests, channels 36 tests pass against Tinybird Local.

## Limits

- Pass 2 skipped by design at diff scope. DCHK results not pre-collected; security seat self-collected semgrep only.
- Codex seats saw the diff only, not the repository.
