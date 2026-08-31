# Specification readiness summary

**Status:** alpha implementation and product-purpose validation complete; public publication deferred

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
| Zero-config read-only `plan --diff` | Implemented and covered by the deterministic macOS/Linux suite |
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
| macOS/Linux install/uninstall | Packed CLI install/uninstall passed; Node 22.13 Linux and current macOS native checks passed; CI pins both operating systems |

## Remaining publication and post-alpha work

No open item blocks local alpha implementation or validation. Public npm publication remains deferred by owner direction. Namespace/legal review is still required before relying on the name publicly; contributor governance is required before accepting external contributions. Native Windows, Python, mutation adapters, marketplace submission, and broader real-repository sampling remain post-alpha work. Raw host payloads are not retained. The dual-host checks and one real-repository removal are directional evidence, not a statistical reduction claim. See `spec/handoff/open-register.md`.

## Handoff determination

The ruling's vertical slice and the owner-amended dual-host extension are implemented. Current installation, native receipt, historical replay, forward A/B, packaging, Linux, and performance evidence close the implementation-owned alpha items. Publication remains a separate action.
