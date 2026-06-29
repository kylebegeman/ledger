import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeDocument, normalizePath } from "./documents.js";
import type {
  LedgerDocsAudit,
  LedgerDocsClassification,
  LedgerDocsFile,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export async function auditDocs(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): Promise<LedgerDocsAudit> {
  const docsRoot = normalizePath(workspace.config.docs.root);
  const docsRootAbsolutePath = path.join(workspace.projectRoot, docsRoot);
  const docsFiles = (await findFiles(docsRootAbsolutePath)).map((filePath) =>
    normalizePath(path.relative(workspace.projectRoot, filePath)),
  );
  const files = docsFiles.map((filePath) => ({
    path: filePath,
    classification: classifyDocsFile(filePath, docsRoot),
  }));
  const existingDocs = new Set(files.map((file) => file.path));
  const referencedDocs = collectReferencedDocs(documents, docsRoot);
  const missingReferences = referencedDocs.filter((filePath) => !existingDocs.has(filePath));
  const referencedSet = new Set(referencedDocs);
  const unreferencedDocs = files
    .filter((file) => file.classification === "durable")
    .map((file) => file.path)
    .filter((filePath) => !referencedSet.has(filePath));

  return {
    docsRoot,
    files,
    referencedDocs,
    missingReferences,
    unreferencedDocs,
  };
}

export async function writeDocsAuditReport(
  workspace: LedgerWorkspace,
  audit: LedgerDocsAudit,
): Promise<void> {
  const reportDirectory = path.join(workspace.projectRoot, workspace.config.reports.output);
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    path.join(reportDirectory, "docs-audit.md"),
    formatDocsAuditReport(audit),
    "utf8",
  );
}

export function formatDocsAuditReport(audit: LedgerDocsAudit): string {
  const byClassification = countByClassification(audit.files);
  const lines = [
    "# Ledger Docs Audit",
    "",
    `Docs root: \`${audit.docsRoot}\``,
    "",
    "## Summary",
    "",
    `- Files: ${audit.files.length}`,
    `- Durable: ${byClassification.durable ?? 0}`,
    `- Routing: ${byClassification.routing ?? 0}`,
    `- Scratch: ${byClassification.scratch ?? 0}`,
    `- Generated: ${byClassification.generated ?? 0}`,
    `- Unknown: ${byClassification.unknown ?? 0}`,
    `- Ledger references: ${audit.referencedDocs.length}`,
    `- Missing references: ${audit.missingReferences.length}`,
    `- Unreferenced durable docs: ${audit.unreferencedDocs.length}`,
    "",
    "## Missing References",
    "",
    ...listOrNone(audit.missingReferences),
    "",
    "## Unreferenced Durable Docs",
    "",
    ...listOrNone(audit.unreferencedDocs),
    "",
    "## Files",
    "",
    ...audit.files.map((file) => `- ${file.classification}: \`${file.path}\``),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function classifyDocsFile(
  filePath: string,
  docsRoot = "docs",
): LedgerDocsClassification {
  const normalized = normalizePath(filePath);
  const prefix = `${normalizePath(docsRoot).replace(/\/$/, "")}/`;
  const relative = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  const segments = relative.split("/");

  if (segments[0] === "llm") return "routing";
  if (segments.some((segment) => segment === "scratch" || segment === "scratchpad")) {
    return "scratch";
  }
  if (
    normalized.endsWith(".html") ||
    normalized.endsWith(".json") ||
    normalized.includes("/generated/")
  ) {
    return "generated";
  }
  if (
    ["README.md", "product", "architecture", "operations", "api", "guides", "reference"].includes(
      segments[0] ?? "",
    )
  ) {
    return "durable";
  }
  if (segments.length === 1 && relative.endsWith(".md")) {
    return "durable";
  }
  return "unknown";
}

function collectReferencedDocs(
  documents: readonly ParsedLedgerDocument[],
  docsRoot: string,
): readonly string[] {
  const prefix = `${normalizePath(docsRoot).replace(/\/$/, "")}/`;
  const refs = new Set<string>();

  for (const document of documents) {
    const normalized = normalizeDocument(document);
    for (const filePath of [...normalized.docs, ...normalized.files]) {
      const normalizedPath = normalizePath(filePath);
      if (normalizedPath === docsRoot || normalizedPath.startsWith(prefix)) {
        refs.add(normalizedPath);
      }
    }
  }

  return [...refs].sort();
}

async function findFiles(directory: string): Promise<readonly string[]> {
  if (!(await pathExists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findFiles(absolutePath)));
    } else if (entry.isFile()) {
      results.push(absolutePath);
    }
  }

  return results.sort();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function countByClassification(
  files: readonly LedgerDocsFile[],
): Partial<Record<LedgerDocsClassification, number>> {
  const counts: Partial<Record<LedgerDocsClassification, number>> = {};
  for (const file of files) {
    counts[file.classification] = (counts[file.classification] ?? 0) + 1;
  }
  return counts;
}

function listOrNone(values: readonly string[]): readonly string[] {
  if (values.length === 0) return ["None."];
  return values.map((value) => `- \`${value}\``);
}
