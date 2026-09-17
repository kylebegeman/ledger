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
          readonly steps: readonly { readonly name?: string; readonly if?: string; readonly run?: string }[];
        };
      };
    };

    expect(workflow.jobs.test.strategy.matrix.os).toEqual([
      "ubuntu-latest",
      "macos-latest",
      "windows-latest",
    ]);
    expect(workflow.jobs.test.strategy.matrix.node).toEqual([22, 24]);
    expect(source).toContain("fetch-depth: 0");
    expect(source).toContain("Verify Ledger pull request range");
    expect(source).toContain("uses: ./");
    expect(source).toContain("command: node dist/cli.js");
    expect(source).toContain("github.event.pull_request.base.sha");
    expect(source).toContain("github.event.pull_request.head.sha");
    expect(source).toContain("npm audit --omit=dev --audit-level=high");
    expect(source).toContain("npm install --ignore-scripts");
    // The README cards are regenerated once per run, on the job whose output they were captured from.
    const readmeCheck = workflow.jobs.test.steps.find((step) => step.name === "Check README cards");
    expect(readmeCheck).toMatchObject({ if: "matrix.os == 'ubuntu-latest' && matrix.node == 24", run: "npm run readme:check" });
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as { readonly scripts: Record<string, string> };
    expect(manifest.scripts["readme:check"]).toBe("node scripts/readme-assets.mjs && git diff --exit-code -- assets/readme");
    expectActionsPinned(source);
  });

  it("ships a composite action that runs ledger ci with annotations", async () => {
    const source = await readFile("action.yml", "utf8");
    const action = parse(source) as {
      readonly inputs: Record<string, { readonly default?: string }>;
      readonly runs: { readonly using: string; readonly steps: readonly { readonly run?: string; readonly uses?: string }[] };
    };
    expect(action.runs.using).toBe("composite");
    expect(Object.keys(action.inputs).sort()).toEqual(["base", "command", "comment", "head", "node-version"]);
    expect(action.inputs.command?.default).toContain("@kylebegeman/ledger");
    expect(action.inputs.comment?.default).toBe("false");
    const ledgerStep = action.runs.steps.find((step) => step.run?.includes("ci --github"));
    const commentStep = action.runs.steps.find((step) => step.run?.includes("issues/$PR_NUMBER/comments"));
    expect(ledgerStep).toBeDefined();
    expect(commentStep).toBeDefined();
    // GITHUB_STEP_SUMMARY is a different file in every step, so the summary is handed over through RUNNER_TEMP.
    expect(ledgerStep?.run).toContain('cp "$GITHUB_STEP_SUMMARY" "$RUNNER_TEMP/ledger-ci-summary.md"');
    expect(commentStep?.run).toContain("$RUNNER_TEMP/ledger-ci-summary.md");
    expect(commentStep?.run).not.toContain('cat "$GITHUB_STEP_SUMMARY"');
    // One marked comment per pull request, updated in place; forks get a notice instead of a failed step.
    expect(commentStep?.run).toContain('marker="<!-- ledger-ci-summary -->"');
    expect(commentStep?.run).toContain('--method PATCH "repos/$GH_REPO/issues/comments/$existing"');
    expect(commentStep?.run).toContain('"$HEAD_REPO" != "$GH_REPO"');
    expect(commentStep?.run).toMatch(/\|\| echo "::warning title=Ledger CI::Could not update/);
    expect(commentStep?.run).toMatch(/\|\| echo "::warning title=Ledger CI::Could not post/);
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
