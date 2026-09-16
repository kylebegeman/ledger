import { z } from "zod";
import {
  defaultHookContextBudget,
  hookEvents,
  hookHosts,
  installHostHooks,
  normalizeHookPayload,
  readStdinJson,
  runHookEvent,
  type HookEventResult,
  type InstallHooksResult,
  type LedgerHookEvent,
  type LedgerHookHost,
} from "../../hooks.js";
import { looseRecord, positiveInt, requireWorkspace, shortString } from "../shared.js";
import { defineOperation } from "../types.js";

export interface HooksInstallInput extends Record<string, unknown> {
  readonly host: LedgerHookHost;
  /** Defaults to agents.command in .ledger/config.yaml and is saved there when given. */
  readonly command?: string;
  readonly importAgents?: boolean;
  readonly dryRun?: boolean;
}

export const hooksInstallOperation = defineOperation<HooksInstallInput, InstallHooksResult>({
  name: "hooks.install",
  title: "Install host hooks",
  description: "Install Ledger lifecycle hooks into an agent host's project hook file.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    host: z.enum(hookHosts).describe("Agent host to install hooks for."),
    command: shortString.optional().describe(
      "Command prefix that runs Ledger; defaults to agents.command in .ledger/config.yaml and is saved there when given.",
    ),
    importAgents: z.boolean().optional().describe(
      "Add the @AGENTS.md import to CLAUDE.md when it is missing (claude-code only).",
    ),
    dryRun: z.boolean().optional().describe("Print the merged hook file without writing it."),
  }),
  output: looseRecord({
    host: z.string(),
    path: z.string(),
    command: z.string(),
    events: z.array(z.string()),
    changed: z.boolean(),
    dryRun: z.boolean(),
    configured: z.boolean(),
    agentsImport: looseRecord({
      path: z.string(),
      present: z.boolean(),
      added: z.boolean(),
      created: z.boolean(),
    }).optional(),
    nextSteps: z.array(z.string()),
    content: z.string().optional(),
  }),
  cli: {
    path: ["hooks", "install"],
    usage: "ledger hooks install --host <claude-code|codex|cursor> [--command <prefix>] [--import-agents] [--dry-run] [--json]",
    flags: {
      host: {
        type: "string",
        description: "Agent host to install hooks for.",
        choices: [...hookHosts],
        choicesLabel: "hook host",
      },
      command: {
        type: "string",
        description: "Command prefix that runs Ledger; saved as agents.command in .ledger/config.yaml.",
      },
      "import-agents": {
        type: "boolean",
        field: "importAgents",
        description: "Add the @AGENTS.md import to CLAUDE.md when it is missing (claude-code only).",
      },
      "dry-run": { type: "boolean", description: "Print the merged hook file without writing it." },
    },
    json: true,
    help: `Writes Ledger's SessionStart, PostToolUse, Stop, SessionEnd, and PreCompact
hooks into the host's project hook file: .claude/settings.json for Claude Code,
.codex/hooks.json for Codex, or .cursor/hooks.json for Cursor. Existing hooks
that are not Ledger's are preserved; earlier Ledger entries are replaced. Each
hook runs "<command> hook <event> --host <host>". The prefix is saved as
agents.command in .ledger/config.yaml and reused by hooks install, agents
--write, skills install, and the hook context; pass --command "npx ledger"
when Ledger is a project dependency. A dry run computes but never writes the
config. --import-agents adds the @AGENTS.md import to CLAUDE.md so Claude Code
reads the Ledger block. Nothing auto-starts the engine.`,
  },
  async run(context, input) {
    const workspace = requireWorkspace(context);
    const result = await installHostHooks(workspace, {
      host: input.host,
      command: input.command,
      importAgents: Boolean(input.importAgents),
      dryRun: Boolean(input.dryRun),
    });
    return { data: result };
  },
  format(data) {
    if (data.dryRun) return data.content ?? "";
    const lines = [
      data.changed
        ? `Installed ${data.events.length} Ledger hooks into ${data.path} for ${data.host}.`
        : `${data.path} already has the current Ledger hooks for ${data.host}.`,
    ];
    if (data.configured) lines.push(`Saved agents.command "${data.command}" in .ledger/config.yaml.`);
    if (data.agentsImport?.added) {
      lines.push(`${data.agentsImport.created ? "Created" : "Updated"} CLAUDE.md with the @AGENTS.md import.`);
    }
    lines.push(...data.nextSteps.map((step) => `- ${step}`));
    return lines.join("\n");
  },
});

export interface HookInput extends Record<string, unknown> {
  readonly event: LedgerHookEvent;
  readonly host: LedgerHookHost;
  readonly budgetTokens?: number;
}

export interface HookOutput {
  readonly event: LedgerHookEvent;
  readonly host: LedgerHookHost;
  readonly handled: boolean;
  readonly result?: HookEventResult;
  readonly error?: string;
}

export const hookOperation = defineOperation<HookInput, HookOutput>({
  name: "hook",
  title: "Run a host hook event",
  description: "Handle one agent host lifecycle event from JSON on stdin. Installed by ledger hooks install.",
  workspace: "optional",
  mutates: true,
  interactive: true,
  input: z.strictObject({
    event: z.enum(hookEvents).describe("Lifecycle event name."),
    host: z.enum(hookHosts).default("claude-code").describe("Agent host that sent the event."),
    budgetTokens: positiveInt.max(10_000).optional().describe("Token budget for injected context."),
  }),
  output: looseRecord({
    event: z.string(),
    host: z.string(),
    handled: z.boolean(),
    error: z.string().optional(),
  }),
  cli: {
    path: ["hook"],
    usage: "ledger hook <session-start|post-tool-use|stop|session-end|pre-compact> [--host <host>] [--budget <tokens>]",
    positionals: { field: "event", min: 1, max: 1 },
    flags: {
      host: {
        type: "string",
        description: "Agent host that sent the event.",
        choices: [...hookHosts],
        choicesLabel: "hook host",
      },
      budget: { type: "number", field: "budgetTokens", description: "Token budget for injected context." },
    },
    json: false,
    hidden: true,
    help: `Handles one host lifecycle event. The host's JSON payload is read from stdin
and the response object the host expects is written to stdout. Exits 0 with an
empty object when Ledger is not initialized or the event cannot be handled, so
hosts are never blocked. Installed by ledger hooks install.`,
  },
  async run(context, input) {
    const workspace = context.workspace;
    if (!workspace) {
      context.log("{}");
      return { data: { event: input.event, host: input.host, handled: false, error: "workspace not found" } };
    }
    try {
      const raw = await readStdinJson();
      const payload = normalizeHookPayload(input.host, input.event, raw, workspace.projectRoot);
      const result = await runHookEvent(workspace, input.host, input.event, payload, {
        budgetTokens: input.budgetTokens ?? defaultHookContextBudget,
      });
      context.log(JSON.stringify(result.output));
      return { data: { event: input.event, host: input.host, handled: true, result } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.logError(`ledger hook ${input.event}: ${message}`);
      context.log("{}");
      return { data: { event: input.event, host: input.host, handled: false, error: message } };
    }
  },
  format() {
    return "";
  },
});
