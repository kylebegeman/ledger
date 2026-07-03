import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultConfig, readLedgerConfig } from "./config.js";
import type { LedgerDocsAdoption, LedgerWorkspace } from "./types.js";

const configRelativePath = path.join(".ledger", "config.yaml");

export async function findWorkspace(startDir = process.cwd()): Promise<LedgerWorkspace> {
  const projectRoot = await findProjectRoot(startDir);
  const configPath = path.join(projectRoot, configRelativePath);
  const config = await readLedgerConfig(configPath);
  return {
    projectRoot,
    ledgerRoot: path.join(projectRoot, ".ledger"),
    configPath,
    config,
  };
}

export async function findProjectRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, configRelativePath);
    if (await pathExists(candidate)) return current;

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find ${configRelativePath} from ${startDir}`);
    }
    current = parent;
  }
}

export interface InitWorkspaceOptions {
  readonly withDocs?: boolean;
  readonly adoption?: LedgerDocsAdoption;
}

export async function initWorkspace(
  projectRoot = process.cwd(),
  options: InitWorkspaceOptions = {},
): Promise<void> {
  const ledgerRoot = path.join(projectRoot, ".ledger");
  const directories = [
    ledgerRoot,
    path.join(ledgerRoot, "entries"),
    path.join(ledgerRoot, "backlog"),
    path.join(ledgerRoot, "decisions"),
    path.join(ledgerRoot, "releases"),
    path.join(ledgerRoot, "templates"),
    path.join(ledgerRoot, "policies"),
    path.join(ledgerRoot, "indexes"),
    path.join(ledgerRoot, "reports"),
    path.join(ledgerRoot, "dist"),
  ];

  if (options.withDocs) {
    directories.push(
      path.join(projectRoot, "docs"),
      path.join(projectRoot, "docs", "product"),
      path.join(projectRoot, "docs", "architecture"),
      path.join(projectRoot, "docs", "operations"),
      path.join(projectRoot, "docs", "api"),
      path.join(projectRoot, "docs", "guides"),
      path.join(projectRoot, "docs", "reference"),
      path.join(projectRoot, "docs", "llm"),
    );
  }

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  await writeFileIfMissing(
    path.join(ledgerRoot, "config.yaml"),
    serializeDefaultConfig(path.basename(projectRoot), options),
  );
  await writeFileIfMissing(path.join(ledgerRoot, "README.md"), initialLedgerReadme());
  await writeFileIfMissing(path.join(ledgerRoot, "templates", "change.md"), changeTemplate());
  await writeFileIfMissing(path.join(ledgerRoot, "templates", "backlog.md"), backlogTemplate());
  await writeFileIfMissing(path.join(ledgerRoot, "templates", "decision.md"), decisionTemplate());
  await writeFileIfMissing(path.join(ledgerRoot, "templates", "release.md"), releaseTemplate());
  await writeFileIfMissing(
    path.join(ledgerRoot, "templates", "product-note.md"),
    productNoteTemplate(),
  );
  await writeFileIfMissing(path.join(ledgerRoot, "policies", "coverage.yaml"), coveragePolicy());

  if (options.withDocs) {
    await writeFileIfMissing(path.join(projectRoot, "docs", "README.md"), docsReadme());
    await writeFileIfMissing(
      path.join(projectRoot, "docs", "llm", "START_HERE.md"),
      docsStartHere(),
    );
    await writeFileIfMissing(
      path.join(projectRoot, "docs", "llm", "manifest.json"),
      `${JSON.stringify({ version: 1, generatedBy: "ledger", routes: [] }, null, 2)}\n`,
    );
  }
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath)) return;
  await writeFile(filePath, content, "utf8");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function serializeDefaultConfig(project: string, options: InitWorkspaceOptions): string {
  const sections = defaultConfig.validation.requiredSections;
  const adoption = options.adoption ?? "partial";
  return [
    "version: 1",
    `project: ${project}`,
    "source:",
    "  entries: .ledger/entries",
    "  backlog: .ledger/backlog",
    "  decisions: .ledger/decisions",
    "  releases: .ledger/releases",
    "ids:",
    '  entryPrefix: ""',
    "  entryWidth: 4",
    "  backlogPrefix: B",
    "  decisionPrefix: D",
    "validation:",
    "  requireVerification: true",
    "  requireChangedFiles: true",
    "  requireInvariants: true",
    "  baseline: .ledger/reports/validation-baseline.json",
    "  ignoreMissingRefsForStatuses:",
    "    - historical",
    "  requiredSections:",
    ...Object.entries(sections).flatMap(([kind, names]) => [
      `    ${kind}:`,
      ...names.map((name) => `      - ${name}`),
    ]),
    "schema:",
    "  allowedFrontmatterFields: []",
    "  extensions: {}",
    "indexes:",
    "  output: .ledger/indexes",
    "reports:",
    "  output: .ledger/reports",
    "render:",
    "  output: .ledger/dist",
    "  budgets:",
    "    maxHtmlBytes: 1000000",
    "    maxSearchIndexBytes: 500000",
    "    maxGraphBytes: 500000",
    "    maxTotalBytes: 2000000",
    "    maxWriteMs: 3000",
    "docs:",
    "  root: docs",
    "  managed: false",
    `  adoption: ${adoption}`,
    "  routing:",
    "    startHere: docs/llm/START_HERE.md",
    "    manifest: docs/llm/manifest.json",
    "git:",
    "  requireEntryFor:",
    "    - src/**",
    "    - test/**",
    "    - docs/**",
    "  ignore:",
    ...defaultConfig.git.ignore.map((pattern) => `    - ${JSON.stringify(pattern)}`),
    "",
  ].join("\n");
}

function initialLedgerReadme(): string {
  return [
    "# Ledger Records",
    "",
    "This directory contains Ledger source records and generated outputs.",
    "",
    "- `entries/`: landed change records",
    "- `backlog/`: future work",
    "- `decisions/`: durable decisions",
    "- `releases/`: release notes",
    "- `indexes/`, `reports/`, and `dist/`: generated outputs",
    "",
  ].join("\n");
}

function docsReadme(): string {
  return [
    "# Project Docs",
    "",
    "These are durable project docs. Ledger tracks their lifecycle and links",
    "them to change entries, decisions, backlog items, and releases.",
    "",
    "- `product/`: product behavior and user-facing expectations",
    "- `architecture/`: technical architecture and system design",
    "- `operations/`: runbooks and operational procedures",
    "- `api/`: API and protocol documentation",
    "- `guides/`: task-oriented guides",
    "- `reference/`: stable reference material",
    "- `llm/`: agent routing and compact context entry points",
    "",
  ].join("\n");
}

function docsStartHere(): string {
  return [
    "# LLM Start Here",
    "",
    "Use Ledger records in `.ledger/` for change history, decisions, backlog,",
    "and verification context. Use `docs/` for durable explanations of the",
    "current system.",
    "",
  ].join("\n");
}

function changeTemplate(): string {
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
    "Describe what changed.",
    "",
    "## Why",
    "",
    "Explain why it changed.",
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
    "Describe user or maintainer impact.",
    "",
    "## Invariants",
    "",
    "- Add invariants.",
    "",
    "## Verification",
    "",
    "- Add checks.",
    "",
    "## Notes",
    "",
    "",
  ].join("\n");
}

function backlogTemplate(): string {
  return [
    "---",
    'id: "{{id}}"',
    'kind: "backlog"',
    'title: "{{title}}"',
    'date: "{{date}}"',
    'updated: "{{date}}"',
    'status: "proposed"',
    "areas: []",
    "---",
    "",
    "# {{id}}: {{title}}",
    "",
    "## Problem",
    "",
    "What problem or opportunity does this capture?",
    "",
    "## Desired Outcome",
    "",
    "What should be true when the work is complete?",
    "",
    "## Scope",
    "",
    "What is included and excluded?",
    "",
    "## Acceptance Checks",
    "",
    "- Add concrete checks.",
    "",
    "## Risks",
    "",
    "- Add implementation or product risks.",
    "",
    "## Promotion Notes",
    "",
    "What should happen when this becomes one or more change entries?",
    "",
  ].join("\n");
}

function decisionTemplate(): string {
  return [
    "---",
    'id: "{{id}}"',
    'kind: "decision"',
    'title: "{{title}}"',
    'date: "{{date}}"',
    'updated: "{{date}}"',
    'status: "proposed"',
    "areas: []",
    "---",
    "",
    "# {{id}}: {{title}}",
    "",
    "## Context",
    "",
    "What situation forced this decision?",
    "",
    "## Decision",
    "",
    "What is the chosen direction?",
    "",
    "## Consequences",
    "",
    "What tradeoffs follow from this decision?",
    "",
    "## Revisit Criteria",
    "",
    "When should this decision be reconsidered?",
    "",
  ].join("\n");
}

function releaseTemplate(): string {
  return [
    "---",
    'id: "{{version}}"',
    'kind: "release"',
    'title: "Ledger {{version}}"',
    'date: "{{date}}"',
    'updated: "{{date}}"',
    'status: "planned"',
    "entries: []",
    "---",
    "",
    "# Ledger {{version}}",
    "",
    "## Summary",
    "",
    "Summarize the release.",
    "",
    "## Public Notes",
    "",
    "- Add public release notes.",
    "",
    "## Changes",
    "",
    "- Add entries included in this release.",
    "",
    "## Verification",
    "",
    "- Add release checks.",
    "",
    "## Known Issues",
    "",
    "- Add known issues or `None`.",
    "",
  ].join("\n");
}

function productNoteTemplate(): string {
  return [
    "---",
    'id: "{{id}}"',
    'kind: "product-note"',
    'title: "{{title}}"',
    'date: "{{date}}"',
    'updated: "{{date}}"',
    'status: "captured"',
    "areas: []",
    "tags: []",
    "---",
    "",
    "# {{id}}: {{title}}",
    "",
    "## Context",
    "",
    "Where did this feedback come from?",
    "",
    "## Finding",
    "",
    "What did the user, product team, or dogfood session reveal?",
    "",
    "## Impact",
    "",
    "Why does it matter?",
    "",
    "## Recommendation",
    "",
    "What should happen next?",
    "",
    "## Follow-ups",
    "",
    "- Add concrete follow-ups or `None`.",
    "",
  ].join("\n");
}

function coveragePolicy(): string {
  return [
    "version: 1",
    "requireEntryFor:",
    "  - src/**",
    "  - test/**",
    "  - docs/**",
    "ignore:",
    ...defaultConfig.git.ignore.map((pattern) => `  - ${JSON.stringify(pattern)}`),
    "",
  ].join("\n");
}
