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
| Claude bounded continuation | Hook package and contract tests specified; live proof OPEN |
| Codex bounded continuation | Hook package and contract tests specified; live proof OPEN |
| Common normalized event model | Schema and representative fixtures specified; live raw capture OPEN |
| Protected cleanup safety | Schema, Task 04, and counterexamples specified |
| Mutation/per-test evidence optional | Capability/report contracts specified |
| Deterministic PR suite | Commands and expected coverage specified |
| Per-host efficacy on 3/4 tasks | Metrics and canary manifest specified; execution OPEN |
| macOS/Linux install/uninstall | Host specs and milestone checks specified; execution OPEN |

## Remaining blockers

The remaining OPEN items are implementation or release evidence rather than missing product decisions: pinned runtime/dependency versions, live host payloads, measured TypeScript thresholds, exact host tool matchers, dual-host canary results, namespace reservation, and final contributor governance. See `spec/handoff/open-register.md`.

## Handoff determination

The ruling's vertical slice and the owner-amended dual-host extension are implementable from `spec/handoff/` plus its referenced schemas/ADRs without inventing policy, fixture content, command outcomes, or hook-loop behavior. Implementation must not claim certification until the live payload, installation, and canary evidence closes the named OPEN items.
