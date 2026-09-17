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
  /** Codex only; defaults to the form the hook file already uses. */
  readonly launcher?: boolean;
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
    launcher: z.boolean().optional().describe(
      "Run Codex hooks through .ledger/bin/ledger.mjs (true) or the command itself (false); defaults to the form .codex/hooks.json already uses (codex only).",
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
    launcher: looseRecord({
      path: z.string(),
      state: z.enum(["current", "written", "removed"]),
    }).optional(),
    nextSteps: z.array(z.string()),
    content: z.string().optional(),
  }),
  cli: {
    path: ["hooks", "install"],
    usage: "ledger hooks install --host <claude-code|codex|cursor> [--command <prefix>] [--launcher] [--import-agents] [--dry-run] [--json]",
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
      launcher: {
        type: "boolean",
        description: "Codex only: run the hooks through .ledger/bin/ledger.mjs, so a new version leaves .codex/hooks.json and Codex's approval unchanged; --launcher=false switches back.",
      },
      "import-agents": {
        type: "boolean",
        field: "importAgents",
        description: "Add the @AGENTS.md import to CLAUDE.md when it is missing (claude-code only).",
      },
      "dry-run": { type: "boolean", description: "Print the merged hook file without writing it." },
    },
    json: true,
    help: `Writes Ledger's SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd,
and PreCompact hooks into the host's project hook file: .claude/settings.json
for Claude Code, .codex/hooks.json for Codex, or .cursor/hooks.json for Cursor
(Cursor has no prompt hook, so it gets the other five). Existing hooks that
are not Ledger's are preserved; earlier Ledger entries are replaced. Each
hook runs "<command> hook <event> --host <host>". The prefix is saved as
agents.command in .ledger/config.yaml and reused by hooks install, agents
--write, skills install, and the hook context; pass --command "npx ledger"
when Ledger is a project dependency. A dry run computes but never writes the
config. --import-agents adds the @AGENTS.md import to CLAUDE.md so Claude Code
reads the Ledger block. Nothing auto-starts the engine.

Codex asks you to approve a hook again whenever its command changes, so a new
pinned version in --command means approving all six again. With --launcher,
the Codex hooks run "node .ledger/bin/ledger.mjs hook <event> --host codex"
instead, and that generated script runs agents.command. A later install with
a new --command rewrites only the script, so the approval carries over.
Start Codex at the project root, where the hooks find the script. Later
installs keep the form .codex/hooks.json already uses; --launcher=false
returns to direct commands and removes the script.`,
  },
  async run(context, input) {
    const workspace = requireWorkspace(context);
    const result = await installHostHooks(workspace, {
      host: input.host,
      command: input.command,
      importAgents: Boolean(input.importAgents),
      launcher: input.launcher,
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
    if (data.launcher?.state === "written") {
      lines.push(`Wrote ${data.launcher.path}, which the hooks run, to start \`${data.command}\`.`);
    } else if (data.launcher?.state === "removed") {
      lines.push(`Removed ${data.launcher.path}; the hooks run \`${data.command}\` directly.`);
    }
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
    usage: "ledger hook <session-start|user-prompt-submit|post-tool-use|stop|session-end|pre-compact> [--host <host>] [--budget <tokens>]",
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
and the response object the host expects is written to stdout. session-start
injects the session context, user-prompt-submit injects a one-time notice of a
hook-drafted receipt linked to the session, post-tool-use records touched
paths, stop and session-end draft or refresh the linked receipt, and
pre-compact writes the handoff. Exits 0 with an empty object when Ledger is
not initialized or the event cannot be handled, so hosts are never blocked.
Installed by ledger hooks install.`,
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
      if (result.note) context.logError(`ledger hook ${input.event}: ${result.note}`);
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
