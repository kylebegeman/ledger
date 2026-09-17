import type { LedgerSymbolSpan } from "./symbols.js";

/**
 * Declaration outlines for languages without a parser in Ledger: Go, Rust,
 * Python, and Swift. Comments and string contents are masked first, so the
 * patterns and the brace, parenthesis, and indentation scans only see code.
 * Top-level declarations have depth 0 and members of a type, trait, impl, or
 * module depth 1, so a change inside a method names the method.
 */
export type LedgerOutlineLanguage = "go" | "rust" | "python" | "swift";

export const outlineLanguageExtensions: ReadonlyMap<string, LedgerOutlineLanguage> = new Map([
  [".go", "go"],
  [".rs", "rust"],
  [".py", "python"],
  [".swift", "swift"],
]);

export function outlineSymbolSpans(language: LedgerOutlineLanguage, raw: string): readonly LedgerSymbolSpan[] {
  const source = new Source(raw, language);
  const spans =
    language === "go"
      ? outlineGo(source)
      : language === "rust"
        ? outlineBraces(source, rustRules)
        : language === "swift"
          ? outlineBraces(source, swiftRules)
          : outlinePython(source);
  return spans.sort((left, right) => left.start - right.start || left.depth - right.depth || left.name.localeCompare(right.name));
}

interface Masked {
  readonly masked: string;
  /** Offsets of line breaks inside strings, which never end a statement. */
  readonly joined: ReadonlySet<number>;
}

/** The raw and masked text of one file, with line lookups. */
class Source {
  readonly lines: readonly string[];
  readonly masked: string;
  readonly maskedLines: readonly string[];
  private readonly joined: ReadonlySet<number>;
  private readonly lineStarts: readonly number[];

  constructor(
    readonly raw: string,
    private readonly language: LedgerOutlineLanguage,
  ) {
    const { masked, joined } = language === "python" ? maskPython(raw) : maskBraceCode(raw, language);
    this.masked = masked;
    this.joined = joined;
    this.lines = raw.split("\n").map((line) => line.replace(/\r$/, ""));
    this.maskedLines = masked.split("\n").map((line) => line.replace(/\r$/, ""));
    const starts = [0];
    for (let index = masked.indexOf("\n"); index !== -1; index = masked.indexOf("\n", index + 1)) starts.push(index + 1);
    this.lineStarts = starts;
  }

  /** 0-based index of the last line that has content. */
  get lastLine(): number {
    return this.raw.endsWith("\n") ? this.lines.length - 2 : this.lines.length - 1;
  }

  lineStart(line: number): number {
    return this.lineStarts[line] ?? this.masked.length;
  }

  lineOf(offset: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.lineStarts[middle]! <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  isBlank(line: number): boolean {
    return (this.maskedLines[line] ?? "").trim() === "";
  }

  /** The line holding the brace that closes the one at `open`, or the last line when it never closes. */
  closingLine(open: number): number {
    return this.lineOf(this.closingBrace(open));
  }

  /** The masked text between the brace at `open` and the one that closes it. */
  bodyText(open: number): string {
    return this.masked.slice(open + 1, this.closingBrace(open));
  }

  private closingBrace(open: number): number {
    let depth = 0;
    for (let offset = open; offset < this.masked.length; offset += 1) {
      const character = this.masked[offset];
      if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return offset;
      }
    }
    return this.masked.length - 1;
  }

  /**
   * Where the declaration starting on `line` ends. It opens a body at its first
   * `{` outside parentheses and brackets, or ends at its first `;` there, or,
   * for newline-terminated languages, at the first line break there that does
   * not continue the statement.
   */
  declarationEnd(line: number, style: "newline" | "semicolon"): { readonly end: number; readonly body?: number } {
    let parens = 0;
    for (let offset = this.lineStart(line); offset < this.masked.length; offset += 1) {
      const character = this.masked[offset];
      if (character === "(" || character === "[") parens += 1;
      else if (character === ")" || character === "]") parens = Math.max(0, parens - 1);
      else if (parens === 0 && character === "{") {
        // A Go struct or interface type in a signature, as in `func f() []struct{ A int } {`, is not the body.
        if (this.language === "go" && /\b(?:struct|interface)\s*$/.test(this.masked.slice(Math.max(0, offset - 16), offset))) {
          offset = this.closingBrace(offset);
          continue;
        }
        return { end: this.closingLine(offset), body: offset };
      }
      else if (parens === 0 && character === ";") return { end: this.lineOf(offset) };
      else if (parens === 0 && character === "\n" && style === "newline" && !this.joined.has(offset) && !this.continues(offset)) {
        return { end: this.lineOf(offset) };
      }
    }
    return { end: this.lastLine };
  }

  /**
   * Whether the line break at `newline` continues the statement: the line ends
   * with an operator or comma, or, in Swift, the next line starts with a brace,
   * `->`, a closing `>`, a member access, or a clause such as `where`.
   */
  private continues(newline: number): boolean {
    let index = newline - 1;
    while (index >= 0 && (this.masked[index] === " " || this.masked[index] === "\t" || this.masked[index] === "\r")) index -= 1;
    const tail = this.masked.slice(Math.max(0, index - 1), index + 1);
    // Swift types end in `>`, `?`, and `!`, so only Go treats those as operators; a trailing `<` opens generic arguments.
    const trailing = this.language === "swift" ? /(?:[,=+\-*/%&|^.:<]|->)$/ : /[,=+\-*/%&|^<>!.:]$/;
    if (trailing.test(tail) && !/\+\+$|--$/.test(tail)) return true;
    if (this.language !== "swift") return false;
    let next = this.lineOf(newline) + 1;
    while (next <= this.lastLine && this.isBlank(next)) next += 1;
    return next <= this.lastLine && /^\s*(?:\{|->|>|\.[A-Za-z_]|(?:where|throws|rethrows|async)\b|:|=(?!=)|&&|\|\||\?\?)/.test(this.maskedLines[next]!);
  }

  /** For each line, whether it continues the previous one: inside brackets or a string, or after a backslash. */
  continuedLines(): readonly boolean[] {
    const continued = [false];
    let depth = 0;
    for (let offset = 0; offset < this.masked.length; offset += 1) {
      const character = this.masked[offset];
      if (character === "(" || character === "[" || character === "{") depth += 1;
      else if (character === ")" || character === "]" || character === "}") depth = Math.max(0, depth - 1);
      else if (character === "\n") {
        const before = this.masked[offset - 1] === "\r" ? this.masked[offset - 2] : this.masked[offset - 1];
        continued.push(depth > 0 || this.joined.has(offset) || before === "\\");
      }
    }
    return continued;
  }

  /** The first line of the doc comments, attributes, and decorators directly above `line`. */
  leadingStart(line: number, rules: LeadingRules): number {
    let start = line;
    while (start > 0) {
      const previous = this.lines[start - 1] ?? "";
      // The masked line drops a trailing comment, as in `#[allow(dead_code)] // why`.
      if (rules.line.test(previous) || rules.line.test(this.maskedLines[start - 1] ?? "")) {
        start -= 1;
        continue;
      }
      if (rules.detached && previous.trim() === "") {
        let above = start - 1;
        while (above > 0 && (this.lines[above - 1] ?? "").trim() === "") above -= 1;
        if (above > 0 && rules.detached.test(this.lines[above - 1] ?? "")) {
          start = above;
          continue;
        }
      }
      const opening = this.blockCommentOpening(start - 1, rules.block) ?? this.attributeOpening(start - 1, rules.attribute);
      if (opening === undefined) break;
      start = opening;
    }
    return start;
  }

  /** The line opening a block comment that `rules` accepts and that ends `line`. */
  private blockCommentOpening(line: number, block: RegExp | undefined): number | undefined {
    const text = this.lines[line] ?? "";
    if (!block || !/\*\/\s*$/.test(text)) return undefined;
    const opening = this.raw.lastIndexOf("/*", this.lineStart(line) + text.lastIndexOf("*/") - 1);
    const openingLine = opening < 0 ? undefined : this.lineOf(opening);
    return openingLine !== undefined && openingLine < line && block.test(this.lines[openingLine] ?? "") ? openingLine : undefined;
  }

  /** The line opening an attribute whose arguments span lines and close at the end of `line`. */
  private attributeOpening(line: number, attribute: RegExp | undefined): number | undefined {
    const opening = attribute ? this.bracketOpening(line) : undefined;
    return opening !== undefined && opening < line && attribute!.test(this.lines[opening] ?? "") ? opening : undefined;
  }

  /** The line where the bracket that ends `line` opened, when `line` ends with `)` or `]`. */
  private bracketOpening(line: number): number | undefined {
    const text = (this.maskedLines[line] ?? "").trimEnd();
    if (!text.endsWith(")") && !text.endsWith("]")) return undefined;
    let depth = 0;
    for (let offset = this.lineStart(line) + text.length - 1; offset >= 0; offset -= 1) {
      const character = this.masked[offset];
      if (character === ")" || character === "]") depth += 1;
      else if (character === "(" || character === "[") {
        depth -= 1;
        if (depth === 0) return this.lineOf(offset);
      }
    }
    return undefined;
  }
}

/** What counts as part of a declaration above its first line. */
interface LeadingRules {
  /** A doc comment, attribute, or decorator line. */
  readonly line: RegExp;
  /** The first line of a block doc comment that ends directly above. */
  readonly block?: RegExp;
  /** The first line of an attribute whose arguments span lines. */
  readonly attribute?: RegExp;
  /** A doc comment line that still documents the declaration across blank lines. */
  readonly detached?: RegExp;
}

const goLeading: LeadingRules = { line: /^\/\//, block: /^\/\*/ };
const goMemberLeading: LeadingRules = { line: /^\s*\/\//, block: /^\s*\/\*/ };

function span(name: string, start: number, end: number, depth: number): LedgerSymbolSpan {
  return { name, start: start + 1, end: end + 1, depth };
}

const identifier = "[A-Za-z_][A-Za-z0-9_]*";

function outlineGo(source: Source): LedgerSymbolSpan[] {
  const spans: LedgerSymbolSpan[] = [];
  const func = new RegExp(`^func\\s+(?:\\(\\s*(?:${identifier}\\s+)?\\*?\\s*(${identifier})(?:\\[[^\\]]*\\])?\\s*\\)\\s*)?(${identifier})`);
  const single = new RegExp(`^(?:type|const|var)\\s+(${identifier}(?:\\s*,\\s*${identifier})*)`);
  const group = /^(?:type|const|var)\s*\(/;
  const member = new RegExp(`^(\\s+)(${identifier}(?:\\s*,\\s*${identifier})*)`);
  let line = 0;
  while (line <= source.lastLine) {
    const text = source.maskedLines[line] ?? "";
    const leading = () => source.leadingStart(line, goLeading);
    const functionMatch = func.exec(text);
    if (functionMatch) {
      const { end } = source.declarationEnd(line, "newline");
      const name = functionMatch[1] ? `${functionMatch[1]}.${functionMatch[2]}` : functionMatch[2]!;
      spans.push(span(name, leading(), end, 0));
      line = end + 1;
      continue;
    }
    if (group.test(text)) {
      const { end } = source.declarationEnd(line, "newline");
      let next = line + 1;
      let indent: string | undefined;
      while (next < end) {
        const memberMatch = member.exec(source.maskedLines[next] ?? "");
        if (memberMatch && (indent === undefined || memberMatch[1] === indent)) {
          indent = memberMatch[1];
          const stop = Math.min(source.declarationEnd(next, "newline").end, end - 1);
          const start = source.leadingStart(next, goMemberLeading);
          for (const name of goNames(memberMatch[2]!)) spans.push(span(name, start, stop, 0));
          next = stop + 1;
          continue;
        }
        next += 1;
      }
      line = end + 1;
      continue;
    }
    const singleMatch = single.exec(text);
    if (singleMatch) {
      const { end } = source.declarationEnd(line, "newline");
      for (const name of goNames(singleMatch[1]!)) spans.push(span(name, leading(), end, 0));
      line = end + 1;
      continue;
    }
    line += 1;
  }
  return spans;
}

function goNames(list: string): string[] {
  return list.split(",").map((name) => name.trim()).filter((name) => name.length > 0 && name !== "_");
}

interface BraceMatch {
  /** Symbol name, or undefined for a container that is not a symbol itself, such as an `impl` block. */
  readonly name?: string;
  /** Prefix for members when the declaration's body holds declarations. */
  readonly container?: string;
  readonly kind?: ContainerKind;
  /** Extra names the same line declares, such as enum cases. */
  readonly extra?: readonly string[];
}

interface BraceRules {
  readonly style: "newline" | "semicolon";
  readonly separator: string;
  readonly leading: LeadingRules;
  readonly match: (text: string, container: ContainerKind | undefined) => BraceMatch | undefined;
}

type ContainerKind = "type" | "enum" | "impl" | "trait" | "module" | "extension";

/** Members of members are outlined; deeper declarations are skipped with their parents' bodies. */
const maxOutlineDepth = 2;

function outlineBraces(source: Source, rules: BraceRules): LedgerSymbolSpan[] {
  const spans: LedgerSymbolSpan[] = [];
  const scan = (from: number, to: number, depth: number, prefix: string, container: ContainerKind | undefined): void => {
    let line = from;
    while (line <= to) {
      const text = source.maskedLines[line] ?? "";
      const match = source.isBlank(line) ? undefined : rules.match(text, container);
      if (!match) {
        // A line that opens a block without declaring anything, such as a conditional, skips the block;
        // any other line, such as an attribute above a declaration, moves on by one.
        const open = openingBrace(text);
        line = open === undefined ? line + 1 : Math.max(source.closingLine(source.lineStart(line) + open), line) + 1;
        continue;
      }
      const { end, body } = source.declarationEnd(line, rules.style);
      const stop = Math.min(end, to);
      const start = source.leadingStart(line, rules.leading);
      if (match.name) spans.push(span(`${prefix}${match.name}`, start, stop, depth));
      for (const extra of match.extra ?? []) spans.push(span(`${prefix}${extra}`, start, stop, depth));
      if (match.container && body !== undefined && depth + 1 < maxOutlineDepth) {
        const memberPrefix = `${prefix}${match.container}${rules.separator}`;
        const bodyLine = source.lineOf(body);
        if (bodyLine === end) {
          // A body on one line, as in `struct Check { let message: String }`, holds its members inline.
          for (const part of topLevelParts(source.bodyText(body), ";")) {
            const member = rules.match(part, match.kind);
            for (const name of [member?.name, ...(member?.extra ?? [])]) {
              if (name) spans.push(span(`${memberPrefix}${name}`, bodyLine, bodyLine, depth + 1));
            }
          }
        } else {
          scan(bodyLine + 1, stop - 1, depth + 1, memberPrefix, match.kind);
        }
      }
      line = Math.max(stop, line) + 1;
    }
  };
  scan(0, source.lastLine, 0, "", undefined);
  return spans;
}

/** Column of the first `{` outside parentheses and brackets on a masked line. */
function openingBrace(text: string): number | undefined {
  let parens = 0;
  for (let column = 0; column < text.length; column += 1) {
    const character = text[column];
    if (character === "(" || character === "[") parens += 1;
    else if (character === ")" || character === "]") parens = Math.max(0, parens - 1);
    else if (character === "{" && parens === 0) return column;
  }
  return undefined;
}

/**
 * Splits at a separator outside parentheses, brackets, and braces, and with
 * `generics`, outside generic arguments: a `<` right after a name, as in
 * `Result<A, B>`, opens them.
 */
function topLevelParts(text: string, separator = ",", generics = false): string[] {
  const parts = [""];
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth = Math.max(0, depth - 1);
    else if (generics && character === "<" && /[\w?!>]/.test(text[index - 1] ?? "")) depth += 1;
    else if (generics && character === ">" && text[index - 1] !== "-" && depth > 0) depth -= 1;
    if (character === separator && depth === 0) parts.push("");
    else parts[parts.length - 1] += character;
  }
  return parts;
}

const rustItem = new RegExp(
  `^\\s*(?:pub(?:\\s*\\([^)]*\\))?\\s+)?(?:(?:default|const|async|unsafe|extern(?:\\s+"[^"]*")?)\\s+)*(?:(fn|struct|enum|union|trait|type|mod|const|static(?:\\s+mut)?)\\s+|(macro_rules!)\\s*)(${identifier})`,
);
const rustImpl = new RegExp(
  `^\\s*(?:unsafe\\s+)?impl\\b(?:\\s*<[^{]*?>)?\\s+(?:!?\\s*(?:::)?[A-Za-z_][\\w:]*(?:<[^{]*?>)?\\s+for\\s+)?(?:&\\s*(?:'${identifier}\\s+)?(?:mut\\s+)?)?(?:dyn\\s+)?(?:::)?(?:${identifier}::)*(${identifier})`,
);

const rustRules: BraceRules = {
  style: "semicolon",
  separator: "::",
  // Inner doc comments (`//!`) and attributes (`#![...]`) belong to the enclosing module, not the next item.
  leading: {
    line: /^\s*(?:\/\/\/(?!\/).*|\/\*\*.*\*\/\s*|#\[.*\]\s*)$/,
    block: /^\s*\/\*\*/,
    attribute: /^\s*#\[/,
    // `///` is an outer doc attribute, so it documents the next item even across blank lines.
    detached: /^\s*\/\/\/(?!\/)/,
  },
  match(text, container) {
    const impl = rustImpl.exec(text);
    if (impl && container !== "impl" && container !== "trait") return { container: impl[1], kind: "impl" };
    const item = rustItem.exec(text);
    if (!item) return undefined;
    const kind = item[1] ?? item[2]!;
    const name = item[3]!;
    if (name === "_") return undefined;
    if (kind === "trait") return { name, container: name, kind: "trait" };
    if (kind === "mod") return { name, container: name, kind: "module" };
    return { name };
  },
};

/**
 * A parenthesized list nested up to `depth` levels, as in
 * `@Test(.timeLimit(.minutes(10)))`. Each alternative starts with a different
 * character, so matching never backtracks badly.
 */
function parenthesized(depth: number): string {
  return depth === 0 ? "\\([^()]*\\)" : `\\((?:[^()]|${parenthesized(depth - 1)})*\\)`;
}

const swiftArguments = parenthesized(3);
const swiftModifiers =
  "(?:(?:public|private|fileprivate|internal|package|open|final|static|class|override|mutating|nonmutating|dynamic|lazy|weak|unowned|required|convenience|indirect|nonisolated|isolated|distributed|prefix|postfix|infix)(?:\\([^)]*\\))?\\s+)*";
const swiftDecl = new RegExp(
  `^\\s*(?:@${identifier}(?:${swiftArguments})?\\s+)*${swiftModifiers}(func|class|struct|enum|protocol|actor|extension|typealias|associatedtype|init|deinit|subscript|var|let|case|macro)\\b[?!]?\\s*([^\\s:({<=,]*)(.*)$`,
);

const swiftName = new RegExp(`^${identifier}(?:\\.${identifier})*$`);
const leadingIdentifier = new RegExp(`^\\s*(${identifier})`);
/** A later binding in `let a = 1, b = 2` or `var a, b: Int`. */
const laterBinding = new RegExp(`^\\s*(${identifier})\\s*(?:[:=]|$)`);

const swiftRules: BraceRules = {
  style: "newline",
  separator: ".",
  leading: {
    line: new RegExp(`^\\s*(?:///.*|/\\*\\*.*\\*/\\s*|(?:@${identifier}(?:${swiftArguments})?\\s*)+)$`),
    block: /^\s*\/\*\*/,
    attribute: /^\s*@\w+/,
  },
  match(text, container) {
    const decl = swiftDecl.exec(text);
    if (!decl) return undefined;
    const kind = decl[1]!;
    const rawName = decl[2]!.replace(/`/g, "");
    if (kind === "init" || kind === "deinit" || kind === "subscript") return container ? { name: kind } : undefined;
    if (kind === "case") {
      if (container !== "enum") return undefined;
      const cases = topLevelParts(`${rawName}${decl[3] ?? ""}`)
        .map((part) => leadingIdentifier.exec(part.replace(/`/g, ""))?.[1])
        .filter((name): name is string => Boolean(name));
      return cases.length > 0 ? { name: cases[0], extra: cases.slice(1) } : undefined;
    }
    if (!swiftName.test(rawName)) return undefined;
    if (kind === "extension") return { container: rawName, kind: "extension" };
    if (kind === "class" || kind === "struct" || kind === "actor" || kind === "protocol") {
      return { name: rawName, container: rawName, kind: "type" };
    }
    if (kind === "enum") return { name: rawName, container: rawName, kind: "enum" };
    if (kind === "var" || kind === "let") {
      const extra = topLevelParts(decl[3] ?? "", ",", true)
        .slice(1)
        .map((part) => laterBinding.exec(part)?.[1])
        .filter((name): name is string => Boolean(name));
      return { name: rawName, extra };
    }
    return { name: rawName };
  },
};

/** Keywords that can open a Python statement with a colon, which is not an annotation. */
const pythonColonKeywords = new Set(["else", "try", "finally", "except", "lambda"]);

function outlinePython(source: Source): LedgerSymbolSpan[] {
  const spans: LedgerSymbolSpan[] = [];
  const continued = source.continuedLines();
  const definition = new RegExp(`^\\s*(?:async\\s+)?(def|class)\\s+(${identifier})`);
  const alias = new RegExp(`^\\s*type\\s+(${identifier})`);
  const assignment = new RegExp(`^\\s*(${identifier})\\s*(?::[^=\\n]*)?=(?!=)`);
  const annotation = new RegExp(`^\\s*(${identifier})\\s*:\\s*[^=\\s][^=]*$`);
  const comment: LeadingRules = { line: /^\s*#/ };
  const indentOf = (line: number) => /^\s*/.exec(source.maskedLines[line] ?? "")![0].length;
  const isStatement = (line: number) => !continued[line] && !source.isBlank(line);
  const statementEnd = (line: number): number => {
    let end = line;
    while (end < source.lastLine && continued[end + 1]) end += 1;
    return end;
  };
  const blockEnd = (line: number, indent: number, limit: number): number => {
    let end = statementEnd(line);
    for (let next = end + 1; next <= limit; next += 1) {
      if (!isStatement(next)) continue;
      if (indentOf(next) <= indent) break;
      end = statementEnd(next);
      next = end;
    }
    return Math.min(end, limit);
  };
  const declaredName = (text: string): string | undefined => {
    const name = alias.exec(text)?.[1] ?? assignment.exec(text)?.[1] ?? annotation.exec(text)?.[1];
    return name && !pythonColonKeywords.has(name) ? name : undefined;
  };
  const scan = (from: number, to: number, bodyIndent: number, depth: number, prefix: string): void => {
    let decorated: number | undefined;
    let line = from;
    while (line <= to) {
      if (!isStatement(line) || indentOf(line) !== bodyIndent) {
        line += 1;
        continue;
      }
      const text = source.maskedLines[line] ?? "";
      const end = Math.min(statementEnd(line), to);
      if (/^\s*@/.test(text)) {
        decorated ??= source.leadingStart(line, comment);
        line = end + 1;
        continue;
      }
      const start = decorated ?? source.leadingStart(line, comment);
      decorated = undefined;
      const defined = definition.exec(text);
      if (defined) {
        const stop = blockEnd(line, bodyIndent, to);
        const name = `${prefix}${defined[2]}`;
        spans.push(span(name, start, stop, depth));
        if (defined[1] === "class" && depth + 1 < maxOutlineDepth) {
          let first = end + 1;
          while (first <= stop && !isStatement(first)) first += 1;
          if (first <= stop) scan(first, stop, indentOf(first), depth + 1, `${name}.`);
        }
        line = stop + 1;
        continue;
      }
      // Strings are masked, so every `;` left separates statements, as in `a = 1; b = 2`.
      for (const part of text.split(";")) {
        const name = declaredName(part);
        if (name) spans.push(span(`${prefix}${name}`, start, end, depth));
      }
      line = end + 1;
    }
  };
  scan(0, source.lastLine, 0, 0, "");
  return spans;
}

/** A copy of `raw` with comment and string contents blanked, keeping every line break so offsets and lines still match. */
class Masker {
  private readonly out: string[];
  readonly joined = new Set<number>();

  constructor(private readonly raw: string) {
    this.out = raw.split("");
  }

  /** Blanks `[from, to)`; line breaks in strings are recorded as joined. */
  blank(from: number, to: number, inString: boolean): void {
    for (let index = from; index < to && index < this.out.length; index += 1) {
      if (this.out[index] === "\n") {
        if (inString) this.joined.add(index);
      } else if (this.out[index] !== "\r") {
        this.out[index] = " ";
      }
    }
  }

  lineComment(index: number): number {
    const end = this.raw.indexOf("\n", index);
    const stop = end < 0 ? this.raw.length : end;
    this.blank(index, stop, false);
    return stop;
  }

  result(): Masked {
    return { masked: this.out.join(""), joined: this.joined };
  }
}

function maskBraceCode(raw: string, language: LedgerOutlineLanguage): Masked {
  const masker = new Masker(raw);
  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    const next = raw[index + 1];
    if (character === "/" && next === "/") {
      index = masker.lineComment(index);
      continue;
    }
    if (character === "/" && next === "*") {
      // Rust and Swift block comments nest; Go's do not.
      let depth = 1;
      let cursor = index + 2;
      while (cursor < raw.length && depth > 0) {
        if (language !== "go" && raw.startsWith("/*", cursor)) {
          depth += 1;
          cursor += 2;
        } else if (raw.startsWith("*/", cursor)) {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      masker.blank(index, cursor, false);
      index = cursor;
      continue;
    }
    if (language === "swift" && (character === '"' || (character === "#" && /^#+"/.test(raw.slice(index, index + 64))))) {
      const { contentStart, contentEnd, end } = swiftString(raw, index);
      masker.blank(contentStart, contentEnd, true);
      index = end;
      continue;
    }
    if (language === "go" && character === "`") {
      const close = raw.indexOf("`", index + 1);
      const stop = close < 0 ? raw.length : close;
      masker.blank(index + 1, stop, true);
      index = stop + 1;
      continue;
    }
    if (language === "rust" && !/[A-Za-z0-9_]/.test(raw[index - 1] ?? "")) {
      const rawString = /^[bc]?r(#*)"/.exec(raw.slice(index, index + 64));
      if (rawString) {
        const close = `"${rawString[1]}`;
        const found = raw.indexOf(close, index + rawString[0].length);
        const stop = found < 0 ? raw.length : found;
        masker.blank(index + rawString[0].length, stop, true);
        index = stop + close.length;
        continue;
      }
    }
    if (character === '"') {
      // Rust strings may span lines; Go's interpreted strings end at the line.
      let cursor = index + 1;
      while (cursor < raw.length && raw[cursor] !== '"' && (language === "rust" || raw[cursor] !== "\n")) {
        if (raw[cursor] === "\\") cursor += 1;
        cursor += 1;
      }
      masker.blank(index + 1, cursor, true);
      index = cursor + 1;
      continue;
    }
    if (character === "'" && language !== "swift") {
      const literal = /^'(?:\\(?:u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.)|[^'\\\n])'/.exec(raw.slice(index, index + 16));
      if (literal) {
        masker.blank(index + 1, index + literal[0].length - 1, true);
        index += literal[0].length;
        continue;
      }
    }
    index += 1;
  }
  return masker.result();
}

/**
 * The extent of a Swift string literal at `index`: plain, multi-line (`"""`),
 * or raw (`#"..."#`), stepping over escapes and `\(...)` interpolations, which
 * may hold strings of their own.
 */
function swiftString(raw: string, index: number): { contentStart: number; contentEnd: number; end: number } {
  const opening = /^(#*)("""|")/.exec(raw.slice(index, index + 64))!;
  const hashes = opening[1]!;
  const quote = opening[2]!;
  const close = `${quote}${hashes}`;
  const escape = `\\${hashes}`;
  const contentStart = index + opening[0].length;
  let cursor = contentStart;
  while (cursor < raw.length && !raw.startsWith(close, cursor)) {
    if (quote === '"' && raw[cursor] === "\n") return { contentStart, contentEnd: cursor, end: cursor };
    if (raw.startsWith(`${escape}(`, cursor)) {
      cursor = swiftInterpolationEnd(raw, cursor + escape.length + 1, quote !== '"');
    } else if (raw.startsWith(escape, cursor)) {
      cursor += escape.length + 1;
    } else {
      cursor += 1;
    }
  }
  const contentEnd = Math.min(cursor, raw.length);
  return { contentStart, contentEnd, end: Math.min(contentEnd + close.length, raw.length) };
}

/** Where an interpolation ends; only one inside a multi-line string may cross a line break. */
function swiftInterpolationEnd(raw: string, index: number, multiline: boolean): number {
  let depth = 1;
  let cursor = index;
  while (cursor < raw.length && depth > 0) {
    const character = raw[cursor];
    if (character === '"' || (character === "#" && /^#+"/.test(raw.slice(cursor, cursor + 64)))) {
      cursor = swiftString(raw, cursor).end;
      continue;
    }
    if (character === "\n" && !multiline) return cursor;
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    cursor += 1;
  }
  return cursor;
}

/** Blanks Python comments and string contents, triple-quoted strings included. */
function maskPython(raw: string): Masked {
  const masker = new Masker(raw);
  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    if (character === "#") {
      index = masker.lineComment(index);
      continue;
    }
    if (character === '"' || character === "'") {
      const triple = raw.startsWith(character.repeat(3), index);
      const quote = triple ? character.repeat(3) : character;
      let cursor = index + quote.length;
      while (cursor < raw.length && !raw.startsWith(quote, cursor) && (triple || raw[cursor] !== "\n")) {
        if (raw[cursor] === "\\") cursor += 1;
        cursor += 1;
      }
      masker.blank(index + quote.length, cursor, true);
      index = cursor + quote.length;
      continue;
    }
    index += 1;
  }
  return masker.result();
}
