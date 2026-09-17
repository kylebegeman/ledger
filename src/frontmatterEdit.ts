import { normalizeSectionTitle } from "./frontmatter.js";
import { LedgerError } from "./machine.js";
import { escapeYamlString, yamlStringArray } from "./template.js";

const frontmatterPattern = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/;

/** The line ending the document uses, read from its first line break, so edits never mix endings. */
function lineEnding(markdown: string): "\r\n" | "\n" {
  const first = markdown.indexOf("\n");
  return first > 0 && markdown[first - 1] === "\r" ? "\r\n" : "\n";
}

/**
 * Replace or append scalar frontmatter fields in a Markdown record without
 * reformatting the rest of the file. Values are written as quoted strings.
 */
export function setFrontmatterScalars(
  markdown: string,
  values: Readonly<Record<string, string>>,
  label = "update frontmatter",
): string {
  const match = frontmatterPattern.exec(markdown);
  if (!match) {
    throw new LedgerError("invalid-markdown", `Cannot ${label}: missing YAML frontmatter`);
  }
  const eol = lineEnding(markdown);
  let frontmatter = match[1] ?? "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}: "${escapeYamlString(value)}"`;
    const pattern = new RegExp(`^${escapeRegExp(key)}[ \\t]*:.*$`, "m");
    frontmatter = pattern.test(frontmatter)
      ? frontmatter.replace(pattern, () => line)
      : `${frontmatter}${eol}${line}`;
  }
  return markdown.replace(match[0], () => `---${eol}${frontmatter}${eol}---`);
}

/**
 * Add list-valued frontmatter fields that the record does not declare yet.
 * Existing fields are left untouched so template-rendered values win. Empty
 * lists are skipped.
 */
export function ensureFrontmatterArrays(
  markdown: string,
  arrays: Readonly<Record<string, readonly string[]>>,
): string {
  const match = frontmatterPattern.exec(markdown);
  if (!match) {
    throw new LedgerError("invalid-markdown", "Cannot update frontmatter: missing YAML frontmatter");
  }
  const eol = lineEnding(markdown);
  let frontmatter = match[1] ?? "";
  for (const [key, values] of Object.entries(arrays)) {
    if (values.length === 0) continue;
    const pattern = new RegExp(`^${escapeRegExp(key)}[ \\t]*:`, "m");
    if (pattern.test(frontmatter)) continue;
    frontmatter = `${frontmatter}${eol}${key}:${yamlStringArray(values).replace(/\n/g, eol)}`;
  }
  return markdown.replace(match[0], () => `---${eol}${frontmatter}${eol}---`);
}

/**
 * Replace a list-valued frontmatter field in place, or append it when missing.
 * Handles inline `key: []` and block lists.
 */
export function setFrontmatterArray(
  markdown: string,
  key: string,
  values: readonly string[],
): string {
  const match = frontmatterPattern.exec(markdown);
  if (!match) {
    throw new LedgerError("invalid-markdown", "Cannot update frontmatter: missing YAML frontmatter");
  }
  const eol = lineEnding(markdown);
  const frontmatter = match[1] ?? "";
  const rendered = `${key}:${yamlStringArray(values)}`.replace(/\n/g, eol);
  const pattern = new RegExp(
    `^${escapeRegExp(key)}[ \\t]*:(?:[ \\t]*\\[[^\\]]*\\][ \\t]*|[ \\t]*(?:\\r?\\n[ \\t]+-[^\\n]*)*)$`,
    "m",
  );
  const updated = pattern.test(frontmatter)
    ? frontmatter.replace(pattern, () => rendered)
    : `${frontmatter}${eol}${rendered}`;
  return markdown.replace(match[0], () => `---${eol}${updated}${eol}---`);
}

/**
 * Replace the body of a level-two Markdown section. The section keeps its
 * heading; the new body is written with one blank line on each side, and an
 * empty body leaves one blank line. Headings match the way the section parser
 * reads them. Returns the input unchanged when the section does not exist.
 */
export function replaceSectionBody(markdown: string, title: string, body: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    return match !== null && normalizeSectionTitle(match[1] ?? "") === title;
  });
  if (start < 0) return markdown;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  const content = body.trim();
  const replacement = content ? [lines[start]!, "", content, ""] : [lines[start]!, ""];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join(lineEnding(markdown));
}

/**
 * Replace a top-level frontmatter field and its indented children with the
 * given lines, or append them when the field is missing. `lines` starts with
 * the `key:` line.
 */
export function setFrontmatterBlock(markdown: string, key: string, lines: readonly string[]): string {
  const match = frontmatterPattern.exec(markdown);
  if (!match) {
    throw new LedgerError("invalid-markdown", "Cannot update frontmatter: missing YAML frontmatter");
  }
  const eol = lineEnding(markdown);
  const frontmatter = (match[1] ?? "").split(/\r?\n/);
  const keyLine = new RegExp(`^${escapeRegExp(key)}[ \\t]*:`);
  const start = frontmatter.findIndex((line) => keyLine.test(line));
  let updated: string[];
  if (start < 0) {
    updated = [...frontmatter, ...lines];
  } else {
    let end = start + 1;
    while (end < frontmatter.length) {
      const line = frontmatter[end] ?? "";
      if (line.trim() !== "" && !/^[ \t]/.test(line)) break;
      end += 1;
    }
    // Blank lines between the block and the next field stay with the next field.
    while (end > start + 1 && (frontmatter[end - 1] ?? "").trim() === "") end -= 1;
    updated = [...frontmatter.slice(0, start), ...lines, ...frontmatter.slice(end)];
  }
  return markdown.replace(match[0], () => `---${eol}${updated.join(eol)}${eol}---`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
