import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import {
  buildAgentPacket,
  formatAgentPacket,
  writeAgentPacketReport,
} from "../src/packet.js";
import { initWorkspace } from "../src/workspace.js";
import type { LedgerWorkspace, ParsedLedgerDocument } from "../src/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("agent packets", () => {
  it("combines metadata, conflict rules, invariants, and verification", () => {
    const packet = buildAgentPacket([document()], "src/cli.ts");

    expect(packet.entries).toHaveLength(1);
    expect(packet.entries[0]).toMatchObject({
      id: "0001",
      title: "CLI",
      areas: ["cli"],
      symbols: ["run"],
      docs: ["docs/ARCHITECTURE.md"],
      matchedFiles: ["src/cli.ts"],
      conflictRules: ["Keep CLI behavior."],
      invariants: ["Exit codes stay stable."],
      verification: ["npm test"],
    });
  });

  it("formats a Markdown packet", () => {
    const markdown = formatAgentPacket(buildAgentPacket([document()], "src/cli.ts"));

    expect(markdown).toContain("# Ledger Agent Packet");
    expect(markdown).toContain("Target: `src/cli.ts`");
    expect(markdown).toContain("## 0001: CLI");
    expect(markdown).toContain("- Symbols: `run`");
    expect(markdown).toContain("### Conflict Rules");
    expect(markdown).toContain("- Keep CLI behavior.");
  });

  it("writes packet reports", async () => {
    const workspace = await createWorkspace();
    const reportPath = await writeAgentPacketReport(
      workspace,
      buildAgentPacket([document()], "src/cli.ts"),
    );
    const report = await readFile(path.join(tempDir ?? "", reportPath), "utf8");

    expect(reportPath).toBe(".ledger/reports/packet.md");
    expect(report).toContain("# Ledger Agent Packet");
    expect(report).toContain("## 0001: CLI");
  });
});

async function createWorkspace(): Promise<LedgerWorkspace> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-packet-test-"));
  await initWorkspace(tempDir);
  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  return {
    projectRoot: tempDir,
    ledgerRoot: path.join(tempDir, ".ledger"),
    configPath,
    config: await readLedgerConfig(configPath),
  };
}

function document(): ParsedLedgerDocument {
  const raw = `---
id: "0001"
kind: "change"
title: "CLI"
date: "2026-06-29"
status: "landed"
areas: ["cli"]
files:
  - "src/cli.ts"
symbols:
  - "run"
docs:
  - "docs/ARCHITECTURE.md"
commits: []
---

# 0001: CLI

## Changed Files

### src/cli.ts

- What changed: Test.
- On conflict: Keep CLI behavior.

## Invariants

- Exit codes stay stable.

## Verification

- npm test
`;
  const parsed = parseMarkdownWithFrontmatter(raw);
  return {
    absolutePath: "/tmp/0001.md",
    relativePath: ".ledger/entries/0001.md",
    raw,
    frontmatterRaw: parsed.frontmatterRaw,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    sections: parsed.sections,
    kind: "change",
  };
}
