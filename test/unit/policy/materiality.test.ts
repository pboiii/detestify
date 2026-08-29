// Ordinal materiality table (spec/policy/materiality-tables.md): the
// change-domain worked examples must map to their documented tiers, and no
// combination of inputs may ever produce deny_tool from materiality alone.

import { describe, expect, it } from "vitest";
import {
  allowedGateAction,
  assignTier,
  maximumGateBehavior,
} from "../../../src/core/materiality/index.js";
import type {
  Consequence,
  ChangeMechanism,
  EvidenceGap,
  Exposure,
  MaterialityConfidence,
  MaterialityTier,
  PolicyMode,
  Provenance,
} from "../../../src/core/model/index.js";

interface WorkedExample {
  readonly name: string;
  readonly axes: [
    Consequence,
    Exposure,
    ChangeMechanism,
    EvidenceGap,
    MaterialityConfidence,
  ];
  readonly distinct: boolean;
  readonly tier: MaterialityTier;
}

const workedExamples: readonly WorkedExample[] = [
  {
    name: "1: README wording",
    axes: ["negligible", "internal", "no_behavior", "none", "explicit"],
    distinct: false,
    tier: "T0",
  },
  {
    name: "2: executable docs command",
    axes: ["degraded", "user_facing", "boundary", "partial", "derived"],
    distinct: true,
    tier: "T2",
  },
  {
    name: "3: AST-equivalent extraction",
    axes: ["negligible", "internal", "no_behavior", "none", "derived"],
    distinct: false,
    tier: "T0",
  },
  {
    name: "4: refactor churns test internals",
    axes: ["negligible", "internal", "pure_behavior", "partial", "derived"],
    distinct: true,
    tier: "T1",
  },
  {
    name: "5: claim/release strands retries",
    axes: [
      "irreversible",
      "cross_system",
      "stateful_or_irreversible",
      "material",
      "derived",
    ],
    distinct: true,
    tier: "T3",
  },
  {
    name: "6: middleware wiring changed",
    axes: ["degraded", "adversarial", "boundary", "material", "observed"],
    distinct: true,
    tier: "T4",
  },
  {
    name: "9: static similarity only",
    axes: ["degraded", "user_facing", "pure_behavior", "unknown", "unknown"],
    distinct: true,
    tier: "TU",
  },
  {
    name: "10: auth-looking name, everything inferred/unknown",
    axes: [
      "regulated_or_safety_critical",
      "adversarial",
      "boundary",
      "unknown",
      "inferred",
    ],
    distinct: true,
    tier: "TU",
  },
];

describe("assignTier", () => {
  for (const example of workedExamples) {
    it(`worked example ${example.name} -> ${example.tier}`, () => {
      const [
        consequence,
        exposure,
        change_mechanism,
        evidence_gap,
        confidence,
      ] = example.axes;
      expect(
        assignTier({
          axes: {
            consequence,
            exposure,
            change_mechanism,
            evidence_gap,
            confidence,
          },
          distinctChangedObligation: example.distinct,
        }),
      ).toBe(example.tier);
    });
  }

  it("adversarial gap with only derived confidence has no T4 row and lands on TU", () => {
    expect(
      assignTier({
        axes: {
          consequence: "degraded",
          exposure: "adversarial",
          change_mechanism: "boundary",
          evidence_gap: "material",
          confidence: "derived",
        },
        distinctChangedObligation: true,
      }),
    ).toBe("TU");
  });
});

describe("gate behavior", () => {
  it("tier ceilings match the table", () => {
    expect(maximumGateBehavior("T0")).toBe("allow");
    expect(maximumGateBehavior("T1")).toBe("advise");
    expect(maximumGateBehavior("T2")).toBe("request_remediation");
    expect(maximumGateBehavior("T3")).toBe("request_remediation");
    expect(maximumGateBehavior("T4")).toBe("request_remediation");
    expect(maximumGateBehavior("TU")).toBe("advise");
  });

  it("never produces deny_tool for any tier/provenance/mode combination", () => {
    const tiers: MaterialityTier[] = ["T0", "T1", "T2", "T3", "T4", "TU"];
    const provenances: Provenance[] = [
      "declared",
      "observed",
      "derived",
      "inferred",
      "unknown",
    ];
    const modes: PolicyMode[] = ["advisory", "balanced", "strict"];
    for (const tier of tiers) {
      for (const provenance of provenances) {
        for (const mode of modes) {
          for (const gateEligible of [true, false]) {
            expect(
              allowedGateAction({ tier, provenance, mode, gateEligible }),
            ).not.toBe("deny_tool");
          }
        }
      }
    }
  });
});
