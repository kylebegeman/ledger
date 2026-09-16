import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { docsStartHereMarker } from "../src/docs.js";
import { initWorkspace, ledgerOwnedDocsRouting } from "../src/workspace.js";

const curatedStartHere = "# Start here\n\n## Quick facts\n";
const curatedManifest = `${JSON.stringify({ version: 1, repo: "kore" }, null, 2)}\n`;

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

    const result = await initWorkspace(tempDir, { withDocs: true });

    expect(result).toEqual({
      routing: { startHere: "docs/llm/START_HERE.md", manifest: "docs/llm/manifest.json" },
      routingFilesDetected: false,
      configWritten: true,
    });
    await expectPath(".ledger/config.yaml");
    await expectPath(".ledger/templates/change.md");
    await expectPath(".ledger/templates/backlog.md");
    await expectPath(".ledger/templates/decision.md");
    await expectPath(".ledger/templates/release.md");
    await expectPath(".ledger/policies/coverage.yaml");
    await expectPath("docs/README.md");
    await expectPath("docs/llm/START_HERE.md");
    await expectPath("docs/llm/manifest.json");
    expect(await readFile(path.join(tempDir, "docs/llm/START_HERE.md"), "utf8")).toMatch(
      /^<!-- ledger:docs:start-here -->/,
    );
    const config = await readFile(path.join(tempDir, ".ledger/config.yaml"), "utf8");
    expect(config).toContain("    startHere: docs/llm/START_HERE.md");
    expect(config).toContain("sessions:\n  expiresInDays: 7\nagents:\n  command: ledger\nvalidation:\n");
  });

  it("points docs.routing at Ledger-owned paths when curated routing files exist", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-test-"));
    await mkdir(path.join(tempDir, "docs", "llm"), { recursive: true });
    await writeFile(path.join(tempDir, "docs/llm/START_HERE.md"), curatedStartHere);
    await writeFile(path.join(tempDir, "docs/llm/manifest.json"), curatedManifest);

    const result = await initWorkspace(tempDir, { withDocs: true, adoption: "partial" });

    expect(result).toEqual({
      routing: ledgerOwnedDocsRouting,
      routingFilesDetected: true,
      configWritten: true,
    });
    const configPath = path.join(tempDir, ".ledger", "config.yaml");
    const config = await readFile(configPath, "utf8");
    expect(config).toContain(
      "  # Existing docs/llm routing files are curated; Ledger writes derived routing here.",
    );
    expect(config).toContain("    startHere: .ledger/reports/docs-start-here.md");
    expect(config).toContain("    manifest: .ledger/indexes/docs-routing.json");
    expect(await readFile(path.join(tempDir, "docs/llm/START_HERE.md"), "utf8")).toBe(curatedStartHere);
    expect(await readFile(path.join(tempDir, "docs/llm/manifest.json"), "utf8")).toBe(curatedManifest);
    expect((await readLedgerConfig(configPath)).docs.routing).toEqual(ledgerOwnedDocsRouting);
  });

  it("does not scaffold the missing sibling when one curated routing file exists", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-test-"));
    await mkdir(path.join(tempDir, "docs", "llm"), { recursive: true });
    await writeFile(path.join(tempDir, "docs/llm/START_HERE.md"), curatedStartHere);

    const result = await initWorkspace(tempDir, { withDocs: true });

    expect(result).toEqual({
      routing: ledgerOwnedDocsRouting,
      routingFilesDetected: true,
      configWritten: true,
    });
    await expect(access(path.join(tempDir, "docs/llm/manifest.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(path.join(tempDir, "docs/llm/START_HERE.md"), "utf8")).toBe(curatedStartHere);
  });

  it("keeps the docs/llm routing pair when the existing files are Ledger-generated", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-test-"));
    await mkdir(path.join(tempDir, "docs", "llm"), { recursive: true });
    await writeFile(
      path.join(tempDir, "docs/llm/START_HERE.md"),
      `${docsStartHereMarker}\n\n# LLM Start Here\n`,
    );
    await writeFile(
      path.join(tempDir, "docs/llm/manifest.json"),
      `${JSON.stringify({ version: 1, generatedBy: "ledger", routes: [] }, null, 2)}\n`,
    );

    const result = await initWorkspace(tempDir, { withDocs: true });

    expect(result).toEqual({
      routing: { startHere: "docs/llm/START_HERE.md", manifest: "docs/llm/manifest.json" },
      routingFilesDetected: false,
      configWritten: true,
    });
    expect(await readFile(path.join(tempDir, ".ledger/config.yaml"), "utf8")).not.toContain(
      "curated",
    );
  });

  it("treats an unreadable routing path as curated", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-test-"));
    await mkdir(path.join(tempDir, "docs", "llm", "START_HERE.md"), { recursive: true });

    const result = await initWorkspace(tempDir, { withDocs: true });

    expect(result).toEqual({
      routing: ledgerOwnedDocsRouting,
      routingFilesDetected: true,
      configWritten: true,
    });
    await expect(access(path.join(tempDir, "docs/llm/manifest.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not follow a symlinked routing path when detecting curated files", async () => {
    if (process.platform === "win32") return;
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-test-"));
    const outside = path.join(tempDir, "outside-start-here.md");
    await writeFile(outside, `${docsStartHereMarker}\n\n# Generated elsewhere\n`);
    await mkdir(path.join(tempDir, "docs", "llm"), { recursive: true });
    await symlink(outside, path.join(tempDir, "docs", "llm", "START_HERE.md"));

    const result = await initWorkspace(tempDir, { withDocs: true });

    expect(result).toEqual({
      routing: ledgerOwnedDocsRouting,
      routingFilesDetected: true,
      configWritten: true,
    });
    expect(await readLedgerConfig(path.join(tempDir, ".ledger", "config.yaml"))).toMatchObject({
      docs: { routing: ledgerOwnedDocsRouting },
    });
  });

  it("reports the configured routing and leaves config alone on an existing workspace", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-test-"));
    const configPath = path.join(tempDir, ".ledger", "config.yaml");
    await initWorkspace(tempDir, { withDocs: true });
    const originalConfig = await readFile(configPath, "utf8");
    await writeFile(path.join(tempDir, "docs/llm/START_HERE.md"), curatedStartHere);

    const result = await initWorkspace(tempDir, { withDocs: true });

    expect(result).toEqual({
      routing: { startHere: "docs/llm/START_HERE.md", manifest: "docs/llm/manifest.json" },
      routingFilesDetected: true,
      configWritten: false,
    });
    expect(await readFile(configPath, "utf8")).toBe(originalConfig);
    expect(await readFile(path.join(tempDir, "docs/llm/START_HERE.md"), "utf8")).toBe(
      curatedStartHere,
    );
  });

  it("quotes project directory names when creating YAML config", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "ledger-init-name-test-"));
    tempDir = parent;
    const project = path.join(parent, "project #fixture");
    await mkdir(project);

    await initWorkspace(project);

    expect(await readFile(path.join(project, ".ledger", "config.yaml"), "utf8"))
      .toContain('project: "project #fixture"');
  });
});

async function expectPath(relativePath: string): Promise<void> {
  if (!tempDir) throw new Error("missing tempDir");
  await expect(access(path.join(tempDir, relativePath))).resolves.toBeUndefined();
}
