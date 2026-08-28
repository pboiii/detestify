# Pre-implementation brief for ChatGPT Pro — Test Steward

**Upload this file together with `test-steward-research-and-implementation-plan.md` (called "the plan" below). Read the entire plan before starting any task.**

## Your role

You are the pre-implementation research and specification partner for Test Steward, an evidence-backed test-portfolio policy engine for coding agents (Claude Code, Codex, ChatGPT, CI, direct CLI). Your job is to verify facts the plan depends on, resolve open architecture decisions, and produce the Phase 0 artifacts (ADRs, schemas, policy rulebook, benchmark specs, skill draft) so that implementation can start without guessing.

You do NOT write implementation code (no Rust crates, no adapters). You write research reports, decision records, JSON Schemas, YAML specs, and markdown documents.

## Ground rules (apply to every task)

1. **Browse and cite primary sources**: official documentation, repository LICENSE files, package registries, release pages. Every factual claim about an external API, tool, or license gets a source URL and access date.
2. **Label every claim** `VERIFIED` (you read the primary source), `CHANGED` (the primary source contradicts the plan), or `UNVERIFIED` (you could not confirm). Never present an unverified API detail as fact.
3. **Deliver every artifact as a downloadable file.** Use your Python tool to write real files and give me download links. Do not only paste content into chat. At the end of each task, also produce a single `.zip` of that task's files. Use the exact file names specified below.
4. **Validate what can be validated before delivering**: run every JSON Schema through the Python `jsonschema` package (draft 2020-12), validate every example document against its schema, and parse every YAML file. A deliverable that fails its own validation is not done.
5. **Record conflicts, don't paper over them.** Whenever your research contradicts the plan, add a row to `conflicts.md` (maintained across all tasks): plan section, plan claim, what you found, source, recommended plan edit.
6. **Do not ask clarifying questions.** Make the best-supported decision, state it, and record the alternative you rejected in one line. All tasks are self-contained.
7. Plain technical writing. No marketing prose, no filler, no praise of the plan.

Run the tasks in order. One task per message from me is fine; if you can complete several in one response, do so, but never truncate a deliverable to fit — split across responses instead.

---

## Known concerns from internal review (address these explicitly)

These came from a review of the plan. Task 4 must respond to each one; other tasks should treat them as standing constraints.

- **C1 — Scope.** The plan is a multi-person-year program written as one project: 8 Rust crates, 2 language ecosystems, mutation testing, per-test coverage, a set-cover optimizer, hooks for 2 hosts, and a statistics-grade benchmark harness (12 task families × 4 arms × 2 hosts × 5–10 runs ≈ 480–960 agent runs per evaluation cycle). The biggest unlisted risk in §23 is that v0.1 never ships. A ruthless MVP cut is needed.
- **C2 — Rust choice.** Every evidence source is a Python or JS tool the core will shell out to anyway (pytest, coverage.py, testmon, Vitest, Jest, Stryker). Rust adds tree-sitter AST work that each ecosystem's native tooling gives for free. The hook-latency argument (300 ms budget) may be satisfiable by Go or by a small compiled shim in front of cached state. This decision needs evidence, not preference.
- **C3 — Stale host-API claims.** The plan asserts specific Claude Code hook semantics (`FileChanged` exact-file matching, `TaskCompleted`, agent hooks experimental, "already continued" stop flag) and Codex hook semantics (stop-continue with reason, prompt/agent handlers parsed but skipped, `.codex-plugin/plugin.json` format). These are exactly the claims that go stale and they gate the whole hook architecture.
- **C4 — Pseudo-quantitative utility formula.** `risk reduction = likelihood × impact × detection probability × uniqueness × evidence confidence` is not computable by anyone. Without an ordinal rubric with worked examples, the "decision model" collapses into LLM vibes wearing a formula costume.
- **C5 — Kill-matrix dependence.** The cleanup planner leans on per-test coverage and mutation kill matrices that are slow and flaky to obtain on real repos (coverage.py dynamic contexts slow suites; Stryker per-test analysis takes hours at scale). Kill matrices must be optional evidence from day one, not a core input.
- **C6 — Python mutation tooling is shaky.** The plan defers "mutmut or another maintained adapter." Maintenance status of mutmut vs cosmic-ray vs alternatives needs a fresh check before any schema assumes mutation evidence exists for Python.
- **C7 — Benchmark cost unbounded.** No token/dollar/wall-clock budget is set for the evaluation harness. Needs a smoke-tier corpus and a budget cap.
- **C8 — Naming.** "Test Steward" is flagged in the plan itself; the GitHub repo is currently `detestify`. Availability across GitHub/crates.io/npm/PyPI/Homebrew is unchecked.
- **C9 — No adoption wedge.** Distribution is planned but there is no 5-minute on-ramp. A zero-config `uvx/npx test-steward plan --diff` advisory run on any repo is the likely wedge; config-heavy tools die on arrival.
- **C10 — Undefined hook I/O contract.** The exact JSON a hook receives and must emit (decision, evidence summary, remediation text, token budget for injected context, loop-guard state) is the contract everything hangs on, and it is currently prose, not schema.
- **C11 — Windows.** Phase 7 promises Windows, but process-group termination, worktrees, and hook execution on Windows are real work nobody scoped. Either scope it or cut it from v0.1.
- **C12 — License of borrowed policy language.** The plan wants to reuse lifecycle vocabulary from `levnikolaevich/claude-code-skills` "where license-compatible" — nobody has checked that license.

---

## Task 1 — Host platform verification

**Goal:** confirm or correct every host-integration claim in plan §9 and §12 against current official documentation. This de-risks C3.

Verify at minimum:

1. Claude Code hooks: the current full event list; `FileChanged` matcher semantics (exact file vs glob); `TaskCompleted` existence and firing conditions; `Stop` hook JSON input/output contract including the "already continued" flag; whether command hooks vs agent/prompt hooks are stable or experimental; plugin packaging (`.claude-plugin/plugin.json`, `hooks/hooks.json`) current format; how plugin hooks are trusted/enabled by users.
2. Codex hooks: current event list; whether the stop hook can continue the agent with a reason; which handler types actually execute (command, MCP, prompt, agent); plugin/manifest packaging format and marketplace/distribution story.
3. ChatGPT: current state of skills/plugins in the ChatGPT product — what a provider-neutral skill can and cannot do there today; confirm the plan's claim that hooks do not run in ChatGPT.
4. Agent Skills open format: current spec version, required `SKILL.md` fields, size guidance, packaging with scripts/references.
5. Claude plugin marketplace and OpenAI submission processes: current requirements relevant to Phase 7.

**Deliverables**
- `task1/hooks-verification.md` — one table per host: plan claim → verdict (VERIFIED/CHANGED/UNVERIFIED) → what the source actually says → URL + access date. Follow with a short "implications for the hook architecture" section.
- `task1/hook-event-mapping-corrected.md` — the plan's §9.2/§9.3 event-mapping tables, corrected to what the docs actually support today.
- `conflicts.md` — started here, carried through all tasks.
- `task1.zip`

**Acceptance:** every §9 claim in the plan appears in the tables with a verdict; no verdict lacks a source URL.

---

## Task 2 — External tool due diligence and license inventory

**Goal:** fresh dossier on every tool the plan wants to adapt (§12, §15), answering C5, C6, C12.

For each tool: license (from the LICENSE file, not the README badge), latest release date and cadence, maintenance signal (open issues/PRs, last commit), language/framework coverage, whether it exposes per-test data, incremental/changed-code mode, rough runtime cost at scale, and integration risk.

Tools: mutmut, cosmic-ray, and any other maintained Python mutation tool; StrykerJS; PIT and Infection (brief — future scope); Trail of Bits Necessist; Dextool; pytest-testmon; coverage.py dynamic contexts; Vitest and Jest coverage/selection features; `levnikolaevich/claude-code-skills`; Testsmith; obra/superpowers. Add any credible tool the plan missed (search for it — e.g. affected-test selection or test-deduplication tools released recently).

**Deliverables**
- `task2/tool-dossier.md` — one section per tool with the fields above, each fact sourced.
- `task2/third-party-inventory.json` — machine-readable inventory: `{name, repo_url, license_spdx, license_verified_at, latest_release, maintenance_status, integration_mode (subprocess|library|concept-only), copyleft_isolation_required (bool), notes}`.
- `task2/python-mutation-recommendation.md` — a one-page recommendation: which Python mutation adapter v0.1 should target, or an explicit recommendation to ship v0.1 without Python mutation evidence, with reasoning.
- `task2/per-test-evidence-feasibility.md` — for Python and JS: what per-test coverage and kill-matrix data is actually obtainable, at what runtime cost, and which cleanup detectors from plan §11.2 survive if kill matrices are unavailable (answers C5).
- `task2.zip`

**Acceptance:** every license verdict cites the LICENSE file URL; the inventory JSON parses and every entry has all fields.

---

## Task 3 — Naming and availability

**Goal:** settle C8 before anything is published.

1. Evaluate candidates: `test-steward`, `detestify` (current repo name), and generate at least six more candidates that fit the thesis ("smallest defensible test portfolio").
2. For each: GitHub org/repo availability, crates.io, npm, PyPI, Homebrew formula name, obvious domain availability (best effort), collision with existing products or trademarks in developer tooling (search; note this is a red-flag scan, not legal clearance).
3. Rank and recommend one primary and one fallback.

**Deliverables**
- `task3/naming-report.md` — availability matrix, red flags with sources, ranked recommendation, and a note on which checks require a human or counsel to finalize.
- `task3.zip`

---

## Task 4 — MVP re-scope and phase plan revision

**Goal:** answer C1, C7, C9, C11 with a concrete v0.1-alpha cut. Use Task 1 and 2 findings.

Produce a scope proposal that:

1. Defines the smallest shippable slice that still proves the plan's §24 milestone thesis (correct `NO_TEST`, right test at the right boundary, safe legacy consolidation). Explicitly decide: one language ecosystem first or both; one host first or both; which evidence sources are in (diff classification, test inventory, affected selection) and which are deferred (mutation, kill-matrix set-cover, Codex host, Windows).
2. Specifies the zero-config on-ramp: exact behavior of a first `plan --diff` run on an unconfigured repo, and what output makes someone keep it (C9).
3. Restates the plan's Phase 0–7 as a revised phase list with the deferred items moved to a labeled backlog, keeping the plan's definitions-of-done style.
4. Sets a benchmark budget: a smoke tier (cheap, run per change) vs full tier (run per release), with estimated run counts and an explicit cost cap assumption (C7).
5. States what "cleanup" means in v0.1 if mutation evidence is deferred: which §11.2 detectors run on AST + coverage + git history alone, and what the two-independent-signal deletion rule looks like without mutation.

**Deliverables**
- `task4/mvp-scope.md` — the proposal, with a one-page "cut list" table (item, plan section, in/deferred, why).
- `task4/revised-phases.md` — revised phases with definitions of done.
- `task4.zip`

**Acceptance:** every concern C1–C12 is either resolved by this proposal or explicitly assigned to a later phase with a reason.

---

## Task 5 — Architecture decision records

**Goal:** draft the six ADRs the plan's Phase 0 requires, grounded in Tasks 1–4. Use a standard ADR format (context, decision, alternatives considered, consequences). These are drafts for human ratification — mark open points.

1. `task5/adr-001-implementation-language.md` — Rust vs Go vs Python-core-with-compiled-shim. Must include a decision matrix (hook cold-start latency, distribution, AST tooling maturity for Python+TS parsing, implementability by coding agents, cross-platform), cite real cold-start/latency evidence where findable, and define the Phase 0 benchmark that would overturn the default (answers C2).
2. `task5/adr-002-testing-doctrine.md` — the governing principle, the four-axis taxonomy, `NO_TEST` as first-class, what the engine will never gate on (raw coverage, test count).
3. `task5/adr-003-evidence-hierarchy.md` — the §8 hierarchy, which levels are required vs optional per decision type, and the rule that destructive actions need stronger evidence than advice.
4. `task5/adr-004-hook-architecture.md` — corrected event mappings from Task 1, deterministic command hooks as default, loop-guard design, CI as the non-bypassable layer.
5. `task5/adr-005-cleanup-safety.md` — protected obligations, two-signal rule (with and without mutation evidence, per Task 4), worktree validation, approval defaults.
6. `task5/adr-006-licensing-and-reuse.md` — Apache-2.0 rationale, copyleft isolation policy, per-tool integration mode from the Task 2 inventory, DCO vs CLA recommendation.

**Deliverables:** the six ADR files plus `task5.zip`.

---

## Task 6 — Version 1 schemas and hook I/O contract

**Goal:** produce the machine contracts implementation will code against (plan §10, §13.4–13.6, §15.3), killing C10. A coding agent must be able to implement from these without guessing.

Write JSON Schema (draft 2020-12) files, each with `$id`, versioning field, and descriptions on every property:

- `task6/schemas/config.schema.json` — the §13.5 config surface.
- `task6/schemas/obligation.schema.json` — obligations incl. the §7 durable record.
- `task6/schemas/decision.schema.json` — change classification, lifecycle actions (`KEEP/ADD/UPDATE/MOVE/MERGE/DELETE/NO_TEST`), confidence, evidence references, the §10 Step 5 record.
- `task6/schemas/evidence.schema.json` — the §15.3 adapter output, with `limitations` mandatory.
- `task6/schemas/report.schema.json` — the report envelope for `plan`, `verify-change`, `audit`, `cleanup-plan`, `ci`.
- `task6/schemas/hook-io.schema.json` — per host event (from Task 1's corrected mapping): exact input consumed, exact output emitted (decision, ≤N-token context payload, remediation text, block/allow, loop-guard state). Define N.
- `task6/schemas/cleanup-plan.schema.json` — candidates, signals, protected checks, counterfactual statements, worktree validation results.

Plus:
- `task6/examples/` — at least one valid example instance per schema, including a full `NO_TEST` decision, a full `ADD` decision (webhook example from §10), and a `DELETE` candidate with two signals. Validate all examples against their schemas in Python and show the validation run.
- `task6/cli-contract.md` — for each §13.4 command: purpose, inputs, JSON output schema reference, exit codes (documented table), and which hook/CI caller consumes it.
- `task6.zip`

**Acceptance:** `jsonschema` validation passes for every example; no schema property lacks a description; exit codes are a complete table, not prose.

---

## Task 7 — Policy rulebook and risk rubric

**Goal:** operationalize plan §4–§6 into deterministic, testable rules (Phase 0 DoD: "every policy rule has positive, negative, and ambiguous examples"), killing C4.

1. `task7/policy-rules.md` — every rule from §4.1, §4.2, §4.3 (the change-class table), and §5 (the 12 exclusions) restated as: rule ID, statement, decision inputs required, positive example, negative example, ambiguous example with the tie-breaking procedure, and what the engine does at low confidence (advisory, never block).
2. `task7/risk-rubric.md` — replace the §6 formula's free variables with ordinal scales (e.g., likelihood: rare/plausible/expected with concrete definitions; impact: cosmetic/degraded/data-loss/safety-legal), a lookup table mapping score combinations → materiality tier → allowed gate behavior, and 10 fully worked scoring examples spanning the §16.2 task families.
3. `task7/change-classifier-spec.md` — deterministic signals for each §10 Step 2 class (file patterns, AST facts, diff shape, dependency files), what requires model assistance, and the confidence output for each path.

**Deliverables:** the three files plus `task7.zip`.

**Acceptance:** no rule lacks its three examples; the rubric contains zero unquantified multiplications.

---

## Task 8 — Benchmark corpus specifications

**Goal:** spec the §16.2 task corpus so fixtures can be built mechanically, within the Task 4 budget tiers.

1. `task8/benchmark-design.md` — corpus architecture: fixture-repo requirements, hidden-oracle protocol (how oracles stay hidden from the agent under test), seeded-fault design rules, behavior-preserving transformation protocol, run manifest format, and the smoke vs full tier split with estimated per-run cost.
2. `task8/tasks/task-01.yaml` … `task-12.yaml` — one spec per §16.2 family: fixture description, agent-visible prompt, hidden acceptance oracle, seeded faults (≥3 each where applicable), expected obligations (not golden test files), allowed alternative solutions, metrics collected, pass/fail conditions. All files must parse as YAML.
3. `task8/metrics-definitions.md` — precise definitions and collection method for each §16.3 metric, including how the non-inferiority margin for defect detection is set from baseline runs.

**Deliverables:** the files above plus `task8.zip`.

---

## Task 9 — Canonical skill draft and threat model

**Goal:** first full drafts of the two remaining Phase 0/4 documents that benefit from research grounding.

1. `task9/SKILL.md` — the provider-neutral skill per plan §14: under 500 lines, the 10-step workflow, the explicit rejections list, references section pointing to (not inlining) taxonomy/examples/cleanup docs, and host notes consistent with Task 1 findings. Follow the Agent Skills format you verified in Task 1.
2. `task9/skill-references-outline.md` — outline + key content for each reference file the skill links to.
3. `task9/threat-model.md` — STRIDE-style pass over plan §18: assets, trust boundaries (repo config as untrusted input, hook payloads, external tool output, worktrees), attack scenarios (malicious repo config triggering commands, symlink escape, prompt injection via test names/output into the agent, poisoned skill context), and the mitigation each maps to.
4. Final consolidated `conflicts.md` — the complete cross-task conflict log, ordered by severity, each with a recommended plan edit.
5. `all-deliverables.zip` — everything from Tasks 1–9.

---

## Final output expectations

At the end of each task, list the files produced with download links and a two-line summary of what changed relative to the plan. At the end of Task 9, produce a one-page `readiness-summary.md` stating: which plan sections are now implementation-ready, which remain blocked and on what, and the recommended first implementation milestone — then include it in `all-deliverables.zip`.
