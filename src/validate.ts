import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { matchesGlob } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import type {
  LedgerIssue,
  LedgerValidationResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

const knownFrontmatterFields = new Set([
  "id",
  "kind",
  "title",
  "date",
  "updated",
  "status",
  "areas",
  "files",
  "symbols",
  "commits",
  "prs",
  "release",
  "decisions",
  "backlog",
  "supersedes",
  "related",
  "docs",
  "entries",
]);

export function validateDocuments(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): LedgerValidationResult {
  const issues: LedgerIssue[] = [];
  const ids = new Map<string, string>();

  for (const document of documents) {
    const normalized = normalizeDocument(document);
    const pathLabel = document.relativePath;

    requireString(issues, pathLabel, normalized.id, "id");
    requireString(issues, pathLabel, normalized.title, "title");
    requireString(issues, pathLabel, normalized.date, "date");
    requireString(issues, pathLabel, normalized.status, "status");
    warnUnknownFrontmatterFields(issues, pathLabel, document.frontmatter);

    if (normalized.id) {
      const existingPath = ids.get(normalized.id);
      if (existingPath) {
        issues.push({
          level: "error",
          path: pathLabel,
          message: `duplicate id ${normalized.id}; first seen in ${existingPath}`,
        });
      } else {
        ids.set(normalized.id, pathLabel);
      }
    }

    if (!document.frontmatter.kind) {
      issues.push({
        level: "warning",
        path: pathLabel,
        message: `missing kind; inferred ${document.kind}`,
      });
    }

    if (normalized.areas.length === 0) {
      issues.push({
        level: "warning",
        path: pathLabel,
        message: "areas is empty",
      });
    }

    if (!normalized.updated) {
      issues.push({
        level: "warning",
        path: pathLabel,
        message: "updated is missing",
      });
    }

    if (
      workspace.config.validation.requireChangedFiles &&
      document.kind === "change" &&
      normalized.files.length === 0
    ) {
      issues.push({
        level: "warning",
        path: pathLabel,
        message: "files is empty",
      });
    }

    const sectionTitles = new Set(document.sections.map((section) => section.title));
    const requiredSections = workspace.config.validation.requiredSections[document.kind] ?? [];
    for (const section of requiredSections) {
      if (!sectionTitles.has(section)) {
        issues.push({
          level: "error",
          path: pathLabel,
          message: `missing required section "${section}"`,
        });
      }
    }

    if (workspace.config.validation.requireVerification && document.kind === "change") {
      const verification = document.sections.find((section) => section.title === "Verification");
      if (!verification || verification.body.trim().length < 5) {
        issues.push({
          level: "warning",
          path: pathLabel,
          message: "verification section is empty or too short",
        });
      }
    }

    if (workspace.config.validation.requireInvariants && document.kind === "change") {
      const invariants = document.sections.find((section) => section.title === "Invariants");
      if (!invariants || invariants.body.trim().length < 5) {
        issues.push({
          level: "warning",
          path: pathLabel,
          message: "invariants section is empty or too short",
        });
      }
    }

    warnMissingPathReferences(workspace, issues, pathLabel, "files", normalized.files);
    warnMissingPathReferences(workspace, issues, pathLabel, "docs", normalized.docs);
  }

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  return { issues, errors, warnings };
}

function warnUnknownFrontmatterFields(
  issues: LedgerIssue[],
  pathLabel: string,
  frontmatter: Record<string, unknown>,
): void {
  for (const field of Object.keys(frontmatter).sort()) {
    if (knownFrontmatterFields.has(field)) continue;
    issues.push({
      level: "warning",
      path: pathLabel,
      message: `unknown frontmatter field "${field}"`,
    });
  }
}

function warnMissingPathReferences(
  workspace: LedgerWorkspace,
  issues: LedgerIssue[],
  pathLabel: string,
  fieldName: "files" | "docs",
  filePaths: readonly string[],
): void {
  for (const filePath of filePaths) {
    const normalized = normalizePath(filePath);
    if (isIgnoredPath(workspace, normalized)) continue;
    if (existsSync(path.join(workspace.projectRoot, normalized))) continue;
    issues.push({
      level: "warning",
      path: pathLabel,
      message: `${fieldName} reference does not exist: ${normalized}`,
    });
  }
}

function isIgnoredPath(workspace: LedgerWorkspace, filePath: string): boolean {
  return workspace.config.git.ignore.some((pattern) => matchesGlob(filePath, pattern));
}

export async function writeValidationReport(
  workspace: LedgerWorkspace,
  result: LedgerValidationResult,
): Promise<void> {
  const reportDirectory = path.join(workspace.projectRoot, workspace.config.reports.output);
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, "latest-validation.md");
  await writeFile(reportPath, formatValidationReport(result), "utf8");
}

export function formatValidationReport(result: LedgerValidationResult): string {
  const lines = [
    "# Ledger Validation Report",
    "",
    `Errors: ${result.errors.length}`,
    `Warnings: ${result.warnings.length}`,
    "",
  ];

  if (result.issues.length === 0) {
    lines.push("No issues found.", "");
    return lines.join("\n");
  }

  for (const issue of result.issues) {
    const location = issue.path ? `${issue.path}: ` : "";
    lines.push(`- ${issue.level.toUpperCase()}: ${location}${issue.message}`);
  }
  lines.push("");
  return lines.join("\n");
}

function requireString(
  issues: LedgerIssue[],
  pathLabel: string,
  value: string,
  fieldName: string,
): void {
  if (value.length > 0) return;
  issues.push({
    level: "error",
    path: pathLabel,
    message: `missing required frontmatter field "${fieldName}"`,
  });
}
