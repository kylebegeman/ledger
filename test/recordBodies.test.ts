import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { setFrontmatterBlock, setFrontmatterScalars } from "../src/frontmatterEdit.js";
import { createLedgerMcpHttpHandler } from "../src/mcp.js";
import { applySectionBodies, checkSectionBodies, maxSectionBodyChars, parseSectionBodies } from "../src/sections.js";
import { renderLedgerTemplate } from "../src/template.js";
import { initWorkspace } from "../src/workspace.js";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("section bodies", () => {
  const allowed = ["Summary", "Why", "Notes"];

  it("accepts known headings and refuses unknown ones", () => {
    expect(checkSectionBodies({ " Summary ": "Text.\r\nMore." }, allowed, "A change entry")).toEqual({
      Summary: "Text.\nMore.",
    });
    expect(() => checkSectionBodies({ Nope: "x" }, allowed, "A change entry")).toThrow(
      'A change entry has no section named "Nope". Its sections are Summary, Why, Notes.',
    );
  });

  it("refuses title and section headings anywhere in a body, fences included", () => {
    for (const body of ["## Sneaky", "# Title", "text\n```md\n## Inside a fence\n```", "  ## Indented"]) {
      expect(() => checkSectionBodies({ Why: body }, allowed, "A change entry")).toThrow(/Use ### for subsections/);
    }
    expect(checkSectionBodies({ Why: "### Subsection\n\n#hashtag and ####deep" }, allowed, "x").Why).toContain("### Subsection");
    expect(() => checkSectionBodies({ Why: "x".repeat(maxSectionBodyChars + 1) }, allowed, "x")).toThrow(/the limit is/);
    expect(() => checkSectionBodies({ Why: "a\0b" }, allowed, "x")).toThrow(/NUL/);
  });

  it("replaces present sections and appends missing ones only when asked", () => {
    const markdown = "---\nid: \"1\"\n---\n\n# 1: T\n\n## Summary\n\nOld.\n\n## Why\n\nOld why.\n";
    const replaced = applySectionBodies(markdown, { Summary: "New summary.", Why: "" });
    expect(replaced).toContain("## Summary\n\nNew summary.\n\n## Why\n");
    expect(replaced).not.toContain("Old");
    expect(() => applySectionBodies(markdown, { Notes: "x" })).toThrow("The record has no Notes section.");
    expect(applySectionBodies(markdown, { Notes: "Appended." }, { append: true })).toMatch(/Old why\.\n\n## Notes\n\nAppended\.\n$/);
  });

  it("reads section files and refuses repeats or files without sections", () => {
    expect(parseSectionBodies("# Title\n\nIgnored.\n\n## Summary\n\nS.\n\n## Why\n\nW.\n", "body.md")).toEqual({
      Summary: "S.",
      Why: "W.",
    });
    expect(() => parseSectionBodies("## Why\n\nA\n\n## Why\n\nB\n", "body.md")).toThrow("body.md repeats the Why section.");
    expect(() => parseSectionBodies("Just text.", "body.md")).toThrow('body.md has no "## Title" sections to read.');
  });

  it("keeps dollar signs literal in rendered records", () => {
    const rendered = renderLedgerTemplate('---\ntitle: "{{title}}"\nstatus: "draft"\n---\n# {{title}}\n', {
      scalars: { title: "Save $$ with $& and $' and $`", status: "landed" },
    });
    expect(rendered).toContain('title: "Save $$ with $& and $\' and $`"');
    expect(rendered).toContain("# Save $$ with $& and $' and $`");
    expect(setFrontmatterScalars('---\nid: "1"\n---\n', { reason: "costs $& less" })).toContain('reason: "costs $& less"');
  });

  it("replaces a nested frontmatter block and keeps the fields around it", () => {
    const markdown = '---\nid: "1"\ndocsImpact:\n  status: "none"\n  reason: "TODO"\n\ncommits: []\n---\n\nBody\n';
    const lines = ["docsImpact:", '  status: "updated"', '  reason: "Docs moved."', "  docs:", '    - "docs/A.md"'];
    const replaced = setFrontmatterBlock(markdown, "docsImpact", lines);
    expect(replaced).toBe(
      '---\nid: "1"\ndocsImpact:\n  status: "updated"\n  reason: "Docs moved."\n  docs:\n    - "docs/A.md"\n\ncommits: []\n---\n\nBody\n',
    );
    expect(setFrontmatterBlock('---\nid: "1"\n---\n', "docsImpact", lines)).toBe(`---\nid: "1"\n${lines.join("\n")}\n---\n`);
  });
});

describe("records written with body text", () => {
  it("writes a finished receipt in one command and passes ready", async () => {
    const root = await workspace();
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "retry.ts"), "export const retries = 3;\n");
    await writeFile(path.join(root, "docs", "RETRIES.md"), "# Retries\n");
    const bodyFile = path.join(root, "body.md");
    await writeFile(
      bodyFile,
      [
        "# Draft notes",
        "",
        "## Summary",
        "",
        "Retries are capped at three.",
        "",
        "## Changed Files",
        "",
        "### src/retry.ts",
        "",
        "- What changed: the cap.",
        "- Anchor: `retries`",
        "- On conflict: keep three.",
        "",
        "## Invariants",
        "",
        "- At most three retries.",
        "",
        "## Verification",
        "",
        "- `npm test`",
      ].join("\n"),
    );

    const created = await cli(
      [
        "new",
        "Cap provider retries",
        "--status",
        "landed",
        "--area",
        "server",
        "--file",
        "src/retry.ts",
        "--doc",
        "docs/RETRIES.md",
        "--symbol",
        "retries",
        "--related",
        "0001",
        "--docs-impact",
        "updated",
        "--docs-impact-reason",
        "The retries doc names the cap.",
        "--docs-impact-doc",
        "docs/RETRIES.md",
        "--sections-file",
        bodyFile,
        "--section=Why=Unbounded retries hid outages.",
        "--section",
        "Behavior And UX Impact=Callers see an error after three attempts.",
        "--section=Notes=",
        "--json",
      ],
      root,
    );
    expect(created.exitCode).toBe(0);
    const entryPath = JSON.parse(created.stdout).data.path as string;
    const entry = await readFile(path.join(root, entryPath), "utf8");
    expect(entry).toContain('status: "landed"');
    expect(entry).toContain('files:\n  - "src/retry.ts"');
    expect(entry).toContain('docs:\n  - "docs/RETRIES.md"');
    expect(entry).toContain('symbols:\n  - "retries"');
    expect(entry).toContain('related:\n  - "0001"');
    expect(entry).toContain(
      'docsImpact:\n  status: "updated"\n  reason: "The retries doc names the cap."\n  docs:\n    - "docs/RETRIES.md"\ncommits: []',
    );
    expect(entry).toContain("## Why\n\nUnbounded retries hid outages.\n\n## Changed Files\n\n### src/retry.ts");
    expect(entry).toContain("## Behavior And UX Impact\n\nCallers see an error after three attempts.");
    expect(entry).toMatch(/## Notes\n$/);
    expect(entry).not.toContain("Draft notes");

    const ready = await cli(["ready", entryPath.match(/\/(\d+)-/)![1]!], root);
    expect(ready.stdout).toContain("1 ready, 0 not ready");
  });

  it("explains unknown sections, headings in bodies, and half a docs impact", async () => {
    const root = await workspace();
    const unknown = await cli(["new", "Bad section", "--section", "Rationale=Because."], root);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain('A change entry has no section named "Rationale". Its sections are Summary, Why, Changed Files');

    const heading = await cli(["new", "Bad body", "--section", "Why=## Not allowed"], root);
    expect(heading.stderr).toContain("Use ### for subsections");

    const pair = await cli(["new", "Bad pair", "--section", "NoEquals"], root);
    expect(pair.stderr).toContain("--section needs Heading=text, got: NoEquals");

    const half = await cli(["new", "Half impact", "--docs-impact", "none"], root);
    expect(half.stderr).toContain("--docs-impact and --docs-impact-reason go together");
    expect(await entries(root)).toEqual([]);
  });

  it("fills backlog items, decisions, product notes, and promoted entries", async () => {
    const root = await workspace();
    expect((await cli(["backlog", "new", "Sharded search", "--section", "Problem=Search is slow.", "--section", "Acceptance Checks=- Queries stay under 50 ms."], root)).exitCode).toBe(0);
    expect((await cli(["decision", "new", "Use shards", "--section", "Decision=Shard by size."], root)).exitCode).toBe(0);
    expect((await cli(["feedback", "Palette is slow", "--section", "Finding=Typing lags."], root)).exitCode).toBe(0);
    const promoted = await cli(["promote", "B001", "--section", "Summary=Shards land.", "--json"], root);
    expect(promoted.exitCode).toBe(0);

    const backlog = await readFile(path.join(root, ".ledger", "backlog", "B001-sharded-search.md"), "utf8");
    expect(backlog).toContain("## Problem\n\nSearch is slow.");
    const decision = await readFile(path.join(root, ".ledger", "decisions", "D001-use-shards.md"), "utf8");
    expect(decision).toContain("## Decision\n\nShard by size.");
    const note = await readFile(path.join(root, ".ledger", "entries", "0001-palette-is-slow.md"), "utf8");
    expect(note).toContain("## Finding\n\nTyping lags.");
    const entry = await readFile(path.join(root, JSON.parse(promoted.stdout).data.entry.path), "utf8");
    expect(entry).toContain("## Summary\n\nShards land.");
    expect(entry).toContain("## Verification\n\n- Queries stay under 50 ms.");
  });

  it("updates a record in place and keeps its path", async () => {
    const root = await workspace();
    await cli(["new", "Changes to server"], root);
    const [draft] = await entries(root);

    const updated = await cli(
      [
        "update",
        "0001",
        "--title",
        "Cap retries",
        "--status",
        "landed",
        "--file",
        "src/a.ts",
        "--file",
        "src\\b.ts",
        "--docs-impact",
        "none",
        "--docs-impact-reason",
        "No durable docs describe retries.",
        "--section",
        "Summary=Retries are capped.",
        "--json",
      ],
      root,
    );
    expect(updated.exitCode).toBe(0);
    expect(JSON.parse(updated.stdout).data).toMatchObject({
      id: "0001",
      kind: "change",
      path: `.ledger/entries/${draft}`,
      fields: ["title", "status", "files", "docsImpact"],
      sections: ["Summary"],
    });
    const content = await readFile(path.join(root, ".ledger", "entries", draft!), "utf8");
    expect(content).toContain('title: "Cap retries"');
    expect(content).toContain("# 0001: Cap retries");
    expect(content).toContain('status: "landed"');
    expect(content).toContain(`updated: "${new Date().toISOString().slice(0, 10)}"`);
    expect(content).toContain('files:\n  - "src/a.ts"\n  - "src/b.ts"');
    expect(content).toContain('docsImpact:\n  status: "none"\n  reason: "No durable docs describe retries."\ncommits: []');
    expect(content).toContain("## Summary\n\nRetries are capped.\n\n## Why");
    expect(await entries(root)).toEqual([draft]);

    const byPath = await cli(["update", `.ledger/entries/${draft}`, "--section", "Notes=Follow up on jitter."], root);
    expect(byPath.stdout).toContain("the Notes section");
    expect(await readFile(path.join(root, ".ledger", "entries", draft!), "utf8")).toContain("## Notes\n\nFollow up on jitter.");
  });

  it("appends a template section the record lacks and refuses what does not apply", async () => {
    const root = await workspace();
    await cli(["backlog", "new", "Trimmed item"], root);
    const itemPath = path.join(root, ".ledger", "backlog", "B001-trimmed-item.md");
    const trimmed = (await readFile(itemPath, "utf8")).replace(/## Risks[\s\S]*$/, "");
    await writeFile(itemPath, trimmed);

    expect((await cli(["update", "B001", "--section", "Risks=- None known."], root)).exitCode).toBe(0);
    expect(await readFile(itemPath, "utf8")).toMatch(/## Risks\n\n- None known\.\n$/);

    const impact = await cli(["update", "B001", "--docs-impact", "none", "--docs-impact-reason", "n/a"], root);
    expect(impact.stderr).toContain("Only change entries declare docs impact; B001 is a backlog record");
    const symbols = await cli(["update", "B001", "--symbol", "x"], root);
    expect(symbols.stderr).toContain("Only change entries anchor symbols");
    const nothing = await cli(["update", "B001"], root);
    expect(nothing.stderr).toContain("Nothing to update in B001");
    const missing = await cli(["update", "B404", "--status", "done"], root);
    expect(missing.stderr).toContain("Ledger record B404 was not found");
  });
});

describe("MCP writes with body text", () => {
  it("names the sections in the confirmation and checks the write before asking", async () => {
    const root = await workspace();
    const prompts: string[] = [];
    const client = await modernClient(root, (message) => {
      prompts.push(message);
      return { action: "accept", content: { confirm: true } };
    });

    const created = await client.callTool({
      name: "ledger_new",
      arguments: { title: "Body over MCP", sections: { Summary: "Written by an agent.", Why: "No shell." } },
    });
    expect(created.structuredContent).toMatchObject({ ok: true });
    expect(prompts[0]).toContain('Create a draft change entry titled "Body over MCP" with the Summary and Why sections.');

    const updated = await client.callTool({
      name: "ledger_update",
      arguments: { id: "0001", status: "landed", sections: { Notes: "Done." } },
    });
    expect(updated.structuredContent).toMatchObject({ ok: true, data: { fields: ["status"], sections: ["Notes"] } });
    expect(prompts[1]).toContain("Update 0001: set its status to landed and rewrite the Notes section.");
    const content = await readFile(path.join(root, ".ledger", "entries", (await entries(root))[0]!), "utf8");
    expect(content).toContain("## Summary\n\nWritten by an agent.");
    expect(content).toContain("## Notes\n\nDone.");

    const failures = [
      { name: "ledger_update", arguments: { id: "0404", status: "landed" }, code: "record-not-found" },
      { name: "ledger_new", arguments: { title: "Bad", sections: { Rationale: "x" } }, code: "invalid-argument" },
      { name: "ledger_promote", arguments: { id: "0001" }, code: "invalid-argument" },
      { name: "ledger_session_note", arguments: { text: "No session yet." }, code: "record-not-found" },
    ];
    for (const failure of failures) {
      const result = await client.callTool({ name: failure.name, arguments: failure.arguments });
      expect(result.structuredContent).toMatchObject({ ok: false, error: { code: failure.code } });
    }
    expect(prompts).toHaveLength(2);
  });
});

type Answer = { readonly action: "accept" | "decline" | "cancel"; readonly content?: Record<string, boolean> };

async function modernClient(root: string, elicit: (message: string) => Answer): Promise<Client> {
  const handler = createLedgerMcpHttpHandler({ cwd: root, writeRoot: root });
  cleanups.push(() => handler.close());
  const client = new Client(
    { name: "ledger-body-test", version: "0.0.0" },
    { capabilities: { elicitation: {} }, versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  client.setRequestHandler("elicitation/create", async (request) =>
    elicit(String((request.params as { message: string }).message)),
  );
  cleanups.push(() => client.close().catch(() => undefined));
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://ledger.test/mcp"), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ledger-bodies-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  await initWorkspace(directory, { withDocs: true });
  return directory;
}

async function entries(root: string): Promise<string[]> {
  return (await readdir(path.join(root, ".ledger", "entries"))).filter((name) => name.endsWith(".md"));
}

async function cli(argv: readonly string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalNoDaemon = process.env.LEDGER_NO_DAEMON;
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(" "));
  process.env.LEDGER_NO_DAEMON = "1";
  try {
    const exitCode = await run([...argv], { cwd });
    return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    if (originalNoDaemon === undefined) delete process.env.LEDGER_NO_DAEMON;
    else process.env.LEDGER_NO_DAEMON = originalNoDaemon;
  }
}
