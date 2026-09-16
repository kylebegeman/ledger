import { z } from "zod";
import { looseRecord, requireWorkspace, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

export const agentRoles = ["contributor", "reviewer", "release", "migration", "conflict"] as const;
export type LedgerAgentRole = (typeof agentRoles)[number];

export interface AgentsInput extends Record<string, unknown> {
  readonly role?: LedgerAgentRole;
  readonly write?: boolean;
  readonly file: string;
}

export interface AgentsOutput {
  readonly project: string;
  readonly docsMode: string;
  readonly role: LedgerAgentRole;
  readonly instructions: string;
  /** Present when --write maintained the fenced block in a file. */
  readonly written?: { readonly path: string; readonly changed: boolean; readonly created: boolean };
}

export const agentsOperation = defineOperation<AgentsInput, AgentsOutput>({
  name: "agents",
  title: "Print or write agent instructions",
  description: "Print AGENTS.md instructions for the configured Ledger workflow, or maintain them as a fenced block in a file.",
  workspace: "optional",
  mutates: true,
  input: z.strictObject({
    role: z.enum(agentRoles).optional().describe("Agent role to tailor the instructions for."),
    write: z.boolean().optional().describe("Maintain the fenced Ledger block in the target file."),
    file: shortString.default("AGENTS.md").describe("Project-relative file to write the block into."),
  }),
  output: looseRecord({
    project: z.string(),
    docsMode: z.string(),
    role: z.enum(agentRoles),
    instructions: z.string(),
    written: looseRecord({ path: z.string(), changed: z.boolean(), created: z.boolean() }).optional(),
  }),
  cli: {
    path: ["agents"],
    usage: "ledger agents [--role <contributor|reviewer|release|migration|conflict>] [--write] [--file <path>] [--json]",
    flags: {
      role: {
        type: "string",
        description: "Agent role.",
        choices: [...agentRoles],
        choicesLabel: "agent role",
      },
      write: { type: "boolean", description: "Maintain the fenced Ledger block in the target file." },
      file: { type: "string", description: "Project-relative file to write the block into." },
    },
    json: true,
    help: `Prints ready-to-paste AGENTS.md instructions for the configured Ledger workflow.
--write maintains them between <!-- ledger:agents:start --> and
<!-- ledger:agents:end --> markers in AGENTS.md (or --file <path>), replacing
the block in place, appending it when absent, and creating the file when
missing. Claude Code reads CLAUDE.md, so import AGENTS.md from it or pass
--file CLAUDE.md.`,
  },
  async run(context, input) {
    const project = context.workspace?.config.project ?? "this project";
    const docsMode = context.workspace?.config.docs.adoption ?? "partial";
    const role = input.role ?? "contributor";
    const instructions = agentInstructions(project, docsMode, role);
    if (!input.write) return { data: { project, docsMode, role, instructions } };
    const { writeAgentsBlock } = await import("../../skills.js");
    const written = await writeAgentsBlock(requireWorkspace(context), { file: input.file, role });
    return { data: { project, docsMode, role, instructions, written } };
  },
  format(data) {
    if (!data.written) return data.instructions;
    const { path, changed, created } = data.written;
    return created ? `Created ${path} with the Ledger agents block.` : changed ? `Updated the Ledger agents block in ${path}.` : `${path} already has the current Ledger agents block.`;
  },
});

export function agentInstructions(project: string, docsMode: string, role: LedgerAgentRole): string {
  const common = [
    "# Ledger Workflow For Agents",
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
      return [
        ...common,
        '- For implementation changes, create a receipt with `ledger new "<title>" --from-diff --area <area>`.',
        "- Fill in Summary, Why, Changed Files, Invariants, Verification, and Notes before handoff.",
        '- For dogfood findings, use `ledger feedback "<title>" --area <area> --tag dogfood`.',
        "- Before handoff, run `ledger ci` or the narrowest relevant Ledger command and record the result.",
        "",
      ].join("\n");
  }
}
