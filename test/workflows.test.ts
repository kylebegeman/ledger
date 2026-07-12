import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("repository automation", () => {
  it("tests maintained Node LTS lines across supported operating systems", async () => {
    const source = await readFile(".github/workflows/ci.yml", "utf8");
    const workflow = parse(source) as {
      readonly jobs: {
        readonly test: {
          readonly strategy: {
            readonly matrix: {
              readonly os: readonly string[];
              readonly node: readonly number[];
            };
          };
        };
      };
    };

    expect(workflow.jobs.test.strategy.matrix.os).toEqual([
      "ubuntu-latest",
      "macos-latest",
      "windows-latest",
    ]);
    expect(workflow.jobs.test.strategy.matrix.node).toEqual([22, 24]);
    expect(source).toContain("npm audit --omit=dev --audit-level=high");
    expect(source).toContain("npm install --ignore-scripts");
    expectActionsPinned(source);
  });

  it("fails release automation when the tag and package version differ", async () => {
    const source = await readFile(".github/workflows/release.yml", "utf8");

    expect(source).toContain('tag_version="${GITHUB_REF_NAME#v}"');
    expect(source).toContain('[[ "$tag_version" != "$version" ]]');
    expect(source).toContain("npm publish --provenance --access public");
    expect(source).toContain("id-token: write");
    expect(source).toContain("view_status=$?");
    expect(source).toContain('grep -q "E404"');
    expect(source).toContain("Could not determine whether");
    expectActionsPinned(source);
  });
});

function expectActionsPinned(source: string): void {
  const actions = [...source.matchAll(/uses:\s+(actions\/[^@\s]+)@([^\s]+)/g)];
  expect(actions.length).toBeGreaterThan(0);
  for (const [, name, revision] of actions) {
    expect(name).toMatch(/^actions\/(checkout|setup-node)$/);
    expect(revision).toMatch(/^[a-f0-9]{40}$/);
  }
}
