import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerDocuments } from "../src/documents.js";
import { formatDoctorResult, runDoctor, type LedgerDoctorCheck } from "../src/doctor.js";
import { run } from "../src/cli.js";
import { installHostHooks } from "../src/hooks.js";
import { validateDocuments } from "../src/validate.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("doctor", () => {
  it("reports workspace health checks", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-doctor-test-"));
    await initWorkspace(tempDir, { withDocs: true });

    const workspace = await findWorkspace(tempDir);
    const documents = await readLedgerDocuments(workspace);
    const result = await runDoctor(workspace, documents, validateDocuments(workspace, documents));

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      "workspace",
      "git",
      "write-state",
      "validation",
      "docs",
      "indexes",
      "cache",
      "engine",
      "render",
      "render-budget",
      "performance",
      "symbols",
      "hooks",
      "verification",
      "stale-knowledge",
    ]);
    expect(formatDoctorResult(result)).toContain("Ledger doctor: passed.");
  });

  it("passes the symbols check without the parser note when only Go is under coverage", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-doctor-go-test-")));
    await initWorkspace(tempDir, {
      detection: {
        coverageRoots: ["cmd/**"],
        ignore: [".ledger/indexes/**", ".ledger/reports/**", ".ledger/dist/**", ".ledger/cache/**"],
        verificationAllow: ["go test **"],
      },
    });
    await mkdir(path.join(tempDir, "cmd"), { recursive: true });
    await writeFile(path.join(tempDir, "cmd", "main.go"), "package main\n\nfunc main() {}\n");
    await commitAll(tempDir);

    const check = await symbolsCheckFor(tempDir);
    expect(check.level).toBe("pass");
    expect(check.message).toContain("no TypeScript or JavaScript under coverage");
    expect(check.message).toContain("so Go anchors are not extracted or checked");
  }, 30_000);

  it("keeps the TypeScript parser check when TypeScript is under coverage", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-doctor-ts-test-")));
    await initWorkspace(tempDir);
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "feature.ts"), "export const feature = true;\n");
    await writeFile(path.join(tempDir, "src", "helper.go"), "package src\n");
    await commitAll(tempDir);

    const check = await symbolsCheckFor(tempDir);
    expect(check.level).toBe("pass");
    expect(check.message).toMatch(/parser available for anchors$/);
  }, 30_000);
});

async function symbolsCheckFor(projectRoot: string): Promise<LedgerDoctorCheck> {
  const workspace = await findWorkspace(projectRoot);
  const documents = await readLedgerDocuments(workspace);
  const result = await runDoctor(workspace, documents, validateDocuments(workspace, documents));
  const check = result.checks.find((item) => item.name === "symbols");
  if (!check) throw new Error("missing symbols check");
  return check;
}

async function commitAll(cwd: string): Promise<void> {
  await runGit(cwd, "init");
  await runGit(cwd, "add", ".");
  await runGit(cwd, "-c", "user.email=ledger@example.com", "-c", "user.name=Ledger Test", "commit", "-m", "base");
}

async function runGit(cwd: string, ...args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile("git", [...args], { cwd }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe("doctor hooks check", () => {
  it("passes without hooks and checks installed ones against agents.command and the version", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-doctor-hooks-")));
    await initWorkspace(tempDir);
    expect(await hooksCheckFor(tempDir, "9.9.9")).toEqual({ name: "hooks", level: "pass", message: "no host hooks installed" });

    const fake = path.join(tempDir, "fake-ledger.mjs");
    await writeFile(fake, 'process.stdout.write(process.argv[2] === "version" ? "ledger 9.9.9\\n" : "");\n');
    const command = `node ${fake}`;
    await installHostHooks(await findWorkspace(tempDir), { host: "codex", command, dryRun: false });
    await installHostHooks(await findWorkspace(tempDir), { host: "claude-code", dryRun: false });

    expect(await hooksCheckFor(tempDir, "9.9.9")).toEqual({
      name: "hooks",
      level: "pass",
      message: `claude-code, codex hooks run Ledger 9.9.9 through \`${command}\``,
    });
    expect(await hooksCheckFor(tempDir, "1.0.0")).toMatchObject({
      level: "warn",
      message: `claude-code, codex hooks run Ledger 9.9.9 through \`${command}\`, but this is Ledger 1.0.0`,
    });

    const cursorFile = path.join(tempDir, ".cursor", "hooks.json");
    await mkdir(path.dirname(cursorFile), { recursive: true });
    await writeFile(cursorFile, JSON.stringify({ version: 1, hooks: { stop: [{ command: "ledger hook stop --host cursor" }] } }));
    expect(await hooksCheckFor(tempDir, "9.9.9")).toMatchObject({
      level: "warn",
      message: `.cursor/hooks.json runs \`ledger\`, but agents.command is \`${command}\`; rerun ledger hooks install for cursor`,
    });
    await rm(cursorFile);

    await writeFile(fake, "process.exit(3);\n");
    expect(await hooksCheckFor(tempDir, "9.9.9")).toMatchObject({
      level: "warn",
      message: expect.stringContaining(`claude-code, codex hooks cannot run: \`${command} version\` failed`),
    });
    await writeFile(fake, 'console.log("Ledger CLI accounting 3.3");\n');
    expect(await hooksCheckFor(tempDir, "9.9.9")).toMatchObject({
      level: "warn",
      message: expect.stringContaining("did not print a Ledger version"),
    });
  });
});

describe("doctor --fix", () => {
  it("repairs derived state, never records, and reports what it did", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-doctor-fix-")));
    await initWorkspace(tempDir);
    const workspace = await findWorkspace(tempDir);
    await writeFile(
      path.join(workspace.ledgerRoot, "daemon.json"),
      JSON.stringify({
        pid: 1,
        url: "http://127.0.0.1:1/",
        host: "127.0.0.1",
        port: 1,
        profile: "internal",
        version: "0.0.0",
        startedAt: new Date().toISOString(),
        apiVersion: 1,
      }),
    );
    const before = await doctorJson(tempDir, []);
    expect(levels(before)).toMatchObject({ engine: "warn", indexes: "warn", render: "warn" });

    const fixed = await doctorJson(tempDir, ["--fix"]);
    expect(fixed.fixes).toEqual([
      { check: "engine", ok: true, message: "removed the stale engine record" },
      { check: "indexes", ok: true, message: "regenerated indexes under .ledger/indexes" },
      { check: "render", ok: true, message: "rendered .ledger/dist/index.html" },
    ]);
    expect(levels(fixed)).toMatchObject({ engine: "pass", indexes: "pass", render: "pass", "render-budget": "pass" });
    await expect(access(path.join(workspace.ledgerRoot, "daemon.json"))).rejects.toThrow();

    const again = await doctorJson(tempDir, ["--fix"]);
    expect(again.fixes).toEqual([]);

    const text = await captureDoctor(tempDir, ["doctor", "--fix"]);
    expect(text.stdout).toContain("Ledger doctor --fix: nothing to repair.");
  });

  it("leaves indexes and the reader alone while records do not validate", async () => {
    tempDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-doctor-fix-blocked-")));
    await initWorkspace(tempDir);
    const broken = path.join(tempDir, ".ledger", "entries", "0001-broken.md");
    await writeFile(broken, '---\nid: "0001"\nkind: "change"\ntitle: ""\ndate: "2026-09-17"\nstatus: "draft"\n---\n\n# 0001\n');
    const before = await readFile(broken, "utf8");

    const result = await doctorJson(tempDir, ["--fix"]);
    expect(result.fixes).toEqual([
      { check: "indexes", ok: false, message: expect.stringMatching(/validation error\(s\) must be fixed first$/) },
      { check: "render", ok: false, message: expect.stringMatching(/validation error\(s\) must be fixed first$/) },
    ]);
    expect(await readFile(broken, "utf8")).toBe(before);
  });
});

async function hooksCheckFor(root: string, version: string): Promise<LedgerDoctorCheck | undefined> {
  const workspace = await findWorkspace(root);
  const documents = await readLedgerDocuments(workspace);
  const result = await runDoctor(workspace, documents, validateDocuments(workspace, documents), { version });
  return result.checks.find((check) => check.name === "hooks");
}

interface DoctorPayload {
  readonly checks: readonly LedgerDoctorCheck[];
  readonly fixes?: readonly { readonly check: string; readonly ok: boolean; readonly message: string }[];
}

function levels(payload: DoctorPayload): Record<string, string> {
  return Object.fromEntries(payload.checks.map((check) => [check.name, check.level]));
}

async function doctorJson(root: string, flags: readonly string[]): Promise<DoctorPayload> {
  const output = await captureDoctor(root, ["doctor", ...flags, "--json"]);
  return JSON.parse(output.stdout).data as DoctorPayload;
}

async function captureDoctor(root: string, argv: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const previous = process.env.LEDGER_NO_DAEMON;
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(" "));
  process.env.LEDGER_NO_DAEMON = "1";
  try {
    await run([...argv], { cwd: root });
    return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    if (previous === undefined) delete process.env.LEDGER_NO_DAEMON;
    else process.env.LEDGER_NO_DAEMON = previous;
  }
}
