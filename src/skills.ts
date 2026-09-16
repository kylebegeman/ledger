import { lstat, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./documents.js";
import { applyFileTransaction, hashFileContent } from "./fileTransaction.js";
import { LedgerError } from "./machine.js";
import { agentInstructions, type LedgerAgentRole } from "./operations/definitions/agents.js";
import type { LedgerWorkspace } from "./types.js";

/** Project-relative directory of the shared skill, per the Agent Skills convention. */
export const ledgerSkillDirectory = ".agents/skills/ledger";
export const ledgerSkillPath = `${ledgerSkillDirectory}/SKILL.md`;

export const skillHosts = ["claude-code", "codex", "cursor"] as const;
export type LedgerSkillHost = (typeof skillHosts)[number];

export const agentsBlockStart = "<!-- ledger:agents:start -->";
export const agentsBlockEnd = "<!-- ledger:agents:end -->";

/** Render the Ledger skill for a project. */
export function renderLedgerSkill(workspace: LedgerWorkspace): string {
  const project = workspace.config.project;
  const docsMode = workspace.config.docs.adoption;
  const command = workspace.config.agents.command;
  return [
    "---",
    "name: ledger",
    `description: Use Ledger, the change memory in .ledger/ for ${project}, before editing a file, when you learn something worth keeping, and when you finish work that needs a receipt. Covers packets, explain, search, session notes, drafting and promoting records, and the ready gate.`,
    "---",
    "",
    "# Ledger",
    "",
    `Ledger keeps ${project}'s change memory as Markdown records under \`.ledger/\`: change entries with invariants and verification, backlog items, decisions, releases, and short-lived session records. Every command accepts \`--json\` and returns a machine envelope; the same operations exist as MCP tools when \`${command} mcp\` or \`${command} serve --api\` is running.`,
    "",
    "## Before editing a file",
    "",
    `- \`${command} packet <path> --budget 1200\` returns the records that mention the path with their conflict rules, invariants, and verification. Read it before changing the file.`,
    `- \`${command} search-packet "<topic>" --budget 1600\` when you know the topic but not the path.`,
    `- \`${command} explain <path> --agent\` for only invariants and verification.`,
    `- \`${command} conflict <path>\` before resolving a merge conflict.`,
    "",
    "## While working",
    "",
    `- \`${command} session note "<fact>"\` records something the next session should know; \`--section Next\` records a follow-up.`,
    `- Host hooks (installed with \`${command} hooks install\`) already track the paths you touch on the active session record and draft a receipt when you stop.`,
    "",
    "## When work is done",
    "",
    `- \`${command} new "<title>" --from-diff --area <area>\` drafts a change entry from the Git diff when no hook did.`,
    `- \`${command} promote <id>\` turns a backlog item or session record into a linked change entry.`,
    "- Fill Summary, Why, Changed Files, Invariants, and Verification; declare `docsImpact`.",
    `- \`${command} ready\` must pass before a draft is marked \`landed\`; it reports TODO markers, template placeholders, missing verification, and unreviewed docs impact with line numbers.`,
    `- \`${command} ci\` (or \`${command} ci --base <rev> --head <rev>\` in a clean checkout) runs validation, docs audit, coverage, and docs impact.`,
    "",
    "## Recording plans and decisions",
    "",
    `- \`${command} backlog new "<title>" --area <area>\` and \`${command} decision new "<title>"\` create records from the project templates.`,
    `- \`${command} scratch "<title>"\` starts a session record for notes that expire unless promoted.`,
    "",
    `Docs adoption mode is \`${docsMode}\`; do not assume Ledger owns all docs unless config says \`managed\`.`,
    "",
  ].join("\n");
}

export interface InstallSkillOptions {
  readonly hosts: readonly LedgerSkillHost[];
}

export type SkillLinkMode = "native" | "symlink" | "copy";

export interface SkillHostResult {
  readonly host: LedgerSkillHost;
  /** Project-relative path the host discovers the skill through. */
  readonly path: string;
  readonly mode: SkillLinkMode;
  readonly changed: boolean;
}

export interface InstallSkillResult {
  readonly path: string;
  readonly changed: boolean;
  readonly hosts: readonly SkillHostResult[];
}

/**
 * Write the shared skill and expose it to each host. Codex and Cursor read
 * `.agents/skills/` natively; Claude Code gets a symlink under
 * `.claude/skills/`, or a copy when symlinks are unavailable.
 */
export async function installLedgerSkill(
  workspace: LedgerWorkspace,
  options: InstallSkillOptions,
): Promise<InstallSkillResult> {
  const content = renderLedgerSkill(workspace);
  const existing = await readOptional(path.join(workspace.projectRoot, ledgerSkillPath));
  const changed = existing !== content;
  if (changed) {
    await applyFileTransaction(workspace, "install ledger skill", [
      { path: ledgerSkillPath, content, expectedHash: existing === undefined ? null : hashFileContent(existing) },
    ]);
  }
  const hosts: SkillHostResult[] = [];
  for (const host of options.hosts) {
    hosts.push(await exposeSkillToHost(workspace, host, content));
  }
  return { path: ledgerSkillPath, changed, hosts };
}

async function exposeSkillToHost(
  workspace: LedgerWorkspace,
  host: LedgerSkillHost,
  content: string,
): Promise<SkillHostResult> {
  if (host !== "claude-code") {
    return { host, path: ledgerSkillDirectory, mode: "native", changed: false };
  }
  const linkRelative = ".claude/skills/ledger";
  const linkPath = path.join(workspace.projectRoot, linkRelative);
  const target = path.relative(path.dirname(linkPath), path.join(workspace.projectRoot, ledgerSkillDirectory));
  await mkdir(path.dirname(linkPath), { recursive: true });
  const state = await lstat(linkPath).catch(() => undefined);
  if (state?.isSymbolicLink()) {
    const current = await readlink(linkPath);
    if (normalizePath(current) === normalizePath(target)) {
      return { host, path: linkRelative, mode: "symlink", changed: false };
    }
    await rm(linkPath, { force: true });
  } else if (state?.isDirectory()) {
    const copyPath = path.join(linkPath, "SKILL.md");
    const existing = await readOptional(copyPath);
    if (existing === content) return { host, path: `${linkRelative}/SKILL.md`, mode: "copy", changed: false };
    await writeFile(copyPath, content, "utf8");
    return { host, path: `${linkRelative}/SKILL.md`, mode: "copy", changed: true };
  } else if (state) {
    throw new LedgerError("filesystem-error", `${linkRelative} exists and is neither a symlink nor a directory`, {
      path: linkRelative,
    });
  }
  try {
    await symlink(target, linkPath, "dir");
    return { host, path: linkRelative, mode: "symlink", changed: true };
  } catch (error) {
    if (!isCode(error, "EPERM") && !isCode(error, "EACCES") && !isCode(error, "ENOTSUP")) throw error;
    await mkdir(linkPath, { recursive: true });
    await writeFile(path.join(linkPath, "SKILL.md"), content, "utf8");
    return { host, path: `${linkRelative}/SKILL.md`, mode: "copy", changed: true };
  }
}

export interface WriteAgentsBlockOptions {
  /** Project-relative Markdown file to maintain. Defaults to AGENTS.md. */
  readonly file: string;
  readonly role: LedgerAgentRole;
}

export interface WriteAgentsBlockResult {
  readonly path: string;
  readonly changed: boolean;
  /** Whether the file existed before. */
  readonly created: boolean;
}

/**
 * Maintain the fenced Ledger block in an agent instructions file. The block
 * is replaced in place when present, appended when absent, and the file is
 * created when missing. Everything outside the markers is preserved.
 */
export async function writeAgentsBlock(
  workspace: LedgerWorkspace,
  options: WriteAgentsBlockOptions,
): Promise<WriteAgentsBlockResult> {
  const relativePath = normalizePath(options.file);
  const existing = await readOptional(path.join(workspace.projectRoot, relativePath));
  const instructions = agentInstructions(
    workspace.config.project,
    workspace.config.docs.adoption,
    options.role,
    workspace.config.agents.command,
  ).trimEnd();
  const block = [agentsBlockStart, instructions, agentsBlockEnd].join("\n");
  const content = existing === undefined
    ? `# ${workspace.config.project} agent guide\n\n${block}\n`
    : replaceAgentsBlock(existing, block, relativePath);
  const changed = existing !== content;
  if (changed) {
    await applyFileTransaction(workspace, "write agents block", [
      { path: relativePath, content, expectedHash: existing === undefined ? null : hashFileContent(existing) },
    ]);
  }
  return { path: relativePath, changed, created: existing === undefined };
}

export function replaceAgentsBlock(existing: string, block: string, label = "AGENTS.md"): string {
  const start = existing.indexOf(agentsBlockStart);
  const end = existing.indexOf(agentsBlockEnd);
  if (start >= 0 && end > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(end + agentsBlockEnd.length)}`;
  }
  if (start >= 0 || end >= 0) {
    throw new LedgerError("invalid-markdown", `${label} has an unbalanced Ledger agents block; remove the stray marker`, {
      path: label,
    });
  }
  const trimmed = existing.replace(/\s+$/, "");
  return trimmed.length === 0 ? `${block}\n` : `${trimmed}\n\n${block}\n`;
}

async function readOptional(absolutePath: string): Promise<string | undefined> {
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

function isCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error &&
    (error as { readonly code?: unknown }).code === code;
}
