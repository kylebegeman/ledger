import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./documents.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export interface LedgerDocumentIntegrity {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly path: string;
  readonly algorithm: "sha256";
  readonly hash: string;
  readonly bytes: number;
}

export interface LedgerIntegrityReport {
  readonly version: 1;
  readonly generatedAt: string;
  readonly project: string;
  readonly algorithm: "sha256";
  readonly catalogHash: string;
  readonly documents: readonly LedgerDocumentIntegrity[];
}

export interface WrittenIntegrityArtifacts {
  readonly indexPath: string;
  readonly reportPath: string;
}

export function buildIntegrityReport(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): LedgerIntegrityReport {
  const documentHashes = documents
    .map((document) => ({
      id: stringValue(document.frontmatter.id),
      kind: document.kind,
      title: stringValue(document.frontmatter.title),
      path: normalizePath(document.relativePath),
      algorithm: "sha256" as const,
      hash: sha256(document.raw),
      bytes: Buffer.byteLength(document.raw, "utf8"),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: workspace.config.project,
    algorithm: "sha256",
    catalogHash: sha256(
      documentHashes.map((document) => `${document.path}\0${document.hash}`).join("\n"),
    ),
    documents: documentHashes,
  };
}

export async function writeIntegrityArtifacts(
  workspace: LedgerWorkspace,
  report: LedgerIntegrityReport,
): Promise<WrittenIntegrityArtifacts> {
  const indexDirectory = path.join(workspace.projectRoot, workspace.config.indexes.output);
  const reportDirectory = path.join(workspace.projectRoot, workspace.config.reports.output);
  const indexPath = path.join(indexDirectory, "integrity.json");
  const reportPath = path.join(reportDirectory, "integrity.md");
  await mkdir(indexDirectory, { recursive: true });
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(reportPath, formatIntegrityReport(report), "utf8");
  return {
    indexPath: normalizePath(path.relative(workspace.projectRoot, indexPath)),
    reportPath: normalizePath(path.relative(workspace.projectRoot, reportPath)),
  };
}

export function formatIntegrityReport(report: LedgerIntegrityReport): string {
  const lines = [
    "# Ledger Integrity Report",
    "",
    `Project: \`${report.project}\``,
    `Generated: \`${report.generatedAt}\``,
    `Algorithm: \`${report.algorithm}\``,
    `Catalog hash: \`${report.catalogHash}\``,
    "",
    "## Documents",
    "",
    ...report.documents.map((document) =>
      `- \`${document.hash}\` ${document.id} ${document.title} (${document.path}, ${document.bytes} bytes)`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
