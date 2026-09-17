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
  resolveTypeScriptModule,
  symbolExtractorStatus,
  typeScriptFallbackAdvice,
} from "../src/symbols.js";
import type { LedgerWorkspace } from "../src/types.js";
import * as typescript from "typescript";

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
    expect(parsed).toEqual({
      symbols: ["outer"],
      spans: [{ name: "outer", start: 1, end: 3, depth: 0 }],
      extractor: "typescript",
    });

    const unavailable = async () => undefined;
    const fallback = await extractCodeSymbolsDetailed(raw, "fixture.ts", { loadTypeScript: unavailable });
    expect(fallback.extractor).toBe("regex");
    expect(fallback.symbols).toEqual(["inner", "outer"]);
    expect(fallback.fallbackReason).toContain("unavailable");

    await expect(
      extractCodeSymbolsDetailed(raw, "fixture.ts", { parser: "typescript", loadTypeScript: unavailable }),
    ).rejects.toThrow(/TypeScript parser was requested but is unavailable/);

    const statuses = await symbolExtractorStatus();
    expect(statuses.map((status) => status.name)).toEqual(["typescript", "regex", "markdown", "go", "rust", "python", "swift"]);
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
    expect(await extractFileSymbolsDetailed(workspace, "notes.md")).toEqual({
      symbols: ["Title"],
      spans: [{ name: "Title", start: 1, end: 1, depth: 1 }],
      extractor: "markdown",
    });
    expect(await extractFileSymbolsDetailed(workspace, "data.json")).toEqual({ symbols: [], spans: [], extractor: "none" });
    expect(await extractFileSymbolsDetailed(workspace, "missing.ts")).toEqual({ symbols: [], spans: [], extractor: "none" });
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

describe("resolveTypeScriptModule", () => {
  const notFound = (specifier: string) => Object.assign(new Error(`Cannot find package '${specifier}'`), { code: "ERR_MODULE_NOT_FOUND" });
  const importer = (modules: Readonly<Record<string, unknown>>) => async (specifier: string) => {
    if (specifier in modules) return modules[specifier];
    throw notFound(specifier);
  };
  const typeScript7 = { version: "7.0.2", versionMajorMinor: "7.0" };

  it("takes named exports, and the default export that TypeScript 5.0 to 5.4 expose", async () => {
    expect((await resolveTypeScriptModule(importer({ typescript })).then((result) => result.ts))?.version).toBe(typescript.version);
    const defaultOnly = { default: { ...typescript, version: "5.4.5" } };
    expect((await resolveTypeScriptModule(importer({ typescript: defaultOnly }))).ts?.version).toBe("5.4.5");
  });

  it("rejects TypeScript 7, which has no JavaScript API, and falls back to the TypeScript 6 alias", async () => {
    const alone = await resolveTypeScriptModule(importer({ typescript: typeScript7 }));
    expect(alone.ts).toBeUndefined();
    expect(alone.reason).toBe(
      "typescript 7.0.2 has no JavaScript compiler API; install @typescript/typescript6 beside it for parsed symbols",
    );
    const beside = await resolveTypeScriptModule(
      importer({ typescript: typeScript7, "@typescript/typescript6": { ...typescript, version: "6.0.3" } }),
    );
    expect(beside.ts?.version).toBe("6.0.3");
  });

  it("explains a missing or broken package", async () => {
    expect(await resolveTypeScriptModule(importer({}))).toEqual({ reason: "the typescript package is not installed" });
    const broken = await resolveTypeScriptModule(async (specifier) => {
      if (specifier === "typescript") throw new SyntaxError("Unexpected token\n  at line 1");
      throw notFound(specifier);
    });
    expect(broken).toEqual({ reason: "the typescript package failed to load (Unexpected token)" });
  });

  it("suggests installing the peer only when TypeScript is missing", () => {
    expect(typeScriptFallbackAdvice("the typescript package is not installed")).toBe(
      "the typescript package is not installed; install the optional typescript peer for parsed symbols",
    );
    const typeScript7 = "typescript 7.0.2 has no JavaScript compiler API; install @typescript/typescript6 beside it for parsed symbols";
    expect(typeScriptFallbackAdvice(typeScript7)).toBe(typeScript7);
    expect(typeScriptFallbackAdvice(undefined)).toBe("the typescript parser is unavailable");
  });
});
