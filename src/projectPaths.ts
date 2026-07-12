import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export class UnsafeProjectPathError extends Error {
  readonly code = "unsafe-project-path";

  constructor(
    readonly label: string,
    readonly value: string,
    reason: string,
  ) {
    super(`${label} must stay inside the project root: ${value} (${reason})`);
    this.name = "UnsafeProjectPathError";
  }
}

export function normalizeProjectRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function assertSafeProjectRelativePath(value: string, label = "path"): string {
  const normalized = normalizeProjectRelativePath(value);
  if (normalized.includes("\0")) {
    throw new UnsafeProjectPathError(label, value, "null bytes are not allowed");
  }
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) {
    throw new UnsafeProjectPathError(label, value, "absolute paths are not allowed");
  }
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    throw new UnsafeProjectPathError(label, value, "parent traversal is not allowed");
  }
  return normalized;
}

export function isSafeProjectRelativePath(value: string): boolean {
  try {
    assertSafeProjectRelativePath(value);
    return true;
  } catch {
    return false;
  }
}

export function resolveProjectPath(
  projectRoot: string,
  relativePath: string,
  label = "path",
): string {
  const normalized = assertSafeProjectRelativePath(relativePath, label);
  const root = path.resolve(projectRoot);
  const candidate = path.resolve(root, normalized);
  if (!isPathInside(root, candidate)) {
    throw new UnsafeProjectPathError(label, relativePath, "resolved path escapes the project");
  }
  return candidate;
}

export async function assertNoEscapingSymlink(
  projectRoot: string,
  candidatePath: string,
  label = "path",
): Promise<void> {
  const root = path.resolve(projectRoot);
  const candidate = path.resolve(candidatePath);
  if (!isPathInside(root, candidate)) {
    throw new UnsafeProjectPathError(label, candidatePath, "resolved path escapes the project");
  }

  const realRoot = await realpath(root);
  let current = candidate;
  while (isPathInside(root, current)) {
    try {
      await lstat(current);
      const resolved = await realpath(current);
      if (!isPathInside(realRoot, resolved)) {
        throw new UnsafeProjectPathError(label, candidatePath, "a symlink resolves outside the project");
      }
      return;
    } catch (error) {
      if (error instanceof UnsafeProjectPathError) throw error;
      if (!isMissingPathError(error)) throw error;
      if (current === root) return;
      current = path.dirname(current);
    }
  }
}

export async function resolveSafeProjectPath(
  projectRoot: string,
  relativePath: string,
  label = "path",
): Promise<string> {
  const candidate = resolveProjectPath(projectRoot, relativePath, label);
  await assertNoEscapingSymlink(projectRoot, candidate, label);
  return candidate;
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function isMissingPathError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}
