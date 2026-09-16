export interface LedgerTemplateValues {
  readonly scalars: Readonly<Record<string, string>>;
  readonly arrays?: Readonly<Record<string, readonly string[]>>;
  readonly blocks?: Readonly<Record<string, string>>;
}

/** Template statuses that a caller-supplied status replaces. */
const templateStatusPlaceholders = ["draft", "captured", "proposed", "active"] as const;

export function renderLedgerTemplate(
  template: string,
  values: LedgerTemplateValues,
): string {
  const scalarValues = values.scalars;
  const arrayValues = Object.fromEntries(
    Object.entries(values.arrays ?? {}).map(([key, items]) => [key, yamlStringArray(items)]),
  );
  const blockValues = values.blocks ?? {};
  let rendered = template;

  for (const [key, value] of Object.entries(scalarValues)) {
    rendered = rendered.replaceAll(`"{{${key}}}"`, `"${escapeYamlString(value)}"`);
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  for (const [key, value] of Object.entries(arrayValues)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
    rendered = rendered.replace(`${key}: []`, `${key}:${value}`);
  }
  for (const [key, value] of Object.entries(blockValues)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  const status = scalarValues.status;
  if (status) {
    for (const placeholder of templateStatusPlaceholders) {
      rendered = rendered.replace(`status: "${placeholder}"`, `status: "${escapeYamlString(status)}"`);
    }
  }
  // Only a template without the placeholder still holds the sample block; the
  // rendered value may itself contain the sample heading and must not be replaced again.
  if (!template.includes("{{changedFiles}}")) {
    rendered = replaceDefaultBlock(rendered, "changedFiles", blockValues.changedFiles);
  }

  return rendered;
}

export function yamlStringArray(values: readonly string[]): string {
  if (values.length === 0) return " []";
  return `\n${values.map((value) => `  - "${escapeYamlString(value)}"`).join("\n")}`;
}

export function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/**
 * Legacy change templates carry a sample heading followed by three bare
 * bullets instead of `{{changedFiles}}`; adopters still hold copies of them.
 */
const legacyChangedFilesBlock =
  /### path\/to\/file\.ts[ \t]*\r?\n(?:[ \t]*\r?\n)?- What changed:[ \t]*\r?\n- Anchor:[ \t]*\r?\n- On conflict:[ \t]*/;

function replaceDefaultBlock(
  rendered: string,
  key: string,
  value: string | undefined,
): string {
  if (!value || key !== "changedFiles") return rendered;
  if (legacyChangedFilesBlock.test(rendered)) {
    return rendered.replace(legacyChangedFilesBlock, () => value);
  }
  let next = rendered;
  if (rendered.includes("### path/to/file.ts")) {
    next = next.replace("### path/to/file.ts", () => value);
  }
  if (rendered.includes("Add changed files.")) {
    next = next.replace("Add changed files.", () => value);
  }
  return next;
}
