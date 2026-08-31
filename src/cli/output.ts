import { writePrivateJsonAtomic } from "../security/state.js";

export async function writeJsonReport(
  outputPath: string,
  value: unknown,
): Promise<void> {
  try {
    await writePrivateJsonAtomic(outputPath, value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Report I/O error: ${message}`, { cause: error });
  }
}
