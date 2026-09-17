import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerDocuments } from "../src/documents.js";
import { createChangeEntryDetailed } from "../src/newEntry.js";
import { outlineSymbolSpans } from "../src/symbolOutlines.js";
import { extractFileSymbolsDetailed, summarizeSymbolLanguages, symbolsTouchedByLines } from "../src/symbols.js";
import { findWorkspace, initWorkspace } from "../src/workspace.js";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

type Row = readonly [name: string, start: number, end: number, depth: number];

function rows(language: Parameters<typeof outlineSymbolSpans>[0], source: string): Row[] {
  return outlineSymbolSpans(language, source).map((span) => [span.name, span.start, span.end, span.depth]);
}

describe("Go outline", () => {
  const source = [
    "package billing", // 1
    "", // 2
    "import (", // 3
    '\t"fmt"', // 4
    ")", // 5
    "", // 6
    "// Fee is charged once.", // 7
    "const Fee = 2", // 8
    "", // 9
    "const (", // 10
    "\t// Low is the floor.", // 11
    "\tLow = iota", // 12
    "\tHigh", // 13
    "\t_ = 9", // 14
    ")", // 15
    "", // 16
    "type Invoice struct {", // 17
    "\tTotal int // func Hidden() in a comment", // 18
    "}", // 19
    "", // 20
    "// Charge applies the fee.", // 21
    "func (i *Invoice) Charge(", // 22
    "\tn int,", // 23
    ") error {", // 24
    '\tmsg := "func Fake() {"', // 25
    "\t_ = `raw", // 26
    "func NotReal() {", // 27
    "`", // 28
    "\treturn fmt.Errorf(msg)", // 29
    "}", // 30
    "", // 31
    "func (Stack[T]) Len() int { return 0 }", // 32
    "", // 33
    "var a, b = 1, 2", // 34
    "", // 35
    "func main() {}", // 36
    "var usage = `first", // 37
    "func Fake() {", // 38
    "`", // 39
    "func Map[T any](items []T) []T { return items }", // 40
    "func pairs() []struct{ A, B int } {", // 41
    "\treturn nil", // 42
    "}", // 43
    "",
  ].join("\n");

  it("names functions, methods, types, and grouped constants with their lines", () => {
    expect(rows("go", source)).toEqual([
      ["Fee", 7, 8, 0],
      ["Low", 11, 12, 0],
      ["High", 13, 13, 0],
      ["Invoice", 17, 19, 0],
      ["Invoice.Charge", 21, 30, 0],
      ["Stack.Len", 32, 32, 0],
      ["a", 34, 34, 0],
      ["b", 34, 34, 0],
      ["main", 36, 36, 0],
      ["usage", 37, 39, 0],
      ["Map", 40, 40, 0],
      ["pairs", 41, 43, 0],
    ]);
  });
});

describe("Rust outline", () => {
  const source = [
    "use std::fmt::{self, Display};", // 1
    "", // 2
    "/// A parser.", // 3
    "#[derive(Debug)]", // 4
    "pub struct Parser<'a> {", // 5
    "    input: &'a str, // fn fake() {}", // 6
    "}", // 7
    "", // 8
    "impl<'a> Parser<'a> {", // 9
    "    pub const LIMIT: usize = 3;", // 10
    "", // 11
    "    /// Parses one token.", // 12
    "    pub fn parse(&self) -> Option<char> {", // 13
    '        let s = r#"fn hidden() { "#;', // 14
    "        let c = '{';", // 15
    "        None", // 16
    "    }", // 17
    "}", // 18
    "", // 19
    "impl Display for Parser<'_> {", // 20
    "    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {", // 21
    "        write!(f, \"}\")", // 22
    "    }", // 23
    "}", // 24
    "", // 25
    "pub trait Tokenize {", // 26
    "    fn next_token(&mut self) -> Option<char>;", // 27
    "}", // 28
    "", // 29
    "mod tests;", // 30
    "pub(crate) async unsafe fn run() {}", // 31
    "static mut COUNTER: u32 = 0;", // 32
    "macro_rules! shout { () => {} }", // 33
    "type_name!(Parser);", // 34
    "pub fn usage() -> &'static str {", // 35
    '    "first {', // 36
    'second"', // 37
    "}", // 38
    "#[cfg_attr(", // 39
    '    feature = "serde",', // 40
    ")]", // 41
    "pub struct Token;", // 42
    "impl Token { pub fn len(&self) -> usize { 0 } }", // 43
    "impl<'a> Iterator for &'a mut Token {", // 44
    "    fn next(&mut self) -> Option<u8> { None }", // 45
    "}", // 46
    "const _: () = ();", // 47
    "/// Detached but still attached.", // 48
    "", // 49
    "#[allow(dead_code)] // kept for later", // 50
    "const LIMIT: usize = 8;", // 51
    "",
  ].join("\n");

  it("names items and the members of impls, traits, and modules", () => {
    expect(rows("rust", source)).toEqual([
      ["Parser", 3, 7, 0],
      ["Parser::LIMIT", 10, 10, 1],
      ["Parser::parse", 12, 17, 1],
      ["Parser::fmt", 21, 23, 1],
      ["Tokenize", 26, 28, 0],
      ["Tokenize::next_token", 27, 27, 1],
      ["tests", 30, 30, 0],
      ["run", 31, 31, 0],
      ["COUNTER", 32, 32, 0],
      ["shout", 33, 33, 0],
      ["usage", 35, 38, 0],
      ["Token", 39, 42, 0],
      ["Token::len", 43, 43, 1],
      ["Token::next", 45, 45, 1],
      ["LIMIT", 48, 51, 0],
    ]);
  });
});

describe("Python outline", () => {
  const source = [
    "import os", // 1
    "", // 2
    "LIMIT: int = 3", // 3
    "TABLE = {", // 4
    '    "a": 1,', // 5
    "}", // 6
    "", // 7
    '"""', // 8
    "def not_real():", // 9
    '"""', // 10
    "", // 11
    "# Charges once.", // 12
    "@cache", // 13
    "def charge(amount,", // 14
    "           fee=LIMIT):", // 15
    "    def helper():", // 16
    "        return 1", // 17
    "", // 18
    "    return amount + fee", // 19
    "", // 20
    "class Invoice:", // 21
    "    RATE = 2", // 22
    "", // 23
    "    async def total(self):", // 24
    "        return 0  # def fake():", // 25
    "", // 26
    "if __name__ == '__main__':", // 27
    "    charge(1)", // 28
    "@app.route(", // 29
    '    "/x",', // 30
    ")", // 31
    "def handler(", // 32
    "    request,", // 33
    "):", // 34
    '    """Docs', // 35
    "def fake():", // 36
    '"""', // 37
    "    return request", // 38
    "", // 39
    "@dataclass", // 40
    "class Point:", // 41
    "    x: int", // 42
    "    y: int = 0", // 43
    "", // 44
    "type Pair = tuple[int, int]", // 45
    "left = 1; right: int = 2; print(left)", // 46
    "",
  ].join("\n");

  it("names functions, classes, members, and module constants by indentation", () => {
    expect(rows("python", source)).toEqual([
      ["LIMIT", 3, 3, 0],
      ["TABLE", 4, 6, 0],
      ["charge", 12, 19, 0],
      ["Invoice", 21, 25, 0],
      ["Invoice.RATE", 22, 22, 1],
      ["Invoice.total", 24, 25, 1],
      ["handler", 29, 38, 0],
      ["Point", 40, 43, 0],
      ["Point.x", 42, 42, 1],
      ["Point.y", 43, 43, 1],
      ["Pair", 45, 45, 0],
      ["left", 46, 46, 0],
      ["right", 46, 46, 0],
    ]);
  });
});

describe("Swift outline", () => {
  const source = [
    "import SwiftUI", // 1
    "", // 2
    "/// The main model.", // 3
    "@MainActor", // 4
    "final class Model: ObservableObject {", // 5
    "    @Published var count = 0", // 6
    '    let label = "func fake() {"', // 7
    "", // 8
    "    init?(seed: Int) {", // 9
    "        count = seed", // 10
    "    }", // 11
    "", // 12
    "    static func == (lhs: Model, rhs: Model) -> Bool { true }", // 13
    "", // 14
    "    func increment() {", // 15
    "        if count > 3 {", // 16
    "            let inner = 1", // 17
    "        }", // 18
    "    }", // 19
    "}", // 20
    "", // 21
    "enum Mode {", // 22
    "    case light, dark", // 23
    "    case system", // 24
    "}", // 25
    "", // 26
    "extension Model: Identifiable {", // 27
    "    var id: Int { count }", // 28
    "}", // 29
    "", // 30
    "protocol Named {", // 31
    "    var name: String { get }", // 32
    "}", // 33
    "", // 34
    'let banner = """', // 35
    "struct Fake {", // 36
    '"""', // 37
    "func greet() -> String {", // 38
    '    "hi"', // 39
    "}", // 40
    "indirect enum Tree {", // 41
    "    case node(Tree, Tree), leaf", // 42
    "}", // 43
    "", // 44
    "func layout()", // 45
    "{", // 46
    '    let raw = #"say "hi" \\#(names.map { "\\($0)" })"#', // 47
    "}", // 48
    "", // 49
    "var optional: Int?", // 50
    "let after = 1, more: [String: Int] = [:], handler = { (a: Int, b: Int) in a }", // 51
    "protocol Store {", // 52
    "    associatedtype Item", // 53
    "}", // 54
    "struct Check: Error { let message: String; var code = 0 }", // 55
    "struct Settings {", // 56
    '    @Shared(.appStorage("theme")) var theme = ""', // 57
    "    private var reducer: Reduce<", // 58
    "        State", // 59
    "    > {", // 60
    "        Reduce()", // 61
    "    }", // 62
    '    @Test("Saves", arguments: [', // 63
    "        1, 2,", // 64
    "    ])", // 65
    "    func saves(value: Int) {}", // 66
    "}", // 67
    "/**", // 68
    " Handles view actions.", // 69
    " */", // 70
    "var handler: Reduce<State, Action, Action.View> { Reduce() }", // 71
    '@Test(.enabled(if: env["CI"] != nil), .timeLimit(.minutes(10))) @MainActor', // 72
    "func launches() async throws {}", // 73
    "",
  ].join("\n");

  it("names types, extensions' members, enum cases, and functions", () => {
    expect(rows("swift", source)).toEqual([
      ["Model", 3, 20, 0],
      ["Model.count", 6, 6, 1],
      ["Model.label", 7, 7, 1],
      ["Model.init", 9, 11, 1],
      ["Model.increment", 15, 19, 1],
      ["Mode", 22, 25, 0],
      ["Mode.dark", 23, 23, 1],
      ["Mode.light", 23, 23, 1],
      ["Mode.system", 24, 24, 1],
      ["Model.id", 28, 28, 1],
      ["Named", 31, 33, 0],
      ["Named.name", 32, 32, 1],
      ["banner", 35, 37, 0],
      ["greet", 38, 40, 0],
      ["Tree", 41, 43, 0],
      ["Tree.leaf", 42, 42, 1],
      ["Tree.node", 42, 42, 1],
      ["layout", 45, 48, 0],
      ["optional", 50, 50, 0],
      ["after", 51, 51, 0],
      ["handler", 51, 51, 0],
      ["more", 51, 51, 0],
      ["Store", 52, 54, 0],
      ["Store.Item", 53, 53, 1],
      ["Check", 55, 55, 0],
      ["Check.code", 55, 55, 1],
      ["Check.message", 55, 55, 1],
      ["Settings", 56, 67, 0],
      ["Settings.theme", 57, 57, 1],
      ["Settings.reducer", 58, 62, 1],
      ["Settings.saves", 63, 66, 1],
      ["handler", 68, 71, 0],
      ["launches", 72, 73, 0],
    ]);
  });

  it("gives a line inside a method to the method, not its type", () => {
    const spans = outlineSymbolSpans("swift", source);
    expect(symbolsTouchedByLines(spans, [{ start: 17, end: 17 }])).toEqual(["Model.increment"]);
    expect(symbolsTouchedByLines(spans, [{ start: 5, end: 5 }])).toEqual(["Model"]);
  });
});

describe("outline extractors in Ledger", () => {
  it("reports the languages and extracts them from project files", async () => {
    expect(summarizeSymbolLanguages(["a.go", "b.rs", "c.py", "d.swift", "e.java"])).toEqual({
      extractable: false,
      outlinedLanguages: ["Go", "Python", "Rust", "Swift"],
      otherLanguages: ["Java"],
    });

    const root = await workspace();
    await writeFile(path.join(root, "main.go"), "package main\n\nfunc main() {}\n");
    const extraction = await extractFileSymbolsDetailed(await findWorkspace(root), "main.go");
    expect(extraction).toMatchObject({ symbols: ["main"], extractor: "go" });
  });

  it("drafts only the Go method a diff touched", async () => {
    const root = await workspace();
    await mkdir(path.join(root, "billing"), { recursive: true });
    const file = path.join(root, "billing", "invoice.go");
    const lines = [
      "package billing",
      "",
      "type Invoice struct{ Total int }",
      "",
      "func (i *Invoice) Charge() int {",
      "\treturn i.Total + 1",
      "}",
      "",
      "func (i *Invoice) Refund() int {",
      "\treturn 0",
      "}",
      "",
    ];
    await writeFile(file, lines.join("\n"));
    await git(root, "init", "-q");
    await git(root, "config", "user.email", "ledger@example.com");
    await git(root, "config", "user.name", "Ledger Test");
    await git(root, "config", "commit.gpgsign", "false");
    await git(root, "add", "-A");
    await git(root, "commit", "-qm", "base");
    lines[9] = "\treturn -i.Total";
    await writeFile(file, lines.join("\n"));

    const workspaceHandle = await findWorkspace(root);
    const draft = await createChangeEntryDetailed(workspaceHandle, await readLedgerDocuments(workspaceHandle), {
      title: "Refund the total",
      fromDiff: true,
      staged: false,
      areas: [],
      status: "draft",
    });
    const content = await readFile(path.join(root, draft.path), "utf8");
    expect(content).toContain('symbols:\n  - "Invoice.Refund"');
    expect(content).not.toContain('"Invoice.Charge"');
    expect(draft.symbolExtractors?.counts).toMatchObject({ go: 1 });
  });
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ledger-outline-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await initWorkspace(root);
  return root;
}

async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile("git", [...args], { cwd }, (error) => (error ? reject(error) : resolve()));
  });
}
