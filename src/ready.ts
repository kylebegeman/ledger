import { readKindTemplate } from "./authoring.js";
import { docsImpactDeclaration } from "./docsImpact.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { parseMarkdownWithFrontmatter } from "./frontmatter.js";
import { extractBullets, getSectionBody } from "./query.js";
import type {
  LedgerDocumentKind,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";
import { validateDocuments } from "./validate.js";

export type LedgerReadinessCode =
  | "validation"
  | "todo"
  | "template-placeholder"
  | "empty-section"
  | "missing-verification"
  | "missing-invariants"
  | "docs-impact";

export interface LedgerReadinessIssue {
  readonly code: LedgerReadinessCode;
  readonly message: string;
  /** One-based line number in the record when the issue points at a line. */
  readonly line?: number;
}

export interface LedgerReadinessRecord {
  readonly id: string;
  readonly path: string;
  readonly kind: LedgerDocumentKind;
  readonly status: string;
  readonly ready: boolean;
  readonly issues: readonly LedgerReadinessIssue[];
}

export interface LedgerReadinessReport {
  readonly ok: boolean;
  readonly checked: number;
  readonly ready: readonly string[];
  readonly notReady: readonly string[];
  readonly records: readonly LedgerReadinessRecord[];
}

export interface ReadinessSelection {
  /** Record ids or project-relative paths. When set, filters are ignored. */
  readonly targets?: readonly string[];
  /** Kind filter for the default selection. Defaults to change. */
  readonly kind?: LedgerDocumentKind;
  /** Status filter for the default selection. Defaults to draft. */
  readonly status?: string;
}

/** TODO markers: `TODO:`, `TODO -`, `TODO(`, or a bare TODO ending a line; prose about TODOs does not count. */
const todoPattern = /\bTODO(?=\s*[:(\-]|\s*$)/i;

/**
 * Check whether records are ready to land, as opposed to merely valid: no TODO
 * markers, no template placeholders left, sections filled in, verification and
 * invariants present, docs impact reviewed, and references resolving.
 */
export async function checkReadiness(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  selection: ReadinessSelection = {},
): Promise<LedgerReadinessReport> {
  const selected = selectRecords(documents, selection);
  const validation = validateDocuments(workspace, documents);
  const issuesByPath = new Map<string, string[]>();
  for (const issue of validation.issues) {
    if (!issue.path) continue;
    const key = normalizePath(issue.path);
    issuesByPath.set(key, [...(issuesByPath.get(key) ?? []), issue.message]);
  }
  const placeholders = new Map<LedgerDocumentKind, ReadonlySet<string>>();
  const docsRoot = normalizePath(workspace.config.docs.root);

  const records: LedgerReadinessRecord[] = [];
  for (const { parsed, normalized } of selected) {
    const issues: LedgerReadinessIssue[] = [];
    const path = normalizePath(parsed.relativePath);
    for (const message of issuesByPath.get(path) ?? []) {
      issues.push({ code: "validation", message });
    }

    let kindPlaceholders = placeholders.get(parsed.kind);
    if (!kindPlaceholders) {
      kindPlaceholders = templatePlaceholderLines(await readKindTemplate(workspace, parsed.kind));
      placeholders.set(parsed.kind, kindPlaceholders);
    }
    issues.push(...lineIssues(parsed.raw, kindPlaceholders));
    issues.push(...sectionIssues(workspace, parsed));
    if (parsed.kind === "change") {
      issues.push(...changeEntryIssues(workspace, parsed, normalized, docsRoot, kindPlaceholders));
    }

    records.push({
      id: normalized.id,
      path,
      kind: parsed.kind,
      status: normalized.status,
      ready: issues.length === 0,
      issues,
    });
  }

  const ready = records.filter((record) => record.ready).map((record) => record.id || record.path);
  const notReady = records.filter((record) => !record.ready).map((record) => record.id || record.path);
  return { ok: notReady.length === 0, checked: records.length, ready, notReady, records };
}

function selectRecords(
  documents: readonly ParsedLedgerDocument[],
  selection: ReadinessSelection,
): readonly { readonly parsed: ParsedLedgerDocument; readonly normalized: NormalizedLedgerDocument }[] {
  const all = documents.map((parsed) => ({ parsed, normalized: normalizeDocument(parsed) }));
  const targets = selection.targets?.map((target) => target.trim()).filter(Boolean) ?? [];
  if (targets.length > 0) {
    const wanted = new Set(targets.map(normalizePath));
    return all.filter(
      ({ parsed, normalized }) => wanted.has(normalized.id) || wanted.has(normalizePath(parsed.relativePath)),
    );
  }
  const kind = selection.kind ?? "change";
  const status = selection.status ?? "draft";
  return all.filter(({ parsed, normalized }) => parsed.kind === kind && normalized.status === status);
}

/** Non-heading body lines of a template that a finished record should have replaced. */
export function templatePlaceholderLines(template: string): ReadonlySet<string> {
  let body = template;
  try {
    body = parseMarkdownWithFrontmatter(template).body;
  } catch {
    // A template without frontmatter is still usable for placeholder detection.
  }
  const lines = new Set<string>();
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#") || line.includes("{{")) continue;
    lines.add(line);
  }
  return lines;
}

function lineIssues(raw: string, placeholders: ReadonlySet<string>): readonly LedgerReadinessIssue[] {
  const issues: LedgerReadinessIssue[] = [];
  const lines = raw.split(/\r?\n/);
  lines.forEach((text, index) => {
    const line = index + 1;
    const trimmed = text.trim();
    if (todoPattern.test(trimmed)) {
      issues.push({ code: "todo", message: `TODO marker: ${clip(trimmed)}`, line });
      return;
    }
    if (placeholders.has(trimmed)) {
      issues.push({ code: "template-placeholder", message: `template placeholder: ${clip(trimmed)}`, line });
    }
  });
  return issues;
}

function sectionIssues(workspace: LedgerWorkspace, parsed: ParsedLedgerDocument): readonly LedgerReadinessIssue[] {
  const required = workspace.config.validation.requiredSections[parsed.kind] ?? [];
  const issues: LedgerReadinessIssue[] = [];
  for (const title of required) {
    const section = parsed.sections.find((candidate) => candidate.title === title);
    if (!section) continue;
    if (section.body.trim().length === 0) {
      issues.push({ code: "empty-section", message: `section "${title}" is empty`, line: section.line });
    }
  }
  return issues;
}

function changeEntryIssues(
  workspace: LedgerWorkspace,
  parsed: ParsedLedgerDocument,
  normalized: NormalizedLedgerDocument,
  docsRoot: string,
  placeholders: ReadonlySet<string>,
): readonly LedgerReadinessIssue[] {
  const issues: LedgerReadinessIssue[] = [];
  const { requireVerification, requireInvariants } = workspace.config.validation;
  const realBullets = (title: string) =>
    extractBullets(getSectionBody(parsed, title)).filter((bullet) => !placeholders.has(`- ${bullet}`));
  if (requireVerification && realBullets("Verification").length === 0) {
    issues.push({ code: "missing-verification", message: "Verification has no bullets beyond the template" });
  }
  if (requireInvariants && realBullets("Invariants").length === 0) {
    issues.push({ code: "missing-invariants", message: "Invariants has no bullets beyond the template" });
  }
  const declaration = docsImpactDeclaration(parsed, docsRoot);
  if (!declaration) {
    issues.push({
      code: "docs-impact",
      message: "docsImpact is missing or its reason is still a TODO; declare updated, not-needed, or none with a reason",
    });
  } else if (declaration.status === "updated" && declaration.docs.length === 0 && normalized.docs.length === 0) {
    issues.push({ code: "docs-impact", message: "docsImpact says updated but names no docs" });
  }
  return issues;
}

function clip(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

export function formatReadinessReport(report: LedgerReadinessReport): string {
  if (report.checked === 0) return "Ledger ready: no records selected.";
  const lines = [
    `Ledger ready: ${report.ready.length} ready, ${report.notReady.length} not ready.`,
  ];
  for (const record of report.records) {
    const label = record.id ? `${record.id} ${record.path}` : record.path;
    lines.push(`- ${record.ready ? "ready" : "not ready"}: ${label} (${record.kind}, ${record.status})`);
    for (const issue of record.issues) {
      const location = issue.line ? `:${issue.line}` : "";
      lines.push(`  - ${issue.code}${location}: ${issue.message}`);
    }
  }
  return lines.join("\n");
}
