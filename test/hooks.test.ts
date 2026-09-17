import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { renderConfigWithAgentsCommand } from "../src/config.js";
import { readLedgerDocuments } from "../src/documents.js";
import {
  buildSessionStartContext,
  claudeMdImportsAgents,
  hostHookFile,
  normalizeHookPayload,
  renderHostHooks,
  runHookEvent,
} from "../src/hooks.js";
import { setFrontmatterArray } from "../src/frontmatterEdit.js";
import { findSession, noteSession } from "../src/sessions.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

const execFileAsync = promisify(execFile);

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function fixtureRepo(): Promise<string> {
  tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-hooks-")));
  await initWorkspace(tempDir, { withDocs: true });
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 1;\n");
  await git(tempDir, "init", "-q");
  await git(tempDir, "add", ".");
  await git(tempDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "initial");
  return tempDir;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

const configRelative = path.join(".ledger", "config.yaml");

/** Persist `agents.command` in the fixture config the way `hooks install --command` does. */
async function configureCommand(root: string, command: string): Promise<void> {
  const configPath = path.join(root, configRelative);
  await writeFile(configPath, renderConfigWithAgentsCommand(await readFile(configPath, "utf8"), command));
}

const koreConfig = `version: 1
project: "kore"
sessions:
  expiresInDays: 7
# Commands verify --run may execute.
verification:
  allow:
    - "npx --yes @kylebegeman/ledger@0.7.0 ci **"
docs:
  root: docs
  routing:
    startHere: docs/llm/START_HERE.md # curated
`;

describe("renderHostHooks", () => {
  it("writes the six Claude Code hooks and preserves foreign entries and keys", () => {
    const existing = JSON.stringify({
      permissions: { allow: ["Bash(npm test)"] },
      hooks: {
        PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo done" }] }],
        Stop: [{ hooks: [{ type: "command", command: "ledger hook stop --host claude-code", timeout: 5 }] }],
      },
    });
    const rendered = JSON.parse(renderHostHooks("claude-code", "npx ledger", existing));
    expect(rendered.permissions).toEqual({ allow: ["Bash(npm test)"] });
    expect(Object.keys(rendered.hooks).sort()).toEqual(["PostToolUse", "PreCompact", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"]);
    expect(rendered.hooks.PostToolUse).toHaveLength(2);
    expect(rendered.hooks.PostToolUse[0].hooks[0].command).toBe("echo done");
    expect(rendered.hooks.PostToolUse[1]).toEqual({
      matcher: "Edit|Write|MultiEdit|NotebookEdit",
      hooks: [{ type: "command", command: "npx ledger hook post-tool-use --host claude-code", timeout: 30 }],
    });
    expect(rendered.hooks.Stop).toHaveLength(1);
    expect(rendered.hooks.Stop[0].hooks[0].timeout).toBe(60);
    expect(rendered.hooks.SessionStart[0].matcher).toBe("startup|resume|clear|compact");
    expect(rendered.hooks.SessionEnd[0].hooks[0].timeout).toBe(30);
    expect(rendered.hooks.UserPromptSubmit).toEqual([
      { hooks: [{ type: "command", command: "npx ledger hook user-prompt-submit --host claude-code", timeout: 15 }] },
    ]);
    const again = renderHostHooks("claude-code", "npx ledger", JSON.stringify(rendered));
    expect(JSON.parse(again)).toEqual(rendered);
  });

  it("adds the UserPromptSubmit group once to a file installed with the five-event layout", () => {
    const fiveEvents = JSON.parse(renderHostHooks("codex", "ledger", undefined));
    delete fiveEvents.hooks.UserPromptSubmit;
    expect(Object.keys(fiveEvents.hooks)).toHaveLength(5);
    const upgraded = JSON.parse(renderHostHooks("codex", "ledger", JSON.stringify(fiveEvents)));
    expect(Object.keys(upgraded.hooks).sort()).toEqual(["PostToolUse", "PreCompact", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"]);
    expect(upgraded.hooks.UserPromptSubmit).toHaveLength(1);
    expect(upgraded.hooks.UserPromptSubmit[0]).not.toHaveProperty("matcher");
    expect(upgraded.hooks.UserPromptSubmit[0].hooks[0]).toEqual({
      type: "command",
      command: "ledger hook user-prompt-submit --host codex",
      timeout: 15,
    });
    expect(upgraded.hooks.SessionStart[0].matcher).toBe("startup|resume|clear|compact");
    expect(upgraded.hooks.SessionEnd[0].hooks[0].timeout).toBe(3);
    expect(hostHookFile("codex").events).toContain("UserPromptSubmit");
    expect(hostHookFile("cursor").events).not.toContain("UserPromptSubmit");
  });

  it("writes Codex nested hooks with a description and Cursor flat hooks with a version", () => {
    const codex = JSON.parse(renderHostHooks("codex", "ledger", undefined));
    expect(codex.description).toBe("Ledger capture hooks");
    expect(codex.hooks.PostToolUse[0].matcher).toContain("apply_patch");
    expect(codex.hooks.SessionStart[0].hooks[0].command).toBe("ledger hook session-start --host codex");

    const cursor = JSON.parse(
      renderHostHooks("cursor", "ledger", JSON.stringify({ version: 1, hooks: { stop: [{ command: "./own.sh" }] } })),
    );
    expect(cursor.version).toBe(1);
    expect(Object.keys(cursor.hooks).sort()).toEqual(["afterFileEdit", "preCompact", "sessionEnd", "sessionStart", "stop"]);
    expect(cursor.hooks.stop).toEqual([
      { command: "./own.sh" },
      { type: "command", command: "ledger hook stop --host cursor", timeout: 60 },
    ]);
  });

  it("rejects an existing file that is not a JSON object", () => {
    expect(() => renderHostHooks("claude-code", "ledger", "not json")).toThrow(/not valid JSON/);
    expect(() => renderHostHooks("claude-code", "ledger", "[]")).toThrow(/JSON object/);
  });
});

describe("hostHookFile", () => {
  it("names the configured command in the first next step and hints --command only for the default", () => {
    const defaults = hostHookFile("claude-code");
    expect(defaults.nextSteps[0]).toContain("`ledger version`");
    expect(defaults.nextSteps[0]).toContain("Pass --command");
    expect(defaults.nextSteps).toHaveLength(2);
    expect(defaults.nextSteps.join("\n")).not.toContain("CLAUDE.md");
    for (const host of ["claude-code", "codex", "cursor"] as const) {
      const configured = hostHookFile(host, "npx ledger");
      expect(configured.nextSteps[0]).toContain("`npx ledger version`");
      expect(configured.nextSteps[0]).not.toMatch(/`ledger version`/);
      expect(configured.nextSteps[0]).not.toContain("Pass --command");
    }
    expect(hostHookFile("codex", "npx ledger").nextSteps[1]).toContain("/hooks");
    expect(hostHookFile("cursor", "npx ledger").nextSteps[1]).toContain("reloads .cursor/hooks.json");
  });
});

describe("claudeMdImportsAgents", () => {
  it("accepts bare, inline, and ./ imports and the managed block", () => {
    expect(claudeMdImportsAgents("# Kore\n\nProject rules.\n\n@AGENTS.md\n")).toBe(true);
    expect(claudeMdImportsAgents("Read @AGENTS.md first.\n")).toBe(true);
    expect(claudeMdImportsAgents("See @./AGENTS.md, then the docs.\n")).toBe(true);
    expect(claudeMdImportsAgents("Load @AGENTS.md.\n")).toBe(true);
    expect(claudeMdImportsAgents("# Rules\n\n<!-- ledger:agents:start -->\nblock\n<!-- ledger:agents:end -->\n")).toBe(true);
  });

  it("ignores mentions inside code spans and fenced blocks and other files", () => {
    expect(claudeMdImportsAgents("Add `@AGENTS.md` to this file.\n")).toBe(false);
    expect(claudeMdImportsAgents("Type ``@AGENTS.md`` to import.\n")).toBe(false);
    expect(claudeMdImportsAgents("```md\n@AGENTS.md\n```\n")).toBe(false);
    expect(claudeMdImportsAgents("@docs/AGENTS.md\n")).toBe(false);
    expect(claudeMdImportsAgents("@AGENTS.md.bak\n")).toBe(false);
    expect(claudeMdImportsAgents("")).toBe(false);
  });
});

describe("normalizeHookPayload", () => {
  const root = "/repo";

  it("maps Claude Code edit payloads to project-relative paths and drops outside paths", () => {
    const payload = normalizeHookPayload(
      "claude-code",
      "post-tool-use",
      {
        session_id: "s1",
        cwd: root,
        tool_name: "Edit",
        tool_input: { file_path: "/repo/src/a.ts" },
      },
      root,
    );
    expect(payload).toMatchObject({ sessionId: "s1", toolName: "Edit", paths: ["src/a.ts"], stopHookActive: false });
    const outside = normalizeHookPayload(
      "claude-code",
      "post-tool-use",
      { tool_input: { file_path: "/elsewhere/x.ts", notebook_path: "notes/n.ipynb" }, cwd: root },
      root,
    );
    expect(outside.paths).toEqual(["notes/n.ipynb"]);
  });

  it("reads a Codex apply_patch body sent as a shell command and ignores ordinary commands", () => {
    const patch = normalizeHookPayload(
      "codex",
      "post-tool-use",
      {
        session_id: "c2",
        tool_name: "apply_patch",
        tool_input: { command: "*** Begin Patch\n*** Update File: src/touched.ts\n@@\n-a\n+b\n*** End Patch" },
      },
      root,
    );
    expect(patch.paths).toEqual(["src/touched.ts"]);
    const shell = normalizeHookPayload(
      "codex",
      "post-tool-use",
      { session_id: "c2", tool_name: "shell", tool_input: { command: "npm test -- --run src/touched.ts" } },
      root,
    );
    expect(shell.paths).toEqual([]);
    const heredoc = normalizeHookPayload(
      "codex",
      "post-tool-use",
      { session_id: "c2", tool_name: "shell", tool_input: { command: "cat > notes.txt <<EOF\n*** Update File: src/ghost.ts\nEOF" } },
      root,
    );
    expect(heredoc.paths).toEqual([]);
    const aliased = normalizeHookPayload(
      "codex",
      "post-tool-use",
      { session_id: "c2", tool_name: "Edit", tool_input: { command: "*** Begin Patch\n*** Add File: src/added.ts\n+x\n*** End Patch" } },
      root,
    );
    expect(aliased.paths).toEqual(["src/added.ts"]);
  });

  it("reads Codex apply_patch paths and Cursor afterFileEdit payloads", () => {
    const codex = normalizeHookPayload(
      "codex",
      "post-tool-use",
      {
        session_id: "c1",
        tool_name: "apply_patch",
        tool_input: { patch: "*** Begin Patch\n*** Update File: src/b.ts\n@@\n*** Add File: docs/c.md\n*** End Patch" },
      },
      root,
    );
    expect(codex.paths).toEqual(["src/b.ts", "docs/c.md"]);
    const cursor = normalizeHookPayload(
      "cursor",
      "post-tool-use",
      { conversation_id: "u1", file_path: "/repo/src/d.ts", edits: [{ old_string: "a", new_string: "b" }] },
      root,
    );
    expect(cursor.sessionId).toBe("u1");
    expect(cursor.paths).toEqual(["src/d.ts"]);
    const stop = normalizeHookPayload("claude-code", "stop", { session_id: "s", stop_hook_active: true }, root);
    expect(stop.stopHookActive).toBe(true);
    expect(normalizeHookPayload("claude-code", "session-start", "garbage", root).paths).toEqual([]);
  });

  it("accepts paths reported through an aliased project root", async () => {
    if (process.platform === "win32") return;
    const real = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-hooks-alias-")));
    tempDir = real;
    await mkdir(path.join(real, "src"), { recursive: true });
    await writeFile(path.join(real, "src", "e.ts"), "");
    const alias = path.join(os.tmpdir(), `ledger-hooks-link-${path.basename(real)}`);
    await symlink(real, alias);
    try {
      const viaAlias = normalizeHookPayload(
        "claude-code",
        "post-tool-use",
        { tool_input: { file_path: path.join(alias, "src", "e.ts") }, cwd: alias },
        real,
      );
      expect(viaAlias.paths).toEqual(["src/e.ts"]);
      const rootAlias = normalizeHookPayload(
        "claude-code",
        "post-tool-use",
        { tool_input: { file_path: path.join(real, "src", "new.ts") }, cwd: real },
        alias,
      );
      expect(rootAlias.paths).toEqual(["src/new.ts"]);
    } finally {
      await rm(alias, { force: true });
    }
  });

  it("keeps the remaining payload fields", () => {
    const stop = normalizeHookPayload("claude-code", "stop", { session_id: "s", stop_hook_active: true }, root);
    expect(stop.stopHookActive).toBe(true);
    expect(normalizeHookPayload("claude-code", "session-start", "garbage", root).paths).toEqual([]);
  });
});

describe("hook events", () => {
  it("runs a Claude Code session from start to end and drafts one receipt", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    const sessionId = "claude-session-1";

    const start = await runHookEvent(workspace, "claude-code", "session-start", {
      sessionId,
      source: "startup",
      paths: [],
      stopHookActive: false,
    });
    expect(start.session?.id).toBe("S0001");
    expect(start.context).toContain("# Ledger memory for");
    expect(start.context).toContain("S0001");
    const output = start.output as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput.additionalContext).toBe(start.context);

    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 2;\n");
    const touch = await runHookEvent(workspace, "claude-code", "post-tool-use", {
      sessionId,
      toolName: "Edit",
      paths: ["src/feature.ts"],
      stopHookActive: false,
    });
    expect(touch.touched).toEqual(["src/feature.ts"]);
    expect(touch.output).toEqual({});

    const stop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(stop.entry).toMatchObject({ id: "0001", created: true });
    expect(stop.output).toEqual({
      systemMessage: `Ledger drafted ${stop.entry!.path}; give it a title and finish it with ledger ready.`,
    });
    const entry = await readFile(path.join(root, stop.entry!.path), "utf8");
    expect(entry).toContain('status: "draft"');
    expect(entry).toContain('title: "Changes to feature"');
    expect(entry).toContain('  - "src/feature.ts"');
    expect(entry).toContain('related:\n  - "S0001"');

    const prompt = await runHookEvent(workspace, "claude-code", "user-prompt-submit", { sessionId, paths: [], stopHookActive: false });
    expect(prompt.output).toEqual({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: prompt.context },
    });
    expect(prompt.context).toBe(
      `Ledger drafted ${stop.entry!.path} for this session (S0001). Finish that draft and run ledger ready; do not create another receipt with ledger new.`,
    );
    const notices = JSON.parse(await readFile(path.join(root, ".ledger/cache/hook-notices.json"), "utf8"));
    expect(notices).toEqual({ S0001: ["0001"] });
    const promptAgain = await runHookEvent(workspace, "claude-code", "user-prompt-submit", { sessionId, paths: [], stopHookActive: false });
    expect(promptAgain.output).toEqual({});
    expect(promptAgain.context).toBeUndefined();

    const loop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: true });
    expect(loop.entry).toBeUndefined();
    await writeFile(path.join(root, "docs", "README.md"), "# Docs\n\nUpdated in the session.\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["docs/README.md"], stopHookActive: false });
    const secondStop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(secondStop.entry).toMatchObject({ id: "0001", created: false });
    expect(secondStop.output).toEqual({});
    const refreshed = await readFile(path.join(root, stop.entry!.path), "utf8");
    expect(refreshed).toContain('  - "docs/README.md"');
    const entries = (await readLedgerDocuments(workspace)).filter((document) => document.kind === "change");
    expect(entries).toHaveLength(1);

    const compact = await runHookEvent(workspace, "claude-code", "pre-compact", { sessionId, paths: [], stopHookActive: false, trigger: "auto" });
    expect(compact.handoffPath).toBe(".ledger/reports/handoff.md");
    const handoff = await readFile(path.join(root, ".ledger/reports/handoff.md"), "utf8");
    expect(handoff).toContain("## This session so far");
    expect(handoff).toContain("`src/feature.ts`");
    expect(handoff).not.toContain("- 0001 ");
    expect(handoff).not.toContain("Add invariants.");
    const linkedLine = `Linked receipt: 0001 Changes to feature (${stop.entry!.path}, draft). Finish it and run ledger ready before landing; do not create another receipt with ledger new.`;
    expect(handoff).toContain(linkedLine);

    const resumed = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "compact", paths: [], stopHookActive: false });
    expect(resumed.session?.id).toBe("S0001");
    expect(resumed.context).toContain("Touched:");
    expect(resumed.context).toContain(linkedLine);
    const restarted = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "resume", paths: [], stopHookActive: false });
    expect(restarted.context).toContain(linkedLine);
    // A refreshed draft is announced once at creation only.
    expect((await runHookEvent(workspace, "claude-code", "user-prompt-submit", { sessionId, paths: [], stopHookActive: false })).output).toEqual({});

    const end = await runHookEvent(workspace, "claude-code", "session-end", { sessionId, paths: [], stopHookActive: false, reason: "other" });
    expect(end.closed).toBe(true);
    expect(findSession(await readLedgerDocuments(workspace), { hostSession: sessionId }, { activeOnly: true })).toBeUndefined();
  }, 30_000);

  it("does nothing on stop without touched paths and answers Cursor in its own shape", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    await captureRun(["new", "Earlier landed work", "--area", "cli", "--status", "landed"], root);
    await captureRun(["backlog", "new", "Open item"], root);
    const start = await runHookEvent(workspace, "cursor", "session-start", { sessionId: "cur-1", paths: [], stopHookActive: false });
    expect(start.output).toEqual({ additional_context: start.context });
    expect(start.context).toContain("## Recent changes");
    expect(start.context).toContain("- 0001 Earlier landed work [cli]");
    expect(start.context).toContain("## Open backlog");
    expect(start.context).toContain("- B001 Open item (proposed)");
    const stop = await runHookEvent(workspace, "cursor", "stop", { sessionId: "cur-1", paths: [], stopHookActive: false });
    expect(stop.entry).toBeUndefined();
    expect(stop.output).toEqual({});
    const empty = await runHookEvent(workspace, "cursor", "post-tool-use", { sessionId: "cur-1", paths: [], stopHookActive: false });
    expect(empty.output).toEqual({});

    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 4;\n");
    await runHookEvent(workspace, "cursor", "post-tool-use", { sessionId: "cur-1", paths: ["src/feature.ts"], stopHookActive: false });
    const drafted = await runHookEvent(workspace, "cursor", "stop", { sessionId: "cur-1", paths: [], stopHookActive: false });
    expect(drafted.entry?.created).toBe(true);
    expect(drafted.output).toEqual({});
    const cursorPrompt = await runHookEvent(workspace, "cursor", "user-prompt-submit", { sessionId: "cur-1", paths: [], stopHookActive: false });
    expect(cursorPrompt.output).toEqual({});
    await expect(readFile(path.join(root, ".ledger/cache/hook-notices.json"), "utf8")).rejects.toThrow();
  }, 30_000);

  it("announces a Codex draft in the Codex shape and stays silent without a session", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    expect((await runHookEvent(workspace, "codex", "user-prompt-submit", { paths: [], stopHookActive: false })).output).toEqual({});
    expect((await runHookEvent(workspace, "codex", "user-prompt-submit", { sessionId: "nobody", paths: [], stopHookActive: false })).output).toEqual({});

    const sessionId = "codex-thread-1";
    await runHookEvent(workspace, "codex", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    expect((await runHookEvent(workspace, "codex", "user-prompt-submit", { sessionId, paths: [], stopHookActive: false })).output).toEqual({});
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 5;\n");
    await runHookEvent(workspace, "codex", "post-tool-use", { sessionId, toolName: "apply_patch", paths: ["src/feature.ts"], stopHookActive: false });
    const stop = await runHookEvent(workspace, "codex", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(stop.entry?.created).toBe(true);
    const prompt = await runHookEvent(workspace, "codex", "user-prompt-submit", { sessionId, paths: [], stopHookActive: false });
    expect(prompt.output).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: expect.stringContaining(`Ledger drafted ${stop.entry!.path} for this session (S0001).`),
      },
    });
    expect((await runHookEvent(workspace, "codex", "user-prompt-submit", { sessionId, paths: [], stopHookActive: false })).output).toEqual({});
  }, 30_000);

  it("never re-drafts a landed linked receipt and drafts again only for an uncovered path", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    const sessionId = "land-1";
    await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 2;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/feature.ts"], stopHookActive: false });
    const first = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(first.entry).toMatchObject({ id: "0001", created: true });
    const entryPath = path.join(root, first.entry!.path);
    await writeFile(entryPath, (await readFile(entryPath, "utf8")).replace('status: "draft"', 'status: "landed"'));
    const landedRaw = await readFile(entryPath, "utf8");

    const stop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(stop.entry).toEqual({ id: "0001", path: first.entry!.path, created: false });
    expect(stop.output).toEqual({});
    expect(await readFile(entryPath, "utf8")).toBe(landedRaw);
    const end = await runHookEvent(workspace, "claude-code", "session-end", { sessionId, paths: [], stopHookActive: false, reason: "other" });
    expect(end.entry?.created).toBe(false);
    expect(end.closed).toBe(true);
    let entries = (await readLedgerDocuments(workspace)).filter((document) => document.kind === "change");
    expect(entries).toHaveLength(1);
    const linked = await runHookEvent(workspace, "claude-code", "session-start", { sessionId: "land-2", source: "startup", paths: [], stopHookActive: false });
    expect(linked.context).not.toContain("Linked receipt:");

    await git(root, "add", ".");
    await git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "land");
    const reopened = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    expect(reopened.session?.id).toBe("S0003");
    await writeFile(path.join(root, "src", "other.ts"), "export const other = 1;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/other.ts"], stopHookActive: false });
    const second = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(second.entry).toMatchObject({ id: "0002", created: true });
    const secondRaw = await readFile(path.join(root, second.entry!.path), "utf8");
    expect(secondRaw).toContain('  - "src/other.ts"');
    expect(secondRaw).toContain('related:\n  - "S0003"');
    entries = (await readLedgerDocuments(workspace)).filter((document) => document.kind === "change");
    expect(entries).toHaveLength(2);

    const covered = await runHookEvent(workspace, "claude-code", "session-start", { sessionId: "land-4", source: "startup", paths: [], stopHookActive: false });
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId: "land-4", paths: ["src/feature.ts"], stopHookActive: false });
    const session = findSession(await readLedgerDocuments(workspace), { id: covered.session!.id }, { activeOnly: false })!;
    await writeFile(
      path.join(root, session.parsed.relativePath),
      session.parsed.raw.replace("files:", 'related:\n  - "0001"\nfiles:'),
    );
    const quiet = await runHookEvent(workspace, "claude-code", "stop", { sessionId: "land-4", paths: [], stopHookActive: false });
    expect(quiet.entry).toEqual({ id: "0001", path: first.entry!.path, created: false });
    expect(quiet.output).toEqual({});
    expect((await readLedgerDocuments(workspace)).filter((document) => document.kind === "change")).toHaveLength(2);
  }, 30_000);

  it("leaves committed paths and paths another receipt covers out of hook drafts", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    const commit = async (message: string) => {
      await git(root, "add", ".");
      await git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", message);
    };
    const changeEntries = async () => (await readLedgerDocuments(workspace)).filter((document) => document.kind === "change");
    const sessionId = "hand-1";
    const start = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });

    // A receipt written by hand in the working tree covers the edit, so Stop drafts nothing.
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 2;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/feature.ts"], stopHookActive: false });
    expect((await captureRun(["new", "Hand-written receipt", "--from-diff", "--area", "feature"], root)).exitCode).toBe(0);
    const covered = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(covered.entry).toBeUndefined();
    expect(covered.output).toEqual({});
    expect(await changeEntries()).toHaveLength(1);

    // Once the work is committed, the touched path is no longer pending.
    await commit("hand-written");
    const committed = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(committed.entry).toBeUndefined();
    expect(await changeEntries()).toHaveLength(1);

    // A new draft lists only the uncovered edit, not the covered file or the other receipt's own path.
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 3;\n");
    await writeFile(path.join(root, "src", "other.ts"), "export const other = 1;\n");
    expect((await captureRun(["new", "Covers the feature file", "--area", "feature"], root)).exitCode).toBe(0);
    const coveringDocument = (await changeEntries()).find((document) => document.relativePath.includes("covers-the-feature-file"))!;
    const coveringPath = path.join(root, coveringDocument.relativePath);
    await writeFile(coveringPath, setFrontmatterArray(await readFile(coveringPath, "utf8"), "files", ["src/feature.ts"]));
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/feature.ts", "src/other.ts"], stopHookActive: false });
    const drafted = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(drafted.entry).toMatchObject({ id: "0003", created: true });
    const draft = await readFile(path.join(root, drafted.entry!.path), "utf8");
    expect(draft).toContain('files:\n  - "src/other.ts"\n');
    expect(draft).not.toContain('"src/feature.ts"');
    expect(draft).not.toContain(coveringDocument.relativePath);
    expect(draft).toContain('areas:\n  - "other"\n');
    expect(draft).toContain("### src/other.ts");
    expect(draft).not.toContain("path/to/file.ts");

    // A committed receipt that names the session in its own related list counts as linked.
    await commit("drafted");
    await writeFile(path.join(root, "src", "linked.ts"), "export const linked = 1;\n");
    expect((await captureRun(["new", "Names the session", "--area", "linked"], root)).exitCode).toBe(0);
    const namingDocument = (await changeEntries()).find((document) => document.relativePath.includes("names-the-session"))!;
    const namingPath = path.join(root, namingDocument.relativePath);
    let naming = setFrontmatterArray(await readFile(namingPath, "utf8"), "files", ["src/linked.ts"]);
    naming = setFrontmatterArray(naming, "related", [start.session!.id]);
    await writeFile(namingPath, naming);
    await commit("naming");
    await writeFile(path.join(root, "src", "linked.ts"), "export const linked = 2;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/linked.ts"], stopHookActive: false });
    const quiet = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(quiet.entry?.created).toBe(false);
    expect(await changeEntries()).toHaveLength(4);
  }, 30_000);

  it("keeps session records, templates, and their headings out of hook drafts", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    const templatePath = path.join(root, ".ledger/templates/change.md");
    await writeFile(templatePath, `${await readFile(templatePath, "utf8")}\nTrailing template note.\n`);
    const sessionId = "scaffold-1";
    await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 2;\nexport function runFeature() {}\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/feature.ts"], stopHookActive: false });
    const stop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(stop.entry?.created).toBe(true);
    const entry = await readFile(path.join(root, stop.entry!.path), "utf8");
    expect(entry).not.toContain(".ledger/sessions/");
    expect(entry).not.toContain(".ledger/templates/");
    expect(entry).toContain('  - "runFeature"');
    for (const heading of ["Learned", "Next", "Summary"]) expect(entry).not.toContain(`  - "${heading}"`);
    expect(entry).not.toMatch(/^- What changed:\s*$/m);
    expect(entry).not.toMatch(/^- Anchor:\s*$/m);
    expect(entry).not.toMatch(/^- On conflict:\s*$/m);
    expect(entry).toContain("Trailing template note.");
  }, 30_000);

  it("replaces an expired active session on session start and carries its linked receipts", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    const sessionId = "desktop-tab";
    const first = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    expect(first.session?.id).toBe("S0001");
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 2;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/feature.ts"], stopHookActive: false });
    const stop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(stop.entry?.created).toBe(true);
    const sessionPath = path.join(root, first.session!.path);
    await writeFile(sessionPath, (await readFile(sessionPath, "utf8")).replace(/expires: "[^"]+"/, 'expires: "2000-01-01"'));

    const restarted = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    expect(restarted.session).toMatchObject({ id: "S0002", related: ["0001"] });
    expect(restarted.context).not.toContain("## This session so far");
    expect(restarted.context).toContain(`Linked receipt: 0001 Changes to feature (${stop.entry!.path}, draft).`);
    expect(await readFile(path.join(root, restarted.session!.path), "utf8")).toContain('related:\n  - "0001"');

    await writeFile(path.join(root, "docs", "README.md"), "# Docs\n\nUpdated after the restart.\n");
    const touch = await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["docs/README.md"], stopHookActive: false });
    expect(touch.session?.id).toBe("S0002");
    expect(touch.touched).toEqual(["docs/README.md"]);
    expect(await readFile(sessionPath, "utf8")).not.toContain("docs/README.md");
    const stale = findSession(await readLedgerDocuments(workspace), { id: "S0001" }, { activeOnly: false });
    expect(stale?.normalized.status).toBe("active");
    expect(findSession(await readLedgerDocuments(workspace), { hostSession: sessionId }, { activeOnly: true })?.normalized.id).toBe("S0002");
    const refreshed = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(refreshed.entry).toEqual({ id: "0001", path: stop.entry!.path, created: false });
    expect(await readFile(path.join(root, stop.entry!.path), "utf8")).toContain('  - "docs/README.md"');
  }, 30_000);

  it("closes an expired active session when SessionEnd arrives late", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    const sessionId = "late-end";
    const first = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 3;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, paths: ["src/feature.ts"], stopHookActive: false });
    const stop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(stop.entry?.created).toBe(true);
    const sessionPath = path.join(root, first.session!.path);
    await writeFile(sessionPath, (await readFile(sessionPath, "utf8")).replace(/expires: "[^"]+"/, 'expires: "2000-01-01"'));

    const ended = await runHookEvent(workspace, "claude-code", "session-end", { sessionId, paths: [], stopHookActive: false, reason: "other" });
    expect(ended).toMatchObject({ closed: true, output: {} });
    expect(ended.session?.id).toBe("S0001");
    expect(await readFile(sessionPath, "utf8")).toContain('status: "closed"');
    expect((await readLedgerDocuments(workspace)).filter((document) => document.kind === "change")).toHaveLength(1);
  }, 30_000);

  it("titles a draft from the Summary note or the neutral default and prefers directory areas", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    await writeFile(path.join(root, "CONTRIBUTING.md"), "# Contributing\n");
    const named = "summary-1";
    await runHookEvent(workspace, "claude-code", "session-start", { sessionId: named, source: "startup", paths: [], stopHookActive: false });
    await noteSession(workspace, await readLedgerDocuments(workspace), "Rename Forge to Kore in the contributing guide", {
      hostSession: named,
      section: "Summary",
    });
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 2;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId: named, paths: ["CONTRIBUTING.md", "src/feature.ts"], stopHookActive: false });
    const stop = await runHookEvent(workspace, "claude-code", "stop", { sessionId: named, paths: [], stopHookActive: false });
    expect(stop.entry?.path).toBe(".ledger/entries/0001-rename-forge-to-kore-in-the-contributing-guide.md");
    const entry = await readFile(path.join(root, stop.entry!.path), "utf8");
    expect(entry).toContain('title: "Rename Forge to Kore in the contributing guide"');
    expect(entry).toContain('areas:\n  - "feature"\n');
    expect(entry).not.toContain('"contributing"');
    // Commit the first session's work so its draft no longer covers the next edit.
    await git(root, "add", ".");
    await git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "named");
    await writeFile(path.join(root, "CONTRIBUTING.md"), "# Contributing\n\nA second edit.\n");

    const plain = "summary-2";
    await runHookEvent(workspace, "claude-code", "session-start", { sessionId: plain, source: "startup", paths: [], stopHookActive: false });
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId: plain, paths: ["CONTRIBUTING.md"], stopHookActive: false });
    const plainStop = await runHookEvent(workspace, "claude-code", "stop", { sessionId: plain, paths: [], stopHookActive: false });
    expect(plainStop.entry?.path).toBe(".ledger/entries/0002-changes-to-contributing.md");
    expect(await readFile(path.join(root, plainStop.entry!.path), "utf8")).toContain('title: "Changes to contributing"');
  }, 30_000);

  it("keeps injected context within the budget", async () => {
    const root = await fixtureRepo();
    const workspace = await findWorkspace(root);
    const start = await runHookEvent(workspace, "claude-code", "session-start", { sessionId: "b", paths: [], stopHookActive: false });
    const documents = await readLedgerDocuments(workspace);
    const small = await buildSessionStartContext(workspace, documents, start.session!, { budgetTokens: 200 });
    expect(small.length).toBeLessThanOrEqual(200 * 4 + 120);
    expect(small).toContain("# Ledger memory for");
  }, 30_000);

  it("renders the configured command in context, the truncation notice, the stop notice, and the handoff", async () => {
    const root = await fixtureRepo();
    await configureCommand(root, "npx ledger");
    const workspace = await findWorkspace(root);
    expect(workspace.config.agents.command).toBe("npx ledger");
    for (let index = 0; index < 6; index += 1) {
      await captureRun(
        ["new", `Landed change number ${index} with a deliberately long title that exists only to push the injected context past a two hundred token budget so truncation happens`, "--area", "cli", "--status", "landed"],
        root,
      );
    }
    const sessionId = "configured-1";
    const start = await runHookEvent(workspace, "claude-code", "session-start", { sessionId, source: "startup", paths: [], stopHookActive: false });
    expect(start.context).toContain("`npx ledger packet <path> --budget 1200`");
    expect(start.context).toContain("`npx ledger session note \"<fact>\"`");
    expect(start.context).toContain("`npx ledger ready`");
    expect(start.context).not.toMatch(/`ledger /);

    const documents = await readLedgerDocuments(workspace);
    const small = await buildSessionStartContext(workspace, documents, start.session!, { budgetTokens: 200 });
    expect(small).toContain("run npx ledger packet for more.");

    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 3;\n");
    await runHookEvent(workspace, "claude-code", "post-tool-use", { sessionId, toolName: "Edit", paths: ["src/feature.ts"], stopHookActive: false });
    const stop = await runHookEvent(workspace, "claude-code", "stop", { sessionId, paths: [], stopHookActive: false });
    expect(stop.output).toMatchObject({ systemMessage: expect.stringContaining("give it a title and finish it with npx ledger ready.") });
    const prompt = await runHookEvent(workspace, "claude-code", "user-prompt-submit", { sessionId, paths: [], stopHookActive: false });
    expect(prompt.context).toContain("run npx ledger ready; do not create another receipt with npx ledger new.");
    expect(prompt.context).not.toContain("run ledger ready");
    expect(prompt.context).not.toContain("with ledger new");

    const compact = await runHookEvent(workspace, "claude-code", "pre-compact", { sessionId, paths: [], stopHookActive: false, trigger: "auto" });
    expect(compact.handoffPath).toBe(".ledger/reports/handoff.md");
    const handoff = await readFile(path.join(root, ".ledger/reports/handoff.md"), "utf8");
    expect(handoff).toContain("`npx ledger packet <path> --budget 1200`");
    expect(handoff).toContain("Finish it and run npx ledger ready before landing; do not create another receipt with npx ledger new.");
  }, 30_000);
});

describe("hooks install CLI", () => {
  it("writes the host file, is idempotent, and supports dry runs", async () => {
    const root = await fixtureRepo();
    const install = await captureRun(["hooks", "install", "--host", "claude-code", "--json"], root);
    expect(install.exitCode).toBe(0);
    const data = JSON.parse(install.stdout).data;
    expect(data).toMatchObject({ host: "claude-code", path: ".claude/settings.json", changed: true, dryRun: false });
    const settings = JSON.parse(await readFile(path.join(root, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("ledger hook session-start --host claude-code");

    const again = await captureRun(["hooks", "install", "--host", "claude-code"], root);
    expect(again.stdout).toContain("already has the current Ledger hooks");

    const dry = await captureRun(["hooks", "install", "--host", "cursor", "--command", "npx ledger", "--dry-run"], root);
    expect(dry.exitCode).toBe(0);
    expect(JSON.parse(dry.stdout).hooks.afterFileEdit[0].command).toBe("npx ledger hook post-tool-use --host cursor");
    await expect(readFile(path.join(root, ".cursor/hooks.json"), "utf8")).rejects.toThrow();

    const help = await captureRun(["help"], root);
    expect(help.stdout).toContain("ledger hooks install --host");
    expect(help.stdout).not.toContain("ledger hook <session-start");
  }, 30_000);

  it("persists --command as agents.command in place and reuses it on later installs", async () => {
    const root = await fixtureRepo();
    const configPath = path.join(root, configRelative);
    const scaffold = await readFile(configPath, "utf8");
    expect(scaffold).toContain("agents:\n  command: ledger\n");

    const install = await captureRun(["hooks", "install", "--host", "claude-code", "--command", "npx ledger", "--json"], root);
    expect(install.exitCode).toBe(0);
    const data = JSON.parse(install.stdout).data;
    expect(data).toMatchObject({ command: "npx ledger", changed: true, configured: true, dryRun: false });
    expect(data.nextSteps[0]).toContain("`npx ledger version`");
    expect(data.nextSteps[0]).not.toContain("Pass --command");
    const rewritten = await readFile(configPath, "utf8");
    expect(rewritten).toBe(scaffold.replace("agents:\n  command: ledger\n", "agents:\n  command: npx ledger\n"));
    const settings = JSON.parse(await readFile(path.join(root, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("npx ledger hook session-start --host claude-code");

    const cursor = await captureRun(["hooks", "install", "--host", "cursor", "--json"], root);
    expect(cursor.exitCode).toBe(0);
    expect(JSON.parse(cursor.stdout).data).toMatchObject({ command: "npx ledger", changed: true, configured: false });
    const hooks = JSON.parse(await readFile(path.join(root, ".cursor/hooks.json"), "utf8"));
    expect(hooks.hooks.afterFileEdit[0].command).toBe("npx ledger hook post-tool-use --host cursor");
    expect(await readFile(configPath, "utf8")).toBe(rewritten);

    const same = await captureRun(["hooks", "install", "--host", "claude-code", "--command", "npx ledger"], root);
    expect(same.exitCode).toBe(0);
    expect(same.stdout).toContain("already has the current Ledger hooks");
    expect(same.stdout).not.toContain("Saved agents.command");
    expect(await readFile(configPath, "utf8")).toBe(rewritten);
  }, 30_000);

  it("appends agents.command to a commented config without touching any other byte", async () => {
    const root = await fixtureRepo();
    const configPath = path.join(root, configRelative);
    await writeFile(configPath, koreConfig);
    const command = "npx --yes @kylebegeman/ledger@0.8.0";
    const install = await captureRun(["hooks", "install", "--host", "codex", "--command", command], root);
    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain(`Saved agents.command "${command}" in .ledger/config.yaml.`);
    const rewritten = await readFile(configPath, "utf8");
    expect(rewritten).toContain(`\nagents:\n  command: ${command}\n`);
    expect(rewritten.replace(/agents:\n  command: [^\n]*\n/, "")).toBe(koreConfig);
    expect((await findWorkspace(root)).config.agents.command).toBe(command);
  }, 30_000);

  it("persists the command and the import when config.yaml and CLAUDE.md start with a BOM", async () => {
    const root = await fixtureRepo();
    const configPath = path.join(root, configRelative);
    const claudeMd = path.join(root, "CLAUDE.md");
    const scaffold = await readFile(configPath, "utf8");
    await writeFile(configPath, `\uFEFF${scaffold}`);
    await writeFile(claudeMd, "\uFEFF# Rules\n");
    const install = await captureRun(["hooks", "install", "--host", "claude-code", "--command", "npx ledger", "--import-agents", "--json"], root);
    expect(install.exitCode).toBe(0);
    expect(JSON.parse(install.stdout).data).toMatchObject({
      configured: true,
      agentsImport: { present: false, added: true, created: false },
    });
    expect(await readFile(configPath, "utf8")).toBe(scaffold.replace("agents:\n  command: ledger\n", "agents:\n  command: npx ledger\n"));
    expect(await readFile(claudeMd, "utf8")).toBe("# Rules\n\n@AGENTS.md\n");
  }, 30_000);

  it("computes but never writes the config on a dry run and rejects a malformed command", async () => {
    const root = await fixtureRepo();
    const configPath = path.join(root, configRelative);
    const before = await readFile(configPath, "utf8");
    const dry = await captureRun(["hooks", "install", "--host", "claude-code", "--command", "npx ledger", "--dry-run", "--json"], root);
    expect(dry.exitCode).toBe(0);
    const data = JSON.parse(dry.stdout).data;
    expect(data).toMatchObject({ command: "npx ledger", dryRun: true, configured: false });
    expect(JSON.parse(data.content).hooks.Stop[0].hooks[0].command).toBe("npx ledger hook stop --host claude-code");
    expect(await readFile(configPath, "utf8")).toBe(before);
    await expect(readFile(path.join(root, ".claude/settings.json"), "utf8")).rejects.toThrow();

    const dryImport = await captureRun(["hooks", "install", "--host", "claude-code", "--import-agents", "--dry-run", "--json"], root);
    expect(dryImport.exitCode).toBe(0);
    expect(JSON.parse(dryImport.stdout).data.agentsImport).toEqual({ path: "CLAUDE.md", present: false, added: false, created: false });
    await expect(readFile(path.join(root, "CLAUDE.md"), "utf8")).rejects.toThrow();

    const bad = await captureRun(["hooks", "install", "--host", "claude-code", "--command", " npx ledger"], root);
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain("--command must be a non-empty single-line command");
    expect(await readFile(configPath, "utf8")).toBe(before);
    await expect(readFile(path.join(root, ".claude/settings.json"), "utf8")).rejects.toThrow();
  }, 30_000);

  it("reports a missing CLAUDE.md import and adds it with --import-agents", async () => {
    const root = await fixtureRepo();
    const claudeMd = path.join(root, "CLAUDE.md");
    await writeFile(claudeMd, "# Rules\n\nAlways run tests.\n\n");
    await writeFile(path.join(root, "AGENTS.md"), "# Agents\n");

    const check = await captureRun(["hooks", "install", "--host", "claude-code", "--json"], root);
    expect(check.exitCode).toBe(0);
    const checked = JSON.parse(check.stdout).data;
    expect(checked.agentsImport).toEqual({ path: "CLAUDE.md", present: false, added: false, created: false });
    expect(checked.nextSteps.at(-1)).toBe(
      "CLAUDE.md does not import AGENTS.md; re-run with --import-agents to add `@AGENTS.md`, or keep the block in CLAUDE.md with `ledger agents --write --file CLAUDE.md`.",
    );
    expect(await readFile(claudeMd, "utf8")).toBe("# Rules\n\nAlways run tests.\n\n");

    const add = await captureRun(["hooks", "install", "--host", "claude-code", "--import-agents", "--json"], root);
    expect(add.exitCode).toBe(0);
    const added = JSON.parse(add.stdout).data;
    expect(added.agentsImport).toEqual({ path: "CLAUDE.md", present: false, added: true, created: false });
    expect(added.nextSteps.join("\n")).not.toContain("AGENTS.md is missing");
    expect(await readFile(claudeMd, "utf8")).toBe("# Rules\n\nAlways run tests.\n\n@AGENTS.md\n");

    const again = await captureRun(["hooks", "install", "--host", "claude-code", "--import-agents"], root);
    expect(again.exitCode).toBe(0);
    expect(again.stdout).not.toContain("CLAUDE.md with the @AGENTS.md import");
    expect(again.stdout).not.toContain("does not import");
    expect(await readFile(claudeMd, "utf8")).toBe("# Rules\n\nAlways run tests.\n\n@AGENTS.md\n");

    const kore = "# Kore\n\nProject rules live in AGENTS.md.\n\n@AGENTS.md\n";
    await writeFile(claudeMd, kore);
    const present = await captureRun(["hooks", "install", "--host", "claude-code", "--import-agents", "--json"], root);
    expect(JSON.parse(present.stdout).data.agentsImport).toEqual({ path: "CLAUDE.md", present: true, added: false, created: false });
    expect(await readFile(claudeMd, "utf8")).toBe(kore);

    const backticked = "Add `@AGENTS.md` later.\n";
    await writeFile(claudeMd, backticked);
    const missing = await captureRun(["hooks", "install", "--host", "claude-code", "--json"], root);
    expect(JSON.parse(missing.stdout).data.agentsImport.present).toBe(false);
    expect(await readFile(claudeMd, "utf8")).toBe(backticked);
  }, 30_000);

  it("creates CLAUDE.md with --import-agents and rejects the flag for other hosts", async () => {
    const root = await fixtureRepo();
    const claudeMd = path.join(root, "CLAUDE.md");
    const created = await captureRun(["hooks", "install", "--host", "claude-code", "--import-agents", "--json"], root);
    expect(created.exitCode).toBe(0);
    const data = JSON.parse(created.stdout).data;
    expect(data.agentsImport).toEqual({ path: "CLAUDE.md", present: false, added: true, created: true });
    expect(data.nextSteps.at(-1)).toBe("AGENTS.md is missing; run `ledger agents --write` so the import has a block to load.");
    expect(await readFile(claudeMd, "utf8")).toBe("@AGENTS.md\n");
    const text = await captureRun(["hooks", "install", "--host", "claude-code", "--import-agents"], root);
    expect(text.stdout).not.toContain("Created CLAUDE.md");

    const codex = await captureRun(["hooks", "install", "--host", "codex", "--import-agents", "--json"], root);
    expect(codex.exitCode).toBe(2);
    const failure = JSON.parse(codex.stdout);
    expect(failure.ok).toBe(false);
    expect(failure.error).toMatchObject({ code: "invalid-argument", message: "--import-agents applies to --host claude-code" });
    await expect(readFile(path.join(root, ".codex/hooks.json"), "utf8")).rejects.toThrow();
    const cursor = await captureRun(["hooks", "install", "--host", "cursor", "--import-agents"], root);
    expect(cursor.exitCode).toBe(2);
    await expect(readFile(path.join(root, ".cursor/hooks.json"), "utf8")).rejects.toThrow();
  }, 30_000);
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
