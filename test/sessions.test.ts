import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { promoteRecord } from "../src/authoring.js";
import { run } from "../src/cli.js";
import { readLedgerDocuments } from "../src/documents.js";
import { setFrontmatterArray } from "../src/frontmatterEdit.js";
import { queryDocuments } from "../src/query.js";
import { closeSession, findSession, noteSession, pruneSessions, startSession, touchSession } from "../src/sessions.js";
import { detectStaleKnowledge } from "../src/stale.js";
import { validateDocuments } from "../src/validate.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function fixtureWorkspace(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-sessions-"));
  await initWorkspace(tempDir);
  return tempDir;
}

describe("setFrontmatterArray", () => {
  it("replaces inline and block lists and appends missing keys", () => {
    const inline = '---\nid: "S0001"\nfiles: []\nareas: []\n---\n\n# S0001\n';
    const updated = setFrontmatterArray(inline, "files", ["src/a.ts", "src/b.ts"]);
    expect(updated).toContain('files:\n  - "src/a.ts"\n  - "src/b.ts"\nareas: []');
    const block = setFrontmatterArray(updated, "files", ["src/c.ts"]);
    expect(block).toContain('files:\n  - "src/c.ts"\nareas: []');
    expect(block).not.toContain("src/a.ts");
    const appended = setFrontmatterArray(block, "related", ["0001"]);
    expect(appended).toContain('areas: []\nrelated:\n  - "0001"\n---');
    expect(setFrontmatterArray(appended, "areas", [])).toContain("areas: []");
  });
});

describe("session records", () => {
  it("starts, touches, notes, and closes a session through the library", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const started = await startSession(workspace, await readLedgerDocuments(workspace), {
      host: "claude-code",
      hostSession: "abc-123",
    });
    expect(started.created).toBe(true);
    expect(started.session.id).toBe("S0001");
    expect(started.session.title).toMatch(/^Claude Code session \d{4}-\d{2}-\d{2}$/);
    expect(started.session.expires).toBeDefined();
    const raw = await readFile(path.join(root, started.session.path), "utf8");
    expect(raw).toContain('kind: "session"');
    expect(raw).toContain('status: "active"');
    expect(raw).toContain('host: "claude-code"');
    expect(raw).toContain('hostSession: "abc-123"');
    expect(raw).toContain("## Learned");

    const again = await startSession(workspace, await readLedgerDocuments(workspace), {
      host: "claude-code",
      hostSession: "abc-123",
    });
    expect(again.created).toBe(false);
    expect(again.session.id).toBe("S0001");

    const touched = await touchSession(
      workspace,
      await readLedgerDocuments(workspace),
      ["src/cli.ts", "docs/API.md", "src/cli.ts"],
      { hostSession: "abc-123" },
    );
    expect(touched.added).toEqual(["src/cli.ts", "docs/API.md"]);
    expect(touched.session.areas).toEqual(["cli", "docs"]);
    const touchedAgain = await touchSession(workspace, await readLedgerDocuments(workspace), ["src/cli.ts"], {
      hostSession: "abc-123",
    });
    expect(touchedAgain.added).toEqual([]);

    const noted = await noteSession(workspace, await readLedgerDocuments(workspace), "Cache is keyed by mtime", {
      hostSession: "abc-123",
    });
    expect(noted.bullets).toEqual(["Cache is keyed by mtime"]);
    await noteSession(workspace, await readLedgerDocuments(workspace), "Run npm run ci", {
      hostSession: "abc-123",
      section: "Next",
    });
    const body = await readFile(path.join(root, started.session.path), "utf8");
    expect(body).toContain("## Learned\n\n- Cache is keyed by mtime\n\n## Next\n\n- Run npm run ci\n");
    expect(body).not.toContain("Add facts worth keeping");
    expect(body).toContain('files:\n  - "src/cli.ts"\n  - "docs/API.md"');

    const documents = await readLedgerDocuments(workspace);
    expect(validateDocuments(workspace, documents).errors).toEqual([]);
    expect(queryDocuments(documents, { kind: "session" }).map((document) => document.id)).toEqual(["S0001"]);

    const closed = await closeSession(workspace, documents, { hostSession: "abc-123" });
    expect(closed.changed).toBe(true);
    expect(closed.session.status).toBe("closed");
    const closedAgain = await closeSession(workspace, await readLedgerDocuments(workspace), { id: "S0001" });
    expect(closedAgain.changed).toBe(false);
    expect(findSession(await readLedgerDocuments(workspace), { hostSession: "abc-123" }, { activeOnly: true })).toBeUndefined();
  });

  it("promotes a session into a change entry carrying files and notes", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    await startSession(workspace, await readLedgerDocuments(workspace), { title: "Fix the cache", host: "codex" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/catalogCache.ts"], {});
    await noteSession(workspace, await readLedgerDocuments(workspace), "sqlite backend needs Node 24.15", {});
    await noteSession(workspace, await readLedgerDocuments(workspace), "Add a regression test", { section: "Next" });

    const result = await promoteRecord(workspace, await readLedgerDocuments(workspace), "S0001", {
      status: "draft",
      fromDiff: false,
      staged: false,
    });
    expect(result.source.kind).toBe("session");
    expect(result.source.status).toBe("promoted");
    expect(result.entry.path).toBe(".ledger/entries/0001-fix-the-cache.md");
    const entry = await readFile(path.join(root, result.entry.path), "utf8");
    expect(entry).toContain('files:\n  - "src/catalogCache.ts"');
    expect(entry).toContain('related:\n  - "S0001"');
    expect(entry).toContain("## Notes\n\nLearned:\n- sqlite backend needs Node 24.15\n\nNext:\n- Add a regression test\n");
    const session = await readFile(path.join(root, result.source.path), "utf8");
    expect(session).toContain('status: "promoted"');
    expect(session).toContain('related:\n  - "0001"');

    const documents = await readLedgerDocuments(workspace);
    expect(validateDocuments(workspace, documents).errors).toEqual([]);
  });

  it("reports and prunes expired sessions", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    await startSession(workspace, await readLedgerDocuments(workspace), { title: "Old", expiresInDays: 1 });
    await startSession(workspace, await readLedgerDocuments(workspace), { title: "Fresh" });
    const oldPath = path.join(root, ".ledger/sessions/S0001-old.md");
    const stale = (await readFile(oldPath, "utf8")).replace(/expires: "[^"]+"/, 'expires: "2000-01-01"');
    await writeFile(oldPath, stale);

    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));
    expect(report.issues.map((issue) => issue.kind)).toContain("expired-session");

    const dryRun = await pruneSessions(workspace, documents, { write: false });
    expect(dryRun.expired.map((session) => session.id)).toEqual(["S0001"]);
    expect(dryRun.removed).toEqual([]);
    const pruned = await pruneSessions(workspace, documents, { write: true });
    expect(pruned.removed).toEqual([".ledger/sessions/S0001-old.md"]);
    const remaining = await readLedgerDocuments(workspace);
    expect(remaining.map((document) => String(document.frontmatter.id))).toEqual(["S0002"]);
  });

  it("exposes the session commands and the scratch alias on the CLI", async () => {
    const root = await fixtureWorkspace();
    const scratch = await captureRun(["scratch", "Ideas for search", "--area", "search", "--json"], root);
    expect(scratch.exitCode).toBe(0);
    const started = JSON.parse(scratch.stdout).data;
    expect(started.created).toBe(true);
    expect(started.session.path).toBe(".ledger/sessions/S0001-ideas-for-search.md");
    expect(started.session.areas).toEqual(["search"]);

    const touch = await captureRun(["session", "touch", "src/search.ts", "--json"], root);
    expect(JSON.parse(touch.stdout).data.added).toEqual(["src/search.ts"]);
    const note = await captureRun(["session", "note", "Weights live in searchCore", "--section", "Learned"], root);
    expect(note.stdout).toContain("Noted in S0001 Learned");
    const close = await captureRun(["session", "close"], root);
    expect(close.stdout).toContain("Closed S0001");
    const prune = await captureRun(["session", "prune"], root);
    expect(prune.stdout).toBe("No expired sessions.");
    const missing = await captureRun(["session", "note", "orphan", "--json"], root);
    expect(missing.exitCode).toBe(2);
    expect(JSON.parse(missing.stdout).error.code).toBe("record-not-found");
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
