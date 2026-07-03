import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});

function entry(): string {
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
commits: []
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
