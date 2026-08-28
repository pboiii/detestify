import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import type {
  Ajv2020 as Ajv2020Type,
  AnySchema,
  ErrorObject,
  ValidateFunction,
} from "ajv/dist/2020.js";

const Ajv2020 = Ajv2020Module.default;

export const SCHEMA_FILES = [
  "cleanup-plan.schema.json",
  "config.schema.json",
  "decision.schema.json",
  "evidence.schema.json",
  "hook-io.schema.json",
  "obligation-candidate.schema.json",
  "report.schema.json",
] as const;

export type SchemaFile = (typeof SCHEMA_FILES)[number];

const schemaDirectory = fileURLToPath(
  new URL("../../../schemas/", import.meta.url),
);

export async function loadSchemas(): Promise<Map<SchemaFile, AnySchema>> {
  const schemas = new Map<SchemaFile, AnySchema>();

  await Promise.all(
    SCHEMA_FILES.map(async (name) => {
      const source = await readFile(path.join(schemaDirectory, name), "utf8");
      schemas.set(name, JSON.parse(source) as AnySchema);
    }),
  );

  return schemas;
}

export async function createSchemaValidator(): Promise<Ajv2020Type> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
  });
  ajv.addFormat("date-time", (value: string) => {
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) && !Number.isNaN(Date.parse(value))
    );
  });

  for (const schema of (await loadSchemas()).values()) {
    ajv.addSchema(schema);
  }

  return ajv;
}

export async function getValidator(
  schemaFile: SchemaFile,
): Promise<ValidateFunction> {
  const ajv = await createSchemaValidator();
  const schema = (await loadSchemas()).get(schemaFile);
  if (schema === undefined) {
    throw new Error(`Packaged schema not found: ${schemaFile}`);
  }

  const schemaId =
    typeof schema === "object" &&
    schema !== null &&
    "$id" in schema &&
    typeof schema.$id === "string"
      ? schema.$id
      : undefined;
  const validate = schemaId === undefined ? undefined : ajv.getSchema(schemaId);
  if (validate === undefined) {
    throw new Error(`Packaged schema did not register: ${schemaFile}`);
  }

  return validate;
}

export function formatSchemaErrors(
  errors: ErrorObject[] | null | undefined,
): string {
  return (errors ?? [])
    .map(
      (error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`,
    )
    .join("; ");
}
