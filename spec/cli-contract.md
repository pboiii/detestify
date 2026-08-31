# Alpha CLI contract

**Status:** DECIDED
**Executable name:** `detestify`
**Output:** concise terminal text plus a versioned JSON report unless `--json=-` requests JSON on stdout.

## Common invariants

- All commands canonicalize and verify repository-contained paths before reading.
- Zero-config analysis performs no network access, dependency installation, repository-script execution, executable configuration loading, mutation, file edits, or hook creation.
- Repository commands require explicit trust in configuration or one-shot CLI consent.
- JSON is validated against `spec/schemas/report.schema.json` or the command-specific schema before emission.
- Machine-readable stdout contains JSON only. Human status goes to stderr when JSON is on stdout.
- Missing optional evidence becomes a limitation, not an inferred pass.
- All commands support `--repo <path>`, `--config <path>`, `--report <path>`, and `--json <path|->` where applicable.

## Exit codes

| Code | Name | Meaning |
|---:|---|---|
| 0 | `OK` | Command completed and no configured remediation or tool denial is required. Advice and `INSUFFICIENT_EVIDENCE` can still appear in the report. |
| 2 | `USAGE_ERROR` | CLI arguments are invalid or mutually inconsistent. |
| 3 | `CONFIG_INVALID` | Configuration exists but fails schema or safety validation. |
| 4 | `REPOSITORY_NOT_FOUND` | No Git repository can be resolved for a command that requires one. |
| 5 | `UNSUPPORTED_REPOSITORY` | The requested operation requires a supported JS/TS shape or runner that is absent. A report is written when possible. |
| 6 | `TRUST_REQUIRED` | The requested operation would execute or modify something not explicitly trusted. |
| 7 | `EXTERNAL_TOOL_UNAVAILABLE` | A requested optional tool is missing or has an unsupported version. |
| 8 | `EXTERNAL_TOOL_FAILED` | A trusted external tool ran but failed or returned invalid output. |
| 9 | `REPORT_IO_ERROR` | The command could not write or atomically replace its report. |
| 10 | `TIMEOUT` | A bounded operation exceeded its configured timeout and descendants were terminated. |
| 11 | `INTERRUPTED` | The user or host interrupted execution; partial evidence is not reported as complete. |
| 20 | `REMEDIATION_REQUIRED` | A configured eligible gate requires one concrete remediation. Hook wrappers translate the JSON decision. |
| 21 | `TOOL_DENIED` | A concrete tool-policy rule denied a proposed tool action. This is not used for semantic uncertainty. |
| 22 | `SCHEMA_CONTRACT_ERROR` | Internal output failed its own versioned schema. |
| 70 | `INTERNAL_ERROR` | Unexpected internal failure; no success claim may be emitted. |

## `plan --diff`

### Purpose

Answer whether the current diff appears to require a new persistent test, an update to existing evidence, no test edit because existing evidence is sufficient, no new test, or more information.

### Inputs

- Git worktree and resolved merge base or `--base` revision.
- Non-executable package metadata, file names, source/test topology, and TypeScript AST facts.
- Optional explicit task text or declared obligation records.

### Output

`report.schema.json` with `command: "plan --diff"` and change outcomes:

- `NO_TEST_SUPPORTED`
- `EXISTING_EVIDENCE_SUFFICIENT`
- `EXISTING_TEST_UPDATE_CANDIDATE`
- `NEW_TEST_CANDIDATE`
- `INSUFFICIENT_EVIDENCE`

### Zero-config behavior

Discovers the Git root, runner markers, changed paths, nearby tests, exports/routes/schema/migration indicators, and candidate failure boundary. It does not execute repository code.

### Allowed exit codes

`0, 2, 3, 4, 9, 11, 22, 70`.

## `verify-change`

### Purpose

Re-evaluate a completed change with trusted selected verification and produce the portable allow/advise/remediation decision used by Stop hooks.

### Inputs

- Current diff and prior report if supplied.
- Trusted runner selection and exact selected commands.
- Optional coverage or mutation evidence only when explicitly requested and available.
- Normalized hook context when invoked by a host.

### Output

`report.schema.json` with `command: "verify-change"`; host wrapper separately emits `hook-io.schema.json` decision.

### Sequencing decision

`DECIDED`: not part of the first zero-config CLI milestone. It is required before Claude or Codex Stop wrapper certification.

### Allowed exit codes

`0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 22, 70`.

## `inventory`

### Purpose

Produce a deterministic inventory of source, tests, runners, exported boundaries, schemas, snapshots, mocks, and supported capabilities.

### Inputs

Repository metadata and AST. Executable runner discovery is optional and trust-gated.

### Output

`report.schema.json` with `command: "inventory"`; evidence kinds are primarily `runner_inventory`, `ast_fact`, and `capability`.

### Allowed exit codes

`0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 70`.

## `audit`

### Purpose

Read-only portfolio analysis for duplicate, trivial, implementation-coupled, snapshot, expiry, slow, flaky, and placement candidates.

### Inputs

Inventory, Git history metadata, protected records, and optional trusted runtime evidence.

### Output

`report.schema.json` with `command: "audit"`; cleanup decisions remain advisory.

### Allowed exit codes

`0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 70`.

## `cleanup-plan`

### Purpose

Convert audit findings into a ranked, read-only cleanup plan with explicit evidence requirements and counterfactual validation instructions.

### Inputs

Audit report or fresh inventory, protected records, and optional independent behavioral/historical evidence.

### Output

- `report.schema.json` with `command: "cleanup-plan"` for shared evidence/decisions.
- `cleanup-plan.schema.json` for candidate execution detail.

### Must not

Delete, edit, stage, commit, or create an application worktree automatically. The implementation may create an isolated validation worktree only after explicit trust and only during a future trusted validation step; alpha planning itself remains read-only.

### Allowed exit codes

`0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 70`.

## `doctor`

### Purpose

Report installation, platform, Git, Node, package, schema, host, hook, trust, and optional-tool compatibility without modifying configuration.

### Inputs

Local executable environment, explicitly named repository if supplied, and host config paths in read-only mode.

### Output

`report.schema.json` with `command: "doctor"`; no change decision is required beyond an operational allow/advice record.

### Allowed exit codes

`0, 2, 3, 4, 5, 7, 9, 11, 22, 70`.

## Caller map

| Caller | Commands |
|---|---|
| Human zero-config | `plan --diff`, `doctor`, `inventory` |
| Claude/Codex `SessionStart` | `doctor` or cached capability check |
| Claude/Codex `PreToolUse` | lightweight policy guard implemented through `verify-change` submode; no repository test execution |
| Claude/Codex `Stop` and `SubagentStop` | `verify-change` |
| Pull-request deterministic suite | all six against fixtures; no paid agent |
| Human cleanup workflow | `audit`, then `cleanup-plan` |
