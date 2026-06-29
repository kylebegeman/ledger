#!/usr/bin/env node
import process from "node:process";
import { checkCoverage } from "./coverage.js";
import { readLedgerDocuments } from "./documents.js";
import { auditDocs, writeDocsAuditReport } from "./docs.js";
import { buildIndexes, explainFile, writeIndexes } from "./indexer.js";
import { createChangeEntry } from "./newEntry.js";
import {
  extractBullets,
  getSectionBody,
  normalizeKindFilter,
  queryDocuments,
} from "./query.js";
import type { ParsedLedgerDocument } from "./types.js";
import { validateDocuments, writeValidationReport } from "./validate.js";
import { findWorkspace, initWorkspace } from "./workspace.js";

interface ParsedArgs {
  readonly command?: string;
  readonly positionals: readonly string[];
  readonly flags: Record<string, readonly string[]>;
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  try {
    switch (parsed.command) {
      case "init":
        await initWorkspace(process.cwd(), { withDocs: hasFlag(parsed, "with-docs") });
        console.log(hasFlag(parsed, "with-docs") ? "Initialized .ledger/ and docs/" : "Initialized .ledger/");
        return 0;

      case "validate":
        return await validateCommand();

      case "index":
        return await indexCommand();

      case "explain":
        return await explainCommand(parsed);

      case "query":
        return await queryCommand(parsed);

      case "new":
        return await newCommand(parsed);

      case "coverage":
        return await coverageCommand(parsed);

      case "docs":
        return await docsCommand(parsed);

      case "help":
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

async function docsCommand(parsed: ParsedArgs): Promise<number> {
  const subcommand = parsed.positionals[0];
  switch (subcommand) {
    case "audit":
      return await docsAuditCommand({ strict: false });
    case "check":
      return await docsAuditCommand({ strict: true });
    case undefined:
      console.error("Usage: ledger docs <audit|check>");
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

function printValidation(errors: number, warnings: number): void {
  console.log(`Ledger validation: ${errors} error(s), ${warnings} warning(s).`);
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

function printHelp(): void {
  console.log(`Ledger

Usage:
  ledger init
  ledger init --with-docs
  ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>]
  ledger validate
  ledger index
  ledger coverage [--staged] [--json]
  ledger explain <path> [--json] [--agent]
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--json]
  ledger docs audit
  ledger docs check
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
