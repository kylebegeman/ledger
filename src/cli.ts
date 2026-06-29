#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import { runCiChecks } from "./ci.js";
import { buildConflictTargets, writeConflictReport } from "./conflict.js";
import { checkCoverage } from "./coverage.js";
import { readLedgerDocuments } from "./documents.js";
import {
  auditDocs,
  buildDocsRoutingManifest,
  classifyDocsPaths,
  writeDocsAuditReport,
  writeDocsRoutingManifest,
} from "./docs.js";
import { buildDocsImpact, writeDocsImpactReport } from "./docsImpact.js";
import { getChangedFiles } from "./git.js";
import { buildIndexes, explainFile, writeIndexes } from "./indexer.js";
import { createChangeEntry } from "./newEntry.js";
import { buildAgentPacket, formatAgentPacket } from "./packet.js";
import {
  extractBullets,
  getSectionBody,
  normalizeKindFilter,
  queryDocuments,
} from "./query.js";
import {
  buildReleaseDocument,
  getUnreleasedChanges,
  writeReleaseDocument,
} from "./release.js";
import { buildStaticReaderModel, writeStaticReader } from "./render.js";
import type { ParsedLedgerDocument } from "./types.js";
import { validateDocuments, writeValidationReport } from "./validate.js";
import { findWorkspace, initWorkspace } from "./workspace.js";

interface ParsedArgs {
  readonly command?: string;
  readonly positionals: readonly string[];
  readonly flags: Record<string, readonly string[]>;
}

export interface RunOptions {
  readonly cwd?: string;
}

interface RunContext {
  readonly cwd: string;
}

const fallbackVersion = "0.1.0";

export async function run(
  argv = process.argv.slice(2),
  options: RunOptions = {},
): Promise<number> {
  const parsed = parseArgs(argv);
  const context: RunContext = { cwd: options.cwd ?? process.cwd() };

  try {
    if (parsed.command && hasFlag(parsed, "help")) {
      printHelp(helpTopicForCommand(parsed));
      return 0;
    }

    switch (parsed.command) {
      case "init":
        await initWorkspace(context.cwd, { withDocs: hasFlag(parsed, "with-docs") });
        console.log(hasFlag(parsed, "with-docs") ? "Initialized .ledger/ and docs/" : "Initialized .ledger/");
        return 0;

      case "validate":
        return await validateCommand(context);

      case "index":
        return await indexCommand(context);

      case "render":
        return await renderCommand(parsed, context);

      case "explain":
        return await explainCommand(parsed, context);

      case "query":
        return await queryCommand(parsed, context);

      case "packet":
        return await packetCommand(parsed, context);

      case "unreleased":
        return await unreleasedCommand(parsed, context);

      case "release":
        return await releaseCommand(parsed, context);

      case "new":
        return await newCommand(parsed, context);

      case "coverage":
        return await coverageCommand(parsed, context);

      case "ci":
        return await ciCommand(parsed, context);

      case "conflict":
        return await conflictCommand(parsed, context);

      case "docs":
        return await docsCommand(parsed, context);

      case "help":
        printHelp(parsed.positionals.join(" "));
        return 0;

      case "version":
      case "--version":
      case "-v":
        console.log(`ledger ${packageVersion()}`);
        return 0;

      case "--help":
      case "-h":
      case undefined:
        printHelp();
        return 0;

      default:
        console.error(`Unknown command: ${parsed.command}`);
        printHelp();
        return 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

async function validateCommand(context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const result = validateDocuments(workspace, documents);
  await writeValidationReport(workspace, result);
  printValidation(result.errors.length, result.warnings.length);
  return result.errors.length === 0 ? 0 : 1;
}

async function indexCommand(context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const result = validateDocuments(workspace, documents);
  if (result.errors.length > 0) {
    await writeValidationReport(workspace, result);
    printValidation(result.errors.length, result.warnings.length);
    return 1;
  }
  await writeIndexes(workspace, buildIndexes(workspace, documents));
  console.log(`Indexed ${documents.length} Ledger documents.`);
  return 0;
}

async function renderCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const result = validateDocuments(workspace, documents);
  if (result.errors.length > 0) {
    await writeValidationReport(workspace, result);
    printValidation(result.errors.length, result.warnings.length);
    return 1;
  }

  const model = buildStaticReaderModel(workspace, documents);
  const rendered = await writeStaticReader(workspace, model);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(rendered, null, 2));
  } else {
    console.log(`Rendered ${rendered.documents} Ledger document(s) to ${rendered.outputPath}.`);
  }
  return 0;
}

async function explainCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const filePath = parsed.positionals[0];
  if (!filePath) {
    console.error("Usage: ledger explain <path> [--json] [--agent]");
    return 2;
  }
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const matches = explainFile(documents, filePath);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ target: filePath, matches }, null, 2));
    return 0;
  }

  if (matches.length === 0) {
    console.log(`No Ledger records mention ${filePath}.`);
    return 0;
  }

  if (hasFlag(parsed, "agent")) {
    printAgentExplanation(filePath, documents, matches.map((match) => match.id));
    return 0;
  }

  console.log(`Ledger records for ${filePath}:`);
  for (const document of matches) {
    console.log(`- ${document.id} ${document.title} (${document.path})`);
    if (document.areas.length > 0) {
      console.log(`  Areas: ${document.areas.join(", ")}`);
    }
    if (document.docs.length > 0) {
      console.log(`  Docs: ${document.docs.join(", ")}`);
    }
    if (document.symbols.length > 0) {
      console.log(`  Symbols: ${document.symbols.join(", ")}`);
    }
  }
  return 0;
}

async function queryCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const kind = normalizeKindFilter(flagValues(parsed, "kind")[0]);
  const status = flagValues(parsed, "status")[0];
  const area = flagValues(parsed, "area")[0];
  const release = flagValues(parsed, "release")[0];
  const decision = flagValues(parsed, "decision")[0];
  const backlog = flagValues(parsed, "backlog")[0];
  const symbol = flagValues(parsed, "symbol")[0];
  const file = flagValues(parsed, "file")[0];
  const doc = flagValues(parsed, "doc")[0];
  const id = flagValues(parsed, "id")[0];

  if (flagValues(parsed, "kind")[0] && !kind) {
    console.error(`Invalid kind: ${flagValues(parsed, "kind")[0]}`);
    return 2;
  }

  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const matches = queryDocuments(documents, {
    kind,
    status,
    area,
    release,
    decision,
    backlog,
    symbol,
    file,
    doc,
    id,
  });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ matches }, null, 2));
    return 0;
  }

  console.log(`Ledger query: ${matches.length} match(es).`);
  for (const document of matches) {
    console.log(`- ${document.id} ${document.title} (${document.kind}, ${document.status})`);
    if (document.release) console.log(`  Release: ${document.release}`);
    if (document.areas.length > 0) console.log(`  Areas: ${document.areas.join(", ")}`);
    if (document.files.length > 0) console.log(`  Files: ${document.files.join(", ")}`);
    if (document.symbols.length > 0) console.log(`  Symbols: ${document.symbols.join(", ")}`);
    if (document.docs.length > 0) console.log(`  Docs: ${document.docs.join(", ")}`);
  }
  return 0;
}

async function packetCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const target = parsed.positionals[0];
  if (!target) {
    console.error("Usage: ledger packet <path> [--json]");
    return 2;
  }

  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const packet = buildAgentPacket(documents, target);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(packet, null, 2));
    return 0;
  }

  console.log(formatAgentPacket(packet));
  return 0;
}

async function unreleasedCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const matches = getUnreleasedChanges(documents);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ matches }, null, 2));
    return 0;
  }

  console.log(`Ledger unreleased: ${matches.length} change(s).`);
  for (const document of matches) {
    const areas = document.areas.length > 0 ? ` [${document.areas.join(", ")}]` : "";
    console.log(`- ${document.id} ${document.title}${areas} (${document.status})`);
  }
  return 0;
}

async function releaseCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const version = parsed.positionals[0];
  if (!version) {
    console.error(
      "Usage: ledger release <version> [--include-unreleased] [--status <status>] [--date <yyyy-mm-dd>] [--write] [--json]",
    );
    return 2;
  }

  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const status = releaseStatus(parsed);
  if (!status) return 2;
  const release = buildReleaseDocument(documents, version, {
    includeUnreleased: hasFlag(parsed, "include-unreleased"),
    date: flagValues(parsed, "date")[0],
    status,
  });
  const writtenPath = hasFlag(parsed, "write")
    ? await writeReleaseDocument(workspace, release)
    : undefined;

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ ...release, writtenPath }, null, 2));
    return 0;
  }

  if (writtenPath) {
    console.log(`Wrote ${writtenPath}`);
  } else {
    console.log(release.markdown);
  }
  return 0;
}

async function newCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const title = parsed.positionals.join(" ").trim();
  if (!title) {
    console.error("Usage: ledger new <title> [--from-diff] [--area <area>]");
    return 2;
  }
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const createdPath = await createChangeEntry(workspace, documents, {
    title,
    fromDiff: hasFlag(parsed, "from-diff"),
    staged: hasFlag(parsed, "staged"),
    areas: flagValues(parsed, "area"),
    status: flagValues(parsed, "status")[0] ?? "draft",
  });
  console.log(`Created ${createdPath}`);
  return 0;
}

async function coverageCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const result = await checkCoverage(workspace, documents, {
    staged: hasFlag(parsed, "staged"),
  });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Ledger coverage: ${result.requiredFiles.length} required file(s), ${result.missingFiles.length} missing coverage.`,
    );
    for (const filePath of result.missingFiles) {
      console.log(`- missing: ${filePath}`);
    }
  }

  return result.missingFiles.length === 0 ? 0 : 1;
}

async function ciCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const result = await runCiChecks(workspace, documents, { staged: hasFlag(parsed, "staged") });
  await writeValidationReport(workspace, result.validation);
  await writeDocsAuditReport(workspace, result.docsAudit);
  await writeDocsImpactReport(workspace, result.docsImpact);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Ledger CI: ${result.ok ? "passed" : "failed"}.`);
    for (const check of result.checks) {
      const status = check.ok ? "pass" : "fail";
      console.log(
        `- ${status}: ${check.name} (${check.errors} error(s), ${check.warnings} warning(s))`,
      );
    }
  }

  return result.ok ? 0 : 1;
}

async function conflictCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  if (parsed.positionals.length === 0) {
    console.error("Usage: ledger conflict <path...> [--json] [--write-report]");
    return 2;
  }

  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const targets = buildConflictTargets(documents, parsed.positionals);
  const reportPath = hasFlag(parsed, "write-report")
    ? await writeConflictReport(workspace, targets)
    : undefined;

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ targets, reportPath }, null, 2));
    return 0;
  }

  for (const target of targets) {
    console.log(`Conflict guidance for ${target.target}:`);
    if (target.entries.length === 0) {
      console.log("- No Ledger records mention this path.");
      continue;
    }

    for (const entry of target.entries) {
      console.log(`- ${entry.id} ${entry.title} (${entry.path})`);
      console.log(`  Matched files: ${entry.matchedFiles.join(", ")}`);
      printIndentedList("  Conflict rules", entry.conflictRules);
      printIndentedList("  Invariants", entry.invariants);
      printIndentedList("  Verification", entry.verification);
    }
  }
  if (reportPath) {
    console.log(`Wrote ${reportPath}`);
  }

  return 0;
}

async function docsCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const subcommand = parsed.positionals[0];
  switch (subcommand) {
    case "audit":
      return await docsAuditCommand({ strict: false }, context);
    case "check":
      return await docsAuditCommand({ strict: true }, context);
    case "classify":
      return await docsClassifyCommand(parsed, context);
    case "impact":
      return await docsImpactCommand(parsed, context);
    case "reconcile":
      return await docsReconcileCommand(context);
    case undefined:
      console.error("Usage: ledger docs <audit|check|classify|impact|reconcile>");
      return 2;
    default:
      console.error(`Unknown docs command: ${subcommand}`);
      return 2;
  }
}

async function docsAuditCommand(
  options: { readonly strict: boolean },
  context: RunContext,
): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const audit = await auditDocs(workspace, documents);
  await writeDocsAuditReport(workspace, audit);

  console.log(
    `Ledger docs audit: ${audit.files.length} file(s), ${audit.missingReferences.length} missing reference(s), ${audit.unreferencedDocs.length} unreferenced durable doc(s).`,
  );
  if (audit.missingReferences.length > 0) {
    for (const filePath of audit.missingReferences) {
      console.log(`- missing: ${filePath}`);
    }
  }
  return options.strict && audit.missingReferences.length > 0 ? 1 : 0;
}

async function docsClassifyCommand(
  parsed: ParsedArgs,
  context: RunContext,
): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const targets = parsed.positionals.slice(1);
  const files =
    targets.length > 0
      ? classifyDocsPaths(targets, workspace.config.docs.root)
      : (await auditDocs(workspace, await readLedgerDocuments(workspace))).files;

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ files }, null, 2));
    return 0;
  }

  console.log(`Ledger docs classify: ${files.length} file(s).`);
  for (const file of files) {
    console.log(`- ${file.classification}: ${file.path}`);
  }
  return 0;
}

async function docsReconcileCommand(context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const audit = await auditDocs(workspace, documents);
  await writeDocsAuditReport(workspace, audit);
  const manifest = buildDocsRoutingManifest(audit);
  const manifestPath = await writeDocsRoutingManifest(workspace, manifest);

  console.log(`Ledger docs reconcile: wrote ${manifest.routes.length} route(s) to ${manifestPath}.`);
  return 0;
}

async function docsImpactCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const changedFiles = await getChangedFiles(workspace.projectRoot, {
    staged: hasFlag(parsed, "staged"),
  });
  const impact = buildDocsImpact(workspace, documents, changedFiles);
  await writeDocsImpactReport(workspace, impact);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(impact, null, 2));
  } else {
    console.log(
      `Ledger docs impact: ${impact.sourceFiles.length} source file(s), ${impact.docsFiles.length} docs file(s), ${impact.referencedDocs.length} referenced doc(s), ${impact.missingDocsImpact.length} missing docs impact.`,
    );
    for (const filePath of impact.missingDocsImpact) {
      console.log(`- missing docs impact: ${filePath}`);
    }
  }

  return hasFlag(parsed, "check") && impact.missingDocsImpact.length > 0 ? 1 : 0;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string[]> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg?.startsWith("--")) {
      if (arg) positionals.push(arg);
      continue;
    }
    const flag = arg.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[flag] = [...(flags[flag] ?? []), next];
      index += 1;
    } else {
      flags[flag] = [...(flags[flag] ?? []), "true"];
    }
  }

  return { command, positionals, flags };
}

function hasFlag(parsed: ParsedArgs, flag: string): boolean {
  return Boolean(parsed.flags[flag]);
}

function flagValues(parsed: ParsedArgs, flag: string): readonly string[] {
  return parsed.flags[flag] ?? [];
}

function helpTopicForCommand(parsed: ParsedArgs): string {
  return [parsed.command, ...parsed.positionals].filter(Boolean).join(" ");
}

function printValidation(errors: number, warnings: number): void {
  console.log(`Ledger validation: ${errors} error(s), ${warnings} warning(s).`);
}

function printIndentedList(label: string, values: readonly string[]): void {
  if (values.length === 0) return;
  console.log(`${label}:`);
  for (const value of values) {
    console.log(`    - ${value}`);
  }
}

function printAgentExplanation(
  target: string,
  documents: readonly ParsedLedgerDocument[],
  ids: readonly string[],
): void {
  console.log(`# Ledger Context: ${target}`);
  for (const id of ids) {
    const parsed = documents.find((document) => String(document.frontmatter.id) === id);
    if (!parsed) continue;
    const invariants = extractBullets(getSectionBody(parsed, "Invariants"));
    const verification = extractBullets(getSectionBody(parsed, "Verification"));
    console.log("");
    console.log(`## ${id}: ${String(parsed.frontmatter.title ?? "")}`);
    console.log(`Path: ${parsed.relativePath}`);
    if (invariants.length > 0) {
      console.log("Invariants:");
      for (const invariant of invariants) console.log(`- ${invariant}`);
    }
    if (verification.length > 0) {
      console.log("Verification:");
      for (const command of verification) console.log(`- ${command}`);
    }
  }
}

function printHelp(topic?: string): void {
  console.log(helpText(topic));
}

function helpText(topic?: string): string {
  switch (topic?.trim()) {
    case "init":
      return `Ledger init

Usage:
  ledger init [--with-docs]

Creates .ledger/ in the current directory. With --with-docs, also creates the
managed docs/ directory structure.`;
    case "new":
      return `Ledger new

Usage:
  ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>]

Creates the next numbered change entry. Use --from-diff to prefill files from
Git changes and --staged to read the staged diff.`;
    case "validate":
      return `Ledger validate

Usage:
  ledger validate

Validates Ledger source records and writes .ledger/reports/latest-validation.md.`;
    case "index":
      return `Ledger index

Usage:
  ledger index

Validates records and writes JSON indexes under .ledger/indexes.`;
    case "render":
      return `Ledger render

Usage:
  ledger render [--json]

Builds the offline static reader at .ledger/dist/index.html.`;
    case "coverage":
      return `Ledger coverage

Usage:
  ledger coverage [--staged] [--json]

Checks changed files against git.requireEntryFor and Ledger file coverage.`;
    case "ci":
      return `Ledger ci

Usage:
  ledger ci [--staged] [--json]

Runs validation, docs audit, coverage, and docs impact as one CI-friendly check.`;
    case "conflict":
      return `Ledger conflict

Usage:
  ledger conflict <path...> [--json] [--write-report]

Shows file-specific conflict rules, invariants, and verification commands.
--write-report writes .ledger/reports/conflict.md.`;
    case "explain":
      return `Ledger explain

Usage:
  ledger explain <path> [--json] [--agent]

Shows Ledger records that mention a path. --agent prints compact context.`;
    case "query":
      return `Ledger query

Usage:
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--release <version>] [--decision <id>] [--backlog <id>] [--symbol <name>] [--file <path>] [--doc <path>] [--id <id>] [--json]

Filters Ledger records by metadata, relationship ids, symbols, and paths.`;
    case "packet":
      return `Ledger packet

Usage:
  ledger packet <path> [--json]

Builds a compact agent handoff packet for a file path.`;
    case "unreleased":
      return `Ledger unreleased

Usage:
  ledger unreleased [--json]

Lists landed or shipped change entries without a release assignment.`;
    case "release":
      return `Ledger release

Usage:
  ledger release <version> [--include-unreleased] [--status <status>] [--date <yyyy-mm-dd>] [--write] [--json]

Renders a valid Ledger release record. status is planned or released.
--write creates .ledger/releases/<version>.md.`;
    case "docs":
      return `Ledger docs

Usage:
  ledger docs audit
  ledger docs check
  ledger docs classify [path...] [--json]
  ledger docs impact [--staged] [--check] [--json]
  ledger docs reconcile`;
    case "docs audit":
    case "docs check":
      return `Ledger docs audit/check

Usage:
  ledger docs audit
  ledger docs check

Audits docs references. check exits non-zero for missing Ledger-referenced docs.`;
    case "docs classify":
      return `Ledger docs classify

Usage:
  ledger docs classify [path...] [--json]

Classifies docs paths as durable, routing, scratch, generated, or unknown.`;
    case "docs impact":
      return `Ledger docs impact

Usage:
  ledger docs impact [--staged] [--check] [--json]

Reports whether changed source files have an explicit docs impact.`;
    case "docs reconcile":
      return `Ledger docs reconcile

Usage:
  ledger docs reconcile

Writes the configured docs routing manifest from the current docs audit.`;
    default:
      return `Ledger

Usage:
  ledger help [command]
  ledger version
  ledger init
  ledger init --with-docs
  ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>]
  ledger validate
  ledger index
  ledger render [--json]
  ledger coverage [--staged] [--json]
  ledger ci [--staged] [--json]
  ledger conflict <path...> [--json] [--write-report]
  ledger explain <path> [--json] [--agent]
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--release <version>] [--decision <id>] [--backlog <id>] [--symbol <name>] [--file <path>] [--doc <path>] [--id <id>] [--json]
  ledger packet <path> [--json]
  ledger unreleased [--json]
  ledger release <version> [--include-unreleased] [--status <status>] [--date <yyyy-mm-dd>] [--write] [--json]
  ledger docs audit
  ledger docs check
  ledger docs classify [path...] [--json]
  ledger docs impact [--staged] [--check] [--json]
  ledger docs reconcile

Examples:
  ledger new "Add provider retry policy" --from-diff --area server
  ledger explain src/cli.ts --agent
  ledger packet src/cli.ts
  ledger release v0.1.0 --include-unreleased
  ledger ci --json`;
  }
}

function releaseStatus(parsed: ParsedArgs): "planned" | "released" | undefined {
  const value = flagValues(parsed, "status")[0] ?? "planned";
  if (value === "planned" || value === "released") return value;
  console.error(`Invalid release status: ${value}`);
  return undefined;
}

function packageVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { readonly version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
