// Policy rule catalog generated from spec/policy/rules-index.json
// (statements verbatim) plus the recommend-target and materiality axes each
// rule uses when it recommends evidence. TST/PLC rules recommend when they
// apply; CHG-001..003 never recommend (their guidance is "no new test");
// CHG-004..011 recommend when they apply; NTT anti-pattern rules recommend on
// their counter-example (the rule NOT applying means the evidence is owed).

import type {
  ChangeMechanism,
  Consequence,
  Exposure,
  TargetCadence,
  TargetPurpose,
  TargetScope,
  TargetTechnique,
} from "../model/index.js";

/** Automation class from spec/policy/rules.md. */
export type RuleClassification =
  | "deterministic"
  | "heuristic"
  | "semantic"
  | "non-automatable";

/** What the rule concludes for a determination: no new test, or recommend evidence. */
export type RuleAction = "no_test" | "recommend";

export interface RuleTarget {
  readonly scope: TargetScope;
  readonly purpose: TargetPurpose;
  readonly technique: TargetTechnique;
  readonly cadence: TargetCadence;
  readonly failure_class: string;
}

export interface RuleObligationAxes {
  readonly consequence: Consequence;
  readonly exposure: Exposure;
  readonly change_mechanism: ChangeMechanism;
}

export interface PolicyRule {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly classification: RuleClassification;
  readonly lowConfidenceBehavior: string;
  readonly appliesAction: RuleAction;
  readonly notAppliesAction: RuleAction;
  /** Recommended evidence placement when this rule recommends, else null. */
  readonly target: RuleTarget | null;
  /** Fields a caller-resolved target must satisfy when no universal target exists. */
  readonly targetConstraints?: Partial<RuleTarget>;
  /** Materiality axes of the obligation when this rule recommends, else null. */
  readonly obligationAxes: RuleObligationAxes | null;
}

export const POLICY_RULES: readonly PolicyRule[] = [
  {
    id: "TST-001",
    title: "Externally observable behavior",
    statement:
      "Recommend persistent evidence when a distinct externally observable behavior changes and cheaper evidence does not already protect it.",
    classification: "semantic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "TST-002",
    title: "Business or safety invariant",
    statement:
      "Prioritize authorization, accounting, idempotency, uniqueness, ordering, state transition, and irreversible-action invariants.",
    classification: "semantic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "irreversible",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "TST-003",
    title: "Confirmed regression",
    statement:
      "Add one focused regression guard only when a reproduced failure class is not already reliably detected.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: { purpose: "regression" },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "TST-004",
    title: "Risky boundary",
    statement:
      "Place evidence at databases, queues, filesystems, networks, clocks, concurrency, serialization, providers, auth, or deployment boundaries when that is where failure occurs.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "boundary-failure",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary",
    },
  },
  {
    id: "TST-005",
    title: "Contracts and compatibility",
    statement:
      "Protect consumer/provider contracts, schemas, formats, migrations, and version windows.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "contract",
      purpose: "compatibility",
      technique: "example",
      cadence: "pull_request",
      failure_class: "contract-regression",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary",
    },
  },
  {
    id: "TST-006",
    title: "Critical journeys",
    statement:
      "Maintain a small number of system-level checks for explicitly critical user or operator journeys.",
    classification: "semantic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "system",
      purpose: "acceptance",
      technique: "example",
      cadence: "pull_request",
      failure_class: "critical-journey-wiring",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "boundary",
    },
  },
  {
    id: "TST-007",
    title: "Nonfunctional obligation",
    statement:
      "Use specialized evidence for security, privacy, accessibility, latency, resilience, recovery, and compliance at the observable scope.",
    classification: "non-automatable",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: {},
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "boundary",
    },
  },
  {
    id: "TST-008",
    title: "High-input-space behavior",
    statement:
      "Prefer property, fuzz, metamorphic, combinatorial, or model-based techniques when many inputs share invariant structure.",
    classification: "semantic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "property",
      cadence: "pull_request",
      failure_class: "input-space-invariant",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "PLC-001",
    title: "Cheapest valid scope",
    statement:
      "Choose the least expensive scope that can trigger the relevant failure mechanism and observe the contract.",
    classification: "semantic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: {},
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "PLC-002",
    title: "Do not test below the failure boundary",
    statement:
      "Reject a lower-level test when the failure requires real wiring, state, or environment.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: {},
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "CHG-001",
    title: "Documentation/comments",
    statement:
      "Documentation or comment-only changes default to NO_TEST unless executable documentation or generated contracts change.",
    classification: "deterministic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "no_test",
    target: null,
    obligationAxes: null,
  },
  {
    id: "CHG-002",
    title: "Formatting/mechanical refactor",
    statement:
      "Formatting or mechanically proven refactors run affected existing checks and ordinarily add no tests.",
    classification: "deterministic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "no_test",
    target: null,
    obligationAxes: null,
  },
  {
    id: "CHG-003",
    title: "Behavior-preserving structural refactor",
    statement:
      "Preserve existing behavior tests; substantial test churn is a smell.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "no_test",
    target: null,
    obligationAxes: null,
  },
  {
    id: "CHG-004",
    title: "New pure behavior",
    statement:
      "Add or update focused behavior evidence for meaningful partitions and invariants.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "CHG-005",
    title: "Confirmed bug",
    statement:
      "Find why evidence missed the bug and add one guard for that failure class only when needed.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "regression",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "CHG-006",
    title: "Boundary/dependency change",
    statement:
      "Test at the real boundary or contract; mocks serve fault injection or rare states, not wiring proof.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "regression",
      technique: "example",
      cadence: "pull_request",
      failure_class: "boundary-regression",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary",
    },
  },
  {
    id: "CHG-007",
    title: "Schema/migration change",
    statement:
      "Use compatibility, migration, rollback, and data-preservation evidence where applicable.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "migration",
      technique: "example",
      cadence: "pull_request",
      failure_class: "migration-compatibility",
    },
    obligationAxes: {
      consequence: "irreversible",
      exposure: "cross_system",
      change_mechanism: "stateful_or_irreversible",
    },
  },
  {
    id: "CHG-008",
    title: "Concurrency/ordering change",
    statement:
      "Use deterministic invariant evidence plus stress or schedule exploration when practical.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "resilience",
      technique: "property",
      cadence: "nightly",
      failure_class: "ordering-invariant",
    },
    obligationAxes: {
      consequence: "irreversible",
      exposure: "cross_system",
      change_mechanism: "stateful_or_irreversible",
    },
  },
  {
    id: "CHG-009",
    title: "Security-sensitive change",
    statement:
      "Derive tests from a declared or observed threat at the reachable boundary.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "security",
      technique: "example",
      cadence: "pull_request",
      failure_class: "reachable-security-failure",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "adversarial",
      change_mechanism: "boundary",
    },
  },
  {
    id: "CHG-010",
    title: "Generated code",
    statement:
      "Test the generator or contract rather than every generated line unless artifacts are independently owned.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "contract",
      purpose: "compatibility",
      technique: "example",
      cadence: "pull_request",
      failure_class: "generator-contract",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary",
    },
  },
  {
    id: "CHG-011",
    title: "Configuration/deployment change",
    statement:
      "Use validation, smoke, and production-like wiring evidence rather than source-level unit tests.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "system",
      purpose: "smoke",
      technique: "example",
      cadence: "release",
      failure_class: "deployment-wiring",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "boundary",
    },
  },
  {
    id: "NTT-001",
    title: "Uncustomized dependency behavior",
    statement:
      "Do not test framework, language, ORM, serializer, client, or standard-library behavior the repository does not customize.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-002",
    title: "Trivial accessors and pass-throughs",
    statement:
      "Do not test trivial getters, setters, constants, aliases, or pass-throughs without policy, transformation, side effect, or compatibility obligation.",
    classification: "deterministic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-003",
    title: "Private methods and call order",
    statement:
      "Do not freeze private methods or internal call order when public behavior captures the contract.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-004",
    title: "Compile/type guarantees",
    statement:
      "Do not repeat compiler or type-system guarantees at runtime unless untyped/serialized input crosses a boundary.",
    classification: "deterministic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-005",
    title: "Mock interaction theater",
    statement:
      "Do not assert every internal mock call when state, output, or external contract matters.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-006",
    title: "Coverage chasing",
    statement: "Do not add cases solely to execute every syntactic branch.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-007",
    title: "Duplicate equivalence examples",
    statement:
      "Do not add multiple examples from one equivalence class without a new boundary, invariant, or domain distinction.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-008",
    title: "Cross-layer duplication",
    statement:
      "Do not repeat the same behavior at unit, integration, and E2E scopes unless each detects a distinct failure mechanism.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-009",
    title: "Blind snapshots",
    statement:
      "Do not rely on broad snapshots without a named semantic contract and review process.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-010",
    title: "Speculative edge cases",
    statement:
      "Do not generate edge cases with no plausible likelihood or impact.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-011",
    title: "Replacement-freeze tests",
    statement:
      "Do not add tests whose only purpose is to freeze internals during planned replacement; characterize the replacement boundary.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
  {
    id: "NTT-012",
    title: "File-changed test reflex",
    statement: "Do not create a test solely because an agent edited a file.",
    classification: "heuristic",
    lowConfidenceBehavior:
      "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior",
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior",
    },
  },
];

export const POLICY_RULES_BY_ID: ReadonlyMap<string, PolicyRule> = new Map(
  POLICY_RULES.map((rule) => [rule.id, rule]),
);
