import { createHash, randomUUID } from "node:crypto";
import { constants, realpathSync, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function canonicalExistingPath(target: string): string {
  let current = path.resolve(target);
  const remainder: string[] = [];
  while (true) {
    try {
      return path.join(realpathSync(current), ...remainder.reverse());
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw error;
      }
      remainder.push(path.basename(current));
      current = parent;
    }
  }
}

/** Private, repository-keyed state directory outside repository content. */
export function repositoryStateDirectory(repoRoot: string): string {
  const repository = canonicalExistingPath(repoRoot);
  const configured = process.env.DETESTIFY_STATE_DIR;
  const xdg = process.env.XDG_STATE_HOME;
  let base: string;
  if (configured !== undefined) {
    if (!path.isAbsolute(configured)) {
      throw new Error("DETESTIFY_STATE_DIR must be an absolute path.");
    }
    base = path.resolve(configured);
  } else if (xdg !== undefined && xdg !== "") {
    if (!path.isAbsolute(xdg)) {
      throw new Error("XDG_STATE_HOME must be an absolute path.");
    }
    base = path.join(path.resolve(xdg), "detestify");
  } else {
    base = path.join(homedir(), ".local", "state", "detestify");
  }

  if (isWithin(repository, canonicalExistingPath(base))) {
    throw new Error(
      "Detestify state directory must be outside the repository.",
    );
  }
  const slug =
    path.basename(repository).replace(/[^a-z0-9._-]/gi, "-") || "repository";
  const digest = createHash("sha256")
    .update(repository)
    .digest("hex")
    .slice(0, 16);
  return path.join(base, `${slug}-${digest}`);
}

interface SecurePath {
  readonly anchor: string;
  readonly target: string;
}

async function securePath(target: string): Promise<SecurePath> {
  const absolute = path.resolve(target);
  const bases = [homedir(), tmpdir()]
    .map((base) => path.resolve(base))
    .filter((base, index, all) => all.indexOf(base) === index)
    .sort((left, right) => right.length - left.length);
  for (const base of bases) {
    if (isWithin(base, absolute)) {
      const anchor = await realpath(base);
      return {
        anchor,
        target: path.resolve(anchor, path.relative(base, absolute)),
      };
    }
  }
  return { anchor: path.parse(absolute).root, target: absolute };
}

async function assertDirectoryChain(
  anchor: string,
  directory: string,
): Promise<void> {
  const relative = path.relative(anchor, directory);
  if (!isWithin(anchor, directory)) {
    throw new Error(`Path escapes its trusted directory: ${directory}`);
  }
  let current = anchor;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to use symlink parent: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`Path parent is not a directory: ${current}`);
      }
    } catch (error) {
      if (isMissing(error)) {
        return;
      }
      throw error;
    }
  }
}

async function assertPrivateDirectory(directory: string): Promise<void> {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(
      `Trusted state path is not a regular directory: ${directory}`,
    );
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`Trusted state directory is not private: ${directory}`);
  }
  if (process.getuid !== undefined && stat.uid !== process.getuid()) {
    throw new Error(
      `Trusted state directory is not owned by this user: ${directory}`,
    );
  }
}

async function assertPrivateDirectoryRange(
  root: string,
  directory: string,
): Promise<void> {
  await assertPrivateDirectory(root);
  let current = root;
  const relative = path.relative(root, directory);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    await assertPrivateDirectory(current);
  }
}

async function prepareDirectory(
  directory: string,
  trustedRoot?: string,
): Promise<{ readonly directory: string; readonly root: string | null }> {
  const resolved = await securePath(directory);
  await assertDirectoryChain(resolved.anchor, resolved.target);
  await mkdir(resolved.target, { recursive: true, mode: DIRECTORY_MODE });
  await assertDirectoryChain(resolved.anchor, resolved.target);

  if (trustedRoot === undefined) {
    return { directory: resolved.target, root: null };
  }
  const trusted = await securePath(trustedRoot);
  if (!isWithin(trusted.target, resolved.target)) {
    throw new Error(`Path escapes trusted state directory: ${directory}`);
  }
  await assertPrivateDirectoryRange(trusted.target, resolved.target);
  return { directory: resolved.target, root: trusted.target };
}

async function assertSafeTarget(target: string): Promise<void> {
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to write through a symlink: ${target}`);
    }
    if (!stat.isFile()) {
      throw new Error(`JSON target is not a regular file: ${target}`);
    }
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}

export async function writePrivateJsonAtomic(
  target: string,
  value: unknown,
  trustedRoot?: string,
): Promise<void> {
  const resolved = await securePath(target);
  const document = JSON.stringify(value, null, 2);
  if (document === undefined) {
    throw new Error("JSON value is not serializable.");
  }
  const prepared = await prepareDirectory(
    path.dirname(resolved.target),
    trustedRoot,
  );
  const destination = path.join(
    prepared.directory,
    path.basename(resolved.target),
  );
  const temporary = path.join(
    prepared.directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  await assertSafeTarget(destination);
  try {
    const handle = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      FILE_MODE,
    );
    try {
      await handle.writeFile(`${document}\n`, "utf8");
      await handle.chmod(FILE_MODE);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await assertDirectoryChain(resolved.anchor, prepared.directory);
    if (prepared.root !== null) {
      await assertPrivateDirectory(prepared.root);
    }
    await assertSafeTarget(destination);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function assertPrivateFile(stat: Stats, file: string, maxBytes: number): void {
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`State file is not a regular file: ${file}`);
  }
  if ((stat.mode & 0o077) !== 0 || stat.nlink !== 1) {
    throw new Error(`State file is not private: ${file}`);
  }
  if (process.getuid !== undefined && stat.uid !== process.getuid()) {
    throw new Error(`State file is not owned by this user: ${file}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`State file exceeds ${maxBytes} bytes: ${file}`);
  }
}

export async function readPrivateTextFile(
  target: string,
  trustedRoot: string,
  maxBytes: number,
): Promise<string | null> {
  const resolved = await securePath(target);
  const trusted = await securePath(trustedRoot);
  if (!isWithin(trusted.target, resolved.target)) {
    throw new Error(`Path escapes trusted state directory: ${target}`);
  }
  let before;
  try {
    before = await lstat(resolved.target);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
  await assertDirectoryChain(trusted.target, path.dirname(resolved.target));
  await assertPrivateDirectoryRange(
    trusted.target,
    path.dirname(resolved.target),
  );
  assertPrivateFile(before, resolved.target, maxBytes);
  const handle = await open(
    resolved.target,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const after = await handle.stat();
    assertPrivateFile(after, resolved.target, maxBytes);
    if (before.dev !== after.dev || before.ino !== after.ino) {
      throw new Error(`State file changed while opening: ${target}`);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export async function readPrivateDirectory(
  directory: string,
  trustedRoot: string,
): Promise<string[] | null> {
  const resolved = await securePath(directory);
  const trusted = await securePath(trustedRoot);
  if (!isWithin(trusted.target, resolved.target)) {
    throw new Error(`Path escapes trusted state directory: ${directory}`);
  }
  try {
    await assertDirectoryChain(trusted.target, resolved.target);
    await assertPrivateDirectoryRange(trusted.target, resolved.target);
    return await readdir(resolved.target);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

export async function withPrivateFileLock<T>(
  lockFile: string,
  trustedRoot: string,
  action: () => Promise<T>,
): Promise<T> {
  const resolved = await securePath(lockFile);
  const prepared = await prepareDirectory(
    path.dirname(resolved.target),
    trustedRoot,
  );
  const file = path.join(prepared.directory, path.basename(resolved.target));
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      handle = await open(
        file,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        FILE_MODE,
      );
      break;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        (error as NodeJS.ErrnoException).code !== "EEXIST"
      ) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    }
  }
  if (handle === null) {
    throw new Error(`Timed out acquiring state lock: ${lockFile}`);
  }
  try {
    await handle.chmod(FILE_MODE);
    return await action();
  } finally {
    await handle.close().catch(() => undefined);
    await rm(file, { force: true }).catch(() => undefined);
  }
}
