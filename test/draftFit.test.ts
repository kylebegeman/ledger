import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { formatCiAnnotations, formatCiText, runCiChecks } from "../src/ci.js";
import { run } from "../src/cli.js";
import { readLedgerDocuments } from "../src/documents.js";
import { getChangedLineRanges, parseChangedLineRanges } from "../src/git.js";
import { createChangeEntry } from "../src/newEntry.js";
import { sessionDraftHints, startSession, touchSession } from "../src/sessions.js";
import {
  extractCodeSymbolSpansWithRegex,
  extractCodeSymbolsDetailed,
  extractMarkdownSymbolSpans,
  symbolsTouchedByLines,
} from "../src/symbols.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

const execFileAsync = promisify(execFile);
let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

const changelog = [
  "# Changelog",
  "",
  "Forge follows the release policy.",
  "",
  "## Unreleased",
  "",
  "### Added",
  "",
  "- One.",
  "",
  "```sh",
  "# not a heading",
  "```",
  "",
  "### Fixed",
  "",
  "- Two.",
  "",
  "## 0.1.0",
  "",
  "### Fixed",
  "",
  "- Three.",
  "",
].join("\n");

describe("symbol spans", () => {
  it("gives each heading its section and skips fenced code", () => {
    expect(extractMarkdownSymbolSpans(changelog)).toEqual([
      { name: "Changelog", start: 1, end: 23, depth: 1 },
      { name: "Unreleased", start: 5, end: 18, depth: 2 },
      { name: "Added", start: 7, end: 14, depth: 3 },
      { name: "Fixed", start: 15, end: 18, depth: 3 },
      { name: "0.1.0", start: 19, end: 23, depth: 2 },
      { name: "Fixed", start: 21, end: 23, depth: 3 },
    ]);
  });

  it("names only the innermost section a changed line sits in", () => {
    const spans = extractMarkdownSymbolSpans(changelog);
    expect(symbolsTouchedByLines(spans, [{ start: 3, end: 3 }])).toEqual(["Changelog"]);
    expect(symbolsTouchedByLines(spans, [{ start: 9, end: 9 }])).toEqual(["Added"]);
    expect(symbolsTouchedByLines(spans, [{ start: 5, end: 7 }])).toEqual(["Added", "Unreleased"]);
    expect(symbolsTouchedByLines(spans, [{ start: 23, end: 23 }])).toEqual(["Fixed"]);
    expect(symbolsTouchedByLines(spans, [])).toEqual([]);
  });

  it("runs a regex declaration to the next one", () => {
    const raw = "import x from 'x';\n\nexport function one() {\n  return 1;\n}\n\nexport const two = 2, three = 3;\nexport class Four {}\n";
    expect(extractCodeSymbolSpansWithRegex(raw)).toEqual([
      { name: "one", start: 3, end: 6, depth: 0 },
      { name: "two", start: 7, end: 7, depth: 0 },
      { name: "Four", start: 8, end: 8, depth: 0 },
    ]);
  });

  it("starts a parsed declaration at its doc comment", async () => {
    const raw = "import x from 'x';\n\n/** Doc. */\nexport function one() {\n  return 1;\n}\n\nexport const two = 2, three = 3;\n";
    const extraction = await extractCodeSymbolsDetailed(raw, "fixture.ts");
    expect(extraction.spans).toEqual([
      { name: "one", start: 3, end: 6, depth: 0 },
      { name: "two", start: 8, end: 8, depth: 0 },
      { name: "three", start: 8, end: 8, depth: 0 },
    ]);
    expect(symbolsTouchedByLines(extraction.spans, [{ start: 1, end: 1 }])).toEqual([]);
    expect(symbolsTouchedByLines(extraction.spans, [{ start: 3, end: 3 }])).toEqual(["one"]);
    expect(symbolsTouchedByLines(extraction.spans, [{ start: 8, end: 8 }])).toEqual(["three", "two"]);
  });
});

describe("changed line ranges", () => {
  it("parses hunks, deletions, and quoted paths, and leaves whole-file changes out", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1..2 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -3 +3 @@ export function one() {",
      "-  return 1;",
      "+  return 2;",
      "@@ -10,2 +9,0 @@",
      "-gone",
      "-gone",
      "+++ not a header inside a hunk",
      "diff --git a/new.md b/new.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.md",
      "@@ -0,0 +1,3 @@",
      "+# New",
      "diff --git a/old.md b/old.md",
      "deleted file mode 100644",
      "--- a/old.md",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-# Old",
      'diff --git "a/docs/tab\\there.md" "b/docs/tab\\there.md"',
      '--- "a/docs/tab\\there.md"',
      '+++ "b/docs/tab\\there.md"',
      "@@ -1,0 +2,2 @@",
      "+x",
      "+y",
      "diff --git a/docs/with space.md b/docs/with space.md",
      "--- a/docs/with space.md\t",
      "+++ b/docs/with space.md\t",
      "@@ -4,3 +4 @@",
      "",
    ].join("\n");
    expect(Object.fromEntries(parseChangedLineRanges(diff))).toEqual({
      "src/a.ts": [
        { start: 3, end: 3 },
        { start: 9, end: 9 },
      ],
      "docs/tab\there.md": [{ start: 2, end: 3 }],
      "docs/with space.md": [{ start: 4, end: 4 }],
    });
  });

  it("reads working-tree and staged lines from Git, relative to a nested project", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-lines-"));
    const project = path.join(tempDir, "packages", "app");
    await mkdir(project, { recursive: true });
    await writeFile(path.join(project, "notes.md"), "one\ntwo\nthree\nfour\n");
    await writeFile(path.join(project, "staged.md"), "a\nb\n");
    await git(tempDir, "init");
    expect(await getChangedLineRanges(project, ["notes.md"])).toBeUndefined();
    await git(tempDir, "add", ".");
    await git(tempDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "base");

    await writeFile(path.join(project, "notes.md"), "one\nTWO\nthree\n");
    await writeFile(path.join(project, "staged.md"), "a\nB\n");
    await git(project, "add", "staged.md");
    await writeFile(path.join(project, "untracked.md"), "new\n");

    const all = await getChangedLineRanges(project, ["notes.md", "staged.md", "untracked.md"]);
    expect(Object.fromEntries(all ?? [])).toEqual({
      "notes.md": [
        { start: 2, end: 2 },
        { start: 3, end: 3 },
      ],
      "staged.md": [{ start: 2, end: 2 }],
    });
    const staged = await getChangedLineRanges(project, ["notes.md", "staged.md"], { staged: true });
    expect(Object.fromEntries(staged ?? [])).toEqual({ "staged.md": [{ start: 2, end: 2 }] });
    expect(await getChangedLineRanges(project, [])).toEqual(new Map());
  });
});

describe("drafted symbols follow the diff", () => {
  it("anchors a one-line edit to its section and an edit outside any symbol to a TODO", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-draft-fit-"));
    await initWorkspace(tempDir);
    const exports = Array.from({ length: 15 }, (_, index) => `export function fn${index}() {\n  return ${index};\n}\n`).join("\n");
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "CHANGELOG.md"), changelog);
    await writeFile(path.join(tempDir, "src", "many.ts"), `import x from "x";\n\n${exports}`);
    await writeFile(path.join(tempDir, "src", "imports.ts"), `import x from "x";\n\nexport function kept() {}\n`);
    await git(tempDir, "init");
    await git(tempDir, "add", ".");
    await git(tempDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "base");

    await writeFile(path.join(tempDir, "CHANGELOG.md"), changelog.replace("Forge follows", "Kore follows"));
    await writeFile(path.join(tempDir, "src", "many.ts"), `import x from "x";\n\n${exports.replace("return 7;", "return 70;")}`);
    await writeFile(path.join(tempDir, "src", "imports.ts"), `import y from "y";\n\nexport function kept() {}\n`);
    await writeFile(
      path.join(tempDir, "src", "fresh.ts"),
      Array.from({ length: 14 }, (_, index) => `export const value${String(index).padStart(2, "0")} = ${index};`).join("\n"),
    );

    const workspace = await findWorkspace(tempDir);
    const created = await createChangeEntry(workspace, await readLedgerDocuments(workspace), {
      title: "Fit the anchors",
      fromDiff: true,
      staged: false,
      areas: [],
      status: "draft",
    });
    const entry = await readFile(path.join(tempDir, created), "utf8");
    const anchor = (file: string) => entry.split(`### ${file}\n`)[1]?.split("\n").find((line) => line.startsWith("- Anchor:"));

    expect(anchor("CHANGELOG.md")).toBe("- Anchor: `Changelog`");
    expect(anchor("src/many.ts")).toBe("- Anchor: `fn7`");
    expect(anchor("src/imports.ts")).toBe("- Anchor: TODO: name the important symbol, route, command, or section.");
    // A new file changed as a whole keeps its symbols, up to the per-file cap.
    expect(anchor("src/fresh.ts")).toContain("`value00`");
    expect(anchor("src/fresh.ts")?.match(/`/g)).toHaveLength(24);
    expect(entry).toContain('symbols:\n  - "Changelog"\n  - "fn7"\n  - "value00"');
    expect(entry).not.toContain('"Unreleased"');
    expect(entry).not.toContain('"fn8"');
  });
});

describe("hooked session hints", () => {
  it("names the session and its draft when a check finds the turn's files uncovered", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-hints-"));
    await initWorkspace(tempDir);
    await git(tempDir, "init");
    await git(tempDir, "add", ".");
    await git(tempDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "base");
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "work.ts"), "export const work = 1;\n");
    const workspace = await findWorkspace(tempDir);
    await startSession(workspace, await readLedgerDocuments(workspace), { host: "claude-code", hostSession: "turn-1" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/work.ts"], { hostSession: "turn-1" });
    await startSession(workspace, await readLedgerDocuments(workspace), { title: "Scratch notes" });
    await touchSession(workspace, await readLedgerDocuments(workspace), ["src/work.ts"], { id: "S0002" });

    const result = await runCiChecks(workspace, await readLedgerDocuments(workspace));
    expect(result.ok).toBe(false);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ session: "S0001", host: "claude-code", files: ["src/work.ts"] });
    expect(result.sessions[0]?.draft).toBeUndefined();
    const text = formatCiText(result);
    expect(text).toContain("Issues:\n- coverage: src/work.ts has no change entry in this change set");
    expect(text).toContain("- docs-impact: no change entry in this change set ties src/work.ts to a docs decision");
    expect(text).toContain(
      "Hooked sessions:\n- S0001 (claude-code) touched 1 of these files; its hook drafts their receipt when the turn ends. Finish that draft on the next prompt; do not create another receipt with `ledger new`.",
    );
    expect(formatCiAnnotations(result).join("\n")).not.toContain("S0001");
    expect(formatCiText(result, { issues: false })).toBe(text.split("\n\nIssues:")[0]);

    const cli = await capture(["coverage"], tempDir);
    expect(cli.exitCode).toBe(1);
    expect(cli.stdout).toContain("- session: S0001 (claude-code) touched 1 of these files");
  });

  it("points at the linked draft, and ignores closed and scratch sessions", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-hints-"));
    await initWorkspace(tempDir);
    const workspace = await findWorkspace(tempDir);
    const sessions = path.join(tempDir, ".ledger", "sessions");
    await writeFile(path.join(sessions, "S0001-a.md"), session("S0001", "active", "codex", ["src/a.ts", "src/b.ts"], ["0001"]));
    await writeFile(path.join(sessions, "S0002-b.md"), session("S0002", "closed", "codex", ["src/a.ts"], []));
    await writeFile(path.join(sessions, "S0003-c.md"), session("S0003", "active", undefined, ["src/a.ts"], []));
    await writeFile(path.join(sessions, "S0004-d.md"), session("S0004", "active", "cursor", ["src/a.ts"], [], "2000-01-01"));
    await writeFile(path.join(tempDir, ".ledger", "entries", "0001-draft.md"), draft(["src/a.ts"]));
    const documents = await readLedgerDocuments(workspace);

    const listed = sessionDraftHints(workspace, documents, ["src/a.ts"]);
    expect(listed.map((hint) => hint.session)).toEqual(["S0001"]);
    expect(listed[0]?.draft).toEqual({ id: "0001", path: ".ledger/entries/0001-draft.md" });
    expect(listed[0]?.message).toBe(
      "S0001 (codex) touched 1 of these files, and draft receipt 0001 lists them: finish .ledger/entries/0001-draft.md and run `ledger ready`; do not create another receipt with `ledger new`.",
    );
    const pending = sessionDraftHints(workspace, documents, ["src/a.ts", "src/b.ts"]);
    expect(pending[0]?.message).toContain("touched 2 of these files; its hook adds them to draft receipt 0001");
    expect(sessionDraftHints(workspace, documents, ["src/c.ts"])).toEqual([]);
    expect(sessionDraftHints(workspace, documents, [])).toEqual([]);
  });
});

function session(
  id: string,
  status: string,
  host: string | undefined,
  files: readonly string[],
  related: readonly string[],
  expires = "2999-01-01",
): string {
  return [
    "---",
    `id: "${id}"`,
    'kind: "session"',
    `title: "Session ${id}"`,
    'date: "2026-09-17"',
    `status: "${status}"`,
    `expires: "${expires}"`,
    "areas: []",
    `files: [${files.map((file) => `"${file}"`).join(", ")}]`,
    ...(host ? [`host: "${host}"`, `hostSession: "${id}-tab"`] : []),
    `related: [${related.map((item) => `"${item}"`).join(", ")}]`,
    "---",
    "",
    `# ${id}: Session`,
    "",
    "## Summary",
    "",
    "Work.",
    "",
    "## Learned",
    "",
    "- Nothing.",
    "",
    "## Next",
    "",
    "- Nothing.",
    "",
  ].join("\n");
}

function draft(files: readonly string[]): string {
  return [
    "---",
    'id: "0001"',
    'kind: "change"',
    'title: "Changes to src"',
    'date: "2026-09-17"',
    'status: "draft"',
    "areas: []",
    `files: [${files.map((file) => `"${file}"`).join(", ")}]`,
    "---",
    "",
    "# 0001: Changes to src",
    "",
  ].join("\n");
}

async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  await execFileAsync("git", [...args], { cwd });
}

async function capture(argv: readonly string[], cwd: string): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  const stdout: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = () => undefined;
  try {
    const exitCode = await run([...argv, "--local"], { cwd });
    return { exitCode, stdout: stdout.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
