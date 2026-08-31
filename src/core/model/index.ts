// Compile-time mirrors of the frozen JSON Schemas in schemas/. Runtime
// validation stays with the ajv layer in src/core/schemas; these types keep
// producers honest at the compiler boundary. Field names match the schemas
// exactly (snake_case) so objects serialize without mapping.

// ---------------------------------------------------------------------------
// Materiality axes (obligation-candidate.schema.json `materiality`)
// ---------------------------------------------------------------------------

export type Consequence =
  | "negligible"
  | "degraded"
  | "irreversible"
  | "regulated_or_safety_critical";

export type Exposure =
  | "internal"
  | "user_facing"
  | "cross_system"
  | "adversarial";

export type ChangeMechanism =
  | "no_behavior"
  | "pure_behavior"
  | "boundary"
  | "stateful_or_irreversible";

export type EvidenceGap = "none" | "partial" | "material" | "unknown";

/** Confidence source axis (materiality-tables.md), not a probability. */
export type MaterialityConfidence =
  | "explicit"
  | "observed"
  | "derived"
  | "inferred"
  | "unknown";

export type MaterialityTier = "T0" | "T1" | "T2" | "T3" | "T4" | "TU";

export interface MaterialityAxes {
  readonly consequence: Consequence;
  readonly exposure: Exposure;
  readonly change_mechanism: ChangeMechanism;
  readonly evidence_gap: EvidenceGap;
  readonly confidence: MaterialityConfidence;
}

export interface Materiality extends MaterialityAxes {
  readonly tier: MaterialityTier;
}

// ---------------------------------------------------------------------------
// Obligation candidate (obligation-candidate.schema.json)
// ---------------------------------------------------------------------------

/** Primary epistemic provenance class (ADR-004). */
export type Provenance =
  | "declared"
  | "observed"
  | "derived"
  | "inferred"
  | "unknown";

export interface ObligationCandidate {
  readonly schema_version: "1.0";
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly provenance: Provenance;
  readonly source_refs: readonly string[];
  readonly materiality: Materiality;
  readonly gate_eligible: boolean;
  readonly rationale: string;
  readonly limitations: readonly string[];
}

// ---------------------------------------------------------------------------
// Decision (decision.schema.json)
// ---------------------------------------------------------------------------

export type DecisionDomain = "change" | "cleanup";

export type ChangeOutcome =
  | "NO_TEST_SUPPORTED"
  | "EXISTING_EVIDENCE_SUFFICIENT"
  | "EXISTING_TEST_UPDATE_CANDIDATE"
  | "NEW_TEST_CANDIDATE"
  | "INSUFFICIENT_EVIDENCE";

export type CleanupOutcome =
  | "KEEP"
  | "MERGE_CANDIDATE"
  | "DELETE_CANDIDATE"
  | "MOVE_CANDIDATE"
  | "INSUFFICIENT_EVIDENCE";

export type DecisionOutcome = ChangeOutcome | CleanupOutcome;

export type GateAction =
  | "allow"
  | "advise"
  | "request_remediation"
  | "deny_tool";

export type DecisionConfidence = "high" | "medium" | "low" | "unknown";

export type TargetScope =
  | "static"
  | "narrow"
  | "component"
  | "integration"
  | "contract"
  | "system"
  | "production";

export type TargetPurpose =
  | "functional"
  | "regression"
  | "acceptance"
  | "smoke"
  | "security"
  | "performance"
  | "resilience"
  | "accessibility"
  | "compatibility"
  | "migration"
  | "recovery"
  | "compliance";

export type TargetTechnique =
  | "example"
  | "parameterized"
  | "property"
  | "fuzz"
  | "metamorphic"
  | "combinatorial"
  | "model_based"
  | "differential"
  | "snapshot"
  | "mutation"
  | "static_analysis"
  | "existing_evidence";

export type TargetCadence =
  | "per_edit"
  | "completion"
  | "pull_request"
  | "nightly"
  | "release"
  | "production";

export interface DecisionTarget {
  readonly scope: TargetScope | null;
  readonly purpose: TargetPurpose | null;
  readonly technique: TargetTechnique | null;
  readonly cadence: TargetCadence | null;
  readonly failure_class: string | null;
  readonly test_path: string | null;
}

export interface CleanupRequirements {
  readonly structural_signal_ids: readonly string[];
  readonly independent_signal_ids: readonly string[];
  readonly protected_check_passed: boolean;
  readonly human_approval_required: boolean;
}

export interface Decision {
  readonly schema_version: "1.0";
  readonly id: string;
  readonly domain: DecisionDomain;
  readonly outcome: DecisionOutcome;
  readonly gate_action: GateAction;
  readonly confidence: DecisionConfidence;
  readonly reason_code: string;
  readonly summary: string;
  readonly rationale: string;
  readonly remediation: string | null;
  readonly obligation_candidate_ids: readonly string[];
  readonly evidence_ids: readonly string[];
  readonly target: DecisionTarget;
  readonly cleanup_requirements: CleanupRequirements | null;
  readonly limitations: readonly string[];
}

// ---------------------------------------------------------------------------
// Evidence record (evidence.schema.json)
// ---------------------------------------------------------------------------

export type EvidenceKind =
  | "git_diff"
  | "ast_fact"
  | "declared_policy"
  | "failing_test"
  | "historical_fault"
  | "contract"
  | "runner_inventory"
  | "coverage"
  | "mutation"
  | "runtime"
  | "flake"
  | "counterfactual"
  | "semantic_inference"
  | "user_context"
  | "capability";

export type EvidenceStatus =
  | "observed"
  | "available"
  | "unavailable"
  | "failed"
  | "partial";

export type EvidenceGateTrust = "eligible" | "advisory_only" | "not_evidence";

export interface EvidenceFinding {
  readonly code: string;
  readonly summary: string;
  readonly paths: readonly string[];
}

export interface EvidenceSource {
  readonly tool: string;
  readonly version: string | null;
  readonly path: string | null;
  readonly command_fingerprint: string | null;
  readonly observed_at: string;
}

export interface EvidenceRecord {
  readonly schema_version: "1.0";
  readonly id: string;
  readonly kind: EvidenceKind;
  readonly status: EvidenceStatus;
  readonly source: EvidenceSource;
  readonly findings: readonly EvidenceFinding[];
  readonly data: Readonly<Record<string, unknown>>;
  readonly gate_trust: EvidenceGateTrust;
  readonly limitations: readonly string[];
}

/** Policy enforcement mode (config.schema.json `mode`). */
export type PolicyMode = "advisory" | "balanced" | "strict";
