import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  currentConfigVersion,
  migrateLedgerConfigObject,
  parseLedgerConfig,
  readLedgerConfig,
} from "../src/config.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("parseLedgerConfig", () => {
  it("merges valid partial config with defaults", () => {
    const config = parseLedgerConfig(
      {
        project: "fixture",
        docs: {
          managed: true,
        },
        git: {
          requireEntryFor: ["src/**"],
        },
        render: {
          budgets: {
            maxSearchIndexBytes: 12345,
          },
        },
        performance: {
          budgets: {
            maxReadMs: 250,
          },
        },
      },
      "fixture.yaml",
    );

    expect(config.project).toBe("fixture");
    expect(config.validation.profile).toBe("standard");
    expect(config.docs.managed).toBe(true);
    expect(config.docs.root).toBe("docs");
    expect(config.git.requireEntryFor).toEqual(["src/**"]);
    expect(config.git.ignore).toContain("dist/**");
    expect(config.render.budgets.maxHtmlBytes).toBe(1_000_000);
    expect(config.render.budgets.maxSearchIndexBytes).toBe(12345);
    expect(config.performance.budgets.maxReadMs).toBe(250);
    expect(config.performance.budgets.maxTotalMs).toBe(4_000);
    expect(config.limits.maxDocuments).toBe(10_000);
    expect(config.limits.maxDocumentBytes).toBe(2_000_000);
  });

  it("migrates legacy version 0 config before merging defaults", () => {
    const config = parseLedgerConfig(
      {
        version: 0,
        project: "legacy",
        docs: {
          managed: true,
        },
      },
      "fixture.yaml",
    );

    expect(config.version).toBe(currentConfigVersion);
    expect(config.docs.adoption).toBe("managed");
  });

  it("reports config migrations without mutating the source object", () => {
    const source = {
      version: 0,
      docs: {
        managed: false,
      },
    };
    const result = migrateLedgerConfigObject(source, "fixture.yaml");

    expect(result.config.version).toBe(1);
    expect((result.config.docs as { adoption?: string }).adoption).toBe("partial");
    expect(result.migrations).toEqual([
      {
        fromVersion: 0,
        toVersion: 1,
        description: "Add explicit config version and docs adoption defaults.",
      },
    ]);
    expect(source.version).toBe(0);
    expect(source.docs).toEqual({ managed: false });
  });

  it("normalizes configured paths and glob patterns", () => {
    const config = parseLedgerConfig(
      {
        source: {
          entries: ".\\.ledger\\entries",
        },
        docs: {
          root: ".\\docs",
          routing: {
            startHere: ".\\docs\\llm\\START_HERE.md",
          },
        },
        git: {
          requireEntryFor: [".\\src\\**"],
          ignore: [".\\dist\\**"],
        },
      },
      "fixture.yaml",
    );

    expect(config.source.entries).toBe(".ledger/entries");
    expect(config.docs.root).toBe("docs");
    expect(config.docs.routing.startHere).toBe("docs/llm/START_HERE.md");
    expect(config.git.requireEntryFor).toEqual(["src/**"]);
    expect(config.git.ignore).toEqual(["dist/**"]);
  });

  it("rejects non-object config", () => {
    expect(() => parseLedgerConfig([], "fixture.yaml")).toThrow(
      "fixture.yaml: config must be a YAML object",
    );
  });

  it("rejects config versions newer than this package supports", () => {
    expect(() =>
      parseLedgerConfig(
        {
          version: currentConfigVersion + 1,
        },
        "fixture.yaml",
      ),
    ).toThrow("fixture.yaml: version 2 is newer than supported version 1");
  });

  it("rejects malformed nested config", () => {
    expect(() =>
      parseLedgerConfig(
        {
          docs: "docs",
        },
        "fixture.yaml",
      ),
    ).toThrow("fixture.yaml: docs must be an object");
  });

  it("rejects arrays with non-string values", () => {
    expect(() =>
      parseLedgerConfig(
        {
          git: {
            requireEntryFor: ["src/**", 42],
          },
        },
        "fixture.yaml",
      ),
    ).toThrow("fixture.yaml: git.requireEntryFor must be an array of strings");
  });

  it("rejects empty required section lists after merge", () => {
    expect(() =>
      parseLedgerConfig(
        {
          validation: {
            requiredSections: {
              change: [],
            },
          },
        },
        "fixture.yaml",
      ),
    ).toThrow("fixture.yaml: validation.requiredSections.change must not be empty");
  });

  it("rejects invalid render budgets", () => {
    expect(() =>
      parseLedgerConfig(
        {
          render: {
            budgets: {
              maxTotalBytes: 0,
            },
          },
        },
        "fixture.yaml",
      ),
    ).toThrow("fixture.yaml: render.budgets.maxTotalBytes must be a positive number");
  });

  it("rejects invalid performance budgets", () => {
    expect(() =>
      parseLedgerConfig(
        {
          performance: {
            budgets: {
              maxTotalMs: 0,
            },
          },
        },
        "fixture.yaml",
      ),
    ).toThrow("fixture.yaml: performance.budgets.maxTotalMs must be a positive number");
  });

  it("rejects paths that can escape the project", () => {
    expect(() =>
      parseLedgerConfig(
        {
          reports: { output: "../../outside" },
        },
        "fixture.yaml",
      ),
    ).toThrow("reports.output must stay inside the project root");

    expect(() =>
      parseLedgerConfig(
        {
          docs: { root: "/tmp/docs" },
        },
        "fixture.yaml",
      ),
    ).toThrow("docs.root must stay inside the project root");

    expect(() =>
      parseLedgerConfig(
        {
          source: { decisions: "../decisions" },
        },
        "fixture.yaml",
      ),
    ).toThrow("source.decisions must stay inside the project root");

    expect(() =>
      parseLedgerConfig(
        {
          git: { ignore: ["../secret/**"] },
        },
        "fixture.yaml",
      ),
    ).toThrow("git.ignore must stay inside the project root");
  });

  it("does not treat the project display name as a filesystem path", () => {
    expect(parseLedgerConfig({ project: "." }, "fixture.yaml").project).toBe(".");
  });

  it("rejects invalid document resource limits", () => {
    expect(() =>
      parseLedgerConfig(
        {
          limits: { maxDocuments: 0 },
        },
        "fixture.yaml",
      ),
    ).toThrow("limits.maxDocuments must be a positive integer");

    expect(() =>
      parseLedgerConfig(
        {
          limits: { maxDirectoryDepth: 1.5 },
        },
        "fixture.yaml",
      ),
    ).toThrow("limits.maxDirectoryDepth must be a positive integer");
  });

  it("rejects invalid validation profiles", () => {
    expect(() =>
      parseLedgerConfig(
        {
          validation: {
            profile: "relaxed",
          },
        },
        "fixture.yaml",
      ),
    ).toThrow("fixture.yaml: validation.profile must be standard or strict");
  });

  it("prefixes YAML parse errors with the config path", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ledger-config-test-"));
    const configPath = path.join(tempDir, "config.yaml");
    await writeFile(configPath, "project: [broken\n", "utf8");

    await expect(readLedgerConfig(configPath)).rejects.toThrow(
      `${configPath}: invalid YAML:`,
    );
  });
});
