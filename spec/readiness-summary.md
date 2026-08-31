# Specification readiness summary

**Status:** implementation handoff ready, with explicit evidence gates

## Fully specified alpha behavior

The tree now defines:

- JS/TS TypeScript CLI scope and performance overturn procedure;
- six command contracts and complete exit-code model;
- testing doctrine, obligation provenance, ordinal materiality, and gate eligibility;
- normalized hook input/output and host-specific Claude/Codex package behavior;
- one-shot remediation and unsupported Codex task-complete handling;
- versioned report, evidence, decision, config, hook, and cleanup schemas;
- positive/negative/ambiguous policy goldens;
- four complete fixture repositories, hidden-oracle protocol, seeded-fault rules, and metrics;
- read-only cleanup safety and protected-evidence constraints;
- threat model, quickstart, scaffold, milestones, and exact verification commands;
- dual-host canary caps and per-host success criteria.

## Alpha definition-of-done coverage

| DoD item | Specification status |
|---|---|
| Zero-config read-only `plan --diff` | Fully specified; implementation evidence OPEN |
| Four outcomes including no-test/insufficient | Schemas, rules, fixtures, and goldens specified |
| Correct boundary on Task 03 | Fixture, hidden oracle, and expected scope specified |
| Claude bounded continuation | Contract tests plus fresh BrowserOS native receipts; no remediation loop observed |
| Codex bounded continuation | Contract tests plus fresh BrowserOS receipts from isolated plugin installs; no remediation loop observed |
| Common normalized event model | Schema, representative fixtures, and native session/tool/stop receipts observed on both hosts |
| Protected cleanup safety | Schema, Task 04, and counterexamples specified |
| Mutation/per-test evidence optional | Capability/report contracts specified |
| Deterministic PR suite | Commands and expected coverage specified |
| Two-task dual-host launch compatibility | Passed on Claude and Codex with no full-arm regression and hooks only in full arms; statistical efficacy deferred |
| Product-purpose real-repository validation | Type-only no-test behavior passed on both hosts; pagination reused the owning suite; historical replay removed one duplicate suite while retained fault detection held |
| macOS/Linux install/uninstall | Host specs and milestone checks specified; execution OPEN |

## Remaining blockers

The remaining OPEN items are release evidence rather than missing core product behavior: clean supported macOS/Linux installation, SBOM/provenance, measured TypeScript thresholds, exact packaged-host install proof, namespace/legal review, and contributor governance. Raw host payloads are not retained. The dual-host checks and one real-repository removal are complete, but one repetition does not support a statistical efficacy claim. See `spec/handoff/open-register.md`.

## Handoff determination

The ruling's vertical slice and the owner-amended dual-host extension are implementable from `spec/handoff/` plus its referenced schemas/ADRs without inventing policy, fixture content, command outcomes, or hook-loop behavior. Implementation must not claim certification until current installation, native receipt, and canary evidence closes the named OPEN items.
