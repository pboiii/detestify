# Test Steward owner ruling and revised pre-implementation brief

**Date:** August 28, 2026  
**Status:** Owner-ratified revision  
**Applies to:** `test-steward-research-and-implementation-plan.md` and `chatgpt-pro-preimplementation-brief.md`

## 1. Executive ruling

The original plan remains the architectural thesis, but it is not yet a build-ready implementation specification. Claude's review correctly identifies several missing contracts and an oversized release matrix. It is not accepted verbatim.

The revised direction is:

1. Keep the evidence spine: a provider-neutral policy model, deterministic CLI, normalized hook contract, conservative cleanup planner, and measurable hidden-oracle evaluation.
2. Narrow the alpha matrix: one language ecosystem, one certified host adapter, macOS and Linux only, four canonical benchmark tasks, and advisory cleanup only.
3. Make mutation, per-test coverage, and kill matrices optional evidence from the first release.
4. Treat inferred obligations as hypotheses. Only explicit obligations, executable contracts, observed failures, or repository policy can support a hard gate.
5. Ship a useful zero-config `plan --diff` command before building the full research and packaging program.

The first alpha is a read-only test-portfolio adviser with one host remediation loop. It is not an autonomous test deleter, a universal multi-language engine, or a statistics platform.

## 2. Decisions on Claude's concerns

| Concern | Disposition | Owner decision |
|---|---|---|
| C1 Scope | Accept diagnosis, reject the numeric estimate as a planning fact | The scope is too large for v0.1. The stated 2.4 to 3.8 person-year estimate has no attached calibrated work breakdown, so it is a warning rather than a forecast. Alpha narrows the matrix while retaining the evidence spine. |
| C2 Rust choice | Accept | Rust was selected too early. The language decision must follow the first ecosystem and adoption path. TypeScript is also a first-class option and was incorrectly omitted from Claude's proposed Rust, Go, or Python matrix. |
| C3 Host API volatility | Accept as a compatibility risk, not as proof the plan is currently wrong | The volatile claims were spot-checked against current official documentation and are substantially correct as of August 28, 2026. They must live in versioned host adapters and captured fixtures, not in the invariant core architecture. |
| C4 Utility formula | Accept | Remove the multiplicative formula from executable policy. Replace it with ordinal materiality, evidence-strength, and confidence decision tables. The conceptual idea may remain explanatory only. |
| C5 Kill-matrix dependence | Accept | Per-test coverage and mutation kill relationships are optional enrichments. Core planning and cleanup candidate generation must work without them. |
| C6 Python mutation tooling | Reject the maintenance premise, accept the suitability question | Python mutation tooling is not presently dormant: mutmut 3.7.0 was released July 31, 2026, and Cosmic Ray 8.7.0 on August 9, 2026. Their performance, output contracts, and usefulness still require evaluation. Fresh maintenance does not prove suitability. |
| C7 Benchmark cost | Accept | Set explicit run, token, wall-clock, and dollar-equivalent caps. Do not build twelve fully populated task families before the alpha architecture is validated. |
| C8 Naming | Accept as release hygiene, reject as an architecture blocker | Keep `Test Steward` as the working name. Run availability and collision checks immediately before public package and repository publication, then lock the public name once. |
| C9 Adoption wedge | Accept | The product must provide a zero-config, read-only first run. It must not execute arbitrary repository commands or expensive mutation tooling without trust and consent. |
| C10 Hook I/O contract | Accept with modification | Define a stable host-neutral event and decision schema. Preserve raw host payloads as versioned fixtures. Host adapters map normalized decisions to each host's current semantics. Do not make the core schema a union of Claude and Codex implementation details. |
| C11 Windows | Accept | Windows is deferred from alpha. Do not claim support through WSL as equivalent to native Windows support. |
| C12 Borrowed policy language | Accept the audit requirement, reject overstatement | Independently author the policy. Generic lifecycle verbs such as `KEEP`, `ADD`, and `DELETE` do not justify architectural dependency on another project. Any copied prose, scripts, schemas, or code require source-level license review and attribution. |
| C13 Obligation identifiability | Accept as the central epistemic risk | Rename automatic outputs to obligation candidates unless grounded in explicit repository evidence. Low-confidence or model-derived obligations are advisory only and can never trigger destructive cleanup or a hard completion gate. |

## 3. Architecture invariants

These remain non-negotiable:

- The goal is the smallest defensible test portfolio, not the smallest test count.
- `NO_TEST` is a first-class, explainable decision.
- The correct test scope is the cheapest scope that can trigger the failure mechanism and observe the protected contract.
- Coverage, mutation score, test count, semantic similarity, and model judgment are never standalone gates.
- Test ownership and test execution selection remain separate concerns.
- Local hooks improve behavior but CI is the eventual non-bypassable enforcement boundary.
- Cleanup is a separate workflow from ordinary code editing.
- Destructive actions require stronger evidence than creation advice.
- Every limitation is surfaced. Missing evidence never becomes an inferred pass.

## 4. Alpha product scope

### 4.1 Ecosystem and implementation language

**Owner default:** JavaScript and TypeScript first, with a TypeScript CLI and analyzers.

Reasons:

- The zero-config adoption wedge can be delivered through `npx`.
- Native AST and package-graph tooling avoids reimplementing TypeScript semantics through a generic parser.
- StrykerJS currently exposes per-test coverage analysis, incremental mode, targeted mutation ranges, and machine-readable reports.
- The alpha can prove the evidence architecture without first solving cross-language parsing and packaging.

Rust is deferred, not rejected. A compiled launcher or later Rust core is justified only if measured startup, process control, binary distribution, or memory behavior makes the TypeScript implementation inadequate.

**Overturn threshold:** before implementation moves beyond the CLI skeleton, the TypeScript prototype must demonstrate all of the following on the alpha fixtures:

- p95 no-op startup below 500 ms on a warm local machine;
- p95 `plan --diff` below 2 seconds without running tests;
- deterministic JSON output across repeated runs;
- install and execution through a clean `npx` path;
- safe child-process termination on macOS and Linux.

Failure of those thresholds triggers a focused launcher or core-language ADR. It does not trigger an automatic rewrite in Rust.

### 4.2 Host support

- **Primary product surface:** direct CLI.
- **Certified alpha host:** Claude Code command hooks.
- **Compatibility contract:** host-neutral hook schemas plus captured Codex payload fixtures.
- **Deferred certification:** live Codex wrapper and Codex agent benchmark matrix.
- **ChatGPT:** provider-neutral skill and advisory reasoning only. Hooks are not a ChatGPT enforcement mechanism.

Claude is selected for the first certified wrapper because its current lifecycle and plugin packaging provide enough events to validate session setup, tool observation, task completion, and bounded stop remediation. The core must not depend on Claude-only events such as `TaskCompleted` or `FileChanged`.

### 4.3 Alpha commands

Ship only:

```text
plan --diff
verify-change
inventory
audit
cleanup-plan
doctor
```

Do not ship `apply-cleanup` in alpha. Cleanup output is a plan with evidence, uncertainty, and validation instructions.

### 4.4 Zero-config first run

A first run on an unconfigured repository must:

1. Discover the Git root and current diff.
2. Detect the supported test runner and repository shape without modifying files.
3. Classify the change using deterministic signals.
4. Inventory nearby existing tests.
5. Return one of:
   - `NO_TEST_SUPPORTED`
   - `EXISTING_TEST_UPDATE_CANDIDATE`
   - `NEW_TEST_CANDIDATE`
   - `INSUFFICIENT_EVIDENCE`
6. Recommend the likely scope and failure class.
7. List the evidence used and every limitation.
8. Write a detailed JSON report and print a concise terminal summary.

It must not, without explicit trust:

- run repository scripts;
- install dependencies;
- invoke mutation tools;
- alter tests or configuration;
- create hooks;
- send source code or telemetry over the network.

The first-run value proposition is a clear answer to: "Does this diff appear to need a new persistent test, and where would that test belong?"

## 5. Obligation model and gate policy

### 5.1 Evidence classes

Obligation candidates carry provenance:

1. **Declared:** repository policy, schema, public contract, critical-path configuration, or durable obligation record.
2. **Observed:** failing test, reproduced bug, historical fault, or executable acceptance oracle.
3. **Derived:** deterministic structure such as changed route, migration, persistence boundary, or public symbol.
4. **Inferred:** model interpretation of task text, names, assertions, or domain semantics.
5. **Unknown:** the engine cannot identify a credible obligation.

### 5.2 Gate eligibility

- Declared plus executable evidence may support a hard gate in configured strict mode.
- Observed evidence may support a targeted remediation gate.
- Derived evidence is advisory by default and can gate only when repository policy explicitly elevates the matching rule.
- Inferred and unknown evidence never gate.
- Default open-source mode is advisory.

### 5.3 Risk rubric

Do not calculate pseudo-precise risk scores. Use decision tables across:

- consequence: negligible, degraded, irreversible, regulated or safety-critical;
- exposure: internal, user-facing, cross-system, adversarial;
- change mechanism: no behavior, pure behavior, boundary, stateful or irreversible;
- evidence gap: none, partial, material, unknown;
- confidence: explicit, observed, derived, inferred, unknown.

The output is a materiality tier and allowed action, not a scalar utility value.

## 6. Hook contract

Create two layers.

### 6.1 Raw host fixtures

Store captured, versioned payloads for every supported event. They are compatibility test data, not the domain model.

### 6.2 Normalized core envelope

Minimum normalized input:

```json
{
  "schema_version": "1.0",
  "host": "claude|codex|direct|ci",
  "host_version": "string|null",
  "event": "session_start|before_tool|after_tool|task_complete|subagent_stop|turn_stop|session_end",
  "session_id": "string|null",
  "turn_id": "string|null",
  "cwd": "absolute path",
  "repo_root": "absolute path|null",
  "tool": {"name": "string|null", "input_ref": "string|null", "result_ref": "string|null"},
  "loop_guard": {"already_remediated": false, "attempt": 0},
  "raw_payload_ref": "string|null"
}
```

Minimum normalized decision:

```json
{
  "schema_version": "1.0",
  "action": "allow|advise|request_remediation|deny_tool",
  "confidence": "high|medium|low|unknown",
  "reason_code": "stable machine code",
  "summary": "short human-readable summary",
  "remediation": "bounded actionable instruction|null",
  "report_path": "path|null",
  "limitations": [],
  "loop_guard": {"next_attempt": 1, "max_attempts": 2}
}
```

The host adapter translates `request_remediation` into the current host-specific continuation shape. It must never infer that `block` means the same thing across all events and hosts.

Model-visible output is capped at 6,000 UTF-8 bytes by default, with remediation text capped at 1,500 characters. Detailed evidence is written to the report file.

## 7. Cleanup alpha

### 7.1 What alpha cleanup does

- Detect exact text and AST duplicates.
- Detect tests for removed or unreachable symbols where the relationship is deterministic.
- Detect obvious framework behavior and trivial pass-through tests through conservative rules.
- Detect implementation-coupled mock choreography.
- Detect blind or oversized snapshots.
- Detect expired tests only when an explicit expiry marker or version policy exists.
- Report slow and flaky tests separately from ownership redundancy.
- Rank `KEEP`, `MERGE_CANDIDATE`, `DELETE_CANDIDATE`, `MOVE_CANDIDATE`, and `INSUFFICIENT_EVIDENCE`.

### 7.2 What alpha cleanup does not do

- It does not auto-delete tests.
- It does not claim that same coverage means same obligation.
- It does not require a mutation kill matrix.
- It does not treat two static heuristics as sufficient proof of safe deletion.
- It does not assume hidden seeded faults exist in a user's repository.

### 7.3 Evidence rule

A production repository candidate can be marked `DELETE_CANDIDATE` only when:

1. no declared protected obligation is attached;
2. at least one structural redundancy signal exists;
3. at least one independent behavioral or historical signal exists, such as isolated removal validation, historical fault replay, executable contract preservation, or optional mutation evidence;
4. the candidate is still presented for human approval.

When only static signals exist, output `MERGE_CANDIDATE` or `INSUFFICIENT_EVIDENCE`, never deletion eligibility.

Seeded faults are used in our benchmark fixtures to test whether the planner is safe. They are not a presumed product input. A future adapter may consume repository-supplied fault-replay suites.

A weighted set-cover optimizer is deferred. Alpha uses an explainable ranked candidate planner. Optimization becomes worthwhile only after the obligation graph is shown to be identifiable and useful.

## 8. Benchmark program

### 8.1 Alpha corpus

Build four canonical fixture tasks:

1. Documentation-only change that should produce `NO_TEST`.
2. Behavior-preserving refactor that should not create test churn.
3. Material boundary bug that requires a test at the real boundary.
4. Legacy cleanup fixture containing exact duplicates, plausible redundancy, and a protected test.

Each fixture contains hidden acceptance checks and seeded faults where applicable. Expected output is an obligation and evidence decision, not a golden test file.

### 8.2 Evaluation tiers

**Per pull request, deterministic only**

- schema and contract validation;
- policy golden cases;
- four fixture CLI runs;
- hook payload normalization tests;
- cleanup safety counterexamples.

No paid agent runs are required on every pull request.

**Nightly or release-candidate agent canary**

- four tasks;
- baseline and full-system arms only;
- up to three repetitions;
- maximum 24 agent runs;
- maximum 12 wall-clock hours;
- maximum $250 API-equivalent spend per candidate release.

**Full evaluation, deferred**

- twelve task families;
- skill-only and hook-only ablations;
- both Claude and Codex;
- statistical repetition and transformation variants.

The full matrix starts only after alpha demonstrates useful effect sizes on the four canonical tasks.

## 9. Revised pre-implementation work packages

Do not execute Claude's nine tasks verbatim. Replace them with five coherent packages committed into one specification tree.

### Package A: Volatile interfaces and reuse verification

Deliver:

- current Claude and Codex hook compatibility matrix;
- normalized event mapping;
- focused tool and license dossier for StrykerJS, Vitest, Jest, the selected AST stack, and directly reused skills;
- a short Python mutation appendix for future scope;
- conflict log.

Do not research PIT, Infection, Dextool, or every future adapter before alpha implementation.

### Package B: Architecture freeze

Deliver:

- alpha scope ADR;
- implementation-language ADR with TypeScript default and overturn thresholds;
- testing doctrine ADR;
- evidence hierarchy and obligation-confidence ADR;
- hook architecture ADR;
- cleanup safety ADR;
- licensing and reuse ADR;
- threat model outline.

Naming can run in parallel and must finish before public publication, not before CLI prototyping.

### Package C: Machine contracts and policy

Deliver only the alpha schemas:

- config;
- obligation candidate;
- decision;
- evidence and limitations;
- report envelope;
- normalized hook input and output;
- cleanup candidate plan.

Also deliver:

- command contracts for the six alpha commands;
- complete exit-code table;
- valid examples;
- schema validation results;
- deterministic, heuristic, semantic, and non-automatable classification for every policy rule;
- ordinal materiality and gate tables.

Do not schema commands that are deferred from alpha.

### Package D: Four-fixture benchmark

Deliver:

- hidden-oracle protocol;
- four task specifications;
- seeded-fault rules;
- metrics definitions;
- deterministic PR suite;
- bounded agent canary manifest.

The twelve-family corpus belongs to the full-evaluation backlog.

### Package E: Skill and host package draft

After Packages B and C stabilize, deliver:

- provider-neutral `SKILL.md`;
- reference outlines;
- Claude command-hook package;
- captured Codex compatibility fixtures;
- final threat model;
- adoption quickstart.

The skill must consume the CLI contract rather than reimplement policy in prose.

## 10. Process corrections to Claude's brief

The following instructions are rejected:

- **One ZIP per task.** Keep normal repository files and produce one milestone archive only when needed. Per-task ZIPs create duplication and stale copies.
- **Label every claim VERIFIED, CHANGED, or UNVERIFIED.** Use those labels in external-fact verification tables. Normative architecture decisions should be labeled `DECIDED`, `OPEN`, or `DEFERRED` instead.
- **Twelve task specifications before alpha.** Four are sufficient to validate the vertical slice.
- **At least three seeded faults for every task.** Fault quantity follows the distinct failure mechanisms in each fixture.
- **A full inventory of future-language tools before implementation.** Research only what can change an alpha decision.
- **Python as the mandated artifact-writing mechanism.** Artifact validity matters; the authoring tool does not.

## 11. Alpha definition of done

Alpha is complete only when:

1. `plan --diff` runs read-only and zero-config on a supported JS or TS repository.
2. It correctly distinguishes the four canonical task outcomes, including `NO_TEST` and insufficient evidence.
3. Its recommendation identifies the correct failure boundary on the boundary-bug fixture.
4. The Claude stop adapter can request one bounded remediation and then exit without a loop.
5. Raw Claude and Codex payload fixtures normalize into the same core event model.
6. Cleanup planning retains every protected fixture test and never marks a static-only candidate deletion-eligible.
7. Mutation and per-test coverage can be absent without preventing a report.
8. The deterministic PR suite passes without an LLM.
9. The bounded agent canary shows no hidden-fault regression and less unnecessary test creation or churn than baseline on at least three of four tasks.
10. Installation and uninstallation succeed on clean macOS and Linux environments.

## 12. Immediate implementation milestone

Build the thinnest vertical slice that proves the architecture:

```text
TypeScript CLI
  -> Git diff and supported-repo discovery
  -> deterministic change classifier
  -> obligation-candidate and evidence report
  -> plan --diff terminal and JSON output
  -> normalized Stop event adapter
  -> four fixture repositories
  -> one bounded Claude remediation loop
```

Do not begin mutation integration, portfolio optimization, marketplace publication, or live Codex certification until this slice produces useful and measurable decisions.

## 13. Current-source notes

Checked August 28, 2026:

- Claude Code hooks currently include `TaskCompleted`, literal-filename `FileChanged` matching, `stop_hook_active`, and experimental agent hooks. Production use should prefer command hooks: https://code.claude.com/docs/en/hooks
- Codex currently supports command and MCP hook handlers; prompt and agent handlers are parsed but skipped. `Stop` can request continuation with a reason: https://learn.chatgpt.com/docs/hooks
- ChatGPT does not currently run plugin hooks: https://developers.openai.com/plugins/guides/submit-claude-plugin
- StrykerJS currently documents per-test coverage analysis, incremental mode, and targeted mutation paths or ranges: https://stryker-mutator.io/docs/stryker-js/configuration/
- mutmut 3.7.0 was released July 31, 2026: https://pypi.org/project/mutmut/3.7.0/
- Cosmic Ray 8.7.0 was released August 9, 2026: https://pypi.org/project/cosmic-ray/

These facts belong in compatibility records and must be rechecked against pinned versions during implementation.
