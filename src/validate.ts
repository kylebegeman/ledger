import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { normalizeDocument } from "./documents.js";
import type {
  LedgerIssue,
  LedgerValidationResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

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
  }

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  return { issues, errors, warnings };
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
