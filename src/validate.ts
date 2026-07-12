import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCoveragePattern, matchesGlob } from "./coverage.js";
import { normalizeDocument, normalizePath, stringArrayValue } from "./documents.js";
import { isSafeProjectRelativePath, resolveProjectPath } from "./projectPaths.js";
import { applyFileTransaction } from "./fileTransaction.js";
import type {
  LedgerIssue,
  LedgerIssueLevel,
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
  "tags",
  "decisions",
  "backlog",
  "supersedes",
  "related",
  "docs",
  "docsImpact",
  "entries",
  "staleRefs",
  "stale_refs",
]);

export interface ValidateDocumentsOptions {
  readonly currentOnly?: boolean;
  readonly baseline?: ReadonlySet<string>;
}

export function validateDocuments(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: ValidateDocumentsOptions = {},
): LedgerValidationResult {
  const issues: LedgerIssue[] = [];
  const ids = new Map<string, string>();

  for (const document of documents) {
    const normalized = normalizeDocument(document);
    if (options.currentOnly && normalized.status === "historical") continue;

    const pathLabel = document.relativePath;
    const warningLevel = validationWarningLevel(workspace);

    requireString(issues, pathLabel, normalized.id, "id");
    requireString(issues, pathLabel, normalized.title, "title");
    requireString(issues, pathLabel, normalized.date, "date");
    requireString(issues, pathLabel, normalized.status, "status");

    if (normalized.id) {
      const existingPath = ids.get(normalized.id);
      if (existingPath) {
        issues.push({
          level: "error",
          code: "duplicate-id",
          path: pathLabel,
          message: `duplicate id ${normalized.id}; first seen in ${existingPath}`,
        });
      } else {
        ids.set(normalized.id, pathLabel);
      }
    }

    if (!document.frontmatter.kind) {
      issues.push({
        level: warningLevel,
        code: "quality",
        path: pathLabel,
        message: `missing kind; inferred ${document.kind}`,
      });
    }

    if (normalized.areas.length === 0) {
      issues.push({
        level: warningLevel,
        code: "quality",
        path: pathLabel,
        message: "areas is empty",
      });
    }

    if (!normalized.updated) {
      issues.push({
        level: warningLevel,
        code: "quality",
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
        level: warningLevel,
        code: "quality",
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
          code: "missing-section",
          path: pathLabel,
          message: `missing required section "${section}"`,
        });
      }
    }

    if (workspace.config.validation.requireVerification && document.kind === "change") {
      const verification = document.sections.find((section) => section.title === "Verification");
      if (!verification || verification.body.trim().length < 5) {
        issues.push({
          level: warningLevel,
          code: "quality",
          path: pathLabel,
          message: "verification section is empty or too short",
        });
      }
    }

    if (workspace.config.validation.requireInvariants && document.kind === "change") {
      const invariants = document.sections.find((section) => section.title === "Invariants");
      if (!invariants || invariants.body.trim().length < 5) {
        issues.push({
          level: warningLevel,
          code: "quality",
          path: pathLabel,
          message: "invariants section is empty or too short",
        });
      }
    }

    warnUnknownFrontmatterFields(issues, pathLabel, document.frontmatter, workspace);
    validateConfiguredExtensions(issues, pathLabel, document.frontmatter, workspace);
    warnMissingPathReferences(
      workspace,
      issues,
      pathLabel,
      normalized.status,
      acknowledgedStaleRefs(document.frontmatter),
      "files",
      normalized.files,
    );
    warnMissingPathReferences(
      workspace,
      issues,
      pathLabel,
      normalized.status,
      acknowledgedStaleRefs(document.frontmatter),
      "docs",
      normalized.docs,
    );
  }

  const suppressed = options.baseline
    ? issues.filter((issue) => issue.level === "warning" && options.baseline?.has(issueKey(issue)))
    : [];
  const suppressedKeys = new Set(suppressed.map(issueKey));
  const activeIssues = issues.filter((issue) => !suppressedKeys.has(issueKey(issue)));
  const errors = activeIssues.filter((issue) => issue.level === "error");
  const warnings = activeIssues.filter((issue) => issue.level === "warning");
  return { issues: activeIssues, errors, warnings, suppressed };
}

function warnUnknownFrontmatterFields(
  issues: LedgerIssue[],
  pathLabel: string,
  frontmatter: Record<string, unknown>,
  workspace: LedgerWorkspace,
): void {
  const allowed = new Set([
    ...workspace.config.schema.allowedFrontmatterFields,
    ...Object.keys(workspace.config.schema.extensions),
  ]);
  for (const field of Object.keys(frontmatter).sort()) {
    if (knownFrontmatterFields.has(field)) continue;
    if (allowed.has(field)) continue;
    issues.push({
      level: validationWarningLevel(workspace),
      code: "unknown-frontmatter",
      path: pathLabel,
      field,
      message: `unknown frontmatter field "${field}"`,
    });
  }
}

function validateConfiguredExtensions(
  issues: LedgerIssue[],
  pathLabel: string,
  frontmatter: Record<string, unknown>,
  workspace: LedgerWorkspace,
): void {
  for (const [field, type] of Object.entries(workspace.config.schema.extensions)) {
    const value = frontmatter[field];
    if (value === undefined) continue;
    if (matchesSchemaType(value, type)) continue;
    issues.push({
      level: "error",
      code: "invalid-extension",
      path: pathLabel,
      field,
      message: `frontmatter field "${field}" must be ${type}`,
    });
  }
}

function warnMissingPathReferences(
  workspace: LedgerWorkspace,
  issues: LedgerIssue[],
  pathLabel: string,
  status: string,
  staleRefs: ReadonlySet<string>,
  fieldName: "files" | "docs",
  filePaths: readonly string[],
): void {
  if (workspace.config.validation.ignoreMissingRefsForStatuses.includes(status)) return;

  for (const filePath of filePaths) {
    const normalized = normalizePath(filePath);
    const referencePath = normalized.replace(/^(?:glob|prefix):/, "");
    if (!isSafeProjectRelativePath(referencePath)) {
      issues.push({
        level: "error",
        code: "unsafe-reference",
        path: pathLabel,
        field: fieldName,
        target: normalized,
        message: `${fieldName} reference must stay inside the project: ${normalized}`,
      });
      continue;
    }
    if (isIgnoredPath(workspace, normalized)) continue;
    if (isCoveragePattern(normalized)) continue;
    if (staleRefs.has(normalized) || staleRefs.has(`${fieldName}:${normalized}`)) continue;
    if (existsSync(resolveProjectPath(workspace.projectRoot, normalized, `${fieldName} reference`))) continue;
    issues.push({
      level: validationWarningLevel(workspace),
      code: "missing-reference",
      path: pathLabel,
      field: fieldName,
      target: normalized,
      message: `${fieldName} reference does not exist: ${normalized}`,
    });
  }
}

function isIgnoredPath(workspace: LedgerWorkspace, filePath: string): boolean {
  return workspace.config.git.ignore.some((pattern) => matchesGlob(filePath, pattern));
}

function acknowledgedStaleRefs(frontmatter: Record<string, unknown>): ReadonlySet<string> {
  const refs = [
    ...stringArrayValue(frontmatter.staleRefs),
    ...stringArrayValue(frontmatter.stale_refs),
  ].map(normalizePath);
  return new Set(refs);
}

function validationWarningLevel(workspace: LedgerWorkspace): LedgerIssueLevel {
  return workspace.config.validation.profile === "strict" ? "error" : "warning";
}

function matchesSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "string[]":
      return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    default:
      return false;
  }
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
    `Suppressed warnings: ${result.suppressed.length}`,
    "",
  ];

  if (result.issues.length === 0 && result.suppressed.length === 0) {
    lines.push("No issues found.", "");
    return lines.join("\n");
  }

  if (result.issues.length > 0) {
    lines.push("## Active Issues", "");
  }
  for (const issue of result.issues) {
    const location = issue.path ? `${issue.path}: ` : "";
    lines.push(`- ${issue.level.toUpperCase()}: ${location}${issue.message}`);
  }
  if (result.suppressed.length > 0) {
    lines.push("", "## Suppressed By Baseline", "");
    for (const issue of result.suppressed) {
      const location = issue.path ? `${issue.path}: ` : "";
      lines.push(`- ${issue.level.toUpperCase()}: ${location}${issue.message}`);
    }
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
    code: "missing-frontmatter",
    path: pathLabel,
    field: fieldName,
    message: `missing required frontmatter field "${fieldName}"`,
  });
}

export function issueKey(issue: LedgerIssue): string {
  return [
    issue.level,
    issue.code ?? "",
    issue.path ?? "",
    issue.field ?? "",
    issue.target ?? "",
    issue.message,
  ].join("|");
}

export async function readValidationBaseline(
  workspace: LedgerWorkspace,
): Promise<ReadonlySet<string>> {
  const baselinePath = path.join(workspace.projectRoot, workspace.config.validation.baseline);
  try {
    const raw = await readFile(baselinePath, "utf8");
    const parsed = JSON.parse(raw) as { readonly issues?: unknown };
    if (!Array.isArray(parsed.issues)) return new Set();
    return new Set(parsed.issues.filter((issue): issue is string => typeof issue === "string"));
  } catch {
    return new Set();
  }
}

export async function writeValidationBaseline(
  workspace: LedgerWorkspace,
  result: LedgerValidationResult,
): Promise<string> {
  const baselinePath = workspace.config.validation.baseline;
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    issues: result.warnings.map(issueKey).sort(),
  };
  await applyFileTransaction(workspace, "update validation baseline", [
    { path: baselinePath, content: `${JSON.stringify(payload, null, 2)}\n` },
  ]);
  return normalizePath(baselinePath);
}
