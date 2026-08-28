---
name: test-steward
description: Decide whether a code change needs a new test, an update to existing evidence, no persistent test, or more information; verify completed changes; and produce conservative legacy-test cleanup plans through the Test Steward CLI.
---

# Test Steward

Use this skill when editing code or tests, planning verification for a diff, reviewing an agent-authored test change, or auditing a test portfolio.

The CLI is authoritative for repository facts, policy outcomes, schemas, and reports. This skill coordinates the workflow; it does not recreate the policy engine in prose.

## Required operating principles

- Protect repository-owned behavior and obligations, not raw test count or coverage.
- Search for existing evidence before proposing another test.
- Choose the cheapest scope that can trigger the real failure and observe the relevant contract.
- Treat `NO_TEST_SUPPORTED` and `INSUFFICIENT_EVIDENCE` as legitimate outcomes.
- Separate observed facts, declared obligations, deterministic derivations, model inference, and unknowns.
- Never turn model-only inference into a hard gate or destructive cleanup recommendation.
- Never claim that similar coverage, similar names, or similar embeddings prove two tests own the same obligation.
- Preserve protected tests and explicit compatibility obligations.
- Keep cleanup read-only in alpha.

## Workflow

### 1. Establish repository state

Run the read-only first pass:

```text
npx test-steward plan --diff --json=-
```

Read the complete JSON report. Do not infer success from the terminal summary alone.

When the command returns an operational failure, report the exact exit category and limitation before taking another action.

### 2. Read the change decision

Handle the four change outcomes as follows:

- `NO_TEST_SUPPORTED`: do not create a test merely because a file changed. Preserve or run relevant existing evidence when appropriate.
- `EXISTING_TEST_UPDATE_CANDIDATE`: inspect the named existing test and obligation. Update it only if intended behavior changed or the existing evidence no longer exercises the obligation.
- `NEW_TEST_CANDIDATE`: inspect the proposed failure class and target scope. Add the smallest evidence that detects that distinct mechanism.
- `INSUFFICIENT_EVIDENCE`: gather the specific missing fact or remain advisory. Do not convert uncertainty into a test-writing reflex.

Always preserve the report's limitations in your reasoning.

### 3. Inspect existing evidence before writing

Use repository search and the report's nearby-test inventory to determine whether an existing test already detects the failure class.

Prefer, in order:

1. no persistent test when no meaningful obligation changed;
2. existing test unchanged when it already detects the failure;
3. update or parameterize an existing test;
4. one new focused test;
5. multiple tests only when they detect distinct mechanisms, boundaries, or obligations.

### 4. Confirm the failure boundary

Before writing a test, state:

- the obligation or behavior;
- its provenance;
- the failure mechanism;
- where the failure can occur;
- the observable contract;
- why a cheaper scope cannot detect it;
- what existing evidence overlaps.

If these cannot be stated credibly, seek more evidence or use `INSUFFICIENT_EVIDENCE`.

### 5. Implement the smallest defensible evidence

Follow repository conventions. Prefer behavior and state assertions over private call order. Use real boundary implementations when wiring or state semantics are the risk; use mocks for controlled fault injection or rare states, not as proof that wiring works.

Do not create a family of neighboring examples when one property, parameterized case set, or focused regression captures the distinct partitions more clearly.

### 6. Verify the change

After implementation, run:

```text
npx test-steward verify-change --json=-
```

Repository test commands are trust-gated. Follow the report's selected verification and exact limitations. Missing optional coverage or mutation evidence is not a failure by itself.

### 7. Respond to remediation once

When a certified host Stop hook requests remediation:

1. read the report path and bounded remediation;
2. perform only the concrete requested check or correction;
3. rerun `verify-change` if instructed;
4. do not trigger or request a second continuation when the loop guard shows remediation already occurred.

### 8. Review tests changed by the task

For every added or materially edited test, confirm:

- it protects a named obligation or distinct failure mechanism;
- it sits at the correct scope;
- it does not merely restate framework, type-system, or private implementation behavior;
- it is not redundant with retained evidence;
- its setup and oracle are understandable;
- it does not hide failure through skip, blanket snapshot update, weak assertion, or swallowed error.

### 9. Audit legacy suites explicitly

Do not start cleanup merely because a task touched a test file. When cleanup is requested, run:

```text
npx test-steward audit --json=-
npx test-steward cleanup-plan --json=-
```

Treat outputs as candidates:

- `KEEP`: preserve the evidence.
- `MERGE_CANDIDATE`: investigate overlap; static evidence does not authorize deletion.
- `DELETE_CANDIDATE`: verify structural and independent evidence, protected checks, and human approval requirement.
- `MOVE_CANDIDATE`: preserve the obligation while changing scope or cadence.
- `INSUFFICIENT_EVIDENCE`: leave the test unchanged or gather the stated evidence.

The alpha never applies cleanup automatically.

### 10. Report the result

At completion, summarize:

```text
Change decision:
Obligation and provenance:
Failure class and scope:
Tests added/updated/retained:
Verification executed:
Remaining limitations:
Test Steward report path:
```

Do not claim a report proved facts it explicitly marks unavailable.

## Explicit rejections

Do not:

- target a fixed test count;
- use coverage percentage as a quality target;
- add a test for every edited file or branch;
- test uncustomized framework or dependency behavior;
- freeze private methods, internal call order, trivial accessors, or compiler guarantees;
- duplicate the same mechanism at unit, integration, and end-to-end scopes without a distinct reason;
- regenerate broad snapshots without a named reviewed contract;
- enumerate speculative edge cases without plausible exposure or consequence;
- replace real boundary evidence with mocks solely because mocks are easier;
- remove a test based only on static similarity, coverage overlap, mutation uniqueness, flakiness, or model judgment;
- weaken CI, skip tests, swallow failures, or alter thresholds to make verification pass;
- run untrusted repository commands, install dependencies, use the network, or edit files through zero-config analysis;
- claim Chat or Work conversations execute Codex hooks; certification applies to the Codex workflow and CLI;
- request a second Stop continuation after the bounded remediation attempt.

## Host notes

Claude and Codex wrappers normalize their current host events into the same core envelope. Event support is not identical. The core must tolerate absent host events and must not invent `task_complete` for Codex production execution.

Detailed host translation belongs in the certified package specifications, not in this skill.

## References

- `references/testing-doctrine.md`
- `references/placement-examples.md`
- `references/obligation-provenance.md`
- `references/cleanup-safety.md`
- `references/report-reading.md`
- `references/host-behavior.md`
