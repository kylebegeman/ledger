import { ledgerOperations } from "./registry.js";
import { operationHelp } from "./runtime.js";
import type { AnyLedgerOperation, LedgerFlagSpec } from "./types.js";

/** Where the generated command reference lives in this repository. */
export const commandReferencePath = "docs/COMMANDS.md";

const flagValues: Readonly<Record<LedgerFlagSpec["type"], string>> = {
  boolean: "switch",
  string: "text",
  number: "number",
  "string[]": "text, repeatable",
};

/**
 * The command reference as Markdown, generated from the operation registry:
 * each command's usage and help exactly as `ledger help` prints them, its
 * flags, and its JSON, MCP, and write behavior. Commands hidden from help,
 * which host hooks run, come last.
 */
export function renderCommandReference(registry: readonly AnyLedgerOperation[] = ledgerOperations): string {
  const listed = registry.filter((operation) => !operation.cli.hidden);
  const hidden = registry.filter((operation) => operation.cli.hidden);
  const lines = [
    "# Command Reference",
    "",
    "<!-- Generated from Ledger's operation registry by src/operations/reference.ts.",
    "     Regenerate with LEDGER_UPDATE_COMMANDS=1 npx vitest run test/commandReference.test.ts -->",
    "",
    "Every command below comes from Ledger's operation registry, the same source",
    "as `ledger help`, the MCP tools, and the JSON API. Commands with JSON output",
    "print the versioned machine envelope when given `--json`. When",
    "`ledger serve --api` is running for the project, commands run inside that",
    "engine; `--local` or `LEDGER_NO_DAEMON=1` runs them in the calling process.",
    "",
    "## Contents",
    "",
    ...listed.map((operation) => `- [${commandName(operation)}](#${anchor(operation)})`),
    ...(hidden.length > 0 ? ["- [Commands for host hooks](#commands-for-host-hooks)"] : []),
    "",
    ...listed.flatMap((operation) => commandSection(operation, "##")),
  ];
  if (hidden.length > 0) {
    lines.push(
      "## Commands for host hooks",
      "",
      "Host hook files that `ledger hooks install` writes run these commands. They",
      "are left out of `ledger help` because people do not run them directly.",
      "",
      ...hidden.flatMap((operation) => commandSection(operation, "###")),
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function commandName(operation: AnyLedgerOperation): string {
  return `ledger ${operation.cli.path.join(" ")}`;
}

/** The heading anchor GitHub derives from the section title. */
function anchor(operation: AnyLedgerOperation): string {
  return commandName(operation)
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");
}

function commandSection(operation: AnyLedgerOperation, level: "##" | "###"): string[] {
  const flags = Object.entries(operation.cli.flags);
  const facts = [
    operation.cli.json ? "Prints JSON with `--json`." : "Prints text only.",
    operation.mutates ? "Can write files." : "Reads only.",
    ...(operation.mcp
      ? [`MCP tool \`${operation.mcp.tool}\`${operation.mcp.confirm ? ", which asks the user to confirm before it writes" : ""}.`]
      : []),
    ...(operation.cli.aliases?.length
      ? [`Also runs as ${operation.cli.aliases.map((alias) => `\`ledger ${alias.join(" ")}\``).join(", ")}.`]
      : []),
  ];
  return [
    `${level} ${commandName(operation)}`,
    "",
    operation.description,
    "",
    "```text",
    operationHelp(operation).trimEnd(),
    "```",
    "",
    ...(flags.length > 0
      ? [
          "| Flag | Value | Description |",
          "| --- | --- | --- |",
          ...flags.map(([flag, spec]) => `| \`--${flag}\` | ${flagValue(spec)} | ${tableCell(spec.description)} |`),
          "",
        ]
      : []),
    ...facts.map((fact) => `- ${fact}`),
    "",
  ];
}

function flagValue(spec: LedgerFlagSpec): string {
  return spec.choices ? spec.choices.map((choice) => `\`${choice}\``).join(", ") : flagValues[spec.type];
}

function tableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}
