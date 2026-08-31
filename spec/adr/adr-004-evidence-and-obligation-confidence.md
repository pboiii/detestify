# ADR-004: Evidence provenance and obligation confidence

**Status:** DECIDED  
**Date:** 2026-08-28

## Context

Diffs, coverage, mutation, and static structure often cannot establish which product obligation a test uniquely protects. Treating inferred intent as fact would make hard gates and cleanup unsafe.

## Decision

Every obligation candidate carries exactly one primary provenance class and may cite supporting evidence of other kinds.

### Declared

Repository policy, maintained obligation record, public schema, explicit contract, configured critical path, or supplied task acceptance criterion.

Worked examples:

1. OpenAPI marks `POST /payments` response schema and the diff changes it.
2. `.detestify/protected-tests.json` protects an authorization contract test.
3. Repository policy declares migrations must preserve downgrade compatibility.

Gate eligibility: may gate only when the declaration is concrete and an executable evidence gap is demonstrated.

### Observed

A reproduced bug, failing test, historical fault replay, or executable acceptance oracle.

Worked examples:

1. A retry reproduction duplicates a payment side effect.
2. A historical fixture demonstrates data loss during migration rollback.
3. A current contract test fails after the diff.

Gate eligibility: can request targeted remediation; destructive cleanup still requires independent evidence and approval.

### Derived

A deterministic structural fact indicates a likely obligation, such as a public route, persistence boundary, migration, queue handler, or exported schema.

Worked examples:

1. A new route is exported from the application router.
2. A database migration adds a non-null constraint.
3. A queue consumer changes acknowledgement order.

Gate eligibility: advisory by default; repository policy may explicitly elevate a matching rule.

### Inferred

A model or heuristic interprets task text, names, comments, assertions, or domain semantics.

Worked examples:

1. Function name `authorizeTransfer` suggests financial criticality without an explicit contract.
2. A test name suggests a historical regression but no record proves it.
3. A comment implies idempotency while code and policy do not establish it.

Gate eligibility: never.

### Unknown

No credible obligation can be identified.

Worked examples:

1. Generated bundle changed without generator provenance.
2. Dynamic plugin behavior cannot be resolved without executing untrusted code.
3. Test deletion candidate has no history or documented purpose.

Gate eligibility: never; return `INSUFFICIENT_EVIDENCE` where the uncertainty affects the decision.

### Gate table

| Provenance | Executable or explicit support | Default mode | Balanced mode | Strict mode |
|---|---|---|---|---|
| Declared | Required for gate | Advise | Request remediation for material gap | Request remediation for material gap |
| Observed | Reproduction/failure required | Advise | Targeted remediation | Targeted remediation |
| Derived | Structural fact only | Advise | Advise | Gate only if repository policy elevates exact rule |
| Inferred | Model/heuristic | Advise | Advise | Advise |
| Unknown | None | Advise uncertainty | Advise uncertainty | Advise uncertainty |

`deny_tool` is reserved for concrete tool-policy violations such as an explicitly forbidden attempt to disable tests or escape the trusted repository root. It is not used for semantic testing uncertainty.

## Alternatives considered

- A single confidence score: rejected because it obscures provenance and gate rights.
- Treat public symbol changes as declared obligations: rejected; public structure is mechanically derived unless a contract declares semantics.
- Let the agent convert inferred obligations into gates: rejected because the same model cannot supply independent evidence.

## Consequences

- Reports expose what is known, inferred, and missing.
- The product will sometimes decline to choose between update and new test.
- Hard gates remain narrow and auditable.

## OPEN

None for provenance semantics. Repository-specific declaration formats may expand compatibly through configuration schema versions.
