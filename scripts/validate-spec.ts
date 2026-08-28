import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { formatSchemaErrors, getValidator } from "../src/core/schemas/index.js";

const specRoot = path.resolve("spec");
const required = [
  "cli-contract.md",
  "handoff/IMPLEMENTATION_BRIEF.md",
  "handoff/milestones.md",
  "handoff/scaffold.md",
  "threat-model.md",
  "schemas/report.schema.json",
];

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? filesBelow(absolute) : [absolute];
      }),
    )
  ).flat();
}

for (const relative of required) {
  await readFile(path.join(specRoot, relative));
}

const files = await filesBelow(specRoot);
for (const file of files) {
  if (file.endsWith(".json")) {
    JSON.parse(await readFile(file, "utf8"));
  } else if (file.endsWith(".yaml") || file.endsWith(".yml")) {
    YAML.parse(await readFile(file, "utf8"));
  }
}

const expectedGoldens = files.filter((file) => file.endsWith(".expected.json"));
const validateDecision = await getValidator("decision.schema.json");
for (const file of expectedGoldens) {
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!validateDecision(value)) {
    throw new Error(
      `${path.relative(specRoot, file)} failed decision schema validation: ${formatSchemaErrors(validateDecision.errors)}`,
    );
  }
}

process.stdout.write(
  `PASS: parsed ${files.filter((file) => file.endsWith(".json")).length} JSON files, ${files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml")).length} YAML files, and validated ${expectedGoldens.length} policy decisions.\n`,
);
