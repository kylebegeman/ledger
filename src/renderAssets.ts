import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The static reader's stylesheet and browser runtime, built by esbuild from
 * src/reader into dist/reader and inlined into index.html so the reader keeps
 * working from a file: URL and under any static host. The sources are typed
 * modules with executed browser tests; nothing here is a template string.
 */

function readReaderAsset(name: string): string {
  // Resolve with path operations rather than the URL constructor so browser-like
  // test environments that replace the URL global cannot break the lookup.
  // The built asset comes first, so tests run from src/ embed exactly what ships.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, "..", "dist", "reader", name), path.join(here, "reader", name)];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  throw new Error(`Ledger reader asset ${name} is missing; run npm run build:reader`);
}

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT";
}

export const staticReaderStyles: string = readReaderAsset("styles.css").trimEnd();

export const staticReaderRuntime: string = readReaderAsset("runtime.js").trimEnd();
