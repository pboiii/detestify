import { describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.js";
import { EXIT_CODES } from "../../src/cli/exit-codes.js";

vi.spyOn(process.stderr, "write").mockImplementation(() => true);

describe("CLI exit behavior", () => {
  it("returns the stable usage code for invalid arguments", async () => {
    await expect(main(["node", "test-steward", "--invalid"])).resolves.toBe(
      EXIT_CODES.USAGE_ERROR,
    );
  });

  it("returns CONFIG_INVALID for unsafe inert configuration", async () => {
    await expect(
      main(["node", "test-steward", "doctor", "--config", "package.json"]),
    ).resolves.toBe(EXIT_CODES.CONFIG_INVALID);
  });

  it("returns REPORT_IO_ERROR when a report cannot be written", async () => {
    await expect(
      main([
        "node",
        "test-steward",
        "doctor",
        "--report",
        "/dev/null/report.json",
      ]),
    ).resolves.toBe(EXIT_CODES.REPORT_IO_ERROR);
  });
});
