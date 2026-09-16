import { LedgerError, machineFailure, machineSuccess } from "../machine.js";
import { findWorkspace } from "../workspace.js";
import { delegateOperation } from "./delegate.js";
import type {
  AnyLedgerOperation,
  LedgerFlagSpec,
  LedgerOperationContext,
} from "./types.js";

export interface LedgerCliRunOptions {
  readonly cwd?: string;
  readonly version: string;
}

interface ResolvedInvocation {
  readonly operation?: AnyLedgerOperation;
  /** Machine command name used in failure envelopes. */
  readonly command: string;
  /** Command group when a group was named without a member, for example "docs". */
  readonly group?: string;
  readonly subcommand?: string;
  readonly args: readonly string[];
}

interface ParsedInvocation {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, readonly string[]>>;
}

const builtinHelpTopics: Readonly<Record<string, string>> = {
  help: `Ledger help

Usage:
  ledger help [command]
  ledger <command> --help

Prints general help or focused help for a known command.`,
  version: `Ledger version

Usage:
  ledger version

Prints the installed Ledger version.`,
};

const helpAliases = new Set(["--help", "-h"]);
const versionAliases = new Set(["version", "--version", "-v"]);

export async function runLedgerCli(
  registry: readonly AnyLedgerOperation[],
  argv: readonly string[],
  options: LedgerCliRunOptions,
): Promise<number> {
  const [command, ...rest] = argv;
  const cwd = options.cwd ?? process.cwd();

  if (command === undefined || helpAliases.has(command)) {
    console.log(generalHelp(registry));
    return 0;
  }
  if (versionAliases.has(command)) {
    if (rest.some((token) => !token.startsWith("--"))) {
      console.error(`Unexpected positional argument for ${command}: ${rest.find((token) => !token.startsWith("--"))}`);
      return 2;
    }
    console.log(`ledger ${options.version}`);
    return 0;
  }
  if (command === "help") {
    try {
      console.log(helpForTopic(registry, rest.join(" ")));
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  const resolved = resolveInvocation(registry, command, rest);
  const parsed = parseInvocation(resolved.operation, resolved.args);
  const wantsJson = lastValue(parsed.flags.json) === "true" && resolved.operation?.cli.json !== false;
  const wantsLocal = lastValue(parsed.flags.local) === "true";

  try {
    if (parsed.flags.help) {
      const topic = resolved.operation
        ? resolved.operation.cli.path.join(" ")
        : resolved.group
          ? [resolved.group, resolved.subcommand].filter(Boolean).join(" ")
          : command;
      console.log(helpForTopic(registry, topic));
      return 0;
    }

    if (!resolved.operation) {
      if (resolved.group) {
        throw resolved.subcommand === undefined
          ? invalidArgument(groupUsage(registry, resolved.group))
          : invalidArgument(`Unknown ${resolved.group} command: ${resolved.subcommand}`);
      }
      throw new LedgerError("unknown-command", `Unknown command: ${command}`, { command });
    }

    const operation = resolved.operation;
    const rawInput = buildInput(operation, parsed);
    const input = validateInput(operation, rawInput);

    const delegated = await delegateOperation(operation, input, cwd, { local: wantsLocal });
    if (delegated) {
      if (wantsJson) {
        console.log(JSON.stringify(delegated.envelope, null, 2));
      } else if (delegated.envelope.ok) {
        const rendered = operation.format(delegated.envelope.data, input);
        if (rendered.length > 0) console.log(rendered);
      } else {
        console.error(delegated.envelope.error.message);
      }
      return delegated.exitCode;
    }

    const context = await buildContext(operation, cwd, options.version);
    const outcome = await operation.run(context, input);

    if (wantsJson) {
      console.log(JSON.stringify(machineSuccess(operation.name, outcome.data), null, 2));
    } else if (!operation.interactive) {
      const rendered = operation.format(outcome.data, input);
      if (rendered.length > 0) console.log(rendered);
    }
    return outcome.exitCode ?? 0;
  } catch (error) {
    if (wantsJson || (lastValue(parsed.flags.json) === "true" && !resolved.operation)) {
      console.log(JSON.stringify(machineFailure(resolved.command, error), null, 2));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      if (error instanceof LedgerError && error.code === "unknown-command") {
        console.log(generalHelp(registry));
      }
    }
    return exitCodeForError(error);
  }
}

export function resolveInvocation(
  registry: readonly AnyLedgerOperation[],
  command: string,
  rest: readonly string[],
): ResolvedInvocation {
  const candidates = registry.filter((operation) =>
    pathsFor(operation).some((path) => path[0] === command),
  );
  const subcommand = rest[0] !== undefined && !rest[0].startsWith("--") ? rest[0] : undefined;

  if (subcommand !== undefined) {
    const nested = candidates.find((operation) =>
      pathsFor(operation).some((path) => path.length === 2 && path[1] === subcommand),
    );
    if (nested) {
      return {
        operation: nested,
        command: nested.name,
        args: rest.slice(1),
      };
    }
  }

  const direct = candidates.find((operation) =>
    pathsFor(operation).some((path) => path.length === 1),
  );
  if (direct) {
    return { operation: direct, command: direct.name, args: rest };
  }

  if (candidates.length > 0) {
    return {
      command: subcommand === undefined ? command : `${command}.${subcommand}`,
      group: command,
      subcommand,
      args: rest,
    };
  }

  return { command, args: rest };
}

function parseInvocation(
  operation: AnyLedgerOperation | undefined,
  args: readonly string[],
): ParsedInvocation {
  const positionals: string[] = [];
  const flags: Record<string, string[]> = {};
  const specs = operation?.cli.flags ?? {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const raw = token.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex > 0) {
      push(flags, raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
      continue;
    }
    const spec = specs[raw];
    const isBoolean = raw === "help" || raw === "json" || raw === "local" || spec?.type === "boolean";
    if (isBoolean) {
      push(flags, raw, "true");
      continue;
    }
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      push(flags, raw, next);
      index += 1;
    } else {
      push(flags, raw, "true");
    }
  }

  return { positionals, flags };
}

function buildInput(
  operation: AnyLedgerOperation,
  parsed: ParsedInvocation,
): Record<string, unknown> {
  const cli = operation.cli;
  const input: Record<string, unknown> = { ...(cli.defaults ?? {}) };

  for (const [flag, values] of Object.entries(parsed.flags)) {
    if (flag === "help") continue;
    if (flag === "local") {
      if (values.some((value) => value !== "true" && value !== "false")) {
        throw invalidArgument("--local must be true or false");
      }
      continue;
    }
    if (flag === "json") {
      if (!cli.json) throw invalidArgument(`Unknown option for ${operation.name}: --json`);
      if (values.some((value) => value !== "true" && value !== "false")) {
        throw invalidArgument("--json must be true or false");
      }
      continue;
    }
    const spec = cli.flags[flag];
    if (!spec) throw invalidArgument(`Unknown option for ${operation.name}: --${flag}`);
    const field = spec.field ?? camelCase(flag);
    input[field] = coerceFlag(flag, spec, values);
  }

  const positionals = cli.positionals;
  if (!positionals) {
    if (parsed.positionals.length > 0) {
      throw invalidArgument(
        `Unexpected positional argument for ${operation.name}: ${parsed.positionals[0]}`,
      );
    }
  } else {
    const count = parsed.positionals.length;
    if (count < positionals.min || (positionals.max !== undefined && count > positionals.max)) {
      throw invalidArgument(`Usage: ${cli.usage}`);
    }
    if (positionals.join) {
      const joined = parsed.positionals.join(" ").trim();
      if (!joined && positionals.min > 0) throw invalidArgument(`Usage: ${cli.usage}`);
      input[positionals.field] = joined;
    } else if (positionals.max === 1) {
      if (count === 1) input[positionals.field] = parsed.positionals[0];
    } else {
      input[positionals.field] = [...parsed.positionals];
    }
  }

  return cli.prepare ? cli.prepare(input) : input;
}

function coerceFlag(flag: string, spec: LedgerFlagSpec, values: readonly string[]): unknown {
  if (spec.type === "boolean") {
    if (values.some((value) => value !== "true" && value !== "false")) {
      throw invalidArgument(`--${flag} must be true or false`);
    }
    return values[values.length - 1] !== "false";
  }
  if (values.some((value) => value === "true" || value.length === 0)) {
    throw invalidArgument(`--${flag} requires a value`);
  }
  if (spec.type !== "string[]" && values.length > 1) {
    throw invalidArgument(`--${flag} may only be provided once`);
  }
  if (spec.type === "number") {
    const value = values[0] ?? "";
    if (!/^[1-9]\d*$/.test(value)) {
      throw invalidArgument(`--${flag} must be a positive integer`);
    }
    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      throw invalidArgument(`--${flag} must be a positive safe integer`);
    }
    return parsedValue;
  }
  if (spec.choices) {
    for (const value of values) {
      if (!spec.choices.includes(value)) {
        throw invalidArgument(
          `Invalid ${spec.choicesLabel ?? flag}: ${value}. Expected ${formatChoices(spec.choices)}.`,
        );
      }
    }
  }
  return spec.type === "string[]" ? [...values] : values[0];
}

export function validateInput(
  operation: AnyLedgerOperation,
  rawInput: Record<string, unknown>,
): Record<string, unknown> {
  const result = operation.input.safeParse(rawInput);
  if (result.success) return result.data as Record<string, unknown>;
  const issue = result.error.issues[0];
  const location = issue?.path.map(String).join(".");
  throw new LedgerError(
    "invalid-argument",
    location ? `Invalid ${location}: ${issue?.message ?? "invalid value"}` : issue?.message ?? "Invalid input",
    { issues: result.error.issues.map((item) => ({ path: item.path.map(String), message: item.message })) },
  );
}

export async function buildContext(
  operation: AnyLedgerOperation,
  cwd: string,
  version: string,
): Promise<LedgerOperationContext> {
  const base = {
    cwd,
    version,
    log: (line: string) => console.log(line),
    logError: (line: string) => console.error(line),
  };
  if (operation.workspace === "none") return base;
  if (operation.workspace === "required") {
    return { ...base, workspace: await findWorkspace(cwd) };
  }
  try {
    return { ...base, workspace: await findWorkspace(cwd) };
  } catch {
    return base;
  }
}

export function exitCodeForError(error: unknown): number {
  if (error instanceof LedgerError && error.code === "render-validation-failed") return 1;
  return 2;
}

export function helpForTopic(registry: readonly AnyLedgerOperation[], topic: string): string {
  const normalized = topic.trim();
  if (normalized === "") return generalHelp(registry);
  if (helpAliases.has(normalized) || normalized === "help") return builtinHelpTopics.help!;
  if (versionAliases.has(normalized)) return builtinHelpTopics.version!;

  const tokens = normalized.split(/\s+/);
  const operation = registry.find(
    (candidate) =>
      pathsFor(candidate).some((path) => path.join(" ") === normalized) ||
      candidate.cli.helpTopics?.includes(normalized),
  );
  if (operation) return operationHelp(operation);

  if (tokens.length === 1 && registry.some((candidate) => candidate.cli.path.length === 2 && candidate.cli.path[0] === tokens[0])) {
    return groupHelp(registry, tokens[0]!);
  }
  throw invalidArgument(`Unknown help topic: ${normalized}`);
}

export function operationHelp(operation: AnyLedgerOperation): string {
  const title = operation.cli.helpTitle ?? `Ledger ${operation.cli.path.join(" ")}`;
  return `${title}\n\nUsage:\n  ${operation.cli.usage}\n\n${operation.cli.help}`;
}

export function groupHelp(registry: readonly AnyLedgerOperation[], group: string): string {
  const members = registry.filter(
    (operation) => operation.cli.path.length === 2 && operation.cli.path[0] === group,
  );
  return `Ledger ${group}\n\nUsage:\n${members.map((operation) => `  ${operation.cli.usage}`).join("\n")}`;
}

export function generalHelp(registry: readonly AnyLedgerOperation[]): string {
  const usage = registry
    .filter((operation) => !operation.cli.hidden)
    .map((operation) => `  ${operation.cli.usage}`);
  return [
    "Ledger",
    "",
    "Usage:",
    "  ledger help [command]",
    "  ledger version",
    "  ledger <command> --local",
    ...usage,
    "",
    "Examples:",
    '  ledger new "Add provider retry policy" --from-diff --area server',
    '  ledger feedback "Dogfood finding" --area product --tag dogfood',
    '  ledger backlog new "Sharded search" --area search',
    "  ledger promote B001 --from-diff",
    "  ledger migrate changelog docs/changelog --rewrite-docs",
    "  ledger explain src/cli.ts --agent",
    "  ledger search renderer --limit 5",
    "  ledger search-packet renderer --budget 1600 --limit 5",
    "  ledger packet src/cli.ts --budget 1200",
    "  ledger verify-integrity",
    "  ledger metrics",
    "  ledger doctor",
    "  ledger release v0.1.0 --include-unreleased",
    "  ledger ci --json",
    "",
    "When `ledger serve --api` is running for the project, commands run inside that",
    "engine against its warm cache. Pass --local or set LEDGER_NO_DAEMON=1 to run in",
    "this process instead.",
  ].join("\n");
}

function groupUsage(registry: readonly AnyLedgerOperation[], group: string): string {
  const members = registry
    .filter((operation) => operation.cli.path.length === 2 && operation.cli.path[0] === group)
    .map((operation) => operation.cli.path[1]);
  return `Usage: ledger ${group} <${members.join("|")}>`;
}

function pathsFor(operation: AnyLedgerOperation): readonly (readonly string[])[] {
  return [operation.cli.path, ...(operation.cli.aliases ?? [])];
}

function push(flags: Record<string, string[]>, flag: string, value: string): void {
  flags[flag] = [...(flags[flag] ?? []), value];
}

function lastValue(values: readonly string[] | undefined): string | undefined {
  return values ? values[values.length - 1] : undefined;
}

function camelCase(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function formatChoices(choices: readonly string[]): string {
  if (choices.length <= 2) return choices.join(" or ");
  return `${choices.slice(0, -1).join(", ")}, or ${choices[choices.length - 1]}`;
}

function invalidArgument(message: string): LedgerError {
  return new LedgerError("invalid-argument", message);
}
