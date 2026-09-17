import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import type { GitChangedFile } from "../src/git.js";
import { defaultDraftTitle, inferAreas, isDefaultDraftTitle } from "../src/newEntry.js";
import type { LedgerWorkspace } from "../src/types.js";

const workspace: LedgerWorkspace = {
  projectRoot: "/tmp/ledger",
  ledgerRoot: "/tmp/ledger/.ledger",
  configPath: "/tmp/ledger/.ledger/config.yaml",
  config: defaultConfig,
};

describe("draft limits", () => {
  it("names at most three areas in a default title and still recognizes it", () => {
    const areas = ["cli", "docs", "hooks", "reader", "search"];
    const title = defaultDraftTitle(areas, ["src/cli.ts"]);
    expect(title).toBe("Changes to cli, docs, hooks, and 2 more");
    expect(isDefaultDraftTitle(title, areas, [])).toBe(true);
    expect(defaultDraftTitle(["cli", "docs"], [])).toBe("Changes to cli, docs");
    expect(isDefaultDraftTitle("Changes to cli, docs", ["cli", "docs"], [])).toBe(true);
    expect(isDefaultDraftTitle("Retry webhooks", areas, [])).toBe(false);
  });

  it("keeps the eight most touched areas of a wide diff", () => {
    const files: GitChangedFile[] = [];
    for (let index = 0; index < 12; index += 1) {
      for (let copy = 0; copy <= index % 3; copy += 1) {
        files.push({ path: `src/area${String(index).padStart(2, "0")}/file${copy}.ts`, status: "modified" });
      }
    }
    expect(inferAreas(workspace, files)).toEqual([
      "area01",
      "area02",
      "area04",
      "area05",
      "area07",
      "area08",
      "area10",
      "area11",
    ]);
  });
});
