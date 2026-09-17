import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerDocuments } from "../src/documents.js";
import { formatDoctorResult, runDoctor, type LedgerDoctorCheck } from "../src/doctor.js";
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
