import { existsSync } from "node:fs";
import { readUtf8FileLimited } from "./boundedFile.js";
import { isCoveragePattern, matchesGlob } from "./coverage.js";
import { normalizeDocument, normalizeKind, normalizePath, stringArrayValue } from "./documents.js";
import { isSafeProjectRelativePath, resolveProjectPath, resolveSafeProjectPath } from "./projectPaths.js";
import { applyFileTransaction } from "./fileTransaction.js";
import { LedgerError } from "./machine.js";
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
    validateDate(issues, pathLabel, normalized.date, "date");
    if (normalized.updated) validateDate(issues, pathLabel, normalized.updated, "updated");

    if (
      document.frontmatter.kind !== undefined &&
      normalizeKind(document.frontmatter.kind) === undefined
    ) {
      issues.push({
        level: "error",
        code: "invalid-frontmatter",
        path: pathLabel,
        field: "kind",
        message: `invalid document kind "${String(document.frontmatter.kind)}"`,
      });
    }

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
  const reportPath = normalizePath(`${workspace.config.reports.output}/latest-validation.md`);
  await applyFileTransaction(workspace, "write validation report", [
    { path: reportPath, content: formatValidationReport(result) },
  ]);
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
  if (value.trim().length > 0) return;
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
  const baselinePath = await resolveSafeProjectPath(
    workspace.projectRoot,
    workspace.config.validation.baseline,
    "validation baseline",
  );
  try {
    const raw = await readUtf8FileLimited(
      baselinePath,
      workspace.config.limits.maxTotalDocumentBytes,
      "validation baseline",
    );
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      (parsed as { readonly version?: unknown }).version !== 1 ||
      !Array.isArray((parsed as { readonly issues?: unknown }).issues) ||
      !(parsed as { readonly issues: readonly unknown[] }).issues.every(
        (issue) => typeof issue === "string",
      )
    ) {
      throw invalidValidationBaseline(baselinePath);
    }
    const issues = (parsed as { readonly issues: readonly string[] }).issues;
    const maxIssues = workspace.config.limits.maxDocuments * 20;
    if (issues.length > maxIssues) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `Validation baseline exceeds ${maxIssues} issues`,
        { kind: "validation-baseline-issues", limit: maxIssues },
      );
    }
    return new Set(issues);
  } catch (error) {
    if (isCode(error, "ENOENT")) return new Set();
    if (error instanceof SyntaxError) throw invalidValidationBaseline(baselinePath);
    throw error;
  }
}

function validateDate(
  issues: LedgerIssue[],
  pathLabel: string,
  value: string,
  field: "date" | "updated",
): void {
  if (!value || isCalendarDate(value)) return;
  issues.push({
    level: "error",
    code: "invalid-frontmatter",
    path: pathLabel,
    field,
    message: `frontmatter field "${field}" must be a valid YYYY-MM-DD date`,
  });
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function invalidValidationBaseline(filePath: string): LedgerError {
  return new LedgerError(
    "validation-baseline-invalid",
    `Invalid validation baseline: ${filePath}`,
    { path: filePath },
  );
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
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
