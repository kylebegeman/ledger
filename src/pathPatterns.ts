/**
 * Path normalization and Ledger's coverage patterns, shared by Node and the
 * reader runtime (src/reader/runtime.ts), which bundles this module with
 * esbuild. Keep this file free of Node-only dependencies.
 */

export function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);

  if (normalizedPattern === "**") return true;
  if (normalizedPattern.endsWith("/**") && !normalizedPattern.startsWith("**/")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.startsWith("**/") && !normalizedPattern.slice(3).includes("*")) {
    const suffix = normalizedPattern.slice(3);
    return normalizedPath === suffix || normalizedPath.endsWith(`/${suffix}`);
  }
  if (normalizedPattern.includes("*")) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }
  return normalizedPath === normalizedPattern;
}

export function coveragePatternMatches(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.startsWith("glob:")) {
    return matchesGlob(normalizedPath, normalizedPattern.slice("glob:".length));
  }
  if (normalizedPattern.startsWith("prefix:")) {
    return matchesPrefix(normalizedPath, normalizedPattern.slice("prefix:".length));
  }
  if (normalizedPattern.endsWith("/")) {
    return matchesPrefix(normalizedPath, normalizedPattern);
  }
  if (normalizedPattern.includes("*")) {
    return matchesGlob(normalizedPath, normalizedPattern);
  }
  return normalizedPath === normalizedPattern;
}

export function isCoveragePattern(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return (
    normalized.startsWith("glob:") ||
    normalized.startsWith("prefix:") ||
    normalized.includes("*") ||
    normalized.endsWith("/")
  );
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else {
      source += escapeRegExp(character ?? "");
    }
  }
  source += "$";
  return new RegExp(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function matchesPrefix(filePath: string, prefix: string): boolean {
  const normalizedPrefix = normalizePath(prefix).replace(/\/$/, "");
  return filePath === normalizedPrefix || filePath.startsWith(`${normalizedPrefix}/`);
}
