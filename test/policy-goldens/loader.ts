import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface GoldenPair {
  readonly name: string;
  readonly input: unknown;
  readonly expected: unknown;
}

export async function loadGoldenPairs(dir: string): Promise<GoldenPair[]> {
  const entries = await readdir(dir);
  const inputs = entries.filter((e) => e.endsWith(".input.json")).sort();
  const pairs: GoldenPair[] = [];
  for (const inputFile of inputs) {
    const base = inputFile.replace(/\.input\.json$/, "");
    const expectedFile = `${base}.expected.json`;
    if (!entries.includes(expectedFile)) continue;
    const inputRaw = await readFile(path.join(dir, inputFile), "utf8");
    const expectedRaw = await readFile(path.join(dir, expectedFile), "utf8");
    pairs.push({
      name: base,
      input: JSON.parse(inputRaw) as unknown,
      expected: JSON.parse(expectedRaw) as unknown,
    });
  }
  return pairs;
}
