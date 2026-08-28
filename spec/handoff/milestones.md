# Alpha implementation milestones

**Status:** DECIDED sequence

## M0 — Repository scaffold and `doctor`

**Entry:** validated spec tree.  
**Governed by:** ADR-001, ADR-002, ADR-007, threat model.

Deliver:

- TypeScript package/workspace layout from `scaffold.md`;
- CLI parser and stable exit-code layer;
- schema loading/validation;
- read-only environment/platform/Git/Node checks;
- `doctor` JSON report;
- license notices and dependency lockfile.

Acceptance:

```text
npm ci
npm run typecheck
npm run lint
npm run test:schemas
npm run test:unit -- doctor
```

No repository code executes. Measure preliminary warm no-op startup on macOS and Linux; record, but do not apply the overturn gate until M3.

## M1 — Safe Git diff and repository discovery

**Entry:** M0 green.  
**Governed by:** ADR-001, threat model TM-002/TM-003/TM-015.

Deliver:

- Git root/base/head/untracked resolution;
- canonical contained paths;
- stable diff fingerprint;
- inert package/runner marker discovery;
- source/test topology without imports or config execution.

Acceptance:

```text
npm run test:unit -- repository git paths
npm run test:security -- path symlink config
npm run test:pr
```

## M2 — JS/TS analyzer and deterministic classifier

**Entry:** M1 green.  
**Governed by:** ADR-003, ADR-004, `spec/policy/rules.md`.

Deliver:

- ts-morph syntactic/type-resolved capability modes;
- public exports/routes/schema/migration/config facts;
- change classes and confidence;
- nearby-test inventory;
- explicit semantic/unsupported boundaries.

Acceptance:

```text
npm run test:unit -- analyzer classifier
npm run test:policy-goldens
npm run test:pr
```

No model call is required for deterministic tests.

## M3 — `plan --diff` report and zero-config wedge

**Entry:** M2 green.  
**Governed by:** all Package C contracts and ADR-002.

Deliver:

- obligation candidates with provenance;
- evidence records and limitations;
- ordinal materiality/gate evaluation;
- four change outcomes;
- deterministic JSON/terminal output;
- report atomic write and stale-fingerprint behavior.

Acceptance:

```text
npm run test:schemas
npm run test:policy-goldens
npm run test:fixture-cli -- plan
npm run test:security -- reports output injection
npm run test:pr
```

Measure ADR-002 thresholds on warm macOS and Linux:

- no-op p95;
- zero-config `plan --diff` p95;
- repeated deterministic JSON;
- clean `npx` execution.

Record any failed threshold as an OPEN implementation-language review item; do not silently broaden limits.

## M4 — Materialized fixtures and deterministic PR suite

**Entry:** M3 passes prepared Task 01–03 diffs.  
**Governed by:** Package D.

Deliver:

- four Git fixture repositories materialized verbatim;
- withheld oracle harness;
- seeded-fault adapter;
- all policy goldens;
- `npm run test:pr` orchestration.

Acceptance:

```text
npm run validate:spec
npm run test:fixture-cli
npm run test:cleanup-safety
npm run test:pr
```

No paid agent run.

## M5 — `verify-change` and trusted verification receipts

**Entry:** M4 green.  
**Governed by:** CLI contract, ADR-004, threat model TM-004/TM-016.

Deliver:

- explicit trust model and fixed argv runner adapters;
- affected/focused Vitest/Jest verification where supported;
- receipt and timeout/process cleanup;
- optional coverage/mutation capability negotiation;
- remediation eligibility from current evidence.

Acceptance:

```text
npm run test:unit -- trust runner receipts
npm run test:security -- command timeout process stale
npm run test:fixture-cli -- verify-change
npm run test:pr
```

`verify-change` must still report when optional evidence is absent.

## M6 — Claude certified Stop wrapper

**Entry:** M5 green and live Claude payload capture available.  
**Governed by:** ADR-005 and `hosts/claude-hook-package.md`.

Deliver:

- plugin manifest and hooks;
- raw payload redaction/storage;
- normalized events;
- event-specific output translation;
- atomic one-shot remediation state;
- install/trust/uninstall/doctor flow.

Acceptance:

```text
npm run test:hook-normalization -- claude
npm run test:hook-contracts -- claude
npm run test:security -- hook loop payload
npm run test:pr
```

Prove initial Stop requests at most one continuation and repeated Stop exits without a loop.

## M7 — Codex certified Stop wrapper

**Entry:** M5 green and live Codex CLI/desktop payload captures available.  
**Governed by:** ADR-005 and `hosts/codex-hook-package.md`.

Deliver:

- `.codex-plugin` manifest and hook package;
- plugin trust-hash workflow;
- raw/normalized fixtures;
- event-specific output translation;
- one-shot Stop and SubagentStop behavior;
- explicit unsupported `task_complete` capability;
- CLI and desktop install/uninstall/doctor proof.

Acceptance:

```text
npm run test:hook-normalization -- codex
npm run test:hook-contracts -- codex
npm run test:security -- hook trust loop payload
npm run test:pr
```

Prove initial Stop requests at most one continuation and repeated Stop exits without a loop.

## M8 — `inventory`, `audit`, and `cleanup-plan`

**Entry:** M4 green; M5 receipts available for optional trusted evidence.  
**Governed by:** ADR-006 and cleanup schemas.

Deliver:

- complete supported inventory;
- exact/AST duplicate, orphan, trivial, mock, snapshot, expiry, placement, slow/flake candidate detectors;
- protected record parsing;
- structural versus independent evidence separation;
- ranked read-only cleanup plan;
- no destructive command.

Acceptance:

```text
npm run test:fixture-cli -- inventory audit cleanup-plan
npm run test:cleanup-safety
npm run test:security -- cleanup paths
npm run test:pr
```

Task 04 protected evidence and static-only counterexamples must pass.

## M9 — Dual-host canary and alpha release evidence

**Entry:** M0–M8 green; canary budgets reserved.  
**Governed by:** canary manifest, alpha DoD, ADR-002.

Deliver:

- baseline/full runs on Claude and Codex;
- per-host metrics and limitations;
- budget receipts;
- final TypeScript threshold measurements;
- macOS/Linux clean install/uninstall;
- SBOM/provenance/release notes.

Acceptance:

```text
npm run test:pr
npm run benchmark:canary -- --host claude
npm run benchmark:canary -- --host codex
```

For each host: no hidden-fault regression and reduced unnecessary creation/churn on at least three of four tasks. Both bounded Stop proofs pass. Public alpha claims exclude native Windows and any untested host version.
