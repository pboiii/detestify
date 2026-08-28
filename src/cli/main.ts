import { Command, CommanderError } from "commander";
import { EXIT_CODES, type ExitCode } from "./exit-codes.js";
import { runDoctor } from "./commands/doctor.js";

interface CommandOptions {
  readonly repo?: string;
  readonly config?: string;
  readonly report?: string;
  readonly json?: string;
}

function addCommonOptions(command: Command): Command {
  return command
    .option("--repo <path>", "repository path")
    .option("--config <path>", "inert JSON configuration path")
    .option("--report <path>", "write the report to this path")
    .option("--json <path|->", "write JSON to a path or stdout");
}

function unavailableCommand(name: string): (options: CommandOptions) => never {
  return (options) => {
    const jsonOnly = options.json === "-";
    const message = `${name} is not implemented in milestone M0.`;
    (jsonOnly ? process.stderr : process.stdout).write(`${message}\n`);
    throw new CommanderError(
      EXIT_CODES.UNSUPPORTED_REPOSITORY,
      "test-steward.notImplemented",
      message,
    );
  };
}

export function createProgram(): Command {
  const program = new Command()
    .name("test-steward")
    .description("Evidence-backed test portfolio policy CLI")
    .version("0.0.0-alpha.0")
    .showSuggestionAfterError()
    .exitOverride();

  addCommonOptions(program.command("plan").description("Plan test evidence"))
    .requiredOption("--diff", "analyze the current diff")
    .action(unavailableCommand("plan --diff"));
  addCommonOptions(
    program.command("verify-change").description("Verify a completed change"),
  ).action(unavailableCommand("verify-change"));
  addCommonOptions(
    program.command("inventory").description("Inventory repository tests"),
  ).action(unavailableCommand("inventory"));
  addCommonOptions(
    program.command("audit").description("Audit the test portfolio"),
  ).action(unavailableCommand("audit"));
  addCommonOptions(
    program.command("cleanup-plan").description("Plan read-only cleanup"),
  ).action(unavailableCommand("cleanup-plan"));
  addCommonOptions(
    program.command("doctor").description("Check local compatibility"),
  ).action(async (options: CommandOptions) => {
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
    return error.code === "test-steward.notImplemented"
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
      error.code !== "commander.helpDisplayed"
    ) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
    }
    return exitCode;
  }
}
