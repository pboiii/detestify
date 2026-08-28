# ADR-006: Cleanup safety

**Status:** DECIDED  
**Date:** 2026-08-28

## Context

A bloated suite imposes runtime and maintenance cost, but test intent is frequently undocumented. Static similarity, coverage overlap, and model interpretation cannot establish safe deletion by themselves.

## Decision

Alpha cleanup is a read-only candidate planner with actions:

`KEEP | MERGE_CANDIDATE | DELETE_CANDIDATE | MOVE_CANDIDATE | INSUFFICIENT_EVIDENCE`

### Detectors

- exact text duplicates;
- normalized AST duplicates;
- deterministic references to removed or unreachable symbols;
- conservative framework or pass-through test patterns;
- implementation-coupled mock choreography;
- blind or oversized snapshots;
- explicit expiry records;
- slow and flaky tests reported separately from ownership redundancy.

### Evidence rule for `DELETE_CANDIDATE`

All conditions are required:

1. No declared protected obligation attaches to the candidate.
2. At least one structural redundancy signal exists.
3. At least one independent behavioral or historical signal exists: isolated removal validation, historical fault replay, executable contract preservation, or optional mutation evidence.
4. Human approval remains required.

Static-only candidates become `MERGE_CANDIDATE` or `INSUFFICIENT_EVIDENCE`.

### Benchmark versus product evidence

Seeded faults are a benchmark instrument used to evaluate Test Steward. User repositories are not presumed to contain hidden faults. A repository may supply an explicit historical-fault adapter later, but absence cannot be treated as passing evidence.

### Counterfactual validation

When trusted execution is granted, a candidate plan may prescribe an isolated worktree:

- remove or merge the candidate in the isolated worktree;
- run the selected executable contract or affected suite;
- compare required behavior and evidence;
- restore/tear down regardless of result;
- record commands, revisions, limitations, and result.

Alpha does not implement `apply-cleanup` and never auto-deletes.

### Deferred optimization

Weighted set cover is deferred until obligation-to-test mappings are trustworthy. Alpha ranks candidates and explains tradeoffs.

## Alternatives considered

- Delete exact duplicates automatically: rejected for alpha because files may differ in environment, registration, or contractual location despite identical text.
- Two static heuristics as independent evidence: rejected because correlated static signals can repeat the same error.
- Require mutation for every deletion: rejected due availability and cost.
- Repair or quarantine every flaky test as redundant: rejected; flakiness says nothing about obligation importance.

## Consequences

- Cleanup is conservative and may leave known redundancy unresolved.
- Every destructive recommendation is reviewable and reversible.
- Runtime optimization may recommend moving cadence rather than deleting ownership evidence.

## OPEN

None for alpha. Automatic application and portfolio optimization require separate owner-ratified ADRs.
