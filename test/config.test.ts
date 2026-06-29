import { describe, expect, it } from "vitest";
import { parseLedgerConfig } from "../src/config.js";

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
      },
      "fixture.yaml",
    );

    expect(config.project).toBe("fixture");
    expect(config.docs.managed).toBe(true);
    expect(config.docs.root).toBe("docs");
    expect(config.git.requireEntryFor).toEqual(["src/**"]);
    expect(config.git.ignore).toContain("dist/**");
  });

  it("rejects non-object config", () => {
    expect(() => parseLedgerConfig([], "fixture.yaml")).toThrow(
      "fixture.yaml: config must be a YAML object",
    );
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
});
