import { access, stat } from "node:fs/promises";
import path from "node:path";
import { auditDocs } from "./docs.js";
import { normalizePath } from "./documents.js";
import { inspectGit } from "./git.js";
import { checkRenderBudgets } from "./render.js";
import { detectStaleKnowledge } from "./stale.js";
import type {
  LedgerDocsAudit,
  LedgerValidationResult,
  LedgerWorkspace,
  ParsedLedgerDocument,
} from "./types.js";

export type LedgerDoctorCheckLevel = "pass" | "warn" | "fail";

export interface LedgerDoctorCheck {
  readonly name: string;
  readonly level: LedgerDoctorCheckLevel;
  readonly message: string;
}

export interface LedgerDoctorResult {
  readonly ok: boolean;
  readonly checks: readonly LedgerDoctorCheck[];
  readonly docsAudit: LedgerDocsAudit;
}

export async function runDoctor(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  validation: LedgerValidationResult,
): Promise<LedgerDoctorResult> {
  const docsAudit = await auditDocs(workspace, documents);
  const stale = await detectStaleKnowledge(workspace, documents, validation);
  const checks: LedgerDoctorCheck[] = [
    {
      name: "workspace",
      level: "pass",
      message: `loaded ${normalizePath(workspace.configPath)}`,
    },
    await gitCheck(workspace),
    {
      name: "validation",
      level: validation.errors.length > 0 ? "fail" : validation.warnings.length > 0 ? "warn" : "pass",
      message: `${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`,
    },
    {
      name: "docs",
      level: docsAudit.missingReferences.length > 0
        ? "fail"
        : docsAudit.unreferencedDocs.length > 0 || docsAudit.unknownDocs.length > 0
          ? "warn"
          : "pass",
      message: `${docsAudit.missingReferences.length} missing reference(s), ${docsAudit.unreferencedDocs.length} unreferenced durable doc(s), ${docsAudit.unknownDocs.length} unknown doc(s)`,
    },
    await indexFreshnessCheck(workspace, documents),
    await renderOutputCheck(workspace),
    await renderBudgetCheck(workspace),
    {
      name: "stale-knowledge",
      level: stale.issues.length > 0 ? "warn" : "pass",
      message: `${stale.issues.length} stale signal(s)`,
    },
  ];

  return {
    ok: checks.every((check) => check.level !== "fail"),
    checks,
    docsAudit,
  };
}

export function formatDoctorResult(result: LedgerDoctorResult): string {
  const lines = [`Ledger doctor: ${result.ok ? "passed" : "failed"}.`];
  for (const check of result.checks) {
    lines.push(`- ${check.level}: ${check.name} (${check.message})`);
  }
  return lines.join("\n");
}

async function gitCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const git = await inspectGit(workspace.projectRoot);
  if (git.available && git.insideWorkTree) {
    return {
      name: "git",
      level: "pass",
      message: `work tree ${git.root ?? workspace.projectRoot}`,
    };
  }
  return {
    name: "git",
    level: "warn",
    message: git.error ?? "not inside a Git work tree",
  };
}

async function indexFreshnessCheck(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
): Promise<LedgerDoctorCheck> {
  const manifestPath = path.join(workspace.projectRoot, workspace.config.indexes.output, "manifest.json");
  const manifestModifiedAt = await modifiedAt(manifestPath);
  if (!manifestModifiedAt) {
    return {
      name: "indexes",
      level: "warn",
      message: "manifest.json has not been generated",
    };
  }

  const newestSource = Math.max(
    0,
    ...(await Promise.all(documents.map((document) => modifiedAt(document.absolutePath)))).filter(
      (value): value is number => typeof value === "number",
    ),
  );
  if (newestSource > manifestModifiedAt) {
    return {
      name: "indexes",
      level: "warn",
      message: "generated indexes are older than Ledger source records",
    };
  }
  return {
    name: "indexes",
    level: "pass",
    message: "generated indexes are current",
  };
}

async function renderOutputCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const indexPath = path.join(workspace.projectRoot, workspace.config.render.output, "index.html");
  try {
    await access(indexPath);
    return {
      name: "render",
      level: "pass",
      message: `${normalizePath(path.relative(workspace.projectRoot, indexPath))} exists`,
    };
  } catch {
    return {
      name: "render",
      level: "warn",
      message: "static reader has not been generated",
    };
  }
}

async function renderBudgetCheck(workspace: LedgerWorkspace): Promise<LedgerDoctorCheck> {
  const budget = await checkRenderBudgets(workspace);
  const failingArtifacts = budget.artifacts.filter((artifact) => !artifact.ok);
  const messages = [
    `${budget.totalBytes}/${budget.maxTotalBytes} bytes`,
    ...failingArtifacts.map((artifact) =>
      `${artifact.kind} ${artifact.bytes}/${artifact.maxBytes} bytes`,
    ),
  ];
  if (budget.writeMs > budget.maxWriteMs) {
    messages.push(`write ${budget.writeMs}/${budget.maxWriteMs}ms`);
  }
  return {
    name: "render-budget",
    level: budget.ok ? "pass" : "warn",
    message: messages.join(", "),
  };
}

async function modifiedAt(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return undefined;
  }
}
