import { parse as parseYaml } from "yaml";
import { LedgerError } from "./machine.js";
import type { LedgerFrontmatter, MarkdownSection } from "./types.js";

export interface ParsedMarkdownWithFrontmatter {
  readonly frontmatterRaw: string;
  readonly frontmatter: LedgerFrontmatter;
  readonly body: string;
  readonly sections: readonly MarkdownSection[];
}

const maxYamlAliases = 50;

export function parseMarkdownWithFrontmatter(
  raw: string,
  filePath = "document.md",
): ParsedMarkdownWithFrontmatter {
  const openingFence = /^---[ \t]*(?:\r?\n)/.exec(raw);
  if (!openingFence) {
    throw new LedgerError("invalid-markdown", `${filePath}: missing YAML frontmatter fence`, { filePath });
  }

  const frontmatterStart = openingFence[0].length;
  const closingFence = /\r?\n---[ \t]*(?:\r?\n|$)/g;
  closingFence.lastIndex = frontmatterStart;
  const closingMatch = closingFence.exec(raw);
  if (!closingMatch) {
    throw new LedgerError("invalid-markdown", `${filePath}: missing closing YAML frontmatter fence`, { filePath });
  }

  const frontmatterRaw = raw.slice(frontmatterStart, closingMatch.index).trim();
  const body = raw.slice(closingMatch.index + closingMatch[0].length);
  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatterRaw, { maxAliasCount: maxYamlAliases });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LedgerError(
      "invalid-yaml",
      `${filePath}: invalid YAML frontmatter: ${message}`,
      { filePath },
      { cause: error },
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LedgerError("invalid-markdown", `${filePath}: frontmatter must be a YAML object`, { filePath });
  }

  return {
    frontmatterRaw,
    frontmatter: parsed as LedgerFrontmatter,
    body,
    sections: extractSections(body),
  };
}

export function extractSections(markdown: string): readonly MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const headings: Array<{ title: string; line: number; index: number }> = [];

  for (const [index, line] of lines.entries()) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    headings.push({
      title: normalizeSectionTitle(match[1] ?? ""),
      line: index + 1,
      index,
    });
  }

  return headings.map((heading, offset) => {
    const nextHeading = headings[offset + 1];
    const bodyLines = lines.slice(heading.index + 1, nextHeading?.index);
    return {
      title: heading.title,
      body: bodyLines.join("\n").trim(),
      line: heading.line,
    };
  });
}

export function normalizeSectionTitle(title: string): string {
  return title.replace(/\s+#+\s*$/, "").trim();
}
