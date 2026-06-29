import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./documents.js";
import { getChangedFileDetails, type GitChangedFile } from "./git.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "./types.js";

export interface CreateEntryOptions {
  readonly title: string;
  readonly fromDiff: boolean;
  readonly staged: boolean;
  readonly areas: readonly string[];
  readonly status: string;
}

export async function createChangeEntry(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: CreateEntryOptions,
): Promise<string> {
  const id = nextEntryId(workspace, documents);
  const slug = slugify(options.title);
  const relativePath = path.join(workspace.config.source.entries, `${id}-${slug}.md`);
  const absolutePath = path.join(workspace.projectRoot, relativePath);
  const changedFiles = options.fromDiff
    ? await getChangedFileDetails(workspace.projectRoot, { staged: options.staged })
    : [];
  const files = changedFiles.map((file) => file.path);
  const docs = files.filter((file) => isDocsPath(file, workspace.config.docs.root));
  const date = new Date().toISOString().slice(0, 10);
  const template = await readTemplate(workspace);
  const rendered = renderTemplate(template, {
    id,
    title: options.title,
    date,
    status: options.status,
    areas: yamlStringArray(options.areas),
    files: yamlStringArray(files),
    docs: yamlStringArray(docs),
    changedFiles: renderChangedFiles(changedFiles),
  });

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, rendered, { encoding: "utf8", flag: "wx" });
  return relativePath.replace(/\\/g, "/");
}

export function nextEntryId(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): string {
  const width = workspace.config.ids.entryWidth;
  const prefix = workspace.config.ids.entryPrefix;
  const max = documents
    .filter((document) => document.kind === "change")
    .map((document) => String(document.frontmatter.id ?? ""))
    .map((id) => id.replace(prefix, ""))
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isFinite(id))
    .reduce((current, candidate) => Math.max(current, candidate), 0);

  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "change";
}

async function readTemplate(workspace: LedgerWorkspace): Promise<string> {
  const templatePath = path.join(workspace.ledgerRoot, "templates", "change.md");
  try {
    return await readFile(templatePath, "utf8");
  } catch {
    return defaultTemplate();
  }
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`"{{${key}}}"`, `"${escapeYamlString(value)}"`);
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  rendered = rendered.replace(
    'status: "draft"',
    `status: "${escapeYamlString(values.status ?? "draft")}"`,
  );
  if (rendered.includes("files: []") && values.files) {
    rendered = rendered.replace("files: []", `files:${values.files}`);
  }
  if (rendered.includes("docs: []") && values.docs) {
    rendered = rendered.replace("docs: []", `docs:${values.docs}`);
  }
  if (rendered.includes("areas: []") && values.areas) {
    rendered = rendered.replace("areas: []", `areas:${values.areas}`);
  }
  if (rendered.includes("### path/to/file.ts") && values.changedFiles) {
    rendered = rendered.replace("### path/to/file.ts", values.changedFiles);
  }
  if (rendered.includes("Add changed files.") && values.changedFiles) {
    rendered = rendered.replace("Add changed files.", values.changedFiles);
  }
  return rendered;
}

function yamlStringArray(values: readonly string[]): string {
  if (values.length === 0) return " []";
  return `\n${values.map((value) => `  - "${escapeYamlString(value)}"`).join("\n")}`;
}

function renderChangedFiles(files: readonly GitChangedFile[]): string {
  if (files.length === 0) return "### path/to/file.ts";
  return files
    .map(
      (file) => [
        `### ${file.path}`,
        "",
        `- Status: ${file.status}`,
        "- What changed: TODO: summarize the change.",
        "- Anchor: TODO: name the important symbol, route, command, or section.",
        "- On conflict: TODO: describe what must be preserved.",
      ].join("\n"),
    )
    .join("\n\n");
}

function isDocsPath(filePath: string, docsRoot: string): boolean {
  const normalized = normalizePath(filePath);
  const root = normalizePath(docsRoot).replace(/\/$/, "");
  return normalized === root || normalized.startsWith(`${root}/`);
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function defaultTemplate(): string {
  return [
    "---",
    'id: "{{id}}"',
    'kind: "change"',
    'title: "{{title}}"',
    'date: "{{date}}"',
    'updated: "{{date}}"',
    'status: "draft"',
    "areas: []",
    "files: []",
    "symbols: []",
    "docs: []",
    "commits: []",
    "---",
    "",
    "# {{id}}: {{title}}",
    "",
    "## Summary",
    "",
    "## Why",
    "",
    "## Changed Files",
    "",
    "### path/to/file.ts",
    "",
    "- What changed:",
    "- Anchor:",
    "- On conflict:",
    "",
    "## Behavior And UX Impact",
    "",
    "## Invariants",
    "",
    "## Verification",
    "",
    "## Notes",
    "",
  ].join("\n");
}
