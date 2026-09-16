import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  extractCodeSymbols,
  extractCodeSymbolsDetailed,
  extractFileSymbols,
  extractFileSymbolsDetailed,
  extractCodeSymbolsWithRegex,
  extractMarkdownSymbols,
  symbolExtractorStatus,
} from "../src/symbols.js";
import type { LedgerWorkspace } from "../src/types.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("symbol extraction", () => {
  it("uses the TypeScript parser for top-level code symbols when available", async () => {
    const symbols = await extractCodeSymbols(
      `
export function outer() {
  function nestedImplementationDetail() {}
  return nestedImplementationDetail;
}
export const value = 1;
export const { named } = source;
type LocalShape = { id: string };
class LocalClass {}
`,
      "fixture.ts",
      { parser: "typescript" },
    );

    expect(symbols).toEqual(["LocalClass", "LocalShape", "named", "outer", "value"]);
  });

  it("keeps a regex fallback for hosts without parser support", async () => {
    const raw = `
export function outer() {
  function nestedImplementationDetail() {}
}
`;

    expect(await extractCodeSymbols(raw, "fixture.ts", { parser: "regex" })).toEqual([
      "nestedImplementationDetail",
      "outer",
    ]);
    expect(extractCodeSymbolsWithRegex(raw)).toEqual(["nestedImplementationDetail", "outer"]);
  });

  it("reports which extractor ran and why it fell back", async () => {
    const raw = "export function outer() {\n  function inner() {}\n}\n";
    const parsed = await extractCodeSymbolsDetailed(raw, "fixture.ts");
    expect(parsed).toEqual({ symbols: ["outer"], extractor: "typescript" });

    const unavailable = async () => undefined;
    const fallback = await extractCodeSymbolsDetailed(raw, "fixture.ts", { loadTypeScript: unavailable });
    expect(fallback.extractor).toBe("regex");
    expect(fallback.symbols).toEqual(["inner", "outer"]);
    expect(fallback.fallbackReason).toContain("unavailable");

    await expect(
      extractCodeSymbolsDetailed(raw, "fixture.ts", { parser: "typescript", loadTypeScript: unavailable }),
    ).rejects.toThrow(/TypeScript parser was requested but is unavailable/);

    const statuses = await symbolExtractorStatus();
    expect(statuses.map((status) => status.name)).toEqual(["typescript", "regex", "markdown"]);
    expect(statuses[0]).toMatchObject({ available: true, version: expect.stringMatching(/^\d+\./) });
  });

  it("labels markdown and unsupported files", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-symbols-detail-"));
    await writeFile(path.join(tempDir, "notes.md"), "# Title\n");
    await writeFile(path.join(tempDir, "data.json"), "{}");
    const workspace: LedgerWorkspace = {
      projectRoot: tempDir,
      ledgerRoot: path.join(tempDir, ".ledger"),
      configPath: path.join(tempDir, ".ledger", "config.yaml"),
      config: defaultConfig,
    };
    expect(await extractFileSymbolsDetailed(workspace, "notes.md")).toEqual({ symbols: ["Title"], extractor: "markdown" });
    expect(await extractFileSymbolsDetailed(workspace, "data.json")).toEqual({ symbols: [], extractor: "none" });
    expect(await extractFileSymbolsDetailed(workspace, "missing.ts")).toEqual({ symbols: [], extractor: "none" });
  });

  it("extracts Markdown headings as document anchors", () => {
    expect(extractMarkdownSymbols("# Title\n\n## Usage ##\n\nbody")).toEqual([
      "Title",
      "Usage",
    ]);
  });

  it("bounds symbol source reads", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-symbols-test-"));
    await writeFile(path.join(tempDir, "large.ts"), `export const value = "${"x".repeat(100)}";\n`);
    const workspace: LedgerWorkspace = {
      projectRoot: tempDir,
      ledgerRoot: path.join(tempDir, ".ledger"),
      configPath: path.join(tempDir, ".ledger", "config.yaml"),
      config: {
        ...defaultConfig,
        limits: { ...defaultConfig.limits, maxDocumentBytes: 32 },
      },
    };

    await expect(extractFileSymbols(workspace, "large.ts"))
      .rejects.toThrow("symbol source exceeds 32 bytes");
  });
});
