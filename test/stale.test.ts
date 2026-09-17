import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerDocuments } from "../src/documents.js";
import { detectStaleKnowledge, formatStaleReport } from "../src/stale.js";
import { validateDocuments } from "../src/validate.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("stale knowledge detection", () => {
  it("reports missing relationships and potentially stale symbols", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-stale-test-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "cli.ts"), "export function run() {}\n");
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0001-stale.md"),
      entry(),
      "utf8",
    );

    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const validation = validateDocuments(workspace, documents);
    const report = await detectStaleKnowledge(workspace, documents, validation);

    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      kind: "missing-relationship",
      target: "D999",
    }));
    expect(report.issues).toContainEqual(expect.objectContaining({
      kind: "stale-symbol",
      target: "oldRun",
    }));
    expect(formatStaleReport(report)).toContain("Ledger Stale Knowledge Report");
  });

  it("reports a link to a missing session only through stale and flags only unlinked expired sessions", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-stale-session-test-")));
    await initWorkspace(tempDir);
    await writeFile(path.join(tempDir, ".ledger", "entries", "0001-linked.md"), linkedEntry("0001", "S0009"), "utf8");
    await writeFile(path.join(tempDir, ".ledger", "entries", "0002-linked.md"), linkedEntry("0002", "S0001"), "utf8");
    await mkdir(path.join(tempDir, ".ledger", "sessions"), { recursive: true });
    await writeFile(path.join(tempDir, ".ledger", "sessions", "S0001-kept.md"), expiredSession("S0001"), "utf8");
    await writeFile(path.join(tempDir, ".ledger", "sessions", "S0002-unlinked.md"), expiredSession("S0002"), "utf8");

    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const validation = validateDocuments(workspace, documents);
    expect(validation.errors).toEqual([]);
    expect(validation.issues.filter((issue) => issue.target === "S0009" || issue.message.includes("S0009"))).toEqual([]);
    const report = await detectStaleKnowledge(workspace, documents, validation);

    expect(report.issues.filter((issue) => issue.kind === "missing-relationship")).toEqual([
      expect.objectContaining({ path: ".ledger/entries/0001-linked.md", target: "S0009" }),
    ]);
    expect(report.issues.filter((issue) => issue.kind === "expired-session").map((issue) => issue.target)).toEqual(["S0002"]);
  });

  it("honors explicit historical symbol acknowledgements", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-stale-ack-test-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "cli.ts"), "export function run() {}\n");
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0001-stale.md"),
      entry({ acknowledgeSymbol: true }),
      "utf8",
    );

    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const validation = validateDocuments(workspace, documents);
    const report = await detectStaleKnowledge(workspace, documents, validation);

    expect(report.issues).not.toContainEqual(expect.objectContaining({
      kind: "stale-symbol",
      target: "oldRun",
    }));
  });
});

describe("anchor and invariant freshness", () => {
  it("flags anchors missing from their block's file and invariants that cite them", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-stale-anchor-test-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "cli.ts"), "export function run() {}\n");
    await writeFile(path.join(tempDir, "src", "other.ts"), "export const keep = 1;\n");
    await writeFile(path.join(tempDir, ".ledger", "entries", "0002-anchors.md"), anchoredEntry(), "utf8");

    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));

    const anchors = report.issues.filter((issue) => issue.kind === "stale-anchor");
    expect(anchors.map((issue) => issue.target)).toEqual(["oldDispatch"]);
    expect(anchors[0]?.message).toContain("src/cli.ts");
    expect(report.issues.filter((issue) => issue.kind === "stale-invariant").map((issue) => issue.target)).toEqual(["oldDispatch"]);
    expect(report.issues.some((issue) => issue.kind === "stale-anchor" && issue.target === "keep")).toBe(false);
    expect(report.issues.some((issue) => issue.target === "run")).toBe(false);
  });

  it("skips descriptive and self-naming anchors and matches dotted key paths by segment", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-stale-anchor-precision-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "assets"), { recursive: true });
    await writeFile(path.join(tempDir, "assets", "logo.svg"), "<svg></svg>\n");
    await writeFile(path.join(tempDir, "settings.yaml"), "git:\n  ignore:\n    - dist/**\n");
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0003-precision.md"),
      anchoredEntry()
        .replace('id: "0002"', 'id: "0003"')
        .replace('files:\n  - "src/cli.ts"\n  - "src/other.ts"', 'files:\n  - "assets/logo.svg"\n  - "settings.yaml"')
        .replace("### src/cli.ts\n\n- What changed: dispatch.\n- Anchor: \`run\`, \`oldDispatch\`", "### assets/logo.svg\n\n- What changed: icon.\n- Anchor: \`logo.svg\`, header image of the site")
        .replace("### src/other.ts\n\n- What changed: constant.\n- Anchor: keep", "### settings.yaml\n\n- What changed: ignore list.\n- Anchor: \`git.ignore\`, \`git.missingKey\`")
        .replace("- \`oldDispatch\` remains the only dispatch path.", "- Settings stay valid."),
      "utf8",
    );
    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));
    expect(report.issues.filter((issue) => issue.kind === "stale-anchor").map((issue) => issue.target)).toEqual(["git.missingKey"]);
  });

  it("skips binary files a record lists and keeps checking its text files", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-stale-binary-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await mkdir(path.join(tempDir, "assets"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "cli.ts"), "export function run() {}\n");
    await writeFile(path.join(tempDir, "src", "other.ts"), "export const keep = 1;\n");
    await writeFile(path.join(tempDir, "assets", "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]));
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0002-anchors.md"),
      anchoredEntry()
        .replace('  - "src/other.ts"\ncommits: []', '  - "src/other.ts"\n  - "assets/shot.png"\nsymbols:\n  - "run"\n  - "oldRun"\ncommits: []')
        .replace("## Behavior And UX Impact", "### assets/shot.png\n\n- What changed: screenshot.\n- Anchor: \`hero\`\n- On conflict: keep one still image.\n\n## Behavior And UX Impact"),
      "utf8",
    );

    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));

    expect(report.issues.filter((issue) => issue.kind === "stale-symbol").map((issue) => issue.target)).toEqual(["oldRun"]);
    expect(report.issues.filter((issue) => issue.kind === "stale-anchor").map((issue) => issue.target)).toEqual(["oldDispatch"]);
  });

  it("finds member symbols by their segments", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-stale-members-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "billing"), { recursive: true });
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "billing", "invoice.go"), "package billing\n\nfunc (i *Invoice) Charge() int { return 0 }\n");
    await writeFile(path.join(tempDir, "src", "parser.rs"), "impl Parser {\n    pub fn parse(&self) {}\n}\n");
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0001-stale.md"),
      entry().replace(
        '  - "src/cli.ts"\nsymbols:\n  - "oldRun"',
        '  - "billing/invoice.go"\n  - "src/parser.rs"\nsymbols:\n  - "Invoice.Charge"\n  - "Invoice.Refund"\n  - "Parser::parse"\n  - "Parser::gone"',
      ).replace(
        "### src/cli.ts\n\n- What changed: Fixture.",
        "### src/parser.rs\n\n- What changed: parsing.\n- Anchor: `Parser::parse`, `Parser::lex`",
      ),
      "utf8",
    );

    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));

    expect(report.issues.filter((issue) => issue.kind === "stale-symbol").map((issue) => issue.target)).toEqual([
      "Invoice.Refund",
      "Parser::gone",
    ]);
    expect(report.issues.filter((issue) => issue.kind === "stale-anchor").map((issue) => issue.target)).toEqual(["Parser::lex"]);
  });

  it("honors anchor acknowledgements", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-stale-anchor-ack-"));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "cli.ts"), "export function run() {}\n");
    await writeFile(path.join(tempDir, "src", "other.ts"), "export const keep = 1;\n");
    await writeFile(
      path.join(tempDir, ".ledger", "entries", "0002-anchors.md"),
      anchoredEntry().replace("commits: []", 'staleRefs:\n  - "anchors:oldDispatch"\ncommits: []'),
      "utf8",
    );
    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const report = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));
    expect(report.issues.filter((issue) => issue.kind === "stale-anchor" || issue.kind === "stale-invariant")).toEqual([]);
  });
});

function anchoredEntry(): string {
  return `---
id: "0002"
kind: "change"
title: "Anchor fixture"
date: "2026-09-16"
updated: "2026-09-16"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
  - "src/other.ts"
commits: []
---

# 0002: Anchor Fixture

## Summary

Fixture.

## Why

Anchor checks.

## Changed Files

### src/cli.ts

- What changed: dispatch.
- Anchor: \`run\`, \`oldDispatch\`
- On conflict: keep run.

### src/other.ts

- What changed: constant.
- Anchor: keep
- On conflict: keep keep.

## Behavior And UX Impact

None.

## Invariants

- \`run\` stays exported.
- \`oldDispatch\` remains the only dispatch path.

## Verification

- npm test
`;
}

function entry(options: { readonly acknowledgeSymbol?: boolean } = {}): string {
  return `---
id: "0001"
kind: "change"
title: "Stale fixture"
date: "2026-06-29"
updated: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols:
  - "oldRun"
decisions:
  - "D999"
${options.acknowledgeSymbol ? 'staleRefs:\n  - "symbols:oldRun"\n' : ""}commits: []
---

# 0001: Stale Fixture

## Summary

Fixture.

## Why

Test stale detection.

## Changed Files

### src/cli.ts

- What changed: Fixture.
- On conflict: Keep behavior.

## Behavior And UX Impact

None.

## Invariants

- Keep behavior.

## Verification

- npm test
`;
}

function linkedEntry(id: string, session: string): string {
  return `---
id: "${id}"
kind: "change"
title: "Linked ${id}"
date: "2026-09-16"
status: "landed"
areas: ["cli"]
files: []
related:
  - "${session}"
---

# ${id}: Linked ${id}

## Summary

Fixture.

## Why

Test a link to a session record.

## Changed Files

None.

## Behavior And UX Impact

None.

## Invariants

- Keep behavior.

## Verification

- npm test
`;
}

function expiredSession(id: string): string {
  return `---
id: "${id}"
kind: "session"
title: "Session ${id}"
date: "2000-01-01"
status: "active"
expires: "2000-01-02"
areas: []
files: []
related: []
---

# ${id}: Session ${id}

## Summary

Fixture.

## Learned

- Nothing yet.

## Next

- Nothing yet.
`;
}
