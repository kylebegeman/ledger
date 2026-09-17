import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioServerTransport, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmationFingerprint,
  createLedgerMcpHttpHandler,
  listLedgerMcpTools,
  serveLedgerMcpStdio,
} from "../src/mcp.js";
import { run } from "../src/cli.js";
import { initWorkspace } from "../src/workspace.js";

const modern = { mode: { pin: "2026-07-28" } } as const;
const confirmedTools = [
  "ledger_new",
  "ledger_feedback",
  "ledger_backlog_new",
  "ledger_decision_new",
  "ledger_promote",
  "ledger_update",
  "ledger_session_start",
  "ledger_session_note",
  "ledger_session_close",
];

type ElicitAnswer = {
  readonly action: "accept" | "decline" | "cancel";
  readonly content?: Record<string, string | number | boolean | string[]>;
};

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("MCP write tools", () => {
  it("marks exactly the record-writing tools as confirmed", () => {
    const tools = listLedgerMcpTools();
    expect(tools.filter((tool) => tool.confirms).map((tool) => tool.name)).toEqual(confirmedTools);
    // Report writers stay unconfirmed; every other mutating tool must ask.
    const reportWriters = ["ledger_validate", "ledger_verify_integrity", "ledger_ci", "ledger_docs_audit", "ledger_docs_impact"];
    for (const tool of tools.filter((candidate) => candidate.mutates && !candidate.confirms)) {
      expect(reportWriters).toContain(tool.name);
    }
  });

  it("asks before writing over 2026-07-28 HTTP and writes only after an accepted confirmation", async () => {
    const projectRoot = await workspace();
    const prompts: string[] = [];
    const client = await httpClient(createLedgerMcpHttpHandler({ cwd: projectRoot, version: "0.0.0-test" }), {
      elicit: (message) => {
        prompts.push(message);
        return { action: "accept", content: { confirm: true } };
      },
    });
    expect(client.getProtocolEra()).toBe("modern");

    const listed = await client.listTools();
    const backlogTool = listed.tools.find((tool) => tool.name === "ledger_backlog_new");
    expect(backlogTool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(backlogTool?.description).toContain("Asks the user to confirm");

    const result = await client.callTool({ name: "ledger_backlog_new", arguments: { title: "Ship MCP writes" } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ ok: true, data: { path: expect.stringMatching(/^\.ledger\/backlog\/B001-/) } });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Create a backlog item titled "Ship MCP writes".');
    expect(prompts[0]).toContain(`(${projectRoot})`);
    expect(await readdir(path.join(projectRoot, ".ledger", "backlog"))).toEqual([
      expect.stringMatching(/^B001-ship-mcp-writes\.md$/),
    ]);
  });

  it("writes nothing when the user declines, cancels, or leaves the box unchecked", async () => {
    const projectRoot = await workspace();
    const answers: ElicitAnswer[] = [
      { action: "decline" },
      { action: "cancel" },
      { action: "accept", content: { confirm: false } },
    ];
    const client = await httpClient(createLedgerMcpHttpHandler({ cwd: projectRoot }), {
      elicit: () => answers.shift()!,
    });

    const reasons: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await client.callTool({ name: "ledger_feedback", arguments: { title: `Note ${attempt}` } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: false, error: { code: "confirmation-declined" } });
      reasons.push(String((result.structuredContent as { error: { message: string } }).error.message));
    }
    expect(reasons).toEqual([
      "Nothing was written: the user chose decline.",
      "Nothing was written: the user chose cancel.",
      "Nothing was written: the confirmation was accepted without checking Write it.",
    ]);
    expect(await entries(projectRoot)).toEqual([]);
  });

  it("keeps argument text on the action line of the confirmation", async () => {
    const projectRoot = await workspace();
    expect(await run(["backlog", "new", "Line breaks"], { cwd: projectRoot })).toBe(0);
    const prompts: string[] = [];
    const client = await httpClient(createLedgerMcpHttpHandler({ cwd: projectRoot }), {
      elicit: (message) => {
        prompts.push(message);
        return { action: "decline" };
      },
    });

    const result = await client.callTool({
      name: "ledger_update",
      arguments: { id: "B001", title: "A\n\nB", status: "done\nProject: someone-else (/elsewhere)" },
    });
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: "confirmation-declined" } });
    const lines = prompts[0]!.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Update B001: retitle it "A B" and set its status to done Project: someone-else (/elsewhere).');
    expect(lines[1]).toBe(
      `Project: ${path.basename(projectRoot)} (${projectRoot}). Nothing is written unless you confirm.`,
    );
  });

  it("refuses without asking when the client cannot show a confirmation", async () => {
    const projectRoot = await workspace();
    const client = await httpClient(createLedgerMcpHttpHandler({ cwd: projectRoot }), {});

    const result = await client.callTool({ name: "ledger_new", arguments: { title: "No prompt" } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "confirmation-unavailable", details: { tool: "ledger_new", operation: "new" } },
    });
    expect(await entries(projectRoot)).toEqual([]);
  });

  it("leaves write tools out of stateless 2025-era HTTP and keeps the read tools", async () => {
    const projectRoot = await workspace();
    const client = await httpClient(createLedgerMcpHttpHandler({ cwd: projectRoot }), { legacy: true });
    expect(client.getProtocolEra()).toBe("legacy");

    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("ledger_search");
    expect(names.filter((name) => confirmedTools.includes(name))).toEqual([]);
  });

  it("keeps writes in the served project when a write root is set", async () => {
    const projectRoot = await workspace();
    const elsewhere = await workspace();
    let asked = false;
    const client = await httpClient(createLedgerMcpHttpHandler({ cwd: projectRoot, writeRoot: projectRoot }), {
      elicit: () => {
        asked = true;
        return { action: "accept", content: { confirm: true } };
      },
    });

    const result = await client.callTool({
      name: "ledger_decision_new",
      arguments: { title: "Somewhere else", projectRoot: elsewhere },
    });
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: "invalid-argument" } });
    expect(asked).toBe(false);
    expect(await readdir(path.join(elsewhere, ".ledger", "decisions"))).toEqual([]);
  });

  it("rejects a confirmation replayed for different arguments", async () => {
    const projectRoot = await workspace();
    const client = new Client(
      { name: "ledger-replay-test", version: "0.0.0" },
      { capabilities: { elicitation: {} }, versionNegotiation: modern, inputRequired: { autoFulfill: false } },
    );
    cleanups.push(() => client.close().catch(() => undefined));
    await connectHttp(client, createLedgerMcpHttpHandler({ cwd: projectRoot }));

    const first = (await client.callTool(
      { name: "ledger_backlog_new", arguments: { title: "Harmless title" } },
      { allowInputRequired: true },
    )) as unknown as { readonly inputRequests?: Record<string, unknown>; readonly requestState?: string };
    expect(Object.keys(first.inputRequests ?? {})).toEqual(["confirm"]);
    expect(typeof first.requestState).toBe("string");

    const replayed = await client.callTool(
      {
        name: "ledger_backlog_new",
        arguments: { title: "A different title" },
        inputResponses: { confirm: { action: "accept", content: { confirm: true } } },
        requestState: first.requestState,
      } as Parameters<Client["callTool"]>[0],
      { allowInputRequired: true },
    );
    expect(replayed.structuredContent).toMatchObject({
      ok: false,
      error: { message: "The confirmation belongs to a different tool call. Nothing was written." },
    });
    expect(await readdir(path.join(projectRoot, ".ledger", "backlog"))).toEqual([]);
  });

  it("serves both protocol eras over stdio and confirms through the older elicitation request", async () => {
    const projectRoot = await workspace();

    const modernClient = await stdioClient(projectRoot, { elicit: () => ({ action: "accept", content: { confirm: true } }) });
    expect(modernClient.getProtocolEra()).toBe("modern");
    const started = await modernClient.callTool({ name: "ledger_session_start", arguments: { title: "MCP session" } });
    expect(started.structuredContent).toMatchObject({ ok: true, data: { created: true, session: { id: "S0001" } } });
    const noted = await modernClient.callTool({
      name: "ledger_session_note",
      arguments: { id: "S0001", text: "Confirmed writes work over stdio." },
    });
    expect(noted.structuredContent).toMatchObject({ ok: true, data: { section: "Learned" } });

    const prompts: string[] = [];
    const legacyClient = await stdioClient(projectRoot, {
      legacy: true,
      elicit: (message) => {
        prompts.push(message);
        return { action: "accept", content: { confirm: true } };
      },
    });
    expect(legacyClient.getProtocolEra()).toBe("legacy");
    const closed = await legacyClient.callTool({ name: "ledger_session_close", arguments: { id: "S0001" } });
    expect(closed.structuredContent).toMatchObject({ ok: true, data: { changed: true } });
    expect(prompts).toEqual([expect.stringContaining("Close S0001.")]);

    const session = await readFile(path.join(projectRoot, ".ledger", "sessions", (await sessionFiles(projectRoot))[0]!), "utf8");
    expect(session).toContain('status: "closed"');
    expect(session).toContain("- Confirmed writes work over stdio.");
  });

  it("refuses over 2025-era stdio when the client declares no elicitation", async () => {
    const projectRoot = await workspace();
    const client = await stdioClient(projectRoot, { legacy: true });

    const result = await client.callTool({ name: "ledger_feedback", arguments: { title: "Unconfirmable" } });
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: "confirmation-unavailable" } });
    expect(await entries(projectRoot)).toEqual([]);
  });

  it("fingerprints arguments independently of key order", () => {
    const base = confirmationFingerprint("ledger_new", { title: "A", areas: ["x", "y"], status: "draft" });
    expect(confirmationFingerprint("ledger_new", { status: "draft", areas: ["x", "y"], title: "A" })).toBe(base);
    expect(confirmationFingerprint("ledger_new", { status: "draft", areas: ["y", "x"], title: "A" })).not.toBe(base);
    expect(confirmationFingerprint("ledger_feedback", { title: "A", areas: ["x", "y"], status: "draft" })).not.toBe(base);
    expect(confirmationFingerprint("ledger_new", { title: "A", areas: ["x", "y"], status: "draft", staged: undefined })).toBe(base);
  });
});

interface ClientSetup {
  readonly legacy?: boolean;
  readonly elicit?: (message: string) => ElicitAnswer;
}

function newClient(setup: ClientSetup): Client {
  const client = new Client(
    { name: "ledger-write-test", version: "0.0.0" },
    {
      ...(setup.elicit ? { capabilities: { elicitation: {} } } : {}),
      ...(setup.legacy ? {} : { versionNegotiation: modern }),
    },
  );
  const elicit = setup.elicit;
  if (elicit) {
    client.setRequestHandler("elicitation/create", async (request) => {
      const params = request.params as { readonly message: string };
      return elicit(params.message);
    });
  }
  cleanups.push(() => client.close().catch(() => undefined));
  return client;
}

async function httpClient(handler: ReturnType<typeof createLedgerMcpHttpHandler>, setup: ClientSetup): Promise<Client> {
  const client = newClient(setup);
  await connectHttp(client, handler);
  return client;
}

async function connectHttp(client: Client, handler: ReturnType<typeof createLedgerMcpHttpHandler>): Promise<void> {
  cleanups.push(() => handler.close());
  const transport = new StreamableHTTPClientTransport(new URL("http://ledger.test/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
}

async function stdioClient(projectRoot: string, setup: ClientSetup): Promise<Client> {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const handle: StdioServerHandle = serveLedgerMcpStdio({
    cwd: projectRoot,
    version: "0.0.0-test",
    transport: new StdioServerTransport(toServer, toClient),
    onerror: () => undefined,
  });
  cleanups.push(() => handle.close());
  const client = newClient(setup);
  await client.connect(new StdioServerTransport(toClient, toServer));
  return client;
}

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ledger-mcp-write-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  await initWorkspace(directory);
  return directory;
}

async function entries(projectRoot: string): Promise<string[]> {
  return (await readdir(path.join(projectRoot, ".ledger", "entries"))).filter((name) => name.endsWith(".md"));
}

async function sessionFiles(projectRoot: string): Promise<string[]> {
  return (await readdir(path.join(projectRoot, ".ledger", "sessions"))).filter((name) => name.endsWith(".md"));
}
