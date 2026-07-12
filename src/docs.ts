import { readdir } from "node:fs/promises";
import path from "node:path";
import { normalizeDocument, normalizePath } from "./documents.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { LedgerError } from "./machine.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import type {
  LedgerDocsAudit,
  LedgerDocsClassification,
  LedgerDocsFile,
  LedgerDocsRoutingManifest,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export async function auditDocs(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): Promise<LedgerDocsAudit> {
  const docsRoot = normalizePath(workspace.config.docs.root);
  const docsRootAbsolutePath = await resolveSafeProjectPath(
    workspace.projectRoot,
    docsRoot,
    "docs root",
  );
  const docsFiles = (await findFiles(docsRootAbsolutePath, {
    maxDepth: workspace.config.limits.maxDirectoryDepth,
    maxFiles: workspace.config.limits.maxDocuments,
  })).map((filePath) =>
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
  const scratchDocs = files
    .filter((file) => file.classification === "scratch")
    .map((file) => file.path);
  const generatedDocs = files
    .filter((file) => file.classification === "generated")
    .map((file) => file.path);
  const unknownDocs = files
    .filter((file) => file.classification === "unknown")
    .map((file) => file.path);

  return {
    docsRoot,
    adoption: workspace.config.docs.adoption,
    files,
    referencedDocs,
    missingReferences,
    unreferencedDocs,
    scratchDocs,
    generatedDocs,
    unknownDocs,
  };
}

export async function writeDocsAuditReport(
  workspace: LedgerWorkspace,
  audit: LedgerDocsAudit,
): Promise<void> {
  await applyFileTransaction(workspace, "write docs audit report", [
    {
      path: normalizePath(`${workspace.config.reports.output}/docs-audit.md`),
      content: formatDocsAuditReport(audit),
    },
  ]);
}

export function buildDocsRoutingManifest(audit: LedgerDocsAudit): LedgerDocsRoutingManifest {
  return {
    version: 1,
    generatedBy: "ledger",
    generatedAt: new Date().toISOString(),
    docsRoot: audit.docsRoot,
    routes: audit.files
      .filter((file) => file.classification !== "generated")
      .map((file) => ({
        path: file.path,
        classification: file.classification,
      })),
  };
}

export async function writeDocsRoutingManifest(
  workspace: LedgerWorkspace,
  manifest: LedgerDocsRoutingManifest,
): Promise<string> {
  const manifestPath = normalizePath(workspace.config.docs.routing.manifest);
  await applyFileTransaction(workspace, "write docs routing manifest", [
    { path: manifestPath, content: `${JSON.stringify(manifest, null, 2)}\n` },
  ]);
  return manifestPath;
}

export async function writeDocsStartHere(
  workspace: LedgerWorkspace,
  audit: LedgerDocsAudit,
): Promise<string> {
  const startHerePath = normalizePath(workspace.config.docs.routing.startHere);
  await applyFileTransaction(workspace, "write docs start here", [
    { path: startHerePath, content: formatDocsStartHere(audit) },
  ]);
  return startHerePath;
}

export async function writeDocsRoutingFiles(
  workspace: LedgerWorkspace,
  audit: LedgerDocsAudit,
  manifest: LedgerDocsRoutingManifest,
): Promise<{ readonly manifestPath: string; readonly startHerePath: string }> {
  const manifestPath = normalizePath(workspace.config.docs.routing.manifest);
  const startHerePath = normalizePath(workspace.config.docs.routing.startHere);
  await applyFileTransaction(workspace, "reconcile docs routing", [
    { path: manifestPath, content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: startHerePath, content: formatDocsStartHere(audit) },
  ]);
  return { manifestPath, startHerePath };
}

export async function writeDocsMigrationReport(
  workspace: LedgerWorkspace,
  audit: LedgerDocsAudit,
): Promise<string> {
  const reportPath = normalizePath(`${workspace.config.reports.output}/docs-migration.md`);
  await applyFileTransaction(workspace, "write docs migration report", [
    { path: reportPath, content: formatDocsMigrationReport(audit) },
  ]);
  return reportPath;
}

export function formatDocsAuditReport(audit: LedgerDocsAudit): string {
  const byClassification = countByClassification(audit.files);
  const lines = [
    "# Ledger Docs Audit",
    "",
    `Docs root: \`${audit.docsRoot}\``,
    `Adoption: \`${audit.adoption}\``,
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
    `- Scratch docs: ${audit.scratchDocs.length}`,
    `- Generated docs: ${audit.generatedDocs.length}`,
    `- Unknown docs: ${audit.unknownDocs.length}`,
    "",
    "## Missing References",
    "",
    ...listOrNone(audit.missingReferences),
    "",
    "## Unreferenced Durable Docs",
    "",
    ...listOrNone(audit.unreferencedDocs),
    "",
    "## Scratch Docs",
    "",
    ...listOrNone(audit.scratchDocs),
    "",
    "## Generated Docs",
    "",
    ...listOrNone(audit.generatedDocs),
    "",
    "## Unknown Docs",
    "",
    ...listOrNone(audit.unknownDocs),
    "",
    "## Files",
    "",
    ...audit.files.map((file) => `- ${file.classification}: \`${file.path}\``),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function formatDocsStartHere(audit: LedgerDocsAudit): string {
  const durableDocs = audit.files
    .filter((file) => file.classification === "durable")
    .map((file) => file.path);
  const routingDocs = audit.files
    .filter((file) => file.classification === "routing")
    .map((file) => file.path)
    .filter((filePath) => !filePath.endsWith("/START_HERE.md"));

  const lines = [
    "# Start Here",
    "",
    "This file is generated by Ledger from the docs audit.",
    "",
    `Docs adoption mode: \`${audit.adoption}\`.`,
    "",
    "## Durable Docs",
    "",
    ...listOrNone(durableDocs),
    "",
    "## Agent Routing Docs",
    "",
    ...listOrNone(routingDocs),
    "",
    "## Docs Needing Attention",
    "",
    `- Missing references: ${audit.missingReferences.length}`,
    `- Unreferenced durable docs: ${audit.unreferencedDocs.length}`,
    `- Scratch docs: ${audit.scratchDocs.length}`,
    `- Generated docs: ${audit.generatedDocs.length}`,
    `- Unknown docs: ${audit.unknownDocs.length}`,
    "",
    "## Generated Outputs",
    "",
    "- The configured routing manifest contains machine-readable routing metadata.",
    "- The configured reports directory contains the latest full docs audit.",
    "- The configured reports directory contains migration guidance when generated.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function formatDocsMigrationReport(audit: LedgerDocsAudit): string {
  const durableDocs = audit.files
    .filter((file) => file.classification === "durable")
    .map((file) => file.path);
  const routingDocs = audit.files
    .filter((file) => file.classification === "routing")
    .map((file) => file.path);
  const lines = [
    "# Ledger Docs Migration Report",
    "",
    `Docs root: \`${audit.docsRoot}\``,
    `Adoption: \`${audit.adoption}\``,
    "",
    "## Recommended Actions",
    "",
    ...migrationActions(audit),
    "",
    "## Durable Docs",
    "",
    ...listOrNone(durableDocs),
    "",
    "## Routing Docs",
    "",
    ...listOrNone(routingDocs),
    "",
    "## Scratch Docs",
    "",
    ...listOrNone(audit.scratchDocs),
    "",
    "## Generated Docs",
    "",
    ...listOrNone(audit.generatedDocs),
    "",
    "## Unknown Docs",
    "",
    ...listOrNone(audit.unknownDocs),
    "",
    "## Missing Ledger References",
    "",
    ...listOrNone(audit.missingReferences),
    "",
    "## Unreferenced Durable Docs",
    "",
    ...listOrNone(audit.unreferencedDocs),
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

export function classifyDocsPaths(
  filePaths: readonly string[],
  docsRoot = "docs",
): readonly LedgerDocsFile[] {
  return filePaths.map((filePath) => ({
    path: normalizePath(filePath),
    classification: classifyDocsFile(filePath, docsRoot),
  }));
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

async function findFiles(
  directory: string,
  options: { readonly maxDepth: number; readonly maxFiles: number },
  depth = 0,
): Promise<readonly string[]> {
  if (depth > options.maxDepth) {
    throw new LedgerError(
      "resource-limit-exceeded",
      `Docs nesting exceeds ${options.maxDepth} directories: ${directory}`,
      { kind: "docs-directory-depth", limit: options.maxDepth },
    );
  }
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isCode(error, "ENOENT")) return [];
    throw error;
  }
  const results: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findFiles(absolutePath, options, depth + 1)));
    } else if (entry.isFile()) {
      results.push(absolutePath);
    }
    if (results.length > options.maxFiles) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `Docs file limit exceeded (${options.maxFiles})`,
        { kind: "docs-files", limit: options.maxFiles },
      );
    }
  }

  return results.sort();
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
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

function migrationActions(audit: LedgerDocsAudit): readonly string[] {
  const actions: string[] = [];
  if (audit.missingReferences.length > 0) {
    actions.push("- Create or correct missing docs referenced by Ledger records.");
  }
  if (audit.unreferencedDocs.length > 0) {
    actions.push("- Link unreferenced durable docs from relevant Ledger records or archive them.");
  }
  if (audit.scratchDocs.length > 0) {
    actions.push("- Promote useful scratch docs into durable docs or delete stale scratch work.");
  }
  if (audit.generatedDocs.length > 0) {
    actions.push("- Keep generated docs out of source review unless they are intentional artifacts.");
  }
  if (audit.unknownDocs.length > 0) {
    actions.push("- Move unknown docs into a durable, routing, scratch, or generated location.");
  }
  return actions.length > 0 ? actions : ["- No docs migration actions detected."];
}
