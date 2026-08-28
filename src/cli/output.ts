import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function writeJsonReport(
  outputPath: string,
  value: unknown,
): Promise<void> {
  const destination = path.resolve(outputPath);
  const directory = path.dirname(destination);
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );

  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await file.sync();
      await file.close();
      await rename(temporary, destination);
    } catch (error) {
      await file.close().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Report I/O error: ${message}`, { cause: error });
  }
}
