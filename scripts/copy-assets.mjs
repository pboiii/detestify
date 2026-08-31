import { chmod, cp, mkdir, rm } from "node:fs/promises";
import "./build-plugins.mjs";

await Promise.all(
  [
    "test-steward.js",
    "test-steward.d.ts",
    "test-steward.js.map",
    "test-steward.d.ts.map",
  ].map((file) =>
    rm(new URL(`../dist/bin/${file}`, import.meta.url), { force: true }),
  ),
);
await mkdir(new URL("../dist/schemas/", import.meta.url), { recursive: true });
await cp(
  new URL("../schemas/", import.meta.url),
  new URL("../dist/schemas/", import.meta.url),
  { recursive: true },
);
await chmod(new URL("../dist/bin/detestify.js", import.meta.url), 0o755);
await rm(new URL("../dist/scripts/", import.meta.url), {
  recursive: true,
  force: true,
});
