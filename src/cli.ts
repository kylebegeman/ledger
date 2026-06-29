#!/usr/bin/env node
import process from "node:process";
import { runCiChecks } from "./ci.js";
import { buildConflictTargets } from "./conflict.js";
import { checkCoverage } from "./coverage.js";
import { readLedgerDocuments } from "./documents.js";
import { auditDocs, classifyDocsPaths, writeDocsAuditReport } from "./docs.js";
import { buildDocsImpact, writeDocsImpactReport } from "./docsImpact.js";
import { getChangedFiles } from "./git.js";
import { buildIndexes, explainFile, writeIndexes } from "./indexer.js";
import { createChangeEntry } from "./newEntry.js";
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

const version = "0.1.0";

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  try {
    if (parsed.command && hasFlag(parsed, "help")) {
      printHelp(helpTopicForCommand(parsed));
      return 0;
    }

    switch (parsed.command) {
      case "init":
        await initWorkspace(process.cwd(), { withDocs: hasFlag(parsed, "with-docs") });
        console.log(hasFlag(parsed, "with-docs") ? "Initialized .ledger/ and docs/" : "Initialized .ledger/");
        return 0;

      case "validate":
        return await validateCommand();

      case "index":
        return await indexCommand();

      case "render":
        return await renderCommand(parsed);

      case "explain":
        return await explainCommand(parsed);

      case "query":
        return await queryCommand(parsed);

      case "unreleased":
        return await unreleasedCommand(parsed);

      case "release":
        return await releaseCommand(parsed);

      case "new":
        return await newCommand(parsed);

      case "coverage":
        return await coverageCommand(parsed);

      case "ci":
        return await ciCommand(parsed);

      case "conflict":
        return await conflictCommand(parsed);

      case "docs":
        return await docsCommand(parsed);

      case "help":
        printHelp(parsed.positionals.join(" "));
        return 0;

      case "version":
      case "--version":
      case "-v":
        console.log(`ledger ${version}`);
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

async function validateCommand(): Promise<number> {
  const workspace = await findWorkspace();
  const documents = await readLedgerDocuments(workspace);
  const result = validateDocuments(workspace, documents);
  await writeValidationReport(workspace, result);
  printValidation(result.errors.length, result.warnings.length);
  return result.errors.length === 0 ? 0 : 1;
}

async function indexCommand(): Promise<number> {
  const workspace = await findWorkspace();
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

async function renderCommand(parsed: ParsedArgs): Promise<number> {
  const workspace = await findWorkspace();
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

async function explainCommand(parsed: ParsedArgs): Promise<number> {
  const filePath = parsed.positionals[0];
  if (!filePath) {
    console.error("Usage: ledger explain <path> [--json] [--agent]");
    return 2;
  }
  const workspace = await findWorkspace();
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

async function queryCommand(parsed: ParsedArgs): Promise<number> {
  const kind = normalizeKindFilter(flagValues(parsed, "kind")[0]);
  const status = flagValues(parsed, "status")[0];
  const area = flagValues(parsed, "area")[0];

  if (flagValues(parsed, "kind")[0] && !kind) {
    console.error(`Invalid kind: ${flagValues(parsed, "kind")[0]}`);
    return 2;
  }

  const workspace = await findWorkspace();
  const documents = await readLedgerDocuments(workspace);
  const matches = queryDocuments(documents, { kind, status, area });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ matches }, null, 2));
    return 0;
  }

  console.log(`Ledger query: ${matches.length} match(es).`);
  for (const document of matches) {
    console.log(`- ${document.id} ${document.title} (${document.kind}, ${document.status})`);
  }
  return 0;
}

async function unreleasedCommand(parsed: ParsedArgs): Promise<number> {
  const workspace = await findWorkspace();
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

async function releaseCommand(parsed: ParsedArgs): Promise<number> {
  const version = parsed.positionals[0];
  if (!version) {
    console.error("Usage: ledger release <version> [--include-unreleased] [--write] [--json]");
    return 2;
  }

  const workspace = await findWorkspace();
  const documents = await readLedgerDocuments(workspace);
  const release = buildReleaseDocument(documents, version, {
    includeUnreleased: hasFlag(parsed, "include-unreleased"),
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

async function newCommand(parsed: ParsedArgs): Promise<number> {
  const title = parsed.positionals.join(" ").trim();
  if (!title) {
    console.error("Usage: ledger new <title> [--from-diff] [--area <area>]");
    return 2;
  }
  const workspace = await findWorkspace();
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

async function coverageCommand(parsed: ParsedArgs): Promise<number> {
  const workspace = await findWorkspace();
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

async function ciCommand(parsed: ParsedArgs): Promise<number> {
  const workspace = await findWorkspace();
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

async function conflictCommand(parsed: ParsedArgs): Promise<number> {
  if (parsed.positionals.length === 0) {
    console.error("Usage: ledger conflict <path...> [--json]");
    return 2;
  }

  const workspace = await findWorkspace();
  const documents = await readLedgerDocuments(workspace);
  const targets = buildConflictTargets(documents, parsed.positionals);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ targets }, null, 2));
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

  return 0;
}

async function docsCommand(parsed: ParsedArgs): Promise<number> {
  const subcommand = parsed.positionals[0];
  switch (subcommand) {
    case "audit":
      return await docsAuditCommand({ strict: false });
    case "check":
      return await docsAuditCommand({ strict: true });
    case "classify":
      return await docsClassifyCommand(parsed);
    case "impact":
      return await docsImpactCommand(parsed);
    case undefined:
      console.error("Usage: ledger docs <audit|check|classify|impact>");
      return 2;
    default:
      console.error(`Unknown docs command: ${subcommand}`);
      return 2;
  }
}

async function docsAuditCommand(options: { readonly strict: boolean }): Promise<number> {
  const workspace = await findWorkspace();
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

async function docsClassifyCommand(parsed: ParsedArgs): Promise<number> {
  const workspace = await findWorkspace();
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

async function docsImpactCommand(parsed: ParsedArgs): Promise<number> {
  const workspace = await findWorkspace();
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
  ledger conflict <path...> [--json]

Shows file-specific conflict rules, invariants, and verification commands.`;
    case "explain":
      return `Ledger explain

Usage:
  ledger explain <path> [--json] [--agent]

Shows Ledger records that mention a path. --agent prints compact context.`;
    case "query":
      return `Ledger query

Usage:
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--json]

Filters Ledger records by metadata.`;
    case "unreleased":
      return `Ledger unreleased

Usage:
  ledger unreleased [--json]

Lists landed or shipped change entries without a release assignment.`;
    case "release":
      return `Ledger release

Usage:
  ledger release <version> [--include-unreleased] [--write] [--json]

Renders a valid Ledger release record. --write creates .ledger/releases/<version>.md.`;
    case "docs":
      return `Ledger docs

Usage:
  ledger docs audit
  ledger docs check
  ledger docs classify [path...] [--json]
  ledger docs impact [--staged] [--check] [--json]`;
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
  ledger conflict <path...> [--json]
  ledger explain <path> [--json] [--agent]
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--json]
  ledger unreleased [--json]
  ledger release <version> [--include-unreleased] [--write] [--json]
  ledger docs audit
  ledger docs check
  ledger docs classify [path...] [--json]
  ledger docs impact [--staged] [--check] [--json]

Examples:
  ledger new "Add provider retry policy" --from-diff --area server
  ledger explain src/cli.ts --agent
  ledger release v0.1.0 --include-unreleased
  ledger ci --json`;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
