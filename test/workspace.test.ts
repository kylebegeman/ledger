import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig } from "../src/config.js";
import { docsStartHereMarker } from "../src/docs.js";
import { LedgerError } from "../src/machine.js";
import {
  gitignoreBlockEnd,
  gitignoreBlockStart,
  initWorkspace,
  ledgerOwnedDocsRouting,
  replaceGitignoreBlock,
} from "../src/workspace.js";

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

    expect(result).toMatchObject({
      routing: { startHere: "docs/llm/START_HERE.md", manifest: "docs/llm/manifest.json" },
      routingFilesDetected: false,
      configWritten: true,
    });
    await expectPath(".ledger/config.yaml");
    await expectPath(".ledger/templates/change.md");
    await expectPath(".ledger/templates/backlog.md");
    await expectPath(".ledger/templates/decision.md");
    await expectPath(".ledger/templates/release.md");
    await expect(access(path.join(tempDir, ".ledger/policies"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(result.gitignore).toEqual({ path: ".gitignore", changed: true, created: true });
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

    expect(result).toMatchObject({
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

    expect(result).toMatchObject({
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

    expect(result).toMatchObject({
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

    expect(result).toMatchObject({
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

    expect(result).toMatchObject({
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

    expect(result).toMatchObject({
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

describe("gitignore block", () => {
  const derivedEntries = [
    ".ledger/indexes/*.json",
    ".ledger/reports/*.md",
    ".ledger/dist/",
    ".ledger/cache/",
    ".ledger/transactions/",
    ".ledger/write.lock",
    ".ledger/daemon.json",
  ];
  const expectedBlock = [gitignoreBlockStart, ...derivedEntries, gitignoreBlockEnd].join("\n");

  it("creates the marked block once and leaves it byte-identical on a second run", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-gitignore-test-"));

    const first = await initWorkspace(tempDir);
    const gitignorePath = path.join(tempDir, ".gitignore");
    const written = await readFile(gitignorePath, "utf8");
    expect(first.gitignore).toEqual({ path: ".gitignore", changed: true, created: true });
    expect(written).toBe(`${expectedBlock}\n`);

    const second = await initWorkspace(tempDir);
    expect(second.gitignore).toEqual({ path: ".gitignore", changed: false, created: false });
    expect(await readFile(gitignorePath, "utf8")).toBe(written);
  });

  it("preserves existing lines and replaces a stale block in place", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-gitignore-test-"));
    const gitignorePath = path.join(tempDir, ".gitignore");
    await writeFile(gitignorePath, "node_modules/\n.env\n\n", "utf8");

    const result = await initWorkspace(tempDir);
    expect(result.gitignore).toEqual({ path: ".gitignore", changed: true, created: false });
    expect(await readFile(gitignorePath, "utf8")).toBe(`node_modules/\n.env\n\n${expectedBlock}\n`);

    await writeFile(
      gitignorePath,
      `node_modules/\n${gitignoreBlockStart}\n.ledger/old/\n${gitignoreBlockEnd}\n.env\n`,
      "utf8",
    );
    const replaced = await initWorkspace(tempDir);
    expect(replaced.gitignore.changed).toBe(true);
    expect(await readFile(gitignorePath, "utf8")).toBe(`node_modules/\n${expectedBlock}\n.env\n`);
  });

  it("throws on an unbalanced marker", () => {
    expect(() => replaceGitignoreBlock(`dist/\n${gitignoreBlockStart}\n`, expectedBlock)).toThrow(LedgerError);
    expect(() => replaceGitignoreBlock(`${gitignoreBlockEnd}\n`, expectedBlock)).toThrow(
      /unbalanced Ledger gitignore block/,
    );
    expect(replaceGitignoreBlock("", expectedBlock)).toBe(`${expectedBlock}\n`);
  });

  it("fails before writing anything when .gitignore has a stray marker or is not a file", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-gitignore-test-"));
    await writeFile(path.join(tempDir, ".gitignore"), `${gitignoreBlockEnd}\n`, "utf8");
    await expect(initWorkspace(tempDir)).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(access(path.join(tempDir, ".ledger"))).rejects.toMatchObject({ code: "ENOENT" });

    await rm(path.join(tempDir, ".gitignore"));
    await mkdir(path.join(tempDir, ".gitignore"));
    await expect(initWorkspace(tempDir)).rejects.toMatchObject({
      code: "filesystem-error",
      details: { path: ".gitignore", systemCode: "EISDIR" },
    });
    await expect(access(path.join(tempDir, ".ledger"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("initWorkspace scaffolding options", () => {
  it("leaves an existing docs tree alone apart from docs/llm routing files", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-docs-test-"));
    await mkdir(path.join(tempDir, "docs", "architecture"), { recursive: true });
    await writeFile(path.join(tempDir, "docs", "README.md"), "# Curated docs\n", "utf8");
    await writeFile(path.join(tempDir, "docs", "architecture", "overview.md"), "# Overview\n", "utf8");

    await initWorkspace(tempDir, { withDocs: true });

    for (const folder of ["api", "guides", "reference", "product", "operations"]) {
      await expect(access(path.join(tempDir, "docs", folder))).rejects.toMatchObject({ code: "ENOENT" });
    }
    expect(await readFile(path.join(tempDir, "docs", "README.md"), "utf8")).toBe("# Curated docs\n");
    await expectPath("docs/llm/START_HERE.md");
    await expectPath("docs/llm/manifest.json");

    const curated = "# Hand-edited router\n";
    await writeFile(path.join(tempDir, "docs", "llm", "START_HERE.md"), curated, "utf8");
    await initWorkspace(tempDir, { withDocs: true });
    expect(await readFile(path.join(tempDir, "docs", "llm", "START_HERE.md"), "utf8")).toBe(curated);
  });

  it("serializes coverage any and detection values into a parseable config", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-init-detection-test-"));
    const detection = {
      coverageRoots: [".github/**", "cmd/**", "Makefile", "go.mod"],
      ignore: [".ledger/indexes/**", "*_templ.go", "**/*_templ.go", "internal/store/db/**"],
      verificationAllow: ["go test **", "make check", "npx --yes @kylebegeman/ledger@0.7.0 ci **"],
    };

    await initWorkspace(tempDir, { coverage: "any", detection });

    const configPath = path.join(tempDir, ".ledger", "config.yaml");
    const raw = await readFile(configPath, "utf8");
    expect(raw).toContain("  coverage: any\n");
    expect(raw).toContain('    - "**/*_templ.go"\n');
    expect(raw).toContain('    - "npx --yes @kylebegeman/ledger@0.7.0 ci **"\n');
    const config = await readLedgerConfig(configPath);
    expect(config.git.coverage).toBe("any");
    expect(config.git.requireEntryFor).toEqual(detection.coverageRoots);
    expect(config.git.ignore).toEqual(detection.ignore);
    expect(config.verification.allow).toEqual(detection.verificationAllow);
  });
});

async function expectPath(relativePath: string): Promise<void> {
  if (!tempDir) throw new Error("missing tempDir");
  await expect(access(path.join(tempDir, relativePath))).resolves.toBeUndefined();
}
