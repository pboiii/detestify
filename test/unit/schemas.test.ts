import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_FILES,
  createSchemaValidator,
  getValidator,
  loadSchemas,
} from "../../src/core/schemas/index.js";

const examples = path.resolve("schemas/examples");
const exampleSchemas: Record<string, (typeof SCHEMA_FILES)[number]> = {
  "cleanup-delete-candidate.json": "cleanup-plan.schema.json",
  "cleanup-static-only-merge.json": "cleanup-plan.schema.json",
  "config.valid.json": "config.schema.json",
  "decision-insufficient.json": "decision.schema.json",
  "decision-no-test.json": "decision.schema.json",
  "evidence-git-diff.json": "evidence.schema.json",
  "hook-decision-remediate.json": "hook-io.schema.json",
  "hook-invocation-stop.json": "hook-io.schema.json",
  "obligation-derived.json": "obligation-candidate.schema.json",
  "report-zero-config.json": "report.schema.json",
};

describe("packaged schemas", () => {
  it("loads every runtime schema outside spec", async () => {
    const schemas = await loadSchemas();
    expect([...schemas.keys()].sort()).toEqual([...SCHEMA_FILES].sort());
    await expect(createSchemaValidator()).resolves.toBeDefined();
  });

  it("validates every packaged example", async () => {
    const files = (await readdir(examples)).sort();
    expect(files).toEqual(Object.keys(exampleSchemas).sort());

    for (const file of files) {
      const validate = await getValidator(exampleSchemas[file]!);
      const value: unknown = JSON.parse(
        await readFile(path.join(examples, file), "utf8"),
      );
      expect(
        validate(value),
        `${file}: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  });
});
