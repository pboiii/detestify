import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entry = fileURLToPath(new URL("../src/hooks/entry.ts", import.meta.url));
const testPath = fileURLToPath(
  new URL("../src/analysis/test-path.ts", import.meta.url),
);
const schemas = new URL("../schemas/", import.meta.url);
const schemaFiles = (await readdir(schemas)).filter((name) =>
  name.endsWith(".schema.json"),
);
const roots = ["claude", "openai"].map(
  (host) => new URL(`../plugins/${host}/`, import.meta.url),
);
const check = process.argv.includes("--check");

function withoutCertificationClaims(source) {
  const result = source
    .replaceAll("certified host", "supported host")
    .replaceAll(
      "certification applies to the Codex workflow and CLI",
      "hooks apply only to Codex workflows that load this plugin",
    )
    .replaceAll(
      "certified package specifications",
      "host package specifications",
    );
  if (/certif(?:ied|ication)/i.test(result)) {
    throw new Error(
      "Plugin text must not claim host certification before live proof.",
    );
  }
  return result;
}

async function copyPluginText(source, destination) {
  await writeFile(
    destination,
    withoutCertificationClaims(await readFile(source, "utf8")),
  );
}

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "eof",
  banner: {
    js: 'import { createRequire } from "node:module"; import { fileURLToPath as runtimeFileURLToPath } from "node:url"; import { dirname as runtimeDirname } from "node:path"; const require = createRequire(import.meta.url); const __filename = runtimeFileURLToPath(import.meta.url); const __dirname = runtimeDirname(__filename);',
  },
  metafile: true,
  write: false,
  plugins: [
    {
      name: "plugin-runtime-paths",
      setup(build) {
        build.onResolve({ filter: /(?:^|\/)tests\.js$/ }, ({ importer }) =>
          [
            "/src/analysis/change-classifier.ts",
            "/src/evidence/verdict.ts",
          ].some((suffix) => importer.endsWith(suffix))
            ? { path: testPath }
            : undefined,
        );
        build.onLoad(
          { filter: /src\/core\/schemas\/index\.ts$/ },
          async ({ path }) => {
            const source = await readFile(path, "utf8");
            const contents = source.replace(
              'new URL("../../../schemas/", import.meta.url)',
              'new URL("../schemas/", import.meta.url)',
            );
            if (contents === source) {
              throw new Error("Could not rewrite the bundled schema path.");
            }
            return { contents, loader: "ts" };
          },
        );
      },
    },
  ],
});
const runtime = result.outputFiles[0].text;

if (check) {
  for (const root of roots) {
    const bundled = await readFile(new URL("runtime/entry.js", root), "utf8");
    if (bundled !== runtime) {
      throw new Error(
        `${fileURLToPath(new URL("runtime/entry.js", root))} is stale; run npm run build.`,
      );
    }
  }
  process.exit(0);
}

for (const root of roots) {
  await rm(new URL("runtime/", root), { recursive: true, force: true });
  await rm(new URL("schemas/", root), { recursive: true, force: true });
  await rm(new URL("skills/test-steward/", root), {
    recursive: true,
    force: true,
  });
  await rm(new URL("skills/detestify/", root), {
    recursive: true,
    force: true,
  });
  await rm(new URL("bin/test-steward-hook", root), { force: true });
  await mkdir(new URL("runtime/", root), { recursive: true });
  await mkdir(new URL("schemas/", root), { recursive: true });
  await writeFile(new URL("runtime/entry.js", root), runtime);
  await Promise.all(
    schemaFiles.map((name) =>
      copyPluginText(new URL(name, schemas), new URL(`schemas/${name}`, root)),
    ),
  );
  await mkdir(new URL("skills/detestify/", root), { recursive: true });
  await copyPluginText(
    new URL("../skills/detestify/SKILL.md", import.meta.url),
    new URL("skills/detestify/SKILL.md", root),
  );
  await chmod(new URL("bin/detestify-hook", root), 0o755);
}
