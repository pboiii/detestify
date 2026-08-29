// Policy-golden acceptance: every spec/handoff/policy-goldens pair runs
// through the real classifier determination + policy + materiality pipeline.
// The produced decision must deep-equal the expected decision (no ignorable
// fields: decisions carry no timestamps) and every produced document must
// validate against its frozen schema.

import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { decideGoldenInput } from "../../src/core/policy/goldens.js";
import {
  formatSchemaErrors,
  getValidator,
} from "../../src/core/schemas/index.js";
import { loadGoldenPairs, type GoldenPair } from "./loader.js";

const goldensDir = path.resolve("spec/handoff/policy-goldens");

let pairs: GoldenPair[] = [];
let validateDecision: ValidateFunction;
let validateObligation: ValidateFunction;
let validateEvidence: ValidateFunction;

beforeAll(async () => {
  pairs = await loadGoldenPairs(goldensDir);
  validateDecision = await getValidator("decision.schema.json");
  validateObligation = await getValidator("obligation-candidate.schema.json");
  validateEvidence = await getValidator("evidence.schema.json");
});

describe("policy goldens", () => {
  it("loads all 99 input/expected pairs", () => {
    expect(pairs).toHaveLength(99);
  });

  it("decides every golden case exactly and schema-valid", () => {
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      const { decision, obligation, evidence } = decideGoldenInput(pair.input);

      expect(decision, pair.name).toEqual(pair.expected);

      expect(
        validateDecision(decision),
        `${pair.name} decision: ${formatSchemaErrors(validateDecision.errors)}`,
      ).toBe(true);
      expect(
        validateEvidence(evidence),
        `${pair.name} evidence: ${formatSchemaErrors(validateEvidence.errors)}`,
      ).toBe(true);
      if (obligation !== null) {
        expect(
          validateObligation(obligation),
          `${pair.name} obligation: ${formatSchemaErrors(validateObligation.errors)}`,
        ).toBe(true);
      }

      // Referential integrity between the decision and its records.
      expect(decision.evidence_ids, pair.name).toContain(evidence.id);
      if (obligation !== null) {
        expect(decision.obligation_candidate_ids, pair.name).toContain(
          obligation.id,
        );
      } else {
        expect(decision.obligation_candidate_ids, pair.name).toEqual([]);
      }
    }
  });
});
