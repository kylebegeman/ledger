import { describe, expect, it } from "vitest";
import {
  ensureFrontmatterArrays,
  replaceSectionBody,
  setFrontmatterArray,
  setFrontmatterScalars,
} from "../src/frontmatterEdit.js";

const sessionLines = [
  "---",
  'id: "S0001"',
  'kind: "session"',
  'status: "active"',
  "files: []",
  "---",
  "",
  "# S0001: Session",
  "",
  "## Summary",
  "",
  "What this session set out to do.",
  "",
  "## Learned",
  "",
  "- Add facts worth keeping.",
  "",
];

function editEverything(markdown: string): string {
  let next = setFrontmatterArray(markdown, "files", ["src/a.ts", "src/b.ts"]);
  next = setFrontmatterScalars(next, { status: "closed", updated: "2026-09-17" });
  next = ensureFrontmatterArrays(next, { related: ["0001"] });
  return replaceSectionBody(next, "Summary", "Did the thing.");
}

describe("frontmatter edits", () => {
  it("keep a CRLF record on CRLF", () => {
    const next = editEverything(sessionLines.join("\r\n"));
    expect(next).not.toMatch(/(^|[^\r])\n/);
    expect(next).toContain('files:\r\n  - "src/a.ts"\r\n  - "src/b.ts"\r\n');
    expect(next).toContain('status: "closed"\r\n');
    expect(next).toContain('updated: "2026-09-17"\r\nrelated:\r\n  - "0001"\r\n---\r\n');
    expect(next).toContain("## Summary\r\n\r\nDid the thing.\r\n\r\n## Learned");
  });

  it("keep an LF record on LF", () => {
    const next = editEverything(sessionLines.join("\n"));
    expect(next).not.toContain("\r");
    expect(next).toContain('files:\n  - "src/a.ts"\n  - "src/b.ts"\n');
    expect(next).toContain('updated: "2026-09-17"\nrelated:\n  - "0001"\n---\n');
    expect(next).toContain("## Summary\n\nDid the thing.\n\n## Learned");
  });
});
