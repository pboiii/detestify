# Ordinal materiality and allowed-action tables

**Status:** DECIDED  
**Rule:** No axis is multiplied, summed, or converted into a pseudo-precise risk score.

## Axes

### Consequence

| Value | Definition |
|---|---|
| `negligible` | Cosmetic or local inconvenience with easy recovery and no durable incorrect state. |
| `degraded` | User-visible or operational impairment with bounded recovery and no irreversible loss. |
| `irreversible` | Duplicate side effect, data loss/corruption, unrecoverable migration, or durable cross-system inconsistency. |
| `regulated_or_safety_critical` | Credible legal, safety, security, privacy, financial-control, or regulatory consequence explicitly declared or observed. |

### Exposure

| Value | Definition |
|---|---|
| `internal` | Exercised only through repository-controlled internals. |
| `user_facing` | Reachable by normal product users or operators. |
| `cross_system` | Crosses a persisted, network, queue, provider, or consumer boundary. |
| `adversarial` | Exposed to malicious or untrusted input or actors. |

### Change mechanism

| Value | Definition |
|---|---|
| `no_behavior` | Documentation, formatting, or mechanically equivalent change. |
| `pure_behavior` | Deterministic behavior without external state or wiring. |
| `boundary` | Integration, contract, serialization, configuration, or external-system behavior. |
| `stateful_or_irreversible` | Persistence, transaction, ordering, concurrency, migration, or irreversible side effect. |

### Evidence gap

| Value | Definition |
|---|---|
| `none` | Existing evidence directly exercises the obligation and still applies. |
| `partial` | Evidence covers part of the mechanism or contract but leaves a named gap. |
| `material` | No reliable evidence exercises a plausible material failure class. |
| `unknown` | The engine cannot determine what evidence exists or what obligation is owned. |

### Confidence

| Value | Definition |
|---|---|
| `explicit` | Maintained repository declaration, contract, or protected record. |
| `observed` | Reproduced failure, failing check, historical fault, or executable oracle. |
| `derived` | Deterministic structural fact. |
| `inferred` | Semantic/model hypothesis. |
| `unknown` | No credible basis. |

## Materiality decision table

Apply the first matching row. Confidence controls gate eligibility separately.

| Tier | Conditions | Default portfolio behavior | Maximum gate behavior |
|---|---|---|---|
| `T0` | `no_behavior`, or evidence gap `none` with no distinct changed obligation | `NO_TEST_SUPPORTED` or existing checks only | Allow |
| `T1` | Negligible/internal pure behavior, or partial low-consequence gap | Advise focused existing verification; add only distinct evidence | Advise |
| `T2` | Degraded user-facing behavior, meaningful pure invariant, or bounded boundary gap | Recommend update/new candidate at correct scope | Request remediation only with declared/observed support in configured mode |
| `T3` | Cross-system boundary or stateful/irreversible mechanism with material gap | Recommend targeted integration/contract/migration evidence | Request remediation when provenance is gate-eligible |
| `T4` | Explicit/observed regulated, safety, security, privacy, or adversarial obligation with material gap | Targeted threat/contract-derived evidence | Strict targeted remediation; `deny_tool` only for concrete unsafe tool action, never semantic uncertainty |
| `TU` | Evidence gap or confidence is unknown and the decision depends on missing intent/evidence | `INSUFFICIENT_EVIDENCE` | Advise only |

## Gate eligibility overlay

| Confidence/provenance | Allowed action ceiling |
|---|---|
| Explicit declared + executable evidence | Configured remediation gate for T2–T4 |
| Observed failure/oracle | Targeted remediation for the observed class |
| Derived | Advise unless exact rule is elevated in repository policy |
| Inferred | Advise only |
| Unknown | Advise uncertainty only |

## Worked examples

| # | Fixture / situation | Axes | Tier | Decision |
|---:|---|---|---|---|
| 1 | Task 01 README wording | negligible, internal, no_behavior, none, explicit diff fact | T0 | `NO_TEST_SUPPORTED`; allow |
| 2 | Task 01 executable docs command changes | degraded, user_facing, boundary, partial, derived | T2 | New/update docs-contract candidate; advise unless declared |
| 3 | Task 02 function extraction with AST-equivalent API and existing tests | negligible, internal, no_behavior, none, derived | T0 | No new test; run affected existing checks |
| 4 | Task 02 refactor changes test internals only and public evidence remains stable | negligible, internal, pure_behavior, partial, derived | T1 | Advise reducing churn; no hard gate |
| 5 | Task 03 claim/release lifecycle can strand retries | irreversible, cross_system, stateful_or_irreversible, material, derived plus elevated declared rule | T3 | `NEW_TEST_CANDIDATE` integration retry guard; balanced/strict remediation eligible |
| 6 | Task 03 valid signature primitive already has a unit test, but HTTP middleware wiring changed | degraded, adversarial, boundary, material, observed/declared | T4 | Boundary security test; unit duplicate is insufficient |
| 7 | Task 04 byte-identical duplicate with passed isolated removal and no protection | negligible, internal, no_behavior, none, observed counterfactual | T0 ownership risk | `DELETE_CANDIDATE`, human approval required |
| 8 | Task 04 similar unit and contract test, contract is protected | irreversible, cross_system, boundary, none, explicit | T3 obligation but no gap | `KEEP` contract test; unit assessed separately |
| 9 | Task 04 static similarity only | degraded, user_facing, pure_behavior, unknown, unknown | TU | `MERGE_CANDIDATE` or `INSUFFICIENT_EVIDENCE`; never delete candidate |
| 10 | Undocumented auth-looking helper name changes | regulated_or_safety_critical is only inferred, adversarial inferred, boundary unknown, unknown, inferred | TU | Advisory obligation hypothesis; request declaration/reproduction, no gate |
