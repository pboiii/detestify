// Optional coverage/mutation capability negotiation: detect availability
// inertly, and turn a requested-but-absent capability into a limitation plus
// a schema-valid capability evidence record — never into an inferred pass
// (CLI contract: missing optional evidence becomes a limitation).

import type { EvidenceRecord } from "../core/model/index.js";
import { probeCoverage } from "./coverage/index.js";
import { probeMutation } from "./mutation/index.js";

export type CapabilityAvailability =
  | "available"
  | "unavailable"
  | "not_requested";

export interface OptionalEvidenceNegotiation {
  readonly coverage: CapabilityAvailability;
  readonly mutation: CapabilityAvailability;
  /** One capability evidence record per requested-but-absent capability. */
  readonly evidence: readonly EvidenceRecord[];
  readonly limitations: readonly string[];
}

export interface NegotiationInput {
  readonly coverageRequested: boolean;
  readonly mutationRequested: boolean;
  readonly observedAt: string;
  readonly idPrefix: string;
}

function absenceEvidence(
  capability: "coverage" | "mutation",
  reason: string,
  input: NegotiationInput,
): EvidenceRecord {
  return {
    schema_version: "1.0",
    id: `${input.idPrefix}-${capability}`,
    kind: "capability",
    status: "unavailable",
    source: {
      tool: "test-steward-capabilities",
      version: null,
      path: null,
      command_fingerprint: null,
      observed_at: input.observedAt,
    },
    findings: [
      {
        code: `${capability.toUpperCase()}_UNAVAILABLE`,
        summary: reason,
        paths: [],
      },
    ],
    data: { capability, requested: true, available: false },
    gate_trust: "not_evidence",
    limitations: [reason],
  };
}

/**
 * Negotiate optional coverage/mutation evidence. Requested capabilities are
 * probed inertly; absence becomes `unavailable` plus a limitation and an
 * evidence record. Unrequested capabilities report `not_requested`.
 */
export function negotiateOptionalEvidence(
  input: NegotiationInput,
): OptionalEvidenceNegotiation {
  const evidence: EvidenceRecord[] = [];
  const limitations: string[] = [];

  let coverage: CapabilityAvailability = "not_requested";
  if (input.coverageRequested) {
    const probe = probeCoverage();
    coverage = "unavailable";
    limitations.push(probe.reason);
    evidence.push(absenceEvidence("coverage", probe.reason, input));
  }

  let mutation: CapabilityAvailability = "not_requested";
  if (input.mutationRequested) {
    const probe = probeMutation();
    mutation = "unavailable";
    limitations.push(probe.reason);
    evidence.push(absenceEvidence("mutation", probe.reason, input));
  }

  return { coverage, mutation, evidence, limitations };
}
