import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeDocument, normalizePath } from "./documents.js";
import type {
  LedgerIndexes,
  LedgerManifest,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export function buildIndexes(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): LedgerIndexes {
  const normalized = documents.map(normalizeDocument);
  const manifest: LedgerManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: workspace.config.project,
    projectRoot: workspace.projectRoot,
    documents: normalized,
  };

  return {
    manifest,
    byFile: groupByMany(normalized, (document) => document.files),
    byArea: groupByMany(normalized, (document) => document.areas),
    byRelease: groupByMany(normalized, (document) =>
      document.release ? [document.release] : [],
    ),
    bySymbol: groupByMany(normalized, (document) => document.symbols),
  };
}

export async function writeIndexes(
  workspace: LedgerWorkspace,
  indexes: LedgerIndexes,
): Promise<void> {
  const outputDirectory = path.join(workspace.projectRoot, workspace.config.indexes.output);
  await mkdir(outputDirectory, { recursive: true });
  await writeJson(path.join(outputDirectory, "manifest.json"), indexes.manifest);
  await writeJson(path.join(outputDirectory, "by-file.json"), indexes.byFile);
  await writeJson(path.join(outputDirectory, "by-area.json"), indexes.byArea);
  await writeJson(path.join(outputDirectory, "by-release.json"), indexes.byRelease);
  await writeJson(path.join(outputDirectory, "by-symbol.json"), indexes.bySymbol);
}

export function explainFile(
  documents: readonly ParsedLedgerDocument[],
  filePath: string,
): readonly NormalizedLedgerDocument[] {
  const normalizedPath = normalizePath(filePath);
  return documents
    .map(normalizeDocument)
    .filter((document) =>
      document.files.some(
        (candidate) =>
          candidate === normalizedPath ||
          candidate.endsWith(`/${normalizedPath}`) ||
          normalizedPath.endsWith(`/${candidate}`),
      ),
    );
}

function groupByMany(
  documents: readonly NormalizedLedgerDocument[],
  selectKeys: (document: NormalizedLedgerDocument) => readonly string[],
): Record<string, readonly string[]> {
  const groups = new Map<string, string[]>();

  for (const document of documents) {
    for (const rawKey of selectKeys(document)) {
      const key = normalizePath(rawKey);
      const group = groups.get(key) ?? [];
      group.push(document.id);
      groups.set(key, group);
    }
  }

  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, ids]) => [key, ids.sort()]),
  );
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
