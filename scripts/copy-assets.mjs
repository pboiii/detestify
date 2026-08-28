import { chmod, cp, mkdir, rm } from "node:fs/promises";

await mkdir(new URL("../dist/schemas/", import.meta.url), { recursive: true });
await cp(
  new URL("../schemas/", import.meta.url),
  new URL("../dist/schemas/", import.meta.url),
  { recursive: true },
);
await chmod(new URL("../dist/bin/test-steward.js", import.meta.url), 0o755);
await rm(new URL("../dist/scripts/", import.meta.url), {
  recursive: true,
  force: true,
});
