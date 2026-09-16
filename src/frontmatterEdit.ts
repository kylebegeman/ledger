import { LedgerError } from "./machine.js";
import { escapeYamlString, yamlStringArray } from "./template.js";

const frontmatterPattern = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/;

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
  let frontmatter = match[1] ?? "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}: "${escapeYamlString(value)}"`;
    const pattern = new RegExp(`^${escapeRegExp(key)}[ \\t]*:.*$`, "m");
    frontmatter = pattern.test(frontmatter)
      ? frontmatter.replace(pattern, line)
      : `${frontmatter}\n${line}`;
  }
  return markdown.replace(match[0], `---\n${frontmatter}\n---`);
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
  let frontmatter = match[1] ?? "";
  for (const [key, values] of Object.entries(arrays)) {
    if (values.length === 0) continue;
    const pattern = new RegExp(`^${escapeRegExp(key)}[ \\t]*:`, "m");
    if (pattern.test(frontmatter)) continue;
    frontmatter = `${frontmatter}\n${key}:${yamlStringArray(values)}`;
  }
  return markdown.replace(match[0], `---\n${frontmatter}\n---`);
}

/**
 * Replace the body of a level-two Markdown section. The section keeps its
 * heading; the new body is written with one blank line on each side. Returns
 * the input unchanged when the section does not exist.
 */
export function replaceSectionBody(markdown: string, title: string, body: string): string {
  const heading = `## ${title}`;
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return markdown;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  const replacement = [heading, "", body.trim(), ""];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
