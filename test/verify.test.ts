import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { renderConfigWithAgentsCommand } from "../src/config.js";
import { readLedgerDocuments } from "../src/documents.js";
import { runDoctor } from "../src/doctor.js";
import { buildAgentPacket } from "../src/packet.js";
import { buildStaticReaderModel } from "../src/render.js";
import { detectStaleKnowledge } from "../src/stale.js";
import { validateDocuments } from "../src/validate.js";
import {
  evidenceFreshness,
  isAllowedCommand,
  parseVerificationBullet,
  readEvidence,
  runVerification,
  splitShellWords,
  writeEvidence,
} from "../src/verify.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

const execFileAsync = promisify(execFile);

let tempDir: string | undefined;

// The suite may itself run under `ledger verify --run`; its own runs must not count as nested.
beforeAll(() => {
  delete process.env.LEDGER_VERIFY_NESTED;
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

const allow = ["npm run **", "LEDGER_UPDATE_CONTRACT=1 npm run **", "node --version", "node *"];

describe("verification command parsing", () => {
  it("splits shell words with quotes and rejects unbalanced quotes", () => {
    expect(splitShellWords('npm run test -- --grep "a b"')).toEqual(["npm", "run", "test", "--", "--grep", "a b"]);
    expect(splitShellWords("node 'x y'")).toEqual(["node", "x y"]);
    expect(splitShellWords('node "unterminated')).toBeUndefined();
    expect(splitShellWords("   ")).toEqual([]);
  });

  it("matches allowlist patterns with single and trailing wildcards", () => {
    expect(isAllowedCommand(["npm", "run", "typecheck"], ["npm run **"])).toBe(true);
    expect(isAllowedCommand(["npm", "run"], ["npm run **"])).toBe(true);
    expect(isAllowedCommand(["npm", "run"], ["npm run *"])).toBe(false);
    expect(isAllowedCommand(["npm", "run", "a", "b"], ["npm run *"])).toBe(false);
    expect(isAllowedCommand(["npm", "publish"], ["npm run **"])).toBe(false);
    expect(isAllowedCommand(["node", "--version"], ["node *"])).toBe(true);
  });

  it("parses backticked commands, environment prefixes, prose, and operators", () => {
    const command = parseVerificationBullet("`LEDGER_UPDATE_CONTRACT=1 npm run test` (245 tests)", allow);
    expect(command).toMatchObject({ raw: "LEDGER_UPDATE_CONTRACT=1 npm run test", env: { LEDGER_UPDATE_CONTRACT: "1" }, argv: ["npm", "run", "test"], allowed: true });
    // An environment assignment no pattern names keeps an otherwise allowed command from running.
    expect(parseVerificationBullet("`NODE_OPTIONS=--require=./evil.js npm run test`", allow)).toMatchObject({
      allowed: false,
      skipReason: "not on verification.allow",
    });
    expect(parseVerificationBullet("`PATH=/tmp/evil npm run test`", allow)).toMatchObject({ allowed: false });
    expect(parseVerificationBullet("`LEDGER_UPDATE_CONTRACT=2 npm run test`", allow)).toMatchObject({ allowed: false });
    expect(parseVerificationBullet("Browser pass in both themes", allow)).toMatchObject({ allowed: false, skipReason: "not a command" });
    expect(parseVerificationBullet("`npm run a && npm run b`", allow)).toMatchObject({ allowed: false, skipReason: "shell operators are not run" });
    expect(parseVerificationBullet("`npm publish`", allow)).toMatchObject({ argv: ["npm", "publish"], allowed: false, skipReason: "not on verification.allow" });
  });

  it("checks commands written with agents.command as Ledger commands and runs bare ledger through it", () => {
    const ledgerAllow = ["ledger validate **", "ledger ready **"];
    expect(parseVerificationBullet("`npx ledger validate`", ledgerAllow, { ledgerCommand: "npx ledger" })).toMatchObject({
      argv: ["npx", "ledger", "validate"],
      allowed: true,
    });
    const pinned = "npx --yes @kylebegeman/ledger@0.8.0";
    expect(parseVerificationBullet(`\`${pinned} ready 0001\``, ledgerAllow, { ledgerCommand: pinned })).toMatchObject({
      argv: ["npx", "--yes", "@kylebegeman/ledger@0.8.0", "ready", "0001"],
      allowed: true,
    });
    expect(parseVerificationBullet("`ledger validate`", ledgerAllow, { ledgerCommand: "node dist/cli.js" })).toMatchObject({
      raw: "ledger validate",
      argv: ["node", "dist/cli.js", "validate"],
      allowed: true,
    });
    expect(parseVerificationBullet("`ledger --local validate`", ["ledger validate **"], { ledgerCommand: "ledger --local" })).toMatchObject({
      argv: ["ledger", "--local", "validate"],
      allowed: true,
    });
    expect(parseVerificationBullet("`npx ledger validate`", ledgerAllow)).toMatchObject({ allowed: false, skipReason: "not on verification.allow" });
    expect(parseVerificationBullet("`npx ledger validate`", ledgerAllow, { ledgerCommand: "ledger" })).toMatchObject({ allowed: false });
    expect(parseVerificationBullet("`npx ledger publish`", ledgerAllow, { ledgerCommand: "npx ledger" })).toMatchObject({ allowed: false });
    expect(parseVerificationBullet("`npx eslint .`", ledgerAllow, { ledgerCommand: "npx ledger" })).toMatchObject({
      argv: ["npx", "eslint", "."],
      allowed: false,
    });
  });

  it("classifies evidence freshness", () => {
    const now = Date.parse("2026-09-16T12:00:00Z");
    const base = { id: "0001", path: ".ledger/entries/0001.md", dirty: false, results: [] };
    expect(evidenceFreshness(undefined, 30, now)).toBe("none");
    expect(evidenceFreshness({ ...base, ranAt: "2026-09-10T00:00:00Z", ok: true }, 30, now)).toBe("fresh");
    expect(evidenceFreshness({ ...base, ranAt: "2026-07-01T00:00:00Z", ok: true }, 30, now)).toBe("stale");
    expect(evidenceFreshness({ ...base, ranAt: "2026-09-15T00:00:00Z", ok: false }, 30, now)).toBe("failed");
  });
});

async function fixtureRepo(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-verify-"));
  await initWorkspace(tempDir);
  const configPath = path.join(tempDir, ".ledger", "config.yaml");
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    config.replace(/verification:\n  allow:\n(?:    - .*\n)+/, `verification:\n  allow:\n${allow.map((pattern) => `    - "${pattern}"`).join("\n")}\n`),
  );
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await writeFile(path.join(tempDir, "src", "a.ts"), "export const a = 1;\n");
  await execFileAsync("git", ["init", "-q"], { cwd: tempDir });
  await execFileAsync("git", ["add", "."], { cwd: tempDir });
  await execFileAsync("git", ["-c", "user.name=t", "-c", "user.email=t@e", "commit", "-qm", "init"], { cwd: tempDir });
  return tempDir;
}

function entry(id: string, bullets: readonly string[]): string {
  return [
    "---",
    `id: "${id}"`,
    'kind: "change"',
    `title: "Entry ${id}"`,
    'date: "2026-09-16"',
    'updated: "2026-09-16"',
    'status: "landed"',
    'areas: ["cli"]',
    'files: ["src/a.ts"]',
    "---",
    "",
    `# ${id}: Entry`,
    "",
    "## Summary",
    "",
    "Summary.",
    "",
    "## Why",
    "",
    "Why.",
    "",
    "## Changed Files",
    "",
    "### src/a.ts",
    "",
    "- What changed: a.",
    "- Anchor: a",
    "- On conflict: keep a.",
    "",
    "## Behavior And UX Impact",
    "",
    "None.",
    "",
    "## Invariants",
    "",
    "- a stays exported.",
    "",
    "## Verification",
    "",
    ...bullets,
    "",
  ].join("\n");
}

describe("ledger verify", () => {
  it("runs allowlisted commands, records evidence, and surfaces freshness", async () => {
    const root = await fixtureRepo();
    await writeFile(path.join(root, ".ledger/entries/0001-pass.md"), entry("0001", ["- `node --version`", "- Reviewed by hand", "- `npm publish`"]));
    await writeFile(path.join(root, ".ledger/entries/0002-fail.md"), entry("0002", ["- `node --definitely-not-a-flag`"]));
    const workspace = await findWorkspace(root);
    const documents = await readLedgerDocuments(workspace);

    const listed = await runVerification(workspace, documents, { targets: ["0001"], run: false });
    expect(listed.ran).toBe(false);
    expect(listed.records[0]?.freshness).toBe("none");
    expect(listed.records[0]?.commands.map((command) => command.allowed)).toEqual([true, false, false]);

    const report = await runVerification(workspace, documents, { all: true, run: true, timeoutMs: 60_000 });
    expect(report.ok).toBe(false);
    expect(report.records.map((record) => [record.id, record.freshness, record.ran])).toEqual([
      ["0001", "fresh", true],
      ["0002", "failed", true],
    ]);
    const passing = report.records[0]?.evidence;
    expect(passing?.ok).toBe(true);
    expect(passing?.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(passing?.results.map((result) => [result.ok, result.skipped ?? null])).toEqual([
      [true, null],
      [true, "not a command"],
      [true, "not on verification.allow"],
    ]);
    expect(passing?.results[0]?.exitCode).toBe(0);
    expect(passing?.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
    const failing = report.records[1]?.evidence;
    expect(failing?.ok).toBe(false);
    expect(failing?.results[0]?.exitCode).not.toBe(0);

    const stored = await readEvidence(workspace);
    expect(Object.keys(stored.entries)).toEqual(["0001", "0002"]);
    expect(await readFile(path.join(root, ".ledger/reports/evidence.json"), "utf8")).toContain('"version": 1');

    const stale = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));
    expect(stale.issues.filter((issue) => issue.kind === "stale-verification").map((issue) => issue.target)).toEqual(["0002"]);

    const doctor = await runDoctor(workspace, documents, validateDocuments(workspace, documents));
    const check = doctor.checks.find((candidate) => candidate.name === "verification");
    expect(check?.level).toBe("warn");
    expect(check?.message).toContain("1 fresh, 0 stale, 1 failed, 0 without evidence");

    const packet = buildAgentPacket(documents, "src/a.ts", { evidence: stored });
    expect(packet.entries.map((item) => [item.id, item.verificationStatus])).toEqual([["0001", "fresh"], ["0002", "failed"]]);

    const model = buildStaticReaderModel(workspace, documents, { evidence: stored });
    const rendered = model.documents.find((document) => document.id === "0001");
    expect(rendered?.verificationStatus).toBe("fresh");
    expect(rendered?.verifiedCommit).toBe(passing?.commit);
    expect(buildStaticReaderModel(workspace, documents).documents[0]?.verificationStatus).toBe("none");
  });

  it("runs bare ledger bullets through agents.command and accepts bullets written with it", async () => {
    const root = await fixtureRepo();
    const configPath = path.join(root, ".ledger", "config.yaml");
    const config = (await readFile(configPath, "utf8")).replace(
      /verification:\n  allow:\n(?:    - .*\n)+/,
      'verification:\n  allow:\n    - "ledger validate **"\n',
    );
    await writeFile(configPath, renderConfigWithAgentsCommand(config, "node fake-ledger.mjs"));
    await writeFile(
      path.join(root, "fake-ledger.mjs"),
      'import { appendFileSync } from "node:fs";\nappendFileSync("calls.txt", process.argv.slice(2).join(" ") + "\\n");\n',
    );
    await writeFile(
      path.join(root, ".ledger/entries/0001-pass.md"),
      entry("0001", ["- `ledger validate`", "- `node fake-ledger.mjs validate --strict`", "- `ledger publish`"]),
    );
    const workspace = await findWorkspace(root);
    const report = await runVerification(workspace, await readLedgerDocuments(workspace), { targets: ["0001"], run: true, timeoutMs: 60_000 });
    expect(report.records[0]?.evidence?.results.map((result) => [result.command, result.ok, result.skipped ?? null])).toEqual([
      ["ledger validate", true, null],
      ["node fake-ledger.mjs validate --strict", true, null],
      ["ledger publish", true, "not on verification.allow"],
    ]);
    expect(await readFile(path.join(root, "calls.txt"), "utf8")).toBe("validate\nvalidate --strict\n");
  }, 30_000);

  it("ages evidence out and rejects a corrupt sidecar", async () => {
    const root = await fixtureRepo();
    await writeFile(path.join(root, ".ledger/entries/0001-pass.md"), entry("0001", ["- `node --version`"]));
    const workspace = await findWorkspace(root);
    await writeEvidence(workspace, {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: {
        "0001": { id: "0001", path: ".ledger/entries/0001-pass.md", dirty: false, ranAt: "2026-01-01T00:00:00.000Z", ok: true, results: [] },
      },
    });
    const documents = await readLedgerDocuments(workspace);
    const report = await runVerification(workspace, documents, { targets: ["0001"], run: false });
    expect(report.records[0]?.freshness).toBe("stale");
    const stale = await detectStaleKnowledge(workspace, documents, validateDocuments(workspace, documents));
    expect(stale.issues.some((issue) => issue.kind === "stale-verification" && issue.message.includes("older than"))).toBe(true);

    process.env.LEDGER_VERIFY_NESTED = "1";
    try {
      await expect(runVerification(workspace, documents, { targets: ["0001"], run: true })).rejects.toThrow(/started by another verify run/);
    } finally {
      delete process.env.LEDGER_VERIFY_NESTED;
    }

    await writeFile(path.join(root, ".ledger/reports/evidence.json"), '{"version": 2}');
    await expect(readEvidence(workspace)).rejects.toThrow(/not a Ledger evidence index/);
    await expect(runVerification(workspace, documents, { targets: ["0404"], run: false })).rejects.toThrow(/not found/);
  });

  it("selects working-tree entries by default and prints a report from the CLI", async () => {
    const root = await fixtureRepo();
    await writeFile(path.join(root, ".ledger/entries/0001-pass.md"), entry("0001", ["- `node --version`"]));
    const none = await captureRun(["verify"], root);
    expect(none.exitCode).toBe(0);
    expect(none.stdout).toContain("1 entry, 0 failed");
    expect(none.stdout).toContain("- `node --version`: runnable");

    const ran = await captureRun(["verify", "--run", "--json"], root);
    expect(ran.exitCode).toBe(0);
    const data = JSON.parse(ran.stdout).data;
    expect(data.ran).toBe(true);
    expect(data.records[0]).toMatchObject({ id: "0001", freshness: "fresh" });

    const text = await captureRun(["verify", "0001"], root);
    expect(text.stdout).toContain("fresh, ran ");
    expect(text.stdout).toContain(": ok in ");
    expect(text.stdout).toContain("Evidence: .ledger/reports/evidence.json");

    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["-c", "user.name=t", "-c", "user.email=t@e", "commit", "-qm", "receipt"], { cwd: root });
    const clean = await captureRun(["verify"], root);
    expect(clean.stdout).toContain("no change entries selected");
  }, 30_000);
});

async function captureRun(argv: readonly string[], cwd: string): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };
  try {
    const exitCode = await run([...argv], { cwd });
    return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
