import { describe, expect, it } from "vitest";
import {
  extractCodeSymbols,
  extractCodeSymbolsWithRegex,
  extractMarkdownSymbols,
} from "../src/symbols.js";

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

  it("extracts Markdown headings as document anchors", () => {
    expect(extractMarkdownSymbols("# Title\n\n## Usage ##\n\nbody")).toEqual([
      "Title",
      "Usage",
    ]);
  });
});
