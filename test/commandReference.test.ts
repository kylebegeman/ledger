import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandReferencePath, renderCommandReference } from "../src/operations/reference.js";
import { ledgerOperations } from "../src/operations/registry.js";

describe("command reference", () => {
  it("matches the committed docs/COMMANDS.md", async () => {
    const target = path.join(process.cwd(), commandReferencePath);
    const rendered = renderCommandReference();
    if (process.env.LEDGER_UPDATE_COMMANDS === "1") await writeFile(target, rendered, "utf8");
    // Windows checkouts may convert the file to CRLF line endings.
    const committed = (await readFile(target, "utf8")).replace(/\r\n/g, "\n");
    expect(committed, "docs/COMMANDS.md is stale; run LEDGER_UPDATE_COMMANDS=1 npx vitest run test/commandReference.test.ts").toBe(rendered);
  });

  it("covers every command and flag, and its contents link to real headings", () => {
    const reference = renderCommandReference();
    for (const operation of ledgerOperations) {
      expect(reference).toContain(operation.cli.usage);
      for (const flag of Object.keys(operation.cli.flags)) expect(reference).toContain(`| \`--${flag}\` |`);
    }
    const anchors = new Set(
      [...reference.matchAll(/^#{2,3} (.+)$/gm)].map((match) =>
        match[1]!.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-"),
      ),
    );
    const links = [...reference.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((match) => match[1]!);
    expect(links.length).toBeGreaterThan(40);
    expect(links.filter((link) => !anchors.has(link))).toEqual([]);
    expect(reference).toContain("MCP tool `ledger_new`, which asks the user to confirm before it writes.");
    expect(reference).toContain("## Commands for host hooks\n");
    expect(reference).not.toContain("—");
  });
});
