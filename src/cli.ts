#!/usr/bin/env node
import { readFileSync, realpathSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { runCiChecks } from "./ci.js";
import { formatLedgerMetricsResult, runLedgerMetricsCommand } from "./commands/metrics.js";
import { formatLedgerPacketResult, runLedgerPacketCommand } from "./commands/packet.js";
import { formatLedgerQueryResult, runLedgerQueryCommand } from "./commands/query.js";
import {
  formatLedgerSearchPacketResult,
  runLedgerSearchPacketCommand,
} from "./commands/searchPacket.js";
import { formatLedgerSearchResult, runLedgerSearchCommand } from "./commands/search.js";
import { buildConflictTargets, writeConflictReport } from "./conflict.js";
import { checkCoverage } from "./coverage.js";
import { readLedgerDocuments } from "./documents.js";
import { formatDoctorResult, runDoctor } from "./doctor.js";
import {
  auditDocs,
  buildDocsRoutingManifest,
  classifyDocsPaths,
  writeDocsAuditReport,
  writeDocsMigrationReport,
  writeDocsRoutingFiles,
} from "./docs.js";
import { buildDocsImpact, writeDocsImpactReport } from "./docsImpact.js";
import { getChangedFiles } from "./git.js";
import { buildIndexes, explainFile, writeIndexes } from "./indexer.js";
import { buildIntegrityReport, writeIntegrityArtifacts } from "./integrity.js";
import { startLedgerMcpServer } from "./mcp.js";
import { migrateChangelog } from "./migrate.js";
import { createChangeEntry, createProductNoteEntry } from "./newEntry.js";
import {
  extractBullets,
  getSectionBody,
  normalizeKindFilter,
} from "./query.js";
import {
  applyRelease,
  buildReleaseDocument,
  getUnreleasedChanges,
} from "./release.js";
import { buildStaticReaderModel, writeStaticReader } from "./render.js";
import { serveStaticReader } from "./serve.js";
import { detectStaleKnowledge, formatStaleReport, writeStaleReport } from "./stale.js";
import type { ParsedLedgerDocument } from "./types.js";
import {
  readValidationBaseline,
  validateDocuments,
  writeValidationBaseline,
  writeValidationReport,
} from "./validate.js";
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
        await initWorkspace(context.cwd, {
          withDocs: hasFlag(parsed, "with-docs") || hasFlag(parsed, "migrate"),
          adoption: hasFlag(parsed, "managed-docs") ? "managed" : "partial",
        });
        console.log(
          hasFlag(parsed, "with-docs") || hasFlag(parsed, "migrate")
            ? "Initialized .ledger/ and docs/ in partial adoption mode"
            : "Initialized .ledger/",
        );
        return 0;

      case "adopt":
        await initWorkspace(context.cwd, {
          withDocs: true,
          adoption: hasFlag(parsed, "managed-docs") ? "managed" : "partial",
        });
        console.log("Initialized Ledger adoption scaffold in partial docs mode.");
        return 0;

      case "validate":
        return await validateCommand(parsed, context);

      case "index":
        return await indexCommand(context);

      case "verify-integrity":
        return await verifyIntegrityCommand(parsed, context);

      case "render":
        return await renderCommand(parsed, context);

      case "serve":
        return await serveCommand(parsed, context);

      case "explain":
        return await explainCommand(parsed, context);

      case "query":
        return await queryCommand(parsed, context);

      case "search":
        return await searchCommand(parsed, context);

      case "search-packet":
        return await searchPacketCommand(parsed, context);

      case "packet":
        return await packetCommand(parsed, context);

      case "mcp":
        return await mcpCommand(context);

      case "unreleased":
        return await unreleasedCommand(parsed, context);

      case "release":
        return await releaseCommand(parsed, context);

      case "new":
        return await newCommand(parsed, context);

      case "feedback":
      case "product-note":
        return await productNoteCommand(parsed, context);

      case "migrate":
        return await migrateCommand(parsed, context);

      case "agents":
        return await agentsCommand(parsed, context);

      case "coverage":
        return await coverageCommand(parsed, context);

      case "ci":
        return await ciCommand(parsed, context);

      case "doctor":
        return await doctorCommand(parsed, context);

      case "metrics":
        return await metricsCommand(parsed, context);

      case "stale":
        return await staleCommand(parsed, context);

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
        if (hasFlag(parsed, "json")) {
          printJsonError("unknown-command", `Unknown command: ${parsed.command}`);
        } else {
          console.error(`Unknown command: ${parsed.command}`);
          printHelp();
        }
        return 2;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (hasFlag(parsed, "json")) {
      printJsonError(errorCode(message), message);
    } else {
      console.error(message);
    }
    return 2;
  }
}

async function validateCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const baseline =
    hasFlag(parsed, "update-baseline") || hasFlag(parsed, "no-baseline")
      ? undefined
      : await readValidationBaseline(workspace);
  const result = validateDocuments(workspace, documents, {
    currentOnly: hasFlag(parsed, "current-only"),
    baseline,
  });
  await writeValidationReport(workspace, result);
  if (hasFlag(parsed, "update-baseline")) {
    const rawResult = validateDocuments(workspace, documents, {
      currentOnly: hasFlag(parsed, "current-only"),
    });
    const baselinePath = await writeValidationBaseline(workspace, rawResult);
    console.log(`Updated validation baseline at ${baselinePath}.`);
  }
  printValidation(result.errors.length, result.warnings.length);
  if (result.suppressed.length > 0) {
    console.log(`Suppressed ${result.suppressed.length} warning(s) from baseline.`);
  }
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

async function verifyIntegrityCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const report = buildIntegrityReport(workspace, documents);
  const written = await writeIntegrityArtifacts(workspace, report);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ ...report, written }, null, 2));
    return 0;
  }

  console.log(
    `Ledger integrity: ${report.documents.length} document(s), catalog ${report.catalogHash}.`,
  );
  console.log(`Wrote ${written.indexPath} and ${written.reportPath}.`);
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

  const model = buildStaticReaderModel(workspace, documents, { validation: result });
  const rendered = await writeStaticReader(workspace, model);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(rendered, null, 2));
  } else {
    console.log(
      `Rendered ${rendered.documents} Ledger document(s) to ${rendered.outputPath}.`,
    );
    console.log(`Wrote ${rendered.searchIndexPath} and ${rendered.graphPath}.`);
    console.log(
      `Render budget: ${rendered.budget.ok ? "pass" : "warn"} (${rendered.totalBytes}/${rendered.budget.maxTotalBytes} bytes, ${rendered.writeMs}/${rendered.budget.maxWriteMs}ms).`,
    );
  }
  return 0;
}

async function serveCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const render = async () => {
    const documents = await readLedgerDocuments(workspace);
    const result = validateDocuments(workspace, documents);
    if (result.errors.length > 0) {
      await writeValidationReport(workspace, result);
      throw new Error(`Cannot serve reader with ${result.errors.length} validation error(s).`);
    }
    await writeStaticReader(workspace, buildStaticReaderModel(workspace, documents, {
      validation: result,
    }));
  };
  await render();
  const served = await serveStaticReader(workspace, {
    host: flagValues(parsed, "host")[0],
    port: numberFlag(parsed, "port") ?? 4173,
  });
  const watchers = hasFlag(parsed, "watch")
    ? watchStaticReaderSources(workspace, async () => {
        try {
          await render();
          console.log("Rebuilt Ledger static reader.");
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
        }
      })
    : [];

  console.log(`Serving ${served.root} at ${served.url}`);
  if (watchers.length > 0) console.log(`Watching ${watchers.length} Ledger source director${watchers.length === 1 ? "y" : "ies"}.`);
  await new Promise<void>((resolve) => {
    const close = () => {
      for (const watcher of watchers) watcher.close();
      served.server.close(() => resolve());
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
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
  const tag = flagValues(parsed, "tag")[0];
  const release = flagValues(parsed, "release")[0];
  const decision = flagValues(parsed, "decision")[0];
  const backlog = flagValues(parsed, "backlog")[0];
  const symbol = flagValues(parsed, "symbol")[0];
  const file = flagValues(parsed, "file")[0];
  const doc = flagValues(parsed, "doc")[0];
  const id = flagValues(parsed, "id")[0];
  const text = flagValues(parsed, "text")[0];

  if (flagValues(parsed, "kind")[0] && !kind) {
    console.error(`Invalid kind: ${flagValues(parsed, "kind")[0]}`);
    return 2;
  }

  const workspace = await findWorkspace(context.cwd);
  const result = await runLedgerQueryCommand(workspace, {
    kind,
    status,
    area,
    tag,
    release,
    decision,
    backlog,
    symbol,
    file,
    doc,
    id,
    text,
  });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(formatLedgerQueryResult(result));
  return 0;
}

async function searchCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const query = parsed.positionals.join(" ").trim();
  if (!query) {
    console.error("Usage: ledger search <query> [--limit <entries>] [--json]");
    return 2;
  }

  const workspace = await findWorkspace(context.cwd);
  const result = await runLedgerSearchCommand(workspace, query, {
    limit: numberFlag(parsed, "limit"),
  });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(formatLedgerSearchResult(result));
  return 0;
}

async function searchPacketCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const query = parsed.positionals.join(" ").trim();
  if (!query) {
    console.error("Usage: ledger search-packet <query> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]");
    return 2;
  }

  const limit = numberFlag(parsed, "limit");
  const workspace = await findWorkspace(context.cwd);
  const result = await runLedgerSearchPacketCommand(workspace, query, {
    budgetTokens: numberFlag(parsed, "budget"),
    limit,
    maxEntries: limit,
    writeReport: hasFlag(parsed, "write-report"),
  });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ ...result.packet, reportPath: result.reportPath }, null, 2));
    return 0;
  }

  console.log(formatLedgerSearchPacketResult(result));
  return 0;
}

async function packetCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const target = parsed.positionals[0];
  if (!target) {
    console.error("Usage: ledger packet <path> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]");
    return 2;
  }

  const workspace = await findWorkspace(context.cwd);
  const result = await runLedgerPacketCommand(workspace, target, {
    budgetTokens: numberFlag(parsed, "budget"),
    maxEntries: numberFlag(parsed, "limit"),
    writeReport: hasFlag(parsed, "write-report"),
  });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ ...result.packet, reportPath: result.reportPath }, null, 2));
    return 0;
  }

  console.log(formatLedgerPacketResult(result));
  return 0;
}

async function mcpCommand(context: RunContext): Promise<number> {
  await startLedgerMcpServer({ cwd: context.cwd, version: packageVersion() });
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
      "Usage: ledger release <version> [--include-unreleased] [--assign] [--status <status>] [--date <yyyy-mm-dd>] [--write] [--json]",
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
  const applied = await applyRelease(workspace, documents, release, {
    assign: hasFlag(parsed, "assign"),
    write: hasFlag(parsed, "write"),
  });
  const { assignment, writtenPath } = applied;

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ ...release, assignment, writtenPath }, null, 2));
    return 0;
  }

  if (assignment) {
    console.log(`Assigned ${assignment.updatedEntries.length} entr${assignment.updatedEntries.length === 1 ? "y" : "ies"} to ${version}.`);
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

async function productNoteCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const title = parsed.positionals.join(" ").trim();
  if (!title) {
    console.error("Usage: ledger feedback <title> [--area <area>] [--tag <tag>] [--status <status>]");
    return 2;
  }
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const createdPath = await createProductNoteEntry(workspace, documents, {
    title,
    areas: flagValues(parsed, "area"),
    tags: flagValues(parsed, "tag"),
    status: flagValues(parsed, "status")[0] ?? "captured",
  });
  console.log(`Created ${createdPath}`);
  return 0;
}

async function migrateCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const subcommand = parsed.positionals[0];
  if (subcommand !== "changelog") {
    console.error("Usage: ledger migrate changelog <dir> [--dry-run] [--rewrite-docs] [--status <status>]");
    return 2;
  }
  const sourceDir = parsed.positionals[1];
  if (!sourceDir) {
    console.error("Usage: ledger migrate changelog <dir> [--dry-run] [--rewrite-docs] [--status <status>]");
    return 2;
  }
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const result = await migrateChangelog(workspace, documents, sourceDir, {
    dryRun: hasFlag(parsed, "dry-run"),
    rewriteDocs: hasFlag(parsed, "rewrite-docs"),
    status: flagValues(parsed, "status")[0],
  });

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(
    `Ledger changelog migration: ${result.migrated.length} record(s), ${result.duplicates.length} duplicate id(s), ${result.rewrittenDocs.length} docs file(s) rewritten.`,
  );
  console.log(`Wrote ${result.receiptPath}`);
  for (const duplicate of result.duplicates.slice(0, 10)) {
    console.log(
      `- duplicate: ${duplicate.originalId} in ${duplicate.sourcePath}; suggested ${duplicate.suggestedId}`,
    );
  }
  if (result.duplicates.length > 10) {
    console.log(`- ${result.duplicates.length - 10} more duplicate(s) in receipt.`);
  }
  return 0;
}

async function agentsCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  let project = "this project";
  let docsMode = "partial";
  try {
    const workspace = await findWorkspace(context.cwd);
    project = workspace.config.project;
    docsMode = workspace.config.docs.adoption;
  } catch {
    // Keep the command useful before init.
  }

  console.log(agentInstructions(project, docsMode, flagValues(parsed, "role")[0]));
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
    for (const file of result.files) {
      if (file.status === "missing") {
        console.log(`- missing: ${file.path} (required by ${file.requiredBy ?? "configuration"})`);
      } else if (hasFlag(parsed, "explain")) {
        const reason =
          file.status === "ignored"
            ? `ignored by ${file.ignoredBy}`
            : file.status === "not-required"
              ? "not required by git.requireEntryFor"
              : `covered by ${file.coveredBy.join(", ")}`;
        console.log(`- ${file.status}: ${file.path} (${reason})`);
      }
    }
  }

  return result.missingFiles.length === 0 ? 0 : 1;
}

async function ciCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const result = await runCiChecks(workspace, documents, {
    staged: hasFlag(parsed, "staged"),
    currentOnly: hasFlag(parsed, "current-only"),
    validationBaseline: hasFlag(parsed, "no-baseline")
      ? undefined
      : await readValidationBaseline(workspace),
  });
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

async function doctorCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const validation = validateDocuments(workspace, documents, {
    baseline: hasFlag(parsed, "no-baseline") ? undefined : await readValidationBaseline(workspace),
  });
  const result = await runDoctor(workspace, documents, validation);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatDoctorResult(result));
  }

  return result.ok ? 0 : 1;
}

async function metricsCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const result = await runLedgerMetricsCommand(workspace);

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify(result.performance, null, 2));
  } else {
    console.log(formatLedgerMetricsResult(result));
  }

  return result.performance.ok ? 0 : 1;
}

async function staleCommand(parsed: ParsedArgs, context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const validation = validateDocuments(workspace, documents, {
    currentOnly: hasFlag(parsed, "current-only"),
    baseline: hasFlag(parsed, "no-baseline") ? undefined : await readValidationBaseline(workspace),
  });
  const report = await detectStaleKnowledge(workspace, documents, validation);
  const reportPath = hasFlag(parsed, "write-report")
    ? await writeStaleReport(workspace, report)
    : undefined;

  if (hasFlag(parsed, "json")) {
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } else {
    console.log(formatStaleReport(report).trimEnd());
    if (reportPath) console.log(`Wrote ${reportPath}`);
  }

  return hasFlag(parsed, "check") && !report.ok ? 1 : 0;
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
    case "migrate":
      return await docsMigrateCommand(context);
    case undefined:
      console.error("Usage: ledger docs <audit|check|classify|impact|reconcile|migrate>");
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
  const { manifestPath, startHerePath } = await writeDocsRoutingFiles(workspace, audit, manifest);

  console.log(
    `Ledger docs reconcile: wrote ${manifest.routes.length} route(s) to ${manifestPath} and ${startHerePath}.`,
  );
  return 0;
}

async function docsMigrateCommand(context: RunContext): Promise<number> {
  const workspace = await findWorkspace(context.cwd);
  const documents = await readLedgerDocuments(workspace);
  const audit = await auditDocs(workspace, documents);
  await writeDocsAuditReport(workspace, audit);
  const reportPath = await writeDocsMigrationReport(workspace, audit);

  console.log(
    `Ledger docs migrate: wrote ${reportPath} with ${audit.scratchDocs.length} scratch, ${audit.generatedDocs.length} generated, ${audit.unknownDocs.length} unknown, and ${audit.unreferencedDocs.length} unreferenced durable doc(s).`,
  );
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
      `Ledger docs impact: ${impact.sourceFiles.length} source file(s), ${impact.docsFiles.length} docs file(s), ${impact.referencedDocs.length} referenced doc(s), ${impact.declarations.length} explicit declaration(s), ${impact.missingDocsImpact.length} missing docs impact.`,
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
    const rawFlag = arg.slice(2);
    const equalsIndex = rawFlag.indexOf("=");
    if (equalsIndex > 0) {
      const flag = rawFlag.slice(0, equalsIndex);
      const value = rawFlag.slice(equalsIndex + 1);
      flags[flag] = [...(flags[flag] ?? []), value];
      continue;
    }
    const flag = rawFlag;
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

function numberFlag(parsed: ParsedArgs, flag: string): number | undefined {
  const value = flagValues(parsed, flag)[0];
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}

function helpTopicForCommand(parsed: ParsedArgs): string {
  return [parsed.command, ...parsed.positionals].filter(Boolean).join(" ");
}

function printValidation(errors: number, warnings: number): void {
  console.log(`Ledger validation: ${errors} error(s), ${warnings} warning(s).`);
}

function printJsonError(code: string, message: string): void {
  console.log(JSON.stringify({ ok: false, error: { code, message } }, null, 2));
}

function errorCode(message: string): string {
  if (message.includes("Could not find .ledger/config.yaml")) return "workspace-not-found";
  if (message.includes("invalid YAML")) return "invalid-yaml";
  if (message.includes("config must be a YAML object")) return "invalid-config";
  if (message.includes("Release document already exists")) return "release-exists";
  if (message.includes("Cannot serve reader with")) return "render-validation-failed";
  return "operational-error";
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

function watchStaticReaderSources(
  workspace: Awaited<ReturnType<typeof findWorkspace>>,
  rebuild: () => Promise<void>,
): readonly FSWatcher[] {
  const directories = [
    workspace.config.source.entries,
    workspace.config.source.backlog,
    workspace.config.source.decisions,
    workspace.config.source.releases,
  ];
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void rebuild();
    }, 150);
  };

  for (const directory of directories) {
    try {
      watchers.push(watch(path.join(workspace.projectRoot, directory), { recursive: true }, schedule));
    } catch {
      // Some platforms do not support recursive watching for every path.
    }
  }
  return watchers;
}

function agentInstructions(project: string, docsMode: string, role: string | undefined): string {
  const common = [
    `# Ledger Workflow For Agents`,
    "",
    `- Use Ledger for durable change memory in ${project}.`,
    "- Start with token-bounded context: `ledger packet <path> --budget 1200`.",
    "- Use `ledger search-packet <term> --budget 1600` when you know the topic but not the file path.",
    "- Use `ledger explain <path> --agent` when you need only invariants and verification.",
    "- Use `ledger search <term> --json` or `ledger query --text <term> --json` for bounded retrieval instead of reading the whole catalog.",
    `- Docs adoption mode is \`${docsMode}\`; do not assume Ledger owns all docs unless config says \`managed\`.`,
  ];

  switch (role) {
    case "reviewer":
      return [
        ...common,
        "- Review Ledger coverage, docs impact, stale knowledge, and verification before approval.",
        "- Prefer `ledger doctor`, `ledger stale --check`, and `ledger ci --json` for compact review signals.",
        "",
      ].join("\n");
    case "release":
      return [
        ...common,
        "- Start with `ledger unreleased --json` and `ledger release <version> --include-unreleased`.",
        "- Confirm release verification and stale-knowledge warnings before assigning entries.",
        "",
      ].join("\n");
    case "migration":
      return [
        ...common,
        "- Use `ledger adopt`, `ledger migrate changelog <dir>`, and `ledger validate --current-only`.",
        "- Mark historical records as historical instead of weakening current validation.",
        "",
      ].join("\n");
    case "conflict":
      return [
        ...common,
        "- Use `ledger conflict <path>` before resolving merge conflicts.",
        "- Preserve recorded conflict rules, invariants, and verification commands.",
        "",
      ].join("\n");
    case "contributor":
    case undefined:
      return [
        ...common,
        "- For implementation changes, create a receipt with `ledger new \"<title>\" --from-diff --area <area>`.",
        "- Fill in Summary, Why, Changed Files, Invariants, Verification, and Notes before handoff.",
        "- For dogfood findings, use `ledger feedback \"<title>\" --area <area> --tag dogfood`.",
        "- Before handoff, run `ledger ci` or the narrowest relevant Ledger command and record the result.",
        "",
      ].join("\n");
    default:
      return [
        ...common,
        `- Unknown role \`${role}\`; available roles are contributor, reviewer, release, migration, and conflict.`,
        "",
      ].join("\n");
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
  ledger init [--with-docs] [--migrate] [--managed-docs]

Creates .ledger/ in the current directory. With --with-docs or --migrate, also
creates docs routing files in partial adoption mode unless --managed-docs is set.`;
    case "adopt":
      return `Ledger adopt

Usage:
  ledger adopt [--managed-docs]

Initializes Ledger for an established repo. By default this uses partial docs
adoption, updating routing docs and impact reports without owning all docs.`;
    case "new":
      return `Ledger new

Usage:
  ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>]

Creates the next numbered change entry. Use --from-diff to prefill files from
Git changes and --staged to read the staged diff. Ignored generated/vendor paths
are omitted, and very large diffs are grouped into coverage patterns.`;
    case "feedback":
    case "product-note":
      return `Ledger feedback

Usage:
  ledger feedback <title> [--area <area>] [--tag <tag>] [--status <status>]

Creates a product-note record for dogfood findings, product observations, or
other feedback that should not be mixed into normal change receipts.`;
    case "migrate":
    case "migrate changelog":
      return `Ledger migrate changelog

Usage:
  ledger migrate changelog <dir> [--dry-run] [--rewrite-docs] [--status <status>] [--json]

Migrates folders of legacy Markdown changelog records into .ledger/entries,
preserves IDs when possible, suggests duplicate ID suffixes, and writes a
migration receipt. --rewrite-docs updates docs references from old paths to new
Ledger entry paths.`;
case "agents":
      return `Ledger agents

Usage:
  ledger agents [--role <contributor|reviewer|release|migration|conflict>]

Prints ready-to-paste AGENTS.md instructions for the configured Ledger workflow.`;
    case "validate":
      return `Ledger validate

Usage:
  ledger validate [--current-only] [--update-baseline] [--no-baseline]

Validates Ledger source records and writes .ledger/reports/latest-validation.md.
--current-only skips historical records. --update-baseline records current
warnings in the configured validation baseline.`;
    case "index":
      return `Ledger index

Usage:
  ledger index

Validates records and writes JSON indexes under .ledger/indexes.`;
    case "verify-integrity":
      return `Ledger verify-integrity

Usage:
  ledger verify-integrity [--json]

Writes source record hashes to .ledger/indexes/integrity.json and a readable
report to .ledger/reports/integrity.md.`;
case "render":
      return `Ledger render

Usage:
  ledger render [--json]

Builds the offline static reader at .ledger/dist/index.html plus lazy search
and relationship graph JSON artifacts.`;
    case "serve":
      return `Ledger serve

Usage:
  ledger serve [--host <host>] [--port <port>] [--watch]

Renders and serves the static reader from .ledger/dist. --watch rebuilds when
Ledger source records change.`;
    case "coverage":
      return `Ledger coverage

Usage:
  ledger coverage [--staged] [--explain] [--json]

Checks changed files against git.requireEntryFor and Ledger file coverage.
--explain prints why each changed path is ignored, not required, covered, or
missing coverage.`;
    case "ci":
      return `Ledger ci

Usage:
  ledger ci [--staged] [--current-only] [--no-baseline] [--json]

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
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--tag <tag>] [--release <version>] [--decision <id>] [--backlog <id>] [--symbol <name>] [--file <path>] [--doc <path>] [--id <id>] [--text <text>] [--json]

Filters Ledger records by metadata, tags, relationship ids, symbols, and paths.`;
    case "search":
      return `Ledger search

Usage:
  ledger search <query> [--limit <entries>] [--json]

Runs weighted fuzzy search over the same static reader search fields used by
the browser UI.`;
    case "search-packet":
      return `Ledger search-packet

Usage:
  ledger search-packet <query> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]

Builds a compact agent handoff packet from weighted search results. Use this
when you know the topic but not the exact file path. --budget compresses and
omits lower-priority matches to keep context bounded.
--write-report writes .ledger/reports/packet.md.`;
case "packet":
      return `Ledger packet

Usage:
  ledger packet <path> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]

Builds a compact agent handoff packet for a file path. --budget compresses and
omits lower-priority entries to keep context bounded.
--write-report writes .ledger/reports/packet.md.`;
    case "doctor":
      return `Ledger doctor

Usage:
  ledger doctor [--no-baseline] [--json]

Checks workspace health, Git availability, validation, docs references, index
freshness, render output, performance budgets, and stale-knowledge signals.`;
    case "metrics":
      return `Ledger metrics

Usage:
  ledger metrics [--json]

Measures read, validate, index, render-model, and search latency against
configured performance budgets.`;
    case "stale":
      return `Ledger stale

Usage:
  ledger stale [--current-only] [--no-baseline] [--check] [--write-report] [--json]

Finds stale knowledge signals such as missing references, missing relationship
targets, superseded relationships, stale symbols, and release verification gaps.`;
    case "mcp":
      return `Ledger MCP

Usage:
  ledger mcp

Starts a stdio Model Context Protocol server exposing Ledger tools for agents:
validate, query, explain, conflict, packet, search-packet, docs impact, and
integrity verification.`;
    case "unreleased":
      return `Ledger unreleased

Usage:
  ledger unreleased [--json]

Lists landed or shipped change entries without a release assignment.`;
    case "release":
      return `Ledger release

Usage:
  ledger release <version> [--include-unreleased] [--assign] [--status <status>] [--date <yyyy-mm-dd>] [--write] [--json]

Renders a valid Ledger release record. status is planned or released.
--assign writes the selected release version back to selected entries.
--write creates .ledger/releases/<version>.md.`;
    case "docs":
      return `Ledger docs

Usage:
  ledger docs audit
  ledger docs check
  ledger docs classify [path...] [--json]
  ledger docs impact [--staged] [--check] [--json]
  ledger docs reconcile
  ledger docs migrate`;
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

Writes the configured docs routing manifest and START_HERE file from the current
docs audit.`;
    case "docs migrate":
      return `Ledger docs migrate

Usage:
  ledger docs migrate

Writes .ledger/reports/docs-migration.md with docs cleanup and organization
guidance from the current docs audit.`;
    default:
      return `Ledger

Usage:
  ledger help [command]
  ledger version
  ledger init
  ledger init --with-docs
  ledger init --migrate
  ledger adopt
  ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>]
  ledger feedback <title> [--area <area>] [--tag <tag>]
  ledger validate [--current-only] [--update-baseline] [--no-baseline]
  ledger index
  ledger verify-integrity [--json]
  ledger render [--json]
  ledger serve [--host <host>] [--port <port>] [--watch]
  ledger coverage [--staged] [--explain] [--json]
  ledger ci [--staged] [--current-only] [--no-baseline] [--json]
  ledger doctor [--no-baseline] [--json]
  ledger metrics [--json]
  ledger stale [--current-only] [--no-baseline] [--check] [--write-report] [--json]
  ledger conflict <path...> [--json] [--write-report]
  ledger explain <path> [--json] [--agent]
  ledger search <query> [--limit <entries>] [--json]
  ledger search-packet <query> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--tag <tag>] [--release <version>] [--decision <id>] [--backlog <id>] [--symbol <name>] [--file <path>] [--doc <path>] [--id <id>] [--text <text>] [--json]
  ledger packet <path> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]
  ledger mcp
  ledger unreleased [--json]
  ledger release <version> [--include-unreleased] [--assign] [--status <status>] [--date <yyyy-mm-dd>] [--write] [--json]
  ledger migrate changelog <dir> [--dry-run] [--rewrite-docs] [--json]
  ledger agents [--role <role>]
  ledger docs audit
  ledger docs check
  ledger docs classify [path...] [--json]
  ledger docs impact [--staged] [--check] [--json]
  ledger docs reconcile
  ledger docs migrate

Examples:
  ledger new "Add provider retry policy" --from-diff --area server
  ledger feedback "Dogfood finding" --area product --tag dogfood
  ledger migrate changelog docs/changelog --rewrite-docs
  ledger explain src/cli.ts --agent
  ledger search renderer --limit 5
  ledger search-packet renderer --budget 1600 --limit 5
  ledger packet src/cli.ts --budget 1200
  ledger verify-integrity
  ledger metrics
  ledger doctor
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

if (isDirectCliInvocation()) {
  process.exitCode = await run();
}

function isDirectCliInvocation(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(invokedPath);
  } catch {
    return import.meta.url === `file://${invokedPath}`;
  }
}
