import { describe, expect, it } from "vitest";
import { EXIT_CODES } from "../../src/cli/exit-codes.js";

describe("CLI exit-code contract", () => {
  it("matches the specification table entry by entry", () => {
    expect(EXIT_CODES).toEqual({
      OK: 0,
      USAGE_ERROR: 2,
      CONFIG_INVALID: 3,
      REPOSITORY_NOT_FOUND: 4,
      UNSUPPORTED_REPOSITORY: 5,
      TRUST_REQUIRED: 6,
      EXTERNAL_TOOL_UNAVAILABLE: 7,
      EXTERNAL_TOOL_FAILED: 8,
      REPORT_IO_ERROR: 9,
      TIMEOUT: 10,
      INTERRUPTED: 11,
      REMEDIATION_REQUIRED: 20,
      TOOL_DENIED: 21,
      SCHEMA_CONTRACT_ERROR: 22,
      INTERNAL_ERROR: 70,
    });
  });
});
