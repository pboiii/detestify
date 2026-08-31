import { Command, CommanderError } from "commander";
import { EXIT_CODES, type ExitCode } from "./exit-codes.js";
import type { CommandOptions } from "./options.js";
import { CLI_VERSION } from "./version.js";

function addCommonOptions(command: Command): Command {
  return command
    .option("--repo <path>", "repository path")
    .option("--config <path>", "inert JSON configuration path")
    .option("--report <path>", "write the report to this path")
    .option("--json <path|->", "write JSON to a path or stdout");
}

export function createProgram(): Command {
  const program = new Command()
    .name("detestify")
    .description("Evidence-backed test portfolio policy CLI")
    .version(CLI_VERSION)
    .showSuggestionAfterError()
    .exitOverride();

  addCommonOptions(program.command("plan").description("Plan test evidence"))
    .requiredOption("--diff", "analyze the current diff")
    .option("--base <revision>", "base revision for the diff")
    .action(async (options: CommandOptions) =>
      (await import("./commands/plan.js")).run(options),
    );
  addCommonOptions(
    program.command("verify-change").description("Verify a completed change"),
  )
    .option("--base <revision>", "base revision for the diff")
    .action(async (options: CommandOptions) =>
      (await import("./commands/verify-change.js")).run(options),
    );
  addCommonOptions(
    program.command("inventory").description("Inventory repository tests"),
  ).action(async (options: CommandOptions) =>
    (await import("./commands/inventory.js")).run(options),
  );
  addCommonOptions(
    program.command("audit").description("Audit the test portfolio"),
  ).action(async (options: CommandOptions) =>
    (await import("./commands/audit.js")).run(options),
  );
  addCommonOptions(
    program.command("cleanup-plan").description("Plan read-only cleanup"),
  )
    .option(
      "--historical-faults <manifest>",
      "repository-owned inert historical-fault manifest",
    )
    .option("--candidate <id>", "cleanup candidate to validate")
    .option(
      "--exclude-test <path...>",
      "candidate test path(s) excluded from the retained suite",
    )
    .action(async (options: CommandOptions) =>
      (await import("./commands/cleanup-plan.js")).run(options),
    );
  addCommonOptions(
    program.command("doctor").description("Check local compatibility"),
  ).action(async (options: CommandOptions) => {
    const { runDoctor } = await import("./commands/doctor.js");
    const report = await runDoctor(options);
    if (options.json === "-") {
      process.stdout.write(`${JSON.stringify(report)}\n`);
      return;
    }

    const decision = (report as { decisions: [{ summary: string }] })
      .decisions[0];
    process.stdout.write(`Doctor: ${decision.summary}\n`);
    if (options.report !== undefined) {
      process.stdout.write(`Report: ${options.report}\n`);
    }
    if (options.json !== undefined) {
      process.stdout.write(`JSON: ${options.json}\n`);
    }
  });

  return program;
}

function classifyError(error: unknown): ExitCode {
  if (error instanceof CommanderError) {
    if (
      error.code === "commander.helpDisplayed" ||
      error.code === "commander.version"
    ) {
      return EXIT_CODES.OK;
    }
    return error.code === "detestify.notImplemented"
      ? (error.exitCode as ExitCode)
      : EXIT_CODES.USAGE_ERROR;
  }
  if (error instanceof Error) {
    if (
      error instanceof SyntaxError ||
      error.message.startsWith("Configuration") ||
      error.message.startsWith("Path escapes") ||
      error.message.startsWith("M0 doctor accepts")
    ) {
      return EXIT_CODES.CONFIG_INVALID;
    }
    if (error.message.startsWith("Doctor report failed schema validation")) {
      return EXIT_CODES.SCHEMA_CONTRACT_ERROR;
    }
    if (error.message.startsWith("Report I/O error:")) {
      return EXIT_CODES.REPORT_IO_ERROR;
    }
  }
  return EXIT_CODES.INTERNAL_ERROR;
}

export async function main(
  argv: readonly string[] = process.argv,
): Promise<ExitCode> {
  try {
    await createProgram().parseAsync(argv);
    return EXIT_CODES.OK;
  } catch (error) {
    const exitCode = classifyError(error);
    if (
      !(error instanceof CommanderError) ||
      (error.code !== "commander.helpDisplayed" &&
        error.code !== "commander.version")
    ) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
    }
    return exitCode;
  }
}
