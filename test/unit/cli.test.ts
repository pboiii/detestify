import { describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.js";
import { EXIT_CODES } from "../../src/cli/exit-codes.js";
import { CLI_VERSION } from "../../src/cli/version.js";

vi.mock("../../src/cli/commands/plan.js", () => {
  throw new Error("plan command loaded before its action");
});

vi.spyOn(process.stderr, "write").mockImplementation(() => true);
const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

describe("CLI exit behavior", () => {
  it("prints version and help without loading command modules", async () => {
    await expect(main(["node", "detestify", "--version"])).resolves.toBe(
      EXIT_CODES.OK,
    );
    expect(stdout).toHaveBeenCalledWith(`${CLI_VERSION}\n`);

    stdout.mockClear();
    await expect(main(["node", "detestify", "--help"])).resolves.toBe(
      EXIT_CODES.OK,
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("Usage: detestify"),
    );
  });

  it("returns the stable usage code for invalid arguments", async () => {
    await expect(main(["node", "detestify", "--invalid"])).resolves.toBe(
      EXIT_CODES.USAGE_ERROR,
    );
  });

  it("returns CONFIG_INVALID for unsafe inert configuration", async () => {
    await expect(
      main(["node", "detestify", "doctor", "--config", "package.json"]),
    ).resolves.toBe(EXIT_CODES.CONFIG_INVALID);
  });

  it("returns REPORT_IO_ERROR when a report cannot be written", async () => {
    await expect(
      main([
        "node",
        "detestify",
        "doctor",
        "--report",
        "/dev/null/report.json",
      ]),
    ).resolves.toBe(EXIT_CODES.REPORT_IO_ERROR);
  });
});
