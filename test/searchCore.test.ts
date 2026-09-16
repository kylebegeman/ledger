import { describe, expect, it } from "vitest";
import { fuzzyScore, scoreSearchFields, searchWeights } from "../src/searchCore.js";
import { searchLedgerIndex } from "../src/search.js";
import type { LedgerSearchDocument } from "../src/render.js";

describe("shared search scoring", () => {
  it("scores fixture documents deterministically", () => {
    for (const [query, text] of [
      ["cli", "src/cli.ts"],
      ["render", "static reader renderer"],
      ["zzz", "nothing here"],
      ["", "anything"],
      ["abc", "a-b-c"],
    ]) {
      expect(fuzzyScore(query!, text!)).toBe(fuzzyScore(query!, text!));
    }
    expect(Object.keys(searchWeights)).toContain("title");
    for (const document of fixtureIndex()) {
      expect(scoreSearchFields(document, "retry").score).toBeGreaterThanOrEqual(0);
    }
  });

  it("ranks id and title matches above summary matches", () => {
    const results = searchLedgerIndex(fixtureIndex(), "retry");
    expect(results.map((result) => result.id)).toEqual(["0002", "0001"]);
    expect(results[0]?.matchedFields).toContain("title");
    expect(results[1]?.matchedFields).toEqual(["summary", "terms"]);
  });
});

function fixtureIndex(): readonly LedgerSearchDocument[] {
  return [
    searchDocument("0001", "Static reader renderer", {
      path: ".ledger/entries/0001.md",
      summary: "Adds retry handling for the reader fetch.",
    }),
    searchDocument("0002", "Retry policy for the CLI", {
      path: ".ledger/entries/0002.md",
      files: "src/cli.ts",
      symbols: "run",
    }),
  ];
}

function searchDocument(
  id: string,
  title: string,
  fields: Partial<LedgerSearchDocument["fields"]>,
): LedgerSearchDocument {
  const merged = {
    id,
    title,
    path: "",
    symbols: "",
    files: "",
    docs: "",
    metadata: "change landed",
    context: "",
    summary: "",
    ...fields,
  };
  return {
    id,
    title,
    path: merged.path,
    kind: "change",
    status: "landed",
    terms: Object.values(merged).join(" ").toLowerCase(),
    fields: merged,
  } as LedgerSearchDocument;
}
