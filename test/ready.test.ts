import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { readLedgerDocuments } from "../src/documents.js";
import { createChangeEntry } from "../src/newEntry.js";
import { checkReadiness, templatePlaceholderLines } from "../src/ready.js";
import { changeTemplate, findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function fixtureWorkspace(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-ready-"));
  await initWorkspace(tempDir, { withDocs: true });
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 1;\n");
  return tempDir;
}

function finishedEntry(id: string, options: { readonly docsImpact?: string; readonly files?: string } = {}): string {
  return [
    "---",
    `id: "${id}"`,
    'kind: "change"',
    'title: "Finished work"',
    'date: "2026-09-16"',
    'updated: "2026-09-16"',
    'status: "draft"',
    'areas: ["cli"]',
    options.files ?? 'files: ["src/feature.ts"]',
    'docs: ["docs/README.md"]',
    ...(options.docsImpact ?? 'docsImpact:\n  status: "updated"\n  reason: "README lists the feature."\n  docs: ["docs/README.md"]').split("\n"),
    "---",
    "",
    `# ${id}: Finished Work`,
    "",
    "## Summary",
    "",
    "Adds the feature.",
    "",
    "## Why",
    "",
    "Users asked for it.",
    "",
    "## Changed Files",
    "",
    "### src/feature.ts",
    "",
    "- What changed: exported value.",
    "- Anchor: value",
    "- On conflict: keep the export.",
    "",
    "## Behavior And UX Impact",
    "",
    "None visible.",
    "",
    "## Invariants",
    "",
    "- value stays exported.",
    "",
    "## Verification",
    "",
    "- npm test",
    "",
    "## Notes",
    "",
    "None.",
    "",
  ].join("\n");
}

describe("templatePlaceholderLines", () => {
  it("collects non-heading body lines without template variables", () => {
    const lines = templatePlaceholderLines(
      '---\nid: "{{id}}"\n---\n\n# {{id}}: {{title}}\n\n## Summary\n\nDescribe what changed.\n\n- Add checks.\n\n{{changedFiles}}\n',
    );
    expect([...lines]).toEqual(["Describe what changed.", "- Add checks."]);
  });

  it("finds no bare Changed Files bullets in the shipped change template", () => {
    const lines = templatePlaceholderLines(changeTemplate());
    expect(lines.has("- What changed:")).toBe(false);
    expect(lines.has("- Anchor:")).toBe(false);
    expect(lines.has("- On conflict:")).toBe(false);
    expect(lines.has("Describe what changed.")).toBe(true);
  });
});

describe("ledger ready", () => {
  it("fails a fresh draft and passes a finished entry", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const draftPath = await createChangeEntry(workspace, [], {
      title: "Fresh draft",
      fromDiff: false,
      staged: false,
      areas: ["cli"],
      status: "draft",
    });
    await writeFile(path.join(root, ".ledger/entries/0002-finished-work.md"), finishedEntry("0002"));

    const report = await checkReadiness(workspace, await readLedgerDocuments(workspace));
    expect(report.checked).toBe(2);
    expect(report.ok).toBe(false);
    expect(report.ready).toEqual(["0002"]);
    expect(report.notReady).toEqual(["0001"]);
    const draft = report.records.find((record) => record.id === "0001");
    expect(draft?.path).toBe(draftPath);
    const codes = new Set(draft?.issues.map((issue) => issue.code));
    expect(codes).toContain("todo");
    expect(codes).toContain("template-placeholder");
    expect(codes).toContain("missing-verification");
    expect(codes).toContain("missing-invariants");
    expect(codes).toContain("docs-impact");
    expect(codes).toContain("validation");
    expect(draft?.issues.find((issue) => issue.code === "todo")?.line).toBeGreaterThan(0);
  });

  it("flags the drafted default title until it is edited", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const entryPath = path.join(root, ".ledger/entries/0004-changes-to-cli.md");
    await writeFile(entryPath, finishedEntry("0004").replace('title: "Finished work"', 'title: "Changes to cli"'));
    const flagged = await checkReadiness(workspace, await readLedgerDocuments(workspace), { targets: ["0004"] });
    expect(flagged.ok).toBe(false);
    expect(flagged.records[0]?.issues).toEqual([
      { code: "template-placeholder", message: "title is the drafted default; describe the change" },
    ]);

    await writeFile(entryPath, finishedEntry("0004").replace('title: "Finished work"', 'title: "Add the cli feature"'));
    const clean = await checkReadiness(workspace, await readLedgerDocuments(workspace), { targets: ["0004"] });
    expect(clean.ok).toBe(true);
    expect(clean.records[0]?.issues).toEqual([]);
  });

  it("flags a default title built from a file or the working tree but not a descriptive one", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const entryPath = path.join(root, ".ledger/entries/0005-changes.md");
    for (const title of ["Changes to src/feature.ts", "Changes to the working tree"]) {
      await writeFile(entryPath, finishedEntry("0005").replace('title: "Finished work"', `title: "${title}"`));
      const report = await checkReadiness(workspace, await readLedgerDocuments(workspace), { targets: ["0005"] });
      expect(report.records[0]?.issues).toEqual([
        { code: "template-placeholder", message: "title is the drafted default; describe the change" },
      ]);
    }
    await writeFile(entryPath, finishedEntry("0005").replace('title: "Finished work"', 'title: "Changes to caching"'));
    const clean = await checkReadiness(workspace, await readLedgerDocuments(workspace), { targets: ["0005"] });
    expect(clean.records[0]?.issues).toEqual([]);
  });

  it("keeps flagging the sample Changed Files block from older change templates", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const legacy = finishedEntry("0006").replace(
      "## Behavior And UX Impact",
      "### path/to/file.ts\n\n- What changed:\n- Anchor:\n- On conflict:\n\n## Behavior And UX Impact",
    );
    await writeFile(path.join(root, ".ledger/entries/0006-legacy.md"), legacy);
    const report = await checkReadiness(workspace, await readLedgerDocuments(workspace), { targets: ["0006"] });
    const messages = report.records[0]!.issues.filter((issue) => issue.code === "template-placeholder").map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "template placeholder: ### path/to/file.ts",
        "template placeholder: - What changed:",
        "template placeholder: - Anchor:",
        "template placeholder: - On conflict:",
      ]),
    );
  });

  it("flags missing references, empty sections, and updated docs impact without docs", async () => {
    const root = await fixtureWorkspace();
    const workspace = await findWorkspace(root);
    const entry = finishedEntry("0003", {
      files: 'files: ["src/missing.ts"]',
      docsImpact: 'docsImpact:\n  status: "updated"\n  reason: "Docs were updated."',
    })
      .replace('docs: ["docs/README.md"]', "docs: []")
      .replace("## Notes\n\nNone.\n", "## Notes\n\n")
      .replace("## Why\n\nUsers asked for it.\n", "## Why\n\n");
    await writeFile(path.join(root, ".ledger/entries/0003-finished-work.md"), entry);

    const report = await checkReadiness(workspace, await readLedgerDocuments(workspace), { targets: ["0003"] });
    expect(report.ok).toBe(false);
    const issues = report.records[0]?.issues ?? [];
    expect(issues.some((issue) => issue.code === "validation" && issue.message.includes("src/missing.ts"))).toBe(true);
    expect(issues.some((issue) => issue.code === "empty-section" && issue.message.includes('"Why"'))).toBe(true);
    expect(issues.some((issue) => issue.code === "docs-impact" && issue.message.includes("names no docs"))).toBe(true);
    expect(issues.some((issue) => issue.code === "empty-section" && issue.message.includes("Notes"))).toBe(false);
  });

  it("selects by target, kind, and status from the CLI and exits 1 when not ready", async () => {
    const root = await fixtureWorkspace();
    await writeFile(path.join(root, ".ledger/entries/0001-finished-work.md"), finishedEntry("0001"));
    await captureRun(["backlog", "new", "Untouched item"], root);

    const ready = await captureRun(["ready", "--json"], root);
    expect(ready.exitCode).toBe(0);
    expect(JSON.parse(ready.stdout).data).toMatchObject({ ok: true, checked: 1, ready: ["0001"] });

    const backlog = await captureRun(["ready", "B001"], root);
    expect(backlog.exitCode).toBe(1);
    expect(backlog.stdout).toContain("not ready: B001");
    expect(backlog.stdout).toContain("template-placeholder");

    const byKind = await captureRun(["ready", "--kind", "backlog", "--status", "proposed", "--json"], root);
    expect(JSON.parse(byKind.stdout).data.notReady).toEqual(["B001"]);

    const none = await captureRun(["ready", "--status", "landed"], root);
    expect(none.exitCode).toBe(0);
    expect(none.stdout).toBe("Ledger ready: no records selected.");

    const draftFile = await readFile(path.join(root, ".ledger/backlog/B001-untouched-item.md"), "utf8");
    expect(draftFile).toContain("## Promotion Notes");
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
