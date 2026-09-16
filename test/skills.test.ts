import { lstat, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { renderConfigWithAgentsCommand } from "../src/config.js";
import { installLedgerSkill, renderLedgerSkill, replaceAgentsBlock, writeAgentsBlock } from "../src/skills.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function fixtureWorkspace(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-skills-"));
  await initWorkspace(tempDir);
  return tempDir;
}

/** Persist `agents.command` in the fixture config the way `hooks install --command` does. */
async function configureCommand(root: string, command: string): Promise<void> {
  const configPath = path.join(root, ".ledger", "config.yaml");
  await writeFile(configPath, renderConfigWithAgentsCommand(await readFile(configPath, "utf8"), command));
}

describe("renderLedgerSkill", () => {
  it("renders Agent Skills frontmatter and the project workflow", async () => {
    const root = await fixtureWorkspace();
    const skill = renderLedgerSkill(await findWorkspace(root));
    expect(skill.startsWith("---\nname: ledger\ndescription: ")).toBe(true);
    expect(skill).toContain("ledger packet <path> --budget 1200");
    expect(skill).toContain("ledger ready");
    expect(skill).toContain("ledger session note");
    expect(skill).toContain("Docs adoption mode is `partial`");
  });

  it("renders every command span with agents.command", async () => {
    const root = await fixtureWorkspace();
    await configureCommand(root, "npx ledger");
    const skill = renderLedgerSkill(await findWorkspace(root));
    expect(skill).toContain("`npx ledger packet <path> --budget 1200`");
    expect(skill).toContain("`npx ledger ready`");
    expect(skill).toContain("`npx ledger hooks install`");
    expect(skill).toContain("`npx ledger mcp`");
    expect(skill).toContain("`npx ledger serve --api`");
    expect(skill).not.toMatch(/`ledger /);
  });
});

describe("skills install", () => {
  it("writes the skill, links it for Claude Code, and is idempotent", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const first = await installLedgerSkill(workspace, { hosts: ["claude-code", "codex", "cursor"] });
    expect(first.path).toBe(".agents/skills/ledger/SKILL.md");
    expect(first.changed).toBe(true);
    expect(first.hosts.map((host) => [host.host, host.mode])).toEqual([
      ["claude-code", process.platform === "win32" ? expect.any(String) : "symlink"],
      ["codex", "native"],
      ["cursor", "native"],
    ]);
    const content = await readFile(path.join(root, ".agents/skills/ledger/SKILL.md"), "utf8");
    expect(content).toContain("name: ledger");
    if (process.platform !== "win32") {
      const link = path.join(root, ".claude/skills/ledger");
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await readlink(link)).toBe(path.join("..", "..", ".agents", "skills", "ledger"));
      expect(await readFile(path.join(link, "SKILL.md"), "utf8")).toBe(content);
    }

    const second = await installLedgerSkill(workspace, { hosts: ["claude-code"] });
    expect(second.changed).toBe(false);
    expect(second.hosts[0]?.changed).toBe(false);
  });

  it("runs from the CLI with host selection", async () => {
    const root = await fixtureWorkspace();
    const result = await captureRun(["skills", "install", "--host", "codex", "--json"], root);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout).data;
    expect(data.hosts).toEqual([{ host: "codex", path: ".agents/skills/ledger", mode: "native", changed: false }]);
    await expect(lstat(path.join(root, ".claude/skills/ledger"))).rejects.toThrow();
    const text = await captureRun(["skills", "install"], root);
    expect(text.stdout).toContain(".agents/skills/ledger/SKILL.md is current");
    expect(text.stdout).toContain("- claude-code:");
  });
});

describe("agents --write", () => {
  it("creates, appends, and replaces the fenced block while preserving other content", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const created = await writeAgentsBlock(workspace, { file: "AGENTS.md", role: "contributor" });
    expect(created).toEqual({ path: "AGENTS.md", changed: true, created: true });
    const initial = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(initial).toContain("<!-- ledger:agents:start -->");
    expect(initial).toContain("# Ledger Workflow For Agents");
    expect(initial.trim().endsWith("<!-- ledger:agents:end -->")).toBe(true);

    await writeFile(path.join(root, "AGENTS.md"), "# Team rules\n\nAlways run tests.\n");
    const appended = await writeAgentsBlock(workspace, { file: "AGENTS.md", role: "reviewer" });
    expect(appended.changed).toBe(true);
    const withBlock = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(withBlock.startsWith("# Team rules\n\nAlways run tests.\n\n<!-- ledger:agents:start -->")).toBe(true);
    expect(withBlock).toContain("ledger stale --check");

    const unchanged = await writeAgentsBlock(workspace, { file: "AGENTS.md", role: "reviewer" });
    expect(unchanged.changed).toBe(false);

    await writeFile(path.join(root, "AGENTS.md"), `${withBlock}\nTrailing note.\n`);
    const replaced = await writeAgentsBlock(workspace, { file: "AGENTS.md", role: "release" });
    expect(replaced.changed).toBe(true);
    const final = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(final).toContain("# Team rules");
    expect(final).toContain("Trailing note.");
    expect(final).toContain("ledger unreleased --json");
    expect(final).not.toContain("ledger stale --check");
    expect(final.split("<!-- ledger:agents:start -->")).toHaveLength(2);
  });

  it("renders the configured command in the block and the agents envelope", async () => {
    const root = await fixtureWorkspace();
    await configureCommand(root, "npx ledger");
    const workspace = await findWorkspace(root);
    await writeAgentsBlock(workspace, { file: "AGENTS.md", role: "contributor" });
    const contributor = await readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(contributor).toContain("`npx ledger new \"<title>\" --from-diff --area <area>`");
    expect(contributor).not.toMatch(/`ledger /);
    await writeAgentsBlock(workspace, { file: "AGENTS.md", role: "reviewer" });
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("`npx ledger stale --check`");

    const envelope = await captureRun(["agents", "--role", "release", "--json"], root);
    expect(envelope.exitCode).toBe(0);
    const data = JSON.parse(envelope.stdout).data;
    expect(data.command).toBe("npx ledger");
    expect(data.instructions).toContain("`npx ledger unreleased --json`");
  });

  it("rejects unbalanced markers and supports --file from the CLI", async () => {
    const root = await fixtureWorkspace();
    expect(() => replaceAgentsBlock("<!-- ledger:agents:start -->\nlost", "block")).toThrow(/unbalanced/);
    const cli = await captureRun(["agents", "--write", "--file", "CLAUDE.md", "--json"], root);
    expect(cli.exitCode).toBe(0);
    expect(JSON.parse(cli.stdout).data.written).toEqual({ path: "CLAUDE.md", changed: true, created: true });
    const printed = await captureRun(["agents", "--role", "conflict"], root);
    expect(printed.stdout).toContain("ledger conflict <path>");
    expect(printed.stdout).not.toContain("ledger:agents");
  });
});

async function captureRun(argv: readonly string[], cwd: string): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };
  try {
    const exitCode = await run([...argv], { cwd });
    return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
