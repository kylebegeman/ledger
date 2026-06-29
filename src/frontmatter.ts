import { parse as parseYaml } from "yaml";
import type { LedgerFrontmatter, MarkdownSection } from "./types.js";

export interface ParsedMarkdownWithFrontmatter {
  readonly frontmatterRaw: string;
  readonly frontmatter: LedgerFrontmatter;
  readonly body: string;
  readonly sections: readonly MarkdownSection[];
}

export function parseMarkdownWithFrontmatter(
  raw: string,
  filePath = "document.md",
): ParsedMarkdownWithFrontmatter {
  if (!raw.startsWith("---\n") && raw.trim() !== "---") {
    throw new Error(`${filePath}: missing YAML frontmatter fence`);
  }

  const closingFenceIndex = raw.indexOf("\n---", 4);
  if (closingFenceIndex === -1) {
    throw new Error(`${filePath}: missing closing YAML frontmatter fence`);
  }

  const frontmatterRaw = raw.slice(4, closingFenceIndex).trim();
  const bodyStart = raw.indexOf("\n", closingFenceIndex + 1);
  const body = bodyStart === -1 ? "" : raw.slice(bodyStart + 1);
  const parsed = parseYaml(frontmatterRaw);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath}: frontmatter must be a YAML object`);
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
