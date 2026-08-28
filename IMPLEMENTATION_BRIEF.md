# Test Steward alpha implementation brief

## 1. Role

Implement the Test Steward alpha exactly from this specification tree. Do not redesign the product, broaden scope, or infer missing host/policy behavior.

## 2. Authority

Within this repository, use this order:

1. owner amendments captured in the execution brief and reflected by this spec tree;
2. owner ruling decisions;
3. this validated specification tree;
4. the original research/implementation plan as background only.

When two spec files conflict, stop the affected milestone, add a minimal reproducible entry to `spec/conflicts.md`, and follow the higher-authority ADR or schema. Do not silently choose.

## 3. Alpha goal

Deliver a local-first TypeScript CLI and live Claude/Codex command-hook wrappers that:

- analyze a JS/TS Git diff without executing repository code;
- return `NO_TEST_SUPPORTED`, `EXISTING_TEST_UPDATE_CANDIDATE`, `NEW_TEST_CANDIDATE`, or `INSUFFICIENT_EVIDENCE` with explicit provenance and limitations;
- identify the likely failure boundary and smallest valid test scope;
- verify a completed trusted change through one shared core;
- request at most one bounded remediation continuation per Claude/Codex stop flow;
- inventory/audit tests and produce conservative read-only cleanup candidates;
- operate when mutation and per-test coverage are absent;
- pass the deterministic four-fixture suite and dual-host bounded canary.

## 4. Non-negotiable constraints

- TypeScript and JS/TS first.
- macOS and Linux only for alpha claims.
- Direct CLI is the primary surface.
- Claude and Codex are both live certified hosts.
- No separate ChatGPT-specific implementation surface.
- Exactly six commands: `plan --diff`, `verify-change`, `inventory`, `audit`, `cleanup-plan`, `doctor`.
- No `apply-cleanup` command.
- No automatic test deletion.
- Zero-config performs no repository script, dependency installation, mutation, file edit, hook creation, executable config, source upload, telemetry, or network call.
- Model-inferred and unknown obligations never gate.
- Static-only cleanup evidence never yields deletion eligibility.
- Missing optional tools become limitations.
- Host output semantics are translated per event; never implement a generic cross-host block shape.
- Codex production adapter does not emit `task_complete`.

## 5. Required reading before code

1. `spec/adr/adr-001-alpha-scope.md`
2. `spec/adr/adr-002-implementation-language.md`
3. `spec/adr/adr-003-testing-doctrine.md`
4. `spec/adr/adr-004-evidence-and-obligation-confidence.md`
5. `spec/adr/adr-005-hook-architecture.md`
6. `spec/adr/adr-006-cleanup-safety.md`
7. `spec/adr/adr-007-licensing-and-reuse.md`
8. `spec/schemas/*.schema.json`
9. `spec/cli-contract.md`
10. `spec/policy/rules.md` and `materiality-tables.md`
11. `spec/benchmark/`
12. `spec/hosts/`
13. `spec/threat-model.md`
14. `spec/handoff/milestones.md`

## 6. Architecture boundaries

Implement these layers:

```text
CLI parsing and presentation
  -> repository-safe discovery and Git diff
  -> JS/TS analyzer and test inventory
  -> obligation/evidence records
  -> deterministic/heuristic policy engine
  -> versioned reports
  -> verification and optional evidence adapters
  -> read-only cleanup planner
  -> host-neutral hook core
  -> Claude/Codex translators
```

The provider-neutral skill invokes this CLI; it is not a second policy engine.

Host adapters own raw payload parsing and host output. Core policy code imports no Claude/Codex wire types. External tools are isolated adapters with capability negotiation and timeouts.

## 7. Milestone verification commands

Create these scripts in the implementation package and keep them stable:

```text
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run validate:spec
npm run test:schemas
npm run test:unit
npm run test:policy-goldens
npm run test:fixture-cli
npm run test:hook-normalization
npm run test:hook-contracts
npm run test:cleanup-safety
npm run test:security
npm run test:pr
npm run benchmark:canary -- --host claude
npm run benchmark:canary -- --host codex
```

Every milestone runs `npm run test:pr` once its underlying scripts exist. Host milestones also run their exact hook-contract suite. The release milestone runs both bounded canaries and publishes per-host results.

## 8. Milestone gates

Follow `spec/handoff/milestones.md` in order. A milestone is done only when:

- its schema outputs validate;
- fixture and golden acceptance passes;
- threat-model tests assigned to it pass;
- limitations are explicit;
- no deferred capability is claimed;
- changed public contracts are reflected in specs or a versioned conflict resolution.

## 9. TypeScript overturn measurements

Measure ADR-002 thresholds at the designated milestones on documented warm macOS and Linux environments:

- p95 no-op startup;
- p95 zero-config `plan --diff` without tests;
- deterministic JSON after timing fields are excluded;
- clean `npx` install/execute;
- child-process termination and descendant cleanup.

A failed threshold creates a focused ADR proposal. Do not rewrite in Rust automatically.

## 10. Evidence and gating

Implement the gate-eligibility table literally. Do not derive mandatory remediation from a score. The materiality tables are ordinal and the report preserves every axis.

Before a host requests remediation, revalidate the diff fingerprint and required evidence. At most one concrete remediation is allowed. Any ambiguity degrades to advice.

## 11. Cleanup

Implement detection and candidate ranking, not destructive application. `DELETE_CANDIDATE` requires:

- structural signal;
- independent behavioral/historical signal;
- every protected check passing;
- human approval required;
- limitations retained.

Coverage overlap, similarity, mutation uniqueness, expiry date, or flakiness alone is insufficient.

## 12. Fixtures and goldens

Materialize `spec/handoff/fixtures/task-01` through `task-04` verbatim. The agent-visible repo excludes each `oracle/` subtree. Use `spec/benchmark/oracle-protocol.md` for harness isolation.

Each input/expected pair in `spec/handoff/policy-goldens/` is a contract test. Expected decision JSON must continue to validate against `decision.schema.json`.

## 13. Security

Treat all repository and host payload content as untrusted. No shell interpolation. Canonicalize/contain paths after symlink resolution. Bind reports to revision/diff digest. Redact before model-visible output. Enforce output/timeout limits and terminate descendants.

Implement the tests mapped in `spec/threat-model.md`; do not mark a threat mitigated on design intent alone.

## 14. Completion report

At the end, report:

- implemented milestones and commits;
- exact verification commands/results;
- schema/fixture/golden counts;
- measured TypeScript thresholds;
- Claude and Codex certification results;
- per-host canary outcomes and budget use;
- unresolved OPEN items;
- unsupported environments/features;
- license/SBOM/provenance status.
