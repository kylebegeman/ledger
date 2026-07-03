import { describe, expect, it } from "vitest";
import { renderLedgerTemplate, yamlStringArray } from "../src/template.js";

describe("renderLedgerTemplate", () => {
  it("renders scalars, YAML arrays, and default changed-file blocks", () => {
    const rendered = renderLedgerTemplate(
      [
        "---",
        'title: "{{title}}"',
        'status: "draft"',
        "areas: []",
        "---",
        "",
        "# {{id}}: {{title}}",
        "",
        "## Changed Files",
        "",
        "### path/to/file.ts",
      ].join("\n"),
      {
        scalars: {
          id: "0001",
          title: 'Quoted "title"',
          status: "landed",
        },
        arrays: {
          areas: ["cli"],
        },
        blocks: {
          changedFiles: "### src/cli.ts\n\n- What changed: CLI search.",
        },
      },
    );

    expect(rendered).toContain('title: "Quoted \\"title\\""');
    expect(rendered).toContain('status: "landed"');
    expect(rendered).toContain("areas:\n  - \"cli\"");
    expect(rendered).toContain('# 0001: Quoted "title"');
    expect(rendered).toContain("### src/cli.ts");
    expect(rendered).not.toContain("path/to/file.ts");
  });

  it("renders empty arrays inline", () => {
    expect(yamlStringArray([])).toBe(" []");
  });
});
