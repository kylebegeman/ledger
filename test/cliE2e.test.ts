import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("CLI end-to-end", () => {
  it("runs a complete project workflow in a temp workspace", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-e2e-"));

    expect((await captureRun(["init", "--with-docs"], tempDir)).exitCode).toBe(0);
    expect(await exists(path.join(tempDir, ".ledger", "config.yaml"))).toBe(true);
    expect(await exists(path.join(tempDir, "docs", "llm", "START_HERE.md"))).toBe(true);

    const created = await captureRun(
      ["new", "Fixture change", "--area", "cli", "--status", "landed"],
      tempDir,
    );
    expect(created.exitCode).toBe(0);
    expect(created.stdout).toContain(".ledger/entries/0001-fixture-change.md");

    expect((await captureRun(["validate"], tempDir)).exitCode).toBe(0);
    expect((await captureRun(["index"], tempDir)).exitCode).toBe(0);
    expect(await exists(path.join(tempDir, ".ledger", "indexes", "manifest.json"))).toBe(
      true,
    );

    expect((await captureRun(["render"], tempDir)).exitCode).toBe(0);
    expect(await exists(path.join(tempDir, ".ledger", "dist", "index.html"))).toBe(true);
    expect(await exists(path.join(tempDir, ".ledger", "dist", "search-index.json"))).toBe(true);
    expect(await exists(path.join(tempDir, ".ledger", "dist", "graph.json"))).toBe(true);

    const query = await captureRun(["query", "--kind", "change", "--area", "cli"], tempDir);
    expect(query.exitCode).toBe(0);
    expect(query.stdout).toContain("Fixture change");

    const search = await captureRun(["search", "fixture", "--limit", "1"], tempDir);
    expect(search.exitCode).toBe(0);
    expect(search.stdout).toContain("Ledger search: 1 match(es).");
    expect(search.stdout).toContain("Fixture change");

    const searchJson = await captureRun(["search", "fixture", "--limit", "1", "--json"], tempDir);
    expect(JSON.parse(searchJson.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "search",
      data: { query: "fixture", matches: [expect.objectContaining({ id: "0001" })] },
    });

    const searchPacket = await captureRun(
      ["search-packet", "fixture", "--limit=1", "--budget=1200"],
      tempDir,
    );
    expect(searchPacket.exitCode).toBe(0);
    expect(searchPacket.stdout).toContain("# Ledger Agent Packet");
    expect(searchPacket.stdout).toContain("Fixture change");

    const classify = await captureRun(
      ["docs", "classify", "docs/llm/START_HERE.md"],
      tempDir,
    );
    expect(classify.exitCode).toBe(0);
    expect(classify.stdout).toContain("routing: docs/llm/START_HERE.md");

    const feedback = await captureRun(
      ["feedback", "Dogfood finding", "--area", "product", "--tag", "dogfood"],
      tempDir,
    );
    expect(feedback.exitCode).toBe(0);
    expect(await readFile(path.join(tempDir, ".ledger", "entries", "0002-dogfood-finding.md"), "utf8")).toContain(
      'kind: "product-note"',
    );

    const agents = await captureRun(["agents", "--role", "reviewer"], tempDir);
    expect(agents.exitCode).toBe(0);
    expect(agents.stdout).toContain("Ledger Workflow For Agents");
    expect(agents.stdout).toContain("ledger doctor");

    const doctor = await captureRun(["doctor"], tempDir);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("Ledger doctor: passed.");
    expect(doctor.stdout).toContain("performance");

    const metrics = await captureRun(["metrics"], tempDir);
    expect(metrics.exitCode).toBe(0);
    expect(metrics.stdout).toContain("Ledger metrics: passed");

    const stale = await captureRun(["stale"], tempDir);
    expect(stale.exitCode).toBe(0);
    expect(stale.stdout).toContain("Ledger Stale Knowledge Report");

    expect((await captureRun(["ci"], tempDir)).exitCode).toBe(0);
  });

  it("does not assign entries when release write preflight fails", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-e2e-"));
    expect((await captureRun(["init"], tempDir)).exitCode).toBe(0);
    const created = await captureRun(
      ["new", "Release candidate", "--status", "landed"],
      tempDir,
    );
    expect(created.exitCode).toBe(0);
    const entryPath = path.join(tempDir, ".ledger", "entries", "0001-release-candidate.md");
    await writeFile(path.join(tempDir, ".ledger", "releases", "v1.0.0.md"), releaseRecord());

    const release = await captureRun(
      ["release", "v1.0.0", "--include-unreleased", "--assign", "--write"],
      tempDir,
    );

    expect(release.exitCode).toBe(2);
    expect(release.stderr).toContain("Release document already exists");
    expect(await readFile(entryPath, "utf8")).not.toContain('release: "v1.0.0"');
  });

  it("emits machine-readable JSON errors for operational failures", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-e2e-"));

    const result = await captureRun(["validate", "--json"], tempDir);
    const payload = JSON.parse(result.stdout) as {
      readonly ok: boolean;
      readonly error: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(false);
    expect(payload).toMatchObject({ schemaVersion: 1, command: "validate" });
    expect(payload.error.code).toBe("workspace-not-found");

    expect((await captureRun(["init"], tempDir)).exitCode).toBe(0);
    await writeFile(path.join(tempDir, ".ledger", "config.yaml"), "project: [broken\n", "utf8");
    const invalidConfig = JSON.parse(
      (await captureRun(["validate", "--json"], tempDir)).stdout,
    );
    expect(invalidConfig).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "validate",
      error: { code: "invalid-yaml" },
    });
  });

  it("uses the failure envelope for invalid command arguments", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-e2e-"));
    const result = await captureRun(["search", "--json"], tempDir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "search",
      error: { code: "invalid-argument" },
    });

    expect((await captureRun(["init"], tempDir)).exitCode).toBe(0);
    const invalidProfile = await captureRun(
      ["render", "--profile", "external", "--json"],
      tempDir,
    );
    expect(invalidProfile.exitCode).toBe(2);
    expect(JSON.parse(invalidProfile.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "render",
      error: { code: "invalid-argument" },
    });

    const unknownOption = await captureRun(
      ["render", "--profle", "public", "--json"],
      tempDir,
    );
    expect(unknownOption.exitCode).toBe(2);
    expect(JSON.parse(unknownOption.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "render",
      error: { code: "invalid-argument", message: expect.stringContaining("--profle") },
    });

    const invalidLimit = await captureRun(
      ["search", "fixture", "--limit", "many", "--json"],
      tempDir,
    );
    expect(invalidLimit.exitCode).toBe(2);
    expect(JSON.parse(invalidLimit.stdout)).toMatchObject({
      ok: false,
      error: { code: "invalid-argument", message: "--limit must be a positive integer" },
    });
  });

  it("does not consume positionals after boolean flags", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-args-"));
    expect((await captureRun(["init"], tempDir)).exitCode).toBe(0);
    expect((await captureRun(["new", "Boolean flag fixture"], tempDir)).exitCode).toBe(0);

    const result = await captureRun(["search", "--json", "Boolean flag"], tempDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "search",
      data: { matches: [expect.objectContaining({ id: "0001" })] },
    });
  });

  it("checks integrity without replacing a mismatched baseline", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-integrity-"));
    expect((await captureRun(["init"], tempDir)).exitCode).toBe(0);
    expect((await captureRun(["new", "Integrity fixture"], tempDir)).exitCode).toBe(0);
    expect((await captureRun(["verify-integrity"], tempDir)).exitCode).toBe(0);
    const entryPath = path.join(tempDir, ".ledger", "entries", "0001-integrity-fixture.md");
    await writeFile(entryPath, `${await readFile(entryPath, "utf8")}\nChanged after baseline.\n`);

    const result = await captureRun(["verify-integrity", "--check", "--json"], tempDir);
    const payload = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(1);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "verify-integrity",
      data: {
        verification: {
          ok: false,
          changed: [".ledger/entries/0001-integrity-fixture.md"],
        },
      },
    });
  });

  it("emits machine-readable JSON errors for unknown commands", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-cli-e2e-"));

    const result = await captureRun(["not-a-command", "--json"], tempDir);
    const payload = JSON.parse(result.stdout) as {
      readonly ok: boolean;
      readonly error: { readonly code: string; readonly message: string };
    };

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(payload).toMatchObject({ schemaVersion: 1, command: "not-a-command" });
    expect(payload.error.code).toBe("unknown-command");
  });
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function releaseRecord(): string {
  return `---
id: "v1.0.0"
kind: "release"
title: "Ledger v1.0.0"
date: "2026-06-29"
updated: "2026-06-29"
status: "released"
areas: ["release"]
entries: []
---

# Ledger v1.0.0

## Summary

Existing release.

## Public Notes

- None.

## Changes

- None.

## Verification

- npm test

## Known Issues

- None.
`;
}

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
    return {
      exitCode,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
