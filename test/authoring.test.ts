import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { nextRecordId, promoteRecord, readReleaseNotes } from "../src/authoring.js";
import { readLedgerDocuments } from "../src/documents.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import {
  ensureFrontmatterArrays,
  replaceSectionBody,
  setFrontmatterScalars,
} from "../src/frontmatterEdit.js";
import type { ParsedLedgerDocument } from "../src/types.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function fixtureWorkspace(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-authoring-"));
  await initWorkspace(tempDir);
  return tempDir;
}

describe("frontmatter editing", () => {
  it("replaces and appends scalar fields without touching the body", () => {
    const markdown = '---\nid: "B001"\nstatus: "proposed"\n---\n\n# B001\n\nBody status: "proposed"\n';
    const updated = setFrontmatterScalars(markdown, { status: "in-progress", updated: "2026-09-16" });
    expect(updated).toContain('status: "in-progress"');
    expect(updated).toContain('updated: "2026-09-16"');
    expect(updated).toContain('Body status: "proposed"');
    expect(updated.indexOf('updated: "2026-09-16"')).toBeLessThan(updated.indexOf("\n---\n\n#"));
  });

  it("adds list fields only when they are missing and non-empty", () => {
    const markdown = '---\nid: "0001"\nareas:\n  - "cli"\n---\n\n# Title\n';
    const updated = ensureFrontmatterArrays(markdown, {
      areas: ["ignored"],
      backlog: ["B001"],
      decisions: [],
    });
    expect(updated).toContain('areas:\n  - "cli"');
    expect(updated).not.toContain("ignored");
    expect(updated).toContain('backlog:\n  - "B001"');
    expect(updated).not.toContain("decisions");
  });

  it("replaces a section body and keeps the following sections", () => {
    const markdown = "# T\n\n## Verification\n\n- Add checks.\n\n## Notes\n\nKeep me.\n";
    const updated = replaceSectionBody(markdown, "Verification", "- npm test\n- npm run build");
    expect(updated).toContain("## Verification\n\n- npm test\n- npm run build\n\n## Notes\n\nKeep me.");
    expect(replaceSectionBody(markdown, "Missing", "x")).toBe(markdown);
  });
});

describe("record ids", () => {
  it("numbers backlog and decision records independently of entries", () => {
    const documents = [
      record("0004", "change"),
      record("B002", "backlog"),
      record("B010", "backlog"),
      record("D001", "decision"),
    ];
    expect(nextRecordId(documents, "backlog", "B", 3)).toBe("B011");
    expect(nextRecordId(documents, "decision", "D", 3)).toBe("D002");
    expect(nextRecordId([], "backlog", "B", 3)).toBe("B001");
  });
});

describe("backlog new, decision new, promote, and release notes", () => {
  it("creates backlog items and decisions with links from the CLI", async () => {
    const root = await fixtureWorkspace();
    const decision = await captureRun(
      ["decision", "new", "Keep one runtime", "--area", "architecture", "--json"],
      root,
    );
    expect(decision.exitCode).toBe(0);
    const decisionPath = JSON.parse(decision.stdout).data.path as string;
    expect(decisionPath).toBe(".ledger/decisions/D001-keep-one-runtime.md");
    const decisionText = await readFile(path.join(root, decisionPath), "utf8");
    expect(decisionText).toContain('id: "D001"');
    expect(decisionText).toContain('kind: "decision"');
    expect(decisionText).toContain('status: "proposed"');
    expect(decisionText).toContain('  - "architecture"');
    expect(decisionText).toContain("## Revisit Criteria");

    const backlog = await captureRun(
      [
        "backlog",
        "new",
        "Capture hooks",
        "--area",
        "agents",
        "--decision",
        "D001",
        "--status",
        "accepted",
        "--json",
      ],
      root,
    );
    expect(backlog.exitCode).toBe(0);
    const backlogPath = JSON.parse(backlog.stdout).data.path as string;
    expect(backlogPath).toBe(".ledger/backlog/B001-capture-hooks.md");
    const backlogText = await readFile(path.join(root, backlogPath), "utf8");
    expect(backlogText).toContain('status: "accepted"');
    expect(backlogText).toContain('decisions:\n  - "D001"');
    expect(backlogText).toContain("## Promotion Notes");

    const second = await captureRun(["backlog", "new", "Second item", "--json"], root);
    expect(JSON.parse(second.stdout).data.path).toBe(".ledger/backlog/B002-second-item.md");

    const validation = await captureRun(["validate", "--json"], root);
    expect(JSON.parse(validation.stdout).data.errors).toEqual([]);
  });

  it("promotes a backlog item into a linked entry and updates the item in one transaction", async () => {
    const root = await fixtureWorkspace();
    await captureRun(["decision", "new", "Direction"], root);
    await captureRun(["backlog", "new", "Ship the thing", "--area", "cli", "--decision", "D001"], root);
    const backlogPath = path.join(root, ".ledger/backlog/B001-ship-the-thing.md");
    const original = await readFile(backlogPath, "utf8");
    await writeFile(
      backlogPath,
      original.replace("- Add concrete checks.", "- ledger ready passes\n- Docs updated"),
    );

    const workspace = await findWorkspace(root);
    const result = await promoteRecord(workspace, await readLedgerDocuments(workspace), "B001", {
      status: "draft",
      fromDiff: false,
      staged: false,
    });
    expect(result.entry.id).toBe("0001");
    expect(result.entry.path).toBe(".ledger/entries/0001-ship-the-thing.md");
    expect(result.source.status).toBe("in-progress");
    expect(result.carriedChecks).toEqual(["ledger ready passes", "Docs updated"]);

    const entry = await readFile(path.join(root, result.entry.path), "utf8");
    expect(entry).toContain('backlog:\n  - "B001"');
    expect(entry).toContain('decisions:\n  - "D001"');
    expect(entry).toContain('  - "cli"');
    expect(entry).toContain("## Verification\n\n- ledger ready passes\n- Docs updated\n\n## Notes");
    const updatedBacklog = await readFile(backlogPath, "utf8");
    expect(updatedBacklog).toContain('status: "in-progress"');
    expect(updatedBacklog).toContain("- ledger ready passes");

    const missing = await captureRun(["promote", "B404", "--json"], root);
    expect(missing.exitCode).toBe(2);
    expect(JSON.parse(missing.stdout).error.code).toBe("record-not-found");

    const wrongKind = await captureRun(["promote", "D001", "--json"], root);
    expect(JSON.parse(wrongKind.stdout).error.code).toBe("invalid-argument");
  });

  it("prints the Public Notes of a release record", async () => {
    const root = await fixtureWorkspace();
    await writeFile(
      path.join(root, ".ledger/releases/v1.0.0.md"),
      [
        "---",
        'id: "v1.0.0"',
        'kind: "release"',
        'title: "Ledger v1.0.0"',
        'date: "2026-09-16"',
        'updated: "2026-09-16"',
        'status: "released"',
        'areas: ["release"]',
        "entries: []",
        "---",
        "",
        "# Ledger v1.0.0",
        "",
        "## Summary",
        "",
        "Summary.",
        "",
        "## Public Notes",
        "",
        "- First public note",
        "- Second public note",
        "",
        "## Changes",
        "",
        "- None.",
        "",
        "## Verification",
        "",
        "- npm test",
        "",
        "## Known Issues",
        "",
        "- None.",
        "",
      ].join("\n"),
    );
    const workspace = await findWorkspace(root);
    const notes = readReleaseNotes(await readLedgerDocuments(workspace), "v1.0.0");
    expect(notes.notes).toBe("- First public note\n- Second public note");
    expect(notes.path).toBe(".ledger/releases/v1.0.0.md");

    const cli = await captureRun(["release", "notes", "v1.0.0"], root);
    expect(cli.exitCode).toBe(0);
    expect(cli.stdout).toBe("- First public note\n- Second public note");

    const missing = await captureRun(["release", "notes", "v9.9.9", "--json"], root);
    expect(JSON.parse(missing.stdout).error.code).toBe("record-not-found");
  });
});

function record(id: string, kind: ParsedLedgerDocument["kind"]): ParsedLedgerDocument {
  const raw = `---\nid: "${id}"\nkind: "${kind}"\ntitle: "T"\ndate: "2026-09-16"\nstatus: "draft"\n---\n\n# ${id}\n`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/${id}.md`,
    relativePath: `.ledger/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind,
  };
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
