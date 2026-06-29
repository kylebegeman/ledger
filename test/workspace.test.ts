import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("initWorkspace", () => {
  it("creates Ledger templates and optional docs structure", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-test-"));

    await initWorkspace(tempDir, { withDocs: true });

    await expectPath(".ledger/config.yaml");
    await expectPath(".ledger/templates/change.md");
    await expectPath(".ledger/templates/backlog.md");
    await expectPath(".ledger/templates/decision.md");
    await expectPath(".ledger/templates/release.md");
    await expectPath(".ledger/policies/coverage.yaml");
    await expectPath("docs/README.md");
    await expectPath("docs/llm/START_HERE.md");
    await expectPath("docs/llm/manifest.json");
  });
});

async function expectPath(relativePath: string): Promise<void> {
  if (!tempDir) throw new Error("missing tempDir");
  await expect(access(path.join(tempDir, relativePath))).resolves.toBeUndefined();
}
