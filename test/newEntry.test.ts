import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, readLedgerConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import { createChangeEntry, defaultDraftTitle, inferAreas, nextEntryId } from "../src/newEntry.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";
import { changeTemplate, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("createChangeEntry", () => {
  it("drafts from git diff with docs references and status-aware sections", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-test-"));
    await initWorkspace(tempDir, { withDocs: true });
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await mkdir(path.join(tempDir, "docs", "architecture"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 1;\n");
    await writeFile(path.join(tempDir, "docs", "architecture", "runtime.md"), "# Runtime\n");
    await git("init");
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial");
    await writeFile(
      path.join(tempDir, "src", "feature.ts"),
      "export const value = 2;\nexport function runFeature() {}\n",
    );
    await writeFile(
      path.join(tempDir, "docs", "architecture", "runtime.md"),
      "# Runtime\n\n## Configuration\n\nUpdated.\n",
    );

    const workspace = await readWorkspace();
    const createdPath = await createChangeEntry(workspace, [], {
      title: 'Draft "quoted" diff',
      fromDiff: true,
      staged: false,
      areas: [],
      status: "draft",
    });
    const entry = await readFile(path.join(tempDir, createdPath), "utf8");

    expect(entry).toContain('id: "0001"');
    expect(entry).toContain('title: "Draft \\"quoted\\" diff"');
    expect(entry).toContain('# 0001: Draft "quoted" diff');
    expect(entry).toContain("areas:");
    expect(entry).toContain('  - "docs"');
    expect(entry).toContain('  - "feature"');
    expect(entry).toContain('  - "docs/architecture/runtime.md"');
    expect(entry).toContain("symbols:");
    expect(entry).toContain('  - "Configuration"');
    expect(entry).toContain('  - "Runtime"');
    expect(entry).toContain('  - "runFeature"');
    expect(entry).toContain('  - "value"');
    expect(entry).toContain("docs:");
    expect(entry).toContain("### docs/architecture/runtime.md");
    expect(entry).toContain("- Status: modified");
    expect(entry).toContain("summarize the documentation update");
    expect(entry).toContain("summarize the implementation change");
    expect(entry).toContain("- Anchor: `Configuration`, `Runtime`");
    expect(entry).toContain("- Anchor: `runFeature`, `value`");
    expect(entry).toContain("- Docs impact: This file is direct docs impact.");
    expect(entry).toContain("- Docs impact: TODO: name updated docs");
  });

  it("infers areas from changed paths", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-test-"));
    await initWorkspace(tempDir, { withDocs: true });
    const workspace = await readWorkspace();

    expect(
      inferAreas(workspace, [
        { path: "src/runtime/session.ts", status: "modified" },
        { path: "test/runtime/session.test.ts", status: "modified" },
        { path: "docs/architecture/runtime.md", status: "modified" },
      ]),
    ).toEqual(["docs", "runtime", "tests"]);
    expect(
      inferAreas(workspace, [
        { path: "CONTRIBUTING.md", status: "modified" },
        { path: "src/runtime/x.ts", status: "modified" },
      ]),
    ).toEqual(["runtime"]);
    expect(inferAreas(workspace, [{ path: "CONTRIBUTING.md", status: "modified" }])).toEqual(["contributing"]);
    expect(
      inferAreas(workspace, [
        { path: "CONTRIBUTING.md", status: "modified" },
        { path: "packages/core/index.ts", status: "modified" },
      ]),
    ).toEqual(["packages"]);
    expect(defaultDraftTitle(["cli", "docs"], ["src/cli.ts"])).toBe("Changes to cli, docs");
    expect(defaultDraftTitle([], ["README.md"])).toBe("Changes to README.md");
  });

  it("keeps session records and templates out of a diff draft while keeping other .ledger paths", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-scaffold-"));
    await initWorkspace(tempDir, { withDocs: true });
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 1;\n");
    await git("init");
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial");
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 2;\n");
    await mkdir(path.join(tempDir, ".ledger", "sessions"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".ledger", "sessions", "S0001-open-tab.md"),
      '---\nid: "S0001"\nkind: "session"\ntitle: "Open tab"\ndate: "2026-09-16"\nupdated: "2026-09-16"\nstatus: "active"\nexpires: "2036-01-01"\nareas: []\nfiles: []\n---\n\n# S0001: Open Tab\n\n## Summary\n\n## Learned\n\n## Next\n',
    );
    const templatePath = path.join(tempDir, ".ledger", "templates", "change.md");
    await writeFile(templatePath, `${await readFile(templatePath, "utf8")}\n## Template Note\n`);
    await writeFile(
      path.join(tempDir, ".ledger", "backlog", "B001-open-item.md"),
      '---\nid: "B001"\nkind: "backlog"\ntitle: "Open item"\ndate: "2026-09-16"\nupdated: "2026-09-16"\nstatus: "proposed"\nareas: []\n---\n\n# B001: Open Item\n\n## Problem\n\nSomething.\n',
    );

    const createdPath = await createChangeEntry(await readWorkspace(), [], {
      title: "Scaffold aware draft",
      fromDiff: true,
      staged: false,
      areas: [],
      status: "draft",
    });
    const entry = await readFile(path.join(tempDir, createdPath), "utf8");
    expect(entry).toContain('  - "src/feature.ts"');
    expect(entry).toContain('  - ".ledger/backlog/B001-open-item.md"');
    expect(entry).not.toContain(".ledger/sessions/");
    expect(entry).not.toContain(".ledger/templates/");
    for (const heading of ["Summary", "Learned", "Next", "Template Note", "Open Tab"]) {
      expect(entry).not.toContain(`  - "${heading}"`);
    }
    expect(entry).toContain('  - "B001: Open Item"');
    expect(entry).not.toMatch(/^- What changed:\s*$/m);
    expect(entry).toContain("## Template Note");
    const parsed = parseMarkdownWithFrontmatter(entry);
    expect(parsed.frontmatter.areas).toEqual(["feature"]);
  }, 30_000);

  it("renders no bare template bullets for the shipped, legacy, and CRLF legacy templates", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-bullets-"));
    await initWorkspace(tempDir, { withDocs: true });
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 1;\n");
    await git("init");
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial");
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const value = 2;\n");
    const workspace = await readWorkspace();
    const templatePath = path.join(tempDir, ".ledger", "templates", "change.md");
    const shipped = await readFile(templatePath, "utf8");
    expect(shipped).toContain("{{changedFiles}}");
    expect(shipped).toBe(changeTemplate());
    const legacy = shipped.replace(
      "{{changedFiles}}",
      "### path/to/file.ts\n\n- What changed:\n- Anchor:\n- On conflict:",
    );
    const variants: readonly (readonly [string, string])[] = [
      ["shipped", shipped],
      ["legacy", legacy],
      ["legacy-crlf", legacy.replace(/\n/g, "\r\n")],
    ];
    const documents: ParsedLedgerDocument[] = [];
    for (const [label, template] of variants) {
      await writeFile(templatePath, template);
      const createdPath = await createChangeEntry(workspace, documents, {
        title: `Bullets ${label}`,
        fromDiff: true,
        staged: false,
        areas: ["feature"],
        status: "draft",
      });
      const entry = await readFile(path.join(tempDir, createdPath), "utf8");
      expect(entry, label).toContain("### src/feature.ts");
      expect(entry, label).toContain("- What changed: TODO: summarize the implementation change");
      expect(entry, label).not.toContain("### path/to/file.ts");
      expect(entry, label).not.toMatch(/^- What changed:\s*$/m);
      expect(entry, label).not.toMatch(/^- Anchor:\s*$/m);
      expect(entry, label).not.toMatch(/^- On conflict:\s*$/m);
      expect(entry, label).toContain("## Behavior And UX Impact");
      documents.push(document(parseMarkdownWithFrontmatter(entry).frontmatter.id as string, "change"));
    }
  }, 30_000);

  it("keeps the TODO nudge for a draft made without a diff", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-nodiff-"));
    await initWorkspace(tempDir, { withDocs: true });
    const createdPath = await createChangeEntry(await readWorkspace(), [], {
      title: "Hand written",
      fromDiff: false,
      staged: false,
      areas: ["cli"],
      status: "draft",
    });
    const entry = await readFile(path.join(tempDir, createdPath), "utf8");
    expect(entry).toContain(
      "## Changed Files\n\n### path/to/file.ts\n\n- What changed: TODO: describe the change.\n- Anchor: TODO: name the important symbol.\n- On conflict: TODO: describe what must be preserved.\n\n## Behavior And UX Impact",
    );
    expect(entry).not.toMatch(/^- What changed:\s*$/m);
  });

  it("groups large diffs without flooding frontmatter with every symbol", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-large-test-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    for (let index = 0; index < 41; index += 1) {
      await writeFile(path.join(tempDir, "src", `file-${index}.ts`), `export const before${index} = true;\n`);
    }
    await git("init");
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial");
    for (let index = 0; index < 41; index += 1) {
      await writeFile(path.join(tempDir, "src", `file-${index}.ts`), `export const after${index} = true;\n`);
    }

    const createdPath = await createChangeEntry(await readWorkspace(), [], {
      title: "Large migration",
      fromDiff: true,
      staged: false,
      areas: ["migration"],
      status: "draft",
    });
    const entry = await readFile(path.join(tempDir, createdPath), "utf8");

    expect(entry).toContain('  - "src/**"');
    expect(entry).toContain("symbols: []");
    expect(entry).toContain("### Pattern: src/**");
    expect(entry).not.toContain("after0");
  }, 30_000);

  it("allocates IDs across all entry-like records", () => {
    expect(
      nextEntryId(workspaceWithConfig(), [
        document("0001", "change"),
        document("0002", "product-note"),
      ]),
    ).toBe("0003");
  });

  it("only strips configured ID prefixes from the start of IDs", () => {
    expect(
      nextEntryId(workspaceWithConfig({
        ...defaultConfig,
        ids: { ...defaultConfig.ids, entryPrefix: "C" },
      }), [
        document("AC002", "change"),
        document("C001", "change"),
      ]),
    ).toBe("C0002");
  });

  it("bounds generated filename slugs", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-new-entry-slug-test-"));
    await initWorkspace(tempDir);
    const workspace = await readWorkspace();

    const createdPath = await createChangeEntry(workspace, [], {
      title: "A".repeat(400),
      fromDiff: false,
      staged: false,
      areas: ["test"],
      status: "draft",
    });

    expect(path.basename(createdPath).length).toBeLessThan(100);
  });
});

function workspaceWithConfig(config = defaultConfig): LedgerWorkspace {
  return {
    projectRoot: "/tmp/ledger",
    ledgerRoot: "/tmp/ledger/.ledger",
    configPath: "/tmp/ledger/.ledger/config.yaml",
    config,
  };
}

function document(id: string, kind: "change" | "product-note"): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "${kind}"
title: "Entry ${id}"
date: "2026-07-03"
updated: "2026-07-03"
status: "landed"
areas: ["test"]
files: []
symbols: []
commits: []
---

# ${id}: Entry ${id}
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: `/tmp/ledger/.ledger/entries/${id}.md`,
    relativePath: `.ledger/entries/${id}.md`,
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind,
  };
}

async function readWorkspace(): Promise<LedgerWorkspace> {
  if (!tempDir) throw new Error("missing tempDir");
  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  return {
    projectRoot: tempDir,
    ledgerRoot: path.join(tempDir, ".ledger"),
    configPath,
    config: await readLedgerConfig(configPath),
  };
}

async function git(...args: readonly string[]): Promise<void> {
  if (!tempDir) throw new Error("missing tempDir");
  await new Promise<void>((resolve, reject) => {
    execFile("git", [...args], { cwd: tempDir }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
