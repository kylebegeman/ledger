import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { promoteRecord } from "../src/authoring.js";
import { run } from "../src/cli.js";
import { readLedgerDocuments } from "../src/documents.js";
import { setFrontmatterArray } from "../src/frontmatterEdit.js";
import { queryDocuments } from "../src/query.js";
import {
  closeSession,
  draftSessionReceipt,
  findExpiredActiveSession,
  findSession,
  noteSession,
  pruneSessions,
  startSession,
  touchSession,
} from "../src/sessions.js";
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
    expect(dryRun.kept).toEqual([]);
    expect(dryRun.removed).toEqual([]);
    const pruned = await pruneSessions(workspace, documents, { write: true });
    expect(pruned.removed).toEqual([".ledger/sessions/S0001-old.md"]);
    const remaining = await readLedgerDocuments(workspace);
    expect(remaining.map((document) => String(document.frontmatter.id))).toEqual(["S0002"]);
  });

  it("prunes and reports only the expired file when two sessions share an id", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    await startSession(workspace, await readLedgerDocuments(workspace), { title: "Old" });
    await startSession(workspace, await readLedgerDocuments(workspace), { title: "New" });
    const oldPath = path.join(root, ".ledger/sessions/S0001-old.md");
    const newPath = path.join(root, ".ledger/sessions/S0002-new.md");
    await writeFile(oldPath, (await readFile(oldPath, "utf8")).replace(/expires: "[^"]+"/, 'expires: "2000-01-01"'));
    await writeFile(newPath, (await readFile(newPath, "utf8")).replace('id: "S0002"', 'id: "S0001"'));

    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));
    expect(report.issues.filter((issue) => issue.kind === "expired-session").map((issue) => issue.path)).toEqual([
      ".ledger/sessions/S0001-old.md",
    ]);
    const pruned = await pruneSessions(workspace, documents, { write: true });
    expect(pruned.expired.map((session) => session.path)).toEqual([".ledger/sessions/S0001-old.md"]);
    expect(pruned.removed).toEqual([".ledger/sessions/S0001-old.md"]);
    expect(await readFile(newPath, "utf8")).toContain('status: "active"');
  });

  it("keeps expired sessions that a record links, closes active ones, and never reissues a linked id", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    for (const title of ["Linked", "Self linked", "Unlinked", "Top"]) {
      await startSession(workspace, await readLedgerDocuments(workspace), { title });
    }
    await writeFile(path.join(root, ".ledger/entries/0001-landed.md"), landedEntry("0001", ["S0001", "S0004"]));
    await writeFile(path.join(root, ".ledger/entries/0002-other.md"), landedEntry("0002", []));
    const sessionPath = (name: string) => path.join(root, ".ledger/sessions", name);
    const expire = async (name: string, related?: readonly string[]) => {
      let raw = (await readFile(sessionPath(name), "utf8")).replace(/expires: "[^"]+"/, 'expires: "2000-01-01"');
      if (related) raw = setFrontmatterArray(raw, "related", related);
      await writeFile(sessionPath(name), raw);
    };
    await expire("S0001-linked.md");
    await expire("S0002-self-linked.md", ["0002"]);
    await expire("S0003-unlinked.md");
    await expire("S0004-top.md");
    const selfLinked = await readFile(sessionPath("S0002-self-linked.md"), "utf8");
    await writeFile(sessionPath("S0002-self-linked.md"), selfLinked.replace('status: "active"', 'status: "closed"'));

    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));
    expect(report.issues.filter((issue) => issue.kind === "expired-session").map((issue) => issue.target)).toEqual(["S0003"]);

    const dryRun = await pruneSessions(workspace, documents, { write: false });
    expect(dryRun.expired.map((session) => session.id)).toEqual(["S0003"]);
    expect(dryRun.kept.map(({ session, linkedBy, closed }) => [session.id, linkedBy, closed])).toEqual([
      ["S0001", ["0001"], false],
      ["S0002", ["0002"], false],
      ["S0004", ["0001"], false],
    ]);
    const cliDryRun = await captureRun(["session", "prune"], root);
    expect(cliDryRun.stdout).toContain("- kept S0001 (linked by 0001)\n");
    expect(cliDryRun.stdout).toContain("Run with --write to delete them.");

    const pruned = await pruneSessions(workspace, documents, { write: true });
    expect(pruned.removed).toEqual([".ledger/sessions/S0003-unlinked.md"]);
    expect(pruned.kept.map(({ session, closed }) => [session.id, session.status, closed])).toEqual([
      ["S0001", "closed", true],
      ["S0002", "closed", false],
      ["S0004", "closed", true],
    ]);
    const linkedRaw = await readFile(sessionPath("S0001-linked.md"), "utf8");
    expect(linkedRaw).toContain('status: "closed"');
    expect(await readFile(sessionPath("S0002-self-linked.md"), "utf8")).toContain('status: "closed"');
    const remaining = await readLedgerDocuments(workspace);
    expect(remaining.filter((document) => document.kind === "session").map((document) => String(document.frontmatter.id)))
      .toEqual(["S0001", "S0002", "S0004"]);

    const cli = await captureRun(["session", "prune"], root);
    expect(cli.stdout).toBe(
      "- kept S0001 (linked by 0001)\n- kept S0002 (linked by 0002)\n- kept S0004 (linked by 0001)\nNothing to delete.",
    );

    await rm(sessionPath("S0004-top.md"));
    const next = await startSession(workspace, await readLedgerDocuments(workspace), { title: "Next" });
    expect(next.session.id).toBe("S0005");
  });

  it("treats an expired active session as inactive and starts a replacement that keeps its links", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    await startSession(workspace, await readLedgerDocuments(workspace), { host: "claude-code", hostSession: "tab-1" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/cli.ts"], { hostSession: "tab-1" });
    const drafted = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "tab-1" }, { fromDiff: false });
    expect(drafted?.entry).toMatchObject({ id: "0001", created: true });
    const oldPath = path.join(root, ".ledger/sessions", (await readLedgerDocuments(workspace)).find((document) => document.kind === "session")!.relativePath.split("/").at(-1)!);
    await writeFile(oldPath, (await readFile(oldPath, "utf8")).replace(/expires: "[^"]+"/, 'expires: "2000-01-01"'));

    let documents = await readLedgerDocuments(workspace);
    expect(findSession(documents, { hostSession: "tab-1" }, { activeOnly: true })).toBeUndefined();
    expect(findSession(documents, {}, { activeOnly: true })).toBeUndefined();
    expect(findSession(documents, { hostSession: "tab-1" }, { activeOnly: false })?.normalized.id).toBe("S0001");
    expect(findSession(documents, { id: "S0001" }, { activeOnly: true })?.normalized.id).toBe("S0001");
    await expect(noteSession(workspace, documents, "orphan", { hostSession: "tab-1" })).rejects.toMatchObject({ code: "record-not-found" });
    expect(await draftSessionReceipt(workspace, documents, { hostSession: "tab-1" }, { fromDiff: false })).toBeUndefined();

    const replaced = await startSession(workspace, documents, { host: "claude-code", hostSession: "tab-1" });
    expect(replaced.created).toBe(true);
    expect(replaced.session).toMatchObject({ id: "S0002", related: ["0001"] });
    expect(await readFile(path.join(root, replaced.session.path), "utf8")).toContain('related:\n  - "0001"');
    documents = await readLedgerDocuments(workspace);
    expect(findSession(documents, { hostSession: "tab-1" }, { activeOnly: true })?.normalized.id).toBe("S0002");
    const touched = await touchSession(workspace, documents, ["src/other.ts"], { hostSession: "tab-1" });
    expect(touched.session.id).toBe("S0002");

    const closed = await closeSession(workspace, await readLedgerDocuments(workspace), { id: "S0001" });
    expect(closed.changed).toBe(true);
    expect(closed.session.status).toBe("closed");
    const third = await startSession(workspace, await readLedgerDocuments(workspace), { host: "claude-code", hostSession: "tab-1" });
    expect(third).toMatchObject({ created: false, session: { id: "S0002" } });
  });

  it("keeps links across a repeated expiry and when a touch starts the replacement", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const expire = async (id: string) => {
      const found = findSession(await readLedgerDocuments(workspace), { id }, { activeOnly: false })!;
      const file = path.join(root, found.parsed.relativePath);
      await writeFile(file, (await readFile(file, "utf8")).replace(/expires: "[^"]+"/, 'expires: "2000-01-01"'));
    };
    await startSession(workspace, await readLedgerDocuments(workspace), { host: "claude-code", hostSession: "tab-2" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/cli.ts"], { hostSession: "tab-2" });
    const drafted = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "tab-2" }, { fromDiff: false });
    expect(drafted?.entry).toMatchObject({ id: "0001", created: true });

    await expire("S0001");
    const second = await startSession(workspace, await readLedgerDocuments(workspace), { host: "claude-code", hostSession: "tab-2" });
    expect(second.session).toMatchObject({ id: "S0002", related: ["0001"] });

    await expire("S0002");
    expect(findExpiredActiveSession(await readLedgerDocuments(workspace), "tab-2")?.normalized.id).toBe("S0002");
    const touched = await touchSession(workspace, await readLedgerDocuments(workspace), ["src/cli.ts"], { hostSession: "tab-2" });
    expect(touched).toMatchObject({ created: true, session: { id: "S0003", related: ["0001"] } });
    expect(await readFile(path.join(root, touched.session.path), "utf8")).toContain('related:\n  - "0001"');

    const again = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "tab-2" }, { fromDiff: false });
    expect(again?.entry).toEqual({ id: "0001", path: drafted!.entry.path, created: false });
    expect((await readLedgerDocuments(workspace)).filter((document) => document.kind === "change")).toHaveLength(1);
  });

  it("writes nothing when every touched path is covered by a linked receipt", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    await startSession(workspace, await readLedgerDocuments(workspace), { host: "codex", hostSession: "cov-1" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/cli.ts"], { hostSession: "cov-1" });
    const drafted = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "cov-1" }, { fromDiff: false });
    const entryPath = path.join(root, drafted!.entry.path);
    await writeFile(entryPath, (await readFile(entryPath, "utf8")).replace('status: "draft"', 'status: "landed"'));
    const landedRaw = await readFile(entryPath, "utf8");
    const sessionPath = path.join(root, drafted!.session.path);
    const sessionRaw = await readFile(sessionPath, "utf8");

    const quiet = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "cov-1" }, { fromDiff: false });
    expect(quiet?.entry).toEqual({ id: "0001", path: drafted!.entry.path, created: false });
    expect(await readFile(entryPath, "utf8")).toBe(landedRaw);
    expect(await readFile(sessionPath, "utf8")).toBe(sessionRaw);
    expect((await readLedgerDocuments(workspace)).filter((document) => document.kind === "change")).toHaveLength(1);

    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/search/core.ts"], { hostSession: "cov-1" });
    await writeFile(entryPath, landedRaw.replace('files:\n  - "src/cli.ts"', 'files:\n  - "src/**"'));
    const pattern = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "cov-1" }, { fromDiff: false });
    expect(pattern?.entry.created).toBe(false);
    expect((await readLedgerDocuments(workspace)).filter((document) => document.kind === "change")).toHaveLength(1);

    await touchSession(workspace, await readLedgerDocuments(workspace), ["docs/API.md"], { hostSession: "cov-1" });
    const second = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "cov-1" }, { fromDiff: false });
    expect(second?.entry).toMatchObject({ id: "0002", created: true });
    const secondRaw = await readFile(path.join(root, second!.entry.path), "utf8");
    expect(secondRaw).toContain('files:\n  - "docs/API.md"\n');
    expect(secondRaw).not.toContain('"src/cli.ts"');
    expect(secondRaw).toContain('related:\n  - "S0001"\n  - "0001"');
    expect(await readFile(sessionPath, "utf8")).toContain('related:\n  - "0001"\n  - "0002"');
  });

  it("titles a drafted receipt from the Summary note or the neutral default", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    await startSession(workspace, await readLedgerDocuments(workspace), { host: "claude-code", hostSession: "t-1" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/cli.ts", "docs/API.md"], { hostSession: "t-1" });
    const plain = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "t-1" }, { fromDiff: false });
    expect(plain?.entry.path).toBe(".ledger/entries/0001-changes-to-cli-docs.md");
    expect(await readFile(path.join(root, plain!.entry.path), "utf8")).toContain('title: "Changes to cli, docs"');

    await startSession(workspace, await readLedgerDocuments(workspace), { host: "claude-code", hostSession: "t-2" });
    await noteSession(workspace, await readLedgerDocuments(workspace), "Speed up the search index", { hostSession: "t-2", section: "Summary" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/search.ts"], { hostSession: "t-2" });
    const named = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "t-2" }, { fromDiff: false });
    expect(named?.entry.path).toBe(".ledger/entries/0002-speed-up-the-search-index.md");
    expect(await readFile(path.join(root, named!.entry.path), "utf8")).toContain('title: "Speed up the search index"');

    await startSession(workspace, await readLedgerDocuments(workspace), { hostSession: "t-3" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["README.md"], { hostSession: "t-3" });
    const root3 = await draftSessionReceipt(workspace, await readLedgerDocuments(workspace), { hostSession: "t-3" }, { fromDiff: false });
    expect(await readFile(path.join(root, root3!.entry.path), "utf8")).toContain('title: "Changes to readme"');
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

function landedEntry(id: string, related: readonly string[]): string {
  const relatedLines = related.length > 0 ? `related:\n${related.map((value) => `  - "${value}"`).join("\n")}\n` : "related: []\n";
  return `---
id: "${id}"
kind: "change"
title: "Landed ${id}"
date: "2026-09-16"
status: "landed"
areas: ["cli"]
files: []
${relatedLines}---

# ${id}: Landed ${id}

## Summary

Fixture.
`;
}

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
