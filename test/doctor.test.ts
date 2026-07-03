import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerDocuments } from "../src/documents.js";
import { formatDoctorResult, runDoctor } from "../src/doctor.js";
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
      "validation",
      "docs",
      "indexes",
      "render",
      "render-budget",
      "stale-knowledge",
    ]);
    expect(formatDoctorResult(result)).toContain("Ledger doctor: passed.");
  });
});
