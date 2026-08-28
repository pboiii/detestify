# Deterministic pull-request suite

**Status:** DECIDED  
**Paid agent runs:** none

## Required checks

The implementation repository must expose these stable package scripts:

```text
npm run typecheck
npm run lint
npm run validate:spec
npm run test:schemas
npm run test:policy-goldens
npm run test:fixture-cli
npm run test:hook-normalization
npm run test:cleanup-safety
npm run test:security
```

`npm run test:pr` runs the complete list in that order and fails on the first contract violation after preserving a combined test report.

## Contract coverage

| Check | Required evidence |
|---|---|
| Schema validation | Draft 2020-12 metaschema; every schema example; every emitted test report |
| Policy goldens | Positive, negative, and ambiguous case for every policy rule |
| Four fixture CLI runs | Deterministic prepared diffs; no model invocation; expected outcome and limitations |
| Hook normalization | Raw/representative Claude and Codex fixtures normalize to the common envelope |
| Stop loop | Initial remediation can continue once; repeated stop exits |
| Cleanup safety | Protected test retained; static-only candidate not deletion-eligible; all protected checks required |
| Security | path traversal, symlink escape, command injection, oversized output, spoofed/stale hook payload, timeout cleanup |
| Optional evidence absence | reports still emit when coverage, mutation, and test execution are unavailable |

## Fixture CLI mode

Deterministic fixture tests use prepared diffs and facts supplied by the fixture harness. They do not ask a model to infer intent. Semantic-only rules must return advisory or `INSUFFICIENT_EVIDENCE` when the fixture does not provide declared or observed provenance.

## CI restrictions

- No network after dependency installation.
- No repository command execution from fixture config unless the test explicitly exercises trusted mode.
- No writing outside the CI temporary directory.
- No paid model call.
- Every child process has a timeout and process-group cleanup assertion.
- Snapshot updates are prohibited in the required check.
