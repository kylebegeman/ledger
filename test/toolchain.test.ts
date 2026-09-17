import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { matchesGlob } from "../src/coverage.js";
import { detectToolchain, parseMakeTargets } from "../src/toolchain.js";

const koreMakefile = [
  ".PHONY: check test fmt release-oci-sign",
  "GO ?= go",
  "BIN := bin/kore",
  "FLAGS += -race",
  "VERSION = 1.0.0",
  "",
  "check: fmt test",
  "\t$(GO) vet ./...",
  "test:",
  "\t$(GO) test ./...",
  "fmt lint: ## format and lint",
  "\tgofmt -w .",
  "%.o: %.c",
  "\tcc -c $<",
  "docs::",
  "\techo docs",
  "release-oci-sign: check",
  "publish-docs deploy-staging push-image upload-assets clean install-tools:",
  "",
].join("\n");

const koreFiles = [
  "cmd/kore/main.go",
  "internal/store/db/models.sql.go",
  "internal/views/page_templ.go",
  "internal/views/page.templ",
  "blueprints/crm/.product/spec.md",
  "plugins/auth/plugin.go",
  "examples/linklet/sqlc.yaml",
  "examples/linklet/internal/store/db/query.sql.go",
  "examples/linklet/.product/notes.md",
  "build/kore-oci/Containerfile",
  "docs/README.md",
  "docs/llm/START_HERE.md",
  "docs/llm/manifest.json",
  ".github/workflows/ci.yml",
  ".claude/settings.json",
  ".codex/hooks.json",
  ".agents/skills/ledger/SKILL.md",
  ".ledger/config.yaml",
  "Makefile",
  "go.mod",
  "go.sum",
  "README.md",
];

const koreManifests = new Map([
  ["Makefile", koreMakefile],
  [
    "examples/linklet/sqlc.yaml",
    ["version: \"2\"", "sql:", "  - engine: postgresql", "    gen:", "      go:", "        out: internal/store/db", ""].join("\n"),
  ],
]);

describe("detectToolchain", () => {
  it("infers roots, generated-code ignores, and an allowlist for a Kore-shaped Go repository", () => {
    const detection = detectToolchain(koreFiles, koreManifests);

    expect(detection.coverageRoots).toEqual([
      ".github/**",
      "Makefile",
      "blueprints/**",
      "build/**",
      "cmd/**",
      "docs/**",
      "examples/**",
      "go.mod",
      "internal/**",
      "plugins/**",
    ]);
    expect(detection.ignore).toEqual(
      expect.arrayContaining([
        "*_templ.go",
        "**/*_templ.go",
        ".product/**",
        "**/.product/**",
        "examples/linklet/internal/store/db/**",
        "node_modules/**",
        "**/node_modules/**",
        "generated/**",
        "**/generated/**",
        ".ledger/indexes/**",
        ".ledger/reports/**",
        ".ledger/dist/**",
        ".ledger/cache/**",
        "dist/**",
        "vendor/**",
      ]),
    );
    expect(detection.ignore).not.toContain("build/**");
    expect(detection.ignore).not.toContain("**/*.sql.go");
    expect(detection.ignore).not.toContain("docs/llm/START_HERE.md");
    expect(detection.ignore).not.toContain("docs/llm/manifest.json");
    expect(detection.verificationAllow).toEqual([
      "go build **",
      "go test **",
      "go vet **",
      "ledger ci **",
      "ledger coverage **",
      "ledger doctor **",
      "ledger ready **",
      "ledger stale **",
      "ledger validate **",
      "make check",
      "make lint",
      "make test",
    ]);
    expect(detection.toolchains).toEqual(["go", "make", "sqlc", "templ"]);
  });

  it("infers a TypeScript package with untracked build output", () => {
    const packageJson = JSON.stringify({
      scripts: { build: "tsc", test: "vitest run", release: "npm publish", "prepare-install": "x" },
      devDependencies: { vitest: "^3.0.0", typescript: "^5.0.0" },
    });
    const detection = detectToolchain(
      ["src/index.ts", "test/index.test.ts", "docs/guide.md", "package.json", "package-lock.json", "README.md"],
      new Map([["package.json", packageJson]]),
    );

    expect(detection.coverageRoots).toEqual(["docs/**", "package.json", "src/**", "test/**"]);
    expect(detection.ignore).toContain("dist/**");
    expect(detection.ignore).toContain("docs/llm/START_HERE.md");
    expect(detection.ignore).toContain("docs/llm/manifest.json");
    expect(detection.ignore).toContain("vendor/**");
    expect(detection.verificationAllow).toEqual([
      "ledger ci **",
      "ledger coverage **",
      "ledger doctor **",
      "ledger ready **",
      "ledger stale **",
      "ledger validate **",
      "npm ci",
      "npm run build",
      "npm run test",
      "npm test **",
      "npx tsc **",
      "npx vitest **",
    ]);
    expect(detection.toolchains).toEqual(["node"]);
  });

  it("returns the default config lists for an empty file list", () => {
    const detection = detectToolchain([], new Map());

    expect(detection.coverageRoots).toEqual(defaultConfig.git.requireEntryFor);
    expect(detection.ignore).toEqual(defaultConfig.git.ignore);
    expect(detection.verificationAllow).toEqual(defaultConfig.verification.allow);
    expect(detection.toolchains).toEqual([]);
  });

  it("emits both forms for a root sqlc manifest and falls back only when sql.go files are tracked", () => {
    const rootManifest = "version: '2'\nsql:\n  - gen:\n      go:\n        out: ./internal/store/db/\n";
    const root = detectToolchain(
      ["sqlc.yaml", "internal/store/db/models.sql.go"],
      new Map([["sqlc.yaml", rootManifest]]),
    );
    expect(root.ignore).toContain("internal/store/db/**");
    expect(root.ignore).toContain("**/internal/store/db/**");
    expect(root.ignore).not.toContain("**/*.sql.go");

    const unparsable = new Map([["app/sqlc.yaml", "sql: [unclosed"]]);
    expect(detectToolchain(["app/sqlc.yaml", "app/db/models.sql.go"], unparsable).ignore).toContain(
      "**/*.sql.go",
    );
    expect(detectToolchain(["app/sqlc.yaml", "app/main.go"], unparsable).ignore).not.toContain("**/*.sql.go");

    const escaping = new Map([["app/sqlc.yaml", "sql:\n  - gen:\n      go:\n        out: ../../outside\n"]]);
    expect(detectToolchain(["app/sqlc.yaml"], escaping).ignore.some((pattern) => pattern.includes("outside"))).toBe(
      false,
    );
  });

  it("ignores only sqlc output files when out is the manifest directory", () => {
    const inPlace = "version: '2'\nsql:\n  - gen:\n      go:\n        out: .\n";
    const files = [
      "go.mod",
      "internal/db/sqlc.yaml",
      "internal/db/query.sql",
      "internal/db/schema.sql",
      "internal/db/query.sql.go",
      "internal/db/models.go",
    ];
    const nested = detectToolchain(files, new Map([["internal/db/sqlc.yaml", inPlace]]));
    const ignored = (file: string) => nested.ignore.some((pattern) => matchesGlob(file, pattern));
    expect(nested.ignore).not.toContain("internal/db/**");
    expect(ignored("internal/db/query.sql.go")).toBe(true);
    expect(ignored("internal/db/models.go")).toBe(true);
    expect(ignored("internal/db/query.sql")).toBe(false);
    expect(ignored("internal/db/schema.sql")).toBe(false);
    expect(ignored("internal/db/sqlc.yaml")).toBe(false);

    const root = detectToolchain(
      ["go.mod", "sqlc.yaml", "query.sql", "query.sql.go"],
      new Map([["sqlc.yaml", inPlace]]),
    );
    expect(root.ignore.some((pattern) => matchesGlob("query.sql.go", pattern))).toBe(true);
    expect(root.ignore.some((pattern) => matchesGlob("query.sql", pattern))).toBe(false);
    expect(root.ignore.some((pattern) => matchesGlob("sqlc.yaml", pattern))).toBe(false);
  });

  it("matches root-level and nested sql.go files with the fallback", () => {
    const detection = detectToolchain(["go.mod", "models.sql.go", "pkg/db/q.sql.go"], new Map());
    expect(detection.ignore).toContain("*.sql.go");
    expect(detection.ignore).toContain("**/*.sql.go");
    for (const file of ["models.sql.go", "pkg/db/q.sql.go"]) {
      expect(detection.ignore.some((pattern) => matchesGlob(file, pattern))).toBe(true);
    }
  });

  it("ignores a committed vendor tree and never makes it a coverage root", () => {
    const detection = detectToolchain(["go.mod", "cmd/main.go", "vendor/github.com/x/y/y.go", "vendor/modules.txt"], new Map());
    expect(detection.coverageRoots).toEqual(["cmd/**", "go.mod"]);
    for (const file of ["vendor/github.com/x/y/y.go", "tools/vendor/z/z.go"]) {
      expect(detection.ignore.some((pattern) => matchesGlob(file, pattern))).toBe(true);
    }
  });

  it("ignores build output inside packages unless the top-level directory is tracked", () => {
    const monorepo = detectToolchain(["package.json", "packages/a/src/index.ts", "packages/a/dist/bundle.js"], new Map());
    expect(monorepo.ignore.some((pattern) => matchesGlob("packages/a/dist/bundle.js", pattern))).toBe(true);
    expect(monorepo.ignore).toEqual(expect.arrayContaining(["dist/**", "**/dist/**", "build/**", "**/build/**"]));
    const trackedBuild = detectToolchain(["go.mod", "build/Containerfile"], new Map());
    expect(trackedBuild.coverageRoots).toContain("build/**");
    expect(trackedBuild.ignore.some((pattern) => pattern.includes("build/"))).toBe(false);
  });

  it("proposes only read-only checks and at most forty npm scripts", () => {
    const scripts: Record<string, string> = {
      test: "vitest", lint: "eslint .", "db:reset": "psql", "start:prod": "node .", dev: "vite", "db:migrate": "x",
      "format:check": "prettier --check .", "lint:fix": "eslint --fix .", seed: "x", "release-notes": "x",
    };
    for (let index = 0; index < 60; index += 1) scripts[`check${String(index).padStart(2, "0")}`] = "x";
    const detection = detectToolchain(["package.json", "src/index.ts"], new Map([["package.json", JSON.stringify({ scripts })]]));
    const npmRuns = detection.verificationAllow.filter((command) => command.startsWith("npm run "));
    expect(npmRuns).toHaveLength(40);
    expect(npmRuns).toContain("npm run check00");
    for (const denied of ["db:reset", "start:prod", "dev", "db:migrate", "format:check", "lint:fix", "seed", "release-notes"]) {
      expect(npmRuns).not.toContain(`npm run ${denied}`);
    }
    expect(parseMakeTargets("db-reset:\nserve:\nlint:\nfmt-check:\n")).toEqual(["lint"]);
  });

  it("is deterministic regardless of input order", () => {
    const reversed = [...koreFiles].reverse();
    const reorderedManifests = new Map([...koreManifests].reverse());

    expect(detectToolchain(reversed, reorderedManifests)).toEqual(detectToolchain(koreFiles, koreManifests));
  });
});

describe("parseMakeTargets", () => {
  it("keeps explicit targets and skips special, pattern, double-colon, assignment, and denied names", () => {
    expect(parseMakeTargets(koreMakefile)).toEqual(["check", "lint", "test"]);
  });

  it("sorts targets and the detector caps them at 40", () => {
    const makefile = Array.from({ length: 45 }, (_, index) => `t${String(index).padStart(2, "0")}:`)
      .reverse()
      .join("\n");
    const targets = parseMakeTargets(makefile);
    expect(targets[0]).toBe("t00");
    expect(targets).toHaveLength(45);

    const allow = detectToolchain(["Makefile"], new Map([["Makefile", makefile]])).verificationAllow;
    const make = allow.filter((command) => command.startsWith("make "));
    expect(make).toHaveLength(40);
    expect(make.at(-1)).toBe("make t39");
  });
});
