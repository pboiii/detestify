# Policy rules

**Status:** DECIDED

Every rule records the inputs needed, automation class, positive/negative/ambiguous cases, and low-confidence behavior. “Positive” means the rule applies; “negative” means it does not. No rule independently overrides provenance and gate eligibility.

## TST-001 — Externally observable behavior

**Statement:** Recommend persistent evidence when a distinct externally observable behavior changes and cheaper evidence does not already protect it.

**Classification:** `semantic`

**Required inputs:** diff, public boundary inventory, existing tests

**Positive example:** A CLI command gains a new documented exit state; no test asserts the observable exit code.

**Negative example:** A private helper is renamed while CLI output and existing tests remain unchanged.

**Ambiguous example:** An exported function changes, but consumers and compatibility status are unknown; derive a candidate and disclose uncertainty.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## TST-002 — Business or safety invariant

**Statement:** Prioritize authorization, accounting, idempotency, uniqueness, ordering, state transition, and irreversible-action invariants.

**Classification:** `semantic`

**Required inputs:** diff, declared policy, boundary facts, existing tests

**Positive example:** A payment retry path can emit the side effect twice and no invariant test exists.

**Negative example:** A display-only sort preference changes with no persisted or contractual invariant.

**Ambiguous example:** A function named authorizeTransfer changes but no policy or reachable boundary is known; infer only advisory obligation.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## TST-003 — Confirmed regression

**Statement:** Add one focused regression guard only when a reproduced failure class is not already reliably detected.

**Classification:** `heuristic`

**Required inputs:** observed failure, existing test results, diff

**Positive example:** A bug reproduction fails and no existing test covers retry after a failed claim.

**Negative example:** An existing focused test already fails on the reproduced bug; fix code without adding a duplicate test.

**Ambiguous example:** Issue text reports a bug but no reproduction exists; classify as candidate and request evidence.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## TST-004 — Risky boundary

**Statement:** Place evidence at databases, queues, filesystems, networks, clocks, concurrency, serialization, providers, auth, or deployment boundaries when that is where failure occurs.

**Classification:** `heuristic`

**Required inputs:** boundary inventory, diff, existing integration tests

**Positive example:** Transaction isolation behavior changes; recommend a compatible real-database integration test.

**Negative example:** A pure string formatter changes; a database test would add no distinct signal.

**Ambiguous example:** A wrapper may call a remote provider, but the configured adapter cannot determine whether the path is live or mocked.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## TST-005 — Contracts and compatibility

**Statement:** Protect consumer/provider contracts, schemas, formats, migrations, and version windows.

**Classification:** `heuristic`

**Required inputs:** contract files, exports/routes, diff, consumer evidence

**Positive example:** A JSON response field becomes nullable and a consumer contract exists.

**Negative example:** An internal temporary object shape changes without crossing a boundary.

**Ambiguous example:** An exported TypeScript type changes but runtime consumers are unknown; report a derived contract candidate.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## TST-006 — Critical journeys

**Statement:** Maintain a small number of system-level checks for explicitly critical user or operator journeys.

**Classification:** `semantic`

**Required inputs:** critical path config, system test inventory, diff

**Positive example:** Login-to-checkout is configured critical and routing/auth wiring changes.

**Negative example:** Every minor component visual variation receives a new end-to-end test.

**Ambiguous example:** A workflow appears critical from naming but is not declared; advise declaration rather than gate.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## TST-007 — Nonfunctional obligation

**Statement:** Use specialized evidence for security, privacy, accessibility, latency, resilience, recovery, and compliance at the observable scope.

**Classification:** `non-automatable`

**Required inputs:** quality policy, benchmark/security config, diff

**Positive example:** A declared p95 latency budget changes in a hot path; recommend a benchmark at that boundary.

**Negative example:** A pure unit test asserts elapsed wall time for a network service SLA.

**Ambiguous example:** A comment claims compliance significance without a maintained policy; mark inferred and advisory.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## TST-008 — High-input-space behavior

**Statement:** Prefer property, fuzz, metamorphic, combinatorial, or model-based techniques when many inputs share invariant structure.

**Classification:** `semantic`

**Required inputs:** AST facts, input domain, existing parametrization

**Positive example:** A parser change affects arbitrary escaped strings; recommend round-trip/property evidence.

**Negative example:** A two-state boolean formatter receives 100 enumerated examples.

**Ambiguous example:** The domain may be open-ended but no invariant is explicit; recommend an invariant discovery step, not automatic fuzzing.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## PLC-001 — Cheapest valid scope

**Statement:** Choose the least expensive scope that can trigger the relevant failure mechanism and observe the contract.

**Classification:** `semantic`

**Required inputs:** failure mechanism, observable contract, test topology

**Positive example:** Pure tax calculation is covered by a narrow property test.

**Negative example:** A mocked unit test is selected for a database uniqueness constraint.

**Ambiguous example:** A service wrapper could fail in transformation or provider wiring; recommend both candidate scopes with unresolved distinction.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## PLC-002 — Do not test below the failure boundary

**Statement:** Reject a lower-level test when the failure requires real wiring, state, or environment.

**Classification:** `heuristic`

**Required inputs:** boundary facts, failure mechanism, test environment

**Positive example:** Queue acknowledgement ordering is tested with a faithful queue harness.

**Negative example:** A policy helper unit test is claimed to prove HTTP middleware registration.

**Ambiguous example:** The repository uses a custom in-memory emulator whose fidelity is undocumented; disclose uncertainty.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-001 — Documentation/comments

**Statement:** Documentation or comment-only changes default to NO_TEST unless executable documentation or generated contracts change.

**Classification:** `deterministic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** README wording only.

**Negative example:** OpenAPI generated from Markdown changes.

**Ambiguous example:** A code block may be executed by docs CI, but no docs config is available.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-002 — Formatting/mechanical refactor

**Statement:** Formatting or mechanically proven refactors run affected existing checks and ordinarily add no tests.

**Classification:** `deterministic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Prettier-only diff with AST equivalence.

**Negative example:** A “formatting” commit changes a string literal.

**Ambiguous example:** Parser diagnostics prevent proving AST equivalence.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-003 — Behavior-preserving structural refactor

**Statement:** Preserve existing behavior tests; substantial test churn is a smell.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Extract function without contract change; existing tests remain stable.

**Negative example:** Refactor changes retry ownership and requires boundary evidence.

**Ambiguous example:** AST says signatures unchanged but dynamic behavior cannot be established without running tests.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-004 — New pure behavior

**Statement:** Add or update focused behavior evidence for meaningful partitions and invariants.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** New deterministic discount rule with boundary values.

**Negative example:** New alias delegates unchanged behavior.

**Ambiguous example:** Function includes hidden I/O despite pure-looking signature.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-005 — Confirmed bug

**Statement:** Find why evidence missed the bug and add one guard for that failure class only when needed.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Reproduced zero-value parsing bug lacks a guard.

**Negative example:** Existing test already reproduces and fails.

**Ambiguous example:** Bug report lacks a minimal reproduction.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-006 — Boundary/dependency change

**Statement:** Test at the real boundary or contract; mocks serve fault injection or rare states, not wiring proof.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Webhook persistence claim/release changes; add integration retry test.

**Negative example:** Internal helper call changes only.

**Ambiguous example:** Dependency upgrade changelog is unavailable and behavior impact is unknown.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-007 — Schema/migration change

**Statement:** Use compatibility, migration, rollback, and data-preservation evidence where applicable.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Non-null migration with backfill and rollback requirements.

**Negative example:** Type-only local interface rename.

**Ambiguous example:** Schema file changed but generation provenance is unknown.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-008 — Concurrency/ordering change

**Statement:** Use deterministic invariant evidence plus stress or schedule exploration when practical.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Lock/ack order changes in queue consumer.

**Negative example:** Synchronous immutable map rename.

**Ambiguous example:** Concurrency is hidden behind a third-party scheduler with no harness.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-009 — Security-sensitive change

**Statement:** Derive tests from a declared or observed threat at the reachable boundary.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Signature verification middleware changes; test forged request rejection and no side effect.

**Negative example:** Private helper comment mentions security without reachable use.

**Ambiguous example:** Potential auth path inferred from names only.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-010 — Generated code

**Statement:** Test the generator or contract rather than every generated line unless artifacts are independently owned.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Generator template changes output schema; test generator contract.

**Negative example:** Add one test per regenerated client method.

**Ambiguous example:** Generated file changes without source mapping; return insufficient evidence.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## CHG-011 — Configuration/deployment change

**Statement:** Use validation, smoke, and production-like wiring evidence rather than source-level unit tests.

**Classification:** `heuristic`

**Required inputs:** diff paths, AST/diff facts, runner and contract inventory

**Positive example:** Route configuration changes service wiring; add config validation/smoke.

**Negative example:** Unit-test a constant copied from YAML.

**Ambiguous example:** Configuration may be inert in current environment; deployment mapping absent.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-001 — Uncustomized dependency behavior

**Statement:** Do not test framework, language, ORM, serializer, client, or standard-library behavior the repository does not customize.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** A test merely proves Array.sort sorts.

**Negative example:** Custom serializer option changes wire compatibility.

**Ambiguous example:** Wrapper configuration may alter defaults but config execution is untrusted.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-002 — Trivial accessors and pass-throughs

**Statement:** Do not test trivial getters, setters, constants, aliases, or pass-throughs without policy, transformation, side effect, or compatibility obligation.

**Classification:** `deterministic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Getter returns one field unchanged.

**Negative example:** Wrapper enforces tenant filtering before delegation.

**Ambiguous example:** Pass-through adds logging whose compliance significance is unknown.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-003 — Private methods and call order

**Statement:** Do not freeze private methods or internal call order when public behavior captures the contract.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Test asserts three internal method calls in exact order.

**Negative example:** Call ordering is itself a declared transaction invariant.

**Ambiguous example:** Mocks suggest order matters but no observable failure is identified.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-004 — Compile/type guarantees

**Statement:** Do not repeat compiler or type-system guarantees at runtime unless untyped/serialized input crosses a boundary.

**Classification:** `deterministic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Runtime test asserts a TypeScript-only union rejects compilation.

**Negative example:** JSON input is validated at runtime against the union contract.

**Ambiguous example:** Build uses transpile-only mode and type checking is not confirmed.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-005 — Mock interaction theater

**Statement:** Do not assert every internal mock call when state, output, or external contract matters.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Test checks private collaborator call count but no outcome.

**Negative example:** Mock injects provider timeout to assert observable retry policy.

**Ambiguous example:** Only a mock is available for an external dependency; wiring confidence remains limited.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-006 — Coverage chasing

**Statement:** Do not add cases solely to execute every syntactic branch.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Test adds an impossible branch case to raise coverage.

**Negative example:** Uncovered branch corresponds to a plausible authorization denial.

**Ambiguous example:** Branch plausibility is unknown from static facts.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-007 — Duplicate equivalence examples

**Statement:** Do not add multiple examples from one equivalence class without a new boundary, invariant, or domain distinction.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Tests repeat three ordinary positive integers.

**Negative example:** Zero, maximum, and negative values represent distinct partitions.

**Ambiguous example:** Domain boundaries are undocumented; advise domain clarification.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-008 — Cross-layer duplication

**Statement:** Do not repeat the same behavior at unit, integration, and E2E scopes unless each detects a distinct failure mechanism.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** All three tests assert the same pure calculation.

**Negative example:** Unit proves calculation; integration proves database constraint; E2E proves auth/routing wiring.

**Ambiguous example:** Layer overlap exists but unique mechanism cannot be established.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-009 — Blind snapshots

**Statement:** Do not rely on broad snapshots without a named semantic contract and review process.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Agent regenerates a 2,000-line UI snapshot after every change.

**Negative example:** Golden protocol fixture has reviewed versioning and compatibility purpose.

**Ambiguous example:** Snapshot is small but its contract is undocumented.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-010 — Speculative edge cases

**Statement:** Do not generate edge cases with no plausible likelihood or impact.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Agent enumerates exotic Unicode combinations for an internal identifier with no external input.

**Negative example:** Parser accepts adversarial external Unicode and has a security history.

**Ambiguous example:** Exposure is unknown; return candidate with uncertainty.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-011 — Replacement-freeze tests

**Statement:** Do not add tests whose only purpose is to freeze internals during planned replacement; characterize the replacement boundary.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Tests pin each private method before a rewrite.

**Negative example:** Contract characterization protects migration output compatibility.

**Ambiguous example:** Replacement boundary is not documented.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.

## NTT-012 — File-changed test reflex

**Statement:** Do not create a test solely because an agent edited a file.

**Classification:** `heuristic`

**Required inputs:** diff, AST/test inventory, obligation evidence

**Positive example:** Comment change causes a new unit test.

**Negative example:** File edit changes an unguarded public behavior.

**Ambiguous example:** Diff mixes docs and behavior and cannot be cleanly classified.

**Tie-breaking procedure:** Prefer explicit declared or observed evidence; otherwise choose the less destructive action and expose the missing evidence. Do not turn semantic inference into a gate.

**Low-confidence behavior:** Emit advisory or INSUFFICIENT_EVIDENCE; never gate.
