import { z } from "zod";
import { looseRecord } from "../shared.js";
import { defineOperation } from "../types.js";

export const agentRoles = ["contributor", "reviewer", "release", "migration", "conflict"] as const;
export type LedgerAgentRole = (typeof agentRoles)[number];

interface AgentsInput extends Record<string, unknown> {
  readonly role?: LedgerAgentRole;
}

interface AgentsOutput {
  readonly project: string;
  readonly docsMode: string;
  readonly role: LedgerAgentRole;
  readonly instructions: string;
}

export const agentsOperation = defineOperation<AgentsInput, AgentsOutput>({
  name: "agents",
  title: "Print agent instructions",
  description: "Print ready-to-paste AGENTS.md instructions for the configured Ledger workflow.",
  workspace: "optional",
  mutates: false,
  input: z.strictObject({
    role: z.enum(agentRoles).optional().describe("Agent role to tailor the instructions for."),
  }),
  output: looseRecord({
    project: z.string(),
    docsMode: z.string(),
    role: z.enum(agentRoles),
    instructions: z.string(),
  }),
  cli: {
    path: ["agents"],
    usage: "ledger agents [--role <contributor|reviewer|release|migration|conflict>] [--json]",
    flags: {
      role: {
        type: "string",
        description: "Agent role.",
        choices: [...agentRoles],
        choicesLabel: "agent role",
      },
    },
    json: true,
    help: "Prints ready-to-paste AGENTS.md instructions for the configured Ledger workflow.",
  },
  async run(context, input) {
    const project = context.workspace?.config.project ?? "this project";
    const docsMode = context.workspace?.config.docs.adoption ?? "partial";
    const role = input.role ?? "contributor";
    return { data: { project, docsMode, role, instructions: agentInstructions(project, docsMode, role) } };
  },
  format(data) {
    return data.instructions;
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
