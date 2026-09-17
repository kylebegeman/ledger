import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { buildChangeContext, formatChangeContext } from "../src/context.js";
import { readLedgerDocuments } from "../src/documents.js";
import { runLedgerMcpTool } from "../src/mcp.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("ledger context", () => {
  it("reviews a working tree change against its history, receipts, and links", async () => {
    const root = await repository();
    await writeFile(path.join(root, "src", "billing.ts"), "export const fee = 2;\n");
    await writeFile(path.join(root, "src", "orphan.ts"), "export const orphan = true;\n");
    await record(root, ".ledger/entries/0003-raise-the-fee.md", receipt("0003", "Raise the fee", ["src/billing.ts"], {
      decisions: ["D001"],
      verification: "- `npm test`",
      extra: 'docsImpact:\n  status: "none"\n  reason: "Fees are not documented."\n',
    }));

    const workspace = await findWorkspace(root);
    const context = await buildChangeContext(workspace, await readLedgerDocuments(workspace));

    expect(context.range).toBe("working tree");
    expect(context.coverage).toMatchObject({ mode: "current", required: 2, covered: 1, missing: ["src/orphan.ts"] });
    expect(context.docsImpact.missing).toEqual(["src/orphan.ts"]);
    expect(context.receipts).toEqual([
      expect.objectContaining({ id: "0003", status: "landed", ready: true, verification: ["`npm test`"], verificationStatus: "none" }),
    ]);
    expect(context.related).toEqual([
      expect.objectContaining({ id: "D001", kind: "decision", via: ["decision"], from: ["0003"] }),
    ]);

    const billing = context.files.find((file) => file.path === "src/billing.ts")!;
    expect(billing).toMatchObject({ change: "modified", coverage: "covered", receipts: ["0003"], docsImpact: "satisfied" });
    // Exact references come first, newest first; the pattern-only record follows.
    expect(billing.records.map((item) => item.id)).toEqual(["0003", "0002", "0001"]);
    expect(billing.invariants).toEqual([
      { record: "0003", text: "Fees stay whole numbers." },
      { record: "0002", text: "Billing rounds half up." },
      { record: "0001", text: "Every source file is typed." },
    ]);
    // 0001 repeats 0003's rule through its pattern, so it is listed once.
    expect(billing.conflictRules).toEqual([
      { record: "0003", text: "Keep the fee whole." },
      { record: "0002", text: "Keep the rounding helper." },
    ]);
    const orphan = context.files.find((file) => file.path === "src/orphan.ts")!;
    expect(orphan).toMatchObject({ change: "untracked", coverage: "historical", receipts: [], docsImpact: "missing" });
    expect(orphan.records.map((item) => item.id)).toEqual(["0001"]);

    const markdown = formatChangeContext(context);
    expect(markdown).toContain("# Change context: working tree");
    expect(markdown).toContain("- Coverage (current): 1 of 2 required files covered; missing `src/orphan.ts`.");
    expect(markdown).toContain("- 0003 Raise the fee (landed; ready; evidence none)");
    expect(markdown).toContain("## src/billing.ts\n\nmodified; coverage covered; receipts 0003; docs impact satisfied.");
    expect(markdown).toContain("- (0002) Keep the rounding helper.");
    expect(markdown).toContain("- D001 Bill in cents (decision, accepted) via decision from 0003");
    expect(markdown).toContain("## Verification\n\n0003:\n- `npm test`");
  });

  it("drops per-file details from the end to fit the budget", async () => {
    const root = await repository();
    await writeFile(path.join(root, "src", "billing.ts"), "export const fee = 3;\n");
    await writeFile(path.join(root, "src", "orphan.ts"), "export const orphan = 1;\n");
    const workspace = await findWorkspace(root);
    const documents = await readLedgerDocuments(workspace);

    const full = await buildChangeContext(workspace, documents, { budgetTokens: 100_000 });
    expect(full.truncated).toBe(false);
    const tight = await buildChangeContext(workspace, documents, { budgetTokens: 60 });
    expect(tight.truncated).toBe(true);
    expect(tight.files.every((file) => file.detailsOmitted && file.invariants.length === 0)).toBe(true);
    expect(tight.files.find((file) => file.path === "src/billing.ts")?.moreRecords).toBe(2);
    expect(formatChangeContext(tight)).toContain("Details left out for the budget (2 records mention it).");
  });

  it("reads staged changes and merge-base ranges and runs from the CLI and MCP", async () => {
    const root = await repository();
    await writeFile(path.join(root, "src", "billing.ts"), "export const fee = 4;\n");
    await git(root, "add", "src/billing.ts");
    const staged = await captureCli(["context", "--staged", "--json"], root);
    expect(staged.exitCode).toBe(0);
    expect(JSON.parse(staged.stdout).data).toMatchObject({ range: "staged changes", files: [{ path: "src/billing.ts", change: "modified" }] });

    await git(root, "commit", "-qm", "change fee");
    const ranged = await captureCli(["context", "--base", "HEAD~1", "--head", "HEAD"], root);
    expect(ranged.stdout).toContain("# Change context: HEAD~1...HEAD");
    expect(ranged.stdout).toContain("## src/billing.ts");
    const halfRange = await captureCli(["context", "--base", "HEAD~1"], root);
    expect(halfRange.stderr).toContain("--base and --head must be provided together");

    const tool = await runLedgerMcpTool("ledger_context", { projectRoot: root, base: "HEAD~1", head: "HEAD", budget: 500 });
    expect(tool.structuredContent).toMatchObject({
      ok: true,
      data: { summary: { files: 1, receipts: 0, missingCoverage: 1, truncated: false }, range: "HEAD~1...HEAD" },
    });
  });

  it("says so when nothing changed", async () => {
    const root = await repository();
    const workspace = await findWorkspace(root);
    const context = await buildChangeContext(workspace, await readLedgerDocuments(workspace));
    expect(context.files).toEqual([]);
    expect(formatChangeContext(context)).toBe("# Change context: working tree\n\nNo changed files.");
  });
});

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ledger-context-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await initWorkspace(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "billing.ts"), "export const fee = 1;\n");
  await record(root, ".ledger/entries/0001-type-everything.md", receipt("0001", "Type everything", ["src/**"], {
    date: "2026-01-01",
    invariant: "Every source file is typed.",
  }));
  await record(root, ".ledger/entries/0002-round-billing.md", receipt("0002", "Round billing", ["src/billing.ts"], {
    date: "2026-02-01",
    invariant: "Billing rounds half up.",
    changedFiles: "### src/billing.ts\n\n- What changed: rounding.\n- Anchor: `fee`\n- On conflict: Keep the rounding helper.",
  }));
  await record(
    root,
    ".ledger/decisions/D001-bill-in-cents.md",
    '---\nid: "D001"\nkind: "decision"\ntitle: "Bill in cents"\ndate: "2026-01-02"\nstatus: "accepted"\nareas: []\n---\n\n# D001: Bill in cents\n\n## Context\n\nMoney.\n\n## Decision\n\nCents.\n\n## Consequences\n\nIntegers.\n\n## Revisit Criteria\n\nNever.\n',
  );
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "ledger@example.com");
  await git(root, "config", "user.name", "Ledger Test");
  await git(root, "config", "commit.gpgsign", "false");
  await git(root, "add", "-A");
  await git(root, "commit", "-qm", "base");
  return root;
}

interface ReceiptOptions {
  readonly date?: string;
  readonly invariant?: string;
  readonly changedFiles?: string;
  readonly decisions?: readonly string[];
  readonly verification?: string;
  readonly extra?: string;
}

function receipt(id: string, title: string, files: readonly string[], options: ReceiptOptions): string {
  const date = options.date ?? "2026-09-17";
  const decisions = options.decisions?.length ? `decisions:\n${options.decisions.map((item) => `  - "${item}"`).join("\n")}\n` : "";
  return `---
id: "${id}"
kind: "change"
title: "${title}"
date: "${date}"
updated: "${date}"
status: "landed"
areas: ["billing"]
files:
${files.map((file) => `  - "${file}"`).join("\n")}
${decisions}${options.extra ?? ""}commits: []
---

# ${id}: ${title}

## Summary

${title}.

## Why

Because.

## Changed Files

${options.changedFiles ?? "### src/billing.ts\n\n- What changed: the fee.\n- Anchor: `fee`\n- On conflict: Keep the fee whole."}

## Behavior And UX Impact

None.

## Invariants

- ${options.invariant ?? "Fees stay whole numbers."}

## Verification

${options.verification ?? "- `npm test`"}

## Notes

None.
`;
}

async function record(root: string, relativePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), content);
}

async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile("git", [...args], { cwd }, (error) => (error ? reject(error) : resolve()));
  });
}

async function captureCli(argv: readonly string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const previous = process.env.LEDGER_NO_DAEMON;
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(" "));
  process.env.LEDGER_NO_DAEMON = "1";
  try {
    const exitCode = await run([...argv], { cwd });
    return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    if (previous === undefined) delete process.env.LEDGER_NO_DAEMON;
    else process.env.LEDGER_NO_DAEMON = previous;
  }
}
