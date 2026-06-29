import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

describe("CLI help", () => {
  it("prints general help", async () => {
    const result = await captureRun(["help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ledger help [command]");
    expect(result.stdout).toContain("ledger ci [--staged] [--json]");
  });

  it("prints command-specific help", async () => {
    const result = await captureRun(["help", "new"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Ledger new");
    expect(result.stdout).toContain("--from-diff");
  });

  it("prints nested docs help from command flags", async () => {
    const result = await captureRun(["docs", "impact", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Ledger docs impact");
    expect(result.stdout).toContain("--check");
  });

  it("prints version", async () => {
    const result = await captureRun(["version"]);
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { readonly version: string };

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(`ledger ${packageJson.version}`);
  });
});

async function captureRun(argv: readonly string[]): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };

  try {
    const exitCode = await run([...argv]);
    return {
      exitCode,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
