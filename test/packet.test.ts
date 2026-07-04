import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, readLedgerConfig } from "../src/config.js";
import { parseMarkdownWithFrontmatter } from "../src/frontmatter.js";
import {
  buildAgentPacket,
  buildSearchAgentPacket,
  formatAgentPacket,
  writeAgentPacketReport,
} from "../src/packet.js";
import { buildStaticReaderModel } from "../src/render.js";
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

    expect(packet.estimatedTokens).toBeGreaterThan(0);
    expect(packet.truncated).toBe(false);
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
    expect(markdown).toContain("Estimated tokens:");
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

  it("honors entry limits for token-bounded packets", () => {
    const packet = buildAgentPacket(
      [document("0001", "CLI one"), document("0002", "CLI two")],
      "src/cli.ts",
      { maxEntries: 1 },
    );

    expect(packet.entries).toHaveLength(1);
    expect(packet.truncated).toBe(true);
    expect(packet.omittedEntries).toBe(1);
  });

  it("builds packets from weighted search results", () => {
    const model = buildStaticReaderModel(workspace(), [document("0001", "CLI search")]);
    const packet = buildSearchAgentPacket(model, "cli", { limit: 1 });

    expect(packet.target).toBe("search:cli");
    expect(packet.entries).toHaveLength(1);
    expect(packet.entries[0]).toMatchObject({
      id: "0001",
      title: "CLI search",
      searchScore: expect.any(Number),
      matchedFields: expect.arrayContaining(["title"]),
      matchedFiles: ["src/cli.ts"],
      invariants: ["Exit codes stay stable."],
      verification: ["npm test"],
    });
    expect(formatAgentPacket(packet)).toContain("Matched fields");
  });

  it("reports omitted search matches beyond the selected packet entries", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "CLI search one"),
      document("0002", "CLI search two"),
      document("0003", "CLI search three"),
    ]);

    const packet = buildSearchAgentPacket(model, "cli", { limit: 1 });

    expect(packet.entries).toHaveLength(1);
    expect(packet.truncated).toBe(true);
    expect(packet.omittedEntries).toBe(2);
  });

  it("uses the default search packet limit when limits are invalid", () => {
    const model = buildStaticReaderModel(workspace(), [
      document("0001", "CLI search one"),
      document("0002", "CLI search two"),
    ]);

    const packet = buildSearchAgentPacket(model, "cli", { limit: Number.NaN });

    expect(packet.entries).toHaveLength(2);
    expect(packet.truncated).toBe(false);
  });
});

function workspace(): LedgerWorkspace {
  return {
    projectRoot: "/tmp/ledger",
    ledgerRoot: "/tmp/ledger/.ledger",
    configPath: "/tmp/ledger/.ledger/config.yaml",
    config: defaultConfig,
  };
}

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

function document(id = "0001", title = "CLI"): ParsedLedgerDocument {
  const raw = `---
id: "${id}"
kind: "change"
title: "${title}"
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

# ${id}: ${title}

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
