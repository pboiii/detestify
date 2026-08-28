# Hidden-oracle protocol

**Status:** DECIDED  
**Purpose:** define how the four alpha tasks measure Test Steward without revealing the answer to the coding agent.

## 1. Separation model

Each fixture has three physically distinct areas:

```text
spec/handoff/fixtures/task-N/
  repo/       # materialized as the agent-visible Git repository
  changes/    # harness setup patches; never shown as guidance text
  oracle/     # withheld from the agent and excluded from repository search/context
  README.md   # fixture materialization instructions for the implementation agent
```

The benchmark runner copies only `repo/` into the agent workspace. It may apply a named setup patch from `changes/` before the session. `oracle/` is mounted only into the independent scoring process after the agent turn has ended.

The agent must not receive:

- hidden tests, fault patches, expected outcome labels, or scoring code;
- filenames that disclose the required implementation or test layer;
- golden test content;
- baseline outputs from the full-system arm;
- cleanup protection assertions except records intentionally present in the agent-visible repository.

## 2. Run identity and immutability

Every run manifest records:

```yaml
run_id: globally unique identifier
fixture_id: task-01..task-04
fixture_digest: sha256 of the complete source fixture
agent_visible_digest: sha256 of the materialized repo plus setup patch
oracle_digest: sha256 of the withheld oracle tree
host: claude|codex
host_version: exact version
arm: baseline|full
model: exact model identifier
model_settings: normalized settings object
seed: integer or null
start_revision: Git commit
started_at: RFC3339
budget_reservation: runs, wall-clock seconds, API-equivalent USD
```

The harness refuses to score a run when the source, visible, or oracle digest differs from the manifest. Fixture changes require a new fixture version and fresh baseline runs.

## 3. Oracle types

The alpha corpus uses several independent oracle classes:

1. **Behavior oracle:** executes hidden inputs against public behavior.
2. **Fault oracle:** applies one hidden non-equivalent fault at a time and determines whether the submitted test portfolio detects it.
3. **Portfolio oracle:** inspects added, removed, and modified tests and classifies unnecessary creation or churn against the task's expected obligations.
4. **Decision oracle:** validates the Test Steward report against the expected outcome, provenance constraints, target scope, and disclosed limitations.
5. **Safety oracle:** ensures protected tests remain protected and static-only cleanup evidence never becomes deletion eligibility.
6. **Hook oracle:** verifies at most one remediation continuation and a clean exit on the repeated stop event.

No single oracle is treated as complete proof. Task pass/fail uses the conjunction defined in each task YAML.

## 4. Seeded-fault execution

Seeded faults exist to test the benchmarked portfolio, not as presumed inputs to Test Steward in ordinary repositories.

For each selected fault:

1. Create a fresh worktree from the agent's final revision.
2. Apply exactly one fault patch.
3. Run the task's hidden fault command with bounded time and process-group cleanup.
4. Record `detected`, `survived`, `invalid`, or `infrastructure_error`.
5. Discard the worktree.

`invalid` faults do not enter the denominator. A fault is invalid when it does not compile, does not reach the intended mechanism, is equivalent under the hidden acceptance behavior, or changes an unrelated obligation.

## 5. Agent arms

### Baseline

The host receives the fixture prompt and normal repository context, with Test Steward skill, hooks, reports, and CLI unavailable.

### Full

The same host/model/settings receive the same fixture prompt and visible repository, with the provider-neutral skill, certified host wrapper, and full alpha CLI enabled.

The runner randomizes arm order and uses isolated sessions. Baseline and full results are reported per host before any cross-host comparison.

## 6. Scoring order

Scoring is intentionally ordered to avoid rewarding smaller but incorrect portfolios:

1. Validate repository integrity and task completion.
2. Run visible and hidden acceptance behavior.
3. Run hidden fault detection.
4. Check protected obligations and cleanup safety.
5. Evaluate Test Steward decision correctness.
6. Measure unnecessary test creation and churn.
7. Measure hook false positives and overhead.

A run that regresses a hidden obligation cannot pass merely because it writes fewer tests.

## 7. Contamination controls

- Oracle files are outside the agent workspace and absent from indexed repository context.
- Agent-visible prompts describe the engineering task, not the expected Test Steward label.
- Expected outputs specify obligation and evidence semantics rather than exact test filenames or assertions.
- Logs redact hidden patch content before being returned to the model.
- Failure messages exposed during a run are limited to public task behavior; detailed oracle failures appear only after scoring.
- Model and host caches are separated by arm and run.

## 8. Reproducibility and disputes

A benchmark result is publishable only when the run bundle contains manifests, exact revisions, host/model versions, raw Test Steward reports, diffs, command receipts, oracle outcomes, timing, budget use, and infrastructure errors.

When a hidden oracle rejects a legitimate alternative solution, mark the run `oracle_dispute`, exclude it from efficacy claims, and revise the fixture only through a versioned change with new baselines. Do not patch an oracle after seeing only one arm's outcome.
