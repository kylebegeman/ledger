import { extractSections, normalizeSectionTitle } from "./frontmatter.js";
import { replaceSectionBody } from "./frontmatterEdit.js";
import { LedgerError } from "./machine.js";

/** Longest body one section may take, in characters. */
export const maxSectionBodyChars = 20_000;

/** Section bodies keyed by heading, as the authoring operations accept them. */
export type LedgerSectionBodies = Readonly<Record<string, string>>;

/**
 * A line Ledger's section parser would read as a new section or title. The
 * parser does not skip fenced code, so such a line is refused everywhere in a
 * body, fences included.
 */
const sectionBreakingLine = /^ {0,3}#{1,2}(?:[ \t]|$)/m;

/** The level-two section titles a template or record declares, in order. */
export function sectionTitles(markdown: string): readonly string[] {
  return extractSections(markdown).map((section) => section.title);
}

/**
 * Check caller-supplied section bodies against the titles a record may carry
 * and return them keyed by normalized title with `\n` line endings.
 */
export function checkSectionBodies(
  sections: LedgerSectionBodies,
  allowedTitles: readonly string[],
  subject: string,
): Record<string, string> {
  const checked: Record<string, string> = {};
  for (const [rawTitle, rawBody] of Object.entries(sections)) {
    const title = normalizeSectionTitle(rawTitle);
    if (!allowedTitles.includes(title)) {
      throw new LedgerError(
        "invalid-argument",
        `${subject} has no section named "${title}". Its sections are ${allowedTitles.join(", ")}.`,
        { section: title, sections: [...allowedTitles] },
      );
    }
    const body = rawBody.replace(/\r\n?/g, "\n");
    if (body.includes("\0")) {
      throw new LedgerError("invalid-argument", `The ${title} section must not contain NUL characters.`, { section: title });
    }
    if (body.length > maxSectionBodyChars) {
      throw new LedgerError(
        "invalid-argument",
        `The ${title} section is ${body.length} characters; the limit is ${maxSectionBodyChars}.`,
        { section: title, limit: maxSectionBodyChars },
      );
    }
    if (sectionBreakingLine.test(body)) {
      throw new LedgerError(
        "invalid-argument",
        `The ${title} section cannot contain a line that starts with # or ##, because Ledger would read it as a new title or section. Use ### for subsections.`,
        { section: title },
      );
    }
    checked[title] = body;
  }
  return checked;
}

/**
 * Write section bodies into a record. A section the record lacks is appended
 * at the end when `append` is set, and refused otherwise.
 */
export function applySectionBodies(
  markdown: string,
  sections: LedgerSectionBodies,
  options: { readonly append?: boolean } = {},
): string {
  let result = markdown;
  for (const [title, body] of Object.entries(sections)) {
    const present = sectionTitles(result).includes(title);
    if (present) {
      result = replaceSectionBody(result, title, body);
      continue;
    }
    if (!options.append) {
      throw new LedgerError("invalid-argument", `The record has no ${title} section.`, { section: title });
    }
    const eol = result.includes("\r\n") ? "\r\n" : "\n";
    const trimmed = result.replace(/(?:\r?\n)+$/, "");
    const content = body.trim();
    result = [trimmed, "", `## ${title}`, "", ...(content ? [content, ""] : [])].join(eol) + (content ? "" : eol);
  }
  return result;
}

/**
 * Read `## Title` blocks from a Markdown file into section bodies. Text before
 * the first section, such as a `#` title, is ignored.
 */
export function parseSectionBodies(markdown: string, source: string): Record<string, string> {
  const sections = extractSections(markdown);
  if (sections.length === 0) {
    throw new LedgerError("invalid-argument", `${source} has no "## Title" sections to read.`, { source });
  }
  const bodies: Record<string, string> = {};
  for (const section of sections) {
    if (section.title in bodies) {
      throw new LedgerError("invalid-argument", `${source} repeats the ${section.title} section.`, {
        source,
        section: section.title,
      });
    }
    bodies[section.title] = section.body;
  }
  return bodies;
}
