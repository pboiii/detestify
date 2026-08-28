# Execution brief v2 — Test Steward specification tree (Packages A–E)

**Supersedes:** `chatgpt-pro-preimplementation-brief.md` (v1, tasks 1–9). Do not execute the v1 tasks.
**Upload together with:** `test-steward-research-and-implementation-plan.md` (the plan) and `test-steward-owner-ruling-and-revised-brief.md` (the ruling). **The ruling is authoritative wherever it and the plan disagree.** Read both in full before starting.

## Your job

Execute the ruling's five work packages (§9) and produce one coherent specification tree that a coding agent can implement the alpha from (§4, §11, §12 of the ruling) without guessing. You write specifications, ADRs, schemas, fixtures specs, and policy tables — no implementation code.

## Ground rules

1. **The ruling decides; you elaborate.** Where the ruling has made a call (TypeScript default, JS/TS ecosystem, Claude-only certified host, four fixtures, six alpha commands, gate-eligibility table, hook envelope, cleanup evidence rule, benchmark caps), do not relitigate it — implement it in detail. If you find a genuine defect in a ruled decision, keep the decision, and record the objection in `spec/conflicts.md` with evidence.
2. **Two label vocabularies** (per ruling §10): external facts get `VERIFIED` / `CHANGED` / `UNVERIFIED` with a source URL and access date; normative decisions get `DECIDED` / `OPEN` / `DEFERRED`. Never mix them.
3. **One spec tree, cumulative archive.** Author files at the exact paths below. At the end of each package, deliver the full updated tree as a single downloadable `spec-tree.zip` (replacing the previous one). No per-task archives.
4. **Validate before delivering:** every JSON Schema passes draft-2020-12 metaschema validation; every example validates against its schema; every YAML parses. Include the validation run output in `spec/validation-log.md`. Any authoring tool is fine; validity is what matters.
5. **Research only what can change an alpha decision.** No PIT, Infection, Dextool, or future-language deep dives (ruling §9 Package A). Python mutation gets a short forward-looking appendix only.
6. **No pseudo-precise numbers.** Risk uses the ruling's ordinal decision tables (§5.3). Effort estimates, if any, are labeled non-calibrated.
7. **Do not ask clarifying questions.** Decide, label `DECIDED`/`OPEN`, move on. `OPEN` items get one line on what evidence would close them.
8. Plain technical writing; no filler.

Pre-verified for you (2026-08-28, all six ruling §13 citations checked live): `code.claude.com/docs/en/hooks`, `learn.chatgpt.com/docs/hooks`, `developers.openai.com/plugins/guides/submit-claude-plugin`, and the StrykerJS configuration page all resolve; PyPI confirms mutmut 3.7.0 (released 2026-07-31) and cosmic-ray 8.7.0 (released 2026-08-09). Re-verify content-level claims yourself when you cite them; liveness is confirmed, semantics are not.

---

## Package A — Volatile interfaces and reuse verification

**Files**
- `spec/compat/hooks-matrix.md` — Claude Code and Codex hook compatibility matrix: for each lifecycle event, current name, input payload shape, output contract, blocking semantics, stability label (stable/experimental/absent), source URL + access date. Include Claude's `TaskCompleted`, literal-filename `FileChanged`, `stop_hook_active`, and agent-hook status; Codex's command/MCP handlers, parsed-but-skipped prompt/agent handlers, and Stop-continuation semantics. Every row `VERIFIED`/`CHANGED`/`UNVERIFIED`.
- `spec/compat/event-mapping.md` — mapping from each host event to the ruling's normalized event enum (§6.2: `session_start|before_tool|after_tool|task_complete|subagent_stop|turn_stop|session_end`), including which host events have no normalized equivalent and are deliberately dropped.
- `spec/compat/tool-dossier.md` — focused dossiers: StrykerJS (per-test coverage analysis, incremental mode, targeted mutation ranges, report formats, license), Vitest, Jest (discovery, coverage output formats, programmatic APIs, affected-test features, licenses), the candidate TypeScript AST stack (TypeScript compiler API vs ts-morph vs Babel — recommend one, `DECIDED`), and any skill/prose sources actually reused (license from the LICENSE file itself).
- `spec/compat/python-mutation-appendix.md` — one page: mutmut 3.7.0 and cosmic-ray 8.7.0 output contracts and suitability open questions, for the deferred Python ecosystem. No integration design.
- `spec/conflicts.md` — running log (carried through all packages): source of conflict, what the plan/ruling says, what you found, recommended resolution.

**Acceptance:** no matrix row without a source URL; the event mapping covers every event named in ruling §6.2; the AST stack recommendation is `DECIDED` with two named alternatives rejected.

## Package B — Architecture freeze

**Files** (standard ADR format: context, decision, alternatives, consequences; each marked `DECIDED` with `OPEN` sub-points where honest)
- `spec/adr/adr-001-alpha-scope.md` — the ruling §4 scope: JS/TS ecosystem, six commands, macOS+Linux, four fixtures, advisory cleanup, deferred list with re-entry conditions.
- `spec/adr/adr-002-implementation-language.md` — TypeScript default with the ruling §4.1 overturn thresholds verbatim (p95 no-op start < 500 ms, `plan --diff` < 2 s, deterministic JSON, clean `npx`, safe child-process termination) plus the measurement procedure for each threshold.
- `spec/adr/adr-003-testing-doctrine.md` — plan §2–§6 doctrine constrained by ruling §3 invariants.
- `spec/adr/adr-004-evidence-and-obligation-confidence.md` — the ruling §5 provenance classes (declared/observed/derived/inferred/unknown) and gate-eligibility table, with three worked examples per provenance class.
- `spec/adr/adr-005-hook-architecture.md` — two-layer contract (raw fixtures + normalized envelope), the 6,000-byte model-visible cap and 1,500-char remediation cap, loop-guard design, why the core excludes `FileChanged`.
- `spec/adr/adr-006-cleanup-safety.md` — ruling §7: detector list, the §7.3 evidence rule (structural + independent behavioral/historical signal, human approval, static-only → `MERGE_CANDIDATE`/`INSUFFICIENT_EVIDENCE`), seeded faults as benchmark instrument not product input, deferred set-cover.
- `spec/adr/adr-007-licensing-and-reuse.md` — Apache-2.0, independent policy authorship, attribution rules, DCO vs CLA recommendation.
- `spec/threat-model-outline.md` — assets, trust boundaries, top abuse cases (malicious repo config, symlink escape, prompt injection via test names/output, hook payload spoofing); full model comes in Package E.
- `spec/naming-report.md` — availability matrix for `test-steward`, `detestify`, plus ≥6 candidates across GitHub/npm/crates.io/PyPI/Homebrew, red-flag scan, ranked recommendation. Runs in parallel; blocks publication, not prototyping.

**Acceptance:** no ADR relitigates a ruled decision; every `OPEN` point names the evidence that closes it.

## Package C — Machine contracts and policy

**Files**
- `spec/schemas/config.schema.json`, `obligation-candidate.schema.json`, `decision.schema.json`, `evidence.schema.json`, `report.schema.json`, `hook-io.schema.json`, `cleanup-plan.schema.json` — draft 2020-12, `$id` + `schema_version` on each, description on every property. `hook-io` starts from the ruling §6.2 envelopes verbatim; extensions are `OPEN` notes, not silent additions. `obligation-candidate` carries the provenance class as a required enum. `evidence` makes `limitations` required. `decision` includes the ruling §4.4 outcome set (`NO_TEST_SUPPORTED`, `EXISTING_TEST_UPDATE_CANDIDATE`, `NEW_TEST_CANDIDATE`, `INSUFFICIENT_EVIDENCE`) and the cleanup action set (`KEEP`, `MERGE_CANDIDATE`, `DELETE_CANDIDATE`, `MOVE_CANDIDATE`, `INSUFFICIENT_EVIDENCE`). Schema only the six alpha commands — nothing deferred.
- `spec/schemas/examples/` — ≥1 valid instance per schema, including: a `NO_TEST_SUPPORTED` zero-config run, an `INSUFFICIENT_EVIDENCE` run, a `DELETE_CANDIDATE` meeting the §7.3 rule, and a static-only candidate correctly emitted as `MERGE_CANDIDATE`.
- `spec/cli-contract.md` — for each of `plan --diff`, `verify-change`, `inventory`, `audit`, `cleanup-plan`, `doctor`: purpose, inputs, output schema reference, complete exit-code table, zero-config behavior, and the ruling §4.4 must-not list (no repo scripts, installs, mutation, edits, hooks, or network without explicit trust). Resolve as `DECIDED` whether `verify-change` is in the first vertical slice (ruling §12 omits it from the slice while §4.3 ships it in alpha — currently an open seam).
- `spec/policy/rules.md` — every plan §4/§5 rule restated with: rule ID, statement, required inputs, classification (`deterministic | heuristic | semantic | non-automatable`), positive/negative/ambiguous example, and low-confidence behavior (advisory, never gate — ruling §5.2).
- `spec/policy/materiality-tables.md` — the ruling §5.3 ordinal decision tables (consequence × exposure × change mechanism × evidence gap × confidence → materiality tier → allowed action), with 10 worked examples spanning the four fixture tasks.
- `spec/validation-log.md` — schema/example/YAML validation output.

**Acceptance:** all examples validate; exit codes are a complete table; no rule lacks its three examples and classification; no scalar risk value appears anywhere.

## Package D — Four-fixture benchmark

**Files**
- `spec/benchmark/oracle-protocol.md` — how hidden acceptance checks stay hidden from the agent under test; manifest format; scoring procedure.
- `spec/benchmark/tasks/task-01-doc-only.yaml`, `task-02-refactor-churn.yaml`, `task-03-boundary-bug.yaml`, `task-04-legacy-cleanup.yaml` — per ruling §8.1: fixture repo description (JS/TS), agent-visible prompt, hidden oracle, seeded faults sized to the fixture's distinct failure mechanisms (no fixed quota), expected obligation/evidence decision (not golden test files), allowed alternatives, metrics, pass/fail. Task 04 must contain exact duplicates, plausible redundancy, and a protected test.
- `spec/benchmark/seeded-fault-rules.md` — fault design rules (non-equivalent, mechanism-mapped, hidden).
- `spec/benchmark/metrics.md` — definitions for the alpha DoD #9 metrics: hidden-fault regression, unnecessary test creation, churn vs baseline.
- `spec/benchmark/pr-suite.md` — the deterministic per-PR suite (schema validation, policy goldens, four fixture CLI runs, hook normalization tests, cleanup safety counterexamples); zero paid agent runs.
- `spec/benchmark/canary-manifest.yaml` — nightly/RC canary per ruling §8.2 caps: 4 tasks, baseline + full arms, ≤3 reps, ≤24 runs, ≤12 h, ≤$250 per candidate.

**Acceptance:** YAML parses; every task has a hidden oracle and expected-decision spec; the canary manifest encodes all four caps.

## Package E — Skill and host package draft (after B and C stabilize)

**Files**
- `spec/skill/SKILL.md` — provider-neutral, <500 lines, consumes the CLI contract (invokes commands, reads report JSON) rather than restating policy in prose; explicit rejections list from plan §14; conforms to the Agent Skills format verified in Package A.
- `spec/skill/references-outline.md` — outline + key content per linked reference file.
- `spec/hosts/claude-hook-package.md` — Claude command-hook package spec: hooks.json content, events used, adapter mapping to the normalized envelope, bounded one-shot remediation flow honoring `stop_hook_active`, install/trust/uninstall.
- `spec/hosts/codex-fixtures.md` + `spec/hosts/codex-fixtures/*.json` — captured/representative Codex payloads for every normalized event, each normalizing into the §6.2 envelope; this is the alpha's Codex compatibility artifact (no live wrapper).
- `spec/threat-model.md` — full model from the Package B outline, each threat mapped to a mitigation in the specs.
- `spec/quickstart.md` — the adoption path: `npx` zero-config first run, what the user sees, how trust is granted for anything beyond read-only.

**Acceptance:** the skill contains no policy thresholds duplicated from `spec/policy/`; every Codex fixture validates against `hook-io.schema.json`'s input envelope.

---

## Final deliverable

After Package E: `spec/readiness-summary.md` — one page: which ruling §11 DoD items the spec tree now fully specifies, remaining `OPEN` items with owners of the evidence needed, and confirmation that the ruling §12 vertical slice is implementable from the tree alone. Then the final cumulative `spec-tree.zip`.
