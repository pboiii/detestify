# Skill reference-file outline

**Status:** DECIDED  
**Rule:** reference files explain concepts and examples; policy thresholds and executable decisions remain in `spec/policy/` and the CLI.

## `references/testing-doctrine.md`

- Minimum sufficient evidence principle.
- Difference between scope, purpose, technique, and cadence.
- Behavioral testing through public contracts.
- When persistent tests are warranted.
- When `NO_TEST_SUPPORTED` is appropriate.
- Test evolution across refactors, bugs, contracts, and deprecation.
- Links to ADR-003 and policy rule IDs rather than copied thresholds.

## `references/placement-examples.md`

Worked examples mapping failure mechanism to cheapest valid scope:

- pure decision logic;
- parser/property testing;
- database transaction;
- queue acknowledgement and retry;
- webhook signature and persistence;
- schema/consumer contract;
- migration/rollback;
- UI component versus browser journey;
- deployment/configuration smoke;
- latency, security, and recovery evidence.

Each example names what a narrower test would miss and what a broader test would duplicate.

## `references/obligation-provenance.md`

- Declared, observed, derived, inferred, and unknown provenance.
- Gate eligibility and why inference alone never gates.
- Examples of durable obligation records.
- How to state uncertainty without inventing product intent.
- How reports link candidates to evidence.

## `references/cleanup-safety.md`

- `KEEP`, `MERGE_CANDIDATE`, `DELETE_CANDIDATE`, `MOVE_CANDIDATE`, and `INSUFFICIENT_EVIDENCE`.
- Structural versus independent evidence.
- Protected tests, expiry records, historical faults, and counterfactual validation.
- Why flakiness, overlap, and mutation alone are insufficient.
- Human approval and read-only alpha behavior.

## `references/report-reading.md`

- Report envelope navigation.
- Reason codes, evidence records, limitations, target scope, and cleanup requirements.
- Difference between an advisory outcome and a host gate.
- Deterministic JSON handling and stale report detection.
- Operational exit-code troubleshooting.

## `references/host-behavior.md`

- Portable normalized events.
- Claude-only and Codex-only differences.
- Bounded Stop remediation.
- Host trust and plugin review.
- Why CI/direct CLI remain separate from host UX.
