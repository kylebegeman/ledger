import { describe, expect, it } from "vitest";
import { parseNameStatusLine, parseStatusLine } from "../src/git.js";

describe("git status parsing", () => {
  it("parses short status lines", () => {
    expect(parseStatusLine(" M src/cli.ts")).toEqual({
      path: "src/cli.ts",
      status: "modified",
    });
    expect(parseStatusLine("?? docs/new.md")).toEqual({
      path: "docs/new.md",
      status: "untracked",
    });
    expect(parseStatusLine("R  old.ts -> src/new.ts")).toEqual({
      path: "src/new.ts",
      status: "renamed",
    });
  });

  it("parses staged name-status lines", () => {
    expect(parseNameStatusLine("A\tsrc/cli.ts")).toEqual({
      path: "src/cli.ts",
      status: "added",
    });
    expect(parseNameStatusLine("R100\told.ts\tsrc/new.ts")).toEqual({
      path: "src/new.ts",
      status: "renamed",
    });
  });
});
