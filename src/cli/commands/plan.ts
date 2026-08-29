import { CommanderError } from "commander";
import { EXIT_CODES } from "../exit-codes.js";
import type { CommandOptions } from "../options.js";

export async function run(_options: CommandOptions): Promise<void> {
  const message = "plan is not implemented yet.";
  process.stderr.write(`${message}\n`);
  throw new CommanderError(
    EXIT_CODES.UNSUPPORTED_REPOSITORY,
    "test-steward.notImplemented",
    message,
  );
}
