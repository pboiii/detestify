# ADR-003: Testing doctrine

**Status:** DECIDED  
**Date:** 2026-08-28

## Context

Coding agents often produce tests as an expected by-product of any edit. That behavior inflates maintenance cost without necessarily improving defect detection. The product needs a doctrine that determines what, when, and where to test without fixed test quotas or a universal pyramid percentage.

## Decision

The governing principle is:

> A new or changed test is justified when it protects a distinct, plausible, and material obligation that cheaper existing evidence does not already cover.

### Invariants

- Optimize for the smallest **defensible** portfolio, not the smallest count.
- `NO_TEST_SUPPORTED` is a first-class outcome.
- Choose the cheapest scope that can trigger the failure mechanism and observe the protected contract.
- Never test below the boundary where the failure actually exists.
- Prefer observable behavior and state over private methods and call choreography.
- Coverage, mutation score, test count, semantic similarity, and model judgment are diagnostics, never standalone gates.
- Test ownership and affected-test execution are separate questions.
- Expensive evidence moves to completion, PR, nightly, release, or production cadence according to cost and risk.

### Four-axis taxonomy

1. **Scope:** static, narrow/unit, component, integration, contract, system/end-to-end.
2. **Purpose:** functional, regression, acceptance, smoke, security, performance, resilience, accessibility, compatibility, migration, recovery, compliance.
3. **Technique:** example, parameterized, property, fuzz, metamorphic, combinatorial, model-based, differential, snapshot/golden, mutation.
4. **Environment/cadence:** per edit, completion, PR, main/nightly, release, production.

### Relative importance

There is no universal ordering by label. Static checks and narrow deterministic tests usually offer cheaper feedback; boundary and contract tests are indispensable when the failure requires real wiring; a small set of system journeys proves essential composition; specialized tests are placed where their quality obligation is observable. A single authorization or migration test may be more important than hundreds of unit tests.

### Never-gate conditions

The engine never gates solely because:

- line or branch coverage fell;
- a fixed number of tests was not added;
- a mutation survived;
- a model inferred an obligation;
- two tests look semantically similar;
- a file changed.

## Alternatives considered

- Fixed test quotas: rejected because risk partitions vary.
- Universal test pyramid percentages: rejected because architecture determines meaningful boundaries.
- TDD as an enforced workflow: rejected; development order is not the product obligation.
- Mutation score as the quality objective: rejected; mutants are optional evidence with equivalence and cost limitations.

## Consequences

- Some legitimate edits yield no new tests.
- Agents must explain failure classes and unique evidence, not merely add files.
- Repository policy can elevate specific declared obligations without overriding evidence provenance.

## OPEN

None. Individual rule automation levels are specified in `spec/policy/rules.md`.
