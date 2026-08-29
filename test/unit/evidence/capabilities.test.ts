import { describe, expect, it } from "vitest";
import { negotiateOptionalEvidence } from "../../../src/evidence/capabilities.js";
import { probeCoverage } from "../../../src/evidence/coverage/index.js";
import { probeMutation } from "../../../src/evidence/mutation/index.js";
import { getValidator } from "../../../src/core/schemas/index.js";

const OBSERVED_AT = "2026-08-28T00:00:00Z";

describe("optional capability negotiation", () => {
  it("unrequested capabilities report not_requested with no evidence", () => {
    const negotiation = negotiateOptionalEvidence({
      coverageRequested: false,
      mutationRequested: false,
      observedAt: OBSERVED_AT,
      idPrefix: "cap",
    });
    expect(negotiation.coverage).toBe("not_requested");
    expect(negotiation.mutation).toBe("not_requested");
    expect(negotiation.evidence).toHaveLength(0);
    expect(negotiation.limitations).toHaveLength(0);
  });

  it("requested-but-absent capabilities become unavailable plus a limitation", async () => {
    const negotiation = negotiateOptionalEvidence({
      coverageRequested: true,
      mutationRequested: true,
      observedAt: OBSERVED_AT,
      idPrefix: "cap",
    });
    expect(negotiation.coverage).toBe("unavailable");
    expect(negotiation.mutation).toBe("unavailable");
    expect(negotiation.limitations).toHaveLength(2);
    expect(negotiation.evidence).toHaveLength(2);

    const validate = await getValidator("evidence.schema.json");
    for (const record of negotiation.evidence) {
      expect(validate(record), JSON.stringify(validate.errors)).toBe(true);
      expect(record.kind).toBe("capability");
      expect(record.status).toBe("unavailable");
      expect(record.gate_trust).toBe("not_evidence");
      expect(record.limitations.length).toBeGreaterThan(0);
    }
  });

  it("alpha probes are inert and always absent", () => {
    expect(probeCoverage().available).toBe(false);
    expect(probeMutation().available).toBe(false);
  });
});
